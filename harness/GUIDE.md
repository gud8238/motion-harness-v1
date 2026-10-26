# motion-harness 가이드 (이 한 파일이 기준)

레퍼런스 영상의 스타일을 **빠짐없이, 가볍게** 옮겨 사용자 이미지·주제로 짧은 모션그래픽(15~40초)을 만든다.
렌더 엔진은 HyperFrames(HTML→MP4), 장면은 DOM/GSAP · 캔버스(MH) · three.js(MH3) 중에서 고른다.
도구는 `node "<플러그인>/harness/tools/<도구>.mjs" …` (스킬에 적힌 전체 경로를 쓴다. 아래에서 `$T` 로 줄여 씀). 프로젝트 `P` 는 현재 작업 폴더 아래.

## 1. 가볍게 — 지킬 것
- **읽는 것**: brief.md, 레퍼런스마다 `analysis.md` + `card.png` **한 장**, 소스 이미지(장당 1회). 라이브러리 스타일이면 그 STYLE.md 의 1~6절만. 다른 문서는 막혔을 때만.
- **쓰는 것**: `work/PLAN.md` **하나** (DNA 표 + 시그니처 + 장면 표). 설명 문장은 최소.
- **보는 것**: 스토리보드 1장, 검수 시트 1장. 움직임이 의심될 때만 strip.
- **하지 않는 것**: 구조안 여러 개 비교, 별도 모델시트, 2회 이상의 수정 라운드, 대조표(compare)는 요청·의심 시만, HyperFrames 스킬의 자체 절차(스토리라인 3개·SPEC.md·REVIEW.md).
- 질문은 처음 **한 번**(AskUserQuestion, 추천안 먼저). 브리프로 답이 되면 묻지 않는다.

## 2. 순서
1. **입력**: `brief.md`, `source/`(이미지 직접 보기), `ref/`. 링크·ID는 `refs.mjs fetch P <ID|링크>`. 레퍼런스가 없거나 "추천" → `/mv-refs`.
2. **측정**: `analyze-ref.mjs P ref/<파일>` → `work/ref-*/analysis.md` + `card.png` 보기.
3. **계획** `work/PLAN.md` (아래 틀). 내레이션이 있으면 먼저 `work/narration.json` → `tts.mjs P` (시각이 장면 길이를 정함).
4. **장면**: `scene.mjs add P <id> <dom|canvas|three> --dur 초 --title … --note …` 로 만들고 `scene/compositions/<id>.html` 을 채운다. DNA 값은 `scene/index.html` 의 `window.DNA` 와 CSS 변수에 한 번만 쓴다.
5. **스토리보드**: `board.mjs P` → `work/storyboard.png` 보고 한 번 고침.
6. **⏸ 검토 요청** (사용자가 "바로 만들어"라고 했으면 생략): DNA 표 요약(반영률) · 시그니처→장면 · 장면 표 · storyboard.png 경로 · 자신 없는 점 1개 → 승인/장면 수정/스타일 조정.
7. **제작**: `work/sound.json` 작성 → `make.mjs P` (오디오→검사→렌더→검수). `work/qc.jpg` 보고 문제가 있으면 한 번 고쳐 재실행.
8. **납품**: `out/P.mp4` 경로, 길이·해상도, 반영한 DNA 한 줄, 검수 수치(LUFS·문제 구간), 들어봐야 할 것, 약점 1개.
수정 요청은 해당 장면만 고치고 `make.mjs` 재실행.

## 3. PLAN.md 틀 (DNA + 장면) — 완성 예시: `<플러그인>/harness/example/` (PLAN.md, dom·canvas·three 장면 각 1개)
```markdown
# P 계획
주 레퍼런스: <파일/ID> · 보조: <파일 — 항목 번호만> 또는 없음
한 줄 스타일: <예: 그리드 위 모든 것이 박자에 스냅, 빨간 요소 하나만 규칙을 깬다>
| # | 항목 | 레퍼런스 (근거) | 적용값 | 판정 |
| 1 | 구도·레이아웃 | 그리드/여백/피사체 크기%/글자 위치 | | 채택·변형·제외 |
| 2 | 색 | 바탕·잉크·강조 HEX+비중, 강조색의 의미 | | |
| 3 | 질감·재질 | 노이즈 σ, 그레인 움직임/고정, 그라데이션·비네트, 평면/2.5D/3D, 선·그림자 | | |
| 4 | 타이포 | 서체 계열·굵기·크기(화면높이%)·자간·등장 방식 | | |
| 5 | 모션 | 주 이징(스냅/스프링/선형, 오버슈트), 1s/2s, 등장·퇴장 | | |
| 6 | 리듬 | BPM, 평균 샷, 홀드 비율, 가속·감속 | | |
| 7 | 전환 | 컷/와이프/푸시/모핑/원테이크 | | |
| 8 | 카메라 | 고정/푸시/팬/회전/패럴랙스/3D 궤도 | | |
| 9 | 정보 장치 | 캡션 줄·숫자·라벨·자막 형태 | | |
| 10 | 사운드 | 음악 성격·BPM, 효과음, 무음 | | |
| 11 | 소스 처리 | — | 다시 그리기/배경제거 합성/3D 턴테이블 | — |
반영률 (채택+변형)/10 = _
시그니처: S1 <동작> → #장면 · S2 … (2~5개, 전부 배정, 가장 강한 것은 정점)
| # | 시간 | 종류 | 화면(구도·동작) | 소스 | DNA·시그니처 | 전환 | 효과음 | 문구 |
```
규칙: **주 레퍼런스 1개**(보조는 지정 항목만) · 근거는 측정값(추정은 "(추정)") · 이유 없는 제외 금지 · **반영률 ≥ 8/10** · 시그니처 전부 사용 · 이야기·장면 구성·캐릭터·음악은 레퍼런스에서 가져오지 않는다(문법만).
**사용자가 색·배경을 지정하면 그것이 우선** (2·3번을 '변형 — 사용자 지정'으로).
질감은 측정값을 그대로: 노이즈 σ≥1 이면 `MH.grain`(움직이면 rate 12~24, 고정이면 rate 0) 또는 `MH.paper`, 그라데이션은 `MH.gradient`(방향·밝기차), 비네트는 `MH.vignette`.

## 4. 장면 엔진
**종류 고르기** — DNA를 가장 적은 코드로 재현하는 쪽:
- `dom` : 타이포·레이아웃·카드·UI 모션, 키네틱 타이포. GSAP `fromTo` + `ease: "dna"`.
- `canvas` : 그리드·선 드로잉·하프톤·픽셀·종이/그레인 질감·데이터, 사진 배경제거 합성. `MH.drive(tl, DUR, draw)`.
- `three` : 여러 각도 사진 턴테이블, 공간 속 사진 카드, 깊이 있는 카메라 이동, 파티클. `MH3`.
- 이름 붙은 효과(전환·타이틀·자막 스타일·차트·3D 배경)는 먼저 레지스트리: `npx hyperframes catalog --query "<영어>" --json` → `npx hyperframes add <이름> --json` (scene 폴더에서). 가져온 블록의 색·폰트는 DNA로 바꾼다.

**HyperFrames 필수 규칙**: 장면 파일은 `<template>` 안에 style·markup·script / 루트 id = 호스트 id = 타임라인 키 / 타임라인 `gsap.timeline({paused:true})` 를 만들고 마지막에 `window.__timelines["id"]=tl` / `from` 대신 `fromTo`, 시간은 절대 초 / `Date.now`·`Math.random`·타이머·`repeat:-1`·네트워크 금지 / 같은 요소를 GSAP과 CSS transform 으로 동시에 움직이지 않음 / 경로는 `assets/…` / 한글 글자를 쓰는 장면은 Pretendard `@font-face` 포함(템플릿에 있음) / 비동기 로드는 `window.__hf.buildReady[key]=promise`.
**장면 전환**: 다음 장면 `--start` 를 앞당겨 겹치고(z-index 위) 들어오는 장면에서 와이프·푸시를 GSAP/캔버스로, 또는 레지스트리 전환 블록. 전환 중 빈 화면 금지.

**MH (캔버스, window.MH)** — `t` 는 장면 로컬 초, draw(t) 는 순수 함수
- 시간: `tween(t,t0,d,ease)` 0→1 · `kf(t,[[t,v,ease],…])` 키프레임(숫자/배열) · `springAt(t,t0,a,b,SPRING.snappy|smooth|heavy|playful)` · `seg(t,a,b)` · `quant(t,12)` 2s 느낌 · `breathe(t,amp,hz)` · `DNA.B(n)` n박→초
- 이징: `E.out/in/inOut/expoOut/back/smooth/snap` · `E.bez(x1,y1,x2,y2)` · `DNA.easeFn`
- 그리기: `MH.clear(ctx,색)` · `rr/circle/line(ctx,pts,{w,color,p})`(p=그려진 비율) · `txt(ctx,글,x,y,{size,weight,color,align,tracking,maxW})` · `txtIn(ctx,글,x,y,p,{mode:'rise'|'chars'|'words'|'type'|'clip'})` · `img(ctx,이름,cx,cy,w,h,{fit,r,rot,alpha})`(중심 기준) · `withCam(ctx,{x,y,z,r},fn)`
- 질감: `gradient(ctx,{stops,angle|type:'radial'})` · `paper(ctx,{amount,fiber,scale})` · `grain(ctx,t,{amount,rate})` · `vignette(ctx,W,H,a)`
- 사진: `MH.load({이름:{src:'assets/source/x.jpg',cutout:true,tol:20}})`(단색 배경 플러드필 제거) · 전환 `MH.trans(ctx,'wipe'|'push'|'iris'|'zoom'|'blinds'|'flash',A,B,p,{dir,bar})` + `MH.layer(W,H)`
- 결정적 난수: `rng(seed)` `hash(n,m)` `noise(x)` `noise2(x,y)` `boil(t,key,amp)`

**MH3 (three.js r159, window.MH3)** — draw(t)마다 오브젝트·카메라를 t로 정하고 `s.render()`
- `s=MH3.stage(canvasId,{bg,fov,exposure,fog,shadows})` · `MH3.lights(scene,{key,rim,keyI,rimI})` · `MH3.contactShadow(scene,{r,opacity})` · `MH3.floor(scene,{color})`
- `MH3.turntable([{img,angle},…],{h})` → `.set(각도)` : 여러 각도 사진을 교차시켜 도는 것처럼(±90° 범위, 배경 제거 이미지)
- `MH3.photoCard(img,{h,margin,color})` · `MH3.textPlane(글,{size,weight,color,height})` · `MH3.orbit(camera,{target,radius,height,angle,fov})` · `MH3.points(n,seed,{spread,size,color})` · `MH3.tex(이미지)`

## 5. 소스 이미지
- 여러 각도 사진 = 같은 대상의 일관성. 3D 턴테이블, 장면마다 각도 바꾸기, 나란히 소개.
- 배경 제거: 단색 배경 제품·사물 → `cutout:true` (tol 조절). 사람 사진 → `npx hyperframes remove-background source/x.jpg -o scene/assets/source/x.png` (인물 전용 모델 — 사물에는 쓰지 않는다).
- 사진은 스타일 안의 프레임(종이 카드·그리드 칸·인쇄판·3D 공간)에 넣는다. "다시 그리기"는 특징 3개 이상(색 배치·실루엣·부품)을 유지.
- 사용 권리가 없으면 가상 대체물. 학생 얼굴 등은 브리프 지시를 따른다.

## 6. 사운드
`work/sound.json`: `{"bed":"pulse|ambient|none","bpm":120,"key":"A","minor":true,"gain":-6,"music":"source/곡.mp3","events":[[전역초,"종류",dB]]}`
효과음: whoosh swoosh pop click tick snap thump impact riser chime ding type glitch sparkle paper. 보이는 동작마다 하나, 정점 직전 0.5~2초 정적 → 정점에 가장 큰 소리.
내레이션(한국어 edge-tts: ko-KR-SunHiNeural 여 / ko-KR-InJoonNeural 남, 또는 녹음 파일) → `tts.mjs P` → `scene.mjs captions P` (자막 장면 자동) → 음악 자동 덕킹. 직접 녹음의 대본이 없으면 `npx hyperframes transcribe`.
Claude 는 소리를 들을 수 없다 → LUFS·이벤트 수만 보고하고 들어보라고 한다.

## 7. 연출 최소 기준
처음 3초 안에 훅 · 2~4초마다 새로운 것 + 한 번의 홀드 · 끝은 처음의 변형 · 강조색은 한 가지 의미 · 중요한 것 ≥100px, 글자 ≥28px(1080 기준, DNA가 더 작으면 장식용만) · 글자 유지 시간 ≥ (글자수÷7+1.2)초 · 금지 기본값: 그라데이션 위 가운데 제목, 전부 페이드인, 의미 없는 파티클, 로고만 나오는 엔딩.

## 8. 검수 (make.mjs 결과)
검사 오류 0 · 검은 화면/내용 없는 구간이 의도된 것인지 · LUFS −14±2 · qc.jpg: 피사체가 작거나 잘림, 글자가 피사체를 가림, 같은 색 위 같은 색 · 시그니처 무브가 실제로 보이는가. 한 번 고치고, 남은 큰 문제는 납품 메시지에 적는다.

## 9. 저작권
레퍼런스는 문법만. jasonzhu.ai/X 작품은 제작자 소유(허락 없음). lemo 데모 CC BY 4.0, animate MIT, Pretendard OFL. 사용자 사진·음악은 권리가 있을 때만 그대로 쓴다.
