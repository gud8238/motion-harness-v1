// 공통 유틸: 경로, 인자, ffmpeg, 색 측정, 보드(이미지 묶음), HyperFrames 실행
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

export const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // <플러그인>/harness
export const PLUGIN = path.resolve(HARNESS, '..');
// 설치물(node_modules, 라이브러리, 폰트)은 플러그인 업데이트에도 남도록 사용자 홈에 둔다
export const DATA = process.env.MH_DATA || path.join(os.homedir(), '.motion-harness');
export const LIB = path.join(DATA, 'library');
export const ROOT = process.cwd();                                                          // 프로젝트들이 생기는 작업 폴더
export const CONFIG = JSON.parse(fs.readFileSync(path.join(HARNESS, 'config.json'), 'utf8'));

// ---------- 인자 ----------
export function parseArgs(argv = process.argv.slice(2)) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2), v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) opt[k] = true; else { opt[k] = v; i++; }
    } else pos.push(a);
  }
  return { pos, opt };
}

export function die(msg, code = 1) { console.error('✖ ' + msg); process.exit(code); }

// 프로젝트 폴더 찾기: 이름(모션1) 또는 경로
export function projectDir(name) {
  if (!name) die('프로젝트 이름이 필요합니다. 예: node harness/tools/xxx.mjs 모션1');
  const cands = [path.resolve(name)];
  for (const c of cands) if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
  die(`프로젝트 폴더를 찾을 수 없습니다: ${name}`);
}

export const ensureDir = d => (fs.mkdirSync(d, { recursive: true }), d);
export const readJSON = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export const writeJSON = (f, o) => { ensureDir(path.dirname(f)); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
export const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
export const fwd = p => p.split(path.sep).join('/');

// ---------- 외부 프로그램 ----------
export function has(cmd, args = ['-version']) {
  try { return spawnSync(cmd, args, { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0; } catch { return false; }
}
export function run(cmd, args, o = {}) {
  const r = spawnSync(cmd, args, { encoding: o.encoding ?? 'utf8', maxBuffer: 1 << 30, cwd: o.cwd, input: o.input });
  if (r.error) throw r.error;
  if (r.status !== 0 && !o.allowFail) throw new Error(`${cmd} 실패 (${r.status}): ${(r.stderr || '').toString().slice(-800)}`);
  return r;
}
export const ffmpeg = (args, o = {}) => run('ffmpeg', ['-hide_banner', '-y', '-loglevel', o.loglevel || 'error', ...args], o);

export function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const j = JSON.parse(r.stdout);
  const v = j.streams.find(s => s.codec_type === 'video');
  const a = j.streams.find(s => s.codec_type === 'audio');
  const fr = v?.avg_frame_rate || v?.r_frame_rate || '0/1';
  const [n, d] = fr.split('/').map(Number);
  return {
    duration: +j.format.duration || +(v?.duration || 0),
    width: v?.width || 0, height: v?.height || 0,
    fps: d ? +(n / d).toFixed(3) : 0,
    hasAudio: !!a,
  };
}

// 영상/이미지 → 작은 RGB 원시 픽셀 (팔레트·모션 측정용)
export function rawFrames(input, { w = 96, h = -2, fps = null, gray = false, start = null, dur = null } = {}) {
  const vf = [fps ? `fps=${fps}` : null, `scale=${w}:${h}:flags=area`, gray ? 'format=gray' : 'format=rgb24'].filter(Boolean).join(',');
  const args = [];
  if (start != null) args.push('-ss', String(start));
  if (dur != null) args.push('-t', String(dur));
  args.push('-i', input, '-vf', vf, '-f', 'rawvideo', '-');
  const r = ffmpeg(args, { encoding: 'buffer' });
  return r.stdout;
}

// ---------- 색 ----------
export const hex = ([r, g, b]) => '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
export function toLab([r, g, b]) {
  const f = c => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g3 = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  X = g3(X); Y = g3(Y); Z = g3(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
export const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function satOf([r, g, b]) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }

// k-means 팔레트 (Lab 공간) — 결정적(시드 고정)
export function palette(buf, k = 8, step = 3) {
  const px = [];
  for (let i = 0; i + 2 < buf.length; i += 3 * step) px.push([buf[i], buf[i + 1], buf[i + 2]]);
  if (!px.length) return [];
  const lab = px.map(toLab);
  // k-means++ 비슷한 결정적 초기화: 밝기 순 정렬 후 균등 샘플
  const order = lab.map((l, i) => [l[0], i]).sort((a, b) => a[0] - b[0]);
  let C = Array.from({ length: k }, (_, j) => lab[order[Math.floor((j + 0.5) / k * order.length)][1]].slice());
  const as = new Int32Array(lab.length);
  for (let it = 0; it < 14; it++) {
    for (let i = 0; i < lab.length; i++) { let bi = 0, bd = 1e9; for (let j = 0; j < k; j++) { const d = dE(lab[i], C[j]); if (d < bd) { bd = d; bi = j; } } as[i] = bi; }
    const S = C.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < lab.length; i++) { const s = S[as[i]]; s[0] += lab[i][0]; s[1] += lab[i][1]; s[2] += lab[i][2]; s[3]++; }
    C = S.map((s, j) => s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : C[j]);
  }
  const groups = C.map(() => ({ rgb: [0, 0, 0], n: 0 }));
  for (let i = 0; i < px.length; i++) { const g = groups[as[i]]; g.rgb[0] += px[i][0]; g.rgb[1] += px[i][1]; g.rgb[2] += px[i][2]; g.n++; }
  const out = groups.filter(g => g.n).map(g => {
    const rgb = g.rgb.map(x => x / g.n);
    return { hex: hex(rgb), rgb: rgb.map(Math.round), pct: +(100 * g.n / px.length).toFixed(1), sat: +satOf(rgb).toFixed(2), lab: toLab(rgb) };
  }).sort((a, b) => b.pct - a.pct);
  // 거의 같은 색 병합
  const merged = [];
  for (const c of out) { const m = merged.find(x => dE(x.lab, c.lab) < 7); if (m) m.pct = +(m.pct + c.pct).toFixed(1); else merged.push(c); }
  return merged.map(({ lab, ...r }) => r);
}

// 팔레트 A(레퍼런스)를 B(우리)가 얼마나 덮는가: 레퍼런스 비중 가중, ΔE<thr 이면 일치
export function paletteCoverage(ref, ours, thr = 14) {
  let cov = 0, tot = 0; const rows = [];
  for (const c of ref) {
    const L = toLab(c.rgb); let best = null, bd = 1e9;
    for (const o of ours) { const d = dE(L, toLab(o.rgb)); if (d < bd) { bd = d; best = o; } }
    tot += c.pct; if (bd < thr) cov += c.pct;
    rows.push({ ref: c.hex, pct: c.pct, nearest: best?.hex, dE: +bd.toFixed(1), ok: bd < thr });
  }
  return { score: tot ? Math.round(100 * cov / tot) : 0, rows };
}

// ---------- 브라우저 ----------
export async function chromium() {
  let pw;
  try { pw = await import(pathToFileURL(path.join(DATA, 'node_modules', 'playwright', 'index.mjs')).href); }
  catch { die('playwright 가 없습니다. 먼저 설치하세요: node "' + path.join(HARNESS, 'tools', 'setup.mjs') + '"'); }
  const chromium = pw.chromium || pw.default?.chromium;
  return chromium.launch({ args: ['--font-render-hinting=none'] });
}

// index.html 의 장면 호스트 목록 (scene.mjs 가 쓰는 형식)
export function hosts(html) {
  const out = [];
  for (const m of html.matchAll(/<div\b[^>]*data-composition-src="[^"]*"[^>]*><\/div>/g)) {
    const tag = m[0], a = k => (tag.match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1];
    out.push({ tag, id: a('id'), src: a('data-composition-src'), start: +a('data-start'), dur: +a('data-duration'), title: a('data-mh-title') || '', note: a('data-mh-note') || '', key: a('data-mh-key'), kind: a('data-mh-kind') || '', track: a('data-track-kind') || '' });
  }
  return out;
}
// HyperFrames CLI (버전 고정): hf(['render', dir, ...])
export function hf(args, o = {}) {
  const win = process.platform === 'win32';
  const q = a => (win && /[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);   // Windows 는 셸을 거치므로 공백·한글 경로를 따옴표로
  const full = ['--yes', `hyperframes@${CONFIG.hyperframes}`, ...args].map(q);
  const r = spawnSync(win ? 'npx.cmd' : 'npx', full, { encoding: 'utf8', maxBuffer: 1 << 28, cwd: o.cwd, stdio: o.inherit ? 'inherit' : 'pipe', shell: win });
  if (r.error) throw r.error;
  return r;
}
export function hfJSON(args, o = {}) {
  const r = hf([...args, '--json'], o);
  const out = r.stdout || ''; const i = out.indexOf('{');
  try { return JSON.parse(out.slice(i)); } catch { throw new Error(`hyperframes ${args[0]} 결과를 읽지 못함: ${(r.stderr || out).slice(-600)}`); }
}

export const cpuWorkers = () => Math.max(1, Math.min(6, os.cpus().length - 1));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// 이미지 여러 장을 라벨과 함께 한 장으로 (브라우저로 합성 → PNG)
export async function board(items, out, { cols = 3, title = '', cellW = 560, browser = null, note = '' } = {}) {
  const own = !browser; browser = browser || await chromium();
  const page = await browser.newPage({ viewport: { width: cols * (cellW + 16) + 16, height: 60 }, deviceScaleFactor: 1 });
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const toData = f => {
    if (!f || !fs.existsSync(f)) return '';
    const ext = path.extname(f).slice(1).toLowerCase().replace('jpg', 'jpeg');
    return `data:image/${ext};base64,` + fs.readFileSync(f).toString('base64');
  };
  const cells = items.map(it => {
    if (it.pair) return `<div class="c pair"><div class="pp">${it.pair.map(p => `<figure><img src="${toData(p.img)}"><figcaption>${esc(p.cap)}</figcaption></figure>`).join('')}</div><div class="l">${esc(it.label)}</div>${it.sub ? `<div class="s">${esc(it.sub)}</div>` : ''}</div>`;
    if (it.swatches) return `<div class="c sw"><div class="l">${esc(it.label)}</div><div class="bar">${it.swatches.map(s => `<span style="flex:${Math.max(s.pct, 2)};background:${s.hex}" title="${s.hex} ${s.pct}%"><i>${s.hex}<br>${s.pct}%</i></span>`).join('')}</div>${it.sub ? `<div class="s">${esc(it.sub)}</div>` : ''}</div>`;
    return `<div class="c"><img src="${toData(it.img)}"><div class="l">${esc(it.label)}</div>${it.sub ? `<div class="s">${esc(it.sub)}</div>` : ''}</div>`;
  }).join('');
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#16181c;color:#eee;font:15px/1.35 'Pretendard','Noto Sans CJK KR','Malgun Gothic',sans-serif;padding:16px}
    h1{font-size:22px;margin:0 0 4px} .n{color:#aab;margin:0 0 14px;white-space:pre-wrap}
    .g{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:16px}
    .c{background:#22252b;border-radius:8px;overflow:hidden} .c img{display:block;width:100%}
    .l{padding:8px 10px 2px;font-weight:700} .s{padding:0 10px 10px;color:#b9bdc7;font-size:13px;white-space:pre-wrap}
    .pair{grid-column:span ${cols}} .pp{display:flex;gap:6px} .pp figure{margin:0;flex:1} .pp figcaption{font-size:12px;color:#99a;padding:3px 6px}
    .sw{grid-column:span ${cols}} .bar{display:flex;height:64px;margin:6px 10px 10px;border-radius:6px;overflow:hidden}
    .bar span{display:flex;align-items:flex-end} .bar i{font-style:normal;font-size:10px;padding:2px 3px;color:#fff;mix-blend-mode:difference}
  </style><body>${title ? `<h1>${esc(title)}</h1>` : ''}${note ? `<p class="n">${esc(note)}</p>` : ''}<div class="g">${cells}</div>`);
  await page.waitForLoadState('load');
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
  ensureDir(path.dirname(out));
  await page.screenshot({ path: out, fullPage: true, type: out.endsWith('.png') ? 'png' : 'jpeg', ...(out.endsWith('.png') ? {} : { quality: 88 }) });
  await page.close();
  if (own) await browser.close();
  return out;
}
