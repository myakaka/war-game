# HANDOFF (2026-11-10) — PC 리치 화면 테마 (규칙 변경 없음, rulesVersion 6 유지)

## 끝난 것과 검증
- 작업 전 상태: git 태그 `stable-before-rich-ui` (이 폴더를 git 저장소로 새로 만듦, `assets-pack.zip` 은 .gitignore).
- 엔진·규칙·AI 무변경: `node tools/check.js` 14개 항목 모두 SAME, `node tools/test.js` 통과 36·실패 0.
- 화면 확인 (헤드리스 Edge + CDP, 스크립트는 세션 임시 폴더): 기본 테마와 휴대폰 세로·가로 화면의 지도 DOM과 HUD가 태그 버전과 글자 단위로 같음(두 시나리오). 안개 칸에 유닛·그림·배지 0개, 연출 중에도 0. 공격 측만 `rotate(180)`, 그림자 필터는 회전 바깥. 그림 하나를 지우면 기본 테마 + 상단 안내. file:// 로도 리치 동작. 창 크기·dpr 변경 시 캔버스 = 16 × 칸 × dpr.

## 주요 변경 위치
- `js/rich-map.js`(새 파일, engine 다음·ui 앞): 지도 바탕을 canvas 에 한 번 그림. 수치는 맨 위 `K`(지형 그림 크기, 블러, 마을 띠·덤불, 활주로, 비네트·입자).
- `js/scenarios/hostomel.js`: `art` (지형 키별 그림, `terrainOffset.city`, `unitSet`, `overlays` runway/patch). 규칙 로직은 읽지 않음.
- `js/ui.js`: `DESIGN.rich`(유닛 크기·링·배지·하이라이트·연출), `applyTheme`·`loadArt`·`paintRichBg`·`themeOnLayout`, `richUnitParts`(그림 층 `.unit` + 맨 위 층 `.unit-top`), `renderHighlights` 리치 분기(`richCells`), 이동 0.25초·예광선·피격 링, 설정 `renderThemeSettings`.
- `index.html`(설정 `#theme-rows`, `#notice`), `css/style.css`(`#board.rich ...`), `js/strings.js`(테마 문구, 병종 배지 글자).

## 확정된 결정
- 리치는 넓은 PC 배치에서만 켜짐(좁은 화면·휴대폰 가로는 항상 기본, 설정 항목도 숨김). 기본값 = 너비 900px 이상 + `(hover: hover) and (pointer: fine)`. 저장 키 `chuncheon1950.theme`, `chuncheon1950.gridAlways`.
- 지형·안개·하이라이트·거점 표식은 기존 DOM 그대로 두고, 리치에서는 칸별 지형 기호와 격자선만 숨기고 캔버스를 깐다(안개 판정 코드 공유).
- 격자선 항상 보기는 체크박스 대신 기존 설정과 같은 켬/끔 세그먼트.
- 마스크는 직접 만든 배열 + putImageData (getImageData·ctx.filter 안 씀). 강물 그림은 이웃 쪽 0.1칸 안으로 좁힘(장식만).
- 공격 대상 표시는 리치에서 붉은 링 대신 붉은 칸 윤곽(유닛 링과 겹치지 않게).

## 알려진 문제
- `dist/index.html` 은 `dist/assets/` 가 없어 리치 그림을 못 불러오고 기본 테마로 돌아감(안내 표시).
- 안개 덮개는 칸 단위 사각형이라 안개 경계에서 칸 모양이 보임. 범례 그림은 기본 기호 그대로.
- 실제 마우스 Chrome 에서는 아직 안 봄(헤드리스 Edge 로만 확인).

## 다음에 볼 곳
- 그림 조정: `RICH_MAP.K`(rich-map.js), `DESIGN.rich`(ui.js), 시나리오 `art`.
