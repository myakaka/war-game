# HANDOFF (2026-11-14) — 후퇴·제압을 모든 시나리오의 기본 규칙으로 (rulesVersion 12, 작업 전 태그 `stable-before-retreat-all`)

## 후퇴·제압 전역화 (최근)
- 규칙 내용은 v11 그대로(`docs/rules.md` 후퇴와 제압). 이전 규칙·옵션·시나리오 분기는 없음. 수치는 `RULES.RETREAT`(`STEPS` 1, `SUPPRESS_TURNS` 1, `SUPPRESS_SOURCES`) 한 곳. 시나리오 `retreat` 블록·검증 삭제.
- 엔진: `resolveRetreats`/`retreatTarget`/`retreatDir`는 조건 없이 실행. 춘천은 `fires`가 없을 뿐 포병이 있어 포병 후퇴·제압도 일어남(규칙 화면의 제압·포병 줄은 `scenarioHasType` 로 유닛 구성을 보고 정함, 지금 세 시나리오 모두 표시).
- AI 공통 모듈(`ai-intel.js`): `retreatGain`·`aiRetreatRisk`·`retreatBlockedCount`·`suppMemory`. 대칭 AI는 `V2` 값, 호스토멜·춘천 기존 AI는 `AI_CONFIG.WEIGHTS`(retreatKill 등 6개, 위험 항목은 `diff.risk` 곱함 → 난이도 차이 유지). 제압 기억은 내 사격 결과만(대칭 `aiIntel[side].supp`, 그 밖 `state.aiSupp`).
- 저장 판: `upgradeSavedState`(원본 유지, 제압 기본값, 읽을 수 없으면 `state: null`), 메뉴 `rulesUpdated`·`rulesNoticeNeeded`, 문구 `save.rulesUpdated`. **진행 중인 판 저장·이어하기 UI는 아직 없어** 안내를 띄울 곳이 없음(저장 때 `rulesVersion`을 함께 써야 함).
- 튜토리얼: 전역 규칙으로 정리, 2단계 문구에 직접 사격 후퇴 한 줄(`tutorialParams().steps`).
- 검증: test 165 통과(세 시나리오 파라미터화 + 구 AI 테스트 추가), check: 대칭 7항목 SAME(턴 해시 포함), 호스토멜·춘천 14항목 DIFF(의도), 기준선 `--save`로 갱신, layout-check 32 SAME. 브라우저(PC·390x844): 두 시나리오 후퇴·포병 4칸·제압·후퇴 불가 격파·안개(DOM 단서 0건)·규칙 화면 확인.
- 진단 파일: `tools/retreat-before-*.json`(이전 규칙, 태그 시점 복사본에서 생성), `retreat-after-*.json`, `retreat-{before,after}-sim.json`(simulateGames n=60, 난이도 3단계). 생성: `node tools/retreat-diag.js <시나리오> <난이도> 60 <out>`, `node tools/retreat-sim-snapshot.js <out> 60`.
- 알려진 것: 춘천 새 규칙에서 `hq` 승리가 4→24판(보통, 60판)으로 늘었으나 후퇴로 본부 칸에 닿은 경우는 거의 없음(0.03/판), 원인은 행동 변화. 구 AI의 대칭 `v1:` 프로필은 새 항목을 모름(진단용). 대칭 AI의 새 위험 항은 난이도 배수를 곱하지 않음(결과 동일 유지 요구 때문).
- 바꾼 테스트: 숨은 적 체력 안개 테스트(결과가 처음 갈리는 행동까지 판단만 비교), 메뉴 저장 요약(`rulesUpdated` 추가), 후퇴 엔진 테스트(시나리오 파라미터화로 교체).

## 소리·메뉴·효과 (그 전)
- `js/audio.js`, `sound/` 11MB(44.1kHz 16bit), `file://` 오디오는 오디오 태그 경로로 동작. 메뉴 `js/menu.js`, 효과 `js/fx.js`.

## 다음에 볼 곳
- 없는 소리 5개·BGM 파일, 이어하기(저장·불러오기 + 규칙 안내), 게임 이름 확정.
- 균형(후퇴·제압 값 `RULES.RETREAT`, AI `WEIGHTS`)은 직접 플레이로 판단.
