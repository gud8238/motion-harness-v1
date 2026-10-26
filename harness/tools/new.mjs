// 새 영상 프로젝트 (현재 폴더 아래): node new.mjs 모션1 [--size 1080x1920]
// 이미 있는 프로젝트에 다시 실행하면: 라이브러리·폰트를 최신으로 갱신하고 source/ 를 scene/assets/source/ 로 동기화
import fs from 'fs';
import path from 'path';
import { ROOT, HARNESS, DATA, parseArgs, die, ensureDir } from './_common.mjs';

const { pos, opt } = parseArgs();
const name = pos[0];
if (!name) die('사용법: node new.mjs <프로젝트이름> [--size 1080x1920]');
if (/[\\/:*?"<>|#%]/.test(name)) die('폴더 이름에 \\ / : * ? " < > | # % 는 쓸 수 없습니다.');
const dir = path.join(ROOT, name), scene = path.join(dir, 'scene');
const fresh = !fs.existsSync(path.join(scene, 'index.html'));
for (const d of ['source', 'ref', 'work', 'out', 'scene/compositions', 'scene/assets/lib', 'scene/assets/fonts', 'scene/assets/source', 'scene/assets/audio']) ensureDir(path.join(dir, d));

// 1) HyperFrames 프로젝트 골격
if (fresh) {
  const [W, H] = String(opt.size || '1920x1080').split('x').map(Number);
  let idx = fs.readFileSync(path.join(HARNESS, 'template', 'scene', 'index.html'), 'utf8');
  idx = idx.replaceAll('1920', String(W)).replaceAll('1080', String(H));
  fs.writeFileSync(path.join(scene, 'index.html'), idx);
  fs.copyFileSync(path.join(HARNESS, 'template', 'scene', 'hyperframes.json'), path.join(scene, 'hyperframes.json'));
}

// 2) 라이브러리 (항상 최신으로): 하네스 런타임 + three + gsap
const NM = path.join(DATA, 'node_modules');
const libs = [
  [path.join(HARNESS, 'runtime', 'mh.js'), 'mh.js'],
  [path.join(HARNESS, 'runtime', 'mh-three.js'), 'mh-three.js'],
  [path.join(NM, 'three', 'build', 'three.min.js'), 'three.min.js'],
  [path.join(NM, 'gsap', 'dist', 'gsap.min.js'), 'gsap.min.js'],
  [path.join(NM, 'gsap', 'dist', 'CustomEase.min.js'), 'CustomEase.min.js'],
];
const missing = libs.filter(([s]) => !fs.existsSync(s));
if (missing.length) die('설치가 끝나지 않았습니다 (' + missing.map(m => m[1]).join(', ') + '). 먼저 setup.mjs 를 실행하세요.');
for (const [s, d] of libs) fs.copyFileSync(s, path.join(scene, 'assets', 'lib', d));
const font = path.join(DATA, 'fonts', 'PretendardVariable.woff2');
if (fs.existsSync(font)) fs.copyFileSync(font, path.join(scene, 'assets', 'fonts', 'PretendardVariable.woff2'));

// 3) source/ → scene/assets/source/ (이미지·음악·녹음. 원본은 source/ 에 그대로)
let synced = 0;
for (const f of fs.readdirSync(path.join(dir, 'source'))) {
  const s = path.join(dir, 'source', f), d = path.join(scene, 'assets', 'source', f);
  if (fs.statSync(s).isFile() && (!fs.existsSync(d) || fs.statSync(d).mtimeMs < fs.statSync(s).mtimeMs)) { fs.copyFileSync(s, d); synced++; }
}

// 4) 브리프
const brief = path.join(dir, 'brief.md');
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
- 화면: 16:9        (16:9 / 9:16 / 1:1 / 4:5)
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

console.log(`${fresh ? '✔ 새 프로젝트' : '✔ 프로젝트 갱신'}: ${name}/  (source → scene/assets/source 동기화 ${synced}개)
  source/  ← 이미지(멀티뷰 사진 등), 음악·녹음      ref/ ← 레퍼런스 mp4·이미지·프롬프트
  brief.md ← 주제·내용·형식                        work/ ← 분석·DNA·계획·스토리보드
  scene/   ← HyperFrames 프로젝트 (index.html + compositions/)      out/ ← 완성 영상`);
