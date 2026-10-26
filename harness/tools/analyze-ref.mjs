// 레퍼런스 측정: 영상(또는 이미지)을 숫자와 시트로 바꾼다 → 스타일 DNA의 근거
// node harness/tools/analyze-ref.mjs 모션1 ref/참고.mp4 [--thr 0.3]
// node harness/tools/analyze-ref.mjs 모션1 ref/            (ref 폴더의 영상·이미지 전부)
// 결과: work/ref-<이름>/ analysis.md, analysis.json, sheet.jpg(1초 간격), shots.png(샷별 대표), motion_N.png(움직임 연속 프레임), palette
import fs from 'fs';
import path from 'path';
import { projectDir, parseArgs, die, ensureDir, ffmpeg, probe, rawFrames, palette, board, chromium, writeJSON, ROOT } from './_common.mjs';

const { pos, opt } = parseArgs();
const proj = projectDir(pos[0]);
const target = path.resolve(proj, pos[1] || 'ref');
if (!fs.existsSync(target)) die('대상이 없습니다: ' + target);
const VID = /\.(mp4|mov|webm|mkv|m4v|gif|avi)$/i, IMGX = /\.(png|jpe?g|webp|bmp)$/i;
let files = fs.statSync(target).isDirectory() ? fs.readdirSync(target).map(f => path.join(target, f)) : [target];
const videos = files.filter(f => VID.test(f)), images = files.filter(f => IMGX.test(f));
if (!videos.length && !images.length) die('분석할 영상/이미지가 없습니다 (텍스트 프롬프트는 Claude가 직접 읽습니다).');
const browser = await chromium();
const spark = arr => { const s = '▁▂▃▄▅▆▇█', mx = Math.max(...arr, 1e-9); return arr.map(v => s[Math.min(7, Math.floor(v / mx * 7.999))]).join(''); };
const fmt = s => s.toFixed(2);

for (const f of videos) await analyzeVideo(f);
if (images.length) await analyzeImages(images, fs.statSync(target).isDirectory() ? 'images' : path.parse(target).name);
await browser.close();

async function analyzeVideo(file) {
  const base = path.parse(file).name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);
  const out = ensureDir(path.join(proj, 'work', `ref-${base}`));
  const P = probe(file);
  if (!P.duration) die('길이를 읽을 수 없습니다: ' + file);
  const thr = +(opt.thr || 0.3);
  console.log(`분석: ${path.basename(file)} · ${fmt(P.duration)}s · ${P.width}×${P.height} · ${P.fps}fps · 오디오 ${P.hasAudio ? '있음' : '없음'}`);

  // 1) 움직임 에너지 (12fps, 64px 흑백) + 컷 후보
  const MF = 12, mw = 64, mh = Math.max(2, Math.round(64 * P.height / P.width / 2) * 2);
  const g = rawFrames(file, { w: mw, h: mh, fps: MF, gray: true });
  const fsz = mw * mh, nF = Math.floor(g.length / fsz), energy = [0];
  for (let i = 1; i < nF; i++) { let s = 0; for (let j = 0; j < fsz; j++) s += Math.abs(g[i * fsz + j] - g[(i - 1) * fsz + j]); energy.push(s / fsz / 255); }

  // 2) 컷 검출 (ffmpeg scene score)
  const sc = ffmpeg(['-i', file, '-vf', `select='gt(scene,${thr})',showinfo`, '-an', '-f', 'null', '-'], { loglevel: 'info', allowFail: true });
  let cuts = [...(sc.stderr || '').matchAll(/pts_time:([\d.]+)/g)].map(m => +m[1]).filter(t => t > 0.05 && t < P.duration - 0.05);
  cuts = cuts.filter((t, i) => i === 0 || t - cuts[i - 1] > 0.2);
  const bounds = [0, ...cuts, P.duration], shots = [];
  for (let i = 0; i < bounds.length - 1; i++) shots.push({ i: i + 1, start: +fmt(bounds[i]), end: +fmt(bounds[i + 1]), dur: +fmt(bounds[i + 1] - bounds[i]) });
  const durs = shots.map(s => s.dur).sort((a, b) => a - b);
  const median = durs[Math.floor(durs.length / 2)], mean = P.duration / shots.length;

  // 3) 초당 움직임, 정지(hold) 구간, 움직임 피크
  const perSec = []; for (let s = 0; s < Math.ceil(P.duration); s++) { const seg = energy.slice(s * MF, (s + 1) * MF); perSec.push(seg.length ? seg.reduce((a, b) => a + b, 0) / seg.length : 0); }
  const nearCut = t => cuts.some(c => Math.abs(c - t) < 0.2);
  const lowThr = 0.004, holds = []; let hs = null;
  energy.forEach((e, i) => { const t = i / MF; if (e < lowThr && !nearCut(t)) { if (hs == null) hs = t; } else { if (hs != null && t - hs >= 0.8) holds.push([+fmt(hs), +fmt(t)]); hs = null; } });
  if (hs != null && P.duration - hs >= 0.8) holds.push([+fmt(hs), +fmt(P.duration)]);
  const moving = energy.filter(e => e >= lowThr).length / Math.max(1, energy.length);
  const peaks = energy.map((e, i) => ({ e, t: i / MF })).filter((p, i, a) => i > 0 && i < a.length - 1 && p.e >= a[i - 1].e && p.e >= a[i + 1].e && !nearCut(p.t) && p.t > 0.3 && p.t < P.duration - 0.3)
    .sort((a, b) => b.e - a.e).reduce((acc, p) => (acc.length < 3 && acc.every(q => Math.abs(q.t - p.t) > 1.5) ? [...acc, p] : acc), []).sort((a, b) => a.t - b.t);

  // 4) 팔레트 (전체 + 샷별 배경)
  const rgb = rawFrames(file, { w: 96, h: -2, fps: Math.min(4, 60 / Math.max(P.duration, 1) * 4 + 1) });
  const pal = palette(rgb, 9);
  const accents = pal.filter(c => c.sat > 0.45 && c.pct < 20);
  const A0 = {};
  let lum = 0, sat = 0, nPx = 0; for (let i = 0; i + 2 < rgb.length; i += 9) { const [r, gg, b] = [rgb[i], rgb[i + 1], rgb[i + 2]]; lum += 0.2126 * r + 0.7152 * gg + 0.0722 * b; const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); sat += mx ? (mx - mn) / mx : 0; nPx++; }
  lum /= nPx; sat /= nPx;
  A0.ground = lum > 150 ? '밝은 바탕' : lum < 70 ? '어두운 바탕' : '중간 밝기';

  // 5) 이미지: 1초 시트, 샷 대표, 움직임 스트립
  const cols = P.width >= P.height ? 6 : 8, n = Math.ceil(P.duration), rows = Math.ceil(n / cols);
  ffmpeg(['-i', file, '-vf', `fps=1,scale=${P.width >= P.height ? 320 : 180}:-2,tile=${cols}x${rows}:padding=4:color=0x16181c`, '-frames:v', '1', '-q:v', '3', path.join(out, 'sheet.jpg')]);
  // 컷이 적으면(원테이크·카메라 이동형) 균등 구간 12개를 대표로 쓴다 — 이 경우 '샷'은 구간이다
  const oneTake = shots.length < 6;
  const pick = oneTake ? Array.from({ length: 12 }, (_, i) => ({ i: i + 1, start: +fmt(P.duration * i / 12), end: +fmt(P.duration * (i + 1) / 12), dur: +fmt(P.duration / 12) }))
    : shots.length <= 24 ? shots : Array.from({ length: 24 }, (_, i) => shots[Math.floor(i * shots.length / 24)]);
  const shotItems = [];
  for (const s of pick) {
    const t = s.start + s.dur * 0.5, f = path.join(out, `shot_${String(s.i).padStart(2, '0')}.jpg`);
    ffmpeg(['-ss', fmt(t), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '3', f]);
    shotItems.push({ img: f, label: `${oneTake ? '구간' : '샷'} ${s.i} · ${fmt(s.start)}–${fmt(s.end)}s${oneTake ? '' : ` (${fmt(s.dur)}s)`}` });
  }
  if (oneTake) shots.splice(0, shots.length, ...pick.map(s => ({ ...s, segment: true })));
  await board([{ swatches: pal, label: '팔레트 (비중순)', sub: accents.length ? '강조색: ' + accents.map(a => a.hex).join(' ') : '' }, ...shotItems], path.join(out, 'shots.png'), { cols: P.width >= P.height ? 4 : 6, cellW: P.width >= P.height ? 400 : 220, browser, title: `${path.basename(file)} — 샷별 대표 프레임`, note: `컷 ${cuts.length}개 · 평균 샷 ${fmt(mean)}s · 중앙값 ${fmt(median)}s` });
  const strips = [], firstStrip = [];
  for (let k = 0; k < peaks.length; k++) {
    const pk = peaks[k], items = [];
    for (let j = 0; j < 8; j++) {
      const t = Math.max(0, Math.min(P.duration - 0.05, pk.t - 0.35 + j * 0.1)), f = path.join(out, `m${k + 1}_${j + 1}.jpg`);
      ffmpeg(['-ss', fmt(t), '-i', file, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '3', f]); items.push({ img: f, label: `${fmt(t)}s` });
    }
    const sp = path.join(out, `motion_${k + 1}.png`);
    await board(items, sp, { cols: 8, cellW: P.width >= P.height ? 230 : 130, browser, title: `움직임 피크 ${k + 1} — ${fmt(pk.t)}s 전후 0.1초 간격`, note: '이징(가속/감속/오버슈트), 등장·퇴장 방식, 잔상/블러, 2프레임 떨림 여부를 여기서 판단' });
    if (k === 0) firstStrip.push(...items); else for (const it of items) fs.rmSync(it.img);
    strips.push(path.basename(sp));
  }

  // 5-2) 질감: 노이즈 세기, 움직이는 그레인 vs 고정 질감, 그라데이션·비네트 + 원본 해상도 확대 크롭
  const texture = await measureTexture(file, P, cuts, out);

  // 6) 오디오: 템포 추정, 가장 큰 순간, 무음 구간, 컷-박자 일치율
  let audio = null;
  if (P.hasAudio) {
    const ar = 11025, hop = 256, r = ffmpeg(['-i', file, '-ac', '1', '-ar', String(ar), '-f', 's16le', '-'], { encoding: 'buffer' });
    const s = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 2));
    const rms = []; for (let i = 0; i + hop <= s.length; i += hop) { let a = 0; for (let j = 0; j < hop; j++) a += (s[i + j] / 32768) ** 2; rms.push(Math.sqrt(a / hop)); }
    const dbs = rms.map(v => 20 * Math.log10(v + 1e-6)), fr = ar / hop, peakDb = Math.max(...dbs);
    const on = rms.map((v, i) => Math.max(0, v - (rms[i - 1] || 0)));
    let best = { bpm: 0, score: 0 }; const scores = [];
    for (let bpm = 70; bpm <= 180; bpm += 0.5) { const lag = fr * 60 / bpm; let sc = 0; for (let i = Math.ceil(lag); i < on.length; i++) sc += on[i] * (on[Math.round(i - lag)] || 0); sc /= on.length; scores.push(sc); if (sc > best.score) best = { bpm, score: sc }; }
    const avgSc = scores.reduce((a, b) => a + b, 0) / scores.length;
    const cands = scores.map((sc, k) => ({ bpm: 70 + k * 0.5, sc })).filter((c, k, a) => k > 0 && k < a.length - 1 && c.sc >= a[k - 1].sc && c.sc >= a[k + 1].sc)
      .sort((a, b) => b.sc - a.sc).reduce((acc, c) => acc.length < 3 && acc.every(x => Math.abs(x.bpm - c.bpm) > 6) ? [...acc, c] : acc, []).map(c => c.bpm);
    const loudIdx = dbs.reduce((bi, v, i) => v > dbs[bi] ? i : bi, 0);
    const sil = []; let ss = null; dbs.forEach((v, i) => { const t = i / fr; if (v < peakDb - 30) { if (ss == null) ss = t; } else { if (ss != null && t - ss >= 0.4) sil.push([+fmt(ss), +fmt(t)]); ss = null; } });
    let onBeat = null;
    if (best.bpm && cuts.length >= 3) {
      const per = 60 / best.bpm / 2; let bestFrac = 0;   // 8분음표 그리드, 위상 탐색
      for (let ph = 0; ph < per; ph += 0.01) { const fr2 = cuts.filter(c => { const d = ((c - ph) % per + per) % per; return Math.min(d, per - d) < 0.06; }).length / cuts.length; if (fr2 > bestFrac) bestFrac = fr2; }
      onBeat = Math.round(bestFrac * 100);
    }
    audio = { bpm: best.bpm, bpmCandidates: cands, bpmConfidence: +(best.score / (avgSc || 1)).toFixed(2), loudestAt: +fmt(loudIdx / fr), silences: sil, cutsOnBeatPct: onBeat };
  }

  // 7) 레퍼런스 카드: Claude 가 이 한 장만 보면 되도록 (팔레트 + 대표 프레임 8 + 질감 확대 + 움직임 피크 6)
  const cardShots = shotItems.length <= 8 ? shotItems : Array.from({ length: 8 }, (_, i) => shotItems[Math.floor(i * shotItems.length / 8)]);
  const crops = (texture._crops || []).slice(0, 2), strip = firstStrip.filter((_, i) => i % 1 === 0).slice(1, 7);
  await board([
    { swatches: pal, label: `팔레트 · ${A0.ground} · 노이즈 ${texture.noiseLabel.split(' (')[0]} · ${texture.motionLabel.split(' (')[0]}`, sub: `그라데이션: ${texture.gradientLabel} · 비네트: ${texture.vignetteLabel}${accents.length ? ' · 강조색 ' + accents.map(a => a.hex).join(' ') : ''}` },
    ...cardShots, ...crops.map(c => ({ ...c, label: '질감 ' + c.label })), ...strip.map(c => ({ ...c, label: '움직임 ' + c.label })),
  ], path.join(out, 'card.png'), { cols: 4, cellW: P.width >= P.height ? 360 : 200, browser, title: `${path.basename(file)} — 레퍼런스 카드`, note: `${fmt(P.duration)}s · ${P.width}×${P.height} · 컷 ${cuts.length}개(평균 샷 ${fmt(mean)}s) · 움직임 ${spark(perSec)}` });
  for (const it of [...(texture._crops || []), ...firstStrip]) fs.rmSync(it.img, { force: true });
  delete texture._crops;

  const A = {
    file: path.relative(proj, file), duration: +fmt(P.duration), size: `${P.width}x${P.height}`, aspect: +(P.width / P.height).toFixed(3), fps: P.fps,
    cuts: { count: cuts.length, times: cuts.map(c => +fmt(c)), meanShot: +fmt(mean), medianShot: +fmt(median), shortest: durs[0], longest: durs[durs.length - 1], threshold: thr },
    shots, motion: { perSecond: perSec.map(v => +v.toFixed(4)), spark: spark(perSec), movingPct: Math.round(moving * 100), holds, peaks: peaks.map(p => +fmt(p.t)) },
    color: { palette: pal, accents: accents.map(a => a.hex), meanLuma: Math.round(lum), meanSat: +sat.toFixed(2), ground: lum > 150 ? '밝은 바탕' : lum < 70 ? '어두운 바탕' : '중간 밝기' },
    texture, audio, images: { card: 'card.png', sheet: 'sheet.jpg', shots: 'shots.png', motion: strips, texture: 'texture.png' },
  };
  writeJSON(path.join(out, 'analysis.json'), A);
  const md = `# 레퍼런스 측정: ${path.basename(file)}

> DNA의 근거. **\`card.png\` 한 장을 직접 보고** DNA를 쓴다 (팔레트·대표 프레임·질감 확대·움직임). 더 필요할 때만: \`sheet.jpg\`(1초 간격 전체), \`shots.png\`, \`texture.png\`, ${strips.map(s => `\`${s}\``).join(', ') || '(움직임 스트립 없음)'}

| 항목 | 측정값 |
|---|---|
| 길이 / 크기 / fps | ${fmt(P.duration)}s / ${P.width}×${P.height} (비율 ${(P.width / P.height).toFixed(2)}) / ${P.fps} |
| 컷 | ${cuts.length}개 · 평균 샷 ${fmt(mean)}s · 중앙값 ${fmt(median)}s · 최단 ${durs[0]}s · 최장 ${durs[durs.length - 1]}s |
| 컷 시각 | ${cuts.map(fmt).join(', ') || '없음 (원테이크/모핑형일 가능성)'} |
| 초당 움직임 | \`${spark(perSec)}\` (움직이는 프레임 ${Math.round(moving * 100)}%) |
| 정지(홀드) 구간 | ${holds.map(h => h.join('–') + 's').join(', ') || '없음 (계속 움직임)'} |
| 움직임 피크 | ${peaks.map(p => fmt(p.t) + 's').join(', ') || '-'} |
| 바탕 | ${A.color.ground} (평균 밝기 ${Math.round(lum)}/255, 채도 ${sat.toFixed(2)}) |
| 팔레트 | ${pal.map(c => `${c.hex} ${c.pct}%`).join(' · ')} |
| 강조색 | ${accents.map(a => a.hex).join(' ') || '뚜렷한 강조색 없음'} |
| 질감(노이즈) | ${texture.noiseLabel} — 평평한 바탕의 미세 노이즈 σ ${texture.noiseSigma} (0~1 깨끗, 1~3 약함, 3+ 강함) |
| 질감(움직임) | ${texture.motionLabel} (프레임 간 변화 / 노이즈 = ${texture.temporalRatio}) |
| 그라데이션 | ${texture.gradientLabel} |
| 비네트 | ${texture.vignetteLabel} |
${audio ? `| 템포 추정 | ${audio.bpm} BPM (후보 ${audio.bpmCandidates.join(' / ')} · 신뢰도 ${audio.bpmConfidence}) — 2배·절반·2/3배 오인이 흔함. 움직임 피크 간격·STYLE.md 값과 대조해 확정 |
| 컷-박자 일치 | ${audio.cutsOnBeatPct ?? '-'}% (8분음표 그리드 ±60ms) |
| 가장 큰 순간 | ${audio.loudestAt}s |
| 무음 구간 | ${audio.silences.map(s => s.join('–') + 's').join(', ') || '없음'} |` : '| 오디오 | 없음 |'}

## ${oneTake ? '구간 목록 (컷이 거의 없음 → 원테이크·카메라 이동·장면 내 변형형. shots.png 는 균등 12구간)' : '샷 목록'}
${shots.slice(0, 60).map(s => `- ${oneTake ? '구간' : '샷'} ${s.i}: ${s.start}–${s.end}s (${s.dur}s)`).join('\n')}${shots.length > 60 ? `\n- … 외 ${shots.length - 60}개` : ''}
`;
  fs.writeFileSync(path.join(out, 'analysis.md'), md);
  console.log(`✔ ${path.relative(ROOT, out)}/analysis.md  · 컷 ${cuts.length} · 평균 샷 ${fmt(mean)}s · 팔레트 ${pal.slice(0, 5).map(c => c.hex).join(' ')}${audio ? ` · ${audio.bpm}BPM` : ''}`);
}

async function analyzeImages(list, label) {
  const out = ensureDir(path.join(proj, 'work', `ref-${label.replace(/[^\p{L}\p{N}_-]+/gu, '_')}`));
  const bufs = list.map(f => rawFrames(f, { w: 128, h: -2 }));
  const pal = palette(Buffer.concat(bufs), 9), accents = pal.filter(c => c.sat > 0.45 && c.pct < 20);
  await board([{ swatches: pal, label: '팔레트 (비중순)', sub: accents.length ? '강조색: ' + accents.map(a => a.hex).join(' ') : '' }, ...list.map(f => ({ img: f, label: path.basename(f) }))], path.join(out, 'shots.png'), { cols: 4, cellW: 400, browser, title: '레퍼런스 이미지' });
  const A = { files: list.map(f => path.relative(proj, f)), color: { palette: pal, accents: accents.map(a => a.hex) }, images: { shots: 'shots.png' } };
  writeJSON(path.join(out, 'analysis.json'), A);
  fs.writeFileSync(path.join(out, 'analysis.md'), `# 레퍼런스 이미지 측정\n\n> \`shots.png\` 를 직접 열어 볼 것. 이미지는 움직임·리듬 정보가 없으므로 DNA 5~7번(모션·리듬·전환)은 브리프/프롬프트/라이브러리 스타일에서 가져오고 출처를 적는다.\n\n- 파일: ${A.files.join(', ')}\n- 팔레트: ${pal.map(c => `${c.hex} ${c.pct}%`).join(' · ')}\n- 강조색: ${A.color.accents.join(' ') || '없음'}\n`);
  console.log(`✔ ${path.relative(ROOT, out)}/analysis.md · 이미지 ${list.length}장 · 팔레트 ${pal.slice(0, 5).map(c => c.hex).join(' ')}`);
}

// ── 질감 측정 ──
// 평평한 바탕 블록(32px)을 찾아 고주파 성분(픽셀 − 주변 평균)의 표준편차 = 노이즈 σ,
// 연속 두 프레임의 같은 블록 차이 = 그레인이 움직이는지, 16×9 저해상도 밝기의 평면·방사 맞춤 = 그라데이션·비네트
async function measureTexture(file, P, cuts, out) {
  const W = P.width, H = P.height, fps = P.fps || 24;
  const times = [0.2, 0.4, 0.6, 0.8].map(r => r * P.duration).map(t => cuts.some(c => Math.abs(c - t) < 0.3) ? t + 0.4 : t).filter(t => t < P.duration - 0.2);
  const B = 32, results = [];
  for (const t of times) {
    const raw = ffmpeg(['-ss', t.toFixed(3), '-i', file, '-frames:v', '2', '-vf', 'format=gray', '-f', 'rawvideo', '-'], { encoding: 'buffer' }).stdout;
    const n = W * H; if (raw.length < 2 * n) continue;
    const f0 = raw.subarray(0, n), f1 = raw.subarray(n, 2 * n), blocks = [];
    for (let by = B; by + B < H - B; by += B) for (let bx = B; bx + B < W - B; bx += B) {
      let s = 0, s2 = 0, hp = 0, hp2 = 0, td = 0, k = 0;
      for (let y = by + 1; y < by + B - 1; y += 2) for (let x = bx + 1; x < bx + B - 1; x += 2) {
        const i = y * W + x, v = f0[i], h = v - (f0[i - 1] + f0[i + 1] + f0[i - W] + f0[i + W]) / 4;
        s += v; s2 += v * v; hp += h; hp2 += h * h; td += Math.abs(f0[i] - f1[i]); k++;
      }
      const sd = Math.sqrt(Math.max(0, s2 / k - (s / k) ** 2)), hsd = Math.sqrt(Math.max(0, hp2 / k - (hp / k) ** 2));
      blocks.push({ bx, by, sd, hsd, td: td / k, mean: s / k, ssd: Math.sqrt(Math.max(0, sd * sd - 1.25 * hsd * hsd)) });   // ssd: 노이즈를 뺀 구조 변화
    }
    blocks.sort((a, b) => a.ssd - b.ssd);
    const flat = blocks.slice(0, Math.max(8, Math.floor(blocks.length * 0.2)));
    const med = a => { const q = a.slice().sort((x, y) => x - y); return q[Math.floor(q.length / 2)] || 0; };
    results.push({ t, noise: med(flat.map(b => b.hsd)), temporal: med(flat.map(b => b.td)), flat, flatShare: blocks.filter(b => b.ssd < 6).length / blocks.length, bg: bgFit(blocks.filter(b => b.ssd < 6), W, H) });
  }
  const med = a => { const q = a.slice().sort((x, y) => x - y); return q[Math.floor(q.length / 2)] || 0; };
  const noiseSigma = +med(results.map(r => r.noise)).toFixed(2), temporal = +med(results.map(r => r.temporal)).toFixed(2);
  const ratio = noiseSigma > 0.3 ? +(temporal / noiseSigma).toFixed(2) : 0;
  // 그라데이션·비네트: 바탕 블록만(가장 많은 밝기대 + 그 평면에 잘 맞는 블록) 으로 a + bx + cy + d·r² 맞춤 → 콘텐츠(흰 카드·검은 글자)는 제외
  const fits = results.map(r => r.bg).filter(Boolean);
  const gx = med(fits.map(f => f.gx)), gy = med(fits.map(f => f.gy)), vig = med(fits.map(f => f.vig)), cover = med(fits.map(f => f.cover));
  const gmag = fits.length ? Math.hypot(gx, gy) : 0, gang = Math.round(Math.atan2(gy, gx) * 180 / Math.PI);
  const dir = a => a > -22 && a <= 22 ? '왼→오른쪽 밝아짐' : a > 22 && a <= 68 ? '왼위→오른아래 밝아짐' : a > 68 && a <= 112 ? '위→아래 밝아짐' : a > 112 && a <= 158 ? '오른위→왼아래 밝아짐' : a > 158 || a <= -158 ? '오른→왼쪽 밝아짐' : a > -158 && a <= -112 ? '오른아래→왼위 밝아짐' : a > -112 && a <= -68 ? '아래→위 밝아짐' : '왼아래→오른위 밝아짐';
  // 확대 크롭: 가장 평평한 블록 중심 256px 원본 + 96px 3배 확대 (노이즈·종이 결이 보이도록)
  const best = results.slice().sort((a, b) => b.flatShare - a.flatShare)[0], items = [];
  if (best) {
    const picks = []; for (const b of best.flat) { if (picks.length >= 3) break; if (picks.every(p => Math.hypot(p.bx - b.bx, p.by - b.by) > 300)) picks.push(b); }
    for (const [k, b] of picks.entries()) {
      const cx = Math.min(W - 256, Math.max(0, b.bx + B / 2 - 128)), cy = Math.min(H - 256, Math.max(0, b.by + B / 2 - 128));
      const f1 = path.join(out, `tx_${k}a.png`), f2 = path.join(out, `tx_${k}b.png`);
      ffmpeg(['-ss', best.t.toFixed(3), '-i', file, '-frames:v', '1', '-vf', `crop=256:256:${cx}:${cy}`, f1]);
      ffmpeg(['-ss', best.t.toFixed(3), '-i', file, '-frames:v', '1', '-vf', `crop=96:96:${cx + 80}:${cy + 80},scale=288:288:flags=neighbor`, f2]);
      items.push({ img: f1, label: `원본 256px (${cx},${cy})` }, { img: f2, label: '3배 확대' });
    }
  }
  const T = {
    noiseSigma, temporalRatio: ratio,
    noiseLabel: noiseSigma < 1 ? '깨끗한 평면 (노이즈 거의 없음)' : noiseSigma < 3 ? '약한 노이즈·질감' : '뚜렷한 노이즈·질감 (그레인/종이/하프톤 의심 → 확대 이미지 확인)',
    motionLabel: noiseSigma < 1 ? '해당 없음' : ratio > 0.8 ? '움직이는 그레인 (필름 그레인처럼 매 프레임 바뀜)' : ratio > 0.35 ? '부분적으로 움직임 (스텝 보일/2프레임 그레인 가능)' : '고정 질감 (종이·인쇄 결처럼 제자리)',
    gradient: { strength: +gmag.toFixed(1), angle: gang },
    gradientLabel: !fits.length || cover < 0.15 ? '판단 어려움 (평평한 바탕이 적음 — 이미지로 확인)' : gmag < 8 ? '없음 (균일한 바탕)' : `${gmag < 25 ? '약한' : '뚜렷한'} 선형 그라데이션 — 화면 전체 밝기차 약 ${Math.round(gmag)}/255, ${dir(gang)}`,
    vignette: +(+vig || 0).toFixed(1), backgroundCoverage: +(+cover || 0).toFixed(2), vignetteLabel: !fits.length || cover < 0.15 ? '판단 어려움' : Math.abs(vig) < 8 ? '없음' : vig > 0 ? `가장자리가 어두움 (중앙−모서리 ${Math.round(vig)}/255)` : `가장자리가 밝음 (${Math.round(-vig)}/255)`,
  };
  if (items.length) {
    await board(items, path.join(out, 'texture.png'), { cols: 6, cellW: 256, browser, title: '바탕 질감 (평평한 영역, 원본 해상도)', note: `노이즈 σ ${noiseSigma} · ${T.noiseLabel}\n${T.motionLabel} · 그라데이션: ${T.gradientLabel} · 비네트: ${T.vignetteLabel}` });
  }
  T._crops = items;
  return T;
}

// 바탕 맞춤: 평평한 블록들의 평균 밝기로 L = a + b·x + c·y + d·r² (x,y ∈ −.5..+.5, r² = x²+y²)
function bgFit(bl, W, H) {
  if (bl.length < 12) return null;
  const hist = new Map(); for (const b of bl) { const k = Math.floor(b.mean / 8); hist.set(k, (hist.get(k) || 0) + 1); }
  const mode = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0];
  let use = bl.filter(b => Math.abs(Math.floor(b.mean / 8) - mode) <= 1), coef = null;
  for (let it = 0; it < 6; it++) {
    coef = lsq(use.map(b => { const x = (b.bx + 16) / W - .5, y = (b.by + 16) / H - .5; return [[1, x, y, x * x + y * y], b.mean]; }));
    if (!coef) return null;
    const pred = b => { const x = (b.bx + 16) / W - .5, y = (b.by + 16) / H - .5; return coef[0] + coef[1] * x + coef[2] * y + coef[3] * (x * x + y * y); };
    use = bl.filter(b => Math.abs(b.mean - pred(b)) < 6);
  }
  const total = Math.floor((W - 64) / 32) * Math.floor((H - 64) / 32);
  return { gx: coef[1], gy: coef[2], vig: -coef[3] * 0.5, cover: use.length / Math.max(1, total) };   // vig > 0: 가장자리가 어두움 (r²=.5 가 모서리)
}
function lsq(rows) {   // 정규방정식 4×4
  const n = 4, A = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (const [x, y] of rows) for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) A[i][j] += x[i] * x[j]; A[i][n] += x[i] * y; }
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; if (Math.abs(A[i][i]) < 1e-9) return null;
    for (let r = 0; r < n; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= n; c++) A[r][c] -= f * A[i][c]; }
  }
  return A.map((r, i) => r[n] / r[i]);
}
