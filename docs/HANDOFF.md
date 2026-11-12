# HANDOFF (2026-11-12) — 튜토리얼과 규칙 화면 (규칙 변화 없음, 작업 전 태그 `stable-before-tutorial`)

## 끝난 것과 검증
- 규칙 화면: 접고 펴는 9개 항목(목적·이동·명중·지형·안개·병종·거점·간접 화력·용어), 수치는 규칙·시나리오 데이터에서. 시작 화면 '규칙 보기', 게임 중 설정 '규칙', 튜토리얼·연습 판 HUD '?'. 가림막 중에는 열리지 않음. 좁은 화면은 전체 화면 시트(닫기 44px, 글자 14px 이상).
- 튜토리얼 8단계(코치 창: 진행 점, n/8, 이전·다시 해 보기·다음·종료) → 연습 판(일반 규칙, 중립 AI 쉬움, 기록에 넣지 않음). 처음 실행 때 한 번 '튜토리얼을 해 볼까요?'. 저장(localStorage)이 막혀도 동작.
- 검증: `check.js` 춘천·호스토멜·대칭 21항목 SAME, `test.js` 통과(튜토리얼 테스트 7개). 브라우저: 360×640·390×844·412×915·1280에서 8단계·연습 판·규칙 화면, 기본·리치 테마, 가림막 차단, 저장 차단 모드.

## 주요 변경 위치
- `js/scenarios/tutorial.js`(새): `tutorial`(tutorialSteps 포함)·`tutorialPractice`, 둘 다 `hidden`.
- `js/tutorial.js`(새, engine·ai-intel 다음): `tutorialState`, `tutorialAllows`, `tutorialRecord`, `tutorialProgress`, `tutorialHighlight`, `tutorialEndTurn`, `tutorialParams`.
- `js/ui.js`: `ruleSectionHtml`·`showRules(back, kind)`·`openRulesInGame`, 튜토리얼 화면(`startTutorial`, `loadTutStep`, `renderCoach`, `renderTutMarks`, `tutOk`/`tutBlocked`/`tutRecord`, `startPractice`, `tutCleanup`, `showTutAsk`). 입력 관문은 onCellClick·확인 창·턴 종료·행동 종료.
- `js/engine.js`: `listScenarios`가 hidden 제외, `loadScenario`에서 `intelClearCaches()`(지도 크기가 다른 시나리오로 바꿀 때 AI 캐시 섞임 방지, 값은 같음). `tools/check.js`는 hidden 제외.

## 확정된 결정
- 튜토리얼 '안개 끔'은 만들지 않음(규칙 분기 금지). 대신 단계 배치로 보일 것만 보이게 함.
- 시드: 2단계 빗나감(2), 6단계 명중(6), 8단계 아군 파편 + 적 포병 빗나감(9). 단계 목표는 행동 기준.
- 원래 시나리오·모드는 기억했다가 종료할 때 되돌림(저장된 시나리오 선택은 바꾸지 않음).

## 알려진 문제
- 360×640에서 코치 창·카드·조작 줄 때문에 8×8 지도 칸이 약 18px로 작음(가리지는 않음).
- 엔진 `resolveAttack`의 '불가능한 공격' 오류 메시지가 변수 이름 겹침으로 다른 오류(TDZ)로 나옴(오류 경로만, 결과 영향 없음). 튜토리얼은 미리 검사해서 부르지 않음.

## 다음에 볼 곳
- 문구: `STRINGS` `tut.*`, `rules.*`. 단계 배치·시드: `js/scenarios/tutorial.js`.
