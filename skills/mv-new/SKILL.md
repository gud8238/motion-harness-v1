---
name: mv-new
description: 지금 연 폴더(또는 그 아래 폴더)를 모션그래픽 영상 프로젝트로 준비한다 — 미리 넣어 둔 ref/(레퍼런스 mp4)·source/(이미지) 를 확인하고, 빠진 폴더·brief.md·scene(HyperFrames)을 만들고, 화면 비율을 정하고, source/ 를 동기화한다. 이미지를 추가·교체한 뒤 다시 실행하면 동기화만 한다.
argument-hint: "[--size 16:9|9:16|1:1|4:5] 또는 [하위폴더이름] [--size …]"
---

**프로젝트 `P` 정하기** (이후 모든 도구에 이 값을 넘긴다)
- 기본은 `.` = Claude Code 로 연 폴더 자체가 프로젝트다 (예: 바탕화면의 `motion-video2/` 안에 `ref/`·`source/` 를 미리 넣어 둔 경우).
- 인자에 폴더 이름이 있을 때만 그 이름(지금 폴더 아래 하위 프로젝트). 이름에 공백이 있으면 따옴표로 감싼다.

1. `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/new.mjs" <P> [--size …]`
   - 화면 비율: 인자 → 대화(세로·쇼츠·릴스 = 9:16, 정사각 = 1:1, 인스타 피드 = 4:5) → 이미 있는 brief.md 의 "화면" 칸 순으로 정하고 `--size` 로 넘긴다. 모르면 생략(16:9).
   - "setup 을 먼저" 오류면 `/motion-harness:mv-setup` 안내 후 멈춘다. 홈·드라이브 최상위 오류면 영상 작업 폴더를 열라고 안내하고 멈춘다.
2. 출력에서 ref/·source/ 파일 목록을 확인한다.
   - ref/ 에 영상·이미지가 있으면 그것이 주 레퍼런스 후보 — brief.md "주 레퍼런스" 칸에 파일명을 적는다(여러 개면 묻지 말고 첫 파일을 주, 나머지를 보조로 적고 안내에서 한 줄로 알림).
   - 대화에 주제·문구·색·길이가 있으면 brief.md 해당 칸을 채운다. 링크/ID 레퍼런스는 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/refs.mjs" fetch <P> <ID|링크>`.
3. 짧게 안내하고 끝: 화면 크기, ref/·source/ 개수, 비어 있는 것(ref/ 가 비었으면 mp4 를 넣거나 `/motion-harness:mv-refs` 로 추천), 다음은 `/motion-harness:mv-plan` (하위 폴더 방식이면 `/motion-harness:mv-plan <P>`).
