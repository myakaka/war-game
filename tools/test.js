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

const { E, run, ctx, ROOT } = loadEngine({ quiet: true });
const C = () => E.GAME_CONFIG;
const SCEN_IDS = E.SCENARIOS.map((s) => s.id);
/** AI 가 실제로 두는 시나리오 (튜토리얼 실습판은 AI 가 움직이지 않으므로 AI 안개 시험에서 뺌. 연습 판은 포함) */
const AI_SCEN_IDS = E.SCENARIOS.filter((s) => !s.tutorialSteps).map((s) => s.id);
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
    // 상대도 거점 승리 조건이 있으면(대칭 시나리오) 나머지는 점유자 없음
    const rest = cond(other(side), 'holdObjectives') ? null : other(side);
    const give = (k) => st.objectives.forEach((o, i) => { o.owner = i < k ? side : rest; });
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

for (const id of AI_SCEN_IDS) {
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
      // 판단(유닛·이동·표적)이 같아야 한다. 포병 파편이 시야 밖 적을 맞히면 그 적의 체력에 따라 결과(격파/후퇴)가 실제로 갈리고,
      // 그 뒤의 판단은 그 결과를 본 뒤라 달라질 수 있으므로 결과가 처음 갈리는 행동까지만 비교한다.
      const dec = (x) => JSON.parse(aiActions(x, side, 11)).map((a) => ({ a: { unitId: a.unitId, from: a.from, to: a.to, target: a.target }, ev: JSON.stringify(a.events) }));
      const A = dec(st), B = dec(alt);
      for (let i = 0; i < Math.min(A.length, B.length); i++) {
        assert.deepEqual(B[i].a, A[i].a, `round ${st.round} ${side} 행동 ${i}`);
        if (A[i].ev !== B[i].ev) break;   // 실제 결과가 갈림 (시야 밖 유닛이 맞음)
      }
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

/* ---------------- 간접 화력 (규칙 v7, 시나리오 fires) ---------------- */
// 화면 검증과 같은 방식으로 상태를 직접 놓고 판정만 확인 (수치는 시나리오·병종 데이터에서 읽음)
function firesState(id = 'hostomel') {
  E.loadScenario(id);
  const st = E.createInitialState();
  E.startTurn(st);
  return st;
}
const put = (st, u) => { st.units.push({ moved: false, acted: false, hp: C().MAX_HP, ...u }); return st.units[st.units.length - 1]; };
const clearAround = (st, keep) => { st.units = st.units.filter((u) => keep.includes(u.id)); };

test('fires: 춘천에는 간접 화력 설정이 없고 포병 사거리·쿨다운이 v6 그대로', () => {
  const st = firesState('chuncheon');
  assert.equal(C().FIRES, null);
  const a = st.units.find((u) => u.type === 'artillery' && u.side === st.turn);
  const R = E.fireRange(st, a.side, 'artillery');
  assert.equal(JSON.stringify(R), JSON.stringify({ min: C().UNIT_TYPES.artillery.rangeMin, max: C().UNIT_TYPES.artillery.rangeMax }));
  assert.equal(E.fireCooldown(st, a), 0);
  assert.ok(E.blindFireAllowed(st, a.side), 'v6: 포병은 사거리 안 모든 칸 (안개 속 포함)');
});

test('fires: 안개 속 칸 사격 가능, 시야 밖 감점은 진영 시야 기준 (쏘는 유닛이 못 봐도 아군이 보면 감점 없음)', () => {
  const st = firesState();
  const side = st.turn, F = C().FIRES;
  const a = st.units.find((u) => u.side === side && u.type === 'artillery');
  clearAround(st, [a.id]);
  const far = { r: a.r - F.artillery.range, c: a.c };   // 포병 시야(1) 밖
  const e = put(st, { id: 'A90', side: other(side), type: 'infantry', r: far.r, c: far.c });
  assert.ok(E.getAttackableTiles(st, a.id).some((p) => p.r === far.r && p.c === far.c), '안개 속 칸도 목표');
  let hc = E.computeHitChance(st, a.id, far);
  assert.ok(hc.fogged && hc.parts.some((x) => x.key === 'fog' && x.value === C().COMBAT.fogPenalty));
  put(st, { id: 'D90', side, type: 'recon', r: far.r + 1, c: far.c });   // 아군 정찰이 관측
  hc = E.computeHitChance(st, a.id, far);
  assert.ok(!hc.fogged && !hc.parts.some((x) => x.key === 'fog'));
  assert.ok(e);
});

test('fires: blindFire=false 면 간접 화력은 진영 시야 안 칸만', () => {
  E.loadScenario('hostomel', { fires: { blindFire: false } });
  const st = E.createInitialState(); E.startTurn(st);
  const a = st.units.find((u) => u.side === st.turn && u.type === 'artillery');
  const vis = E.getVisibleTiles(st, a.side);
  const list = E.getAttackableTiles(st, a.id);
  assert.ok(list.length > 0 && list.every((p) => vis.has(p.r * C().MAP.length + p.c)));
  E.loadScenario('hostomel');
});

test('fires: 포병은 쏜 뒤 자기 진영의 다음 턴에 사격 불가·이동 가능, 그다음 턴에 다시 가능 (인접 4칸 피해 유지)', () => {
  const st = firesState();
  const side = st.turn, cd = C().FIRES.artillery.cooldown;
  assert.equal(cd, 1);
  const a = st.units.find((u) => u.side === side && u.type === 'artillery');
  clearAround(st, [a.id]);
  const tgt = { r: a.r - 2, c: a.c };
  const e = put(st, { id: 'A91', side: other(side), type: 'infantry', r: tgt.r, c: tgt.c });
  const f = put(st, { id: 'D91', side, type: 'infantry', r: tgt.r, c: tgt.c + 1 });   // 인접 아군 (오폭 대상)
  const ev = E.resolveAttack(st, a.id, tgt, () => 0);   // 주사위 최솟값 = 명중
  assert.ok(ev.some((x) => x.type === 'splashDamage' && x.unitId === f.id), '인접 아군도 피해');
  assert.ok(ev.some((x) => x.type === 'damage' && x.unitId === e.id));
  assert.equal(a.lastFiredRound, st.round);
  E.endTurn(st); E.endTurn(st);   // 상대 턴 → 다음 자기 턴
  assert.equal(st.turn, side);
  assert.equal(E.onCooldown(st, a), true);
  assert.equal(E.getAttackableTiles(st, a.id).length, 0);
  assert.ok(E.getReachableTiles(st, a.id).length > 0, '쿨다운 중에도 이동 가능');
  assert.equal(E.cooldownTurnsLeft(st, a), 1);
  E.endTurn(st); E.endTurn(st);
  assert.equal(E.onCooldown(st, a), false);
  assert.ok(E.getAttackableTiles(st, a.id).length > 0);
});

test('fires: 박격포는 이동 후 사격 가능, 한 칸만 고정 피해, 행동 1회', () => {
  const st = firesState();
  E.endTurn(st);   // 공격군 턴 (1라운드 투입)
  const side = st.turn;
  const m = st.units.find((u) => u.side === side && u.type === 'mortar');
  assert.ok(m, '박격포 투입');
  clearAround(st, [m.id]);
  const T = C().UNIT_TYPES.mortar;
  const reach = E.getReachableTiles(st, m.id).find((p) => p.remaining >= E.attackCost('mortar'));
  E.moveUnit(st, m.id, reach);
  const tgt = { r: m.r, c: m.c - 2 };
  const e = put(st, { id: 'D92', side: other(side), type: 'armor', r: tgt.r, c: tgt.c });
  const nb = put(st, { id: 'D93', side: other(side), type: 'infantry', r: tgt.r + 1, c: tgt.c });
  put(st, { id: 'A92', side, type: 'recon', r: tgt.r, c: tgt.c + 1 });   // 관측
  const hc = E.computeHitChance(st, m.id, tgt);
  assert.ok(hc.movedAttack && hc.parts.some((x) => x.key === 'moved'));
  assert.equal(hc.damage, T.fixedDamage);
  const used = st.act ? st.act.used : null;
  const ev = E.resolveAttack(st, m.id, tgt, () => 0);
  assert.ok(ev.some((x) => x.type === 'damage' && x.unitId === e.id && x.amount === T.fixedDamage));
  assert.ok(!ev.some((x) => x.type === 'splashDamage'), '인접 칸 피해 없음');
  assert.equal(nb.hp, C().MAX_HP);
  if (used != null) assert.equal(st.act.used, used, '이동 후 공격은 합쳐서 1회');
});

test('fires: 설정 메뉴 값(state.firesOv)은 그 진영의 다음 턴부터 적용', () => {
  const st = firesState();
  st.firesOv = { artillery: { range: 7, cooldown: 0 } };
  const side = st.turn;
  assert.equal(E.fireRange(st, side, 'artillery').max, C().FIRES.artillery.range, '이번 턴은 그대로');
  E.endTurn(st);
  assert.equal(E.fireRange(st, side, 'artillery').max, C().FIRES.artillery.range, '상대 턴에도 그대로');
  E.endTurn(st);
  assert.equal(E.fireRange(st, side, 'artillery').max, 7);
  assert.equal(E.firesOf(st, side).blindFire, C().FIRES.blindFire, '안개 속 사격 여부는 시나리오 값');
});

test('fires: AI 는 간접 화력으로 보이는 칸의 적만 쏨 (선택 시점 기준, 쿨다운 준수)', () => {
  E.loadScenario('hostomel');
  for (let g = 0; g < 6; g++) {
    const { rng, diceRng } = seeded(4242 + g * 31);
    const st = E.createInitialState(); E.startTurn(st);
    let guard = 0;
    while (!st.winner && guard++ < 60) {
      const side = st.turn;
      const before = E.cloneState(st);
      const acts = E.aiTakeTurn(st, side, rng, 'normal', { recordSnapshots: true, diceRng });
      acts.forEach((a, k) => {
        if (!a.target || !C().UNIT_TYPES[a.unitType].indirect) return;
        assert.equal(a.target.kind, 'visible', '추측·대포병 사격 없음');
        const ref = k ? acts[k - 1].snapshot : before;   // 목표를 고른 시점 = 직전 행동이 끝난 상태
        const vis = E.getVisibleTiles(ref, side);
        assert.ok(vis.has(a.target.r * C().MAP.length + a.target.c), '고를 때 보이던 칸');
        const u = ref.units.find((x) => x.id === a.unitId);
        assert.ok(!E.onCooldown(ref, u), '쿨다운 중에는 사격하지 않음');
      });
      if (!st.winner) E.endTurn(st);
    }
  }
});

test('validateScenario: fires 형식 검사', () => {
  const base = JSON.parse(JSON.stringify(E.SCENARIOS.find((s) => s.id === 'hostomel')));
  for (const bad of [{ blindFire: 1 }, { mortar: { range: -1 } }, { mortar: { cooldown: 0.5 } }, { infantry: { range: 2 } }, { artillery: { range: 1 } }, { mortar: { foo: 1 } }]) {
    assert.ok(E.validateScenario({ ...base, fires: bad }).length > 0, JSON.stringify(bad));
  }
  assert.deepEqual([...E.validateScenario({ ...base, fires: { blindFire: false, mortar: { range: 3, cooldown: 2, indirectPenalty: 20 } } })], []);
});

/* ---------------- 대칭 시나리오 (symmetric: true) ---------------- */
const SYM = () => JSON.parse(JSON.stringify(E.SCENARIOS.find((s) => s.id === 'symmetric')));
const symErrs = (s) => [...E.symmetryErrors(s)];

test('대칭 검사: 기본 데이터는 통과, 지형·거점·배치·증원·행동 한도·승리 조건·병종 보정을 하나씩 어긋나게 하면 실패', () => {
  assert.deepEqual(symErrs(SYM()), []);
  const broke = (f) => { const s = SYM(); f(s); return symErrs(s); };
  const row = (s, r, c, ch) => { s.map[r] = s.map[r].slice(0, c) + ch + s.map[r].slice(c + 1); };
  assert.ok(broke((s) => row(s, 0, 0, 'f')).some((m) => m.startsWith('terrain')), '지형 한 칸');
  assert.ok(broke((s) => { s.objectives[0].cells = [[8, 3]]; }).some((m) => m.startsWith('objective')), '거점 칸');
  assert.ok(broke((s) => { s.objectives[1].cells.pop(); }).some((m) => m.startsWith('objective')), '중앙 묶음 칸 수');
  assert.ok(broke((s) => { s.deployments.find((d) => d.side === 'ua' && d.type === 'signal').pos = [12, 12]; }).includes('deployments'), '시작 배치 칸');
  assert.ok(broke((s) => { s.deployments.find((d) => d.side === 'ua' && d.type === 'artillery').type = 'mortar'; }).includes('deployments'), '병종');
  assert.ok(broke((s) => { s.deployments.find((d) => d.side === 'ru' && d.round === 4).round = 3; }).includes('deployments'), '증원 라운드');
  assert.ok(broke((s) => { s.deployments.find((d) => d.side === 'ua' && d.round === 4).count = 1; }).includes('deployments'), '증원 수');
  assert.ok(broke((s) => { s.activations = { def: 5, att: 6 }; }).includes('activations'), '행동 한도');
  assert.ok(broke((s) => { s.victory.ua = s.victory.ua.slice(0, 1); }).includes('victory'), '승리 조건');
  assert.ok(broke((s) => { s.unitOverrides = { ru: { armor: { move: 5 } } }; }).includes('unit stats'), '진영별 병종 보정');
  // validateScenario 경로로도 오류가 나옴
  const s = SYM(); row(s, 3, 9, '.');
  assert.ok(E.validateScenario(s).length > 0);
  // 춘천·호스토멜은 symmetric 이 없어 검사하지 않음
  for (const id of ['chuncheon', 'hostomel']) assert.ok(!E.SCENARIOS.find((x) => x.id === id).symmetric);
});

test('대칭 시나리오: 선공 firstMover, 직접 배치 구역(양쪽 끝 4행), 양쪽 병종 수 같음·회전 배치, 기존 시나리오 배치 구역은 그대로', () => {
  E.loadScenario('symmetric');
  assert.deepEqual([...C().ROUND_ORDER], ['ru', 'ua']);
  assert.deepEqual(JSON.parse(JSON.stringify(C().DEPLOY_ZONES)), { ru: { rows: [0, 3] }, ua: { rows: [12, 15] } });
  const st = E.createInitialState();
  for (const type of Object.keys(C().UNIT_TYPES)) {
    const n = (side) => st.units.filter((u) => u.side === side && u.type === type).length + st.pending.filter((p) => p.side === side && p.type === type).length;
    assert.equal(n('ru'), n('ua'), type);
  }
  for (const u of st.units) {
    const m = st.units.find((x) => x.side !== u.side && x.r === 15 - u.r && x.c === 15 - u.c);
    assert.ok(m && m.type === u.type, `${u.id} (${u.r},${u.c})`);
  }
  E.loadScenario('chuncheon');
  assert.deepEqual(Object.keys(C().DEPLOY_ZONES).sort(), ['north', 'south']);
  E.loadScenario('hostomel');
  assert.deepEqual(Object.keys(C().DEPLOY_ZONES), ['def']);
});

test('묶음 거점(presence): 한 칸이라도 + 상대 없음이면 점유, 양쪽이 있으면 점유자 없음, 아무도 없으면 점유자 없음', () => {
  const st = fresh('symmetric');
  const sc = () => st.objectives.find((o) => o.id === 'SC');
  assert.equal(sc().owner, null);
  assert.equal(E.objectiveAt(st, 8, 8).id, 'SC');
  assert.equal(E.objectiveAt(st, 7, 9), null);
  const ua = st.units.find((u) => u.side === 'ua' && u.type === 'infantry');
  const ru = st.units.find((u) => u.side === 'ru' && u.type === 'infantry');
  ua.r = 8; ua.c = 8;
  let ev = E.updateObjectiveControl(st);
  assert.equal(sc().owner, 'ua');
  assert.equal(ev[0].type, 'captured');
  assert.deepEqual({ ...ev[0].pos }, { r: 7, c: 7 }, '이벤트 위치는 거점 기준 칸 (유닛 칸이 아님)');
  ru.r = 7; ru.c = 7;
  ev = E.updateObjectiveControl(st);
  assert.equal(sc().owner, null);
  assert.equal(ev[0].type, 'objectiveLost');
  assert.equal(ev[0].contested, true);
  st.units = st.units.filter((u) => u.id !== ua.id);
  E.updateObjectiveControl(st);
  assert.equal(sc().owner, 'ru');
  ru.r = 6; ru.c = 7;
  E.updateObjectiveControl(st);
  assert.equal(sc().owner, null, '떠나면 점유자 없음');
  ru.r = 8; ru.c = 2;
  E.updateObjectiveControl(st);
  assert.equal(st.objectives.find((o) => o.id === 'SL').owner, 'ru', '한 칸 거점도 같은 방식 (이 시나리오)');
});

test('묶음 거점: moveUnit 경로에서 점유가 갱신됨', () => {
  const st = fresh('symmetric');
  const u = st.units.find((x) => x.side === 'ru' && x.type === 'infantry');
  u.r = 6; u.c = 8;
  E.startTurn(st);
  const ev = E.moveUnit(st, u.id, { r: 7, c: 8 });
  assert.ok(ev.some((e) => e.type === 'captured' && e.objectiveId === 'SC'));
  assert.equal(st.objectives.find((o) => o.id === 'SC').owner, 'ru');
});

/** 대칭 시나리오의 이전 승리 방식 (v9: 14라운드 끝 거점 수 판정) 덮어쓰기 */
const OLD_VICTORY = () => ({ victory: { ru: [{ type: 'annihilation' }, { type: 'roundLimitScore' }], ua: [{ type: 'annihilation' }, { type: 'roundLimitScore' }] } });
const freshOld = () => { E.loadScenario('symmetric', OLD_VICTORY()); return E.createInitialState(); };

test('대칭 승리 (이전 방식 roundLimitScore 덮어쓰기): 거점 점유로는 중간에 끝나지 않고, 마지막 라운드 판정은 거점 수 → 체력 → 무승부', () => {
  const st = freshOld();
  const set = (a, b, c) => st.objectives.forEach((o, i) => { o.owner = [a, b, c][i]; });
  set('ua', 'ua', 'ua');
  assert.equal(E.checkVictory(st, { objectives: true }), null, '거점 3개를 모두 가져도 라운드 제한 전에는 승리 아님');
  st.round = C().MAX_ROUNDS - 1;
  assert.equal(E.checkVictory(st, { objectives: true, roundLimit: true }), null, '한 라운드 전은 판정 없음');
  set('ru', null, null);
  st.round = C().MAX_ROUNDS;
  assert.deepEqual({ ...E.checkVictory(st, { objectives: true, roundLimit: true }) }, { winner: 'ru', reason: 'limitObjectives' });
  set('ru', 'ua', 'ua');
  assert.deepEqual({ ...E.checkVictory(st, { roundLimit: true }) }, { winner: 'ua', reason: 'limitObjectives' });
  set('ru', null, 'ua');
  st.pending = [];
  st.units.forEach((u) => { u.hp = 4; });
  assert.deepEqual({ ...E.checkVictory(st, { roundLimit: true }) }, { winner: 'draw', reason: 'limitDraw' });
  st.units.find((u) => u.side === 'ua').hp = 3;
  assert.deepEqual({ ...E.checkVictory(st, { roundLimit: true }) }, { winner: 'ru', reason: 'limitHp' });
  st.units.find((u) => u.side === 'ua').hp = 4;
  st.turn = 'ua';
  E.endTurn(st);
  assert.equal(st.winner, 'draw', 'endTurn 경로: 마지막 진영 턴 끝에 판정, 무승부도 게임 종료');
  // 진행 중에는 라운드 끝에도 거점으로 끝나지 않음
  const st2 = freshOld();
  st2.objectives.forEach((o) => { o.owner = 'ru'; });
  E.startTurn(st2); E.endTurn(st2); E.endTurn(st2);
  assert.equal(st2.winner, null);
  assert.equal(st2.round, 2);
  E.loadScenario('symmetric');
});

/* ---------------- 대칭 점수제 (v10: objectivePoints, scoreTiming, scoreTarget, roundLimitPoints) ---------------- */
/** 거점 칸에 유닛을 세움 (다른 유닛은 거점 밖으로) */
const clearObjectives = (st) => {
  const cells = C().OBJECTIVES.flatMap((o) => (o.cells || [{ r: o.r, c: o.c }]));
  let spare = 0;
  for (const u of st.units) if (cells.some((p) => p.r === u.r && p.c === u.c)) { u.r = 0; u.c = spare++; }
};
const putOn = (st, side, r, c, type = 'infantry') => {
  const u = st.units.find((x) => x.side === side && x.type === type && !x._placed);
  u.r = r; u.c = c; u._placed = true;
  return u;
};

test('점수: 한쪽 점유는 점수, 양쪽이 함께 있으면 아무도 못 받음, 점유자 없음은 0, 중앙 묶음은 4칸 중 한 칸이면 점유', () => {
  const st = fresh('symmetric');
  assert.deepEqual({ ...C().OBJECTIVE_POINTS }, { SL: 1, SC: 2, SR: 1 });
  assert.equal(C().SCORE_TIMING, 'ownTurnEnd');
  assert.equal(C().SCORE_TARGET, null);
  assert.deepEqual({ ...st.score }, { ru: 0, ua: 0 });
  clearObjectives(st);
  run('updateObjectiveControl')(st);
  assert.deepEqual({ ...E.heldPoints(st, 'ru') }.pts, 0, '점유자 없음');
  putOn(st, 'ru', 8, 8);                // 중앙 묶음 4칸 중 한 칸
  putOn(st, 'ru', 8, 2);                // 왼쪽
  run('updateObjectiveControl')(st);
  const h = E.heldPoints(st, 'ru');
  assert.equal(h.pts, 3);
  assert.deepEqual({ ...h.by }, { SC: 2, SL: 1 });
  putOn(st, 'ua', 7, 7);                // 중앙에 상대도 → 다툼
  run('updateObjectiveControl')(st);
  assert.equal(st.objectives.find((o) => o.id === 'SC').owner, null);
  assert.equal(E.heldPoints(st, 'ru').pts, 1);
  assert.equal(E.heldPoints(st, 'ua').pts, 0, '다툼 거점은 양쪽 모두 0');
});

test('점수 시점: ownTurnEnd 는 자기 턴을 끝낼 때 자기 점유만, roundEnd 는 라운드 끝에 양쪽 동시', () => {
  for (const timing of ['ownTurnEnd', 'roundEnd']) {
    E.loadScenario('symmetric', { scoreTiming: timing });
    const st = E.createInitialState();
    E.startTurn(st);
    clearObjectives(st);
    putOn(st, 'ru', 8, 8); putOn(st, 'ua', 7, 13);
    run('updateObjectiveControl')(st);
    const ev1 = E.endTurn(st);   // 러시아군(선공) 턴 끝
    if (timing === 'ownTurnEnd') {
      assert.deepEqual({ ...st.score }, { ru: 2, ua: 0 });
      assert.equal(JSON.stringify(ev1.filter((e) => e.type === 'scored').map((e) => [e.side, e.pts])), JSON.stringify([['ru', 2]]));
    } else assert.deepEqual({ ...st.score }, { ru: 0, ua: 0 });
    // 후공 턴 중 상대가 중앙을 비움 → 후공 턴 끝 점유 상태로 계산
    st.units.find((u) => u.side === 'ru' && u.r === 8 && u.c === 8).r = 0;
    run('updateObjectiveControl')(st);
    E.endTurn(st);               // 우크라이나군 턴 끝 = 라운드 끝
    if (timing === 'ownTurnEnd') assert.deepEqual({ ...st.score }, { ru: 2, ua: 1 });
    else assert.deepEqual({ ...st.score }, { ru: 0, ua: 1 });
    assert.equal(st.round, 2);
    assert.ok(st.scoreLog.every((g) => g.round === 1));
  }
  E.loadScenario('symmetric');
});

test('점수: 증원 도착 라운드도 같은 시점 규칙 (도착 후 그 턴 끝의 점유로 계산)', () => {
  const st = fresh('symmetric');
  E.startTurn(st);
  clearObjectives(st);
  run('updateObjectiveControl')(st);
  let guard = 0;
  while (st.round < 4 && guard++ < 20) E.endTurn(st);   // 4라운드 러시아군 턴 시작 = 증원 도착
  assert.equal(st.round, 4); assert.equal(st.turn, 'ru');
  const before = st.score.ru;
  const arrived = st.units.filter((u) => u.side === 'ru' && (u.r === 0));
  assert.ok(arrived.length >= 2, '증원 도착');
  const u = st.units.find((x) => x.side === 'ru' && x.type === 'infantry');
  u.r = 8; u.c = 2;
  run('updateObjectiveControl')(st);
  E.endTurn(st);
  assert.equal(st.score.ru - before, 1);
  assert.equal(JSON.stringify(st.scoreLog.at(-1)), JSON.stringify({ round: 4, side: 'ru', pts: 1, by: { SL: 1 } }));
});

test('점수제 판정: 총점 → 남은 체력 → 무승부, 거점 점유로는 중간에 끝나지 않음, 전멸 승리는 즉시', () => {
  const st = fresh('symmetric');
  st.objectives.forEach((o) => { o.owner = 'ua'; });
  st.score = { ru: 0, ua: 30 };
  assert.equal(E.checkVictory(st, { objectives: true }), null, '거점·점수로 중간에 끝나지 않음 (scoreTarget 없음)');
  st.round = C().MAX_ROUNDS;
  st.score = { ru: 12, ua: 9 };
  assert.deepEqual({ ...E.checkVictory(st, { roundLimit: true }) }, { winner: 'ru', reason: 'limitPoints' });
  st.score = { ru: 9, ua: 9 };
  st.pending = [];
  st.units.forEach((u) => { u.hp = 4; });
  assert.deepEqual({ ...E.checkVictory(st, { roundLimit: true }) }, { winner: 'draw', reason: 'limitDraw' });
  st.units.find((u) => u.side === 'ru').hp = 3;
  assert.deepEqual({ ...E.checkVictory(st, { roundLimit: true }) }, { winner: 'ua', reason: 'limitHp' });
  // 마지막 라운드 후공 턴 끝: 점수를 받은 뒤 판정
  const s2 = fresh('symmetric');
  E.startTurn(s2);
  clearObjectives(s2);
  putOn(s2, 'ua', 7, 7);
  run('updateObjectiveControl')(s2);
  s2.round = C().MAX_ROUNDS; s2.turn = 'ua'; s2.score = { ru: 5, ua: 4 };
  const ev = E.endTurn(s2);
  assert.equal(s2.score.ua, 6);
  assert.equal(s2.winner, 'ua');
  assert.ok(ev.findIndex((e) => e.type === 'scored') < ev.findIndex((e) => e.type === 'victory'));
  // 전멸: 상대 유닛·증원이 모두 없으면 즉시 (점수와 무관)
  const s3 = fresh('symmetric');
  s3.score = { ru: 0, ua: 20 };
  s3.units = s3.units.filter((u) => u.side === 'ru'); s3.pending = s3.pending.filter((p) => p.side === 'ru');
  assert.deepEqual({ ...E.checkVictory(s3) }, { winner: 'ru', reason: 'annihilation' });
});

test('조기 종료 scoreTarget: 한쪽이 닿으면 즉시 승리 (기본 null 이면 없음)', () => {
  E.loadScenario('symmetric', { scoreTarget: 4 });
  const st = E.createInitialState();
  E.startTurn(st);
  clearObjectives(st);
  putOn(st, 'ru', 8, 8); putOn(st, 'ru', 8, 2, 'armor');
  run('updateObjectiveControl')(st);
  E.endTurn(st);                       // ru 3
  assert.equal(st.winner, null);
  E.endTurn(st);                       // ua 0
  E.endTurn(st);                       // ru 6 ≥ 4
  assert.equal(st.winner, 'ru');
  assert.equal(st.winReason, 'scoreTarget');
  E.loadScenario('symmetric');
});

test('대칭 검사: 측면 거점 점수가 다르거나 승리 조건 형식이 한쪽만 다르면 실패, 점수 데이터 형식 검사', () => {
  const broke = (f) => { const s = SYM(); f(s); return symErrs(s); };
  assert.deepEqual(symErrs(SYM()), []);
  assert.ok(broke((s) => { s.objectivePoints.SR = 2; }).some((m) => m.startsWith('objectivePoints')), '측면 점수');
  assert.deepEqual(broke((s) => { s.objectivePoints.SC = 3; }), [], '중앙은 자기 자신이 짝');
  assert.ok(broke((s) => { s.victory.ru = [{ type: 'annihilation' }, { type: 'roundLimitScore' }]; }).includes('victory'), '한쪽만 다른 판정');
  assert.ok(broke((s) => { s.victory.ua[1] = { type: 'roundLimitPoints', extra: 1 }; }).includes('victory'), '한쪽에만 있는 값');
  const bad = (f) => { const s = SYM(); f(s); return E.validateScenario(s).length > 0; };
  assert.ok(bad((s) => { s.objectivePoints = { SL: 1, SC: 2 }; }), '거점 하나 빠짐');
  assert.ok(bad((s) => { s.objectivePoints.SC = -1; }), '음수');
  assert.ok(bad((s) => { s.objectivePoints.XX = 1; }), '없는 거점 id');
  assert.ok(bad((s) => { s.scoreTiming = 'later'; }), '점수 시점');
  assert.ok(bad((s) => { s.scoreTarget = 0; }), '목표 점수');
  assert.ok(bad((s) => { delete s.objectivePoints; delete s.scoreTiming; delete s.scoreTarget; }), 'roundLimitPoints 에 점수 필요');
  assert.ok(bad((s) => { s.objectivePoints.SR = 3; }), 'validateScenario 경로로도 대칭 실패');
  assert.deepEqual([...E.validateScenario(SYM())], []);
});

test('점수는 게임 상태에 저장: 직렬화·복원 뒤 같은 시드로 이어 가면 점수와 결과가 같음', () => {
  E.loadScenario('symmetric');
  const play = (st, rng, dice, turns) => { for (let k = 0; k < turns && !st.winner; k++) { E.aiTakeTurn(st, st.turn, rng, 'normal', { recordSnapshots: false, diceRng: dice }); if (!st.winner) E.endTurn(st); } };
  const a = E.createInitialState(); E.startTurn(a);
  const r1 = seeded(21);
  play(a, r1.rng, r1.diceRng, 10);
  assert.ok(a.scoreLog.length === 10 || a.winner);
  const saved = JSON.stringify(a);
  const b = JSON.parse(saved);
  assert.equal(JSON.stringify(b.score), JSON.stringify(a.score));
  assert.equal(JSON.stringify(b.scoreLog), JSON.stringify(a.scoreLog));
  const ra = seeded(77), rb = seeded(77);
  play(a, ra.rng, ra.diceRng, 30);
  play(b, rb.rng, rb.diceRng, 30);
  assert.equal(JSON.stringify(b), JSON.stringify(a));
  // 다른 시나리오 상태에는 점수 필드가 없음
  for (const id of ['chuncheon', 'hostomel']) { const st = fresh(id); assert.ok(!('score' in st) && !('scoreLog' in st), id); assert.equal(C().OBJECTIVE_POINTS, null); }
  E.loadScenario('symmetric');
});

test('후공 보너스: 후공 진영의 1라운드 턴에만 한도 추가 (기본 0)', () => {
  E.loadScenario('symmetric', { secondMoverBonus: 2 });
  const st = E.createInitialState();
  E.startTurn(st);
  assert.equal(st.act.limit, 5, '선공 1라운드');
  E.endTurn(st);
  assert.equal(st.turn, 'ua');
  assert.equal(st.act.limit, 7, '후공 1라운드');
  E.endTurn(st); E.endTurn(st);
  assert.equal(st.round, 2);
  assert.equal(st.act.limit, 5, '후공 2라운드');
  E.loadScenario('symmetric');
  const st2 = E.createInitialState();
  E.startTurn(st2); E.endTurn(st2);
  assert.equal(st2.act.limit, 5, '기본값 0');
});

test('대칭 시나리오: simulateGames 가 무승부를 따로 세고, 진단 지표(res.sym)는 이 시나리오에만 있음', () => {
  const r = E.simulateGames(4, { scenario: 'symmetric', quiet: true });
  assert.equal(r.errors, 0);
  assert.equal(Object.values(r.wins).reduce((a, b) => a + b, 0) + r.draws, 4);
  assert.ok(r.sym && r.sym.firstMover === 'ru');
  const h = E.simulateGames(2, { scenario: 'hostomel', quiet: true });
  assert.ok(!('draws' in h) && !('sym' in h));
});

/* ---------------- 대칭 AI 정보 모듈 (ai-intel.js) ---------------- */
const KI = () => C().AI.SYMMETRIC.INTEL;
const symMid = () => midStates('symmetric', 14);

test('intel: 보이면 위치 갱신, 보이는 칸이 비면 기록 삭제, 안 보이면 신뢰도 감소·불확실 반경 증가', () => {
  const st = fresh('symmetric');
  const ru = st.units.find((u) => u.side === 'ru' && u.type === 'infantry');
  // 우크라이나군 시야 안으로 옮김 → 보임
  ru.r = 10; ru.c = 9;
  run('updateMemory')(st);
  let rec = E.intelRecords(st, 'ua', KI()).find((e) => e.id === ru.id);
  assert.ok(rec && rec.seen && rec.r === 10 && rec.c === 9 && rec.conf === 1 && rec.radius === 0);
  // 마지막으로 본 칸이 지금 시야 밖 → 마지막 위치 유지, 라운드가 지날수록 신뢰도 감소·반경 증가
  ru.r = 4; ru.c = 2;
  st.memory.ua[ru.id] = { ...st.memory.ua[ru.id], r: 5, c: 3, vacated: false };   // (5,3) 에서 본 것으로 (우크라이나군 시야 밖 칸)
  assert.ok(!E.getVisibleTiles(st, 'ua').has(5 * 16 + 3));
  st.round += 2;
  rec = E.intelRecords(st, 'ua', KI()).find((e) => e.id === ru.id);
  assert.ok(rec && !rec.seen && rec.r === 5 && rec.c === 3);
  assert.ok(rec.conf < 1 && rec.radius === 2 * C().UNIT_TYPES.infantry.move);
  const later = (() => { st.round += 1; return E.intelRecords(st, 'ua', KI()).find((e) => e.id === ru.id); })();
  assert.ok(later.conf < rec.conf && later.radius > rec.radius);
  // 기억한 칸이 보이는데 비어 있음 → 기록 삭제
  const ua = st.units.find((u) => u.side === 'ua' && u.type === 'infantry');   // 시야 2: (5,3) 은 보이고 실제 위치 (4,2) 는 안 보임
  ua.r = 7; ua.c = 3;
  run('updateMemory')(st);
  assert.ok(!E.intelRecords(st, 'ua', KI()).some((e) => e.id === ru.id));
  // 시작 배치 기록(공개 설정): 못 본 유닛은 시작 칸으로, 그 칸이 보이면 삭제
  const s2 = fresh('symmetric');
  const setupRec = E.intelRecords(s2, 'ua', KI()).find((e) => e.id === 'R1');
  assert.deepEqual([setupRec.r, setupRec.c], [3, 6]);
  const scout = s2.units.find((u) => u.side === 'ua' && u.type === 'infantry');
  scout.r = 5; scout.c = 6;
  s2.units.find((u) => u.id === 'R1').r = 0;   // 실제로는 다른 곳으로 이동
  run('updateMemory')(s2);
  assert.ok(!E.intelRecords(s2, 'ua', KI()).some((e) => e.id === 'R1' && e.r === 3 && e.c === 6));
});

test('intel: 보이지 않는 적의 위치·체력·쿨다운·증원을 바꿔도 기억·위험 지도가 같음', () => {
  let checked = 0;
  for (const st of symMid()) {
    const side = st.turn, enemy = side === 'ru' ? 'ua' : 'ru';
    const known = seenBy(st, side);
    const hidden = st.units.filter((u) => u.side === enemy && !known(u));
    if (!hidden.length) continue;
    const vis = E.getVisibleTiles(st, side);
    const alt = E.cloneState(st);
    for (const u of alt.units) {
      if (!hidden.some((h) => h.id === u.id)) continue;
      u.hp = 1; u.lastFiredRound = alt.round;
      // 아무도 없고 보이지 않는 다른 칸으로 옮김
      for (let i = 0; i < 256; i++) { const r = Math.floor(i / 16), c = i % 16; if (!vis.has(i) && !alt.units.some((x) => x.r === r && x.c === c) && !(C().TERRAIN[C().MAP[r][c]].impassableFor || []).includes(u.type)) { u.r = r; u.c = c; break; } }
    }
    for (const p of alt.pending) if (p.side === enemy) p.round += 3;
    const sig = (s) => JSON.stringify(E.intelRecords(s, side, KI())) + JSON.stringify([...E.threatMap(s, side, 'infantry', KI()).dmg]);
    assert.equal(sig(alt), sig(st), `round ${st.round} ${side}`);
    checked++;
  }
  assert.ok(checked > 0);
});

test('대칭 AI: 그 턴 내내 보지 못한 적의 쿨다운을 바꿔도 AI 행동이 같음', () => {
  let checked = 0;
  for (const st of symMid()) {
    const side = st.turn;
    const after = E.cloneState(st);
    const { rng, diceRng } = seeded(11);
    E.aiTakeTurn(after, side, rng, 'normal', { recordSnapshots: false, diceRng });
    const known = seenBy(st, side), knownAfter = seenBy(after, side);
    const hidden = st.units.filter((u) => u.side !== side && !known(u) && !knownAfter(u) && C().UNIT_TYPES[u.type].indirect);
    if (!hidden.length) continue;
    const alt = E.cloneState(st);
    for (const u of alt.units) if (hidden.some((h) => h.id === u.id)) u.lastFiredRound = alt.round;
    assert.equal(aiActions(alt, side, 11), aiActions(st, side, 11), `round ${st.round} ${side}`);
    checked++;
  }
  assert.ok(checked > 0, '시야 밖 간접 화력 유닛이 있는 상태를 찾지 못함');
});

test('쿨다운 안전 구간: 상대 포병이 방금 쐈다는 단서가 있을 때만 (포병 1기, 가장 최근 상대 턴)', () => {
  const st = fresh('symmetric');
  st.turn = 'ua'; st.round = 3;   // ru 가 선공 → ru 의 가장 최근 턴 = 3라운드
  assert.equal(E.intelArtyResting(st, 'ua'), false, '단서 없음');
  st.aiIntel.ua.clues.push({ round: 2, kind: 'artillery' });
  assert.equal(E.intelArtyResting(st, 'ua'), false, '지난 라운드 단서는 안전 구간이 아님');
  st.aiIntel.ua.clues.push({ round: 3, kind: null });
  assert.equal(E.intelArtyResting(st, 'ua'), false, '병종을 모르는 단서');
  st.aiIntel.ua.clues.push({ round: 3, kind: 'artillery' });
  assert.equal(E.intelArtyResting(st, 'ua'), true);
  // 위험 지도에서 포병 항이 빠짐
  const K = KI();
  const on = E.threatMap(st, 'ua', 'infantry', K, null, false), off = E.threatMap(st, 'ua', 'infantry', K, null, true);
  assert.ok(off.dmg.reduce((a, b) => a + b, 0) < on.dmg.reduce((a, b) => a + b, 0));
  assert.equal(off.artyP.reduce((a, b) => a + b, 0), 0);
});

test('간접 사격 단서: 보이지 않는 곳에서 온 사격만, 피해 모양으로 병종 추정', () => {
  const st = fresh('symmetric');
  const art = st.units.find((u) => u.side === 'ru' && u.type === 'artillery');
  const tgt = st.units.find((u) => u.side === 'ua' && u.type === 'infantry');
  st.turn = 'ru'; E.startTurn(st);
  art.r = 7; art.c = 9; tgt.r = 12; tgt.c = 9;   // 거리 5, 우크라이나군 시야 밖에서 사격
  run('updateMemory')(st);
  const always = () => 0;   // 주사위 1 → 명중
  E.resolveAttack(st, art.id, { r: tgt.r, c: tgt.c }, always);
  const clue = st.aiIntel.ua.clues.at(-1);
  assert.equal(clue.round, st.round);
  assert.equal(clue.kind, 'artillery', '중심 피해 2 → 포병');
});

test('대칭 AI: 같은 시드면 모든 행동이 같고(새 AI·기존 AI·turtle), 다른 시나리오 상태에는 새 필드가 없음', () => {
  for (const pair of [['normal', 'normal'], ['v1:normal', 'turtle'], ['hard', 'easy']]) {
    const o = { scenario: 'symmetric', quiet: true, ru: pair[0], ua: pair[1] };
    assert.equal(JSON.stringify(E.simulateGames(3, o)), JSON.stringify(E.simulateGames(3, o)), pair.join('/'));
  }
  const r = E.simulateGames(3, { scenario: 'symmetric', quiet: true, ru: 'turtle', ua: 'normal' });
  assert.equal(r.errors, 0);
  for (const id of ['chuncheon', 'hostomel']) {
    const st = fresh(id);
    E.startTurn(st);
    const { rng, diceRng } = seeded(5);
    E.aiTakeTurn(st, st.turn, rng, 'normal', { recordSnapshots: false, diceRng });
    assert.ok(!('aiIntel' in st), id);
  }
  assert.ok('aiIntel' in fresh('symmetric'));
});

/* ---------------- 튜토리얼 (js/tutorial.js, scenarios/tutorial.js 의 tutorialSteps: 큰 단계 → beats) ---------------- */
const TP = (r, c) => ({ r, c });
/** 단계별 풀이 (허용된 입력만으로 모든 beat 도달) */
const TUT_SOLUTION = {
  select: [['select', 'A1'], ['move', 'A1', TP(5, 3)]],
  attack: [['select', 'A1'], ['preview', 'A1', TP(3, 3)], ['attack', 'A1', TP(3, 3)]],
  terrain: [['select', 'A1'], ['preview', 'A1', TP(2, 1)], ['preview', 'A1', TP(1, 2)]],
  fog: [['select', 'A1'], ['move', 'A1', TP(4, 3)], ['select', 'A2'], ['preview', 'A2', TP(4, 6)]],
  activation: [['select', 'A1'], ['move', 'A1', TP(5, 2)], ['select', 'A2'], ['endTurn']],
  objective: [['select', 'A1'], ['move', 'A1', TP(2, 4)], ['select', 'A2'], ['attack', 'A2', TP(1, 5)]],
  mortar: [['select', 'A1'], ['attack', 'A1', TP(3, 4)]],
  artillery: [['select', 'A1'], ['attack', 'A1', TP(3, 3)], ['endTurn'], ['select', 'A1']],
  retreat: [['endTurn'], ['endTurn'], ['endTurn'], ['select', 'A3']],
};
/** 화면과 같은 순서로 입력을 엔진에 적용 (허용되지 않은 입력은 아무것도 하지 않음). results: beat 를 끝낸 순간 고른 결과 말풍선 */
function tutPlay(step, actions, seed = step.seed) {
  const st = E.tutorialState(step), rng = E.createSeededRng(seed), log = [], events = [], refused = [], results = [];
  for (const [kind, unit, at] of actions) {
    const a = { kind, unit, at };
    if (!E.tutorialAllows(step, a, st, log)) { refused.push(kind); continue; }
    const before = E.tutorialCurrent(step, log, st), beat = E.tutorialBeats(step)[before];
    let ev = [];
    if (kind === 'move') ev = E.moveUnit(st, unit, at);
    else if (kind === 'attack') ev = E.resolveAttack(st, unit, at, rng);
    else if (kind === 'endTurn') ev = E.tutorialEndTurn(st, step, rng, log.filter((e) => e.kind === 'endTurn').length + 1);
    events.push(...ev);
    E.tutorialRecord(log, a, ev, st);
    if (E.tutorialCurrent(step, log, st) > before) { const rs = E.tutorialResult(beat, { events: ev, st, log }); if (rs) results.push({ beat: before, key: rs.key, sub: rs.sub }); }
  }
  return { st, log, events, refused, results, prog: E.tutorialProgress(step, log, st) };
}
const tutSteps = () => { E.loadScenario('tutorial'); return E.tutorialSteps(); };

test('튜토리얼 데이터: 단계 id 중복 없음, validateTutorialSteps 오류 없음 (칸이 지도 안·겹침 없음·문구 ko/en 있음·hint 22자·sub 28자), 튜토리얼 시나리오는 시작 화면 목록에 없음', () => {
  const steps = tutSteps(), n = C().MAP.length;
  assert.ok(steps.length >= 8);
  assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
  jsonEq(E.validateTutorialSteps(steps), []);
  for (const s of steps) for (const u of s.setup.units) {
    const ter = C().TERRAIN[C().MAP[u.pos[0]][u.pos[1]]];
    assert.ok(!(ter.impassableFor || []).includes(u.type), `${s.id} ${u.type} 지형`);
  }
  assert.ok(steps.every((s) => s.beats.every((b) => b.target)), 'target');
  assert.ok(n > 0);
  assert.ok(!E.listScenarios().some((s) => s.id === 'tutorial' || s.id === 'tutorialPractice'));
  assert.deepEqual([...E.validateScenario(E.SCENARIOS.find((s) => s.id === 'tutorialPractice'))], []);
});

test('validateTutorialSteps: 22자 넘는 hint, 28자 넘는 sub, 지도 밖 target, 없는 문구 키를 잡아냄', () => {
  const S = run('STRINGS'), good = tutSteps();
  const clone = () => JSON.parse(JSON.stringify(good));
  S.ko['zz.long'] = '가'.repeat(23); S.en['zz.long'] = 'x'.repeat(23);
  S.ko['zz.sub'] = '가'.repeat(29); S.en['zz.sub'] = 'x'.repeat(29);
  S.ko['zz.ok'] = '가'.repeat(22); S.en['zz.ok'] = 'x'.repeat(22);
  try {
    const a = clone(); a[0].beats[0].hint = 'zz.long';
    assert.equal(E.validateTutorialSteps(a).length, 2, 'ko, en 모두 잡음');
    const b = clone(); b[0].beats[0].sub = 'zz.sub';
    assert.equal(E.validateTutorialSteps(b).length, 2);
    const c = clone(); c[0].beats[0].hint = 'zz.ok';
    jsonEq(E.validateTutorialSteps(c), [], '정확히 22자는 통과');
    const d = clone(); d[1].beats[1].target = { cells: [[9, 9]] };
    assert.equal(E.validateTutorialSteps(d).length, 1);
    const e = clone(); e[0].beats[0].hint = 'zz.missing';
    assert.ok(E.validateTutorialSteps(e).length >= 1);
    const f = clone(); f[0].beats[1].onResult = [{ key: 'zz.long' }];
    assert.equal(E.validateTutorialSteps(f).length, 2, '결과 말풍선도 22자 규칙');
  } finally { for (const k of ['zz.long', 'zz.sub', 'zz.ok']) { delete S.ko[k]; delete S.en[k]; } }
  assert.equal(run('getLang')(), 'ko', '검사 뒤 언어 복원');
});

test('튜토리얼: 허용된 입력만으로 모든 단계를 끝까지 진행 (엔진을 실제로 돌림), 게임이 끝나지 않음, 모든 beat 도달', () => {
  for (const step of tutSteps()) {
    const r = tutPlay(step, TUT_SOLUTION[step.id]);
    assert.deepEqual(r.refused, [], `${step.id} 거부된 입력`);
    assert.ok(r.prog.complete, `${step.id} 완료 ${JSON.stringify(r.prog.done)}`);
    assert.equal(r.prog.done.length, step.beats.length, step.id);
    assert.equal(r.st.winner, null, step.id);
  }
});

test('튜토리얼: 정해 둔 시드 결과 (2단계 빗나감, 6단계 명중으로 점유, 8단계 아군도 포병 파편에 맞음·다음 턴 쿨다운) + 결과 말풍선이 결과에 맞게 고름', () => {
  const by = Object.fromEntries(tutSteps().map((s) => [s.id, s]));
  const rolls = (r) => r.events.filter((e) => e.type === 'diceRoll');
  const two = tutPlay(by.attack, TUT_SOLUTION.attack);
  assert.equal(rolls(two)[0].hit, false);
  assert.equal(two.results.at(-1).key, 'tr.miss');
  const six = tutPlay(by.objective, TUT_SOLUTION.objective);
  assert.ok(six.log.some((e) => e.kind === 'contested'));
  assert.equal(six.st.objectives[0].owner, 'ally');
  jsonEq(six.results.map((r) => r.key), ['tr.contested', 'tr.owned']);
  const eight = tutPlay(by.artillery, TUT_SOLUTION.artillery);
  assert.ok(rolls(eight)[0].hit);
  assert.ok(eight.events.some((e) => e.type === 'splashDamage' && e.unitId === 'A2'), '아군 파편 피해');
  assert.ok(eight.log.at(-1).cooling, '다음 턴 포병은 쿨다운');
  assert.ok(run('onCooldown')(eight.st, eight.st.units.find((u) => u.id === 'A1')));
  jsonEq(eight.results.map((r) => r.key), ['tr.splash', 'tr.cooling']);
  const five = tutPlay(by.activation, TUT_SOLUTION.activation);
  jsonEq(five.results.map((r) => r.key), ['tr.actAll', 'tr.blocked', 'tr.actRefill']);
  // 9단계: 일반 게임과 같은 엔진 판정 (직접 사격 후퇴 → 뒤가 막히면 격파 → 박격포 정중앙 제압), 상대는 정해진 사격만
  const nine = tutPlay(by.retreat, TUT_SOLUTION.retreat);
  jsonEq(nine.results.map((r) => r.key), ['tr.retreat', 'tr.retreatBlocked', 'tr.suppressed', 'tr.suppSel']);
  const ev9 = nine.events;
  const rt = ev9.find((e) => e.type === 'retreat');
  assert.ok(rt && rt.unitId === 'A1' && rt.from.r === 4 && rt.to.r === 5 && rt.from.c === rt.to.c, '공격자 반대 방향으로 ' + C().RETREAT.STEPS + '칸');
  assert.ok(ev9.some((e) => e.type === 'destroyed' && e.unitId === 'A2' && e.cause === 'retreatBlocked'), '지도 끝이라 후퇴 불가 → 격파');
  assert.ok(ev9.some((e) => e.type === 'suppressed' && e.unitId === 'A3'), '박격포 정중앙 → 제압');
  assert.ok(nine.st.units.find((u) => u.id === 'A3').suppressed > 0);
  assert.ok(!nine.st.units.some((u) => u.id === 'A2'));
  assert.equal(nine.st.winner, null);
  assert.ok(nine.log.at(-1).suppressed, '제압된 유닛 선택 기록');
  // 상대는 정해진 사격만: 턴 종료마다 한 발씩 (같은 턴 종료에 다음 사격이 미리 나가지 않음)
  assert.equal(tutPlay(by.retreat, [['endTurn']]).events.filter((e) => e.type === 'diceRoll').length, 1);
  // 모든 단계의 마지막 beat 는 결과 말풍선이 있음 (다음 단계로 넘어가기 전 한 줄)
  for (const s of Object.values(by)) assert.ok(tutPlay(s, TUT_SOLUTION[s.id]).results.some((r) => r.beat === s.beats.length - 1), `${s.id} 마지막 결과`);
});

test('튜토리얼: 허용되지 않은 입력은 거부되고 상태가 그대로 (beat 순서대로만, 단계가 끝난 뒤에도 상태 변화 없음)', () => {
  const by = Object.fromEntries(tutSteps().map((s) => [s.id, s]));
  const bad = [
    [by.select, ['select', 'A2']], [by.select, ['move', 'A1', TP(5, 3)]], [by.select, ['move', 'A2', TP(5, 6)]], [by.select, ['endTurn']], [by.select, ['cell']],
    [by.attack, ['move', 'A1', TP(5, 3)]], [by.attack, ['attack', 'A1', TP(3, 3)]],              // 순서: 선택 전에는 공격 불가
    [by.terrain, ['attack', 'A1', TP(3, 2)]],
    [by.fog, ['move', 'A1', TP(5, 3)]], [by.fog, ['preview', 'A2', TP(4, 6)]],                  // 순서: 보병 이동 전에는 박격포 확인 불가
    [by.activation, ['move', 'A2', TP(5, 5)]], [by.objective, ['attack', 'A2', TP(1, 5)]],      // 순서: 거점 진입 전 공격 불가
    [by.artillery, ['endTurn']],                                                                 // 순서: 사격 전 턴 종료 불가
  ];
  for (const [step, [kind, unit, at]] of bad) {
    const st = E.tutorialState(step), before = JSON.stringify(st);
    assert.equal(E.tutorialAllows(step, { kind, unit, at }, st, []), false, `${step.id} ${kind} ${unit || ''}`);
    const r = tutPlay(step, [[kind, unit, at]]);
    assert.deepEqual(r.refused, [kind]);
    assert.equal(JSON.stringify(r.st), before, `${step.id} 상태 변화 없음`);
  }
  // 허용 칸이 아닌 칸으로 이동·공격 거부 (4단계 보병은 표시된 칸만)
  const fog = tutPlay(by.fog, [['select', 'A1'], ['move', 'A1', TP(5, 3)]]);
  assert.deepEqual(fog.refused, ['move']);
  // 단계가 끝난 뒤에는 상태를 바꾸는 입력을 더 받지 않음
  const done = tutPlay(by.artillery, TUT_SOLUTION.artillery);
  assert.equal(E.tutorialAllows(by.artillery, { kind: 'endTurn' }, done.st, done.log), false);
  assert.equal(E.tutorialAllows(by.artillery, { kind: 'move', unit: 'A1', at: TP(6, 3) }, done.st, done.log), false);
});

test('튜토리얼: 눌러야 할 곳(tutorialTarget) — 유닛은 지금 위치를 따라가고, 이동 beat 는 갈 수 있는 칸 전체, 버튼 beat 는 칸 표시 없음', () => {
  const by = Object.fromEntries(tutSteps().map((s) => [s.id, s]));
  const st = E.tutorialState(by.select);
  let tg = E.tutorialTarget(by.select.beats[0], st);
  jsonEq(tg.cells, [[6, 3]]);
  jsonEq(tg.anchor, [6, 3]);
  tg = E.tutorialTarget(by.select.beats[1], st);
  jsonEq(tg.cells, []);
  const reach = run('getReachableTiles')(st, 'A1');
  assert.ok(reach.length > 0);
  assert.equal(tg.bright.length, reach.length + 1);
  assert.ok(reach.every((p) => tg.bright.some((q) => q[0] === p.r && q[1] === p.c)));
  tg = E.tutorialTarget(by.activation.beats[3], E.tutorialState(by.activation));
  assert.equal(tg.button, 'endTurn');
  jsonEq(tg.cells, []);
  // 유닛이 움직이면 목표 표시도 따라감
  const r = tutPlay(by.select, TUT_SOLUTION.select);
  const moved = r.st.units.find((u) => u.id === 'A1');
  jsonEq(E.tutorialTarget({ target: { unit: 'A1' } }, r.st).cells, [[moved.r, moved.c]]);
});

test('튜토리얼: 다시 해 보기 = 같은 시드로 같은 결과 (이벤트·결과 말풍선 포함)', () => {
  for (const step of tutSteps()) {
    const a = tutPlay(step, TUT_SOLUTION[step.id]), b = tutPlay(step, TUT_SOLUTION[step.id]);
    assert.equal(JSON.stringify(b.st), JSON.stringify(a.st), step.id);
    assert.equal(JSON.stringify(b.events), JSON.stringify(a.events), step.id);
    assert.equal(JSON.stringify(b.results), JSON.stringify(a.results), step.id);
  }
});

test('튜토리얼 문구의 수치는 데이터에서 읽음 (사거리·쿨다운·행동 수·지형·안개를 바꾸면 말풍선 문구가 바뀜)', () => {
  const t = run('t');
  const s = tutSteps();
  const P = () => E.tutorialParams();
  const txt = (key) => t(key, P());
  assert.equal(txt('tb.mortar.2s'), '사거리 2~4칸');
  assert.equal(txt('tb.artillery.2s'), '사거리 2~5칸');
  assert.ok(txt('tr.act.sub').includes('3'));
  assert.ok(txt('tr.forest').includes('10%'));
  assert.ok(txt('tr.fog').includes('50%'));
  assert.ok(txt('tr.cooling').includes('1턴'));
  E.loadScenario('tutorial', { fires: { mortar: { range: 3 }, artillery: { range: 6, cooldown: 2 } }, activations: { def: 4, att: 4 } });
  assert.equal(txt('tb.mortar.2s'), '사거리 2~3칸');
  assert.equal(txt('tb.artillery.2s'), '사거리 2~6칸');
  assert.ok(txt('tr.cooling').includes('2턴'), txt('tr.cooling'));
  assert.ok(txt('tr.act.sub').includes('4기'), txt('tr.act.sub'));
  jsonEq(E.validateTutorialSteps(E.tutorialSteps()), [], '수치가 바뀌어도 글자 수 규칙 유지');
  E.loadScenario('tutorial');
  assert.ok(s.length > 0);
});

test('튜토리얼 상태는 엔진의 일반 상태와 같은 형식이고, 다른 시나리오·결과에는 영향 없음', () => {
  const step = tutSteps()[0];
  const st = E.tutorialState(step);
  assert.equal(st.turn, 'ally');
  assert.equal(st.act.limit, C().ACTIVATIONS.def);
  assert.ok(Array.isArray(st.units) && st.units.every((u) => /^[AE]\d+$/.test(u.id)));
  // 시나리오를 오가도 AI 캐시가 섞이지 않음: 대칭 전장 결과가 튜토리얼·연습 판을 거친 뒤에도 같음
  const a = JSON.stringify(E.simulateGames(2, { scenario: 'symmetric', quiet: true }));
  E.simulateGames(1, { scenario: 'tutorialPractice', quiet: true });
  const b = JSON.stringify(E.simulateGames(2, { scenario: 'symmetric', quiet: true }));
  assert.equal(b, a);
});

test('튜토리얼 말풍선 위치: 360x640·390x844·412x915·1280 지도 영역에서 모든 대상 칸마다 화면 밖으로 나가지 않고, 가릴 곳(대상·공격자 칸)을 가리지 않음', () => {
  // [말풍선을 놓는 지도 틀 폭, 높이, 칸 크기]: 휴대폰 세로 세 가지와 PC (튜토리얼 지도 8x8, 틀 = 칸 × 8 + 라벨·테두리)
  const areas = [[344, 8 * 34 + 16, 34], [374, 8 * 38 + 16, 38], [396, 8 * 40 + 16, 40], [640, 8 * 70 + 16, 70]];
  const sizes = [[150, 40], [220, 40], [230, 62], [250, 64]];   // 한 줄·두 줄·보조 줄 포함
  let n = 0;
  for (const [W, H, cell] of areas) {
    const ox = Math.round((W - 8 * cell) / 2), oy = 12;
    const rect = (r, c) => ({ x: ox + c * cell, y: oy + r * cell, w: cell, h: cell });
    for (const [bw, bh] of sizes) for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const a = rect(r, c);
      const others = [rect((r + 3) % 8, (c + 2) % 8), rect((r + 5) % 8, (c + 6) % 8)];   // 공격자·다른 강조 칸
      const avoid = [a, ...others];
      const p = E.tutorialPlaceBubble({ box: { w: W, h: H }, size: { w: bw, h: bh }, anchor: a, avoid });
      const where = `${W}x${H} ${bw}x${bh} (${r},${c})`;
      assert.ok(p.x >= 8 && p.y >= 8 && p.x + p.w <= W - 8 && p.y + bh <= H - 8, `화면 안 ${where} ${JSON.stringify(p)}`);
      for (const v of avoid) assert.ok(p.x >= v.x + v.w || p.x + p.w <= v.x || p.y >= v.y + v.h || p.y + bh <= v.y, `가림 ${where} ${JSON.stringify(p)} ${JSON.stringify(v)}`);
      assert.ok(p.w <= W * 0.7 + 1e-6 || bw > W * 0.7, `폭 ${where}`);
      n++;
    }
  }
  assert.ok(n > 500);
  // 기본은 대상 위쪽, 위가 모자라면 아래로
  const mid = E.tutorialPlaceBubble({ box: { w: 360, h: 300 }, size: { w: 160, h: 40 }, anchor: { x: 160, y: 150, w: 30, h: 30 }, avoid: [{ x: 160, y: 150, w: 30, h: 30 }] });
  assert.ok(mid.y + 40 < 150 && mid.tail.edge === 'bottom');
  const top = E.tutorialPlaceBubble({ box: { w: 360, h: 300 }, size: { w: 160, h: 40 }, anchor: { x: 160, y: 20, w: 30, h: 30 }, avoid: [{ x: 160, y: 20, w: 30, h: 30 }] });
  assert.ok(top.y > 50 && top.tail.edge === 'top');
  // 턴 종료 버튼처럼 지도 틀 밖이 대상이면: 그쪽 가장자리에 붙고 꼬리가 버튼 쪽을 가리킴 (아래 = 휴대폰, 오른쪽 = PC)
  const below = E.tutorialPlaceBubble({ box: { w: 344, h: 288 }, size: { w: 160, h: 40 }, anchor: { x: 150, y: 300, w: 120, h: 52 }, avoid: [{ x: 150, y: 300, w: 120, h: 52 }] });
  assert.ok(below.y + 40 === 288 - 8 && below.tail.edge === 'bottom');
  const right = E.tutorialPlaceBubble({ box: { w: 560, h: 576 }, size: { w: 160, h: 40 }, anchor: { x: 600, y: 500, w: 120, h: 52 }, avoid: [{ x: 600, y: 500, w: 120, h: 52 }] });
  assert.ok(right.x + right.w <= 560 - 8 && right.x >= 8 && right.x + right.w > 560 - 8 - 200 && ['right', 'bottom'].includes(right.tail.edge), JSON.stringify(right));
  // 가리킬 칸이 없으면(버튼 바깥 등) 꼬리 없이 위쪽 가장자리
  const none = E.tutorialPlaceBubble({ box: { w: 360, h: 300 }, size: { w: 160, h: 40 }, anchor: null, avoid: [] });
  assert.equal(none.y, 8);
  assert.equal(none.tail, null);
});

/* ---------------- 지도 확대/이동 (js/zoom.js, 보기 전용 계산) ---------------- */
test('확대: 화면 좌표 → 칸 → 화면 좌표 왕복 (배율 1 / 1.5 / 2.5, 여러 이동값, 가장자리·모서리 칸)', () => {
  const geo = { ox: 18, oy: 18, cell: 40, n: 16 }, w = geo.ox + geo.n * geo.cell + 2, h = w;
  const pans = [[0, 0], [-1e4, -1e4], [-123.4, -77.7], [50, 50], [-300, 0]];
  const edge = [];
  for (let k = 0; k < geo.n; k++) edge.push([0, k], [geo.n - 1, k], [k, 0], [k, geo.n - 1]);
  for (const z of [1, 1.5, 2.5]) for (const [tx, ty] of pans) {
    const v = E.clampPan({ z, tx, ty }, w, h);
    for (const [r, c] of [...edge, [7, 9], [3, 12]]) {
      const p = E.cellToPoint(v, r, c, geo);
      if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) continue;   // 화면 밖 칸
      assert.deepEqual(JSON.parse(JSON.stringify(E.pointToCell(v, p.x, p.y, geo))), { r, c }, `z${z} ${r},${c}`);
    }
    for (let i = 0; i < 400; i++) {   // 임의의 점: 고른 칸의 화면 사각형 안에 그 점이 있음
      const x = (i * 37.3) % w, y = (i * 53.9) % h, cell = E.pointToCell(v, x, y, geo);
      if (!cell) continue;
      const a = E.frameToScreen(v, geo.ox + cell.c * geo.cell, geo.oy + cell.r * geo.cell);
      assert.ok(x >= a.x - 1e-9 && x < a.x + geo.cell * v.z + 1e-9 && y >= a.y - 1e-9 && y < a.y + geo.cell * v.z + 1e-9, `z${z} (${x},${y})`);
    }
  }
});

test('확대: 이동 제한 (어떤 배율·이동에서도 지도가 뷰포트를 덮음, 배율 1~2.5, 배율 1 은 이동 없음)', () => {
  const w = 700, h = 700;
  for (const z of [0.5, 1, 1.3, 2.5, 4]) for (const t of [-1e5, -500, -1, 0, 1, 500, 1e5]) {
    const v = E.clampPan({ z, tx: t, ty: -t }, w, h);
    assert.ok(v.z >= E.ZOOM.minZoom && v.z <= E.ZOOM.maxZoom);
    assert.ok(v.tx <= 0 && v.tx + w * v.z >= w - 1e-9 && v.ty <= 0 && v.ty + h * v.z >= h - 1e-9, `z${z} t${t}`);
    if (v.z === 1) assert.ok(v.tx === 0 && v.ty === 0);
  }
  // 마우스 위치 기준 확대: 그 점이 가리키는 지도 지점이 그대로
  const v = E.zoomAt({ z: 1, tx: 0, ty: 0 }, 2, 200, 300, w, h), p = E.screenToFrame(v, 200, 300);
  assert.ok(Math.abs(p.x - 200) < 1e-9 && Math.abs(p.y - 300) < 1e-9);
});

test('확대: 끌기/누르기 구분 (8px 미만 = 누르기, 이상 = 끌기)', () => {
  assert.equal(E.ZOOM.dragPx, 8);
  assert.equal(E.isDrag(0, 0), false);
  assert.equal(E.isDrag(7.9, 0), false);
  assert.equal(E.isDrag(5, 6), false);
  assert.equal(E.isDrag(8, 0), true);
  assert.equal(E.isDrag(6, 6), true);
});

test('확대: 두 칸이 모두 보이게 조정 (들어가면 배율 유지, 안 들어가면 필요한 만큼만 축소)', () => {
  const geo = { ox: 18, oy: 18, cell: 40, n: 16 }, w = 700, h = 700;
  const box = (r, c) => ({ x0: geo.ox + c * geo.cell, y0: geo.oy + r * geo.cell, x1: geo.ox + (c + 1) * geo.cell, y1: geo.oy + (r + 1) * geo.cell });
  const inView = (v, b) => { const a = E.frameToScreen(v, b.x0, b.y0), z = E.frameToScreen(v, b.x1, b.y1); return a.x >= -1e-9 && a.y >= -1e-9 && z.x <= w + 1e-9 && z.y <= h + 1e-9; };
  const near = E.fitBoxes({ z: 2.5, tx: 0, ty: 0 }, [box(10, 10), box(11, 12)], w, h, 10);
  assert.equal(near.z, 2.5);
  assert.ok(inView(near, box(10, 10)) && inView(near, box(11, 12)));
  const far = E.fitBoxes({ z: 2.5, tx: 0, ty: 0 }, [box(0, 0), box(15, 15)], w, h, 10);
  assert.ok(far.z < 2.5 && far.z >= 1);
  assert.ok(inView(far, box(0, 0)) && inView(far, box(15, 15)));
});

/* ---------------- 전투 효과 (js/fx.js, 화면 연출 목록. 규칙·난수와 무관) ---------------- */
const fxEv = (o) => ({ type: 'diceRoll', side: 'a', unitType: 'infantry', from: { r: 10, c: 5 }, target: { r: 6, c: 5 }, hit: true, indirect: false, ...o });
const fxAll = (N) => new Set(Array.from({ length: N * N }, (_, i) => i));
const fxVis = (N, cells) => new Set(cells.map(([r, c]) => r * N + c));
const kinds = (plan) => plan.items.map((i) => i.kind);
const fxBase = (o) => ({ me: 'a', N: 16, vis: fxAll(16), dmg: [], dead: [], splash: false, rm: false, seed: 7, ...o });

test('효과: 직접 사격 명중은 대상 위 불꽃·반짝임, 빗나감은 대상 둘레 먼지만 (반짝임 없음)', () => {
  const hit = E.planAttackFx(fxEv({}), fxBase({ dmg: [{ pos: { r: 6, c: 5 } }] }));
  assert.equal(kinds(hit).filter((k) => k === 'tracer').length, 3);
  assert.ok(kinds(hit).includes('sparks'));
  assert.equal(hit.units.length, 1);
  const miss = E.planAttackFx(fxEv({ hit: false }), fxBase({}));
  assert.ok(kinds(miss).includes('dust'));
  assert.ok(!kinds(miss).includes('sparks') && miss.units.length === 0);
  for (const d of miss.items.filter((i) => i.kind === 'dust')) assert.ok(Math.hypot(d.x - 5.5, d.y - 6.5) >= 0.35, '먼지는 유닛 위가 아니라 둘레');
  const armor = E.planAttackFx(fxEv({ unitType: 'armor' }), fxBase({ dmg: [{ pos: { r: 6, c: 5 } }], dead: [{ pos: { r: 6, c: 5 } }] }));
  assert.ok(kinds(armor).includes('blast') && kinds(armor).includes('debris'));
  assert.ok(armor.items.filter((i) => i.kind === 'smoke').length >= 3, '포구 연기 + 폭발 연기 + 격파 연기');
  assert.ok(armor.end <= E.FX.maxAttackMs + 1200 && armor.hitAt <= 400);
});

test('효과: 박격포는 한 칸, 포병은 중심 뒤 주변 4칸이 0.1초 간격 (아군 피해 포함), 흔들림 박격포 < 포병', () => {
  const mo = E.planAttackFx(fxEv({ unitType: 'mortar', indirect: true }), fxBase({ dmg: [{ pos: { r: 6, c: 5 } }] }));
  assert.ok(kinds(mo).includes('shell') && kinds(mo).filter((k) => k === 'blast').length === 1);
  const dmg = [{ pos: { r: 6, c: 5 } }, { pos: { r: 5, c: 5 }, splash: true }, { pos: { r: 6, c: 4 }, splash: true }];
  const ar = E.planAttackFx(fxEv({ unitType: 'artillery', indirect: true }), fxBase({ splash: true, dmg }));
  const blasts = ar.items.filter((i) => i.kind === 'blast').sort((a, b) => a.at - b.at);
  assert.equal(blasts.length, 5);
  for (let k = 1; k < 5; k++) assert.equal(blasts[k].at - blasts[k - 1].at, E.FX.splashGap);
  assert.equal(ar.units.length, 3, '아군·적 구분 없이 보이는 피해 유닛 모두');
  assert.ok(ar.units.find((u) => u.pos.r === 5).at > ar.hitAt);
  const amp = (p, kind) => p.shakes.find((s) => s.kind === kind).amp;
  assert.ok(amp(mo, 'mortarFire') < amp(ar, 'artyFire') && amp(mo, 'mortarLand') < amp(ar, 'artyLand'));
  assert.ok(ar.end - 0 <= E.FX.maxAttackMs + 1200);
  const last = Math.max(...ar.items.filter((i) => i.kind === 'blast').map((i) => i.at + i.ms));
  assert.ok(last <= E.FX.maxAttackMs, '착탄 연출은 1.5초 안');
});

test('효과 안개: 시야 밖 발사는 착탄만, 보이지 않는 곳끼리는 없음, 흔들림 크기는 거리와 무관', () => {
  const N = 16;
  // 적(b) 포병이 시야 밖 (1,5) 에서 시야 안 (12,5) 로
  const vis = fxVis(N, [[12, 5], [11, 5], [13, 5], [12, 4], [12, 6]]);
  const ev = fxEv({ side: 'b', unitType: 'artillery', indirect: true, from: { r: 1, c: 5 }, target: { r: 12, c: 5 } });
  const p = E.planAttackFx(ev, fxBase({ vis, splash: true, dmg: [{ pos: { r: 12, c: 5 } }] }));
  const atSrc = (i) => Math.hypot((i.x ?? i.x1) - 5.5, (i.y ?? i.y1) - 1.5) < 1;
  assert.ok(!p.items.some(atSrc), '발사 칸 근처에 아무것도 그리지 않음');
  assert.ok(!kinds(p).includes('shell') && !kinds(p).includes('ring'), '비행·발사 고리 없음');
  assert.ok(!p.shakes.some((s) => s.kind === 'artyFire'));
  assert.ok(p.shakes.some((s) => s.kind === 'artyLand'));
  assert.ok(p.units.every((u) => u.push === null), '밀림 방향으로 사격 방향을 드러내지 않음');
  // 착탄 시각이 거리와 무관
  const far = E.planAttackFx({ ...ev, from: { r: 0, c: 0 } }, fxBase({ vis, splash: true }));
  assert.equal(far.hitAt, p.hitAt);
  assert.deepEqual(far.shakes.map((s) => s.amp), p.shakes.map((s) => s.amp));
  // 보이지 않는 곳끼리
  const none = E.planAttackFx(fxEv({ side: 'b', unitType: 'mortar', indirect: true, from: { r: 1, c: 1 }, target: { r: 3, c: 3 } }), fxBase({ vis }));
  assert.equal(none.items.length, 0);
  assert.equal(none.shakes.length, 0);
  // 보이는 적이 시야 밖 칸을 쏨: 발사만, 비행·착탄 없음
  const out = E.planAttackFx(fxEv({ side: 'b', unitType: 'armor', from: { r: 12, c: 5 }, target: { r: 2, c: 2 } }), fxBase({ vis }));
  assert.ok(kinds(out).includes('flash') && !kinds(out).includes('tracer') && !kinds(out).includes('blast'));
  // 내 사격이 안개 속에 떨어짐: 명중/빗나감이 같은 모양
  const mv = fxVis(N, [[12, 5]]);
  const mk = (hit) => E.planAttackFx(fxEv({ unitType: 'artillery', indirect: true, from: { r: 12, c: 5 }, target: { r: 6, c: 5 }, hit }), fxBase({ vis: mv, splash: true }));
  const shape = (pl) => JSON.stringify(pl.items.map((i) => [i.kind, i.at, i.x && +i.x.toFixed(3), i.r]));
  assert.equal(shape(mk(true)), shape(mk(false)));
});

test('효과 난수: 연출 목록은 Math.random 을 쓰지 않고, 만든 뒤에도 시드 고정 시뮬레이션 결과가 같음', () => {
  E.loadScenario('symmetric');
  const before = JSON.stringify(E.simulateGames(2));
  run('globalThis.__fxR = Math.random; Math.random = () => { throw new Error("fx used Math.random"); }');
  try {
    for (let s = 1; s < 40; s++) E.planAttackFx(fxEv({ unitType: s % 2 ? 'artillery' : 'infantry', indirect: s % 2 === 1, hit: s % 3 > 0 }), fxBase({ seed: s, splash: s % 2 === 1, dmg: [{ pos: { r: 6, c: 5 } }] }));
  } finally { run('Math.random = globalThis.__fxR'); }
  assert.equal(JSON.stringify(E.simulateGames(2)), before);
  const a = E.fxRng(5), b = E.fxRng(5);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

/* ---------------- 메뉴 (js/menu.js, 화면 구성 계산) ---------------- */
const jsonEq = (x, y, msg) => assert.equal(JSON.stringify(x), JSON.stringify(y), msg);   // vm 경계를 넘는 객체 비교
const memStore = (o) => () => ({ getItem: (k) => (k in o ? o[k] : null) });
const menuIds = (m) => m.items.map((i) => i.id + (i.primary ? '*' : '')).join(',');

test('메뉴: 저장 판이 있으면 이어하기가 맨 위·강조, 없으면 숨고 새 게임이 강조', () => {
  const save = { scenarioId: 'hostomel', round: 3, maxRounds: 12, mode: 'ai' };
  assert.equal(menuIds(E.menuModel({ save, firstRun: false, tutorialSteps: 8 })), 'continue*,new,tutorial');
  assert.equal(menuIds(E.menuModel({ save: null, firstRun: false, tutorialSteps: 8 })), 'new*,tutorial');
  jsonEq(E.menuModel({ save: null, firstRun: false, tutorialSteps: 8 }).secondary, ['rules', 'settings']);
  assert.equal(menuIds(E.menuModel({ save: null, firstRun: false, tutorialSteps: 0 })), 'new*', '튜토리얼이 없으면 버튼도 없음');
});

test('메뉴: 처음 실행이면 튜토리얼이 맨 위·강조, 튜토리얼을 해 봤거나 판을 끝낸 기록이 있으면 일반 순서', () => {
  const first = E.readMenuStore(memStore({}));
  jsonEq(first, { ok: true, firstRun: true, save: null });
  assert.equal(menuIds(E.menuModel({ ...first, tutorialSteps: 8 })), 'tutorial*,new');
  const seen = E.readMenuStore(memStore({ [E.MENU_KEYS.tutorial]: JSON.stringify({ seen: true, done: ['s1'] }) }));
  assert.equal(seen.firstRun, false);
  assert.equal(menuIds(E.menuModel({ ...seen, tutorialSteps: 8 })), 'new*,tutorial');
  const played = E.readMenuStore(memStore({ [E.MENU_KEYS.records]: JSON.stringify({ normal: [{ winner: 'south' }] }) }));
  assert.equal(played.firstRun, false);
});

test('메뉴: 저장소를 못 읽으면 "저장 없음, 처음 아님"으로 열림. 저장 판 요약은 공개 정보만', () => {
  const blocked = E.readMenuStore(() => { throw new Error('blocked'); });
  jsonEq(blocked, { ok: false, firstRun: false, save: null });
  assert.equal(menuIds(E.menuModel({ ...blocked, tutorialSteps: 8 })), 'new*,tutorial');
  const broken = E.readMenuStore(memStore({ [E.MENU_KEYS.tutorial]: '{not json' }));
  assert.equal(broken.ok, false);
  const raw = { scenarioId: 'symmetric', round: 4, maxRounds: 14, mode: 'hotseat', turn: 'ua', state: { units: [{ id: 'r1', r: 1, c: 1 }] }, logs: ['x'] };
  const s = E.readMenuStore(memStore({ [E.MENU_KEYS.save]: JSON.stringify(raw) })).save;
  jsonEq(s, { scenarioId: 'symmetric', round: 4, maxRounds: 14, mode: 'hotseat', draft: 'default', turn: 'ua', rulesUpdated: true }, '유닛 위치·로그는 요약에 없음. 옛 저장은 편성 기본');
  const dr = E.readMenuStore(memStore({ [E.MENU_KEYS.save]: JSON.stringify({ ...raw, draft: 'custom', draftComps: { ua: { armor: 6 } } }) })).save;
  assert.equal(dr.draft, 'custom'); assert.ok(!JSON.stringify(dr).includes('armor'), '편성 내용은 메뉴 요약에 없음');
  const ai = E.readMenuStore(memStore({ [E.MENU_KEYS.save]: JSON.stringify({ ...raw, mode: 'ai' }) })).save;
  assert.equal(ai.turn, null, 'AI 대전은 차례 표시 없음');
});

test('메뉴: 시나리오 카드는 데이터에서 이름·설명·태그(최대 3개)를 읽고, 문구가 두 언어에 모두 있음', () => {
  const shown = E.SCENARIOS.filter((s) => !s.hidden);
  assert.ok(shown.length >= 3);
  for (const sc of shown) {
    const m = E.scenarioCardModel(sc);
    assert.equal(m.nameKey, sc.nameKey);
    assert.equal(m.descKey, sc.summaryKey || sc.descKey);
    assert.ok(m.tagKeys.length >= 1 && m.tagKeys.length <= 3, sc.id);
    jsonEq(m.tagKeys, sc.tags.slice(0, 3).map((k) => 'tag.' + k));
    assert.equal(m.hasArt, !!(sc.art && sc.art.terrain));
    for (const lang of ['ko', 'en']) for (const k of [m.nameKey, m.descKey, ...m.tagKeys]) assert.ok(run('STRINGS')[lang][k], `${lang} ${k}`);
  }
  assert.equal(E.scenarioCardModel({ id: 'x', nameKey: 'n', descKey: 'd', tags: ['a', 'b', 'c', 'd'] }).tagKeys.length, 3);
  for (const lang of ['ko', 'en']) for (const k of ['gameTitle', 'gameSubtitle']) assert.ok(run('STRINGS')[lang][k], `${lang} ${k}`);
  assert.ok(!/춘천|Chuncheon|1950/.test(run('STRINGS').ko.gameTitle + run('STRINGS').en.gameTitle), '게임 제목에 시나리오 이름 없음');
});

/* ---------------- 소리 (js/audio.js 관리자 + js/fx.js 의 소리 시점). AudioContext 는 목(mock) ---------------- */
const sndIds = (plan) => plan.sounds.map((s) => s.id);
/** 목 AudioContext: 재생 호출만 기록 */
function mockAudioEnv(o = {}) {
  const log = { started: [], stopped: [], warns: [], fetched: [], saved: null };
  let clock = 0;
  const gainNode = () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} });
  const ctx = {
    state: 'suspended', currentTime: 0, destination: {},
    resume() { ctx.state = 'running'; }, suspend() { ctx.state = 'suspended'; },
    createGain: gainNode,
    createBufferSource() { const s = { buffer: null, loop: false, connect() {}, start(at, off) { log.started.push({ url: s.buffer.url, loop: s.loop, loopStart: s.loopStart, loopEnd: s.loopEnd, off }); }, stop() { log.stopped.push(s.buffer.url); } }; return s; },
    decodeAudioData: async (data) => ({ url: data.url, duration: 10 }),
  };
  const missing = new Set(o.missing || []);
  const env = {
    makeContext: () => ctx,
    fetchFile: async (url) => { log.fetched.push(url); if (o.blocked) throw new Error('blocked'); return missing.has(url) || (o.only && !o.only.includes(url)) ? null : { url }; },
    now: () => clock, warn: (m) => log.warns.push(m), seed: 3,
    store: o.store || { get: () => null, set: (v) => { log.saved = v; } },
  };
  return { env, log, ctx, tick: (ms) => { clock += ms; } };
}

test('소리 시점: 병종별 발사·명중·빗나감·격파, 박격포, 포병(중심 + 주변 4칸 0.1초 간격)', () => {
  const dmg = [{ pos: { r: 6, c: 5 } }];
  jsonEq(sndIds(E.planAttackFx(fxEv({}), fxBase({ dmg }))), ['fire_rifle', 'hit_small']);
  jsonEq(sndIds(E.planAttackFx(fxEv({ unitType: 'armor' }), fxBase({ dmg, dead: dmg }))), ['fire_tank', 'hit_big', 'unit_destroyed']);
  jsonEq(sndIds(E.planAttackFx(fxEv({ unitType: 'antitank', hit: false }), fxBase({}))), ['fire_at', 'miss_dirt']);
  const hit = E.planAttackFx(fxEv({}), fxBase({ dmg }));
  assert.equal(hit.sounds[0].at, 0);
  assert.equal(hit.sounds[1].at, hit.hitAt, '명중 소리는 착탄(번쩍임) 시점');
  jsonEq(sndIds(E.planAttackFx(fxEv({ unitType: 'mortar', indirect: true }), fxBase({ dmg }))), ['mortar_fire', 'shell_whistle', 'mortar_impact']);
  const ar = E.planAttackFx(fxEv({ unitType: 'artillery', indirect: true }), fxBase({ splash: true, dmg }));
  jsonEq(sndIds(ar), ['artillery_fire', 'shell_whistle', 'artillery_impact', 'mortar_impact', 'mortar_impact', 'mortar_impact', 'mortar_impact']);
  const nb = ar.sounds.filter((s) => s.id === 'mortar_impact').map((s) => s.at), c = ar.sounds.find((s) => s.id === 'artillery_impact').at;
  jsonEq(nb.map((x) => x - c), [1, 2, 3, 4].map((k) => k * E.FX.splashGap));
  assert.equal(E.moveSoundOf('infantry'), 'move_infantry');
  for (const ty of ['armor', 'recon', 'signal']) assert.equal(E.moveSoundOf(ty), 'move_vehicle');
  for (const p of [hit, ar]) for (const s of p.sounds) jsonEq(Object.keys(s).sort(), ['at', 'id'], '소리에는 위치·거리·크기 값이 없음');
});

test('소리 안개: 시야 밖 발사는 낙하 폭발만, 보이지 않는 대상의 명중·빗나감·격파 소리 없음, 거리와 무관', () => {
  const N = 16, vis = fxVis(N, [[12, 5], [11, 5], [13, 5], [12, 4], [12, 6]]);
  const ev = fxEv({ side: 'b', unitType: 'artillery', indirect: true, from: { r: 1, c: 5 }, target: { r: 12, c: 5 } });
  const p = E.planAttackFx(ev, fxBase({ vis, splash: true, dmg: [{ pos: { r: 12, c: 5 } }] }));
  assert.ok(sndIds(p).every((id) => id === 'artillery_impact' || id === 'mortar_impact'), sndIds(p).join());
  assert.ok(sndIds(p).includes('artillery_impact'));
  const far = E.planAttackFx({ ...ev, from: { r: 0, c: 0 } }, fxBase({ vis, splash: true, dmg: [{ pos: { r: 12, c: 5 } }] }));
  jsonEq(far.sounds, p.sounds, '발사 위치가 달라도 소리 목록과 시각이 같음');
  // 시야 밖 박격포가 시야 안으로: 낙하 소리만
  jsonEq(sndIds(E.planAttackFx(fxEv({ side: 'b', unitType: 'mortar', indirect: true, from: { r: 1, c: 1 }, target: { r: 12, c: 5 } }), fxBase({ vis }))), ['mortar_impact']);
  // 보이지 않는 곳끼리: 소리 없음
  jsonEq(sndIds(E.planAttackFx(fxEv({ side: 'b', unitType: 'armor', from: { r: 1, c: 1 }, target: { r: 3, c: 3 } }), fxBase({ vis }))), []);
  // 보이는 적이 시야 밖 칸을 직접 사격: 발사 소리만 (명중·빗나감·격파 없음)
  for (const hit of [true, false]) jsonEq(sndIds(E.planAttackFx(fxEv({ side: 'b', unitType: 'armor', from: { r: 12, c: 5 }, target: { r: 2, c: 2 }, hit }), fxBase({ vis }))), ['fire_tank']);
  // 시야 밖 적이 보이는 내 유닛을 직접 사격: 발사 소리 없이 명중 소리만
  jsonEq(sndIds(E.planAttackFx(fxEv({ side: 'b', from: { r: 1, c: 1 }, target: { r: 12, c: 5 } }), fxBase({ vis, dmg: [{ pos: { r: 12, c: 5 } }] }))), ['hit_small']);
  // 내 포병이 안개 속을 쏨: 명중·빗나감이 같은 소리
  const mv = fxVis(N, [[12, 5]]);
  const mk = (hit) => JSON.stringify(E.planAttackFx(fxEv({ unitType: 'artillery', indirect: true, from: { r: 12, c: 5 }, target: { r: 6, c: 5 }, hit }), fxBase({ vis: mv, splash: true })).sounds);
  assert.equal(mk(true), mk(false));
});

test('소리 관리자: 첫 입력 전에는 무음, 동시 재생 상한(전체 8·같은 소리 3), 0.05초 중복 방지, 볼륨은 설정으로만', async () => {
  const m = mockAudioEnv();
  const a = E.createAudio(m.env);
  assert.equal(a.play('ui_click'), null, '첫 입력 전에는 재생하지 않음');
  assert.equal(m.log.fetched.length, 0, '첫 입력 전에는 로딩도 하지 않음');
  a.unlock();
  await a.whenLoaded();
  assert.equal(m.ctx.state, 'running');
  jsonEq(m.log.fetched.slice(0, 4), ['sound/ui_click.wav', 'sound/ui_cancel.wav', 'sound/ui_error.wav', 'sound/ui_turn_end.wav'], 'UI 소리부터 로딩');
  assert.ok(a.play('ui_click'));
  assert.equal(a.play('ui_click'), null, '0.05초 안의 같은 소리는 한 번만');
  m.tick(60);
  assert.ok(a.play('ui_click'));
  m.tick(60); a.play('ui_click'); m.tick(60); a.play('ui_click');
  assert.equal(a.stats().ids.filter((x) => x === 'ui_click').length, 3, '같은 소리는 3개까지');
  for (const id of ['fire_rifle', 'fire_tank', 'fire_at', 'hit_small', 'hit_big', 'miss_dirt', 'mortar_fire', 'artillery_fire']) { m.tick(60); a.play(id); }
  assert.equal(a.stats().voices, 8, '전체 8개까지');
  assert.ok(m.log.stopped.length >= 4, '넘친 것은 오래된 것부터 끔');
  // 볼륨: 종류와 설정으로만 (재생 함수는 소리 이름만 받음)
  assert.equal(a.play.length, 1);
  jsonEq(a.levels(), { sfx: 0.8, music: 0.5 * E.AUDIO.musicCeil });
  assert.ok(a.levels().music < a.levels().sfx, '음악 최대치는 효과음보다 낮음');
  a.setMuted(true);
  jsonEq(a.levels(), { sfx: 0, music: 0 });
  assert.equal(a.stats().voices, 0, '음소거하면 재생 중인 효과음도 멈춤');
  m.tick(60);
  assert.equal(a.play('ui_click'), null);
  a.setMuted(false); a.setSfxOn(false);
  assert.equal(a.play('fire_rifle'), null);
  a.setSfxOn(true); a.setSfxVolume(0.3);
  assert.equal(a.levels().sfx, 0.3);
  assert.equal(m.log.saved.sfx, 0.3, '마지막 설정 저장');
  // 탭이 가려지면 멈춤
  m.tick(60); a.play('ui_click');
  a.setHidden(true);
  assert.equal(a.stats().voices, 0);
  assert.equal(m.ctx.state, 'suspended');
  assert.equal(a.play('ui_click'), null);
  a.setHidden(false);
  assert.equal(m.ctx.state, 'running');
});

test('소리 관리자: 파일이 없거나 저장소·읽기가 막혀도 오류 없이 조용히, 음악은 루프 구간으로 반복', async () => {
  // 특정 소리 누락 + 목록이 빈 소리
  const m = mockAudioEnv({ missing: ['sound/hit_big.wav'] });
  const a = E.createAudio(m.env);
  a.unlock();
  await a.whenLoaded();
  assert.equal(a.play('hit_big'), null);
  assert.equal(a.play('shell_whistle'), null, '파일이 아직 없는 소리');
  assert.equal(a.play('no_such_sound'), null);
  assert.equal(m.log.warns.length, 1, '누락 파일마다 경고 한 줄');
  assert.ok(a.play('hit_small'));
  // 음악: 없는 파일 → 조용히, 있는 파일 → 루프 (확장자 m4a → mp3 → wav 순)
  const m1 = mockAudioEnv({ only: [] });
  const n = E.createAudio(m1.env);
  n.unlock();
  n.setBgm('sound/bgm_none', [0, 0]);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(n.stats().bgm, null);
  jsonEq(m1.log.fetched.filter((u) => u.includes('bgm_none')), ['sound/bgm_none.m4a', 'sound/bgm_none.mp3', 'sound/bgm_none.wav']);
  assert.equal(m1.log.warns.filter((w) => w.includes('bgm_none')).length, 1);
  const m2 = mockAudioEnv({ only: ['sound/bgm_x.mp3'] });
  const b = E.createAudio(m2.env);
  b.setBgm('sound/bgm_x', [0.5, 1.5]);            // 첫 입력 전: 대기만
  assert.equal(m2.log.started.length, 0);
  b.unlock();
  await b.whenLoaded();
  await new Promise((r) => setTimeout(r, 5));
  jsonEq(m2.log.fetched.filter((u) => u.includes('bgm_x')), ['sound/bgm_x.m4a', 'sound/bgm_x.mp3']);
  const st = m2.log.started.find((s) => s.loop);
  jsonEq({ loop: st.loop, loopStart: st.loopStart, loopEnd: st.loopEnd, off: st.off }, { loop: true, loopStart: 0.5, loopEnd: 8.5, off: 0.5 });
  assert.equal(b.stats().bgm, 'sound/bgm_x');
  // 저장소가 오류를 내도 동작
  const m3 = mockAudioEnv({ store: { get() { throw new Error('blocked'); }, set() { throw new Error('blocked'); } } });
  const c = E.createAudio(m3.env);
  c.setSfxVolume(0.4);
  assert.equal(c.settings().sfx, 0.4);
  // 읽기 자체가 막힌 환경 (file://): 오류 없이 무음 (브라우저에서는 오디오 태그로 대체)
  const m4 = mockAudioEnv({ blocked: true });
  const d = E.createAudio(m4.env);
  d.unlock();
  await d.whenLoaded();
  assert.equal(d.play('ui_click'), null);
  // AudioContext 가 없는 환경
  const e = E.createAudio({ makeContext: () => null, fetchFile: async () => null });
  e.unlock();
  await e.whenLoaded();
  assert.equal(e.play('ui_click'), null);
});

test('소리 난수·데이터: Math.random 을 쓰지 않고 시드 결과가 같음. 시나리오에 bgm 필드, 소리 목록은 sound/ 의 실제 파일', async () => {
  E.loadScenario('symmetric');
  const before = JSON.stringify(E.simulateGames(2));
  run('globalThis.__auR = Math.random; Math.random = () => { throw new Error("audio used Math.random"); }');
  try {
    const m = mockAudioEnv();
    const a = E.createAudio(m.env);
    a.unlock();
    await a.whenLoaded();
    for (let k = 0; k < 20; k++) { m.tick(60); a.play(k % 2 ? 'fire_rifle' : 'ui_click'); }
  } finally { run('Math.random = globalThis.__auR'); }
  assert.equal(JSON.stringify(E.simulateGames(2)), before);
  for (const sc of E.SCENARIOS.filter((s) => !s.hidden)) {
    assert.ok('bgm' in sc && (sc.bgm === null || typeof sc.bgm === 'string'), sc.id);
    assert.equal(sc.bgmLoopTrim.length, 2);
  }
  const onDisk = new Set(fs.readdirSync(path.join(ROOT, 'sound')));
  const listed = Object.values(E.AUDIO.files).flat();
  for (const f of listed) assert.ok(onDisk.has(f), `sound/${f} 없음`);
  for (const f of onDisk) if (/\.(wav|mp3|m4a)$/.test(f) && !/^bgm/.test(f)) assert.ok(listed.includes(f), `sound/${f} 가 소리 목록에 없음`);
  for (const id of E.AUDIO.loadOrder) assert.ok(id in E.AUDIO.files, id);
});

/* ---------------- 후퇴·제압 (규칙 v12, 모든 시나리오 공통) ---------------- */
const HIT = () => 0, MISS = () => 0.999;
const evOf = (ev, type) => [...ev].filter((e) => e.type === type);   // vm 안 배열 → 일반 배열
const pos = (u) => `${u.r},${u.c}`;
const RT_SCENS = ['symmetric', 'hostomel', 'chuncheon', 'vuhledar'];

/** 대칭 전장 시험 상태 (AI 시험이 씀): 어느 쪽도 전멸하지 않도록 구석에 보병 한 명씩 */
function rtState(turn = 'ru') {
  const st = fresh('symmetric');
  st.units = [];
  st.turn = turn; st.round = 2;
  E.startTurn(st);
  put(st, { id: 'RFAR', side: 'ru', type: 'infantry', r: 0, c: 0 });
  put(st, { id: 'UFAR', side: 'ua', type: 'infantry', r: 15, c: 15 });
  return st;
}

/** 시나리오 지도에서 시험 구역을 찾음 (칸 좌표는 시나리오 데이터가 아니라 지도에서 읽음):
 *  open  = 십자 모양으로 둘레가 평지인 칸 (열린 곳), edge = 맨 아래 세 줄이 평지인 열 c,
 *  paddy = 위가 평지·아래가 기갑이 못 들어가는 지형인 평지 칸 (없으면 null) */
function rtLocate(id) {
  E.loadScenario(id);
  const M = C().MAP, n = M.length;
  const plain = (r, c) => r >= 0 && r < n && c >= 0 && c < n && M[r][c] === '.';
  const blockedForArmor = (r, c) => r >= 0 && r < n && c >= 0 && c < n && ((C().TERRAIN[M[r][c]].impassableFor || []).includes('armor'));
  let open = null, edge = null, paddy = null;
  // 열린 칸: (r,c) 와 그 위 1칸, 아래 3칸, 왼쪽 3칸, 오른쪽 2칸이 모두 평지 (공격자·연속 후퇴·포병 사거리 3 에 필요한 칸)
  for (let r = 2; r < n - 3 && !open; r++) for (let c = 3; c < n - 2 && !open; c++) {
    let ok = true;
    for (let dr = -1; dr <= 3 && ok; dr++) if (!plain(r + dr, c)) ok = false;
    for (let dc = -3; dc <= 2 && ok; dc++) if (!plain(r, c + dc)) ok = false;
    if (ok) open = { r, c };
  }
  for (let c = 1; c < n - 1 && !edge; c++) if (plain(n - 1, c) && plain(n - 2, c) && plain(n - 3, c) && plain(n - 4, c)) edge = { r: n - 1, c };
  // 기갑 후퇴 막힘: 평지 칸 (r,c), 그 앞(공격자 쪽)이 평지, 뒤가 기갑이 못 들어가는 지형인 방향 (dr,dc)
  for (let r = 0; r < n && !paddy; r++) for (let c = 0; c < n && !paddy; c++) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (plain(r, c) && plain(r - dr, c - dc) && blockedForArmor(r + dr, c + dc)) { paddy = { r, c, dr, dc }; break; }
    }
  }
  return { n, open, edge, paddy };
}

/** 시나리오 id 의 시험 상태: 유닛 없음, 첫 진영 차례. A = 이번 턴 진영(공격), B = 상대(맞는 쪽). 양쪽 구석에 보병 한 명씩 (전멸 방지) */
function gState(id) {
  const loc = rtLocate(id);
  const st = E.createInitialState();
  st.units = [];
  E.startTurn(st);
  const [A, B] = C().ROUND_ORDER;
  const far = (side, r, c) => put(st, { id: `${side[0].toUpperCase()}FAR`, side, type: 'infantry', r, c });
  far(A, 0, 0); far(B, loc.n - 1, loc.n - 1);
  return { st, loc, A, B, id: (s, k) => `${s[0].toUpperCase()}${k}` };
}

for (const sid of RT_SCENS) {
  test(`[${sid}] 후퇴: 직접 사격을 맞으면 공격자 반대 방향으로 1칸 (세로·가로), 행동 상태는 그대로, 공격자는 안 움직임`, () => {
    const g = gState(sid), { st, loc, A, B } = g, { r, c } = loc.open;
    const a = put(st, { id: g.id(A, 1), side: A, type: 'infantry', r: r - 1, c });
    const d = put(st, { id: g.id(B, 1), side: B, type: 'infantry', r, c });
    const ev = E.resolveAttack(st, a.id, { r, c }, HIT);
    assert.equal(pos(d), `${r + 1},${c}`);
    assert.equal(d.hp, C().MAX_HP - 1);
    assert.deepEqual(evOf(ev, 'retreat').map((e) => [e.unitId, e.from.r, e.from.c, e.to.r, e.to.c]), [[d.id, r, c, r + 1, c]]);
    assert.equal(d.moved, false); assert.equal(d.acted, false);
    assert.equal(pos(a), `${r - 1},${c}`);
    const g2 = gState(sid), a2 = put(g2.st, { id: g2.id(A, 1), side: A, type: 'infantry', r, c: c - 1 });
    const d2 = put(g2.st, { id: g2.id(B, 1), side: B, type: 'infantry', r, c });
    E.resolveAttack(g2.st, a2.id, { r, c }, HIT);
    assert.equal(pos(d2), `${r},${c + 1}`, '가로 방향');
  });

  test(`[${sid}] 후퇴: 빗나감·격파는 후퇴하지 않음`, () => {
    const g = gState(sid), { st, loc, A, B } = g, { r, c } = loc.open;
    const a = put(st, { id: g.id(A, 1), side: A, type: 'infantry', r: r - 1, c });
    const d = put(st, { id: g.id(B, 1), side: B, type: 'infantry', r, c });
    const ev = E.resolveAttack(st, a.id, { r, c }, MISS);
    assert.equal(evOf(ev, 'retreat').length, 0); assert.equal(pos(d), `${r},${c}`);
    const g2 = gState(sid), a2 = put(g2.st, { id: g2.id(A, 1), side: A, type: 'infantry', r: r - 1, c });
    put(g2.st, { id: g2.id(B, 1), side: B, type: 'infantry', r, c, hp: 1 });
    const ev2 = E.resolveAttack(g2.st, a2.id, { r, c }, HIT);
    assert.equal(evOf(ev2, 'destroyed').length, 1); assert.equal(evOf(ev2, 'retreat').length, 0);
  });

  test(`[${sid}] 후퇴 막힘: 맵 끝·적 유닛·이동 불가 지형은 격파, 아군은 지나서 뒤로, 도착 칸이 막히면 격파`, () => {
    const loc0 = rtLocate(sid);
    const play = (cfg) => {
      const g = gState(sid);
      const base = cfg.at(g.loc);
      const a = put(g.st, { id: g.id(g.A, 1), side: g.A, type: 'infantry', r: base.ar, c: base.ac });
      const d = put(g.st, { id: g.id(g.B, 1), side: g.B, type: cfg.type || 'infantry', r: base.dr, c: base.dc });
      (base.extra || []).forEach((x, i) => put(g.st, { id: g.id(x.side === 'A' ? g.A : g.B, 10 + i), side: x.side === 'A' ? g.A : g.B, type: 'infantry', r: x.r, c: x.c }));
      const ev = E.resolveAttack(g.st, a.id, { r: base.dr, c: base.dc }, HIT);
      return { d, ev };
    };
    const causes = (k) => evOf(k.ev, 'destroyed').map((e) => e.cause);
    const col = loc0.open;
    // 맵 끝
    let k = play({ at: (l) => ({ ar: l.n - 2, ac: l.edge.c, dr: l.n - 1, dc: l.edge.c }) });
    assert.deepEqual(causes(k), ['retreatBlocked'], '맵 끝');
    // 뒤가 적
    k = play({ at: (l) => ({ ar: l.open.r - 1, ac: l.open.c, dr: l.open.r, dc: l.open.c, extra: [{ side: 'A', r: l.open.r + 1, c: l.open.c }] }) });
    assert.deepEqual(causes(k), ['retreatBlocked'], '뒤가 적');
    // 아군 한 명 · 두 명을 지남
    k = play({ at: (l) => ({ ar: l.open.r - 1, ac: l.open.c, dr: l.open.r, dc: l.open.c, extra: [{ side: 'B', r: l.open.r + 1, c: l.open.c }] }) });
    assert.equal(pos(k.d), `${col.r + 2},${col.c}`); assert.equal(causes(k).length, 0);
    k = play({ at: (l) => ({ ar: l.open.r - 1, ac: l.open.c, dr: l.open.r, dc: l.open.c, extra: [{ side: 'B', r: l.open.r + 1, c: l.open.c }, { side: 'B', r: l.open.r + 2, c: l.open.c }] }) });
    assert.equal(pos(k.d), `${col.r + 3},${col.c}`);
    // 아군을 지난 도착 칸이 맵 밖 / 적
    k = play({ at: (l) => ({ ar: l.n - 3, ac: l.edge.c, dr: l.n - 2, dc: l.edge.c, extra: [{ side: 'B', r: l.n - 1, c: l.edge.c }] }) });
    assert.deepEqual(causes(k), ['retreatBlocked'], '도착 칸이 맵 밖');
    k = play({ at: (l) => ({ ar: l.open.r - 1, ac: l.open.c, dr: l.open.r, dc: l.open.c, extra: [{ side: 'B', r: l.open.r + 1, c: l.open.c }, { side: 'A', r: l.open.r + 2, c: l.open.c }] }) });
    assert.deepEqual(causes(k), ['retreatBlocked'], '도착 칸이 적');
    // 기갑 뒤가 이동 불가 지형 (이 지도에 그런 곳이 있을 때), 아군을 지나가는 칸이 이동 불가 지형이어도 막힘
    assert.ok(loc0.paddy, `${sid} 지도에 기갑이 못 들어가는 지형 시험 구역이 있어야 함`);
    {
      k = play({ type: 'armor', at: (l) => ({ ar: l.paddy.r - l.paddy.dr, ac: l.paddy.c - l.paddy.dc, dr: l.paddy.r, dc: l.paddy.c }) });
      assert.deepEqual(causes(k), ['retreatBlocked'], '기갑 뒤가 이동 불가 지형');
      k = play({ type: 'armor', at: (l) => ({ ar: l.paddy.r - l.paddy.dr, ac: l.paddy.c - l.paddy.dc, dr: l.paddy.r, dc: l.paddy.c, extra: [{ side: 'B', r: l.paddy.r + l.paddy.dr, c: l.paddy.c + l.paddy.dc }] }) });
      assert.deepEqual(causes(k), ['retreatBlocked'], '지나가는 칸이 이동 불가 지형');
    }
  });

  test(`[${sid}] 포병: 정중앙은 제압, 주변 4칸은 폭발에서 멀어지는 방향으로 후퇴, 아군 오사는 후퇴·제압 없음`, () => {
    const g = gState(sid), { st, loc, A, B } = g, { r, c } = loc.open;
    const art = put(st, { id: g.id(A, 1), side: A, type: 'artillery', r, c: c - 3 });
    const mk = (k, dr, dc) => put(st, { id: g.id(B, k), side: B, type: 'infantry', r: r + dr, c: c + dc });
    const ctr = mk(2, 0, 0), up = mk(3, -1, 0), dn = mk(4, 1, 0), lf = mk(5, 0, -1), rt = mk(6, 0, 1);
    const ev = E.resolveAttack(st, art.id, { r, c }, HIT);
    assert.equal(pos(ctr), `${r},${c}`); assert.equal(ctr.suppressed, 1);
    assert.deepEqual([pos(up), pos(dn), pos(lf), pos(rt)], [`${r - 2},${c}`, `${r + 2},${c}`, `${r},${c - 2}`, `${r},${c + 2}`]);
    assert.equal(evOf(ev, 'suppressed').length, 1); assert.equal(evOf(ev, 'retreat').length, 4);
    for (const u of [up, dn, lf, rt]) assert.ok(!u.suppressed);
    // 아군 오사: 자기 진영 포병이 아군을 맞힘 (상대는 후퇴)
    const g2 = gState(sid);
    g2.st.turn = g2.B;
    const art2 = put(g2.st, { id: g2.id(g2.B, 1), side: g2.B, type: 'artillery', r, c: c - 3 });
    const f1 = put(g2.st, { id: g2.id(g2.B, 2), side: g2.B, type: 'infantry', r, c });
    const f2 = put(g2.st, { id: g2.id(g2.B, 3), side: g2.B, type: 'infantry', r: r - 1, c });
    const en = put(g2.st, { id: g2.id(g2.A, 4), side: g2.A, type: 'infantry', r: r + 1, c });
    E.resolveAttack(g2.st, art2.id, { r, c }, HIT);
    assert.equal(pos(f1), `${r},${c}`); assert.ok(!f1.suppressed); assert.equal(pos(f2), `${r - 1},${c}`);
    assert.ok(f1.hp < C().MAX_HP, '오사 피해 자체는 받음');
    assert.equal(pos(en), `${r + 2},${c}`, '적은 후퇴');
  });

  test(`[${sid}] 박격포: 직격은 제압(후퇴 없음), 제압 중 재직격은 체력이 남아도 격파, 제압 중 직접 사격은 후퇴하고 제압 유지`, () => {
    const g = gState(sid), { st, loc, A, B } = g, { r, c } = loc.open;
    const m = put(st, { id: g.id(A, 1), side: A, type: 'mortar', r, c: c - 3 });
    const d = put(st, { id: g.id(B, 1), side: B, type: 'infantry', r, c });
    E.resolveAttack(st, m.id, { r, c }, HIT);
    assert.equal(pos(d), `${r},${c}`); assert.equal(d.suppressed, 1); assert.equal(d.hp, C().MAX_HP - 1);
    const a = put(st, { id: g.id(A, 2), side: A, type: 'infantry', r: r - 1, c });
    E.resolveAttack(st, a.id, { r, c }, HIT);
    assert.equal(pos(d), `${r + 1},${c}`); assert.equal(d.suppressed, 1, '제압은 유지');
    const hpBefore = d.hp;
    const m2 = put(st, { id: g.id(A, 3), side: A, type: 'mortar', r: r + 1, c: c - 3 });
    const ev = E.resolveAttack(st, m2.id, { r: r + 1, c }, HIT);
    assert.ok(hpBefore - 1 > 0, '체력이 남은 채');
    assert.deepEqual(evOf(ev, 'destroyed').map((e) => [e.unitId, e.cause]), [[d.id, 'resuppressed']]);
    assert.ok(!st.units.includes(d));
  });

  test(`[${sid}] 후퇴는 행동으로 세지 않음 (활성화 한도·이동 상태), 연속으로 맞으면 맞은 횟수만큼 후퇴하다 맵 끝에서 사라짐`, () => {
    const g = gState(sid), { st, loc, A, B } = g, { r, c } = loc.edge;
    const used = st.act ? st.act.used : 0;
    const col = c;
    const d = put(st, { id: g.id(B, 1), side: B, type: 'infantry', r: loc.n - 3, c: col });
    const a1 = put(st, { id: g.id(A, 1), side: A, type: 'infantry', r: loc.n - 4, c: col });
    E.resolveAttack(st, a1.id, { r: loc.n - 3, c: col }, HIT);
    assert.equal(pos(d), `${loc.n - 2},${col}`);
    if (st.act) { assert.equal(st.act.used, used + 1, '공격한 쪽만 행동으로 셈'); assert.ok(!st.act.ids.includes(d.id)); }
    assert.equal(d.moved, false);
    const a2 = put(st, { id: g.id(A, 2), side: A, type: 'infantry', r: loc.n - 3, c: col });
    E.resolveAttack(st, a2.id, { r: loc.n - 2, c: col }, HIT);
    assert.equal(pos(d), `${loc.n - 1},${col}`, '연속 후퇴');
    const a3 = put(st, { id: g.id(A, 3), side: A, type: 'infantry', r: loc.n - 2, c: col });
    const ev = E.resolveAttack(st, a3.id, { r: loc.n - 1, c: col }, HIT);
    assert.equal(evOf(ev, 'destroyed').length, 1, '맵 끝에서 한 번 더 맞으면 사라짐');
    assert.ok(!st.units.some((u) => u.id === d.id));
  });

  test(`[${sid}] 후퇴·제압: 같은 시드 결과가 결정적이고 제압 상태가 복제 뒤에도 유지됨, 안개: 시야 밖 격파·후퇴 이벤트는 시야 규칙의 입력일 뿐 상태 필드가 새지 않음`, () => {
    E.loadScenario(sid);
    assert.equal(JSON.stringify(E.simulateGames(2)), JSON.stringify(E.simulateGames(2)));
    const g = gState(sid), { st, loc, A, B } = g, { r, c } = loc.open;
    const m = put(st, { id: g.id(A, 1), side: A, type: 'mortar', r, c: c - 3 });
    const d = put(st, { id: g.id(B, 1), side: B, type: 'infantry', r, c });
    E.resolveAttack(st, m.id, { r, c }, HIT);
    assert.equal(E.cloneState(st).units.find((u) => u.id === d.id).suppressed, d.suppressed);
  });
}

test('후퇴·제압: 중앙 규칙 상수 한 곳(RULES.RETREAT), 시나리오 데이터에는 retreat 블록이 없음, 대칭 검사는 그대로', () => {
  assert.deepEqual({ ...C().RETREAT, SUPPRESS_SOURCES: [...C().RETREAT.SUPPRESS_SOURCES] }, { STEPS: 1, SUPPRESS_TURNS: 1, SUPPRESS_SOURCES: ['mortar', 'artillery'] });
  for (const s of E.SCENARIOS) assert.ok(!('retreat' in s), `${s.id} 에 retreat 블록이 남아 있음`);
  const sc = JSON.parse(JSON.stringify(E.SCENARIOS.find((x) => x.id === 'symmetric')));
  assert.deepEqual([...E.validateScenario(sc)], []);
  sc.activations = { def: 5, att: 4 };
  assert.ok(E.symmetryErrors(sc).length > 0, '다른 대칭 검사는 그대로');
  E.loadScenario('hostomel');
});

test('후퇴·제압: 직접 사격은 모든 시나리오에서 인접 4방향 직선뿐 (직선이 아닌 사격은 없음)', () => {
  for (const sid of RT_SCENS) {
    E.loadScenario(sid);
    for (const [k, ty] of Object.entries(C().UNIT_TYPES)) if (ty.canAttack && !ty.indirect) assert.ok(ty.rangeMin === 1 && ty.rangeMax === 1, `${sid} ${k}`);
  }
  const u = { r: 5, c: 5, type: 'infantry', side: 'ua' };
  assert.deepEqual([...E.retreatDir({ r: 4, c: 4 }, u, null, false)], [1, 0], '같으면 세로');
  assert.deepEqual([...E.retreatDir({ r: 4, c: 3 }, u, null, false)], [0, 1], '열 차이가 크면 가로');
  assert.deepEqual([...E.retreatDir({ r: 1, c: 4 }, u, null, false)], [1, 0]);
});

test('제압: 다음 자기 턴에 이동·공격 불가, 점유에는 기여, 활성화 한도 소비 없음, 그 턴이 끝나면 해제 (대칭 전장)', () => {
  const st = rtState();
  const obj = st.objectives.find((o) => o.id === 'SL');
  const oc = E.objectiveCells(obj)[0];
  const m = put(st, { id: 'RM', side: 'ru', type: 'mortar', r: oc.r, c: oc.c + 3 });
  const d = put(st, { id: 'U1', side: 'ua', type: 'infantry', r: oc.r, c: oc.c });
  const e = put(st, { id: 'U2', side: 'ua', type: 'infantry', r: 14, c: 8 });
  E.updateObjectiveControl(st);
  E.resolveAttack(st, m.id, { r: oc.r, c: oc.c }, HIT);
  assert.equal(d.suppressed, 1);
  E.endTurn(st);   // ua 턴 시작
  assert.equal(st.turn, 'ua');
  assert.equal(E.canUnitMove(st, d), false); assert.equal(E.canUnitAttack(st, d), false);
  assert.deepEqual([...E.getReachableTiles(st, d.id)], []);
  assert.equal(E.getAttackableTiles(st, d.id).length, 0);
  assert.equal(obj.owner, 'ua', '제압 중에도 점유에 기여');
  assert.equal(st.act.used, 0, '활성화 한도 소비 없음');
  assert.equal(E.canUnitMove(st, e), true, '다른 유닛은 행동 가능');
  E.endTurn(st);   // ua 턴 끝 → 해제
  assert.ok(!d.suppressed);
  E.endTurn(st);   // ru 턴 끝 → ua 턴 시작
  assert.equal(E.canUnitMove(st, d), true);
});

test('후퇴: 거점이 비면 점유가 즉시 갱신됨 (대칭 전장)', () => {
  const st = rtState();
  const obj = st.objectives.find((o) => o.id === 'SL');
  const d2 = put(st, { id: 'U1', side: 'ua', type: 'infantry', r: 8, c: 2 });
  const a = put(st, { id: 'R1', side: 'ru', type: 'infantry', r: 9, c: 2 });
  E.updateObjectiveControl(st);
  assert.equal(obj.owner, 'ua');
  const ev2 = E.resolveAttack(st, a.id, { r: 8, c: 2 }, HIT);
  assert.equal(pos(d2), '7,2'); assert.equal(obj.owner, null);
  assert.equal(evOf(ev2, 'objectiveLost').length, 1);
});

test('후퇴·제압 (춘천): 포병이 있어 포병 주변 후퇴와 제압도 일어남. 호스토멜: 박격포와 포병 모두', () => {
  for (const sid of ['hostomel', 'chuncheon']) {
    E.loadScenario(sid);
    const has = (ty) => C().ROUND_ORDER.some((s) => C().DEPLOYMENT[s].some((d) => d.type === ty) || C().REINFORCEMENTS.some((g) => g.side === s && g.type === ty));
    assert.ok(has('artillery'), `${sid} 포병`);
    assert.equal(has('mortar'), sid === 'hostomel', `${sid} 박격포`);
  }
});

test('예전 저장 판 불러오기: 제압 필드가 없어도 불러오고, 규칙 업데이트 안내는 한 번만 (rulesVersion 이 없거나 낮을 때)', () => {
  const old = { round: 3, turn: 'south', units: [{ id: 'S1', side: 'south', type: 'infantry', r: 5, c: 5, hp: 4 }], objectives: [], rulesVersion: 10 };
  const r = E.upgradeSavedState(old);
  assert.equal(r.upgraded, true); assert.ok(r.state && r.state.units.length === 1); assert.ok(!('suppressed' in r.state.units[0]));
  assert.equal(old.rulesVersion, 10, '원본은 바꾸지 않음');
  assert.equal(E.upgradeSavedState({ ...old, rulesVersion: undefined }).upgraded, true, '버전 기록 없음 = 옛 판');
  assert.equal(E.upgradeSavedState({ ...old, rulesVersion: C().RULES_VERSION }).upgraded, false);
  assert.deepEqual({ ...E.upgradeSavedState(null) }, { state: null, upgraded: false }, '읽을 수 없는 값도 오류 없이');
  assert.deepEqual({ ...E.upgradeSavedState({ foo: 1 }) }, { state: null, upgraded: false });
  // 제압 상태가 있는 판은 그대로 유지
  const withSup = E.upgradeSavedState({ ...old, rulesVersion: C().RULES_VERSION, units: [{ ...old.units[0], suppressed: 1 }] });
  assert.equal(withSup.state.units[0].suppressed, 1);
  // 메뉴: 저장 요약에 옛 규칙 표시, 안내는 한 번만
  const raw = { scenarioId: 'hostomel', round: 2, maxRounds: 12, mode: 'ai', rulesVersion: 11 };
  const store = (v) => () => ({ getItem: (k) => (k === E.MENU_KEYS.save ? JSON.stringify(v) : null) });
  const s1 = E.readMenuStore(store(raw)).save;
  assert.equal(s1.rulesUpdated, true);
  assert.equal(E.rulesNoticeNeeded(s1, undefined), true, '처음에는 안내');
  assert.equal(E.rulesNoticeNeeded(s1, C().RULES_VERSION), false, '이미 본 뒤에는 안내 없음');
  const s2 = E.readMenuStore(store({ ...raw, rulesVersion: C().RULES_VERSION })).save;
  assert.equal(s2.rulesUpdated, false); assert.equal(E.rulesNoticeNeeded(s2, undefined), false);
  assert.equal(E.rulesNoticeNeeded(null, undefined), false);
  const S = run('STRINGS');
  for (const lang of ['ko', 'en']) assert.ok(S[lang]['save.rulesUpdated'], `${lang} 안내 문구`);
});

test('규칙 화면: 후퇴와 제압 항목은 모든 시나리오에 있고, 포병·박격포가 없는 구성이면 안내 한 줄로 바뀜 (유닛 구성에서 읽음)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8');
  assert.ok(/const ruleSecs = \(\) => [^\n]*'retreat'/.test(src), "ruleSecs 에 'retreat'");
  assert.ok(!/GAME_CONFIG\.RETREAT\s*\?/.test(src), '시나리오 조건 분기 없음');
  assert.ok(/R\.SUPPRESS_SOURCES\.some\(scenarioHasType\)/.test(src), '제압·포병 줄은 유닛 구성(scenarioHasType)에서 읽음');
  const S = run('STRINGS');
  for (const lang of ['ko', 'en']) for (const k of ['1', '2', '3', '4', '5', 'noIndirect']) assert.ok(S[lang][`rules.retreat.${k}`], `${lang} rules.retreat.${k}`);
  assert.ok(!/대칭 전장(에서만|만|전용)|이 시나리오에서만/.test(S.ko['rules.retreat.1'] + S.ko['rules.retreat.4']), '시나리오 한정 문구 없음');
});

/* ---------------- 후퇴·제압 AI (대칭 전장) ---------------- */
const aiCtx = (st, side) => {
  const G = run('globalThis.__g = globalThis.__g || {}; __g');
  G.st = st;
  G.ctx = run(`(() => { const d = resolveProfile('normal'); d.sym = { v2: true, level: 'normal' }; return buildAiContext(__g.st, ${JSON.stringify(side)}, d); })()`);
  return { G, ctx: G.ctx };
};
const gainOf = (G, ctx, attacker, target, p = 1) => {
  G.ctx = ctx; G.a = attacker; G.t = target; G.p = p;
  return run('symV2RetreatGain(__g.st, __g.ctx, __g.a, __g.a, __g.t, __g.p)');
};

test('AI 후퇴: 물러날 곳이 없는 적(맵 끝)을 칠 때가 열린 곳의 적을 칠 때보다 점수가 높음', () => {
  const st = rtState('ru');
  const a1 = put(st, { id: 'R1', side: 'ru', type: 'infantry', r: 14, c: 3 });
  const x = put(st, { id: 'U1', side: 'ua', type: 'infantry', r: 15, c: 3 });   // 뒤가 맵 밖
  const a2 = put(st, { id: 'R2', side: 'ru', type: 'infantry', r: 12, c: 10 });
  const y = put(st, { id: 'U2', side: 'ua', type: 'infantry', r: 13, c: 10 });  // 뒤가 열려 있음
  const { G, ctx } = aiCtx(st, 'ru');
  assert.ok(ctx.v2, '대칭 AI 맥락');
  assert.ok(gainOf(G, ctx, a1, x) > gainOf(G, ctx, a2, y), '후퇴 불가 표적이 더 높음');
  assert.equal(gainOf(G, ctx, a2, y), 0, '열린 곳·거점 밖이면 추가 점수 없음');
});

test('AI 후퇴: 거점 수비 유닛을 밀어내 거점을 비우는 공격에 가산, 거점 안에 같은 편이 남으면 없음', () => {
  const st = rtState('ru');
  const sl = st.objectives.find((o) => o.id === 'SL');
  const cell = E.objectiveCells(sl)[0];
  const a = put(st, { id: 'R1', side: 'ru', type: 'infantry', r: cell.r + 1, c: cell.c });
  const d = put(st, { id: 'U1', side: 'ua', type: 'infantry', r: cell.r, c: cell.c });
  const { G, ctx } = aiCtx(st, 'ru');
  assert.ok(gainOf(G, ctx, a, d) > 0, '거점이 비면 가산');
  // 같은 거점 칸에 다른 수비가 있으면 (여러 칸 거점) 가산 없음
  const sc = st.objectives.find((o) => o.id === 'SC');
  const cs = E.objectiveCells(sc);
  const st2 = rtState('ru');
  const a2 = put(st2, { id: 'R1', side: 'ru', type: 'infantry', r: cs[0].r - 1, c: cs[0].c });
  const d2 = put(st2, { id: 'U1', side: 'ua', type: 'infantry', r: cs[0].r, c: cs[0].c });
  put(st2, { id: 'U2', side: 'ua', type: 'infantry', r: cs[1].r, c: cs[1].c });
  const b = aiCtx(st2, 'ru');
  assert.equal(gainOf(b.G, b.ctx, a2, d2), 0);
});

test('AI 제압: 박격포·포병 정중앙 직격에 가산, 내가 이번 턴 제압한 유닛의 재직격은 더 높음, 아군은 가산 없음', () => {
  const st = rtState('ru');
  const m = put(st, { id: 'RM', side: 'ru', type: 'mortar', r: 13, c: 5 });
  const art = put(st, { id: 'RA', side: 'ru', type: 'artillery', r: 14, c: 4 });
  const sc = put(st, { id: 'RS', side: 'ru', type: 'infantry', r: 13, c: 7 });   // 시야 확보용
  const d = put(st, { id: 'U1', side: 'ua', type: 'armor', r: 13, c: 8 });       // 포병 피해만으로는 격파되지 않는 체력
  const { G, ctx } = aiCtx(st, 'ru');
  const first = gainOf(G, ctx, m, d);
  assert.ok(first > 0, '제압 가산');
  // 내 사격 결과로 제압을 안 뒤
  E.resolveAttack(st, m.id, { r: 13, c: 8 }, HIT);
  assert.equal(d.suppressed, 1);
  assert.equal(st.aiIntel.ru.supp.U1, st.round, '시야 안에서 제압한 유닛 id 를 기억');
  const again = aiCtx(st, 'ru');
  const second = gainOf(again.G, again.ctx, art, d);
  assert.ok(second > first, '재직격(격파) 가산이 더 큼');
  // 내가 모르는 제압 (표식 없음)은 점수에 영향 없음: 기억을 지우면 처음과 같은 가치
  delete st.aiIntel.ru.supp;
  const forgot = aiCtx(st, 'ru');
  assert.equal(gainOf(forgot.G, forgot.ctx, art, d), gainOf(forgot.G, forgot.ctx, art, { ...d, suppressed: 0 }), '적의 제압 플래그를 읽지 않음');
  // 같은 편(AI 가 쏘는 대상이 아군)은 후퇴·제압 가산 대상이 아님
  const own = put(st, { id: 'R7', side: 'ru', type: 'infantry', r: 11, c: 3 });   // 주변에 적이 없는 아군 칸
  assert.equal(gainOf(forgot.G, forgot.ctx, art, own), 0);
});

test('AI 안개: 후퇴 점수는 보이지 않는 칸의 숨은 유닛과 적의 제압 상태를 읽지 않음, ai-intel.js 는 .suppressed 를 읽지 않음', () => {
  const base = () => {
    const st = rtState('ru');
    const a = put(st, { id: 'R1', side: 'ru', type: 'infantry', r: 12, c: 10 });
    const y = put(st, { id: 'U1', side: 'ua', type: 'infantry', r: 13, c: 10 });
    return { st, a, y };
  };
  const one = base();
  const o1 = aiCtx(one.st, 'ru');
  o1.ctx.vis = new Set([...o1.ctx.vis].filter((i) => i !== 14 * 16 + 10 && i !== 15 * 16 + 10));   // 뒤 두 칸은 안 보임
  const clean = gainOf(o1.G, o1.ctx, one.a, one.y);
  const two = base();
  put(two.st, { id: 'U8', side: 'ua', type: 'infantry', r: 14, c: 10 });   // 숨은 적 두 명: 실제로는 도착 칸이 맵 밖 (격파)
  put(two.st, { id: 'U9b', side: 'ua', type: 'infantry', r: 15, c: 10 });
  two.y.suppressed = 1;   // 적의 제압 상태도 모름
  const o2 = aiCtx(two.st, 'ru');
  o2.ctx.vis = new Set([...o2.ctx.vis].filter((i) => i !== 14 * 16 + 10 && i !== 15 * 16 + 10));
  assert.equal(gainOf(o2.G, o2.ctx, two.a, two.y), clean, '숨은 정보로 점수가 달라지지 않음');
  const src = fs.readFileSync(path.join(ROOT, 'js', 'ai-intel.js'), 'utf8');
  assert.ok(!/\.suppressed\b/.test(src), 'ai-intel.js 가 유닛의 suppressed 를 직접 읽음');
});

test('AI 위험: 후퇴할 곳이 막힌 칸(맵 끝·구석·습지 옆 기갑)이 열린 칸보다 위험하고, 기본 위험이 없으면 0', () => {
  const st = rtState('ru');
  const art = put(st, { id: 'RA', side: 'ru', type: 'artillery', r: 8, c: 8 });
  const { G, ctx } = aiCtx(st, 'ru');
  const N2 = 16 * 16;
  const flat = (v) => ({ dmg: new Float64Array(N2).fill(v), direct: new Float64Array(N2).fill(v), artyP: new Float64Array(N2) });
  const risk = (u, r, c, mult = 1) => {
    G.u = u; G.pos = { r, c }; G.mult = mult;
    return run('symV2RetreatRisk(__g.st, __g.ctx, __g.u, __g.pos, 0, __g.mult)');
  };
  ctx.v2.maps = () => flat(1);
  const interior = risk(art, 8, 8), edge = risk(art, 15, 8), corner = risk(art, 15, 0);
  assert.equal(interior, 0);
  assert.ok(edge > interior && corner > edge, `${interior} < ${edge} < ${corner}`);
  const armor = { id: 'RT', side: 'ru', type: 'armor', hp: 4 };
  assert.ok(risk(armor, 3, 5) > risk(armor, 12, 8), '기갑은 습지 옆이 막힘 (열린 칸보다 위험)');
  ctx.v2.maps = () => flat(0);
  assert.equal(risk(art, 15, 0), 0, '피격 기대가 없으면 위험 없음');
});

test('AI 후퇴: 시뮬레이션이 오류 없이 돌고, 후퇴·제압·후퇴 불가 격파가 실제로 일어남', () => {
  E.loadScenario('symmetric');
  const r = E.simulateGames(4);
  assert.equal(r.errors, 0);
  let retreats = 0, supp = 0, blocked = 0;
  for (let i = 0; i < 2; i++) {
    const s = 777 + i;
    const rng = E.createSeededRng(s), dice = E.createSeededRng((s ^ 0x5DEECE66) >>> 0);
    const st = E.createInitialState(); E.startTurn(st);
    let guard = 0;
    while (!st.winner && guard++ < 100) {
      const acts = E.aiTakeTurn(st, st.turn, rng, 'normal', { diceRng: dice, recordSnapshots: false });
      for (const a of acts) for (const e of a.events) {
        if (e.type === 'retreat') retreats++;
        if (e.type === 'suppressed') supp++;
        if (e.type === 'destroyed' && e.cause === 'retreatBlocked') blocked++;
      }
      if (!st.winner) E.endTurn(st);
    }
  }
  assert.ok(retreats > 0 && supp > 0, `후퇴 ${retreats}, 제압 ${supp}, 후퇴 불가 격파 ${blocked}`);
});

/* ---------------- 후퇴·제압 AI: 호스토멜·춘천의 기존 AI (공통 모듈 재사용) ---------------- */
const oldCtx = (st, side, level = 'normal') => {
  const G = run('globalThis.__g = globalThis.__g || {}; __g');
  G.st = st; G.side = side; G.level = level;
  G.ctx = run('buildAiContext(__g.st, __g.side, resolveProfile(__g.level))');
  return { G, ctx: G.ctx };
};
const oldGain = (G, ctx, a, t, p = 1) => { G.ctx = ctx; G.a = a; G.t = t; G.p = p; return run('retreatGain(__g.st, __g.ctx, GAME_CONFIG.AI.WEIGHTS, __g.a, __g.a, __g.t, __g.p)'); };

for (const sid of ['hostomel', 'chuncheon', 'vuhledar']) {
  test(`[${sid}] AI 후퇴: 물러날 곳이 없는 적을 칠 때 점수가 높고, 기존 사격 점수에 공통 모듈이 더해짐`, () => {
    const g = gState(sid), { st, loc, A, B } = g;
    const a1 = put(st, { id: g.id(A, 1), side: A, type: 'infantry', r: loc.n - 2, c: loc.edge.c });
    const x = put(st, { id: g.id(B, 1), side: B, type: 'infantry', r: loc.n - 1, c: loc.edge.c });     // 뒤가 맵 밖
    const a2 = put(st, { id: g.id(A, 2), side: A, type: 'infantry', r: loc.open.r - 1, c: loc.open.c });
    const y = put(st, { id: g.id(B, 2), side: B, type: 'infantry', r: loc.open.r, c: loc.open.c });     // 뒤가 열려 있음
    const { G, ctx } = oldCtx(st, A);
    assert.ok(!ctx.v2 && !ctx.neutral, '기존 AI 맥락');
    const gx = oldGain(G, ctx, a1, x), gy = oldGain(G, ctx, a2, y);
    assert.ok(gx > gy, `후퇴 불가 ${gx} > 열린 곳 ${gy}`);
    assert.ok(gx >= C().AI.WEIGHTS.retreatKill * C().AI.UNIT_VALUE.infantry * 0.99, '가중치 = AI_CONFIG.WEIGHTS.retreatKill');
    // aiScoreAttack 가 그 값을 포함: 같은 병종·지형이라 두 점수의 차가 양수
    G.ctx = ctx;
    const sc = (a, t) => { G.a = a; G.tg = { r: t.r, c: t.c, kind: 'visible' }; return run('aiScoreAttack(__g.st, __g.ctx, __g.a, __g.a, __g.tg, false)'); };
    assert.ok(sc(a1, x) - sc(a2, y) > 0, '같은 병종·지형이라 점수 차는 후퇴 불가 가산에서 옴 (명중 확률을 곱한 값)');
  });

  test(`[${sid}] AI 위험: 막힌 칸은 열린 칸보다 위험하고, 난이도별 위험 회피 배수(diff.risk)가 곱해짐`, () => {
    const g = gState(sid), { st, loc, A, B } = g;
    const me = put(st, { id: g.id(A, 1), side: A, type: 'infantry', r: loc.n - 1, c: loc.edge.c });
    const mate = put(st, { id: g.id(A, 2), side: A, type: 'infantry', r: loc.open.r, c: loc.open.c });
    put(st, { id: g.id(B, 1), side: B, type: 'infantry', r: loc.n - 2, c: loc.edge.c + 1 });   // 위협
    put(st, { id: g.id(B, 2), side: B, type: 'infantry', r: loc.open.r - 1, c: loc.open.c + 1 });
    const { G, ctx } = oldCtx(st, A);
    const risk = (u, p) => { G.u = u; G.p = p; return run('aiRetreatRisk(__g.st, __g.ctx, GAME_CONFIG.AI.WEIGHTS, __g.u, __g.p)'); };
    assert.ok(risk(me, { r: me.r, c: me.c }) > risk(mate, { r: mate.r, c: mate.c }), '맵 끝이 열린 칸보다 위험');
    const src = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8');
    assert.ok(/diff\.risk \* aiRetreatRisk\(/.test(src), '난이도 배수: 기존 위협 항과 같은 방식으로 diff.risk 를 곱함');
    const P = run('TACTIC_PROFILES');
    assert.ok(P.easy.weights.risk < P.normal.weights.risk && P.normal.weights.risk < P.hard.weights.risk, '난이도 배수 easy < normal < hard');
  });

  test(`[${sid}] AI 안개: 후퇴 점수는 보이지 않는 칸의 숨은 유닛과 적의 제압 상태를 읽지 않음`, () => {
    const base = () => {
      const g = gState(sid);
      const a = put(g.st, { id: g.id(g.A, 1), side: g.A, type: 'infantry', r: g.loc.open.r - 1, c: g.loc.open.c });
      const y = put(g.st, { id: g.id(g.B, 1), side: g.B, type: 'infantry', r: g.loc.open.r, c: g.loc.open.c });
      return { g, a, y };
    };
    const hiddenCells = (b) => new Set([idx16(b.g.loc.open.r + 1, b.g.loc.open.c), idx16(b.g.loc.open.r + 2, b.g.loc.open.c)]);
    const idx16 = (r, c) => r * 16 + c;
    const one = base();
    const o1 = oldCtx(one.g.st, one.g.A);
    o1.ctx.vis = new Set([...o1.ctx.vis].filter((i) => !hiddenCells(one).has(i)));
    const clean = oldGain(o1.G, o1.ctx, one.a, one.y);
    const two = base();
    put(two.g.st, { id: two.g.id(two.g.B, 8), side: two.g.B, type: 'infantry', r: two.g.loc.open.r + 1, c: two.g.loc.open.c });   // 숨은 적 두 명
    put(two.g.st, { id: two.g.id(two.g.B, 9), side: two.g.B, type: 'infantry', r: two.g.loc.open.r + 2, c: two.g.loc.open.c });
    two.y.suppressed = 1;   // 적의 제압 상태도 모름
    const o2 = oldCtx(two.g.st, two.g.A);
    o2.ctx.vis = new Set([...o2.ctx.vis].filter((i) => !hiddenCells(two).has(i)));
    assert.equal(oldGain(o2.G, o2.ctx, two.a, two.y), clean);
  });

  test(`[${sid}] AI: 시뮬레이션이 세 난이도 모두 오류 없이 돌고, 후퇴가 실제로 일어남 (제압 기억은 내 사격 결과로만)`, () => {
    E.loadScenario(sid);
    let retreats = 0;
    for (const level of ['easy', 'normal', 'hard']) {
      const r = E.simulateGames(3, { att: level, def: level });
      assert.equal(r.errors, 0, level);
      const s = 900;
      const rng = E.createSeededRng(s), dice = E.createSeededRng((s ^ 0x5DEECE66) >>> 0);
      const st = E.createInitialState(); E.startTurn(st);
      let guard = 0;
      while (!st.winner && guard++ < 80) {
        const acts = E.aiTakeTurn(st, st.turn, rng, level, { diceRng: dice, recordSnapshots: false });
        for (const a of acts) for (const e of a.events) if (e.type === 'retreat') retreats++;
        if (!st.winner) E.endTurn(st);
      }
    }
    assert.ok(retreats > 0, `후퇴 ${retreats}`);
  });
}

/* ---------------- 우글레다르 시나리오 (새 시나리오 데이터만, 규칙·엔진·AI 변경 없음) ---------------- */
const VUH = () => E.SCENARIOS.find((s) => s.id === 'vuhledar');
const countBy = (s, side) => {
  const o = {};
  for (const d of s.deployments.filter((x) => x.side === side && !x.round)) o[d.type] = (o[d.type] || 0) + 1;
  return o;
};

test('우글레다르: 데이터가 요청한 표와 같음 (지도, 거점 묶음, 병력과 위치, 행동 제한, 선공, 라운드, 증원 없음)', () => {
  const s = VUH();
  assert.equal(s.map.length, 16); assert.ok(s.map.every((r) => r.length === 16));
  assert.equal(s.map[14], '......###.......'); assert.equal(s.map[4], '......##.f......');   // 우크라이나군이 아래쪽 (위아래 반전)
  assert.ok(!s.symmetric, '대칭 시나리오가 아님');
  assert.deepEqual([...s.objectives.map((o) => [...o.cells].map((p) => [...p].join(',')).join(' '))], ['12,6 12,7 13,6 13,7']);
  for (const [r, c] of s.objectives[0].cells) assert.equal(s.map[r][c], '#', '거점 칸은 마을');
  assert.deepEqual(countBy(s, 'ua'), { infantry: 3, armor: 1, antitank: 2, artillery: 1, mortar: 1, signal: 1 });
  assert.deepEqual(countBy(s, 'ru'), { infantry: 4, armor: 6, mortar: 1, recon: 1, signal: 1 });
  assert.equal(s.deployments.filter((d) => d.side === 'ua' && !d.round).length, 9);
  assert.equal(s.deployments.filter((d) => d.side === 'ru' && !d.round).length, 13);
  assert.ok(!s.deployments.some((d) => d.round > 0), '증원 없음');
  assert.ok(!s.deployments.some((d) => d.side === 'ru' && d.type === 'artillery'), '러시아군은 포병 없음');
  const at = (side, type) => [...s.deployments.filter((d) => d.side === side && d.type === type).map((d) => [...d.pos].join(','))];
  assert.deepEqual(at('ua', 'infantry'), ['13,5', '12,8', '13,9']); assert.deepEqual(at('ua', 'antitank'), ['11,6', '11,8']);
  assert.deepEqual(at('ua', 'artillery'), ['14,7']); assert.deepEqual(at('ua', 'mortar'), ['14,5']); assert.deepEqual(at('ru', 'mortar'), ['0,7']);
  assert.deepEqual(at('ru', 'armor'), ['1,5', '0,6', '1,9', '0,9', '1,12', '0,12']);
  assert.deepEqual({ ...s.activations }, { def: 4, att: 6 });
  assert.equal(s.firstMover, 'ru'); assert.equal(s.rounds, 10); assert.equal(s.playerSide, 'ua');
  assert.equal(JSON.stringify(s.placementZones.ua), '{"rows":[9,15]}'); assert.equal(s.placementZones.ru, null);
  assert.equal(s.bgm, null);
  assert.ok(s.tags.length <= 3 && s.aiProfiles.join() === 'easy,normal,hard');
  for (const d of s.deployments.filter((x) => x.side === 'ua')) assert.ok(d.pos[0] >= 9 && d.pos[0] <= 15, `ua ${d.type} ${d.pos}`);   // 기본 배치(방어)는 배치 구역 안
});

test('우글레다르: validateScenario 통과, 일부러 어긋나게 하면 실패 (맵 밖 유닛·잘못된 지형·겹침·맵 밖 거점·모르는 진영)', () => {
  assert.deepEqual([...E.validateScenario(VUH())], []);
  const bad = (f) => { const s = JSON.parse(JSON.stringify(VUH())); f(s); return E.validateScenario(s).length; };
  assert.ok(bad((s) => { s.deployments[0].pos = [16, 3]; }) > 0, '맵 밖 유닛');
  assert.ok(bad((s) => { s.map[0] = 'X' + s.map[0].slice(1); }) > 0, '잘못된 지형 코드');
  assert.ok(bad((s) => { s.deployments[1].pos = s.deployments[0].pos.slice(); }) > 0, '배치 겹침');
  assert.ok(bad((s) => { s.objectives[0].cells = [[12, 6], [12, 7], [13, 6], [13, 16]]; }) > 0, '맵 밖 거점 칸');
  assert.ok(bad((s) => { s.deployments.push({ round: 0, side: 'zz', type: 'infantry', pos: [8, 8] }); }) > 0, '모르는 진영');
});

for (const level of ['easy', 'normal', 'hard']) {
  test(`우글레다르: simulateGames 가 ${level} 난이도에서 양쪽 진영으로 끝까지 돌고 같은 시드면 결과가 같음`, () => {
    E.loadScenario('vuhledar');
    const asAtt = E.simulateGames(3, { att: level, def: 'normal' }), asDef = E.simulateGames(3, { att: 'normal', def: level });
    assert.equal(asAtt.errors, 0); assert.equal(asDef.errors, 0);
    assert.equal(asAtt.games, 3);
    assert.equal(JSON.stringify(E.simulateGames(3, { att: level, def: 'normal' })), JSON.stringify(asAtt));
    assert.equal(JSON.stringify(E.simulateGames(3, { att: 'normal', def: level })), JSON.stringify(asDef));
  });
}

test('우글레다르: 간접 화력은 병종별 한 세트이고 러시아군은 포병을 쓸 수 없음 (박격포만), 우크라이나군은 포병과 박격포', () => {
  const st = fresh('vuhledar'); E.startTurn(st);
  assert.deepEqual({ ...C().FIRES.mortar }, { range: 4, cooldown: 0, indirectPenalty: 0 });
  assert.deepEqual({ ...C().FIRES.artillery }, { range: 5, cooldown: 1 });
  assert.equal(C().FIRES.blindFire, true);
  const types = (side) => new Set(st.units.filter((u) => u.side === side).map((u) => u.type));
  assert.ok(types('ua').has('artillery') && types('ua').has('mortar'));
  assert.ok(types('ru').has('mortar') && !types('ru').has('artillery'));
  assert.equal(C().ACTIVATIONS.def, 4); assert.equal(C().ACTIVATIONS.att, 6);
  assert.equal(st.turn, 'ru', '선공은 러시아군'); assert.equal(st.act.limit, 6);
});

test('우글레다르: 승리 조건 — 공격 점유 승리(라운드 끝 확인), 방어 라운드 제한 승리, 묶음 점유 판정, 전멸', () => {
  const mk = () => { const st = fresh('vuhledar'); st.units = []; st.turn = 'ru'; st.round = 3; E.startTurn(st); return st; };
  const cell = [12, 6], other = [13, 7];
  let st = mk();   // 공격군이 묶음 안, 방어군은 묶음 밖: 선공 턴이 끝난 뒤에는 확인하지 않고 후공(방어) 턴이 끝난 뒤 확인
  put(st, { id: 'R1', side: 'ru', type: 'infantry', r: cell[0], c: cell[1] }); put(st, { id: 'U1', side: 'ua', type: 'infantry', r: 8, c: 8 });
  E.updateObjectiveControl(st);
  assert.equal(st.objectives[0].owner, 'ru');
  E.endTurn(st); assert.ok(!st.winner, '선공 턴이 끝난 뒤에는 확인하지 않음'); assert.equal(st.turn, 'ua');
  E.endTurn(st); assert.equal(st.winner, 'ru'); assert.equal(st.winReason, 'objectives');
  st = mk();   // 양쪽이 묶음 안에 있으면 아무도 점유하지 못함
  put(st, { id: 'R1', side: 'ru', type: 'infantry', r: cell[0], c: cell[1] }); put(st, { id: 'U1', side: 'ua', type: 'infantry', r: other[0], c: other[1] });
  E.updateObjectiveControl(st);
  assert.equal(st.objectives[0].owner, null);
  E.endTurn(st); E.endTurn(st); assert.ok(!st.winner);
  st = mk(); st.round = C().MAX_ROUNDS;   // 방어군이 마지막 라운드를 버팀
  put(st, { id: 'R1', side: 'ru', type: 'infantry', r: 14, c: 5 }); put(st, { id: 'U1', side: 'ua', type: 'infantry', r: 8, c: 8 }); put(st, { id: 'U2', side: 'ua', type: 'infantry', r: cell[0], c: cell[1] });
  E.updateObjectiveControl(st);
  E.endTurn(st); E.endTurn(st);
  assert.equal(st.winner, 'ua'); assert.equal(st.winReason, 'survived');
  assert.equal(C().MAX_ROUNDS, 10);
  st = mk(); put(st, { id: 'R1', side: 'ru', type: 'infantry', r: 14, c: 5 });   // 방어군 전멸
  E.endTurn(st);
  assert.equal(st.winner, 'ru'); assert.equal(st.winReason, 'annihilation');
  st = mk(); put(st, { id: 'U1', side: 'ua', type: 'infantry', r: 8, c: 8 });   // 공격군 전멸
  E.endTurn(st);
  assert.equal(st.winner, 'ua'); assert.equal(st.winReason, 'annihilation');
});

test('우글레다르: 그림 데이터는 이 시나리오에만 (다른 시나리오의 art 는 그대로), 그림 파일이 모두 있음', () => {
  const art = VUH().art;
  assert.equal(art.terrain.city, 'assets/vuhledar/ruined-town.webp');
  for (const id of ['chuncheon', 'hostomel', 'symmetric']) {
    const a = E.SCENARIOS.find((s) => s.id === id).art;
    if (!a) continue;
    assert.ok(!a.dryField && !a.fields && !a.decor && !a.flipFacing, `${id} 에 새 장식 필드가 없음`);
    assert.ok(!/vuhledar/.test(JSON.stringify(a)), `${id} 가 새 그림을 쓰지 않음`);
  }
  assert.equal(E.SCENARIOS.find((s) => s.id === 'hostomel').art.terrain.city, 'assets/terrain/urban.jpg', '호스토멜 마을 질감 그대로');
  const decorSrcs = [art.dryField.src, ...art.fields.map((f) => f.src), ...art.decor.map((d) => d.src)];
  for (const src of [...Object.values(art.terrain), ...decorSrcs]) assert.ok(fs.existsSync(path.join(ROOT, src)), `${src} 없음`);
  const list = run('RICH_MAP').artSources(art, {});
  assert.equal(list.filter((x) => x.kind === 'decor').length, new Set(decorSrcs).size, '장식 그림은 파일마다 한 번만 불러옴');
  const scars = art.decor.filter((d) => d.type === 'scar');
  assert.equal(scars.length, 5, '포격 자국 고정 장식 5개');
  for (const d of scars) assert.ok(d.size <= 0.9, '자국은 한 칸의 90% 이하');
  assert.equal(art.fields.length, 2);
  for (const f of art.fields) for (let r = f.rows[0]; r <= f.rows[1]; r++) for (let c = f.cols[0]; c <= f.cols[1]; c++) assert.equal(VUH().map[r][c], '.', `밀밭 칸 (${r},${c}) 은 평지`);
});

test('우글레다르: 안개 — 시작 때 양쪽 모두 상대 유닛이 보이지 않고, 후퇴·제압·간접 화력은 RT_SCENS 파라미터화 시험에 포함', () => {
  assert.ok(RT_SCENS.includes('vuhledar'));
  const st = fresh('vuhledar');
  for (const side of ['ua', 'ru']) {
    const vis = E.getVisibleTiles(st, side);
    for (const u of st.units.filter((x) => x.side !== side)) assert.ok(!vis.has(u.r * C().MAP.length + u.c), `${side} 가 ${u.id} 를 시작부터 봄`);
  }
});

/* ---------------- 포격 자국 (화면 전용 보기 효과: js/fx.js 의 순수 함수. 엔진 상태·난수·규칙과 무관) ---------------- */
test('포격 자국: 보이는 간접 화력 명중만 남기고, 직접 사격·빗나감·안개 속 낙하는 남기지 않음', () => {
  const N = 16, vis = new Set([5 * N + 5]);
  const ev = (o) => ({ indirect: true, hit: true, target: { r: 5, c: 5 }, ...o });
  assert.deepEqual({ ...E.planImpactMark(ev({}), { vis, N, small: false }) }, { r: 5, c: 5, kind: 'large' });
  assert.equal(E.planImpactMark(ev({}), { vis, N, small: true }).kind, 'small');
  assert.equal(E.planImpactMark(ev({ indirect: false }), { vis, N, small: false }), null, '직접 사격');
  assert.equal(E.planImpactMark(ev({ hit: false }), { vis, N, small: false }), null, '빗나감');
  assert.equal(E.planImpactMark(ev({ target: { r: 6, c: 5 } }), { vis, N, small: false }), null, '안개 속 낙하');
  assert.equal(E.planImpactMark(null, { vis, N }), null);
});

test('포격 자국: 칸당 2개, 판당 40개 상한 (넘으면 가장 오래된 것부터 지움)', () => {
  const sh = (r, c, seq) => E.markShape(1, 1, { r, c, kind: 'large' }, seq, ['a']);
  let l = [];
  for (let i = 0; i < 5; i++) l = E.addMark(l, sh(3, 3, i));
  assert.equal(l.length, 2); assert.equal(l.map((m) => m.seq).join(), '3,4');
  l = [];
  for (let i = 0; i < 60; i++) l = E.addMark(l, sh(i % 16, Math.floor(i / 16), i));
  assert.equal(l.length, 40); assert.equal(l[0].seq, 20); assert.equal(l[39].seq, 59);
});

test('포격 자국: 모양은 시드·라운드·칸·순번으로만 정해져 같으면 같고, 게임 난수·엔진 상태를 쓰지 않음', () => {
  const a = E.markShape(77, 4, { r: 2, c: 9, kind: 'large' }, 3, ['x', 'y', 'z']);
  assert.deepEqual({ ...a }, { ...E.markShape(77, 4, { r: 2, c: 9, kind: 'large' }, 3, ['x', 'y', 'z']) });
  assert.notDeepEqual({ ...a }, { ...E.markShape(77, 5, { r: 2, c: 9, kind: 'large' }, 3, ['x', 'y', 'z']) });
  assert.ok(Math.abs(a.dx) <= 0.1 && Math.abs(a.dy) <= 0.1 && a.rot >= 0 && a.rot <= 360);
  assert.ok(a.size >= 0.8 && a.size <= 0.95);
  const s = E.markShape(1, 1, { r: 0, c: 0, kind: 'small' }, 0, ['x']);
  assert.ok(s.size >= 0.55 && s.size <= 0.65);
  const orig = Math.random; let calls = 0; Math.random = () => { calls++; return 0.5; };
  try { E.markShape(1, 2, { r: 1, c: 1, kind: 'large' }, 1, ['x']); E.planImpactMark({ indirect: true, hit: true, target: { r: 0, c: 0 } }, { vis: new Set([0]), N: 4 }); } finally { Math.random = orig; }
  assert.equal(calls, 0, 'Math.random 호출 없음');
});

test('포격 자국: 우글레다르만 켬 (art.impactMarks), 파일이 있고 다른 시나리오는 꺼짐', () => {
  const m = E.SCENARIOS.find((s) => s.id === 'vuhledar').art.impactMarks;
  for (const f of [...m.mortar, ...m.artillery]) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  for (const s of E.SCENARIOS) if (s.id !== 'vuhledar') assert.ok(!s.art || !s.art.impactMarks, s.id);
});

/* ---------------- 직접 편성 (draft, 대칭 전장의 시작 옵션) ---------------- */
const DR = () => C().DRAFT;
const loadSym = () => { E.loadScenario('symmetric'); E.setDraft(null); return C(); };
const PRESET = (id) => ({ ...DR().presets.find((p) => p.id === id).counts });
const symData = () => JSON.parse(JSON.stringify(E.SCENARIOS.find((s) => s.id === 'symmetric')));
const draftErrs = (mut) => { const s = symData(); mut(s.draft); return E.draftDataErrors(s); };

test('[편성] 데이터: 대칭 전장만 켜짐, 다른 시나리오에는 draft 없음', () => {
  for (const s of E.SCENARIOS) if (s.id !== 'symmetric') { assert.equal(s.draft, undefined, s.id); E.loadScenario(s.id); assert.equal(C().DRAFT, null); }
  loadSym();
  assert.ok(DR() && DR().enabled);
});

test('[편성] 데이터: 모든 병종 가격, 기본 편성 비용 = 예산, presets 는 예산·상한을 지킴', () => {
  loadSym();
  const base = E.draftDefaultComp();
  for (const k of Object.keys(base)) assert.ok(DR().costs[k] >= 1, `${k} 가격`);
  assert.equal(E.draftCost(base), DR().budget, '기본 편성 비용 = 예산');
  assert.ok(DR().presets.length >= 3);
  for (const p of DR().presets) { assert.equal(E.draftError(p.counts), null, p.id); assert.ok(E.draftCost(p.counts) <= DR().budget, p.id); }
  assert.equal(DR().limits.signal, 1);
  assert.deepEqual([...E.validateScenario(E.SCENARIOS.find((s) => s.id === 'symmetric'))], []);
});

test('[편성] 데이터 검증: 일부러 어긋나게 하면 실패', () => {
  assert.equal(draftErrs(() => {}).length, 0);
  assert.ok(draftErrs((d) => { delete d.costs.mortar; }).length, '가격 없음');
  assert.ok(draftErrs((d) => { d.costs.armor = 0; }).length, '가격 0');
  assert.ok(draftErrs((d) => { d.budget = 20; }).length, '예산 < 기본 편성');
  assert.ok(draftErrs((d) => { d.presets[1].counts.infantry = 12; }).length, 'preset 예산 초과');
  assert.ok(draftErrs((d) => { d.presets[0].counts.signal = 2; }).length, 'preset 상한 초과');
  assert.ok(draftErrs((d) => { d.presets = []; }).length, 'preset 없음');
  assert.ok(draftErrs((d) => { d.minUnits = 0; }).length, 'minUnits');
  assert.ok(draftErrs((d) => { d.limits.tank = 1; }).length, '없는 병종 상한');
  assert.ok(draftErrs((d) => { d.deployRows.ua = [10, 15]; }).length, '배치 구역 불일치');
  const s = symData(); s.draft.budget = 5;
  assert.ok(E.validateScenario(s).length, 'validateScenario 가 draft 오류를 냄');
});

test('[편성] 로직: 포인트 초과 불가, 통신 상한 1, 최소 1부대, 기본 편성 채우기 = 예산', () => {
  loadSym();
  assert.ok(E.draftError({}), '0부대는 확정 불가');
  assert.equal(E.draftBlock({ infantry: 20 }, 'artillery'), 'budget');
  assert.equal(E.draftError({ infantry: 22 }).k, 'draftErr.budget');
  assert.equal(E.draftBlock({ armor: 2 }, 'armor'), 'limit', '기갑 상한 2');
  assert.equal(E.draftError({ armor: 3 }).k, 'draftErr.limit');
  assert.equal(E.draftBlock({ signal: 1 }, 'signal'), 'limit');
  assert.equal(E.draftError({ signal: 2 }).k, 'draftErr.limit');
  assert.equal(E.draftError({ recon: 1 }), null, '최소 1부대');
  assert.equal(E.draftBlock({}, 'artillery'), null);
  const fill = {};
  for (let guard = 0; guard < 100; guard++) { const k = E.draftTypeList().find((x) => !E.draftBlock(fill, x)); if (!k) break; fill[k] = (fill[k] || 0) + 1; }
  assert.ok(E.draftCost(fill) <= DR().budget); assert.equal(E.draftError(fill), null);
  assert.equal(E.draftCost(E.draftDefaultComp()), DR().budget);
  assert.equal(E.draftError({ infantry: -1, recon: 1 }).k, 'draftErr.count');
  assert.equal(E.draftError({ tank: 1 }).k, 'draftErr.type');
  assert.throws(() => E.setDraft({ ua: { armor: 9 } }), /./);
  assert.equal(C().DRAFT_ACTIVE, false, '실패하면 아무것도 바뀌지 않음');
});

test('[편성] 자동 배치: 모든 preset·양쪽 진영이 구역 안에서 겹치지 않고, 같은 편성이면 180도 회전 대칭', () => {
  loadSym();
  const comps = [...DR().presets.map((p) => p.counts), E.draftDefaultComp(), { infantry: 13 }, { recon: 13 }, { signal: 1 }];
  for (const comp of comps) {
    const a = E.draftAutoPlace('ua', comp), b = E.draftAutoPlace('ru', comp);
    assert.ok(a && b, JSON.stringify(comp));
    assert.equal(a.length, E.draftCount(comp));
    for (const list of [a, b]) assert.equal(new Set(list.map((p) => p.r * 16 + p.c)).size, list.length, '겹침 없음');
    const key = (list, f) => list.map((p) => `${p.type}:${f(p)}`).sort().join('|');
    assert.equal(key(a, (p) => `${p.r},${p.c}`), key(b, (p) => `${15 - p.r},${15 - p.c}`), '양쪽 같은 규칙');
    // 유효한 칸인지는 엔진 검사로: 편성 적용 뒤 createInitialState 의 검증이 통과
    E.setDraft({ ua: comp, ru: comp });
    assert.doesNotThrow(() => E.createInitialState());
  }
  E.setDraft(null);
  const list = E.draftAutoPlace('ru', E.draftDefaultComp());
  const rows = (types) => list.filter((p) => types.includes(p.type)).map((p) => p.r);
  assert.ok(Math.min(...rows(['armor', 'infantry'])) > Math.max(...rows(['artillery', 'mortar', 'signal'])), 'ru 는 큰 행이 앞줄');
  assert.equal(E.draftAutoPlace('ua', { infantry: 65 }), null, '칸이 모자라면 null (구역을 넓히지 않음)');
});

test('[편성] setDraft 는 증원을 건드리지 않고, null 이면 기본 배치로 정확히 되돌림', () => {
  const base = JSON.stringify(loadSym().DEPLOYMENT), reinf = JSON.stringify(C().REINFORCEMENTS);
  E.setDraft({ ua: PRESET('armor'), ru: PRESET('fires') });
  assert.equal(C().DRAFT_ACTIVE, true);
  assert.equal(JSON.stringify(C().REINFORCEMENTS), reinf);
  assert.equal(C().DEPLOYMENT.ua.length, 8); assert.equal(C().DEPLOYMENT.ru.length, 9);
  const st = E.createInitialState();
  assert.equal(st.units.filter((u) => u.side === 'ua').length, 8);
  assert.equal(st.draft.mode, 'custom');
  assert.equal(E.sideTotalUnits('ru'), 9 + C().REINFORCEMENTS.filter((g) => g.side === 'ru').reduce((n, g) => n + g.count, 0), '손실 계산의 전체 병력 수에 증원 포함');
  E.setDraft(null);
  assert.equal(JSON.stringify(C().DEPLOYMENT), base); assert.equal(C().DRAFT_ACTIVE, false);
  assert.equal(E.createInitialState().draft, undefined, '기본 편성이면 상태에 draft 키 없음');
  E.setDraft({ ua: PRESET('armor') });
  assert.equal(JSON.stringify(C().DEPLOYMENT.ru), JSON.stringify(C().DEPLOYMENT_BASE.ru));
  E.setDraft(null);
});

test('[편성] 편성 기본이면 simulateGames 결과가 같음 (setDraft 를 쓴 뒤 되돌려도, 빈 draft 옵션이어도)', () => {
  loadSym();
  const plain = JSON.stringify(E.simulateGames(4, { seed: 777 }));
  const withEmpty = JSON.stringify(E.simulateGames(4, { seed: 777, draft: {} }));
  E.setDraft({ ua: PRESET('armor') }); E.setDraft(null);
  const after = JSON.stringify(E.simulateGames(4, { seed: 777 }));
  assert.equal(withEmpty, plain); assert.equal(after, plain);
  for (const id of ['chuncheon', 'hostomel', 'vuhledar']) { E.loadScenario(id); assert.equal(C().DEPLOYMENT, C().DEPLOYMENT_BASE); assert.equal(C().DRAFT_ACTIVE, false); }
});

test('[편성] AI 편성: 쉬움 = balanced 만, 보통·어려움 = 시드로 무작위, 같은 시드면 같은 편성, Math.random 안 씀', () => {
  loadSym();
  for (let s = 1; s < 40; s++) assert.equal(JSON.stringify(E.draftAiComp('easy', s)), JSON.stringify(PRESET('balanced')));
  const seen = new Set();
  for (let s = 0; s < 200; s++) { const a = E.draftAiComp('normal', s * 7919); assert.equal(JSON.stringify(a), JSON.stringify(E.draftAiComp('normal', s * 7919))); assert.equal(E.draftError(a), null); seen.add(JSON.stringify(a)); }
  assert.equal(seen.size, DR().presets.length, '모든 preset 이 나옴');
  const orig = Math.random; let calls = 0; Math.random = () => { calls++; return 0.5; };
  try { E.draftAiComp('hard', 5); } finally { Math.random = orig; }
  assert.equal(calls, 0);
});

test('[편성] 직접 편성으로 simulateGames 가 끝까지 돌고 (preset 조합 전부), 같은 시드면 결과가 같음', () => {
  loadSym();
  const ids = DR().presets.map((p) => p.id);
  for (const a of ids) for (const b of ids) {
    const r = E.simulateGames(1, { seed: 4242, draft: { ua: PRESET(a), ru: PRESET(b) } });
    assert.equal(r.errors, 0, `${a} vs ${b}`);
    assert.equal(r.wins.ua + r.wins.ru + (r.draws || 0), 1);
  }
  const f = (sd) => ({ ua: E.draftAiComp('normal', sd), ru: E.draftAiComp('hard', sd + 1) });
  const x = JSON.stringify(E.simulateGames(3, { seed: 99, draft: f })), y = JSON.stringify(E.simulateGames(3, { seed: 99, draft: f }));
  assert.equal(x, y);
  assert.equal(C().DRAFT_ACTIVE, false, '끝나면 기본 배치로 복귀');
});

test('[편성] 한쪽만·양쪽·서로 다른 병종 수: 승리 판정, 행동 한도, 점수 승리가 정상', () => {
  loadSym();
  const cases = [
    { ua: PRESET('infantry') },
    { ua: PRESET('fires'), ru: PRESET('armor') },
    { ua: { recon: 1 }, ru: { infantry: 13 } },
    { ua: { infantry: 13 }, ru: { signal: 1 } },
  ];
  for (const [i, comps] of cases.entries()) {
    const r = E.simulateGames(3, { seed: 100 + i, draft: comps });
    assert.equal(r.errors, 0, JSON.stringify(comps));
    assert.equal(r.wins.ua + r.wins.ru + (r.draws || 0), 3);
    assert.ok(r.avgRounds >= 1 && r.avgRounds <= C().MAX_ROUNDS);
  }
  E.setDraft({ ua: { infantry: 13 }, ru: { infantry: 3, recon: 1 } });
  const st = E.createInitialState();
  E.startTurn(st);
  assert.equal(st.act.limit, C().ACTIVATIONS.att, 'ru 가 선공 (att)');
  st.turn = 'ua'; E.startTurn(st);
  assert.equal(st.act.limit, C().ACTIVATIONS.def);
  const mine = st.units.filter((u) => u.side === 'ua');
  ctx.__st = st; ctx.__mine = mine;
  for (let k = 0; k < st.act.limit; k++) run(`noteActivation(__st, __mine[${k}])`);
  assert.equal(E.activationBlocked(st, mine[st.act.limit]), true, '한도를 다 쓰면 다음 유닛은 막힘');
  E.setDraft(null);
});

test('[편성] 안개: 직접 편성 판은 기본 배치로 상대를 추정하지 않고, 상대 편성이 달라도 내 AI 행동이 같음', () => {
  loadSym();
  assert.equal(E.publicSetup('ru').length, C().DEPLOYMENT.ru.length, '기본 편성에서는 공개 배치 그대로');
  const acts = (ruComp) => {
    E.setDraft({ ua: PRESET('balanced'), ru: ruComp });
    assert.equal(E.publicSetup('ru').length, 0, '직접 편성 판: 공개 배치 없음');
    const st = E.createInitialState();
    st.turn = 'ua'; E.startTurn(st);
    const { rng, diceRng } = seeded(31337);
    return JSON.stringify(E.aiTakeTurn(st, 'ua', rng, 'normal', { recordSnapshots: false, diceRng }));
  };
  const a = acts(PRESET('armor')), b = acts(PRESET('fires')), c = acts({ infantry: 13 });
  assert.equal(a, b); assert.equal(a, c);
  E.setDraft(null);
});

test('[편성] 게임 기록·이어하기: 직접 편성 판만 draft 필드, 기록 없는 예전 판은 기본으로 읽힘', () => {
  loadSym();
  assert.equal(E.buildGameRecord(E.createInitialState(), 'normal').draft, undefined);
  E.setDraft({ ua: PRESET('armor') });
  const st = E.createInitialState();
  assert.equal(E.buildGameRecord(st, 'normal').draft.mode, 'custom');
  E.setDraft(null);
  const saved = JSON.parse(JSON.stringify(st));
  assert.equal(E.restoreDraft(saved), true); assert.equal(C().DEPLOYMENT.ua.length, 8);
  const old = JSON.parse(JSON.stringify(E.upgradeSavedState(saved).state)); delete old.draft;
  assert.equal(E.restoreDraft(old), false); assert.equal(C().DEPLOYMENT.ua.length, 7);
  assert.equal(E.upgradeSavedState(saved).state.draft.mode, 'custom');
});

test('[편성] 문구: ko/en 모두에 있고, 엔진·시나리오 파일에 한글 리터럴 없음', () => {
  const ko = [...run('Object.keys(STRINGS.ko)')], en = new Set([...run('Object.keys(STRINGS.en)')]);
  const mine = ko.filter((k) => /^(draft|draftErr)\./.test(k) || ['rules.sec.draft', 'rules.draft', 'scenErr.draft'].includes(k) || k.startsWith('curtain.draft'));
  assert.ok(mine.length >= 30);
  for (const k of mine) assert.ok(en.has(k), k);
  for (const f of ['js/engine.js', 'js/scenarios/symmetric.js']) assert.ok(!/[가-힣]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), f);
});

/* ---------------- 데모 2 (규칙 세트 dice): js/combat.js ---------------- */
// 사격 시험용 판: 춘천 지도 위에 유닛을 직접 놓는다. spec = [id, side(역할 순서 0/1), type, r, c]
function diceBoard(spec, ruleset = 'dice') {
  E.loadScenario('chuncheon');
  E.setRuleset(ruleset);
  const st = E.createInitialState();
  const sides = C().ROUND_ORDER;
  st.units = spec.map(([id, k, type, r, c]) => ({ id, side: sides[k], type, r, c, hp: C().MAX_HP, moved: false, acted: false }));
  st.pending = [];
  st.turn = sides[0];
  E.startTurn(st);
  return st;
}
const targetsOf = (st, id) => E.getAttackableTiles(st, id).map((p) => `${p.r},${p.c}`).sort();
const withRuleset = (r, fn) => { try { E.setRuleset(r); return fn(); } finally { E.setRuleset('classic'); } };
/** 일직선으로 놓기 좋은 평지 가로 구간 (r, c): c..c+6 이 모두 평지 */
function plainRun() {
  E.loadScenario('chuncheon');
  const M = C().MAP;
  for (let r = 1; r < M.length - 1; r++) for (let c = 0; c + 6 < M.length; c++) {
    if ([...Array(7).keys()].every((k) => M[r][c + k] === '.')) return { r, c };
  }
  throw new Error('평지 구간 없음');
}
/** 가로 한 칸의 지형을 잠시 바꿔 실행 (끝나면 복구) */
function withTerrain(r, c, ch, fn) {
  const row = C().MAP[r];
  C().MAP[r] = row.slice(0, c) + ch + row.slice(c + 1);
  try { return fn(); } finally { C().MAP[r] = row; }
}

test('[데모2] 명중 확률 공식: 표의 값, 0은 항상 성공, 주사위 없으면 명중 불가', () => {
  const p = (A, N) => +(E.diceHitP(A, N) * 100).toFixed(1);
  assert.equal(p(3, 3), 99.2); assert.equal(p(3, 6), 87.5); assert.equal(p(3, 10), 27.1); assert.equal(p(1, 15), 10);
  assert.equal(E.diceOneP(99), 0.1, 'N 이 아무리 커도 0 이 있어 10%');
  assert.ok(E.diceFaceOk(0, 99) && !E.diceFaceOk(1, 2) && E.diceFaceOk(2, 2));
  assert.equal(p(0, 3), 0);
  assert.equal(E.diceOneP(1), 1, 'N ≤ 1 이면 항상 성공 (확률 100% 상한)');
});

test('[데모2] 대상: 네 방향 직선의 첫 유닛만, 아군·적군 모두 막고 지형은 막지 않음, 대각선 불가, 안 보이는 적은 제외', () => {
  const { r, c } = plainRun();
  let st = diceBoard([['S1', 0, 'armor', r, c], ['N1', 1, 'infantry', r, c + 2], ['N2', 1, 'infantry', r, c + 3]]);
  jsonEq(targetsOf(st, 'S1'), [`${r},${c + 2}`], '뒤의 적은 막힘');
  st = diceBoard([['S1', 0, 'armor', r, c], ['S2', 0, 'infantry', r, c + 1], ['N1', 1, 'infantry', r, c + 2]]);
  jsonEq(targetsOf(st, 'S1'), [], '아군이 막음');
  st = diceBoard([['S1', 0, 'armor', r, c], ['N1', 1, 'infantry', r, c + 1], ['N2', 1, 'infantry', r, c + 2]]);
  jsonEq(targetsOf(st, 'S1'), [`${r},${c + 1}`], '앞의 적이 뒤를 막음');
  st = diceBoard([['S1', 0, 'armor', r, c], ['N1', 1, 'infantry', r + 1, c + 1]]);
  jsonEq(targetsOf(st, 'S1'), [], '대각선 불가');
  st = diceBoard([['S1', 0, 'armor', r, c + 3], ['N1', 1, 'infantry', r, c + 1], ['N2', 1, 'infantry', r, c + 5]]);
  assert.equal(targetsOf(st, 'S1').length, 2, '방향마다 첫 유닛');
  withTerrain(r, c + 1, 'f', () => {
    const s2 = diceBoard([['S1', 0, 'armor', r, c], ['N1', 1, 'infantry', r, c + 2]]);
    withTerrain(r, c + 1, 'f', () => jsonEq(targetsOf(s2, 'S1'), [`${r},${c + 2}`], '지형은 시선을 막지 않음'));
  });
  st = diceBoard([['S1', 0, 'infantry', r, c], ['N1', 1, 'infantry', r, c + 4]]);
  jsonEq(targetsOf(st, 'S1'), [], '안 보이는 적은 대상이 아님');
  E.setRuleset('classic');
});

const DS = () => C().DICE_STATS;
/** 표의 값을 잠시 바꿔 실행 (끝나면 복구). patch = { 병종: { 필드: 값 } } */
function withStats(patch, fn) {
  const saved = JSON.parse(JSON.stringify(DS()));
  for (const [k, v] of Object.entries(patch)) Object.assign(DS()[k], v);
  try { return fn(); } finally { for (const k of Object.keys(DS())) delete DS()[k]; Object.assign(DS(), saved); E.setRuleset('classic'); }
}
const chanceOf = (spec, att, d, hp = {}) => {   // att(공격 병종)가 평지 거리 d 의 대상 병종을 쏠 때의 hc.dice
  const { r, c } = plainRun();
  const st = diceBoard([['S1', 0, att[0], r, c], ['N1', 1, att[1], r, c + d]]);
  if (hp.att != null) st.units[0].hp = hp.att;
  if (hp.def != null) st.units[1].hp = hp.def;
  const hc = E.computeHitChance(st, 'S1', { r, c: c + d });
  E.setRuleset('classic');
  return hc;
};

test('[데모2] 수치 표: 모든 병종에 값이 있고 검사 통과, 빠진 값·잘못된 값은 오류로 알려 줌', () => {
  E.loadScenario('chuncheon');
  jsonEq(E.diceStatsErrors(), []);
  for (const k of Object.keys(C().UNIT_TYPES)) assert.ok(DS()[k] && Number.isInteger(DS()[k].defense), k);
  // 표의 값 그대로 (사용자가 정한 수치)
  assert.equal(DS().infantry.attack, 2); assert.equal(DS().infantry.defense, 5); assert.equal(DS().infantry.maxRange, 4);
  assert.equal(DS().armor.attack, 3); assert.equal(DS().armor.defense, 6); assert.equal(DS().armor.maxRange, 6);
  assert.equal(DS().antitank.attack, 2); assert.equal(DS().antitank.defense, 4); assert.equal(DS().antitank.bonusDice.armor, 2);
  assert.equal(DS().recon.attack, 1); assert.equal(DS().recon.defense, 4); assert.equal(DS().recon.maxRange, 3);
  assert.equal(DS().mortar.defense, 4); assert.equal(DS().artillery.defense, 3); assert.equal(DS().signal.defense, 3);
  assert.equal(DS().mortar.attack, 2); assert.equal(DS().artillery.attack, 3, '간접 화력의 주사위 수');
  assert.equal(DS().signal.attack, undefined, '통신은 공격 못 함');
  for (const k of ['mortar', 'artillery']) { assert.equal(DS()[k].maxRange, undefined, `${k} 사거리는 UNIT_TYPES 그대로`); assert.ok(!E.isDirectType(k) && E.isIndirectDiceType(k)); }
  const bads = [
    [{ infantry: { attack: undefined } }, 'infantry.attack'], [{ armor: { defense: -1 } }, 'armor.defense'], [{ recon: { maxRange: 0 } }, 'recon.maxRange'],
    [{ antitank: { bonusDice: { 없는병종: 2 } } }, 'antitank.bonusDice'], [{ signal: { attack: 1 } }, 'signal.attack'],
    [{ mortar: { attack: undefined } }, 'mortar.attack'], [{ artillery: { maxRange: 3 } }, 'artillery.maxRange'], [{ mortar: { bonusDice: { armor: 1 } } }, 'mortar.bonusDice'],
  ];
  for (const [patch, where] of bads) withStats(patch, () => assert.ok([...E.diceStatsErrors()].some((m) => m.includes(where)), where));
  const row = DS().mortar; delete DS().mortar;
  try { assert.ok([...E.diceStatsErrors()].some((m) => m.includes('mortar'))); assert.throws(() => E.setRuleset('dice')); } finally { DS().mortar = row; E.setRuleset('classic'); }
  assert.equal(E.rulesetOf(), 'classic');
});

test('[데모2] 확률: 표의 수치에서 문서의 값 (보병 84·75·51, 기갑 88·49, 대전차→기갑 94·59, 정찰→보병 60)', () => {
  const pct = (att, d) => Math.round(chanceOf(0, att, d).chance);
  assert.equal(pct(['infantry', 'infantry'], 1), 84); assert.equal(pct(['infantry', 'infantry'], 2), 75); assert.equal(pct(['infantry', 'infantry'], 4), 51);
  assert.equal(pct(['armor', 'armor'], 1), 88); assert.equal(pct(['armor', 'armor'], 4), 49);
  assert.equal(pct(['antitank', 'armor'], 1), 94); assert.equal(pct(['antitank', 'armor'], 4), 59);
  assert.equal(pct(['recon', 'infantry'], 1), 60);
  const d = chanceOf(0, ['infantry', 'infantry'], 2).dice;
  assert.equal(d.need, DS().infantry.defense + 1, 'N = defense + (d - 1)');
});

test('[데모2] 대전차 보너스: 기갑을 쏠 때만 +2, 확인 시트용 값이 한 줄에 들어감', () => {
  const vsArmor = chanceOf(0, ['antitank', 'armor'], 1).dice, vsInf = chanceOf(0, ['antitank', 'infantry'], 1).dice;
  assert.equal(vsArmor.count, 4); assert.equal(vsArmor.bonus, 2); assert.equal(vsArmor.base, 2);
  assert.equal(vsInf.count, 2); assert.equal(vsInf.bonus, 0);
  assert.equal(chanceOf(0, ['armor', 'armor'], 1).dice.count, 3, '다른 병종은 보너스 없음');
  // 다른 병종·대상도 데이터만 추가하면 됨
  withStats({ infantry: { bonusDice: { recon: 1 } } }, () => {
    assert.equal(chanceOf(0, ['infantry', 'recon'], 1).dice.count, 3);
    assert.equal(chanceOf(0, ['infantry', 'infantry'], 1).dice.count, 2);
  });
});

test('[데모2] 체력 보정과 최소 1개: max(1, 체력보정(attack + bonus)), 방어는 max(0, defense - 보정)', () => {
  const pen = (hp) => (C().MAX_HP - hp) * C().COMBAT.hpPenaltyPerLoss;
  // 대전차(2 + 기갑 보너스 2 = 4)가 체력 2 일 때: 4 - 보정, 대상이 보병이면 2 - 보정 (최소 1)
  for (const hp of [4, 3, 2, 1]) {
    const a = chanceOf(0, ['antitank', 'armor'], 1, { att: hp }).dice, b = chanceOf(0, ['antitank', 'infantry'], 1, { att: hp }).dice;
    assert.equal(a.count, Math.max(1, 4 - pen(hp)), `기갑 대상 hp${hp}`);
    assert.equal(b.count, Math.max(1, 2 - pen(hp)), `보병 대상 hp${hp}`);
    assert.equal(b.minApplied, 2 - pen(hp) < 1);
  }
  assert.equal(chanceOf(0, ['recon', 'infantry'], 1, { att: 1 }).dice.count, 1, '정찰은 체력이 낮아도 최소 1개');
  assert.equal(chanceOf(0, ['recon', 'infantry'], 1, { att: 1 }).dice.minApplied, true);
  assert.equal(chanceOf(0, ['recon', 'infantry'], 1).dice.minApplied, false);
  // 방어
  const d = chanceOf(0, ['armor', 'infantry'], 1, { def: 2 }).dice;
  assert.equal(d.def, Math.max(0, DS().infantry.defense - pen(2)));
  // 순서: 보너스를 먼저 더하고 체력 보정, 마지막에 최소 1개 (대전차 hp 1 → 4 - 3 = 1, 보너스를 나중에 더하면 3 이 됨)
  assert.equal(chanceOf(0, ['antitank', 'armor'], 1, { att: 1 }).dice.count, 1);
  // 공격 못 하는 유닛(통신)은 최소 1개 보정 없음 = 직접 사격 대상이 없음
  const { r, c } = plainRun();
  const st = diceBoard([['S1', 0, 'signal', r, c], ['N1', 1, 'infantry', r, c + 1]]);
  jsonEq(targetsOf(st, 'S1'), []);
  assert.equal(E.diceCount({ type: 'signal', hp: 4 }, 'infantry'), null);
  E.setRuleset('classic');
});

test('[데모2] 사거리: maxRange 밖은 후보에서 빠지고 안은 거리 보정, 표를 바꾸면 같이 바뀜', () => {
  const { r, c } = plainRun();   // c..c+6
  const board = (att, d) => diceBoard([['S1', 0, att, r, c], ['N1', 1, 'infantry', r, c + d]]);
  let st = board('recon', 3);
  jsonEq(targetsOf(st, 'S1'), [`${r},${c + 3}`], '정찰 maxRange 3 안');
  st = board('recon', 4);
  jsonEq(targetsOf(st, 'S1'), [], '정찰 maxRange 3 밖');
  withStats({ recon: { maxRange: 5 } }, () => { const s2 = board('recon', 4); jsonEq(targetsOf(s2, 'S1'), [`${r},${c + 4}`]); });
  st = board('recon', 5);
  jsonEq(targetsOf(st, 'S1'), [], '정찰 시야 5 안이지만 maxRange 3 밖');
  withStats({ recon: { maxRange: null } }, () => { const s2 = board('recon', 5); jsonEq(targetsOf(s2, 'S1'), [`${r},${c + 5}`], 'null 이면 무제한'); });
  E.setRuleset('classic');
});

test('[데모2] 표를 바꾸면 판정·시트용 값·AI 평가가 같은 값을 씀 (한 곳의 데이터)', () => {
  const before = chanceOf(0, ['infantry', 'infantry'], 1).dice;
  withStats({ infantry: { attack: 5, defense: 2 } }, () => {
    const after = chanceOf(0, ['infantry', 'infantry'], 1);
    assert.equal(after.dice.count, 5); assert.equal(after.dice.need, 2);
    // 같은 계산 함수를 AI 평가(calcHitBreakdown)도 부름
    E.setRuleset('dice');
    const calc = run('calcHitBreakdown')({ attacker: { type: 'infantry', hp: 4 }, defender: { type: 'infantry', hp: 4 }, terrain: { hitMod: 0, key: 'plain' }, signal: false, fogged: false });
    assert.equal(Math.round(calc.chance * 10), Math.round(after.chance * 10));
    assert.equal(calc.dice.count, 5);
    E.setRuleset('classic');
  });
  assert.equal(chanceOf(0, ['infantry', 'infantry'], 1).dice.count, before.count);
});

test('[데모2] 판정: 주사위 개수만큼 굴려 기록, 하나라도 성공하면 명중(피해는 한 번), 같은 시드는 같은 결과', () => {
  const { r, c } = plainRun();
  const play = (seed) => {
    const st = diceBoard([['S1', 0, 'armor', r, c], ['N1', 1, 'infantry', r, c + 1]]);
    const ev = E.resolveAttack(st, 'S1', { r, c: c + 1 }, E.createSeededRng(seed));
    E.setRuleset('classic');
    return ev;
  };
  let hits = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const ev = play(seed), roll = ev.find((e) => e.type === 'diceRoll');
    assert.equal(roll.rule, 'dice'); assert.equal(roll.rolls.length, DS().armor.attack); assert.equal(roll.diceCount, roll.rolls.length);
    assert.ok(roll.rolls.every((f) => f >= 0 && f <= 9));
    assert.equal(roll.hit, roll.rolls.some((f) => f === 0 || f >= roll.dice.need));
    assert.equal(ev.filter((e) => e.type === 'damage').length, roll.hit ? 1 : 0, '성공이 여러 개여도 피해 한 번');
    if (roll.hit) hits++;
  }
  assert.ok(hits > 100);
  jsonEq(play(7), play(7), '같은 시드 → 같은 굴림');
});

/** 정해진 눈을 차례로 내는 난수 (눈 f → (f+0.5)/10). 다 쓰면 마지막 눈을 반복 */
const seqRng = (faces) => { let i = 0; return () => (faces[Math.min(i++, faces.length - 1)] + 0.5) / 10; };
const GAME = () => run('GAME_CONFIG');
/** diceBoard 는 시나리오를 다시 불러 지형이 초기화되므로, 판을 만든 뒤 칸의 지형을 바꿔 fn(st) 실행 (끝나면 복구) */
function boardWithTerrain(spec, r, c, ch, fn) {
  const st = diceBoard(spec);
  return withTerrain(r, c, ch, () => fn(st));
}
/** 간접 화력 시험판: spec 에 정찰 SP 를 (r-1, c) 에 더해 넓게 봐 줌 */
const indBoard = (spec) => diceBoard([...spec, ['SP', 0, 'recon', spec[0][3] - 1, spec[0][4]]]);   // 쏘는 유닛(spec[0]) 바로 위

test('[데모2·간접] 확률: 박격포 A=2 (방어 5) 거리 2·3·4 = 75·64·51, 포병 A=3 거리 2 = 88, 방어 6 거리 5 = 27, 맹사격 +2 = 51', () => {
  const { r, c } = plainRun();
  const pct = (att, d, tgt = 'infantry') => { const v = Math.round(E.computeHitChance(indBoard([['S1', 0, att, r, c], ['N1', 1, tgt, r, c + d]]), 'S1', { r, c: c + d }).chance); E.setRuleset('classic'); return v; };
  assert.equal(pct('mortar', 2), 75); assert.equal(pct('mortar', 3), 64); assert.equal(pct('mortar', 4), 51);
  assert.equal(pct('artillery', 2), 88);
  assert.equal(pct('artillery', 5, 'armor'), 27, '방어 6, 거리 5 → N=10');
  E.setRuleset('dice');
  const n = E.diceIndirectNeed({ type: 'infantry', hp: 4 }, { hitMod: 0, key: 'plain' }, 2, true);
  assert.equal(n.need, 8); assert.equal(n.blindBonus, GAME().DICE_RULES.blindPenalty);
  assert.equal(Math.round(E.diceHitP(2, n.need) * 100), 51, '맹사격 박격포 A=2, 방어 5, 거리 2');
  E.setRuleset('classic');
});

test('[데모2·간접] 시야 밖 조준 = 맹사격 +blindPenalty (범위 안 모두 같은 값), 시야 안이면 0', () => {
  const { r, c } = plainRun();
  let st = indBoard([['S1', 0, 'artillery', r, c], ['N1', 1, 'infantry', r, c + 3], ['N2', 1, 'infantry', r, c + 2]]);
  let d = E.computeHitChance(st, 'S1', { r, c: c + 3 }).dice;
  assert.equal(d.blind, false); assert.equal(d.blindBonus, 0);
  st = diceBoard([['S1', 0, 'artillery', r, c], ['N1', 1, 'infantry', r, c + 3], ['N2', 1, 'infantry', r, c + 2]]);   // 포병 시야 1: 조준 칸 안 보임
  d = E.computeHitChance(st, 'S1', { r, c: c + 3 }).dice;
  assert.equal(d.blind, true); assert.equal(d.blindBonus, GAME().DICE_RULES.blindPenalty);
  for (const x of d.area) assert.equal(x.need, x.def + x.terrain + 2 + GAME().DICE_RULES.blindPenalty, '거리 3 → +2, 맹사격 +blindPenalty');
  E.setRuleset('classic');
});

test('[데모2·간접] 한 세트 굴림: 범위 안 유닛이 같은 눈으로 각자 N 비교 (눈 {3,8}: N=7 명중, N=9 빗나감), 빗나간 유닛은 피해·후퇴 없음', () => {
  const { r, c } = plainRun();
  const spec1 = [['S1', 0, 'artillery', r, c], ['N1', 1, 'infantry', r, c + 3], ['N2', 1, 'armor', r, c + 2], ['SP', 0, 'recon', r - 1, c]];
  boardWithTerrain(spec1, r, c + 2, 'f', (st) => {
    const ev = E.resolveAttack(st, 'S1', { r, c: c + 3 }, seqRng([3, 8, 1]));
    E.setRuleset('classic');
    const roll = ev.find((e) => e.type === 'diceRoll');
    jsonEq(roll.rolls, [3, 8, 1]); assert.equal(roll.diceCount, 3); assert.equal(roll.rule, 'dice');
    jsonEq(ev.filter((e) => e.type === 'diceUnit').map((e) => [e.unitId, e.need, e.hit]), [['N1', 7, true], ['N2', 9, false]]);
    assert.ok(ev.some((e) => e.type === 'damage' && e.unitId === 'N1'));
    assert.ok(ev.some((e) => e.type === 'suppressed' && e.unitId === 'N1'), '중심 유닛이 명중해야 제압');
    assert.ok(!ev.some((e) => e.unitId === 'N2' && ['splashDamage', 'retreat', 'suppressed', 'damage'].includes(e.type)), '빗나간 유닛은 아무 일 없음');
    assert.equal(st.units.find((u) => u.id === 'N2').hp, C().MAX_HP);
    assert.equal(st.units.find((u) => u.id === 'N2').c, c + 2, '후퇴 없음');
    assert.equal(st.units.find((u) => u.id === 'S1').acted, true, '쏘면 행동 소모');
  });
});

test('[데모2·간접] 중심이 빗나가도 이웃이 명중하면 피해와 후퇴 (제압 없음), 아군 오폭은 피해만, 빈 칸에 떨어져도 판정', () => {
  const { r, c } = plainRun();
  const spec2 = [['S1', 0, 'artillery', r, c], ['N1', 1, 'armor', r, c + 3], ['N2', 1, 'infantry', r, c + 4], ['S2', 0, 'infantry', r, c + 2], ['SP', 0, 'recon', r - 1, c]];
  boardWithTerrain(spec2, r, c + 3, 'f', (st) => {
    const ev = E.resolveAttack(st, 'S1', { r, c: c + 3 }, seqRng([8, 1, 1]));
    E.setRuleset('classic');
    assert.ok(!ev.some((e) => e.unitId === 'N1' && ['damage', 'suppressed', 'retreat'].includes(e.type)), '중심 빗나감');
    assert.ok(ev.some((e) => e.type === 'splashDamage' && e.unitId === 'N2'));
    assert.ok(ev.some((e) => e.type === 'retreat' && e.unitId === 'N2'), '이웃 명중 → 후퇴');
    assert.ok(!ev.some((e) => e.type === 'suppressed'));
    assert.ok(ev.some((e) => e.type === 'splashDamage' && e.unitId === 'S2'), '아군 오폭도 자기 N 으로 명중');
    assert.ok(!ev.some((e) => e.unitId === 'S2' && ['retreat', 'suppressed'].includes(e.type)), '아군 오폭: 후퇴·제압 없음');
  });
  const st2 = indBoard([['S1', 0, 'mortar', r, c]]);
  const ev2 = E.resolveAttack(st2, 'S1', { r, c: c + 3 }, seqRng([5, 5]));
  E.setRuleset('classic');
  assert.equal(ev2.find((e) => e.type === 'diceRoll').rolls.length, 2);
  assert.equal(ev2.filter((e) => e.type === 'diceUnit').length, 0);
  assert.ok(ev2.some((e) => e.type === 'miss')); assert.equal(st2.units.find((u) => u.id === 'S1').acted, true);
});

test('[데모2·간접] 박격포는 중심 한 칸만, 체력이 줄면 주사위 수가 줄고 최소 1개, 사거리·대상 칸은 classic 과 같음', () => {
  const { r, c } = plainRun();
  const st = indBoard([['S1', 0, 'mortar', r, c], ['N1', 1, 'infantry', r, c + 3], ['N2', 1, 'infantry', r, c + 4]]);
  let d = E.computeHitChance(st, 'S1', { r, c: c + 3 }).dice;
  jsonEq(d.area.map((x) => x.id), ['N1'], '박격포는 이웃 칸 없음');
  st.units.find((u) => u.id === 'S1').hp = 1;
  d = E.computeHitChance(st, 'S1', { r, c: c + 3 }).dice;
  assert.equal(d.count, 1); assert.equal(d.minApplied, true);
  E.setRuleset('classic');
  for (const k of ['mortar', 'artillery']) {
    const tiles = (rs) => withRuleset(rs, () => E.getAttackableTiles(indBoard([['S1', 0, k, r, c]]), 'S1').map((p) => `${p.r},${p.c}`).sort());
    jsonEq(tiles('dice'), tiles('classic'), k);
    assert.ok(tiles('dice').length > 0);
  }
  assert.equal(E.rulesetOf(), 'classic');
  assert.equal(E.setRuleset('이상한값'), 'classic');
});

test('[데모2·간접] 안개: 범위 안 목록은 보는 쪽 시야 안 유닛만 (안 보이는 유닛의 필요한 숫자·확률은 화면에 내지 않음)', () => {
  const { r, c } = plainRun();
  E.setRuleset('dice');
  const st = diceBoard([['S1', 0, 'artillery', r, c], ['S2', 0, 'infantry', r, c + 1], ['S3', 0, 'artillery', r, c + 2], ['N1', 1, 'infantry', r, c + 3], ['N2', 1, 'infantry', r, c + 4]]);
  const hc = E.computeHitChance(st, 'S1', { r, c: c + 3 });
  const vis = E.getVisibleTiles(st, st.units[0].side);
  assert.equal(hc.dice.blind, false);
  assert.ok(hc.dice.area.some((x) => x.id === 'N2'), '엔진 값에는 있음 (화면이 걸러야 함)');
  jsonEq(E.diceAreaVisible(hc.dice.area, vis).map((x) => x.id).sort(), ['N1', 'S3'], '시야 밖 N2 는 목록에서 빠짐');
  E.setRuleset('classic');
});

test('[데모2] simulateGames: 모든 시나리오가 dice 로 끝까지 돌고 같은 시드는 같은 결과, 규칙 세트는 되돌아옴', () => {
  for (const s of E.SCENARIOS.filter((x) => !x.hidden)) {
    const a = E.simulateGames(2, { scenario: s.id, ruleset: 'dice', quiet: true });
    const b = E.simulateGames(2, { scenario: s.id, ruleset: 'dice', quiet: true });
    assert.equal(a.errors, 0, s.id);
    assert.equal(JSON.stringify(a), JSON.stringify(b), `${s.id} 결정적`);
    assert.equal(E.rulesetOf(), 'classic');
  }
});

test('[데모2] 문구: ko/en 모두에 있고, combat.js 에 한글 리터럴 없음', () => {
  const ko = [...run('Object.keys(STRINGS.ko)')], en = new Set([...run('Object.keys(STRINGS.en)')]);
  const mine = ko.filter((k) => /^(dice2\.|rules\.dice\.|menu\.demo2|dicelog\.dice)/.test(k));
  assert.ok(mine.length >= 15);
  for (const k of mine) assert.ok(en.has(k), k);
  assert.ok(!/[가-힣]/.test(fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
});

/* ---------------- 주사위 굴림 연출 (js/dice-fx.js): 보여 주기만, 판정과 난수는 엔진 ---------------- */
const FX = () => run('DICE_FX');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('[주사위연출] 타임라인: 첫 주사위 0.8초, 이후 0.2초 간격, 마지막 정지 0.5초 뒤 문구, 문구 뒤 0.3초 정지, 0.2초 사라짐 (배속 반영)', () => {
  for (const [A, speed] of [[1, 1], [4, 1], [4, 0.7], [6, 1.6], [3, 0.7]]) {
    const tl = E.diceFxTimeline(A, speed);
    assert.equal(tl.stop.length, A); assert.equal(tl.appear.length, A);
    for (let i = 0; i < A; i++) { near(tl.stop[i], (800 + i * 200) / speed); near(tl.appear[i], (100 + i * 40) / speed); }
    const verdict = Math.max(1700, 800 + (A - 1) * 200 + 500);
    near(tl.verdictAt, verdict / speed); near(tl.holdEnd, (verdict + 300) / speed); near(tl.totalMs, (verdict + 300) / speed + 200);
  }
  const t4 = E.diceFxTimeline(4, 1);
  near(t4.verdictAt, 1900); near(t4.stop[3], 1400);
  near(E.diceFxTimeline(1, 1).verdictAt, 1700, 1e-6);   // 주사위가 적어도 문구는 1.7초 이전에 나오지 않음
  assert.ok(E.diceFxTimeline(6, 1).totalMs > E.diceFxTimeline(3, 1).totalMs);
});

test('[주사위연출] 배속: 내 공격 0.7, 상대 1.6 (데이터 상수), 연출 속도 설정의 시간 배율을 반영', () => {
  assert.equal(FX().speedMine, 0.7); assert.equal(FX().speedOther, 1.6);
  assert.equal(E.diceFxSpeed(true), 0.7); assert.equal(E.diceFxSpeed(false), 1.6);
  near(E.diceFxSpeed(true, 1.5), 0.7 / 1.5); near(E.diceFxSpeed(false, 0.5), 3.2);
  assert.ok(E.diceFxTimeline(4, E.diceFxSpeed(true)).totalMs > E.diceFxTimeline(4, E.diceFxSpeed(false)).totalMs, '내 공격이 더 느림');
});

test('[주사위연출] 멈추는 눈과 성공 표시는 엔진 결과와 항상 일치 (여러 개수·필요한 숫자)', () => {
  const { r, c } = plainRun();
  let checked = 0;
  for (const [att, def, d] of [['armor', 'infantry', 1], ['armor', 'infantry', 3], ['infantry', 'infantry', 2], ['recon', 'infantry', 1], ['antitank', 'armor', 1], ['antitank', 'armor', 2]]) {   // 시야 안(대전차 시야 2)
    for (let seed = 1; seed <= 60; seed++) {
      const st = diceBoard([['S1', 0, att, r, c], ['N1', 1, def, r, c + d]]);
      const ev = E.resolveAttack(st, 'S1', { r, c: c + d }, E.createSeededRng(seed * 31 + d));
      E.setRuleset('classic');
      const roll = ev.find((e) => e.type === 'diceRoll');
      const fx = E.diceFxFaces(roll.rolls, roll.dice.need);
      jsonEq(fx.faces.map((f) => f.value), roll.rolls, '멈추는 눈 = 엔진이 굴린 값');
      assert.equal(fx.hit, roll.hit, '명중 표시 = 실제 판정');
      for (const f of fx.faces) assert.equal(f.ok, f.value === 0 || f.value >= roll.dice.need);
      checked++;
    }
  }
  assert.equal(checked, 360);
});

test('[주사위연출] 안 보이는 공격·가림 화면에서는 시작하지 않고, classic 과 간접 화력은 대상이 아님', () => {
  const ok = { rule: 'dice', mine: false, tVis: false, fVis: false, curtain: false };
  assert.equal(E.diceFxShouldPlay(ok), false, '공격자도 대상도 안 보임');
  assert.equal(E.diceFxShouldPlay({ ...ok, tVis: true }), true);
  assert.equal(E.diceFxShouldPlay({ ...ok, fVis: true }), true);
  assert.equal(E.diceFxShouldPlay({ ...ok, mine: true }), true);
  assert.equal(E.diceFxShouldPlay({ ...ok, mine: true, curtain: true }), false, '가림 화면 중');
  assert.equal(E.diceFxShouldPlay({ ...ok, rule: undefined, mine: true }), false, 'classic 판정(굴림이 1~10)은 이번에 적용하지 않음');
  assert.equal(E.diceFxShouldPlay({ ...ok, rule: 'classic', mine: true }), false);
});

test('[주사위연출] 크기와 위치: 5개 이상은 52px, 좁은 화면에서도 한 줄, 공격자·대상을 가리지 않음', () => {
  assert.equal(E.diceFxSize(4, 800), 60); assert.equal(E.diceFxSize(5, 800), 52); assert.equal(E.diceFxSize(6, 800), 52);
  for (const w of [300, 320, 340, 360]) {
    const s = E.diceFxSize(6, w), pad = FX().padPx, gap = FX().gapPx, m = FX().placeMarginPx;
    assert.ok(s >= FX().minSizePx && s <= 52);
    if (s > FX().minSizePx) assert.ok(6 * s + 5 * gap + 2 * pad <= w - 2 * m + 1e-9, `폭 ${w}: 6개가 한 줄`);
  }
  const box = { w: 400, h: 400 }, size = { w: 300, h: 120 };
  const center = E.diceFxPlace(box, size, []);
  near(center.x, 50); near(center.y, 140);   // 비어 있으면 가운데
  const blocked = [{ x: 150, y: 150, w: 100, h: 100 }];   // 가운데를 막는 유닛
  const moved = E.diceFxPlace(box, size, blocked);
  assert.ok(moved.y + size.h <= 150 || moved.y >= 250, '위나 아래로 비킴');
  assert.ok(moved.y >= FX().placeMarginPx && moved.y + size.h <= box.h - FX().placeMarginPx, '지도 안');
  // 위·아래 모두 막히면 겹침이 가장 적은 곳
  const all = E.diceFxPlace(box, size, [{ x: 0, y: 0, w: 400, h: 400 }]);
  assert.ok(all.y >= 0 && all.y + size.h <= 400);
});

test('[주사위연출] 색: 공격 진영의 색에서 굴림/성공/실패 세 벌, 색이 없으면 파랑/빨강 기본', () => {
  const lum = (b) => 0.3 * b[0] + 0.59 * b[1] + 0.11 * b[2];
  for (const [hex, blue] of [['#1e88e5', true], ['#e53935', false]]) {
    const p = E.diceFxPalette(hex, blue ? 'ally' : 'enemy');
    assert.ok(lum(p.ok.base) > lum(p.roll.base), '성공은 더 밝음'); assert.ok(lum(p.no.base) < lum(p.roll.base), '실패는 어둡고 탁함');
    assert.ok(p.ok.glow && p.no.numAlpha < 1);
    const dom = blue ? p.ok.base[2] > p.ok.base[0] : p.ok.base[0] > p.ok.base[2];
    assert.ok(dom, blue ? '파란 계열' : '빨간 계열');
  }
  jsonEq(E.diceFxPalette(undefined, 'ally'), run('DICE_PAL').ally); jsonEq(E.diceFxPalette('red', 'enemy'), run('DICE_PAL').enemy);
  // 시나리오의 진영 색 데이터가 읽힘
  for (const s of E.SCENARIOS.filter((x) => !x.hidden)) for (const side of Object.values(s.sides)) assert.ok(/^#[0-9a-f]{6}$/i.test(side.color), `${s.id} 진영 색`);
});

test('[주사위연출] 연출은 엔진·AI·시뮬레이션 경로에서 쓰이지 않음 (판정·난수에 영향 없음)', () => {
  for (const f of ['js/engine.js', 'js/combat.js', 'js/ai-intel.js', 'js/tutorial.js', 'js/rules.js']) {
    assert.ok(!/diceFx|DICE_FX/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), `${f} 에서 연출을 부르지 않음`);
  }
  // 같은 시드의 시뮬레이션은 연출 코드가 로드돼 있어도 같은 결과 (난수 호출 순서가 같음)
  const a = E.simulateGames(2, { scenario: 'chuncheon', ruleset: 'dice', quiet: true }), b = E.simulateGames(2, { scenario: 'chuncheon', ruleset: 'dice', quiet: true });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(E.diceFxDeco(5) === E.diceFxDeco(5), true, '장식용 숫자는 게임 난수를 쓰지 않는 해시');
  // 소리 이름이 audio 데이터에 있고 파일이 없어도 됨(빈 목록)
  const files = run('AUDIO.files');
  jsonEq(files.dice_roll, []); jsonEq(files.dice_land, []);
  assert.ok(run('AUDIO.loadOrder').includes('dice_roll') && run('AUDIO.loadOrder').includes('dice_land'));
});

/* ---------------- 목표 표시 (표시줄 + 목표 장면): 시나리오 데이터에서 읽음 ---------------- */
test('[목표표시] 모든 시나리오: goalInfo 가 거점 칸·이름·문구를 데이터에서 읽고, 문구 키가 ko/en 에 있고 글자 수(22/28자) 안', () => {
  for (const s of E.SCENARIOS) {
    jsonEq(E.validateGoalTexts(s), []);
    const side = s.playerSide, g = E.goalInfo(s, side);
    assert.ok(g.cells.length > 0 || (s.goal && s.goal.barKey && !s.objectives.length), `${s.id} 거점 칸 (거점이 없는 판은 goal.barKey 필요)`);
    for (const lang of ['ko', 'en']) for (const k of [g.nameKey, g.barKey, g.main, g.sub]) assert.ok(k in run('STRINGS')[lang], `${s.id} ${lang} ${k}`);
  }
});
test('[목표표시] 데이터를 바꾸면 표시가 바뀜: 거점 이름·문구·역할·기본 이름', () => {
  const base = E.SCENARIOS.find((s) => s.id === 'vuhledar');
  assert.equal(E.goalInfo(base, 'ua').nameKey, base.objectives[0].nameKey, '거점이 하나면 그 이름');
  assert.equal(E.goalInfo({ ...base, goal: { nameKey: 'obj.SC' } }, 'ua').nameKey, 'obj.SC');
  assert.equal(E.goalInfo({ ...base, objectives: [...base.objectives, { id: 'X', nameKey: 'obj.T', cells: [[0, 0]] }] }, 'ua').nameKey, 'goal.zone', '거점이 여러 개면 노란 구역');
  assert.equal(E.goalInfo({ ...base, objectives: [{ id: 'X', cells: [[0, 0]] }] }, 'ua').nameKey, 'goal.zone', '이름이 없으면 노란 구역');
  assert.equal(E.goalInfo({ ...base, goal: { scene: { def: { main: 'obj.T', sub: 'obj.P' } } } }, 'ua').main, 'obj.T');
  assert.equal(E.goalInfo({ ...base, goal: { role: 'att' } }, 'ua').role, 'att');
  assert.equal(E.goalInfo({ ...base, sides: { ua: {}, ru: {} } }, 'ua').role, 'att', '역할이 없으면 공격용');
});
test('[목표표시] 역할(공격/방어)에 따라 목표 장면·표시줄 문구가 바뀜', () => {
  const sc = E.SCENARIOS.find((s) => s.id === 'hostomel');
  const d = E.goalInfo(sc, 'def'), a = E.goalInfo(sc, 'att');
  assert.equal(d.role, 'def'); assert.equal(a.role, 'att');
  assert.notEqual(d.main, a.main); assert.notEqual(d.sub, a.sub); assert.notEqual(d.barKey, a.barKey);
  // 튜토리얼·연습·대칭 전장은 양쪽 모두 거점을 차지하는 판이라 방어 진영이어도 '차지' 문구
  for (const id of ['tutorial', 'tutorialPractice', 'symmetric']) assert.equal(E.goalInfo(E.SCENARIOS.find((s) => s.id === id), E.SCENARIOS.find((s) => s.id === id).playerSide).role, 'att', id);
});
test('[목표표시] goalInfo 는 게임 상태를 받지 않음 (안 보이는 정보가 섞일 수 없음) + 시뮬레이션 경로에서 쓰이지 않음', () => {
  assert.equal(E.goalInfo.length, 2);
  for (const f of ['js/engine.js', 'js/combat.js', 'js/ai-intel.js', 'js/rules.js']) assert.ok(!/goalInfo|goalScene/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
});

/* ---------------- 통신 정찰 (rulesVersion 13) ---------------- */
const unitOf = (st, id) => st.units.find((x) => x.id === id);
test('[정찰] 통신이 지점을 고르면 3x3 칸이 시야로 취급되고, 보이는 적은 시야 밖 감점 없이 대상이 됨', () => {
  const { r, c } = plainRun();
  const st = diceBoard([['S1', 0, 'signal', r, c], ['S2', 0, 'infantry', r, c + 1], ['N1', 1, 'infantry', r, c + 5]], 'classic');
  const me = C().ROUND_ORDER[0], foe = C().ROUND_ORDER[1];
  const key = (rr, cc) => rr * C().MAP.length + cc;
  assert.equal(E.getVisibleTiles(st, me).has(key(r, c + 5)), false, '정찰 전에는 안 보임');
  assert.equal(E.computeHitChance(st, 'S2', { r, c: c + 5 }).fogged, true);
  assert.ok(E.canUnitScout(st, unitOf(st, 'S1')));
  const ev = E.scoutArea(st, 'S1', { r, c: c + 5 });
  assert.equal(ev.length, 1); assert.equal(ev[0].type, 'scout'); assert.equal(ev[0].tiles.length, 9);
  const vis = E.getVisibleTiles(st, me);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) assert.ok(vis.has(key(r + dr, c + 5 + dc)), `3x3 ${dr},${dc}`);
  assert.equal(E.computeHitChance(st, 'S2', { r, c: c + 5 }).fogged, false, '정찰한 칸은 시야 안');
  assert.equal(E.getVisibleTiles(st, foe).has(key(r, c + 5)), true, '상대 시야는 상대 유닛이 있는 곳이라 그대로(자기 유닛 칸)');
  assert.equal(E.getScoutTiles(st, foe).size, 0, '상대 진영에는 정찰 칸이 없음');
  assert.ok(st.memory[me]['N1'], '정찰로 본 적은 목격 기억에 남음');
  const u = unitOf(st, 'S1');
  assert.equal(u.acted, true); assert.equal(E.canUnitScout(st, u), false, '정찰하면 행동이 끝남');
  assert.throws(() => E.scoutArea(st, 'S1', { r, c: c + 5 }));
});
test('[정찰] 거리 제한, 이동 뒤 정찰, 자기 턴이 끝나면 사라짐, 행동 제한 1회 소모', () => {
  const { r, c } = plainRun();
  const st = diceBoard([['S1', 0, 'signal', r, c], ['S2', 0, 'infantry', r, c + 1], ['N1', 1, 'infantry', r, c + 6]], 'classic');
  const R = C().SCOUT.range;
  assert.throws(() => E.scoutArea(st, 'S1', { r, c: c + R + 1 }), /./, '거리 밖');
  assert.throws(() => E.scoutArea(st, 'S2', { r, c: c + 1 }), /./, '통신이 아닌 유닛은 못 함');
  assert.equal(E.getScoutTargets(st, 'S1').every((p) => Math.abs(p.r - r) + Math.abs(p.c - c) <= R), true);
  assert.equal(E.getScoutTargets(st, 'S2').length, 0);
  const dest = E.getReachableTiles(st, 'S1')[0];
  if (dest) { E.moveUnit(st, 'S1', dest); assert.ok(E.canUnitScout(st, unitOf(st, 'S1')), '이동 뒤에도 정찰 가능'); }
  const used = st.act ? st.act.used : null;
  E.scoutArea(st, 'S1', { r, c: c + 3 });
  if (st.act) assert.equal(st.act.used, used === null ? 1 : used, '이동으로 이미 행동을 시작했다면 추가로 쓰지 않음');
  assert.ok(st.scout && st.scout.side === C().ROUND_ORDER[0]);
  E.endTurn(st);
  assert.equal(st.scout, undefined, '턴이 끝나면 사라짐');
  assert.equal(E.getScoutTiles(st, C().ROUND_ORDER[0]).size, 0);
});
test('[정찰] 통신 명중 보너스(+20)는 없어짐, 규칙 버전 13', () => {
  assert.ok(C().RULES_VERSION >= 13);
  assert.equal(C().COMBAT.signalBonus, 0);
  const { r, c } = plainRun();
  const st = diceBoard([['S1', 0, 'signal', r, c], ['S2', 0, 'infantry', r, c + 1], ['N1', 1, 'infantry', r, c + 2]], 'classic');
  const h = E.computeHitChance(st, 'S2', { r, c: c + 2 });
  assert.ok(!h.parts.some((p) => p.key === 'signal'), '통신 항목 없음');
});

/* ---------------- 관리자 편성 (setForces) ---------------- */
test('[관리자] 편성 없음/기본 편성은 기본 배치와 같음, 모든 시나리오에서 병종·수량·증원을 바꿔도 시작됨', () => {
  for (const id of SCEN_IDS) {
    E.loadScenario(id);
    const base = JSON.stringify(E.createInitialState().units) + JSON.stringify(E.createInitialState().pending);
    assert.equal(E.setForces(E.forcesDefault()), true);
    assert.equal(JSON.stringify(E.createInitialState().units.map((u) => ({ s: u.side, t: u.type, r: u.r, c: u.c })).sort((a, b) => (a.s + a.t + a.r + a.c < b.s + b.t + b.r + b.c ? -1 : 1))),
      JSON.stringify(JSON.parse(base.slice(0, base.indexOf(']') + 1)).map((u) => ({ s: u.side, t: u.type, r: u.r, c: u.c })).sort((a, b) => (a.s + a.t + a.r + a.c < b.s + b.t + b.r + b.c ? -1 : 1))), id + ': 기본 편성 = 기본 배치');
    E.setForces(null);
    assert.equal(JSON.stringify(E.createInitialState().units) + JSON.stringify(E.createInitialState().pending), base, id + ': 해제하면 완전히 원래대로');
    // 크게 바꾸기: 양쪽 시작 병력에 보병 3기 추가 + 정찰병 + 3라운드 증원 기갑 2기
    const f = E.forcesDefault();
    for (const s of C().ROUND_ORDER) { f[s].push({ round: 0, type: 'infantry', count: 3 }, { round: 0, type: 'recon', count: 1 }, { round: 3, type: 'armor', count: 2 }); }
    E.setForces(f);
    const st = E.createInitialState();
    for (const s of C().ROUND_ORDER) {
      const want = f[s].reduce((n, r) => n + r.count, 0);
      assert.equal(st.units.filter((u) => u.side === s).length + st.pending.filter((p) => p.side === s).length, want, id + ' ' + s + ': 총 병력 수');
    }
    assert.equal(new Set(st.units.map((u) => u.r + ',' + u.c)).size, st.units.length, id + ': 시작 칸 겹침 없음');
    E.setForces(null);
  }
});
test('[관리자] 오류: 병력 0, 한도 초과, 모르는 병종, 잘못된 라운드', () => {
  E.loadScenario(SCEN_IDS[0]);
  const f = E.forcesDefault(), s0 = C().ROUND_ORDER[0];
  assert.equal(E.forcesError(f), null);
  assert.ok(E.forcesError({ ...f, [s0]: [] }));
  assert.ok(E.forcesError({ ...f, [s0]: [{ round: 0, type: 'ufo', count: 1 }] }));
  assert.ok(E.forcesError({ ...f, [s0]: [{ round: 99, type: 'infantry', count: 1 }] }));
  assert.ok(E.forcesError({ ...f, [s0]: [{ round: 0, type: 'infantry', count: 999 }] }));
  assert.throws(() => E.setForces({ ...f, [s0]: [] }));
});
test('[관리자] 안개: 편성한 판은 공개 배치·공개 증원이 기본값, 상대 편성이 달라도 내 AI 행동이 같음', () => {
  loadSym();
  const f0 = E.forcesDefault();
  const acts = (ruRows) => {
    E.setForces({ ...f0, ru: ruRows });
    assert.equal(E.publicSetup('ru').length, 0);
    assert.equal(E.publicReinforcements(), C().REINFORCEMENTS_BASE);
    const st = E.createInitialState();
    st.turn = 'ua'; E.startTurn(st);
    const { rng, diceRng } = seeded(31337);
    return JSON.stringify(E.aiTakeTurn(st, 'ua', rng, 'normal', { recordSnapshots: false, diceRng }));
  };
  const a = acts([{ round: 0, type: 'infantry', count: 2 }, { round: 0, type: 'artillery', count: 1 }]);
  const b = acts([{ round: 0, type: 'armor', count: 5 }, { round: 4, type: 'mortar', count: 4 }]);
  assert.equal(a, b);
  E.setForces(null);
  assert.equal(E.publicSetup('ru').length, C().DEPLOYMENT.ru.length);
});
test('[관리자] 직접 편성(draft)과 같이 써도 해제하면 기본/편성 배치가 그대로', () => {
  loadSym();
  E.setDraft({ ua: { infantry: 13 }, ru: { infantry: 3, recon: 1 } });
  const before = JSON.stringify(C().DEPLOYMENT);
  E.setForces(null);
  assert.equal(JSON.stringify(C().DEPLOYMENT), before, 'setForces(null) 은 편성 배치를 건드리지 않음');
  E.setDraft(null);
});

/* ---------------- 소모전 판정 (roundLimitAttrition, 소형 전장) ---------------- */
test('[소형 전장] 12라운드 종료: 남은 총 체력 → 생존 유닛 수 → 무승부, 거점 없이도 판정', () => {
  E.loadScenario('skirmish');
  assert.equal(C().MAP.length, 10);
  assert.equal(C().OBJECTIVES.length, 0);
  assert.equal(E.roundLimitType(), 'roundLimitAttrition');
  const st = E.createInitialState();
  st.round = C().MAX_ROUNDS;
  const res = () => ({ ...E.checkVictory(st, { roundLimit: true }) });
  assert.deepEqual(res(), { winner: 'draw', reason: 'limitDraw' }, '같은 체력·같은 유닛 수 = 무승부');
  const ru = st.units.filter((u) => u.side === 'ru'), ua = st.units.filter((u) => u.side === 'ua');
  ru[0].hp -= 1;
  assert.deepEqual(res(), { winner: 'ua', reason: 'limitHpTotal' }, '남은 체력 합이 많은 쪽');
  ru[0].hp += 1;
  st.units.splice(st.units.indexOf(ru[1]), 1);   // ru 는 한 기 적고 체력 합도 4 적음
  assert.deepEqual(res(), { winner: 'ua', reason: 'limitHpTotal' });
  ua[0].hp = 2; ua[1].hp = 2;                      // ua 는 체력 합이 ru 와 같아지지만 유닛은 하나 더 많음
  assert.deepEqual(res(), { winner: 'ua', reason: 'limitUnits' }, '체력 합이 같으면 생존 유닛이 많은 쪽');
  ua[0].hp = 4;
  assert.deepEqual(res(), { winner: 'ua', reason: 'limitHpTotal' }, '체력이 먼저: 유닛이 더 적어도 체력 합이 많으면 이김');
  st.units.splice(st.units.indexOf(ua[2]), 1); st.units.splice(st.units.indexOf(ua[3]), 1); st.units.splice(st.units.indexOf(ua[4]), 1);
  ru.slice(2).forEach((u) => { u.hp = 1; });
  assert.equal(res().winner, 'ua', '유닛이 적어도 체력 합이 크면 이김');
  st.round = 1;
  assert.equal(E.checkVictory(st, { roundLimit: true }), null, '12라운드 전에는 끝나지 않음');
  E.loadScenario(SCEN_IDS[0]);
});

/* ---------------- 참호전 은폐 규칙 (시나리오 concealment, 소형 전장) ---------------- */
function trenchBoard(spec) {   // spec: [id, 진영 index(0=ru,1=ua), 병종, r, c]
  E.loadScenario('skirmish'); E.setRuleset('dice');
  const st = E.createInitialState(), sides = C().ROUND_ORDER;
  st.units = spec.map(([id, k, type, r, c]) => ({ id, side: sides[k], type, r, c, hp: C().MAX_HP, moved: false, acted: false }));
  st.pending = []; st.turn = sides[0]; E.startTurn(st);
  return st;
}
const tileOf = (r, c) => r * 10 + c;
const unitById = (st, id) => st.units.find((u) => u.id === id);
test('[참호전] 엄폐물·참호 안의 적은 보이지 않고, 정찰 2칸·다른 병종 1칸 안이거나 노출되면 보임, 평지는 시야 거리대로', () => {
  E.loadScenario('skirmish');
  assert.deepEqual({ ...C().CONCEALMENT }, { reconRadius: 2, otherRadius: 1 });
  let st = trenchBoard([['r1', 0, 'infantry', 3, 1], ['u1', 1, 'infantry', 3, 3], ['u2', 1, 'infantry', 4, 1]]);   // (3,3) 참호, (4,1) 평지
  const u1 = st.units[1], vis = () => E.getVisibleTiles(st, 'ru');
  assert.equal(E.isHiddenFrom(st, 'ru', u1), true);
  assert.equal(vis().has(tileOf(3, 3)), false, '시야 안(2칸)이어도 참호 속 적은 안 보임');
  assert.equal(vis().has(tileOf(4, 1)), true, '평지 적은 시야 안이면 보임');
  assert.equal(E.getTerrainVisibleTiles(st, 'ru').has(tileOf(3, 3)), true, '칸 시야에는 들어감 (안개 덮개로 존재가 새지 않음)');
  assert.equal(E.isHiddenFrom(st, 'ua', st.units[0]), false, '평지의 r1 은 숨지 않음');
  st.units.push({ id: 'r2', side: 'ru', type: 'recon', r: 5, c: 3, hp: 4, moved: false, acted: false });   // (5,3)→(3,3) = 2
  assert.equal(E.isHiddenFrom(st, 'ru', u1), false, '정찰 2칸 안');
  st.units[3].r = 6;   // 거리 3
  assert.equal(E.isHiddenFrom(st, 'ru', u1), true, '정찰 2칸 밖 (3칸은 안 보임)');
  st.units[0].c = 2;   // 보병 r1 이 (3,2)로 → (3,3) 과 인접 (1칸)
  assert.equal(E.isHiddenFrom(st, 'ru', u1), false, '다른 병종은 인접(1칸)에서 보임');
  st.units[0].c = 1;
  assert.equal(E.isHiddenFrom(st, 'ua', st.units[3]), false, '적 정찰은 평지 위라 숨지 않음');
  u1.exposed = true;
  assert.equal(E.isHiddenFrom(st, 'ru', u1), false, '노출되면 보임');
  E.loadScenario(SCEN_IDS[0]);
  assert.equal(E.isHiddenFrom(st, 'ru', u1), false, '은폐 규칙이 없는 시나리오는 언제나 false');
});
test('[참호전] 숨은 유닛이 직선 사격을 막아 대신 맞고, 사격한 유닛과 함께 노출되며, 소유자 다음 턴 시작에 다시 은폐', () => {
  let st = trenchBoard([['r1', 0, 'infantry', 3, 1], ['r3', 0, 'recon', 6, 4], ['u1', 1, 'infantry', 3, 3], ['u2', 1, 'infantry', 3, 4]]);
  jsonEq(targetsOf(st, 'r1'), ['3,4'], '보이는 u2 만 대상 (숨은 u1 은 목록에 없음)');
  const ev = E.resolveAttack(st, 'r1', { r: 3, c: 4 }, () => 0);
  const roll = ev.find((e) => e.type === 'diceRoll');
  assert.equal(roll.blocked, true);
  jsonEq(roll.target, { r: 3, c: 3 }, '대신 맞는 칸은 숨은 유닛');
  assert.equal(roll.dice.distance, 2, '거리 보정은 막은 유닛까지');
  const r1 = unitById(st, 'r1'), u1 = unitById(st, 'u1'), u2 = unitById(st, 'u2');
  assert.equal(u2.hp, C().MAX_HP, '뒤의 유닛은 안 맞음');
  assert.ok(r1.exposed && u1.exposed, '쏜 유닛과 막은 유닛 노출');
  E.endTurn(st);   // ua 턴 시작: ua 유닛의 노출이 풀림
  assert.equal(unitById(st, 'u1').exposed, undefined, '소유자 턴 시작에 노출 해제');
  assert.ok(unitById(st, 'r1').exposed, 'ru 의 노출은 ru 다음 턴 시작까지 유지');
  E.endTurn(st);
  assert.equal(unitById(st, 'r1').exposed, undefined);
  E.setRuleset('classic'); E.loadScenario(SCEN_IDS[0]);
});
test('[참호전] 박격포는 지형 방어 보너스를 무시하고, 직접 사격은 그대로 적용', () => {
  const st = trenchBoard([['r4', 0, 'mortar', 0, 4], ['r1', 0, 'infantry', 3, 0], ['u1', 1, 'infantry', 3, 3], ['u2', 1, 'infantry', 4, 6]]);   // u1 참호(+4), u2 평지
  const area = E.diceIndirectArea(st, st.units[0], { r: 3, c: 3 });
  const x = area.units.find((q) => q.id === 'u1');
  assert.equal(x.terrain, 0, '박격포: 참호 보너스 0');
  assert.equal(x.need, x.def + x.distBonus + x.blindBonus);
  const direct = E.computeHitChance(st, 'r1', { r: 3, c: 3 });
  assert.ok(direct.dice === undefined || direct.dice.terrain === 4 || direct.targetId === 'u1');
  E.setRuleset('classic'); E.loadScenario(SCEN_IDS[0]);
});
test('[참호전] 제압된 유닛은 어떤 공격이든 명중하면 즉사하고, 제압은 내 턴 → 상대 턴 → 내 턴을 지나 상대 턴 시작에 풀림', () => {
  assert.equal((E.loadScenario('skirmish'), C().SUPPRESS_KILL), true);
  let st = trenchBoard([['r1', 0, 'infantry', 3, 0], ['u1', 1, 'infantry', 4, 0]]);
  E.resolveAttack(st, 'r1', { r: 4, c: 0 }, () => 0);
  assert.ok(unitById(st, 'u1'), '제압 아닌 유닛은 맞아도 즉사하지 않음');
  st = trenchBoard([['r1', 0, 'infantry', 3, 0], ['u1', 1, 'infantry', 4, 0]]);
  unitById(st, 'u1').suppressed = 1;
  const ev = E.resolveAttack(st, 'r1', { r: 4, c: 0 }, () => 0);
  jsonEq(ev.filter((e) => e.type === 'destroyed').map((e) => [e.unitId, e.cause]), [['u1', 'suppressKill']], '직접 사격도 제압 중이면 즉사');
  assert.equal(unitById(st, 'u1'), undefined);
  st = trenchBoard([['r4', 0, 'mortar', 0, 4], ['r3', 0, 'recon', 3, 5], ['u1', 1, 'infantry', 3, 4]]);
  E.resolveAttack(st, 'r4', { r: 3, c: 4 }, () => 0);
  assert.equal(unitById(st, 'u1').suppressed, 1, '박격포 정중앙 명중 → 제압');
  E.endTurn(st);   // ua 턴 (행동 불가)
  assert.equal(unitById(st, 'u1').suppressed, 1);
  E.endTurn(st);   // 다시 ru 턴: 아직 제압
  assert.equal(unitById(st, 'u1').suppressed, 1, '내 다음 턴에도 제압 유지');
  E.endTurn(st);   // ua 턴 시작: 해제
  assert.equal(unitById(st, 'u1').suppressed, undefined, '상대 턴이 시작되면 풀림');
  E.setRuleset('classic'); E.loadScenario(SCEN_IDS[0]);
});
test('[참호전] 맵·배치가 180도 점대칭이고 양쪽 편성이 같음 (보병 3·정찰 2·박격포 1)', () => {
  assert.deepEqual([...E.validateScenario(E.SCENARIOS.find((s) => s.id === 'skirmish'))], []);
  E.loadScenario('skirmish');
  const comp = (side) => { const o = {}; for (const d of C().DEPLOYMENT[side]) o[d.type] = (o[d.type] || 0) + 1; return JSON.stringify(Object.entries(o).sort()); };
  assert.equal(comp('ru'), comp('ua'));
  assert.deepEqual(C().DEPLOYMENT.ru.reduce((o, d) => ({ ...o, [d.type]: (o[d.type] || 0) + 1 }), {}), { infantry: 3, recon: 2, mortar: 1 });
  E.loadScenario(SCEN_IDS[0]);
});
test('[소형 전장] 시나리오가 주사위 규칙 세트를 고정: simulateGames 는 그 규칙으로 돌고 끝나면 되돌림, 다른 시나리오는 영향 없음', () => {
  E.loadScenario('skirmish');
  assert.equal(C().SCENARIO_RULESET, 'dice');
  E.setRuleset('classic');
  const a = E.simulateGames(2, { seed: 7 });
  assert.equal(E.rulesetOf(), 'classic', '끝나면 원래 규칙 세트');
  const b = E.simulateGames(2, { seed: 7, ruleset: 'classic' });
  assert.notEqual(JSON.stringify(a.combat && a.combat.attacksByType), JSON.stringify(b.combat && b.combat.attacksByType), '고정 시나리오는 주사위 규칙으로 돌았음');
  E.loadScenario(SCEN_IDS[0]);
  assert.equal(C().SCENARIO_RULESET, null);
  assert.ok(E.validateScenario({ ...E.SCENARIOS.find((s) => s.id === 'skirmish'), ruleset: 'x' }).length > 0, '알 수 없는 ruleset 은 오류');
});

/* ---------------- 맵 만들기 (js/custom-map.js: 내 맵 → 시나리오) ---------------- */
const cmStore = () => { const o = {}; return () => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); } }); };
test('[맵 만들기] 소형 전장 틀로 만든 내 맵은 시나리오 검사를 통과하고, 플레이 상태가 만들어짐', () => {
  const rec = E.sanitizeCustomMap(E.customMapFromTemplate());
  rec.id = 'my_testmap1'; rec.name = 'T';
  jsonEq(E.customMapProblems(rec), []);
  const s = E.buildCustomScenario(rec);
  assert.deepEqual([...E.validateScenario(s)], []);
  assert.equal(s.custom, true); assert.equal(s.symmetric, false);
  assert.equal(s.deployments.length, rec.units.ua.length + rec.units.ru.length);
  assert.deepEqual([...E.registerCustomMap(rec)], [], '등록 성공');
  assert.ok(E.SCENARIOS.some((x) => x.id === 'my_testmap1'));
  assert.equal(run('STRINGS').ko['scen.custom.my_testmap1.name'], 'T');
  const st = fresh('my_testmap1');
  assert.equal(st.units.length, rec.units.ua.length + rec.units.ru.length);
  assert.equal(C().CONCEALMENT && C().CONCEALMENT.reconRadius, 2, '소형 전장의 은폐 규칙을 물려받음');
  E.unregisterCustomMap('my_testmap1');
  assert.ok(!E.SCENARIOS.some((x) => x.id === 'my_testmap1'));
  E.loadScenario(SCEN_IDS[0]);
});
test('[맵 만들기] 입력 정리: 구역 밖·겹침·초과 유닛과 잘못된 지형 글자는 버리고, 쓸 수 없는 입력은 null', () => {
  assert.equal(E.sanitizeCustomMap(null), null);
  assert.equal(E.sanitizeCustomMap({ map: ['.'] }), null);
  const map = Array.from({ length: 10 }, () => '.........Z');
  const units = { ua: [{ type: 'infantry', r: 8, c: 1 }, { type: 'infantry', r: 8, c: 1 }, { type: 'recon', r: 2, c: 2 }, { type: 'tank', r: 8, c: 3 }], ru: Array.from({ length: 9 }, (_, i) => ({ type: 'mortar', r: i % 3, c: i })) };
  const rec = E.sanitizeCustomMap({ map, units, name: '  <b>긴이름'.repeat(8) });
  assert.equal(rec.map[0][9], '.', '모르는 지형 글자는 평지');
  assert.equal(rec.units.ua.length, 1, '겹침·구역 밖·모르는 병종 제외');
  assert.equal(rec.units.ru.length, E.CUSTOM_MAP.MAX_UNITS, '한 진영 최대 유닛 수');
  assert.ok(rec.name.length <= 20 && !/[<>]/.test(rec.name));
  const empty = E.sanitizeCustomMap({ map, units: { ua: [], ru: [] } });
  assert.equal(E.customMapProblems(empty).length, 2, '유닛이 없는 진영은 저장 불가');
});
test('[맵 만들기] 저장소 읽기·쓰기와 파일 내보내기·가져오기', () => {
  const store = cmStore();
  const a = E.sanitizeCustomMap(E.customMapFromTemplate()); a.id = 'my_aaaa1111'; a.name = 'A';
  assert.equal(E.writeCustomMaps(store, [a, { broken: true }]), true);
  const back = E.readCustomMaps(store);
  assert.equal(back.length, 1, '깨진 항목은 버림'); assert.equal(back[0].id, 'my_aaaa1111');
  assert.equal(E.readCustomMaps(() => { throw new Error('x'); }).length, 0, '저장소를 못 읽으면 빈 목록');
  assert.equal(E.writeCustomMaps(() => { throw new Error('x'); }, [a]), false);
  const f = E.parseCustomMapFile(E.customMapToFile(a));
  assert.equal(f.id, null, '가져온 맵은 새 id 를 받음'); assert.equal(f.name, 'A'); jsonEq(f.map, a.map);
  assert.equal(E.parseCustomMapFile('not json'), null);
  assert.equal(E.parseCustomMapFile('{"app":"other"}'), null);
  assert.equal(E.parseCustomMapFile('x'.repeat(30000)), null, '너무 큰 파일은 거부');
  E.registerSavedCustomMaps(store);
  assert.ok(E.SCENARIOS.some((x) => x.id === 'my_aaaa1111'));
  E.unregisterCustomMap('my_aaaa1111');
});
