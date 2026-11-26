'use strict';
/* =====================================================================
   시나리오: 호스토멜 공항 전투 (2022)
   실제 전투에서 구도만 가져온 추상화 시나리오 (부대명·인물·피해 수치 없음).
   ===================================================================== */
// 엄폐물 칸의 종류·방향 (규칙과 그림이 같이 읽음). 방어군이 지키는 활주로 서쪽·주변 9칸, 정면형은 동쪽(90)을 향함 (공격군 강습이 동쪽에서 내림)
const HOSTOMEL_COVER_CELLS = {
  '2,6': { skin: 'crater', rotation: 0 },
  '3,4': { skin: 'sandbag', rotation: 90 },
  '4,6': { skin: 'wall', rotation: 90 },
  '6,4': { skin: 'rock', rotation: 90 },
  '6,6': { skin: 'wreck', rotation: 90 },
  '8,6': { skin: 'rubble', rotation: 0 },
  '11,4': { skin: 'sandbag', rotation: 90 },
  '13,4': { skin: 'bush', rotation: 0 },
  '13,6': { skin: 'crater', rotation: 0 },
};
SCENARIOS.push({
  id: 'hostomel',
  nameKey: 'scen.hostomel.name', descKey: 'scen.hostomel.desc', subKey: 'scen.hostomel.sub',
  tags: ['asym', 'fires', 'twoPlayer'],
  bgm: null,                 // 이 시나리오의 음악 (화면 전용). 예: 'sound/bgm_hostomel' — 확장자 없이 적으면 .m4a → .mp3 → .wav 순으로 찾음. null 이면 음악 없음
  bgmLoopTrim: [0, 0],       // 반복할 때 건너뛸 앞·뒤 빈 구간 (초)
  scaleMeters: 275,
  map: [
    'ffffffff.ffffw~f',
    'ffffffff.ffffw~f',
    'fff...e..ffffw~f',
    'fff.e....ffffw~f',
    'ff....e...fffw~f',
    'ff........fffw~f',
    '..##e.e#.....w~.',
    '..##...#.....w~.',
    '..##..e......w~.',
    '.......##....w~.',
    '.........####.~.',
    '....e....####...',
    '.........####.~.',
    '....e.e..ffff.~.',
    '.........ffff.~.',
    '.........ffff.~.',
  ],
  sides: {
    def: { role: 'def', nameKey: 'side.def', color: '#1e88e5' },
    att: { role: 'att', nameKey: 'side.att', color: '#e53935' },
  },
  playerSide: 'def',
  turnOrder: ['def', 'att'],
  rounds: 12,                          // 1라운드 ≈ 3시간
  hq: { def: null, att: null },
  objectives: [
    { id: 'RN', nameKey: 'obj.RN', shortNameKey: 'obj.RN.short', pos: [3, 5], startOwner: 'def' },
    { id: 'RC', nameKey: 'obj.RC', shortNameKey: 'obj.RC.short', pos: [7, 5], startOwner: 'def' },
    { id: 'RS', nameKey: 'obj.RS', shortNameKey: 'obj.RS.short', pos: [12, 5], startOwner: 'def' },
  ],
  deployments: [
    // 방어군 시작 배치 (기본 배치 · 공격 AI 의 추정 위치)
    { round: 0, side: 'def', type: 'infantry', pos: [3, 5] }, { round: 0, side: 'def', type: 'infantry', pos: [7, 5] },
    { round: 0, side: 'def', type: 'infantry', pos: [12, 5] }, { round: 0, side: 'def', type: 'infantry', pos: [9, 7] },
    { round: 0, side: 'def', type: 'antitank', pos: [8, 4] },
    { round: 0, side: 'def', type: 'artillery', pos: [10, 3] },
    { round: 0, side: 'def', type: 'signal', pos: [9, 5] },
    // 공격군 공중 강습 투입 (1라운드)
    { round: 1, side: 'att', type: 'infantry', count: 5, cells: [[3, 7], [4, 7], [7, 8], [11, 6], [12, 6]] },
    { round: 1, side: 'att', type: 'recon', pos: [8, 8] },
    { round: 1, side: 'att', type: 'mortar', count: 2, cells: [[3, 9], [7, 10], [5, 10]] },   // 박격포: 보병 뒤(동쪽). 세 번째 칸은 진단용 3기 배치 때만 사용
    // 방어군 증원 (남쪽 가장자리)
    { round: 3, side: 'def', type: 'infantry', count: 3, cells: [[15, 4], [15, 5], [15, 6]] },
    { round: 3, side: 'def', type: 'antitank', pos: [15, 7] },
    { round: 5, side: 'def', type: 'infantry', count: 2, cells: [[14, 4], [14, 5]] },
    { round: 5, side: 'def', type: 'artillery', pos: [14, 6] },
    // 공격군 지상 부대 (북쪽 숲길)
    { round: 8, side: 'att', type: 'armor', count: 2, cells: [[0, 8], [1, 8]] },
    { round: 8, side: 'att', type: 'infantry', count: 3, cells: [[2, 8], [3, 8], [4, 8]] },
    { round: 8, side: 'att', type: 'artillery', pos: [5, 8] },
  ],
  // 엄폐물 (대칭 전장과 같은 규칙): 방향성 엄폐 + 은폐 + 박격포·야포 지형 무시 + 제압 즉사. 엄폐물 칸 'e' 에는 전차·야포가 못 들어감 (TERRAIN_TYPES)
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
  coverCells: HOSTOMEL_COVER_CELLS,
  defaultCover: 'crater',
  placementZones: { def: { rows: [2, 13], cols: [2, 9] }, att: null },
  zoneLabelKey: 'scen.hostomel.zone',
  river: null,
  aiConstants: {},
  aiProfiles: ['easy', 'normal', 'hard'],   // 시작 화면 난이도 목록 (강이 없어 산개전술은 어려움과 같음)
  objectiveCheckAfter: null,
  activations: { def: 4, att: 4 },          // 역할별 한 턴 행동 한도 (직접 해 보며 조절할 시작값)
  fires: {                                  // 간접 화력 (규칙 v7). 값은 직접 해 보며 조절할 시작값
    blindFire: true,                        // 포병·박격포가 안개 속 칸도 목표로 고를 수 있음 (명중은 시야 밖 보정이 깎음)
    mortar: { range: 4, cooldown: 0, indirectPenalty: 0 },
    artillery: { range: 5, cooldown: 1 },
  },
  victory: {
    att: [{ type: 'holdObjectives', count: 2 }, { type: 'annihilation' }],
    def: [{ type: 'surviveRounds', rounds: 12 }, { type: 'annihilation' }],
  },
  terrainNames: { paddy: 'terrain.marsh' },
  overlays: [{ kind: 'runway', col: 5, rows: [2, 13] }],
  // 그림 세트 (PC 리치 테마 전용 장식 정보: 규칙 로직은 읽지 않음). 지형 키는 TERRAIN_TYPES 의 key
  art: {
    cover: {
      files: {
        crater: 'assets/cover/cover_crater.png', bush: 'assets/cover/cover_bush.png', sandbag: 'assets/cover/cover_sandbag.png',
        rock: 'assets/cover/cover_rock.png', rubble: 'assets/cover/cover_rubble.png', wall: 'assets/cover/cover_wall.png', ditch: 'assets/cover/cover_ditch.png', wreck: 'assets/cover/cover_wreck.png',
      },
      cells: HOSTOMEL_COVER_CELLS,
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
      sizes: { scorch: 0.75, crater: 0.55, tracks: 1.4, debris: 1.1 }, density: 0.07, alpha: 0.78,
      weights: { scorch: 0.5, crater: 0.6, tracks: 1, debris: 1.2 }, alphas: { scorch: 0.5, crater: 0.6 }, soften: { scorch: 0.06, crater: 0.04 },
    },
    weather: { birds: [{ row: 3.8, n: 3, dir: 1, ms: 75000, delay: -52000 }, { row: 10.6, n: 2, dir: -1, ms: 110000, delay: -30000 }], clouds: 3, cloudMs: 90000, fog: [{ row: 2.6, w: 0.75, ms: 52000 }, { row: 7.7, w: 0.9, ms: 64000 }, { row: 12.2, w: 0.8, ms: 58000 }] },
    smoke: [
      { at: [4, 3], dx: 0.5, dy: 0.5, n: 2, size: 0.7, ms: 7500, ember: [[0.45, 0.55]] },
      { at: [9, 3], dx: 0.5, dy: 0.5, n: 2, size: 0.6, ms: 8200 },
      { at: [13, 7], dx: 0.5, dy: 0.5, n: 2, size: 0.7, ms: 7000, ember: [[0.45, 0.55]] },
    ],
    terrain: {
      plain: 'assets/terrain/plain.jpg', forest: 'assets/terrain/forest.jpg', river: 'assets/terrain/river.jpg',
      paddy: 'assets/terrain/wetland.jpg', city: 'assets/terrain/urban.jpg',
    },
    terrainOffset: { city: [1.45, 2.2] },    // 도심 그림 시작 위치 (칸): 거울 대칭축(x 8.95·14.15, y 8.2·13.4)이 마을 경계 밖에 오게
    unitSet: 'hostomel',                       // assets/units/<unitSet>/<병종 그림>.png
    unitSides: { att: { dir: 'ru', types: ['infantry', 'armor', 'antitank', 'artillery', 'mortar', 'recon', 'signal'], unitScale: { infantry: 1.15 } } },   // 러시아군 그림 세트 (assets/units/ru/)
    overlays: [
      { type: 'runway', src: 'assets/overlays/hostomel/runway-strip.jpg' },   // 위치는 위 overlays 의 runway 표식
      { type: 'patch', src: 'assets/overlays/hostomel/airfield-patch.jpg', rows: [6, 8], cols: [2, 3], pad: 0.1 },
    ],
  },
  arrivalRadius: 3,
});
