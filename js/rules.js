'use strict';
/* =====================================================================
   공통 규칙 데이터: 전투 수치, 병종, 지형, 시나리오 목록
   엔진(engine.js)은 이 파일과 ai-config.js, scenarios/*.js 의 객체만 읽는다.
   시나리오 파일은 아래 SCENARIOS 배열에 push 한다 (index.html 의 script 순서 = 목록 순서, 첫 번째가 기본 표시).
   ===================================================================== */
const RULES = {
  MAX_HP: 4,
  RULES_VERSION: 6,                         // 1: 이동 또는 공격 / d100 · 2: 이동 후 공격 + d10 · 3: 도심 보정 -15 → -20 · 4: 시나리오 구조 (규칙 수치 변화 없음) · 5: 호스토멜 공격군 거점 3 → 2 · 6: 행동 제한 (시나리오 activations)
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
 */
const SCENARIOS = [];
const DEFAULT_SCENARIO_ID = 'chuncheon';
