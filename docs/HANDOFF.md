# HANDOFF (2026-11-14) — 대칭 전장 직접 편성 (작업 전 태그 `stable-before-draft`)

## 대칭 전장 시작 병력 11→7기 + 직접 편성 (규칙·수치·전투·AI 판단 변경 없음, rulesVersion 12 그대로. 기본 배치가 바뀌어 대칭 시드 기준선만 갱신: 7 DIFF, 오류 0, 14라운드)
- 기본 배치: 보병 2·대전차·포병·박격포·통신·기갑 1 (정찰 빼고 양쪽 7기). 행동 한도 5, 증원은 그대로.
- 데이터: `symmetric.js` 의 `draft`(costs 임시값, budget 27 = 기본 편성 합계, 가격 기갑 10·포병 5·대전차/박격포 3·나머지 2, limits signal 1·armor 1, minUnits 1, deployRows, presets 4종 balanced/armor/fires/infantry). 병종 키는 `signal`(통신). 증원(4·8라운드)은 직접 편성에서도 그대로.
- 엔진(`engine.js`): `setDraft(comps)`(DEPLOYMENT 교체, null 이면 기본 복귀, `DEPLOYMENT_BASE` 보관), `draftError/Block/Cost/Count/AiComp/AutoPlace`, `draftDataErrors`(validateScenario 가 호출), `restoreDraft(saved)`, `publicSetup(side)`(직접 편성 판은 [] → AI 의 상대 포병 추정·ai-intel 의 시작 배치 추정이 꺼짐), `simulateGames(opts.draft)`, `state.draft`(직접 편성 판만), 게임 기록 `rec.draft`.
- 화면(`ui.js`): 시작 설정의 `편성` 선택, `startDraft/showDraftScreen`(2인은 가림막 뒤 한 명씩), 규칙 화면 `편성` 항목(`ruleSecs()`), 행동 한도 최대치·`scenarioHasType` 은 상대 병력을 알려 주지 않도록 직접 편성 판에서 공개 값으로. CSS `.draft-*`. 메뉴 저장 요약에 `draft` 코드값만.
- 결정: 편성 `+/−` 는 `aria-disabled`(포커스 유지). AI 편성은 확정 뒤 `Math.random` 시드(실제 플레이)로 고름. 다시 시작은 같은 편성 재사용.
- 검증: test 235 중 217 통과·18 건너뜀·실패 0(편성 14개 추가), check 대칭 외 SAME(대칭은 의도한 변경으로 기준선 갱신), layout-check 32 SAME(7기 변경 전). 브라우저: PC(리치)·휴대폰 390x844 설정·편성·핫시트 가림막·배치 단계·게임 시작, 영어 편성 화면.
- 제압 표시: 시야 안의 적도 카드 칩·지도 배지·로그("적 ○○ 제압")로 표시(화면만, 엔진 무변경). 시야 밖에서 맞은 적은 안 그려져 안 보이고, 제압 중 시야에 들어오면 다시 보임. 브라우저 확인은 아직.
- 알려진 것: 이어하기 저장 기능이 아직 없어 편성 화면 복원은 없음(편성 처음부터). 직접 편성 판의 AI 는 상대 포병 사전 추정이 없어 포병 경계가 약함. 가격표 점검은 구현 보고 참고.
- 다음에 볼 곳: 이어하기 UI 를 만들 때 `state.draft`·`restoreDraft` 연결, 가격·예산 조정(임시값), 우글레다르 등 다른 시나리오에 `draft` 켜기.

## 이전 작업 요약
- 우글레다르 시나리오(데이터 전용)·후퇴·제압 전역화(v12)·포탄 모양·WebP 변환은 git 기록 참고(커밋 670f0f4 이전).
- 파일 필요: 없는 소리 5개(shell_whistle, score_up, objective_captured, victory, defeat), BGM. 결정 필요: 이어하기, 게임 이름, 우글레다르 균형.
