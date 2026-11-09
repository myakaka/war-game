# HANDOFF (2026-11-09) — 행동 제한 (rulesVersion 6)

## 끝난 것과 검증
- 행동 제한: 유닛이 그 턴 처음 이동·공격할 때 1회, 시나리오 `activations`(역할별: 춘천 5/6, 호스토멜 4/4), 플래그 `RULES.ENABLE_ACTIVATION_LIMIT`.
- 플래그 끔: `node tools/check.js --legacy`가 v5 기준선(`tools/baseline-v5.json`)과 14개 항목 모두 SAME (시드 결과 + 턴 추적).
- 플래그 켬: `tools/baseline.json`을 새로 저장(`--save`). `node tools/test.js` 통과 36, 실패 0, 해당 없음 2 (행동 제한 테스트 11개 추가).
- 진단: `node tools/activations.js` (`diagnoseActivations`) — 조합별 100판, 오류 0, 한도 초과 0.
- 화면(Chrome): 호스토멜 PC 한/영, 세로 390px(narrow), 가로 844px(compact)에서 HUD `행동 n/N`과 설정 항목 한 줄. 한도 소진 시 회색 유닛, 카드 "행동 한도 소진", 이동 칸 표시 없음, 턴 종료 강조. AI 턴 중 칩 숨김, 로그에 행동 문구 없음.

## 주요 변경 위치
- 엔진: `startActivations`(startTurn), `activationBlocked`(canUnitMove·canUnitAttack), `noteActivation`(moveUnit·resolveAttack), `activationStatus`, `aiActionOptions`·`aiPickOption`(aiChooseAction 분리, 난수 순서 같음), `aiActivationLoop`, `simulateGames`의 `res.activation`, `diagnoseActivations`·`ACTIVATION_COMBOS`, `buildGameRecord`의 `activationLimit`·`activationCustom`, `validateScenario`·`scenarioNotes`.
- 상태: `state.act = {side, limit, used, ids}`는 한도가 있을 때만 만든다(없으면 상태 JSON이 v5와 같음). 화면은 `state.actLimits`(설정값)를 넣고, 시뮬레이션은 넣지 않는다.
- 화면: `#hud-act`, `unitHtml`(`act-spent`), `unitStatus`·`actCardText`, `renderControls`(`act-out`), 설정 `#seg-act`·`#act-rows`(`loadActPref`·`setActPref`·`renderActSettings`, 키 `chuncheon1950.activationLimits`), 범례 hl 탭, 규칙 화면 `introActRuleHtml`.

## 확정된 결정 (모호했던 부분)
- `activations` 키는 진영 id가 아니라 역할(def/att). 설정의 한도 범위는 1 ~ 그 진영 전체 병력(증원 포함), 그다음이 '제한 없음'.
- AI 비교 값은 '대기 대비 이득'(gain). 대기보다 나은 후보가 없으면 한도를 남긴다. 산개전술 도하 최우선 이동은 먼저 실행.
- 매복으로 제자리에 멈춘 이동도 1회 소모. 이동 후 공격할 대상이 없어 자동으로 행동이 끝난 유닛은 '행동 완료'.
- 기록의 `activationLimit`은 각 진영에 마지막으로 적용된 한도이고, `activationCustom`은 한 번이라도 기본값과 다르게 적용됐는지. 기존 기록은 불러올 때 `null`/`false`로 채운다.
- 기록 묶음(난이도별)은 그대로 두었다. 같은 조건끼리 비교하려면 기록의 두 필드로 거른다.

## 알려진 문제
- AI끼리 승률: 춘천은 한도를 걸어도 공격 84~95%, 호스토멜은 한도 4/3에서 공격 59%. 밸런스는 사람이 해 보고 판단할 것.
- 춘천 국군 AI는 한도의 65~84%만 쓴다(대기가 더 나은 턴이 많음).
- 2인 대전에서는 설정 팝업에 두 진영의 한도 숫자가 보인다(명세상 공개 정보). 소모 횟수는 보이지 않는다.

## 다음에 볼 곳
- 한도 조절: `js/scenarios/*.js`의 `activations` 한 곳. 조합 비교는 `ACTIVATION_COMBOS`(engine.js)와 `node tools/activations.js`.
