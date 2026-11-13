# HANDOFF (2026-11-12) — 소리 연결 (작업 전 태그 `stable-before-audio`) · 그 전: 메뉴 개편 (`stable-before-menu`), 전투 효과 (`stable-before-effects`)

## 소리 (최근)
- `js/audio.js`: `AUDIO`(소리 목록 = `sound/` 실제 파일명, 동시 재생 8·같은 소리 3, 중복 0.05초, 볼륨 기본 음악 0.5·효과음 0.8), `createAudio`(첫 입력 뒤 시작·로딩, 파일 없으면 조용히, 탭 숨김 정지, BGM Web Audio 루프 + loopStart/End), 소리 전용 난수 `audioRng`. 거리·좌우·음높이 변화 없음.
- 시점·안개: `planAttackFx` 가 `sounds:[{id,at}]` 을 그림과 같은 시야 분기에서 만듦(시야 밖 발사는 낙하 소리만, 낙하 소리는 명중·빗나감 같음). `ui.js`: `sfx`(가림막 중 무음), 이동(보이는 구간만)·누름·취소·오류·턴 종료·점수(내 것만)·거점·승패, `syncBgm`, `renderAudioSettings`.
- UI: 설정에 음악/효과음 켜기·슬라이더(게임 안·메뉴 설정), 음소거 버튼 `#btn-mute`(게임 위 줄)·메뉴 모서리. 저장 `chuncheon1950.audio`. 시나리오 `bgm`·`bgmLoopTrim`(지금 null), `AUDIO.menuBgm`. `sound/credits.md` 는 틀(출처 칸 비움).
- 검증: test 123 통과(소리 5개), check 21 SAME, layout-check 32 SAME. 브라우저: 첫 입력 전 무음, 17개 로딩 약 0.4초, 포병 발사→낙하 호출, 음소거, 설정 저장.
- 한계: 파일 없는 소리 5개(shell_whistle·score_up·objective_captured·victory·defeat)와 BGM, wav 11MB(44.1kHz 16bit), file:// 오디오 태그 경로 미시험, 휴대폰 위 줄 턴 칩이 음소거 버튼 때문에 더 줄어듦, 실제 청취는 사용자 확인.

## 메뉴 개편
- `showMenu`(`js/menu.js` 의 `menuModel`: 처음 실행이면 튜토리얼 강조), `showIntro`(시나리오 카드 + 시작 설정 + `<이름> 시작 ›`). 이어하기는 저장 기능이 없어 없음(`readMenuStore` 준비만). 제목은 `gameTitle`·`gameSubtitle`.

## 전투 효과
- `js/fx.js`: `FX` 상수, `fxRng`, `planAttackFx`(이벤트 + 시야 → 연출 목록), 캔버스 입자. 지도 흔들림은 `#board-frame` CSS `translate` 만(박격포 ≈2px, 포병 ≈6px). 새 설정 없이 '연출 줄이기'에 연결. 공격 1회 연출 상한 1.5초.

## 확정된 결정
- 규칙·수치·AI 불변. 소리·연출·메뉴는 화면 전용이고 시드 비교로 확인.
- 소리는 연출 시간표와 같은 가시성 판정을 재사용(규칙을 두 번 구현하지 않음).

## 내일 이어서 (2026-11-13)
- 확인 끝(2026-11-13): 직접 청취, 휴대폰 턴 칩, `file://` 더블클릭 실행(오디오 태그 대체 경로로 17개 로딩, 소리 정상). BGM 은 `file://` 에서 Web Audio 루프가 막힐 수 있어 넣을 때 다시 확인.
- `sound/` wav 는 33MB→11MB 로 줄임(44.1kHz 16bit, 2026-11-13). 더 줄이려면 m4a/mp3(도구 없음). 없는 소리 5개·BGM 파일 추가.
- 보류: 이어하기(진행 중인 판 저장), 게임 이름 확정(`gameTitle` 임시값).

## 다음에 볼 곳
- 소리 이름·볼륨: `js/audio.js` 의 `AUDIO`. 소리 시점: `planAttackFx`(`snd`). 모양·크기: `FX`.
