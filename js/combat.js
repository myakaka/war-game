'use strict';
/* =====================================================================
   직접 사격 판정 모듈 (규칙 세트별). DOM 없음 · 순수 함수.
   규칙 세트(GAME_CONFIG.RULESET): 'classic' = 기존 규칙 그대로(이 파일은 아무것도 바꾸지 않음) · 'dice' = 데모 2.
   엔진(명중률 계산·사격 대상·판정), AI, 확인 시트, 시뮬레이션이 모두 이 파일의 같은 함수를 부른다 (표시와 실제 판정이 어긋나지 않게).
   데모 2 직접 사격 규칙 (간접 화력·후퇴·제압·안개·행동 제한은 그대로):
     - 수치는 모두 RULES.DICE_STATS 표 한 곳 (attack·defense·maxRange·bonusDice). classic 의 대인/대기갑 값은 쓰지 않음
     - 대상: 상하좌우 직선, 각 방향에서 가장 가까운 유닛 하나(사이에 유닛이 있으면 막힘, 지형은 시선을 막지 않음), 표의 maxRange(null = 무제한)
     - 필요한 숫자 N = 방어 D + 지형 보너스 + 거리 보정(거리-1)
     - 주사위 개수 A = max(1, 체력보정(attack + 대상 병종의 bonusDice)), d10(0~9). 하나라도 0 이거나 N 이상이면 명중 (피해는 늘지 않음)
   엔진 로드 순서: engine.js 다음 (함수는 호출 때 엔진 함수를 쓰므로 순서는 중요하지 않음)
   ===================================================================== */

/** 지금 규칙 세트 ('classic' | 'dice') */
const rulesetOf = () => (GAME_CONFIG.RULESET === 'dice' ? 'dice' : 'classic');
/** 규칙 세트 고정 (판을 시작하기 전에만 부른다). 알 수 없는 값은 classic */
function setRuleset(r) {
  if (r === 'dice') { const errs = diceStatsErrors(); if (errs.length) throw new Error(errs.join(' / ')); }   // 수치 표에 빠진 값이 있으면 데모 2 는 시작하지 않음
  GAME_CONFIG.RULESET = r === 'dice' ? 'dice' : 'classic';
  return rulesetOf();
}
const isDiceRules = () => GAME_CONFIG.RULESET === 'dice';
const diceRules = () => GAME_CONFIG.DICE_RULES;
/** 데모 2 수치 표의 한 줄 (없으면 null) */
const diceStatsOf = (typeKey) => (GAME_CONFIG.DICE_STATS && GAME_CONFIG.DICE_STATS[typeKey]) || null;
/** 데모 2 에서 직접 사격을 하는 병종인가 (표에 attack 이 있음. 간접 화력·통신은 없음) */
const isDirectType = (typeKey) => { const s = diceStatsOf(typeKey); return !!s && s.attack != null; };
/** 직접 사격 병종의 최대 사거리 (칸, 무제한이면 Infinity) */
const diceMaxRange = (typeKey) => { const s = diceStatsOf(typeKey); return s && s.maxRange != null ? s.maxRange : Infinity; };
/** 수치 표 검사: 오류 문장 목록 (비어 있으면 정상). 모든 병종에 행이 있고, 직접 사격 유닛은 attack ≥ 1 */
function diceStatsErrors() {
  const errs = [], T = GAME_CONFIG.UNIT_TYPES, S = GAME_CONFIG.DICE_STATS || {};
  const bad = (where, why) => errs.push(t('err.diceStats', { where, why: t(why) }));
  const isInt = (v, min) => Number.isInteger(v) && v >= min;
  for (const k of Object.keys(T)) {
    const row = S[k];
    if (!row) { bad(k, 'err.diceStats.missing'); continue; }
    if (!isInt(row.defense, 0)) bad(`${k}.defense`, 'err.diceStats.int');
    const direct = !!T[k].canAttack && !T[k].indirect;
    if (direct && !isInt(row.attack, 1)) bad(`${k}.attack`, 'err.diceStats.attack');
    if (!direct && row.attack != null) bad(`${k}.attack`, 'err.diceStats.noAttack');
    if (direct && row.maxRange != null && !isInt(row.maxRange, 1)) bad(`${k}.maxRange`, 'err.diceStats.range');
    if (row.bonusDice != null) {
      const ok = typeof row.bonusDice === 'object' && Object.entries(row.bonusDice).every(([tk, n]) => T[tk] && isInt(n, 1));
      if (!ok) bad(`${k}.bonusDice`, 'err.diceStats.bonus');
      if (!direct) bad(`${k}.bonusDice`, 'err.diceStats.noAttack');
    }
  }
  for (const k of Object.keys(S)) if (!T[k]) bad(k, 'err.diceStats.unknown');
  return errs;
}

/** 대상이 선 칸의 지형이 주는 방어 보너스 (정수). 지금 지형 명중 보정(%)을 terrainDivisor 로 나눈 값의 부호를 뒤집음 */
function diceTerrainBonus(terrain) {
  const v = -((terrain && terrain.hitMod) || 0) / diceRules().terrainDivisor;
  return Math.round(v) + 0;   // -0 → 0
}
/** 거리 보정 (거리 1 = 0) */
const diceDistanceBonus = (dist) => Math.max(0, dist - 1) * diceRules().distanceStep;
/** 주사위 하나의 성공 확률(0~1): 0 이거나 N 이상. N ≥ 10 이어도 0 이 있어 10% */
function diceOneP(need) {
  const s = diceRules().sides;
  let ok = 0;
  for (let f = 0; f < s; f++) if (f === 0 || f >= need) ok++;
  return ok / s;
}
/** A 개 중 하나라도 성공할 확률 (0~1) */
const diceHitP = (count, need) => 1 - Math.pow(1 - diceOneP(need), Math.max(0, count));
/** 굴린 눈이 성공인가 */
const diceFaceOk = (face, need) => face === 0 || face >= need;

/**
 * 주사위 개수: max(1, 체력보정(attack + 대상 병종 bonusDice)). 표에 attack 이 없는 유닛(통신·간접 화력)은 null (공격 못 함 → 최소 1개 보정도 없음)
 * 반환 { count, base, bonus, penalty, min }  min = 최소 1개로 올려진 경우
 */
function diceCount(attacker, defenderType) {
  const s = diceStatsOf(attacker.type);
  if (!s || s.attack == null) return null;
  const bonus = (s.bonusDice && s.bonusDice[defenderType]) || 0;
  const penalty = hpPenalty(attacker);
  const raw = s.attack + bonus - penalty;
  return { count: Math.max(1, raw), base: s.attack, bonus, penalty, min: raw < 1 };
}
/** 방어: max(0, defense - 체력 보정) */
function diceDefense(defender) {
  const s = diceStatsOf(defender.type);
  return Math.max(0, (s ? s.defense : 0) - hpPenalty(defender));
}

/**
 * 직접 사격 명중 계산 (dice). attacker/defender 는 { type, hp, r?, c? }, from = 공격 위치(없으면 attacker 위치),
 * 위치를 모르면(위협 추정용 가상 유닛) 인접(거리 1)으로 계산. 반환 형식은 calcHitBreakdown 과 같은 모양 + dice 상세
 */
function diceBreakdown({ attacker, defender, terrain, from = null }) {
  const dc = diceCount(attacker, defender.type);
  const A = dc.count;
  const D = diceDefense(defender);
  const f = from || (attacker.r != null ? attacker : null);
  const dist = f && defender.r != null ? manhattan(f, defender) : 1;
  const tb = diceTerrainBonus(terrain), db = diceDistanceBonus(dist);
  const need = D + tb + db;
  const p = diceHitP(A, need);
  const parts = [{ key: 'diceDef', value: D }];
  if (tb) parts.push({ key: 'diceTerrain', p: { terrain: terrain.key }, value: tb });
  if (db) parts.push({ key: 'diceDist', p: { d: dist }, value: db });
  return {
    chance: p * 100, raw: need, parts, sides: diceRules().sides, need,
    dice: { count: A, base: dc.base, bonus: dc.bonus, minApplied: dc.min, need, def: D, terrain: tb, terrainKey: terrain ? terrain.key : null, distance: dist, distBonus: db, oneP: diceOneP(need) },
  };
}
/** 이 계산에 dice 규칙을 쓰는가: 규칙 세트가 dice 이고, 직접 사격 병종이 실제 유닛(대상 있음)을 쏠 때 */
const usesDiceHit = (attacker, defender) => isDiceRules() && !!attacker && !!defender && isDirectType(attacker.type);

/**
 * (dice) from 에서 쏠 수 있는 직접 사격 대상 목록 [{ r, c, dist, id }]. 네 방향 각각 가장 가까운 유닛 하나.
 * - 사이에 있는 아군은 막음(자기 자신은 건너뜀). 보이는 적은 대상이면서 그 너머를 막음. 안 보이는 적은 아무것도 막지도 열지도 않음 (안개 규칙: 안 보이는 유닛 존재가 드러나지 않게)
 * - 지형은 시선을 막지 않음. 사거리는 병종 maxRange (null = 지도 끝까지)
 * vis: 그 진영의 시야 Set (칸 인덱스)
 */
function diceTargetsFrom(state, u, from, vis) {
  const max = diceMaxRange(u.type);
  const out = [];
  for (const [dr, dc] of DIRS) {
    for (let k = 1; k <= max; k++) {
      const r = from.r + dr * k, c = from.c + dc * k;
      if (!inBounds(r, c)) break;
      const o = getUnitAt(state, r, c);
      if (!o || o.id === u.id) continue;
      if (o.side === u.side) break;                       // 아군이 막음
      if (!vis.has(idx(r, c))) continue;                  // 안 보이는 적: 모르는 유닛이므로 계산에 넣지 않음
      out.push({ r, c, dist: k, id: o.id });
      break;
    }
  }
  return out;
}

/** (dice) 주사위를 굴려 명중 여부 판정. rng 는 게임 주사위 스트림. 반환 { rolls, hit } (rolls = 굴린 순서대로 0~9) */
function diceRollAll(rng, count, need) {
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(Math.floor(rng() * diceRules().sides));
  return { rolls, hit: rolls.some((f) => diceFaceOk(f, need)) };
}

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    rulesetOf, setRuleset, isDiceRules, isDirectType, diceStatsOf, diceMaxRange, diceStatsErrors, diceCount, diceDefense, diceTerrainBonus, diceDistanceBonus, diceOneP, diceHitP, diceFaceOk,
    diceBreakdown, diceTargetsFrom, diceRollAll,
  });
}
