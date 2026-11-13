/**
 * 후퇴·제압 규칙(v11) 진단: node tools/retreat-diag.js [판 수=60] [json 출력 경로]
 * 대칭 전장을 같은 시드·같은 AI(보통)로, 규칙 끔(retreat: null)과 켬을 같은 판 수씩 돌려 지표를 비교한다.
 * 절반은 시나리오 기본 선공, 나머지 절반은 firstMover 를 바꿔 선공·후공을 반반으로 맞춘다.
 * AI끼리의 승률은 참고용이고 핵심은 방진식 버티기가 줄었는지(교전·이동·거점 변동·거점 주변 체류·교착)이다. 값은 사람이 정한다.
 */
const fs = require('fs');
const loadEngine = require('./load-engine');
const { E } = loadEngine({ quiet: true });

const GAMES = Number(process.argv[2]) || 60;
const SEED = 20250625;
const MID = [6, 10];   // 중반 라운드

function playOne(opts, seed) {
  E.loadScenario('symmetric', opts);
  const C = E.GAME_CONFIG;
  const rng = E.createSeededRng(seed), dice = E.createSeededRng((seed ^ 0x5DEECE66) >>> 0);
  const st = E.createInitialState();
  const first = C.ROUND_ORDER[0];
  let ev0 = E.startTurn(st);
  const m = {
    rounds: 0, captured: { center: 0, flank: 0 }, midAttacks: 0, midMoves: 0, retreats: 0, retreatKills: 0, suppressed: 0, resupKills: 0,
    losses: {}, arty: 0, artyBlocked: 0, nearSum: 0, nearN: 0, midNearSum: 0, midNearN: 0, stallRounds: 0, stallN: 0, maxStall: 0,
    winner: null, first,
  };
  const objCells = () => st.objectives.flatMap((o) => E.objectiveCells(o));
  const near = () => {
    const cells = objCells();
    return st.units.filter((u) => cells.some((p) => Math.abs(p.r - u.r) + Math.abs(p.c - u.c) <= 1)).length / Math.max(1, st.units.length);
  };
  const eat = (events) => {
    for (const e of events) {
      if (e.type === 'captured') (e.objectiveId === 'SC' ? m.captured.center++ : m.captured.flank++);
      if (e.type === 'diceRoll' && st.round >= MID[0] && st.round <= MID[1]) m.midAttacks++;
      if (e.type === 'move' && st.round >= MID[0] && st.round <= MID[1]) m.midMoves++;
      if (e.type === 'retreat') m.retreats++;
      if (e.type === 'suppressed') m.suppressed++;
      if (e.type === 'destroyed') {
        const k = `${e.side}:${e.unitType}`;
        m.losses[k] = (m.losses[k] || 0) + 1;
        const support = e.unitType === 'artillery' || e.unitType === 'mortar';
        if (support) { m.arty++; if (e.cause === 'retreatBlocked') m.artyBlocked++; }
        if (e.cause === 'retreatBlocked') m.retreatKills++;
        if (e.cause === 'resuppressed') m.resupKills++;
      }
    }
  };
  eat(ev0);
  let guard = 0, lastDiff = null, stall = 0;
  while (!st.winner && guard++ < 200) {
    const side = st.turn;
    const acts = E.aiTakeTurn(st, side, rng, 'normal', { diceRng: dice, recordSnapshots: false });
    for (const a of acts) eat(a.events);
    if (st.winner) break;
    const endEv = E.endTurn(st);
    eat(endEv);
    if (endEv.some((e) => e.type === 'roundStart') || st.winner) {   // 한 라운드가 끝남
      const n = near();
      m.nearSum += n; m.nearN++;
      const r = st.round - (st.winner ? 0 : 1);
      if (r >= MID[0] && r <= MID[1]) { m.midNearSum += n; m.midNearN++; }
      const diff = st.score ? st.score[C.ROUND_ORDER[0]] - st.score[C.ROUND_ORDER[1]] : 0;
      if (lastDiff != null) { m.stallN++; if (diff === lastDiff) { m.stallRounds++; stall++; m.maxStall = Math.max(m.maxStall, stall); } else stall = 0; }
      lastDiff = diff;
    }
  }
  m.rounds = st.round;
  m.winner = st.winner;
  return m;
}

function runSet(label, ruleOn) {
  const rows = [];
  for (let i = 0; i < GAMES; i++) {
    const swap = i >= GAMES / 2;   // 뒤 절반은 선공을 바꿈
    const opts = { ...(ruleOn ? {} : { retreat: null }), ...(swap ? { firstMover: E.SCENARIOS.find((s) => s.id === 'symmetric').firstMover === 'ru' ? 'ua' : 'ru' } : {}) };
    rows.push(playOne(opts, SEED + i * 7919));
    if ((i + 1) % 10 === 0) process.stderr.write(`${label} ${i + 1}/${GAMES}\n`);
  }
  return rows;
}

const avg = (rows, f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
const fx = (v, d = 2) => Number(v.toFixed(d));
function summarize(rows) {
  const sumLoss = (pred) => rows.reduce((a, r) => a + Object.entries(r.losses).filter(([k]) => pred(k)).reduce((b, [, v]) => b + v, 0), 0) / rows.length;
  const types = ['infantry', 'armor', 'antitank', 'recon', 'signal', 'mortar', 'artillery'];
  const bySide = {};
  for (const role of ['first', 'second']) {
    bySide[role] = {};
    for (const ty of types) bySide[role][ty] = fx(rows.reduce((a, r) => {
      const side = role === 'first' ? r.first : (r.first === 'ru' ? 'ua' : 'ru');
      return a + (r.losses[`${side}:${ty}`] || 0);
    }, 0) / rows.length);
  }
  const win = (role) => rows.filter((r) => (role === 'first' ? r.winner === r.first : r.winner && r.winner !== r.first)).length;
  const arty = rows.reduce((a, r) => a + r.arty, 0), artyB = rows.reduce((a, r) => a + r.artyBlocked, 0);
  const nearN = rows.reduce((a, r) => a + r.nearN, 0), midN = rows.reduce((a, r) => a + r.midNearN, 0), stallN = rows.reduce((a, r) => a + r.stallN, 0);
  return {
    games: rows.length,
    avgRounds: fx(avg(rows, (r) => r.rounds)),
    capturedCenter: fx(avg(rows, (r) => r.captured.center)), capturedFlank: fx(avg(rows, (r) => r.captured.flank)),
    midAttacks: fx(avg(rows, (r) => r.midAttacks)), midMoves: fx(avg(rows, (r) => r.midMoves)),
    nearShare: fx(rows.reduce((a, r) => a + r.nearSum, 0) / Math.max(1, nearN), 3),
    midNearShare: fx(rows.reduce((a, r) => a + r.midNearSum, 0) / Math.max(1, midN), 3),
    retreats: fx(avg(rows, (r) => r.retreats)), retreatKills: fx(avg(rows, (r) => r.retreatKills)),
    suppressed: fx(avg(rows, (r) => r.suppressed)), resupKills: fx(avg(rows, (r) => r.resupKills)),
    lossesTotal: fx(sumLoss(() => true)), lossesFirst: bySide.first, lossesSecond: bySide.second,
    supportLost: fx(arty / rows.length), supportLostByRetreatBlock: fx(arty ? artyB / arty : 0, 3),
    stallShare: fx(rows.reduce((a, r) => a + r.stallRounds, 0) / Math.max(1, stallN), 3), maxStallAvg: fx(avg(rows, (r) => r.maxStall)),
    firstWin: win('first'), secondWin: win('second'), draws: rows.filter((r) => !r.winner || r.winner === 'draw').length,
  };
}

const off = summarize(runSet('rule-off', false));
const on = summarize(runSet('rule-on', true));
const out = { games: GAMES, off, on };
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
