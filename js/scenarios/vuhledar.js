'use strict';
/* =====================================================================
   시나리오: 우글레다르 (2023년 우글레다르 방어전 모티브)
   실제 전투에서 구도만 가져온 추상화 시나리오: 고지 위 마을을 지키는 소수의 방어군과 개활지를 건너 들어오는 기갑 중심의 공격군.
   국가 이름은 글자로만 쓰고(side.ua / side.ru), 국기·휘장·실제 부대 이름·실제 병력과 손실 숫자는 없다.
   병력 수·배치·행동 제한·라운드 수는 균형을 위한 임시값 (사용자가 플레이하며 조절). 규칙·병종 수치는 공통 값 그대로.
   ===================================================================== */
// 엄폐물 칸의 종류·방향 (규칙과 그림이 같이 읽음). 방어군 쪽 마을 앞 10칸, 정면형은 북쪽(0)을 향함 (공격군이 북쪽에서 내려옴)
const VUHLEDAR_COVER_CELLS = {
  '9,6': { skin: 'wall', rotation: 0 },
  '9,9': { skin: 'rock', rotation: 0 },
  '10,3': { skin: 'crater', rotation: 0 },
  '10,5': { skin: 'sandbag', rotation: 0 },
  '10,8': { skin: 'wreck', rotation: 0 },
  '10,13': { skin: 'bush', rotation: 0 },
  '11,5': { skin: 'rubble', rotation: 0 },
  '11,9': { skin: 'sandbag', rotation: 0 },
  '12,3': { skin: 'bush', rotation: 0 },
  '12,11': { skin: 'ditch', rotation: 0 },
};
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
    '....f.effe.www..',
    '...efe..e..wwe..',
    '.....e###e......',
    '...e.#####.e..f.',
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
    // 보병 4기만 앞(4~5행: 방풍림·위쪽 마을)에서 출발 (v21: 이동력 2 로는 0행에서 마을까지 닿기 어려움)
    { round: 0, side: 'ru', type: 'infantry', pos: [5, 2] }, { round: 0, side: 'ru', type: 'infantry', pos: [4, 6] },
    { round: 0, side: 'ru', type: 'infantry', pos: [4, 9] }, { round: 0, side: 'ru', type: 'infantry', pos: [4, 11] },
    { round: 0, side: 'ru', type: 'armor', pos: [1, 5] }, { round: 0, side: 'ru', type: 'armor', pos: [0, 6] },
    { round: 0, side: 'ru', type: 'armor', pos: [1, 9] }, { round: 0, side: 'ru', type: 'armor', pos: [0, 9] },
    { round: 0, side: 'ru', type: 'armor', pos: [1, 12] }, { round: 0, side: 'ru', type: 'armor', pos: [0, 12] },
    { round: 0, side: 'ru', type: 'mortar', pos: [0, 7] },
    { round: 0, side: 'ru', type: 'recon', pos: [1, 3] },
    { round: 0, side: 'ru', type: 'signal', pos: [0, 11] },
    // 증원 없음
  ],
  // 엄폐물 (대칭 전장·호스토멜과 같은 규칙): 방향성 엄폐 + 은폐 + 박격포·야포 지형 무시 + 제압 즉사. 엄폐물 칸 'e' 에는 전차·야포가 못 들어감 (TERRAIN_TYPES)
  concealment: { reconRadius: 2, otherRadius: 1 },
  mortarIgnoresTerrain: true,
  suppressKill: true,
  directionalCover: true,
  terrainRules: {
    sandbag: { defense: 2, conceal: true, directional: 'facing' },
    crater:  { defense: 2, conceal: true, directional: 'all' },
    bush:    { defense: 1, conceal: true, directional: 'all' },
    rock:    { defense: 3, conceal: true, directional: 'facing' },
    wreck:   { defense: 3, conceal: true, directional: 'facing' },
    wall:    { defense: 2, conceal: true, directional: 'facing' },
    ditch:   { defense: 2, conceal: true, directional: 'all' },
    rubble:  { defense: 2, conceal: true, directional: 'all' },
  },
  coverCells: VUHLEDAR_COVER_CELLS,
  defaultCover: 'crater',
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
    cover: {
      files: {
        crater: 'assets/cover/cover_crater.png', bush: 'assets/cover/cover_bush.png', sandbag: 'assets/cover/cover_sandbag.png',
        rock: 'assets/cover/cover_rock.png', rubble: 'assets/cover/cover_rubble.png', wall: 'assets/cover/cover_wall.png', ditch: 'assets/cover/cover_ditch.png', wreck: 'assets/cover/cover_wreck.png',
      },
      cells: VUHLEDAR_COVER_CELLS,
    },
    visual: {
      cover: { crater: { dx: 0, dy: 0, scale: 1 }, bush: { dx: 0, dy: 0, scale: 1 }, sandbag: { dx: 0, dy: 0, scale: 1.25 },
        rock: { dx: 0, dy: 0, scale: 1 }, rubble: { dx: 0, dy: 0, scale: 1.05 }, wall: { dx: 0, dy: 0, scale: 1.5 }, ditch: { dx: 0, dy: 0, scale: 1.05 }, wreck: { dx: 0, dy: 0, scale: 1.25 } },
      units: { scaleInCrater: 0.85, scaleInBush: 0.90, scaleInSandbag: 0.90, fadeBottomCrater: 0.12, sandbagOffset: 0.30, sandbagOverlayAlpha: 0.3, bushOverlayAlpha: 0.6, bushUnitAlpha: 0.85 },
      cellOverrides: {},
    },
    // 전장 흔적·날씨·연기 (소형 전장과 같은 장식 층, 규칙 무관, 리치 테마 전용)
    decals: {
      files: { scorch: 'assets/decal/decal_scorch.png', crater: 'assets/decal/decal_crater.png', tracks: 'assets/decal/decal_tracks.png', debris: 'assets/decal/decal_debris.png' },
      sizes: { scorch: 0.75, crater: 0.55, tracks: 1.4, debris: 1.1 }, density: 0.05, alpha: 0.78,
      weights: { scorch: 0.3, crater: 0.3, tracks: 1, debris: 1.2 }, alphas: { scorch: 0.5, crater: 0.6 }, soften: { scorch: 0.06, crater: 0.04 },
    },
    weather: { birds: [{ row: 3.8, n: 3, dir: 1, ms: 75000, delay: -52000 }, { row: 10.6, n: 2, dir: -1, ms: 110000, delay: -30000 }], clouds: 3, cloudMs: 90000, fog: [{ row: 2.6, w: 0.75, ms: 52000 }, { row: 7.7, w: 0.9, ms: 64000 }, { row: 12.2, w: 0.8, ms: 58000 }] },
    smoke: [
      { at: [11, 6], dx: 0.5, dy: 0.5, n: 2, size: 0.8, ms: 7000, ember: [[0.45, 0.55]] },
      { at: [14, 8], dx: 0.5, dy: 0.5, n: 2, size: 0.7, ms: 7800 },
      { at: [3, 6], dx: 0.5, dy: 0.5, n: 2, size: 0.7, ms: 7500, ember: [[0.45, 0.55]] },
      { at: [9, 8], dx: 0.5, dy: 0.5, n: 2, size: 0.6, ms: 8200 },
    ],
    terrain: {
      plain: 'assets/terrain/plain.jpg', forest: 'assets/terrain/forest.jpg', river: 'assets/terrain/river.jpg',
      paddy: 'assets/terrain/wetland.jpg',
      city: 'assets/vuhledar/ruined-town.webp',            // 파괴된 마을: 이 시나리오의 마을 칸 바닥에만 (호스토멜·춘천은 기존 질감)
    },
    unitSet: 'hostomel',                                  // 박격포 그림(assets/units/hostomel/mortar.png)이 있으면 그것, 없으면 포병 그림 70%
    // 진영별 그림 (이 시나리오만): 러시아군 = assets/units/ru/, 우크라이나군 정찰 = assets/units/ua/recon.png. 나머지는 위 unitSet.
    unitSides: {
      ru: { dir: 'ru', types: ['infantry', 'armor', 'antitank', 'artillery', 'mortar', 'recon', 'signal'], unitScale: { infantry: 1.15 } },
      ua: { dir: 'ua', types: ['recon'], unitScale: {} },
    },
    impactMarks: { mortar: ['assets/vuhledar/scorch-impact.webp'], artillery: ['assets/vuhledar/crater.webp', 'assets/vuhledar/scorch-impact.webp'] },   // 포격 자국(보기용): 박격포=작게, 포병=크게. 없으면 기능 꺼짐
    dryField: { src: 'assets/vuhledar/dry-field.webp', share: 0.3 },   // 평지 칸 바닥에 노이즈 마스크로 섞는 마른 밭 (평지의 30% 안팎)
    fields: [                                             // 밀밭: 평지 칸 두 구역 (가장자리는 흐리고 불규칙). 칸은 계속 평지
      { src: 'assets/vuhledar/wheat.webp', rows: [12, 14], cols: [0, 2], saturation: 0.55, brightness: 0.85 },
      { src: 'assets/vuhledar/wheat.webp', rows: [2, 4], cols: [10, 14], saturation: 0.55, brightness: 0.85 },
    ],
    decor: [                                              // 장식 (유닛·선택·거점 표시보다 아래층). from/to = 줄의 첫·끝 칸 (행, 열)
      { type: 'strip', src: 'assets/vuhledar/windbreak.webp', from: [6, 4], to: [10, 4], shadow: true },      // 방풍림 (세로, 4열 6~10행)
      { type: 'strip', src: 'assets/vuhledar/windbreak.webp', from: [5, 11], to: [5, 14], shadow: true },  // 방풍림 (가로, 5행 11~14열: 이 칸들은 숲이 아니라 장식만)
      { type: 'strip', src: 'assets/vuhledar/dirt-road.webp', from: [11, 9], to: [11, 15] },                    // 흙길 (아래쪽 마을 동쪽 → 지도 오른쪽 끝)
      // 포격 자국 (고정 장식 5개). size = 보이는 지름(칸), fill = 그림 폭 중 보이는 비율
      { type: 'scar', src: 'assets/vuhledar/scorch-impact.webp', at: [9, 8], size: 0.85, fill: 0.8, rot: 20 },
      { type: 'scar', src: 'assets/vuhledar/crater.webp', at: [8, 6], size: 0.78, fill: 0.95, rot: 140 },
      { type: 'scar', src: 'assets/vuhledar/scorch-impact.webp', at: [6, 11], size: 0.7, fill: 0.8, rot: 250 },
      { type: 'scar', src: 'assets/vuhledar/crater.webp', at: [10, 3], size: 0.62, fill: 0.95, rot: 60 },
      { type: 'scar', src: 'assets/vuhledar/scorch-impact.webp', at: [4, 6], size: 0.8, fill: 0.8, rot: 330 },
    ],
    overlays: [],
  },
  arrivalRadius: 3,
});
