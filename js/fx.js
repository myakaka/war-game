/**
 * 전투 효과 (화면 연출 전용). 규칙·판정·게임 난수와 무관하다.
 *  - planAttackFx: 엔진의 공격 이벤트 + 보는 사람의 시야 → 연출 목록 (순수 함수, Node 테스트 대상)
 *  - createFxCanvas: 연출 목록을 캔버스 입자로 그림 (브라우저 전용, ui.js 가 부름)
 * 좌표 단위는 칸 (칸 가운데 = c + 0.5). 시간 단위는 ms (화면에서 연출 속도 배율을 곱함).
 * 난수는 연출 전용 생성기(fxRng)만 쓴다. Math.random 과 게임 주사위 스트림은 건드리지 않는다.
 */

/* 색·크기·시간 상수 (크기 = 칸 배수). 바꿀 때는 여기만 */
const FX = {
  maxAttackMs: 1500,                 // 한 번의 공격 연출 상한 (발사~마지막 착탄 + 여운)
  cap: { pc: 400, phone: 150 },      // 동시 입자 수 상한
  fpsMin: 30, budgetMin: 0.3,        // 프레임이 이보다 느리면 입자 수를 자동으로 줄임 (하한 배수)
  rmParticles: 0.5,                  // 연출 줄이기: 입자 수 배수
  smokeAlphaMax: 0.6,                // 연기 한 덩이의 최대 불투명도 (겹쳐도 유닛이 비치게 입자 하나는 smokeAlpha)
  smokeAlpha: 0.3, dustAlpha: 0.5,
  push: 0.07,                        // 피격 유닛 밀림 (칸 배수, 약 2~3px)
  unitFlashMs: 200,
  splashGap: 100,                    // 포병 주변 4칸 확산 간격
  // 화면 흔들림 (px, ms). 크기는 발사 종류로만 정함 (거리·위치와 무관)
  shake: { mortarFire: { amp: 1.5, ms: 150 }, mortarLand: { amp: 2.5, ms: 200 }, artyFire: { amp: 4, ms: 300 }, artyLand: { amp: 6.5, ms: 400 } },
  color: {
    flash: '#ffd76a', flashEdge: '#ff8a1f', flashCore: '#ffffff', tracer: '#fff1a8', tracerHeavy: '#ffb02e', tracerEdge: '#7a4a00',
    smoke: '#8f8a80', smokeDark: '#5f5b55', dust: '#a08560', dirt: '#6f5a3e',
    spark: '#ffcf4d', sparkHot: '#fff2b0', blast: '#ff8a2a', blastCore: '#ffe27a', debris: '#4a3b2a',
    ring: '#f5e6c0', shell: '#2b2b2b', shellBody: '#4b5230', shellEdge: '#262b17', shellHi: '#cfd6a4', shellTail: '143,138,128', shellHalo: '#f2edd0', shadow: 'rgba(0,0,0,0.35)', hitWhite: '#ffffff', hitRed: '#ff3b30',
  },
  // 직접 사격 (병종별). shots: 연발 수, gap: 연발 간격, tracer: 탄도 굵기·비행 시간
  direct: {
    infantry: { shots: 3, gap: 100, flash: 0.2, smoke: 0.12, tracer: { w: 0.045, ms: 130, heavy: false, n: 3 }, hit: 'sparks', miss: 'dust', ms: 600, sfx: 'fire_rifle', hitSfx: 'hit_small' },
    antitank: { shots: 1, gap: 0, flash: 0.36, smoke: 0.2, backblast: true, tracer: { w: 0.11, ms: 170, heavy: true }, hit: 'blast', miss: 'dustBig', ms: 800, sfx: 'fire_at', hitSfx: 'hit_big' },
    armor: { shots: 1, gap: 0, flash: 0.4, smoke: 0.24, tracer: { w: 0.09, ms: 160, heavy: true }, hit: 'blastDebris', miss: 'dirt', ms: 800, sfx: 'fire_tank', hitSfx: 'hit_big' },
    light: { shots: 1, gap: 0, flash: 0.16, smoke: 0.08, tracer: { w: 0.035, ms: 140, heavy: false }, hit: 'sparksSmall', miss: 'dust', ms: 450, sfx: 'fire_rifle', hitSfx: 'hit_small' },
  },
  // 간접 사격. flight: [최소, 최대] 비행 시간, perCell: 거리 1칸당, apex: 포물선 높이(칸), fogLand: 시야 밖 발사일 때 착탄까지 고정 시간
  // 포탄 모양 (칸 배수): 길이, 폭/길이, 연기 꼬리 길이(포탄 길이 배수), 화면 최소 길이(px)
  shellShape: { artillery: { len: 0.25, wid: 0.333, tail: 2.6 }, mortar: { len: 0.15, wid: 0.55, tail: 1.3 }, minPx: 6 },
  mortar: { flash: 0.24, smoke: 0.3, ring: 0.5, flight: [400, 700], perCell: 70, apex: 1.1, blast: 0.55, fogLand: 450 },
  artillery: { flash: 0.4, smoke: 0.55, ring: 0.9, flight: [500, 800], perCell: 55, apex: 1.8, blast: 0.8, nbBlast: 0.5, fogLand: 550 },
};
const FX_DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];   // 포병 주변 4칸 확산 순서 (위 → 오른쪽 → 아래 → 왼쪽)

/** 연출 전용 난수 (mulberry32). 게임 난수와 완전히 분리 */
function fxRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 공격 연출 목록. ev = 엔진의 diceRoll 이벤트.
 * o = { me, vis: Set(칸 번호), N, dmg: [{pos, splash}](보이는 것만), dead: [{pos}](보이는 것만), splash: 포병 여부, rm: 연출 줄이기, seed }
 * 반환 { items: [{kind, at, ...}], shakes: [{at, amp, ms, kind}], units: [{pos, at, push}], sounds: [{id, at}], hitAt, end }
 * 안개: 발사(섬광·연기·고리)는 발사 칸이 보일 때만, 비행은 발사 칸이 보이고 (대상 칸이 보이거나 내 사격)일 때만,
 *       착탄은 대상 칸이 보이거나 내 사격일 때만 (내 사격이 안개 속에 떨어지면 명중 여부와 무관한 같은 폭발).
 *       흔들림은 내 발사 또는 보이는 착탄에만, 크기는 발사 종류로만. 밀림 방향은 발사 칸이 보일 때만.
 */
function planAttackFx(ev, o) {
  const items = [], shakes = [], units = [], sounds = [];   // sounds: [{ id, at }] 소리 시점 (그림과 같은 시야 분기에서만 만듦. 위치·거리 값 없음)
  const snd = (id, at) => sounds.push({ id, at: Math.round(at) });
  const R = fxRng(o.seed || 1);
  const N = o.N, see = (p) => p.r >= 0 && p.c >= 0 && p.r < N && p.c < N && o.vis.has(p.r * N + p.c);
  const mine = ev.side === o.me;
  const fVis = mine || see(ev.from), tVis = see(ev.target);
  const rm = !!o.rm;
  const A = { x: ev.from.c + 0.5, y: ev.from.r + 0.5 }, T = { x: ev.target.c + 0.5, y: ev.target.r + 0.5 };
  const dx = T.x - A.x, dy = T.y - A.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
  const add = (kind, at, p) => items.push({ kind, at: Math.round(at), ...p });
  const near = (P, r0, r1) => { const a = R() * Math.PI * 2, d = r0 + (r1 - r0) * R(); return { x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d }; };
  const push = (from, to) => {
    if (!fVis || rm) return null;   // 보이지 않는 곳에서 온 사격: 방향을 드러내지 않음
    const ex = to.x - from.x, ey = to.y - from.y, d = Math.hypot(ex, ey);
    return d < 1e-6 ? { x: 0, y: FX.push } : { x: ex / d * FX.push, y: ey / d * FX.push };
  };
  const C = (p) => ({ x: p.c + 0.5, y: p.r + 0.5 });
  let hitAt;
  if (!ev.indirect) {
    const S = FX.direct[ev.unitType] || FX.direct.light;
    const M = { x: A.x + ux * 0.32, y: A.y + uy * 0.32 };   // 포구
    const trMs = rm ? 0 : S.tracer.ms;
    const showFlight = fVis && (tVis || mine) && !rm;
    if (fVis) {
      snd(S.sfx, 0);   // 발사 소리: 발사 칸이 보일 때만
      for (let k = 0; k < S.shots; k++) add('flash', k * S.gap, { x: M.x, y: M.y, r: S.flash, ms: 90 });
      add('smoke', 0, { x: M.x, y: M.y, n: S.shots > 1 ? 3 : 4, size: S.smoke, rise: 0.25, ms: 700, spread: 0.08 });
      if (S.backblast) add('smoke', 0, { x: A.x - ux * 0.35, y: A.y - uy * 0.35, n: 6, size: 0.18, rise: 0.15, ms: 800, spread: 0.12, vx: -ux * 0.6, vy: -uy * 0.6 });
      if (ev.unitType === 'armor') add('smoke', 30, { x: M.x + ux * 0.25, y: M.y + uy * 0.25, n: 5, size: 0.2, rise: 0.35, ms: 900, spread: 0.06 });
    }
    if (showFlight) {
      for (let k = 0; k < S.shots; k++) {
        const j = S.shots > 1 ? (k - 1) * 0.06 : 0;   // 3줄이 살짝 어긋나게
        add('tracer', k * S.gap, { x1: M.x - uy * j, y1: M.y + ux * j, x2: T.x - uy * j, y2: T.y + ux * j, w: S.tracer.w, ms: S.tracer.ms, heavy: S.tracer.heavy });
      }
    }
    hitAt = (S.shots - 1) * S.gap + trMs + (rm ? 120 : 0);
    if (tVis) {
      if (ev.hit) {
        snd(S.hitSfx, hitAt);
        const H = S.hit;
        for (let k = 0; k < S.shots; k++) {
          const at = k * S.gap + trMs + (rm ? 120 : 0), P = S.shots > 1 ? near(T, 0.02, 0.14) : T;
          if (H === 'sparks' || H === 'sparksSmall') {
            add('flash', at, { x: P.x, y: P.y, r: H === 'sparks' ? 0.24 : 0.2, ms: 130, hot: true });
            add('sparks', at, { x: P.x, y: P.y, n: H === 'sparks' ? 7 : 6, speed: 1.9, ms: 360 });
          }
        }
        if (H === 'blast' || H === 'blastDebris') {
          add('blast', hitAt, { x: T.x, y: T.y, r: H === 'blast' ? 0.62 : 0.55, ms: 450 });
          add('sparks', hitAt, { x: T.x, y: T.y, n: 12, speed: 2.6, ms: 450 });
          add('smoke', hitAt + 60, { x: T.x, y: T.y, n: 5, size: 0.22, rise: 0.35, ms: 900, spread: 0.12 });
          if (H === 'blastDebris') add('debris', hitAt, { x: T.x, y: T.y, n: 8, speed: 2, ms: 500 });
        }
      } else {
        snd('miss_dirt', hitAt);
        // 빗나감: 대상 둘레의 땅에 먼지 (유닛 위가 아니라 옆)
        const big = S.miss === 'dustBig', dirt = S.miss === 'dirt';
        for (let k = 0; k < S.shots; k++) {
          const at = k * S.gap + trMs + (rm ? 120 : 0), P = near(T, 0.36, 0.48);
          add('dust', at, { x: P.x, y: P.y, n: big || dirt ? 8 : 5, size: big ? 0.2 : 0.14, ms: 700, dirt, kick: true });
          if (big) add('sparks', at, { x: P.x, y: P.y, n: 5, speed: 1.4, ms: 300 });
        }
      }
    }
    for (const d of o.dmg) units.push({ pos: d.pos, at: hitAt, push: push(A, C(d.pos)) });
  } else {
    const art = !!o.splash, K = art ? FX.artillery : FX.mortar;
    if (fVis) {
      snd(art ? 'artillery_fire' : 'mortar_fire', 0);
      add('flash', 0, { x: A.x, y: A.y - 0.1, r: K.flash, ms: 120 });
      add('smoke', 0, { x: A.x, y: A.y - 0.3, n: art ? 9 : 5, size: K.smoke * 0.45, rise: art ? 0.8 : 0.6, ms: art ? 1200 : 1000, spread: art ? 0.25 : 0.12 });
      add('ring', 0, { x: A.x, y: A.y, r0: 0.1, r1: K.ring, ms: art ? 420 : 300, dust: art });
      if (mine && !rm) shakes.push({ at: 0, kind: art ? 'artyFire' : 'mortarFire', ...FX.shake[art ? 'artyFire' : 'mortarFire'] });
    }
    // 착탄 시각: 발사가 보이면 거리로, 아니면 고정값 (시간으로 거리를 드러내지 않음)
    const flight = Math.max(K.flight[0], Math.min(K.flight[1], K.flight[0] + (dist - 1) * K.perCell));
    const land = rm ? 150 : (fVis ? 60 + flight : K.fogLand);
    if (fVis && (tVis || mine) && !rm) add('shell', 60, { x1: A.x, y1: A.y, x2: T.x, y2: T.y, ms: flight, apex: K.apex, art });
    if (fVis && (tVis || mine)) snd('shell_whistle', 60);   // 비행 소리: 비행 그림과 같은 조건 (연출 줄이기여도 소리는 남)
    hitAt = land;
    const showLand = tVis || mine;
    if (showLand) {
      snd(art ? 'artillery_impact' : 'mortar_impact', land);   // 낙하 소리: 명중·빗나감·안개 속 모두 같은 소리
      const kind = art ? 'artyLand' : 'mortarLand';
      if (!tVis) {   // 내 사격이 안개 속에 떨어짐: 명중 여부와 무관하게 같은 폭발
        add('blast', land, { x: T.x, y: T.y, r: K.blast * 0.8, ms: 420 });
        add('dust', land, { x: T.x, y: T.y, n: 6, size: 0.16, ms: 800 });
      } else if (ev.hit) {
        add('blast', land, { x: T.x, y: T.y, r: K.blast, ms: art ? 520 : 420 });
        add('debris', land, { x: T.x, y: T.y, n: art ? 12 : 7, speed: art ? 2.6 : 2, ms: 550 });
        add('dust', land, { x: T.x, y: T.y, n: art ? 10 : 6, size: art ? 0.22 : 0.16, ms: 1000 });
        add('smoke', land + 80, { x: T.x, y: T.y, n: art ? 6 : 4, size: art ? 0.28 : 0.2, rise: 0.4, ms: 1100, spread: 0.15 });
      } else {   // 빗나감: 칸 가장자리 쪽에 작은 폭발과 흙먼지
        const P = near(T, 0.25, 0.4);
        add('blast', land, { x: P.x, y: P.y, r: K.blast * 0.6, ms: 360 });
        add('dust', land, { x: P.x, y: P.y, n: 7, size: 0.16, ms: 900 });
      }
      if (!rm) shakes.push({ at: land, kind, ...FX.shake[kind] });
    }
    // 포병 명중: 주변 4칸에 0.1초 간격으로 퍼짐 (보이는 칸만. 대상 칸이 안 보이면 보이는 피해가 있는 칸만)
    const dmgAt = (p) => o.dmg.some((d) => d.pos.r === p.r && d.pos.c === p.c);
    const slot = new Map();
    if (art && ev.hit) {
      FX_DIRS.forEach(([a, b], k) => {
        const q = { r: ev.target.r + a, c: ev.target.c + b };
        const at = land + FX.splashGap * (k + 1);
        slot.set(q.r * N + q.c, at);
        if (!see(q) || !(tVis || dmgAt(q))) return;
        const P = C(q);
        add('blast', at, { x: P.x, y: P.y, r: K.nbBlast, ms: 360 });
        snd('mortar_impact', at);   // 주변 칸 폭발 (그림이 나오는 칸만)
        add('dust', at, { x: P.x, y: P.y, n: 4, size: 0.14, ms: 800 });
      });
    }
    for (const d of o.dmg) {
      const at = d.splash ? (slot.get(d.pos.r * N + d.pos.c) || land) : land;
      units.push({ pos: d.pos, at, push: push(d.splash ? T : A, C(d.pos)) });
    }
  }
  // 격파: 불꽃과 연기 (유닛 그림은 ui 가 0.5초에 걸쳐 흐리게)
  for (const d of o.dead) {
    const u = units.find((x) => x.pos.r === d.pos.r && x.pos.c === d.pos.c);
    const at = (u ? u.at : hitAt) + FX.unitFlashMs;
    const P = C(d.pos);
    add('sparks', at, { x: P.x, y: P.y, n: 6, speed: 1.2, ms: 500, up: true });
    snd('unit_destroyed', at);
    add('smoke', at, { x: P.x, y: P.y, n: 6, size: 0.2, rise: 0.55, ms: 1100, spread: 0.12, dark: true });
  }
  // 상한: 착탄과 피격 반짝임이 maxAttackMs 안에 들어오게 시각을 줄임
  let last = hitAt;
  for (const u of units) last = Math.max(last, u.at + FX.unitFlashMs);
  for (const it of items) if (it.kind !== 'smoke' && it.kind !== 'dust') last = Math.max(last, it.at + (it.ms || 0));
  if (last > FX.maxAttackMs) {
    const k = FX.maxAttackMs / last;
    for (const it of items) { it.at = Math.round(it.at * k); if (it.kind === 'tracer' || it.kind === 'shell') it.ms = Math.round(it.ms * k); }
    for (const s of shakes) s.at = Math.round(s.at * k);
    for (const s of sounds) s.at = Math.round(s.at * k);
    for (const u of units) u.at = Math.round(u.at * k);
    hitAt = Math.round(hitAt * k);
  }
  if (rm) for (const it of items) if (it.n) it.n = Math.max(1, Math.round(it.n * FX.rmParticles));
  let end = hitAt;
  for (const it of items) end = Math.max(end, it.at + (it.ms || 0));
  return { items, shakes, units, sounds, hitAt, end };
}

/**
 * 캔버스 렌더러 (브라우저 전용). host = 지도 위 연출 층(지도 좌표를 그대로 따르는 요소).
 * env() → { cellPx: 화면 픽셀/칸 (확대 반영), n: 칸 수, rich, cap, mul: 속도 배율 }
 */
function createFxCanvas(host, env) {
  const cv = document.createElement('canvas');
  cv.className = 'fx-canvas';
  cv.setAttribute('aria-hidden', 'true');
  host.appendChild(cv);
  const g = cv.getContext('2d');
  const R = fxRng((Date.now() ^ 0x5bd1e995) >>> 0);
  const pool = [], live = [], shapes = [], queue = [];
  let raf = 0, last = 0, k = 1, budget = 1, slow = 0, rich = false;
  const E = { rich: false, cap: FX.cap.pc, mul: 1, rm: false };

  function fit() {
    const e = env();
    Object.assign(E, e);
    rich = e.rich;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.min(2048, Math.max(64, Math.round(e.n * e.cellPx * dpr)));
    if (cv.width !== px) { cv.width = px; cv.height = px; }
    k = px / e.n;
  }
  function part() { return pool.pop() || {}; }
  function spawnParticles(it) {
    const n0 = it.n || 1;
    const n = Math.max(1, Math.round(n0 * budget));
    for (let i = 0; i < n && live.length < E.cap; i++) {
      const p = part();
      const a = R() * Math.PI * 2;
      p.kind = it.kind; p.age = 0; p.life = (it.ms || 600) * (0.7 + 0.5 * R());
      p.x = it.x; p.y = it.y; p.vx = 0; p.vy = 0; p.g = 0; p.size = 0.05; p.grow = 0; p.dark = !!it.dark; p.dirt = !!it.dirt;
      p.seed = R();
      if (it.kind === 'smoke') {
        const s = it.spread || 0.1;
        p.x += (R() - 0.5) * s * 2; p.y += (R() - 0.5) * s;
        p.vx = (it.vx || 0) * (0.5 + R()) + (R() - 0.5) * 0.15; p.vy = (it.vy || 0) * (0.5 + R()) - (it.rise || 0.3) * (0.6 + 0.6 * R());
        p.size = (it.size || 0.15) * (0.6 + 0.5 * R()); p.grow = p.size * 1.4;
      } else if (it.kind === 'dust') {
        const sp = 0.5 + R() * 0.7;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.6 - 0.25; p.g = 0.6;
        p.size = (it.size || 0.12) * (0.5 + 0.6 * R()); p.grow = p.size * 0.9;
      } else if (it.kind === 'sparks') {
        const sp = (it.speed || 1.5) * (0.5 + R());
        p.vx = Math.cos(a) * sp; p.vy = it.up ? -Math.abs(Math.sin(a)) * sp : Math.sin(a) * sp; p.g = it.up ? -0.4 : 1.5;
        p.size = 0.03 + 0.025 * R();
      } else if (it.kind === 'debris') {
        const sp = (it.speed || 2) * (0.5 + R());
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.7 - 1.2; p.g = 4.5;
        p.size = 0.03 + 0.03 * R();
      }
      live.push(p);
    }
  }
  function spawn(it) {
    if (it.kind === 'smoke' || it.kind === 'dust' || it.kind === 'sparks' || it.kind === 'debris') spawnParticles(it);
    else shapes.push({ ...it, age: 0, phase: it.kind === 'shell' ? R() : 0 });
  }
  /** plan.items 를 지금부터 재생 (다른 재생과 겹쳐도 됨) */
  function play(items) {
    fit();
    const now = performance.now();
    for (const it of items) queue.push({ t: now + it.at * E.mul, it: { ...it, ms: (it.ms || 0) * E.mul } });
    queue.sort((a, b) => a.t - b.t);
    if (!raf) { last = now; raf = requestAnimationFrame(frame); }
  }
  function clear() {
    queue.length = 0; shapes.length = 0;
    while (live.length) pool.push(live.pop());
    g.clearRect(0, 0, cv.width, cv.height);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function frame(now) {
    const dt = Math.min(64, now - last);
    last = now;
    // 느리면 입자 수를 줄임 (연속 10프레임 이상 30fps 미만)
    if (dt > 1000 / FX.fpsMin + 2) { if (++slow >= 10) { budget = Math.max(FX.budgetMin, budget * 0.75); slow = 0; } } else slow = 0;
    while (queue.length && queue[0].t <= now) spawn(queue.shift().it);
    const s = dt / 1000;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) { pool.push(p); live[i] = live[live.length - 1]; live.pop(); continue; }
      p.vy += p.g * s; p.x += p.vx * s; p.y += p.vy * s;
      if (p.kind === 'smoke' || p.kind === 'dust') { p.vx *= 0.97; p.vy *= 0.97; }
    }
    for (let i = shapes.length - 1; i >= 0; i--) { shapes[i].age += dt; if (shapes[i].age >= shapes[i].ms) shapes.splice(i, 1); }
    draw();
    if (queue.length || live.length || shapes.length) raf = requestAnimationFrame(frame);
    else { raf = 0; g.clearRect(0, 0, cv.width, cv.height); }
  }
  const col = FX.color;
  function circle(x, y, r, fill, a) { g.globalAlpha = a; g.fillStyle = fill; g.beginPath(); g.arc(x * k, y * k, Math.max(0.5, r * k), 0, Math.PI * 2); g.fill(); }
  /* 포탄: 진행 방향을 향한 길쭉한 몸통 + 이어진 연기 띠 + 회전한 그림자. 둥근 점 없음. 크기는 칸 비례(화면 최소 길이 보장) */
  const ART_PATH = (L, w) => { g.beginPath(); g.moveTo(-L / 2, -w / 2); g.lineTo(L * 0.08, -w / 2); g.quadraticCurveTo(L * 0.36, -w / 2, L / 2, 0); g.quadraticCurveTo(L * 0.36, w / 2, L * 0.08, w / 2); g.lineTo(-L / 2, w / 2); g.closePath(); };
  const MORT_PATH = (L, w) => { g.beginPath(); g.moveTo(L / 2, 0); g.bezierCurveTo(L / 2, -w * 0.62, L * 0.1, -w * 0.62, -L * 0.2, -w * 0.18); g.lineTo(-L / 2, -w * 0.12); g.lineTo(-L / 2, w * 0.12); g.lineTo(-L * 0.2, w * 0.18); g.bezierCurveTo(L * 0.1, w * 0.62, L / 2, w * 0.62, L / 2, 0); g.closePath(); };
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  function drawShell(s, q) {
    const S = FX.shellShape, sh = s.art ? S.artillery : S.mortar;
    const L0 = Math.max(sh.len, S.minPx / k), w0 = L0 * sh.wid;
    const pos = (u) => { u = Math.max(0, Math.min(1, u)); return { x: s.x1 + (s.x2 - s.x1) * u, y: s.y1 + (s.y2 - s.y1) * u - s.apex * 4 * u * (1 - u) }; };
    const gnd = { x: s.x1 + (s.x2 - s.x1) * q, y: s.y1 + (s.y2 - s.y1) * q };
    const P = pos(q), h = gnd.y - P.y;
    // 방향: 궤적 접선. 박격포는 내려올 때 낙하 지점 쪽으로 머리를 돌리고 낙하 직전 ±10도 흔들림
    let ang = Math.atan2((s.y2 - s.y1) - s.apex * 4 * (1 - 2 * q), s.x2 - s.x1), L = L0, w = w0;
    if (!s.art) {
      const fall = Math.max(0, (q - 0.5) / 0.5);
      ang += angDiff(ang, Math.atan2(s.y2 - P.y, s.x2 - P.x)) * Math.min(1, fall * 1.4);
      if (q > 0.8) ang += Math.sin(q * 38 + s.phase * 6.28) * (10 * Math.PI / 180) * ((q - 0.8) / 0.2);
      const m = 0.8 + 0.6 * fall * fall; L *= m; w *= m;   // 떨어질수록 커짐 (위에서 내려오는 느낌)
    }
    // 그림자: 땅 위, 같은 모양을 눕혀서 (높을수록 작고 옅게)
    g.save(); g.translate(gnd.x * k, gnd.y * k); g.rotate(Math.atan2(s.y2 - s.y1, s.x2 - s.x1)); g.scale(k, k * 0.6);
    g.globalAlpha = 0.6 * (1 - Math.min(0.6, h / (s.apex * 3))); g.fillStyle = col.shadow; (s.art ? ART_PATH : MORT_PATH)(L0 * 0.9, w0 * 0.9); g.fill(); g.restore();
    // 연기 꼬리: 이어진 가는 띠 (뒤로 갈수록 가늘고 투명). 박격포는 올라가는 동안만, 짧고 옅게
    const tailA = s.art ? 0.5 : 0.3 * Math.max(0, 1 - q / 0.55);
    if (tailA > 0.01 && q > 0.02) {
      const arc = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) + s.apex * 1.5, dq = Math.min(q, (L0 * sh.tail) / Math.max(0.5, arc)), n = 9, pts = [];
      for (let i = 0; i <= n; i++) pts.push(pos(q - dq * i / n));
      const left = [], right = [];
      for (let i = 0; i <= n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)], tx = a.x - b.x, ty = a.y - b.y, tl = Math.hypot(tx, ty) || 1, wd = w0 * 0.32 * (1 - i / n);
        left.push([(pts[i].x - ty / tl * wd) * k, (pts[i].y + tx / tl * wd) * k]); right.push([(pts[i].x + ty / tl * wd) * k, (pts[i].y - tx / tl * wd) * k]);
      }
      const gr = g.createLinearGradient(pts[0].x * k, pts[0].y * k, pts[n].x * k, pts[n].y * k);
      gr.addColorStop(0, `rgba(${col.shellTail},${tailA})`); gr.addColorStop(1, `rgba(${col.shellTail},0)`);
      g.globalAlpha = 1; g.fillStyle = gr; g.beginPath(); left.forEach((p2, i) => (i ? g.lineTo(p2[0], p2[1]) : g.moveTo(p2[0], p2[1]))); for (let i = n; i >= 0; i--) g.lineTo(right[i][0], right[i][1]); g.closePath(); g.fill();
    }
    // 본체 (+ 포병: 진행 방향 잔상 한 겹, 앞끝 하이라이트 한 줄)
    g.save(); g.translate(P.x * k, P.y * k); g.rotate(ang); g.scale(k, k);
    if (s.art) { g.globalAlpha = 0.22; g.save(); g.translate(-L * 0.55, 0); ART_PATH(L, w * 0.9); g.fillStyle = col.shellBody; g.fill(); g.restore(); }
    g.globalAlpha = 0.35; g.strokeStyle = col.shellHalo; g.lineWidth = Math.max(2.2 / k, w * 0.5); g.lineJoin = 'round'; (s.art ? ART_PATH : MORT_PATH)(L, w); g.stroke();   // 어두운 바닥에서도 보이게 옅은 테두리 빛
    g.globalAlpha = 1; g.fillStyle = col.shellBody; g.strokeStyle = col.shellEdge; g.lineWidth = Math.max(0.6 / k, w * 0.12);
    if (s.art) {
      ART_PATH(L, w); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(L * 0.27, -w * 0.2); g.lineTo(L * 0.4, -w * 0.06); g.strokeStyle = col.shellHi; g.globalAlpha = 0.8; g.lineWidth = Math.max(1 / k, w * 0.14); g.lineCap = 'round'; g.stroke();
    } else {
      for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(-L / 2, sg * w * 0.1); g.lineTo(-L / 2 - L * 0.02, sg * w * 0.62); g.lineTo(-L * 0.18, sg * w * 0.2); g.closePath(); g.fillStyle = col.shellEdge; g.fill(); }   // 꼬리 날개 (십자의 옆모습)
      g.fillStyle = col.shellBody; MORT_PATH(L, w); g.fill(); g.stroke();
    }
    g.restore(); g.globalAlpha = 1;
  }
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    // 연기·먼지 (아래 층)
    for (const p of live) {
      const q = p.age / p.life;
      if (p.kind === 'smoke') {
        const a = Math.min(FX.smokeAlphaMax, FX.smokeAlpha) * (q < 0.15 ? q / 0.15 : 1 - (q - 0.15) / 0.85);
        const r = p.size + p.grow * q, c0 = p.dark ? col.smokeDark : col.smoke;
        if (rich) { circle(p.x, p.y, r, c0, a * 0.7); circle(p.x + r * 0.35 * (p.seed - 0.5), p.y - r * 0.25, r * 0.7, col.smoke, a * 0.5); circle(p.x - r * 0.3, p.y + r * 0.1, r * 0.55, c0, a * 0.4); }
        else circle(p.x, p.y, r, c0, a);
      } else if (p.kind === 'dust') {
        const a = FX.dustAlpha * (1 - q), r = p.size + p.grow * q, c0 = p.dirt ? col.dirt : col.dust;
        if (rich) { circle(p.x, p.y, r, c0, a * 0.7); circle(p.x + r * 0.4 * (p.seed - 0.5), p.y + r * 0.2, r * 0.6, col.dirt, a * 0.5); }
        else circle(p.x, p.y, r, c0, a);
      }
    }
    // 모양 (탄도·포탄·고리·폭발·섬광)
    for (const s of shapes) {
      const q = Math.min(1, s.age / Math.max(1, s.ms));
      if (s.kind === 'tracer') {
        const a = Math.max(0, q * 1.6 - 0.6), b = Math.min(1, q * 1.6);
        g.lineCap = 'round';
        g.beginPath(); g.moveTo((s.x1 + (s.x2 - s.x1) * a) * k, (s.y1 + (s.y2 - s.y1) * a) * k); g.lineTo((s.x1 + (s.x2 - s.x1) * b) * k, (s.y1 + (s.y2 - s.y1) * b) * k);
        g.globalAlpha = rich ? 0.35 : 0.55; g.strokeStyle = rich ? col.tracerHeavy : col.tracerEdge; g.lineWidth = Math.max(2.5, s.w * k * (rich ? 3 : 2)); g.stroke();   // 바깥 (종이 지도 위 대비)
        g.globalAlpha = 1; g.strokeStyle = s.heavy ? col.tracerHeavy : col.tracer; g.lineWidth = Math.max(1.2, s.w * k); g.stroke();
      } else if (s.kind === 'shell') {
        drawShell(s, q);
      } else if (s.kind === 'ring') {
        g.globalAlpha = (1 - q) * 0.8; g.strokeStyle = s.dust ? col.dust : col.ring;
        g.lineWidth = Math.max(1, 0.06 * k * (1 - q) + 1);
        g.beginPath(); g.arc(s.x * k, s.y * k, (s.r0 + (s.r1 - s.r0) * (1 - (1 - q) * (1 - q))) * k, 0, Math.PI * 2); g.stroke();
      } else if (s.kind === 'blast') {
        const r = s.r * (0.35 + 0.65 * (1 - (1 - q) * (1 - q)));
        if (rich) {
          const gr = g.createRadialGradient(s.x * k, s.y * k, 0, s.x * k, s.y * k, r * k);
          gr.addColorStop(0, col.blastCore); gr.addColorStop(0.45, col.blast); gr.addColorStop(1, 'rgba(255,120,30,0)');
          g.globalAlpha = 1 - q * q; g.fillStyle = gr; g.beginPath(); g.arc(s.x * k, s.y * k, r * k, 0, Math.PI * 2); g.fill();
          circle(s.x + r * 0.3 * Math.cos(q * 5), s.y - r * 0.2, r * 0.45, col.blast, (1 - q) * 0.6);
        } else {
          circle(s.x, s.y, r, col.blast, (1 - q) * 0.85);
          circle(s.x, s.y, r * 0.5 * (1 - q), col.blastCore, 1 - q);
        }
      } else if (s.kind === 'flash') {
        const r = s.r * (1 - 0.4 * q);
        circle(s.x, s.y, r * (rich ? 1.8 : 1.3), col.flashEdge, (1 - q) * (rich ? 0.35 : 0.5));
        circle(s.x, s.y, r, col.flash, 1 - q);
        circle(s.x, s.y, r * 0.45, col.flashCore, 1 - q);
      }
    }
    // 불꽃·파편 (위 층)
    for (const p of live) {
      const q = p.age / p.life;
      if (p.kind === 'sparks') {
        if (rich) {
          g.globalAlpha = 1 - q; g.strokeStyle = q < 0.4 ? col.sparkHot : col.spark; g.lineWidth = Math.max(1, p.size * k * 0.8); g.lineCap = 'round';
          g.beginPath(); g.moveTo(p.x * k, p.y * k); g.lineTo((p.x - p.vx * 0.04) * k, (p.y - p.vy * 0.04) * k); g.stroke();
        } else { circle(p.x, p.y, p.size * 1.6, col.flashEdge, (1 - q) * 0.6); circle(p.x, p.y, p.size, col.sparkHot, 1 - q); }
      } else if (p.kind === 'debris') {
        circle(p.x, p.y, p.size, col.debris, 1 - q * q);
      }
    }
    g.globalAlpha = 1;
  }
  return { play, clear, fit, canvas: cv, stats: () => ({ live: live.length, budget }) };
}

/* ---------- 포격 자국 (보기용. 엔진 상태·게임 난수와 무관, 화면 쪽 목록으로만 관리) ---------- */
const MARK_CFG = { perCell: 2, total: 40, jitter: 0.1, small: [0.55, 0.65], large: [0.8, 0.95] };

/**
 * 이 공격이 자국을 남기는가. 간접 화력이 명중했고 중심 칸이 보는 쪽 시야 안일 때만 {r,c,kind:'small'|'large'}, 아니면 null.
 * o = { vis: 시야 칸 집합(연출과 같은 것), N: 지도 한 변, small: 박격포(한 칸) 여부 }. 직접 사격·빗나감·안 보이는 칸은 남기지 않음
 */
function planImpactMark(ev, o) {
  if (!ev || !ev.indirect || !ev.hit || !o.vis.has(ev.target.r * o.N + ev.target.c)) return null;
  return { r: ev.target.r, c: ev.target.c, kind: o.small ? 'small' : 'large' };
}

/** 자국 하나의 모양: 판 연출 시드·라운드·칸·순번으로 정함 (효과 전용 난수. 같은 입력이면 같은 모양) */
function markShape(seed, round, mark, seq, files, cfg = MARK_CFG) {
  const rng = fxRng(((seed >>> 0) ^ Math.imul(round + 1, 0x9e3779b1) ^ Math.imul(mark.r * 64 + mark.c + 1, 0x85ebca6b) ^ Math.imul(seq + 1, 0xc2b2ae35)) >>> 0);
  const sz = cfg[mark.kind];
  return {
    r: mark.r, c: mark.c, kind: mark.kind, seq,
    file: files.length ? files[Math.floor(rng() * files.length) % files.length] : null,
    rot: Math.round(rng() * 360),
    dx: +((rng() * 2 - 1) * cfg.jitter).toFixed(3), dy: +((rng() * 2 - 1) * cfg.jitter).toFixed(3),
    size: +(sz[0] + rng() * (sz[1] - sz[0])).toFixed(3),
  };
}

/** 목록에 추가: 칸마다 최대 perCell 개(넘으면 그 칸의 가장 오래된 것), 판 전체 최대 total 개(넘으면 가장 오래된 것). 새 목록을 돌려줌 */
function addMark(list, shape, cfg = MARK_CFG) {
  let out = [...list, shape];
  const same = out.filter((m) => m.r === shape.r && m.c === shape.c);
  if (same.length > cfg.perCell) { const drop = new Set(same.slice(0, same.length - cfg.perCell)); out = out.filter((m) => !drop.has(m)); }
  if (out.length > cfg.total) out = out.slice(out.length - cfg.total);
  return out;
}

if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { FX, fxRng, planAttackFx, MARK_CFG, planImpactMark, markShape, addMark });
