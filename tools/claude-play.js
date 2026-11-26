// 2인 대전에서 Claude 가 한쪽 진영을 둘 때 쓰는 도우미 (게임에는 연결하지 않음. 필요할 때만 페이지에 넣음).
// 넣기: const s = document.createElement('script'); s.src = 'tools/claude-play.js'; document.head.appendChild(s);
// 안개: 게임 상태를 읽지 않고 화면(DOM)에 그려진 것만 읽고, 사람과 같은 클릭만 함. 내 진영 가림막을 CP.ready() 로 넘긴 뒤에만 동작.
// 사용: CP.init('ru') → CP.ready() → CP.view() · CP.sel('0,4') · CP.move('0,4','2,4') · CP.attack('2,4','5,4') · CP.scout('0,11','6,8') · CP.wait('0,4') → CP.end()
(() => {
  'use strict';
  const q = (s) => document.querySelector(s);
  const cells = () => [...document.querySelectorAll('#board .cell')];
  const size = () => Math.round(Math.sqrt(cells().length));
  const rc = (i) => `${Math.floor(i / size())},${i % size()}`;
  const cellAt = (pos) => { const [r, c] = String(pos).split(',').map(Number); const el = cells()[r * size() + c]; if (!el) throw new Error('no cell ' + pos); return el; };
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const textOf = (s) => clean(q(s) && !q(s).hidden ? q(s).innerText : '');
  const CODE = { infantry: 'IN', armor: 'TK', antitank: 'AT', artillery: 'AR', mortar: 'MO', recon: 'RC', signal: 'SG' };
  let me = null, myTurn = false, seenLog = [];

  const myName = () => t(sideNameKey(me));
  const curtain = () => q('#modal .curtain-card');
  function guard() {
    if (!me) throw new Error('CP.init(side) first');
    if (curtain()) { myTurn = false; throw new Error('curtain is up: ' + (clean(q('.curtain-who') && q('.curtain-who').innerText)) + ' (use CP.ready() only on my turn)'); }
    if (!myTurn) throw new Error('not my turn: nothing is read');
  }

  function unitsOnBoard() {
    const out = [];
    cells().forEach((el, i) => {
      const u = el.querySelector('.dyn .unit');
      if (!u) return;
      const side = Object.keys(GAME_CONFIG.SIDES).find((s) => u.classList.contains(s));
      const labelEl = u.querySelector('[aria-label]');
      const label = labelEl ? labelEl.getAttribute('aria-label') : '';
      const type = Object.keys(CODE).find((k) => GAME_CONFIG.UNIT_TYPES[k] && label.includes(' ' + t(GAME_CONFIG.UNIT_TYPES[k].nameKey) + ','));
      const hp = (label.match(/HP (\d+)/) || [])[1];
      const extra = label.split(/HP \d+\/\d+,?\s*/)[1] || '';
      out.push({ at: rc(i), side, mine: side === me, code: CODE[type] || '??', hp, extra });
    });
    return out;
  }
  const unitLine = (u) => `${u.code} ${u.at} hp${u.hp}${u.extra ? ' [' + u.extra + ']' : ''}`;

  const terKey = (el) => { const m = (el.querySelector('svg.ter') || { getAttribute: () => '' }).getAttribute('class').match(/ter-([a-z]+)/); return m ? m[1] : '?'; };
  /** 지형 지도 (전투 중 안 바뀜). 엄폐물 칸은 e, 종류와 방향은 아래 목록 */
  function map() {
    guard();
    const n = size(), sc = SCENARIOS.find((x) => x.id === GAME_CONFIG.SCENARIO_ID);
    const rows = (sc.map || []).map((row, r) => String(r).padStart(2) + ' ' + [...row].join(' '));
    const cover = Object.entries(sc.coverCells || {}).map(([k, v]) => `${k} ${v.skin}${v.rotation ? ' ' + v.rotation : ''}`);
    const objs = GAME_CONFIG.OBJECTIVES.map((o) => `${o.id}: ${(o.cells || [o.pos]).map((p) => Array.isArray(p) ? p.join(',') : `${p.r},${p.c}`).join(' ')}`);
    return [`${n}x${n}  kinds on board: ${[...new Set(cells().map(terKey))].join(' ')}`, ...rows, 'cover: ' + cover.join(' / '), 'objectives: ' + objs.join(' / ')].join('\n');
  }

  /** 지난번 보기 이후 내 로그에 새로 생긴 줄 */
  function newLog() {
    const now = [...document.querySelectorAll('#log .logline')].map((e) => clean(e.textContent));
    const left = seenLog.slice();
    const fresh = now.filter((l) => { const k = left.indexOf(l); if (k < 0) return true; left.splice(k, 1); return false; });
    seenLog = now;
    return fresh;
  }

  const overlayText = () => (q('#overlay').classList.contains('show') ? clean(q('#modal').innerText) : '');

  function view() {
    guard();
    const us = unitsOnBoard();
    const clear = cells().map((el, i) => (el.classList.contains('fog') ? null : i)).filter((i) => i !== null);
    const rows = {};
    for (const i of clear) { const [r, c] = rc(i).split(',').map(Number); (rows[r] = rows[r] || []).push(c); }
    const ranges = (cs) => cs.reduce((a, c) => { const l = a[a.length - 1]; if (l && c === l[1] + 1) l[1] = c; else a.push([c, c]); return a; }, []).map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',');
    return [
      ['#hud-round', '#hud-turn', '#hud-act', '#hud-objs', '#hud-goal', '#hud-units'].map(textOf).filter(Boolean).join(' | '),
      'mine: ' + us.filter((u) => u.mine).map(unitLine).join(' ; '),
      'enemy seen: ' + (us.filter((u) => !u.mine).map(unitLine).join(' ; ') || '-'),
      'visible r:cols  ' + Object.entries(rows).map(([r, cs]) => `${r}:${ranges(cs)}`).join(' '),
      ...(overlayText() ? ['window: ' + overlayText()] : []),
      ...newLog().map((l) => 'log: ' + l),
    ].join('\n');
  }

  const hover = (el, type) => el.dispatchEvent(new PointerEvent(type, { pointerType: 'mouse' }));
  // pointerdown 은 칸까지만 (bubbles 없음). 지도 틀까지 올라가면 뗌 없는 손가락이 남아, 다음 사람 클릭이 두 손가락 확대로 처리됨
  const click = (el) => { el.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse' })); el.click(); };
  const press = (id) => { const b = q(id); if (!b || b.disabled || b.hidden) throw new Error('button not usable: ' + id); b.click(); };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  /** 연출이 끝나 화면이 잠잠해질 때까지 기다림 */
  async function settle(max = 30000) {
    const sig = () => [q('#log') && q('#log').childElementCount, q('#overlay').className, q('#modal').textContent, q('#btn-end-turn') && q('#btn-end-turn').disabled,
      cells().map((el) => (el.querySelector('.dyn .unit') ? 1 : 0)).join(''), q('.fx-layer') && q('.fx-layer').childElementCount].join('|');
    const start = Date.now();
    let last = sig(), since = Date.now();
    while (Date.now() - start < max) {
      await pause(150);
      const s = sig();
      if (s !== last) { last = s; since = Date.now(); continue; }
      const ready = q('#overlay').classList.contains('show') || (q('#btn-end-turn') && !q('#btn-end-turn').disabled);
      if (ready && Date.now() - since >= 900) return;
    }
  }

  function selectUnit(at) {
    guard();
    if (overlayText()) throw new Error('a window is open: ' + overlayText());
    const d = q('#btn-deselect');
    if (d && !d.disabled) d.click();
    const mine = unitsOnBoard().find((u) => u.at === at && u.mine);
    if (!mine) throw new Error('no unit of mine at ' + at);
    click(cellAt(at));
  }
  function tip(pos) {
    const el = cellAt(pos);
    hover(el, 'pointerenter');
    const box = q('#tooltip');
    const s = box && box.style.display !== 'none' ? clean(box.innerText) : '';
    hover(el, 'pointerleave');
    return s;
  }
  const marked = (cls) => cells().map((el, i) => (el.classList.contains(cls) ? rc(i) : null)).filter(Boolean);

  /** 이동 칸 중 화면에 빗금(이동 후에도 공격 가능)이 그려진 칸. SVG 한 칸 = 40 */
  function hatched() {
    const paths = [...document.querySelectorAll('#board .hl-under path[fill="url(#hl-hatch)"]')];
    return marked('can-move').filter((pos) => {
      const [r, c] = pos.split(',').map(Number);
      const pt = new DOMPoint(c * 40 + 20, r * 40 + 20);
      return paths.some((p) => p.isPointInFill(pt));
    });
  }

  /** 유닛을 골라 갈 수 있는 칸과 칠 수 있는 대상(명중 정보)을 돌려줌 */
  function sel(at) {
    selectUnit(at);
    const targets = [...marked('can-attack'), ...marked('can-fire')];
    const foes = new Set(unitsOnBoard().filter((u) => !u.mine).map((u) => u.at));
    const fire = new Set(hatched());
    return [
      textOf('#unit-info'),
      'move, can still attack after: ' + (marked('can-move').filter((p) => fire.has(p)).join(' ') || '-'),
      'move only (no attack after): ' + (marked('can-move').filter((p) => !fire.has(p)).join(' ') || '-'),
      ...targets.filter((p) => foes.has(p)).map((p) => `target ${p}: ${tip(p)}`),
      'other fire cells: ' + (targets.filter((p) => !foes.has(p)).join(' ') || '-'),
      'scout: ' + (q('#btn-scout') && !q('#btn-scout').hidden && !q('#btn-scout').disabled ? `yes (range ${GAME_CONFIG.SCOUT.range})` : 'no'),
    ].join('\n');
  }

  async function move(from, to) {
    selectUnit(from);
    if (!cellAt(to).classList.contains('can-move')) throw new Error(`cannot move ${from} -> ${to}`);
    click(cellAt(to));
    if (q('#btn-ch-move')) press('#btn-ch-move');   // 이동도 사격도 되는 칸
    await settle();
    return view();
  }

  async function attack(from, target) {
    selectUnit(from);
    click(cellAt(target));
    if (q('#btn-ch-fire')) press('#btn-ch-fire');
    else if (!q('#btn-atk-yes') && cellAt(target).classList.contains('can-move')) throw new Error(`${target} is not a target of ${from}`);
    await settle(5000);
    if (q('#btn-atk-yes')) press('#btn-atk-yes');
    await settle();
    return view();
  }

  async function scout(from, at) {
    selectUnit(from);
    press('#btn-scout');
    click(cellAt(at));
    await settle();
    const u = unitsOnBoard().find((x) => x.at === from && x.mine);
    if (u && !u.extra.includes(t('aria.done'))) {   // 사거리 밖 칸을 누르면 게임은 아무 일도 하지 않음
      const b = q('#btn-scout');
      if (b && b.getAttribute('aria-pressed') === 'true') b.click();
      throw new Error(`scout did not happen: ${at} is out of range ${GAME_CONFIG.SCOUT.range} from ${from}`);
    }
    return view();
  }

  async function wait(from) {
    selectUnit(from);
    press('#btn-wait');
    await settle();
    return view();
  }

  /** 내 가림막일 때만 넘김. 지난 턴 요약이 있으면 읽고 닫음 */
  async function ready() {
    if (!me) throw new Error('CP.init(side) first');
    const card = curtain();
    if (!card) throw new Error('no curtain: CP.ready() works only at the hand-over screen');
    const who = clean(q('.curtain-who').innerText);
    if (!who.includes(myName())) throw new Error('this curtain is not mine: ' + who);
    press('#btn-ready');
    await pause(800);
    myTurn = true;
    seenLog = [];
    let summary = '';
    if (q('#btn-sum-ok')) { summary = 'last turn: ' + overlayText(); q('#btn-sum-ok').click(); }
    await settle();
    seenLog = [...document.querySelectorAll('#log .logline')].map((e) => clean(e.textContent));
    return [summary, view()].filter(Boolean).join('\n');
  }

  /** 턴 종료. 이후에는 다음 내 가림막까지 아무것도 읽지 않음 */
  async function end() {
    guard();
    press('#btn-end-turn');
    await pause(300);
    if (!curtain() && q('#btn-end-turn') && q('#btn-end-turn').classList.contains('armed')) press('#btn-end-turn');
    await pause(1200);
    if (curtain()) { myTurn = false; return 'turn ended. next: ' + clean(q('.curtain-who').innerText); }
    const o = overlayText();
    myTurn = false;
    return o ? 'window: ' + o : 'turn end pressed, no curtain seen';
  }

  window.CP = {
    init(side) {
      if (!GAME_CONFIG.SIDES[side]) throw new Error('unknown side: ' + side);
      me = side; myTurn = false; seenLog = [];
      return `CP ready for ${myName()} (${side})`;
    },
    ready, view, map, sel, move, attack, scout, wait, end,
  };
})();
