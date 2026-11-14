'use strict';
/* =====================================================================
   시나리오: 우글레다르 (2023년 우글레다르 방어전 모티브)
   실제 전투에서 구도만 가져온 추상화 시나리오: 고지 위 마을을 지키는 소수의 방어군과 개활지를 건너 들어오는 기갑 중심의 공격군.
   국가 이름은 글자로만 쓰고(side.ua / side.ru), 국기·휘장·실제 부대 이름·실제 병력과 손실 숫자는 없다.
   병력 수·배치·행동 제한·라운드 수는 균형을 위한 임시값 (사용자가 플레이하며 조절). 규칙·병종 수치는 공통 값 그대로.
   ===================================================================== */
SCENARIOS.push({
  id: 'vuhledar',
  nameKey: 'scen.vuhledar.name', descKey: 'scen.vuhledar.desc', subKey: 'scen.vuhledar.sub',
  tags: ['asym', 'armorArty', 'diff3'],
  bgm: null,                 // 이 시나리오의 음악 (화면 전용). 파일이 아직 없음
  bgmLoopTrim: [0, 0],
  scaleMeters: 250,
  // 아래쪽 큰 마을(11~14행)이 지킬 마을(거점). 위쪽 작은 마을(2~4행)은 엄폐물일 뿐 거점 아님.
  // 4열 6~10행 숲 한 줄 = 방풍림(규칙상 그냥 숲 f), 11~13열 7~10행 w = 습지(게임용 추가 지형)
  map: [
    '................',
    '................',
    '......##........',
    '.....###.f......',
    '......##.f......',
    '..f.....f.f.....',
    '..f.f..f.f.....f',
    '....f......ww..f',
    '....f..ff..www.f',
    '....f..ff..www..',
    '....f......ww...',
    '......###.......',
    '.....#####....f.',
    '.....#####....f.',
    '......###.......',
    '................',
  ],
  // 진영 이름은 글자 표시뿐 (국기·휘장 그림 없음). 색과 모양은 역할(def = 파랑 사각, att = 빨강 마름모)
  sides: {
    ua: { role: 'def', nameKey: 'side.ua', color: '#1e88e5' },   // 아래쪽
    ru: { role: 'att', nameKey: 'side.ru', color: '#e53935' },   // 위쪽
  },
  playerSide: 'ua',
  firstMover: 'ru',                      // 선공: 공격군 (라운드 순서 = [선공, 후공])
  rounds: 10,                            // 임시값
  hq: { ua: null, ru: null },
  objectiveControl: 'presence',          // 묶음 안에 한 칸이라도 있고 상대가 묶음 안에 없으면 점유, 양쪽이 있으면 아무도 점유 못 함
  objectives: [
    { id: 'VT', nameKey: 'obj.VT', shortNameKey: 'obj.VT.short', cells: [[12, 6], [12, 7], [13, 6], [13, 7]], startOwner: null },
  ],
  deployments: [
    // 우크라이나군 (방어, 아래쪽): 기본 배치 (직접 배치를 안 하면 이 값, 공격 AI 의 추정 위치 겸용)
    { round: 0, side: 'ua', type: 'infantry', pos: [13, 5] }, { round: 0, side: 'ua', type: 'infantry', pos: [12, 8] }, { round: 0, side: 'ua', type: 'infantry', pos: [13, 9] },
    { round: 0, side: 'ua', type: 'armor', pos: [10, 7] },
    { round: 0, side: 'ua', type: 'antitank', pos: [11, 6] }, { round: 0, side: 'ua', type: 'antitank', pos: [11, 8] },
    { round: 0, side: 'ua', type: 'artillery', pos: [14, 7] },
    { round: 0, side: 'ua', type: 'mortar', pos: [14, 5] },
    { round: 0, side: 'ua', type: 'signal', pos: [14, 10] },
    // 러시아군 (공격, 위쪽): 고정 배치. 포병 없음 (간접 화력은 박격포 1기뿐)
    { round: 0, side: 'ru', type: 'infantry', pos: [0, 4] }, { round: 0, side: 'ru', type: 'infantry', pos: [0, 8] },
    { round: 0, side: 'ru', type: 'infantry', pos: [0, 10] }, { round: 0, side: 'ru', type: 'infantry', pos: [0, 13] },
    { round: 0, side: 'ru', type: 'armor', pos: [1, 5] }, { round: 0, side: 'ru', type: 'armor', pos: [0, 6] },
    { round: 0, side: 'ru', type: 'armor', pos: [1, 9] }, { round: 0, side: 'ru', type: 'armor', pos: [0, 9] },
    { round: 0, side: 'ru', type: 'armor', pos: [1, 12] }, { round: 0, side: 'ru', type: 'armor', pos: [0, 12] },
    { round: 0, side: 'ru', type: 'mortar', pos: [0, 7] },
    { round: 0, side: 'ru', type: 'recon', pos: [1, 3] },
    { round: 0, side: 'ru', type: 'signal', pos: [0, 11] },
    // 증원 없음
  ],
  placementZones: { ua: { rows: [9, 15] }, ru: null },   // 방어군만 직접 배치 가능 (공격군은 고정)
  zoneLabelKey: 'scen.vuhledar.zone',
  river: null,
  aiConstants: {},
  aiProfiles: ['easy', 'normal', 'hard'],   // 시작 화면 난이도 목록 (강이 없어 산개전술은 어려움과 같음)
  objectiveCheckAfter: null,                // 거점 확인: 그 라운드 마지막 진영의 턴이 끝난 뒤 (호스토멜과 같은 방식)
  activations: { def: 4, att: 6 },          // 역할별 한 턴 행동 한도 (임시값: 사용자가 조절)
  // 간접 화력은 병종별 한 세트 (진영별 값은 없음). 어느 진영이 무엇을 쓰는지는 위 배치가 정함: 방어 포병 1·박격포 1, 공격 박격포 1
  fires: {
    blindFire: true,
    mortar: { range: 4, cooldown: 0, indirectPenalty: 0 },
    artillery: { range: 5, cooldown: 1 },
  },
  victory: {
    ru: [{ type: 'holdObjectives', count: 1 }, { type: 'annihilation' }],
    ua: [{ type: 'surviveRounds', rounds: 10 }, { type: 'annihilation' }],
  },
  terrainNames: { paddy: 'terrain.marsh' },
  overlays: [],
  // 그림 세트 (PC 리치 테마 전용 장식: 규칙 로직은 읽지 않음). 칸의 지형 종류는 위 지도 그대로
  art: {
    terrain: {
      plain: 'assets/terrain/plain.jpg', forest: 'assets/terrain/forest.jpg', river: 'assets/terrain/river.jpg',
      paddy: 'assets/terrain/wetland.jpg',
      city: 'assets/vuhledar/ruined-town.png',            // 파괴된 마을: 이 시나리오의 마을 칸 바닥에만 (호스토멜·춘천은 기존 질감)
    },
    unitSet: 'hostomel',                                  // 박격포 그림(assets/units/hostomel/mortar.png)이 있으면 그것, 없으면 포병 그림 70%
    impactMarks: { mortar: ['assets/vuhledar/scorch-impact.png'], artillery: ['assets/vuhledar/crater.png', 'assets/vuhledar/scorch-impact.png'] },   // 포격 자국(보기용): 박격포=작게, 포병=크게. 없으면 기능 꺼짐
    dryField: { src: 'assets/vuhledar/dry-field.png', share: 0.3 },   // 평지 칸 바닥에 노이즈 마스크로 섞는 마른 밭 (평지의 30% 안팎)
    fields: [                                             // 밀밭: 평지 칸 두 구역 (가장자리는 흐리고 불규칙). 칸은 계속 평지
      { src: 'assets/vuhledar/wheat.png', rows: [12, 14], cols: [0, 2], saturation: 0.55, brightness: 0.85 },
      { src: 'assets/vuhledar/wheat.png', rows: [2, 4], cols: [10, 14], saturation: 0.55, brightness: 0.85 },
    ],
    decor: [                                              // 장식 (유닛·선택·거점 표시보다 아래층). from/to = 줄의 첫·끝 칸 (행, 열)
      { type: 'strip', src: 'assets/vuhledar/windbreak.png', from: [6, 4], to: [10, 4], shadow: true },      // 방풍림 (세로, 4열 6~10행)
      { type: 'strip', src: 'assets/vuhledar/windbreak.png', from: [5, 11], to: [5, 14], shadow: true },  // 방풍림 (가로, 5행 11~14열: 이 칸들은 숲이 아니라 장식만)
      { type: 'strip', src: 'assets/vuhledar/dirt-road.png', from: [11, 9], to: [11, 15] },                    // 흙길 (아래쪽 마을 동쪽 → 지도 오른쪽 끝)
      // 포격 자국 (고정 장식 5개). size = 보이는 지름(칸), fill = 그림 폭 중 보이는 비율
      { type: 'scar', src: 'assets/vuhledar/scorch-impact.png', at: [9, 8], size: 0.85, fill: 0.8, rot: 20 },
      { type: 'scar', src: 'assets/vuhledar/crater.png', at: [8, 6], size: 0.78, fill: 0.95, rot: 140 },
      { type: 'scar', src: 'assets/vuhledar/scorch-impact.png', at: [6, 11], size: 0.7, fill: 0.8, rot: 250 },
      { type: 'scar', src: 'assets/vuhledar/crater.png', at: [10, 3], size: 0.62, fill: 0.95, rot: 60 },
      { type: 'scar', src: 'assets/vuhledar/scorch-impact.png', at: [4, 6], size: 0.8, fill: 0.8, rot: 330 },
    ],
    overlays: [],
  },
  arrivalRadius: 3,
});
