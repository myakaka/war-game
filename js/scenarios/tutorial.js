'use strict';
/* =====================================================================
   튜토리얼 전용 시나리오 (시작 화면 목록에는 나오지 않음: hidden)
   - 'tutorial'         : 9단계 실습용 작은 판. 단계 데이터 tutorialSteps (js/tutorial.js 가 읽음)
   - 'tutorialPractice' : 마지막 연습 판 (일반 규칙·AI 그대로)
   규칙·병종·지형 수치는 일반 게임과 같은 데이터(rules.js)를 쓴다. 이 파일은 지도·유닛 배치·단계만 정한다.
   진영은 중립 이름(아군 ally / 적군 enemy). 국기·부대 이름 없음.
   ===================================================================== */
const TUTORIAL_FIRES = {
  blindFire: true,
  mortar: { range: 4, cooldown: 0, indirectPenalty: 0 },
  artillery: { range: 5, cooldown: 1 },
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
 * tutorialSteps: 큰 단계 하나(화면의 n/9)마다
 *   id, seed       단계 id, 주사위 시드 (같은 단계를 다시 하면 같은 결과)
 *   setup          { units: [{ side, type, pos:[r,c], hp?, firedRound? }], round?, actUsed?(이번 턴 이미 쓴 행동 수) }
 *                  유닛 id = 진영 첫 글자 대문자 + 그 진영 안 순서 (A1, A2, …, E1, …)
 *   enemyScript    턴 종료 때 상대 턴에 실행할 정해진 행동 [{ turn?, unit, attack:[r,c] }] (AI 는 움직이지 않음). turn = 이 단계의 몇 번째 턴 종료 때인지 (기본 1)
 *   beats          행동 하나당 말풍선 하나(하위 단계). 앞 beat 가 끝나야 다음 beat 로 넘어감
 *     hint, sub?   말풍선 본문(22자 이내)·보조 한 줄(28자 이내)의 STRINGS 키. 수치는 tutorialParams() 가 데이터에서 채움
 *     target       눌러야 할 곳: { unit: id } | { cells: [[r,c]] } | { move: id }(그 유닛이 갈 수 있는 칸 전체) | { button: 'endTurn' }
 *     card?        'preview' 목표 전용: 평소 공격 확인창 대신 튜토리얼 전용 설명 창(명중률 + 이 문구 + 확인 버튼, 공격 불가)을 띄움. STRINGS 키(120자 이내)
 *     goal         { do: 'select'|'move'|'attack'|'preview'|'selectBlocked'|'selectCooldown'|'selectSuppressed'|'endTurn', unit?, at? }
 *                  at: [[r,c]] | 'obj:<거점 id>' | 'fog' | 'any'. 결과가 아니라 행동으로 정의 (공격은 빗나가도 완료)
 *     allowedActions { select:[id], move:{ id: 'any' | 'obj:<거점 id>' | [[r,c]] }, attack:{ id: 'any' | 'fog' | [[r,c]] }, endTurn: bool }
 *     onResult     그 행동을 한 직후 결과 말풍선: [{ if?: 조건, key, sub? }] 위에서부터 처음 맞는 것 하나 (if 가 없으면 항상)
 *                  조건: 'hit' | 'miss' | 'contested' | 'owned' | 'splash' | 'blocked' | 'cooling' | 'retreat' | 'retreatBlocked' | 'suppressed' | 'selSuppressed'
 */
const TUTORIAL_STEPS = [
  {
    id: 'select', seed: 11,
    setup: { units: [
      { side: 'ally', type: 'infantry', pos: [6, 3] }, { side: 'ally', type: 'infantry', pos: [6, 6] },
      { side: 'enemy', type: 'infantry', pos: [0, 1] }, { side: 'enemy', type: 'infantry', pos: [0, 6] },
    ] },
    beats: [
      { hint: 'tb.select.1', target: { unit: 'A1' }, goal: { do: 'select', unit: 'A1' }, allowedActions: { select: ['A1'] } },
      { hint: 'tb.select.2', target: { move: 'A1' }, goal: { do: 'move', unit: 'A1' }, allowedActions: { select: ['A1'], move: { A1: 'any' } },
        onResult: [{ key: 'tr.act', sub: 'tr.act.sub' }] },
    ],
  },
  {
    id: 'attack', seed: 2,
    setup: { units: [
      { side: 'ally', type: 'infantry', pos: [4, 3] },
      { side: 'enemy', type: 'infantry', pos: [3, 3] }, { side: 'enemy', type: 'infantry', pos: [0, 6] },
    ] },
    beats: [
      { hint: 'tb.attack.1', target: { unit: 'A1' }, goal: { do: 'select', unit: 'A1' }, allowedActions: { select: ['A1'] } },
      { hint: 'tb.attack.2', sub: 'tb.attack.2s', target: { cells: [[3, 3]] }, goal: { do: 'attack', unit: 'A1' },
        allowedActions: { select: ['A1'], attack: { A1: [[3, 3]] } },
        onResult: [{ if: 'hit', key: 'tr.hit' }, { if: 'miss', key: 'tr.miss', sub: 'tr.miss.sub' }] },
    ],
  },
  {
    id: 'terrain', seed: 3,
    setup: { units: [
      { side: 'ally', type: 'infantry', pos: [2, 2] },
      { side: 'enemy', type: 'infantry', pos: [2, 1] }, { side: 'enemy', type: 'infantry', pos: [1, 2] },
    ] },
    beats: [
      { hint: 'tb.terrain.1', target: { unit: 'A1' }, goal: { do: 'select', unit: 'A1' }, allowedActions: { select: ['A1'] } },
      { hint: 'tb.terrain.2', card: 'tc.terrain.2', target: { cells: [[2, 1]] }, goal: { do: 'preview', unit: 'A1', at: [[2, 1]] },
        allowedActions: { select: ['A1'], attack: { A1: [[2, 1]] } } },
      { hint: 'tb.terrain.3', card: 'tc.terrain.3', target: { cells: [[1, 2]] }, goal: { do: 'preview', unit: 'A1', at: [[1, 2]] },
        allowedActions: { select: ['A1'], attack: { A1: [[1, 2]] } },
        onResult: [{ key: 'tr.forest' }] },
    ],
  },
  {
    id: 'fog', seed: 4,
    setup: { units: [
      { side: 'ally', type: 'infantry', pos: [6, 3] }, { side: 'ally', type: 'mortar', pos: [7, 6] },
      { side: 'enemy', type: 'infantry', pos: [2, 3] }, { side: 'enemy', type: 'infantry', pos: [0, 7] },
    ] },
    beats: [
      { hint: 'tb.fog.1', target: { unit: 'A1' }, goal: { do: 'select', unit: 'A1' }, allowedActions: { select: ['A1'] } },
      { hint: 'tb.fog.2', target: { cells: [[4, 3]] }, goal: { do: 'move', unit: 'A1', at: [[4, 3]] },
        allowedActions: { select: ['A1'], move: { A1: [[4, 3]] } } },
      { hint: 'tb.fog.3', target: { unit: 'A2' }, goal: { do: 'select', unit: 'A2' }, allowedActions: { select: ['A2'] } },
      { hint: 'tb.fog.4', card: 'tc.fog.4', target: { cells: [[4, 6]] }, goal: { do: 'preview', unit: 'A2', at: 'fog' },
        allowedActions: { select: ['A2'], attack: { A2: 'fog' } },
        onResult: [{ key: 'tr.fog' }] },
    ],
  },
  {
    id: 'activation', seed: 5,
    setup: { actUsed: -1, units: [
      { side: 'ally', type: 'infantry', pos: [6, 2] }, { side: 'ally', type: 'infantry', pos: [6, 5] },
      { side: 'enemy', type: 'infantry', pos: [0, 1] }, { side: 'enemy', type: 'infantry', pos: [0, 6] },
    ] },
    beats: [
      { hint: 'tb.activation.1', target: { unit: 'A1' }, goal: { do: 'select', unit: 'A1' }, allowedActions: { select: ['A1'] } },
      { hint: 'tb.activation.2', target: { move: 'A1' }, goal: { do: 'move', unit: 'A1' }, allowedActions: { select: ['A1'], move: { A1: 'any' } },
        onResult: [{ key: 'tr.actAll' }] },
      { hint: 'tb.activation.3', target: { unit: 'A2' }, goal: { do: 'selectBlocked', unit: 'A2' }, allowedActions: { select: ['A2'] },
        onResult: [{ if: 'blocked', key: 'tr.blocked' }] },
      { hint: 'tb.activation.4', target: { button: 'endTurn' }, goal: { do: 'endTurn' }, allowedActions: { endTurn: true },
        onResult: [{ key: 'tr.actRefill' }] },
    ],
  },
  {
    id: 'objective', seed: 6,
    setup: { units: [
      { side: 'ally', type: 'infantry', pos: [3, 4] }, { side: 'ally', type: 'armor', pos: [1, 6] },
      { side: 'enemy', type: 'infantry', pos: [1, 5], hp: 1 }, { side: 'enemy', type: 'infantry', pos: [0, 0] },
    ] },
    beats: [
      { hint: 'tb.objective.1', target: { unit: 'A1' }, goal: { do: 'select', unit: 'A1' }, allowedActions: { select: ['A1'] } },
      { hint: 'tb.objective.2', target: { cells: [[2, 4]] }, goal: { do: 'move', unit: 'A1', at: 'obj:T' },
        allowedActions: { select: ['A1'], move: { A1: 'obj:T' } },
        onResult: [{ if: 'contested', key: 'tr.contested' }] },
      { hint: 'tb.objective.3', target: { unit: 'A2' }, goal: { do: 'select', unit: 'A2' }, allowedActions: { select: ['A2'] } },
      { hint: 'tb.objective.4', target: { cells: [[1, 5]] }, goal: { do: 'attack', unit: 'A2' },
        allowedActions: { select: ['A2'], attack: { A2: [[1, 5]] } },
        onResult: [{ if: 'owned', key: 'tr.owned' }, { if: 'hit', key: 'tr.hit' }, { if: 'miss', key: 'tr.miss', sub: 'tr.miss.sub' }] },
    ],
  },
  {
    id: 'mortar', seed: 7,
    setup: { units: [
      { side: 'ally', type: 'mortar', pos: [6, 4] }, { side: 'ally', type: 'infantry', pos: [4, 3] },
      { side: 'enemy', type: 'infantry', pos: [3, 4] }, { side: 'enemy', type: 'infantry', pos: [0, 7] },
    ] },
    beats: [
      { hint: 'tb.mortar.1', target: { unit: 'A1' }, goal: { do: 'select', unit: 'A1' }, allowedActions: { select: ['A1'] } },
      { hint: 'tb.mortar.2', sub: 'tb.mortar.2s', target: { cells: [[3, 4]] }, goal: { do: 'attack', unit: 'A1' },
        allowedActions: { select: ['A1'], attack: { A1: 'any' } },
        onResult: [{ if: 'hit', key: 'tr.hit' }, { if: 'miss', key: 'tr.miss', sub: 'tr.miss.sub' }] },
    ],
  },
  {
    id: 'artillery', seed: 9,
    setup: { units: [
      { side: 'ally', type: 'artillery', pos: [7, 3] }, { side: 'ally', type: 'infantry', pos: [3, 4] },
      { side: 'enemy', type: 'infantry', pos: [3, 3] }, { side: 'enemy', type: 'infantry', pos: [2, 3] },
      { side: 'enemy', type: 'artillery', pos: [0, 6] },
    ] },
    beats: [
      { hint: 'tb.artillery.1', target: { unit: 'A1' }, goal: { do: 'select', unit: 'A1' }, allowedActions: { select: ['A1'] } },
      { hint: 'tb.artillery.2', sub: 'tb.artillery.2s', target: { cells: [[3, 3]] }, goal: { do: 'attack', unit: 'A1' },
        allowedActions: { select: ['A1'], attack: { A1: [[3, 3]] } },
        onResult: [{ if: 'splash', key: 'tr.splash' }, { if: 'hit', key: 'tr.hit' }, { if: 'miss', key: 'tr.miss', sub: 'tr.miss.sub' }] },
      { hint: 'tb.artillery.3', target: { button: 'endTurn' }, goal: { do: 'endTurn' }, allowedActions: { endTurn: true } },
      { hint: 'tb.artillery.4', target: { unit: 'A1' }, goal: { do: 'selectCooldown', unit: 'A1' }, allowedActions: { select: ['A1'] },
        onResult: [{ if: 'cooling', key: 'tr.cooling' }] },
    ],
  },
  {
    // 후퇴와 제압: 엔진 판정 그대로. 상대는 정해진 사격만 (턴 종료 세 번: 밀려남 → 뒤가 막혀 격파 → 박격포 정중앙 제압). 시드 15 에서 세 발 모두 명중
    id: 'retreat', seed: 15,
    setup: { units: [
      { side: 'ally', type: 'infantry', pos: [4, 3] }, { side: 'ally', type: 'infantry', pos: [7, 6] }, { side: 'ally', type: 'infantry', pos: [4, 6] },
      { side: 'enemy', type: 'infantry', pos: [3, 3] }, { side: 'enemy', type: 'infantry', pos: [6, 6] }, { side: 'enemy', type: 'mortar', pos: [1, 6] },
    ] },
    enemyScript: [{ turn: 1, unit: 'E1', attack: [4, 3] }, { turn: 2, unit: 'E2', attack: [7, 6] }, { turn: 3, unit: 'E3', attack: [4, 6] }],
    beats: [
      { hint: 'tb.retreat.1', sub: 'tb.retreat.1s', target: { button: 'endTurn' }, goal: { do: 'endTurn' }, allowedActions: { endTurn: true },
        onResult: [{ if: 'retreat', key: 'tr.retreat' }] },
      { hint: 'tb.retreat.2', sub: 'tb.retreat.2s', target: { button: 'endTurn' }, goal: { do: 'endTurn', n: 2 }, allowedActions: { endTurn: true },
        onResult: [{ if: 'retreatBlocked', key: 'tr.retreatBlocked' }] },
      { hint: 'tb.retreat.3', sub: 'tb.retreat.3s', target: { button: 'endTurn' }, goal: { do: 'endTurn', n: 3 }, allowedActions: { endTurn: true },
        onResult: [{ if: 'suppressed', key: 'tr.suppressed', sub: 'tr.suppressed.sub' }] },
      { hint: 'tb.retreat.4', target: { unit: 'A3' }, goal: { do: 'selectSuppressed', unit: 'A3' }, allowedActions: { select: ['A3'] },
        onResult: [{ if: 'selSuppressed', key: 'tr.suppSel', sub: 'tr.suppSel.sub' }] },
    ],
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
  victory: {
    ally: [{ type: 'annihilation' }, { type: 'roundLimitPoints' }],
    enemy: [{ type: 'annihilation' }, { type: 'roundLimitPoints' }],
  },
  terrainNames: { paddy: 'terrain.marsh' },
  overlays: [],
  art: TUTORIAL_ART,
  arrivalRadius: 3,
  tutorialSteps: TUTORIAL_STEPS,
  goal: { role: 'att' },   // 목표 표시 문구: 양쪽 모두 거점을 차지하는 판이라 '차지' 문구 (진영 역할이 방어여도)
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
  goal: { role: 'att' },
  objectiveCheckAfter: null,
  activations: { def: 3, att: 3 },
  fires: TUTORIAL_FIRES,
  victory: {
    ally: [{ type: 'annihilation' }, { type: 'roundLimitPoints' }],
    enemy: [{ type: 'annihilation' }, { type: 'roundLimitPoints' }],
  },
  terrainNames: { paddy: 'terrain.marsh' },
  overlays: [],
  art: TUTORIAL_ART,
  arrivalRadius: 3,
});
