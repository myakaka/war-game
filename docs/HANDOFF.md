# HANDOFF (2026-11-11) — 간접 화력 1단계 (rulesVersion 7, 작업 전 태그 `stable-before-indirect-fire`)

## 끝난 것과 검증
- 시나리오 `fires`(호스토멜만): 안개 속 사격 가능, 포병 사거리 5·쿨다운 1, 박격포(새 병종, 공격군 2기) 사거리 4·쿨다운 0·추가 감점 0. 춘천은 `fires`가 없어 v6 그대로.
- 검증: 춘천 시드 비교 7개 항목 모두 SAME(호스토멜은 의도대로 DIFF → `check.js --save`로 기준선 갱신). `node tools/test.js` 44 통과(간접 화력 8개 추가).
- 화면(헤드리스 Edge, 테스트 서버가 ui.js 끝에 `window.__T` 를 붙임): 안개 속 칸 사격, 적이 있는/빈 안개 칸의 확인 창 HTML 동일, 쿨다운 배지는 내 유닛만, 박격포 `mortar.png`·없으면 포병 그림 70%, 휴대폰 시트 버튼 화면 안, 춘천 화력 설정 숨김.
- 이전: 휴대폰 세로 UI(조작 줄을 카드 바로 아래로, 최소 바닥 여백 `--abar-lift` 25px, 공격 확인 하단 시트), 행동 제한 v6, PC 리치 테마, GitHub Pages 배포.

## 주요 변경 위치
- `js/rules.js`: `UNIT_TYPES.mortar`(indirect, `splash:false`, `moveFire`, `fixedDamage:1`), `RULES_VERSION 7`. `js/scenarios/hostomel.js`: `fires`, 박격포 배치(count 2, 후보 칸 3).
- `js/engine.js`: `startFires`·`firesOf`·`fireRange`·`fireCooldown`·`onCooldown`·`cooldownTurnsLeft`·`indirectPenaltyOf`·`blindFireAllowed`, `canUnitAttack`·`getAttackableTiles`·`resolveAttack`(`lastFiredRound`)·`calcDamage`·`calcHitBreakdown`(`indirectPenalty`), `validateScenario`(fires), overrides `fires`/`counts`, `simulateGames`의 `res.fires`, `FIRE_COMBOS`·`diagnoseFires`.
- AI: `aiArtilleryTargets`(fires면 보이는 적만), 박격포 이동 후 사격(이동 뒤에도 보이는 표적만, `ctx.visOthers`), `TYPE_BONUS.mortar='mortarRear'`, 가중치 `mortarClose`·`mortarBehind`, `UNIT_VALUE.mortar`, `UNIT_ORDER`.
- `js/ui.js`: `fireRegionSvg`, 쿨다운 배지·카드 문구, 시트 `미확인 칸`·`아군 피해 n`, `impactFx(single)`, 리치 박격포 대체 그림, 설정 `renderFireSettings`(`DESIGN.fireSettings`, 키 `chuncheon1950.fires`), 범례는 시나리오 병종만. 휴대폰 UI는 `DESIGN.atkSheet`·`keepUnitsAboveSheet`·`--abar-*`.

## 확정된 결정
- 원래(v6)도 포병은 안개 속 칸을 쏠 수 있었다. 그래서 `fires` 없음 = v6, `blindFire:false`는 `fires` 시나리오에서만 "보이는 칸만". 진단표 A(기존)는 실제 v6 규칙.
- 시야 밖 판정은 원래 진영 단위(`getVisibleTiles` 합집합). 빈 칸 사격은 원래 간접 화력에 허용.
- 박격포: 최소 사거리 2, 시야 2, 피해 고정 1. 쿨다운 남은 턴 = 사격 못 하는 자기 진영 턴 수. 화력 설정의 추가 감점은 5%p 단위.
- AI 간접 화력은 fires 시나리오에서 보이는 적만(추측·대포병 추정 사격 없음).

## 알려진 문제
- 게임 저장·불러오기 기능은 원래 없음(쿨다운은 상태 `lastFiredRound`에 있어 재생 복제에서도 유지).
- AI끼리 승률은 조합 비교용. 박격포·포병 값은 사람 플레이로 조정. AI는 박격포를 사람만큼 잘 쓰지 못할 수 있음.

## 다음에 볼 곳
- 값 조정: 호스토멜 `fires`, 설정 메뉴. 진단: `diagnoseFires(100)`. 다음 단계 후보: 방향, 제압, 지연 탄착, 포성 노출.
