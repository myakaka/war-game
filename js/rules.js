'use strict';
/* =====================================================================
   공통 규칙 데이터: 전투 수치, 병종, 지형, 시나리오 목록
   엔진(engine.js)은 이 파일과 ai-config.js, scenarios/*.js 의 객체만 읽는다.
   시나리오 파일은 아래 SCENARIOS 배열에 push 한다 (index.html 의 script 순서 = 목록 순서, 첫 번째가 기본 표시).
   ===================================================================== */
const RULES = {
  MAX_HP: 4,
  RULES_VERSION: 11,                         // 1: 이동 또는 공격 / d100 · 2: 이동 후 공격 + d10 · 3: 도심 보정 -15 → -20 · 4: 시나리오 구조 (규칙 수치 변화 없음) · 5: 호스토멜 공격군 거점 3 → 2 · 6: 행동 제한 (시나리오 activations) · 7: 간접 화력 1단계 (시나리오 fires: 안개 속 사격 여부, 박격포, 포병 사거리·쿨다운. fires 가 없는 시나리오는 v6 그대로) · 8: 대칭 시나리오용 규칙 (여러 칸 거점 cells, 점유 방식 objectiveControl 'presence', 승리 조건 roundLimitScore·무승부, firstMover, secondMoverBonus, symmetric 검사. 춘천·호스토멜 동작은 v7 그대로) · 9: 대칭 전장 거점 2개 즉시 승리 제거 (14라운드 종료 시 거점 수 판정만) · 10: 대칭 전장 점수제 (objectivePoints·scoreTiming·scoreTarget, 승리 조건 roundLimitPoints. 춘천·호스토멜 동작은 그대로) · 11: 대칭 전장 후퇴·제압 (시나리오 retreat: 적에게 피해를 받으면 뒤로 1칸 후퇴, 막히면 격파, 간접 화력 정중앙은 제압. retreat 가 없는 시나리오는 v10 그대로)
  ENABLE_ACTIVATION_LIMIT: true,            // true: 시나리오 activations 의 진영별 행동 한도 적용 · false: 한도 무시 (v5 와 완전히 같은 동작)
  ATTACK_AFTER_MOVE: false,                 // (ENABLE_MOVE_ATTACK 가 false 일 때만 사용) false: 한 유닛은 한 턴에 이동 또는 공격 중 하나만 (포병은 항상 false)
  ENABLE_MOVE_ATTACK: true,                 // true: 남은 이동력 >= 공격 비용이면 이동 후 공격 가능 (포병·통신 제외)
  ATTACK_COST_DIVISOR: 2,                   // 공격 비용 = ceil(병종 최대 이동력 / 이 값) → 보병 1, 대전차 1, 기갑 2, 정찰 3
  MOVE_ATTACK_PENALTY: -10,                 // 이동 후 공격의 명중률 보정
  DICE_SIDES: 10,                           // 100: d100 (명중률 5~95%) · 10: d10 (명중률 10% 단위 반올림, 10~90%)
  PASS_THROUGH_FRIENDLY: true,              // 아군이 있는 칸은 통과 가능 (정지는 불가). 적 칸은 항상 통과 불가
  ARRIVAL_RADIUS: 3,                        // 예약 투입: 후보 칸이 막혔을 때 찾아보는 최대 맨해튼 거리 (시나리오 arrivalRadius 로 덮어씀)
  COMBAT: {
    baseHit: 50,
    perPoint: 10,            // (공격력 - 방어력) 1당 명중률
    minHit: 5,               // d100 모드
    maxHit: 95,
    minHitD10: 10,           // d10 모드 (10% 단위 반올림 뒤 적용)
    maxHitD10: 90,
    signalBonus: 20,         // 아군 통신 유닛 반경 안의 공격 유닛 명중률 보너스 (중복 없음)
    signalRange: 2,          // 통신 유닛으로부터의 맨해튼 거리 (공격자 위치 기준)
    fogPenalty: -50,         // 대상 칸이 공격 측 시야 밖
    splashDamage: 1,         // 포격 명중 시 인접 4칸 고정 피해
    minDamage: 1,            // 공격력 - 방어력 이 0 이하일 때
    hpPenaltyPerLoss: 1,     // HP 1 감소당 공격력/방어력 감소
  },
};

// nameKey: STRINGS 이름 키 · symbol: 화면의 병종 기호 키 (UI typeMark)
const UNIT_TYPES = {
  infantry:  { move: 2, vision: 2, atkSoft: 3, atkArmor: 1, def: 3, rangeMin: 1, rangeMax: 1, canAttack: true, nameKey: 'unit.infantry', symbol: 'infantry' },
  armor:     { move: 4, vision: 3, atkSoft: 6, atkArmor: 6, def: 4, rangeMin: 1, rangeMax: 1, canAttack: true, isArmor: true, nameKey: 'unit.armor', symbol: 'armor' },
  artillery: { move: 1, vision: 1, atkSoft: 5, atkArmor: 3, def: 1, rangeMin: 2, rangeMax: 3, canAttack: true, indirect: true, nameKey: 'unit.artillery', symbol: 'artillery' },
  recon:     { move: 5, vision: 5, atkSoft: 1, atkArmor: 0, def: 1, rangeMin: 1, rangeMax: 1, canAttack: true, nameKey: 'unit.recon', symbol: 'recon' },
  signal:    { move: 2, vision: 3, atkSoft: 0, atkArmor: 0, def: 1, rangeMin: 0, rangeMax: 0, canAttack: false, isSignal: true, nameKey: 'unit.signal', symbol: 'signal' },
  antitank:  { move: 2, vision: 2, atkSoft: 1, atkArmor: 6, def: 2, rangeMin: 1, rangeMax: 1, canAttack: true, nameKey: 'unit.antitank', symbol: 'antitank' },
  // 박격포: 간접 사격이지만 한 칸만 (splash: false), 이동 후 사격 가능 (moveFire), 명중 시 고정 피해 (fixedDamage). 이동·공격·방어는 보병과 같게 시작
  mortar:    { move: 2, vision: 2, atkSoft: 3, atkArmor: 1, def: 3, rangeMin: 2, rangeMax: 4, canAttack: true, indirect: true, splash: false, moveFire: true, fixedDamage: 1, nameKey: 'unit.mortar', symbol: 'mortar' },
};
// 병종의 공격 비용은 RULES.ATTACK_COST_DIVISOR 로 계산 (attackCost)

// 지형 문자: . 평지 / ^ 산 / ~ 강 / # 도심 / f 숲 / w 논   (행 0 = 북쪽)
// moveCost: 진입 비용 / partialEntry: 이동력이 모자라도 1 이상이면 진입 후 전부 소모
// consumesAll: 진입 시 이동 종료 (강) / hitMod: 이 칸에 선 방어자에 대한 명중률 보정
// nameKey: 기본 이름 키 (시나리오 terrainNames 로 이름만 바꿀 수 있음) · symbol: 화면의 심볼 키
const TERRAIN_TYPES = {
  '.': { key: 'plain',    moveCost: 1, hitMod: 0, nameKey: 'terrain.plain', symbol: 'plain' },
  '#': { key: 'city',     moveCost: 1, hitMod: -20, nameKey: 'terrain.city', symbol: 'city' },
  '^': { key: 'mountain', moveCost: 3, hitMod: -20, partialEntry: true, impassableFor: ['armor'], nameKey: 'terrain.mountain', symbol: 'mountain' },
  '~': { key: 'river',    moveCost: 1, hitMod: 20, consumesAll: true, nameKey: 'terrain.river', symbol: 'river' },
  'f': { key: 'forest',   moveCost: 2, hitMod: -10, nameKey: 'terrain.forest', symbol: 'forest' },
  'w': { key: 'paddy',    moveCost: 2, hitMod: 0, impassableFor: ['armor'], nameKey: 'terrain.paddy', symbol: 'paddy' },
};

/*
 * 시나리오 스키마
 *   id, nameKey, descKey, subKey(시작 화면 부제의 장소 문구), scaleMeters(한 칸 ≈ m, 표시용)
 *   map            지형 문자열 배열 (정사각)
 *   sides          { 진영id: { role: 'def'|'att', nameKey, color } }  진영 id 는 유닛 id 접두어(첫 글자)로도 쓰임
 *   playerSide     AI 대전에서 플레이어가 맡는 진영 · turnOrder 라운드 안의 턴 순서 (앞쪽이 선공)
 *   rounds         최대 라운드 수
 *   hq             { 진영id: [r,c] | null }  null 이면 본부 없음 (본부 마커·본부 진입 승리·AI 본부 목표 없음)
 *   objectives     [{ id, nameKey, shortNameKey, pos:[r,c], startOwner }]
 *   deployments    round 0 = 시작 배치 (기본 배치이자 AI 가 상대 배치를 모를 때의 추정 위치)
 *                  round >= 1 = 예약 투입: 그 라운드에 그 진영 턴이 시작될 때 등장. pos 또는 count + cells(후보 칸, 순서대로)
 *   placementZones { 진영id: { rows:[a,b], cols?:[a,b] } | null }  직접 배치 구역 (진입 불가 지형·본부 칸 제외)
 *   zoneLabelKey   배치 안내 문구 키 (없으면 'N~M행' 자동)
 *   river          { rows, crossings } 가로 강 줄기 (도하 전술·포병 엄호 계산용). 없으면 null
 *   aiConstants    전술 프로필 상수에 합치는 지도 의존 값 (도하 축, 포병 사전 추정 행 등)
 *   victory        { 진영id: [조건] }  조건 유형: enterHQ / annihilation / holdObjectives(count) / surviveRounds(rounds)
 *   objectiveCheckAfter  거점 판정 시점: null = 라운드 종료, 진영id = 그 진영 턴 종료 직후
 *   terrainNames   { 지형 key: 이름 키 }  이 시나리오에서만 지형 이름을 바꿈 (규칙은 그대로)
 *   overlays       장식 표식 (규칙 영향 없음). { kind: 'runway', col, rows:[a,b] }
 *   arrivalRadius  예약 투입 후보 칸이 막혔을 때 찾는 최대 거리
 *   activations    { def: N, att: M }  역할별 한 턴 행동 한도 (유닛이 그 턴 처음 이동·공격할 때 1회). 없거나 null 이면 제한 없음
 *   fires          간접 화력 설정 (없으면 v6 규칙 그대로: 포병은 병종 사거리, 쿨다운 없음, 사거리 안 모든 칸 사격)
 *                  { blindFire: bool (false 면 간접 화력은 보이는 칸만), <간접 병종>: { range, cooldown, indirectPenalty? } }
 *                  range = 최대 사거리(최소는 병종 rangeMin), cooldown = 쏜 뒤 사격할 수 없는 자기 진영 턴 수, indirectPenalty = 명중률 추가 감점(%p)
 *   (v8) objectives 의 cells: [[r,c], ...] 여러 칸 거점 (pos 대신). 표식은 첫 칸에 하나
 *   objectiveControl 'sticky'(기본: 마지막으로 이동해 들어간 진영이 계속 소유) | 'presence'(지금 안에 유닛이 있고 상대가 없는 진영, 양쪽·무인이면 점유자 없음)
 *   firstMover     선공 진영 id (turnOrder 대신). secondMoverBonus: 후공 진영 1라운드 턴의 행동 한도 추가 (기본 0)
 *   victory 조건 roundLimitScore: 마지막 라운드가 끝나면 점유 거점 수 → 남은 총 체력(도착 대기 유닛은 최대 체력) → 무승부(winner 'draw'). 양쪽이 모두 가질 때만 동작
 *   victory 조건 roundLimitPoints (v10): 마지막 라운드가 끝나면 총점 → 남은 총 체력 → 무승부. objectivePoints 필요
 *   objectivePoints { 거점 id: 점수 }  점유한 동안 쌓이는 점수 (있을 때만 state.score·scoreLog). symmetric 이면 회전 짝 거점은 같은 값
 *   scoreTiming    'ownTurnEnd'(기본, 자기 턴을 끝낼 때 자기 점유) | 'roundEnd'(라운드 끝에 양쪽 동시)
 *   scoreTarget    null | 정수: 한쪽 총점이 이 값에 닿으면 즉시 승리 (둘 다 닿으면 총점 → 체력 → 무승부)
 *   symmetric      true 면 validateScenario 가 180도 회전 대칭(지형·거점·배치·증원·행동 한도·승리 조건·본부)을 검사
 *   aiProfile      'symmetric' 이면 AI 중립 모드 (역할과 무관하게 양쪽 같은 목표·점수, AI_CONFIG.SYMMETRIC)
 *   aiProfiles     시작 화면 난이도 목록 (TACTIC_PROFILES id 배열, 생략 = 전체). 화면 표시만, AI 판단에는 쓰지 않음
 */
const SCENARIOS = [];
const DEFAULT_SCENARIO_ID = 'chuncheon';
