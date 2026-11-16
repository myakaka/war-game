'use strict';
/* =====================================================================
   주사위 굴림 연출 (데모 2 'dice' 규칙의 직접 사격). 보여 주기만 한다: 판정·난수·상태는 엔진이 이미 끝냈고,
   멈추는 눈은 엔진이 굴린 값(ev.rolls)이다. 굴러가는 중에 바뀌는 숫자는 장식용 난수(게임 난수와 무관, Math.sin 해시).
   그림은 전부 캔버스에 코드로 그림 (참고: reference/dice-demo.html 의 3D 10면체·낡은 질감·색·타이밍).
   시뮬레이션(헤드리스)에서는 불리지 않는다. DOM 은 diceFx.play() 안에서만 만진다 (아래 순수 함수들은 Node 테스트 대상).
   ===================================================================== */

/** 연출 상수 (한 곳). 시간은 배속 1.0 기준 ms */
const DICE_FX = {
  speedMine: 0.7,            // 내 공격(지금 화면을 보는 사람의 진영): 느리게
  speedOther: 1.6,           // 컴퓨터·상대 공격: 빠르게
  appearStartMs: 100, appearGapMs: 40,   // 주사위가 하나씩 나타나는 시각·간격
  firstStopMs: 800, stopGapMs: 200,      // 첫 주사위가 멈추는 시각, 이후 멈추는 간격
  landPopMs: 160, landPopScale: 0.2,     // 멈출 때 살짝 커졌다 돌아옴
  verdictAfterMs: 500, minVerdictAtMs: 1700,   // 마지막 정지 뒤 문구까지, 문구 시각의 최소값
  verdictPopMs: 160, verdictHoldMs: 300,       // 문구가 자리 잡는 시간, 문구 뒤 정지
  fadeOutMs: 200,            // 끝날 때 지도 어두움과 주사위가 사라지는 시간 (실제 시간)
  reduceMotionHoldMs: 400,   // 연출 줄이기: 결과 눈만 보여 주는 시간
  dimAlpha: 0.45,            // 뒤 지도 어둡게
  sizePx: 60, sizeSmallPx: 52, smallFrom: 5, minSizePx: 34, gapPx: 6, padPx: 8,   // 한 개 크기, 5개 이상일 때 크기, 한 줄에 들어가게 줄이는 하한
  canvasW: 180, canvasH: 190,    // 그리는 해상도 (CSS 로 줄임: 60x64)
  bouncePx: 14, rollTickMs: 55, // 굴러가는 중: 바운스 높이, 숫자가 바뀌는 간격
  placeStepPx: 12, placeMarginPx: 6,   // 위치 탐색 간격, 지도 가장자리 여백
};

/** 연출 배속: 내 공격은 느리게, 상대는 빠르게. speedMul = 기존 연출 속도 설정의 시간 배율(느림 1.5, 빠름 0.5) */
const diceFxSpeed = (mine, speedMul = 1) => (mine ? DICE_FX.speedMine : DICE_FX.speedOther) / (speedMul || 1);

/** 타임라인 (실제 ms). count = 주사위 수, speed = 배속 */
function diceFxTimeline(count, speed) {
  const D = DICE_FX, real = (ms) => ms / speed;
  const stopAt = (i) => D.firstStopMs + i * D.stopGapMs;
  const verdict = Math.max(D.minVerdictAtMs, stopAt(count - 1) + D.verdictAfterMs);
  return {
    speed,
    appear: Array.from({ length: count }, (_, i) => real(D.appearStartMs + i * D.appearGapMs)),
    stop: Array.from({ length: count }, (_, i) => real(stopAt(i))),
    verdictAt: real(verdict),
    holdEnd: real(verdict + D.verdictHoldMs),               // 문구 뒤 정지가 끝나는 시각
    totalMs: real(verdict + D.verdictHoldMs) + D.fadeOutMs,    // 사라지는 시간까지
  };
}

/** 멈추는 눈: 엔진이 굴린 값 그대로 + 성공 여부(엔진 규칙과 같은 diceFaceOk). 하나라도 성공하면 hit */
function diceFxFaces(rolls, need) {
  const faces = rolls.map((value) => ({ value, ok: diceFaceOk(value, need) }));
  return { faces, hit: faces.some((f) => f.ok) };
}

/** 연출을 시작해도 되는가: dice 규칙의 굴림이고, 공격자나 대상이 보이거나 내 공격일 때만 (안 보이는 적의 공격은 연출 없음). 가림 화면 중에는 안 함 */
const diceFxShouldPlay = ({ rule, mine, tVis, fVis, curtain }) => rule === 'dice' && !curtain && !!(mine || tVis || fVis);

/** 한 줄에 들어가는 주사위 크기(px): 기본 60 (5개 이상은 52), 영역 너비에 모자라면 더 줄임 */
function diceFxSize(count, hostW) {
  const D = DICE_FX, base = count >= D.smallFrom ? D.sizeSmallPx : D.sizePx;
  const fit = Math.floor((hostW - 2 * D.padPx - 2 * D.placeMarginPx - (count - 1) * D.gapPx) / count);   // 패널 안쪽 여백과 지도 가장자리 여백을 뺀 폭
  return Math.max(D.minSizePx, Math.min(base, fit));
}

/**
 * 위치: 영역 가운데에서 시작해 위·아래로 옮기며 가려선 안 되는 곳(avoid: 공격자·대상 칸 등)과 겹치지 않는 첫 자리.
 * 모두 겹치면 겹침이 가장 적고 가운데에 가까운 자리. 반환 { x, y }
 */
function diceFxPlace(box, size, avoid) {
  const D = DICE_FX, m = D.placeMarginPx;
  const x = Math.max(m, Math.min(box.w - m - size.w, (box.w - size.w) / 2));
  const lo = m, hi = Math.max(m, box.h - m - size.h), mid = Math.max(lo, Math.min(hi, (box.h - size.h) / 2));
  const overlap = (y) => (avoid || []).reduce((s, a) => {
    const w = Math.min(x + size.w, a.x + a.w) - Math.max(x, a.x), h = Math.min(y + size.h, a.y + a.h) - Math.max(y, a.y);
    return s + (w > 0 && h > 0 ? w * h : 0);
  }, 0);
  const cands = [mid];
  for (let k = 1; mid - k * D.placeStepPx >= lo || mid + k * D.placeStepPx <= hi; k++) {
    if (mid - k * D.placeStepPx >= lo) cands.push(mid - k * D.placeStepPx);
    if (mid + k * D.placeStepPx <= hi) cands.push(mid + k * D.placeStepPx);
  }
  let best = cands[0], bestO = overlap(best);
  for (const y of cands) { const o = overlap(y); if (o === 0) { best = y; bestO = 0; break; } if (o < bestO) { best = y; bestO = o; } }
  return { x, y: best };
}

/**
 * 색: 공격하는 진영의 색(시나리오 데이터, '#rrggbb')에서 굴리는 중 / 성공 / 실패 세 벌을 만듦.
 * 색이 없거나 읽을 수 없으면 kind('ally' 파랑 | 'enemy' 빨강) 기본 팔레트 (참고 파일의 값)
 */
const DICE_PAL = {
  ally: { roll: { base: [58, 104, 176], edge: '#0f1f3d' }, ok: { base: [78, 134, 228], edge: '#0f1f3d', glow: '#7fb2ff' }, no: { base: [62, 74, 100], edge: '#141a2a', numAlpha: 0.55 } },
  enemy: { roll: { base: [176, 56, 52], edge: '#3d0f0e' }, ok: { base: [228, 84, 76], edge: '#3d0f0e', glow: '#ff9a8f' }, no: { base: [104, 66, 64], edge: '#2a1413', numAlpha: 0.55 } },
};
function diceFxPalette(hex, kind) {
  const fallback = DICE_PAL[kind === 'ally' ? 'ally' : 'enemy'];
  const m = typeof hex === 'string' && /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return fallback;
  const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const mix = (a, b, k) => a.map((v, i) => v * (1 - k) + b[i] * k);
  const r = (a) => a.map((v) => Math.max(0, Math.min(255, Math.round(v))));
  const hexOf = (a) => '#' + r(a).map((v) => v.toString(16).padStart(2, '0')).join('');
  const okBase = mix(c, [255, 255, 255], 0.1), rollBase = okBase.map((v) => v * 0.76);
  const gray = (a) => { const l = 0.3 * a[0] + 0.59 * a[1] + 0.11 * a[2]; return [l, l, l]; };
  const noBase = mix(rollBase, gray(rollBase), 0.55).map((v) => v * 0.85);
  const edge = hexOf(okBase.map((v) => v * 0.17));
  return {
    roll: { base: r(rollBase), edge },
    ok: { base: r(okBase), edge, glow: hexOf(mix(okBase, [255, 255, 255], 0.4)) },
    no: { base: r(noBase), edge: hexOf(noBase.map((v) => v * 0.3)), numAlpha: 0.55 },
  };
}

/** 굴러가는 중 보이는 장식용 숫자 (Math.sin 해시: 게임 난수를 쓰지 않음) */
const diceFxDeco = (s) => { s = Math.sin(s * 127.1) * 43758.5453; return s - Math.floor(s); };

/* ---------------------------------------------------------------------
   그리기·실행 (DOM). 3D 10면체: 위아래 꼭짓점 + 위 고리 5 + 아래 고리 5, 연 모양 면 10개
   --------------------------------------------------------------------- */
const diceFx = (() => {
  const Zr = 0.1056, V = [[0, 0, 1.05], [0, 0, -1.05]];
  for (let k = 0; k < 5; k++) { const a = k * 72 * Math.PI / 180; V.push([Math.cos(a), Math.sin(a), Zr]); }
  for (let k = 0; k < 5; k++) { const a = (k * 72 + 36) * Math.PI / 180; V.push([Math.cos(a), Math.sin(a), -Zr]); }
  const F = [];
  for (let k = 0; k < 5; k++) F.push([0, 2 + k, 7 + k, 2 + (k + 1) % 5]);
  for (let k = 0; k < 5; k++) F.push([1, 7 + (k + 1) % 5, 2 + (k + 1) % 5, 7 + k]);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const fnorm = (f, P) => {
    const n = cr(sub(P[f[1]], P[f[0]]), sub(P[f[3]], P[f[0]]));
    const c = [0, 1, 2].map((i) => (P[f[0]][i] + P[f[1]][i] + P[f[2]][i] + P[f[3]][i]) / 4);
    return dot(n, c) < 0 ? nrm(n.map((x) => -x)) : nrm(n);
  };
  const mm = (A, B) => { const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[i][j] += A[i][k] * B[k][j]; return R; };
  const Rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const Ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const Rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const ap = (R, v) => [0, 1, 2].map((i) => R[i][0] * v[0] + R[i][1] * v[1] + R[i][2] * v[2]);
  function rodr(n, t) {
    const v = cr(n, t), c = dot(n, t), s = Math.hypot(...v);
    if (s < 1e-9) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const k = v.map((x) => x / s), K = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]], KK = mm(K, K), I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] = I[i][j] + K[i][j] * s + KK[i][j] * (1 - c);
    return R;
  }
  // 멈춘 모습: 면 하나가 정면을 향하고 위 꼭짓점이 위쪽
  let REST = rodr(fnorm(F[0], V), [0, 0, 1]);
  { const p = ap(REST, V[0]); REST = mm(Rz(Math.atan2(p[0], p[1])), REST); }
  // 낡은 질감: 면에 붙은 (u,v) 좌표로 고정된 얼룩 70개·긁힌 자국 4개. 한 번 만들어 재사용 (돌아도 따라 움직임)
  const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const TEX = F.map((_, i) => {
    const r = mulberry(1000 + i * 77), dots = [], scr = [];
    for (let k = 0; k < 70; k++) dots.push({ u: r(), v: r(), s: 0.004 + r() * 0.016, a: 0.10 + r() * 0.30, dark: r() < 0.62 });
    for (let k = 0; k < 4; k++) { const u = r(), v = r(); scr.push({ u1: u, v1: v, u2: Math.min(1, Math.max(0, u + (r() - 0.5) * 0.5)), v2: Math.min(1, Math.max(0, v + (r() - 0.5) * 0.5)) }); }
    return { dots, scr };
  });
  const bil = (p, u, v) => [(1 - u) * (1 - v) * p[0][0] + u * (1 - v) * p[1][0] + u * v * p[2][0] + (1 - u) * v * p[3][0], (1 - u) * (1 - v) * p[0][1] + u * (1 - v) * p[1][1] + u * v * p[2][1] + (1 - u) * v * p[3][1]];

  function drawDie(cv, R, digit, col) {
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const P = V.map((v) => ap(R, v)), sc = W * 0.42, cx = W / 2, cy = H / 2, L = nrm([-0.4, 0.6, 0.7]);
    const faces = F.map((f, i) => ({ f, i, n: fnorm(f, P) })).filter((o) => o.n[2] > 0.02).sort((a, b) => a.n[2] - b.n[2]);
    ctx.lineJoin = 'round';
    for (const o of faces) {
      const sh = 0.45 + 0.55 * Math.max(0, dot(o.n, L)), pts = o.f.map((j) => [cx + P[j][0] * sc, cy - P[j][1] * sc]), b = col.base;
      ctx.save();
      ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      ctx.fillStyle = `rgb(${b.map((x) => Math.round(x * sh)).join(',')})`; ctx.fill(); ctx.clip();
      const mx = (pts[0][0] + pts[2][0]) / 2, my = (pts[0][1] + pts[2][1]) / 2, g = ctx.createRadialGradient(mx, my, 0, mx, my, W * 0.28);   // 닳은 가운데(밝게), 가장자리 어둡게
      g.addColorStop(0, 'rgba(255,240,200,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0.22)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (const d of TEX[o.i].dots) { const p = bil(pts, d.u, d.v); ctx.fillStyle = d.dark ? `rgba(15,10,5,${d.a})` : `rgba(255,235,190,${d.a * 0.8})`; ctx.beginPath(); ctx.arc(p[0], p[1], d.s * W, 0, 6.3); ctx.fill(); }
      ctx.lineWidth = Math.max(1, W * 0.006);
      for (const s2 of TEX[o.i].scr) { const p1 = bil(pts, s2.u1, s2.v1), p2 = bil(pts, s2.u2, s2.v2); ctx.strokeStyle = 'rgba(255,240,210,0.22)'; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); }
      ctx.restore();
      ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      ctx.strokeStyle = col.edge; ctx.lineWidth = W * 0.03; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,235,190,0.28)'; ctx.lineWidth = W * 0.008; ctx.stroke();   // 모서리의 옅은 밝은 선
    }
    const top = faces[faces.length - 1];
    if (top) {
      const mx = top.f.reduce((s, j) => s + P[j][0], 0) / 4, my = top.f.reduce((s, j) => s + P[j][1], 0) / 4, x = cx + mx * sc, y = cy - my * sc + W * 0.03;
      ctx.font = `800 ${W * 0.30}px "Noto Sans KR","Malgun Gothic",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(String(digit), x + W * 0.008, y + W * 0.012);   // 음각 그림자
      ctx.globalAlpha = col.numAlpha || 1; ctx.fillStyle = '#f4efe2'; ctx.fillText(String(digit), x, y); ctx.globalAlpha = 1;
    }
  }

  let cur = null;   // 지금 재생 중인 연출 { finish(skipped) }
  /**
   * 재생. o = { host(지도 틀 요소), count, rolls[], need, title(상단 한 줄), palette, mine, speedMul, reduce,
   *            avoid(host 기준 가리지 않을 사각형들), win(true 문구 텍스트), missText, hitText, onRoll(), onLand(i) }
   * 끝나거나 건너뛰면(화면 누름·Enter·Space·Esc) resolve. 연출 중 다른 연출이 시작되면 앞의 것은 바로 끝냄
   */
  function play(o) {
    if (cur) cur.finish(true);
    const D = DICE_FX, doc = o.host.ownerDocument, win = doc.defaultView;
    const { faces, hit } = diceFxFaces(o.rolls, o.need);
    const A = faces.length, speed = diceFxSpeed(o.mine, o.speedMul), tl = diceFxTimeline(A, speed);
    const root = doc.createElement('div'); root.className = 'dice-fx'; root.setAttribute('aria-hidden', 'true');
    const dim = doc.createElement('div'); dim.className = 'dice-fx-dim'; dim.style.background = `rgba(0,0,0,${D.dimAlpha})`;
    const panel = doc.createElement('div'); panel.className = 'dice-fx-panel';
    const title = doc.createElement('div'); title.className = 'dice-fx-title'; title.textContent = o.title;
    const row = doc.createElement('div'); row.className = 'dice-fx-row';
    const verdict = doc.createElement('div'); verdict.className = 'dice-fx-verdict';
    const hostW = o.host.clientWidth || 360, size = diceFxSize(A, hostW), h = Math.round(size * 64 / 60);
    const dies = faces.map(() => {
      const d = doc.createElement('div'); d.className = 'dice-fx-die'; d.style.width = size + 'px'; d.style.height = h + 'px'; d.style.opacity = '0';
      const cv = doc.createElement('canvas'); cv.width = D.canvasW; cv.height = D.canvasH; cv.style.width = size + 'px'; cv.style.height = h + 'px';
      d.appendChild(cv); row.appendChild(d); return { d, cv, landed: false };
    });
    panel.append(title, row, verdict); root.append(dim, panel); o.host.appendChild(root);
    panel.style.maxWidth = (hostW - 2 * D.placeMarginPx) + 'px';
    const pos = diceFxPlace({ w: o.host.clientWidth, h: o.host.clientHeight }, { w: panel.offsetWidth, h: panel.offsetHeight }, o.avoid || []);
    panel.style.left = Math.round(pos.x) + 'px'; panel.style.top = Math.round(pos.y) + 'px';
    const pal = o.palette;
    let raf = 0, ended = false, t0 = 0, resolveFn = () => {};
    const done = new Promise((res) => { resolveFn = res; });
    const seed = Math.floor(Math.random() * 1000);   // 장식용 (게임 난수 아님: 연출 전용)
    const showFinal = () => {
      faces.forEach((f, i) => { dies[i].d.style.opacity = '1'; dies[i].d.style.transform = ''; drawDie(dies[i].cv, REST, f.value, f.ok ? pal.ok : pal.no); dies[i].d.style.filter = f.ok ? `drop-shadow(0 0 12px ${pal.ok.glow})` : 'drop-shadow(0 3px 4px rgba(0,0,0,.5))'; });
      verdict.textContent = hit ? o.hitText : o.missText; verdict.style.color = hit ? pal.ok.glow : '#aab'; verdict.style.opacity = '1'; verdict.style.transform = 'none';
    };
    function finish(skipped) {
      if (ended) return;
      ended = true; cancelAnimationFrame(raf); cur = null;
      win.removeEventListener('pointerdown', onSkip, true); win.removeEventListener('keydown', onKey, true);
      const remove = () => { if (root.parentNode) root.parentNode.removeChild(root); resolveFn(skipped); };
      if (skipped || o.reduce) { remove(); return; }
      root.style.transition = `opacity ${D.fadeOutMs}ms`; root.style.opacity = '0';   // 지도 어두움과 주사위가 0.2초에 걸쳐 사라짐
      win.setTimeout(remove, D.fadeOutMs);
    }
    const onSkip = () => finish(true);
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(true); } };
    win.addEventListener('pointerdown', onSkip, true); win.addEventListener('keydown', onKey, true);
    cur = { finish };
    if (o.onRoll && !o.reduce) o.onRoll();
    if (o.reduce) {   // 연출 줄이기: 굴리지 않고 결과 눈만
      showFinal();
      win.setTimeout(() => finish(false), D.reduceMotionHoldMs);
      return done;
    }
    const frame = (now) => {
      if (ended) return;
      if (!t0) t0 = now;
      const el = now - t0, t = el * speed;   // t = 배속 1.0 기준 ms
      for (let i = 0; i < A; i++) {
        const dd = dies[i], stop = D.firstStopMs + i * D.stopGapMs;
        dd.d.style.opacity = t > D.appearStartMs + i * D.appearGapMs ? '1' : '0';
        if (t < stop) {
          const k = Math.floor(t / D.rollTickMs) + i * 7 + seed, v = Math.floor(diceFxDeco(k) * 10), u = (stop - t) / (stop - D.appearStartMs), ph = t / 130 + i * 1.7;
          drawDie(dd.cv, mm(REST, mm(Rz(ph * 1.3), mm(Ry(ph * 2.1), Rx(ph * 2.7)))), v, pal.roll);
          dd.d.style.transform = `translateY(${-Math.abs(Math.sin(t / 90 + i)) * D.bouncePx * u}px)`; dd.d.style.filter = 'drop-shadow(0 4px 5px rgba(0,0,0,.55))';
        } else {
          const f = faces[i], a = Math.min(1, (t - stop) / D.landPopMs);
          dd.d.style.transform = `scale(${1 + D.landPopScale * Math.sin(Math.PI * a)})`;
          drawDie(dd.cv, REST, f.value, f.ok ? pal.ok : pal.no);
          dd.d.style.filter = f.ok ? `drop-shadow(0 0 12px ${pal.ok.glow})` : 'drop-shadow(0 3px 4px rgba(0,0,0,.5))';
          if (!dd.landed) { dd.landed = true; if (o.onLand) o.onLand(i); }
        }
      }
      const vt = tl.verdictAt * speed;
      if (t >= vt) {
        const a = Math.min(1, (t - vt) / D.verdictPopMs);
        verdict.textContent = hit ? o.hitText : o.missText; verdict.style.color = hit ? pal.ok.glow : '#aab'; verdict.style.transform = `scale(${1.5 - 0.5 * a})`; verdict.style.opacity = String(a);
      } else verdict.textContent = '';
      if (el >= tl.holdEnd) { finish(false); return; }
      raf = win.requestAnimationFrame(frame);   // 굴러가는 동안만 돎
    };
    raf = win.requestAnimationFrame(frame);
    return done;
  }
  /** 진행 중인 연출을 바로 끝냄 (판이 바뀌거나 메뉴로 나갈 때) */
  const cancel = () => { if (cur) cur.finish(true); };
  return { play, cancel, active: () => !!cur };
})();

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, { DICE_FX, diceFxSpeed, diceFxTimeline, diceFxFaces, diceFxShouldPlay, diceFxSize, diceFxPlace, diceFxPalette, diceFxDeco });
}
