// 소스 이미지 점검 — 레퍼런스를 재현하는 데 필요한 이미지와 사용자가 준 이미지를 맞춰 본다
//   node assets.mjs sheet 모션1     source/ 전체를 한 장으로 (이름·크기·배경 상태) → work/sources.png + sources.json
//                                    → Claude 는 이미지를 하나씩 열지 않고 이 한 장으로 소스를 파악한다
//   node assets.mjs request 모션1   work/assets.json (Claude 가 작성) → work/ASSETS.md (사용자에게 줄 요청서: 용도·규격·생성 프롬프트)
//   node assets.mjs check 모션1     사용자가 이미지를 넣은 뒤: 요청한 파일이 왔는지, 비율·투명 배경이 맞는지 → work/assets.json 상태 갱신
//
// work/assets.json 형식:
// { "items": [ { "file": "bg_city_wide.png", "role": "배경", "scenes": ["#2", "#3"],
//                "why": "레퍼런스 구간 3~5: 로봇 뒤로 도시 배경이 좌→우로 흐름(패럴랙스)",
//                "size": "3840x1080", "transparent": false, "required": true,
//                "ref": "work/ref-<이름>/shot_04.jpg",          // 생성 도구에 함께 첨부할 레퍼런스 프레임
//                "attach": ["source/SHOT_02_FRONT.png"],         // 일관성용으로 함께 첨부할 사용자 소스
//                "prompt_en": "...", "prompt_ko": "..." } ],
//   "substitutes": "코드로 충분히 재현하는 요소 요약 (예: 파티클, 그라데이션 하늘, UI 테두리)" }
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { projectDir, parseArgs, die, readJSON, writeJSON, probe, rawFrames, board, ROOT } from './_common.mjs';

const { pos } = parseArgs();
const [cmd, pname] = pos;
const proj = projectDir(pname), work = path.join(proj, 'work'), src = path.join(proj, 'source');
const IMG = /\.(png|jpe?g|webp|bmp|gif)$/i;
fs.mkdirSync(work, { recursive: true });

// 이미지 한 장의 상태: 크기, 투명 채널, 가장자리 배경이 단색인지(코드로 배경 제거 가능)
function inspect(f) {
  const p = probe(f);
  let alpha = false;
  try { const r = JSON.parse(require_ffprobe(f)); alpha = /^(rgba|bgra|argb|abgr|ya8|ya16|yuva|rgba64|gbrap|pal8)/.test(r.streams?.[0]?.pix_fmt || ''); } catch {}
  const w = 64, h = Math.max(2, Math.round(64 * p.height / Math.max(1, p.width) / 2) * 2), buf = rawFrames(f, { w, h });
  const px = (x, y) => { const i = (y * w + x) * 3; return [buf[i], buf[i + 1], buf[i + 2]]; };
  const edge = []; for (let x = 0; x < w; x++) { edge.push(px(x, 0), px(x, h - 1)); } for (let y = 0; y < h; y++) { edge.push(px(0, y), px(w - 1, y)); }
  const m = [0, 1, 2].map(k => edge.reduce((s, c) => s + c[k], 0) / edge.length), dev = edge.reduce((s, c) => s + Math.abs(c[0] - m[0]) + Math.abs(c[1] - m[1]) + Math.abs(c[2] - m[2]), 0) / edge.length / 3;
  const bg = alpha ? '투명' : dev < 6 ? '단색 배경' : dev < 18 ? '거의 단색' : '복잡한 배경';
  return { file: path.basename(f), w: p.width, h: p.height, aspect: +(p.width / Math.max(1, p.height)).toFixed(3), alpha, bg, bgHex: '#' + m.map(v => Math.round(v).toString(16).padStart(2, '0')).join('') };
}
function require_ffprobe(f) { return spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt', '-of', 'json', f], { encoding: 'utf8' }).stdout; }
const list = () => fs.existsSync(src) ? fs.readdirSync(src).filter(f => IMG.test(f)).sort() : [];

if (cmd === 'sheet') {
  const files = list();
  if (!files.length) die('source/ 에 이미지가 없습니다.');
  const info = files.map(f => inspect(path.join(src, f)));
  writeJSON(path.join(work, 'sources.json'), info);
  const tmp = fs.mkdtempSync(path.join(work, '.thumbs-'));
  const items = info.map((it, i) => {   // 썸네일(긴 변 480)로 줄여서 보드에 — 원본이 커도 가볍게
    const t = path.join(tmp, `t${i}.jpg`);
    spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(src, it.file), '-vf', "scale='if(gt(iw,ih),480,-2)':'if(gt(iw,ih),-2,480)'", '-frames:v', '1', '-q:v', '4', t]);
    return { img: t, label: it.file, sub: `${it.w}×${it.h} · ${it.bg}${it.bg === '단색 배경' || it.bg === '거의 단색' ? ' ' + it.bgHex : ''}` };
  });
  await board(items, path.join(work, 'sources.png'), { cols: 5, cellW: 300, title: `${path.basename(proj)} — 소스 이미지 ${files.length}장`, note: '단색 배경 = 코드로 배경 제거 가능 · 투명 = 그대로 합성 · 복잡한 배경 = 사진 그대로(카드·화면 안) 또는 인물이면 remove-background' });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`✔ ${path.relative(ROOT, path.join(work, 'sources.png'))} · ${files.length}장`);
  for (const it of info) console.log(`  ${it.file.padEnd(40)} ${String(it.w + '×' + it.h).padEnd(11)} ${it.bg}`);
} else if (cmd === 'request') {
  const A = readJSON(path.join(work, 'assets.json'));
  if (!A?.items?.length) die('work/assets.json 에 items 가 없습니다 (필요한 이미지가 없으면 요청서를 만들지 않는다).');
  const req = A.items.filter(i => i.required !== false), opt = A.items.filter(i => i.required === false);
  const block = (it, n) => `### ${n}. \`${it.file}\` — ${it.role}${it.required === false ? ' (선택)' : ''}
- **쓰이는 장면**: ${(it.scenes || []).join(', ')}
- **왜 필요한가**: ${it.why}
- **규격**: ${it.size || '자유'} (가로:세로 ${it.size ? ratio(it.size) : '-'})${it.transparent ? ' · **투명 배경 PNG** (안 되면 단색 배경 — 하네스가 제거)' : ''}
${it.ref ? `- **스타일 참고로 함께 첨부**: \`${it.ref}\` (레퍼런스 프레임)\n` : ''}${it.attach?.length ? `- **일관성 참고로 함께 첨부**: ${it.attach.map(a => '`' + a + '`').join(', ')}\n` : ''}
**생성 프롬프트 (영문 — 이미지 생성 도구에 그대로 붙여넣기)**
\`\`\`
${it.prompt_en}
\`\`\`
${it.prompt_ko ? `<details><summary>한국어 설명</summary>\n\n${it.prompt_ko}\n\n</details>\n` : ''}`;
  const md = `# ${path.basename(proj)} — 추가 소스 이미지 요청

레퍼런스를 충분히 살리려면 아래 이미지가 필요합니다. 만든 이미지는 **지정한 파일 이름 그대로** \`source/\` 폴더에 넣고, Claude 화면에서 **"이미지 추가 완료"**를 누르세요.

| # | 파일 이름 | 역할 | 장면 | 규격 | 필수 |
|---|---|---|---|---|---|
${A.items.map((it, i) => `| ${i + 1} | \`${it.file}\` | ${it.role} | ${(it.scenes || []).join(' ')} | ${it.size || '-'}${it.transparent ? ' 투명' : ''} | ${it.required === false ? '선택' : '필수'} |`).join('\n')}

${[...req, ...opt].map((it, i) => block(it, i + 1)).join('\n')}
${A.substitutes ? `---\n**이미지 없이 코드로 재현하는 요소**: ${A.substitutes}\n` : ''}
**팁**: 같은 도구·같은 대화에서 연속으로 만들면 화풍이 맞습니다. 생성 결과가 규격과 조금 달라도 괜찮습니다(하네스가 맞춰 자름). 못 만든 이미지는 넣지 않아도 됩니다 — 그 부분은 코드로 대체합니다.
`;
  fs.writeFileSync(path.join(work, 'ASSETS.md'), md);
  console.log(`✔ ${path.relative(ROOT, path.join(work, 'ASSETS.md'))} · 필수 ${req.length} · 선택 ${opt.length}`);
} else if (cmd === 'check') {
  const A = readJSON(path.join(work, 'assets.json')); if (!A?.items) die('work/assets.json 이 없습니다.');
  const files = list(), lower = files.map(f => f.toLowerCase());
  const known = new Set((readJSON(path.join(work, 'sources.json'), []) || []).map(i => i.file));
  for (const it of A.items) {
    const stem = it.file.replace(/\.[^.]+$/, '').toLowerCase();
    let hit = files[lower.indexOf(it.file.toLowerCase())] || files.find(f => f.toLowerCase().replace(/\.[^.]+$/, '') === stem);
    if (!hit) { it.status = 'missing'; it.found = null; continue; }
    const s = inspect(path.join(src, hit)), notes = [];
    if (it.size) { const [w, h] = it.size.split('x').map(Number); if (Math.abs(s.aspect - w / h) / (w / h) > 0.12) notes.push(`비율 ${s.w}×${s.h} (요청 ${it.size}) — 잘라 맞춤`); }
    if (it.transparent && !s.alpha && s.bg === '복잡한 배경') notes.push('투명/단색 배경이 아님 — 배경 제거가 어려움');
    it.status = 'ok'; it.found = hit; it.notes = notes;
  }
  const extra = files.filter(f => !known.has(f) && !A.items.some(i => i.found === f));
  writeJSON(path.join(work, 'assets.json'), A);
  for (const it of A.items) console.log(`${it.status === 'ok' ? '✔' : it.required === false ? '·' : '✖'} ${it.file.padEnd(34)} ${it.status === 'ok' ? '받음' + (it.found !== it.file ? ` (${it.found})` : '') : it.required === false ? '없음(선택 — 코드로 대체)' : '없음 — 코드로 대체'}${it.notes?.length ? ' · ' + it.notes.join(' · ') : ''}`);
  if (extra.length) console.log('  요청 외 새 이미지: ' + extra.join(', '));
  const got = A.items.filter(i => i.status === 'ok').length;
  console.log(`→ ${got}/${A.items.length} 받음. 새 이미지만 확인하려면 sheet 를 다시 실행.`);
} else die('사용법: assets.mjs sheet|request|check <프로젝트>');

function ratio(s) { const [w, h] = s.split('x').map(Number); const g = (a, b) => b ? g(b, a % b) : a, d = g(w, h); return `${w / d}:${h / d}`; }
