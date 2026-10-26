---
name: mv-setup
description: motion-harness 설치·업데이트 (Node 패키지, HyperFrames, 레퍼런스 라이브러리, 한글 폰트). 처음 한 번, 또는 도구가 "setup 을 먼저 실행"이라고 할 때.
disable-model-invocation: true
---

`node "${CLAUDE_PLUGIN_ROOT}/harness/tools/setup.mjs" $ARGUMENTS` 를 실행한다 (업데이트는 `--update`).
5~10분 걸릴 수 있으니 timeout 을 넉넉히(600000) 준다. 실패한 항목이 있으면 그 줄의 설치 명령(Node 22+, ffmpeg, git)을 사용자에게 그대로 알려주고 멈춘다.
끝나면 한 줄로: 설치 위치(~/.motion-harness), 다음은 `/motion-harness:mv-new 모션1`.
