// 레퍼런스 라이브러리: 검색 · 추천 페이지 · 내려받기
//   node harness/tools/refs.mjs search <영문 키워드...> [--src lemo,animate,x] [--cat motion,education] [--n 12]
//   node harness/tools/refs.mjs page 모션1 lemo:swiss-motion x:2103817034618339682 animate:riso   → 모션1/work/refs.html
//   node harness/tools/refs.mjs fetch 모션1 <ID 또는 jasonzhu.ai/x.com 링크> [--demo]          → 모션1/ref/ 로 영상·스타일·프롬프트
//   node harness/tools/refs.mjs show <ID>      (상세)
//   node harness/tools/refs.mjs catalog        (setup 이 자동 실행: library/catalog.json 생성)
// ID 형식: lemo:<slug> (lemo-opuscar 59개 스타일) · animate:<slug> (animate 7개 스타일) · x:<게시물ID> (awesome-opus-5.5-video / jasonzhu.ai 작품)
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { LIB, ROOT, parseArgs, die, projectDir, ensureDir, readJSON, writeJSON, has } from './_common.mjs';
const relLib = p => path.relative(LIB, p).split(path.sep).join('/');

const { pos, opt } = parseArgs();
const cmd = pos[0];
const CAT = path.join(LIB, 'catalog.json');
const LEMO = path.join(LIB, 'lemo'), ANIM = path.join(LIB, 'animate', 'plugins', 'animate', 'skills', 'animate'), AWE = path.join(LIB, 'awesome');
const LEMO_RAW = 'https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/main', LEMO_REL = 'https://github.com/lemomo-ai/lemo-opuscar/releases/download/films';
const XCAT = { motion: '모션그래픽·UI', product: '제품 데모·광고', education: '설명·교육', stories: '캐릭터·이야기', art3d: '3D 월드', game: '게임', production: '음악·편집', comparison: '모델 비교' };

if (cmd === 'catalog') buildCatalog();
else if (cmd === 'search') search();
else if (cmd === 'page') await page();
else if (cmd === 'fetch') await fetchRef();
else if (cmd === 'show') show();
else die('사용법: refs.mjs search | page | fetch | show | catalog  (파일 맨 위 주석 참고)');

function buildCatalog() {
  const items = [];
  const lc = readJSON(path.join(LEMO, 'styleboard', 'catalog.json'), []);
  for (const s of lc) {
    const sm = path.join(LEMO, 'styles', s.slug, 'STYLE.md');
    const head = fs.existsSync(sm) ? fs.readFileSync(sm, 'utf8').split('\n## 2.')[0].replace(/[#>*`|]/g, ' ').slice(0, 900) : '';
    items.push({ id: `lemo:${s.slug}`, src: 'lemo', title: s.en, title2: s.cn, cat: s.cat_en, desc: s.line, film: s.film, uses: s.uses || [], dur: s.dur,
      video: `${LEMO_REL}/${s.slug}.mp4`, thumb: `${LEMO_RAW}/docs/frames/${s.slug}.jpg`, page: `https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/${s.slug}/STYLE.md`,
      style: fs.existsSync(sm) ? relLib(sm) : null, text: head });
  }
  const ar = path.join(ANIM, 'styles', 'README.md');
  if (fs.existsSync(ar)) for (const m of fs.readFileSync(ar, 'utf8').matchAll(/^\| \[([\w-]+)\]\(([\w-]+)\/STYLE\.md\) \| ([^|]+)\| ([^|]+)\|/gm)) {
    const slug = m[1], sm = path.join(ANIM, 'styles', slug, 'STYLE.md');
    items.push({ id: `animate:${slug}`, src: 'animate', title: slug, cat: 'animate style', desc: m[3].trim(), motion: m[4].trim(), uses: [],
      thumb: fs.existsSync(path.join(ANIM, 'styles', slug, 'sample.png')) ? relLib(path.join(ANIM, 'styles', slug, 'sample.png')) : null,
      page: `https://github.com/cth9191/animate/blob/main/plugins/animate/skills/animate/styles/${slug}/STYLE.md`,
      style: fs.existsSync(sm) ? relLib(sm) : null, text: fs.existsSync(sm) ? fs.readFileSync(sm, 'utf8').slice(0, 900) : '' });
  }
  const aw = readJSON(path.join(AWE, 'cases.json'));
  for (const c of aw?.cases || []) {
    items.push({ id: `x:${c.id}`, src: 'x', title: c.title?.en || '', title2: c.title?.zh || '', cat: c.category, desc: (c.tools_reported || []).join(', '), dur: c.duration_seconds, views: c.views,
      prompt: c.prompt ? c.prompt.kind : null, thumb: c.thumbnail_url, page: c.prompt?.page_url || `https://jasonzhu.ai/en/prompts/claude-opus-5-5/${c.id}`, post: c.original_post_url, creator: c.creator?.handle, text: '' });
  }
  writeJSON(CAT, { built: new Date().toISOString(), count: items.length, items });
  console.log(`✔ 카탈로그 ${items.length}개 (lemo ${items.filter(i => i.src === 'lemo').length} · animate ${items.filter(i => i.src === 'animate').length} · x ${items.filter(i => i.src === 'x').length})`);
}

function loadCat() { const c = readJSON(CAT); if (!c) die('카탈로그가 없습니다. 먼저 node harness/tools/setup.mjs'); return c.items; }

function search() {
  const items = loadCat();
  const q = pos.slice(1).join(' ').toLowerCase().split(/[\s,]+/).filter(Boolean);
  const srcs = opt.src ? String(opt.src).split(',') : ['lemo', 'animate', 'x'];
  const cats = opt.cat ? String(opt.cat).split(',') : null;
  const scored = items.filter(i => srcs.includes(i.src) && (i.src !== 'x' || (cats ? cats.includes(i.cat) : !['game', 'comparison'].includes(i.cat)))).map(i => {
    const title = `${i.title} ${i.title2 || ''}`.toLowerCase(), meta = `${i.cat} ${(i.uses || []).join(' ')} ${i.film || ''}`.toLowerCase(), body = `${i.desc || ''} ${i.text || ''}`.toLowerCase();
    let s = 0;
    for (const t of q) { const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'); s += 3 * (title.match(re) || []).length + 2 * (meta.match(re) || []).length + Math.min(3, (body.match(re) || []).length); }
    if (i.src === 'x') s = s * (i.prompt === 'full' ? 1.2 : i.prompt ? 1 : 0.6) + Math.log10((i.views || 1)) / 20;
    return { i, s };
  }).filter(x => !q.length || x.s > 0.4).sort((a, b) => b.s - a.s);
  const n = +(opt.n || 12), per = Math.ceil(n / srcs.length);
  const pick = q.length ? srcs.flatMap(src => scored.filter(x => x.i.src === src).slice(0, per)) : scored.slice(0, n);
  if (!pick.length) return console.log('결과 없음 — 다른 영문 키워드로 시도 (예: grid, typography, paper, 3d, product, explainer, data, kids)');
  for (const { i, s } of pick) {
    const extra = i.src === 'x' ? `[${XCAT[i.cat] || i.cat}] ${i.dur ?? '?'}s · 조회 ${Math.round((i.views || 0) / 1000)}K · 프롬프트 ${i.prompt || '없음'}` : i.src === 'lemo' ? `[${i.cat}] 데모 ${i.dur}s · 용도: ${(i.uses || []).join(', ')}` : `[animate] ${i.motion || ''}`;
    console.log(`${i.id.padEnd(28)} ${(i.title + (i.title2 && i.src === 'lemo' ? ' / ' + i.title2 : '')).slice(0, 60)}\n   ${extra}\n   ${(i.desc || '').slice(0, 140)}  (점수 ${s.toFixed(1)})`);
  }
}

function show() {
  const it = loadCat().find(i => i.id === pos[1]); if (!it) die('ID 없음: ' + pos[1]);
  const { text, ...rest } = it; console.log(JSON.stringify(rest, null, 2));
  if (it.style) console.log('\n스타일 문서: ' + path.join(LIB, it.style));
}

async function page() {
  const proj = projectDir(pos[1]); const items = loadCat();
  const ids = pos.slice(2); if (!ids.length) die('추천할 ID를 1개 이상 주세요.');
  const reasons = opt.why ? String(opt.why).split('|') : [];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const work = ensureDir(path.join(proj, 'work'));
  const cards = ids.map((id, k) => {
    const i = items.find(x => x.id === id); if (!i) return `<div class="c"><b>${esc(id)}</b><p>카탈로그에 없음</p></div>`;
    const tp = i.thumb && !i.thumb.startsWith('http') ? path.join(LIB, i.thumb) : null;
    const thumb = !i.thumb ? '' : tp ? (fs.existsSync(tp) ? 'data:image/png;base64,' + fs.readFileSync(tp).toString('base64') : '') : i.thumb;   // 로컬 썸네일은 내장 → 파일로 열어도 보임
    const media = i.video ? `<video controls preload="none" poster="${esc(thumb)}" src="${esc(i.video)}"></video>` : thumb ? `<a href="${esc(i.page)}" target="_blank"><img src="${esc(thumb)}" loading="lazy"></a>` : '';
    const src = { lemo: 'lemo-opuscar 스타일', animate: 'animate 스타일', x: `awesome / jasonzhu.ai · ${XCAT[i.cat] || i.cat}` }[i.src];
    const links = [i.page && `<a href="${esc(i.page)}" target="_blank">${i.src === 'x' ? '영상·프롬프트 보기 (jasonzhu.ai)' : '스타일 문서'}</a>`, i.post && `<a href="${esc(i.post)}" target="_blank">원본 게시물</a>`, i.video && `<a href="${esc(i.video)}" target="_blank">mp4</a>`].filter(Boolean).join(' · ');
    return `<div class="c"><div class="m">${media}</div><div class="b"><span class="n">${k + 1}</span><b>${esc(i.title)}</b>${i.title2 && i.src === 'lemo' ? ` <small>${esc(i.title2)}</small>` : ''}<div class="s">${esc(src)}${i.dur ? ` · ${Math.round(i.dur)}초` : ''}${i.src === 'x' ? ` · 프롬프트: ${i.prompt === 'full' ? '전체 공개' : i.prompt === 'brief' ? '요약' : '없음'}` : ''}</div><p>${esc(i.desc || '')}</p>${reasons[k] ? `<p class="w">추천 이유: ${esc(reasons[k])}</p>` : ''}<div class="l">${links}</div><code>${esc(i.id)}</code></div></div>`;
  }).join('');
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${esc(path.basename(proj))} 추천 레퍼런스</title><style>
body{background:#14161a;color:#e8e8ea;font:15px/1.55 Pretendard,'Malgun Gothic','Apple SD Gothic Neo',sans-serif;margin:28px;max-width:1500px}
h1{margin:0 0 6px}.t{color:#a9adb8;margin:0 0 22px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:20px}
.c{background:#1f2228;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}.m video,.m img{width:100%;aspect-ratio:16/9;object-fit:cover;background:#000;display:block}
.b{padding:12px 16px 16px}.n{display:inline-block;background:#e85c3a;color:#fff;border-radius:6px;padding:0 8px;margin-right:8px;font-weight:700}
.s{color:#9aa0ab;font-size:13px;margin:4px 0}.w{color:#ffd28a}.l a{color:#8cc8ff}code{display:inline-block;margin-top:8px;background:#2b2f37;padding:2px 8px;border-radius:5px;color:#cfd3dc;user-select:all}
</style><h1>${esc(path.basename(proj))} — 추천 레퍼런스</h1><p class="t">영상을 재생해 보고 마음에 드는 <b>번호</b>(또는 ID)를 Claude에게 알려 주세요. 여러 개를 고르면 하나를 <b>주 레퍼런스</b>로, 나머지는 가져올 항목만 지정해 주세요 (예: "1번이 주, 3번은 전환 방식만").<br>x: 항목은 다른 사람의 작품입니다. 스타일 문법만 참고하고 장면·캐릭터·음악은 가져오지 않습니다.</p><div class="g">${cards}</div></html>`;
  const out = path.join(work, 'refs.html'); fs.writeFileSync(out, html);
  console.log('✔ ' + path.relative(ROOT, out) + `  (${ids.length}개)`);
}

// ── 내려받기 ──
function curl(url, out) {
  ensureDir(path.dirname(out));
  if (has('curl', ['--version'])) {
    const r = spawnSync('curl', ['-sSL', '--fail', '-A', 'Mozilla/5.0', '-o', out, url], { stdio: ['ignore', 'inherit', 'inherit'] });
    if (r.status === 0 && fs.existsSync(out) && fs.statSync(out).size > 0) return true;
  }
  return false;
}
async function download(url, out) {
  if (curl(url, out)) return out;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer())); return out;
}
async function getText(url) {
  const tmp = path.join(LIB, '.tmp-page.html');
  if (curl(url, tmp)) { const t = fs.readFileSync(tmp, 'utf8'); fs.rmSync(tmp); return t; }
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text();
}
export function extractJasonzhu(html) {
  let flight = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) { try { flight += JSON.parse(`"${m[1]}"`); } catch {} }
  const texts = [...flight.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].map(m => { try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; } });
  const prompt = texts.sort((a, b) => b.length - a.length)[0] || null;
  const vids = [...new Set([...(flight + html).matchAll(/https:\/\/video\.twimg\.com\/[^"'\\\s]+?\.mp4(?:\?tag=\d+)?/g)].map(m => m[0]))];
  const best = vids.sort((a, b) => { const r = u => { const m = u.match(/(\d+)x(\d+)/); return m ? +m[1] * +m[2] : 0; }; return r(b) - r(a); })[0] || null;
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
  return { prompt, video: best, title };
}

async function fetchRef() {
  const proj = projectDir(pos[1]); const refDir = ensureDir(path.join(proj, 'ref'));
  let id = pos[2]; if (!id) die('ID 또는 링크가 필요합니다.');
  const xm = id.match(/(?:jasonzhu\.ai\/.*?|x\.com\/[^/]+\/status\/|twitter\.com\/[^/]+\/status\/)(\d{15,})/); if (xm) id = 'x:' + xm[1];
  const items = readJSON(CAT)?.items || [];
  const it = items.find(i => i.id === id);
  if (id.startsWith('lemo:')) {
    const slug = id.slice(5); if (!it) die('lemo 스타일 없음: ' + slug);
    const mp4 = path.join(refDir, `lemo-${slug}.mp4`);
    if (!fs.existsSync(mp4)) { console.log('데모 영상 내려받는 중…'); await download(it.video, mp4); }
    if (it.style) fs.copyFileSync(path.join(LIB, it.style), path.join(refDir, `lemo-${slug}.STYLE.md`));
    if (opt.demo) {
      const r = spawnSync('git', ['-C', LEMO, 'sparse-checkout', 'add', `styles/${slug}/demo/`], { stdio: 'inherit' });
      console.log(r.status === 0 ? `데모 소스: ${path.join(LEMO, 'styles', slug, 'demo')} (기법 참고용, 그대로 렌더하지 않음)` : '데모 소스 내려받기 실패');
    }
    console.log(`✔ ref/lemo-${slug}.mp4 + ref/lemo-${slug}.STYLE.md  (라이선스: 데모 영상 CC BY 4.0 — LemoLab)`);
  } else if (id.startsWith('animate:')) {
    const slug = id.slice(8), d = path.join(ANIM, 'styles', slug); if (!fs.existsSync(d)) die('animate 스타일 없음: ' + slug);
    const o = ensureDir(path.join(refDir, `animate-${slug}`));
    for (const f of ['STYLE.md', 'sample.png', 'kit.js']) if (fs.existsSync(path.join(d, f))) fs.copyFileSync(path.join(d, f), path.join(o, f));
    console.log(`✔ ref/animate-${slug}/ (STYLE.md, sample.png, kit.js · MIT)`);
  } else if (id.startsWith('x:')) {
    const xid = id.slice(2), url = it?.page || `https://jasonzhu.ai/en/prompts/claude-opus-5-5/${xid}`;
    console.log('작품 페이지 읽는 중: ' + url);
    const html = await getText(url); const J = extractJasonzhu(html);
    const txt = [`# ${it?.title || J.title}`, `제작자: @${it?.creator || '?'}  ·  원본: ${it?.post || ''}  ·  페이지: ${url}`, `프롬프트 종류: ${it?.prompt || '?'}  ·  길이: ${it?.dur ?? '?'}초`, `주의: 제작자 소유 작품. 스타일 문법(색·리듬·모션)만 참고하고 장면·캐릭터·음악·로고는 가져오지 않는다. 모델 표기는 제작자 주장(미검증).`, '', '## 프롬프트 (원문)', J.prompt || '(페이지에서 프롬프트를 찾지 못함 — WebFetch 로 페이지를 직접 읽을 것)'].join('\n');
    fs.writeFileSync(path.join(refDir, `x-${xid}.prompt.txt`), txt);
    if (J.video) { const mp4 = path.join(refDir, `x-${xid}.mp4`); try { if (!fs.existsSync(mp4)) await download(J.video, mp4); console.log(`✔ ref/x-${xid}.mp4`); } catch (e) { console.log('⚠ 영상 내려받기 실패: ' + e.message + '\n  브라우저에서 페이지를 열어 직접 저장해 ref/ 에 넣어 주세요.'); } }
    else console.log('⚠ 페이지에서 영상 주소를 찾지 못했습니다. 직접 저장해 ref/ 에 넣어 주세요.');
    console.log(`✔ ref/x-${xid}.prompt.txt`);
  } else die('알 수 없는 ID 형식: ' + id + ' (lemo:, animate:, x: 또는 링크)');
}
