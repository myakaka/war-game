# HANDOFF (2026-11-13) — 후퇴·제압 규칙 v11 (작업 전 태그 `stable-before-retreat`) · 그 전: 소리, 메뉴 개편, 전투 효과

## 후퇴·제압 (최근, 대칭 전장·튜토리얼만)
- 규칙: 적에게 피해를 받고 살아남으면 1칸 후퇴(막히면 격파, 아군은 지나감), 박격포·포병 정중앙 직격은 제압(다음 자기 턴 행동 불가, 재직격은 격파), 아군 오사는 없음, 후퇴는 행동으로 세지 않음. 자세한 규칙은 `docs/rules.md`.
- 데이터: 시나리오 `retreat`(없으면 꺼짐) → `GAME_CONFIG.RETREAT`. `rulesVersion` 11. `validateScenario`·`symmetryErrors`가 검사(진영 키 거부).
- 엔진: `resolveRetreats`/`retreatTarget`/`retreatDir`(engine.js, `resolveAttack` 끝), 제압 해제는 `endTurn`, 행동 차단은 `canUnitMove/Attack`(`u.suppressed`). 이벤트 `retreat`·`suppressed`·`destroyed.cause`(`retreatBlocked`/`resuppressed`).
- AI(대칭 v2): `symV2RetreatGain`(후퇴 불가 격파·거점 비우기·제압), `symV2RetreatRisk`(위치), `intelOnSuppress`(내 사격으로 안 제압만 `aiIntel[side].supp`에 기억). 가중치는 `AI_CONFIG.SYMMETRIC.V2`(retreatKill 등 6개).
- 화면(ui.js): 후퇴 미끄러짐(`playAttack`, `DESIGN.fx.retreatMs`, 출발·도착이 모두 보일 때만, 연출 줄이기는 생략), 로그 8종, 내 유닛 `제압 N` 표식·카드·행동 수 제외, 규칙 화면 `후퇴와 제압`, 튜토리얼 7·8단계 문구(시드 7·9에서 명중해 제압·후퇴가 보임).
- 검증: test 138 통과(후퇴·AI 15개 추가), check: 춘천·호스토멜 14항목 SAME, 대칭 7항목만 DIFF(의도), 기준선은 `--save`로 갱신, layout-check 32 SAME. 브라우저(1280·390·리치): 후퇴·포병 4칸·후퇴 불가 격파·제압 카드·안개(DOM에 후퇴/제압 단서 0건)·연출 줄이기 확인.
- 진단: `node tools/retreat-diag.js 60`(끔/켬 같은 시드, 선후공 반반). 켬: 중앙 거점 변동 3.47→4.8, 거점 주변 체류 0.258→0.236, 교착 0.386→0.372, 중반 교전 13.8→12.9, 선공 승 40→34/60. 값은 사람이 정함.
- 결정: 직접 사격은 인접 4방향뿐(사거리 1)이라 대체 방향 규칙은 방어용. 후퇴 불가 격파 로그는 막은 것이 숨은 적이어도 알려짐(기존 `ambush`와 같은 수준). 시작 배치는 안 바꿈(보고만).
- 알려진 것: 시야 밖에서 시야 안으로 후퇴해 들어오는 유닛은 미끄러짐 없이 결과만. 소리는 새 파일 없이 `move_*` 재사용. `tools/shot.js` 훅에 `playerAttack, select, annotate, logEvents, visMapOf` 추가.

## 소리·메뉴·효과 (그 전)
- `js/audio.js`(`AUDIO`, `createAudio`), `sound/` wav 33→11MB(44.1kHz 16bit). `file://`에서는 `fetch`가 막혀 오디오 태그로 로딩(직접 청취 확인함). 휴대폰 턴 칩 확인 끝.
- 메뉴: `js/menu.js` `menuModel`, `showIntro`. 효과: `js/fx.js` `planAttackFx`, `FX`.

## 다음에 볼 곳
- 없는 소리 5개(`shell_whistle`·`score_up`·`objective_captured`·`victory`·`defeat`)·BGM 파일(BGM은 `file://`에서 Web Audio 루프가 막힐 수 있어 확인), 이어하기, 게임 이름(`gameTitle` 임시값).
- 후퇴·제압 값 조정: 시나리오 `retreat`(steps·duration), AI 가중치 `V2`. 직접 플레이 기록으로 판단.
