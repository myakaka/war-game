'use strict';
/* =====================================================================
   튜토리얼 로직 (DOM 없음, Node 테스트와 화면이 같이 씀)
   - 규칙 판정·주사위·안개는 엔진 함수(moveUnit, resolveAttack, endTurn, getVisibleTiles …)를 그대로 부른다.
     튜토리얼만의 규칙 분기는 없다. 이 파일은 단계 시작 상태, 허용 입력, 목표 진행, 정해진 상대 행동만 다룬다.
   - 단계 데이터: js/scenarios/tutorial.js 의 tutorialSteps
   ===================================================================== */
const TUTORIAL_ID = 'tutorial';
const PRACTICE_ID = 'tutorialPractice';

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

/** 지금 진행할 목표 번호 (모두 끝났으면 goal.length) */
function tutorialCurrent(step, log, st) {
  const p = tutorialProgress(step, log, st);
  const k = p.done.indexOf(false);
  return k < 0 ? p.done.length : k;
}

/**
 * 허용된 입력인가. action: { kind: 'select'|'move'|'attack'|'preview'|'endTurn'|'cell'|'wait', unit?, at?:{r,c} }
 * ordered 단계는 지금 목표와 같은 종류의 입력만 (선택은 허용 목록이면 언제나)
 */
function tutorialAllows(step, action, st, log = []) {
  const A = step.allowedActions || {}, side = GAME_CONFIG.PLAYER_SIDE;
  const k = action.kind;
  let ok = false;
  if (k === 'select') ok = (A.select || []).includes(action.unit) || !!(A.move && A.move[action.unit]) || !!(A.attack && A.attack[action.unit]);
  else if (k === 'move') ok = !!A.move && tutorialCellMatch(A.move[action.unit], action.at, st, side);
  else if (k === 'attack' || k === 'preview') ok = !!A.attack && tutorialCellMatch(A.attack[action.unit], action.at, st, side);
  else if (k === 'endTurn') ok = !!A.endTurn;
  if (!ok || !step.ordered || k === 'select') return ok;
  const g = step.goal[tutorialCurrent(step, log, st)];
  if (!g) return k === 'preview';   // 끝난 뒤에는 상태를 더 바꾸지 않음 (확인 창 열기만)
  const same = g.do === k || (k === 'attack' && g.do === 'preview') || (k === 'preview' && g.do === 'attack');
  return same && (!g.unit || g.unit === action.unit);
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
  }
  if ((action.kind === 'preview' || action.kind === 'attack') && action.at) e.fog = !getVisibleTiles(st, GAME_CONFIG.PLAYER_SIDE).has(idx(action.at.r, action.at.c));
  log.push(e);
  for (const ev of events || []) if (ev.type === 'objectiveLost' && ev.contested) log.push({ kind: 'contested', obj: ev.objectiveId });
  return log;
}

/** 목표별 완료 여부 { done:[bool], complete } (공격은 빗나가도 완료: 결과가 아니라 행동) */
function tutorialProgress(step, log, st) {
  const side = GAME_CONFIG.PLAYER_SIDE;
  const done = step.goal.map((g) => {
    switch (g.do) {
      case 'select': return log.some((e) => e.kind === 'select' && e.unit === g.unit);
      case 'selectBlocked': return log.some((e) => e.kind === 'select' && e.unit === g.unit && e.blocked);
      case 'selectCooldown': return log.some((e) => e.kind === 'select' && e.unit === g.unit && e.cooling);
      case 'move': return log.some((e) => e.kind === 'move' && e.unit === g.unit && (!g.at || tutorialCellMatch(g.at, e.at, st, side)));
      case 'attack': return log.some((e) => e.kind === 'attack' && e.unit === g.unit);
      case 'preview': return log.some((e) => (e.kind === 'preview' || e.kind === 'attack') && e.unit === g.unit && (!g.at ? true : g.at === 'fog' ? e.fog === true : tutorialCellMatch(g.at, e.at, st, side)));
      case 'endTurn': return log.some((e) => e.kind === 'endTurn');
      case 'contested': return log.some((e) => e.kind === 'contested' && e.obj === g.obj);
      case 'own': { const o = st.objectives.find((x) => x.id === g.obj); return !!o && o.owner === side; }
      default: return false;
    }
  });
  // 순서가 있는 단계: 앞 목표가 끝나야 뒤 목표도 끝난 것으로 셈
  if (step.ordered) for (let i = 1; i < done.length; i++) if (!done[i - 1]) done[i] = false;
  return { done, complete: done.every(Boolean) };
}

/** 지금 깜빡일 칸: 지금 목표의 유닛이 선택되지 않았으면 그 유닛 칸, 아니면 목표의 hl (없으면 단계 highlight) */
function tutorialHighlight(step, log, st, selectedId) {
  const g = step.goal[tutorialCurrent(step, log, st)];
  if (!g) return [];
  if (g.unit && g.do !== 'selectBlocked' && g.do !== 'selectCooldown' && selectedId !== g.unit) {
    const u = getUnit(st, g.unit);
    if (u) return [[u.r, u.c]];
  }
  if (g.do === 'selectBlocked' || g.do === 'selectCooldown') { const u = getUnit(st, g.unit); return u ? [[u.r, u.c]] : []; }
  return (g.hl || step.highlight || []).map((p) => [p[0], p[1]]);
}

/**
 * 턴 종료: 엔진 endTurn → (상대 턴) 단계의 정해진 행동(enemyScript)만 실행, AI 는 움직이지 않음 → endTurn.
 * 반환: 이벤트 목록 (화면은 일반 게임처럼 시야 기준으로 로그를 남김)
 */
function tutorialEndTurn(st, step, rng) {
  const events = endTurn(st);
  if (st.winner) return events;
  for (const a of step.enemyScript || []) {
    const u = getUnit(st, a.unit);
    if (!u || u.side !== st.turn) continue;
    const at = a.attack && { r: a.attack[0], c: a.attack[1] };
    if (at && getAttackableTiles(st, a.unit).some((p) => samePos(p, at))) events.push(...resolveAttack(st, a.unit, at, rng));   // 규칙상 안 되는 행동(쿨다운 등)은 건너뜀
    if (st.winner) return events;
  }
  events.push(...endTurn(st));
  return events;
}

/**
 * 코치 문구에 넣을 수치 (모두 규칙·시나리오 데이터에서 읽음). 규칙 값을 바꾸면 문구도 따라 바뀐다.
 * 대칭 전장 점수 설명은 그 시나리오의 공개 데이터(objectivePoints, scoreTiming)
 */
function tutorialParams() {
  const C = GAME_CONFIG, CB = C.COMBAT, F = C.FIRES || {}, UT = C.UNIT_TYPES;
  const ter = (ch) => C.TERRAIN[ch] || TERRAIN_TYPES[ch];
  const act = C.ACTIVATIONS ? C.ACTIVATIONS[roleOf(C.PLAYER_SIDE)] : null;
  const sym = findScenario('symmetric');
  const symPts = sym && sym.objectivePoints
    ? sym.objectives.map((o) => ({ t: 'tut.ptItem', p: { obj: { t: o.shortNameKey }, n: sym.objectivePoints[o.id] } }))
    : [];
  const fire = (type, k, d) => (F[type] && F[type][k] != null ? F[type][k] : d);
  return {
    act: act ?? '-',
    base: CB.baseHit, per: CB.perPoint, fog: Math.abs(CB.fogPenalty), mv: Math.abs(C.MOVE_ATTACK_PENALTY),
    min: CB.minHitD10, max: CB.maxHitD10, dice: C.DICE_SIDES,
    forest: ter('f').hitMod, plain: ter('.').hitMod, city: ter('#').hitMod,
    marsh: { t: terrainNameKey('paddy') },
    mMin: UT.mortar.rangeMin, mRange: fire('mortar', 'range', UT.mortar.rangeMax), mCd: fire('mortar', 'cooldown', 0), mDmg: UT.mortar.fixedDamage,
    aMin: UT.artillery.rangeMin, aRange: fire('artillery', 'range', UT.artillery.rangeMax), aCd: fire('artillery', 'cooldown', 0), splash: CB.splashDamage,
    pts: (C.OBJECTIVE_POINTS && C.OBJECTIVE_POINTS.T) ?? '-',
    symPts, symWhen: { t: sym && sym.scoreTiming === 'roundEnd' ? 'tut.when.roundEnd' : 'tut.when.ownTurn' },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    TUTORIAL_ID, PRACTICE_ID, tutorialSteps, tutorialState, tutorialAllows, tutorialRecord, tutorialProgress,
    tutorialHighlight, tutorialEndTurn, tutorialParams, tutorialCurrent, tutorialCellMatch,
  });
}
