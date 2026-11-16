# HANDOFF (2026-11-16) — 튜토리얼 말풍선 개편 (작업 전 태그 `stable-before-tutorial-overlay`)

## 끝난 것: 하단 설명 패널 → 지도 위 말풍선, 8단계 → 9단계 (규칙·수치·AI·기존 시나리오 변경 없음, rulesVersion 12 그대로)
- 검증: test 220 통과·18 건너뜀·실패 0, check.js 28건 모두 SAME(1150초), layout-check 32 SAME. 브라우저(헤드리스 Edge): 360x640·390x844·412x915·740x360·1280x800, 영어.
- 데이터(`js/scenarios/tutorial.js`): 단계마다 `id, seed, setup, enemyScript(turn?), beats[]`. beat = `{ hint, sub?, target, goal, allowedActions, onResult[] }` (hint·sub·결과는 STRINGS 키, `tb.*` 안내 / `tr.*` 결과). target: `{unit}|{cells}|{move}|{button}`. 9단계 `retreat`(시드 15): 턴 종료 3번 → 후퇴 → 후퇴 불가 격파 → 박격포 제압 → 제압 유닛 선택.
- 로직(`js/tutorial.js`, DOM 없음): `tutorialBeat/Current/Progress/Allows/Target/Result`, `tutorialPlaceBubble`(말풍선 위치 순수 계산), `validateTutorialSteps`(hint 22자·sub 28자, ko/en, 지도 안), 목표 `endTurn.n`, `selectSuppressed`.
- 화면(`ui.js` 튜토리얼 구역): `renderTutUi`(상단 바 `#tut-bar` + 말풍선 `#tut-bubble`), `renderTutMarks`(맥박 고리 + 어둡게), `tutRecord`(beat 완료 → 결과 말풍선 3초 → 자동 다음 단계). 줌·미니맵은 튜토리얼 중 숨김·고정. `#coach` 삭제, CSS `.tut-*`.
- 문구: 옛 코치 문구 78개 삭제(긴 설명은 규칙 화면에 이미 있음).
- 결정: 말풍선은 지도 틀 폭 70%에서 줄바꿈(한 줄 고정 아님). 휴대폰 가로(740x360)는 바를 오른쪽 열 맨 위로. 확인 창·연출 중에는 말풍선 숨김(3초도 안 셈). `다시`는 큰 단계 전체 재시작. 행동 한도 결과 문구는 "이번 턴 행동 한도를 다 썼습니다"(그 유닛이 아니라 팀 한도라서).
- 후속 수정(같은 날): ① 결과 말풍선은 3초 자동 넘김 대신 지도 위 `다음 ▶` 버튼(`.tb-next`)으로 넘김. ② 말풍선이 명중률 배지 자리(대상 칸 위쪽 띠)와 좌표 글자 줄을 피함. ③ 3·4단계(terrain 2·3, fog 4)는 beat `card` 키 → 평소 공격 확인창 대신 튜토리얼 전용 설명 창 `tutPreviewCard`(명중률·보정 내역·설명·확인 버튼, 공격 안 함). ④ 턴 종료 버튼 표시는 안쪽 링(`inset` 그림자)이라 안 잘림. ⑤ 8·9단계 상대 사격은 `tutorialEndTurn(..., onShot)` 로 사격 직전·직후 상태를 받아 `playAttack` 으로 재생(주사위·후퇴 미끄러짐, 약 3.5초). 판정·난수 순서는 그대로. 검증: test 220 통과·실패 0, layout-check 32 SAME, 브라우저 3·9·2단계 확인.
- 알려진 것: 하위 단계(beat)별 되돌리기는 없음. 4단계 설명은 설명 창 하나로 처리(말풍선 추가 없음). `tools/shot.js` 훅에 `startTutorial`, `loadTutStep` 추가. 말풍선 위치 검사는 순수 함수 테스트 + 브라우저 몇 곳(전 화면 자동 검사는 없음).
- 다음에 볼 곳: 문구 다듬기(표는 보고 참고, 키는 `strings.js` 의 `tb.*`·`tr.*`), 상대 사격 연출 재생, 이어하기, 우글레다르 `draft`, 대칭 전장 가격·예산(임시값).

## 이전 작업 요약
- 대칭 전장 직접 편성(7기 기본, `draft`, `setDraft`)은 커밋 f6cf9a0, 우글레다르·후퇴·제압 전역화(v12)·포탄 모양·WebP는 git 기록 참고.
- 파일 필요: 없는 소리 5개(shell_whistle, score_up, objective_captured, victory, defeat), BGM. 결정 필요: 이어하기, 게임 이름, 우글레다르 균형.
