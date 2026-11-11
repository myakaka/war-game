# HANDOFF (2026-11-11) — 대칭 전장 (가상) 시나리오 (rulesVersion 9, 작업 전 태그 `stable-before-symmetric`)

## 끝난 것과 검증
- 새 시나리오 `symmetric`(대칭 전장 (가상)): 16×16 회전 대칭, 14라운드, 러시아군(위·AI) 선공, 우크라이나군(아래·플레이어). 고정 배치, 증원 4·8라운드, `fires`는 호스토멜과 같은 값, 행동 한도 5/5.
- 검증: `check.js` 춘천 7·호스토멜 7 항목 모두 SAME(새 시나리오 7 항목은 새로 추가). `test.js` 64 통과, 0 실패, 6 건너뜀(본부·거점 승리 조건 없음 등 해당 없음). 대칭 시나리오 테스트 7개 추가.
- 화면(헤드리스 Edge): 리치 노란 4칸 윤곽 + 깃발 1개, 기본 테마 굵은 점선(안개 위 층), 휴대폰 세로 `거점 0/3`, 위쪽 진영 180도, 무승부 화면, 2인 대전 가림막(DOM 유닛 0), 시야 밖 적 DOM 0.
- 박격포 이동/사격 겹침 칸(최소 사거리 2 = 이동 2칸, 안개 속 칸 포함): 이동 채움 + 사격 점선, 누르면 `이동(M) / 사격(F) / 취소(Esc)` 창(`ui.dualSet`, `showMoveFireChoice`). 터치는 첫 탭 배지, 두 번째 탭 창.
- 기존 버그 수정: 2인 대전에서 첫 `준비 완료`가 `hideOverlay`의 `$('#board-wrap')`(가림막 중 문서에서 떨어져 null) 때문에 멈추던 문제(a390101부터, 모든 시나리오). 보관한 `boardWrapEl` 참조로 바꿈.

## 주요 변경 위치
- `js/scenarios/symmetric.js`(새 파일), `index.html` script 한 줄.
- `js/engine.js`: `objectiveAt`(칸→거점 지도 `OBJ_CELL_ID`), `objectiveCells`, `updateObjectiveControl`(presence, 이벤트 `captured`/`objectiveLost`), `roundLimitResult`(winner `'draw'`), `scenarioTurnOrder`(firstMover), `startActivations`(후공 보너스), `symmetryErrors`, `aiNeutralGoals`, `buildAiContext.neutral`, `simulateGames`의 `res.draws`·`res.sym`(대칭 시나리오만), `diagnoseSymmetric`·`SYMMETRIC_COMBOS`.
- `js/ai-config.js` `AI_CONFIG.SYMMETRIC`(HOLD 14, APPROACH_GROWTH 0.1, GROWTH_START 4). `js/rules.js` 버전 9와 스키마 주석.
- `js/ui.js`: `objGroupSvg`(DESIGN.objGroup), 묶음 거점 표식 1개, HUD `hud.goalSym`, 무승부 결과, 로그 `objectiveLost`, 규칙 화면 대칭 문구, 배치 구역 없는 시나리오는 `직접 배치` 항목 숨김.

## 확정된 결정
- 묶음 거점의 "한 칸이라도 + 상대 없음" 규칙은 기존(떠나도 소유 유지)과 달라 시나리오 값 `objectiveControl: 'presence'`로 둠. 이 시나리오는 한 칸 거점도 presence. 춘천·호스토멜은 기존 그대로.
- (v9, 사용자 요청) 대칭 전장은 거점으로 중간에 끝나지 않음: 승리 = 전멸 또는 14라운드 종료 시 거점 수 → 체력 → 무승부.
- 라운드 제한 체력 합에는 도착 대기 유닛을 최대 체력으로 셈. 양쪽 동시 전멸은 무승부.
- 거점 점유 이벤트 위치는 거점 기준 칸(묶음 안 어느 칸인지 드러내지 않음). 도심 그림 오프셋 [4.8, 4.8]: 거울 축(5.6, 10.8)이 마을 밖.

## 알려진 문제
- 거점 소유는 공개 정보라, presence 방식에서는 시야 밖 적이 거점에 들어오면 소유 변화(점유자 없음)로 알 수 있음(기존 공개 방침 그대로).
- 교착 판정 정의: 5라운드 이후까지 간 판 중 5라운드부터 교전(적을 겨눈 공격)이 한 번도 없던 판.

## 다음에 볼 곳
- 진단: `diagnoseSymmetric(100)`. 값(행동 한도, `secondMoverBonus`)은 사람 플레이로 결정.
