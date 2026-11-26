'use strict';
/* =====================================================================
   시나리오: 대칭 전장 (가상)
   실제 전투가 아닌 가상 시나리오. 규칙 평가용으로 두 진영의 조건이 완전히 같다 (180도 회전 대칭).
   국기·부대 마크·문양 없음: 진영은 이름 문자열과 색 고리(역할)로만 구분.
   symmetric: true 이면 validateScenario 가 지형·거점·배치·증원·행동 한도·승리 조건의 회전 대칭을 검사한다.
   ===================================================================== */
// 엄폐물 칸의 종류·방향 (규칙과 그림이 같이 읽음). 점대칭 쌍 (r,c) ↔ (15-r,15-c), 방향은 180도 돌린 값. 정면형은 중앙을 향함
const SYMMETRIC_COVER_CELLS = {
  '4,3': { skin: 'bush', rotation: 0 },
  '4,10': { skin: 'sandbag', rotation: 180 },
  '4,13': { skin: 'rock', rotation: 180 },
  '5,4': { skin: 'rubble', rotation: 0 },
  '5,7': { skin: 'wall', rotation: 180 },
  '5,9': { skin: 'ditch', rotation: 0 },
  '6,12': { skin: 'crater', rotation: 0 },
  '7,10': { skin: 'wreck', rotation: 180 },
  '8,5': { skin: 'wreck', rotation: 0 },
  '9,3': { skin: 'crater', rotation: 180 },
  '10,6': { skin: 'ditch', rotation: 180 },
  '10,8': { skin: 'wall', rotation: 0 },
  '10,11': { skin: 'rubble', rotation: 180 },
  '11,2': { skin: 'rock', rotation: 0 },
  '11,5': { skin: 'sandbag', rotation: 0 },
  '11,12': { skin: 'bush', rotation: 90 },
};
SCENARIOS.push({
  id: 'symmetric',
  nameKey: 'scen.symmetric.name', descKey: 'scen.symmetric.desc', subKey: 'scen.symmetric.sub',
  tags: ['sym', 'points', 'twoPlayer'],
  bgm: null,                 // 이 시나리오의 음악 (화면 전용). 예: 'sound/bgm_symmetric' — 확장자 없이 적으면 .m4a → .mp3 → .wav 순으로 찾음. null 이면 음악 없음
  bgmLoopTrim: [0, 0],       // 반복할 때 건너뛸 앞·뒤 빈 구간 (초)
  scaleMeters: 250,
  map: [
    '................',
    '.ff.............',
    '.ff..........ff.',
    '.........f..ff..',
    '...e.ww.ffewwe..',
    'f.wwewwe.ewww.f.',
    'f.wwww.##...e.f.',
    '..www.###.eww#..',
    '..#wwe.###.www..',
    '.f.e...##.wwww.f',
    '.f.wwwe.ewweww.f',
    '..ewweff.ww.e...',
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
    // 러시아군 (위쪽) 시작 배치 (7기)
    { round: 0, side: 'ru', type: 'infantry', pos: [3, 6] }, { round: 0, side: 'ru', type: 'infantry', pos: [3, 10] },
    { round: 0, side: 'ru', type: 'antitank', pos: [2, 7] },
    { round: 0, side: 'ru', type: 'artillery', pos: [1, 8] },
    { round: 0, side: 'ru', type: 'mortar', pos: [1, 11] },
    { round: 0, side: 'ru', type: 'signal', pos: [1, 5] },
    { round: 0, side: 'ru', type: 'armor', pos: [2, 4] },
    // 우크라이나군 (아래쪽) 시작 배치 = 러시아군 칸 (r,c) → (15-r, 15-c)
    { round: 0, side: 'ua', type: 'infantry', pos: [12, 9] }, { round: 0, side: 'ua', type: 'infantry', pos: [12, 5] },
    { round: 0, side: 'ua', type: 'antitank', pos: [13, 8] },
    { round: 0, side: 'ua', type: 'artillery', pos: [14, 7] },
    { round: 0, side: 'ua', type: 'mortar', pos: [14, 4] },
    { round: 0, side: 'ua', type: 'signal', pos: [14, 10] },
    { round: 0, side: 'ua', type: 'armor', pos: [13, 11] },
    // 증원 (양쪽 같음, 자기 턴 시작에 등장)
    { round: 4, side: 'ru', type: 'infantry', count: 2, cells: [[0, 4], [0, 5]] },
    { round: 4, side: 'ua', type: 'infantry', count: 2, cells: [[15, 11], [15, 10]] },
    { round: 8, side: 'ru', type: 'armor', pos: [0, 3] }, { round: 8, side: 'ru', type: 'infantry', pos: [0, 6] },
    { round: 8, side: 'ua', type: 'armor', pos: [15, 12] }, { round: 8, side: 'ua', type: 'infantry', pos: [15, 9] },
  ],
  placementZones: { ua: { rows: [12, 15] }, ru: { rows: [0, 3] } },   // 직접 배치: 자기 쪽 끝 4행 (회전 대칭)
  // 직접 편성 (시작 옵션): 포인트 안에서 병종을 골라 시작 부대를 짬. '기본' 편성이면 아래 값은 쓰이지 않음. 가격·예산은 임시값 (사용자가 조절)
  // 증원(위 deployments 의 round 4·8)은 직접 편성에서도 그대로 (양쪽 같음)
  draft: {
    enabled: true,
    costs: { infantry: 2, recon: 2, signal: 2, antitank: 3, mortar: 3, armor: 10, artillery: 5 },
    budget: 27,                                   // 기본 편성의 비용 합계 (테스트가 검증)
    limits: { signal: 1, armor: 1 },              // 병종별 최대 수 (없으면 제한 없음). 통신 보너스는 겹치지 않으므로 1, 기갑은 상위 호환이라 기본 편성 수(1)로 제한
    minUnits: 1,
    deployRows: { ua: [12, 15], ru: [0, 3] },     // 자동 배치 구역 (= placementZones 와 같아야 함)
    // AI 가 고르는 편성. 쉬움 = 첫 번째(balanced)만, 보통·어려움 = 무작위
    presets: [
      { id: 'balanced', nameKey: 'draft.preset.balanced', counts: { infantry: 2, antitank: 1, artillery: 1, mortar: 1, signal: 1, armor: 1 } },
      { id: 'armor', nameKey: 'draft.preset.armor', counts: { infantry: 3, antitank: 2, signal: 1, recon: 1, armor: 1 } },
      { id: 'fires', nameKey: 'draft.preset.fires', counts: { infantry: 3, artillery: 2, mortar: 2, signal: 1, recon: 1 } },
      { id: 'infantry', nameKey: 'draft.preset.infantry', counts: { infantry: 8, antitank: 2, mortar: 1, signal: 1 } },
    ],
  },
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
  goal: { role: 'att' },                 // 목표 표시 문구: 양쪽 모두 거점을 차지하는 판 ('차지' 문구)
  scoreTiming: 'ownTurnEnd',             // 'ownTurnEnd' 자기 턴을 끝낼 때 자기 점유만 · 'roundEnd' 라운드 끝에 양쪽 동시
  scoreTarget: null,                     // 한쪽 총점이 이 값에 닿으면 즉시 승리 (null = 사용 안 함)
  // 양쪽 같은 형식. 거점으로 중간에 끝나지 않음. roundLimitPoints: 마지막 라운드가 끝나면 총점 → 남은 총 체력 → 무승부
  victory: {
    ru: [{ type: 'annihilation' }, { type: 'roundLimitPoints' }],
    ua: [{ type: 'annihilation' }, { type: 'roundLimitPoints' }],
  },
  // 엄폐물 (소형 전장과 같은 규칙: 방향성 엄폐 + 은폐). 엄폐물 칸('e')에는 전차·야포·대전차포가 못 들어가므로(TERRAIN_TYPES 'e' impassableFor) 숨는 것은 소형 병종뿐
  concealment: { reconRadius: 2, otherRadius: 1 },
  mortarIgnoresTerrain: true,         // 박격포·야포 판정에서 지형 방어 보너스 0 (고각 사격)
  suppressKill: true,                 // 제압된 유닛은 어떤 공격이든 명중하면 즉사. 제압은 상대 다음 턴 시작에 풀림
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
  coverCells: SYMMETRIC_COVER_CELLS,
  defaultCover: 'crater',
  terrainNames: { paddy: 'terrain.marsh' },
  overlays: [],
  art: {
    cover: {
      files: {
        crater: 'assets/cover/cover_crater.png', bush: 'assets/cover/cover_bush.png', sandbag: 'assets/cover/cover_sandbag.png',
        rock: 'assets/cover/cover_rock.png', rubble: 'assets/cover/cover_rubble.png', wall: 'assets/cover/cover_wall.png', ditch: 'assets/cover/cover_ditch.png', wreck: 'assets/cover/cover_wreck.png',
      },
      cells: SYMMETRIC_COVER_CELLS,
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
      weights: { scorch: 0.5, crater: 0.7, tracks: 1, debris: 1.2 }, alphas: { scorch: 0.5, crater: 0.6 }, soften: { scorch: 0.06, crater: 0.04 },
    },
    weather: { birds: [{ row: 3.8, n: 3, dir: 1, ms: 75000, delay: -52000 }, { row: 10.6, n: 2, dir: -1, ms: 110000, delay: -30000 }], clouds: 3, cloudMs: 90000, fog: [{ row: 2.6, w: 0.75, ms: 52000 }, { row: 7.7, w: 0.9, ms: 64000 }, { row: 12.2, w: 0.8, ms: 58000 }] },
    smoke: [
      { at: [6, 7], dx: 0.5, dy: 0.5, n: 2, size: 0.8, ms: 7000, ember: [[0.45, 0.55]] },
      { at: [9, 8], dx: 0.5, dy: 0.5, n: 2, size: 0.8, ms: 7000, ember: [[0.55, 0.45]] },
      { at: [7, 6], dx: 0.5, dy: 0.5, n: 2, size: 0.6, ms: 8200 },
      { at: [8, 9], dx: 0.5, dy: 0.5, n: 2, size: 0.6, ms: 8200 },
    ],
    terrain: {
      plain: 'assets/terrain/plain.jpg', forest: 'assets/terrain/forest.jpg', river: 'assets/terrain/river.jpg',
      paddy: 'assets/terrain/wetland.jpg', city: 'assets/terrain/urban.jpg',
    },
    terrainOffset: { city: [4.8, 4.8] },     // 도심 그림 시작 위치 (칸): 중앙 마을에서 거울 대칭축이 칸 중앙에 오지 않게 (호스토멜과 다른 값)
    unitSet: 'hostomel',
    unitSides: { ru: { dir: 'ru', types: ['infantry', 'armor', 'antitank', 'artillery', 'mortar', 'recon', 'signal'], unitScale: { infantry: 1.15 } } },   // 러시아군 그림 세트 (assets/units/ru/)
    overlays: [],
  },
  arrivalRadius: 3,
});
