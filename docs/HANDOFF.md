# HANDOFF (2026-11-10) — PC 리치 테마 + 공격 방향 전환 + GitHub 배포 (규칙 변경 없음, rulesVersion 6 유지)

## 오늘까지 한 것과 검증
- 행동 제한(v6, 11-09) → PC 리치 화면 테마 → 공격 시 유닛 방향 전환(리치 전용 연출). 엔진·규칙·AI는 리치 작업에서 무변경: `node tools/check.js` 14개 모두 SAME, `node tools/test.js` 통과 36·실패 0.
- 화면 확인은 헤드리스 Edge + CDP(Chrome 확장 미연결 시): 기본 테마·휴대폰 세로·가로의 지도 DOM과 HUD가 이전 버전과 같음, 안개 칸에 유닛·그림·배지 0, 그림 하나 빠지면 기본 테마 + 안내, file:// 동작, 창 크기·dpr 변경 시 다시 그림. 방향 전환: 보병 최대 60°, 포병 116.6° 등 전체 회전, 그림자 오프셋 고정, 링·배지 회전 0, 턴 끝나면 모두 원위치.
- git: 저장소 https://github.com/myakaka/war-game (공개). 커밋 `1aeb516`(에셋 전, 태그 `stable-before-rich-ui`) → `e2d5c02`(리치 테마) → `af429fd`(방향 전환). 작성자 이메일 오타(gamil)를 고쳐 기록을 다시 썼고 push 전이라 문제 없음. 원격 주소는 `https://myakaka@github.com/...`(이 PC에 다른 계정 karynadd 로그인이 저장돼 있어 계정 지정).
- 배포: GitHub Pages(master / root) → https://myakaka.github.io/war-game/ 에서 리치 테마까지 동작 확인. `git push` 하면 1~2분 뒤 반영.

## 주요 변경 위치
- `js/rich-map.js`(engine 다음·ui 앞): 지도 바탕 canvas. 수치는 `K`.
- `js/scenarios/hostomel.js` `art`(지형 그림, `terrainOffset.city`, `unitSet`, runway/patch). 규칙 로직은 읽지 않음.
- `js/ui.js`: `DESIGN.rich`, `applyTheme`·`loadArt`·`paintRichBg`·`themeOnLayout`, `richUnitParts`(`.unit` 그림 층 + `.unit-top`), `richCells`, 예광선·피격 링, `faceAngle`·`turnUnit`·`resetAngles`(임시 값 `rich.angle`), `renderThemeSettings`.
- `index.html`(`#theme-rows`, `#notice`), `css/style.css`(`#board.rich`), `js/strings.js`(테마 문구, 병종 배지).

## 확정된 결정
- 기본값 = 너비 900px + 마우스면 리치, 아니면 기본(휴대폰은 기본). 휴대폰에서도 설정에서 고르면 리치(시험 중, `RICH_ON_PHONE` = true, false 면 PC 넓은 화면만). 키 `chuncheon1950.theme`, `chuncheon1950.gridAlways`.
- 안개·하이라이트·거점 표식은 기존 DOM 그대로, 리치는 칸 지형 기호·격자선만 숨기고 캔버스를 깐다. 공격 대상은 붉은 칸 윤곽.
- 방향 전환은 예광선과 같은 조건에서만, 기다리지 않음(연출 시간 증가 없음). 보병·대전차 ±60°.

## 알려진 문제
- `dist/index.html` 단독으로는 그림이 없어 기본 테마(배포는 루트 index.html 로 해결). 필요하면 bundle 이 assets 복사(A안) 또는 그림 내장(B안).
- 휴대폰 리치: 칸이 17~22px 라 병종 배지·체력이 매우 작음(최소 크기 조정 필요할 수 있음, 사용자 실기기 확인 대기).
- 안개 경계에서 칸 모양이 보임. 범례 그림은 기본 기호. 실제 마우스 Chrome 에서는 아직 안 봄.

## 다음에 볼 곳
- 그림 조정: `RICH_MAP.K`, `DESIGN.rich`, 시나리오 `art`. 행동 한도 조정: 시나리오 `activations`.
