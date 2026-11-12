# HANDOFF (2026-11-12) — 대칭 AI 개선 v2 (규칙 변화 없음, 작업 전 태그 `stable-before-ai-symmetric`)

## 끝난 것과 검증
- 대칭 전장(`aiProfile: 'symmetric'`)에서만 켜지는 새 AI(v2): 본 적 기억, 간접 사격 단서·포병 쿨다운 추정, 위험 지도, 집결 진입, 포병·박격포 사거리 확보와 안개 속 사격, 위협 제거(집중·마무리·반격, 추격 제한, 최소 수비).
- 진단 전용 프로필: `v1:<난이도>`(기존 중립 AI), `turtle`(수비 봇, js/ai-intel.js). 화면 난이도 목록에는 없음.
- 검증: `check.js` 춘천 7·호스토멜 7 항목 SAME(대칭 7 항목은 AI 변경으로 새 기준선 저장). `test.js` 70 통과·0 실패·6 건너뜀(새 테스트 6개: intel 갱신, 안개(기억·위험 지도·쿨다운), 쿨다운 안전 구간, 사격 단서, 결정성·다른 시나리오 필드 없음).
- 계산 시간: AI 한 턴 평균 39~46ms, 최대 약 115ms(Node, 진단 2,400판 기준), 브라우저 20~40ms.
- 진단(200판×선공/후공, `node tools/sym-ai.js 200`): 새 AI vs turtle 승률 81.5/89.0%, 기존 AI vs turtle 59.5/65.0%, 새 AI vs 기존 AI 69.0/62.5%, 새 AI 자기 대결 선공 54.0%.

- 시작 화면 난이도: 시나리오 `aiProfiles`(화면 목록만)로 호스토멜·대칭은 쉬움/보통/어려움 3개(산개전술 = 강이 없어 어려움과 같음), 춘천은 4개. 목록에 없는 선택은 `extends` 바탕(산개전술 → 어려움)으로. 설명은 시나리오별 실제 AI 기준(`profile.<id>.desc.<시나리오>`).

## 주요 변경 위치
- `js/ai-intel.js`(새 파일, engine.js 다음): `intelInit`·`intelOnVision`·`intelOnIndirectFire`(state.aiIntel, 대칭만), `intelRecords`, `intelArtyResting`, `threatMap`, `expectedLoss`, `threatScore`, `symUrgency`, `symV2Context/Position/Attack/FogTargets/Goals`, `turtleTakeTurn`.
- `js/engine.js`: aiTakeTurn 프로필 분기, buildAiContext `ctx.v2`, 점수 함수에 v2 항목 연결, 박격포 이동 후 사격 필터(intel/likely 허용), `distanceField` 버킷 큐(결과 동일), simulateGames `res.sym.bySide`(진영별 지표, `opts.timing`+`opts.clock` 때만 계산 시간), `diagnoseSymmetricAI`.
- `js/ai-config.js` `AI_CONFIG.SYMMETRIC.INTEL`·`V2`(난이도별 `LEVELS`). `tools/sym-ai.js` 진단 실행기.

## 확정된 결정
- 정보: 기억(state.memory) + 공개 시작 배치(`INTEL_FROM_SETUP`) + 자기 유닛이 맞은 피해 모양. 증원은 상대 포병 수 계산에만 시나리오 일정(공개 데이터) 사용, state.pending 은 읽지 않음.
- 행동 한도(5) 때문에 포병이 이동 후보에 밀려 놀던 문제 → `fireReady`(사격 가산), `artyReach`/`artyCover`(사거리로 접근). 포병 표적 옆 아군이 있으면 가산 없이 `ffAdjacent` 감점 + 아군의 `clearLane`(비켜 주기)로 2단계 행동.
- 압박은 승리 조건 데이터(roundLimitScore·holdObjectives)와 점유 차이로 계산.

## 알려진 문제
- 안개 속 사격은 판당 0.3~1.0회, 명중률 8~17%(시야 밖 −50). '올 가능성이 높은 칸'은 거점 칸만.
- 위험 지도는 근사(불확실 반경은 맨해튼, 직접 공격 도달은 지형 비용 경계 탐색). 상대 포병의 표적 선택은 모델링하지 않음.
- 진단 표의 '맞고만 있던 라운드' = 거점을 점유한 채 상대 턴에 피해를 입고 이어지는 자기 턴에 공격·사격이 없던 횟수.

## 다음에 볼 곳
- 값은 사람 플레이로: `AI_CONFIG.SYMMETRIC.V2`(riskWeight, minSupport, fireReady 등). 행동 추적은 진단 스크립트로 (로그 화면에는 표시 없음).
