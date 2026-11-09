/**
 * 시드 고정 회귀 비교 (CLAUDE.md: 변경 전후 simulateGames(100) 결과와 턴별 상태가 같아야 함).
 *
 *   node tools/check.js           기준선(tools/baseline.json)과 비교. 다르면 exit 1
 *   node tools/check.js --save    현재 결과를 기준선으로 저장 (의도한 변경을 확인한 뒤에만)
 *   node tools/check.js --games 20   판 수 바꾸기 (기본 100, 기준선과 같은 값이어야 비교 가능)
 *   node tools/check.js --legacy     행동 제한을 끄고(ENABLE_ACTIVATION_LIMIT=false) v5 기준선(tools/baseline-v5.json)과 비교
 *
 * 조합: 공격 측 프로필 전부 × 방어 보통, 방어 측 쉬움·어려움 × 공격 보통 (시나리오마다).
 * 턴 추적: 보통 대 보통 20판, 매 행동 후와 턴 종료 후 상태의 SHA-1.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const loadEngine = require('./load-engine');

const args = process.argv.slice(2);
const SAVE = args.includes('--save');
const gi = args.indexOf('--games');
const GAMES = gi >= 0 ? Number(args[gi + 1]) : 100;
const TRACE_GAMES = 20;
const SEED = 20250625;   // simulateGames 기본 시드와 같은 값
const LEGACY = args.includes('--legacy');
const BASELINE = path.join(__dirname, LEGACY ? 'baseline-v5.json' : 'baseline.json');

const { E, run } = loadEngine({ quiet: true });
if (LEGACY) E.GAME_CONFIG.ENABLE_ACTIVATION_LIMIT = false;

function combos() {
  const att = Object.keys(E.GAME_CONFIG.AI.TACTIC_PROFILES);
  const def = ['easy', 'hard'];
  return [...att.map((a) => ({ att: a, def: 'normal' })), ...def.map((d) => ({ att: 'normal', def: d }))];
}

function trace() {
  const h = crypto.createHash('sha1');
  for (let i = 0; i < TRACE_GAMES; i++) {
    const s = SEED + i * 7919;
    const rng = E.createSeededRng(s), dice = E.createSeededRng((s ^ 0x5DEECE66) >>> 0);
    const st = E.createInitialState();
    E.startTurn(st);
    let guard = 0;
    while (!st.winner && guard++ < 500) {
      E.aiTakeTurn(st, st.turn, rng, 'normal', { recordSnapshots: false, diceRng: dice });
      h.update(JSON.stringify(st));
      if (!st.winner) { E.endTurn(st); h.update(JSON.stringify(st)); }
    }
  }
  return h.digest('hex');
}

function collect() {
  const out = { games: GAMES, rulesVersion: E.GAME_CONFIG.RULES_VERSION, results: {} };
  for (const s of E.SCENARIOS) {
    E.loadScenario(s.id);
    for (const c of combos()) {
      // role 키(att/def)로 넘김: simulateGames 가 진영 id 또는 역할로 프로필을 고름
      out.results[`${s.id} ${c.att}/${c.def}`] = JSON.parse(JSON.stringify(E.simulateGames(GAMES, { ...c })));
    }
    out.results[`${s.id} trace`] = trace();
  }
  E.loadScenario(run('DEFAULT_SCENARIO_ID'));
  return out;
}

const brief = (r) => (typeof r === 'string' ? r.slice(0, 12)
  : `wins ${JSON.stringify(r.wins)} errors ${r.errors} avgRounds ${r.avgRounds}`);

const t0 = Date.now();
const now = collect();
const sec = ((Date.now() - t0) / 1000).toFixed(1);

if (SAVE) {
  fs.writeFileSync(BASELINE, JSON.stringify(now, null, 1) + '\n');
  console.log(`saved ${path.relative(process.cwd(), BASELINE)} (${Object.keys(now.results).length} entries, ${sec}s)`);
  process.exit(0);
}
if (!fs.existsSync(BASELINE)) { console.error('no baseline: run `node tools/check.js --save` first'); process.exit(2); }
const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
if (base.games !== GAMES) { console.error(`baseline games=${base.games}, now ${GAMES}`); process.exit(2); }

let diff = 0;
const keys = new Set([...Object.keys(base.results), ...Object.keys(now.results)]);
for (const k of keys) {
  const a = base.results[k], b = now.results[k];
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (!same) diff++;
  console.log(`${same ? 'SAME' : 'DIFF'}  ${k}${same ? '' : `\n      before: ${a === undefined ? '(none)' : brief(a)}\n      after:  ${b === undefined ? '(none)' : brief(b)}`}`);
}
if (base.rulesVersion !== now.rulesVersion) console.log(`note: rulesVersion ${base.rulesVersion} -> ${now.rulesVersion}`);
console.log(`${diff ? `${diff} DIFF` : 'all SAME'} (${keys.size} entries, ${sec}s)`);
process.exit(diff ? 1 : 0);
