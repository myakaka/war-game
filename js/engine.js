'use strict';
/* =====================================================================
   게임 엔진 (DOM 미사용 · 순수 함수)
   규칙 판정, 시야, 이동·공격, 승리 판정, AI, 시뮬레이션, 기록.
   loadScenario(id) 가 rules.js · ai-config.js · scenarios/*.js 의 값을 GAME_CONFIG 하나로 합치고, 엔진 함수는 GAME_CONFIG 만 본다.
   Node 에서는 strings.js → rules.js → ai-config.js → scenarios/*.js → engine.js 순서로 실행하면 된다.
   ===================================================================== */
/** 엔진이 읽는 합쳐진 설정. 규칙(RULES 등)은 처음 한 번 복사, 시나리오 값은 loadScenario 가 채움 */
const GAME_CONFIG = {
  ...JSON.parse(JSON.stringify(RULES)),
  UNIT_TYPES: JSON.parse(JSON.stringify(UNIT_TYPES)),
  TERRAIN: JSON.parse(JSON.stringify(TERRAIN_TYPES)),
  AI: JSON.parse(JSON.stringify(AI_CONFIG)),
};

/* =========================== 2. 유틸 =========================== */
let N = SCENARIOS[0].map.length;   // 지도 한 변의 칸 수 (loadScenario 가 갱신)
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const _distCache = new Map();   // 지도별 거리 지도 캐시 (distanceField)
const _rushCache = new Map();   // 지도별 도하 거리 캐시 (rushDistance)
const idx = (r, c) => r * N + c;
const posOf = (i) => ({ r: Math.floor(i / N), c: i % N });
const inBounds = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const manhattan = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
const samePos = (a, b) => a.r === b.r && a.c === b.c;
const enemyOf = (side) => GAME_CONFIG.ROUND_ORDER.find((s) => s !== side);

function terrainAt(r, c) { return GAME_CONFIG.TERRAIN[GAME_CONFIG.MAP[r][c]]; }
function unitType(u) { return GAME_CONFIG.UNIT_TYPES[u.type]; }
function getUnit(state, id) { return state.units.find((u) => u.id === id) || null; }
function getUnitAt(state, r, c) { return state.units.find((u) => u.r === r && u.c === c) || null; }
function objectiveAt(state, r, c) {
  const M = GAME_CONFIG.OBJ_CELL_ID;   // 여러 칸 거점이 있는 시나리오만: 칸 → 거점 id
  if (M) { const id = M.get(r * N + c); return id == null ? null : state.objectives.find((o) => o.id === id) || null; }
  return state.objectives.find((o) => o.r === r && o.c === c) || null;
}
/** 거점의 칸 목록 [{r,c}] (한 칸 거점은 [{r,c}]) */
function objectiveCells(o) {
  const info = GAME_CONFIG.OBJECTIVES.find((x) => x.id === o.id);
  return info && info.cells ? info.cells : [{ r: o.r, c: o.c }];
}
function cloneState(state) { return JSON.parse(JSON.stringify(state)); }

/* ---------- 시나리오 불러오기 ---------- */
const P2 = (a) => ({ r: a[0], c: a[1] });   // 데이터의 [r,c] → {r,c}
/** 진영의 역할 ('def' | 'att') */
const roleOf = (side) => (GAME_CONFIG.SIDES[side] ? GAME_CONFIG.SIDES[side].role : null);
/** 역할로 진영 id 찾기 */
const sideByRole = (role) => GAME_CONFIG.ROUND_ORDER.find((s) => roleOf(s) === role) || null;
/** 공격 측 진영 (AI 전술 기능·도하 지표의 기준) */
const attackerSide = () => sideByRole('att');
/** 진영 이름 문자열 키 */
const sideNameKey = (side) => (GAME_CONFIG.SIDES[side] && GAME_CONFIG.SIDES[side].nameKey) || 'side.' + side;
/** 이 진영의 승리 조건 중 type 인 것 (없으면 null) */
function victoryCond(side, type) {
  const list = (GAME_CONFIG.VICTORY && GAME_CONFIG.VICTORY[side]) || [];
  return list.find((v) => v.type === type) || null;
}
/** 거점 승리 조건을 가진 진영 (없으면 null) */
const holdSide = () => GAME_CONFIG.ROUND_ORDER.find((s) => victoryCond(s, 'holdObjectives')) || null;
/** 거점 승리에 필요한 거점 수 (조건이 없으면 null) */
const holdCount = () => { const s = holdSide(); return s ? victoryCond(s, 'holdObjectives').count : null; };
/** 양쪽이 같은 라운드 제한 판정을 가질 때 그 종류 ('roundLimitPoints' 총점 · 'roundLimitScore' 거점 수), 없으면 null. 무승부가 생기는 시나리오 */
const roundLimitType = () => ['roundLimitPoints', 'roundLimitScore'].find((k) => GAME_CONFIG.ROUND_ORDER.every((s) => victoryCond(s, k))) || null;
/** 라운드를 버티면 이기는 진영 (없으면 null) */
const surviveSide = () => GAME_CONFIG.ROUND_ORDER.find((s) => victoryCond(s, 'surviveRounds')) || null;
/** 지형 이름 문자열 키 (시나리오가 이름만 바꾼 경우 반영) */
function terrainNameKey(terOrKey) {
  const key = typeof terOrKey === 'string' ? terOrKey : terOrKey.key;
  const over = GAME_CONFIG.TERRAIN_NAMES && GAME_CONFIG.TERRAIN_NAMES[key];
  if (over) return over;
  const ter = Object.values(GAME_CONFIG.TERRAIN).find((x) => x.key === key);
  return (ter && ter.nameKey) || 'terrain.' + key;
}
/** 진영의 기준점: 본부가 있으면 본부, 없으면 그 진영 배치(시작+예약)의 평균 위치 (AI 의 '뒤쪽' 판단용) */
function sideAnchor(side) {
  const C = GAME_CONFIG;
  if (C.HQ[side]) return C.HQ[side];
  return C.ANCHORS[side] || { r: Math.floor(N / 2), c: Math.floor(N / 2) };
}
/** 진영의 전체 병력 수 (시작 배치 + 예약 투입) */
function sideTotalUnits(side) {
  const C = GAME_CONFIG;
  return C.DEPLOYMENT[side].length + C.REINFORCEMENTS.filter((g) => g.side === side).reduce((n, g) => n + g.count, 0);
}

/** 데이터의 배치 항목 → { type, round, side, count, cells:[{r,c}] } */
function normalizeDeployment(d) {
  const cells = d.cells ? d.cells.map(P2) : d.pos ? [P2(d.pos)] : [];
  return { round: d.round || 0, side: d.side, type: d.type, count: d.count || (d.cells ? d.cells.length : 1), cells };
}

/** 시나리오의 라운드 순서: firstMover 가 있으면 [선공, 나머지], 없으면 turnOrder */
function scenarioTurnOrder(s) {
  if (s.firstMover) return [s.firstMover, ...Object.keys(s.sides || {}).filter((x) => x !== s.firstMover)];
  return (s.turnOrder || []).slice();
}
/** 데이터의 거점 칸 목록 [[r,c]] (pos 또는 cells) */
function objectiveCellList(o) { return o.cells ? o.cells : o.pos ? [o.pos] : []; }

/** 시나리오 덮어쓰기 (진단용). 함수면 시나리오 사본을 직접 고치고, 객체면 아래 키를 적용 */
function applyScenarioOverrides(s, ov) {
  if (!ov) return s;
  if (typeof ov === 'function') { ov(s); return s; }
  const { rounds, moveArrivals, addDeployments, fires, counts, ...rest } = ov;
  if (rounds != null) {
    s.rounds = rounds;
    for (const list of Object.values(s.victory)) for (const v of list) if (v.type === 'surviveRounds') v.rounds = rounds;
  }
  // moveArrivals: [{ side, from, to }] — from 라운드의 예약 투입을 to 라운드로
  for (const m of moveArrivals || []) for (const d of s.deployments) if (d.side === m.side && d.round === m.from) d.round = m.to;
  for (const d of addDeployments || []) s.deployments.push(JSON.parse(JSON.stringify(d)));
  // fires: null = 간접 화력 설정 제거 (v6 규칙), 객체 = 시나리오 값에 깊게 합침
  if (fires === null) delete s.fires;
  else if (fires) s.fires = deepMerge(s.fires || {}, JSON.parse(JSON.stringify(fires)));
  // counts: [{ side, type, count }] — 그 진영·병종의 예약 투입(cells 가 있는 항목) 수. 0 이면 항목 제거
  for (const k of counts || []) {
    const d = s.deployments.find((x) => x.side === k.side && x.type === k.type && x.cells);
    if (!d) continue;
    if (k.count <= 0) s.deployments.splice(s.deployments.indexOf(d), 1);
    else d.count = k.count;
  }
  Object.assign(s, rest);
  return s;
}

/**
 * 시나리오를 검사해 사람이 읽을 수 있는 오류 문장 목록을 돌려줌 (없으면 빈 배열).
 * 맵 크기·지형 문자, 진영·턴 순서, 라운드 수, 본부·거점·배치·도착 칸(맵 안, 지나갈 수 있는 칸), 시작 배치 중복, 병종 id, 승리 조건
 */
function validateScenario(s) {
  const errs = [];
  const E = (k, p) => errs.push(t('scenErr.prefix', { id: s && s.id, msg: { t: k, p } }));
  if (!s || !Array.isArray(s.map) || !s.map.length) { E('scenErr.map'); return errs; }
  const n = s.map.length;
  s.map.forEach((row, r) => {
    if (typeof row !== 'string' || row.length !== n) E('err.mapRowLength', { r, n });
    else for (const ch of row) if (!TERRAIN_TYPES[ch]) E('err.unknownTerrain', { ch, r });
  });
  const inB = (p) => Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 0 && p[0] < n && p[1] >= 0 && p[1] < n;
  const terOf = (p) => TERRAIN_TYPES[s.map[p[0]][p[1]]];
  const passable = (p, type) => { const ter = terOf(p); return !!ter && !(ter.impassableFor && type && ter.impassableFor.includes(type)); };
  const sides = Object.keys(s.sides || {});
  if (sides.length !== 2) E('scenErr.sides');
  const order = s.firstMover != null ? (sides.includes(s.firstMover) ? scenarioTurnOrder(s) : null) : s.turnOrder;
  if (!Array.isArray(order) || order.length !== 2 || order.some((x) => !sides.includes(x)) || new Set(order).size !== 2) E('scenErr.turnOrder');
  if (s.secondMoverBonus != null && !(Number.isInteger(s.secondMoverBonus) && s.secondMoverBonus >= 0)) E('scenErr.secondMoverBonus', { n: s.secondMoverBonus });
  if (s.objectiveControl != null && !['sticky', 'presence'].includes(s.objectiveControl)) E('scenErr.objectiveControl', { v: String(s.objectiveControl) });
  if (s.aiProfile != null && s.aiProfile !== 'symmetric') E('scenErr.aiProfile', { v: String(s.aiProfile) });
  if (s.aiProfiles != null && !(Array.isArray(s.aiProfiles) && s.aiProfiles.length && s.aiProfiles.every((p) => GAME_CONFIG.AI.TACTIC_PROFILES[p]))) E('scenErr.aiProfiles', { v: String(s.aiProfiles) });
  if (!sides.includes(s.playerSide)) E('scenErr.playerSide');
  if (new Set(sides.map((x) => x[0].toUpperCase())).size !== sides.length) E('scenErr.prefix2');
  const roles = sides.map((x) => s.sides[x].role).sort().join(',');
  if (roles !== 'att,def') E('scenErr.roles');
  if (!Number.isInteger(s.rounds) || s.rounds < 1) E('scenErr.rounds', { n: s.rounds });
  for (const side of sides) {
    const h = s.hq && s.hq[side];
    if (h == null) continue;
    if (!inB(h)) E('scenErr.cell', { what: { t: 'scenErr.what.hq' }, r: h[0], c: h[1] });
  }
  const objCells = new Set();
  for (const o of s.objectives || []) {
    const list = objectiveCellList(o);
    if (!list.length) E('scenErr.cell', { what: { t: 'scenErr.what.obj' }, r: '-', c: '-' });
    for (const p of list) {
      if (!inB(p)) { E('scenErr.cell', { what: { t: 'scenErr.what.obj' }, r: p && p[0], c: p && p[1] }); continue; }
      if (!passable(p)) E('scenErr.cell', { what: { t: 'scenErr.what.obj' }, r: p[0], c: p[1] });
      const k = p.join(',');
      if (objCells.has(k)) E('scenErr.objDup', { r: p[0], c: p[1] });
      objCells.add(k);
    }
    if (o.startOwner != null && !sides.includes(o.startOwner)) E('scenErr.owner', { id: o.id });
  }
  const start = new Set();
  for (const d of s.deployments || []) {
    if (!UNIT_TYPES[d.type]) { E('err.unknownType', { type: d.type }); continue; }
    if (!sides.includes(d.side)) { E('scenErr.side', { side: d.side }); continue; }
    if (!Number.isInteger(d.round || 0) || (d.round || 0) < 0 || (d.round || 0) > s.rounds) E('scenErr.arrivalRound', { n: d.round });
    const list = d.cells || (d.pos ? [d.pos] : []);
    if (!list.length) E('scenErr.noCells', { type: d.type, n: d.round || 0 });
    if (!(d.round || 0) && (d.cells || d.count)) E('scenErr.startPos');
    for (const p of list) {
      if (!inB(p)) { E('err.deployOutOfBounds', { r: p && p[0], c: p && p[1] }); continue; }
      if (!passable(p, d.type)) E('err.deployTerrain', { type: d.type, r: p[0], c: p[1] });
      if (!(d.round || 0)) {
        const k = p.join(',');
        if (start.has(k)) E('err.deployDuplicate', { r: p[0], c: p[1] });
        start.add(k);
      }
    }
  }
  for (const side of sides) {
    const z = s.placementZones && s.placementZones[side];
    if (!z) continue;
    const ok = (a) => Array.isArray(a) && a.length === 2 && a[0] >= 0 && a[1] < n && a[0] <= a[1];
    if (!ok(z.rows) || (z.cols && !ok(z.cols))) { E('scenErr.zone', { side }); continue; }
    // 기본 배치가 배치 구역 안인지
    for (const d of (s.deployments || []).filter((x) => x.side === side && !(x.round || 0) && x.pos)) {
      const [r, c] = d.pos;
      if (r < z.rows[0] || r > z.rows[1] || (z.cols && (c < z.cols[0] || c > z.cols[1]))) E('scenErr.defaultOutside', { side, r, c });
    }
  }
  const TYPES = ['enterHQ', 'annihilation', 'holdObjectives', 'surviveRounds', 'roundLimitScore', 'roundLimitPoints'];
  // 점수제 (objectivePoints): 거점 id → 0 이상의 정수, 모든 거점에 값. scoreTiming 'ownTurnEnd'|'roundEnd', scoreTarget null|1 이상의 정수
  if (s.objectivePoints != null) {
    const P = s.objectivePoints, ids = (s.objectives || []).map((o) => o.id);
    if (typeof P !== 'object' || Object.keys(P).some((k) => !ids.includes(k)) || ids.some((k) => !(Number.isInteger(P[k]) && P[k] >= 0))) E('scenErr.objectivePoints');
  }
  if (s.scoreTiming != null && !['ownTurnEnd', 'roundEnd'].includes(s.scoreTiming)) E('scenErr.scoreTiming', { v: String(s.scoreTiming) });
  if (s.scoreTarget != null && !(Number.isInteger(s.scoreTarget) && s.scoreTarget >= 1)) E('scenErr.scoreTarget', { v: String(s.scoreTarget) });
  if ((s.scoreTiming != null || s.scoreTarget != null) && s.objectivePoints == null) E('scenErr.objectivePoints');
  for (const side of sides) {
    const list = (s.victory && s.victory[side]) || [];
    if (!list.length) E('scenErr.noVictory', { side });
    for (const v of list) {
      if (!TYPES.includes(v.type)) E('scenErr.victoryType', { type: v.type });
      if (v.type === 'holdObjectives' && !(Number.isInteger(v.count) && v.count >= 1 && v.count <= (s.objectives || []).length)) E('scenErr.holdCount', { n: v.count });
      if (v.type === 'surviveRounds' && !(Number.isInteger(v.rounds) && v.rounds >= 1 && v.rounds <= s.rounds)) E('scenErr.surviveRounds', { n: v.rounds });
      if (v.type === 'enterHQ' && !(s.hq && s.hq[sides.find((x) => x !== side)])) E('scenErr.enterHQ', { side });
      if (v.type === 'roundLimitPoints' && s.objectivePoints == null) E('scenErr.objectivePoints');
    }
  }
  if (s.river) for (const p of s.river.crossings || []) if (!inB(p)) E('scenErr.cell', { what: { t: 'scenErr.what.crossing' }, r: p[0], c: p[1] });
  if (s.activations != null) {
    const a = s.activations;
    if (typeof a !== 'object' || Object.keys(a).some((k) => k !== 'def' && k !== 'att')) E('scenErr.activations', { role: '-', n: '-' });
    else for (const role of ['def', 'att']) if (!(Number.isInteger(a[role]) && a[role] >= 1)) E('scenErr.activations', { role, n: a[role] });
  }
  if (s.fires != null) {
    const f = s.fires;
    const int0 = (v) => Number.isInteger(v) && v >= 0;
    if (typeof f !== 'object') E('scenErr.fires', { key: 'fires', v: String(f) });
    else for (const [k, v] of Object.entries(f)) {
      if (k === 'blindFire') { if (typeof v !== 'boolean') E('scenErr.fires', { key: k, v: String(v) }); continue; }
      if (!UNIT_TYPES[k] || !UNIT_TYPES[k].indirect || !v || typeof v !== 'object') { E('scenErr.fires', { key: k, v: '-' }); continue; }
      for (const [kk, vv] of Object.entries(v)) {
        if (!['range', 'cooldown', 'indirectPenalty'].includes(kk) || !int0(vv)) E('scenErr.fires', { key: `${k}.${kk}`, v: String(vv) });
        else if (kk === 'range' && vv < UNIT_TYPES[k].rangeMin) E('scenErr.fires', { key: `${k}.${kk}`, v: String(vv) });
      }
    }
  }
  if (s.symmetric) for (const m of symmetryErrors(s)) E('scenErr.symmetry', { what: m });
  return errs;
}

/**
 * 대칭 검사 (시나리오 symmetric: true). 180도 회전 (r,c) ↔ (n-1-r, n-1-c) 에서
 * 지형, 거점 묶음(서로 대응), 진영별 배치·증원(같은 라운드·병종·수, 회전한 칸), 행동 한도, 승리 조건, 본부가 같아야 함.
 * 병종 수치는 진영 공통(UNIT_TYPES)이라 진영별 보정 항목이 있으면 오류. 어긋난 항목 설명 목록을 돌려줌 (없으면 빈 배열)
 */
function symmetryErrors(s) {
  const out = [];
  const n = s.map.length;
  const rot = (p) => [n - 1 - p[0], n - 1 - p[1]];
  const key = (list) => list.map((p) => p.join(',')).sort().join(' ');
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const [r2, c2] = rot([r, c]);
    if (s.map[r][c] !== (s.map[r2] && s.map[r2][c2])) { out.push(`terrain (${r},${c}) ${s.map[r][c]} != (${r2},${c2}) ${s.map[r2] && s.map[r2][c2]}`); r = n; break; }
  }
  const objs = (s.objectives || []).map((o) => key(objectiveCellList(o)));
  for (const o of s.objectives || []) {
    if (!objs.includes(key(objectiveCellList(o).map(rot)))) out.push(`objective ${o.id}`);
    if (o.startOwner != null) out.push(`objective ${o.id} startOwner`);
    // 점수: 회전한 짝 거점과 같은 값 (왼쪽·오른쪽 측면)
    const P = s.objectivePoints;
    const twin = (s.objectives || []).find((q) => key(objectiveCellList(q)) === key(objectiveCellList(o).map(rot)));
    if (P && twin && P[o.id] !== P[twin.id]) out.push(`objectivePoints ${o.id}/${twin.id}`);
  }
  const sides = Object.keys(s.sides || {});
  if (sides.length === 2) {
    const [a, b] = sides;
    // 배치 묶음: 라운드|병종|수|칸 (칸은 회전해서 비교). 같은 묶음이 같은 개수만큼 있어야 함
    const groups = (side, f) => (s.deployments || []).filter((d) => d.side === side)
      .map((d) => `${d.round || 0}|${d.type}|${d.count || (d.cells ? d.cells.length : 1)}|${(d.cells || (d.pos ? [d.pos] : [])).map((p) => f(p).join(',')).join(' ')}`).sort();
    const ga = groups(a, (p) => p), gb = groups(b, rot);
    if (JSON.stringify(ga) !== JSON.stringify(gb)) out.push('deployments');
    const ha = s.hq && s.hq[a], hb = s.hq && s.hq[b];
    if ((ha == null) !== (hb == null) || (ha && rot(ha).join(',') !== hb.join(','))) out.push('hq');
    const va = JSON.stringify((s.victory && s.victory[a]) || []), vb = JSON.stringify((s.victory && s.victory[b]) || []);
    if (va !== vb) out.push('victory');
    const za = JSON.stringify((s.placementZones && s.placementZones[a]) || null), zb = JSON.stringify((s.placementZones && s.placementZones[b]) || null);
    if ((za === 'null') !== (zb === 'null')) out.push('placementZones');
  }
  if (s.activations && s.activations.def !== s.activations.att) out.push('activations');
  if (s.fires) for (const k of Object.keys(s.fires)) if (sides.includes(k) || k === 'def' || k === 'att') out.push(`fires.${k}`);
  if (s.unitTypes || s.unitOverrides || s.sideStats) out.push('unit stats');   // 진영별 병종 보정은 두지 않음
  return out;
}

/** 시나리오의 정보성 안내 (오류 아님): 행동 한도가 그 진영 전체 병력(증원 포함)보다 큼 */
function scenarioNotes(s) {
  const notes = [];
  const a = s && s.activations;
  if (!a || typeof a !== 'object') return notes;
  for (const side of Object.keys(s.sides || {})) {
    const role = s.sides[side].role, n = a[role];
    const total = (s.deployments || []).filter((d) => d.side === side).reduce((k, d) => k + (d.count || (d.cells ? d.cells.length : 1)), 0);
    if (Number.isInteger(n) && n > total) notes.push(t('scenErr.prefix', { id: s.id, msg: { t: 'scenInfo.activationsOver', p: { side: { t: s.sides[side].nameKey }, n, total } } }));
  }
  return notes;
}

/** 모든 시나리오 검사 (로드 시 1회). 오류는 콘솔에 출력하고 목록을 돌려줌 */
function validateAllScenarios() {
  const all = [];
  for (const s of SCENARIOS) {
    for (const e of validateScenario(s)) { all.push(e); console.error(e); }
    for (const m of scenarioNotes(s)) console.info(m);
  }
  return all;
}

const findScenario = (id) => SCENARIOS.find((s) => s.id === id) || null;
/** 시작 화면 등에서 쓰는 시나리오 목록 */
function listScenarios() { return SCENARIOS.map((s) => ({ id: s.id, nameKey: s.nameKey, descKey: s.descKey, rounds: s.rounds, scaleMeters: s.scaleMeters, playerSide: s.playerSide, map: s.map })); }

/**
 * 시나리오 값을 GAME_CONFIG 에 채움 (규칙 값은 건드리지 않음). overrides: 진단용 덮어쓰기.
 * 지도에 묶인 캐시(거리 지도)는 비움.
 */
function loadScenario(id = DEFAULT_SCENARIO_ID, overrides = null) {
  const base = findScenario(id) || findScenario(DEFAULT_SCENARIO_ID);
  const s = applyScenarioOverrides(JSON.parse(JSON.stringify(base)), overrides);
  const C = GAME_CONFIG;
  C.SCENARIO_ID = s.id;
  C.SCENARIO_OVERRIDDEN = !!overrides;
  C.SCALE_METERS = s.scaleMeters;
  C.MAP = s.map.slice();
  N = C.MAP.length;
  C.MAX_ROUNDS = s.rounds;
  C.ROUND_ORDER = scenarioTurnOrder(s);
  C.PLAYER_SIDE = s.playerSide;
  C.SIDES = {};
  for (const side of C.ROUND_ORDER) C.SIDES[side] = { ...s.sides[side] };
  C.HQ = {};
  for (const side of C.ROUND_ORDER) C.HQ[side] = s.hq && s.hq[side] ? P2(s.hq[side]) : null;
  C.OBJECTIVES = (s.objectives || []).map((o) => {
    const cells = objectiveCellList(o);
    const out = { id: o.id, r: cells[0][0], c: cells[0][1], owner: o.startOwner ?? null, nameKey: o.nameKey, shortNameKey: o.shortNameKey };
    if (o.cells) out.cells = cells.map(P2);   // 여러 칸 거점 (cells 로 적은 거점만)
    return out;
  });
  C.OBJ_CELL_ID = null;
  if (C.OBJECTIVES.some((o) => o.cells)) {
    C.OBJ_CELL_ID = new Map();
    for (const o of C.OBJECTIVES) for (const p of o.cells || [{ r: o.r, c: o.c }]) C.OBJ_CELL_ID.set(p.r * C.MAP.length + p.c, o.id);
  }
  C.OBJECTIVE_CONTROL = s.objectiveControl === 'presence' ? 'presence' : 'sticky';   // sticky: 마지막으로 들어간 진영 (기존) · presence: 지금 안에 있는 진영
  C.AI_PROFILES = Array.isArray(s.aiProfiles) ? s.aiProfiles.slice() : null;   // 화면 난이도 목록 (없으면 전체). AI 판단에는 쓰지 않음
  C.AI_MODE = s.aiProfile === 'symmetric' ? 'symmetric' : null;   // symmetric: 역할과 무관한 중립 AI
  C.SECOND_MOVER_BONUS = Number.isInteger(s.secondMoverBonus) && s.secondMoverBonus > 0 ? s.secondMoverBonus : 0;
  C.SYMMETRIC = !!s.symmetric;
  // 점수제 (시나리오 objectivePoints 가 있을 때만): 점유한 거점의 점수가 쌓임. 다른 시나리오는 null → 상태·결과 변화 없음
  C.OBJECTIVE_POINTS = s.objectivePoints ? { ...s.objectivePoints } : null;
  C.SCORE_TIMING = s.scoreTiming === 'roundEnd' ? 'roundEnd' : 'ownTurnEnd';
  C.SCORE_TARGET = Number.isInteger(s.scoreTarget) ? s.scoreTarget : null;
  const norm = (s.deployments || []).map(normalizeDeployment);
  C.DEPLOYMENT = {};
  for (const side of C.ROUND_ORDER) C.DEPLOYMENT[side] = norm.filter((d) => d.side === side && d.round === 0).map((d) => ({ type: d.type, r: d.cells[0].r, c: d.cells[0].c }));
  C.REINFORCEMENTS = norm.filter((d) => d.round >= 1);
  C.DEPLOY_ZONES = {};
  for (const side of C.ROUND_ORDER) {
    const z = s.placementZones && s.placementZones[side];
    if (z) C.DEPLOY_ZONES[side] = { rows: z.rows.slice(), ...(z.cols ? { cols: z.cols.slice() } : {}) };
  }
  C.ZONE_LABEL_KEY = s.zoneLabelKey || null;
  C.RIVER_ROWS = s.river ? s.river.rows.slice() : [];
  C.CROSSINGS = s.river ? s.river.crossings.map(P2) : [];
  C.AI_SCENARIO = JSON.parse(JSON.stringify(s.aiConstants || {}));
  C.VICTORY = JSON.parse(JSON.stringify(s.victory));
  C.OBJECTIVE_CHECK_AFTER = s.objectiveCheckAfter ?? null;
  // 예전 이름 (화면·개발 도구 호환): 거점 승리 진영·필요 수, 라운드 제한 승자
  C.OBJECTIVE_WIN_SIDE = holdSide();
  C.OBJECTIVE_WIN_COUNT = holdCount();
  C.ROUND_LIMIT_WINNER = surviveSide() || C.ROUND_ORDER[0];
  C.TERRAIN_NAMES = { ...(s.terrainNames || {}) };
  C.OVERLAYS = JSON.parse(JSON.stringify(s.overlays || []));
  C.ARRIVAL_RADIUS = s.arrivalRadius ?? RULES.ARRIVAL_RADIUS;
  C.ACTIVATIONS = s.activations ? { def: s.activations.def ?? null, att: s.activations.att ?? null } : null;   // 역할별 행동 한도 (null = 제한 없음)
  C.FIRES = s.fires ? JSON.parse(JSON.stringify(s.fires)) : null;   // 간접 화력 설정 (null = v6 규칙)
  C.ANCHORS = {};
  for (const side of C.ROUND_ORDER) {
    const pts = norm.filter((d) => d.side === side).flatMap((d) => d.cells);
    if (pts.length) C.ANCHORS[side] = { r: Math.round(pts.reduce((a, p) => a + p.r, 0) / pts.length), c: Math.round(pts.reduce((a, p) => a + p.c, 0) / pts.length) };
  }
  _distCache.clear();
  _rushCache.clear();
  return C;
}

/** 시드 기반 난수 (mulberry32). 0 이상 1 미만 실수 반환 */
function createSeededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function validateConfig() {
  const C = GAME_CONFIG;
  C.MAP.forEach((row, r) => {
    if (row.length !== N) throw new Error(t('err.mapRowLength', { r, n: N }));
    for (const ch of row) if (!C.TERRAIN[ch]) throw new Error(t('err.unknownTerrain', { ch, r }));
  });
  const seen = new Set();
  for (const side of C.ROUND_ORDER) {
    for (const d of C.DEPLOYMENT[side]) {
      if (!C.UNIT_TYPES[d.type]) throw new Error(t('err.unknownType', { type: d.type }));
      if (!inBounds(d.r, d.c)) throw new Error(t('err.deployOutOfBounds', { r: d.r, c: d.c }));
      const k = idx(d.r, d.c);
      if (seen.has(k)) throw new Error(t('err.deployDuplicate', { r: d.r, c: d.c }));
      seen.add(k);
      const ter = terrainAt(d.r, d.c);
      if (ter.impassableFor && ter.impassableFor.includes(d.type)) throw new Error(t('err.deployTerrain', { type: d.type, r: d.r, c: d.c }));
    }
    if (C.DEPLOY_ZONES && C.DEPLOY_ZONES[side]) {
      const err = deploymentError(side, C.DEPLOYMENT[side]);
      if (err) throw new Error(t('err.defaultDeployZone', { side: { t: sideNameKey(side) }, msg: { t: err.k, p: err.p } }));
    }
  }
}

/* ---------- 시작 전 배치 ---------- */
/** 이 진영의 이 병종을 (r,c) 에 배치할 수 있는가 (다른 유닛과의 겹침은 따로 검사) */
function canDeployAt(side, type, r, c) {
  const C = GAME_CONFIG, z = C.DEPLOY_ZONES[side];
  if (!z || !inBounds(r, c) || r < z.rows[0] || r > z.rows[1]) return false;
  if (z.cols && (c < z.cols[0] || c > z.cols[1])) return false;
  if (C.ROUND_ORDER.some((s) => C.HQ[s] && C.HQ[s].r === r && C.HQ[s].c === c)) return false;
  const ter = terrainAt(r, c);
  return !(ter.impassableFor && ter.impassableFor.includes(type));
}

/** positions: DEPLOYMENT[side] 와 같은 순서·길이의 [{r,c}]. 문제가 있으면 { k, p } (문자열 키 + 파라미터), 없으면 null */
function deploymentError(side, positions) {
  const list = GAME_CONFIG.DEPLOYMENT[side];
  if (!Array.isArray(positions) || positions.length !== list.length) return { k: 'deployErr.count' };
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const p = positions[i];
    if (!p || !Number.isInteger(p.r) || !Number.isInteger(p.c)) return { k: 'deployErr.coord' };
    if (!canDeployAt(side, list[i].type, p.r, p.c)) return { k: 'deployErr.cell', p: { unit: { t: GAME_CONFIG.UNIT_TYPES[list[i].type].nameKey }, r: p.r, c: p.c } };
    const k = idx(p.r, p.c);
    if (seen.has(k)) return { k: 'deployErr.overlap', p: { r: p.r, c: p.c } };
    seen.add(k);
  }
  return null;
}

/* =========================== 3. 상태 =========================== */
/**
 * deploy: { [side]: [{r,c}] } 로 진영별 배치를 덮어씀 (없는 진영은 기본 배치).
 * 유닛 종류·순서·id 는 DEPLOYMENT 그대로라서 aiEnemyArtillery 의 id 규칙도 유지됨.
 */
function createInitialState(deploy = null) {
  validateConfig();
  const C = GAME_CONFIG;
  const units = [], pending = [];
  for (const side of C.ROUND_ORDER) {
    const custom = deploy && deploy[side];
    if (custom) { const err = deploymentError(side, custom); if (err) throw new Error(t('err.deploy', { side: { t: sideNameKey(side) }, msg: { t: err.k, p: err.p } })); }
    let n = 1;
    C.DEPLOYMENT[side].forEach((d, i) => {
      const p = custom ? custom[i] : d;
      units.push({ id: side[0].toUpperCase() + (n++), side, type: d.type, r: p.r, c: p.c, hp: C.MAX_HP, moved: false, acted: false });
    });
    // 예약 투입: 유닛 id 는 시작 배치 다음 번호부터 데이터 순서대로
    for (const g of C.REINFORCEMENTS) {
      if (g.side !== side) continue;
      for (let k = 0; k < g.count; k++) {
        pending.push({ id: side[0].toUpperCase() + (n++), side, type: g.type, round: g.round, cells: g.cells.map((p) => ({ ...p })), slot: k });
      }
    }
  }
  const memory = {}, intel = {};
  for (const side of C.ROUND_ORDER) { memory[side] = {}; intel[side] = { destroyed: {} }; }
  const state = {
    round: 1,
    turn: C.ROUND_ORDER[0],
    units,
    objectives: C.OBJECTIVES.map((o) => ({ id: o.id, r: o.r, c: o.c, owner: o.owner ?? null })),
    memory,
    intel,          // intel[side].destroyed[id]: 그 진영이 직접 보고 확인한 적 파괴
    aiPlan: {},     // 어려움 AI 의 진영별 작전 (도하 축 등)
    pending,        // 아직 등장하지 않은 예약 투입 유닛 (로직 전용: 화면은 자기 진영 것만 표시)
    objTimeline: [],   // 라운드가 끝날 때마다 진영별 소유 거점 수 (기록용)
    winner: null,
    winReason: null,
  };
  if (C.OBJECTIVE_POINTS) {   // 점수제 시나리오만: 진영별 총점과 받은 기록 (저장·불러오기는 상태 그대로)
    state.score = Object.fromEntries(C.ROUND_ORDER.map((s) => [s, 0]));
    state.scoreLog = [];      // { round, side, pts, by: { 거점 id: 점수 } }
  }
  if (C.OBJECTIVE_CONTROL === 'presence') updateObjectiveControl(state);
  if (C.AI_MODE === 'symmetric') intelInit(state);   // ai-intel.js: 대칭 시나리오만 state.aiIntel
  updateMemory(state);
  return state;
}

/** 현재 턴 진영의 유닛 행동 상태 초기화 */
function startTurn(state) {
  for (const u of state.units) if (u.side === state.turn) { u.moved = false; u.acted = false; delete u.moveLeft; }
  startActivations(state);
  startFires(state);
  const arrivals = processArrivals(state);   // 예약 투입 (이 진영, 이 라운드까지 예정된 것)
  if (GAME_CONFIG.OBJECTIVE_CONTROL === 'presence' && arrivals.length) arrivals.push(...updateObjectiveControl(state));
  updateMemory(state);
  return [{ type: 'turnStart', side: state.turn, round: state.round }, ...arrivals];
}

/* ---------- 행동 제한 (RULES.ENABLE_ACTIVATION_LIMIT, 시나리오 activations) ----------
 * 행동 1회 = 유닛이 그 턴에 처음 이동하거나 공격하는 순간. 한도는 턴 시작 때 정해지고 그 턴 동안 바뀌지 않는다.
 * state.actLimits: 화면(설정 메뉴)이 정한 역할별 한도 { def, att } (값 null = 그 진영 제한 없음, actLimits 자체가 null = 둘 다 없음).
 *   없으면(undefined) 시나리오 값. 시뮬레이션은 이 값을 쓰지 않는다.
 * state.act: 현재 턴 진영의 { side, limit, used, ids } (한도가 있을 때만 존재 → 한도가 없으면 상태가 v5 와 같음)
 */
function activationLimits(state) {
  if (!GAME_CONFIG.ENABLE_ACTIVATION_LIMIT) return null;
  const lim = state && state.actLimits !== undefined ? state.actLimits : GAME_CONFIG.ACTIVATIONS;
  return lim || null;
}
function startActivations(state) {
  const lim = activationLimits(state);
  let n = lim ? lim[roleOf(state.turn)] : null;
  // 후공 보너스 (시나리오 secondMoverBonus): 후공 진영의 첫 턴에만 한도 추가
  const bonus = GAME_CONFIG.SECOND_MOVER_BONUS;
  if (bonus && Number.isInteger(n) && state.round === 1 && state.turn === GAME_CONFIG.ROUND_ORDER[1]) n += bonus;
  const ok = Number.isInteger(n) && n >= 1;
  if (ok) state.act = { side: state.turn, limit: n, used: 0, ids: [] };
  else if (state.act !== undefined) delete state.act;
  if (state.actLimits !== undefined) {   // 화면 게임: 실제 적용된 한도와 기본값에서 바꿨는지 (기록용)
    const role = roleOf(state.turn);
    const dflt = GAME_CONFIG.ACTIVATIONS ? GAME_CONFIG.ACTIVATIONS[role] ?? null : null;
    const L = state.actApplied || (state.actApplied = { limit: {}, custom: false });
    L.limit[role] = ok ? n : null;
    if ((ok ? n : null) !== dflt) L.custom = true;
  }
}
/** 이 유닛이 이번 턴에 행동을 시작했는가 (한도가 없으면 false) */
function hasActivated(state, u) { const a = state.act; return !!a && !!u && a.side === u.side && a.ids.includes(u.id); }
/** 한도를 다 써서 이 유닛이 새로 행동할 수 없는가 */
function activationBlocked(state, u) { const a = state.act; return !!a && a.side === u.side && a.used >= a.limit && !a.ids.includes(u.id); }
function noteActivation(state, u) {
  const a = state.act;
  if (a && a.side === u.side && !a.ids.includes(u.id)) { a.ids.push(u.id); a.used++; }
}
/* ---------- 간접 화력 (시나리오 fires, 규칙 v7) ----------
 * GAME_CONFIG.FIRES 가 null 이면 v6 규칙 그대로 (병종 사거리, 쿨다운 없음, 사거리 안 모든 칸 사격, 상태에 새 값 없음).
 * state.firesOv: 화면(설정 메뉴)이 정한 값 { artillery: {range, cooldown}, mortar: {...} }. 없으면(undefined) 시나리오 값.
 *   그 진영의 턴이 시작될 때 state.firesNow[진영] 으로 옮겨 그 턴 동안 고정 (행동 제한 설정과 같은 방식). 시뮬레이션은 쓰지 않는다.
 * 쿨다운: 쏜 유닛에 lastFiredRound(그 라운드 번호)를 저장. cooldown = c 이면 라운드 차이가 c 이하인 동안 사격 불가.
 */
function startFires(state) {
  if (!GAME_CONFIG.FIRES || state.firesOv === undefined) return;
  const now = state.firesNow || (state.firesNow = {});
  now[state.turn] = state.firesOv ? deepMerge(GAME_CONFIG.FIRES, state.firesOv) : JSON.parse(JSON.stringify(GAME_CONFIG.FIRES));
  now[state.turn].blindFire = GAME_CONFIG.FIRES.blindFire;   // 안개 속 사격 여부는 시나리오 값만
}
/** side 진영에 지금 적용되는 간접 화력 설정 (없으면 null = v6 규칙) */
function firesOf(state, side) {
  if (!GAME_CONFIG.FIRES) return null;
  return (state && state.firesNow && state.firesNow[side]) || GAME_CONFIG.FIRES;
}
/** 병종의 사거리 { min, max } (side 진영의 간접 화력 설정 반영) */
function fireRange(state, side, type) {
  const t = GAME_CONFIG.UNIT_TYPES[type];
  const f = firesOf(state, side);
  const max = f && f[type] && f[type].range != null ? f[type].range : t.rangeMax;
  return { min: t.rangeMin, max };
}
const inFireRange = (state, u, from, p) => { const R = fireRange(state, u.side, u.type), d = manhattan(from, p); return d >= R.min && d <= R.max; };
/** 쿨다운 턴 수 (설정이 없거나 간접 화력이 아니면 0) */
function fireCooldown(state, u) {
  const f = firesOf(state, u.side);
  return f && unitType(u).indirect && f[u.type] && f[u.type].cooldown ? f[u.type].cooldown : 0;
}
/** 지금 쿨다운 때문에 사격할 수 없는가 */
function onCooldown(state, u) {
  const c = fireCooldown(state, u);
  return c > 0 && u.lastFiredRound != null && state.round - u.lastFiredRound <= c;
}
/**
 * 화면용: 이 유닛이 사격하지 못하는 자기 진영 턴이 앞으로 몇 번 남았는가 (지금이 자기 턴이면 이번 턴 포함). 0 = 사격 가능.
 * 상대 유닛의 값은 화면에 쓰지 않는다 (안개 규칙)
 */
function cooldownTurnsLeft(state, u) {
  const c = fireCooldown(state, u);
  if (!c || u.lastFiredRound == null) return 0;
  const order = GAME_CONFIG.ROUND_ORDER;
  // 자기 진영이 다음에 사격을 시도할 수 있는 턴의 라운드: 지금 자기 턴이고 아직 행동하지 않았으면 이번 라운드
  const next = state.turn === u.side ? state.round + (u.acted ? 1 : 0)
    : state.round + (order.indexOf(u.side) < order.indexOf(state.turn) ? 1 : 0);
  return Math.max(0, u.lastFiredRound + c + 1 - next);
}
/** 간접 화력의 명중률 추가 감점 (%p, 0 이상) */
function indirectPenaltyOf(state, u) {
  const f = firesOf(state, u.side);
  return f && unitType(u).indirect && f[u.type] && f[u.type].indirectPenalty ? f[u.type].indirectPenalty : 0;
}
/** 간접 화력이 안개 속 칸을 쏠 수 있는가 (fires 가 없으면 v6 규칙대로 가능) */
function blindFireAllowed(state, side) {
  const f = firesOf(state, side);
  return !f || f.blindFire !== false;
}

/** 화면용: side 진영의 이번 턴 행동 현황. 그 진영의 턴이 아니거나 한도가 없으면 null (상대 것은 돌려주지 않음) */
function activationStatus(state, side) {
  const a = state.act;
  if (!a || a.side !== side || state.turn !== side) return null;
  return { limit: a.limit, used: a.used, left: Math.max(0, a.limit - a.used) };
}

/**
 * 예약 투입 유닛이 놓일 칸. 후보 칸(데이터 순서에서 이 유닛 몫)이 비어 있고 그 병종이 들어갈 수 있으면 그 칸,
 * 아니면 가장 가까운 빈 칸 (맨해튼 거리 ≤ ARRIVAL_RADIUS; 같은 거리면 후보 목록 순서 → 행 → 열). 난수 없음.
 * 놓을 수 없는 칸: 다른 유닛, 진입 불가 지형, 본부 칸, 다른 진영(또는 무소유) 거점 칸
 */
function arrivalCell(state, p) {
  const C = GAME_CONFIG;
  const ok = (r, c) => {
    if (!inBounds(r, c) || getUnitAt(state, r, c)) return false;
    const ter = terrainAt(r, c);
    if (ter.impassableFor && ter.impassableFor.includes(p.type)) return false;
    if (C.ROUND_ORDER.some((s) => C.HQ[s] && C.HQ[s].r === r && C.HQ[s].c === c)) return false;
    const o = objectiveAt(state, r, c);
    return !o || o.owner === p.side;
  };
  const home = p.cells[Math.min(p.slot, p.cells.length - 1)];
  if (ok(home.r, home.c)) return { r: home.r, c: home.c };
  const order = (q) => { const k = p.cells.findIndex((x) => samePos(x, q)); return k < 0 ? p.cells.length : k; };
  let best = null, bestKey = null;
  const R = C.ARRIVAL_RADIUS;
  for (let dr = -R; dr <= R; dr++) {
    const rem = R - Math.abs(dr);
    for (let dc = -rem; dc <= rem; dc++) {
      const q = { r: home.r + dr, c: home.c + dc };
      if (!ok(q.r, q.c)) continue;
      const key = [Math.abs(dr) + Math.abs(dc), order(q), q.r, q.c];
      if (!bestKey || lexLess(key, bestKey)) { best = q; bestKey = key; }
    }
  }
  return best;
}

/** 현재 턴 진영의 예약 투입 처리. 놓을 칸이 없으면 다음 라운드로 미룸 (pending 에 남김). arrival 이벤트 목록 반환 */
function processArrivals(state) {
  if (!state.pending || !state.pending.length) return [];
  const events = [];
  const keep = [];
  for (const p of state.pending) {
    if (p.side !== state.turn || p.round > state.round) { keep.push(p); continue; }
    const cell = arrivalCell(state, p);
    if (!cell) { keep.push(p); continue; }
    state.units.push({ id: p.id, side: p.side, type: p.type, r: cell.r, c: cell.c, hp: GAME_CONFIG.MAX_HP, moved: false, acted: false });
    events.push({ type: 'arrival', unitId: p.id, side: p.side, unitType: p.type, pos: { ...cell }, round: state.round, delayed: state.round > p.round });
  }
  state.pending = keep;
  return events;
}

/**
 * 점유 방식 presence (시나리오 objectiveControl): 거점의 칸 중 하나라도 유닛이 있고 상대 유닛이 하나도 없는 진영이 점유.
 * 양쪽이 모두 있거나 아무도 없으면 점유자 없음. 상태를 고치고 바뀐 거점의 이벤트를 돌려줌
 *   captured(새 점유자) / objectiveLost(점유자 없음, contested = 양쪽이 모두 있음). mover: 이번에 이동한 유닛 (이벤트 표시용)
 */
function updateObjectiveControl(state, mover = null) {
  const events = [];
  for (const o of state.objectives) {
    const present = new Set();
    for (const p of objectiveCells(o)) { const u = getUnitAt(state, p.r, p.c); if (u) present.add(u.side); }
    const owner = present.size === 1 ? [...present][0] : null;
    if (owner === o.owner) continue;
    const prevOwner = o.owner;
    o.owner = owner;
    if (owner) {
      const by = mover && mover.side === owner && objectiveCells(o).some((p) => samePos(p, mover)) ? mover : null;
      const at = by || objectiveCells(o).map((p) => getUnitAt(state, p.r, p.c)).find((u) => u && u.side === owner);
      // pos 는 거점 기준 칸 (묶음 안 어느 칸에 유닛이 있는지는 이벤트 위치로 드러내지 않음)
      events.push({ type: 'captured', objectiveId: o.id, side: owner, prevOwner, pos: { r: o.r, c: o.c }, unitId: at.id, unitType: at.type });
    } else {
      events.push({ type: 'objectiveLost', objectiveId: o.id, prevOwner, contested: present.size > 1, pos: { r: o.r, c: o.c } });
    }
  }
  return events;
}

/** 진영의 도착 예정 (라운드별 수). 화면은 자기 진영 것만 보여 줘야 함 (안개 규칙) */
function pendingArrivals(state, side) {
  const byRound = new Map();
  for (const p of state.pending || []) if (p.side === side) byRound.set(Math.max(p.round, state.round), (byRound.get(Math.max(p.round, state.round)) || 0) + 1);
  return [...byRound.entries()].sort((a, b) => a[0] - b[0]).map(([round, count]) => ({ round, count }));
}

/** 라운드가 끝날 때 진영별 소유 거점 수 기록 */
function recordObjectiveTimeline(state) {
  if (!state.objTimeline) state.objTimeline = [];
  const owned = {};
  for (const s of GAME_CONFIG.ROUND_ORDER) owned[s] = state.objectives.filter((o) => o.owner === s).length;
  state.objTimeline.push({ round: state.round, owned });
}

/** 현재 진영의 턴을 끝내고 다음 턴(또는 다음 라운드)으로 넘김 */
function endTurn(state) {
  const events = [];
  if (state.winner) return events;
  const order = GAME_CONFIG.ROUND_ORDER;
  const pos = order.indexOf(state.turn);
  const roundEnd = pos === order.length - 1;
  const checkSide = GAME_CONFIG.OBJECTIVE_CHECK_AFTER || order[order.length - 1];
  if (roundEnd) recordObjectiveTimeline(state);
  if (GAME_CONFIG.OBJECTIVE_POINTS) {   // 점수제: 자기 턴 끝(ownTurnEnd) 또는 라운드 끝(roundEnd, 양쪽 동시)에 지금 점유한 거점의 점수
    events.push(...awardPoints(state, GAME_CONFIG.SCORE_TIMING === 'roundEnd' ? (roundEnd ? order : []) : [state.turn]));
    const tv = scoreTargetResult(state);
    if (tv) { setWinner(state, tv); events.push({ type: 'victory', winner: tv.winner, reason: tv.reason, round: state.round }); return events; }
  }
  const v = checkVictory(state, { objectives: state.turn === checkSide, roundLimit: roundEnd });
  if (v) { setWinner(state, v); events.push({ type: 'victory', winner: v.winner, reason: v.reason, round: state.round }); return events; }
  if (!roundEnd) {
    state.turn = order[pos + 1];
  } else {
    state.round += 1;
    state.turn = order[0];
    events.push({ type: 'roundStart', round: state.round });
  }
  events.push(...startTurn(state));
  return events;
}

function setWinner(state, v) { state.winner = v.winner; state.winReason = v.reason; }

/** 점수제: 진영이 지금 점유한 거점의 점수 { pts, by: { 거점 id: 점수 } } (점유는 objectiveControl 규칙 그대로) */
function heldPoints(state, side) {
  const P = GAME_CONFIG.OBJECTIVE_POINTS || {}, by = {};
  let pts = 0;
  for (const o of state.objectives) if (o.owner === side && P[o.id]) { by[o.id] = P[o.id]; pts += P[o.id]; }
  return { pts, by };
}
/** 점수 지급. 이벤트 scored 에는 거점별 내역이 있지만 화면은 상대 것은 합계만 보여 준다 */
function awardPoints(state, sides) {
  const events = [];
  for (const side of sides) {
    const { pts, by } = heldPoints(state, side);
    state.score[side] += pts;
    state.scoreLog.push({ round: state.round, side, pts, by });
    events.push({ type: 'scored', side, round: state.round, pts, by, total: state.score[side] });
  }
  return events;
}
/** 조기 종료 (scoreTarget): 한쪽이라도 목표에 닿으면 끝. 둘 다 닿으면 총점 → 체력 → 무승부 */
function scoreTargetResult(state) {
  const T = GAME_CONFIG.SCORE_TARGET;
  if (!T) return null;
  const [a, b] = GAME_CONFIG.ROUND_ORDER, sa = state.score[a] >= T, sb = state.score[b] >= T;
  if (!sa && !sb) return null;
  if (sa !== sb) return { winner: sa ? a : b, reason: 'scoreTarget' };
  const r = pointsLimitResult(state);
  return { winner: r.winner, reason: r.winner === 'draw' ? 'limitDraw' : 'scoreTarget' };
}

/* =========================== 4. 전투 수치 =========================== */
function effectiveStats(u) {
  const t = GAME_CONFIG.UNIT_TYPES[u.type];
  const pen = (GAME_CONFIG.MAX_HP - u.hp) * GAME_CONFIG.COMBAT.hpPenaltyPerLoss;
  return {
    atkSoft: Math.max(0, t.atkSoft - pen),
    atkArmor: Math.max(0, t.atkArmor - pen),
    def: Math.max(0, t.def - pen),
  };
}

function attackPowerVs(attacker, defenderType) {
  const s = effectiveStats(attacker);
  return GAME_CONFIG.UNIT_TYPES[defenderType].isArmor ? s.atkArmor : s.atkSoft;
}

/** 피해 = 공격력 - 방어력 (0 이하이면 minDamage) */
function calcDamage(attacker, defender) {
  const fixed = GAME_CONFIG.UNIT_TYPES[attacker.type].fixedDamage;
  if (fixed != null) return fixed;   // 박격포: 명중 시 고정 피해
  const diff = attackPowerVs(attacker, defender.type) - effectiveStats(defender).def;
  return diff > 0 ? diff : GAME_CONFIG.COMBAT.minDamage;
}

/* ---------- 이동 후 공격 / 주사위 ---------- */
/** 병종의 공격 비용 = ceil(최대 이동력 / ATTACK_COST_DIVISOR). 공격할 수 없는 병종은 Infinity */
function attackCost(typeKey) {
  const t = GAME_CONFIG.UNIT_TYPES[typeKey];
  if (!t.canAttack) return Infinity;
  return Math.ceil(t.move / GAME_CONFIG.ATTACK_COST_DIVISOR);
}
/** 남은 이동력 (이동하지 않았으면 최대 이동력) */
function moveLeftOf(u) {
  if (!u.moved) return unitType(u).move;
  return u.moveLeft == null ? 0 : u.moveLeft;
}
/** 지금 공격하면 '이동 후 공격'(명중률 보정)인가. 매복으로 제자리에서 멈춘 경우는 아님 */
function isMoveAttack(u) {
  return !!GAME_CONFIG.ENABLE_MOVE_ATTACK && !!u.moved && moveLeftOf(u) < unitType(u).move;
}
/**
 * 이동한 유닛이 공격할 수 없는 사유 (공격할 수 있으면 null). 이동하지 않은 유닛은 null.
 * 언어와 무관한 코드 { k: 문자열 키, p: 파라미터 } 로 돌려주고, 화면에서 t() 로 문장을 만든다
 */
function moveAttackBlockReason(u) {
  const t = unitType(u);
  if (!t.canAttack) return { k: 'ma.cannotAttackType' };
  if (!u.moved) return null;
  if (!GAME_CONFIG.ENABLE_MOVE_ATTACK) return { k: 'ma.movedNoAttack' };
  if (t.indirect && !t.moveFire) return { k: 'ma.artyMoved' };
  const left = moveLeftOf(u), cost = attackCost(u.type);
  if (left >= cost) return null;
  if (terrainAt(u.r, u.c).consumesAll && left === 0) return { k: 'ma.terrainEnd', p: { terrain: { t: terrainNameKey(terrainAt(u.r, u.c)) } } };
  return { k: 'ma.notEnough', p: { left, cost } };
}
/** 주사위 면 수 (10 또는 100) */
function diceSides() { return GAME_CONFIG.DICE_SIDES === 10 ? 10 : 100; }
/** 최종 명중률(%) → 명중으로 치는 주사위 최댓값 */
function hitNeed(chance) { return diceSides() === 10 ? chance / 10 : chance; }
/** 원시 명중률 → 최종 명중률. d10: 10% 단위 반올림(x5 올림) 뒤 10~90, d100: 5~95 */
function finalHitChance(raw) {
  const C = GAME_CONFIG.COMBAT;
  if (diceSides() === 10) return Math.max(C.minHitD10, Math.min(C.maxHitD10, Math.floor((raw + 5) / 10) * 10));
  return Math.max(C.minHit, Math.min(C.maxHit, raw));
}
/** 주사위 한 번: 1~면 수 정수 */
function rollDice(rng) { return 1 + Math.floor(rng() * diceSides()); }

/**
 * 명중률 계산 공통부. defender 가 null 이면 빈 칸 사격.
 * movedAttack: 이동 후 공격이면 MOVE_ATTACK_PENALTY (ENABLE_MOVE_ATTACK 일 때만)
 * parts[]: { key, p, value } — key 는 언어와 무관한 항목 코드 (화면에서 'part.<key>' 문자열로 표시)
 */
function calcHitBreakdown({ attacker, defender, terrain, signal, fogged, movedAttack = false, indirectPenalty = 0 }) {
  const C = GAME_CONFIG.COMBAT;
  const parts = [{ key: 'base', value: C.baseHit }];
  if (defender) {
    const atk = attackPowerVs(attacker, defender.type);
    const def = effectiveStats(defender).def;
    parts.push({ key: 'atkDiff', p: { atk, def }, value: (atk - def) * C.perPoint });
  }
  if (terrain.hitMod) parts.push({ key: 'terrain', p: { terrain: terrain.key }, value: terrain.hitMod });
  if (signal) parts.push({ key: 'signal', value: C.signalBonus });
  if (fogged) parts.push({ key: 'fog', value: C.fogPenalty });
  if (movedAttack && GAME_CONFIG.ENABLE_MOVE_ATTACK) parts.push({ key: 'moved', value: GAME_CONFIG.MOVE_ATTACK_PENALTY });
  if (indirectPenalty) parts.push({ key: 'indirect', value: -indirectPenalty });   // fires.<병종>.indirectPenalty (0 이면 항목 없음)
  const raw = parts.reduce((s, p) => s + p.value, 0);
  const chance = finalHitChance(raw);
  return { chance, raw, parts, sides: diceSides(), need: hitNeed(chance) };
}

/** 공격자가 아군 통신 유닛 반경 안에 있으면 true (보너스는 중복되지 않음) */
function hasSignalSupport(state, attacker, pos = attacker) {
  if (!unitType(attacker).canAttack) return false;
  const range = GAME_CONFIG.COMBAT.signalRange;
  return state.units.some((a) => a.side === attacker.side && a.id !== attacker.id && unitType(a).isSignal && manhattan(a, pos) <= range);
}

/**
 * 명중률과 내역. (실제 상태 기준이므로 UI 는 fogged 일 때 숫자를 숨겨야 함)
 * @returns {{chance, raw, parts, fogged, targetId, damage, indirect}}
 */
function computeHitChance(state, attackerId, targetPos) {
  const a = getUnit(state, attackerId);
  if (!a) throw new Error(t('err.noAttacker'));
  const vis = getVisibleTiles(state, a.side);
  const fogged = !vis.has(idx(targetPos.r, targetPos.c));
  const target = getUnitAt(state, targetPos.r, targetPos.c);
  const movedAttack = isMoveAttack(a);
  const res = calcHitBreakdown({
    attacker: a, defender: target, terrain: terrainAt(targetPos.r, targetPos.c),
    signal: hasSignalSupport(state, a), fogged, movedAttack, indirectPenalty: indirectPenaltyOf(state, a),
  });
  return { ...res, fogged, movedAttack, targetId: target ? target.id : null, damage: target ? calcDamage(a, target) : 0, indirect: !!unitType(a).indirect };
}

/* =========================== 5. 시야 / 기억 =========================== */
/** 진영의 시야 (칸 인덱스 Set) */
function getVisibleTiles(state, side) {
  const vis = new Set();
  for (const u of state.units) {
    if (u.side !== side) continue;
    const v = unitType(u).vision;
    for (let dr = -v; dr <= v; dr++) {
      const rem = v - Math.abs(dr);
      for (let dc = -rem; dc <= rem; dc++) {
        const r = u.r + dr, c = u.c + dc;
        if (inBounds(r, c)) vis.add(idx(r, c));
      }
    }
  }
  return vis;
}

/** 각 진영이 목격한 적 유닛의 마지막 위치를 기록 */
function updateMemory(state) {
  for (const side of GAME_CONFIG.ROUND_ORDER) {
    const vis = getVisibleTiles(state, side);
    const mem = state.memory[side];
    const seenIds = new Set();
    for (const u of state.units) {
      if (u.side === side || !vis.has(idx(u.r, u.c))) continue;
      mem[u.id] = { id: u.id, type: u.type, hp: u.hp, r: u.r, c: u.c, round: state.round, vacated: false };
      seenIds.add(u.id);
    }
    for (const id of Object.keys(mem)) {
      const m = mem[id];
      if (seenIds.has(id) || !vis.has(idx(m.r, m.c))) continue;
      // 기억한 칸이 지금 보이는데 그 유닛이 없음
      if (!getUnit(state, id)) {                 // 보이는 곳에서 사라짐(파괴)
        delete mem[id];
        if (state.intel) state.intel[side].destroyed[id] = true;
      }
      else m.vacated = true;                     // 어딘가로 이동함
    }
  }
  if (state.aiIntel) intelOnVision(state);   // 대칭 시나리오 AI 정보 (ai-intel.js)
}

/* =========================== 6. 이동 =========================== */
function canUnitMove(state, u) { return !!u && u.side === state.turn && !u.moved && !u.acted && !state.winner && !activationBlocked(state, u); }
function canUnitAttack(state, u) {
  if (!u || u.side !== state.turn || u.acted || state.winner) return false;
  if (activationBlocked(state, u)) return false;
  const t = unitType(u);
  if (!t.canAttack) return false;
  if (onCooldown(state, u)) return false;   // 간접 화력 쿨다운 (fires 가 없으면 항상 false)
  const noMoveFire = t.indirect && !t.moveFire;   // 포병: 이동한 턴에는 사격 불가. 박격포(moveFire)는 다른 병종처럼 이동 후 공격 가능
  if (GAME_CONFIG.ENABLE_MOVE_ATTACK) {
    // 이동한 유닛: 포병은 불가, 그 외는 남은 이동력 >= 공격 비용일 때만
    if (u.moved && (noMoveFire || moveLeftOf(u) < attackCost(u.type))) return false;
    return true;
  }
  // 이동한 턴에는 공격 불가 (포병은 규칙 설정과 관계없이 항상)
  if (u.moved && (noMoveFire || !GAME_CONFIG.ATTACK_AFTER_MOVE)) return false;
  return true;
}

/** 지형 규칙에 따른 한 칸 진입 후 남은 이동력 (진입 불가면 -1). getReachableTiles 와 같은 규칙 */
function moveLeftAfterStep(rem, ter) {
  if (ter.consumesAll) return 0;
  if (rem >= ter.moveCost) return rem - ter.moveCost;
  if (ter.partialEntry && rem >= 1) return 0;
  return -1;
}

/**
 * 이동 가능 칸. 자기 진영이 아는 정보만 사용(보이지 않는 적은 막지 않음 → 실제 이동 시 매복으로 정지).
 * @returns {Array<{r,c,remaining,path:Array<{r,c}>}>}
 */
function getReachableTiles(state, unitId) {
  const u = getUnit(state, unitId);
  if (!canUnitMove(state, u)) return [];
  const t = unitType(u);
  const vis = getVisibleTiles(state, u.side);
  const size = N * N;
  const best = new Array(size).fill(-1);
  const prev = new Array(size).fill(-1);
  const start = idx(u.r, u.c);
  best[start] = t.move;
  const open = [start];
  const passFriendly = GAME_CONFIG.PASS_THROUGH_FRIENDLY;
  // 통과 불가: 보이는 적 (보이지 않는 적은 실제 이동 때 조우). 아군은 설정에 따라 통과만 가능
  const blocked = (r, c) => {
    const o = getUnitAt(state, r, c);
    if (!o) return false;
    if (o.side === u.side) return !passFriendly;
    return vis.has(idx(r, c));
  };
  const canStop = (i) => { const p = posOf(i); const o = getUnitAt(state, p.r, p.c); return !o || o.side !== u.side; };
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (best[open[i]] > best[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    const rem = best[cur];
    if (rem < 1) continue;
    const { r, c } = posOf(cur);
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const ter = terrainAt(nr, nc);
      if (ter.impassableFor && ter.impassableFor.includes(u.type)) continue;
      if (blocked(nr, nc)) continue;
      const nrem = moveLeftAfterStep(rem, ter);
      if (nrem < 0) continue;
      const ni = idx(nr, nc);
      if (nrem > best[ni]) { best[ni] = nrem; prev[ni] = cur; open.push(ni); }
    }
  }
  const out = [];
  for (let i = 0; i < size; i++) {
    if (best[i] < 0 || i === start || !canStop(i)) continue;   // 아군이 있는 칸에는 정지 불가
    const path = [];
    for (let p = i; p !== start; p = prev[p]) path.unshift(posOf(p));
    out.push({ ...posOf(i), remaining: best[i], path });
  }
  return out;
}

/** 유닛 이동. 이벤트 목록 반환 */
function moveUnit(state, unitId, dest) {
  const u = getUnit(state, unitId);
  const reach = getReachableTiles(state, unitId).find((t) => samePos(t, dest));
  if (!reach) throw new Error(t('err.illegalMove', { id: unitId, r: dest.r, c: dest.c }));
  noteActivation(state, u);
  const events = [];
  const from = { r: u.r, c: u.c };
  let final = from;
  let ambush = null;
  let rem = unitType(u).move, finalRem = rem;
  for (const step of reach.path) {
    const o = getUnitAt(state, step.r, step.c);
    if (o && o.side !== u.side) { ambush = { blocker: o, at: step }; break; }   // 보이지 않던 적과 조우
    rem = moveLeftAfterStep(rem, terrainAt(step.r, step.c));
    if (!o) { final = step; finalRem = rem; }   // 아군 칸은 통과만 함 → 조우 시 마지막 빈 칸에서 정지
  }
  u.r = final.r; u.c = final.c; u.moved = true;
  u.moveLeft = Math.max(0, finalRem);   // 이동 후 공격 판정용 남은 이동력
  events.push({ type: 'move', unitId: u.id, side: u.side, unitType: u.type, from, to: { ...final } });
  if (ambush) {
    events.push({ type: 'ambush', unitId: u.id, side: u.side, unitType: u.type, at: { ...final }, blockedPos: { ...ambush.at }, blockerId: ambush.blocker.id, blockerSide: ambush.blocker.side, blockerType: ambush.blocker.type });
  }
  if (GAME_CONFIG.OBJECTIVE_CONTROL === 'presence') events.push(...updateObjectiveControl(state, u));
  else if (!samePos(final, from)) {
    const obj = objectiveAt(state, final.r, final.c);
    if (obj && obj.owner !== u.side) {
      const prevOwner = obj.owner;
      obj.owner = u.side;
      events.push({ type: 'captured', objectiveId: obj.id, side: u.side, prevOwner, pos: { ...final }, unitId: u.id, unitType: u.type });
    }
  }
  updateMemory(state);
  pushVictoryIfAny(state, events);
  return events;
}

/* =========================== 7. 공격 =========================== */
/** 공격 가능한 칸 목록. 포병은 사거리 안 모든 칸, 그 외는 상하좌우의 보이는 적 */
function getAttackableTiles(state, unitId) {
  const u = getUnit(state, unitId);
  if (!canUnitAttack(state, u)) return [];
  const t = unitType(u);
  const out = [];
  if (t.indirect) {
    // 사거리 안 모든 칸 (빈 칸·안개 속 포함). fires.blindFire 가 false 면 진영 시야 안의 칸만
    const vis = blindFireAllowed(state, u.side) ? null : getVisibleTiles(state, u.side);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (inFireRange(state, u, u, { r, c }) && (!vis || vis.has(idx(r, c)))) out.push({ r, c });
    }
  } else {
    const vis = getVisibleTiles(state, u.side);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const d = manhattan(u, { r, c });
      if (d < t.rangeMin || d > t.rangeMax) continue;
      const o = getUnitAt(state, r, c);
      if (o && o.side !== u.side && vis.has(idx(r, c))) out.push({ r, c });
    }
  }
  return out;
}

/** 공격 실행. 이벤트 목록 반환 */
function resolveAttack(state, attackerId, targetPos, rng = Math.random) {
  const a = getUnit(state, attackerId);
  if (!getAttackableTiles(state, attackerId).some((t) => samePos(t, targetPos))) {
    throw new Error(t('err.illegalAttack', { id: attackerId, r: targetPos.r, c: targetPos.c }));
  }
  noteActivation(state, a);
  const t = unitType(a);
  const hc = computeHitChance(state, attackerId, targetPos);
  const roll = rollDice(rng);          // rng = 주사위 전용 스트림 (AI 노이즈와 분리)
  const hit = roll <= hc.need;         // d100: need = 명중률, d10: need = 명중률 / 10
  const events = [{
    type: 'diceRoll', attackerId: a.id, side: a.side, unitType: a.type, from: { r: a.r, c: a.c },
    target: { ...targetPos }, chance: hc.chance, raw: hc.raw, sides: hc.sides, need: hc.need, roll, hit,
    fogged: hc.fogged, movedAttack: hc.movedAttack, indirect: !!t.indirect, parts: hc.parts,
    targetType: hc.targetId ? getUnit(state, hc.targetId).type : null,   // 통계용 (화면에는 표시하지 않음)
  }];
  events.push({ type: hit ? 'hit' : 'miss', attackerId: a.id, side: a.side, target: { ...targetPos } });

  if (hit) {
    const hits = [];
    const center = getUnitAt(state, targetPos.r, targetPos.c);
    if (center) hits.push({ unit: center, amount: calcDamage(a, center), splash: false });
    if (t.indirect && t.splash !== false) {   // 포병: 인접 4칸 (적·아군 모두). 박격포는 한 칸만
      for (const [dr, dc] of DIRS) {
        const o = getUnitAt(state, targetPos.r + dr, targetPos.c + dc);
        if (o) hits.push({ unit: o, amount: GAME_CONFIG.COMBAT.splashDamage, splash: true });
      }
    }
    for (const h of hits) {   // 피해는 동시에 적용
      h.unit.hp = Math.max(0, h.unit.hp - h.amount);
      events.push({ type: h.splash ? 'splashDamage' : 'damage', unitId: h.unit.id, side: h.unit.side, unitType: h.unit.type, pos: { r: h.unit.r, c: h.unit.c }, amount: h.amount, hp: h.unit.hp });
    }
    for (const h of hits) {
      if (h.unit.hp <= 0) events.push({ type: 'destroyed', unitId: h.unit.id, side: h.unit.side, unitType: h.unit.type, pos: { r: h.unit.r, c: h.unit.c } });
    }
    state.units = state.units.filter((u) => u.hp > 0);
    if (GAME_CONFIG.OBJECTIVE_CONTROL === 'presence') events.push(...updateObjectiveControl(state));
  }
  if (state.aiIntel && t.indirect) intelOnIndirectFire(state, a, targetPos, events);   // 맞은 진영의 간접 사격 단서
  a.moved = true;   // 공격 후 이동 불가
  a.acted = true;
  if (GAME_CONFIG.FIRES && t.indirect) a.lastFiredRound = state.round;   // 쿨다운 기준 (fires 가 없으면 기록하지 않음)
  updateMemory(state);
  pushVictoryIfAny(state, events);
  return events;
}

/** 유닛 행동 종료(대기) */
function finishUnit(state, unitId) {
  const u = getUnit(state, unitId);
  if (u) { u.moved = true; u.acted = true; }
}

/* =========================== 8. 승리 판정 =========================== */
/**
 * 시나리오 승리 조건(GAME_CONFIG.VICTORY)을 판정. 우선순위:
 *   enterHQ(적 본부에서 이동을 마침, 본부가 있을 때만) → annihilation(도착 대기 유닛이 남은 진영은 전멸 아님)
 *   → (opts.objectives) holdObjectives(count) → (opts.roundLimit) surviveRounds(rounds)
 * @returns {{winner, reason}|null}
 */
function checkVictory(state, opts = {}) {
  const C = GAME_CONFIG;
  if (state.winner) return { winner: state.winner, reason: state.winReason };
  for (const u of state.units) {
    const hq = C.HQ[enemyOf(u.side)];
    if (hq && samePos(u, hq) && victoryCond(u.side, 'enterHQ')) return { winner: u.side, reason: 'hq' };
  }
  const alive = {};
  for (const s of C.ROUND_ORDER) {
    alive[s] = state.units.filter((u) => u.side === s).length + (state.pending || []).filter((p) => p.side === s).length;
  }
  const [a, b] = C.ROUND_ORDER;
  const scored = !!roundLimitType();   // 양쪽 같은 라운드 제한 판정 (무승부 있음)
  if (alive[a] === 0 && alive[b] === 0) return { winner: scored ? 'draw' : C.ROUND_LIMIT_WINNER, reason: 'annihilation' };
  if (alive[a] === 0 && victoryCond(b, 'annihilation')) return { winner: b, reason: 'annihilation' };
  if (alive[b] === 0 && victoryCond(a, 'annihilation')) return { winner: a, reason: 'annihilation' };
  const checkObj = opts.objectives ?? opts.roundEnd;
  const checkLimit = opts.roundLimit ?? opts.roundEnd;
  if (checkObj) {
    for (const s of C.ROUND_ORDER) {
      const v = victoryCond(s, 'holdObjectives');
      if (v && state.objectives.filter((o) => o.owner === s).length >= v.count) return { winner: s, reason: 'objectives' };
    }
  }
  if (checkLimit && scored && state.round >= C.MAX_ROUNDS) return roundLimitType() === 'roundLimitPoints' ? pointsLimitResult(state) : roundLimitResult(state);
  if (checkLimit) {
    for (const s of C.ROUND_ORDER) {
      const v = victoryCond(s, 'surviveRounds');
      if (v && state.round >= v.rounds) return { winner: s, reason: 'survived' };
    }
    if (state.round >= C.MAX_ROUNDS) return { winner: C.ROUND_LIMIT_WINNER, reason: 'survived' };   // 버티기 조건이 없는 시나리오의 안전장치
  }
  return null;
}

/**
 * 라운드 제한 판정 (roundLimitScore): 점유 거점 수가 많은 쪽 → 남은 총 체력(도착 대기 유닛은 최대 체력으로 셈)이 많은 쪽 → 무승부.
 * winner 'draw' = 무승부. reason: limitObjectives / limitHp / limitDraw
 */
function roundLimitResult(state) {
  const objs = (s) => state.objectives.filter((o) => o.owner === s).length;
  return limitCompare(state, objs, 'limitObjectives');
}
/** 라운드 제한 판정 (roundLimitPoints): 총점이 많은 쪽 → 남은 총 체력 → 무승부. reason: limitPoints / limitHp / limitDraw */
function pointsLimitResult(state) {
  return limitCompare(state, (s) => state.score[s], 'limitPoints');
}
/** 판정 공통: key 가 큰 쪽 → 남은 총 체력(도착 대기 유닛은 최대 체력으로 셈) → 무승부 */
function limitCompare(state, key, reason) {
  const [a, b] = GAME_CONFIG.ROUND_ORDER;
  const hp = (s) => state.units.filter((u) => u.side === s).reduce((k, u) => k + u.hp, 0) + (state.pending || []).filter((p) => p.side === s).length * GAME_CONFIG.MAX_HP;
  if (key(a) !== key(b)) return { winner: key(a) > key(b) ? a : b, reason };
  if (hp(a) !== hp(b)) return { winner: hp(a) > hp(b) ? a : b, reason: 'limitHp' };
  return { winner: 'draw', reason: 'limitDraw' };
}
/** 지금 끝난다면의 라운드 제한 판정 (진단: 막판 역전 비율) */
function limitResultNow(state) {
  const k = roundLimitType();
  return k === 'roundLimitPoints' ? pointsLimitResult(state) : k === 'roundLimitScore' ? roundLimitResult(state) : null;
}

function pushVictoryIfAny(state, events) {
  if (state.winner) return;
  const v = checkVictory(state);
  if (v) { setWinner(state, v); events.push({ type: 'victory', winner: v.winner, reason: v.reason, round: state.round }); }
}

/* =========================== 9. AI =========================== */
// _distCache: 2절 위쪽에 선언 (loadScenario 가 비움)
/** goal 칸까지의 근사 이동 비용 지도 (유닛 무시, 지형만) */
function distanceField(unitTypeKey, goal) {
  const key = `${unitTypeKey}|${goal.r},${goal.c}`;
  if (_distCache.has(key)) return _distCache.get(key);
  const PC = GAME_CONFIG.AI.PATH_COST;
  const enterCost = (r, c) => {
    const ter = terrainAt(r, c);
    if (ter.impassableFor && ter.impassableFor.includes(unitTypeKey)) return Infinity;
    return PC[ter.key] ?? ter.moveCost;
  };
  const dist = new Array(N * N).fill(Infinity);
  const done = new Array(N * N).fill(false);
  const g = idx(goal.r, goal.c);
  dist[g] = 0;
  // 다익스트라 (비용은 작은 정수 → 버킷 큐. 결과는 예전의 전체 탐색 방식과 같음)
  const buckets = [[g]];
  for (let d = 0; d < buckets.length; d++) {
    const list = buckets[d];
    if (!list) continue;
    for (const cur of list) {
      if (done[cur] || dist[cur] !== d) continue;
      done[cur] = true;
      const { r, c } = posOf(cur);
      const cost = enterCost(r, c);   // 이웃 → cur 로 들어오는 비용
      if (!isFinite(cost)) continue;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const ni = idx(nr, nc);
        if (dist[cur] + cost < dist[ni]) { dist[ni] = dist[cur] + cost; (buckets[dist[ni]] || (buckets[dist[ni]] = [])).push(ni); }
      }
    }
  }
  _distCache.set(key, dist);
  return dist;
}

function goalDistance(unitTypeKey, goals, pos) {
  let best = Infinity;
  for (const g of goals) best = Math.min(best, distanceField(unitTypeKey, g)[idx(pos.r, pos.c)]);
  return best;
}

/* ---------- 전술 프로필 ---------- */
function deepMerge(a, b) {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) };
  for (const k of Object.keys(b)) out[k] = deepMerge(out[k], b[k]);
  return out;
}

/** 프로필 id(또는 예전 기록의 이름) → { id, name, description, noise, risk, features, constants }. 이름·설명은 현재 언어 */
function resolveProfile(key) {
  const AI = GAME_CONFIG.AI, P = AI.TACTIC_PROFILES;
  let id = P[key] ? key : Object.keys(P).find((k) => Object.keys(STRINGS).some((l) => STRINGS[l][`profile.${k}.name`] === key));
  if (!id) id = AI.DEFAULT_PROFILE;
  const p = P[id];
  const base = p.extends ? resolveProfile(p.extends) : { noise: 1, risk: 1, features: [], constants: {} };
  const w = p.weights || { noise: base.noise, risk: base.risk };
  const available = (f) => TACTIC_FEATURE_NEEDS[f] !== 'river' || GAME_CONFIG.RIVER_ROWS.length > 0;
  return {
    id, name: t(`profile.${id}.name`), description: profileDesc(id),
    noise: w.noise, risk: w.risk,
    features: (p.features || base.features).filter(available),
    constants: deepMerge(deepMerge(base.constants, p.constants || {}), GAME_CONFIG.AI_SCENARIO || {}),
  };
}

/** 프로필 설명: 시나리오 전용 문구(profile.<id>.desc.<시나리오>)가 있으면 그것 (예: 강이 없는 지도) */
function profileDesc(id) {
  const k = `profile.${id}.desc.${GAME_CONFIG.SCENARIO_ID}`;
  return typeof STRINGS !== 'undefined' && STRINGS.ko[k] != null ? t(k) : t(`profile.${id}.desc`);
}

/** 시작 화면 등에서 쓰는 프로필 목록 (시나리오 aiProfiles 가 있으면 그 목록만, 그 순서로) */
function listTacticProfiles() {
  const P = GAME_CONFIG.AI.TACTIC_PROFILES;
  return (GAME_CONFIG.AI_PROFILES || Object.keys(P)).filter((id) => P[id]).map((id) => ({ id, name: t(`profile.${id}.name`), description: profileDesc(id) }));
}

/** AI 가 아는 정보만 모은 맥락 (안개 준수). 공격 측이면 프로필 기능(feat)과 작전 상태를 포함 */
function buildAiContext(state, side, diff = null) {
  const AI = GAME_CONFIG.AI;
  const vis = getVisibleTiles(state, side);
  const visibleEnemies = state.units.filter((u) => u.side !== side && vis.has(idx(u.r, u.c)));
  const known = visibleEnemies.map((e) => ({ id: e.id, type: e.type, hp: e.hp, r: e.r, c: e.c, age: 0 }));
  const seen = new Set(known.map((k) => k.id));
  for (const m of Object.values(state.memory[side])) {
    const age = state.round - m.round;
    if (seen.has(m.id) || m.vacated || age > AI.THREAT_MEMORY_MAX_AGE) continue;
    known.push({ ...m, age });
  }
  // 적이 다음 턴에 본부에 닿을 수 있는가 (아는 적 기준)
  const hq = GAME_CONFIG.HQ[side];
  const hqThreat = !!hq && known.some((e) => manhattan(e, hq) <= GAME_CONFIG.UNIT_TYPES[e.type].move + 2);
  // 중립 모드 (시나리오 aiProfile 'symmetric'): 역할과 무관하게 양쪽이 같은 목표·점수 기준, 전술 기능도 양쪽 같게
  const neutral = GAME_CONFIG.AI_MODE === 'symmetric';
  const isAttacker = !neutral && side === attackerSide();
  const featList = (diff && diff.features && (isAttacker || neutral)) ? diff.features : [];
  const has = (f) => featList.includes(f);
  const T = (diff && diff.constants) || {};
  const stored = (state.aiPlan && state.aiPlan[side]) || null;
  const plan = has('crossingPlan') && stored && stored.kind !== 'spread' ? stored : null;
  const spread = has('spreadCrossing') && stored && stored.kind === 'spread' ? stored : null;
  const anyTactics = featList.length > 0;
  let others = null;   // 이 유닛을 뺀 아군 시야 (박격포 이동 후 사격 판단용, 필요할 때만 계산)
  const visOthers = (u) => {
    if (others && others.id === u.id) return others.vis;
    const vis2 = getVisibleTiles({ units: state.units.filter((x) => x.id !== u.id) }, side);
    others = { id: u.id, vis: vis2 };
    return vis2;
  };
  const ctx = {
    side, vis, visibleEnemies, known, hqThreat, isAttacker, neutral, plan, spread, has, T, tactics: anyTactics, visOthers,
    allies: state.units.filter((u) => u.side === side),
    enemyArty: has('artyHunt') || plan ? aiEnemyArtillery(state, side, vis, T) : [],
  };
  if (neutral && diff && diff.sym && diff.sym.v2) ctx.v2 = symV2Context(state, side, diff.sym.level, ctx);   // 새 대칭 AI (ai-intel.js)
  return ctx;
}

/* ---------- 어려움 전용 전술 (공격 측) ---------- */
/** 진영 기준 강의 양쪽 행: stage = 아군 쪽 강변, exit = 건너편 첫 행 */
function riverBanks(side) {
  const rows = GAME_CONFIG.RIVER_ROWS;
  const top = Math.min(...rows), bot = Math.max(...rows);
  return sideAnchor(side).r < top ? { stage: top - 1, exit: bot + 1 } : { stage: bot + 1, exit: top - 1 };
}
const inRiverRows = (pos) => GAME_CONFIG.RIVER_ROWS.includes(pos.r);

/**
 * 적 포병의 추정 위치 (안개 준수).
 * 기억에 있으면 그 위치, 한 번도 못 봤으면 배치 위치(규칙상 공개 정보)로 추정.
 * 직접 파괴를 확인했거나, 기억이 낡았거나, 배치 칸이 보이는데 없으면 제외.
 */
function aiEnemyArtillery(state, side, vis, T) {
  const enemy = enemyOf(side);
  const prefix = enemy[0].toUpperCase();
  const mem = state.memory[side];
  const dead = (state.intel && state.intel[side] && state.intel[side].destroyed) || {};
  const out = [];
  GAME_CONFIG.DEPLOYMENT[enemy].forEach((d, i) => {
    if (d.type !== 'artillery') return;
    const id = prefix + (i + 1);   // createInitialState 의 id 규칙
    if (dead[id]) return;
    const m = mem[id];
    if (m) {
      if (m.vacated || state.round - m.round > T.ARTY_MEMORY_AGE) return;
      out.push({ id, r: m.r, c: m.c, hp: m.hp, assumed: false });
    } else if (!vis.has(idx(d.r, d.c))) {
      out.push({ id, r: d.r, c: d.c, hp: GAME_CONFIG.MAX_HP, assumed: true });
    }
  });
  // 시작 배치에 없던 포병 (예약 투입으로 나타난 유닛): 목격한 기억이 있을 때만. 도착 일정은 모름 (안개)
  const startIds = new Set(GAME_CONFIG.DEPLOYMENT[enemy].map((d, i) => prefix + (i + 1)));
  for (const m of Object.values(mem)) {
    if (m.type !== 'artillery' || startIds.has(m.id) || dead[m.id]) continue;
    if (m.vacated || state.round - m.round > T.ARTY_MEMORY_AGE) continue;
    out.push({ id: m.id, r: m.r, c: m.c, hp: m.hp, assumed: false });
  }
  return out;
}

/** 도하 축 선택과 집결 상태 갱신. state.aiPlan[side] 에 저장 */
function aiUpdatePlan(state, side, T) {
  const C = GAME_CONFIG, TW = T.WEIGHTS, V = C.AI.UNIT_VALUE;
  const vis = getVisibleTiles(state, side);
  const ctx = buildAiContext(state, side);
  const arty = aiEnemyArtillery(state, side, vis, T);
  const banks = riverBanks(side);
  const massUnits = ctx.allies.filter((u) => T.MASS_TYPES.includes(u.type));
  const committed = massUnits.filter((u) => !onOwnBank(side, u));
  const axisScore = (col) => {
    const exit = { r: banks.exit, c: col }, stage = { r: banks.stage, c: col };
    let s = 0;
    for (const e of ctx.known) if (manhattan(e, exit) <= T.AXIS_ENEMY_RADIUS) s += V[e.type];
    for (const a of arty) if (a.assumed && manhattan(a, exit) <= T.AXIS_ENEMY_RADIUS) s += V.artillery;
    for (const o of state.objectives) if (o.owner !== side && manhattan(o, exit) <= T.AXIS_OBJECTIVE_RADIUS) s -= TW.axisObjective;
    for (const u of massUnits) if (onOwnBank(side, u)) s += TW.axisDistance * manhattan(u, stage);
    return s;
  };
  const prev = state.aiPlan[side];
  let axis = prev ? prev.axis : null;
  if (!prev || !committed.length) {
    const ranked = T.AXES.map((c) => ({ c, s: axisScore(c) })).sort((a, b) => a.s - b.s);
    if (axis == null) axis = ranked[0].c;
    else if (ranked[0].c !== axis && axisScore(axis) - ranked[0].s >= T.AXIS_SWITCH_MARGIN) axis = ranked[0].c;
  }
  const stage = { r: banks.stage, c: axis };
  const staged = massUnits.filter((u) => onOwnBank(side, u) && manhattan(u, stage) <= T.STAGE_RADIUS).length;
  const need = Math.min(T.MASS_MIN, massUnits.length);
  const plan = { kind: 'axis', axis, staged, committed: committed.length, massed: staged + committed.length >= need, round: state.round };
  state.aiPlan[side] = plan;
  return plan;
}

/** 강 칸 pos 의 도하 위험 감점 (적 포병 사거리, 엄호 가능 여부, 집결, 시간 압박 반영) */
function aiCrossingDanger(state, ctx, pos) {
  const C = GAME_CONFIG, T = ctx.T;
  const at = C.UNIT_TYPES.artillery;
  let pen = 0;
  for (const a of ctx.enemyArty) {
    if (a.hp <= T.ARTY_NEUTRAL_HP) continue;                 // 무력화됨
    const d = manhattan(a, pos);
    if (d < at.rangeMin || d > at.rangeMax) continue;
    // 엄호: 아군 포병이 그 포병을 직접 또는 파편(+1)으로 칠 수 있음
    const covered = ctx.allies.some((o) => {
      const ot = unitType(o);
      if (!ot.indirect) return false;
      const d2 = manhattan(o, a);
      return d2 >= ot.rangeMin && d2 <= ot.rangeMax + 1;
    });
    pen += covered ? T.COVERED_FACTOR : 1;
  }
  if (!pen) return 0;
  const span = Math.max(1, T.DANGER_DECAY_END - T.DANGER_DECAY_START);
  const k = Math.min(1, Math.max(0, (state.round - T.DANGER_DECAY_START) / span));
  let factor = 1 - k * (1 - T.DANGER_MIN_FACTOR);
  if (ctx.plan.massed) factor *= T.MASSED_FACTOR;
  return T.WEIGHTS.crossingDanger * pen * factor;
}

/** 프로필 기능별 위치 점수 (공격 측) */
function aiTacticsPosition(state, ctx, u, pos) {
  const T = ctx.T, TW = T.WEIGHTS;
  const t = unitType(u);
  const plan = ctx.plan;
  let s = 0;
  // [crossingPlan] 집결 전 도하 금지, 축 고정, 도하 안전 (아군 강변에서 강/건너편으로 나가는 이동)
  const fromOwn = onOwnBank(u.side, u);
  if (plan && fromOwn && !onOwnBank(u.side, pos)) {
    if (!T.GATE_EXEMPT.includes(u.type)) {
      if (!plan.massed) s -= TW.riverGate;
      if (Math.abs(pos.c - plan.axis) > T.AXIS_WIDTH) s -= TW.offAxis;
    }
    s -= aiCrossingDanger(state, ctx, pos);
  }
  // 이미 도하를 시작한 유닛은 되돌아가지 않음
  if (plan && !fromOwn && onOwnBank(u.side, pos) && !T.GATE_EXEMPT.includes(u.type)) s -= TW.retreat;
  // [artyHunt] 보이는 적 포병에게 접근
  if (ctx.has('artyHunt') && T.HUNT_TYPES.includes(u.type)) {
    const arts = ctx.visibleEnemies.filter((e) => e.type === 'artillery' && manhattan(e, u) <= T.HUNT_ARTY_RADIUS);
    if (arts.length) {
      const m0 = Math.min(...arts.map((a) => manhattan(a, u)));
      const m1 = Math.min(...arts.map((a) => manhattan(a, pos)));
      s += TW.huntArtillery * (m0 - m1);
    }
  }
  // [artyHunt] 포병: 적 포병을 칠 수 있는 자리 (엄호 준비)
  if (ctx.has('artyHunt') && t.indirect && ctx.enemyArty.some((a) => { const d = manhattan(a, pos); return d >= t.rangeMin && d <= t.rangeMax + 1; })) {
    s += TW.counterBattery;
  }
  // [reconSpotting] 정찰: 아직 사격하지 않은 아군 포병의 사거리 안을 새로 밝힘
  if (ctx.has('reconSpotting') && u.type === 'recon') {
    const guns = ctx.allies.filter((a) => unitType(a).indirect && !a.acted);
    if (guns.length) {
      const v = t.vision;
      let fresh = 0;
      for (let dr = -v; dr <= v; dr++) {
        const rem = v - Math.abs(dr);
        for (let dc = -rem; dc <= rem; dc++) {
          const p = { r: pos.r + dr, c: pos.c + dc };
          if (!inBounds(p.r, p.c) || ctx.vis.has(idx(p.r, p.c))) continue;
          if (guns.some((g) => { const gt = unitType(g); const d = manhattan(g, p); return d >= gt.rangeMin && d <= gt.rangeMax; })) fresh++;
        }
      }
      s += TW.spotForArty * fresh;
    }
  }
  return s;
}

/* ---------- [spreadCrossing] 산개전술 ---------- */
const nbrs4 = (p) => DIRS.map(([dr, dc]) => ({ r: p.r + dr, c: p.c + dc })).filter((q) => inBounds(q.r, q.c));

/**
 * 국군 포병이 포탄을 떨어뜨릴 수 있는 중심 칸 지도 (안개 준수).
 * - 정밀: 직접 본 포병 / 마지막 목격 위치 (SPREAD.ARTY_MEMORY_AGE 라운드 이내)
 * - 사전 가정: 위치를 모르는 포병이 남아 있으면 PRIOR_ROWS 구간의 보이지 않는 칸 전부를 포병 위치 후보로
 * 포병은 이동한 턴에 쏠 수 없으므로 현재(추정) 위치에서의 사거리만 본다.
 * @returns {{cover: Map<number, Array<{hp, signal}>>, unknown: number, precise: number}}
 */
function aiShellCover(state, ctx) {
  const C = GAME_CONFIG, S = ctx.T.SPREAD, at = C.UNIT_TYPES.artillery;
  const side = ctx.side, enemy = enemyOf(side);
  const prefix = enemy[0].toUpperCase();
  const mem = state.memory[side];
  const dead = (state.intel && state.intel[side] && state.intel[side].destroyed) || {};
  const signals = ctx.known.filter((e) => C.UNIT_TYPES[e.type].isSignal);
  const sigNear = (p) => signals.some((g) => manhattan(g, p) <= C.COMBAT.signalRange);
  const sources = [];
  let unknown = 0, precise = 0;
  C.DEPLOYMENT[enemy].forEach((d, i) => {
    if (d.type !== 'artillery') return;
    const id = prefix + (i + 1);
    if (dead[id]) return;
    const m = mem[id];
    if (m && !m.vacated && state.round - m.round <= S.ARTY_MEMORY_AGE) { sources.push({ r: m.r, c: m.c, hp: m.hp, signal: sigNear(m) }); precise++; }
    else unknown++;
  });
  if (unknown > 0) {
    for (let r = S.PRIOR_ROWS[0]; r <= S.PRIOR_ROWS[1]; r++) {
      for (let c = 0; c < N; c++) {
        if (ctx.vis.has(idx(r, c))) continue;   // 보이는 칸에 포병이 없음은 확인됨 (있었다면 정밀 목록에 들어감)
        sources.push({ r, c, hp: C.MAX_HP, signal: sigNear({ r, c }) });
      }
    }
  }
  const cover = new Map();
  for (const src of sources) {
    for (let dr = -at.rangeMax; dr <= at.rangeMax; dr++) {
      const rem = at.rangeMax - Math.abs(dr);
      for (let dc = -rem; dc <= rem; dc++) {
        const r = src.r + dr, c = src.c + dc;
        if (!inBounds(r, c) || Math.abs(dr) + Math.abs(dc) < at.rangeMin) continue;
        const i = idx(r, c);
        let list = cover.get(i);
        if (!list) cover.set(i, (list = []));
        if (!list.some((x) => x.hp === src.hp && x.signal === src.signal)) list.push({ hp: src.hp, signal: src.signal });
      }
    }
  }
  return { cover, unknown, precise };
}

/** 국군이 그 칸을 볼 수 있다고 추정하는가 (알려진 적의 시야 + 강 건너 일정 깊이) */
function aiEnemySeesEstimate(ctx, p) {
  const S = ctx.T.SPREAD;
  const b = riverBanks(ctx.side);
  const southward = b.exit > b.stage;
  if (southward ? p.r >= b.exit - S.ASSUMED_SPOT_DEPTH : p.r <= b.exit + S.ASSUMED_SPOT_DEPTH) return true;
  return ctx.known.some((e) => manhattan(e, p) <= GAME_CONFIG.UNIT_TYPES[e.type].vision);
}

/** 중심 칸 i 에 포탄이 떨어질 때 예상 피해: 중심 아군 기대 피해 + 인접 아군 각 splash × 명중률 (출처 중 최댓값) */
function aiShellValueAt(ctx, cov, i, occ) {
  const list = cov.cover.get(i);
  if (!list) return 0;
  const p = posOf(i);
  const center = occ.get(i) || null;
  let adj = 0;
  for (const q of nbrs4(p)) if (occ.has(idx(q.r, q.c))) adj++;
  if (!center && !adj) return 0;
  const fogged = !aiEnemySeesEstimate(ctx, p);
  const enemy = enemyOf(ctx.side);
  let best = 0;
  for (const src of list) {
    const gun = { type: 'artillery', hp: src.hp, side: enemy };
    const hc = calcHitBreakdown({ attacker: gun, defender: center, terrain: terrainAt(p.r, p.c), signal: src.signal, fogged });
    const ph = hc.chance / 100;
    let v = ph * adj * GAME_CONFIG.COMBAT.splashDamage;
    if (center) v += ph * Math.min(calcDamage(gun, center), center.hp);
    if (v > best) best = v;
  }
  return best;
}

/** 유닛 u 를 pos 로 옮겼을 때 대형 전체의 포탄 위협(최댓값)을 돌려주는 평가기 */
function aiMakeShellEval(state, ctx, u) {
  const cov = aiShellCover(state, ctx);
  const others = ctx.allies.filter((a) => a.id !== u.id);
  const occ = new Map(others.map((a) => [idx(a.r, a.c), a]));
  const base = [];
  const seen = new Set();
  for (const a of others) {
    for (const p of [a, ...nbrs4(a)]) {
      const i = idx(p.r, p.c);
      if (seen.has(i) || !cov.cover.has(i)) continue;
      seen.add(i);
      base.push({ r: p.r, c: p.c, v: aiShellValueAt(ctx, cov, i, occ) });
    }
  }
  base.sort((a, b) => b.v - a.v);
  const fn = (pos) => {
    let m = 0;
    for (const b of base) { if (manhattan(b, pos) <= 1) continue; m = b.v; break; }   // pos 와 무관한 중심 칸의 최댓값
    const occ2 = new Map(occ);
    occ2.set(idx(pos.r, pos.c), { ...u, r: pos.r, c: pos.c });
    for (const p of [pos, ...nbrs4(pos)]) m = Math.max(m, aiShellValueAt(ctx, cov, idx(p.r, p.c), occ2));
    return m;
  };
  fn.cover = cov;
  return fn;
}

/** 산개전술 위치 점수 (강을 건넌 유닛과 그 밖의 병종): 포탄 위협, 고립, 되돌아가기 */
function aiSpreadPosition(state, ctx, u, pos) {
  const S = ctx.T.SPREAD, J = ctx.spread.weights;
  let s = 0;
  if (ctx.shellEval) s -= J.shellThreat * ctx.shellEval(pos);
  const others = ctx.allies.filter((a) => a.id !== u.id);
  if (others.length && !others.some((a) => manhattan(a, pos) <= S.COHESION_RADIUS)) s -= J.isolation;
  // 이미 건너기 시작한 유닛은 아군 강변으로 되돌아가지 않음 (어려움과 같은 retreat 가중치)
  if (!onOwnBank(u.side, u) && onOwnBank(u.side, pos) && !ctx.T.GATE_EXEMPT.includes(u.type)) s -= ctx.T.WEIGHTS.retreat;
  // 건너편에 닿은 유닛은 강(다리 포함)으로 되돌아가지 않음
  else if (isAcross(u.side, u) && !isAcross(u.side, pos) && !ctx.T.GATE_EXEMPT.includes(u.type)) s -= ctx.T.WEIGHTS.retreat;
  if (S.CROSS_TYPES.includes(u.type) && !isAcross(u.side, u)) {
    // 전진이 막혀 점수 방식으로 판단할 때도 건너편에서 멀어지지는 않음
    const dist = rushDistance(u.type, u.side);
    const back = dist[idx(pos.r, pos.c)] - dist[idx(u.r, u.c)];
    if (back > 0) s -= J.backward * back;
  } else if (ctx.spread.phase === 'crossing' && isAcross(u.side, pos) &&
             GAME_CONFIG.CROSSINGS.some((x) => manhattan(x, pos) === 1)) {
    s -= J.exitBlock;   // 다리 출구를 비워 뒤따르는 유닛이 나올 수 있게
  }
  return s;
}

/** 강 건너편(적 강변 이후)인가 */
function isAcross(side, pos) {
  return !onOwnBank(side, pos) && !inRiverRows(pos);
}

// _rushCache: 2절 위쪽에 선언 (loadScenario 가 비움)
/**
 * 건너편까지 남은 칸 수 지도 (지형 비용 무시, 진입 불가 지형만 피함).
 * 강은 들어가면 이동이 끝나므로 '칸 수'가 곧 걸리는 턴 수에 가깝다. 다리를 더 싸게 보지 않는다.
 */
function rushDistance(unitTypeKey, side) {
  const key = `${unitTypeKey}|${side}`;
  if (_rushCache.has(key)) return _rushCache.get(key);
  const dist = new Array(N * N).fill(Infinity);
  const ok = (r, c) => { const ter = terrainAt(r, c); return !(ter.impassableFor && ter.impassableFor.includes(unitTypeKey)); };
  const q = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (isAcross(side, { r, c }) && ok(r, c)) { dist[idx(r, c)] = 0; q.push(idx(r, c)); }
  }
  for (let h = 0; h < q.length; h++) {
    const { r, c } = posOf(q[h]);
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc) || !ok(nr, nc)) continue;
      const ni = idx(nr, nc);
      if (dist[ni] > dist[q[h]] + 1) { dist[ni] = dist[q[h]] + 1; q.push(ni); }
    }
  }
  _rushCache.set(key, dist);
  return dist;
}

/**
 * 도하 최우선 이동: 아직 건너지 않은 보병·기갑은 점수 계산 없이 '건너편에 가장 가까워지는 칸'으로 간다.
 * 같은 전진이면 (1) 다리가 아닌 강 칸 (2) 이번 턴 다른 도하 유닛과 MIN_GAP 이상 (3) 옆으로 덜 비켜나는 칸 (4) 무작위.
 * 전진할 칸이 없으면 null (평소 점수 방식으로 판단).
 */
function aiRushMove(state, side, u, taken, S, rng) {
  const dist = rushDistance(u.type, side);
  const cur = dist[idx(u.r, u.c)];
  const isBridge = (p) => GAME_CONFIG.CROSSINGS.some((x) => x.r === p.r && x.c === p.c);
  let best = null, bestKey = null;
  for (const t of getReachableTiles(state, u.id)) {
    const d = dist[idx(t.r, t.c)];
    if (!isFinite(d) || d >= cur) continue;
    const gap = taken.length ? Math.min(S.MIN_GAP, ...taken.map((p) => manhattan(p, t))) : S.MIN_GAP;
    const key = [d, isBridge(t) ? 1 : 0, -gap, Math.abs(t.c - u.c), rng()];
    if (!bestKey || lexLess(key, bestKey)) { best = t; bestKey = key; }
  }
  return best ? { r: best.r, c: best.c } : null;
}
function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/** 산개전술 상태 갱신 (턴 시작 시 1회): 건너지 않은 보병·기갑이 남아 있으면 crossing, 아니면 assault */
function aiUpdateSpreadPlan(state, side, diff, rng) {
  const S = diff.constants.SPREAD;
  let plan = state.aiPlan[side];
  if (!plan || plan.kind !== 'spread') {
    // 매 판 가중치 변주 (건넌 뒤의 산개 정도가 판마다 조금씩 다름)
    const vary = (w) => w * (1 + S.JITTER * (rng() * 2 - 1));
    plan = {
      kind: 'spread', phase: 'crossing', crossRound: null,
      weights: { ...S.WEIGHTS, shellThreat: vary(S.WEIGHTS.shellThreat), isolation: vary(S.WEIGHTS.isolation) },
    };
    state.aiPlan[side] = plan;
  }
  const pending = state.units.some((u) => u.side === side && S.CROSS_TYPES.includes(u.type) && !isAcross(side, u));
  plan.phase = pending ? 'crossing' : 'assault';
  plan.round = state.round;
  return plan;
}

function aiGoalTiles(state, ctx, u) {
  const C = GAME_CONFIG, AI = C.AI;
  const side = u.side;
  const goals = [];
  if (ctx.neutral) return aiNeutralGoals(state, ctx, u);
  if (ctx.isAttacker) {
    // 어려움: 본대가 강변에 있는 동안 정찰은 축 뒤에서 포병의 눈 역할 (본부 진입이 가능하면 hqWin 점수가 우선)
    if (ctx.plan && AI.HQ_RUNNERS.includes(u.type) && ctx.plan.staged > 0) {
      const b = riverBanks(side), back = b.stage + Math.sign(b.stage - b.exit);
      return [-1, 0, 1].map((dc) => ({ r: back, c: ctx.plan.axis + dc })).filter((p) => inBounds(p.r, p.c));
    }
    if (AI.HQ_RUNNERS.includes(u.type) && C.HQ[enemyOf(side)]) return [C.HQ[enemyOf(side)]];   // 본부가 없으면 거점을 목표로
    // 어려움: 아직 강을 건너지 않은 유닛은 선택한 축의 건너편 출구로 모임
    if (ctx.plan && onOwnBank(side, u) && !ctx.T.GATE_EXEMPT.includes(u.type)) {
      const b = riverBanks(side), ax = ctx.plan.axis;
      // 포병은 보병/기갑이 아직 강변에 남아 있는 동안 축 앞 강변에서 엄호
      if (unitType(u).indirect && (!ctx.plan.massed || ctx.plan.staged > 0)) {
        return [-1, 0, 1].map((dc) => ({ r: b.stage, c: ax + dc })).filter((p) => inBounds(p.r, p.c));
      }
      return [{ r: b.exit, c: ax }];
    }
    const owned = state.objectives.filter((o) => o.owner === side);
    for (const o of state.objectives) if (o.owner !== side) goals.push(o);
    const need = holdCount();
    if (need != null && owned.length >= need) {
      // 확보한 거점 중 비어 있는 곳은 지키러 감
      for (const o of owned) { const occ = getUnitAt(state, o.r, o.c); if (!occ || occ.id === u.id) goals.push(o); }
    }
    if (!goals.length && C.HQ[enemyOf(side)]) goals.push(C.HQ[enemyOf(side)]);
  } else {
    if (AI.HQ_GUARDS.includes(u.type) && C.HQ[side]) {
      for (const e of ctx.known) if (manhattan(e, C.HQ[side]) <= AI.HQ_ALERT_RADIUS) goals.push({ r: e.r, c: e.c });
      return goals.length ? goals : [C.HQ[side]];
    }
    for (const o of state.objectives) {
      if (o.owner !== side) goals.push(o);
      else if (AI.GARRISON_TYPES.includes(u.type)) {
        const occ = getUnitAt(state, o.r, o.c);
        if (!occ || occ.id === u.id) goals.push(o);   // 비어 있는 아군 거점 재점거
      }
    }
    if (C.HQ[side]) for (const e of ctx.known) if (manhattan(e, C.HQ[side]) <= AI.HQ_ALERT_RADIUS) goals.push({ r: e.r, c: e.c });
  }
  return goals;
}

/**
 * 중립 모드 목표: 내가 점유하지 않은 거점(비었거나 상대 점유·다툼 중)의 모든 칸.
 * 이미 내가 서 있는 아군 거점은 그 거점도 목표에 넣어 자리를 지키게 함. 목표가 없으면(전부 점유) 아는 적.
 * 거점 소유는 공개 정보이고, 적은 자기 시야와 기억(ctx.known)만 씀
 */
function aiNeutralGoals(state, ctx, u) {
  const goals = [];
  for (const o of state.objectives) {
    const cells = objectiveCells(o);
    if (o.owner !== ctx.side || cells.some((p) => samePos(p, u))) for (const p of cells) goals.push(p);
  }
  if (ctx.v2) symV2Goals(state, ctx, u, goals);   // 반격: 거점 근처에 들어온 적 (전투 유닛)
  if (!goals.length) for (const e of ctx.known) goals.push({ r: e.r, c: e.c });
  return goals;
}

/** 점수제 거점 가치 배수: 점수 / 평균 점수 (점수제가 아니면 1) */
function objPointWeight(id) {
  const P = GAME_CONFIG.OBJECTIVE_POINTS;
  if (!P) return 1;
  const vals = Object.values(P), mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return mean > 0 ? (P[id] || 0) / mean : 1;
}

/** 이 칸에서 다음 적 턴에 받을 것으로 예상되는 피해 (아는 적 기준 단순 추정) */
function aiEstimateThreat(state, ctx, u, pos) {
  const me = { ...u, r: pos.r, c: pos.c };
  const ter = terrainAt(pos.r, pos.c);
  let total = 0;
  for (const e of ctx.known) {
    const et = GAME_CONFIG.UNIT_TYPES[e.type];
    if (!et.canAttack) continue;
    const d = manhattan(e, pos);
    const R = et.indirect ? fireRange(state, enemyOf(u.side), e.type) : { min: et.rangeMin, max: et.rangeMax };
    if (et.indirect && !et.moveFire) { if (d < R.min || d > R.max) continue; }
    else if (d > et.move + R.max) continue;
    // 이동 후 공격 규칙: 다가와서 치는 적은 명중률 보정 (ENABLE_MOVE_ATTACK 가 꺼져 있으면 calcHitBreakdown 이 무시)
    const hc = calcHitBreakdown({ attacker: e, defender: me, terrain: ter, signal: false, fogged: false, movedAttack: !(et.indirect && !et.moveFire) && d > R.max });
    total += (hc.chance / 100) * Math.min(calcDamage(e, me), me.hp);
  }
  return total * GAME_CONFIG.AI.UNIT_VALUE[u.type];
}

function nearestKnownEnemyDist(ctx, pos) {
  let best = Infinity;
  for (const e of ctx.known) best = Math.min(best, manhattan(e, pos));
  return best;
}

function onOwnBank(side, pos) {
  const rows = GAME_CONFIG.RIVER_ROWS;
  if (!rows.length) return false;   // 가로 강 줄기가 없는 지도
  const hq = sideAnchor(side);
  return hq.r < Math.min(...rows) ? pos.r < Math.min(...rows) : pos.r > Math.max(...rows);
}

function aiScorePosition(state, ctx, u, pos, goals, diff) {
  const C = GAME_CONFIG, AI = C.AI, W = AI.WEIGHTS;
  const t = unitType(u);
  const ter = terrainAt(pos.r, pos.c);
  let s = 0;
  s -= W.threat * diff.risk * aiEstimateThreat(state, ctx, u, pos);
  s += W.terrain * (-ter.hitMod / 10);
  const SYM = ctx.neutral ? AI.SYMMETRIC : null;
  if (goals.length) {
    const f0 = goalDistance(u.type, goals, u), f1 = goalDistance(u.type, goals, pos);
    // 중립 모드: 라운드가 지날수록 거점 접근 가중치를 키움 (교착 방지)
    const grow = SYM ? 1 + SYM.APPROACH_GROWTH * Math.max(0, state.round - SYM.GROWTH_START) : 1;
    if (isFinite(f0) && isFinite(f1)) s += W.approach * grow * (f0 - f1);
  }
  const obj = objectiveAt(state, pos.r, pos.c);
  // 중립 모드 + 점수제: 거점 가치 × (그 거점 점수 / 평균 점수). 그 밖의 경우 배수 1 (기존과 같은 계산)
  if (obj) s += (SYM ? objPointWeight(obj.id) : 1) * (obj.owner !== u.side ? W.capture : (SYM ? SYM.HOLD : ctx.isAttacker ? W.hold : W.holdDefender));
  const enemyHq = C.HQ[enemyOf(u.side)];
  if (enemyHq && samePos(pos, enemyHq)) s += W.hqWin;
  if (!ctx.isAttacker && !ctx.neutral) {
    let nd = Infinity;
    for (const o of state.objectives) nd = Math.min(nd, manhattan(o, pos));
    const guard = AI.HQ_GUARDS.includes(u.type) && !!C.HQ[u.side];
    if ((ctx.hqThreat || guard) && C.HQ[u.side]) nd = Math.min(nd, manhattan(C.HQ[u.side], pos) - (guard ? AI.HQ_GUARD_RADIUS - AI.DEFENDER_LEASH : 0));
    s -= W.leash * Math.max(0, nd - AI.DEFENDER_LEASH);
    if (ctx.hqThreat) {
      const dh = manhattan(C.HQ[u.side], pos);
      if (dh === 0) s += W.hqBlock;
      else if (dh === 1) s += W.hqGuard;
    }
  }
  if (t.canAttack) {
    const range = C.COMBAT.signalRange;
    if (ctx.allies.some((a) => a.id !== u.id && unitType(a).isSignal && manhattan(a, pos) <= range)) {
      s += ctx.has('signalFocus') && !t.indirect ? ctx.T.WEIGHTS.inSignalRange : W.inSignalRange;   // 포병은 위치 우선
    }
  }
  if (ctx.tactics) s += aiTacticsPosition(state, ctx, u, pos);
  if (ctx.spread) s += aiSpreadPosition(state, ctx, u, pos);
  if (ctx.v2) s += symV2Position(state, ctx, u, pos);   // 위험·집결·수비·추격 제한·비켜 주기·정찰 (ai-intel.js)
  switch (AI.TYPE_BONUS[u.type]) {
    case 'rear': {
      const nd = nearestKnownEnemyDist(ctx, pos);
      if (nd <= 1) s -= W.artyExposed;
      const R = fireRange(state, u.side, u.type);
      let inRange = 0;
      for (const e of ctx.known) { const d = manhattan(e, pos); if (d >= R.min && d <= R.max) inRange++; }
      s += W.artyInRange * Math.min(2, inRange);
      if (!ctx.isAttacker && C.CROSSINGS.some((x) => { const d = manhattan(x, pos); return d >= R.min && d <= R.max; })) s += W.artyCoverCrossing;
      break;
    }
    case 'mortarRear': {
      // 박격포: 보이는 적과 2칸 이하인 칸은 피하고, 목표 쪽 앞(1~3칸)에 아군 보병이 있는 칸을 선호. 다음 턴 사거리 안의 아는 적
      let nv = Infinity;
      for (const e of ctx.visibleEnemies) nv = Math.min(nv, manhattan(e, pos));
      if (nv <= 2) s -= W.mortarClose;
      if (goals.length) {
        const my = goalDistance(u.type, goals, pos);
        let front = 0;
        for (const a of ctx.allies) {
          if (a.id === u.id || a.type !== 'infantry' || manhattan(a, pos) > 3) continue;
          if (goalDistance(a.type, goals, a) < my) front++;
        }
        s += W.mortarBehind * Math.min(2, front);
      }
      const R = fireRange(state, u.side, u.type);
      let inRange = 0;
      for (const e of ctx.known) { const d = manhattan(e, pos); if (d >= R.min && d <= R.max) inRange++; }
      s += W.artyInRange * Math.min(2, inRange);
      break;
    }
    case 'supportBehind': {
      // 아군 전투 유닛의 2~3칸 뒤(아군 본부 쪽, 본부가 없으면 아군 배치의 평균 위치 쪽)에 위치
      const hq = sideAnchor(u.side);
      const myDepth = manhattan(pos, hq);
      let behind = 0, ahead = 0;
      for (const a of ctx.allies) {
        if (a.id === u.id || !unitType(a).canAttack) continue;
        const d = manhattan(a, pos);
        const aDepth = manhattan(a, hq);
        if (d >= AI.SIGNAL_BEHIND_MIN && d <= AI.SIGNAL_BEHIND_MAX && aDepth > myDepth) behind++;
        else if (d <= AI.SIGNAL_BEHIND_MAX && aDepth < myDepth) ahead++;
      }
      s += W.signalBehind * Math.min(AI.SIGNAL_BEHIND_COUNT_MAX, behind);
      s -= W.signalTooClose * ahead;
      break;
    }
    case 'vision': {
      let fresh = 0;
      const v = t.vision;
      for (let dr = -v; dr <= v; dr++) {
        const rem = v - Math.abs(dr);
        for (let dc = -rem; dc <= rem; dc++) {
          const r = pos.r + dr, c = pos.c + dc;
          if (inBounds(r, c) && !ctx.vis.has(idx(r, c))) fresh++;
        }
      }
      s += W.reconVision * fresh;
      break;
    }
    case 'crossing': {
      if (onOwnBank(u.side, u)) {
        const f0 = goalDistance(u.type, C.CROSSINGS, u), f1 = goalDistance(u.type, C.CROSSINGS, pos);
        if (isFinite(f0) && isFinite(f1)) s += W.armorCrossing * (f0 - f1);
      }
      break;
    }
    case 'huntArmor': {
      const armors = ctx.visibleEnemies.filter((e) => unitType(e).isArmor);
      if (armors.length) {
        const m0 = Math.min(...armors.map((a) => manhattan(a, u)));
        const m1 = Math.min(...armors.map((a) => manhattan(a, pos)));
        s += W.antitankApproach * (m0 - m1);
      }
      break;
    }
    default: break;
  }
  return s;
}

/** 표적 가치 배수를 켜는 기능 */
const TARGET_MULT_FEATURE = { signal: 'signalFocus', artillery: 'artyHunt' };

/** movedAttack: from 으로 이동한 뒤의 공격인가 (이동 후 공격 보정 -10 반영) */
function aiScoreAttack(state, ctx, u, from, tg, movedAttack = false) {
  const C = GAME_CONFIG, AI = C.AI, W = AI.WEIGHTS, V = AI.UNIT_VALUE;
  const t = unitType(u);
  const fogged = !ctx.vis.has(idx(tg.r, tg.c));
  const signal = hasSignalSupport(state, u, from);
  // battery: 어려움 대포병 사격 — 추정 위치의 적 포병을 가상의 표적으로 평가
  // intel/likely: 새 대칭 AI 의 안개 속 사격 (기억한 위치·올 가능성이 높은 칸). 기억한 병종·체력으로 가상의 표적
  const target = tg.kind === 'visible' ? getUnitAt(state, tg.r, tg.c)
    : tg.kind === 'battery' ? { type: 'artillery', hp: tg.hp, side: enemyOf(u.side), r: tg.r, c: tg.c }
    : (tg.kind === 'intel' || tg.kind === 'likely') ? { id: tg.id, type: tg.type, hp: tg.hp, side: enemyOf(u.side), r: tg.r, c: tg.c } : null;
  const hc = calcHitBreakdown({ attacker: u, defender: target, terrain: terrainAt(tg.r, tg.c), signal, fogged, movedAttack, indirectPenalty: indirectPenaltyOf(state, u) });
  const p = (hc.chance / 100) * (tg.kind === 'battery' || tg.kind === 'intel' || tg.kind === 'likely' ? tg.conf : 1);
  let s = 0;
  if (target) {
    const dmg = calcDamage(u, target);
    let mult = (!ctx.isAttacker && ctx.hqThreat && manhattan(target, C.HQ[u.side]) <= unitType(target).move + 2) ? W.hqThreatTarget : 1;
    // [signalFocus] 통신 / [artyHunt] 포병을 우선 표적으로
    const tmFeat = TARGET_MULT_FEATURE[target.type];
    if (tmFeat && ctx.has(tmFeat) && ctx.T.TARGET_MULT) mult *= ctx.T.TARGET_MULT[target.type] || 1;
    s += W.damage * p * Math.min(dmg, target.hp) * V[target.type] * mult;
    if (dmg >= target.hp) s += W.kill * p * V[target.type] * mult;
  } else if (tg.kind === 'blind') {
    s += W.blindFire * (1 - tg.age / (AI.BLIND_FIRE_MAX_AGE + 1));
  }
  if (t.indirect && t.splash !== false) {
    const splash = C.COMBAT.splashDamage;
    for (const [dr, dc] of DIRS) {
      const o = getUnitAt(state, tg.r + dr, tg.c + dc);
      if (!o) continue;
      if (o.side === u.side) s -= W.friendlyFire * p * V[o.type] * (o.hp <= splash ? 2 : 1);   // 오폭 회피
      else if (ctx.vis.has(idx(o.r, o.c))) {
        s += W.damage * p * splash * V[o.type];
        if (o.hp <= splash) s += W.kill * p * V[o.type];
      }
    }
    if (!ctx.isAttacker && C.CROSSINGS.some((x) => manhattan(x, tg) <= 1)) s += W.crossingFire;
  }
  if (ctx.v2 && target) s += symV2Attack(state, ctx, u, target, p, tg.kind);   // 위협 제거·마무리·집중 (ai-intel.js)
  return s;
}

/** 포병 사격 후보: 보이는 적 우선, 없으면 기억 기반 시야 밖 사격 */
function aiArtilleryTargets(state, ctx, u, rng, from = u) {
  const AI = GAME_CONFIG.AI;
  const inRange = (p) => inFireRange(state, u, from, p);
  const list = [];
  // 간접 화력 설정이 있는 시나리오: 보이는 적만 쏨 (안개 속 추측 사격·대포병 추정 사격은 하지 않음)
  if (GAME_CONFIG.FIRES) {
    for (const e of ctx.visibleEnemies) if (inRange(e)) list.push({ r: e.r, c: e.c, kind: 'visible' });
    if (ctx.v2) list.push(...symV2FogTargets(state, ctx, u, inRange));   // 새 대칭 AI: 기억한 위치·올 가능성이 높은 칸 (안개 속 사격)
    return list;
  }
  // 어려움: 보이지 않는 적 포병(기억/추정 위치)에 대포병 사격 후보
  for (const a of ctx.enemyArty) {
    if (!inRange(a) || ctx.vis.has(idx(a.r, a.c))) continue;
    list.push({ r: a.r, c: a.c, kind: 'battery', hp: a.hp, conf: a.assumed ? ctx.T.ASSUMED_CONFIDENCE : 1 });
  }
  if (ctx.visibleEnemies.length) {
    for (const e of ctx.visibleEnemies) if (inRange(e)) list.push({ r: e.r, c: e.c, kind: 'visible' });
    return list;
  }
  for (const m of Object.values(state.memory[u.side])) {
    const age = state.round - m.round;
    if (age > AI.BLIND_FIRE_MAX_AGE) continue;
    const rad = age + 1;
    const cands = [];
    for (let dr = -rad; dr <= rad; dr++) {
      const rem = rad - Math.abs(dr);
      for (let dc = -rem; dc <= rem; dc++) {
        const p = { r: m.r + dr, c: m.c + dc };
        if (inBounds(p.r, p.c) && inRange(p) && !ctx.vis.has(idx(p.r, p.c))) cands.push(p);
      }
    }
    if (cands.length) {
      const p = cands[Math.floor(rng() * cands.length)];
      list.push({ r: p.r, c: p.c, kind: 'blind', age });
    }
  }
  return list;
}

/** 한 유닛의 (이동 칸, 공격 대상) 조합 중 하나를 고름 */
function aiChooseAction(state, u, rng, diff) {
  return aiPickOption(aiActionOptions(state, u, rng, diff), rng);
}

/** 유닛의 후보 행동 전체 (노이즈 포함 점수, 높은 순). 제자리 대기 후보도 들어 있음 */
function aiActionOptions(state, u, rng, diff) {
  const ctx = buildAiContext(state, u.side, diff);
  if (ctx.spread) ctx.shellEval = aiMakeShellEval(state, ctx, u);   // [spreadCrossing] 대형 포탄 위협 평가기
  const t = unitType(u);
  const MA = GAME_CONFIG.ENABLE_MOVE_ATTACK;
  const dests = [{ r: u.r, c: u.c }];
  // remaining: 그 칸에 도착했을 때 남은 이동력 (이동 후 공격 가능 여부 판단용)
  for (const tile of getReachableTiles(state, u.id)) dests.push({ r: tile.r, c: tile.c, remaining: tile.remaining });
  const goals = aiGoalTiles(state, ctx, u);
  const canAtk = canUnitAttack(state, u);
  const artyTargets = (t.indirect && canAtk) ? aiArtilleryTargets(state, ctx, u, rng) : [];
  const options = [];
  for (const d of dests) {
    const stay = samePos(d, u);
    const base = aiScorePosition(state, ctx, u, d, goals, diff);
    options.push({ move: d.remaining == null ? d : { r: d.r, c: d.c }, target: null, score: base });
    if (!canAtk) continue;
    let movedAttack = false;
    if (MA) {
      // 이동 후 공격: 포병 불가, 도착 후 남은 이동력 >= 공격 비용 (강 칸은 남은 이동력 0 이라 자동으로 제외)
      if (!stay && ((t.indirect && !t.moveFire) || d.remaining < attackCost(u.type))) continue;
      movedAttack = stay ? isMoveAttack(u) : true;   // 제자리: 매복 등으로 이미 이동한 유닛이면 보정 적용
    } else if (!stay && !GAME_CONFIG.ATTACK_AFTER_MOVE) continue;   // 이동하면 공격 불가
    if (t.indirect && t.moveFire) {   // 박격포: 도착 칸에서 사거리 안의 보이는 적
      // 이동하면 박격포 자신의 시야가 바뀜: 다른 아군이 보고 있거나 도착 칸에서도 보이는 적만 (이동 후 안개 속 사격이 되지 않게)
      const keep = (p) => p.kind === 'intel' || p.kind === 'likely' || ctx.visOthers(u).has(idx(p.r, p.c)) || manhattan(d, p) <= t.vision;   // intel/likely 는 원래 안개 속 사격
      const tgs = stay ? artyTargets : aiArtilleryTargets(state, ctx, u, rng, d).filter(keep);
      for (const tg of tgs) options.push({ move: d.remaining == null ? d : { r: d.r, c: d.c }, target: tg, score: base + aiScoreAttack(state, ctx, u, d, tg, movedAttack) });
    } else if (t.indirect) {
      if (stay) for (const tg of artyTargets) options.push({ move: d, target: tg, score: base + aiScoreAttack(state, ctx, u, d, tg) });
    } else {
      for (const [dr, dc] of DIRS) {
        const r = d.r + dr, c = d.c + dc;
        if (!inBounds(r, c) || !ctx.vis.has(idx(r, c))) continue;
        const e = getUnitAt(state, r, c);
        if (!e || e.side === u.side) continue;
        const tg = { r, c, kind: 'visible' };
        options.push({ move: d.remaining == null ? d : { r: d.r, c: d.c }, target: tg, score: base + aiScoreAttack(state, ctx, u, d, tg, movedAttack) });
      }
    }
  }
  for (const o of options) o.score += (rng() * 2 - 1) * diff.noise;
  options.sort((a, b) => b.score - a.score);
  return options;
}

/**
 * 후보 중 하나를 고름: 결정적인 수(본부 진입 급)가 있으면 그것, 아니면 상위 TOP_K 중 점수 비례.
 * key: 비례에 쓸 값 ('score' 또는 행동 제한 모드의 'gain'). options 는 key 높은 순으로 정렬돼 있어야 함
 */
function aiPickOption(options, rng, key = 'score') {
  const AI = GAME_CONFIG.AI;
  if (options[0].score >= AI.WEIGHTS.hqWin / 2) return options[0];
  const top = options.slice(0, AI.TOP_K);
  const floor = top[top.length - 1][key];
  const weights = top.map((o) => o[key] - floor + AI.PICK_MARGIN);
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < top.length; i++) { roll -= weights[i]; if (roll <= 0) return top[i]; }
  return top[0];
}

/**
 * AI 한 턴. state 를 직접 진행시키고 행동 목록을 반환한다.
 * @returns {Array<{unitId, side, unitType, from, to, target, events, moveSnapshot?, snapshot?}>}
 */
function aiTakeTurn(state, side, rng = Math.random, difficulty = 'normal', opts = {}) {
  const AI = GAME_CONFIG.AI;
  // rng = AI 노이즈 스트림, opts.diceRng = 주사위 스트림 (없으면 rng 하나로 둘 다 — 변경 전과 같은 순서)
  const diceRng = opts.diceRng || rng;
  // 대칭 시나리오: 'turtle' = 진단용 수비 봇, 'v1:<난이도>' = 기존 중립 AI, 그 밖 = 새 AI (v2, ai-intel.js)
  let sym = null;
  if (GAME_CONFIG.AI_MODE === 'symmetric') {
    if (difficulty === 'turtle') return turtleTakeTurn(state, side, rng, { ...opts, diceRng });
    const v1 = typeof difficulty === 'string' && difficulty.startsWith('v1:');
    if (v1) difficulty = difficulty.slice(3);
    sym = { v2: !v1, level: difficulty === 'easy' ? 'easy' : (difficulty === 'hard' || difficulty === 'hardSpread') ? 'hard' : 'normal' };
  }
  const diff = resolveProfile(difficulty);
  if (sym) diff.sym = sym;
  const record = opts.recordSnapshots !== false;
  const attacker = side === attackerSide() || GAME_CONFIG.AI_MODE === 'symmetric';   // 중립 모드는 양쪽 모두 같은 전술 기능
  const feat = (f) => attacker && diff.features.includes(f);
  const T = diff.constants;
  if (!state.aiPlan) state.aiPlan = {};
  const order = feat('reconSpotting') && T.UNIT_ORDER ? T.UNIT_ORDER : AI.UNIT_ORDER;
  // [spreadCrossing] 턴 시작 시 상태 갱신. 아직 건너지 않은 보병·기갑은 '도하 최우선' 이동
  const spreadPlan = feat('spreadCrossing') ? aiUpdateSpreadPlan(state, side, diff, rng) : null;
  const rushTaken = [];   // 이번 턴 도하 유닛들이 고른 칸 (서로 간격 유지용)
  const ids = state.units
    .filter((u) => u.side === side)
    .sort((a, b) => (order.indexOf(a.type) - order.indexOf(b.type)) || a.id.localeCompare(b.id, 'en', { numeric: true }))
    .map((u) => u.id);
  const actions = [];
  // 고른 행동 실행: 이동 → (매복·도하 최우선이면 재판단) → 공격 → 행동 종료. 행동 제한 모드와 공용
  const execute = (id, choice, rushed) => {
    const u = getUnit(state, id);
    const from = { r: u.r, c: u.c };
    const events = [];
    let moveSnapshot = null;
    if (choice.move && !samePos(choice.move, u) && canUnitMove(state, u)) {
      events.push(...moveUnit(state, u.id, choice.move));
      if (record) moveSnapshot = cloneState(state);
      if (!state.winner && !samePos(u, choice.move)) choice = aiChooseAction(state, u, rng, diff);   // 매복으로 멈춤 → 재판단
      // 이동 후 공격 규칙: 도하 최우선 이동은 공격을 따지지 않았으므로, 남은 이동력으로 공격할지 다시 판단
      else if (!state.winner && rushed && GAME_CONFIG.ENABLE_MOVE_ATTACK && canUnitAttack(state, u)) choice = aiChooseAction(state, u, rng, diff);
    }
    if (!state.winner && choice.target && getUnit(state, id)) {
      if (getAttackableTiles(state, id).some((p) => samePos(p, choice.target))) {
        events.push(...resolveAttack(state, id, { r: choice.target.r, c: choice.target.c }, diceRng));
      } else if (opts.stats) {
        opts.stats.illegal = (opts.stats.illegal || 0) + 1;   // 규칙상 할 수 없는 공격을 고름 (실행하지 않고 건너뜀)
      }
    }
    const live = getUnit(state, id);
    if (live) finishUnit(state, id);
    actions.push({
      unitId: id, side, unitType: u.type, from, to: { r: u.r, c: u.c },
      target: choice.target ? { r: choice.target.r, c: choice.target.c, kind: choice.target.kind } : null,
      events, moveSnapshot, snapshot: record ? cloneState(state) : null,
    });
  };
  if (state.act && state.act.side === side) {
    aiActivationLoop(state, side, ids, rng, diff, { feat, T, spreadPlan, rushTaken, execute });
    return actions;
  }
  for (const id of ids) {
    if (state.winner) break;
    const u = getUnit(state, id);
    if (!u || u.acted) continue;
    if (feat('crossingPlan')) aiUpdatePlan(state, side, T);   // 유닛마다 집결/도하 상태 갱신
    let choice = null;
    if (spreadPlan && T.SPREAD.CROSS_TYPES.includes(u.type) && !isAcross(side, u) && canUnitMove(state, u)) {
      const dest = aiRushMove(state, side, u, rushTaken, T.SPREAD, rng);
      if (dest) {
        choice = { move: dest, target: null };
        rushTaken.push(dest);
        if (spreadPlan.crossRound == null) spreadPlan.crossRound = state.round;
      }
    }
    const rushed = !!choice;
    if (!choice) choice = aiChooseAction(state, u, rng, diff);
    execute(id, choice, rushed);
  }
  return actions;
}

/**
 * 행동 제한이 있는 AI 턴: 한도가 남아 있는 동안, 아직 행동하지 않은 유닛 전체의 후보(이동, 이동 후 공격, 제자리 공격)를
 * 현재 상태로 점수화해 하나를 골라 실행하고 다시 점수화한다. 제자리 대기는 행동을 소모하지 않으므로 후보에서 뺀다.
 *   비교 값 gain = 후보 점수 − 그 유닛의 제자리 대기 점수 (대기보다 나은 행동만 한도를 쓴다)
 *   도하 최우선 이동([spreadCrossing])은 기존처럼 다른 후보보다 먼저 (유닛 순서대로)
 *   더 나은 후보가 없으면 남은 한도를 쓰지 않고 끝낸다. 행동하지 않은 유닛은 그대로 둔다.
 */
function aiActivationLoop(state, side, ids, rng, diff, k) {
  const AI = GAME_CONFIG.AI;
  const a = state.act;
  let guard = 0;
  while (!state.winner && a.used < a.limit && guard++ <= ids.length) {
    if (k.feat('crossingPlan')) aiUpdatePlan(state, side, k.T);
    const ready = ids.map((id) => getUnit(state, id))
      .filter((u) => u && !u.acted && !hasActivated(state, u) && (canUnitMove(state, u) || canUnitAttack(state, u)));
    let rush = null;
    if (k.spreadPlan) {
      for (const u of ready) {
        if (!k.T.SPREAD.CROSS_TYPES.includes(u.type) || isAcross(side, u) || !canUnitMove(state, u)) continue;
        const dest = aiRushMove(state, side, u, k.rushTaken, k.T.SPREAD, rng);
        if (dest) { rush = { id: u.id, choice: { move: dest, target: null } }; break; }
      }
    }
    const cands = [];
    if (!rush) for (const u of ready) {
      const id = u.id;
      const opts = aiActionOptions(state, u, rng, diff);
      const stay = opts.find((o) => !o.target && samePos(o.move, u));
      const base = stay ? stay.score : -Infinity;
      for (const o of opts) {
        if (!o.target && samePos(o.move, u)) continue;
        const gain = o.score - base;
        if (gain > 0 || o.score >= AI.WEIGHTS.hqWin / 2) cands.push({ id, choice: o, score: o.score, gain });
      }
    }
    if (rush) {
      k.rushTaken.push(rush.choice.move);
      if (k.spreadPlan.crossRound == null) k.spreadPlan.crossRound = state.round;
      k.execute(rush.id, rush.choice, true);
      continue;
    }
    if (!cands.length) break;
    const win = cands.reduce((b, c) => (c.score > b.score ? c : b));
    let pick;
    if (win.score >= AI.WEIGHTS.hqWin / 2) pick = win;
    else { cands.sort((x, y) => y.gain - x.gain); pick = aiPickOption(cands, rng, 'gain'); }
    k.execute(pick.id, pick.choice, false);
  }
}

/* =========================== 10. 시뮬레이션 =========================== */
const SIM_CROSS_TYPES = ['infantry', 'armor'];   // 도하 지표를 셀 병종 (공격 측)
/**
 * 양쪽 모두 AI 로 n 판 자동 진행.
 * @param {number} n
 * @param {{seed?:number, [진영id|'def'|'att']?:string, quiet?:boolean, scenario?:string, overrides?:object|function, detail?:boolean}} opts
 *   진영별 AI 프로필은 진영 id(예: north) 또는 역할(def/att)로 지정. scenario/overrides 를 주면 그 시나리오로 돌리고 끝나면 되돌림.
 *   detail: 진영별 첫 거점 소유 라운드, 평균 손실, 증원 도착 수를 res.detail 에 추가
 */
function simulateGames(n = 100, opts = {}) {
  if (opts.scenario || opts.overrides) {
    const prev = GAME_CONFIG.SCENARIO_ID;
    loadScenario(opts.scenario || prev, opts.overrides || null);
    try { return simulateGames(n, { ...opts, scenario: undefined, overrides: undefined }); }
    finally { loadScenario(prev); }
  }
  const SIM_REASON_LABELS = {   // 호출 시점의 상수로 라벨 생성
    hq: t('dev.reason.hq'),
    objectives: t('dev.reason.objectives', { n: holdCount() ?? '-' }),
    annihilation: t('dev.reason.annihilation'),
    survived: t('dev.reason.survived', { n: GAME_CONFIG.MAX_ROUNDS }),
  };
  const seed = opts.seed ?? 20250625;
  const SIDES = GAME_CONFIG.ROUND_ORDER;
  const diffs = Object.fromEntries(SIDES.map((s) => [s, opts[s] || opts[roleOf(s)] || 'normal']));
  const ATT = attackerSide(), DEF = sideByRole('def');
  const detail = opts.detail ? { firstOwn: Object.fromEntries(SIDES.map((s) => [s, { games: 0, sum: 0 }])), lossSum: Object.fromEntries(SIDES.map((s) => [s, 0])), arrivals: Object.fromEntries(SIDES.map((s) => [s, 0])) } : null;
  const avg = (sum, cnt) => (cnt ? +(sum / cnt).toFixed(2) : null);
  const perSide = (v) => Object.fromEntries(SIDES.map((s) => [s, v]));

  const res = {
    games: n, errors: 0,
    wins: perSide(0), winRate: {},
    // 결정 원인별 횟수: byReason[원인][승리 진영]
    byReason: Object.fromEntries(Object.keys(SIM_REASON_LABELS).map((k) => [k, perSide(0)])),
    reasons: {},                           // 'north:hq' 형식 (이전 버전 호환)
    avgRounds: 0,                          // 승패가 난 평균 라운드
    firstCapture: { games: 0, avgRound: null, bySide: perSide(0) },   // 첫 거점 점령
    avgSurvivors: {},                      // 종료 시점 평균 생존 유닛 수
  };
  let roundSum = 0, captureRoundSum = 0;
  const survivorSum = perSide(0);
  // 도하 지표 (공격 측): 도하 시작 라운드, 도하 순간 가장 가까운 도하 아군과의 간격, 도하 직후 첫 상대 턴의 포병 피해
  const ATK = ATT;
  const cross = { games: 0, startSum: 0, gapSum: 0, gapCnt: 0, artyDmgSum: 0, artyDmgGames: 0, acrossDmgSum: 0, acrossGames: 0 };
  // 전투 지표: 병종 조합별 명중률, 지형별 반올림 영향, 이동 후 공격 비율
  const combat = { pairs: {}, terrain: {}, attacksByType: {}, moveAttacksByType: {}, atVsArmor: 0, atVsArmorMoved: 0 };
  const aiStats = { illegal: 0 };
  const actUse = {};   // 행동 제한: 역할별 { turns, used, limit } (한도가 있을 때만 채움 → 없으면 결과 형식이 v5 와 같음)
  // 간접 화력 지표 (fires 가 있는 시나리오 또는 opts.fireStats 일 때만 → 없으면 결과 형식이 v6 와 같음)
  const fs = (GAME_CONFIG.FIRES || opts.fireStats) ? {
    shots: {}, fogShots: 0, fogHits: 0, visShots: 0, visHits: 0, ffShots: {}, ffDamage: {},
    lossSum: perSide(0), capture: {}, mortarSeen: 0, mortarLost: 0,
  } : null;
  const bump = (o, k, v = 1) => { o[k] = (o[k] || 0) + v; };
  // 대칭 시나리오 지표 (symmetric 시나리오만 → 다른 시나리오는 결과 형식이 그대로). 무승부는 양쪽이 roundLimitScore 를 가질 때만 생김
  const drawable = !!roundLimitType();
  if (drawable) res.draws = 0;
  const sym = GAME_CONFIG.SYMMETRIC ? { clashSum: 0, clashGames: 0, flips: {}, stall: 0, stallBase: 0, byMover: { first: 0, second: 0 } } : null;
  if (sym) for (const o of GAME_CONFIG.OBJECTIVES) sym.flips[o.id] = 0;
  // 점수제·막판 지표 (대칭 시나리오만): 라운드별 공격 수, 라운드 끝 누적 점수(선공/후공), 11라운드 끝 우세와 최종 결과가 다른 판, 거점별 점유 라운드
  const RMAX = GAME_CONFIG.MAX_ROUNDS;
  if (sym) {
    sym.atk = new Array(RMAX + 1).fill(0);
    sym.curve = [new Array(RMAX + 1).fill(0), new Array(RMAX + 1).fill(0)];
    sym.final = [0, 0, 0];   // 선공 총점, 후공 총점, |차|
    sym.late = { base: 0, flip: 0 };
    sym.held = Object.fromEntries(GAME_CONFIG.OBJECTIVES.map((o) => [o.id, [0, 0]]));
  }
  // 진영별 지표 (대칭 AI 진단): 상대 간접 화력에 잃은 유닛, 간접 사격·안개 속 사격·오사, 거점 3칸 안 격파와 걸린 라운드, 맞고만 있던 라운드
  if (sym) sym.side = Object.fromEntries(SIDES.map((x) => [x, { indLoss: 0, indLossEarly: 0, shots: { artillery: 0, mortar: 0 }, fogShots: 0, fogHits: 0, ff: 0, nearKills: 0, killRoundSum: 0, killCnt: 0, passive: 0, time: [] }]));
  const symObjCells = sym ? GAME_CONFIG.OBJECTIVES.flatMap((o) => (o.cells || [{ r: o.r, c: o.c }])) : [];
  const nearObj = (p) => symObjCells.some((q) => manhattan(q, p) <= 3);
  // splitRng (기본 true): 주사위와 AI 노이즈를 서로 다른 시드 스트림으로. false 면 변경 전처럼 한 스트림
  const splitRng = opts.splitRng !== false;

  for (let i = 0; i < n; i++) {
    const gameSeed = seed + i * 7919;
    const rng = createSeededRng(gameSeed);                                         // AI 노이즈
    const diceRng = splitRng ? createSeededRng((gameSeed ^ 0x5DEECE66) >>> 0) : rng;   // 주사위
    try {
      const st = createInitialState();
      if (!detail) startTurn(st);
      let guard = 0, firstCapture = null;
      const firstOwn = {};   // detail: 진영별로 거점을 처음 (새로) 소유한 라운드
      if (detail) for (const ev of startTurn(st)) if (ev.type === 'arrival') detail.arrivals[ev.side]++;
      let crossStart = null, measureArty = false, acrossSeen = false;
      let firstClash = null, clashLate = false;   // sym: 첫 교전 라운드, 5라운드 이후 교전 여부
      let lead11 = null;                             // sym: 막판 3라운드(12~14) 전, 11라운드 끝에 끝났다면의 판정
      const entered = {}, passivePending = {};      // sym: 유닛이 거점 3칸 안에 처음 들어온 라운드, 직전 상대 턴에 맞은 진영
      const symSide = (actions, turnSide, ownedBefore) => {
        const S = sym.side;
        if (passivePending[turnSide]) {   // 직전 상대 턴에 거점을 점유한 채 맞았는데, 이번 턴에 반격(공격·사격)이 없음
          if (!actions.some((a) => a.events.some((e) => e.type === 'diceRoll' && e.side === turnSide))) S[turnSide].passive++;
          delete passivePending[turnSide];
        }
        const hurt = {};
        for (const a of actions) {
          let shot = null;
          for (const e of a.events) {
            if (e.type === 'diceRoll') {
              shot = e.indirect ? { side: e.side, ff: false } : null;
              if (shot) { S[e.side].shots[e.unitType] = (S[e.side].shots[e.unitType] || 0) + 1; if (e.fogged) { S[e.side].fogShots++; if (e.hit) S[e.side].fogHits++; } }
            } else if (e.type === 'damage' || e.type === 'splashDamage') {
              if (e.side !== turnSide) hurt[e.side] = true;
              if (shot && e.side === shot.side && !shot.ff) { shot.ff = true; S[shot.side].ff++; }
            } else if (e.type === 'destroyed') {
              if (shot && shot.side !== e.side) { S[e.side].indLoss++; if (st.round <= 5) S[e.side].indLossEarly++; }
              if (e.side !== a.side && nearObj(e.pos)) {
                S[a.side].nearKills++;
                if (entered[e.unitId] != null) { S[a.side].killRoundSum += st.round - entered[e.unitId]; S[a.side].killCnt++; }
              }
            }
          }
        }
        for (const x of Object.keys(hurt)) if (ownedBefore[x] > 0) passivePending[x] = true;
      };
      const symEvents = (evs) => {
        for (const e of evs) {
          if (e.type === 'diceRoll' && e.targetType) { if (firstClash == null) firstClash = st.round; if (st.round > 4) clashLate = true; }
          if (e.type === 'diceRoll') sym.atk[st.round]++;
          if (e.type === 'captured' || e.type === 'objectiveLost') sym.flips[e.objectiveId]++;
        }
      };
      while (!st.winner) {
        if (++guard > GAME_CONFIG.MAX_ROUNDS * SIDES.length + 5) throw new Error(t('err.noEnd'));
        const turnSide = st.turn;
        const onBankBefore = turnSide === ATK
          ? new Set(st.units.filter((u) => u.side === ATK && SIM_CROSS_TYPES.includes(u.type) && onOwnBank(ATK, u)).map((u) => u.id))
          : null;
        const ownedBefore = sym ? Object.fromEntries(SIDES.map((x) => [x, st.objectives.filter((o) => o.owner === x).length])) : null;
        const clock = opts.clock || (() => Date.now());   // 계산 시간 측정용 (Node 진단은 performance.now 를 넘김)
        const t0 = sym && opts.timing ? clock() : 0;
        const actions = aiTakeTurn(st, st.turn, rng, diffs[st.turn], { recordSnapshots: false, diceRng, stats: aiStats });
        if (sym && opts.timing) sym.side[turnSide].time.push(clock() - t0);   // 계산 시간은 opts.timing 일 때만 (결과가 실행마다 달라지므로)
        if (sym) symSide(actions, turnSide, ownedBefore);
        if (st.act && st.act.side === turnSide) {
          if (st.act.used > st.act.limit) throw new Error(t('err.activationExceeded'));
          const au = actUse[roleOf(turnSide)] || (actUse[roleOf(turnSide)] = { turns: 0, used: 0, limit: 0 });
          au.turns++; au.used += st.act.used; au.limit += st.act.limit;
        }
        if (fs) for (const a of actions) {
          let shot = null;   // 지금 처리 중인 간접 사격 (뒤따르는 피해 이벤트를 묶음)
          for (const e of a.events) {
            if (e.type === 'diceRoll') {
              shot = e.indirect ? { side: e.side, type: e.unitType, ff: 0 } : null;
              if (!shot) continue;
              bump(fs.shots, e.unitType);
              if (e.fogged) { fs.fogShots++; if (e.hit) fs.fogHits++; } else { fs.visShots++; if (e.hit) fs.visHits++; }
            } else if (shot && (e.type === 'damage' || e.type === 'splashDamage') && e.side === shot.side) {
              const k = `${roleOf(shot.side)}:${shot.type}`;   // 쏜 역할·병종별
              if (!shot.ff) bump(fs.ffShots, k);   // 아군 피해가 난 사격 1회
              shot.ff += e.amount; bump(fs.ffDamage, k, e.amount);
            } else if (e.type === 'captured' && e.side === ATT) {
              const c = fs.capture[e.objectiveId] || (fs.capture[e.objectiveId] = { games: 0, sum: 0, seen: null });
              if (c.seen !== i) { c.seen = i; c.games++; c.sum += st.round; }   // 판마다 처음 점령한 라운드
            }
            if (e.type === 'arrival' && e.unitType === 'mortar') fs.mortarSeen++;
            if (e.type === 'destroyed' && e.unitType === 'mortar') fs.mortarLost++;
          }
        }
        for (const a of actions) {
          for (const e of a.events) {
            if (e.type !== 'diceRoll') continue;
            bump(combat.attacksByType, e.unitType);
            if (e.movedAttack) bump(combat.moveAttacksByType, e.unitType);
            if (!e.targetType || e.fogged) continue;
            const pk = `${e.unitType}>${e.targetType}`;
            const pr = combat.pairs[pk] || (combat.pairs[pk] = { n: 0, chance: 0, moved: 0 });
            pr.n++; pr.chance += e.chance; if (e.movedAttack) pr.moved++;
            const ter = terrainAt(e.target.r, e.target.c).key;
            const tr = combat.terrain[ter] || (combat.terrain[ter] = { n: 0, raw: 0, chance: 0 });
            tr.n++; tr.raw += Math.max(GAME_CONFIG.COMBAT.minHit, Math.min(GAME_CONFIG.COMBAT.maxHit, e.raw)); tr.chance += e.chance;
            if (e.unitType === 'antitank' && GAME_CONFIG.UNIT_TYPES[e.targetType].isArmor) { combat.atVsArmor++; if (e.movedAttack) combat.atVsArmorMoved++; }
          }
        }
        // 공격 측 유닛이 처음 건너편 강변에 닿은 그 턴에 수비 측이 입은 피해 (이동 후 공격 규칙의 '도하 직후 공격' 영향)
        if (turnSide === ATK && !acrossSeen && st.units.some((u) => u.side === ATK && isAcross(ATK, u))) {
          acrossSeen = true;
          let dmg = 0;
          for (const a of actions) for (const e of a.events) if ((e.type === 'damage' || e.type === 'splashDamage') && e.side !== ATK) dmg += e.amount;
          cross.acrossDmgSum += dmg;
          cross.acrossGames++;
        }
        if (turnSide === ATK) {
          const crossedNow = st.units.filter((u) => onBankBefore.has(u.id) && !onOwnBank(ATK, u));
          if (crossedNow.length) {
            if (crossStart == null) { crossStart = st.round; measureArty = true; }
            const offBank = st.units.filter((u) => u.side === ATK && !onOwnBank(ATK, u));
            for (const u of crossedNow) {
              const d = Math.min(...offBank.filter((o) => o.id !== u.id).map((o) => manhattan(o, u)));
              if (isFinite(d)) { cross.gapSum += d; cross.gapCnt++; }
            }
          }
        } else if (measureArty) {
          measureArty = false;
          let dmg = 0;
          for (const a of actions) {
            if (a.unitType !== 'artillery') continue;
            for (const e of a.events) if ((e.type === 'damage' || e.type === 'splashDamage') && e.side === ATK) dmg += e.amount;
          }
          cross.artyDmgSum += dmg;
          cross.artyDmgGames++;
        }
        if (sym) for (const a of actions) symEvents(a.events);
        if (detail) for (const a of actions) for (const e of a.events) if (e.type === 'captured' && firstOwn[e.side] == null) firstOwn[e.side] = st.round;
        if (!firstCapture) {
          for (const a of actions) {
            const ev = a.events.find((e) => e.type === 'captured');
            if (ev) { firstCapture = { round: st.round, side: ev.side }; break; }
          }
        }
        if (st.winner) break;
        if (sym && st.turn === SIDES[1]) for (const o of st.objectives) { const k = SIDES.indexOf(o.owner); if (k >= 0) sym.held[o.id][k]++; }   // 라운드 끝 점유
        const tev = endTurn(st);
        if (sym) {
          symEvents(tev);
          if (!st.winner && RMAX > 3 && tev.some((e) => e.type === 'roundStart' && e.round === RMAX - 2)) { const lr = limitResultNow(st); lead11 = lr ? lr.winner : null; }
          for (const u of st.units) if (entered[u.id] == null && nearObj(u)) entered[u.id] = st.round;
        }
        if (detail) for (const e of tev) if (e.type === 'arrival') detail.arrivals[e.side]++;
        if (fs) for (const e of tev) if (e.type === 'arrival' && e.unitType === 'mortar') fs.mortarSeen++;
      }
      if (fs) {
        for (const s of SIDES) fs.lossSum[s] += sideTotalUnits(s) - (st.pending || []).filter((p) => p.side === s).length - st.units.filter((u) => u.side === s).length;
      }
      if (detail) {
        for (const s of SIDES) {
          if (firstOwn[s] != null) { detail.firstOwn[s].games++; detail.firstOwn[s].sum += firstOwn[s]; }
          detail.lossSum[s] += sideTotalUnits(s) - (st.pending || []).filter((p) => p.side === s).length - st.units.filter((u) => u.side === s).length;
        }
      }
      if (st.winner === 'draw') res.draws++;
      else res.wins[st.winner]++;
      if (!res.byReason[st.winReason]) res.byReason[st.winReason] = perSide(0);
      bump(res.byReason[st.winReason], st.winner);
      if (sym) {
        if (firstClash != null) { sym.clashSum += firstClash; sym.clashGames++; }
        if (st.round > 4) { sym.stallBase++; if (!clashLate) sym.stall++; }
        if (st.winner === SIDES[0]) sym.byMover.first++; else if (st.winner === SIDES[1]) sym.byMover.second++;
        if (lead11 != null) { sym.late.base++; if (lead11 !== st.winner) sym.late.flip++; }
        if (st.score) {   // 라운드 끝 누적 점수 (일찍 끝난 판은 마지막 값 유지)
          SIDES.forEach((x, k) => {
            let acc = 0;
            for (let r = 1; r <= RMAX; r++) { for (const g of st.scoreLog) if (g.side === x && g.round === r) acc += g.pts; sym.curve[k][r] += acc; }
          });
          sym.final[0] += st.score[SIDES[0]]; sym.final[1] += st.score[SIDES[1]]; sym.final[2] += Math.abs(st.score[SIDES[0]] - st.score[SIDES[1]]);
        }
      }
      const key = `${st.winner}:${st.winReason}`;
      res.reasons[key] = (res.reasons[key] || 0) + 1;
      roundSum += st.round;
      if (firstCapture) {
        res.firstCapture.games++;
        res.firstCapture.bySide[firstCapture.side]++;
        captureRoundSum += firstCapture.round;
      }
      for (const s of SIDES) survivorSum[s] += st.units.filter((u) => u.side === s).length;
      if (crossStart != null) { cross.games++; cross.startSum += crossStart; }
    } catch (e) {
      res.errors++;
      console.error(t('dev.gameError', { i }), e);
    }
  }

  const done = n - res.errors;
  for (const s of SIDES) {
    res.winRate[s] = done ? +((res.wins[s] / done) * 100).toFixed(1) : 0;
    res.avgSurvivors[s] = avg(survivorSum[s], done);
  }
  res.avgRounds = avg(roundSum, done) ?? 0;
  res.firstCapture.avgRound = avg(captureRoundSum, res.firstCapture.games);
  res.crossing = {
    games: cross.games,
    avgStartRound: avg(cross.startSum, cross.games),
    avgGap: avg(cross.gapSum, cross.gapCnt),
    avgArtyDamageAfter: avg(cross.artyDmgSum, cross.artyDmgGames),
    avgDefenderDamageOnArrival: avg(cross.acrossDmgSum, cross.acrossGames),   // 건너편 첫 도착 턴에 수비 측이 입은 피해
  };
  res.combat = {
    pairs: Object.fromEntries(Object.entries(combat.pairs).map(([k, v]) => [k, { n: v.n, avgChance: avg(v.chance, v.n), movedShare: avg(v.moved * 100, v.n) }])),
    terrain: Object.fromEntries(Object.entries(combat.terrain).map(([k, v]) => [k, { n: v.n, avgRaw: avg(v.raw, v.n), avgChance: avg(v.chance, v.n) }])),
    attacksByType: combat.attacksByType,
    moveAttacksByType: combat.moveAttacksByType,
    armorMoveAttackShare: avg((combat.moveAttacksByType.armor || 0) * 100, combat.attacksByType.armor || 0),
    antitankVsArmorPerGame: avg(combat.atVsArmor, done),
    antitankVsArmorMovedShare: avg(combat.atVsArmorMoved * 100, combat.atVsArmor),
  };
  res.illegalMoves = aiStats.illegal;
  if (fs) {
    const pct = (a, b) => (b ? +((a / b) * 100).toFixed(1) : null);
    res.fires = {
      shotsPerGame: Object.fromEntries(Object.entries(fs.shots).map(([k, v]) => [k, avg(v, done)])),
      ffShotsPerGame: Object.fromEntries(Object.entries(fs.ffShots).map(([k, v]) => [k, avg(v, done)])),   // 아군 피해가 난 간접 사격 수 (판당, '역할:병종')
      ffAvgDamage: Object.fromEntries(Object.entries(fs.ffShots).map(([k, v]) => [k, avg(fs.ffDamage[k], v)])),   // 그 사격 1회당 아군 피해 합
      fogShare: pct(fs.fogShots, fs.fogShots + fs.visShots), // 간접 사격 중 안개 속 칸 비율 (%)
      fogHitRate: pct(fs.fogHits, fs.fogShots),
      visHitRate: pct(fs.visHits, fs.visShots),
      avgLosses: Object.fromEntries(SIDES.map((s) => [s, avg(fs.lossSum[s], done)])),
      captureRound: Object.fromEntries(Object.entries(fs.capture).map(([k, v]) => [k, { games: v.games, avgRound: avg(v.sum, v.games) }])),
      mortarLostRate: pct(fs.mortarLost, fs.mortarSeen),
    };
  }
  if (sym) {
    const pct = (a, b) => (b ? +((a / b) * 100).toFixed(1) : null);
    res.sym = {
      firstMover: SIDES[0], secondMover: SIDES[1],
      firstWinRate: pct(sym.byMover.first, done), secondWinRate: pct(sym.byMover.second, done), drawRate: pct(res.draws || 0, done),
      avgFirstClashRound: avg(sym.clashSum, sym.clashGames), clashGames: sym.clashGames,
      flipsPerGame: Object.fromEntries(Object.entries(sym.flips).map(([k, v]) => [k, avg(v, done)])),   // 거점 주인 변경 (점유자 없음으로 바뀐 것 포함) 판당
      stallRate: pct(sym.stall, sym.stallBase), stallBase: sym.stallBase,   // 5라운드 이후까지 간 판 중 5라운드부터 교전이 한 번도 없던 판
      attacksByRound: sym.atk.slice(1).map((v) => avg(v, done)),           // 라운드 1~ : 판당 공격(직접·간접 주사위) 수
      lateFlipRate: pct(sym.late.flip, sym.late.base), lateBase: sym.late.base,   // 12라운드까지 간 판 중 11라운드 끝 판정과 최종 결과가 다른 판
      heldRounds: Object.fromEntries(Object.entries(sym.held).map(([k, v]) => [k, [avg(v[0], done), avg(v[1], done)]])),   // 거점별 라운드 끝 점유 라운드 수 [선공, 후공]
      ...(GAME_CONFIG.OBJECTIVE_POINTS ? {
        finalScore: [avg(sym.final[0], done), avg(sym.final[1], done)], avgScoreGap: avg(sym.final[2], done),
        scoreCurve: sym.curve.map((c) => c.slice(1).map((v) => avg(v, done))),   // [선공, 후공] 라운드 1~ 끝 누적 점수
      } : {}),
      bySide: Object.fromEntries(SIDES.map((x) => {
        const v = sym.side[x];
        const o = {
          indLossPerGame: avg(v.indLoss, done), indLossEarlyPerGame: avg(v.indLossEarly, done),
          artyShotsPerGame: avg(v.shots.artillery || 0, done), mortarShotsPerGame: avg(v.shots.mortar || 0, done),
          fogShotsPerGame: avg(v.fogShots, done), fogHitRate: pct(v.fogHits, v.fogShots), ffPerGame: avg(v.ff, done),
          nearKillsPerGame: avg(v.nearKills, done), avgRoundsToKill: avg(v.killRoundSum, v.killCnt), passivePerGame: avg(v.passive, done),
          lossPerGame: res.fires ? null : null,
        };
        delete o.lossPerGame;
        if (opts.timing && v.time.length) o.time = { avg: +(v.time.reduce((a, b) => a + b, 0) / v.time.length).toFixed(1), max: +Math.max(...v.time).toFixed(1) };
        return [x, o];
      })),
    };
  }
  if (Object.keys(actUse).length) {
    res.activation = Object.fromEntries(Object.entries(actUse).map(([role, v]) => [role, { avgUsed: avg(v.used, v.turns), useRate: avg(v.used * 100, v.limit) }]));
  }
  if (detail) {
    res.detail = {
      firstOwnRound: Object.fromEntries(SIDES.map((s) => [s, avg(detail.firstOwn[s].sum, detail.firstOwn[s].games)])),
      firstOwnGames: Object.fromEntries(SIDES.map((s) => [s, detail.firstOwn[s].games])),
      avgLosses: Object.fromEntries(SIDES.map((s) => [s, avg(detail.lossSum[s], done)])),
      avgArrivals: Object.fromEntries(SIDES.map((s) => [s, avg(detail.arrivals[s], done)])),
      total: Object.fromEntries(SIDES.map((s) => [s, sideTotalUnits(s)])),
    };
  }

  if (!opts.quiet) {
    const name = (s) => t(sideNameKey(s));
    const initial = perSide(0);
    for (const s of SIDES) initial[s] = sideTotalUnits(s);
    const lines = [];
    lines.push(t('dev.sim.head', { n, att: { t: sideNameKey(ATT) }, def: { t: sideNameKey(DEF) }, attAi: resolveProfile(diffs[ATT]).name, defAi: resolveProfile(diffs[DEF]).name, seed, err: res.errors }));
    lines.push(t('dev.sim.winRate'));
    for (const s of SIDES) lines.push(t('dev.sim.winRow', { side: name(s), rate: res.winRate[s], wins: res.wins[s] }));
    lines.push(t('dev.sim.reasons'));
    for (const [k, label] of Object.entries(SIM_REASON_LABELS)) {
      const row = res.byReason[k];
      const total = SIDES.reduce((t, s) => t + row[s], 0);
      const detail = SIDES.filter((s) => row[s]).map((s) => t('dev.sim.loss', { side: name(GAME_CONFIG.ROUND_ORDER.find((x) => x !== s)), n: row[s] })).join(', ');
      lines.push(t('dev.sim.reasonRow', { label, n: total, detail: detail ? ` (${detail})` : '' }));
    }
    lines.push(t('dev.sim.avgRounds', { n: res.avgRounds }));
    const fc = res.firstCapture;
    lines.push(t('dev.sim.firstCapture', { n: fc.avgRound ?? '-', games: fc.games, done }) +
      `${fc.games ? ', ' + SIDES.filter((s) => fc.bySide[s]).map((s) => `${name(s)} ${fc.bySide[s]}`).join(' / ') : ''})`);
    lines.push(t('dev.sim.survivors'));
    for (const s of SIDES) lines.push(`   ${name(s)}: ${res.avgSurvivors[s]} / ${initial[s]}`);
    console.log(lines.join('\n'));
  }
  return res;
}

/**
 * 전술 프로필 비교: 공격 측 AI 프로필만 바꿔 simulateGames(n) 을 돌리고 도하 지표를 표로 출력.
 * @param {number} n
 * @param {string[]} profiles  프로필 id 목록 (기본: 어려움 vs 어려움 - 산개전술)
 */
function compareTacticProfiles(n = 100, profiles = ['hard', 'hardSpread'], opts = {}) {
  const ATT = attackerSide(), DEF = sideByRole('def');
  const rows = profiles.map((id) => {
    const r = simulateGames(n, { ...opts, [ATT]: id, quiet: true });
    return {
      [t('dev.col.profile')]: resolveProfile(id).name,
      [t('dev.col.errors')]: r.errors,
      [t('dev.col.crossStart')]: r.crossing.avgStartRound,
      [t('dev.col.crossGap')]: r.crossing.avgGap,
      [t('dev.col.crossArty')]: r.crossing.avgArtyDamageAfter,
      [t('dev.col.endRound')]: r.avgRounds,
      [t('dev.col.crossGames')]: `${r.crossing.games}/${n - r.errors}`,
      _raw: r,
    };
  });
  console.log(t('dev.compare.head', { n, att: { t: sideNameKey(ATT) }, def: { t: sideNameKey(DEF) }, defAi: resolveProfile(opts[DEF] || opts.def || 'normal').name }));
  console.table(rows.map(({ _raw, ...rest }) => rest));
  return rows;
}

/** 밸런스 비교용 변형 목록. apply(config) 는 GAME_CONFIG 를 직접 수정 (실행 후 자동 복구) */
const SIM_VARIANTS = [
  { name: 'dev.var.base', apply: () => {} },
  { name: 'dev.var.sig10', apply: (C) => { C.COMBAT.signalBonus = 10; } },
  { name: 'dev.var.sig30', apply: (C) => { C.COMBAT.signalBonus = 30; } },
  { name: 'dev.var.range1', apply: (C) => { C.COMBAT.signalRange = 1; } },
  { name: 'dev.var.range3', apply: (C) => { C.COMBAT.signalRange = 3; } },
  { name: 'dev.var.obj2', apply: (C) => { const v = victoryCond(holdSide(), 'holdObjectives'); if (v) v.count = 2; C.OBJECTIVE_WIN_COUNT = 2; } },
  { name: 'dev.var.checkDef', apply: (C) => { C.OBJECTIVE_CHECK_AFTER = sideByRole('def'); } },
];

/** 상수를 잠시 바꿔 fn 을 실행한 뒤 원래대로 되돌림 */
function withConfig(apply, fn) {
  const backup = JSON.parse(JSON.stringify(GAME_CONFIG));
  try {
    apply(GAME_CONFIG);
    return fn();
  } finally {
    for (const k of Object.keys(backup)) GAME_CONFIG[k] = backup[k];
  }
}

/** 표 출력용: 역할별 진영과 전체 대비 손실 비율 */
function roleSidesAndLoss(r) {
  const D = sideByRole('def'), A = attackerSide();
  const total = { [D]: sideTotalUnits(D), [A]: sideTotalUnits(A) };
  const loss = (s) => Math.round(((total[s] - r.avgSurvivors[s]) / total[s]) * 100);
  return { D, A, loss };
}

/**
 * SIM_VARIANTS 각각에 대해 simulateGames(n) 을 돌리고 표로 출력.
 * 손실 비율 = 평균 잃은 유닛 수 / 전체 유닛 수 (예약 투입 포함)
 */
function simulateVariants(n = 100, opts = {}) {
  const variants = opts.variants || SIM_VARIANTS;
  const rows = [];
  for (const v of variants) {
    const row = withConfig(v.apply, () => {
      const r = simulateGames(n, { ...opts, quiet: true });
      const { D, A, loss } = roleSidesAndLoss(r);
      const br = r.byReason;
      const SP = { def: { t: sideNameKey(D) }, att: { t: sideNameKey(A) } };
      return {
        [t('dev.col.variant')]: t(v.name),
        [t('dev.col.defWin', SP)]: `${r.winRate[D]}%`,
        [t('dev.col.avgRounds')]: r.avgRounds,
        [t('dev.col.lossRatio', SP)]: `${loss(D)}% / ${loss(A)}%`,
        [t('dev.col.hq')]: br.hq[A] + br.hq[D],
        [t('dev.col.objectives')]: br.objectives[A],
        [t('dev.col.annihilation', SP)]: `${br.annihilation[A]} / ${br.annihilation[D]}`,
        [t('dev.col.survived')]: br.survived[D],
        [t('dev.col.errors')]: r.errors,
        _raw: r,
      };
    });
    rows.push(row);
  }
  if (!opts.quiet) {
    console.log(t('dev.variants.head', { n, def: { t: sideNameKey(sideByRole('def')) }, att: { t: sideNameKey(attackerSide()) } }));
    console.table(rows.map(({ _raw, ...rest }) => rest));
  }
  return rows;
}

/** 규칙 변경 비교용 설정 (ENABLE_MOVE_ATTACK, DICE_SIDES) */
const RULE_SETS = [
  { id: 'A', name: 'dev.rs.A', moveAttack: false, dice: 100 },
  { id: 'B', name: 'dev.rs.B', moveAttack: false, dice: 10 },
  { id: 'C', name: 'dev.rs.C', moveAttack: true, dice: 100 },
  { id: 'D', name: 'dev.rs.D', moveAttack: true, dice: 10 },
];

/**
 * 규칙 설정 A~D 각각에 대해 시드 고정 simulateGames(n) 을 돌려 표로 출력.
 * opts[진영id] 또는 opts.att/opts.def: 프로필 (기본 normal). 승률은 참고용 (목표치 아님)
 */
function simulateRuleSets(n = 100, opts = {}) {
  const PAIRS = [['infantry', 'infantry'], ['armor', 'infantry'], ['antitank', 'armor'], ['artillery', 'infantry']];
  const sets = opts.sets || RULE_SETS;
  const rows = sets.map((rs) => withConfig((C) => { C.ENABLE_MOVE_ATTACK = rs.moveAttack; C.DICE_SIDES = rs.dice; }, () => {
    const r = simulateGames(n, { ...opts, quiet: true });
    const { D, A, loss } = roleSidesAndLoss(r);
    const SP = { def: { t: sideNameKey(D) }, att: { t: sideNameKey(A) } };
    const br = r.byReason;
    const row = { [t('dev.col.ruleSet')]: t(rs.name) };
    for (const [a, d] of PAIRS) { const p = r.combat.pairs[`${a}>${d}`]; row[t('dev.col.pairHit', { a: { t: GAME_CONFIG.UNIT_TYPES[a].nameKey }, d: { t: GAME_CONFIG.UNIT_TYPES[d].nameKey } })] = p ? p.avgChance : '-'; }
    Object.assign(row, {
      [t('dev.col.endRound')]: r.avgRounds,
      [t('dev.col.loss', SP)]: `${loss(D)}% / ${loss(A)}%`,
      [t('dev.col.endings')]: `${br.hq[A] + br.hq[D]} / ${br.objectives[A]} / ${br.annihilation[A]}·${br.annihilation[D]} / ${br.survived[D]}`,
      [t('dev.col.armorMoveAtk')]: r.combat.armorMoveAttackShare ?? '-',
      [t('dev.col.arrivalDmg', SP)]: r.crossing.avgDefenderDamageOnArrival,
      [t('dev.col.crossArty')]: r.crossing.avgArtyDamageAfter,
      [t('dev.col.atVsArmor')]: r.combat.antitankVsArmorPerGame,
      [t('dev.col.defWin', SP)]: `${r.winRate[D]}%`,
      [t('dev.col.errors')]: r.errors,
      [t('dev.col.illegal')]: r.illegalMoves,
      _raw: r,
    });
    return row;
  }));
  if (!opts.quiet) {
    const D = sideByRole('def'), A = attackerSide();
    console.log(t('dev.rulesets.head', { n, att: { t: sideNameKey(A) }, def: { t: sideNameKey(D) }, attAi: resolveProfile(opts[A] || opts.att || 'normal').name, defAi: resolveProfile(opts[D] || opts.def || 'normal').name, seed: opts.seed ?? 20250625 }));
    console.table(rows.map(({ _raw, ...rest }) => rest));
  }
  return rows;
}

/* ---------- 시나리오 진단 (밸런스 조정용, 승률은 목표치가 아님) ---------- */
/** 호스토멜 변형: 시나리오 덮어쓰기(overrides)만 바꿈 (규칙·병종·AI 가중치는 그대로) */
const SCENARIO_VARIANTS = {
  hostomel: [
    { name: 'dev.hv.V0', overrides: null },
    { name: 'dev.hv.V1', overrides: { moveArrivals: [{ side: 'def', from: 5, to: 6 }, { side: 'def', from: 3, to: 4 }] } },
    { name: 'dev.hv.V2', overrides: { addDeployments: [{ round: 8, side: 'att', type: 'infantry', count: 2, cells: [[2, 7], [2, 6]] }] } },
    { name: 'dev.hv.V3', overrides: { addDeployments: [{ round: 5, side: 'att', type: 'infantry', count: 3, cells: [[3, 6], [7, 7], [11, 7]] }] } },
    { name: 'dev.hv.V4', overrides: { rounds: 10, moveArrivals: [{ side: 'att', from: 8, to: 7 }] } },
  ],
};

/**
 * 시나리오 변형별 시드 고정 simulateGames(n) 표.
 * 열: 공격/방어 승률, 평균 종료 라운드, 공격 측 첫 거점 소유 평균 라운드, 양쪽 평균 손실, 종료 원인별 횟수, 오류
 */
function diagnoseScenario(id = 'hostomel', n = 100, opts = {}) {
  const variants = opts.variants || SCENARIO_VARIANTS[id] || [{ name: 'dev.hv.V0', overrides: null }];
  const prev = GAME_CONFIG.SCENARIO_ID;
  const rows = [];
  try {
    for (const v of variants) {
      loadScenario(id, v.overrides);
      const A = attackerSide(), D = sideByRole('def');
      const SP = { def: { t: sideNameKey(D) }, att: { t: sideNameKey(A) } };
      const r = simulateGames(n, { ...opts, quiet: true, detail: true });
      const br = r.byReason;
      const ends = Object.keys(br).filter((k) => br[k][A] + br[k][D] > 0)
        .map((k) => `${t('dev.reason.' + k, { n: k === 'objectives' ? holdCount() : GAME_CONFIG.MAX_ROUNDS })} ${br[k][A]}/${br[k][D]}`).join(', ');
      rows.push({
        [t('dev.col.variant')]: t(v.name),
        [t('dev.col.winAD', SP)]: `${r.winRate[A]}% / ${r.winRate[D]}%`,
        [t('dev.col.avgRounds')]: r.avgRounds,
        [t('dev.col.firstHold', SP)]: r.detail.firstOwnRound[A] ?? '-',
        [t('dev.col.lossAD', SP)]: `${r.detail.avgLosses[A]}/${r.detail.total[A]} · ${r.detail.avgLosses[D]}/${r.detail.total[D]}`,
        [t('dev.col.endsAD', SP)]: ends,
        [t('dev.col.errors')]: r.errors,
        ...(opts.actColumn ? { [t('dev.col.actUse', SP)]: r.activation ? `${r.activation.att ? r.activation.att.useRate + '%' : '-'} / ${r.activation.def ? r.activation.def.useRate + '%' : '-'}` : '-' } : {}),
        _raw: r,
      });
    }
  } finally {
    loadScenario(prev);
  }
  if (!opts.quiet) {
    console.log(t('dev.diag.head', { id, n, seed: opts.seed ?? 20250625 }));
    console.log(t('dev.diag.note'));
    console.table(rows.map(({ _raw, ...rest }) => rest));
  }
  return rows;
}

/** 행동 제한 진단: 시나리오별 한도 조합 (def/att) */
/**
 * 간접 화력 진단 조합 (호스토멜). overrides 는 applyScenarioOverrides 형식 (fires 는 시나리오 값에 깊게 합침, null 이면 제거)
 *   A = v6 규칙 (fires 없음, 박격포 0) · C = 시나리오 기본값
 */
const FIRE_COMBOS = {
  A: { fires: null, counts: [{ side: 'att', type: 'mortar', count: 0 }] },
  B: { counts: [{ side: 'att', type: 'mortar', count: 0 }] },
  C: {},
  D: { counts: [{ side: 'att', type: 'mortar', count: 1 }] },
  E: { counts: [{ side: 'att', type: 'mortar', count: 3 }] },
  F: { fires: { mortar: { cooldown: 1 } } },
  G: { fires: { artillery: { cooldown: 0 } } },
  H: { fires: { blindFire: false } },
};
/** 조합별 simulateGames 결과 (같은 시드). 반환: { 조합: res } */
function diagnoseFires(n = 100, opts = {}) {
  const out = {};
  for (const [k, ov] of Object.entries(opts.combos || FIRE_COMBOS)) {
    out[k] = simulateGames(n, { quiet: true, ...opts, scenario: opts.scenario || 'hostomel', overrides: JSON.parse(JSON.stringify(ov)), fireStats: true });
  }
  return out;
}

/**
 * 점수제 진단 조합 (대칭 시나리오). pts = 거점 순서(시나리오 objectives)대로의 점수, old = 이전 방식(14라운드 끝 거점 수 판정)
 */
const SCORING_COMBOS = [
  { key: 'A', timing: 'ownTurnEnd', pts: [1, 2, 1], target: null },
  { key: 'B', timing: 'roundEnd', pts: [1, 2, 1], target: null },
  { key: 'C', timing: 'ownTurnEnd', pts: [1, 1, 1], target: null },
  { key: 'D', timing: 'ownTurnEnd', pts: [1, 3, 1], target: null },
  { key: 'E', timing: 'ownTurnEnd', pts: [1, 2, 1], target: 20 },
  { key: 'F', timing: 'ownTurnEnd', pts: [1, 2, 1], target: 28 },
  { key: 'OLD', old: true },
];
/** 조합 → simulateGames overrides (시나리오 데이터 값만 덮어씀) */
function scoringOverrides(k, scenarioId = 'symmetric') {
  const s = findScenario(scenarioId);
  if (k.old) {   // 이전 방식: 승리 조건만 거점 수 판정으로 (점수는 기록용으로 계속 쌓임)
    const victory = Object.fromEntries(Object.entries(s.victory).map(([side, list]) => [side, list.map((v) => (v.type === 'roundLimitPoints' ? { type: 'roundLimitScore' } : { ...v }))]));
    return { victory };
  }
  return { objectivePoints: Object.fromEntries(s.objectives.map((o, i) => [o.id, k.pts[i]])), scoreTiming: k.timing, scoreTarget: k.target };
}
/**
 * 점수제 진단: 조합마다 같은 시드로 simulateGames(n) (양쪽 같은 AI, 기본 보통). 숫자만 돌려줌 (추천 값 없음)
 */
function diagnoseScoring(n = 100, opts = {}) {
  const id = opts.scenario || 'symmetric', ai = opts.ai || 'normal';
  const out = {};
  for (const k of opts.combos || SCORING_COMBOS) {
    const r = simulateGames(n, { seed: opts.seed, quiet: true, scenario: id, overrides: scoringOverrides(k, id), def: ai, att: ai });
    out[k.key] = r;
  }
  return out;
}

const ACTIVATION_COMBOS = {
  hostomel: [null, { def: 4, att: 4 }, { def: 3, att: 4 }, { def: 4, att: 3 }, { def: 5, att: 5 }],
  chuncheon: [null, { def: 5, att: 6 }, { def: 4, att: 6 }, { def: 5, att: 5 }, { def: 4, att: 4 }],
};
/**
 * 행동 한도 조합별 simulateGames(n) 표 (보통 대 보통, 춘천은 공격 측 어려움-산개전술도 추가).
 * 시나리오 기본값·overrides 만 사용 (설정 메뉴와 localStorage 는 읽지 않음)
 */
function diagnoseActivations(n = 100, opts = {}) {
  const out = {};
  for (const id of opts.scenarios || Object.keys(ACTIVATION_COMBOS)) {
    const variants = ACTIVATION_COMBOS[id].map((a) => ({
      name: a ? t('dev.act.combo', { def: a.def, att: a.att }) : t('dev.act.none'),
      overrides: { activations: a },
    }));
    const profiles = id === 'chuncheon' ? ['normal', 'hardSpread'] : ['normal'];
    for (const p of profiles) {
      const rows = diagnoseScenario(id, n, { ...opts, quiet: true, actColumn: true, att: p, def: 'normal', variants });
      out[`${id} ${p}`] = rows;
      if (!opts.quiet) {
        console.log(t('dev.act.head', { id, n, att: resolveProfile(p).name, seed: opts.seed ?? 20250625 }));
        console.table(rows.map(({ _raw, ...rest }) => rest));
      }
    }
  }
  if (!opts.quiet) console.log(t('dev.diag.note2'));
  return out;
}

/** 대칭 시나리오 진단 조합: 행동 한도(양쪽 같음)와 후공 보너스 */
const SYMMETRIC_COMBOS = [
  { key: 'A', act: 5, bonus: 0 }, { key: 'B', act: 4, bonus: 0 }, { key: 'C', act: 6, bonus: 0 },
  { key: 'D', act: 5, bonus: 1 }, { key: 'E', act: 5, bonus: 2 },
];
/**
 * 대칭 시나리오 진단표: 조합마다 시드 고정 simulateGames(n) (양쪽 같은 AI 프로필, 기본 보통).
 * 선공/후공 승률·무승부, 승리 유형, 종료 라운드, 손실, 첫 교전 라운드, 거점 주인 변경, 간접 사격·포병 오사, 교착 비율.
 * AI끼리의 결과는 조합 사이 상대 비교용 (추천 값을 내지 않음)
 */
function diagnoseSymmetric(n = 100, opts = {}) {
  const id = opts.scenario || 'symmetric';
  const ai = opts.ai || 'normal';
  const rows = [];
  let first = null;
  for (const k of opts.combos || SYMMETRIC_COMBOS) {
    const r = simulateGames(n, { seed: opts.seed, quiet: true, scenario: id, overrides: { activations: { def: k.act, att: k.act }, secondMoverBonus: k.bonus }, def: ai, att: ai });
    const [F, S2] = [r.sym.firstMover, r.sym.secondMover];
    first = F;
    const done = r.games - r.errors;
    const pct = (v) => (done ? +((v / done) * 100).toFixed(1) : null);
    const by = (keys) => pct(keys.reduce((a, key) => a + Object.values(r.byReason[key] || {}).reduce((x, y) => x + y, 0), 0));
    rows.push({
      [t('dev.sym.col.combo')]: t('dev.sym.combo', { key: k.key, def: k.act, att: k.act, bonus: k.bonus }),
      [t('dev.sym.col.firstWin')]: r.sym.firstWinRate, [t('dev.sym.col.secondWin')]: r.sym.secondWinRate, [t('dev.sym.col.draw')]: r.sym.drawRate,
      [t('dev.sym.col.byObj')]: by(['objectives']), [t('dev.sym.col.byAnn')]: by(['annihilation']), [t('dev.sym.col.byLimit')]: by(['limitObjectives', 'limitHp', 'limitDraw']),
      [t('dev.sym.col.endRound')]: r.avgRounds,
      [t('dev.sym.col.loss')]: `${r.fires.avgLosses[F]} / ${r.fires.avgLosses[S2]}`,
      [t('dev.sym.col.firstClash')]: r.sym.avgFirstClashRound,
      [t('dev.sym.col.flips')]: Object.entries(r.sym.flipsPerGame).map(([o, v]) => `${o} ${v}`).join(' · '),
      [t('dev.sym.col.fires')]: `${r.fires.shotsPerGame.artillery ?? 0} / ${r.fires.shotsPerGame.mortar ?? 0}`,
      [t('dev.sym.col.ff')]: +Object.entries(r.fires.ffShotsPerGame).filter(([key]) => key.endsWith(':artillery')).reduce((a, [, v]) => a + v, 0).toFixed(2),
      [t('dev.sym.col.stall')]: r.sym.stallRate,
      [t('dev.sym.col.errors')]: r.errors,
      _raw: r,
    });
  }
  if (!opts.quiet) {
    console.log(t('dev.diag.note2'));
    console.log(t('dev.sym.head', { id, n, ai: resolveProfile(ai).name, seed: opts.seed ?? 20250625, first: { t: sideNameKey(first) } }));
    console.table(rows.map(({ _raw, ...rest }) => rest));
  }
  return rows;
}

/**
 * 대칭 AI 진단: 대결마다 AI 가 선공일 때와 후공일 때를 따로 simulateGames(n) (같은 시드).
 * matchups: [{ key, ai, foe }] (프로필: 'normal' 등 = 새 AI, 'v1:normal' = 기존 중립 AI, 'turtle' = 수비 봇)
 * 돌려주는 값: { [key]: { first: 결과, second: 결과 } } — 결과의 aiSide·foeSide 로 진영별 지표를 읽음. opts.clock 을 주면 계산 시간 포함
 */
function diagnoseSymmetricAI(n = 200, opts = {}) {
  const id = opts.scenario || 'symmetric';
  const matchups = opts.matchups || [
    { key: 'v1-turtle', ai: 'v1:normal', foe: 'turtle' }, { key: 'v2-turtle', ai: 'normal', foe: 'turtle' },
    { key: 'v2-v1', ai: 'normal', foe: 'v1:normal' }, { key: 'v2-v2', ai: 'normal', foe: 'normal' },
    { key: 'easy-turtle', ai: 'easy', foe: 'turtle' }, { key: 'hard-turtle', ai: 'hard', foe: 'turtle' },
  ];
  const out = {};
  const prev = GAME_CONFIG.SCENARIO_ID;
  loadScenario(id);
  const [F, S2] = GAME_CONFIG.ROUND_ORDER;
  loadScenario(prev);
  for (const m of matchups) {
    out[m.key] = {};
    for (const order of ['first', 'second']) {
      const aiSide = order === 'first' ? F : S2, foeSide = order === 'first' ? S2 : F;
      const r = simulateGames(n, { seed: opts.seed, quiet: true, scenario: id, [aiSide]: m.ai, [foeSide]: m.foe, timing: !!opts.clock, clock: opts.clock });
      r.aiSide = aiSide; r.foeSide = foeSide;
      out[m.key][order] = r;
      if (opts.onResult) opts.onResult(m, order, r);
    }
  }
  return out;
}

/* =========================== 11. 게임 기록 =========================== */
/** 끝난 게임의 요약 기록 (콘솔 출력/저장용). 손실 = 전장에 나온 유닛 중 잃은 수 (도착 대기 유닛 제외) */
function buildGameRecord(state, difficulty, mode = 'ai') {
  const C = GAME_CONFIG;
  const lost = (side) => sideTotalUnits(side) - (state.pending || []).filter((p) => p.side === side).length - state.units.filter((u) => u.side === side).length;
  const scoreSide = holdSide() || attackerSide();
  const rec = {
    scenarioId: C.SCENARIO_ID,
    rulesVersion: C.RULES_VERSION,
    diceType: `d${diceSides()}`,            // 'd10' 또는 'd100'
    moveAttack: !!C.ENABLE_MOVE_ATTACK,
    mode,                                   // 'ai' 또는 'hotseat' (언어와 무관한 코드값)
    difficulty: mode === 'ai' ? difficulty : null,   // 프로필 id (예: 'hardSpread')
    winner: state.winner,
    round: state.round,
    reason: state.winReason,
  };
  for (const s of C.ROUND_ORDER) rec[`${s}Losses`] = lost(s);   // 예: southLosses, northLosses (이전 기록과 같은 키)
  rec.objectivesCaptured = state.objectives.filter((o) => o.owner === scoreSide).length;   // 종료 시 공격 측 소유 거점 수
  rec.objectiveTimeline = (state.objTimeline || []).map((e) => ({ round: e.round, n: e.owned[scoreSide] || 0 }));   // 라운드별 공격 측 소유 거점 수
  // 행동 제한: 실제 적용된 역할별 한도 ({def, att}, 진영 값 null = 제한 없음 · 둘 다 없으면 null), 기본값에서 바꿨는지
  const lim = state.actApplied ? state.actApplied.limit : activationLimits(state);
  const norm = lim ? { def: Number.isInteger(lim.def) ? lim.def : null, att: Number.isInteger(lim.att) ? lim.att : null } : null;
  rec.activationLimit = norm && (norm.def != null || norm.att != null) ? norm : null;
  rec.activationCustom = !!(state.actApplied && state.actApplied.custom);
  rec.at = new Date().toISOString();
  return rec;
}

/** 묶음별 누적 기록 요약: { 묶음: {scenario, games, <진영>Wins, avgRound, avg<진영>Losses, avgObjectives} }. scenarioId 가 없는 예전 기록은 춘천 */
function summarizeGameRecords(records) {
  const out = {};
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  for (const [group, list] of Object.entries(records)) {
    if (!list.length) continue;
    const avg = (f) => +(list.reduce((s, r) => s + f(r), 0) / list.length).toFixed(2);
    const sides = [...new Set(list.flatMap((r) => Object.keys(r).filter((k) => /Losses$/.test(k)).map((k) => k.slice(0, -6))))];
    const row = { scenario: list[0].scenarioId || DEFAULT_SCENARIO_ID, games: list.length };
    for (const s of sides) row[`${s}Wins`] = list.filter((r) => r.winner === s).length;
    row.avgRound = avg((r) => r.round);
    for (const s of sides) row[`avg${cap(s)}Losses`] = avg((r) => r[`${s}Losses`] || 0);
    row.avgObjectives = avg((r) => r.objectivesCaptured);
    out[group] = row;
  }
  return out;
}

loadScenario(DEFAULT_SCENARIO_ID);
validateAllScenarios();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GAME_CONFIG, RULES, UNIT_TYPES, TERRAIN_TYPES, AI_CONFIG, SCENARIOS, loadScenario, validateScenario, listScenarios,
    createInitialState, startTurn, endTurn, getReachableTiles, getAttackableTiles, computeHitChance,
    resolveAttack, moveUnit, finishUnit, getVisibleTiles, checkVictory, aiTakeTurn, simulateGames, createSeededRng, cloneState,
    buildGameRecord, summarizeGameRecords, aiUpdatePlan, resolveProfile, listTacticProfiles, compareTacticProfiles,
    simulateRuleSets, withConfig, attackCost, moveAttackBlockReason, diagnoseScenario, pendingArrivals,
    diagnoseActivations, activationStatus, activationLimits, hasActivated, activationBlocked, scenarioNotes, sideTotalUnits,
    diagnoseSymmetric, diagnoseSymmetricAI, SYMMETRIC_COMBOS, symmetryErrors, updateObjectiveControl, objectiveCells, roundLimitResult, objectiveAt,
    roundLimitType, heldPoints, awardPoints, pointsLimitResult, limitResultNow, scoreTargetResult, diagnoseScoring, SCORING_COMBOS,
    diagnoseFires, FIRE_COMBOS, firesOf, fireRange, fireCooldown, onCooldown, cooldownTurnsLeft, blindFireAllowed,
  };
}
