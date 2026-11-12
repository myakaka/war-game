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
  assert.ok(broke((s) => { s.deployments.find((d) => d.side === 'ua' && d.type === 'recon').pos = [12, 12]; }).includes('deployments'), '시작 배치 칸');
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
  ru.r = 10; ru.c = 13;
  run('updateMemory')(st);
  let rec = E.intelRecords(st, 'ua', KI()).find((e) => e.id === ru.id);
  assert.ok(rec && rec.seen && rec.r === 10 && rec.c === 13 && rec.conf === 1 && rec.radius === 0);
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
  assert.deepEqual([setupRec.r, setupRec.c], [3, 2]);
  const scout = s2.units.find((u) => u.side === 'ua' && u.type === 'recon');
  scout.r = 5; scout.c = 2;
  s2.units.find((u) => u.id === 'R1').r = 0;   // 실제로는 다른 곳으로 이동
  run('updateMemory')(s2);
  assert.ok(!E.intelRecords(s2, 'ua', KI()).some((e) => e.id === 'R1' && e.r === 3 && e.c === 2));
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

/* ---------------- 튜토리얼 (js/tutorial.js, scenarios/tutorial.js 의 tutorialSteps) ---------------- */
const TP = (r, c) => ({ r, c });
/** 단계별 풀이 (허용된 입력만으로 목표 도달) */
const TUT_SOLUTION = {
  select: [['select', 'A1'], ['move', 'A1', TP(5, 3)]],
  attack: [['select', 'A1'], ['preview', 'A1', TP(3, 3)], ['attack', 'A1', TP(3, 3)]],
  terrain: [['select', 'A1'], ['preview', 'A1', TP(2, 1)], ['preview', 'A1', TP(1, 2)]],
  fog: [['select', 'A1'], ['move', 'A1', TP(4, 3)], ['select', 'A2'], ['preview', 'A2', TP(4, 6)]],
  activation: [['select', 'A1'], ['move', 'A1', TP(5, 2)], ['select', 'A2'], ['endTurn']],
  objective: [['select', 'A1'], ['move', 'A1', TP(2, 4)], ['select', 'A2'], ['attack', 'A2', TP(1, 5)]],
  mortar: [['select', 'A1'], ['attack', 'A1', TP(3, 4)]],
  artillery: [['select', 'A1'], ['attack', 'A1', TP(3, 3)], ['endTurn'], ['select', 'A1']],
};
/** 화면과 같은 순서로 입력을 엔진에 적용 (허용되지 않은 입력은 아무것도 하지 않음) */
function tutPlay(step, actions, seed = step.seed) {
  const st = E.tutorialState(step), rng = E.createSeededRng(seed), log = [], events = [], refused = [];
  for (const [kind, unit, at] of actions) {
    const a = { kind, unit, at };
    if (!E.tutorialAllows(step, a, st, log)) { refused.push(kind); continue; }
    let ev = [];
    if (kind === 'move') ev = E.moveUnit(st, unit, at);
    else if (kind === 'attack') ev = E.resolveAttack(st, unit, at, rng);
    else if (kind === 'endTurn') ev = E.tutorialEndTurn(st, step, rng);
    events.push(...ev);
    E.tutorialRecord(log, a, ev, st);
  }
  return { st, log, events, refused, prog: E.tutorialProgress(step, log, st) };
}
const tutSteps = () => { E.loadScenario('tutorial'); return E.tutorialSteps(); };

test('튜토리얼 데이터: 8단계, 유닛·깜빡임 칸이 지도 안·지나갈 수 있는 칸, 유닛 칸 겹침 없음, 튜토리얼 시나리오는 시작 화면 목록에 없음', () => {
  const steps = tutSteps(), n = C().MAP.length;
  assert.equal(steps.length, 8);
  assert.equal(new Set(steps.map((s) => s.id)).size, 8);
  const inMap = (p) => p[0] >= 0 && p[0] < n && p[1] >= 0 && p[1] < n;
  for (const s of steps) {
    const seen = new Set();
    for (const u of s.setup.units) {
      assert.ok(inMap(u.pos), `${s.id} ${u.type}`);
      const ter = C().TERRAIN[C().MAP[u.pos[0]][u.pos[1]]];
      assert.ok(!(ter.impassableFor || []).includes(u.type), `${s.id} ${u.type} 지형`);
      assert.ok(!seen.has(u.pos.join(',')), `${s.id} 겹침`);
      seen.add(u.pos.join(','));
    }
    for (const p of [...(s.highlight || []), ...s.goal.flatMap((g) => g.hl || [])]) assert.ok(inMap(p), `${s.id} hl ${p}`);
    for (const g of s.goal) assert.ok(['select', 'move', 'attack', 'preview', 'selectBlocked', 'selectCooldown', 'endTurn', 'contested', 'own'].includes(g.do), g.do);
    for (const k of [s.titleKey, s.textKey, s.doneKey]) for (const lang of ['ko', 'en']) assert.ok(k in run('STRINGS')[lang], `${lang} ${k}`);
  }
  assert.ok(!E.listScenarios().some((s) => s.id === 'tutorial' || s.id === 'tutorialPractice'));
  assert.deepEqual([...E.validateScenario(E.SCENARIOS.find((s) => s.id === 'tutorialPractice'))], []);
});

test('튜토리얼: 허용된 입력만으로 8단계를 모두 끝까지 진행 (엔진을 실제로 돌림), 게임이 끝나지 않음', () => {
  for (const step of tutSteps()) {
    const r = tutPlay(step, TUT_SOLUTION[step.id]);
    assert.deepEqual(r.refused, [], `${step.id} 거부된 입력`);
    assert.ok(r.prog.complete, `${step.id} 완료 ${JSON.stringify(r.prog.done)}`);
    assert.equal(r.st.winner, null, step.id);
  }
});

test('튜토리얼: 정해 둔 시드 결과 (2단계 빗나감, 6단계 명중으로 점유, 8단계 아군도 포병 파편에 맞음·다음 턴 쿨다운)', () => {
  const by = Object.fromEntries(tutSteps().map((s) => [s.id, s]));
  const rolls = (r) => r.events.filter((e) => e.type === 'diceRoll');
  assert.equal(rolls(tutPlay(by.attack, TUT_SOLUTION.attack))[0].hit, false);
  const six = tutPlay(by.objective, TUT_SOLUTION.objective);
  assert.ok(six.log.some((e) => e.kind === 'contested'));
  assert.equal(six.st.objectives[0].owner, 'ally');
  const eight = tutPlay(by.artillery, TUT_SOLUTION.artillery);
  assert.ok(rolls(eight)[0].hit);
  assert.ok(eight.events.some((e) => e.type === 'splashDamage' && e.unitId === 'A2'), '아군 파편 피해');
  assert.ok(eight.log.at(-1).cooling, '다음 턴 포병은 쿨다운');
  assert.ok(run('onCooldown')(eight.st, eight.st.units.find((u) => u.id === 'A1')));
});

test('튜토리얼: 허용되지 않은 입력은 거부되고 상태가 그대로 (순서가 있는 단계는 앞 목표 먼저)', () => {
  const by = Object.fromEntries(tutSteps().map((s) => [s.id, s]));
  const bad = [
    [by.select, ['select', 'A2']], [by.select, ['move', 'A2', TP(5, 6)]], [by.select, ['endTurn']], [by.select, ['cell']],
    [by.attack, ['move', 'A1', TP(5, 3)]], [by.terrain, ['attack', 'A1', TP(3, 2)]],
    [by.fog, ['move', 'A1', TP(5, 3)]], [by.fog, ['preview', 'A2', TP(4, 6)]],     // 순서: 보병 이동 전에는 박격포 확인 불가
    [by.activation, ['move', 'A2', TP(5, 5)]], [by.objective, ['attack', 'A2', TP(1, 5)]],   // 순서: 거점 진입 전 공격 불가
    [by.artillery, ['endTurn']],                                                     // 순서: 사격 전 턴 종료 불가
  ];
  for (const [step, [kind, unit, at]] of bad) {
    const st = E.tutorialState(step), before = JSON.stringify(st);
    assert.equal(E.tutorialAllows(step, { kind, unit, at }, st, []), false, `${step.id} ${kind} ${unit || ''}`);
    const r = tutPlay(step, [[kind, unit, at]]);
    assert.deepEqual(r.refused, [kind]);
    assert.equal(JSON.stringify(r.st), before, `${step.id} 상태 변화 없음`);
  }
  // 단계가 끝난 뒤에는 상태를 바꾸는 입력을 더 받지 않음 (순서가 있는 단계)
  const done = tutPlay(by.artillery, TUT_SOLUTION.artillery);
  assert.equal(E.tutorialAllows(by.artillery, { kind: 'endTurn' }, done.st, done.log), false);
});

test('튜토리얼: 다시 해 보기 = 같은 시드로 같은 결과', () => {
  for (const step of tutSteps()) {
    const a = tutPlay(step, TUT_SOLUTION[step.id]), b = tutPlay(step, TUT_SOLUTION[step.id]);
    assert.equal(JSON.stringify(b.st), JSON.stringify(a.st), step.id);
    assert.equal(JSON.stringify(b.events), JSON.stringify(a.events), step.id);
  }
});

test('튜토리얼 문구의 수치는 데이터에서 읽음 (사거리·쿨다운·행동 수를 바꾸면 문구가 바뀜)', () => {
  const t = run('t');
  const s = tutSteps();
  const text = (id) => { const st = s.find((x) => x.id === id); return t(st.textKey, E.tutorialParams()) + ' ' + t(st.doneKey, E.tutorialParams()); };
  assert.ok(text('mortar').includes('2~4'));
  assert.ok(text('artillery').includes('2~5'));
  assert.ok(text('select').includes('3'));
  E.loadScenario('tutorial', { fires: { mortar: { range: 3 }, artillery: { range: 6, cooldown: 2 } }, activations: { def: 4, att: 4 } });
  assert.ok(text('mortar').includes('2~3'), text('mortar'));
  assert.ok(text('artillery').includes('2~6') && text('artillery').includes('2번'), text('artillery'));
  assert.ok(text('activation').includes('4기'), text('activation'));
  // 대칭 전장 점수 설명도 그 시나리오 데이터 (공개 값)
  assert.ok(text('objective').includes('중앙 2'));
  E.loadScenario('tutorial');
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
  jsonEq(s, { scenarioId: 'symmetric', round: 4, maxRounds: 14, mode: 'hotseat', turn: 'ua' }, '유닛 위치·로그는 요약에 없음');
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
