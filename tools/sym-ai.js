/**
 * 대칭 AI 진단표: node tools/sym-ai.js [판 수=200] [결과 JSON 경로]
 * 대결(기존 AI·새 AI·turtle·난이도)마다 AI 선공/후공을 시드 고정으로 돌려 진영별 지표를 출력 (engine.js diagnoseSymmetricAI).
 * AI끼리의 결과는 조합 사이의 상대 비교용 (사람이 할 때의 균형과 다름)
 */
const fs = require('fs');
const loadEngine = require('./load-engine');
const { E } = loadEngine({ quiet: true });
const n = Number(process.argv[2]) || 200;
const outPath = process.argv[3] || null;
const res = E.diagnoseSymmetricAI(n, {
  clock: () => performance.now(),
  onResult: (m, order, r) => console.log(`${m.key} ${order}: wins ${JSON.stringify(r.wins)} draws ${r.draws} errors ${r.errors}`),
});
const slim = {};
for (const [k, v] of Object.entries(res)) {
  slim[k] = {};
  for (const [o, r] of Object.entries(v)) {
    slim[k][o] = { aiSide: r.aiSide, foeSide: r.foeSide, games: r.games, errors: r.errors, wins: r.wins, draws: r.draws, avgRounds: r.avgRounds, byReason: r.byReason, losses: r.fires.avgLosses, sym: r.sym };
  }
}
if (outPath) fs.writeFileSync(outPath, JSON.stringify(slim, null, 1));
console.log(JSON.stringify(slim));
