'use strict';
/* =====================================================================
   시나리오: 춘천 전투 (1950)
   스키마는 rules.js 의 "시나리오 스키마" 주석 참고.
   ===================================================================== */
SCENARIOS.push({
  id: 'chuncheon',
  nameKey: 'scen.chuncheon.name', descKey: 'scen.chuncheon.desc', subKey: 'scen.chuncheon.sub',
  tags: ['asym', 'intro', 'twoPlayer'],   // 시나리오 카드의 태그 칩 (화면 전용, 문구 키 'tag.<값>')
  bgm: null,                 // 이 시나리오의 음악 (화면 전용). 예: 'sound/bgm_chuncheon' — 확장자 없이 적으면 .m4a → .mp3 → .wav 순으로 찾음. null 이면 음악 없음
  bgmLoopTrim: [0, 0],       // 반복할 때 건너뛸 앞·뒤 빈 구간 (초)
  scaleMeters: 100,
  map: [
    '^^...........^^^',
    '^.............^^',
    '^...........ff.^',
    '^^.ff.........^^',
    '^^^....ff..f.^^^',
    '^^............^^',
    '~~~~~~.~~~~~.~~~',
    '~~~~~~.~~~~~.~~~',
    '^^...w.w...w.w^^',
    '^^...##........^',
    '^.ff.#^#....ff.^',
    '^..f.###....f..^',
    '^^...........^^^',
    '^^^.........^^^^',
    '^^^^........^^^^',
    '^^^^^......^^^^^',
  ],
  sides: {
    south: { role: 'def', nameKey: 'side.south', color: '#1e88e5' },
    north: { role: 'att', nameKey: 'side.north', color: '#e53935' },
  },
  playerSide: 'south',
  turnOrder: ['south', 'north'],
  rounds: 25,
  hq: { north: [0, 7], south: [15, 8] },
  objectives: [
    { id: 'W', nameKey: 'obj.W', shortNameKey: 'obj.W.short', pos: [9, 6], startOwner: 'south' },
    { id: 'B', nameKey: 'obj.B', shortNameKey: 'obj.B.short', pos: [10, 6], startOwner: 'south' },
    { id: 'E', nameKey: 'obj.E', shortNameKey: 'obj.E.short', pos: [9, 12], startOwner: 'south' },
  ],
  deployments: [
    { round: 0, side: 'north', type: 'infantry', pos: [5, 5] }, { round: 0, side: 'north', type: 'infantry', pos: [5, 7] },
    { round: 0, side: 'north', type: 'infantry', pos: [5, 8] }, { round: 0, side: 'north', type: 'infantry', pos: [5, 9] },
    { round: 0, side: 'north', type: 'infantry', pos: [5, 11] },
    { round: 0, side: 'north', type: 'armor', pos: [5, 6] }, { round: 0, side: 'north', type: 'armor', pos: [5, 12] },
    { round: 0, side: 'north', type: 'armor', pos: [4, 9] },
    { round: 0, side: 'north', type: 'artillery', pos: [4, 6] }, { round: 0, side: 'north', type: 'artillery', pos: [4, 12] },
    { round: 0, side: 'north', type: 'recon', pos: [4, 10] },
    { round: 0, side: 'south', type: 'infantry', pos: [9, 6] }, { round: 0, side: 'south', type: 'infantry', pos: [10, 6] },
    { round: 0, side: 'south', type: 'infantry', pos: [9, 12] },
    { round: 0, side: 'south', type: 'antitank', pos: [9, 7] }, { round: 0, side: 'south', type: 'antitank', pos: [9, 11] },
    { round: 0, side: 'south', type: 'artillery', pos: [9, 5] }, { round: 0, side: 'south', type: 'artillery', pos: [9, 13] },
    { round: 0, side: 'south', type: 'signal', pos: [9, 9] },
    { round: 0, side: 'south', type: 'recon', pos: [8, 9] },
  ],
  placementZones: { south: { rows: [8, 11] }, north: { rows: [4, 5] } },
  zoneLabelKey: null,
  river: { rows: [6, 7], crossings: [[6, 6], [7, 6], [6, 12], [7, 12]] },
  aiConstants: {
    AXES: [6, 12],                     // 도하 축 (열). 한 축에 집중 (어려움)
    SPREAD: { PRIOR_ROWS: [8, 11] },   // 사전 가정: 위치를 모르는 국군 포병은 이 행 구간 어디든 있을 수 있음 (산개전술)
  },
  objectiveCheckAfter: null,
  activations: { def: 5, att: 6 },          // 역할별 한 턴 행동 한도 (직접 해 보며 조절할 시작값)
  victory: {
    north: [{ type: 'enterHQ' }, { type: 'annihilation' }, { type: 'holdObjectives', count: 3 }],
    south: [{ type: 'enterHQ' }, { type: 'annihilation' }, { type: 'surviveRounds', rounds: 25 }],
  },
});
