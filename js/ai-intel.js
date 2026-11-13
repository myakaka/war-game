'use strict';
/* =====================================================================
   AI 정보 모듈 (대칭 시나리오의 AI 전용, aiProfile 'symmetric').
   규칙 엔진 상태를 읽기만 하는 순수 함수. 난수 없음 (같은 상태 → 같은 결과).
   안개: 진영이 본 것(state.memory), 공개 정보(시나리오 시작 배치·간접 화력 설정), 자기 유닛이 맞은 피해 모양만 쓴다.
         상대의 실제 위치·체력·쿨다운·증원 현황(state.pending)은 읽지 않는다.
   상태에 남기는 것: state.aiIntel (대칭 시나리오만. 다른 시나리오에는 필드가 생기지 않음)
     aiIntel[side] = { gone: { 상대 시작 유닛 id: true }, clues: [{ round, kind: 'artillery'|'mortar'|null }] }
   engine.js 다음에 불러온다 (엔진 함수·상수를 그대로 씀).
   ===================================================================== */

/** 이 시나리오에서 정보 모듈을 쓰는가 */
const intelOn = () => GAME_CONFIG.AI_MODE === 'symmetric';

/** 게임 시작 시 (createInitialState) */
function intelInit(state) {
  if (!intelOn()) return;
  state.aiIntel = {};
  for (const side of GAME_CONFIG.ROUND_ORDER) state.aiIntel[side] = { gone: {}, clues: [] };
}

/** 상대 시작 배치 (공개 설정): [{ id, type, r, c }] (createInitialState 의 id 규칙) */
function intelSetupOf(enemy) {
  const prefix = enemy[0].toUpperCase();
  return GAME_CONFIG.DEPLOYMENT[enemy].map((d, i) => ({ id: prefix + (i + 1), type: d.type, r: d.r, c: d.c }));
}

/**
 * 시야 갱신 (updateMemory 끝에서, 행동마다). 아직 한 번도 못 본 상대 시작 유닛의 시작 칸이 보이면 그 기록은 지움 (gone)
 * memory 쪽은 기존 규칙 그대로 (보이면 덮어씀, 보이는 칸이 비면 vacated → 정보 모듈에서는 지운 것으로 봄)
 */
function intelOnVision(state) {
  if (!state.aiIntel) return;
  for (const side of GAME_CONFIG.ROUND_ORDER) {
    const I = state.aiIntel[side];
    if (!I) continue;
    const vis = getVisibleTiles(state, side), mem = state.memory[side];
    for (const s of intelSetupOf(enemyOf(side))) {
      if (I.gone[s.id] || mem[s.id]) continue;
      if (vis.has(idx(s.r, s.c))) I.gone[s.id] = true;
    }
  }
}

/**
 * 간접 사격 단서 (resolveAttack 끝에서). 맞은 진영이 볼 수 있는 것만으로 판단:
 * 표적 칸이 그 진영 시야 안이고 쏜 유닛이 보이지 않으면 '보이지 않는 곳에서 온 간접 사격'.
 * 병종 추정: 쏜 유닛이 보이면 그 병종. 아니면 인접 칸 파편 피해 또는 중심 피해 2 이상 → 포병, 중심 피해 1·파편 없음 → 모름 (둘 다 가능)
 */
function intelOnIndirectFire(state, attacker, target, events) {
  if (!state.aiIntel) return;
  const victim = enemyOf(attacker.side);
  const I = state.aiIntel[victim];
  if (!I) return;
  const vis = getVisibleTiles(state, victim);
  if (!vis.has(idx(target.r, target.c))) return;
  let kind = null;
  if (vis.has(idx(attacker.r, attacker.c))) kind = attacker.type;
  else {
    const splash = events.some((e) => e.type === 'splashDamage');
    const center = events.find((e) => e.type === 'damage');
    if (splash || (center && center.amount >= 2)) kind = 'artillery';
  }
  I.clues.push({ round: state.round, kind });
  if (I.clues.length > 12) I.clues.shift();
}

/** 상대가 가진 간접 화력 병종 수 (공개 설정: 시작 배치 + 증원 일정) − 직접 보고 확인한 파괴 */
function intelEnemyCount(state, side, type) {
  const enemy = enemyOf(side);
  const C = GAME_CONFIG;
  let n = C.DEPLOYMENT[enemy].filter((d) => d.type === type).length
    + C.REINFORCEMENTS.filter((g) => g.side === enemy && g.type === type).reduce((k, g) => k + g.count, 0);
  const dead = (state.intel && state.intel[side] && state.intel[side].destroyed) || {};
  const mem = state.memory[side];
  for (const id of Object.keys(dead)) {
    const known = mem[id] || intelSetupOf(enemy).find((s) => s.id === id);
    if (known && known.type === type) n--;
  }
  return Math.max(0, n);
}

/**
 * 상대 포병이 다음 상대 턴에 쉬는가 (쿨다운 추정). 확신할 때만 true:
 * 상대 포병이 1기뿐이고(공개 설정 − 확인한 파괴), 상대의 가장 최근 턴에 포병 사격 단서가 있고, 쿨다운이 1 이상.
 */
function intelArtyResting(state, side) {
  const I = state.aiIntel && state.aiIntel[side];
  if (!I) return false;
  const enemy = enemyOf(side);
  const f = firesOf(state, enemy);
  if (!f || !f.artillery || !(f.artillery.cooldown >= 1)) return false;
  if (intelEnemyCount(state, side, 'artillery') !== 1) return false;
  const order = GAME_CONFIG.ROUND_ORDER;
  // 상대의 가장 최근 턴 라운드 (지금이 내 턴이라고 볼 때)
  const last = order.indexOf(enemy) < order.indexOf(side) ? state.round : state.round - 1;
  return I.clues.some((c) => c.round === last && c.kind === 'artillery');
}

/**
 * 본 적 기억: [{ id, type, r, c, hp, age, conf, radius, seen }]
 *   seen: 지금 보임. age: 마지막으로 본 뒤 지난 라운드. conf: 신뢰도 (DECAY^age). radius: 불확실 반경 (이동력 × age, 칸)
 *   기록 = 기억(vacated 제외) + (intelFromSetup) 아직 못 본 상대 시작 유닛 (본 라운드 0)
 */
function intelRecords(state, side, K) {
  const enemy = enemyOf(side);
  const mem = state.memory[side];
  const dead = (state.intel && state.intel[side] && state.intel[side].destroyed) || {};
  const vis = getVisibleTiles(state, side);
  const out = [];
  const add = (id, type, r, c, hp, seenRound, seen) => {
    const age = seen ? 0 : Math.max(0, state.round - seenRound);
    const ty = GAME_CONFIG.UNIT_TYPES[type];
    out.push({ id, type, r, c, hp, age, seen, conf: Math.pow(K.CONF_DECAY, age), radius: Math.min(K.RADIUS_CAP, ty.move * age) });
  };
  for (const m of Object.values(mem)) {
    if (m.vacated || dead[m.id]) continue;
    const seen = vis.has(idx(m.r, m.c));
    add(m.id, m.type, m.r, m.c, m.hp, m.round, seen);
  }
  if (K.INTEL_FROM_SETUP && state.aiIntel && state.aiIntel[side]) {
    const gone = state.aiIntel[side].gone;
    for (const s of intelSetupOf(enemy)) {
      if (mem[s.id] || dead[s.id] || gone[s.id]) continue;
      add(s.id, s.type, s.r, s.c, GAME_CONFIG.MAX_HP, 0, false);
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  return out;
}

const _reachCache = new Map();
/**
 * (r,c) 에서 지형 이동 비용(AI PATH_COST, 진입 불가 지형 제외)으로 reach 이하인 칸 → 비용. 버킷 큐 (비용은 작은 정수)
 * distanceField 와 같은 비용표를 쓰되 reach 에서 멈춤 (계산 시간)
 */
function reachCells(type, r0, c0, reach) {
  const key = `${GAME_CONFIG.SCENARIO_ID}|${type}|${r0},${c0}|${reach}`;
  let out = _reachCache.get(key);
  if (out) return out;
  const PC = GAME_CONFIG.AI.PATH_COST;
  const cost = new Map([[r0 * N + c0, 0]]);
  const buckets = [[r0 * N + c0]];
  for (let d = 0; d <= reach; d++) {
    for (const i of buckets[d] || []) {
      if (cost.get(i) !== d) continue;
      const r = Math.floor(i / N), c = i % N;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const ter = terrainAt(nr, nc);
        if (ter.impassableFor && ter.impassableFor.includes(type)) continue;
        const nd = d + (PC[ter.key] ?? ter.moveCost);
        const ni = nr * N + nc;
        if (nd > reach || (cost.has(ni) && cost.get(ni) <= nd)) continue;
        cost.set(ni, nd);
        (buckets[nd] || (buckets[nd] = [])).push(ni);
      }
    }
  }
  out = [...cost.entries()];
  if (_reachCache.size > 2000) _reachCache.clear();
  _reachCache.set(key, out);
  return out;
}

/** 기록 하나의 위치 불확실성에 따른 가중치 (0~1): 신뢰도 × 1/(1 + SPREAD × 반경) */
const intelWeight = (e, K) => e.conf / (1 + K.SPREAD * e.radius);

/**
 * 위험 지도: 다음 상대 턴에 그 칸에 서 있는 defType 아군(최대 체력 기준)이 받을 기대 피해.
 * { dmg: 칸별 기대 피해 합, direct: 그중 직접 공격 몫, artyP: 칸별 '포병이 이 칸을 노려 명중할' 가중 확률 (인접 파편 계산용) }
 * 간접: 사거리(+불확실 반경, 박격포는 이동력도) 안. 포병이 쉬는 것으로 추정되면 포병 항 없음.
 * 직접: 지형 비용 거리 ≤ 이동력 + 반경 + 1. 명중률은 calcHitBreakdown (상대는 그 칸을 본다고 가정해 보수적으로)
 */
function threatMap(state, side, defType, K, records = null, resting = null) {
  const recs = records || intelRecords(state, side, K);
  const rest = resting == null ? intelArtyResting(state, side) : resting;
  const enemy = enemyOf(side);
  const NN = N * N;
  const dmg = new Float64Array(NN), direct = new Float64Array(NN), artyP = new Float64Array(NN);
  const def = { type: defType, hp: GAME_CONFIG.MAX_HP, side };
  const UT = GAME_CONFIG.UNIT_TYPES;
  // 명중률은 지형과 이동 후 공격 여부에만 달라짐 → 기록마다 (지형, 이동 후) 조합으로 한 번만 계산
  const hitOf = (att, moved, pen, memo, r, c) => {
    const ter = terrainAt(r, c), k = ter.key + (moved ? '1' : '0');
    let v = memo.get(k);
    if (v == null) {
      v = calcHitBreakdown({ attacker: att, defender: def, terrain: ter, signal: false, fogged: false, movedAttack: moved, indirectPenalty: pen }).chance / 100;
      memo.set(k, v);
    }
    return v;
  };
  for (const e of recs) {
    const et = UT[e.type];
    if (!et.canAttack) continue;
    const w = intelWeight(e, K);
    if (w < K.MIN_WEIGHT) continue;
    const att = { type: e.type, hp: e.hp, side: enemy };
    if (et.indirect) {
      if (e.type === 'artillery' && rest) continue;
      const R = fireRange(state, enemy, e.type);
      const slack = e.radius + (et.moveFire ? et.move : 0);
      const lo = Math.max(0, R.min - slack), hi = R.max + slack;
      const f = firesOf(state, enemy);
      const pen = f && f[e.type] && f[e.type].indirectPenalty ? f[e.type].indirectPenalty : 0;
      const amount = et.fixedDamage != null ? et.fixedDamage : calcDamage(att, def);
      const memo = new Map();
      for (let r = Math.max(0, e.r - hi); r <= Math.min(N - 1, e.r + hi); r++) for (let c = 0; c < N; c++) {
        const d = Math.abs(r - e.r) + Math.abs(c - e.c);
        if (d < lo || d > hi) continue;
        const i = r * N + c;
        const p = hitOf(att, !!et.moveFire && d > R.max, pen, memo, r, c) * w;
        dmg[i] += p * amount;
        if (et.splash !== false) artyP[i] += p;
      }
    } else {
      const reach = et.move + e.radius + 1;
      const amount = calcDamage(att, def);
      const memo = new Map();
      for (const [i, cost] of reachCells(e.type, e.r, e.c, reach)) {
        const v = hitOf(att, cost > 1, 0, memo, Math.floor(i / N), i % N) * w * amount;
        dmg[i] += v;
        direct[i] += v;
      }
    }
  }
  return { dmg, direct, artyP };
}

/**
 * 내가 u 를 pos 에 두었을 때의 기대 손실 비율 (0~1, 체력 대비). maps: 병종별 threatMap 을 돌려주는 함수.
 * 포병 파편: 인접 칸의 아군이 포병 표적이 되면 이 유닛도 파편 피해 (그 표적 확률의 절반으로 셈)
 */
function expectedLoss(state, side, u, pos, maps) {
  const m = maps(u.type);
  const i = idx(pos.r, pos.c);
  let d = m.dmg[i];
  const splash = GAME_CONFIG.COMBAT.splashDamage;
  for (const [dr, dc] of DIRS) {
    const r = pos.r + dr, c = pos.c + dc;
    if (!inBounds(r, c)) continue;
    const a = getUnitAt(state, r, c);
    if (a && a.side === side && a.id !== u.id) d += 0.5 * m.artyP[idx(r, c)] * splash;
  }
  return Math.min(1, d / Math.max(1, u.hp));
}

/**
 * 위협 점수: 그 적이 다음 턴에 거점이나 아군에게 줄 수 있는 기대 피해 × 거점에 가까운 정도 × 신뢰도.
 * objCells: 거점 칸 목록. 가까운 정도 = max(0, 1 − 거리/(이동력 + 사거리 + 3))
 */
function threatScore(e, objCells, K) {
  const et = GAME_CONFIG.UNIT_TYPES[e.type];
  if (!et.canAttack) return 0;
  let d = Infinity;
  for (const p of objCells) d = Math.min(d, Math.abs(p.r - e.r) + Math.abs(p.c - e.c));
  const reach = et.move + et.rangeMax + 3;
  const near = Math.max(0, 1 - d / reach);
  const power = Math.max(et.atkSoft, et.atkArmor) / 6;   // 0~1 근사 (가장 강한 공격력 6 기준)
  return power * near * intelWeight(e, K) * (e.hp / GAME_CONFIG.MAX_HP + 0.5);
}

/* =====================================================================
   새 대칭 AI (v2) 점수 항목. engine.js 의 aiScorePosition·aiScoreAttack·aiArtilleryTargets·aiNeutralGoals 가
   ctx.v2 가 있을 때만 부른다 (기존 점수에 더하는 방식). 설정: AI_CONFIG.SYMMETRIC.INTEL / V2
   ===================================================================== */
const _threatCache = new Map();   // 위험 지도 캐시 (키 = 진영·병종·기억 요약·포병 휴식·간접 화력 설정)
/** 시나리오가 바뀔 때 비움 (loadScenario): 캐시 키에 지도 크기·지형이 없으므로 다른 지도의 값이 섞이지 않게. 결과 값은 같음 (메모일 뿐) */
function intelClearCaches() { _threatCache.clear(); _reachCache.clear(); _objNear = null; }

/**
 * 압박 0~1: 승리 조건(시나리오 데이터)에서 계산. 라운드가 갈수록, 점유 거점이 상대보다 적을수록 큼.
 * roundLimitScore 가 있으면 남은 라운드와 점유 차이, roundLimitPoints 면 남은 라운드와 예상 총점 차이(지금 점수 + 지금 점유 점수 × 남은 라운드),
 * 상대에게 holdObjectives 가 있으면 상대가 필요 수에 가까울수록, scoreTarget 이 있으면 상대가 목표에 가까울수록
 */
function symUrgency(state, side) {
  const C = GAME_CONFIG, enemy = enemyOf(side);
  const mine = state.objectives.filter((o) => o.owner === side).length;
  const theirs = state.objectives.filter((o) => o.owner === enemy).length;
  let u = 0;
  const timeP = C.MAX_ROUNDS > 1 ? Math.min(1, Math.max(0, (state.round - 1) / (C.MAX_ROUNDS - 1))) : 1;
  const limit = roundLimitType();
  if (limit === 'roundLimitScore') {
    const behind = theirs > mine ? 1 : theirs === mine ? 0.5 : 0;
    u = timeP * (0.3 + 0.7 * behind);
  } else if (limit === 'roundLimitPoints' && state.score) {
    const left = C.MAX_ROUNDS - state.round + 1;
    const proj = (s) => state.score[s] + heldPoints(state, s).pts * left;   // 총점·점유는 공개 정보
    const behind = proj(enemy) > proj(side) ? 1 : proj(enemy) === proj(side) ? 0.5 : 0;
    u = timeP * (0.3 + 0.7 * behind);
    if (C.SCORE_TARGET && state.score[enemy] + 2 * heldPoints(state, enemy).pts >= C.SCORE_TARGET) u = Math.max(u, 0.7);
  }
  const hold = victoryCond(enemy, 'holdObjectives');
  if (hold && theirs >= hold.count - 1) u = Math.max(u, 0.7);
  return Math.min(1, u);
}

let _objNear = null;
/** 거점 칸에서 3칸 안의 칸 집합 (시나리오마다 한 번) + 칸별 가장 가까운 거점 칸 거리 */
function symObjNear(objCells) {
  if (_objNear && _objNear.id === GAME_CONFIG.SCENARIO_ID && _objNear.n === N) return _objNear.set;
  const set = new Set(), dist = new Int16Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const r = Math.floor(i / N), c = i % N;
    let d = 99;
    for (const q of objCells) d = Math.min(d, Math.abs(q.r - r) + Math.abs(q.c - c));
    dist[i] = d;
    if (d <= 3) set.add(i);
  }
  set.dist = dist;
  _objNear = { id: GAME_CONFIG.SCENARIO_ID, n: N, set };
  return set;
}

function symV2Context(state, side, level, ctx) {
  const S = GAME_CONFIG.AI.SYMMETRIC, K = S.INTEL, V = S.V2, L = V.LEVELS[level] || V.LEVELS.normal;
  const enemy = enemyOf(side);
  const records = intelRecords(state, side, K);
  const resting = intelArtyResting(state, side);
  const sig = `${side}|${state.round}|${resting ? 1 : 0}|${JSON.stringify(firesOf(state, enemy))}|` + records.map((e) => `${e.id}:${e.r},${e.c},${e.age},${e.hp}`).join(';');
  const maps = (type) => {
    const key = sig + '|' + type;
    let m = _threatCache.get(key);
    if (!m) {
      m = threatMap(state, side, type, K, records, resting);
      if (_threatCache.size > 64) _threatCache.clear();
      _threatCache.set(key, m);
    }
    return m;
  };
  const urgency = symUrgency(state, side);
  const objCells = state.objectives.flatMap((o) => objectiveCells(o));
  const objNear = symObjNear(objCells);
  // 아군 포병(파편 있음)이 지금 쏠 수 있는 보이는 표적의 인접 칸 = 비켜 주면 좋은 칸 (값 = 표적 가치)
  const lanes = new Map();
  for (const a of ctx.allies) {
    const at = unitType(a);
    if (!at.indirect || at.splash === false || a.acted || !canUnitAttack(state, a)) continue;
    for (const e of ctx.visibleEnemies) {
      if (!inFireRange(state, a, a, e)) continue;
      const v = GAME_CONFIG.AI.UNIT_VALUE[e.type];
      for (const [dr, dc] of DIRS) {
        const r = e.r + dr, c = e.c + dc;
        if (inBounds(r, c)) lanes.set(idx(r, c), Math.max(lanes.get(idx(r, c)) || 0, v));
      }
    }
  }
  const recById = new Map(records.map((e) => [e.id, e]));
  return {
    K, V, L, records, recById, resting, maps, urgency, objCells, objNear, lanes,
    riskW: L.riskWeight * (1 - V.urgencyRelief * urgency),
    minSupport: urgency > 0.85 ? 0 : urgency > 0.6 ? Math.max(0, L.minSupport - 1) : L.minSupport,
  };
}

/** 반격 목표: 거점 칸에서 counterRadius 안에 있는 (최근 본) 적. 전투 유닛(직접 공격)만 */
function symV2Goals(state, ctx, u, goals) {
  const t = unitType(u), X = ctx.v2;
  if (!t.canAttack || t.indirect) return;
  for (const e of X.records) {
    if (e.age > 1) continue;
    let d = Infinity;
    for (const q of X.objCells) d = Math.min(d, manhattan(e, q));
    if (d <= X.V.counterRadius) goals.push({ r: e.r, c: e.c });
  }
}

/** 위치 점수 추가 항목 */
function symV2Position(state, ctx, u, pos) {
  const X = ctx.v2, V = X.V, t = unitType(u), side = u.side;
  const moving = !samePos(pos, u);
  let s = 0;
  // 위험: 그 칸에 두었을 때 기대 손실 비율 × 가중 (포병·박격포·통신, 체력 낮은 유닛은 더 크게)
  const loss = expectedLoss(state, side, u, pos, X.maps);
  const mult = GAME_CONFIG.AI.UNIT_VALUE[u.type] * (t.indirect || t.isSignal ? V.supportValue : 1) * (u.hp <= 2 ? V.lowHpMult : 1);
  s -= X.riskW * mult * loss;
  // 집결 후 진입: 위험한 칸에 혼자 들어가지 않음 (지원 가능한 아군 수, 상대 포병 휴식 추정, 압박)
  if (moving && X.L.gatePenalty && loss >= X.L.highRisk && !t.indirect && !X.resting) {
    let support = 0;
    for (const a of ctx.allies) {
      if (a.id === u.id) continue;
      const at = unitType(a);
      if (at.canAttack && !at.indirect && manhattan(a, pos) <= at.move + 1) support++;
    }
    if (support < X.minSupport) s -= X.L.gatePenalty;
  }
  // 포병·박격포·통신: 직접 공격 위험이 있는 칸 피함 (보병 뒤쪽 유지)
  if (t.indirect || t.isSignal) s -= V.rearDirect * X.maps(u.type).direct[idx(pos.r, pos.c)];
  // 포병·박격포: 다음 턴에 쏠 수 있는 곳 — 사거리 안의 거점 칸(내가 점유하지 않은 곳)과 기억한 적
  if (t.indirect) {
    const R = fireRange(state, side, u.type);
    const inR = (p) => { const d = manhattan(pos, p); return d >= R.min && d <= R.max; };
    let cells = 0, recs = 0, near = Infinity;
    for (const o of state.objectives) if (o.owner !== side) for (const q of objectiveCells(o)) { if (inR(q)) cells++; near = Math.min(near, manhattan(pos, q)); }
    if (isFinite(near)) s -= V.artyReach * Math.max(0, near - R.max);   // 사거리 밖이면 거점 쪽으로 (사거리 안에 들 때까지)
    for (const e of X.records) if (inR(e)) recs += intelWeight(e, X.K);
    s += V.artyCover * Math.min(4, cells) + V.artyIntelCover * Math.min(3, recs);
    // 거점 칸 위는 보병 몫: 간접 화력 유닛은 점령·유지 점수를 대부분 덜어 냄 (앞줄에 서지 않게)
    const o = objectiveAt(state, pos.r, pos.c);
    if (o) s -= V.indirectHoldCut * (o.owner !== side ? GAME_CONFIG.AI.WEIGHTS.capture : GAME_CONFIG.AI.SYMMETRIC.HOLD);
  }
  if (GAME_CONFIG.RETREAT) s -= symV2RetreatRisk(state, ctx, u, pos, loss, mult);   // 한 번 맞으면 물러날 곳이 없는 칸·제압 위험 (retreat 규칙이 켜진 시나리오만)
  // 최소 수비: 점유 중인 거점의 마지막 수비 유닛은 떠나지 않음
  const o0 = objectiveAt(state, u.r, u.c);
  if (o0 && o0.owner === side && moving) {
    const cells = objectiveCells(o0);
    if (!cells.some((q) => samePos(q, pos))) {
      const others = cells.filter((q) => { const a = getUnitAt(state, q.r, q.c); return a && a.side === side && a.id !== u.id; }).length;
      if (others < V.minGarrison) s -= V.garrisonLeave;
    }
  }
  // 추격 제한: 전투 유닛이 거점에서 leashRadius 넘게 멀어지는 이동
  if (moving && t.canAttack && !t.indirect && u.type !== 'recon') {
    const d0 = X.objNear.dist[idx(u.r, u.c)], d1 = X.objNear.dist[idx(pos.r, pos.c)];
    if (d1 > V.leashRadius && d1 > d0) s -= V.leash * (d1 - Math.max(d0, V.leashRadius));
  }
  // 아군 포병 표적 옆에서 비켜 주기 (그다음 사격이 오폭 감점 없이 가능해짐)
  const here = X.lanes.get(idx(u.r, u.c)) || 0, there = X.lanes.get(idx(pos.r, pos.c)) || 0;
  if (moving) s += V.clearLane * (here - there);
  // 정찰: 거점 접근로(거점 3칸 안)의 안 보이던 칸을 새로 봄
  if (u.type === 'recon') {
    let fresh = 0;
    const v = t.vision;
    for (let dr = -v; dr <= v; dr++) {
      const rem = v - Math.abs(dr);
      for (let dc = -rem; dc <= rem; dc++) {
        const r = pos.r + dr, c = pos.c + dc;
        if (inBounds(r, c) && X.objNear.has(idx(r, c)) && !ctx.vis.has(idx(r, c))) fresh++;
      }
    }
    s += V.reconWatch * fresh;
  }
  return s;
}

/* ---------- 후퇴·제압 (시나리오 retreat) 을 아는 점수 항목 ----------
 * AI 가 쓰는 정보: 지형(공개), 맵 크기, 자기 유닛, 내 시야 안의 적 유닛, 내가 이번 턴에 제압한 유닛 id (내 사격 결과).
 * 안 보이는 칸은 비어 있다고 가정하고, 적의 제압 상태·체력 밖의 숨은 정보는 읽지 않는다.
 */
/** victim 이 dir 방향으로 후퇴할 때의 결과 { dies, to }: 규칙(retreatTarget)과 같은 판정이지만 아는 유닛만 본다 */
function symRetreatOutcome(state, ctx, aiSide, victim, dir) {
  const R = GAME_CONFIG.RETREAT;
  let r = victim.r, c = victim.c;
  for (let k = 0; k < R.steps; k++) {
    r += dir[0]; c += dir[1];
    for (;;) {
      if (!inBounds(r, c)) return { dies: true };
      const ter = terrainAt(r, c);
      if (ter.impassableFor && ter.impassableFor.includes(victim.type)) return { dies: true };
      const o = getUnitAt(state, r, c);
      const known = o && o.id !== victim.id && (o.side === aiSide || ctx.vis.has(idx(r, c)));
      if (!known) break;
      if (o.side !== victim.side || !R.passThroughFriendly) return { dies: true };
      r += dir[0]; c += dir[1];
    }
  }
  return { dies: false, to: { r, c } };
}

/** 내가 이번 턴에 제압한 적 유닛인가 (내 사격 결과로 안 것) */
function symKnowsSuppressed(state, side, unitId) {
  const sp = state.aiIntel && state.aiIntel[side] && state.aiIntel[side].supp;
  return !!sp && sp[unitId] === state.round && state.turn === side;
}

/** 내 사격 결과 기록 (resolveAttack 끝): 시야 안에서 제압한 적 유닛 id 를 이번 라운드에 기억 */
function intelOnSuppress(state, attacker, events) {
  if (!state.aiIntel || !state.aiIntel[attacker.side]) return;
  let vis = null;
  for (const ev of events) {
    if (ev.type !== 'suppressed' || ev.side === attacker.side) continue;
    vis = vis || getVisibleTiles(state, attacker.side);
    if (!vis.has(idx(ev.pos.r, ev.pos.c))) continue;
    const ai = state.aiIntel[attacker.side];
    (ai.supp || (ai.supp = {}))[ev.unitId] = state.round;
  }
}

/** 이 사격이 (명중하면) 가져올 후퇴·제압 효과의 가치. 보이는 표적과 그 파편 칸의 적만 센다 */
function symV2RetreatGain(state, ctx, u, from, target, p) {
  const X = ctx.v2, V = X.V, R = GAME_CONFIG.RETREAT, UV = GAME_CONFIG.AI.UNIT_VALUE;
  const t = unitType(u);
  const victims = [{ unit: target, splash: false, amount: t.fixedDamage != null ? t.fixedDamage : calcDamage(u, target) }];
  if (t.indirect && t.splash !== false) {
    for (const [dr, dc] of DIRS) {
      const o = getUnitAt(state, target.r + dr, target.c + dc);
      if (o && o.side !== u.side && ctx.vis.has(idx(o.r, o.c))) victims.push({ unit: o, splash: true, amount: GAME_CONFIG.COMBAT.splashDamage });
    }
  }
  let s = 0;
  for (const v of victims) {
    const o = v.unit;
    if (o.side === u.side || o.hp <= v.amount) continue;   // 아군 오사는 후퇴·제압 없음 · 피해로 격파되면 기존 항목이 셈
    const val = UV[o.type] || 1;
    const sp = R.suppress;
    if (t.indirect && !v.splash && sp && sp.byImpactCenter && sp.sources.includes(u.type)) {
      s += (symKnowsSuppressed(state, u.side, o.id) && sp.repeatIsDeath ? V.resuppressKill : V.suppress) * val * p;
      continue;
    }
    const out = symRetreatOutcome(state, ctx, u.side, o, retreatDir(from, o, target, t.indirect && v.splash));
    if (out.dies) { s += V.retreatKill * val * p; continue; }
    // 거점 수비 유닛을 밀어내 거점이 비면 (그 거점 안에 남는 같은 편이 없을 때)
    const obj = objectiveAt(state, o.r, o.c);
    if (obj && !objectiveCells(obj).some((q) => (q.r !== o.r || q.c !== o.c) && ctx.vis.has(idx(q.r, q.c)) && (getUnitAt(state, q.r, q.c) || {}).side === o.side)
        && !objectiveCells(obj).some((q) => q.r === out.to.r && q.c === out.to.c)) {
      const pts = GAME_CONFIG.OBJECTIVE_POINTS ? GAME_CONFIG.OBJECTIVE_POINTS[obj.id] || 1 : 1;
      s += V.retreatClear * pts * p;
    }
  }
  return s;
}

/** 칸 pos 에 u 를 두었을 때의 후퇴·제압 위험 (감점 크기, 0 이상). loss: 그 칸의 기대 손실 비율, mult: 병종·체력 가중 */
function symV2RetreatRisk(state, ctx, u, pos, loss, mult) {
  const X = ctx.v2, V = X.V;
  const m = X.maps(u.type), i = idx(pos.r, pos.c);
  // 맞았을 때 물러날 칸이 막힌 방향 비율 (맵 끝·이동 불가 지형·보이는 적). 아군은 지나갈 수 있으므로 막힘이 아님
  let blocked = 0;
  for (const [dr, dc] of DIRS) {
    const r = pos.r + dr, c = pos.c + dc;
    if (!inBounds(r, c)) { blocked++; continue; }
    const ter = terrainAt(r, c);
    if (ter.impassableFor && ter.impassableFor.includes(u.type)) { blocked++; continue; }
    const o = getUnitAt(state, r, c);
    if (o && o.side !== u.side && ctx.vis.has(idx(r, c))) blocked++;
  }
  const exposure = Math.min(1, (m.direct[i] + 0.5 * m.artyP[i] * GAME_CONFIG.COMBAT.splashDamage) / Math.max(1, u.hp));
  const indirectLoss = Math.min(1, Math.max(0, m.dmg[i] - m.direct[i]));   // 간접 화력에 맞을 기대치 (제압 위험)
  return V.noRetreat * mult * (blocked / 4) * exposure + V.suppressRisk * mult * indirectLoss;
}

/** 공격 점수 추가 항목: 위협 제거, 마무리, 집중 사격. target 은 보이는 적 또는 기억으로 만든 가상 표적 */
function symV2Attack(state, ctx, u, target, p, kind = 'visible', from = u) {
  const X = ctx.v2, V = X.V;
  const rec = (target.id && X.recById.get(target.id)) || { type: target.type, r: target.r, c: target.c, hp: target.hp, conf: 1, radius: 0 };
  const ts = threatScore({ ...rec, hp: target.hp }, X.objCells, X.K);
  const t = unitType(u);
  const dmg = t.fixedDamage != null ? t.fixedDamage : calcDamage(u, target);
  let s = V.threatKill * ts * p * Math.min(dmg, target.hp) / target.hp;
  if (dmg >= target.hp) s += V.finish * p * (1 + ts);
  if (target.hp < GAME_CONFIG.MAX_HP) s += V.focus * p;
  // 간접 화력 사용 가산: 행동 한도 안에서 이동 후보에 밀려 포병·박격포가 놀지 않게 (표적 종류별, 오폭 감점은 기존 항목)
  // 파편이 있는 포병: 표적 옆에 아군이 있으면 가산 없음 + 아군 1기당 감점 (먼저 비켜 주는 이동은 symV2Position 의 clearLane)
  let adj = 0;
  if (t.indirect && t.splash !== false) for (const [dr, dc] of DIRS) { const a = getUnitAt(state, target.r + dr, target.c + dc); if (a && a.side === u.side) adj++; }
  if (t.indirect) s += adj ? -V.ffAdjacent * adj : (V.fireReady[kind] || 0) * (u.hp / GAME_CONFIG.MAX_HP);
  if (GAME_CONFIG.RETREAT && kind === 'visible') s += symV2RetreatGain(state, ctx, u, from, target, p);   // 후퇴 불가 격파·거점 비우기·제압 (retreat 규칙이 켜진 시나리오만)
  return s;
}

/**
 * 안개 속 사격 후보: 기억한 위치(신뢰도·불확실 반경 기준) + 올 가능성이 높은 칸(내가 점유하지 않은 거점 칸).
 * 보이는 칸·내 유닛 칸은 빼고, 가중 신뢰도가 높은 순으로 maxFogTargets 개까지
 */
function symV2FogTargets(state, ctx, u, inRange) {
  const X = ctx.v2, V = X.V;
  if (!blindFireAllowed(state, u.side)) return [];
  const out = [], seen = new Set();
  const ok = (r, c) => {
    const k = idx(r, c);
    if (seen.has(k) || ctx.vis.has(k) || !inRange({ r, c })) return false;
    const a = getUnitAt(state, r, c);
    return !(a && a.side === u.side);
  };
  for (const e of X.records) {
    if (e.seen || e.conf < V.fogMinConf || e.radius > V.fogMaxRadius || !ok(e.r, e.c)) continue;
    seen.add(idx(e.r, e.c));
    out.push({ r: e.r, c: e.c, kind: 'intel', id: e.id, type: e.type, hp: e.hp, conf: intelWeight(e, X.K) });
  }
  for (const o of state.objectives) {
    if (o.owner === u.side) continue;
    const conf = V.likelyConf * (o.owner === enemyOf(u.side) ? 2 : 1);   // 상대 점유 = 그 안에 상대 유닛이 있음 (공개 정보)
    for (const q of objectiveCells(o)) {
      if (!ok(q.r, q.c)) continue;
      seen.add(idx(q.r, q.c));
      out.push({ r: q.r, c: q.c, kind: 'likely', type: 'infantry', hp: GAME_CONFIG.MAX_HP, conf });
    }
  }
  out.sort((a, b) => b.conf - a.conf || a.r - b.r || a.c - b.c);
  return out.slice(0, V.maxFogTargets);
}

/* =====================================================================
   진단용 수비 봇 'turtle' (대칭 시나리오, simulateGames 프로필로만. 화면에는 없음). 결정적 (난수 없음)
   자기 쪽에서 가까운 거점 2곳 위·옆에 보병, 포병·박격포는 그 뒤 3~4칸에서 보이는 적을 쏨(오폭 우려가 있으면 건너뜀),
   정찰은 앞쪽, 기갑은 중앙 뒤 예비. 거점 3칸 안의 적은 집중 공격
   ===================================================================== */
function turtleTakeTurn(state, side, rng, opts = {}) {
  const C = GAME_CONFIG, AI = C.AI;
  const diceRng = opts.diceRng || rng;
  const actions = [];
  const anchor = sideAnchor(side), foe = sideAnchor(enemyOf(side));
  const dObj = (o, p) => Math.min(...objectiveCells(o).map((q) => manhattan(q, p)));
  const objs = state.objectives.slice().sort((a, b) => dObj(a, anchor) - dObj(b, anchor) || a.id.localeCompare(b.id)).slice(0, 2);
  const objCells = objs.flatMap((o) => objectiveCells(o));
  const nearObj = (p) => Math.min(...objCells.map((q) => manhattan(q, p)));
  const byId = (a, b) => a.id.localeCompare(b.id, 'en', { numeric: true });
  const record = (u, from, target, events) => actions.push({ unitId: u.id, side, unitType: u.type, from, to: { r: u.r, c: u.c }, target, events, moveSnapshot: null, snapshot: null });
  const visEnemies = () => { const vis = getVisibleTiles(state, side); return state.units.filter((e) => e.side !== side && vis.has(idx(e.r, e.c))); };
  const hitP = (u, e) => calcHitBreakdown({ attacker: u, defender: e, terrain: terrainAt(e.r, e.c), signal: hasSignalSupport(state, u), fogged: false, movedAttack: isMoveAttack(u), indirectPenalty: indirectPenaltyOf(state, u) }).chance / 100;
  const attack = (u, e, from, pre = []) => {
    if (!getAttackableTiles(state, u.id).some((p) => samePos(p, e))) return false;
    const events = [...pre, ...resolveAttack(state, u.id, { r: e.r, c: e.c }, diceRng)];
    if (getUnit(state, u.id)) finishUnit(state, u.id);
    record(u, from, { r: e.r, c: e.c, kind: 'visible' }, events);
    return true;
  };
  const stepToward = (u, goal) => {
    const field = distanceField(u.type, goal);
    let best = null, bestD = field[idx(u.r, u.c)];
    for (const t of getReachableTiles(state, u.id)) {
      const d = field[idx(t.r, t.c)];
      if (d < bestD) { best = t; bestD = d; }
    }
    return best;
  };
  // 1) 간접 화력: 보이는 적, 기대 피해가 가장 큰 표적. 포병은 표적 옆에 아군이 있으면 건너뜀
  for (const u of state.units.filter((x) => x.side === side && unitType(x).indirect).sort(byId)) {
    if (state.winner || !canUnitAttack(state, u)) continue;
    const t = unitType(u);
    let best = null, bestS = 0;
    for (const e of visEnemies()) {
      if (!inFireRange(state, u, u, e)) continue;
      if (t.splash !== false && DIRS.some(([dr, dc]) => { const a = getUnitAt(state, e.r + dr, e.c + dc); return a && a.side === side; })) continue;
      const dmg = t.fixedDamage != null ? t.fixedDamage : calcDamage(u, e);
      const sc = hitP(u, e) * Math.min(dmg, e.hp) * AI.UNIT_VALUE[e.type] * (nearObj(e) <= 3 ? 2 : 1) * (e.hp < C.MAX_HP ? 1.3 : 1);
      if (sc > bestS) { bestS = sc; best = e; }
    }
    if (best) attack(u, best, { r: u.r, c: u.c });
  }
  // 2) 직접 공격: 인접한 보이는 적 (거점 3칸 안 → 체력 낮은 순). 기갑은 거점 근처 적에게 이동 후 공격
  for (const u of state.units.filter((x) => x.side === side && unitType(x).canAttack && !unitType(x).indirect).sort(byId)) {
    if (state.winner || !getUnit(state, u.id) || !canUnitAttack(state, u)) continue;
    const foes = visEnemies().sort((a, b) => (nearObj(a) <= 3 ? 0 : 1) - (nearObj(b) <= 3 ? 0 : 1) || a.hp - b.hp || byId(a, b));
    let done = false;
    for (const e of foes) if (manhattan(u, e) === 1 && attack(u, e, { r: u.r, c: u.c })) { done = true; break; }
    if (done || u.type !== 'armor' || !canUnitMove(state, u)) continue;
    for (const e of foes.filter((x) => nearObj(x) <= 3)) {
      const spot = getReachableTiles(state, u.id).filter((t) => manhattan(t, e) === 1 && t.remaining >= attackCost(u.type))
        .sort((a, b) => b.remaining - a.remaining || a.r - b.r || a.c - b.c)[0];
      if (!spot) continue;
      const from = { r: u.r, c: u.c };
      const mv = moveUnit(state, u.id, { r: spot.r, c: spot.c });
      if (state.winner || !getUnit(state, u.id) || !samePos(u, spot) || !attack(u, e, from, mv)) {
        if (getUnit(state, u.id)) finishUnit(state, u.id);
        record(u, from, null, mv);
      }
      break;
    }
  }
  // 3) 자리 잡기: 보병·대전차 = 거점 칸과 옆 칸, 포병·박격포 = 주 거점 뒤 3~4칸, 통신 = 뒤 2칸, 정찰 = 앞 2칸, 기갑 = 뒤 2~3칸
  const slots = [];
  for (const q of objCells) slots.push(q);
  for (const q of objCells) for (const [dr, dc] of DIRS) {
    const p = { r: q.r + dr, c: q.c + dc };
    if (inBounds(p.r, p.c) && !slots.some((x) => samePos(x, p))) slots.push(p);
  }
  const taken = new Set();
  const mainCell = objectiveCells(objs[0])[0];
  const ringGoal = (u, lo, hi, towardFoe) => {
    let best = null, bestK = Infinity;
    for (let i = 0; i < N * N; i++) {
      const p = posOf(i);
      const d = manhattan(p, mainCell);
      if (d < lo || d > hi || taken.has(i)) continue;
      const ter = terrainAt(p.r, p.c);
      if (ter.impassableFor && ter.impassableFor.includes(u.type)) continue;
      const k = (towardFoe ? manhattan(p, foe) : manhattan(p, anchor)) * 1000 + i;
      if (k < bestK) { bestK = k; best = p; }
    }
    return best;
  };
  for (const u of state.units.filter((x) => x.side === side).sort(byId)) {
    if (state.winner || !getUnit(state, u.id) || u.acted || !canUnitMove(state, u)) continue;
    const t = unitType(u);
    let goal = null;
    if (u.type === 'infantry' || u.type === 'antitank') {
      const free = slots.filter((q) => !taken.has(idx(q.r, q.c)) && !(terrainAt(q.r, q.c).impassableFor || []).includes(u.type));
      const onObj = (q) => (objCells.some((x) => samePos(x, q)) ? 0 : 1);   // 거점 칸 먼저, 그다음 옆 칸
      free.sort((a, b) => onObj(a) - onObj(b) || manhattan(a, u) - manhattan(b, u) || a.r - b.r || a.c - b.c);
      goal = free[0] || null;
    } else if (t.indirect) goal = ringGoal(u, 3, 4, false);
    else if (t.isSignal) goal = ringGoal(u, 2, 2, false);
    else if (u.type === 'recon') goal = ringGoal(u, 2, 2, true);
    else if (u.type === 'armor') goal = ringGoal(u, 2, 3, false);
    if (!goal) continue;
    taken.add(idx(goal.r, goal.c));
    if (samePos(u, goal)) continue;
    const dest = stepToward(u, goal);
    if (!dest) continue;
    const from = { r: u.r, c: u.c };
    const events = moveUnit(state, u.id, { r: dest.r, c: dest.c });
    if (getUnit(state, u.id)) finishUnit(state, u.id);
    record(u, from, null, events);
  }
  return actions;
}

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, { symUrgency, symV2FogTargets, turtleTakeTurn, intelInit, intelRecords, intelArtyResting, intelEnemyCount, threatMap, expectedLoss, threatScore, intelSetupOf });
}
