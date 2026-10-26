---
name: mv-new
description: 새 모션그래픽 영상 프로젝트 폴더(source·ref·brief.md·scene·out)를 현재 폴더에 만든다.
argument-hint: "[프로젝트이름] [--size 1080x1920]"
---

1. `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/new.mjs" $ARGUMENTS` (이름이 없으면 `모션N` 다음 번호). "setup 을 먼저" 오류면 `/motion-harness:mv-setup` 안내 후 멈춘다.
2. 대화에 이미 주제·내용·색·레퍼런스(파일, lemo/animate ID, jasonzhu.ai/X 링크)가 있으면 brief.md 해당 칸을 채우고, 링크/ID는 `node "${CLAUDE_PLUGIN_ROOT}/harness/tools/refs.mjs" fetch <이름> <ID|링크>`.
3. 짧게 안내하고 끝: source/ 에 이미지(여러 각도)·음악, ref/ 에 레퍼런스 mp4·프롬프트(없으면 brief 에 "추천해줘"), 준비되면 `/motion-harness:mv-plan <이름>`.
