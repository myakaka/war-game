// 대칭 점수제 진단: node tools/sym-score.js [n=100] [조합 키,...] [출력 JSON 경로]
// 조합: SCORING_COMBOS (A~F + OLD = 이전 방식 거점 수 판정). 같은 시드, 양쪽 현재 AI(보통). 숫자만 출력 (추천 값 없음)
const fs = require('fs');
const { E } = require('./load-engine')({ quiet: true });
const n = Number(process.argv[2]) || 100;
const keys = process.argv[3] ? process.argv[3].split(',') : E.SCORING_COMBOS.map((k) => k.key);
const outPath = process.argv[4] || null;
const rows = {};
for (const key of keys) {
  const k = E.SCORING_COMBOS.find((x) => x.key === key);
  const t0 = Date.now();
  const r = E.diagnoseScoring(n, { combos: [k] })[key];
  const [F, S] = [r.sym.firstMover, r.sym.secondMover];
  const by = r.sym.bySide;
  rows[key] = {
    combo: k, games: r.games, errors: r.errors,
    firstWin: r.sym.firstWinRate, secondWin: r.sym.secondWinRate, draw: r.sym.drawRate, avgRounds: r.avgRounds,
    byReason: Object.fromEntries(Object.entries(r.byReason).map(([x, v]) => [x, Object.values(v).reduce((a, b) => a + b, 0)]).filter(([, v]) => v)),
    finalScore: r.sym.finalScore, scoreGap: r.sym.avgScoreGap, curve: r.sym.scoreCurve,
    lateFlip: r.sym.lateFlipRate, lateBase: r.sym.lateBase,
    attacksByRound: r.sym.attacksByRound, flips: r.sym.flipsPerGame, heldRounds: r.sym.heldRounds,
    losses: [r.fires.avgLosses[F], r.fires.avgLosses[S]],
    shots: [[by[F].artyShotsPerGame, by[F].mortarShotsPerGame], [by[S].artyShotsPerGame, by[S].mortarShotsPerGame]],
    firstClash: r.sym.avgFirstClashRound, stall: r.sym.stallRate,
    sec: Math.round((Date.now() - t0) / 1000),
  };
  console.log(key, JSON.stringify(rows[key]));
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(rows, null, 1));
}
