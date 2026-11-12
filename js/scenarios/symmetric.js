'use strict';
/* =====================================================================
   시나리오: 대칭 전장 (가상)
   실제 전투가 아닌 가상 시나리오. 규칙 평가용으로 두 진영의 조건이 완전히 같다 (180도 회전 대칭).
   국기·부대 마크·문양 없음: 진영은 이름 문자열과 색 고리(역할)로만 구분.
   symmetric: true 이면 validateScenario 가 지형·거점·배치·증원·행동 한도·승리 조건의 회전 대칭을 검사한다.
   ===================================================================== */
SCENARIOS.push({
  id: 'symmetric',
  nameKey: 'scen.symmetric.name', descKey: 'scen.symmetric.desc', subKey: 'scen.symmetric.sub',
  scaleMeters: 250,
  map: [
    '................',
    '.ff.............',
    '.ff..........ff.',
    '.........f..ff..',
    '.....ww.ff.ww...',
    'f.ww.ww...www.f.',
    'f.wwww.##.....f.',
    '..www.###..ww#..',
    '..#ww..###.www..',
    '.f.....##.wwww.f',
    '.f.www...ww.ww.f',
    '...ww.ff.ww.....',
    '..ff..f.........',
    '.ff..........ff.',
    '.............ff.',
    '................',
  ],
  // 역할은 화면의 색·모양만 고른다 (def = 파랑 사각, att = 빨강 마름모). AI 는 aiProfile 'symmetric' 이라 역할과 무관하게 같은 기준
  sides: {
    ua: { role: 'def', nameKey: 'side.ua', color: '#1e88e5' },   // 아래쪽 (위를 향함)
    ru: { role: 'att', nameKey: 'side.ru', color: '#e53935' },   // 위쪽 (아래를 향함)
  },
  playerSide: 'ua',
  firstMover: 'ru',                      // 선공 (turnOrder 대신). 라운드 순서 = [선공, 후공]
  secondMoverBonus: 0,                   // 후공이 첫 턴에 추가로 받는 행동 수 (행동 제한이 있을 때만)
  rounds: 14,
  hq: { ua: null, ru: null },
  symmetric: true,
  aiProfile: 'symmetric',                // AI 중립 모드: 양쪽 같은 평가 기준 (역할 분기 없음)
  objectiveControl: 'presence',          // 거점은 지금 그 안에 유닛이 있는 진영이 점유 (상대도 있으면 점유자 없음)
  objectives: [
    { id: 'SL', nameKey: 'obj.SL', shortNameKey: 'obj.SL.short', cells: [[8, 2]], startOwner: null },
    { id: 'SC', nameKey: 'obj.SC', shortNameKey: 'obj.SC.short', cells: [[7, 7], [7, 8], [8, 7], [8, 8]], startOwner: null },
    { id: 'SR', nameKey: 'obj.SR', shortNameKey: 'obj.SR.short', cells: [[7, 13]], startOwner: null },
  ],
  deployments: [
    // 러시아군 (위쪽) 시작 배치
    { round: 0, side: 'ru', type: 'infantry', pos: [3, 2] }, { round: 0, side: 'ru', type: 'infantry', pos: [3, 6] },
    { round: 0, side: 'ru', type: 'infantry', pos: [3, 10] }, { round: 0, side: 'ru', type: 'infantry', pos: [2, 13] },
    { round: 0, side: 'ru', type: 'antitank', pos: [2, 7] },
    { round: 0, side: 'ru', type: 'artillery', pos: [1, 8] },
    { round: 0, side: 'ru', type: 'mortar', pos: [1, 11] },
    { round: 0, side: 'ru', type: 'signal', pos: [1, 5] },
    { round: 0, side: 'ru', type: 'recon', pos: [3, 4] },
    { round: 0, side: 'ru', type: 'armor', pos: [2, 4] }, { round: 0, side: 'ru', type: 'armor', pos: [2, 11] },
    // 우크라이나군 (아래쪽) 시작 배치 = 러시아군 칸 (r,c) → (15-r, 15-c)
    { round: 0, side: 'ua', type: 'infantry', pos: [12, 13] }, { round: 0, side: 'ua', type: 'infantry', pos: [12, 9] },
    { round: 0, side: 'ua', type: 'infantry', pos: [12, 5] }, { round: 0, side: 'ua', type: 'infantry', pos: [13, 2] },
    { round: 0, side: 'ua', type: 'antitank', pos: [13, 8] },
    { round: 0, side: 'ua', type: 'artillery', pos: [14, 7] },
    { round: 0, side: 'ua', type: 'mortar', pos: [14, 4] },
    { round: 0, side: 'ua', type: 'signal', pos: [14, 10] },
    { round: 0, side: 'ua', type: 'recon', pos: [12, 11] },
    { round: 0, side: 'ua', type: 'armor', pos: [13, 11] }, { round: 0, side: 'ua', type: 'armor', pos: [13, 4] },
    // 증원 (양쪽 같음, 자기 턴 시작에 등장)
    { round: 4, side: 'ru', type: 'infantry', count: 2, cells: [[0, 4], [0, 5]] },
    { round: 4, side: 'ua', type: 'infantry', count: 2, cells: [[15, 11], [15, 10]] },
    { round: 8, side: 'ru', type: 'armor', pos: [0, 3] }, { round: 8, side: 'ru', type: 'infantry', pos: [0, 6] },
    { round: 8, side: 'ua', type: 'armor', pos: [15, 12] }, { round: 8, side: 'ua', type: 'infantry', pos: [15, 9] },
  ],
  placementZones: { ua: { rows: [12, 15] }, ru: { rows: [0, 3] } },   // 직접 배치: 자기 쪽 끝 4행 (회전 대칭)
  zoneLabelKey: null,
  river: null,
  aiConstants: {},
  aiProfiles: ['easy', 'normal', 'hard'],   // 시작 화면 난이도 목록 (산개전술은 어려움과 같은 단계)
  objectiveCheckAfter: null,
  activations: { def: 5, att: 5 },
  fires: {
    blindFire: true,
    mortar: { range: 4, cooldown: 0, indirectPenalty: 0 },
    artillery: { range: 5, cooldown: 1 },
  },
  // 점수제 (v10): 점유한 거점의 점수가 쌓임. 측면 두 거점은 같은 값이어야 함 (대칭 검사)
  objectivePoints: { SL: 1, SC: 2, SR: 1 },
  scoreTiming: 'ownTurnEnd',             // 'ownTurnEnd' 자기 턴을 끝낼 때 자기 점유만 · 'roundEnd' 라운드 끝에 양쪽 동시
  scoreTarget: null,                     // 한쪽 총점이 이 값에 닿으면 즉시 승리 (null = 사용 안 함)
  // 양쪽 같은 형식. 거점으로 중간에 끝나지 않음. roundLimitPoints: 마지막 라운드가 끝나면 총점 → 남은 총 체력 → 무승부
  victory: {
    ru: [{ type: 'annihilation' }, { type: 'roundLimitPoints' }],
    ua: [{ type: 'annihilation' }, { type: 'roundLimitPoints' }],
  },
  terrainNames: { paddy: 'terrain.marsh' },
  overlays: [],
  art: {
    terrain: {
      plain: 'assets/terrain/plain.jpg', forest: 'assets/terrain/forest.jpg', river: 'assets/terrain/river.jpg',
      paddy: 'assets/terrain/wetland.jpg', city: 'assets/terrain/urban.jpg',
    },
    terrainOffset: { city: [4.8, 4.8] },     // 도심 그림 시작 위치 (칸): 중앙 마을에서 거울 대칭축이 칸 중앙에 오지 않게 (호스토멜과 다른 값)
    unitSet: 'hostomel',
    overlays: [],
  },
  arrivalRadius: 3,
});
