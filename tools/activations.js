/**
 * 행동 제한 진단표: node tools/activations.js [판 수=100]
 * 시나리오별 한도 조합(def/att)마다 시드 고정 simulateGames 를 돌려 표로 출력 (engine.js diagnoseActivations).
 */
const loadEngine = require('./load-engine');
const { E } = loadEngine({ quiet: false });
const n = Number(process.argv[2]) || 100;
E.diagnoseActivations(n);
