# 사용자 확인 대기 목록 (2026-11-24, 푸시 시점)

(2026-11-24 확인 끝: 튜토리얼, 주사위 규칙 플레이, 모바일, 직사 사격선, 레이더. 주사위 규칙의 AI는 더 플레이해 보고 판단)
- [ ] 영어 화면: 메인 메뉴 제목이 음소거 버튼에 가리던 것은 CSS 수정함(새로고침 후 눈으로 확인 필요, 미커밋). 새로 쓴 문구(튜토리얼, 이동 후 공격 안내, 규칙 화면) 검토는 남음
- [ ] 기존 대기 항목(후순위): 소리 파일 5개(`shell_whistle`, `score_up`, `objective_captured`, `victory`, `defeat`)·BGM, 맵 만들기 영어·휴대폰 화면·파일 내보내기/가져오기 (아래 이전 항목 참고)
- 후순위: 이어하기, 소형 전장 AI 은폐 가중치·엄폐물 지도, AI 위협 추정을 주사위 식으로(시드 기준선 재저장 필요)

- [ ] (11-25) 소형 전장 새 배치·철조망을 직접 플레이: 밸런스, 철조망 진입(이동력 일부 남아도 들어가면 이동 끝), 바위·차·담장 정면 방향이 그림과 맞는지, 영어 화면의 `철조망/Barbed wire`
- 다음 후보: 맵 만들기 편집기에 새 엄폐물 종류·철조망 고르기, 도시·숲 방어 정립(규칙 변경, 기준선 다시 저장), 병종 추가(마지막), 다른 시나리오 땅 톤(회색빛), 툴팁에 엄폐물 종류 이름(지금은 전부 '엄폐물')

---
# HANDOFF (2026-11-26) — 규칙 v17: 통신 정찰이 은폐 유닛도 보여 줌
- `engine.js isHiddenFrom`: 자기 진영 통신 정찰 3x3 칸 안은 은폐 유닛도 보임(정찰한 진영 턴 끝까지). 은폐 규칙 시나리오(소형 전장·내 맵)만 해당, 통신 유닛 없으면 변화 없음. rulesVersion 17, docs/rules.md 갱신.
- 이유: 통신은 한 턴을 써서 보여 주는 역할이라 은폐도 풀어야 한다는 결정.
- 검증: test.js 279 통과(새 테스트 1), `check.js --only skirmish` 7건 SAME, 기준선 재저장(버전 표기).
- 확인 필요: 관리자 모드로 통신 유닛을 넣어 직접 정찰해 보기.

---
# HANDOFF (2026-11-26 추가) — 날씨 층: 구름 그림자·안개·새 (소형 전장, 규칙 변경 없음)
- `ui.js weatherLayerHtml`, css `.cloud-shadow/.fog-band/.bird-flock`, 데이터 `skirmish.js art.weather {birds, clouds, cloudMs, fog}`. 유닛(z7)·연기(z6) 아래, 연출 줄이기 시 정지(새는 숨김).
- 새: 주기의 앞 12%만 지도를 가로지르고 나머지는 숨음, 날개 퍼덕임, 옅은 그림자. 구름·안개는 처음 너무 옅어 진하기를 올림.
- 검증: test.js 278 통과, 고정 프레임 화면 확인. 움직임·실제 플레이 단계는 헤드리스로 못 봄(직접 확인 필요). 시드 비교 생략(화면 전용).

---
# HANDOFF (2026-11-26) — 엄폐물 표시 정리 + 정찰 소리 (규칙 변경 없음)
- 엄폐물 종류 이름(바위·담장 등)을 툴팁·유닛 카드·요약에 표시(`ui.js cellTerrainNameKey`), 정면 한 방향 종류는 "정면 ○쪽 사격만 막음" 줄 + 호버 시 막는 변에 붉은 방향 표식(`coverFacingSvg`).
- 툴팁/카드의 엄폐 방어 값을 종류별 실제 값으로 표시(수풀 1, 구덩이·담장·도랑·잔해·모래주머니 2, 바위·차 3). 이전엔 전부 +2로 잘못 표시. 주사위 규칙에서는 "명중률 보정" 줄 숨김.
- `audio.js`: 정찰은 보병 이동 소리(`vehicleTypes`에서 recon 제거, 모든 시나리오).
- 검증: test.js 278 통과, PC 화면 확인. 규칙 값은 그대로라 시드 비교 생략.
- 알려진 문제: 방향 표식은 마우스 호버만(터치 탭 미확인), 영어·모바일 화면 미확인.

---
# HANDOFF (2026-11-25 추가 2) — 소형 전장 화면 다듬기 (규칙 변경 없음)
- `rich-map.js`: 엄폐물·철조망 그림자(`K.objShadow`), 흔적 장식 변형(뒤집기·크기·번짐·뭉침, `decals.weights/alphas/soften`), 참호 타일 이음매 블렌딩(`visual.trench.blendRatio`). 참호 PNG 풀색 보정(원본 `assets/_raw/trench_before_v2/`).
- 연기·잔불: `ui.js smokeLayerHtml`, css `.smoke-puff/.ember/.spark`, 데이터 `skirmish.js art.smoke`(소형 전장만, 연출 줄이기 지원). 유닛(z7) 아래 z6.
- 검증: `check.js --only skirmish` 전부 SAME(190초), PC 화면 확인. 연기 움직임은 헤드리스로 못 찍어 직접 확인 필요.
- 알려진 문제: 그림자는 `art.cover/wire` 있는 모든 시나리오에 적용됨(소형 전장 외 해당 여부 미확인), 연기 위치가 내 맵에도 같은 좌표로 뜰 수 있음.
- 다음 후보: 엄폐물 툴팁 종류 이름·정면 방향 표시, 구름 그림자/안개 층.

---
# HANDOFF (2026-11-25 추가) — 맵 만들기 편집기에 새 지형
- 팔레트에 철조망(`x`)·바위(`R`)·부서진 차(`W`)·담장(`L`)·도랑(`D`)·잔해(`B`) 추가. 규칙 변경 없음(rulesVersion 16 그대로), 시드 비교 해당 없음.
- `custom-map.js`: `CUSTOM_MAP.TERRAIN`·`COVER_KIND`, `customCoverCells`가 새 글자를 종류로 지정, `buildCustomScenario`가 R/W/L/D/B를 `e`로 바꿔 규칙에 넘김. 예전엔 `x`가 저장 때 평지로 바뀌었으나 이제 유지.
- `ui.js` ME_TERRAIN/ME_GLYPH, `strings.js` terrain.rock 등, `style.css` me-wire 등.
- 검증: test.js 278 통과/0 실패, PC 1280x800 편집기 화면 확인. 영어·모바일·플레이 화면 미확인.
- 알려진 문제: 엄폐물 방향은 좌표 자동(직접 선택 불가), 툴팁은 여전히 "엄폐물".

---
# HANDOFF (2026-11-25) — 소형 전장 풍성하게: 새 지형 + 회색 전장 땅 + 흔적 장식 (rulesVersion 16)

## 끝난 것
- 규칙 v16(소형 전장만): 철조망 `x`(`TERRAIN_TYPES`, 이동 3, `partialEntry`로 보병도 진입, 방어·은폐 없음), 엄폐물 종류 바위·부서진 차 +3 정면, 담장 +2 정면, 도랑·잔해 +2 전방위(`skirmish.js terrainRules`). 맵·`coverCells`는 점대칭 쌍으로 배치(바위·차·담장·잔해·도랑 각 2, 철조망 4). `docs/rules.md` v16.
- 화면(`ui.js`·`rich-map.js`·css): 숲·도시·산·논·강 위 유닛 표시 `DESIGN.rich.terrainLook`, 이동 끝날 때 칸 표시로 부드럽게 `settleLook`(`lookTween` 처음 사용). 땅 질감 섞기 `art.groundPatches`, 흔적 장식 `art.decals`(평지 칸, 칸 해시 배치), 철조망 그림 `art.wire`, 참호 가장자리 번짐 `visual.trench.featherRatio`. 새 엄폐물 종류의 유닛 표시는 비슷한 기존 것을 빌림(`richUnitLook`).
- 그림: 엄폐물 5종·철조망·흔적 4종·땅 3종 추가. `tools/prep-assets.py`가 마젠타 배경 제거·크기 줄이기·참호 올리브색 보정을 함(원본은 `assets/_raw/`, gitignore). 부서진 차 그림은 90도 눕혀 정면이 위쪽.
- 검증: `test.js` 301건 278 통과·실패 0(시험의 칸 좌표 하나만 맵 변경에 맞춤: `(6,3)`→`(0,3)`), `check.js --only skirmish --save` 기준선 35건 저장. 화면은 PC 1280x800 한 장씩.

## 확정한 결정
- 잔해 이동 비용은 1: 엄폐물 칸은 이동 비용이 종류별로 달라지지 않는 구조라 평지와 같게 함(표의 2에서 낮춤).
- 흔적 장식은 작고 흐리게(진짜 엄폐물 구덩이와 헷갈리지 않게). `getImageData`를 쓰지 않아 `file://` 실행 유지.

## 알려진 문제
- 툴팁 이름은 엄폐물 종류와 상관없이 '엄폐물'. 맵 만들기는 새 종류·철조망을 아직 못 고름(자동 지정은 구덩이·수풀·모래주머니만).
- AI는 새 지형을 따로 모름(기존 방어 평가·이동 비용을 그대로 씀). 도시·숲·강 그림은 아직 초록 톤.
- 모바일·영어 화면 확인 안 함.

---
# HANDOFF (2026-11-24) — 주사위 규칙 표준 2단계: 튜토리얼 재작성 + 옛 규칙 전환 코드 삭제 (rulesVersion 15)

## 끝난 것
- 직사 사격선(`ui.js fireLines`)을 모든 시나리오로 확대.
- 튜토리얼이 주사위 규칙으로 돈다: 시드 attack 14·retreat 1(결과 의도 유지), 문구 `tr.forest/tr.fog/tc.terrain.2/tc.fog.4` 재작성, `tutorialParams`의 forest/plain/city는 방어 보너스, fog는 `DICE_RULES.blindPenalty`.
- 규칙 세트 개념 삭제: `RULES.RULESET`, `setRuleset/rulesetOf/isDiceRules`(combat.js), 시나리오 `ruleset` 필드·검증·`SCENARIO_RULESET`·`simulateGames` 규칙 인자, 문구 `scenErr.ruleset`. 엔진·AI·화면의 classic 분기(`getAttackableTiles`, AI 후보·위험도·포병 위험 지도, 유닛 카드·규칙 화면·병종 표)를 주사위 쪽만 남김. 새 함수 `assertDiceStats()`(수치 표 오류면 판 시작 거부, `newGame`·`simulateGames`).
- 죽은 문구·함수 정리: `introHitRuleHtml`, `intro.hit*`, `rules.dmg`, `stat.atkSoft/atkArmor`, `rules.th.atk`, `rules.dice.tut`.
- 시험: 옛 규칙 전용 시험 삭제·개조(규칙 세트 API, 시나리오 규칙 고정), `MISS`를 주사위용(0.1)으로, 안개·박격포·정찰 시험은 주사위 필드로 판정. test.js 301건 통과 278·실패 0.
- 시드: 삭제 전후 빠른 지문(시나리오 5종 x 2프로필 x 6판) 동일, `check.js` 전체 35건 모두 SAME(기준선 v15 그대로, 1054초).

## 확정한 결정
- 퍼센트 명중률 계산(`calcHitBreakdown`의 classic 식, `COMBAT.baseHit` 등)과 `unitStats.classic` 키 이름은 남김: 주사위 규칙이 같은 필드(이동·시야·사거리)를 UNIT_TYPES에서 읽고, 대상이 없는 계산 호출이 이 식으로 떨어질 수 있어 지우면 동작이 바뀔 위험. rules.md에 `classic`은 옛 키 이름이라고 적음.
- 이동 후 공격의 명중 감점은 주사위 규칙에 원래 없었음(문서를 사실대로 고침).

## 알려진 문제 / 다음
- 옛 퍼센트 코드 정리(화면만, 시드 비교 생략): 안 쓰이는 퍼센트 명중률 미리보기(`attackPreviewHtml` 뒷부분, `hitHeadline`, `hitFormulaLine`, `partLabel` 옛 항목)와 문구 27개 삭제, `tutorialParams`의 base/per/mv/min/max/dice 삭제, 이동 후 공격 "명중률 −10%"라고 거짓으로 알리던 문구(`tip.moveAtkOk`, `legend.hl.moveAtk`, `intro.maPenalty`, `status.movedCanAttack`, `status.mortarMoveFire`) 수정.
- **남긴 것과 이유**: 엔진의 퍼센트 식(`calcHitBreakdown` 옛 식, `COMBAT.baseHit/perPoint/fogPenalty/minHit*`, `MOVE_ATTACK_PENALTY`, `DICE_SIDES`)은 AI의 `aiRetreatRisk`(ai-intel.js 551행)가 적 박격포·포병의 위협을 추정할 때 지금도 부른다(탐침으로 확인: 시뮬레이션 호출 26000여 번 모두 박격포·포병). 지우거나 주사위 식으로 바꾸면 AI 평가가 달라져 시드 결과가 바뀐다(AI 변경이라 요청이 있을 때만). `ENABLE_MOVE_ATTACK`은 이동 후 공격 허용 여부 규칙 플래그라 그대로.
- 튜토리얼 말풍선을 사람이 처음부터 끝까지 눌러 본 확인은 안 함(자동 시험은 통과).
- 영어 문구는 새로 쓴 것만 검토.

---
# HANDOFF (2026-11-23, 뒤) — 주사위 규칙을 표준으로 (rulesVersion 15, 1단계 · 미커밋)

## 끝난 것
- `RULES.RULESET` 기본값 `'dice'`, `RULES_VERSION` 15. 모든 시나리오가 주사위 규칙(옛 '데모 2')으로 시작. `ui.js` `setRuleset(SCENARIO_RULESET || 'dice')`.
- 메뉴에서 '데모 2' 항목·시나리오 선택 배지/안내·HUD 배지(`hud-demo2`, index.html)·`ui.demo2` 상태 제거. 문구 `menu.demo2*`, `dice2.badge*`, `dice2.introNote`(ko/en) 삭제.
- engine.js `SCENARIO_RULESET`가 `'classic'`도 받음. 튜토리얼·연습 판은 `startTutorial`/`startPractice`에서 `setRuleset('classic')` 그대로(옛 규칙 코드가 아직 필요한 이유).
- `docs/rules.md` 제목 v15, 맨 위 안내, '주사위 규칙 (표준, v15)'로 개명.
- 검증: test.js 302건 중 279 통과·실패 0(옛 규칙 시험은 파일 맨 위 `E.setRuleset('classic')`로 유지, 기본값 시험 1건 추가). 소형 전장 시드 결과 SAME(trace 해시만 규칙 버전 때문에 DIFF). 새 기준선 `tools/baseline.json` 35건 저장. 헤드리스로 메뉴(3항목, v15)·춘천 판 시작 확인.

## 확정한 결정
- 규칙 수치와 AI 가중치는 그대로(요청 범위 밖). 춘천·호스토멜·우글레다르·대칭 전장의 밸런스는 직접 플레이로 판단.
- 한 번에 지우지 않고 1단계(표준 전환) 후 확인, 2단계(옛 규칙 코드 삭제)로 분리.

## 알려진 문제 / 다음
- 2단계 전에 정할 것: 튜토리얼 문구·단계가 옛 규칙(명중률 %)으로 쓰여 있음. 새 규칙으로 다시 쓸지, 튜토리얼만 옛 규칙으로 남길지.
- 2단계 범위: classic 분기(`isDiceRules`/`rulesetOf` 약 30곳), `unitStats.classic`, `DICE_SIDES`·`ENABLE_MOVE_ATTACK`, 퍼센트 명중률 UI, 옛 규칙 시험, rules.md의 classic 서술. 지운 뒤 시드 결과가 지우기 전과 같아야 함.
- 직사 사격선 표시(`ui.js` 1229행)는 아직 `SCENARIO_RULESET`가 있는 시나리오(소형 전장)에서만 나옴. 모든 시나리오로 넓힐지 확인 필요.

---
# HANDOFF (2026-11-23) — 올리브 상황실 테마 + 메인 메뉴 레이더 (커밋 a2ea4d7, 화면만)

## 끝난 것
- UI 크롬을 파랑에서 어두운 올리브로 교체. `css/style.css` `:root` 변수(`--bg/--panel*/--line*/--text/--muted/--accent/--accent-2`)와 하드코딩 파랑 22곳. 포인트 `--accent #6b7f3a`(버튼 흰 글씨), 메뉴 쪽은 밝은 올리브 `#8aa04c`+어두운 글씨.
- 메인 메뉴(`.menu-card`)와 시나리오 선택(`.scen-page`): 각진 모서리, 왼쪽 막대 버튼, 격자선과 옅은 카모 얼룩 바탕, 모서리 꺾쇠. 메뉴 변수는 모달 안에서만 `--mil*`로 정의(바깥 화면에 새지 않음).
- 레이더(메인 메뉴 뒤, 오버레이 `::before/::after`): 동심원·십자선·동서남북 눈금(정지), 7초 회전 빔. 붉은 마름모 점 4개는 `ui.js` 메뉴 마크업의 `.radar-blips`(문구 없음, `aria-hidden`)이고 빔 각도에 맞춘 음수 `animation-delay`로 켜짐. 점마다 조준 표식과 퍼지는 고리.
- `reduceMotion`·OS 동작 줄이기: 빔 정지, 점 숨김. 1000px 이하 점 숨김(카드가 화면을 덮음).
- 검증: 헤드리스 PC 1280x800, 메뉴·시나리오 선택·게임 화면 확인. 모바일은 메뉴·시나리오 선택만(색 변경 전 배치). 로직 무변경이라 시드 비교 생략.

## 확정한 결정
- 지도(종이 톤)와 진영 색(국군 파랑/북한군 빨강), 지도 위 하이라이트(이동 범위 파랑 등)는 그대로: 역할 구분 색이라 UI 톤과 분리.
- 방위 글자(N/E/S/W)는 문구 규칙 때문에 넣지 않고 눈금만.
- 레이더는 인광 녹색, 적 점만 빨강(상황판 느낌).

## 알려진 문제 / 다음
- 언어 전환으로 메뉴가 다시 그려지면 점 애니메이션만 재시작해 빔과 어긋남(화면 이동 뒤 맞춰짐).
- 확인 못 함: 모바일 게임 화면·설정/규칙/튜토리얼 패널의 색, 메뉴 뒤 지도의 파란 강이 톤과 어긋남(더 어둡게 덮는 안).
- 방향성 엄폐(v14)와 맵 만들기 기록은 아래 111~114행(이전 항목 끝)에 있음.
- 소형 전장 AI 은폐 가중치, 엄폐물 지도는 그대로 남음. 소리 파일 5개·BGM 대기.

---
# HANDOFF (2026-11-22, 저녁) — 참호전(소형 전장 교체) + 은폐 규칙 + 시나리오별 병종 수치 표

## 끝난 것
- `skirmish`를 참호전으로 교체: 10×10, 6기(보병 3·정찰 2·박격포 1), 엄폐물 `e`(+2)·참호 `T`(+4) 지형 추가(rules.js `TERRAIN_TYPES`, `conceals: true`), 점대칭, 12라운드, 주사위 규칙 고정.
- 시나리오별 병종 수치 덮어쓰기 `unitStats: { classic, dice }`(engine.js `loadScenario`, 덮어쓴 시나리오가 있을 때만 되돌림). 정찰 시야 3.
- 승리: `roundLimitAttrition`을 남은 총 체력 → 생존 유닛 수 → 무승부로 변경(`attritionLimitResult`, reason `limitHpTotal/limitUnits/limitDraw`).
- 은폐(시나리오 `concealment`): engine.js `isHiddenFrom`, `getVisibleTiles`(은폐한 적 칸 제외, 유닛 존재용)·`getTerrainVisibleTiles`(안개 덮개·맹사격용), `hiddenBlockerOnLine`+`resolveAttack`(막은 유닛 대신 맞음·사격하면 노출), `startTurn`에서 노출 해제. 박격포 `mortarIgnoresTerrain`(combat.js `diceIndirectNeed`). 제압 즉사 `suppressKill`(engine.js `resolveAttack` 피해 직전 amount=hp, `startTurn`/`endTurn` 의 `suppSeen` 해제 타이밍).
- 화면(ui.js/css): 은폐·노출 배지, 정찰 선택 시 반경 표시, 지형 설명 줄, 막힘 로그, 이미지 지도에서 엄폐물·참호는 기호 타일(`terrVisOf`로 안개 덮개 분리).
- CLAUDE.md 안개 규칙에 은폐 예외 한 줄 추가(승인됨).
- 참호·엄폐물 그림(리치 테마 전용): 시나리오 `art.trench/cover/visual`(skirmish.js), rich-map.js `trenchChoice`·6c 단계(참호 자동 타일·엄폐물 겹쳐 그리기, 파일 없으면 기호), ui.js `richUnitLook`·`lookStyle`·`coverOverlayHtml`·`popUp`·`lookTween`(엄폐 칸 유닛 축소·아래쪽 사라짐·모래주머니/덤불 덮개 층·사격 시 튀어오름·노출 해제 복귀·처음 드러날 때 깜빡임, 설정은 `art.visual.units`, rich-map.js `coverChoice`)·`?debug=1`(칸 좌표·이웃 방향). 파일은 assets/terrain/trench_*.png, assets/cover/cover_*.png. 보정은 `visual.cellOverrides`('행,열' 0부터).
- 검증: 테스트 통과(참호전 4건·승리 순서 개정), 소형 전장 시드 기준선 재저장, AI 8판 시뮬레이션 오류 0, 화면 캡처 확인.

## 알려진 문제 / 다음
- AI 은폐 전용 가중치(엄폐 우선·웅크리기/공세·사격 아끼기)는 아직 없음(기존 평가가 지형 방어를 쓰고 보이는 적만 봄). 직접 플레이 뒤에 정할 것.
- 이미지 지도(리치)에 엄폐물·참호 그림이 없어 기호 타일로 보임. 모바일 화면은 확인하지 않음.
- 규칙서 범례(`?`)에 은폐 설명 없음. 밸런스는 직접 플레이로.

---
# HANDOFF (2026-11-22) — 관리자 편성 (미커밋)

## 끝난 것
- 시작 화면 설정 시트의 '관리자' 버튼(AI 대전만) → 양쪽 진영의 (도착 라운드, 병종, 수량)을 직접 편집. 시작 병력과 증원 전부, 시나리오별 `localStorage`(`forces:<id>`) 저장, '기본값으로'·'해제'.
- 엔진: `setForces/forcesDefault/forcesError`(engine.js, 직접 편성 블록 아래), `FORCES_LIMIT`(진영 40·줄 20), `publicReinforcements`(ai-intel.js 한 줄). 화면: `showAdminScreen`(ui.js, 'draft' 오버레이 재사용), `.admin-*` css, 문구 `admin.*`/`forcesErr.*`.
- 결정: 규칙 변경이 아니라 시작 옵션이라 rulesVersion 13 유지. 2인 대전은 상대 구성이 보여서 막음. 직접 편성(draft)과 같이 쓰면 관리자 편성 우선. AI는 편성한 값을 모름(기본값만).
- 새 유닛 자동 배치는 진영 중심에서 가장 가까운 빈 칸(구역 안, 거점 칸 제외), 증원 칸은 같은 진영 기존 도착 칸 재사용.
- 검증: test.js 255 통과(관리자 4건 추가), 브라우저 확인(호스토멜 편집→저장→시작: 방어 8+7, 공격 0+16), 모바일 390px 넘침 없음. 시드 비교 28건 모두 SAME.

## 알려진 문제 / 다음
- 편성을 키우면 균형 판단은 직접 플레이로. 새 병종이 그 진영 그림 세트에 없으면 기호로 대체되는지 확인 못 함.
- 편성 시험은 `E.setForces(forces)` 후 `simulateGames`로 가능(아직 check.js 옵션 없음).

---
# HANDOFF (2026-11-21, 뒤) — 통신 정찰 (rulesVersion 13, 태그 `stable-before-comms-scout`, 미커밋)

## 끝난 것
- 규칙: 통신 +20 명중 보너스 제거(`COMBAT.signalBonus: 0`). 통신이 그 턴의 행동(행동 제한 1회)을 써서 자기 위치에서 6칸 안의 한 지점을 고르면 그 3×3 칸이 **자기 턴이 끝날 때까지** 시야. 이동 뒤 정찰 가능, 하면 그 유닛 행동 끝. classic·dice 공통. 수치는 `RULES.SCOUT {range: 6, radius: 1}`, `UNIT_TYPES.signal.canScout`, dice `commsEffect: 'scout'`.
- 엔진(`engine.js`): `scoutArea`·`canUnitScout`·`getScoutTargets`·`getScoutTiles`·`scoutTilesAround`. `state.scout = {side, tiles}`는 정찰했을 때만 생기고 `endTurn`에서 지움. `getVisibleTiles`가 합산하므로 사격 대상·감점·박격포 보이는 적·목격 기억이 따로 안 바뀜. 이벤트 `scout`는 자기 진영 로그에만 나옴(상대는 정찰 사실도 모름).
- 화면(`ui.js`): `#btn-scout`(통신 선택 때만), 범위 점선·3×3 미리보기·정찰 칸 표시(`DESIGN.hl.scout/scoutZone`), `playerScout`, 터치 첫 탭 미리보기·둘째 탭 확정, `Esc`는 정찰 선택만 취소. 옛 +20 반경·배지·설정 토글·카드 줄은 보너스 0이면 숨김. 문구 `btn.scout`·`intro.scout`·`log.scout` 등 ko/en.
- 확정(요청 추천값): 거리 6, 이동 뒤 정찰 가능, 정찰 칸은 진짜 시야, +20 제거, 쿨다운 없음(행동 1회가 대가), **AI는 정찰을 쓰지 않음**(AI 통신은 이동만).
- 검증: test 251 통과·실패 0(정찰 3개 추가), `check.js --signal20`(+20 되살림) 28건 모두 SAME = 엔진 변경은 +20 제거 말고 결과를 안 바꿈, layout-check 32 SAME, 헤드리스 PC·390x844 확인. 새 기준선 `tools/baseline.json`(28건, rulesVersion 13) 저장 완료. `check.js --signal20`은 v13 이전 기준선 비교용이라 이제 쓸 수 없음.
- 문서: `docs/rules.md` v13(통신 정찰 항목, 명중률 식, dice 통신 줄).

## 알려진 것 / 다음에 볼 곳
- AI가 정찰을 안 써서 AI 쪽 통신은 쓸모가 적음(AI가 쓰게 할지는 요청 시). 균형(거리 6·쿨다운 없음)은 직접 플레이로 판단.
- `signalRange`·`inSignalRange` AI 가중치는 그대로 남아 AI가 통신 근처에 모이는 동작은 유지됨(AI 가중치 동결 원칙).
- 튜토리얼에는 통신이 없어 정찰 단계 없음. 정찰 소리는 `ui_click` 재사용.

# (이전) HANDOFF (2026-11-21) — 러시아군 그림 세트를 춘천 외 전 시나리오에 적용 (커밋 900082f, 화면·그림만 변경)

## 끝난 것
- `art.unitSides`로 `assets/units/ru/` 7종(보병 unitScale 1.15·기갑·대전차·포병·박격포·정찰·통신)을 연결: 호스토멜 `att`, 대칭 전장 `ru`, 튜토리얼·연습 판 `enemy`(두 hidden 시나리오가 공유하는 `art` 객체). 우글레다르는 이미 적용. **춘천은 제외**(그림 테마 없음).
- 우크라이나(방어) 쪽은 기본 `unitSet: 'hostomel'` 그림(방어군용 세트, 이미 제대로 표시됨) 그대로. `ua/`에는 우글레다르 전용 정찰 1장뿐.
- 코드 변경 없음, 시나리오 파일 3개에 설정 한 줄씩(`hostomel.js`, `symmetric.js`, `tutorial.js`). 규칙·수치·AI 불변이라 시드 비교는 건너뜀.
- 검증: `node tools/test.js` 종료 코드 0(건너뜀 18, 취소 0), 호스토멜·대칭 전장 화면에서 러시아군 그림이 나오는 것을 사용자가 직접 확인. 푸시 완료(origin/master).
- 정리: `tools/out/`(`art-sheet.py` 확인용 이미지 2장)은 삭제함. 필요하면 `python tools/art-sheet.py`로 다시 만든다.

## 알려진 것 / 다음에 볼 곳
- 우크라이나군 그림은 `hostomel` 세트로 충분함. 시나리오별로 다르게 하고 싶으면 `assets/units/ua/`에 PNG를 넣고 `unitSides.ua.types`에 추가하면 연결됨.
- 튜토리얼의 적은 특정 국적이 아닌데 러시아군 그림을 씀(사용자 지시 "전체 맵 적용"에 따라 포함). 어색하면 `tutorial.js`의 `unitSides` 한 줄만 빼면 됨.
- 게임 이름 확정: 한국어 `사수`, 영어 `Hold the Line`(`STRINGS.*.gameTitle`, `index.html` `<title>`, 커밋 a64413f). 부제는 그대로. 이어하기(저장)는 사용자 결정으로 후순위.
- 이전 미결: dice 규칙 AI 사격선 이동·피해량, 없는 소리 5개·BGM, 이어하기(후순위), 우글레다르 균형.

# (이전) HANDOFF (2026-11-19) — 우글레다르 러시아군 병종 그림 + 톤 점검 도구 (태그 `stable-before-ru-art`, 화면·그림만 변경)

## 끝난 것
- 연결: 시나리오 `art.unitSides: { 진영: { dir, types, unitScale } }` (우글레다르만). `rich-map.artSources`가 `진영:병종` 키로 `assets/units/<dir>/<파일>.png`를 (optional) 불러오고, `richUnitParts`가 있으면 그 그림(긴 변 기준 크기, `unitScale` 기본 1)을, 없으면 기존 `unitSet` 그림을 쓴다. 다른 시나리오는 `unitSides`가 없어 경로 불변.
- 연결한 그림: ru = infantry(unitScale 1.15)·armor·antitank·artillery·mortar·recon·comms(통신) 7종, ua = recon. (후속: 투명 PNG 보병 교체, 포병만 보정 한도 30%)
- 도구(게임이 불러오지 않음, Python+Pillow+numpy): `tools/art-tone.py`(H·S·V 측정), `tools/art-tone-fix.py`(ru/_orig → ru/ 보정 + 투명 여백 자르고 긴 변 512px), `tools/art-sheet.py`(tools/out/ru-sheet.png, ru-vs-ua.png).
- 보정 결과(7장 모두 실제 값, 기준 중앙값 S 0.222, V 0.411): antitank S−5%·V−16%, armor V+3%, mortar S−3%, recon V−3%, infantry V−16%, artillery S−28%(포병만 한도 30%, `MAXCHG_OF`), comms 그대로. 색상·알파 불변.
- 알려진 것: `ua/_old/recon.png`는 이동이 아니라 복사(기존 정찰 그림은 hostomel 세트라 다른 시나리오가 씀). 우글레다르 기본 배치에는 ru 포병·ua 정찰이 없어 판에서는 안 보임. 보병 원본(투명 PNG)은 ru/_orig/infantry.png.

# HANDOFF (2026-11-18) — 목표 표시: 항상 보이는 목표 표시줄 + 목표 장면 (태그 `stable-before-goal-display`, 화면만 변경)

## 끝난 것: 목표 표시줄과 목표 장면 (규칙·수치·엔진·AI 불변)
- 표시줄(`#goal-bar`): 노란 막대 + 1줄 `목표: {거점 이름} 점령|방어` + 2줄 규칙 화면과 같은 승리 조건 한 줄(`objectiveLineHtml()`을 규칙 화면과 공유). 자리: 좁은 화면 = 지도 아래(지도 높이에서 뺌), PC = 오른쪽 패널 HUD 바로 아래, 휴대폰 가로 = 오른쪽 열 맨 위(지도 크기 불변) — `placeGoalBar`. 높이 700px 미만 좁은 화면은 30px 한 줄(2줄 생략)로 360x640 지도를 323→292px(−10%)에 그침. 게임 화면(`data-screen="game"`)에서만 보임(가림막·배치 중 숨김).
- 목표 장면(`showGoalScene/renderGoalScene/closeGoalScene`, `ui.goalScene`): 지도 50% 어둡게 + 거점 칸 노란 테두리·맥박(`.goal-layer`, 클래스를 `tut-layer`와 나눔: `renderTutMarks`가 비움) + 말풍선(`#goal-bubble`) + 전체 화면 투명 방패(`#goal-shield`: 클릭·Enter·Space·Esc로 닫기, 그동안 다른 입력·줌 잠금). 튜토리얼 1단계 앞(`startTutorial(0)`, n/9에 안 셈), 연습 판 시작마다, 일반 AI 판은 시나리오별 첫 시작 때만(`localStorage chuncheon1950.goalSeen`, 저장 불가면 매번). 2인 대전은 가림막 경로라 안 나옴. AI 첫 턴은 장면을 닫은 뒤 시작.
- 데이터(`js/tutorial.js`, 순수 함수): `goalInfo(sc, side)`, `validateGoalTexts`, `GOAL_DEFAULTS`·`GOAL_LIMITS`(22/28자). 시나리오 선택 필드 `goal: { nameKey?, role?, scene?: { att?, def?: {main, sub} } }`. 튜토리얼·연습·대칭 전장은 `goal.role: 'att'`(양쪽이 거점을 차지하는 판). 거점이 여럿이면 이름은 `노란 구역`. 문구 `goal.*`·`aria.goal*`(ko/en).
- 확정: beats에 넣지 않고 별도 0번 장면(beat는 goal·target·허용 입력이 필요해 검사·진행 로직에 얽힘). 표시줄은 유닛·시야·점유 상태를 읽지 않음(점유 수 표시 안 함).
- 알려진 것: 이어하기 기능이 없어 해당 분기 없음. 표시줄 2줄(승리 조건)은 문장이 길어 말줄임(전체는 `title`·규칙 화면). 영어 문구 길이는 테스트가 검사.
- 검증: 아래 최종 보고 참고.

# (이전) HANDOFF (2026-11-17) — 데모 2 (주사위 규칙 + 수치 표 + 굴림 연출) (태그 `stable-before-demo2`, `-demo2-stats`, `stable-before-dice-motion`)

## 데모 2: 간접 화력(박격포·포병)도 주사위 규칙 (태그 `stable-before-demo2-indirect`, classic·시드 결과 불변)
- 규칙: 쏘는 쪽이 `max(1, attack − 체력보정)`개를 **한 번** 굴리고, 범위 안 유닛(포병 중심+이웃 4칸, 박격포 중심 한 칸)이 같은 눈을 각자 `N = 방어 + 선 칸 지형 보너스 + (조준 칸까지 거리 −1) + (조준 칸이 내 시야 밖이면 blindPenalty)`로 따짐. 빗나간 유닛은 피해·후퇴·제압 없음, 중심이 명중해야 제압, 아군 오폭은 피해만. 사거리·쿨다운·대상 칸 방식은 classic 그대로.
- 데이터: `RULES.DICE_STATS` mortar `{attack:2, defense:4}`, artillery `{attack:3, defense:3}`(maxRange·bonusDice 불가, `diceStatsErrors`가 검사), `RULES.DICE_RULES.blindPenalty: 2`.
- 코드: `combat.js` `diceIndirectNeed/Area/Chance`, `diceAreaVisible`(화면용 시야 필터), `diceRollFaces`, `isIndirectDiceType`. 엔진 `computeHitChance`(dice.area), `resolveAttack`(이벤트 `diceUnit` 추가, 빗나간 유닛은 hits 에서 제외), AI `aiScoreAttack`(유닛별 확률)·`aiEstimateThreat`·`ai-intel.js` 위험 지도·`retreatGain(pOfVictim)`.
- 화면(`ui.js`): `diceIndHtml/diceIndHead`(시트·툴팁은 보이는 유닛만, 맹사격은 `안 보이는 칸 (+n)`), 호버 배지 `?`/`–`, `diceUnitTagFx`(착탄 뒤 보이는 유닛 위 명중/빗나감), 로그 `log.diceUnit`(보이는 유닛만)·`res.land`, 규칙 `rules.dice.6`. 포탄은 항상 조준 칸에 떨어짐(`fxEv.hit=true`)이라 안 보이는 유닛 결과가 그림으로 새지 않음. 안 보이는 적의 포격은 주사위 연출 없이 착탄만.
- 검증: test 244 통과·실패 0(간접 테스트 6개 추가), classic check.js 28건 SAME(아래 최종 보고 참고). 브라우저 PC·390x844: 시트, 결과, 맹사격, 안 보이는 적 포격.
- 알려진 것: 안 보이는 적의 사격 로그에 굴린 눈은 보임(직접 사격과 같음). AI의 제압·후퇴 평가(`symV2Attack`)는 중심 확률만 씀. 데모 2 피해량은 classic 값. `docs/rules.md` 에는 데모 2 절이 없음.


## 주사위 굴림 연출 (보여 주기만, 엔진·규칙·AI·시뮬레이션 불변)
- 새 파일 `js/dice-fx.js`(fx.js 다음): 상수 `DICE_FX`(배속 내 0.7·상대 1.6, 정지 0.8초+0.2초 간격, 문구 0.5초 뒤, 0.3초 정지, 0.2초 사라짐, 크기 60/52px 등 한 곳), 순수 함수 `diceFxTimeline/Speed/Faces/ShouldPlay/Size/Place/Palette`(테스트 대상), `diceFx.play/cancel`(캔버스 3D 10면체, reference/dice-demo.html 포팅). 호출은 `ui.js` `playDiceFx`(`playAttack` 안 `ev.rule==='dice'` 분기)와 `clearFx`(cancel)뿐. 소리 `dice_roll`·`dice_land`는 `AUDIO.files` 빈 목록(파일 없으면 조용히).
- **적용 범위: `dice` 규칙의 직접 사격만.** classic 굴림은 1~10(0~9 아님)이라 지시대로 적용 중지(기존 숫자 연출 유지), 간접 화력·튜토리얼도 classic 판정이라 그대로. 안 보이는 공격·가림 화면에서는 시작 안 함, 공격자가 안 보이면 병종·보너스 문구 생략. 화면·키 입력으로 건너뛰기, 연출 줄이기는 0.4초 결과만. 색은 공격 진영의 시나리오 색(`SIDES[x].color`)에서 파생(없으면 참고 파일의 파랑/빨강).
- 검증: test 239 통과·18 건너뜀·실패 0(연출 테스트 9개 추가), layout-check 32 SAME, 엔진 쪽 파일(engine·combat·rules·ai-intel·tutorial) 변경 없음(위 classic check.js 28건 SAME 결과 그대로). 브라우저: PC·390x844·360x640, 내 공격·적 공격·건너뛰기·연출 줄이기·classic 불변.
- 해결: 엔진 `resolveAttack` 의 `const t` 가 번역 함수 `t()` 를 가려 불법 공격 오류가 ReferenceError 로 나오던 버그를 `ut` 로 바꿔 고침(커밋 6ecef00, 시드 비교 28건 SAME, 테스트 239 통과). 지도 어둡게는 0.45.

## 데모 2 규칙 세트

## 끝난 것: 규칙 세트 스위치 `ruleset: 'classic' | 'dice'` (rulesVersion 12 그대로, classic 동작·시드 결과 불변)
- 검증: classic `check.js` 28건 모두 SAME(1020초), test 228 통과·18 건너뜀·실패 0(데모 2 테스트 8개 추가), layout-check 32건(시작 화면 6건은 메뉴 항목이 늘어 기준선 갱신). dice 는 4개 시나리오 × 난이도 3 × 진영 2 모두 끝까지 돌고 같은 시드는 같은 결과. 브라우저: PC·390x844에서 확인 시트·주사위 결과·로그·규칙 화면·메뉴.
- 새 모듈 `js/combat.js`(engine.js 다음): `rulesetOf/setRuleset`, `diceBreakdown`(A·D·지형·거리 → N·확률), `diceTargetsFrom`(네 방향 첫 유닛, maxRange), `diceRollAll`. 엔진은 `calcHitBreakdown`(+`from` 인자), `getAttackableTiles`, `resolveAttack`(이벤트에 `rule:'dice', rolls, diceCount, dice{}`), AI 후보(`aiActionOptions`), `simulateGames(opts.ruleset)` 에서 이 함수를 부른다.
- 데이터: `RULES.RULESET`, `RULES.DICE_RULES`(sides 10, terrainDivisor 10, distanceStep 1, `commsEffect: null`), **`RULES.DICE_STATS`**(`js/rules.js`, 병종별 `attack`(주사위 수)·`defense`·`maxRange`(null 무제한)·`bonusDice`{대상 병종: +n}. 수치는 이 표만 고치면 확인 시트·판정·AI·카드·규칙 화면이 같이 바뀜. 표에 attack 이 없으면 직접 사격 없음 = 박격포·포병·통신). 지형 보너스 = −(hitMod%)/10. 표 오류는 `diceStatsErrors()`가 알리고 `setRuleset('dice')`가 던짐.
- 체력 보정: `hpPenalty(u)`(engine.js, classic 과 같은 식). 주사위 수 = `max(1, attack + bonus − hpPenalty)`(attack 이 있는 유닛만), 방어 = `max(0, defense − hpPenalty)`. 확인 시트는 `주사위 4개 (대전차 +2)`·`주사위 1개 (최소)`.
- 화면(`ui.js`): 메인 메뉴 `데모 2` 항목(`ui.demo2`) → 시나리오·시작 설정 그대로 → `newGame` 에서 `setRuleset`(goMenu·튜토리얼은 classic 으로 되돌림). 상단 `데모 2` 칩(`#hud-demo2`), `showDiceConfirm`(주사위 개수·필요한 숫자·계산 한 줄·확률), `showDiceRolls`(굴린 눈 한 줄, 성공한 눈 강조), 로그 `dicelog.dice`, 규칙 화면 `diceRuleHtml`(5줄 + 튜토리얼 안내). 데모 2 에서는 통신 보너스 표시·반경을 숨김.
- 결정: 안 보이는 적은 사격선을 막지도 열지도 않음(안개 규칙, 막는 유닛 존재가 드러나지 않게). 수치 표 단계에서 직접 사격 유닛은 최소 1개 보장이라 명중 불가 조합은 없어짐(통신·간접 화력은 직접 사격 자체가 없음). 피해량(`calcDamage`)은 아직 classic 대인/대기갑 수치 기준. 위협 추정(가상 유닛)은 인접 거리로 계산. 저장: 진행 중 판 저장이 아직 없어 `ruleset` 은 `RULESET` 기본값 classic 과 판 시작 때 고정으로 처리(저장 기능이 생기면 저장 데이터에 `ruleset` 추가, 없으면 classic).
- 알려진 것: AI 이동·위협 계산(engine 1630~1740줄, ai-intel.js)은 아직 classic 기하(인접·맨해튼)라 dice 에서 AI가 사격선에 서는 법을 모름. dice 에서 AI 가 고른 공격이 실행 직전 불가능해 건너뛴 경우가 판당 0~0.3번(hostomel·대칭·부흘레다르). 수치 표 적용 전 1차 측정에서는 명중률이 약 85~90% 였고 일부 시나리오 라운드가 짧아짐(표 적용 뒤 재측정 안 함). 유닛 카드·규칙의 지형 표는 여전히 % 값. 이동 후 공격 비용·이동 후 보정 문구(`intro.maPenalty`)는 dice 에서 보정이 없어도 그대로 표시.
- 다음에 볼 곳: 플레이하며 `DICE_STATS` 수치 조정, 피해량을 `dice` 전용으로 할지 결정, 통신 새 효과(`commsEffect`), AI 사격선 이동, 이어하기(저장 시 ruleset), 유닛 설명 문구(통신 '명중률을 올립니다')가 dice 에서는 틀림.
- 튜토리얼 개편(말풍선·9단계)과 후속 수정은 커밋 2622fcf·149f8e5. 파일 필요: 없는 소리 5개, BGM. 결정 필요: 이어하기, 게임 이름, 우글레다르 균형.
- 맵 만들기(시작 메뉴 '맵 만들기'): js/custom-map.js(순수 로직: `sanitizeCustomMap`·`buildCustomScenario`(소형 전장을 복사해 맵·배치·이름만 바꿈)·`registerCustomMap`·저장소·파일 내보내기/가져오기), ui.js `showMapEdit`(10×10 편집 화면). 저장 키 `chuncheon1950.customMaps`, 최대 12개, 유닛은 자기 진영 끝 3줄에만, 진영당 최대 6기. 이름은 런타임에 `scen.custom.<id>.name` 키로 ko/en 에 넣음. 시드 비교 대상 아님(저장소에서 등록).
- 엄폐 표현 변경: 노출돼도 엄폐 때 그림(크기·어둡기·군인 배치·덮개) 유지, 붉은 테두리+배지만 추가. 사격 튀어오름(popUp)과 노출 해제 복귀 연출 삭제(`popup.up/down` 설정은 미사용).
- 할 일(다음에 볼 곳): ① 맵 만들기 미확인: 영어 화면, 휴대폰 화면(칸 44px 미만), 실제 파일 내보내기·가져오기 ② 내 맵을 지운 뒤 지난 게임 기록 조회(ui.js `SCENARIOS.find(...).nameKey` 가 undefined 일 수 있음) ③ 맵 만들기 확장형(거점·증원·승리 조건·크기 변경)은 요청 시 ④ 엄폐 연출: 첫 노출 깜빡임·박격포 화면 직접 확인 ⑤ AI 은폐 가중치 ⑥ 미추적 `assets/terrain/skirmish_assets.zip` 처리 결정.
- 방향성 엄폐(규칙 v14, 소형 전장 `directionalCover`): 참호 +4(통로를 따라 오는 종사 +0, 외톨이 전방위), 모래주머니 +2(정면 한 방향, rotation 0=N 시계 방향), 구덩이 +2, 수풀 +1(전방위), 박격포는 지형 무시. 함수 `getTerrainDefenseBonus`(js/combat.js), 데이터 `terrainRules`·`coverCells`(그림 art.cover.cells 와 같은 객체)·`defaultCover`. UI: 계산 줄 방향 표시, 호버 배지 `정면 +4`, `?debug=1` 보호 변 표시. AI: 공격·후퇴 평가는 자동 반영, 위험 지도는 기록된 적 위치 기준 근사. 내 맵은 엄폐물 칸 종류·방향을 칸 좌표로 자동 지정. 검증: test 278 통과, 소형 전장 시드 6건 DIFF(의도, 오류 0)·기준선 갱신, 다른 시나리오 시드 비교는 안 돌림(플래그 없으면 코드 안 탐). 알려진 것: 구덩이는 은폐 그대로(terrainRules.conceal 은 참고용), 방향 규칙 직접 플레이 확인 전.
- 터치 방향 표식: `showBalloon`(ui.js)이 엄폐물 빈 칸 탭 시 종류 이름·실제 방어 값(`defModTextAt`)·방향 문구(`coverNoteHtml`)와 함께 `coverFacingSvg` 표식을 `hlHover`에 3초 표시(`ui.balloonMark`), `hideBalloon`이 지움. 한계: 유닛 선택 중 탭은 이동 처리라 말풍선·표식 없음. 헤드리스 모바일 에뮬레이션으로만 확인(실기기 전), test 279 통과, 화면만 바꿨으므로 시드 비교 생략.
- 춘천 비활성화: `chuncheon.js`에 `hidden: true`(시작 화면·시드 비교 제외, 데이터·테스트 유지). `ui.js` `fallbackScenarioId`: 저장된 선택이 없거나 숨김이면 소형 전장 → 목록 첫 번째. `DEFAULT_SCENARIO_ID`는 그대로('chuncheon', 엔진·테스트 기본값). test 279 통과. 다음: 소형 전장과 나머지 전장(호스토멜·우글레다르·대칭) 격차 줄이기 — 그림·화면 먼저, 규칙(엄폐물·은폐·방향성 엄폐)은 전장별 결정 뒤 rulesVersion 갱신.
- 격차 줄이기 1단계(그림): 호스토멜·우글레다르·대칭 전장 art 에 전장 흔적(decals)·날씨(weather)·연기·잔불(smoke) 추가(소형 전장과 같은 층, 규칙 무관).
- 격차 줄이기 2단계(규칙 v18, 대칭 전장): 엄폐물 8종 16칸(점대칭 8쌍, 4~11행 평지) + `concealment`·`directionalCover`·`terrainRules`(소형 전장과 같은 값)·`coverCells`·art.cover/visual. 엄폐물 `e`·참호 `T` 는 `impassableFor: [armor, artillery]`(TERRAIN_TYPES) → 큰 유닛은 배치·이동 불가, 숨는 건 보병·정찰·박격포·통신·대전차병(통신·대전차병은 소형으로 결정). 결정: 대칭 전장에 박격포·야포 지형 무시(`ignoresTerrainWeapon`, combat.js)·제압 즉사(`suppressKill`)도 켬, 참호·철조망 없음. 검증: test 280 통과, 시드 symmetric 7건 DIFF(의도, 오류 0)·기준선 갱신, skirmish 7건 SAME.
- 다음에 볼 곳: 호스토멜·우글레다르 엄폐물(비대칭이라 균형 확인, 질문하며 진행) · 통신 유닛 그림 따로 제작(사용자 준비) · 대칭 전장 AI가 엄폐물을 노리는지 직접 플레이 확인.
- 격차 줄이기 3단계(규칙 v19, 호스토멜): 방어군 쪽 평지 9칸 엄폐물(활주로 5열·시작·낙하·증원 칸 제외, 정면형 동쪽 90) + 대칭 전장과 같은 규칙 세 가지(은폐·박격포/야포 지형 무시·제압 즉사)·방향성 엄폐·art.cover. 방침: 이 세 규칙은 "어디든 적용"(사용자 결정, 우글레다르도 배치와 함께 켬). 변경: 엄폐물·참호 진입 불가는 전차·야포뿐(대전차병은 들어감, TERRAIN_TYPES `e`·`T`). 검증: test 281 통과, 시드 hostomel·symmetric 14건 DIFF(의도, 오류 0)·기준선 갱신, skirmish 7건 SAME.
- 다음에 볼 곳: 우글레다르 엄폐물 위치(질문하며) · 호스토멜 AI(역할형)가 엄폐물을 쓰는지 직접 플레이 · 방어 승률은 AI끼리 기준 이미 0~1%(원래 그랬음) · 통신 유닛 그림(사용자 준비).
- 격차 줄이기 4단계(규칙 v20, 우글레다르): 방어군 쪽 평지 10칸 엄폐물(9~12행, 정면형은 북쪽 0, 배치·거점·숲·습지 피함) + 은폐·방향성·제압 즉사·박격포/야포 지형 무시(`vuhledar.js` `VUHLEDAR_COVER_CELLS`, terrainRules, art.cover/visual). 전차·야포는 못 들어감, 대전차병은 들어감. 호스토멜과 같은 8종 그림.
- 다음에 볼 곳: 우글레다르 직접 플레이로 균형 확인(방어군 엄폐 vs 기갑 돌파) · 호스토멜·우글레다르 AI(역할형)의 엄폐물 활용 · 툴팁 문구 시나리오별 · 영어·모바일 화면
- 같이 두기 도우미 `tools/claude-play.js`(2인 대전에서 Claude 가 한 진영을 둠, 게임 코드 변경 없음, DOM 읽기+클릭만): `CP.init(side)`→`ready/view/map/sel/move/attack/scout/wait/end`. 안개: 내 가림막을 `ready()`로 넘긴 뒤에만 읽음. 헤드리스 우글레다르에서 확인(안개 보호 4가지, 이동·안개 속 사격·보이는 적 박격포 사격·정찰·대기·턴 넘기기, 정찰 사거리 밖은 오류).
- 다음에 볼 곳: 실제 크롬에서 확인(미확인) · 직사 공격·이동/사격 선택 창의 '이동'·승패 창은 따로 시험 안 함.
- 같이 두기 1판(우글레다르 v20, 사람=방어, Claude=공격): 6라운드 러시아군 점령승(정찰 1기). 승부 사격 5번 연속 성공(약 18%)이라 한 판으로 균형 판단 불가. 사람 의견: 이전 AI 는 중앙 직진 → 중앙 집중 배치, 우회에 느린 대전차병·포를 못 옮김. 다음 판은 마을 방어 실험(맵 변경은 보류).
- 도구 수정: 가짜 pointerdown 이 지도 틀까지 올라가 사람 클릭이 막히던 버그 · `CP.sel` 이 '이동 후 공격 가능' 칸(화면 빗금)을 따로 알려 줌.
- 도구에 남은 문제: `end()` 전에 이동 후 사격이 남은 유닛을 알려 주지 않음 · 이동 후 사격 칸(빗금)은 그 자리에서 대상이 있는지까지는 알려 주지 않음(아군이 사격선을 막는 경우 놓침).
- 같이 두기 2판(우글레다르 v20): 방어(사람) 승 확정적. 사람 의견: 앞쪽 보병은 기갑 진격을 늦추는 미끼(공격 측이 보병을 무시하고 포·박격포·통신을 노렸다면 졌을 것) · 시야<사거리 + 정찰·통신의 중요성은 좋은 점 · 전력 감소 후 패배는 의도 · 검토 중: 보병 활용, 정찰병 증가, 방어 측 광역 방어 유닛(기관총류). 아직 규칙·맵 변경 없음, 하나씩 질문하며 결정.
- 규칙 v21(우글레다르): 공격 보병 4기 시작 위치 (5,2)(4,6)(4,9)(4,11). 사람이 정한 보병 역할: 마을 점령 마무리 · 전차가 못 들어가는 엄폐물 처리 · 야포/박격포 시선 분산. 테스트 282 통과·0 실패, 우글레다르 DIFF(의도)·소형 SAME·오류 0, 기준선 갱신. 다음 질문: 점령을 보병만으로 할지(미적용). 후보 보류: 정찰 증가, 방어 측 기관총류.
