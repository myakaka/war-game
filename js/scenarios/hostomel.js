'use strict';
/* =====================================================================
   시나리오: 호스토멜 공항 전투 (2022)
   실제 전투에서 구도만 가져온 추상화 시나리오 (부대명·인물·피해 수치 없음).
   ===================================================================== */
SCENARIOS.push({
  id: 'hostomel',
  nameKey: 'scen.hostomel.name', descKey: 'scen.hostomel.desc', subKey: 'scen.hostomel.sub',
  scaleMeters: 275,
  map: [
    'ffffffff.ffffw~f',
    'ffffffff.ffffw~f',
    'fff......ffffw~f',
    'fff......ffffw~f',
    'ff........fffw~f',
    'ff........fffw~f',
    '..##...#.....w~.',
    '..##...#.....w~.',
    '..##.........w~.',
    '.......##....w~.',
    '.........####.~.',
    '.........####...',
    '.........####.~.',
    '.........ffff.~.',
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
  placementZones: { def: { rows: [2, 13], cols: [2, 9] }, att: null },
  zoneLabelKey: 'scen.hostomel.zone',
  river: null,
  aiConstants: {},
  objectiveCheckAfter: null,
  activations: { def: 4, att: 4 },          // 역할별 한 턴 행동 한도 (직접 해 보며 조절할 시작값)
  victory: {
    att: [{ type: 'holdObjectives', count: 2 }, { type: 'annihilation' }],
    def: [{ type: 'surviveRounds', rounds: 12 }, { type: 'annihilation' }],
  },
  terrainNames: { paddy: 'terrain.marsh' },
  overlays: [{ kind: 'runway', col: 5, rows: [2, 13] }],
  arrivalRadius: 3,
});
