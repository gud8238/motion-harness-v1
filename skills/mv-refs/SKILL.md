---
name: mv-refs
description: 프로젝트 주제와 소스 이미지에 맞는 레퍼런스를 lemo-opuscar·animate·awesome-opus-5.5-video(jasonzhu.ai)에서 4~6개 추천하고, 영상을 재생해 볼 수 있는 페이지를 만든다.
argument-hint: "[하위폴더이름]"
---

**프로젝트 `P`**: 인자에 하위 폴더 이름이 있으면 그 이름, 없으면 `.`(Claude Code 로 연 폴더 자체). 폴더에 scene/ 이 없으면 먼저 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/new.mjs" <P>`.
1. brief.md 와 source/ 이미지를 보고 영문 키워드 3~6개(주제·분위기·매체)를 정한다.
2. `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/refs.mjs" search <키워드…> --n 12` (1~3회). 출발점: 제품 멀티뷰 → lemo:glass-product, lemo:teardown, lemo:iso-infographic, lemo:swiss-motion, animate:isometric / 교육·아동 → lemo:crayon-book, lemo:paper-popup, lemo:whiteboard, animate:cut-paper / 정보 → lemo:dataviz, animate:math / 홍보 → lemo:silkscreen-poster, lemo:risograph, lemo:dark-keynote / 키네틱 쇼릴 → `search showreel kinetic typography --src x --cat motion`.
3. 성격이 다른 4~6개로 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/refs.mjs" page <P> <ID…> --why "이유1|이유2|…"` → `<P>/work/refs.html` (파일로 열면 영상 재생). 경로를 알려주고, 후보별 "가져올 것" 한 줄씩.
4. AskUserQuestion 으로 고르게 하고(주 레퍼런스 1개 + 보조는 항목만), 고르면 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/refs.mjs" fetch <P> <ID>`. 이어서 `/motion-harness:mv-plan` 안내(하위 폴더 방식이면 `<P>` 를 붙임)(사용자가 바로 진행하라면 계속).
