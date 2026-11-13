// 헤드리스 Edge 화면 확인: node tools/shot.js <steps.json> [출력 폴더]  (Edge 경로는 EDGE 환경 변수로 바꿀 수 있음)
// 정적 서버(ui.js 끝에 window.__T 훅만 주입) + Edge CDP. 단계: {w,h,mobile} 뷰포트, {cpu} CPU 느리게, js 실행, png 저장
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[3] || '.');
const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  if (p === '/js/ui.js') body = Buffer.from(body.toString('utf8').replace(/\}\)\(\);\s*$/, '  window.__T = { ui, render, showResult, newGame, renderHeader, playAttack, setReduceMotion, audio, playerAttack, select, logEvents, annotate, visMapOf };\n})();\n'));
  // ?nostore: localStorage 접근이 오류를 내는 환경 (사생활 보호 모드 가정)
  if (p === '/index.html' && req.url.includes('nostore')) body = Buffer.from(body.toString('utf8').replace('<head>', "<head><script>Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });</script>"));
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  res.end(body);
});

server.listen(0, async () => {
  const port = server.address().port;
  const dport = 9300 + Math.floor(Math.random() * 500);
  const prof = path.join(OUT, 'edge-prof-' + dport);
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${dport}`, `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dport}/json`)).json();
      const pg = list.find((x) => x.type === 'page');
      if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; }
    } catch (e) { /* 대기 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const wait = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') console.log('console.error:', d.params.args.map((a) => a.value || a.description).join(' ')); if (d.method === 'Runtime.exceptionThrown') console.log('EXC:', JSON.stringify(d.params.exceptionDetails.stackTrace && d.params.exceptionDetails.stackTrace.callFrames.map(f=>f.functionName+':'+f.lineNumber)) + ' ' + ((d.params.exceptionDetails.exception||{}).description||'').slice(0,200)); });
  const send = (method, params = {}) => new Promise((r) => { const k = ++id; wait.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) return 'ERR ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300); return r.result.result.value; };
  await send('Runtime.enable');
  await send('Page.enable');
  for (const s of steps) {
    if (s.w) {
      await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: !!s.mobile });
      if (s.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }
    if (s.cpu) await send('Emulation.setCPUThrottlingRate', { rate: s.cpu });   // CPU 느리게 (예: 4)
    if (s.nav) { await send('Page.navigate', { url: `http://127.0.0.1:${port}/${s.nav}` }); await new Promise((r) => setTimeout(r, 1500)); }
    if (s.js) { const v = await ev(s.js); if (v !== undefined) console.log(`[${s.name || 'js'}]`, typeof v === 'string' ? v : JSON.stringify(v)); }
    if (s.sleep) await new Promise((r) => setTimeout(r, s.sleep));
    if (s.png) { const r = await send('Page.captureScreenshot', s.clip ? { format: 'png', clip: { ...s.clip, scale: s.scale || 1 } } : { format: 'png' }); fs.writeFileSync(path.join(OUT, s.png), Buffer.from(r.result.data, 'base64')); console.log('saved', s.png); }
  }
  ws.close(); edge.kill(); server.close();
  setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* 무시 */ } process.exit(0); }, 800);
});
