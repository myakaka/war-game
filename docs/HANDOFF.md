# HANDOFF (2026-11-10) — 휴대폰 세로 UI: 하단 조작 줄 + 공격 확인 시트 (규칙 변경 없음, rulesVersion 6 유지)

## 끝난 것과 검증
- 이전: 행동 제한(v6) → PC 리치 테마 → 공격 방향 전환 → GitHub https://github.com/myakaka/war-game + Pages https://myakaka.github.io/war-game/ (`git push` 후 1~2분 반영, 원격은 `myakaka@` 계정 지정).
- 이번(좁은 화면 `#app.narrow` 전용): 한 화면 고정(100dvh, 스크롤 없음), 하단 조작 줄(왼쪽 로그·범례·설정, 오른쪽 턴 종료 52px·폭 50%+), 턴 종료 재확인(3초), 공격 확인 하단 시트(최대 40dvh, 버튼 고정, `자세히`에 기존 창 내용 전부).
- 원인 수정: 시작 화면에서 숨겨진 `#controls` 높이 0 을 `--abar-h` 에 써서 굳어, 게임 중 턴 종료 버튼이 화면 밖으로 잘리던 문제. 이제 `--abar-h` 는 CSS 고정값(72px), 조작 줄 위 끝은 카드 바로 아래(8px)에 붙고 남는 높이는 줄 배경으로 채움(JS `--abar-free`, `ResizeObserver` 로 다시 맞춤). 최소 바닥 여백 `--abar-lift` 25px(삼성 하단 버튼). 공격 시트는 올리기 전 위치(`--abar-min`) 위에 뜸.
- 검증: `node tools/check.js` 14개 모두 SAME, `node tools/test.js` 36 통과·0 실패. 헤드리스 Edge(CDP, 테스트 서버가 ui.js 끝에 `window.__T` 를 붙여 상태 조작) 360x640·390x844·412x915: 스크롤 0, 턴 종료 52px 고정 위치, 첫 누름 확인·3초 복귀·두 번 종료, 시트 버튼 항상 보임·바깥 탭에 안 닫힘, 펼쳐도 40%·내용만 스크롤, 아래쪽 행 공격 시 지도 위로 밀림, 시야 밖 대상 이름 노출 0. PC 1280: 주요 요소 위치·크기·확인 창 HTML 이전과 동일, 턴 종료 한 번에 종료.

## 주요 변경 위치
- `js/ui.js`: `DESIGN.endArmMs`, `DESIGN.atkSheet`(명중 단계 표시 경계 60/40, 칩 4, 여백), `endNeedsConfirm`·`armEnd`·`disarmEnd`(renderControls·onEndTurn), `showAttackSheet`·`keepUnitsAboveSheet`, `OVERLAY_KINDS` 에 `sheet`, fitLayout 의 `--abar-h` 쓰기 제거.
- `css/style.css`: 맨 끝 "좁은 화면(휴대폰 세로)" 절, `#overlay.sheet`, `.atk-sheet`. `js/strings.js`: `sheet.*`, `btn.endTurnArm`.
- 리치 테마 위치: `js/rich-map.js`(`K`), 시나리오 `art`, ui.js `DESIGN.rich`·`applyTheme`·`turnUnit` 등.

## 확정된 결정
- 재확인은 좁은 화면에서만, 행동 제한이 켜져 있고 남은 행동 > 0 이고 아직 행동할 수 있는 유닛이 있을 때만. PC·휴대폰 가로(compact)는 그대로.
- 시트 칩: 0 인 보정 제외, 큰 값부터, 포격 오폭 경고는 '아군 피해' 칩. 4개를 넘으면 3개 + `+n개`. 시야 밖이면 시야 밖·이동 후 공격 칩만(기존 창과 같은 범위).
- 시트가 열리면 지도 영역 탭은 무시(오버레이가 받음), 닫기는 취소·Esc. 이동 확인 창은 원래 없음.
- 리치: 기본값은 너비 900px + 마우스면 리치, 휴대폰은 설정에서 선택(`RICH_ON_PHONE`).

## 알려진 문제
- 직접 배치 화면(360x640): 트레이를 38dvh 안에서 스크롤하게 해서 지도 칸이 12px 로 작음(이전에는 페이지 스크롤 + 10px).
- 실제 기기(iOS 홈 바, 주소창 변화)는 아직 안 봄. `dist/index.html` 단독은 그림 없음. 휴대폰 리치 배지 작음.

## 다음에 볼 곳
- 실기기 확인 뒤 `--abar-h`, `--sheet-atk`, `DESIGN.atkSheet` 조정. 행동 한도: 시나리오 `activations`.
