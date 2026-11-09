/**
 * 엔진 단위 테스트: node tools/test.js  (Node 내장 node:test 만 사용, 외부 라이브러리 없음)
 *
 * 원칙: 수치(거점 수, 라운드 수, 증원 일정)는 시나리오 데이터에서 읽는다.
 *       밸런스를 바꿔도 테스트는 고치지 않는다. 판정 방식과 불변 조건만 검사한다.
 * 범위: 데이터 무결성 / 승리 판정 / 예약 투입 / 안개(AI 가 시야 밖 정보를 쓰지 않음) / 재현성 / 문구
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const loadEngine = require('./load-engine');

const { E, run, ROOT } = loadEngine({ quiet: true });
const C = () => E.GAME_CONFIG;
const SCEN_IDS = E.SCENARIOS.map((s) => s.id);
const other = (side) => C().ROUND_ORDER.find((s) => s !== side);
const cond = (side, type) => run(`victoryCond(${JSON.stringify(side)}, ${JSON.stringify(type)})`);
const fresh = (id) => { E.loadScenario(id); return E.createInitialState(); };
const seeded = (s) => ({ rng: E.createSeededRng(s), diceRng: E.createSeededRng((s ^ 0x5DEECE66) >>> 0) });

/* ---------------- 데이터 무결성 ---------------- */
for (const id of SCEN_IDS) {
  test(`[${id}] validateScenario 오류 없음`, () => {
    assert.deepEqual([...E.validateScenario(E.SCENARIOS.find((s) => s.id === id))], []);
  });
  test(`[${id}] 진영 id 첫 글자가 서로 다름 (유닛 id 접두어)`, () => {
    E.loadScenario(id);
    const first = C().ROUND_ORDER.map((s) => s[0].toUpperCase());
    assert.equal(new Set(first).size, first.length);
  });
  test(`[${id}] 시나리오의 문자열 키가 ko/en 모두에 있음`, () => {
    const keys = [];
    const walk = (o, k) => {
      if (typeof o === 'string') { if (/Key$/.test(k)) keys.push(o); return; }
      if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) walk(v, kk);
    };
    const s = E.SCENARIOS.find((x) => x.id === id);
    walk(s, '');
    for (const v of Object.values(s.terrainNames || {})) keys.push(v);
    const S = run('STRINGS');
    for (const k of keys) for (const lang of ['ko', 'en']) assert.ok(k in S[lang], `${lang}: ${k}`);
  });
}

/* ---------------- 승리 판정 ---------------- */
for (const id of SCEN_IDS) {
  test(`[${id}] holdObjectives: 데이터의 n개면 승리, n-1개면 아님, 라운드 끝 확인 시점에만`, (t) => {
    const st = fresh(id);
    const side = C().ROUND_ORDER.find((s) => cond(s, 'holdObjectives'));
    if (!side) return t.skip('거점 승리 조건 없음');
    const n = cond(side, 'holdObjectives').count;
    const give = (k) => st.objectives.forEach((o, i) => { o.owner = i < k ? side : other(side); });
    give(n);
    assert.deepEqual({ ...E.checkVictory(st, { objectives: true }) }, { winner: side, reason: 'objectives' });
    assert.equal(E.checkVictory(st, { objectives: false }), null, '확인 시점이 아니면 판정하지 않음');
    give(n - 1);
    assert.equal(E.checkVictory(st, { objectives: true }), null);
  });

  test(`[${id}] holdObjectives: endTurn 경로(확인 진영의 턴 끝)에서 승리`, (t) => {
    const st = fresh(id);
    const side = C().ROUND_ORDER.find((s) => cond(s, 'holdObjectives'));
    if (!side) return t.skip('거점 승리 조건 없음');
    const n = cond(side, 'holdObjectives').count;
    st.objectives.forEach((o, i) => { o.owner = i < n ? side : other(side); });
    st.turn = C().OBJECTIVE_CHECK_AFTER || C().ROUND_ORDER[C().ROUND_ORDER.length - 1];
    E.endTurn(st);
    assert.equal(st.winner, side);
    assert.equal(st.winReason, 'objectives');
  });

  test(`[${id}] surviveRounds: 데이터의 라운드에 도달하면 승리, 한 라운드 전은 아님`, (t) => {
    const st = fresh(id);
    const side = C().ROUND_ORDER.find((s) => cond(s, 'surviveRounds'));
    if (!side) return t.skip('버티기 조건 없음');
    const R = cond(side, 'surviveRounds').rounds;
    st.round = R - 1;
    assert.equal(E.checkVictory(st, { roundLimit: true }), null);
    st.round = R;
    assert.deepEqual({ ...E.checkVictory(st, { roundLimit: true }) }, { winner: side, reason: 'survived' });
  });

  test(`[${id}] annihilation: 도착 대기 유닛이 남으면 전멸 아님, 모두 없으면 전멸`, () => {
    for (const loser of C().ROUND_ORDER) {
      const st = fresh(id);
      const winner = other(loser);
      st.units = st.units.filter((u) => u.side !== loser);
      const hasPending = st.pending.some((p) => p.side === loser);
      if (hasPending) assert.equal(E.checkVictory(st), null, `${loser}: 대기 유닛이 있는데 전멸 판정`);
      st.pending = st.pending.filter((p) => p.side !== loser);
      const v = E.checkVictory(st);
      if (cond(winner, 'annihilation')) assert.deepEqual({ ...v }, { winner, reason: 'annihilation' });
    }
  });

  test(`[${id}] enterHQ: 상대 본부 칸에 서면 승리`, (t) => {
    const st = fresh(id);
    const side = C().ROUND_ORDER.find((s) => cond(s, 'enterHQ') && C().HQ[other(s)]);
    if (!side) return t.skip('본부 진입 조건 없음');
    const hq = C().HQ[other(side)];
    st.units = st.units.filter((u) => !(u.r === hq.r && u.c === hq.c));
    const u = st.units.find((x) => x.side === side);
    u.r = hq.r; u.c = hq.c;
    assert.deepEqual({ ...E.checkVictory(st) }, { winner: side, reason: 'hq' });
  });
}

/* ---------------- 예약 투입 ---------------- */
for (const id of SCEN_IDS) {
  test(`[${id}] 예약 투입: 데이터의 라운드에 데이터의 수만큼 도착, 본부·남의 거점 칸 금지`, (t) => {
    const st = fresh(id);
    if (!C().REINFORCEMENTS.length) return t.skip('예약 투입 없음');
    const expect = {};
    for (const g of C().REINFORCEMENTS) expect[`${g.side}@${g.round}`] = (expect[`${g.side}@${g.round}`] || 0) + g.count;
    const got = {};
    const lastRound = Math.max(...C().REINFORCEMENTS.map((g) => g.round));
    for (let r = 1; r <= lastRound; r++) {
      for (const side of C().ROUND_ORDER) {
        st.round = r; st.turn = side;
        for (const ev of E.startTurn(st)) {
          if (ev.type !== 'arrival') continue;
          got[`${ev.side}@${r}`] = (got[`${ev.side}@${r}`] || 0) + 1;
          assert.equal(ev.side, side, '자기 턴에만 도착');
          for (const s of C().ROUND_ORDER) {
            const hq = C().HQ[s];
            assert.ok(!(hq && hq.r === ev.pos.r && hq.c === ev.pos.c), '본부 칸에 도착');
          }
          const o = st.objectives.find((x) => x.r === ev.pos.r && x.c === ev.pos.c);
          assert.ok(!o || o.owner === side, '남의 거점 칸에 도착');
        }
      }
    }
    assert.deepEqual(got, expect);
    assert.equal(st.pending.length, 0);
  });

  test(`[${id}] pendingArrivals 는 그 진영 자신의 일정만`, () => {
    const st = fresh(id);
    for (const side of C().ROUND_ORDER) {
      const sum = E.pendingArrivals(st, side).reduce((a, x) => a + x.count, 0);
      assert.equal(sum, st.pending.filter((p) => p.side === side).length);
    }
  });
}

/* ---------------- 안개: AI 는 시야 밖 정보를 쓰지 않는다 ---------------- */
function aiActions(st, side, seed) {
  const { rng, diceRng } = seeded(seed);
  return JSON.stringify(E.aiTakeTurn(E.cloneState(st), side, rng, 'normal', { recordSnapshots: false, diceRng }));
}
/** 시드 고정으로 몇 턴 진행한 중반 상태들 (진영별 턴 시작 시점) */
function midStates(id, maxTurns = 12) {
  const st = fresh(id);
  const { rng, diceRng } = seeded(424242);
  E.startTurn(st);
  const out = [];
  for (let i = 0; i < maxTurns && !st.winner; i++) {
    out.push(E.cloneState(st));
    E.aiTakeTurn(st, st.turn, rng, 'normal', { recordSnapshots: false, diceRng });
    if (!st.winner) E.endTurn(st);
  }
  return out;
}
const seenBy = (st, side) => {
  const vis = E.getVisibleTiles(st, side);
  const N = C().MAP.length;
  return (u) => vis.has(u.r * N + u.c) || (st.memory[side] && st.memory[side][u.id]);
};

for (const id of SCEN_IDS) {
  test(`[${id}] 상대의 증원 일정을 바꿔도 AI 행동이 같음`, () => {
    let checked = 0;
    for (const st of midStates(id)) {
      const side = st.turn;
      if (!st.pending.some((p) => p.side !== side)) continue;
      const alt = E.cloneState(st);
      for (const p of alt.pending) if (p.side !== side) p.round += 3;
      assert.equal(aiActions(alt, side, 7), aiActions(st, side, 7), `round ${st.round} ${side}`);
      checked++;
    }
    if (!checked) assert.ok(true, '상대 대기 유닛이 있는 상태 없음');
  });

  // 턴 도중 이동으로 새로 보게 된 적은 써도 되므로, "그 턴 내내 한 번도 보지 못한 적"만 바꾼다
  // (updateMemory 는 본 적을 모두 memory 에 남기므로, 턴이 끝난 뒤에도 memory 에 없으면 끝까지 못 본 것)
  test(`[${id}] 그 턴 내내 보지 못한 적 유닛의 체력을 바꿔도 AI 행동이 같음`, () => {
    let checked = 0;
    for (const st of midStates(id)) {
      const side = st.turn;
      const after = E.cloneState(st);
      const { rng, diceRng } = seeded(11);
      E.aiTakeTurn(after, side, rng, 'normal', { recordSnapshots: false, diceRng });
      const known = seenBy(st, side), knownAfter = seenBy(after, side);
      const hidden = st.units.filter((u) => u.side !== side && !known(u) && !knownAfter(u));
      if (!hidden.length) continue;
      const alt = E.cloneState(st);
      for (const u of alt.units) if (hidden.some((h) => h.id === u.id)) u.hp = 1;
      assert.equal(aiActions(alt, side, 11), aiActions(st, side, 11), `round ${st.round} ${side}`);
      checked++;
    }
    assert.ok(checked > 0, '시야 밖 적이 있는 상태를 찾지 못함');
  });
}

/* ---------------- 재현성 (서버·브라우저가 같은 결과를 내야 함) ---------------- */
test('같은 시드면 simulateGames 결과가 같고, 시뮬레이션은 Math.random 을 쓰지 않음', () => {
  E.loadScenario(SCEN_IDS[0]);
  const a = JSON.stringify(E.simulateGames(3));
  run('globalThis.__rand = Math.random; Math.random = () => { throw new Error("Math.random used"); }');
  try {
    for (const id of SCEN_IDS) { E.loadScenario(id); E.simulateGames(2); }
    E.loadScenario(SCEN_IDS[0]);
    assert.equal(JSON.stringify(E.simulateGames(3)), a);
  } finally { run('Math.random = globalThis.__rand'); }
});

/* ---------------- 문구 ---------------- */
test('STRINGS.ko 와 STRINGS.en 의 키가 같음', () => {
  const S = run('STRINGS');
  const ko = Object.keys(S.ko), en = new Set(Object.keys(S.en));
  assert.deepEqual(ko.filter((k) => !en.has(k)), [], 'en 에 없는 키');
  const koSet = new Set(ko);
  assert.deepEqual([...en].filter((k) => !koSet.has(k)), [], 'ko 에 없는 키');
});

/**
 * JS 소스에서 주석·정규식을 건너뛰고 문자열 리터럴과 줄 번호를 모음.
 * 템플릿 리터럴은 고정 부분만 모으고 ${ } 안은 코드로 다시 읽는다 (중첩 허용).
 */
function stringLiterals(src) {
  const out = [];
  const n = src.length;
  let i = 0, line = 1, prev = '';   // prev: 직전의 의미 있는 문자 (정규식/나눗셈 구분용)
  const REGEX_BEFORE = '(,=:[!&|?{};+-*%<>~^';
  const braces = [];                // 코드 안의 { 깊이. 템플릿 ${ 에서 들어오면 'T' 를 쌓음
  const adv = () => { if (src[i] === '\n') line++; i++; };

  function readQuoted(q) {
    const startLine = line; let s = ''; i++;
    while (i < n && src[i] !== q) { if (src[i] === '\\') { s += src[i + 1]; adv(); adv(); continue; } s += src[i]; adv(); }
    i++;
    out.push({ s, line: startLine });
  }
  function readTemplate() {          // ` 다음부터. 끝(`) 또는 ${ 에서 멈춤
    let startLine = line, s = '';
    while (i < n) {
      if (src[i] === '\\') { s += src[i + 1]; adv(); adv(); continue; }
      if (src[i] === '`') { i++; out.push({ s, line: startLine }); return; }
      if (src[i] === '$' && src[i + 1] === '{') { out.push({ s, line: startLine }); i += 2; braces.push('T'); return; }
      s += src[i]; adv();
    }
  }
  while (i < n) {
    const ch = src[i], nx = src[i + 1];
    if (/\s/.test(ch)) { adv(); continue; }
    if (ch === '/' && nx === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '/' && nx === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) adv(); i += 2; continue; }
    if (ch === '"' || ch === "'") { readQuoted(ch); prev = 'x'; continue; }
    if (ch === '`') { i++; readTemplate(); prev = 'x'; continue; }
    if (ch === '/' && (prev === '' || REGEX_BEFORE.includes(prev) || /(return|typeof|case)$/.test(src.slice(Math.max(0, i - 8), i).trimEnd()))) {
      i++; let cls = false;
      while (i < n && (cls || src[i] !== '/') && src[i] !== '\n') { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; }
      i++; while (/[a-z]/i.test(src[i] || '')) i++;
      prev = 'x'; continue;
    }
    if (ch === '{') braces.push('{');
    if (ch === '}') { if (braces.pop() === 'T') { i++; readTemplate(); prev = 'x'; continue; } }
    prev = ch; i++;
  }
  return out;
}

test('한글 문자열 리터럴은 STRINGS.ko 안에만 있음 (주석 제외)', () => {
  const HANGUL = /[ㄱ-ㆎ가-힣]/;
  const files = ['js/strings.js', 'js/rules.js', 'js/ai-config.js', 'js/engine.js', 'js/ui.js',
    ...fs.readdirSync(path.join(ROOT, 'js/scenarios')).map((f) => `js/scenarios/${f}`)];
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    let range = null;
    if (f === 'js/strings.js') {
      const lines = src.split('\n');
      const a = lines.findIndex((l) => /^\s{2}ko:\s*\{/.test(l)) + 1;
      const b = lines.findIndex((l) => /^\s{2}en:\s*\{/.test(l)) + 1;
      range = [a, b];
    }
    for (const { s, line } of stringLiterals(src)) {
      if (!HANGUL.test(s)) continue;
      if (range && line > range[0] && line < range[1]) continue;
      bad.push(`${f}:${line} ${s.slice(0, 30)}`);
    }
  }
  assert.deepEqual(bad, []);
});

/* ---------------- 행동 제한 (rulesVersion 6) ---------------- */
// 한도 1~2 로 줄여 판정만 확인 (수치는 overrides 로 주고 시나리오 값은 건드리지 않음)
const actFresh = (id, act) => {
  E.loadScenario(id, act === undefined ? null : { activations: act });
  const st = E.createInitialState();
  E.startTurn(st);
  return st;
};
const movable = (st) => st.units.filter((u) => u.side === st.turn && E.getReachableTiles(st, u.id).length);
const firstMove = (st, u) => E.getReachableTiles(st, u.id)[0];

for (const id of SCEN_IDS) {
  test(`[${id}] 행동 제한: 한도 도달 후 미행동 유닛은 이동·공격 불가, 이미 행동한 유닛은 계속 가능`, () => {
    const st = actFresh(id, { def: 1, att: 1 });
    const [a, b] = movable(st);
    assert.ok(a && b, '이동 가능한 유닛 2기 필요');
    assert.deepEqual({ ...E.activationStatus(st, st.turn) }, { limit: 1, used: 0, left: 1 });
    E.moveUnit(st, a.id, firstMove(st, a));
    assert.equal(st.act.used, 1);
    assert.ok(E.hasActivated(st, a));
    assert.equal(E.getReachableTiles(st, b.id).length, 0, '미행동 유닛 이동 불가');
    assert.equal(E.getAttackableTiles(st, b.id).length, 0, '미행동 유닛 공격 불가');
    assert.equal(run('canUnitAttack')(st, b), false);
    // 이미 행동한 유닛: 이동 후 공격 판정은 기존 규칙 그대로 (한도와 무관)
    const ua = E.getUnit ? E.getUnit(st, a.id) : st.units.find((u) => u.id === a.id);
    assert.equal(run('canUnitAttack')(st, ua), run('canUnitAttack')({ ...st, act: undefined }, ua));
    E.finishUnit(st, b.id);   // 대기는 소모 없음
    assert.equal(st.act.used, 1);
  });

  test(`[${id}] 행동 제한: 이동 → 공격은 1회, 턴 시작 시 초기화, 상대 진영 현황은 돌려주지 않음`, () => {
    const st = actFresh(id, { def: 2, att: 2 });
    const side = st.turn;
    const [a] = movable(st);
    E.moveUnit(st, a.id, firstMove(st, a));
    assert.ok(st.act.ids.includes(a.id));
    // 같은 유닛의 공격은 추가 소모 없음 (noteActivation 직접 확인)
    run('noteActivation')(st, st.units.find((u) => u.id === a.id));
    assert.equal(st.act.used, 1);
    assert.equal(E.activationStatus(st, other(side)), null, '상대 진영 현황은 null');
    E.endTurn(st);
    assert.equal(st.act.side, other(side));
    assert.equal(st.act.used, 0);
    E.endTurn(st);
    assert.equal(st.act.side, side);
    assert.equal(st.act.used, 0, '다음 자기 턴에 0으로 초기화');
  });

  test(`[${id}] 행동 제한: 유닛 수가 한도보다 적으면 전원 행동, 증원 도착 후에도 한도 불변`, () => {
    const big = 99;
    const st = actFresh(id, { def: big, att: big });
    for (const u of movable(st)) { const m = firstMove(st, u); if (m && E.getReachableTiles(st, u.id).some((x) => x.r === m.r && x.c === m.c)) E.moveUnit(st, u.id, m); }
    assert.ok(st.act.used <= big);
    for (let k = 0; k < 2 * C().MAX_ROUNDS && !st.winner; k++) { E.endTurn(st); assert.equal(st.act.limit, big); }
  });

  test(`[${id}] 행동 제한: activations null 또는 플래그 꺼짐이면 state.act 없음`, () => {
    let st = actFresh(id, null);
    assert.equal(st.act, undefined);
    C().ENABLE_ACTIVATION_LIMIT = false;
    try { st = actFresh(id); assert.equal(st.act, undefined); } finally { C().ENABLE_ACTIVATION_LIMIT = true; }
    st = actFresh(id);
    assert.ok(st.act, '시나리오 기본값이 있으면 적용');
  });

  test(`[${id}] 행동 제한: AI 턴이 한도를 넘지 않고 오류 없이 끝까지 진행`, () => {
    const st = actFresh(id, { def: 2, att: 3 });
    const { rng, diceRng } = seeded(7);
    let guard = 0;
    while (!st.winner && guard++ < 200) {
      const side = st.turn;
      const acts = E.aiTakeTurn(st, side, rng, 'normal', { recordSnapshots: false, diceRng });
      assert.ok(st.act.used <= st.act.limit);
      const moved = new Set(acts.filter((x) => x.events.some((e) => e.type === 'move' || e.type === 'diceRoll')).map((x) => x.unitId));
      assert.ok(moved.size <= st.act.limit, `행동 유닛 ${moved.size} > 한도 ${st.act.limit}`);
      if (!st.winner) E.endTurn(st);
    }
    assert.ok(st.winner);
  });
}

test('validateScenario: activations 형식 검사', () => {
  const base = JSON.parse(JSON.stringify(E.SCENARIOS[0]));
  for (const bad of [{ def: 0, att: 3 }, { def: 2.5, att: 3 }, { def: 2 }, { foo: 1, def: 1, att: 1 }]) {
    assert.ok(E.validateScenario({ ...base, activations: bad }).length > 0, JSON.stringify(bad));
  }
  assert.deepEqual([...E.validateScenario({ ...base, activations: null })], []);
  assert.deepEqual([...E.validateScenario({ ...base, activations: { def: 99, att: 99 } })], [], '유닛 수보다 큰 한도는 오류가 아님');
  assert.ok(E.scenarioNotes({ ...base, activations: { def: 99, att: 99 } }).length === 2, '정보성 안내');
});
