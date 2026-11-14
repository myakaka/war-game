/**
 * 후퇴·제압 진단: node tools/retreat-diag.js <시나리오 id> <난이도 easy|normal|hard> [판 수=60] [json 출력 경로]
 * 같은 시드로 양쪽 AI를 같은 난이도로 돌려 지표를 모은다 (simulateGames 와 같은 시드·난수 스트림 분리).
 * 규칙이 바뀐 전후 비교는 두 상태에서 각각 돌려 출력 파일을 나란히 본다 (이전 기준: tools/retreat-before-*.json).
 * 시나리오의 진영 역할(def/att)은 고정이라 선공·후공을 바꾸지 않는다. 대칭 전장은 판의 절반을 선공 교체로 돌린다.
 * AI끼리의 승률은 참고용이고 핵심은 방진식 버티기가 줄었는지(교전·이동·거점 변동·거점 주변 체류·교착)이다. 값은 사람이 정한다.
 */
const fs = require('fs');
const loadEngine = require('./load-engine');
const { E } = loadEngine({ quiet: true });

const SCEN = process.argv[2] || 'symmetric';
const LEVEL = process.argv[3] || 'normal';
const GAMES = Number(process.argv[4]) || 60;
const SEED = 20250625;
const MID = [6, 10];   // 중반 라운드

function playOne(opts, seed) {
  E.loadScenario(SCEN, opts);
  const C = E.GAME_CONFIG;
  const rng = E.createSeededRng(seed), dice = E.createSeededRng((seed ^ 0x5DEECE66) >>> 0);
  const st = E.createInitialState();
  const sideDef = C.ROUND_ORDER.find((s) => C.SIDES[s].role === 'def');
  const m = {
    rounds: 0, captured: { center: 0, flank: 0 }, midAttacks: 0, midMoves: 0, retreats: 0, retreatKills: 0, suppressed: 0, resupKills: 0,
    losses: {}, arty: 0, artyBlocked: 0, nearSum: 0, nearN: 0, midNearSum: 0, midNearN: 0, stallRounds: 0, stallN: 0, maxStall: 0,
    holdSum: 0, holdN: 0, hqRetreats: 0, winner: null, reason: null, def: sideDef,
    dmgTotal: 0, dmgIndirect: 0, firstAttHold: null, defSupportLost: 0, defSupportBlocked: 0,
  };
  const sideAtt = C.ROUND_ORDER.find((x) => C.SIDES[x].role === 'att');
  const objCells = () => st.objectives.flatMap((o) => E.objectiveCells(o));
  const near = () => {
    const cells = objCells();
    if (!cells.length) return 0;
    return st.units.filter((u) => cells.some((p) => Math.abs(p.r - u.r) + Math.abs(p.c - u.c) <= 1)).length / Math.max(1, st.units.length);
  };
  const center = (id) => (E.GAME_CONFIG.OBJECTIVES.length ? id === E.GAME_CONFIG.OBJECTIVES.map((o) => o.id).sort((a, b) => objSize(b) - objSize(a))[0] : false);
  const objSize = (id) => E.objectiveCells(E.GAME_CONFIG.OBJECTIVES.find((o) => o.id === id)).length;
  const eat = (events, byType = null, bySide = null) => {
    for (const e of events) {
      if ((e.type === 'damage' || e.type === 'splashDamage') && byType && e.side !== bySide) {   // 적에게 입힌 피해 (오사 제외): 간접 화력 몫
        m.dmgTotal += e.amount;
        if (C.UNIT_TYPES[byType].indirect) m.dmgIndirect += e.amount;
      }
      if (e.type === 'captured' && e.side === sideAtt && m.firstAttHold == null) m.firstAttHold = st.round;   // 공격 측이 처음 거점을 점유한 라운드
      if (e.type === 'destroyed' && e.side === sideDef && (e.unitType === 'artillery' || e.unitType === 'mortar')) { m.defSupportLost++; if (e.cause === 'retreatBlocked') m.defSupportBlocked++; }
      if (e.type === 'captured') (center(e.objectiveId) ? m.captured.center++ : m.captured.flank++);
      if (e.type === 'diceRoll' && st.round >= MID[0] && st.round <= MID[1]) m.midAttacks++;
      if (e.type === 'move' && st.round >= MID[0] && st.round <= MID[1]) m.midMoves++;
      if (e.type === 'retreat') {
        m.retreats++;
        const hq = C.HQ[C.ROUND_ORDER.find((s) => s !== e.side)];
        if (hq && hq.r === e.to.r && hq.c === e.to.c) m.hqRetreats++;   // 후퇴로 적 본부 칸에 닿음 (enterHQ 승리 조건 충돌 후보)
      }
      if (e.type === 'suppressed') m.suppressed++;
      if (e.type === 'destroyed') {
        const k = `${e.side}:${e.unitType}`;
        m.losses[k] = (m.losses[k] || 0) + 1;
        if (e.unitType === 'artillery' || e.unitType === 'mortar') { m.arty++; if (e.cause === 'retreatBlocked') m.artyBlocked++; }
        if (e.cause === 'retreatBlocked') m.retreatKills++;
        if (e.cause === 'resuppressed') m.resupKills++;
      }
    }
  };
  eat(E.startTurn(st));
  let guard = 0, lastDiff = null, stall = 0;
  const roundEnd = () => {
    const n = near();
    m.nearSum += n; m.nearN++;
    if (st.round >= MID[0] && st.round <= MID[1]) { m.midNearSum += n; m.midNearN++; }
    if (st.objectives.length) { m.holdSum += st.objectives.filter((o) => o.owner === sideDef).length / st.objectives.length; m.holdN++; }
    const diff = st.score ? st.score[C.ROUND_ORDER[0]] - st.score[C.ROUND_ORDER[1]] : st.objectives.filter((o) => o.owner === C.ROUND_ORDER[0]).length - st.objectives.filter((o) => o.owner === C.ROUND_ORDER[1]).length;
    if (lastDiff != null) { m.stallN++; if (diff === lastDiff) { m.stallRounds++; stall++; m.maxStall = Math.max(m.maxStall, stall); } else stall = 0; }
    lastDiff = diff;
  };
  while (!st.winner && guard++ < 300) {
    const side = st.turn;
    const acts = E.aiTakeTurn(st, side, rng, LEVEL, { diceRng: dice, recordSnapshots: false });
    for (const a of acts) eat(a.events, a.unitType, a.side);
    if (st.winner) break;
    const endEv = E.endTurn(st);
    eat(endEv);
    if (endEv.some((e) => e.type === 'roundStart')) roundEnd();
  }
  m.rounds = st.round;
  m.winner = st.winner;
  m.reason = st.winReason || null;
  return m;
}

const rows = [];
const sym = SCEN === 'symmetric';
for (let i = 0; i < GAMES; i++) {
  const opts = sym && i >= GAMES / 2 ? { firstMover: E.SCENARIOS.find((s) => s.id === SCEN).firstMover === 'ru' ? 'ua' : 'ru' } : null;
  rows.push(playOne(opts, SEED + i * 7919));
  if ((i + 1) % 10 === 0) process.stderr.write(`${SCEN}/${LEVEL} ${i + 1}/${GAMES}\n`);
}

const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
const fx = (v, d = 2) => Number(v.toFixed(d));
const sides = E.GAME_CONFIG.ROUND_ORDER;
const roleOf = (s) => E.GAME_CONFIG.SIDES[s].role;
const types = ['infantry', 'armor', 'antitank', 'recon', 'signal', 'mortar', 'artillery'];
const lossByRole = {};
for (const s of sides) {
  lossByRole[`${s}(${roleOf(s)})`] = Object.fromEntries(types.map((ty) => [ty, fx(rows.reduce((a, r) => a + (r.losses[`${s}:${ty}`] || 0), 0) / rows.length)]));
}
const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
const arty = sum((r) => r.arty), artyB = sum((r) => r.artyBlocked);
const reasons = {};
for (const r of rows) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
const wins = {};
for (const s of sides) wins[`${s}(${roleOf(s)})`] = rows.filter((r) => r.winner === s).length;
const out = {
  scenario: SCEN, level: LEVEL, games: rows.length, rulesVersion: E.GAME_CONFIG.RULES_VERSION,
  avgRounds: fx(avg((r) => r.rounds)),
  defHoldShare: fx(sum((r) => r.holdSum) / Math.max(1, sum((r) => r.holdN)), 3),
  capturedCenter: fx(avg((r) => r.captured.center)), capturedFlank: fx(avg((r) => r.captured.flank)),
  midAttacks: fx(avg((r) => r.midAttacks)), midMoves: fx(avg((r) => r.midMoves)),
  nearShare: fx(sum((r) => r.nearSum) / Math.max(1, sum((r) => r.nearN)), 3),
  midNearShare: fx(sum((r) => r.midNearSum) / Math.max(1, sum((r) => r.midNearN)), 3),
  retreats: fx(avg((r) => r.retreats)), retreatKills: fx(avg((r) => r.retreatKills)),
  suppressed: fx(avg((r) => r.suppressed)), resupKills: fx(avg((r) => r.resupKills)),
  lossesTotal: fx(avg((r) => Object.values(r.losses).reduce((a, b) => a + b, 0))), lossesBySide: lossByRole,
  supportLost: fx(arty / rows.length), supportLostByRetreatBlock: fx(arty ? artyB / arty : 0, 3),
  stallShare: fx(sum((r) => r.stallRounds) / Math.max(1, sum((r) => r.stallN)), 3), maxStallAvg: fx(avg((r) => r.maxStall)),
  hqRetreats: fx(avg((r) => r.hqRetreats), 3),
  attHeldGames: rows.filter((r) => r.firstAttHold != null).length, attHeldShare: fx(rows.filter((r) => r.firstAttHold != null).length / rows.length, 3),
  attFirstHoldRoundAvg: fx(rows.filter((r) => r.firstAttHold != null).reduce((a, r) => a + r.firstAttHold, 0) / Math.max(1, rows.filter((r) => r.firstAttHold != null).length)),
  indirectDamageShare: fx(sum((r) => r.dmgIndirect) / Math.max(1, sum((r) => r.dmgTotal)), 3),
  defSupportLost: fx(avg((r) => r.defSupportLost)), defSupportBlockedShare: fx(sum((r) => r.defSupportBlocked) / Math.max(1, sum((r) => r.defSupportLost)), 3),
  reasons, wins, draws: rows.filter((r) => !r.winner || r.winner === 'draw').length,
};
if (process.argv[5]) fs.writeFileSync(process.argv[5], JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
