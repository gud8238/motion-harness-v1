// 오디오: 효과음 합성 + 기본 비트/패드 + 음악·내레이션 믹스 → scene/assets/audio/mix.wav (−14 LUFS)
//   node audio.mjs 모션1          work/sound.json (+ work/narration.timing.json) 을 읽어 믹스하고 index.html 에 <audio id="mh-mix"> 를 넣는다
// work/sound.json 예:
// { "bed": "pulse",            // pulse(킥·하이햇·베이스·패드) | ambient(패드) | none
//   "bpm": 120, "key": "A", "minor": true, "gain": -6,
//   "music": "source/음악.mp3", "musicStart": 0, "musicGain": -3,   // 음악 파일이 있으면 bed 대신 사용
//   "sfxGain": 0,
//   "events": [[0.05, "swoosh"], [2.0, "snap", -4], [8.0, "impact"]] }   // [전역초, 종류, dB]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg, projectDir, readJSON, die } from './_common.mjs';

export const SR = 48000;
const TAU = Math.PI * 2;
const db = d => 10 ** (d / 20);
function rng(seed = 1) { let s = seed | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const noteHz = (name, oct = 3) => { const i = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(name.toUpperCase()); return 440 * 2 ** ((i - 9) / 12 + (oct - 4)); };

// ── 필터 ──
function lp(x, fc) { const a = 1 - Math.exp(-TAU * fc / SR); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; } return x; }
function hp(x, fc) { const a = 1 - Math.exp(-TAU * fc / SR); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = x[i] - y; } return x; }
function lpSweep(x, f0, f1) { let y = 0; for (let i = 0; i < x.length; i++) { const fc = f0 * (f1 / f0) ** (i / x.length); const a = 1 - Math.exp(-TAU * fc / SR); y += a * (x[i] - y); x[i] = y; } return x; }
const buf = sec => new Float32Array(Math.max(1, Math.round(sec * SR)));
const noise = (n, seed) => { const r = rng(seed), b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = r() * 2 - 1; return b; };
const env = (x, a, d, curve = 4) => { const A = Math.round(a * SR); for (let i = 0; i < x.length; i++) x[i] *= i < A ? i / A : Math.exp(-curve * (i - A) / Math.max(1, Math.round(d * SR))); return x; };
const norm = (x, peak = 0.5) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m; return x; };
function sine(sec, f0, f1 = f0, ph = 0) { const b = buf(sec); let p = ph; for (let i = 0; i < b.length; i++) { const f = f0 * (f1 / f0) ** (i / b.length); p += TAU * f / SR; b[i] = Math.sin(p); } return b; }
const add = (a, b, g = 1, off = 0) => { for (let i = 0; i < b.length && i + off < a.length; i++) a[i + off] += b[i] * g; return a; };

// ── 효과음 (모두 결정적, 피크 0.5 기준) ──
export const SFX = {
  whoosh: s => { const b = noise(Math.round(.55 * SR), s); lpSweep(b, 300, 5000); const n = b.length; for (let i = 0; i < n; i++) b[i] *= Math.sin(Math.PI * i / n) ** 1.6; return norm(b, .42); },
  swoosh: s => { const b = noise(Math.round(.25 * SR), s); lpSweep(b, 1200, 7000); hp(b, 400); const n = b.length; for (let i = 0; i < n; i++) b[i] *= Math.sin(Math.PI * i / n) ** 2; return norm(b, .35); },
  pop: () => norm(env(sine(.12, 900, 380), .002, .06, 5), .45),
  click: s => { const b = noise(Math.round(.03 * SR), s); hp(b, 2500); return norm(env(b, .0005, .012, 6), .4); },
  tick: () => { const b = sine(.05, 2600, 2400); add(b, sine(.05, 5200), .3); return norm(env(b, .0005, .015, 6), .3); },
  snap: s => { const b = noise(Math.round(.08 * SR), s); hp(b, 1500); add(b, sine(.08, 1800, 900), .6); return norm(env(b, .001, .03, 6), .5); },
  thump: () => { const b = sine(.5, 110, 42); add(b, sine(.5, 220, 84), .15); return norm(env(b, .003, .25, 4), .7); },
  impact: s => { const b = sine(.9, 90, 35); const n = noise(Math.round(.9 * SR), s); lp(n, 1800); add(b, env(n, .001, .12, 5), .5); return norm(env(b, .002, .45, 3.5), .75); },
  riser: s => { const n = noise(Math.round(1.6 * SR), s); lpSweep(n, 200, 9000); const t = sine(1.6, 180, 900); add(n, t, .25); for (let i = 0; i < n.length; i++) n[i] *= (i / n.length) ** 2.2; return norm(n, .4); },
  chime: () => { const b = buf(1.4); for (const [f, g] of [[1318.5, 1], [1975.5, .5], [2637, .25]]) add(b, env(sine(1.4, f), .003, .6, 4), g); return norm(b, .3); },
  ding: () => { const b = buf(.9); for (const [f, g] of [[880, 1], [1760, .35]]) add(b, env(sine(.9, f), .002, .35, 4), g); return norm(b, .3); },
  type: s => { const b = noise(Math.round(.04 * SR), s); hp(b, 1800); lp(b, 6000); add(b, env(sine(.04, 180, 120), .001, .015), .5); return norm(env(b, .0005, .012, 6), .25); },
  glitch: s => { const r = rng(s), b = buf(.22); let v = 0; for (let i = 0; i < b.length; i++) { if (i % 180 === 0) v = r() * 2 - 1; b[i] = v * (r() < .7 ? 1 : 0); } hp(b, 300); return norm(b, .25); },
  sparkle: s => { const r = rng(s), b = buf(.8); for (let k = 0; k < 6; k++) add(b, env(sine(.2, 2000 + r() * 3000), .001, .08, 5), .5, Math.round(k * .09 * SR)); return norm(b, .25); },
  paper: s => { const b = noise(Math.round(.3 * SR), s); hp(b, 900); lp(b, 5000); const n = b.length, r = rng(s + 3); for (let i = 0; i < n; i++) b[i] *= Math.sin(Math.PI * i / n) * (0.5 + r() * .5); return norm(b, .3); },
};
export const SFX_TYPES = Object.keys(SFX);

// ── 기본 배경음 ──
function saw(sec, f, harm = 10) { const b = buf(sec); for (let k = 1; k <= harm; k++) { if (f * k > 9000) break; const g = 1 / k; let p = k * 0.37; for (let i = 0; i < b.length; i++) b[i] += Math.sin(p + TAU * f * k * i / SR) * g; } return b; }
function bed(kind, dur, { bpm = 112, key = 'A', minor = true } = {}) {
  const L = buf(dur), R = buf(dur);
  if (kind === 'none' || !kind) return [L, R];
  const root = noteHz(key, 2), beat = 60 / bpm, bar = beat * 4;
  const prog = minor ? [0, 8, 3, 10] : [0, 5, 9, 7];               // i–VI–III–VII  /  I–IV–vi–V (반음)
  const nBars = Math.ceil(dur / bar);
  for (let b = 0; b < nBars; b++) {
    const chordRoot = root * 2 ** (prog[Math.floor(b / 2) % 4] / 12), t0 = Math.round(b * bar * SR);
    // 패드: 루트·3도·5도, 부드러운 어택
    const pad = buf(bar + .6);
    const step = prog[Math.floor(b / 2) % 4], th = minor ? (step === 0 ? 3 : 4) : (step === 9 ? 3 : 4);   // 단조는 i만 단3도, 장조는 vi만 단3도
    for (const [st, g] of [[12, .5], [12 + th, .35], [19, .35]]) add(pad, saw(bar + .6, chordRoot * 2 ** (st / 12), 8), g);
    lp(pad, kind === 'ambient' ? 900 : 1400);
    for (let i = 0; i < pad.length; i++) pad[i] *= Math.min(1, i / (SR * .5)) * Math.min(1, (pad.length - i) / (SR * .6));
    add(L, pad, .05, t0); add(R, pad, .05, t0 + 90);
    if (kind === 'pulse') {
      for (let q = 0; q < 4; q++) {
        const tb = t0 + Math.round(q * beat * SR);
        const k = env(sine(.35, 120, 45), .002, .18, 4); add(L, k, .55, tb); add(R, k, .55, tb);                     // 킥
        const bs = env(sine(beat * .9, chordRoot), .01, beat * .5, 3); add(bs, env(sine(beat * .9, chordRoot * 2), .01, beat * .3, 3), .3);
        add(L, bs, .22, tb); add(R, bs, .22, tb);                                                                        // 베이스
        const h = env(hp(noise(Math.round(.05 * SR), b * 8 + q), 7000), .0005, .02, 6), th = tb + Math.round(beat * .5 * SR);
        add(L, h, .12, th); add(R, h, .09, th);                                                                         // 하이햇(엇박)
      }
    }
  }
  const fo = Math.round(1.2 * SR); for (let i = 0; i < L.length; i++) { const g = Math.min(1, i / (SR * .3), (L.length - i) / fo); L[i] *= g; R[i] *= g; }
  return [L, R];
}

// ── 파일 디코딩 (ffmpeg → f32 stereo 48k) ──
function decode(file, start = 0) {
  const r = ffmpeg(['-ss', String(start), '-i', file, '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { encoding: 'buffer' });
  const f = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  return [L, R];
}

function writeWav(file, L, R) {
  const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0.98 ? 0.98 / peak : 1;
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4); }
  fs.writeFileSync(file, b);
}

// 메인: EV(효과음 이벤트), AUDIO(설정), DUR, narration(타이밍 json) → wav 경로
export function buildAudio({ proj, EV = [], AUDIO = {}, DUR, narration = null, out }) {
  const n = Math.round(DUR * SR), L = new Float32Array(n), R = new Float32Array(n);
  const report = { sfx: 0, unknown: [], bed: 'none', music: null, voice: 0 };
  // 1) 음악 또는 기본 배경음
  let musL = null, musR = null;
  if (AUDIO.music) {
    const f = path.resolve(proj, AUDIO.music);
    if (!fs.existsSync(f)) throw new Error('음악 파일 없음: ' + f);
    [musL, musR] = decode(f, AUDIO.musicStart || 0); report.music = path.basename(f);
    const fo = Math.round((AUDIO.musicFade ?? 1.5) * SR);
    for (let i = 0; i < Math.min(n, musL.length); i++) { const g = Math.min(1, (n - i) / fo, i / (SR * .05)); musL[i] *= g; musR[i] *= g; }
  } else if (AUDIO.bed && AUDIO.bed !== 'none') {
    [musL, musR] = bed(AUDIO.bed, DUR, AUDIO); report.bed = AUDIO.bed;
  }
  // 2) 내레이션
  let vL = null, vR = null;
  if (narration?.lines?.length) {
    vL = new Float32Array(n); vR = new Float32Array(n);
    for (const l of narration.lines) {
      if (!l.file || l.t0 == null) continue;
      const f = path.resolve(proj, 'work', l.file); if (!fs.existsSync(f)) continue;
      const [a, b] = decode(f); const o = Math.round(l.t0 * SR);
      add(vL, a, db(narration.gain ?? 0), o); add(vR, b, db(narration.gain ?? 0), o); report.voice++;
    }
  }
  // 3) 덕킹: 내레이션이 있는 동안 음악 -10dB (부드럽게)
  if (musL) {
    const mg = db(AUDIO.music ? (AUDIO.musicGain ?? -3) : (AUDIO.gain ?? -6));
    let duck = 1; const k = 1 - Math.exp(-1 / (SR * .08));
    for (let i = 0; i < n; i++) {
      const target = vL && Math.abs(vL[Math.max(0, i - 2400)] || 0) + Math.abs(vL[Math.min(n - 1, i + 2400)] || 0) > 0.003 ? db(-10) : 1;
      duck += (target - duck) * k;
      if (i < musL.length) { L[i] += musL[i] * mg * duck; R[i] += musR[i] * mg * duck; }
    }
  }
  if (vL) for (let i = 0; i < n; i++) { L[i] += vL[i]; R[i] += vR[i]; }
  // 4) 효과음
  const sg = db(AUDIO.sfxGain ?? 0);
  EV.forEach((e, i) => {
    const gen = SFX[e.type]; if (!gen) { report.unknown.push(e.type); return; }
    const x = gen(1000 + i * 17), o = Math.round(e.t * SR), g = db(e.gain || 0) * sg, pan = e.pan ?? 0;
    add(L, x, g * Math.min(1, 1 - pan), o); add(R, x, g * Math.min(1, 1 + pan), o); report.sfx++;
  });
  writeWav(out, L, R);
  return report;
}

// ── CLI ──
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const proj = projectDir(process.argv[2]);
  const idxFile = path.join(proj, 'scene', 'index.html');
  let idx = fs.readFileSync(idxFile, 'utf8');
  const DUR = +(idx.match(/id="root"[^>]*data-duration="([\d.]+)"/) || [])[1];
  if (!(DUR > 0)) die('index.html 의 root data-duration 을 읽지 못했습니다 (장면을 먼저 추가).');
  const S = readJSON(path.join(proj, 'work', 'sound.json'), { bed: 'pulse', bpm: 120, events: [] });
  const narration = readJSON(path.join(proj, 'work', 'narration.timing.json'));
  const EV = (S.events || []).map(e => Array.isArray(e) ? { t: e[0], type: e[1], gain: e[2] ?? 0 } : e);
  const dir = path.join(proj, 'scene', 'assets', 'audio'); fs.mkdirSync(dir, { recursive: true });
  const raw = path.join(proj, 'work', 'mix_raw.wav'), out = path.join(dir, 'mix.wav');
  const rep = buildAudio({ proj, EV, AUDIO: S, DUR, narration, out: raw });
  // 라우드니스 2패스 → −14 LUFS, 트루피크 −1.5
  const m1 = ffmpeg(['-i', raw, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { loglevel: 'info', allowFail: true });
  const js = (m1.stderr || '').match(/\{[\s\S]*?"input_i"[\s\S]*?\}/); let af = 'loudnorm=I=-14:TP=-1.5:LRA=11';
  if (js) { const L = JSON.parse(js[0]); if (isFinite(+L.input_i) && +L.input_i > -70) af += `:measured_I=${L.input_i}:measured_TP=${L.input_tp}:measured_LRA=${L.input_lra}:measured_thresh=${L.input_thresh}:offset=${L.target_offset}:linear=true`; }
  ffmpeg(['-i', raw, '-af', af, '-ar', '48000', '-ac', '2', out]); fs.rmSync(raw);
  if (!/<audio id="mh-mix"/.test(idx)) {
    idx = idx.replace('<!-- mh:scenes -->', `<audio id="mh-mix" class="clip" src="assets/audio/mix.wav" data-start="0" data-duration="${DUR}" data-track-index="9" data-volume="1"></audio>\n      <!-- mh:scenes -->`);
    fs.writeFileSync(idxFile, idx);
  }
  console.log(`✔ scene/assets/audio/mix.wav · ${DUR}s · 효과음 ${rep.sfx}개 · 배경 ${rep.music || rep.bed} · 내레이션 ${rep.voice}줄${rep.unknown.length ? ' · ⚠ 모르는 효과음: ' + [...new Set(rep.unknown)].join(',') : ''}`);
}
