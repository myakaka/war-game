'use strict';
/* =====================================================================
   시나리오: 소형 전장 (참호전, 가상)
   10×10 칸, 양쪽 6기(보병 3·정찰 2·박격포 1). 지형은 평지·엄폐물(e, 방어 +2)·참호(T, 방어 +4). 거점 없음.
   concealment: 엄폐물·참호 칸의 유닛은 적에게 보이지 않음(은폐). 정찰 시야 반경 안이거나 사격해서 노출된 때만 보임.
   12라운드가 끝났을 때 남은 총 체력이 많은 쪽이 이기고, 같으면 생존 유닛이 많은 쪽 (victory: roundLimitAttrition). 전멸하면 즉시 종료.
   symmetric: true — 지형·배치·승리 조건이 180도 회전 대칭 (칸 (r,c) ↔ (9-r, 9-c), 좌표는 0부터).
   ===================================================================== */
// 엄폐물 칸의 종류·방향 (규칙과 그림이 같이 읽음). skin: crater | bush | sandbag, rotation: 0/90/180/270 시계 방향. 모래주머니는 rotation 0 에서 위쪽(N)으로 볼록 = 정면
const SKIRMISH_COVER_CELLS = {
  '2,1': { skin: 'sandbag', rotation: 180 }, '7,8': { skin: 'sandbag', rotation: 0 },
  '2,6': { skin: 'bush', rotation: 0 }, '7,3': { skin: 'bush', rotation: 90 },
  '4,7': { skin: 'crater', rotation: 0 }, '5,2': { skin: 'crater', rotation: 180 },
};
SCENARIOS.push({
  id: 'skirmish',
  nameKey: 'scen.skirmish.name', descKey: 'scen.skirmish.desc', subKey: 'scen.skirmish.sub',
  tags: ['sym', 'twoPlayer'],
  concealment: { reconRadius: 2, otherRadius: 1 },   // 은폐 규칙 켬. 은폐를 푸는 거리(맨해튼): 정찰 2칸, 다른 병종 1칸(인접). 노출 지속: 사격한 유닛의 소유자 다음 턴 시작까지
  suppressKill: true,                 // 제압된 유닛은 어떤 공격이든 명중하면 즉사. 제압은 상대 다음 턴 시작에 풀림 (내 턴 제압 → 상대 턴 → 내 턴 → 상대 턴 시작에 해제)
  mortarIgnoresTerrain: true,         // 박격포 판정에서 지형 방어 보너스 0 (고각 사격)
  // 방향성 엄폐: 사격이 들어오는 방향(대상 칸 기준 사수가 있는 변)에 따라 방어 보너스가 붙거나 빠짐 (js/combat.js getTerrainDefenseBonus)
  //   defense = 보호되는 방향에서 받는 방어 보너스 · conceal = 은폐 여부(참고용, 은폐는 지형 conceals 가 정함) · directional: 'axis' 참호 통로를 가로지르는 방향만 보호(통로를 따라 오는 종사는 +0, 외톨이는 전방위) · 'facing' 모래주머니 볼록한 쪽(정면) 한 방향만 · 'all' 전방위
  directionalCover: true,
  terrainRules: {
    trench:  { defense: 4, conceal: true,  directional: 'axis' },
    sandbag: { defense: 2, conceal: true,  directional: 'facing' },
    crater:  { defense: 2, conceal: true,  directional: 'all' },
    bush:    { defense: 1, conceal: true,  directional: 'all' },
    // 새 엄폐물 종류 (그림 파일 준비 뒤 coverCells 에 지정해 쓴다). rotation 0 = 위쪽(N)이 정면, 시계 방향
    rock:    { defense: 3, conceal: true,  directional: 'facing' },   // 바위: 단단한 정면 엄폐
    wreck:   { defense: 3, conceal: true,  directional: 'facing' },   // 부서진 차
    wall:    { defense: 2, conceal: true,  directional: 'facing' },   // 담장
    ditch:   { defense: 2, conceal: true,  directional: 'all' },      // 도랑
    rubble:  { defense: 2, conceal: true,  directional: 'all' },      // 잔해
  },
  coverCells: SKIRMISH_COVER_CELLS,   // 엄폐물 칸별 종류·방향. 지정이 없는 칸은 defaultCover
  defaultCover: 'crater',
  // 소형 전장 전용 병종 수치 표 (여기 값만 고치면 이 시나리오에만 적용, 다른 시나리오는 그대로). 지금 값은 기본값과 같음
  //   classic: 이동 move · 시야 vision · 사거리 rangeMin/rangeMax(간접) 등 (UNIT_TYPES 필드)
  //   dice:    주사위 attack · 방어 defense · 직접 사격 최대 사거리 maxRange (DICE_STATS 필드)
  unitStats: {
    classic: {
      infantry: { move: 2, vision: 2 },
      recon:    { move: 5, vision: 3 },
      mortar:   { move: 2, vision: 2, rangeMin: 2, rangeMax: 4 },
    },
    dice: {
      infantry: { attack: 2, defense: 5, maxRange: 4 },
      recon:    { attack: 1, defense: 4, maxRange: 3 },
      mortar:   { attack: 2, defense: 4 },
    },
  },
  bgm: null,
  bgmLoopTrim: [0, 0],
  scaleMeters: 250,
  map: [
    '..........',
    '..........',
    '.e....e...',
    '..TT......',
    '...TT..e..',
    '..e..TT...',
    '......TT..',
    '...e....e.',
    '..........',
    '..........',
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
    // 위쪽 (AI) 6기
    { round: 0, side: 'ru', type: 'infantry', pos: [1, 3] }, { round: 0, side: 'ru', type: 'infantry', pos: [1, 4] }, { round: 0, side: 'ru', type: 'infantry', pos: [1, 5] },
    { round: 0, side: 'ru', type: 'recon', pos: [1, 1] }, { round: 0, side: 'ru', type: 'recon', pos: [1, 8] },
    { round: 0, side: 'ru', type: 'mortar', pos: [0, 4] },
    // 아래쪽 (사람) = 위쪽 칸 (r,c) → (9-r, 9-c)
    { round: 0, side: 'ua', type: 'infantry', pos: [8, 6] }, { round: 0, side: 'ua', type: 'infantry', pos: [8, 5] }, { round: 0, side: 'ua', type: 'infantry', pos: [8, 4] },
    { round: 0, side: 'ua', type: 'recon', pos: [8, 8] }, { round: 0, side: 'ua', type: 'recon', pos: [8, 1] },
    { round: 0, side: 'ua', type: 'mortar', pos: [9, 5] },
  ],
  placementZones: { ua: { rows: [7, 9] }, ru: { rows: [0, 2] } },   // 직접 배치: 자기 쪽 끝 3행 (회전 대칭)
  zoneLabelKey: null,
  river: null,
  aiConstants: {},
  aiProfiles: ['easy', 'normal', 'hard'],
  objectiveCheckAfter: null,
  activations: { def: 6, att: 6 },          // 한 턴 행동 한도 = 병력 수 (사실상 제한 없음)
  fires: {
    blindFire: true,
    mortar: { range: 4, cooldown: 0, indirectPenalty: 0 },
  },
  goal: { role: 'att', barKey: 'goal.bar.attrition' },   // 거점이 없어서 목표 장면은 없고 표시줄 문구만
  victory: {
    ru: [{ type: 'annihilation' }, { type: 'roundLimitAttrition' }],
    ua: [{ type: 'annihilation' }, { type: 'roundLimitAttrition' }],
  },
  overlays: [],
  art: {
    terrain: {
      plain: 'assets/terrain/plain.jpg', forest: 'assets/terrain/forest.jpg', river: 'assets/terrain/river.jpg',
    },
    // 참호·엄폐물 그림 (PC 리치 테마 전용 장식, 규칙과 무관). 파일이 없으면 기호 표시로 대체. 칸 좌표는 화면과 같은 0부터 (행,열)
    trench: { files: {
      straight_a: 'assets/terrain/trench_straight_h_a.png', straight_b: 'assets/terrain/trench_straight_h_b.png', straight_v: 'assets/terrain/trench_straight_v.png',
      corner: 'assets/terrain/trench_corner_left_bottom.png', end: 'assets/terrain/trench_end_open_top.png',
    } },
    cover: {
      files: { crater: 'assets/cover/cover_crater.png', bush: 'assets/cover/cover_bush.png', sandbag: 'assets/cover/cover_sandbag.png' },
      cells: SKIRMISH_COVER_CELLS,   // 규칙 데이터(coverCells)와 같은 객체: 그림과 방향성 엄폐 규칙이 같은 종류·방향을 읽음
    },
    // 그림 보정: dx·dy = 칸 크기 비율 이동, scale = 배율. cellOverrides 는 '행,열' 칸만 덮어씀 { dx, dy, scale, rotation, tint: 'rgba(...)' }
    visual: {
      trench: { edgeFeather: true, tiles: { straight_a: { dx: 0, dy: 0, scale: 1 }, straight_b: { dx: 0, dy: 0, scale: 1 }, straight_v: { dx: 0, dy: 0, scale: 1 }, corner: { dx: 0, dy: 0, scale: 1 }, end: { dx: 0, dy: 0, scale: 1 } } },
      cover: { crater: { dx: 0, dy: 0, scale: 1 }, bush: { dx: 0, dy: 0, scale: 1 }, sandbag: { dx: 0, dy: 0, scale: 1.25 } },
      // 참호·엄폐물 칸 위 내 유닛의 표시 (은폐 중일 때. 노출되면 평지처럼 원래 크기). 체력·배지는 그대로, 클릭 영역도 그대로
      //  scaleIn* 배율 · darkenInTrench 밝기 · fadeBottom* 아래쪽을 사라지게 하는 비율 · sandbagOffset 모래주머니 오목한 쪽으로 치우침(칸 크기 배) · sandbagOverlayAlpha 유닛 위에 덮는 모래주머니 투명도(0~1) · trenchOffset 참호 그림 종류별 통로 중심(그림이 돈 만큼 같이 돎)
      //  bushUnitAlpha 덤불 속 유닛 투명도 · bushOverlayAlpha 유닛 위에 덮는 덤불 투명도 · popup 사격할 때 튀어오름(up/down 초, firstRevealPulse 처음 드러날 때 깜빡임)
      units: {
        scaleInTrench: 0.85, scaleInCrater: 0.85, scaleInBush: 0.90, scaleInSandbag: 0.90,
        darkenInTrench: 0.9, fadeBottomTrench: 0.22, fadeBottomCrater: 0.12,
        soldierScale: 0.45,   // 참호 안에서 군인 한 명의 크기 (원래 크기 배). 통로 폭(칸의 약 0.25배)에 들어가도록
        // 참호 그림 종류별 군인 3명의 자리 (기본 방향 기준 칸 크기 배, 그림이 돈 만큼 같이 돎): 직선은 일렬, 코너는 ㄱ자, 끝은 막힌 쪽부터 일렬
        soldierSlots: {
          straight_a: [[-0.27, -0.03], [0, -0.03], [0.27, -0.03]], straight_b: [[-0.27, -0.03], [0, -0.03], [0.27, -0.03]],
          straight_v: [[-0.01, -0.27], [-0.01, 0], [-0.01, 0.27]],
          corner: [[-0.27, 0.02], [0.03, 0.03], [0.01, 0.28]],
          end: [[0, -0.06], [0, -0.25], [0, -0.43]],
        },
        trenchOffset: { straight_a: { dx: 0, dy: -0.03 }, straight_b: { dx: 0, dy: -0.03 }, straight_v: { dx: -0.01, dy: 0 }, corner: { dx: 0, dy: 0.02 }, end: { dx: 0, dy: -0.15 } },   // 참호 통로 중심 (기본 방향 기준, 그림이 돈 만큼 같이 돎)
        sandbagOffset: 0.30, sandbagOverlayAlpha: 0.3, bushOverlayAlpha: 0.6, bushUnitAlpha: 0.85,
        popup: { enabled: true, up: 0.15, down: 0.3, firstRevealPulse: 0.4 },
      },
      cellOverrides: {},   // '행,열': { dx, dy, scale, rotation, tint, unit: { dx, dy, scale } } (unit = 그 칸 유닛 표시 보정)
    },
    unitSet: 'hostomel',
    unitScaleType: { mortar: 0.8 },   // 병종별 그림 크기 배율 (박격포 그림이 커서 줄임, 링은 그대로)
    unitScaleAll: 0.8,   // 이 시나리오의 모든 유닛 그림·링 크기 배율 (참호·엄폐물과 어울리도록 작게)
    // 참호 안 배치용 군인 낱장 (한 장에 3명인 그림을 한 명씩 자른 것, tools/split-sprites.py). 키 = 진영:병종 또는 병종(기본 그림 세트)
    soldiers: {
      infantry: ['assets/units/hostomel/infantry_s1.png', 'assets/units/hostomel/infantry_s2.png', 'assets/units/hostomel/infantry_s3.png'],
      'ru:infantry': ['assets/units/ru/infantry_s1.png', 'assets/units/ru/infantry_s2.png', 'assets/units/ru/infantry_s3.png'],
      'ua:recon': ['assets/units/ua/recon_s1.png', 'assets/units/ua/recon_s2.png', 'assets/units/ua/recon_s3.png'],
      'ru:recon': ['assets/units/ru/recon_s1.png', 'assets/units/ru/recon_s2.png', 'assets/units/ru/recon_s3.png'],
    },
    unitSides: {
      ru: { dir: 'ru', types: ['infantry', 'armor', 'antitank', 'artillery', 'mortar', 'recon', 'signal'], unitScale: { infantry: 1.15 } },
      ua: { dir: 'ua', types: ['recon'], unitScale: {} },   // 우크라이나군 정찰: 위장 정찰병 그림 (우글레다르와 같음). 다른 병종은 기본 그림
    },
    overlays: [],
  },
  arrivalRadius: 3,
});
