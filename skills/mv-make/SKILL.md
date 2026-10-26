---
name: mv-make
description: 계획·검토가 끝난 모션그래픽 프로젝트를 렌더·검수해 납품한다. 수정 요청도 처리한다.
argument-hint: "[프로젝트이름] [수정 요청]"
disable-model-invocation: true
---

기준 `${CLAUDE_PLUGIN_ROOT}/harness/GUIDE.md` (2. 순서 7~8, 6. 사운드, 8. 검수)
1. `<P>/work/PLAN.md` 와 `scene/compositions/` 가 없으면 `/motion-harness:mv-plan` 이 먼저라고 알리고 멈춘다.
2. 수정 요청이 있으면 그 부분만 고친다. 처음이면 `work/sound.json` 을 PLAN 의 효과음 열로 작성(내레이션이 있으면 tts→`scene.mjs captions`).
3. `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/make.mjs" <P>` (오래 걸리면 timeout 600000). 검사 오류가 나오면 고쳐서 재실행.
4. `work/qc.jpg` 한 장과 리포트를 보고, 문제가 있으면 **한 번** 고쳐 재실행.
5. 납품 메시지(짧게): `out/<P>.mp4` 경로, 길이·해상도, 반영한 DNA 한 줄, LUFS·문제 구간, 직접 들어볼 것, 약점 1개. 편집을 더 하고 싶으면 `npx hyperframes preview`(scene 폴더)로 HyperFrames 미리보기·편집기를 열 수 있다고 한 줄.
