// 영상 프로젝트 준비 (여러 번 실행해도 안전)
//   node new.mjs [--size 9:16]          → 지금 연 폴더 자체를 프로젝트로 (source/·ref/ 를 미리 넣어 둔 폴더)
//   node new.mjs 모션1 [--size 9:16]     → 지금 폴더 아래 모션1/ 을 프로젝트로 (여러 영상을 한 폴더에서 관리할 때)
//   --size: 16:9 · 9:16 · 1:1 · 4:5 또는 1080x1920. 장면을 만들기 전이면 이미 있는 프로젝트의 크기도 바꾼다.
// 이미 있는 프로젝트에 다시 실행하면: 들어 있는 파일은 건드리지 않고, 빠진 폴더만 만들고,
// 라이브러리·폰트를 최신으로 갱신하고, source/ 를 scene/assets/source/ 로 동기화한다.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ROOT, HARNESS, DATA, parseArgs, die, ensureDir, hosts } from './_common.mjs';

const { pos, opt } = parseArgs();
const arg = pos[0];
const here = !arg || arg === '.';
if (!here && /[\\/:*?"<>|#%]/.test(arg)) die('폴더 이름에 \\ / : * ? " < > | # % 는 쓸 수 없습니다.');
const dir = here ? ROOT : path.join(ROOT, arg);
const name = path.basename(dir);
if (here && (dir === os.homedir() || dir === path.parse(dir).root)) die(`지금 폴더(${dir})는 홈·드라이브 최상위라 프로젝트로 쓰지 않습니다. 바탕화면 등에 영상 작업 폴더를 만들고 그 폴더를 Claude Code 로 여세요.`);

// 크기
const ASPECT = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
let size = null;
if (opt.size && opt.size !== true) {
  const s = String(opt.size).trim();
  size = ASPECT[s] || (/^\d+x\d+$/.test(s) ? s.split('x').map(Number) : null);
  if (!size) die(`--size 는 ${Object.keys(ASPECT).join(' / ')} 또는 1080x1920 형식으로 주세요.`);
}
const applySize = (html, [W, H]) => html
  .replace(/(<meta name="viewport" content="width=)\d+(, height=)\d+/, `$1${W}$2${H}`)
  .replace(/(html, body \{ width: )\d+(px; height: )\d+(px;)/, `$1${W}$2${H}$3`)
  .replace(/(id="root"[^>]*?data-width=")\d+("[^>]*?data-height=")\d+/, `$1${W}$2${H}`);
const aspectOf = ([W, H]) => Object.entries(ASPECT).find(([, v]) => v[0] === W && v[1] === H)?.[0] || `${W}x${H}`;
const readSize = html => { const m = html.match(/id="root"[^>]*?data-width="(\d+)"[^>]*?data-height="(\d+)"/); return m ? [+m[1], +m[2]] : null; };

// 0) 설치 확인 (폴더를 만들기 전에): 하네스 런타임 + three + gsap
const NM = path.join(DATA, 'node_modules');
const libs = [
  [path.join(HARNESS, 'runtime', 'mh.js'), 'mh.js'],
  [path.join(HARNESS, 'runtime', 'mh-three.js'), 'mh-three.js'],
  [path.join(NM, 'three', 'build', 'three.min.js'), 'three.min.js'],
  [path.join(NM, 'gsap', 'dist', 'gsap.min.js'), 'gsap.min.js'],
  [path.join(NM, 'gsap', 'dist', 'CustomEase.min.js'), 'CustomEase.min.js'],
];
const missing = libs.filter(([s]) => !fs.existsSync(s));
if (missing.length) die('설치가 끝나지 않았습니다 (' + missing.map(m => m[1]).join(', ') + '). 먼저 setup 을 실행하세요 (/motion-harness:mv-setup).');
const scene = path.join(dir, 'scene'), idxFile = path.join(scene, 'index.html');
const fresh = !fs.existsSync(idxFile);
for (const d of ['source', 'ref', 'work', 'out', 'scene/compositions', 'scene/assets/lib', 'scene/assets/fonts', 'scene/assets/source', 'scene/assets/audio']) ensureDir(path.join(dir, d));

// 1) HyperFrames 프로젝트 골격 (+ 크기)
let sizeNote = '';
if (fresh) {
  const idx = fs.readFileSync(path.join(HARNESS, 'template', 'scene', 'index.html'), 'utf8');
  fs.writeFileSync(idxFile, applySize(idx, size || ASPECT['16:9']));
  fs.copyFileSync(path.join(HARNESS, 'template', 'scene', 'hyperframes.json'), path.join(scene, 'hyperframes.json'));
} else if (size) {
  const idx = fs.readFileSync(idxFile, 'utf8'), cur = readSize(idx);
  if (cur && cur[0] === size[0] && cur[1] === size[1]) { /* 같음 */ }
  else if (hosts(idx).length) sizeNote = `  ⚠ 장면이 이미 있어 크기를 바꾸지 않았습니다 (현재 ${cur?.join('x')}). 바꾸려면 장면 좌표도 함께 고쳐야 합니다.\n`;
  else {
    fs.writeFileSync(idxFile, applySize(idx, size)); sizeNote = `  · 화면 크기 변경: ${cur?.join('x')} → ${size.join('x')}\n`;
    const bf = path.join(dir, 'brief.md');
    if (fs.existsSync(bf)) fs.writeFileSync(bf, fs.readFileSync(bf, 'utf8').replace(/^- 화면: \S+/m, `- 화면: ${aspectOf(size)}`));
  }
}

// 2) 라이브러리 복사 (항상 최신으로)
for (const [s, d] of libs) fs.copyFileSync(s, path.join(scene, 'assets', 'lib', d));
const font = path.join(DATA, 'fonts', 'PretendardVariable.woff2');
if (fs.existsSync(font)) fs.copyFileSync(font, path.join(scene, 'assets', 'fonts', 'PretendardVariable.woff2'));

// 3) source/ → scene/assets/source/ (이미지·음악·녹음. 원본은 source/ 에 그대로)
let synced = 0;
const srcFiles = fs.readdirSync(path.join(dir, 'source')).filter(f => fs.statSync(path.join(dir, 'source', f)).isFile());
for (const f of srcFiles) {
  const s = path.join(dir, 'source', f), d = path.join(scene, 'assets', 'source', f);
  if (!fs.existsSync(d) || fs.statSync(d).mtimeMs < fs.statSync(s).mtimeMs) { fs.copyFileSync(s, d); synced++; }
}
const refFiles = fs.readdirSync(path.join(dir, 'ref')).filter(f => fs.statSync(path.join(dir, 'ref', f)).isFile());

// 4) 브리프
const brief = path.join(dir, 'brief.md');
const curSize = readSize(fs.readFileSync(idxFile, 'utf8')) || [1920, 1080];
if (!fs.existsSync(brief)) fs.writeFileSync(brief, `# ${name} — 브리프

> 비워 둔 칸은 Claude가 기본값으로 채웁니다. 채팅으로 말해도 됩니다.

## 주제
(한 줄)

## 전달할 내용
(핵심 메시지 3~5줄. 화면에 꼭 나올 문구가 있으면 따옴표로)

## 레퍼런스
- 주 레퍼런스: (ref/ 의 파일명, 라이브러리 ID(예: lemo:swiss-motion), jasonzhu.ai 링크, 또는 "추천해줘")
- 보조 레퍼런스(선택): (파일명 — 가져올 항목만. 예: "전환 방식만")

## 형식
- 길이: 20초        (기본 15~30초)
- 화면: ${aspectOf(curSize).padEnd(10)}(16:9 / 9:16 / 1:1 / 4:5)
- 내레이션: 없음    (없음 / 한국어 TTS 여성 / 한국어 TTS 남성 / 직접 녹음 → source/ 에 파일)
- 자막: 내레이션이 있으면 자동
- 음악: 기본        (기본 = 효과음 + 간단한 비트 / 없음 / source/ 의 음악 파일명)

## 색 지정 (선택 — 비우면 레퍼런스 팔레트를 따름)
- 배경: (예: 남색 #1B2A4A / 그라데이션 / 종이 질감 / 3D 공간)
- 강조색: (예: 학교 상징색 #F2A900)
- 글자색:

## 소스 이미지 활용
- 방식: 혼합        (스타일로 다시 그리기 / 사진 그대로(배경 제거) / 3D 턴테이블(여러 각도 사진) / 혼합)
- 사진 사용 권리: 있음
- 메모: (예: 정면 사진이 메인, 학생 얼굴은 나오지 않게)

## 꼭 넣을 것 / 피할 것
-
`);

const list = (a, n = 6) => a.length ? a.slice(0, n).join(', ') + (a.length > n ? ` 외 ${a.length - n}개` : '') : '(비어 있음)';
console.log(`${fresh ? '✔ 프로젝트 준비' : '✔ 프로젝트 갱신'}: ${here ? `지금 폴더 (${name})` : `${name}/`} · 화면 ${curSize.join('x')} (${aspectOf(curSize)})
${sizeNote}  ref/     ${refFiles.length}개 — ${list(refFiles)}
  source/  ${srcFiles.length}개 — ${list(srcFiles)}  (scene/assets/source 로 동기화 ${synced}개)
  brief.md ← 주제·내용·형식   work/ ← 분석·계획·스토리보드   scene/ ← HyperFrames 프로젝트   out/ ← 완성 영상
  프로젝트 인자: ${here ? '.' : name}`);
