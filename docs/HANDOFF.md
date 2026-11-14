# HANDOFF (2026-11-14) — 우글레다르 시나리오 추가 (작업 전 태그 `stable-before-vuhledar`) · 그 전: 후퇴·제압 전역화 (rulesVersion 12)

## 우글레다르 (최근, 새 시나리오 데이터만. 규칙·엔진·AI 로직 변경 없음)
- `js/scenarios/vuhledar.js` + `index.html` script 한 줄. 진영 `ua`(방어, 파랑, 아래쪽)·`ru`(공격, 빨강, 위쪽), 이름은 기존 `side.ua/side.ru` 글자뿐. 16x16, 거점 = 아래쪽 마을 2x2 묶음(`presence`), 10라운드, 공격 선공, 행동 한도 방어 4·공격 6, 증원 없음, `fires` 는 병종별 한 세트(러시아군은 포병 유닛이 없어 박격포만), 방어군만 배치 구역 9~15행. 승리: 공격 `holdObjectives` 1(방어 턴 끝난 뒤 확인) / 방어 `surviveRounds` 10 / 전멸. 병력·배치·한도·라운드는 임시값(사용자가 조절).
- 그림(PC 리치, 모두 `art` 데이터로 켜짐, 다른 시나리오는 그대로): `rich-map.js` 에 `art.dryField`(평지에 노이즈로 섞는 마른 밭, 30%), `art.fields`(밀밭, 채도 55%·밝기 85%, 가장자리 흐림, 평지 칸에만), `art.decor`(`strip` 방풍림·흙길 + 그림자, `scar` 포격 자국 5개), `art.terrain.city` 교체(파괴된 마을은 이 시나리오만), 로더는 `decor` 이미지. 방어가 아래쪽이라 `flipFacing` 은 쓰지 않음(기능은 남아 있음, `richBaseDeg`). 처음엔 방어가 위쪽이었고 지도를 위아래 반전함.
- 그림 파일: `assets/` 루트의 한글 이름 8장 중 7장을 `assets/vuhledar/` 영문 이름으로 `git mv`(ruined-town, dry-field, wheat, windbreak, dirt-road, scorch-impact, crater). `평행 고랑이 이어진 경작지.png` 는 용도 없어 그대로. 포격 자국 그림은 2종뿐이라 5개에 돌려 씀(요청은 3종). 7장은 WebP(q82, 원래 크기)로 변환해 19.3MB → 2.9MB(원본 PNG 는 git 기록에 있음).
- 문구: `scen.vuhledar.*`, `obj.VT`, 태그 `tag.armorArty`·`tag.diff3`. 카드 미리보기는 `art.terrain` 으로 자동. BGM `null`.
- 검증: test 200 통과(우글레다르 데이터·검증·simulateGames 3난이도·승리 조건·그림 데이터·안개, 후퇴·구 AI 파라미터화에 포함), check: 기존 세 시나리오 21항목 SAME, 우글레다르 7항목은 기준선 없음→`--save` 로 추가, layout-check 32 SAME. 브라우저(PC 리치, 휴대폰 리치·기본): 카드·시작 시트·배치·게임 화면, 방향 옵션(방어 180도), 호스토멜 그대로 확인.
- 진단(n=40, 난이도별 `tools/vuhledar-diag-*.json`): 생성 `node tools/retreat-diag.js vuhledar <난이도> 40 <out>`. 관찰: 러시아군 보병은 느려서 9라운드에도 10~11행(기갑이 앞서감), 러시아군 보병 손실 0, 공격군 점유는 평균 9~9.4라운드에 시작.
- 시작 배치(보고만): 러시아군 13기 중 9기가 15행(맵 끝: 보병 4·기갑 3·박격포 1·통신 1), 위에서 맞으면 후퇴할 곳이 없어 격파. 우크라이나군은 맵 끝·이동 불가 지형 옆 0기. 증원 칸 없음.
- 알려진 것: 방풍림 가로 줄 `(10행, 11~14열)` 은 지도상 숲이 아니라 장식만. 시나리오 `scaleMeters` 250 은 가정값. 큰 이미지 때문에 첫 로딩이 느릴 수 있음.

## 후퇴·제압 전역화 (그 전)
- 규칙 `docs/rules.md` 후퇴와 제압, 수치 `RULES.RETREAT`, AI 공통 모듈 `ai-intel.js`. 이어하기 UI 는 아직 없음(`upgradeSavedState`·`rulesNoticeNeeded` 준비됨).
- 포격 자국(보기 전용): `fx.js` `planImpactMark/markShape/addMark`, `ui.js` `recordImpactMark/marksHtml/ui.marks`(진영별, 본 낙하만), `art.impactMarks`(우글레다르만). 엔진·규칙·저장 무관.

## 다음에 볼 곳
- 없는 소리 5개·BGM, 이어하기, 게임 이름 확정. 우글레다르 균형(임시값)과 이미지 용량 최적화는 직접 플레이 뒤 판단.
