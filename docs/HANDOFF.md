# HANDOFF (2026-11-12) — 대칭 전장 점수제 (rulesVersion 10, 작업 전 태그 `stable-before-score-victory`)

## 끝난 것과 검증
- 대칭 전장만: 거점을 점유한 동안 점수가 쌓이고 14라운드 끝에 총점 → 남은 체력 → 무승부. 전멸 승리는 그대로, 거점 2개 즉시 승리는 없음(v9부터).
- 데이터: `objectivePoints { SL: 1, SC: 2, SR: 1 }`, `scoreTiming 'ownTurnEnd'`(자기 턴을 끝낼 때 자기 점유) | `'roundEnd'`, `scoreTarget null`(닿으면 즉시 승리), 승리 조건 `roundLimitPoints`.
- 대칭 검사: 회전 짝 거점(왼쪽·오른쪽) 점수 같음, 승리 조건 양쪽 같은 형식. 형식 오류는 `validateScenario`.
- 화면: HUD 점수 칩(보는 진영 먼저, 진영 색 점, 남은 라운드), 로그 `라운드 n: 진영 +3 (중앙 2, 오른쪽 1)`(상대는 합계만), 규칙 안내 문구(점수 값은 데이터에서), 결과 화면 최종 점수.
- 검증: 춘천·호스토멜 `check.js` SAME, `test.js` 통과(점수 테스트 7개 추가). 브라우저: 기본·리치·휴대폰·2인 대전 가림막 확인.
- 진단: `node tools/sym-score.js [n] [A,B,...] [out.json]` (SCORING_COMBOS A~F + OLD = 이전 거점 수 판정).

## 주요 변경 위치
- `js/engine.js`: `roundLimitType`, `heldPoints`, `awardPoints`(endTurn 안, 이벤트 `scored`), `scoreTargetResult`, `pointsLimitResult`·`limitCompare`·`limitResultNow`, loadScenario `OBJECTIVE_POINTS/SCORE_TIMING/SCORE_TARGET`, state `score`·`scoreLog`(점수제만), simulateGames `res.sym`(attacksByRound, scoreCurve, finalScore, lateFlipRate, heldRounds), `SCORING_COMBOS`·`diagnoseScoring`, AI `objPointWeight`.
- `js/ai-intel.js` `symUrgency`: 점수제면 예상 총점(지금 점수 + 점유 점수 × 남은 라운드) 차이.
- `js/ui.js`: HUD `hud-goal` 자리에 점수 칩, describeEvent/describeFull `scored`, 규칙 안내, 결과 화면.

## 확정된 결정
- 거점 점유 상태는 지금처럼 공개 정보(거점 칩·표식이 실제 점유자를 보여 줌). 시야 밖 거점을 '마지막으로 본 상태'로 바꾸는 표시는 이번에 하지 않음(기존 동작 유지, 새로 드러나는 정보 없음).
- 0점 지급은 로그에 남기지 않음. 게임 안 저장 기능은 없어 '저장·불러오기'는 상태 직렬화(JSON) 후 이어 하기로 검사.
- AI 최소 조정: 중립 모드의 거점 머묾·점령 가치 × (거점 점수 / 평균 점수), 압박은 예상 총점 기준.

## 알려진 문제
- 남은 막판 쏠림 요인: 중립 AI의 `APPROACH_GROWTH`(5라운드부터 접근 가중치 +10%/라운드)가 그대로라 11라운드 이후 공격 수가 6~10라운드의 약 1.8배.
- AI끼리 선공이 62% 안팎(ownTurnEnd). roundEnd는 49:51.

## 다음에 볼 곳
- 값은 사람 플레이로: `objectivePoints`, `scoreTiming`, `scoreTarget`(시나리오 데이터). AI 개선은 별도 작업.
