// 좁은 화면(900px 미만) 배치 회귀 확인: 휴대폰 크기에서 주요 요소 위치를 재서 기준값과 비교 (약 1분)
//   node tools/layout-check.js          → 기준값과 비교 (SAME / DIFF)
//   node tools/layout-check.js --save   → 기준값 저장 (tools/layout-baseline.json)
// 헤드리스 Edge(tools/shot.js) 를 씀. AI 턴·연출 시점과 무관한 값(요소 위치·칸 크기)만 비교한다.
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const BASE = path.join(__dirname, 'layout-baseline.json');
const R = `window.R=()=>{const ids=['#app','#hud','#hud-r1','#hud-r2','#stage','#map-col','#board','#side','#card','#card-sum','#controls','#btn-end-turn','#logbar','#drawer','#tray','#coach','.icon-row','#btn-log','#btn-legend','#btn-settings','#overlay','#modal','#pop-legend']; return {cls: document.querySelector('#app').className, cell: getComputedStyle(document.documentElement).getPropertyValue('--cell'), r: ids.map(s=>{const e=document.querySelector(s); if(!e) return s+':none'; const r=e.getBoundingClientRect(); return s+':'+[r.x,r.y,r.width,r.height].map(Math.round).join(',')})}}; window.W=(ms)=>new Promise(r=>setTimeout(r,ms));`;
const views = [[360, 640, true], [390, 844, true], [740, 360, true], [880, 1000, false]];
const steps = [];
for (const [w, h, mobile] of views) {
  for (const scen of ['chuncheon', 'symmetric']) {
    const tag = `${w}x${h}-${scen}`;
    steps.push({ w, h, mobile, nav: 'index.html' });
    steps.push({ js: `localStorage.clear(); localStorage.setItem('scenarioId','${scen}'); localStorage.setItem('chuncheon1950.tutorial','{"seen":1}'); localStorage.setItem('lang','ko'); localStorage.setItem('chuncheon1950.theme','basic'); location.reload();`, sleep: 2200 });
    steps.push({ name: tag + ' start', js: R + 'return R()' });
    steps.push({ name: tag + ' deploy', js: `document.querySelector('#btn-start').click(); await W(900); return R()` });
    steps.push({ name: tag + ' game', js: `const d=document.querySelector('#btn-deploy-default'); if(d) d.click(); await W(300); const b=document.querySelector('#btn-end-turn'); if(window.__T.ui.screen==='deploy') b.click(); await W(300); if(window.__T.ui.screen==='deploy') b.click(); await W(4500); const u=window.__T.ui; for(let j=0;j<40 && (u.busy || u.state.turn!==GAME_CONFIG.PLAYER_SIDE);j++) await W(250); const me=u.state.units.find(x=>x.side===GAME_CONFIG.PLAYER_SIDE); document.querySelectorAll('#board .cell')[me.r*N+me.c].click(); await W(600); return R()` });
    steps.push({ name: tag + ' legend', js: `document.querySelector('#btn-legend').click(); await W(500); const r=R(); document.querySelector('#btn-legend').click(); await W(300); return r` });
  }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-'));
fs.writeFileSync(path.join(tmp, 'steps.json'), JSON.stringify(steps));
const out = execFileSync(process.execPath, [path.join(__dirname, 'shot.js'), path.join(tmp, 'steps.json'), tmp], { encoding: 'utf8', timeout: 300000 });
const got = Object.fromEntries(out.split('\n').filter((l) => l.startsWith('[') && !l.startsWith('[js]')).map((l) => { const i = l.indexOf('] '); return [l.slice(1, i), l.slice(i + 2)]; }));
if (process.argv.includes('--save')) {
  fs.writeFileSync(BASE, JSON.stringify(got, null, 1) + '\n');
  console.log(`기준값 저장: ${Object.keys(got).length}항목 → ${BASE}`);
} else {
  const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
  let diff = 0;
  for (const k of Object.keys(base)) {
    if (base[k] === got[k]) continue;
    diff++;
    console.log(`DIFF  ${k}\n  전: ${base[k]}\n  후: ${got[k] || '(없음)'}`);
  }
  console.log(diff ? `DIFF ${diff}/${Object.keys(base).length}` : `all SAME (${Object.keys(base).length} entries)`);
  process.exitCode = diff ? 1 : 0;
}
fs.rmSync(tmp, { recursive: true, force: true });
