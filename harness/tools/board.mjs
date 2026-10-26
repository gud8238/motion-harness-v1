// 스토리보드: HyperFrames 로 실제 장면을 스냅샷해 라벨을 붙여 한 장으로
//   node board.mjs 모션1                    장면마다 대표 시점(data-mh-key, 없으면 길이의 60%) → work/storyboard.png + .html + kf.json
//   node board.mjs 모션1 --times 1,2.5,4    지정 시점 → work/stills.png
//   node board.mjs 모션1 --strip s3 --n 8   장면 s3 를 n등분한 연속 프레임 (움직임·이징 확인) → work/strip_s3.png
import fs from 'fs';
import path from 'path';
import { projectDir, parseArgs, die, hosts, hfJSON, board, ensureDir, ROOT } from './_common.mjs';

const { pos, opt } = parseArgs();
const proj = projectDir(pos[0]);
const sceneDir = path.join(proj, 'scene'), work = ensureDir(path.join(proj, 'work'));
const idx = fs.readFileSync(path.join(sceneDir, 'index.html'), 'utf8');
const W = +(idx.match(/id="root"[^>]*data-width="(\d+)"/) || [])[1] || 1920, H = +(idx.match(/id="root"[^>]*data-height="(\d+)"/) || [])[1] || 1080;
const scenes = hosts(idx).filter(h => h.track !== 'captions').sort((a, b) => a.start - b.start);
if (!scenes.length) die('장면이 없습니다. scene.mjs add 로 장면을 만드세요.');
const total = Math.max(...scenes.map(h => h.start + h.dur));
const r3 = n => Math.round(n * 1000) / 1000;

let shots, tag;
if (opt.times) { tag = 'stills'; shots = String(opt.times).split(',').map(Number).map(t => ({ t, label: `${t.toFixed(2)}s` })); }
else if (opt.strip) {
  const s = scenes.find(x => x.id === opt.strip); if (!s) die('장면 없음: ' + opt.strip);
  const n = +(opt.n || 8); tag = `strip_${s.id}`;
  shots = Array.from({ length: n }, (_, i) => { const t = r3(s.start + s.dur * (i + 0.5) / n); return { t, label: `${s.id} · ${t.toFixed(2)}s` }; });
} else {
  tag = 'storyboard';
  shots = scenes.map((s, i) => ({ t: r3(s.start + (s.key != null && s.key !== undefined && !isNaN(+s.key) ? +s.key : s.dur * 0.6)), id: s.id, dur: s.dur, label: `#${i + 1} ${s.title || s.id}   ${s.start.toFixed(1)}–${(s.start + s.dur).toFixed(1)}s  [${s.kind || 'scene'}]`, sub: s.note }));
}

const fdir = path.join(work, 'frames', tag);
fs.rmSync(fdir, { recursive: true, force: true });
const res = hfJSON(['snapshot', sceneDir, '--at', shots.map(s => s.t).join(','), '--no-end', '-o', fdir]);
if (!res.ok) die('스냅샷 실패: ' + JSON.stringify(res).slice(0, 400));
const frames = res.frames.slice().sort((a, b) => a.time - b.time);
const items = shots.map((s, i) => ({ ...s, img: frames[i]?.path }));

const out = path.join(work, `${tag}.png`);
await board(items, out, { cols: W >= H ? 3 : 5, cellW: W >= H ? 560 : 300, title: `${path.basename(proj)}${tag === 'storyboard' ? ' — 스토리보드' : ''}`, note: tag === 'storyboard' ? `총 ${total.toFixed(1)}초 · 장면 ${scenes.length}개 · ${W}×${H}` : '' });
if (tag === 'storyboard') {
  fs.writeFileSync(path.join(work, 'kf.json'), JSON.stringify(items.map(i => ({ ...i, img: path.relative(proj, i.img).split(path.sep).join('/') })), null, 2));
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  fs.writeFileSync(path.join(work, 'storyboard.html'), `<!doctype html><meta charset="utf-8"><title>${esc(path.basename(proj))} 스토리보드</title><style>body{background:#16181c;color:#eee;font:15px/1.5 Pretendard,'Malgun Gothic','Apple SD Gothic Neo',sans-serif;margin:24px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:18px}.c{background:#22252b;border-radius:10px;overflow:hidden}.c img{width:100%;display:block}.c b{display:block;padding:8px 12px 0}.c p{margin:4px 12px 12px;color:#b9bdc7;white-space:pre-wrap}a{color:#8cf}</style><h1>${esc(path.basename(proj))} — 스토리보드</h1><p>총 ${total.toFixed(1)}초 · 장면 ${scenes.length}개 · 계획서 PLAN.md · 스타일 DNA DNA.md${fs.existsSync(path.join(work, 'compare.png')) ? ' · <a href="compare.png">레퍼런스 대조표</a>' : ''}</p><div class="g">${items.map(i => `<div class="c"><img src="${esc(path.relative(work, i.img).split(path.sep).join('/'))}"><b>${esc(i.label)}</b><p>${esc(i.sub)}</p></div>`).join('')}</div>`);
}
console.log(`✔ ${path.relative(ROOT, out)} (${items.length}컷)`);
