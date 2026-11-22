'use strict';
/* =====================================================================
   시나리오: 소형 전장 (가상)
   10×10 칸, 양쪽 5기(보병 2·정찰 2·박격포 1). 거점 없음: 12라운드가 끝났을 때 남은 병력이 많은 쪽이 이기고,
   같으면 입은 피해가 적은 쪽(남은 총 체력이 많은 쪽)이 이긴다 (victory: roundLimitAttrition). 그것도 같으면 무승부.
   symmetric: true — 지형·배치·승리 조건이 180도 회전 대칭 (칸 (r,c) ↔ (9-r, 9-c)).
   ===================================================================== */
SCENARIOS.push({
  id: 'skirmish',
  nameKey: 'scen.skirmish.name', descKey: 'scen.skirmish.desc', subKey: 'scen.skirmish.sub',
  tags: ['sym', 'twoPlayer'],
  ruleset: 'dice',            // 이 시나리오는 항상 주사위 규칙 세트(데모 2 수치: 보병 사거리 4 등)로 진행
  bgm: null,
  bgmLoopTrim: [0, 0],
  scaleMeters: 250,
  map: [
    '..f.......',
    '.....w....',
    '.f..ww.#..',
    '....#.....',
    '...ww..f..',
    '..f..ww...',
    '.....#....',
    '..#.ww..f.',
    '....w.....',
    '.......f..',
  ],
  sides: {
    ua: { role: 'def', nameKey: 'side.ua', color: '#1e88e5' },   // 아래쪽 (위를 향함)
    ru: { role: 'att', nameKey: 'side.ru', color: '#e53935' },   // 위쪽 (아래를 향함)
  },
  playerSide: 'ua',
  firstMover: 'ru',
  secondMoverBonus: 0,
  rounds: 12,
  hq: { ua: null, ru: null },
  symmetric: true,
  aiProfile: 'symmetric',
  objectiveControl: 'presence',
  objectives: [],
  deployments: [
    // 러시아군 (위쪽) 5기
    { round: 0, side: 'ru', type: 'infantry', pos: [2, 3] }, { round: 0, side: 'ru', type: 'infantry', pos: [2, 6] },
    { round: 0, side: 'ru', type: 'recon', pos: [1, 2] }, { round: 0, side: 'ru', type: 'recon', pos: [1, 7] },
    { round: 0, side: 'ru', type: 'mortar', pos: [0, 4] },
    // 우크라이나군 (아래쪽) = 러시아군 칸 (r,c) → (9-r, 9-c)
    { round: 0, side: 'ua', type: 'infantry', pos: [7, 6] }, { round: 0, side: 'ua', type: 'infantry', pos: [7, 3] },
    { round: 0, side: 'ua', type: 'recon', pos: [8, 7] }, { round: 0, side: 'ua', type: 'recon', pos: [8, 2] },
    { round: 0, side: 'ua', type: 'mortar', pos: [9, 5] },
  ],
  placementZones: { ua: { rows: [7, 9] }, ru: { rows: [0, 2] } },   // 직접 배치: 자기 쪽 끝 3행 (회전 대칭)
  zoneLabelKey: null,
  river: null,
  aiConstants: {},
  aiProfiles: ['easy', 'normal', 'hard'],
  objectiveCheckAfter: null,
  activations: { def: 5, att: 5 },          // 한 턴 행동 한도 = 병력 수 (사실상 제한 없음)
  fires: {
    blindFire: true,
    mortar: { range: 4, cooldown: 0, indirectPenalty: 0 },
  },
  goal: { role: 'att', barKey: 'goal.bar.attrition' },   // 거점이 없어서 목표 장면은 없고 표시줄 문구만
  victory: {
    ru: [{ type: 'annihilation' }, { type: 'roundLimitAttrition' }],
    ua: [{ type: 'annihilation' }, { type: 'roundLimitAttrition' }],
  },
  terrainNames: { paddy: 'terrain.marsh' },
  overlays: [],
  art: {
    terrain: {
      plain: 'assets/terrain/plain.jpg', forest: 'assets/terrain/forest.jpg', river: 'assets/terrain/river.jpg',
      paddy: 'assets/terrain/wetland.jpg', city: 'assets/terrain/urban.jpg',
    },
    terrainOffset: { city: [3.2, 3.2] },
    unitSet: 'hostomel',
    unitSides: { ru: { dir: 'ru', types: ['infantry', 'armor', 'antitank', 'artillery', 'mortar', 'recon', 'signal'], unitScale: { infantry: 1.15 } } },
    overlays: [],
  },
  arrivalRadius: 3,
});
