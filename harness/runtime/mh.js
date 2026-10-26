/* MH — motion-harness 캔버스 런타임 (HyperFrames 장면 안에서 쓰는 클래식 스크립트, window.MH)
 * 루트 index.html <head> 에서 한 번 불러오고, 각 장면(compositions/*.html)에서 window.MH 로 쓴다.
 * 원칙: draw(t)는 장면 로컬 시간 t의 순수 함수. Math.random 금지 → hash/rng/noise.
 * HyperFrames 연결: MH.drive(tl, 길이, draw) — GSAP 타임라인 시크 때마다 draw(t) 호출 */
(function () {
'use strict';
// motion_video 엔진 — 캔버스 한 장, render(t) 결정적 렌더링
// 사용: import { film, E, tween, kf, ... } from '/harness/engine/lib.js'
// 원칙: 모든 그리기는 시간 t의 순수 함수. 이전 프레임 상태에 의존하지 않는다. Math.random 대신 rng/hash.

// ───────────── 수학 ─────────────
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));            // t가 a→b 구간에서 0→1
const map = (x, a, b, c, d) => c + (d - c) * clamp((x - a) / (b - a));
const mix = (a, b, t) => Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], t)) : lerp(a, b, t);

// ───────────── 이징 ─────────────
// CSS cubic-bezier와 동일. 레퍼런스에서 측정한 곡선을 그대로 쓸 때: E.bez(.7,0,.2,1)
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t, dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    x = clamp(x); let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break; t -= e / d; }
    t = clamp(t); return sy(t);
  };
}
const E = {
  linear: t => clamp(t),
  in: t => clamp(t) ** 3,
  out: t => 1 - (1 - clamp(t)) ** 3,
  inOut: t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; },
  quadOut: t => 1 - (1 - clamp(t)) ** 2,
  expoOut: t => { t = clamp(t); return t === 1 ? 1 : 1 - 2 ** (-10 * t); },
  expoInOut: t => { t = clamp(t); if (t === 0 || t === 1) return t; return t < .5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2; },
  back: (t, s = 1.7) => { t = clamp(t) - 1; return 1 + t * t * ((s + 1) * t + s); },
  smooth: t => { t = clamp(t); return t * t * (3 - 2 * t); },
  snap: bezier(.7, 0, .2, 1),          // 스위스/에디토리얼 계열의 "딱 맞아떨어지는" 곡선
  bez: bezier,
};
// 닫힌형 스프링 (오버슈트 후 정착). 반환 0→1(+오버슈트)
function spring(t, { f = 2.2, z = 0.42 } = {}) {
  if (t <= 0) return 0;
  const w = TAU * f, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
}
const SPRING = { snappy: { f: 3.2, z: 0.5 }, smooth: { f: 1.6, z: 0.75 }, heavy: { f: 1.4, z: 0.9 }, playful: { f: 2.4, z: 0.32 } };

// ───────────── 시간/애니메이션 ─────────────
// tween: t0에서 d초 동안 0→1 (ease 적용)
const tween = (t, t0, d, ease = E.out) => ease(seg(t, t0, t0 + d));
// springAt: t0에 시작하는 스프링 a→b
const springAt = (t, t0, a, b, preset = SPRING.snappy) => lerp(a, b, spring(t - t0, preset));
// 키프레임 트랙: kf(t, [[0, 0], [1.2, 100, E.snap], [2, [10,20]]]) — 숫자 또는 배열, 구간별 이징(도착 키에 지정)
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, ez] = keys[i];
    if (t <= t1) { const [t0, v0] = keys[i - 1]; return mix(v0, v1, (ez || E.inOut)((t - t0) / (t1 - t0))); }
  }
  return keys[keys.length - 1][1];
}
// 스태거: i번째 요소의 지연
const stagger = (i, gap = 0.06, base = 0) => base + i * gap;
// 프레임 양자화: 12fps 느낌(2s에 그리기) → onTwos(t, 12)
const quant = (t, rate = 12) => Math.floor(t * rate + 1e-6) / rate;
// 비트 그리드: beat(t, bpm) → 박자 번호(실수), onBeat(n, bpm) → n번째 박 시각
const beatOf = (t, bpm) => t * bpm / 60;
const onBeat = (n, bpm, offset = 0) => offset + n * 60 / bpm;
// 사인파 '숨쉬기' (정지 화면에도 생명력)
const breathe = (t, amp = 1, hz = 0.5, ph = 0) => Math.sin(TAU * hz * t + ph) * amp;

// ───────────── 난수/노이즈 (결정적) ─────────────
function rng(seed = 1) { let s = seed | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = (n, m = 0) => { const x = Math.sin(n * 127.1 + m * 311.7) * 43758.5453; return x - Math.floor(x); };
const noise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };
function noise2(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v) * 2 - 1;
}
// 손그림 '보일(boil)': 2프레임마다 바뀌는 떨림 오프셋
const boil = (t, key = 0, amp = 1.5, rate = 12) => { const b = Math.floor(t * rate); return [(hash(b, key) - .5) * 2 * amp, (hash(key, b + 99) - .5) * 2 * amp]; };

// ───────────── 색 ─────────────
function rgba(hex, a = 1) {
  const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
function mixColor(a, b, t) {
  const p = h => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], clamp(t))).toString(16).padStart(2, '0')).join('');
}

// ───────────── 도형 ─────────────
function rr(ctx, x, y, w, h, r = 0) { r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); }
function line(ctx, pts, { w = 2, color = '#000', cap = 'round', join = 'round', dash = null, p = 1 } = {}) {
  // p: 0→1 그려지는 정도(라인 드로잉 애니메이션)
  ctx.save(); ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineCap = cap; ctx.lineJoin = join; if (dash) ctx.setLineDash(dash);
  let total = 0; const L = [0]; for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(total); }
  const lim = total * clamp(p); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    if (L[i] <= lim) ctx.lineTo(pts[i][0], pts[i][1]);
    else { const f = (lim - L[i - 1]) / (L[i] - L[i - 1] || 1); ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)); break; }
  }
  ctx.stroke(); ctx.restore();
}
function shadow(ctx, { blur = 30, x = 0, y = 12, color = 'rgba(0,0,0,.25)' } = {}) { ctx.shadowBlur = blur; ctx.shadowOffsetX = x; ctx.shadowOffsetY = y; ctx.shadowColor = color; }
function noShadow(ctx) { ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowColor = 'transparent'; }

// 필름 그레인/종이 질감: 미리 만든 노이즈 타일을 시간에 따라 이동(결정적)
let _grain = null;
function grain(ctx, t, { amount = 0.06, rate = 12, size = 256, mode = 'overlay' } = {}) {
  if (!_grain) {
    _grain = document.createElement('canvas'); _grain.width = _grain.height = size;
    const g = _grain.getContext('2d'), d = g.createImageData(size, size), r = rng(7);
    for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
  }
  const b = rate > 0 ? Math.floor(t * rate) : 0, ox = Math.floor(hash(b) * size), oy = Math.floor(hash(b, 3) * size);
  ctx.save(); ctx.globalAlpha = amount; ctx.globalCompositeOperation = mode;
  const pat = ctx.createPattern(_grain, 'repeat'); pat.setTransform(new DOMMatrix().translate(ox, oy));
  ctx.fillStyle = pat; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
}
function vignette(ctx, W, H, a = 0.35, color = '0,0,0') {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .6);
  g.addColorStop(0, `rgba(${color},0)`); g.addColorStop(1, `rgba(${color},${a})`); ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}


// ───────────── 바탕·질감 (analyze-ref 의 texture 측정값을 그대로 옮긴다) ─────────────
// 그라데이션: gradient(ctx, { stops: [[0,'#0B1530'],[1,'#1E3A6E']], angle: 90 })  angle: 0=왼→오른, 90=위→아래 / type:'radial'
function gradient(ctx, o = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height, st = o.stops || [[0, '#000'], [1, '#333']];
  let g;
  if (o.type === 'radial') { const cx = (o.cx ?? .5) * W, cy = (o.cy ?? .5) * H; g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * (o.r ?? .6)); }
  else { const a = (o.angle ?? 90) * Math.PI / 180, L = Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a)), dx = Math.cos(a) * L / 2, dy = Math.sin(a) * L / 2; g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy); }
  st.forEach(([p, c]) => g.addColorStop(p, c));
  ctx.save(); ctx.fillStyle = g; ctx.globalAlpha *= o.alpha ?? 1; ctx.fillRect(0, 0, W, H); ctx.restore();
}
// 종이 질감 (고정): 여러 크기의 값 노이즈 + 섬유 결. amount ≈ 측정 노이즈 σ/255 의 2~4배에서 시작해 대조표로 맞춘다
const _paper = {};
function paper(ctx, o = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height, key = [W, H, o.seed ?? 3, o.fiber ?? 0.5, o.scale ?? 1].join(':');
  if (!_paper[key]) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), d = g.createImageData(W, H), r = rng(o.seed ?? 3), sc = o.scale ?? 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = noise2(x / (60 * sc), y / (60 * sc)) * .5 + noise2(x / (14 * sc), y / (14 * sc)) * .3 + (r() - .5) * .4;
      const f = (o.fiber ?? 0.5) * Math.max(0, noise2(x / (3 * sc), y / (40 * sc)) - .6) * 2;
      const v = 128 + (n - f) * 128, i = (y * W + x) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.max(0, Math.min(255, v)); d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0); _paper[key] = c;
  }
  ctx.save(); ctx.globalAlpha *= o.amount ?? 0.08; ctx.globalCompositeOperation = o.mode || 'multiply'; ctx.drawImage(_paper[key], 0, 0); ctx.restore();
}

// ───────────── 카메라: 월드 좌표 (x,y)를 화면 (sx,sy)에 놓는다 ─────────────
function withCam(ctx, cam, fn) {
  const { x = 0, y = 0, z = 1, r = 0, sx = ctx.canvas.width / 2, sy = ctx.canvas.height / 2 } = cam;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(r); ctx.scale(z, z); ctx.translate(-x, -y); fn(); ctx.restore();
}

// ───────────── 글자 ─────────────
const FONT = { sans: "'Pretendard','Noto Sans KR','Noto Sans CJK KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif" };
const font = (size, weight = 700, family = FONT.sans) => `${weight} ${size}px ${family}`;
// 한국어 줄바꿈: 공백 우선, 너무 긴 어절은 글자 단위
function wrap(ctx, str, maxW) {
  if (!maxW) return String(str).split('\n');
  const out = [];
  for (const para of String(str).split('\n')) {
    let cur = '';
    for (const word of para.split(/(\s+)/)) {
      const test = cur + word;
      if (ctx.measureText(test).width <= maxW || !cur.trim()) {
        if (ctx.measureText(test).width > maxW && !cur.trim()) { for (const ch of word) { if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ''; } cur += ch; } }
        else cur = test;
      } else { out.push(cur.trimEnd()); cur = word.trimStart(); }
    }
    out.push(cur.trimEnd());
  }
  return out;
}
// txt: 기본 텍스트. align/baseline/tracking(px)/lh(배수)/maxW(줄바꿈)
function txt(ctx, str, x, y, o = {}) {
  const { size = 64, weight = 700, family = FONT.sans, color = '#111', align = 'left', baseline = 'alphabetic', tracking = 0, lh = 1.25, maxW = 0, alpha = 1, stroke = null } = o;
  ctx.save(); ctx.font = font(size, weight, family); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = baseline; ctx.globalAlpha *= alpha;
  if ('letterSpacing' in ctx) ctx.letterSpacing = tracking + 'px';
  const lines = wrap(ctx, str, maxW);
  lines.forEach((l, i) => { if (stroke) { ctx.lineWidth = stroke.w; ctx.strokeStyle = stroke.color; ctx.lineJoin = 'round'; ctx.strokeText(l, x, y + i * size * lh); } ctx.fillText(l, x, y + i * size * lh); });
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)); ctx.restore();
  return { w, h: lines.length * size * lh, lines: lines.length };
}
function measure(ctx, str, size = 64, weight = 700, family = FONT.sans, tracking = 0) {
  ctx.save(); ctx.font = font(size, weight, family); if ('letterSpacing' in ctx) ctx.letterSpacing = tracking + 'px'; const w = ctx.measureText(str).width; ctx.restore(); return w;
}
// 텍스트 등장 애니메이션. p: 0→1. mode: 'rise'(아래에서 클립 상승) | 'chars'(글자 페이드+이동) | 'type'(타이핑) | 'clip'(좌→우 와이프) | 'words'
function txtIn(ctx, str, x, y, p, o = {}) {
  const { mode = 'rise', size = 64, weight = 700, family = FONT.sans, color = '#111', align = 'left', tracking = 0, ease = E.out, spread = 0.6, dy = 0.9 } = o;
  ctx.save(); ctx.font = font(size, weight, family); if ('letterSpacing' in ctx) ctx.letterSpacing = tracking + 'px'; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
  const full = ctx.measureText(str).width, x0 = align === 'center' ? x - full / 2 : align === 'right' ? x - full : x;
  if (mode === 'type') { const n = Math.floor(clamp(p) * [...str].length); ctx.textAlign = 'left'; ctx.fillText([...str].slice(0, n).join(''), x0, y); ctx.restore(); return; }
  if (mode === 'clip') { ctx.beginPath(); ctx.rect(x0 - 4, y - size * 1.2, (full + 8) * ease(p), size * 1.6); ctx.clip(); ctx.textAlign = 'left'; ctx.fillText(str, x0, y); ctx.restore(); return; }
  const units = mode === 'words' ? str.split(/(\s+)/) : [...str];
  const n = units.length; let cx = x0; ctx.textAlign = 'left';
  units.forEach((u, i) => {
    const w = ctx.measureText(u).width, q = ease(seg(p, (i / n) * spread, (i / n) * spread + (1 - spread)));
    if (q > 0 && u.trim()) {
      ctx.save();
      if (mode === 'rise') { ctx.beginPath(); ctx.rect(cx - 2, y - size * 1.15, w + 4, size * 1.45); ctx.clip(); ctx.fillText(u, cx, y + (1 - q) * size * dy * 1.3); }
      else { ctx.globalAlpha *= q; ctx.fillText(u, cx, y + (1 - q) * size * 0.35); }
      ctx.restore();
    }
    cx += w;
  });
  ctx.restore();
}

// ───────────── 이미지 ─────────────
const IMG = {};                         // 이름 → 이미지(또는 배경 제거된 캔버스)
// 중심 기준 그리기: (cx,cy) 중심, w×h 상자 안에 fit
function img(ctx, im, cx, cy, w, h, o = {}) {
  if (typeof im === 'string') im = IMG[im];
  if (!im) return;
  const { fit = 'contain', r = 0, alpha = 1, rot = 0, ax = .5, ay = .5, flip = false } = o;
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const s = fit === 'cover' ? Math.max(w / iw, h / ih) : fit === 'fill' ? 1 : Math.min(w / iw, h / ih);
  const dw = fit === 'fill' ? w : iw * s, dh = fit === 'fill' ? h : ih * s;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(cx, cy); ctx.rotate(rot); if (flip) ctx.scale(-1, 1);
  if (r || fit === 'cover') { rr(ctx, -w / 2, -h / 2, w, h, r); ctx.clip(); }
  // cover: ax/ay = 잘라낼 때의 초점(0=왼/위, 1=오른/아래). contain: 상자 안 정렬 기준
  const dx = fit === 'cover' ? -w / 2 - (dw - w) * ax : -dw * ax, dy = fit === 'cover' ? -h / 2 - (dh - h) * ay : -dh * ay;
  ctx.drawImage(im, dx, dy, dw, dh);
  ctx.restore();
  return { w: dw, h: dh };
}
// 가장자리에서 시작하는 플러드필로 단색 배경 제거 (흰 배경 제품 사진 등). tol: 색 허용치
function cutout(im, { tol = 28, feather = 1, trim = true } = {}) {
  const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, w, h), a = d.data;
  const seen = new Uint8Array(w * h), q = new Int32Array(w * h); let qh = 0, qt = 0;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => (y * w + x) * 4);
  const bg = [0, 1, 2].map(k => corners.reduce((s, i) => s + a[i + k], 0) / 4);
  const near = i => Math.abs(a[i] - bg[0]) + Math.abs(a[i + 1] - bg[1]) + Math.abs(a[i + 2] - bg[2]) < tol * 3;
  const push = (x, y) => { const p = y * w + x; if (!seen[p] && near(p * 4)) { seen[p] = 1; q[qt++] = p; } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); } for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (qh < qt) { const p = q[qh++], x = p % w, y = (p / w) | 0; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
  for (let p = 0; p < w * h; p++) if (seen[p]) a[p * 4 + 3] = 0;
  if (feather) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {   // 가장자리 1px 부드럽게
    const p = y * w + x; if (seen[p]) continue;
    if (seen[p - 1] || seen[p + 1] || seen[p - w] || seen[p + w]) a[p * 4 + 3] = 140;
  }
  g.putImageData(d, 0, 0);
  if (!trim) return c;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0) return c;
  const t = document.createElement('canvas'); t.width = x1 - x0 + 1; t.height = y1 - y0 + 1; t.getContext('2d').drawImage(c, -x0, -y0); return t;
}

// ───────────── 장면 전환 ─────────────
// 들어오는 장면의 처음 d초 동안 적용. A=나가는 장면, B=들어오는 장면(오프스크린 캔버스)
const TRANS = {
  cut: (ctx, A, B) => ctx.drawImage(B, 0, 0),
  fade: (ctx, A, B, p) => { ctx.drawImage(A, 0, 0); ctx.globalAlpha = p; ctx.drawImage(B, 0, 0); ctx.globalAlpha = 1; },
  wipe: (ctx, A, B, p, o, W, H) => {
    ctx.drawImage(A, 0, 0); const dir = o.dir || 'left'; ctx.save(); ctx.beginPath();
    const r = { left: [0, 0, W * p, H], right: [W * (1 - p), 0, W * p, H], up: [0, H * (1 - p), W, H * p], down: [0, 0, W, H * p] }[dir];
    ctx.rect(...r); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
    if (o.bar && p > 0 && p < 1) { ctx.fillStyle = o.bar; const bw = o.barW || 14; if (dir === 'left') ctx.fillRect(W * p - bw, 0, bw, H); else if (dir === 'right') ctx.fillRect(W * (1 - p), 0, bw, H); else if (dir === 'up') ctx.fillRect(0, H * (1 - p), W, bw); else ctx.fillRect(0, H * p - bw, W, bw); }
  },
  push: (ctx, A, B, p, o, W, H) => { const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[o.dir || 'left']; ctx.drawImage(A, dx * W * p, dy * H * p); ctx.drawImage(B, dx * W * (p - 1), dy * H * (p - 1)); },
  slide: (ctx, A, B, p, o, W, H) => { const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[o.dir || 'left']; ctx.drawImage(A, dx * W * p * .3, dy * H * p * .3); shadow(ctx, { blur: 60, color: 'rgba(0,0,0,.35)' }); ctx.drawImage(B, dx * W * (p - 1), dy * H * (p - 1)); noShadow(ctx); },
  zoom: (ctx, A, B, p, o, W, H) => {
    const s1 = 1 + p * 1.5; ctx.save(); ctx.globalAlpha = 1 - p; ctx.translate(W / 2, H / 2); ctx.scale(s1, s1); ctx.drawImage(A, -W / 2, -H / 2); ctx.restore();
    const s2 = .7 + .3 * p; ctx.save(); ctx.globalAlpha = p; ctx.translate(W / 2, H / 2); ctx.scale(s2, s2); ctx.drawImage(B, -W / 2, -H / 2); ctx.restore();
  },
  iris: (ctx, A, B, p, o, W, H) => { ctx.drawImage(A, 0, 0); ctx.save(); circle(ctx, o.x ?? W / 2, o.y ?? H / 2, Math.hypot(W, H) * p); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore(); },
  blinds: (ctx, A, B, p, o, W, H) => { ctx.drawImage(A, 0, 0); const n = o.n || 8; ctx.save(); ctx.beginPath(); for (let i = 0; i < n; i++) { const q = clamp(p * 1.6 - i / n * .6); ctx.rect(i * W / n, 0, W / n * q, H); } ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore(); },
  flash: (ctx, A, B, p, o, W, H) => { ctx.drawImage(p < .5 ? A : B, 0, 0); ctx.fillStyle = o.color || '#fff'; ctx.globalAlpha = 1 - Math.abs(p - .5) * 2; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; },
};
const transitions = TRANS;

// ───────────── 자막 ─────────────
function subtitle(ctx, text, W, H, o = {}) {
  if (!text) return;
  const { size = Math.round(H * 0.042), color = '#fff', plate = 'rgba(0,0,0,.55)', y = H * 0.9, weight = 600, maxW = W * 0.8, family = FONT.sans, alpha = 1 } = o;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = font(size, weight, family); const lines = wrap(ctx, text, maxW);
  const lh = size * 1.35, bh = lines.length * lh + size * .5, bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + size * 1.2;
  if (plate) { ctx.fillStyle = plate; rr(ctx, W / 2 - bw / 2, y - bh + size * .35, bw, bh, size * .3); ctx.fill(); }
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y - (lines.length - 1 - i) * lh)); ctx.restore();
}


// ───────────── HyperFrames 연결 ─────────────
// 타임라인을 시크할 때마다 draw(로컬초)를 부른다. (onUpdate 대신 setter: seek 시 이벤트가 꺼져도 확실히 그림)
function drive(tl, dur, draw) {
  const d = { _t: 0 };
  Object.defineProperty(d, 't', { get() { return this._t; }, set(v) { this._t = v; draw(v); } });
  tl.to(d, { t: dur, duration: dur, ease: 'none' }, 0);
  draw(0);
  return tl;
}
// 캔버스 준비: stage('s2-cv') → { cv, ctx, W, H }
function stage(id) { const cv = document.getElementById(id); return { cv, ctx: cv.getContext('2d'), W: cv.width, H: cv.height }; }
// 프레임 시작: 변환·투명도 초기화 후 바탕색
function clear(ctx, color) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; noShadow(ctx); if (color) { ctx.fillStyle = color; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); } else ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
// 이미지 불러오기: load({ hero: 'assets/source/front.png', side: { src, cutout: true, tol: 20 } }) → Promise<IMG>
// 이미 불러온 이름은 다시 불러오지 않는다(장면 여러 개가 같은 사진을 써도 한 번만).
const _loading = {};
function load(map) {
  return Promise.all(Object.entries(map).map(([name, spec]) => {
    if (_loading[name]) return _loading[name];
    const sp = typeof spec === 'string' ? { src: spec } : spec;
    return (_loading[name] = new Promise((res, rej) => {
      const im = new Image(); im.onload = () => { IMG[name + ':raw'] = im; IMG[name] = sp.cutout ? cutout(im, sp) : im; res(IMG[name]); };
      im.onerror = () => rej(new Error('이미지 로드 실패: ' + sp.src)); im.src = sp.src;
    }));
  })).then(() => IMG);
}
// DNA의 cubic-bezier를 GSAP 이징으로 (DOM 장면용). CustomEase 가 있으면 등록, 없으면 근사치
function gsapEase(name, x1, y1, x2, y2) {
  if (window.CustomEase) { window.gsap.registerPlugin(window.CustomEase); window.CustomEase.create(name, `M0,0 C${x1},${y1} ${x2},${y2} 1,1`); return name; }
  return 'power3.inOut';
}
// 두 오프스크린 캔버스로 장면 안 전환: trans(ctx, 'wipe', A, B, p, { dir:'left', bar:'#E30613' })
function trans(ctx, type, A, B, p, o = {}) { (TRANS[type] || TRANS.cut)(ctx, A, B, p, o, ctx.canvas.width, ctx.canvas.height); }
function layer(W, H) { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }

window.MH = {
  TAU, clamp, lerp, seg, map, mix, E, bezier, spring, SPRING, tween, springAt, kf, stagger, quant, beatOf, onBeat, breathe,
  rng, hash, noise, noise2, boil, rgba, mixColor, rr, circle, line, shadow, noShadow, grain, vignette, gradient, paper, withCam,
  FONT, font, wrap, txt, measure, txtIn, IMG, img, cutout, transitions: TRANS, trans, layer, subtitle,
  drive, stage, clear, load, gsapEase,
};
})();
