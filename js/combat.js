'use strict';
/* =====================================================================
   직접 사격·간접 화력 판정 모듈 (규칙 세트별). DOM 없음 · 순수 함수.
   규칙 세트(GAME_CONFIG.RULESET): 'classic' = 기존 규칙 그대로(이 파일은 아무것도 바꾸지 않음) · 'dice' = 데모 2.
   엔진(명중률 계산·사격 대상·판정), AI, 확인 시트, 시뮬레이션이 모두 이 파일의 같은 함수를 부른다 (표시와 실제 판정이 어긋나지 않게).
   데모 2 직접 사격 규칙 (후퇴·제압·안개·행동 제한은 그대로). 간접 화력(박격포·포병)도 주사위 규칙: diceIndirectArea:
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
const isDirectType = (typeKey) => { const s = diceStatsOf(typeKey); const ty = GAME_CONFIG.UNIT_TYPES[typeKey]; return !!s && s.attack != null && !(ty && ty.indirect); };
/** 데모 2 에서 주사위 규칙으로 쏘는 간접 화력 병종인가 (박격포·포병: 표에 attack 이 있음) */
const isIndirectDiceType = (typeKey) => { const s = diceStatsOf(typeKey); const ty = GAME_CONFIG.UNIT_TYPES[typeKey]; return !!s && s.attack != null && !!(ty && ty.indirect); };
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
    const shoots = !!T[k].canAttack;   // 직접 사격 + 간접 화력 (통신은 못 쏨)
    if (shoots && !isInt(row.attack, 1)) bad(`${k}.attack`, 'err.diceStats.attack');
    if (!shoots && row.attack != null) bad(`${k}.attack`, 'err.diceStats.noAttack');
    if (T[k].indirect && row.maxRange != null) bad(`${k}.maxRange`, 'err.diceStats.noRange');
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
/* ---------- 방향성 엄폐 (시나리오 directionalCover) ----------
   사격이 들어오는 방향(대상 칸 기준 사수가 있는 쪽 변 N/E/S/W)에 따라 엄폐·참호의 방어 보너스가 붙거나 빠짐.
   종류·방향은 시나리오 데이터(coverCells, terrainRules)가 정하고, 화면 그림은 같은 값을 읽음. 플레이어와 AI 가 같은 함수를 씀. */
const SIDE_DELTA = Object.freeze({ N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] });
const SIDE_OPP = Object.freeze({ N: 'S', E: 'W', S: 'N', W: 'E' });
const SIDE_ORDER = ['N', 'E', 'S', 'W'];
/** 대상 칸 기준 사수가 있는 쪽 변. 같은 칸이거나 위치를 모르면 null (직선 사격이라 한 축만 다름, 둘 다 다르면 더 먼 축) */
function getIncomingSide(shooter, target) {
  if (!shooter || shooter.r == null || !target || target.r == null) return null;
  const dr = shooter.r - target.r, dc = shooter.c - target.c;
  if (!dr && !dc) return null;
  return Math.abs(dr) >= Math.abs(dc) ? (dr < 0 ? 'N' : 'S') : (dc > 0 ? 'E' : 'W');
}
/** 참호 칸의 통로 방향 집합 A: 이웃 참호가 있는 방향 + (연결이 한 방향뿐인 끝 칸은 그 반대 방향도). 연결 없음 = 빈 집합(전방위 보호) */
function trenchAlongSides(r, c) {
  const A = new Set();
  for (const s of SIDE_ORDER) {
    const [dr, dc] = SIDE_DELTA[s];
    if (inBounds(r + dr, c + dc) && terrainAt(r + dr, c + dc).key === 'trench') A.add(s);
  }
  if (A.size === 1) A.add(SIDE_OPP[[...A][0]]);
  return A;
}
/** 모래주머니 정면(볼록한 쪽): 기본 그림(rotation 0)은 위쪽으로 볼록, rotation 은 시계 방향. 유닛이 숨는 오목한 쪽은 그 반대 (ui.js richUnitLook 의 sandbagOffset 방향과 같은 기준) */
const getSandbagFacing = (rotation) => SIDE_ORDER[((((Math.round((rotation || 0) / 90)) % 4) + 4) % 4)];
/** 이 칸의 방향성 규칙 { kind, defense, directional, rotation } (방향성 시나리오가 아니거나 엄폐·참호가 아니면 null) */
function directionalRuleAt(r, c) {
  const D = GAME_CONFIG.DIRECTIONAL;
  if (!D) return null;
  const key = terrainAt(r, c).key;
  if (key === 'trench') return D.rules.trench ? { kind: 'trench', rotation: 0, ...D.rules.trench } : null;
  if (key === 'cover') {
    const cell = D.cells[`${r},${c}`] || {}, kind = D.rules[cell.skin] ? cell.skin : D.defaultCover;
    return D.rules[kind] ? { kind, rotation: cell.rotation || 0, ...D.rules[kind] } : null;
  }
  return null;
}
/** 그 칸이 보호하는 변들 (디버그·설명용): { defense, sides:[...], kind } 또는 null */
function protectedSidesAt(r, c) {
  const rule = directionalRuleAt(r, c);
  if (!rule) return null;
  let sides = SIDE_ORDER.slice();
  if (rule.directional === 'axis') { const A = trenchAlongSides(r, c); sides = sides.filter((s) => !A.has(s)); if (A.size === 0) sides = SIDE_ORDER.slice(); }
  else if (rule.directional === 'facing') sides = [getSandbagFacing(rule.rotation)];
  return { defense: rule.defense, sides, kind: rule.kind };
}
/**
 * 대상 칸의 지형 방어 보너스. 반환 { bonus, protectedFrom, reason }
 *  reason: 'mortar'(박격포 무시) · 'none'(보너스 없는 지형) · 'all'(전방위) · 'front'(보호되는 방향) · 'side'(모래주머니 측면·후면) · 'along'(참호 통로를 따라 오는 종사)
 *  shooter/incoming 을 모르면(가상 유닛) 보호되는 방향으로 침 = 기존과 같은 값
 */
function getTerrainDefenseBonus(target, shooter, weaponType, incoming = null) {
  if (weaponType === 'mortar' && GAME_CONFIG.MORTAR_IGNORES_TERRAIN) return { bonus: 0, protectedFrom: false, reason: 'mortar' };
  const rule = directionalRuleAt(target.r, target.c);
  if (!rule) { const b = diceTerrainBonus(terrainAt(target.r, target.c)); return { bonus: b, protectedFrom: b > 0, reason: b ? 'all' : 'none' }; }
  const side = incoming || getIncomingSide(shooter, target);
  let prot = true, reason = 'all';
  if (rule.directional === 'axis') { reason = 'front'; if (side && trenchAlongSides(target.r, target.c).has(side)) { prot = false; reason = 'along'; } }
  else if (rule.directional === 'facing') { reason = 'front'; if (side && side !== getSandbagFacing(rule.rotation)) { prot = false; reason = 'side'; } }
  return { bonus: prot ? rule.defense : 0, protectedFrom: prot, reason };
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
function diceBreakdown({ attacker, defender, terrain, from = null, incoming = null }) {
  const dc = diceCount(attacker, defender.type);
  const A = dc.count;
  const D = diceDefense(defender);
  const f = from || (attacker.r != null ? attacker : null);
  const dist = f && defender.r != null ? manhattan(f, defender) : 1;
  // 방향성 엄폐 시나리오: 사격이 들어오는 방향에 따라 지형 보너스가 붙거나 빠짐. 대상 위치를 모르는 가상 유닛은 기존 값. incoming = AI 위협 추정용 방향 힌트(거리는 그대로 1)
  const dir = GAME_CONFIG.DIRECTIONAL && defender.r != null ? getTerrainDefenseBonus(defender, f, attacker.type, incoming) : null;
  const tb = dir ? dir.bonus : diceTerrainBonus(terrain), db = diceDistanceBonus(dist);
  const need = D + tb + db;
  const p = diceHitP(A, need);
  const parts = [{ key: 'diceDef', value: D }];
  if (tb) parts.push({ key: 'diceTerrain', p: { terrain: terrain.key }, value: tb });
  if (db) parts.push({ key: 'diceDist', p: { d: dist }, value: db });
  return {
    chance: p * 100, raw: need, parts, sides: diceRules().sides, need,
    dice: { count: A, base: dc.base, bonus: dc.bonus, minApplied: dc.min, need, def: D, terrain: tb, terrainKey: terrain ? terrain.key : null, ...(dir && dir.reason !== 'none' ? { dir: dir.reason } : null), distance: dist, distBonus: db, oneP: diceOneP(need) },
  };
}
/**
 * (dice) 간접 화력(박격포·포병) 판정. 조준한 칸 aim 에 쏘면, 중심 칸 유닛(있으면)과 포병은 이웃 4칸 유닛이 범위 안.
 * 주사위는 쏘는 유닛이 한 번만 굴리고 (개수 = max(1, attack - 체력 보정)), 범위 안 유닛은 같은 눈 세트를 각자의 필요한 숫자로 따진다.
 *   N = 대상 방어 + 그 유닛이 선 칸의 지형 보너스 + (조준 칸까지 거리 - 1) + (조준 칸이 쏘는 진영에게 안 보이면 blindPenalty)
 * 사거리·쿨다운·대상 칸 방식은 classic 그대로 (이 함수는 사거리를 검사하지 않음).
 */
function diceIndirectNeed(defender, terrain, dist, blind, ignoreTerrain = false) {
  const def = diceDefense(defender), terr = ignoreTerrain ? 0 : diceTerrainBonus(terrain), distBonus = diceDistanceBonus(dist), blindBonus = blind ? diceRules().blindPenalty : 0;
  return { need: def + terr + distBonus + blindBonus, def, terrain: terr, terrainKey: terrain ? terrain.key : null, distBonus, blindBonus };
}
/** from = 쏘는 위치 (기본 공격자 위치). 반환 { count, base, penalty, minApplied, dist, distBonus, blind, blindBonus, units:[{ id, unit, center, need, def, terrain, p }] } (중심 → 위·아래·왼쪽·오른쪽 순) */
function diceIndirectArea(state, attacker, aim, from = null) {
  const dc = diceCount(attacker, null);
  const blind = !getTerrainVisibleTiles(state, attacker.side).has(idx(aim.r, aim.c));   // 칸 시야 기준 (은폐 유닛이 있는 칸도 보이는 칸)
  const ignoreTerr = !!GAME_CONFIG.MORTAR_IGNORES_TERRAIN && attacker.type === 'mortar';   // 시나리오 mortarIgnoresTerrain
  const dist = manhattan(from || attacker, aim);
  const cells = [{ r: aim.r, c: aim.c, center: true }];
  if (unitType(attacker).splash !== false) for (const [dr, dc2] of DIRS) cells.push({ r: aim.r + dr, c: aim.c + dc2, center: false });
  const units = [];
  for (const cell of cells) {
    if (!inBounds(cell.r, cell.c)) continue;
    const o = getUnitAt(state, cell.r, cell.c);
    if (!o) continue;
    const n = diceIndirectNeed(o, terrainAt(o.r, o.c), dist, blind, ignoreTerr);
    units.push({ id: o.id, unit: o, center: cell.center, ...n, p: diceHitP(dc.count, n.need) });
  }
  const bb = blind ? diceRules().blindPenalty : 0;
  return { count: dc.count, base: dc.base, penalty: dc.penalty, minApplied: dc.min, dist, distBonus: diceDistanceBonus(dist), blind, blindBonus: bb, units };
}

/** (dice 간접 화력) 가상의 사격이 defender 에게 명중할 확률 0~1 (AI 평가·위험 계산용. attacker/defender 는 { type, hp }, 지형은 defender 가 선 칸) */
const diceIndirectChance = (attacker, defender, terrain, dist, blind = false) => diceHitP(diceCount(attacker, null).count, diceIndirectNeed(defender, terrain, dist, blind, !!GAME_CONFIG.MORTAR_IGNORES_TERRAIN && attacker.type === 'mortar').need);

/** (dice 간접 화력) 범위 안 유닛 중 보는 진영 시야 안에 있는 것만 (안개 규칙: 안 보이는 유닛의 필요한 숫자·확률·결과는 화면·로그에 쓰지 않음). area = hc.dice.area, vis = 시야 Set */
const diceAreaVisible = (area, vis) => area.filter((x) => vis.has(idx(x.r, x.c)));

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

/** (dice) 주사위 눈만 굴림 (rolls = 굴린 순서대로 0~9). 간접 화력은 이 한 세트를 범위 안 모두가 씀 */
function diceRollFaces(rng, count) {
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(Math.floor(rng() * diceRules().sides));
  return rolls;
}
/** (dice) 주사위를 굴려 명중 여부 판정. rng 는 게임 주사위 스트림. 반환 { rolls, hit } (rolls = 굴린 순서대로 0~9) */
function diceRollAll(rng, count, need) {
  const rolls = diceRollFaces(rng, count);
  return { rolls, hit: rolls.some((f) => diceFaceOk(f, need)) };
}

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    getIncomingSide, trenchAlongSides, getSandbagFacing, protectedSidesAt, getTerrainDefenseBonus, rulesetOf, setRuleset, isDiceRules, isDirectType, isIndirectDiceType, diceIndirectNeed, diceIndirectArea, diceIndirectChance, diceAreaVisible, diceRollFaces, diceStatsOf, diceMaxRange, diceStatsErrors, diceCount, diceDefense, diceTerrainBonus, diceDistanceBonus, diceOneP, diceHitP, diceFaceOk,
    diceBreakdown, diceTargetsFrom, diceRollAll,
  });
}
