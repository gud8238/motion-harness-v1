// 레퍼런스 대조표: 레퍼런스 샷 ↔ 우리 키프레임을 나란히, 팔레트 일치율·리듬 비교
// node harness/tools/compare.mjs 모션1 [--ref ref-참고]     (먼저 still.mjs 로 스토리보드를 만들어 둘 것)
import fs from 'fs';
import path from 'path';
import { projectDir, parseArgs, die, readJSON, rawFrames, palette, paletteCoverage, board, writeJSON, ROOT } from './_common.mjs';

const { pos, opt } = parseArgs();
const proj = projectDir(pos[0]);
const work = path.join(proj, 'work');
const refDirs = fs.readdirSync(work).filter(d => d.startsWith('ref-') && fs.existsSync(path.join(work, d, 'analysis.json')));
const refName = opt.ref ? (opt.ref.startsWith('ref-') ? opt.ref : 'ref-' + opt.ref) : refDirs[0];
if (!refName || !fs.existsSync(path.join(work, refName))) die('레퍼런스 분석 폴더가 없습니다. 먼저 analyze-ref.mjs 실행. 후보: ' + refDirs.join(', '));
const R = readJSON(path.join(work, refName, 'analysis.json'));
const kf = readJSON(path.join(work, 'kf.json'));
if (!kf) die('work/kf.json 이 없습니다. 먼저 still.mjs 로 스토리보드를 만드세요.');
const scenes = readJSON(path.join(work, 'kf.json')).map(k => ({ ...k, img: path.join(proj, k.img) }));

// 우리 팔레트
const ours = palette(Buffer.concat(scenes.map(s => rawFrames(s.img, { w: 128, h: -2 }))), 9);
const cov = paletteCoverage(R.color.palette, ours);

// 짝 맞추기: 상대 위치가 가장 가까운 레퍼런스 샷
const refShots = fs.readdirSync(path.join(work, refName)).filter(f => /^shot_\d+\.jpg$/.test(f)).sort();
const refImgs = refShots.length ? refShots : fs.readdirSync(path.join(work, refName)).filter(f => /\.(jpe?g|png)$/i.test(f) && f !== 'sheet.jpg' && !f.startsWith('motion_') && f !== 'shots.png');
const kfMeta = scenes;
const ourDur = Math.max(...kfMeta.map(k => k.t)) || 1;
const pairs = kfMeta.map((k, i) => {
  let ref = null;
  if (R.shots && refShots.length) {
    const rel = k.t / ourDur, avail = refShots.map(f => R.shots.find(s => s.i === +f.match(/\d+/)[0])).filter(Boolean);
    const best = avail.reduce((b, s) => Math.abs((s.start + s.dur / 2) / R.duration - rel) < Math.abs((b.start + b.dur / 2) / R.duration - rel) ? s : b, avail[0]);
    ref = { img: path.join(work, refName, `shot_${String(best.i).padStart(2, '0')}.jpg`), cap: `레퍼런스 샷 ${best.i} (${best.start}–${best.end}s)` };
  } else if (refImgs.length) {
    const f = R.files ? path.join(proj, R.files[i % R.files.length]) : path.join(work, refName, refImgs[i % refImgs.length]);
    ref = { img: f, cap: '레퍼런스 ' + path.basename(f) };
  }
  return { pair: [ref, { img: k.img, cap: '우리 ' + k.label }].filter(Boolean), label: k.label, sub: k.sub };
});

// 리듬 비교
const scenesMeta = kfMeta.length, ourTotal = kfMeta.reduce((a, k) => a + (k.dur || 0), 0);
const rhythm = R.cuts ? { refMeanShot: R.cuts.meanShot, refCutsPer10s: +(R.cuts.count / R.duration * 10).toFixed(1), oursScenes: scenesMeta, oursMeanScene: +(ourTotal / Math.max(1, scenesMeta)).toFixed(2), oursCutsPer10s: +((scenesMeta - 1) / Math.max(ourTotal, 1) * 10).toFixed(1) } : null;
const summary = { ref: refName, paletteMatch: cov.score, palette: cov.rows, ours: ours.map(o => `${o.hex} ${o.pct}%`), rhythm };
writeJSON(path.join(work, 'compare.json'), summary);
const out = path.join(work, 'compare.png');
await board([
  { swatches: R.color.palette, label: '레퍼런스 팔레트' },
  { swatches: ours, label: `우리 팔레트 — 레퍼런스 색 일치율 ${cov.score}%`, sub: cov.rows.filter(r => !r.ok).map(r => `불일치: ${r.ref} (${r.pct}%) → 가장 가까운 ${r.nearest}, ΔE ${r.dE}`).join('\n') || '모든 주요 색이 일치' },
  ...pairs,
], out, { cols: 2, cellW: 760, title: `레퍼런스 대조표 — ${refName}`, note: rhythm ? `리듬: 레퍼런스 평균 샷 ${rhythm.refMeanShot}s · 10초당 컷 ${rhythm.refCutsPer10s}개  ↔  우리 평균 장면 ${rhythm.oursMeanScene}s · 10초당 장면전환 ${rhythm.oursCutsPer10s}개 (장면 안의 컷은 별도)` : '' });
console.log(`✔ ${path.relative(ROOT, out)} · 팔레트 일치율 ${cov.score}%${rhythm ? ` · 레퍼런스 평균 샷 ${rhythm.refMeanShot}s` : ''}`);
for (const r of cov.rows.filter(r => !r.ok)) console.log(`  불일치: ${r.ref} (${r.pct}%) → ${r.nearest} ΔE ${r.dE}`);
