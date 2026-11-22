'use strict';
/* =====================================================================
   시나리오: 소형 전장 (참호전, 가상)
   10×10 칸, 양쪽 6기(보병 3·정찰 2·박격포 1). 지형은 평지·엄폐물(e, 방어 +2)·참호(T, 방어 +4). 거점 없음.
   concealment: 엄폐물·참호 칸의 유닛은 적에게 보이지 않음(은폐). 정찰 시야 반경 안이거나 사격해서 노출된 때만 보임.
   12라운드가 끝났을 때 남은 총 체력이 많은 쪽이 이기고, 같으면 생존 유닛이 많은 쪽 (victory: roundLimitAttrition). 전멸하면 즉시 종료.
   symmetric: true — 지형·배치·승리 조건이 180도 회전 대칭 (칸 (r,c) ↔ (9-r, 9-c), 좌표는 0부터).
   ===================================================================== */
SCENARIOS.push({
  id: 'skirmish',
  nameKey: 'scen.skirmish.name', descKey: 'scen.skirmish.desc', subKey: 'scen.skirmish.sub',
  tags: ['sym', 'twoPlayer'],
  concealment: { reconRadius: 2, otherRadius: 1 },   // 은폐 규칙 켬. 은폐를 푸는 거리(맨해튼): 정찰 2칸, 다른 병종 1칸(인접). 노출 지속: 사격한 유닛의 소유자 다음 턴 시작까지
  suppressKill: true,                 // 제압된 유닛은 어떤 공격이든 명중하면 즉사. 제압은 상대 다음 턴 시작에 풀림 (내 턴 제압 → 상대 턴 → 내 턴 → 상대 턴 시작에 해제)
  mortarIgnoresTerrain: true,         // 박격포 판정에서 지형 방어 보너스 0 (고각 사격)
  ruleset: 'dice',            // 이 시나리오는 항상 주사위 규칙 세트(데모 2 수치: 보병 사거리 4 등)로 진행
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
      cells: {   // skin: crater | bush | sandbag, rotation: 0/90/180/270 (없으면 칸 좌표 해시로 고정). 모래주머니는 기본 그림에서 위쪽으로 볼록
        '2,1': { skin: 'sandbag', rotation: 180 }, '7,8': { skin: 'sandbag', rotation: 0 },
        '2,6': { skin: 'bush', rotation: 0 }, '7,3': { skin: 'bush', rotation: 90 },
        '4,7': { skin: 'crater', rotation: 0 }, '5,2': { skin: 'crater', rotation: 180 },
      },
    },
    // 그림 보정: dx·dy = 칸 크기 비율 이동, scale = 배율. cellOverrides 는 '행,열' 칸만 덮어씀 { dx, dy, scale, rotation, tint: 'rgba(...)' }
    visual: {
      trench: { edgeFeather: true, tiles: { straight_a: { dx: 0, dy: 0, scale: 1 }, straight_b: { dx: 0, dy: 0, scale: 1 }, straight_v: { dx: 0, dy: 0, scale: 1 }, corner: { dx: 0, dy: 0, scale: 1 }, end: { dx: 0, dy: 0, scale: 1 } } },
      cover: { crater: { dx: 0, dy: 0, scale: 1 }, bush: { dx: 0, dy: 0, scale: 1 }, sandbag: { dx: 0, dy: 0, scale: 1.25 } },
      units: { scaleInTrench: 0.70, scaleInCover: 0.80, darkenInTrench: 0.9 },   // 참호·엄폐물 칸 위 유닛 그림 배율·밝기 (체력·배지는 그대로)
      cellOverrides: {},
    },
    unitSet: 'hostomel',
    unitSides: {
      ru: { dir: 'ru', types: ['infantry', 'armor', 'antitank', 'artillery', 'mortar', 'recon', 'signal'], unitScale: { infantry: 1.15 } },
      ua: { dir: 'ua', types: ['recon'], unitScale: {} },   // 우크라이나군 정찰: 위장 정찰병 그림 (우글레다르와 같음). 다른 병종은 기본 그림
    },
    overlays: [],
  },
  arrivalRadius: 3,
});
