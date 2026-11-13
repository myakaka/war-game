/**
 * simulateGames 결과 스냅샷: node tools/retreat-sim-snapshot.js <출력 json> [판 수=60] [시나리오 id ...]
 * 난이도 3단계(easy, normal, hard) 각각, 양쪽 AI 를 같은 난이도로, 같은 시드로 돌려 저장한다.
 * 규칙을 바꾸기 전 상태에서 한 번 저장해 두고(tools/retreat-before-sim.json), 바꾼 뒤 같은 명령으로 다시 저장해 나란히 본다.
 */
const fs = require('fs');
const loadEngine = require('./load-engine');
const { E } = loadEngine({ quiet: true });
const out = process.argv[2];
const n = Number(process.argv[3]) || 60;
const ids = process.argv.slice(4).length ? process.argv.slice(4) : ['hostomel', 'chuncheon'];
const res = { games: n, rulesVersion: E.GAME_CONFIG.RULES_VERSION, results: {} };
for (const id of ids) {
  E.loadScenario(id);
  for (const level of ['easy', 'normal', 'hard']) {
    res.results[`${id} ${level}/${level}`] = JSON.parse(JSON.stringify(E.simulateGames(n, { att: level, def: level })));
    process.stderr.write(`${id} ${level} done\n`);
  }
}
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log('saved', out);
