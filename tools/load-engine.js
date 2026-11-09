/**
 * 엔진을 Node 에 올리는 공용 로더 (테스트, 시드 비교, 나중에 온라인 대전 서버가 같이 씀).
 * index.html 의 script 순서를 그대로 따르고 ui.js 만 뺀다. 외부 라이브러리 없음.
 *
 *   const { E, run } = require('./load-engine')({ quiet: true });
 *   E.loadScenario('hostomel');           // module.exports 로 공개된 엔진 함수
 *   run('holdCount()');                    // 공개되지 않은 내부 함수·상수는 run 으로
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['js/ui.js']);

function engineFiles() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).filter((f) => !SKIP.has(f));
}

function loadEngine({ quiet = false } = {}) {
  const noop = () => {};
  const con = quiet ? { log: noop, info: noop, warn: noop, error: console.error, table: noop, group: noop, groupEnd: noop } : console;
  const ctx = { console: con, module: { exports: {} } };
  vm.createContext(ctx);
  const files = engineFiles();
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const run = (code) => vm.runInContext(code, ctx);
  return { E: ctx.module.exports, run, ctx, files, ROOT };
}

module.exports = loadEngine;
module.exports.ROOT = ROOT;
module.exports.engineFiles = engineFiles;
