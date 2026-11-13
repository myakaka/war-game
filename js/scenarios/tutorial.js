'use strict';
/* =====================================================================
   튜토리얼 전용 시나리오 (시작 화면 목록에는 나오지 않음: hidden)
   - 'tutorial'         : 8단계 실습용 작은 판. 단계 데이터 tutorialSteps (js/tutorial.js 가 읽음)
   - 'tutorialPractice' : 마지막 연습 판 (일반 규칙·AI 그대로)
   규칙·병종·지형 수치는 일반 게임과 같은 데이터(rules.js)를 쓴다. 이 파일은 지도·유닛 배치·단계만 정한다.
   진영은 중립 이름(아군 ally / 적군 enemy). 국기·부대 이름 없음.
   ===================================================================== */
const TUTORIAL_FIRES = {
  blindFire: true,
  mortar: { range: 4, cooldown: 0, indirectPenalty: 0 },
  artillery: { range: 5, cooldown: 1 },
};
const TUTORIAL_RETREAT = {   // 후퇴·제압: 대칭 전장과 같은 규칙 (가르치는 내용이 실제 규칙과 같게)
  enabled: true, cause: 'enemyDamage', direct: 'awayFromAttacker', indirect: 'awayFromImpact', steps: 1,
  repeatPerHit: true, blockedIsDeath: true, passThroughFriendly: true,
  suppress: { byImpactCenter: true, sources: ['mortar', 'artillery'], duration: 1, repeatIsDeath: true },
};
const TUTORIAL_ART = {
  terrain: {
    plain: 'assets/terrain/plain.jpg', forest: 'assets/terrain/forest.jpg', river: 'assets/terrain/river.jpg',
    paddy: 'assets/terrain/wetland.jpg', city: 'assets/terrain/urban.jpg',
  },
  unitSet: 'hostomel',
  overlays: [],
};

/*
 * tutorialSteps: 단계마다
 *   id, titleKey, textKey(코치 문구), doneKey(완료 정리 문구)  — 문구 안의 수치는 js/tutorial.js tutorialParams() 가 데이터에서 채움
 *   seed          주사위 시드 (같은 단계를 다시 하면 같은 결과)
 *   setup         { units: [{ side, type, pos:[r,c], hp?, firedRound? }], round?, actUsed?(이번 턴 이미 쓴 행동 수) }
 *                 유닛 id = 진영 첫 글자 대문자 + 그 진영 안 순서 (A1, A2, …, E1, …)
 *   allowedActions { select:[id], move:{ id: 'any' | 'obj:<거점 id>' | [[r,c]] }, attack:{ id: 'any' | 'fog' | [[r,c]] }, endTurn: bool }
 *   ordered       true 면 목표 순서대로만 입력 가능
 *   goal          [{ do: 'select'|'move'|'attack'|'preview'|'selectBlocked'|'selectCooldown'|'endTurn'|'contested'|'own', unit?, at?, obj?, hl?:[[r,c]] }]
 *                 결과가 아니라 행동으로 정의 (공격은 빗나가도 완료). contested/own 은 바로 앞 행동이 만드는 상태
 *   highlight     처음 깜빡일 칸 (목표마다 hl 이 있으면 그것)
 *   enemyScript   턴 종료 때 상대 턴에 실행할 정해진 행동 [{ unit, attack:[r,c] }] (AI 는 움직이지 않음)
 */
const TUTORIAL_STEPS = [
  {
    id: 'select', titleKey: 'tut.s1.title', textKey: 'tut.s1.text', doneKey: 'tut.s1.done', seed: 11,
    setup: { units: [
      { side: 'ally', type: 'infantry', pos: [6, 3] }, { side: 'ally', type: 'infantry', pos: [6, 6] },
      { side: 'enemy', type: 'infantry', pos: [0, 1] }, { side: 'enemy', type: 'infantry', pos: [0, 6] },
    ] },
    allowedActions: { select: ['A1'], move: { A1: 'any' } },
    goal: [{ do: 'move', unit: 'A1' }],
    highlight: [[6, 3]],
  },
  {
    id: 'attack', titleKey: 'tut.s2.title', textKey: 'tut.s2.text', doneKey: 'tut.s2.done', seed: 2,
    setup: { units: [
      { side: 'ally', type: 'infantry', pos: [4, 3] },
      { side: 'enemy', type: 'infantry', pos: [3, 3] }, { side: 'enemy', type: 'infantry', pos: [0, 6] },
    ] },
    allowedActions: { select: ['A1'], attack: { A1: [[3, 3]] } },
    goal: [{ do: 'attack', unit: 'A1', hl: [[3, 3]] }],
    highlight: [[4, 3]],
  },
  {
    id: 'terrain', titleKey: 'tut.s3.title', textKey: 'tut.s3.text', doneKey: 'tut.s3.done', seed: 3,
    setup: { units: [
      { side: 'ally', type: 'infantry', pos: [2, 2] },
      { side: 'enemy', type: 'infantry', pos: [2, 1] }, { side: 'enemy', type: 'infantry', pos: [1, 2] },
    ] },
    allowedActions: { select: ['A1'], attack: { A1: [[2, 1], [1, 2]] } },
    goal: [{ do: 'preview', unit: 'A1', at: [[2, 1]], hl: [[2, 1]] }, { do: 'preview', unit: 'A1', at: [[1, 2]], hl: [[1, 2]] }],
    highlight: [[2, 2]],
  },
  {
    id: 'fog', titleKey: 'tut.s4.title', textKey: 'tut.s4.text', doneKey: 'tut.s4.done', seed: 4, ordered: true,
    setup: { units: [
      { side: 'ally', type: 'infantry', pos: [6, 3] }, { side: 'ally', type: 'mortar', pos: [7, 6] },
      { side: 'enemy', type: 'infantry', pos: [2, 3] }, { side: 'enemy', type: 'infantry', pos: [0, 7] },
    ] },
    allowedActions: { select: ['A1', 'A2'], move: { A1: [[4, 3]] }, attack: { A2: 'fog' } },
    goal: [{ do: 'move', unit: 'A1', at: [[4, 3]], hl: [[4, 3]] }, { do: 'preview', unit: 'A2', at: 'fog', hl: [[4, 6]] }],
    highlight: [[6, 3]],
  },
  {
    id: 'activation', titleKey: 'tut.s5.title', textKey: 'tut.s5.text', doneKey: 'tut.s5.done', seed: 5, ordered: true,
    setup: { actUsed: -1, units: [
      { side: 'ally', type: 'infantry', pos: [6, 2] }, { side: 'ally', type: 'infantry', pos: [6, 5] },
      { side: 'enemy', type: 'infantry', pos: [0, 1] }, { side: 'enemy', type: 'infantry', pos: [0, 6] },
    ] },
    allowedActions: { select: ['A1', 'A2'], move: { A1: 'any' }, endTurn: true },
    goal: [{ do: 'move', unit: 'A1' }, { do: 'selectBlocked', unit: 'A2' }, { do: 'endTurn' }],
    highlight: [[6, 2]],
  },
  {
    id: 'objective', titleKey: 'tut.s6.title', textKey: 'tut.s6.text', doneKey: 'tut.s6.done', seed: 6, ordered: true,
    setup: { units: [
      { side: 'ally', type: 'infantry', pos: [3, 4] }, { side: 'ally', type: 'armor', pos: [1, 6] },
      { side: 'enemy', type: 'infantry', pos: [1, 5], hp: 1 }, { side: 'enemy', type: 'infantry', pos: [0, 0] },
    ] },
    allowedActions: { select: ['A1', 'A2'], move: { A1: 'obj:T' }, attack: { A2: [[1, 5]] } },
    goal: [
      { do: 'move', unit: 'A1', at: 'obj:T', hl: [[2, 4]] }, { do: 'contested', obj: 'T' },
      { do: 'attack', unit: 'A2', hl: [[1, 5]] }, { do: 'own', obj: 'T' },
    ],
    highlight: [[3, 4]],
  },
  {
    id: 'mortar', titleKey: 'tut.s7.title', textKey: 'tut.s7.text', doneKey: 'tut.s7.done', seed: 7,
    setup: { units: [
      { side: 'ally', type: 'mortar', pos: [6, 4] }, { side: 'ally', type: 'infantry', pos: [4, 3] },
      { side: 'enemy', type: 'infantry', pos: [3, 4] }, { side: 'enemy', type: 'infantry', pos: [0, 7] },
    ] },
    allowedActions: { select: ['A1'], move: { A1: 'any' }, attack: { A1: 'any' } },
    goal: [{ do: 'attack', unit: 'A1', hl: [[3, 4]] }],
    highlight: [[6, 4]],
  },
  {
    id: 'artillery', titleKey: 'tut.s8.title', textKey: 'tut.s8.text', doneKey: 'tut.s8.done', seed: 9, ordered: true,
    setup: { units: [
      { side: 'ally', type: 'artillery', pos: [7, 3] }, { side: 'ally', type: 'infantry', pos: [3, 4] },
      { side: 'enemy', type: 'infantry', pos: [3, 3] }, { side: 'enemy', type: 'infantry', pos: [2, 3] },
      { side: 'enemy', type: 'artillery', pos: [0, 6] },
    ] },
    allowedActions: { select: ['A1'], attack: { A1: [[3, 3]] }, endTurn: true },
    goal: [{ do: 'attack', unit: 'A1', hl: [[3, 3]] }, { do: 'endTurn' }, { do: 'selectCooldown', unit: 'A1' }],
    highlight: [[7, 3]],
    enemyScript: [{ unit: 'E3', attack: [3, 4] }],
  },
];

SCENARIOS.push({
  id: 'tutorial', hidden: true,
  nameKey: 'scen.tutorial.name', descKey: 'scen.tutorial.desc', subKey: 'scen.tutorial.sub',
  scaleMeters: 100,
  map: [
    '........',
    '.f..##..',
    '.f..##..',
    '........',
    '........',
    'ww...f..',
    'ww......',
    '........',
  ],
  sides: {
    ally: { role: 'def', nameKey: 'side.ally', color: '#1e88e5' },
    enemy: { role: 'att', nameKey: 'side.enemy', color: '#e53935' },
  },
  playerSide: 'ally',
  firstMover: 'ally',
  rounds: 20,
  hq: { ally: null, enemy: null },
  objectiveControl: 'presence',
  objectives: [
    { id: 'T', nameKey: 'obj.T', shortNameKey: 'obj.T.short', cells: [[1, 4], [1, 5], [2, 4], [2, 5]], startOwner: null },
  ],
  objectivePoints: { T: 2 },
  // 기본 배치: 단계마다 setup 으로 바꾸므로 판에는 쓰이지 않음. 단계에 나오는 병종을 모두 넣어 범례·규칙 화면의 병종 목록에 나오게 함
  deployments: [
    { round: 0, side: 'ally', type: 'infantry', pos: [6, 3] }, { round: 0, side: 'ally', type: 'infantry', pos: [6, 6] },
    { round: 0, side: 'ally', type: 'armor', pos: [7, 0] }, { round: 0, side: 'ally', type: 'mortar', pos: [7, 4] }, { round: 0, side: 'ally', type: 'artillery', pos: [7, 7] },
    { round: 0, side: 'enemy', type: 'infantry', pos: [0, 1] }, { round: 0, side: 'enemy', type: 'infantry', pos: [0, 6] },
    { round: 0, side: 'enemy', type: 'artillery', pos: [0, 4] },
  ],
  placementZones: { ally: null, enemy: null },
  zoneLabelKey: null,
  river: null,
  aiConstants: {},
  objectiveCheckAfter: null,
  activations: { def: 3, att: 3 },
  fires: TUTORIAL_FIRES,
  retreat: TUTORIAL_RETREAT,
  victory: {
    ally: [{ type: 'annihilation' }, { type: 'roundLimitPoints' }],
    enemy: [{ type: 'annihilation' }, { type: 'roundLimitPoints' }],
  },
  terrainNames: { paddy: 'terrain.marsh' },
  overlays: [],
  art: TUTORIAL_ART,
  arrivalRadius: 3,
  tutorialSteps: TUTORIAL_STEPS,
});

// 연습 판: 작은 회전 대칭 지도, 양쪽 4기, 거점 1개(4칸), 5라운드. 일반 규칙과 AI(중립 모드, 쉬움)
SCENARIOS.push({
  id: 'tutorialPractice', hidden: true,
  nameKey: 'scen.practice.name', descKey: 'scen.practice.desc', subKey: 'scen.practice.sub',
  scaleMeters: 100,
  map: [
    '........',
    '..f..f..',
    '........',
    '...##...',
    '...##...',
    '........',
    '..f..f..',
    '........',
  ],
  sides: {
    ally: { role: 'def', nameKey: 'side.ally', color: '#1e88e5' },
    enemy: { role: 'att', nameKey: 'side.enemy', color: '#e53935' },
  },
  playerSide: 'ally',
  firstMover: 'ally',
  secondMoverBonus: 0,
  rounds: 5,
  hq: { ally: null, enemy: null },
  symmetric: true,
  aiProfile: 'symmetric',
  objectiveControl: 'presence',
  objectives: [
    { id: 'P', nameKey: 'obj.P', shortNameKey: 'obj.P.short', cells: [[3, 3], [3, 4], [4, 3], [4, 4]], startOwner: null },
  ],
  objectivePoints: { P: 1 },
  scoreTiming: 'ownTurnEnd',
  scoreTarget: null,
  deployments: [
    { round: 0, side: 'ally', type: 'infantry', pos: [6, 3] }, { round: 0, side: 'ally', type: 'infantry', pos: [6, 4] },
    { round: 0, side: 'ally', type: 'armor', pos: [7, 2] }, { round: 0, side: 'ally', type: 'mortar', pos: [7, 5] },
    // 적군 = 아군 칸 (r,c) → (7-r, 7-c)
    { round: 0, side: 'enemy', type: 'infantry', pos: [1, 4] }, { round: 0, side: 'enemy', type: 'infantry', pos: [1, 3] },
    { round: 0, side: 'enemy', type: 'armor', pos: [0, 5] }, { round: 0, side: 'enemy', type: 'mortar', pos: [0, 2] },
  ],
  placementZones: { ally: null, enemy: null },
  zoneLabelKey: null,
  river: null,
  aiConstants: {},
  aiProfiles: ['easy'],
  objectiveCheckAfter: null,
  activations: { def: 3, att: 3 },
  fires: TUTORIAL_FIRES,
  retreat: TUTORIAL_RETREAT,
  victory: {
    ally: [{ type: 'annihilation' }, { type: 'roundLimitPoints' }],
    enemy: [{ type: 'annihilation' }, { type: 'roundLimitPoints' }],
  },
  terrainNames: { paddy: 'terrain.marsh' },
  overlays: [],
  art: TUTORIAL_ART,
  arrivalRadius: 3,
});
