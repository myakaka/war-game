'use strict';
/* =====================================================================
   튜토리얼 로직 (DOM 없음, Node 테스트와 화면이 같이 씀)
   - 규칙 판정·주사위·안개는 엔진 함수(moveUnit, resolveAttack, endTurn, getVisibleTiles …)를 그대로 부른다.
     튜토리얼만의 규칙 분기는 없다. 이 파일은 단계 시작 상태, 허용 입력, 목표 진행, 결과 말풍선 고르기, 정해진 상대 행동만 다룬다.
   - 단계 데이터: js/scenarios/tutorial.js 의 tutorialSteps (큰 단계 → beats: 행동 하나당 말풍선 하나)
   ===================================================================== */
const TUTORIAL_ID = 'tutorial';
const PRACTICE_ID = 'tutorialPractice';
const TUT_LIMITS = { hint: 22, sub: 28 };   // 말풍선 글자 수 (한글·영문 모두 글자 하나를 1자로 셈, 수치를 채운 뒤의 길이)

/** 단계 목록 (튜토리얼 시나리오 데이터) */
function tutorialSteps() {
  const s = findScenario(TUTORIAL_ID);
  return (s && s.tutorialSteps) || [];
}

/**
 * 단계 시작 상태. 호출 전에 loadScenario(TUTORIAL_ID) 가 되어 있어야 한다.
 * 일반 게임과 같은 createInitialState → 유닛·라운드만 setup 으로 바꾸고 → startTurn (행동 한도·화력·시야 기억은 엔진 그대로)
 */
function tutorialState(step) {
  const C = GAME_CONFIG, S = step.setup || {};
  const st = createInitialState();
  const n = {};
  st.units = (S.units || []).map((u) => {
    n[u.side] = (n[u.side] || 0) + 1;
    const unit = { id: u.side[0].toUpperCase() + n[u.side], side: u.side, type: u.type, r: u.pos[0], c: u.pos[1], hp: u.hp ?? C.MAX_HP, moved: false, acted: false };
    if (u.firedRound != null) unit.lastFiredRound = u.firedRound;
    return unit;
  });
  st.pending = [];
  st.round = S.round || 1;
  st.turn = C.PLAYER_SIDE;
  st.memory = Object.fromEntries(C.ROUND_ORDER.map((s) => [s, {}]));
  for (const o of st.objectives) o.owner = null;
  if (C.OBJECTIVE_CONTROL === 'presence') updateObjectiveControl(st);
  startTurn(st);
  if (S.actUsed && st.act) st.act.used = Math.max(0, Math.min(st.act.limit, S.actUsed < 0 ? st.act.limit + S.actUsed : S.actUsed));
  return st;
}

/** 칸 목록 일치: 'any' · 'fog'(이 진영 시야 밖) · 'obj:<id>'(거점 칸) · [[r,c], …] */
function tutorialCellMatch(list, at, st, side) {
  if (list == null || !at) return false;
  if (list === 'any') return true;
  if (list === 'fog') return !getVisibleTiles(st, side).has(idx(at.r, at.c));
  if (typeof list === 'string' && list.startsWith('obj:')) {
    const o = st.objectives.find((x) => x.id === list.slice(4));
    return !!o && objectiveCells(o).some((p) => samePos(p, at));
  }
  return Array.isArray(list) && list.some((p) => p[0] === at.r && p[1] === at.c);
}

const tutorialBeats = (step) => (step && step.beats) || [];

/** 목표 하나가 끝났는가 (입력 기록 log 로 판단) */
function tutorialGoalDone(g, log, st) {
  const side = GAME_CONFIG.PLAYER_SIDE;
  switch (g.do) {
    case 'select': return log.some((e) => e.kind === 'select' && e.unit === g.unit);
    case 'selectBlocked': return log.some((e) => e.kind === 'select' && e.unit === g.unit && e.blocked);
    case 'selectCooldown': return log.some((e) => e.kind === 'select' && e.unit === g.unit && e.cooling);
    case 'selectSuppressed': return log.some((e) => e.kind === 'select' && e.unit === g.unit && e.suppressed);
    case 'move': return log.some((e) => e.kind === 'move' && e.unit === g.unit && (!g.at || tutorialCellMatch(g.at, e.at, st, side)));
    case 'attack': return log.some((e) => e.kind === 'attack' && e.unit === g.unit);
    case 'preview': return log.some((e) => (e.kind === 'preview' || e.kind === 'attack') && e.unit === g.unit && (!g.at ? true : g.at === 'fog' ? e.fog === true : tutorialCellMatch(g.at, e.at, st, side)));
    case 'endTurn': return log.filter((e) => e.kind === 'endTurn').length >= (g.n || 1);   // n = 몇 번째 턴 종료까지 (기본 1)
    default: return false;
  }
}

/** beat 별 완료 여부 { done:[bool], complete, current }. beat 는 순서대로: 앞 beat 가 끝나야 뒤 beat 도 끝난 것으로 셈 */
function tutorialProgress(step, log, st) {
  const done = tutorialBeats(step).map((b) => tutorialGoalDone(b.goal, log, st));
  for (let i = 1; i < done.length; i++) if (!done[i - 1]) done[i] = false;
  const k = done.indexOf(false);
  return { done, complete: done.every(Boolean), current: k < 0 ? done.length : k };
}

/** 지금 진행할 beat 번호 (모두 끝났으면 beats.length) */
function tutorialCurrent(step, log, st) { return tutorialProgress(step, log, st).current; }
/** 지금 beat (모두 끝났으면 null) */
function tutorialBeat(step, log, st) { return tutorialBeats(step)[tutorialCurrent(step, log, st)] || null; }

/**
 * 허용된 입력인가. action: { kind: 'select'|'move'|'attack'|'preview'|'endTurn'|'cell'|'wait', unit?, at?:{r,c} }
 * 지금 beat 의 allowedActions 만 본다. 단계가 끝난 뒤에는 상태를 더 바꾸지 않음 (확인 창 열기만)
 */
function tutorialAllows(step, action, st, log = []) {
  const b = tutorialBeat(step, log, st), side = GAME_CONFIG.PLAYER_SIDE;
  const k = action.kind;
  if (!b) return k === 'preview';
  const A = b.allowedActions || {};
  if (k === 'select') return (A.select || []).includes(action.unit) || !!(A.move && A.move[action.unit]) || !!(A.attack && A.attack[action.unit]);
  if (k === 'move') return !!A.move && tutorialCellMatch(A.move[action.unit], action.at, st, side);
  if (k === 'attack' || k === 'preview') return !!A.attack && tutorialCellMatch(A.attack[action.unit], action.at, st, side);
  if (k === 'endTurn') return !!A.endTurn;
  return false;
}

/**
 * 입력 기록 (화면과 테스트가 같은 방식으로 남김). events: 그 입력으로 엔진이 낸 이벤트.
 * select 는 그 순간 행동 한도 소진·쿨다운 여부를 같이 남김. 이동으로 거점이 다툼이 되면 contested 를 남김
 */
function tutorialRecord(log, action, events, st) {
  const e = { ...action };
  if (action.kind === 'select') {
    const u = getUnit(st, action.unit);
    e.blocked = !!u && !u.acted && activationBlocked(st, u);
    e.cooling = !!u && onCooldown(st, u);
    e.suppressed = !!u && u.suppressed > 0;
  }
  if ((action.kind === 'preview' || action.kind === 'attack') && action.at) e.fog = !getVisibleTiles(st, GAME_CONFIG.PLAYER_SIDE).has(idx(action.at.r, action.at.c));
  log.push(e);
  for (const ev of events || []) if (ev.type === 'objectiveLost' && ev.contested) log.push({ kind: 'contested', obj: ev.objectiveId });
  return log;
}

/**
 * 눌러야 할 곳 → 화면 표시 정보 { cells:[[r,c]](노란 고리), bright:[[r,c]](어둡게 하지 않을 칸), anchor:[r,c]|null(말풍선 꼬리), button:'endTurn'|null }
 * 위치는 지금 상태에서 읽으므로 유닛이 움직여도 따라간다
 */
function tutorialTarget(beat, st) {
  const T = (beat && beat.target) || {};
  const out = { cells: [], bright: [], anchor: null, button: null };
  if (T.button) { out.button = T.button; return out; }
  if (T.cells) {
    out.cells = T.cells.map((p) => [p[0], p[1]]);
    out.bright = out.cells.slice();
    out.anchor = out.cells[0] || null;
  } else if (T.unit) {
    const u = getUnit(st, T.unit);
    if (u) { out.cells = [[u.r, u.c]]; out.bright = [[u.r, u.c]]; out.anchor = [u.r, u.c]; }
  } else if (T.move) {
    const u = getUnit(st, T.move);
    if (u) {
      out.bright = [[u.r, u.c], ...getReachableTiles(st, T.move).map((p) => [p.r, p.c])];
      out.anchor = [u.r, u.c];
    }
  }
  return out;
}

/** 결과 말풍선 조건 판정. ctx: { events: 그 입력이 낸 이벤트, st, log } */
const TUT_CONDITIONS = {
  hit: (c) => { const d = c.events.filter((e) => e.type === 'diceRoll'); return d.length > 0 && d[0].hit === true; },
  miss: (c) => { const d = c.events.filter((e) => e.type === 'diceRoll'); return d.length > 0 && d[0].hit === false; },
  contested: (c) => c.log.some((e) => e.kind === 'contested'),
  owned: (c) => c.st.objectives.some((o) => o.owner === GAME_CONFIG.PLAYER_SIDE),
  splash: (c) => c.events.some((e) => e.type === 'splashDamage'),
  blocked: (c) => c.log.some((e) => e.kind === 'select' && e.blocked),
  cooling: (c) => c.log.some((e) => e.kind === 'select' && e.cooling),
  retreat: (c) => c.events.some((e) => e.type === 'retreat' && e.side === GAME_CONFIG.PLAYER_SIDE),   // 내 유닛이 밀려남
  retreatBlocked: (c) => c.events.some((e) => e.type === 'destroyed' && e.cause === 'retreatBlocked' && e.side === GAME_CONFIG.PLAYER_SIDE),
  suppressed: (c) => c.events.some((e) => e.type === 'suppressed' && e.side === GAME_CONFIG.PLAYER_SIDE),
  selSuppressed: (c) => c.log.some((e) => e.kind === 'select' && e.suppressed),
};

/** 방금 끝낸 beat 의 결과 말풍선 { key, sub? } 또는 null (조건이 위에서부터 처음 맞는 것) */
function tutorialResult(beat, ctx) {
  for (const r of (beat && beat.onResult) || []) {
    if (!r.if || (TUT_CONDITIONS[r.if] && TUT_CONDITIONS[r.if](ctx))) return { key: r.key, sub: r.sub || null };
  }
  return null;
}

/**
 * 턴 종료: 엔진 endTurn → (상대 턴) 단계의 정해진 행동(enemyScript)만 실행, AI 는 움직이지 않음 → endTurn.
 * enemyScript 항목의 turn(기본 1) = 이 단계에서 몇 번째 턴 종료 때 쏘는지. turnNo = 지금 누른 턴 종료가 몇 번째인지
 * 반환: 이벤트 목록 (화면은 일반 게임처럼 시야 기준으로 로그를 남김)
 */
function tutorialEndTurn(st, step, rng, turnNo = 1, onShot = null) {
  const events = endTurn(st);
  if (st.winner) return events;
  for (const a of step.enemyScript || []) {
    if ((a.turn || 1) !== turnNo) continue;
    const u = getUnit(st, a.unit);
    if (!u || u.side !== st.turn) continue;
    const at = a.attack && { r: a.attack[0], c: a.attack[1] };
    if (at && getAttackableTiles(st, a.unit).some((p) => samePos(p, at))) {   // 규칙상 안 되는 행동(쿨다운 등)은 건너뜀
      const pre = onShot ? cloneState(st) : null;   // 화면 연출용: 사격 직전·직후 상태 (판정과 난수 사용은 그대로)
      const shot = resolveAttack(st, a.unit, at, rng);
      events.push(...shot);
      if (onShot) onShot({ events: shot, pre, post: cloneState(st) });
    }
    if (st.winner) return events;
  }
  events.push(...endTurn(st));
  return events;
}

/**
 * 말풍선 문구에 넣을 수치 (모두 규칙·시나리오 데이터에서 읽음). 규칙 값을 바꾸면 문구도 따라 바뀐다.
 */
function tutorialParams() {
  const C = GAME_CONFIG, CB = C.COMBAT, F = C.FIRES || {}, UT = C.UNIT_TYPES;
  const ter = (ch) => C.TERRAIN[ch] || TERRAIN_TYPES[ch];
  const act = C.ACTIVATIONS ? C.ACTIVATIONS[roleOf(C.PLAYER_SIDE)] : null;
  const fire = (type, k, d) => (F[type] && F[type][k] != null ? F[type][k] : d);
  return {
    act: act ?? '-',
    base: CB.baseHit, per: CB.perPoint, fog: Math.abs(CB.fogPenalty), mv: Math.abs(C.MOVE_ATTACK_PENALTY),
    min: CB.minHitD10, max: CB.maxHitD10, dice: C.DICE_SIDES, steps: C.RETREAT.STEPS,
    forest: Math.abs(ter('f').hitMod), plain: Math.abs(ter('.').hitMod), city: Math.abs(ter('#').hitMod),
    mMin: UT.mortar.rangeMin, mRange: fire('mortar', 'range', UT.mortar.rangeMax), mCd: fire('mortar', 'cooldown', 0), mDmg: UT.mortar.fixedDamage,
    aMin: UT.artillery.rangeMin, aRange: fire('artillery', 'range', UT.artillery.rangeMax), aCd: fire('artillery', 'cooldown', 0), splash: CB.splashDamage,
  };
}

/**
 * 말풍선 위치 (순수 계산, 화면 크기 단위는 픽셀). 위 → 아래 → 오른쪽 → 왼쪽 순으로 대상 곁에 두고,
 * 지도 밖이거나 가려야 할 곳(avoid)과 겹치면 대상에 가까운 지도 가장자리로 옮김. 가장자리에서 margin 이상 띄움
 *   o: { box:{w,h}(말풍선을 놓을 영역), size:{w,h}(말풍선), anchor:{x,y,w,h}|null(가리킬 대상), avoid:[{x,y,w,h}], margin=8, gap=8 }
 *   반환 { x, y, w, tail:{ edge:'top'|'bottom'|'left'|'right', pos }|null }  tail.pos = 그 변 위의 꼬리 위치(말풍선 안쪽 px)
 */
function tutorialPlaceBubble(o) {
  const m = o.margin ?? 8, gap = o.gap ?? 8, W = o.box.w, H = o.box.h;
  const bw = Math.min(o.size.w, W - 2 * m), bh = o.size.h;
  const A = o.anchor || null, avoid = o.avoid || [];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const X = (v) => clamp(v, m, Math.max(m, W - m - bw)), Y = (v) => clamp(v, m, Math.max(m, H - m - bh));
  const cx = A ? A.x + A.w / 2 : W / 2, cy = A ? A.y + A.h / 2 : H / 2;
  const inside = (x, y) => x >= m - 1e-6 && y >= m - 1e-6 && x + bw <= W - m + 1e-6 && y + bh <= H - m + 1e-6;
  const overlap = (x, y) => avoid.reduce((sum, a) => {
    const w = Math.min(x + bw, a.x + a.w) - Math.max(x, a.x), h = Math.min(y + bh, a.y + a.h) - Math.max(y, a.y);
    return sum + (w > 0 && h > 0 ? w * h : 0);
  }, 0);
  const near = (p) => Math.hypot(p[0] + bw / 2 - cx, p[1] + bh / 2 - cy);
  const side = A ? [[X(cx - bw / 2), A.y - gap - bh], [X(cx - bw / 2), A.y + A.h + gap], [A.x + A.w + gap, Y(cy - bh / 2)], [A.x - gap - bw, Y(cy - bh / 2)]] : [];
  const edges = [[X(cx - bw / 2), m], [X(cx - bw / 2), H - m - bh], [m, Y(cy - bh / 2)], [W - m - bw, Y(cy - bh / 2)]];
  if (A) edges.sort((a, b) => near(a) - near(b));   // 대상이 없으면 위쪽 가장자리부터
  const all = side.concat(edges).filter((p) => inside(p[0], p[1]));
  let pick = all.find((p) => overlap(p[0], p[1]) === 0);
  if (!pick) {   // 정해 둔 자리가 모두 막혔을 때: 영역 전체를 훑어 겹침이 없는 자리 중 대상에 가장 가까운 곳 (없으면 겹침이 가장 적은 곳)
    const scan = [];
    for (let yy = m; yy <= Math.max(m, H - m - bh); yy += 4) for (let xx = m; xx <= Math.max(m, W - m - bw); xx += 4) scan.push([xx, yy]);
    pick = scan.map((p) => ({ p, o: overlap(p[0], p[1]), d: near(p) })).sort((u, v) => (u.o - v.o) || (u.d - v.d))[0];
    pick = pick ? pick.p : edges[0];
  }
  const [x, y] = pick;
  let tail = null;
  if (A) {
    const dx = cx - (x + bw / 2), dy = cy - (y + bh / 2), horiz = Math.abs(dx) * bh > Math.abs(dy) * bw;
    tail = horiz ? { edge: dx > 0 ? 'right' : 'left', pos: clamp(cy - y, 14, bh - 14) } : { edge: dy > 0 ? 'bottom' : 'top', pos: clamp(cx - x, 14, bw - 14) };
  }
  return { x, y, w: bw, tail };
}

/** 글자 수 (한글·영문 모두 글자 하나 = 1) */
const tutorialLen = (s) => Array.from(String(s)).length;

/**
 * 단계 데이터 검사 → 오류 문자열 목록 (비어 있으면 정상). 호출 전에 loadScenario(TUTORIAL_ID).
 * 문구는 ko/en 모두 있어야 하고, 수치를 채운 뒤 hint ≤ 22자, sub ≤ 28자
 */
function validateTutorialSteps(steps) {
  const errs = [], C = GAME_CONFIG, n = C.MAP.length, P = tutorialParams();
  const inMap = (p) => Array.isArray(p) && p[0] >= 0 && p[0] < n && p[1] >= 0 && p[1] < n;
  const GOALS = ['select', 'move', 'attack', 'preview', 'selectBlocked', 'selectCooldown', 'selectSuppressed', 'endTurn'];
  const prev = getLang();
  const checkText = (where, key, max) => {
    if (!key) { errs.push(`${where}: 문구 키 없음`); return; }
    for (const lang of ['ko', 'en']) {
      if (!(key in STRINGS[lang])) { errs.push(`${where}: ${lang} 에 ${key} 없음`); continue; }
      setLang(lang);
      const len = tutorialLen(t(key, P));
      if (len > max) errs.push(`${where}: ${lang} ${len}자 > ${max}자 (${key})`);
    }
  };
  try {
    steps.forEach((s, i) => {
      const w = `${i + 1}단계(${s.id})`;
      if (!s.beats || !s.beats.length) errs.push(`${w}: beats 없음`);
      const seen = new Set();
      for (const u of (s.setup && s.setup.units) || []) {
        if (!inMap(u.pos)) errs.push(`${w}: 유닛 칸이 지도 밖 ${u.pos}`);
        const key = u.pos.join(',');
        if (seen.has(key)) errs.push(`${w}: 유닛 칸 겹침 ${key}`);
        seen.add(key);
      }
      (s.beats || []).forEach((b, j) => {
        const bw = `${w} beat ${j + 1}`;
        checkText(bw + ' hint', b.hint, TUT_LIMITS.hint);
        if (b.sub) checkText(bw + ' sub', b.sub, TUT_LIMITS.sub);
        if (b.card) { checkText(bw + ' card', b.card, 120); if (!b.goal || b.goal.do !== 'preview') errs.push(`${bw}: card 는 preview 목표에서만`); }
        if (!b.goal || !GOALS.includes(b.goal.do)) errs.push(`${bw}: goal 종류 ${b.goal && b.goal.do}`);
        if (!b.allowedActions) errs.push(`${bw}: allowedActions 없음`);
        const T = b.target;
        if (!T || !(T.cells || T.unit || T.move || T.button)) errs.push(`${bw}: target 없음`);
        else for (const p of T.cells || []) if (!inMap(p)) errs.push(`${bw}: target 칸이 지도 밖 ${p}`);
        for (const r of b.onResult || []) {
          if (r.if && !TUT_CONDITIONS[r.if]) errs.push(`${bw}: 결과 조건 ${r.if}`);
          checkText(bw + ' 결과', r.key, TUT_LIMITS.hint);
          if (r.sub) checkText(bw + ' 결과 sub', r.sub, TUT_LIMITS.sub);
        }
      });
    });
  } finally { setLang(prev); }
  return errs;
}

/* =====================================================================
   목표 표시 (표시줄 + 목표 장면). 시나리오 데이터만 읽는 순수 함수 (상태·시야를 읽지 않으므로 안 보이는 정보가 섞이지 않음)
   시나리오의 선택 필드 goal: { nameKey?: 거점 이름 키(없으면 거점이 하나일 때 그 이름, 아니면 '노란 구역'),
     role?: 'att'|'def' (문구를 고를 때 진영 역할 대신 쓸 값), scene?: { att?: {main, sub}, def?: {main, sub} } (STRINGS 키) }
   ===================================================================== */
const GOAL_DEFAULTS = {
  zoneKey: 'goal.zone',
  bar: { att: 'goal.bar.att', def: 'goal.bar.def' },
  scene: { att: { main: 'goal.scene.att', sub: 'goal.scene.att.s' }, def: { main: 'goal.scene.def', sub: 'goal.scene.def.s' } },
};
const GOAL_LIMITS = { main: 22, sub: 28 };   // 목표 장면 말풍선 글자 수 (본문, 보조 한 줄)

/** 이 진영이 보는 목표 정보 { role, nameKey, barKey, main, sub, cells:[[r,c]] }. 역할이 없으면 공격용 */
function goalInfo(sc, side) {
  const G = sc.goal || {};
  const role = G.role || ((sc.sides && sc.sides[side] && sc.sides[side].role) === 'def' ? 'def' : 'att');
  const objs = sc.objectives || [];
  const nameKey = G.nameKey || (objs.length === 1 && objs[0].nameKey) || GOAL_DEFAULTS.zoneKey;
  const text = { ...GOAL_DEFAULTS.scene[role], ...((G.scene && G.scene[role]) || {}) };
  const cells = objs.flatMap((o) => (o.cells || (o.pos ? [o.pos] : [])).map((p) => [p[0], p[1]]));
  return { role, nameKey, barKey: GOAL_DEFAULTS.bar[role], main: text.main, sub: text.sub, cells };
}

/** 목표 문구 검사 → 오류 문자열 목록. 두 역할 × ko/en 모두 키가 있고 본문 ≤ 22자, 보조 ≤ 28자 */
function validateGoalTexts(sc) {
  const errs = [], prev = getLang();
  try {
    for (const role of ['att', 'def']) {
      const side = Object.keys(sc.sides || {}).find((s) => sc.sides[s].role === role) || Object.keys(sc.sides || {})[0];
      const g = goalInfo({ ...sc, goal: { ...(sc.goal || {}), role } }, side);
      for (const lang of ['ko', 'en']) {
        for (const [k, max] of [[g.main, GOAL_LIMITS.main], [g.sub, GOAL_LIMITS.sub], [g.barKey, 99], [g.nameKey, 99]]) {
          if (!(k in STRINGS[lang])) { errs.push(`${sc.id}/${role}/${lang}: ${k} 없음`); continue; }
          setLang(lang);
          const len = tutorialLen(t(k, { name: { t: g.nameKey } }));
          if (len > max) errs.push(`${sc.id}/${role}/${lang}: ${len}자 > ${max}자 (${k})`);
        }
      }
      if (!g.cells.length) errs.push(`${sc.id}: 거점 칸 없음`);
    }
  } finally { setLang(prev); }
  return errs;
}

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    GOAL_DEFAULTS, GOAL_LIMITS, goalInfo, validateGoalTexts,
    TUTORIAL_ID, PRACTICE_ID, TUT_LIMITS, tutorialSteps, tutorialState, tutorialAllows, tutorialRecord, tutorialProgress,
    tutorialTarget, tutorialEndTurn, tutorialParams, tutorialCurrent, tutorialBeat, tutorialBeats, tutorialCellMatch,
    tutorialGoalDone, tutorialResult, validateTutorialSteps, tutorialLen, tutorialPlaceBubble,
  });
}
