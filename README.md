# Motion Harness

레퍼런스 영상(mp4·프롬프트·라이브러리 스타일)과 내 이미지(여러 각도 사진)로 **레퍼런스 스타일이 빠짐없이 반영된** 짧은 모션그래픽 영상을 만드는 Claude Code 플러그인.

- **렌더 엔진**: [HyperFrames](https://github.com/heygen-com/hyperframes) (HTML → MP4, 프레임 단위 결정적 렌더)
- **장면 3종**: DOM/GSAP(타이포·레이아웃) · 캔버스(절차적 그래픽·질감·사진 합성) · **three.js**(멀티뷰 사진 3D 턴테이블·공간 연출)
- **레퍼런스 라이브러리**: [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) 59개 스타일 · [animate](https://github.com/cth9191/animate) 7개 스타일 · [awesome-opus-5.5-video](https://github.com/zhuyansen/awesome-opus-5.5-video) / [jasonzhu.ai](https://jasonzhu.ai/en/prompts/claude-opus-5-5) 2,143개 작품
- **가볍게**: 세션마다 항상 붙는 비용 약 500토큰, 레퍼런스는 측정 결과 카드 1장만 보고, 계획은 파일 1개

## 설치 (PC에서 한 번)

필요: **Node 22 이상**, **ffmpeg**, **git** (선택: 한국어 TTS용 Python + `pip install edge-tts`)

```bash
claude plugin marketplace add gud8238/motion-harness-v1
claude plugin install motion-harness@motion-harness
```
그다음 Claude Code 안에서 한 번:
```
/motion-harness:mv-setup
```
설치물(Node 패키지·레퍼런스 라이브러리·한글 폰트)은 `~/.motion-harness` 에 들어갑니다 (약 80MB + Chromium).
업데이트: `claude plugin update motion-harness@motion-harness` 후 `/motion-harness:mv-setup --update`

## 사용

영상 작업용 폴더(예: `motion_video`)에서 `claude` 실행 후:

| 명령 | 하는 일 |
|---|---|
| `/motion-harness:mv-new 모션1` | `모션1/` 생성 — `source/`(이미지·음악) `ref/`(레퍼런스) `brief.md`(주제·내용·색) |
| `/motion-harness:mv-refs 모션1` | 레퍼런스가 없을 때: 주제·이미지에 맞는 후보 4~6개를 영상 재생 페이지로 추천 |
| `/motion-harness:mv-plan 모션1` | 레퍼런스 측정 → **소스 점검**(부족한 이미지가 있으면 목록·생성 프롬프트를 주고 "이미지 추가 완료"를 기다림) → 스타일 DNA → 장면 코드 → 스토리보드 → **검토 요청** ("바로 만들어"를 붙이면 기다리지 않음) |
| `/motion-harness:mv-make 모션1` | 렌더·검수 → `모션1/out/모션1.mp4`. 수정: `/motion-harness:mv-make 모션1 2번 장면 더 빠르게` |

자연어로 "모션1 이 레퍼런스처럼 만들어줘"라고 해도 mv-plan 이 동작합니다.

## 레퍼런스 스타일을 빠짐없이 옮기는 방법

1. **측정** — `analyze-ref` 가 레퍼런스를 숫자와 카드 1장으로: 컷·평균 샷·움직임 곡선, 팔레트 HEX·강조색, **질감**(노이즈 세기, 그레인이 움직이는지/종이처럼 고정인지, 그라데이션 방향·세기, 비네트), 템포, 원본 해상도 질감 확대, 움직임 피크 연속 프레임.
2. **스타일 DNA** — 매번 같은 11개 항목(구도·색·질감·타이포·모션·리듬·전환·카메라·정보장치·사운드·소스처리)을 측정값으로 채우고 항목마다 채택/변형/제외. 반영률 8/10 미만이면 다시.
3. **소스 점검** — 레퍼런스 화면을 이루는 요소(배경·캐릭터 포즈·오브젝트·그래픽)를 내 소스와 맞춰 보고, 코드로는 느낌이 살지 않는 이미지만 `work/ASSETS.md` 로 요청 (파일 이름·규격·첨부할 레퍼런스 프레임·영문 생성 프롬프트). 다른 AI 도구로 만들어 `source/` 에 넣으면 그것으로 계획.
4. **시그니처 무브** — 그 레퍼런스다운 동작 2~5개를 모두 장면에 배정.
5. **주 레퍼런스 1개** — 여러 개를 주면 하나가 기준, 나머지는 지정한 항목만.
6. **색은 고정 아님** — 기본은 레퍼런스 팔레트, brief 의 "색 지정"에 적으면(예: 배경 남색 #1B2A4A) 그것이 우선.

## 구성

```
.claude-plugin/   plugin.json · marketplace.json
skills/           mv-setup · mv-new · mv-refs · mv-plan · mv-make
harness/
  GUIDE.md        유일한 기준 문서 (순서·DNA 틀·엔진 API·사운드·검수)
  runtime/        mh.js (캔버스 도구) · mh-three.js (three.js 도구)
  template/       HyperFrames 프로젝트 · 장면 템플릿(dom/canvas/three)
  tools/          setup · new · refs · analyze-ref · assets · scene · board · audio · tts · compare · make
  example/        완성 예시 (스위스 그리드 DNA + 로봇 멀티뷰 → 12초)
```

## 참고
- HyperFrames **커넥터(claude.ai)** 는 호스팅 편집용이라 Claude Code 에서는 영상 생성·렌더가 막혀 있습니다. 이 플러그인은 같은 엔진을 **로컬 CLI** 로 씁니다. 완성 후 직접 손보려면 `모션1/scene` 에서 `npx hyperframes preview`.
- HyperFrames 의 배경 제거(`remove-background`)는 **인물 전용 모델**입니다. 제품·사물 사진은 단색 배경에서 찍으면 내장 배경 제거가 동작합니다.
- 한국어 TTS 는 edge-tts(인터넷 필요). 직접 녹음도 가능.

## 라이선스
코드 MIT. 레퍼런스 라이브러리는 각 원저작자 라이선스(lemo-opuscar 데모 CC BY 4.0, animate MIT, awesome 목록의 작품은 각 제작자 소유 — 스타일 문법만 참고). Pretendard SIL OFL 1.1, three.js MIT, GSAP 표준 라이선스, HyperFrames Apache-2.0.
