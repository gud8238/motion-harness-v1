// HyperFrames 장면 관리
//   node scene.mjs add 모션1 s2 canvas --dur 4 [--start 4] --title "규칙 1" --note "스토리보드 설명" [--key 2.5]
//        종류: dom (타이포·레이아웃·UI) | canvas (절차적 그래픽·사진 합성, MH) | three (3D·턴테이블, MH3)
//        --start 를 생략하면 마지막 장면 뒤에 붙인다. 겹치게 하려면(전환) --start 를 앞당긴다.
//   node scene.mjs list 모션1                 장면 표
//   node scene.mjs set 모션1 s2 --start 3.5 --dur 5 --title ... --note ... --key ...   (호스트 속성 수정)
//   node scene.mjs remove 모션1 s2
//   node scene.mjs captions 모션1 [--y 0.88]  work/narration.timing.json → 자막 장면(captions) 생성·갱신
import fs from 'fs';
import path from 'path';
import { HARNESS, parseArgs, die, projectDir, hosts } from './_common.mjs';

const { pos, opt } = parseArgs();
const [cmd, pname, id, kind] = pos;
const proj = projectDir(pname);
const sceneDir = path.join(proj, 'scene'), idxFile = path.join(sceneDir, 'index.html');
if (!fs.existsSync(idxFile)) die('scene/index.html 이 없습니다. 먼저 new.mjs 로 프로젝트를 만드세요.');
let idx = fs.readFileSync(idxFile, 'utf8');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const W = +(idx.match(/id="root"[^>]*data-width="(\d+)"/) || [])[1] || 1920, H = +(idx.match(/id="root"[^>]*data-height="(\d+)"/) || [])[1] || 1080;

const fmt = n => +(+n).toFixed(3);
function setRootDuration() {
  const hs = hosts(idx); const end = Math.max(0, ...hs.map(h => h.start + h.dur));
  idx = idx.replace(/(id="root"[^>]*data-duration=")[^"]*(")/, `$1${fmt(end)}$2`);
  idx = idx.replace(/(<audio id="mh-mix"[^>]*data-duration=")[^"]*(")/, `$1${fmt(end)}$2`);
}
function hostTag(h) {
  return `<div id="${h.id}" data-composition-id="${h.id}" data-composition-src="compositions/${h.id}.html" data-start="${fmt(h.start)}" data-duration="${fmt(h.dur)}" data-track-index="${h.track === 'captions' ? 3 : 1}" data-track-kind="${h.track || 'graphics'}" data-width="${W}" data-height="${H}" data-mh-kind="${esc(h.kind)}" data-mh-title="${esc(h.title)}" data-mh-note="${esc(h.note)}"${h.key != null && h.key !== '' ? ` data-mh-key="${fmt(h.key)}"` : ''}></div>`;
}
const save = () => { setRootDuration(); fs.writeFileSync(idxFile, idx); };

if (cmd === 'add') {
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) die('장면 id 는 영문 소문자로 시작 (예: s1, intro, turn-3d)');
  if (!['dom', 'canvas', 'three'].includes(kind)) die('종류: dom | canvas | three');
  if (hosts(idx).some(h => h.id === id)) die(`이미 있는 장면: ${id}`);
  const dur = +(opt.dur || 4), last = hosts(idx).filter(h => h.track !== 'captions').reduce((m, h) => Math.max(m, h.start + h.dur), 0);
  const start = opt.start != null ? +opt.start : last;
  let tpl = fs.readFileSync(path.join(HARNESS, 'template', 'scene', 'compositions', `_${kind}.html`), 'utf8');
  tpl = tpl.replaceAll('__ID__', id).replaceAll('__DUR__', String(dur)).replaceAll('__W__', String(W)).replaceAll('__H__', String(H));
  fs.writeFileSync(path.join(sceneDir, 'compositions', `${id}.html`), tpl);
  const tag = hostTag({ id, start, dur, kind, title: opt.title || id, note: opt.note || '', key: opt.key });
  idx = idx.replace('<!-- mh:scenes -->', `${tag}\n      <!-- mh:scenes -->`);
  save();
  console.log(`✔ ${id} (${kind}) ${fmt(start)}–${fmt(start + dur)}s → scene/compositions/${id}.html`);
} else if (cmd === 'set') {
  const h = hosts(idx).find(x => x.id === id); if (!h) die('장면 없음: ' + id);
  const n = { ...h, start: opt.start != null ? +opt.start : h.start, dur: opt.dur != null ? +opt.dur : h.dur, title: opt.title ?? h.title, note: opt.note ?? h.note, key: opt.key ?? h.key };
  idx = idx.replace(h.tag, hostTag(n));
  if (opt.dur != null) { const f = path.join(sceneDir, 'compositions', `${id}.html`); if (fs.existsSync(f)) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/const ([^;]*?)DUR = [\d.]+/, `const $1DUR = ${n.dur}`)); }
  save(); console.log(`✔ ${id} ${fmt(n.start)}–${fmt(n.start + n.dur)}s`);
} else if (cmd === 'remove') {
  const h = hosts(idx).find(x => x.id === id); if (!h) die('장면 없음: ' + id);
  idx = idx.replace(h.tag + '\n      ', '').replace(h.tag, ''); save();
  const f = path.join(sceneDir, 'compositions', `${id}.html`); if (fs.existsSync(f)) fs.rmSync(f);
  console.log('✔ 삭제: ' + id);
} else if (cmd === 'list') {
  const hs = hosts(idx).sort((a, b) => a.start - b.start);
  console.log(`# 장면 (${W}×${H}, 총 ${fmt(Math.max(0, ...hs.map(h => h.start + h.dur)))}s)`);
  for (const h of hs) console.log(`${h.id.padEnd(10)} ${String(h.kind || h.track).padEnd(8)} ${fmt(h.start)}–${fmt(h.start + h.dur)}s  ${h.title}${h.note ? ' — ' + h.note : ''}`);
} else if (cmd === 'captions') {
  const nt = JSON.parse(fs.readFileSync(path.join(proj, 'work', 'narration.timing.json'), 'utf8'));
  const total = Math.max(...hosts(idx).map(h => h.start + h.dur), nt.total || 0);
  const y = +(opt.y || 0.88), size = Math.round(H * 0.042);
  const clips = nt.lines.map((l, i) => `    <div id="cap-${i + 1}" class="clip cap" data-start="${fmt(l.t0)}" data-duration="${fmt(Math.max(1.5, l.t1 - l.t0 + 0.4))}" data-track-index="1"><span>${esc(l.sub ?? l.text)}</span></div>`).join('\n');
  const html = `<template>
  <!-- 자동 생성: work/narration.timing.json → 자막. 스타일은 DNA 를 따르도록 아래 CSS 만 고친다 -->
  <style>
    @font-face { font-family: "Pretendard"; src: url("assets/fonts/PretendardVariable.woff2") format("woff2"); font-weight: 45 920; font-display: block; }
    #captions { position: absolute; inset: 0; pointer-events: none; }
    #captions .cap { position: absolute; left: 0; right: 0; top: ${Math.round(H * y - size)}px; text-align: center; }
    #captions .cap span { display: inline-block; max-width: ${Math.round(W * 0.8)}px; padding: ${Math.round(size * 0.25)}px ${Math.round(size * 0.6)}px; border-radius: ${Math.round(size * 0.3)}px;
      background: rgba(0,0,0,.55); color: #fff; font: 600 ${size}px/1.35 "Pretendard", sans-serif; }
  </style>
  <div id="captions" data-composition-id="captions" data-width="${W}" data-height="${H}">
${clips}
  </div>
  <script>
    (function () {
      const tl = gsap.timeline({ paused: true });
      document.querySelectorAll("#captions .cap span").forEach((el, i) => {
        const c = el.parentElement, t0 = +c.dataset.start;
        tl.fromTo(el, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.18, ease: "power2.out" }, t0);
      });
      window.__timelines["captions"] = tl;
    })();
  </script>
</template>
`;
  fs.writeFileSync(path.join(sceneDir, 'compositions', 'captions.html'), html);
  const old = hosts(idx).find(h => h.id === 'captions');
  const tag = hostTag({ id: 'captions', start: 0, dur: total, kind: 'captions', track: 'captions', title: '자막', note: '' }).replace('data-track-index="3"', 'data-track-index="3" style="z-index:50"');
  idx = old ? idx.replace(old.tag, tag) : idx.replace('<!-- mh:scenes -->', `${tag}\n      <!-- mh:scenes -->`);
  save(); console.log(`✔ 자막 ${nt.lines.length}줄 → scene/compositions/captions.html`);
} else die('사용법은 파일 맨 위 주석 참고: add | set | remove | list | captions');
