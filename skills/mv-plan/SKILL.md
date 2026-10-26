---
name: mv-plan
description: 레퍼런스 영상(mp4·프롬프트·라이브러리 스타일)과 이미지로 모션그래픽 영상을 만들 때의 계획 단계 — 레퍼런스 측정, 스타일 DNA, 장면 코드, 스토리보드까지 하고 검토를 요청한다. "모션그래픽 만들어줘", "이 레퍼런스처럼 영상 만들어줘" 같은 요청에 사용.
argument-hint: "[프로젝트이름] [바로 만들어]"
---

기준 문서 `${CLAUDE_PLUGIN_ROOT}/harness/GUIDE.md` (이 대화에서 아직 안 읽었으면 한 번 읽는다)
GUIDE 의 **2. 순서 1~6** 을 수행한다 (2.5 소스 점검 포함). 프로젝트 폴더나 그 안의 `scene/` 이 없으면 먼저 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/new.mjs" <P>`.
- 가볍게: 레퍼런스는 `analysis.md` + `card.png`, 소스는 `sources.png`(`assets.mjs sheet`) 한 장씩. PLAN.md 하나, 스토리보드 1장. 질문은 처음 한 번.
- **소스 점검 (2.5)**: 레퍼런스 요소와 소스를 맞춰 보고, 코드로는 레퍼런스 느낌을 살리기 어려운 이미지만 `work/assets.json` → `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/assets.mjs" request <P>` → `work/ASSETS.md`. 채팅에는 표(파일 이름·역할·장면·필수)와 ASSETS.md 경로만 보이고 AskUserQuestion(`이미지 추가 완료` / `일부만 넣고 진행` / `이미지 없이 진행`)으로 멈춘다. 답이 오면 `assets.mjs check <P>` 와 `new.mjs <P>` 후 새 이미지만 확인하고 계속. 필요한 이미지가 없으면 한 줄로 알리고 계속.
- 장면은 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/scene.mjs" add <P> <id> <dom|canvas|three> --dur … --title … --note …` → `scene/compositions/<id>.html` 작성. DNA 는 `scene/index.html` 의 `window.DNA`·CSS 변수에.
- `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/board.mjs" <P>` → storyboard.png 확인 후 한 번 고침.
- 인자나 대화에 "바로 만들어/검토 없이"가 있으면 검토를 건너뛰고 `/motion-harness:mv-make` 절차로 이어간다. 아니면 검토 요청(DNA 반영률 · 시그니처→장면 · 장면 표 · storyboard 경로 · 자신 없는 점 1개)을 보내고 멈춘다. 이 단계에서 make.mjs 는 실행하지 않는다.
