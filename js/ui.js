'use strict';
/* =====================================================================
   화면(UI)
   로직 함수를 호출하고, 로직이 돌려준 이벤트를 연출로 재생한다.
   (연출은 게임 상태를 바꾸지 않음: 상태는 로직 호출 시점에 이미 확정)
   ===================================================================== */
(() => {
  'use strict';
  let PLAYER = GAME_CONFIG.PLAYER_SIDE;   // AI 대전에서 플레이어가 맡는 진영 (시나리오 값, applyScenario 가 갱신)
  let AI_SIDE = enemyOf(PLAYER);
  const STEP_MS = 700;             // AI 행동 사이 쉬는 시간 (속도 배율 적용)
  const ATTACK_CONFIRM = true;     // false 로 바꾸면 확인 없이 바로 공격 (예전 방식)

  /* =====================================================================
     DESIGN: 지도 그림·하이라이트·연출에 쓰는 색, 크기, 시간 값은 모두 여기서 바꾼다
     (CSS 쪽 값은 :root 의 --map-*, --fog-*, --hl-* 변수). 좌표 단위: 한 칸 = 40
     ===================================================================== */
  const DESIGN = {
    side: {   // 역할별 (시나리오의 sides[id].role)
      def: { line: '#2B5C9E', fill: '#CFE0F7' },   // 방어 측: 사각형
      att: { line: '#B03030', fill: '#F6CFCB' },   // 공격 측: 마름모
    },
    neutral: '#7d7d7d',
    // 여러 칸 거점의 묶음 윤곽: 기본 테마는 소유 진영 색 굵은 점선, 리치 테마는 가는 중립 노란색 실선
    objGroup: { w: 3.2, dash: '7 4', none: '#3F3A33', richLine: '#F2C94C', richW: 1.6 },   // none: 점유자 없음 (안개 위에서도 보이게 어둡게)
    terrain: {
      plain:    { bg: '#EBE5C8', mark: '#B5B088' },
      forest:   { bg: '#C9D3A3', mark: '#5B7A3A', light: '#7E9C58' },
      paddy:    { bg: '#D3E0C2', mark: '#7FA38A' },
      mountain: { bg: '#D8CBB0', mark: '#8A6B4A', fill: '#C2B190' },
      river:    { bg: '#A9C8D8', mark: '#4F7C96' },
      city:     { bg: '#D2C6B2', mark: '#A59580' },
    },
    grid: { thin: 'rgba(110,90,60,0.22)', thinW: 0.6, thick: 'rgba(110,90,60,0.5)', thickW: 1.3, every: 4 },
    tipOffset: 16,   // 툴팁: 커서에서 떨어지는 거리 (px)

    /* 하이라이트 */
    hl: {
      sel: { inner: '#0B2A6B', innerW: 3, outer: '#7FB0FF', outerW: 1.4, pulseMs: 1600 },
      move: { fill: 'rgba(60,130,220,0.16)', line: '#2E6FD0', w: 2.4 },
      moveAtk: { hatch: 'rgba(46,111,208,0.7)', hatchW: 1.7, period: 6, line: '#1D4FA0', w: 1.6, dash: '2 3' },
      target: { line: '#D32F2F', w: 2.6, r: 18, r2: 21.5, pulseMs: 1400 },
      arty: { fill: 'rgba(200,140,40,0.14)', line: '#B7791F', w: 2.2, dash: '5 3' },
      artyFog: { fill: 'rgba(200,140,40,0.05)', line: 'rgba(183,121,31,0.5)', w: 1.4, dash: '2 4' },   // 간접 화력 사거리 중 안개 속 칸 (fires 시나리오): 흐리게
      impact: { line: '#D32F2F', centerFill: 'rgba(211,47,47,0.3)', centerW: 2.4, sideFill: 'rgba(211,47,47,0.15)', sideW: 1.6, sideDash: '4 3' },
      ff: { line: '#F59E0B', w: 2.6, tri: '#F59E0B' },
      signal: { fill: 'rgba(20,160,170,0.16)', line: '#12A0AA', w: 2.2, dash: '4 3', badge: '#0E7C86', att: 'rgba(176,48,48,0.12)', attLine: '#B03030' },
      done: { fill: '#5b6472', r: 6, opacity: 0.5 },
      badge: { bg: '#111827', line: '#F9FAFB', lineW: 1.2, w: 48, h: 21, font: 13 },
      sigBadge: { w: 26, h: 13, font: 9.5 },
    },

    /* 연출 (ms). 실제 시간 = 값 × 속도 배율 */
    fx: {
      speed: { slow: 1.5, normal: 1, fast: 0.5 },
      stepMs: 230, stepMsRM: 120, fadeInMs: 260,
      path: { line: '#2E6FD0', w: 2.2, dash: '3 4', opacity: 0.8, fadeMs: 500 },
      shake: { ms: 280, amp: 3.4 },
      hitRingRM: { ms: 450, line: '#D32F2F', w: 2.6 },
      dmg: { ms: 900, msRM: 800, rise: 18, color: '#D32F2F', ff: '#B7791F', stroke: 3.2, font: 16, fadeFrom: 0.6 },
      miss: { ms: 800, rise: 10, color: '#5b6472', w: 2.6, size: 6 },
      destroy: { ms: 520, smoke: '#8b8577', smokeOpacity: 0.55 },
      impact: { ms: 600, msRM: 550, r0: 4, r1: 36, w0: 3, w1: 0.6, center: 'rgba(211,47,47,0.65)', side: 'rgba(245,158,11,0.5)', debris: 7, debrisColor: '#5b4636' },
      capture: { downMs: 260, upMs: 340, ringMs: 520, holdMsRM: 500 },
      banner: { inMs: 280, holdMs: 1100, finalHoldMs: 1700, outMs: 250, fadeMsRM: 150, colors: { def: '#2B5C9E', att: '#B03030', final: '#B7791F' } },
    },
    /* 주사위 */
    dice: { spinMs: 650, tickMs: 55, holdMs: 850, holdMsRM: 700 },

    /* 레이아웃 (3단계). 넓은 화면 = 너비 >= wideMinW 이고 너비/높이 >= wideMinAspect */
    layout: {
      wideMinW: 900, wideMinAspect: 1.1,
      compactMaxH: 520,                           // 좁은 화면이지만 가로이고 높이가 이보다 낮으면 (휴대폰 가로) 지도 옆 배치
      cellMin: 20, cellMax: 56, cellFloor: 10,     // cellMin 보다 작아져야 하면 하단 UI 를 우선하고 지도를 더 줄임 (cellFloor 까지)
      sideMin: 240, sideVw: 0.22, sideMax: 320,   // 우측 열 = clamp(240px, 22vw, 320px). 로그 드로어 폭도 같음
      gap: 12, narrowGap: 8, narrowSide: 16,
      lblWide: 16, lblNarrow: 12, frameBorder: 4,
    },
    /* 터치 */
    touch: { balloonMs: 3000 },
    /* 화력 설정 메뉴 (fires 시나리오): 항목별 범위·간격. 시나리오 기본값에서 시작 */
    fireSettings: [
      { type: 'artillery', key: 'range', min: 2, max: 8, step: 1 },
      { type: 'artillery', key: 'cooldown', min: 0, max: 2, step: 1 },
      { type: 'mortar', key: 'range', min: 2, max: 6, step: 1 },
      { type: 'mortar', key: 'cooldown', min: 0, max: 2, step: 1 },
      { type: 'mortar', key: 'indirectPenalty', min: 0, max: 30, step: 5 },
    ],
    impactSmall: 0.55,     // 박격포(한 칸) 탄착 연출의 고리 크기 배수
    /* 좁은 화면 조작: 턴 종료 재확인 시간, 공격 확인 시트 (명중 단계 경계는 표시용이며 규칙값이 아님) */
    endArmMs: 3000,
    atkSheet: { hiAt: 60, loBelow: 40, maxChips: 4, margin: 6 },
    /* 배치 구역 (초록 반투명 채움 + 초록 점선 윤곽) */
    deployZone: { fill: 'rgba(46,158,91,0.20)', line: '#2E9E5B', w: 2.4, dash: '6 4' },
    /* 시나리오 장식 표식 (규칙 영향 없음): 활주로 = 회색 띠 + 흰 점선 중심선 */
    overlay: { runway: { fill: '#9C9A92', edge: '#7E7C75', line: '#FFFFFF', lineW: 1.6, dash: '5 4', halfW: 11 } },
    scenMap: 76,   // 시나리오 카드의 지도 미리보기 크기 (px)
    /* PC 리치 테마 (그림 세트가 있는 시나리오, 넓은 화면만). 길이 단위: 칸 */
    rich: {
      // by: 'h' 높이 / 'w' 폭 기준으로 size 칸 (비율 유지). ring: 링 반지름
      units: {
        armor: { img: 'armor', by: 'h', size: 1.19, ring: 0.61 },
        infantry: { img: 'infantry', by: 'w', size: 1.22, ring: 0.64 },
        antitank: { img: 'antitank', by: 'w', size: 1.17, ring: 0.64 },
        artillery: { img: 'artillery', by: 'h', size: 1.69, ring: 0.78 },
        recon: { img: 'recon', by: 'h', size: 1.28, ring: 0.67 },
        signal: { img: 'comms', by: 'h', size: 1.56, ring: 0.78 },
        // 박격포: 그림(mortar.png)이 없거나 못 불러오면 포병 그림을 fallbackScale 배로 (그림 하나가 없어도 테마는 유지)
        mortar: { img: 'mortar', by: 'w', size: 1.1, ring: 0.6, optional: true, fallback: 'artillery', fallbackScale: 0.7 },
      },
      ringFill: 0.18, ringW: 2.5, selW: 4.5, selLine: '#E8F1FF',
      shadow: { blur: 0.03, dx: 0.06, dy: 0.06, alpha: 0.35 },
      doneBright: 0.7,
      badge: { h: 0.24, font: 0.165, charW: 0.13, pad: 0.07, at: 0.62 },
      move: { fill: 'rgba(255,255,255,0.12)', cell: 'rgba(255,255,255,0.32)', edge: 'rgba(255,255,255,0.85)', w: 2 },
      target: { line: '#FF4D42', w: 2.6 },
      stepMs: 250,                                       // 이동: 칸 중심 사이 미끄러짐
      tracer: { ms: 150, line: '#FFE6A0', w: 2.2 },        // 공격: 짧은 예광선
      // 공격할 때 그림만 대상 방향으로 돌림 (연출만). limit: 기본 방향 기준 최대 회전각 (null = 제한 없음)
      face: { turnMs: 150, backMs: 200, limit: { infantry: 60, antitank: 60 } },
      hitRing: { line: '#FF3B30', w: 3 },                 // 피격: 대상 링 붉게 깜빡임
      resizeMs: 200,                                     // 크기가 연속으로 바뀌면 이 시간 뒤에 한 번 다시 그림
      noticeMs: 4500,
    },
  };
  const CS = 40;           // SVG 좌표에서 한 칸 크기
  let VB = N * CS;         // 지도 전체 SVG 좌표 크기 (시나리오를 바꾸면 buildBoard 가 갱신)

  const ui = {
    state: null, view: null, selectedId: null, busy: false, speed: 'normal', difficulty: 'normal',
    actingId: null, gameId: 0, moveSet: new Set(), atkSet: new Set(), hoverIdx: -1, inspectId: null,
    moveAtkSet: new Set(), moveLeftAt: new Map(), dualSet: new Set(), choice: null,
    note: null,            // { id, reason: {k,p} }: 이동 뒤 공격할 수 없어 행동이 끝난 유닛의 사유 (패널 표시용)
    mode: 'ai',            // 'ai' | 'hotseat'
    viewer: PLAYER,        // 화면 시점: 진영 / null(가림막·빈 화면) / 'all'(종료 후 전체 공개)
    logs: {},              // 진영별로 볼 수 있는 로그 (구조화된 메시지 {k, p, cls}). emptyLogs() 로 초기화
    history: [],           // 전투 되돌아보기용 전체 기록 (구조화된 메시지)
    turnEvents: [],        // 2인 모드: 마지막 교대 이후의 이벤트 (다음 플레이어 요약용)
    flash: new Set(),      // 잠깐 강조할 칸
    deploy: null,          // 시작 전 배치 단계: { side, queue: [남은 진영], done: { side: [{r,c}] } }
    overlay: null,         // 열려 있는 창을 현재 언어로 다시 그리는 함수 (언어 전환용)
    summary: null,         // 2인 모드 요약 패널을 다시 그리는 함수
    mouse: null,           // 마지막 마우스 위치 (툴팁 배치용)
    anim: { hideUnits: new Set(), hideFlag: null },   // 연출 중 지도에서 잠시 숨길 것 (연출 층이 대신 그림)
    reduceMotion: false,
    // 3단계: 화면 구조
    screen: 'start',       // 'start' | 'deploy' | 'game' | 'curtain' (승패는 'game' 위의 오버레이)
    wide: true,            // 레이아웃 판정 결과
    compact: false,        // 휴대폰 가로 (넓은 화면 배치 + 요약 카드)
    drawerOpen: false,     // 로그 드로어 (넓은 화면: 지도 옆 / 좁은 화면: 바텀 시트)
    pop: null,             // 열린 팝업: 'legend' | 'settings' | 'card' (좁은 화면 카드 시트)
    popReturn: null,       // 팝업을 닫으면 포커스를 돌려줄 버튼
    unread: 0,             // 드로어가 닫혀 있는 동안 쌓인 새 로그 수
    legendTab: 'terrain',
    pointer: 'mouse',      // 마지막 입력 종류 (이벤트마다 판단: 'mouse' | 'touch')
    touchArm: -1,          // 터치: 한 번 탭해서 명중률 배지를 띄운 공격 대상 칸
    balloonTimer: 0,
    useCurtain: true,      // 2인 대전 화면 가림막
    manualDeploy: true,    // 직접 배치로 시작
    endArmed: false,       // 좁은 화면: 턴 종료 첫 누름 뒤 재확인 대기 (DESIGN.endArmMs 뒤 해제)
    endArmTimer: 0,
  };
  const hotseat = () => ui.mode === 'hotseat';
  let ALL_TILES = new Set(Array.from({ length: N * N }, (_, i) => i));
  /** 진영별 빈 로그 */
  const emptyLogs = () => Object.fromEntries(GAME_CONFIG.ROUND_ORDER.map((s) => [s, []]));
  ui.logs = emptyLogs();
  /** 진영의 역할 ('def' 방어 / 'att' 공격). 그림·색은 역할로 고름 */
  const ROLE = (side) => roleOf(side) || 'def';
  const DEF = () => sideByRole('def'), ATT = () => attackerSide();
  /** 시점별 시야. null 은 아무것도 보이지 않음, 'all' 은 전부 */
  function visOf(st, viewer) {
    if (viewer === 'all') return ALL_TILES;
    if (!viewer) return new Set();
    return getVisibleTiles(st, viewer);
  }
  /** 각 진영의 시야 (여러 상태의 합집합: 행동 전/후) */
  function visMapOf(...states) {
    const m = {};
    for (const s of GAME_CONFIG.ROUND_ORDER) {
      const set = new Set();
      for (const st of states) for (const i of getVisibleTiles(st, s)) set.add(i);
      m[s] = set;
    }
    return m;
  }
  /** 로그를 받는 진영: AI 모드는 플레이어 진영만 */
  const logSides = () => (hotseat() ? GAME_CONFIG.ROUND_ORDER : [PLAYER]);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const $ = (s) => document.querySelector(s);
  const boardEl = $('#board');
  const boardWrapEl = $('#board-wrap'), bannerEl = $('#banner'), diceEl = $('#dice');   // 가림막 동안 문서에서 떼어 내므로 참조를 보관
  const cells = [];   // { el, dyn }
  let hlUnder, hlOver, hlHover, fxLayer;
  const P = (p) => `(${p.r},${p.c})`;
  const speedMul = () => DESIGN.fx.speed[ui.speed] || 1;
  const wait = (ms) => new Promise((res) => setTimeout(res, ms * speedMul()));
  const rawWait = (ms) => new Promise((res) => setTimeout(res, ms));

  /* ---------- 다국어 도우미 ---------- */
  // 구조화된 메시지: { k: 문자열 키, p: 파라미터, cls }. 파라미터 안의 { t, p } 는 표시할 때 현재 언어로 번역
  const S = (side) => ({ t: sideNameKey(side) });
  const U = (type) => ({ t: GAME_CONFIG.UNIT_TYPES[type] ? GAME_CONFIG.UNIT_TYPES[type].nameKey : 'unit.' + type });
  const TR = (key) => ({ t: terrainNameKey(key) });
  const objInfo = (id) => GAME_CONFIG.OBJECTIVES.find((o) => o.id === id) || {};
  const OB = (id) => ({ t: objInfo(id).nameKey || 'obj.' + id });
  const OBS = (id) => ({ t: objInfo(id).shortNameKey || 'obj.' + id + '.short' });
  /** 역할 자리표시자 {def}/{att} (문자열 표 공통) */
  const SP = () => ({ def: S(DEF()), att: S(ATT()) });
  /** 좁은 HUD 용 짧은 진영 이름 (없으면 보통 이름) */
  const SS = (side) => { const k = sideNameKey(side) + '.short'; return { t: STRINGS.ko[k] != null ? k : sideNameKey(side) }; };
  const WHO = (side, type) => ({ t: 'who.full', p: { side: S(side), unit: U(type) } });
  const REL = (mine, type) => ({ t: mine ? 'who.ally' : 'who.enemy', p: { unit: U(type) } });
  const M = (k, p, cls = '') => ({ k, p, cls });
  const tr = (m) => (m ? t(m.k, m.p) : '');
  const typeName = (ty) => t(U(ty).t);
  const terName = (ter) => t(terrainNameKey(ter));
  const whoName = (side, type) => t('who.full', { side: S(side), unit: U(type) });
  const reasonParams = (code) => {
    if (code === 'objectives') return { n: holdCount() };
    const sv = surviveSide() && victoryCond(surviveSide(), 'surviveRounds');
    return { n: sv ? sv.rounds : GAME_CONFIG.MAX_ROUNDS };
  };
  const REASON = (code) => ({ t: 'reason.' + code, p: reasonParams(code) });
  /** 화면 낭독기 알림 (aria-live) */
  function announce(text) { const el = $('#live'); el.textContent = ''; setTimeout(() => { el.textContent = text; }, 30); }

  /* =====================================================================
     지도 그리기 (인라인 SVG, viewBox 0 0 40 40 = 한 칸)
     ===================================================================== */
  /** 지형 심볼: 색이 아니라 모양으로 구분 */
  function terrainSvgInner(key, r, c) {
    const T = DESIGN.terrain[key];
    let g = `<rect width="40" height="40" fill="${T.bg}"/>`;
    switch (key) {
      case 'plain':
        if ((r * 7 + c * 3) % 5 === 0) g += `<path d="M15 27l2-5M19.5 27v-6M24 27l-2-5" stroke="${T.mark}" stroke-width="1.2" stroke-linecap="round" fill="none"/>`;
        break;
      case 'forest':
        for (const [x, y] of [[11, 11], [22, 8.5], [31, 14], [12, 24], [23, 22], [31, 30]]) {
          g += `<circle cx="${x}" cy="${y}" r="3.6" fill="${T.mark}"/><circle cx="${x - 1.1}" cy="${y - 1.1}" r="1.3" fill="${T.light}"/>`;
        }
        break;
      case 'paddy':
        for (const y of [10, 17, 24, 31]) g += `<line x1="7" y1="${y}" x2="33" y2="${y}" stroke="${T.mark}" stroke-width="1.3" stroke-linecap="round"/>`;
        break;
      case 'mountain':
        g += `<ellipse cx="20" cy="21" rx="15" ry="11" fill="none" stroke="${T.mark}" stroke-width="1.1"/>`
          + `<ellipse cx="20" cy="21" rx="10" ry="7" fill="none" stroke="${T.mark}" stroke-width="1.1"/>`
          + `<ellipse cx="20" cy="21" rx="5" ry="3.5" fill="${T.fill}" stroke="${T.mark}" stroke-width="1.1"/>`;
        break;
      case 'river':
        for (const y of [15, 27]) g += `<path d="M4 ${y}q4-4 8 0t8 0t8 0t8 0" fill="none" stroke="${T.mark}" stroke-width="1.3" stroke-linecap="round"/>`;
        break;
      case 'city':
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g += `<rect x="${8.5 + i * 8.5}" y="${8.5 + j * 8.5}" width="6" height="6" fill="${T.mark}"/>`;
        break;
      default: break;
    }
    return g;
  }
  /** 시나리오 장식 표식 (활주로 등). 규칙과 무관한 그림만 */
  function overlaySvgInner(r, c) {
    let g = '';
    for (const o of GAME_CONFIG.OVERLAYS || []) {
      if (o.kind !== 'runway' || c !== o.col || r < o.rows[0] || r > o.rows[1]) continue;
      const R = DESIGN.overlay.runway;
      const top = r === o.rows[0] ? 4 : 0, bot = r === o.rows[1] ? 36 : 40;
      g += `<rect x="${20 - R.halfW}" y="${top}" width="${2 * R.halfW}" height="${bot - top}" fill="${R.fill}"/>`
        + `<path d="M${20 - R.halfW} ${top}V${bot}M${20 + R.halfW} ${top}V${bot}" stroke="${R.edge}" stroke-width="1"/>`
        + `<line x1="20" y1="${top + 3}" x2="20" y2="${bot - 3}" stroke="${R.line}" stroke-width="${R.lineW}" stroke-dasharray="${R.dash}"/>`;
    }
    return g;
  }
  const terrainSvg = (key, r, c, cls = 'ter', ovl = false) => `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true" focusable="false">${terrainSvgInner(key, r, c)}${ovl ? overlaySvgInner(r, c) : ''}</svg>`;
  /** 시나리오 지도 미리보기 (지형 + 장식 표식만, 안개·유닛 없음). 실제 지도와 같은 렌더러 */
  function miniMapSvg(scenarioId) {
    const prev = GAME_CONFIG.SCENARIO_ID;
    if (prev !== scenarioId) loadScenario(scenarioId);
    let g = '';
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) g += `<g transform="translate(${c * CS} ${r * CS})">${terrainSvgInner(terrainAt(r, c).key, r, c)}${overlaySvgInner(r, c)}</g>`;
    const size = N * CS;
    if (prev !== scenarioId) loadScenario(prev);
    return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false" preserveAspectRatio="none">${g}</svg>`;
  }

  /** 격자선 층 (칸 테두리 대신). 4칸마다 굵게 */
  function gridLayerSvg() {
    const G = DESIGN.grid;
    let g = '';
    for (let k = 1; k < N; k++) {
      const thick = k % G.every === 0;
      const a = `stroke="${thick ? G.thick : G.thin}" stroke-width="${thick ? G.thickW : G.thinW}" vector-effect="non-scaling-stroke"`;
      g += `<line x1="${k}" y1="0" x2="${k}" y2="${N}" ${a}/><line x1="0" y1="${k}" x2="${N}" y2="${k}" ${a}/>`;
    }
    return `<svg class="grid-layer" viewBox="0 0 ${N} ${N}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${g}</svg>`;
  }

  /** 병종 기호 (틀 안, 중심 20,19). 글자 없이 모양만 */
  function typeMark(type, col) {
    const s = `stroke="${col}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
    switch (type) {
      case 'infantry': return `<path d="M12.5 13.5L27.5 24.5M12.5 24.5L27.5 13.5" ${s}/>`;
      case 'armor': return `<ellipse cx="20" cy="19" rx="7.5" ry="4.2" ${s}/>`;
      case 'artillery': return `<circle cx="20" cy="19" r="3.2" fill="${col}"/>`;
      case 'recon': return `<path d="M12.5 24.5L27.5 13.5" ${s}/>`;
      case 'signal': return `<path d="M22.5 12.5L17 19.5L23 19L17.5 26" ${s}/>`;
      case 'antitank': return `<path d="M12.5 25L20 13L27.5 25" ${s}/>`;
      case 'mortar': return `<circle cx="20" cy="23" r="2.4" fill="${col}"/><path d="M20 20.5V13.5M17 16.4L20 13.2L23 16.4" ${s}/>`;
      default: return '';
    }
  }
  /** 진영 틀: 국군 사각형 26x18, 북한군 마름모 30x26 */
  function sideFrame(side, attrs) {
    return ROLE(side) === 'def'
      ? `<rect x="7" y="10" width="26" height="18" rx="2" ${attrs}/>`
      : `<polygon points="20,6 35,19 20,32 5,19" ${attrs}/>`;
  }
  const FRAME_W = 1.8;
  /**
   * 유닛 기호 SVG. opts: { hp, selected, done, label, noHp }
   * 선택: 틀 바깥 2겹 외곽선 (안쪽 선은 맥박). 행동 완료: 기호 반투명 + 왼쪽 위 체크 표식
   */
  function unitSvg(side, type, opts = {}) {
    const D = DESIGN.side[ROLE(side)], H = DESIGN.hl;
    let body = '';
    if (opts.selected) {
      const sl = H.sel;
      body += sideFrame(side, `fill="none" stroke="${sl.outer}" stroke-width="${FRAME_W + 2 * (sl.innerW + sl.outerW)}" stroke-linejoin="round"`);
      body += `<g class="pulse-sel" style="animation-duration:${sl.pulseMs}ms">${sideFrame(side, `fill="none" stroke="${sl.inner}" stroke-width="${FRAME_W + 2 * sl.innerW}" stroke-linejoin="round"`)}</g>`;
    }
    body += sideFrame(side, `fill="${D.fill}" stroke="${D.line}" stroke-width="${FRAME_W}" stroke-linejoin="round"`);
    body += typeMark(type, D.line);
    if (!opts.noHp) {
      const max = GAME_CONFIG.MAX_HP, w = 4, h = 2.6, gap = 1.2;
      const total = max * w + (max - 1) * gap;
      const y = ROLE(side) === 'def' ? 30.5 : 33.6;
      for (let i = 0; i < max; i++) {
        body += `<rect x="${(20 - total / 2 + i * (w + gap)).toFixed(2)}" y="${y}" width="${w}" height="${h}" fill="${i < opts.hp ? D.line : '#FBF7EA'}" stroke="${D.line}" stroke-width="0.5"/>`;
      }
    }
    let g = opts.done ? `<g opacity="${H.done.opacity}">${body}</g>` : body;
    if (opts.done) {   // 틀 왼쪽 위 원형 체크
      const [cx, cy] = ROLE(side) === 'def' ? [7.5, 10] : [10, 10];
      g += `<circle cx="${cx}" cy="${cy}" r="${H.done.r}" fill="${H.done.fill}" stroke="#fff" stroke-width="1"/><path d="M${cx - 2.8} ${cy + 0.2}L${cx - 0.8} ${cy + 2.3}L${cx + 2.9} ${cy - 2}" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    const aria = opts.label ? `role="img" aria-label="${esc(opts.label)}"` : 'aria-hidden="true"';
    return `<svg viewBox="0 0 40 40" ${aria} focusable="false" overflow="visible">${g}</svg>`;
  }
  function starPoints(cx, cy, ro, ri) {
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? ri : ro;
      pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(' ');
  }
  const sideColor = (side) => (side && GAME_CONFIG.SIDES[side] ? DESIGN.side[ROLE(side)].line : DESIGN.neutral);
  /** 본부 마커: 안쪽 3px 점선 사각 + 가운데 별 */
  function hqSvg(side, label) {
    const col = sideColor(side);
    return `<svg class="mk" viewBox="0 0 40 40" role="img" aria-label="${esc(label)}"><rect x="3" y="3" width="34" height="34" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="5 3"/>`
      + `<polygon points="${starPoints(20, 20, 10, 4.4)}" fill="${col}" opacity="0.9"/></svg>`;
  }
  const flagShape = (col) => `<line x1="4.5" y1="2.5" x2="4.5" y2="11.5" stroke="${col}" stroke-width="1.3" stroke-linecap="round"/><polygon points="4.5,2.5 11.5,4.8 4.5,7.1" fill="${col}"/>`;
  /** 거점 마커: 안쪽 2px 점선 + 왼쪽 위 작은 깃발 (색 = 현재 소유 진영). noFlag: 점령 연출 중 */
  function objSvg(owner, label, noFlag = false, group = false) {
    const col = sideColor(owner);
    // group: 여러 칸 거점의 기준 칸 (칸 윤곽 대신 묶음 윤곽을 하이라이트 층에 그림, 깃발만 한 번)
    const box = group ? '' : `<rect x="2" y="2" width="36" height="36" fill="none" stroke="${col}" stroke-width="1.6" stroke-dasharray="3 3"/>`;
    return `<svg class="mk" viewBox="0 0 40 40" role="img" aria-label="${esc(label)}">${box}`
      + `${noFlag ? '' : flagShape(col)}</svg>`;
  }
  /** 여러 칸 거점의 묶음 윤곽 (공개 정보: 지형처럼 늘 보임 → 안개 위 층에 그림) */
  function objGroupSvg(st) {
    const D = DESIGN.objGroup;
    let g = '';
    for (const o of GAME_CONFIG.OBJECTIVES) {
      if (!o.cells) continue;
      const cur = st && st.objectives.find((x) => x.id === o.id);
      const set = new Set(o.cells.map((p) => idx(p.r, p.c)));
      const owner = cur && GAME_CONFIG.SIDES[cur.owner] ? cur.owner : null;
      g += rich.on ? regionSvg(set, { line: D.richLine, w: D.richW }) : regionSvg(set, { line: owner ? sideColor(owner) : D.none, w: D.w, dash: D.dash });
    }
    return g;
  }

  /* =====================================================================
     하이라이트: 같은 상태의 칸 집합 = 영역 하나. 채움 + 바깥 경계선만 그림
     ===================================================================== */
  /** 칸 집합 → { fill: 칸 사각형들, edge: 경계 변(이어지는 변은 하나로 합침) } (SVG 좌표, 한 칸 = 40) */
  function regionPaths(set) {
    let fill = '';
    const h = new Map(), v = new Map();
    const add = (m, k, x) => { if (!m.has(k)) m.set(k, []); m.get(k).push(x); };
    const has = (r, c) => inBounds(r, c) && set.has(idx(r, c));
    for (const i of set) {
      const { r, c } = posOf(i);
      fill += `M${c * CS} ${r * CS}h${CS}v${CS}h${-CS}z`;
      if (!has(r - 1, c)) add(h, r, c);
      if (!has(r + 1, c)) add(h, r + 1, c);
      if (!has(r, c - 1)) add(v, c, r);
      if (!has(r, c + 1)) add(v, c + 1, r);
    }
    let edge = '';
    const merge = (m, horiz) => {
      for (const [k, arr] of m) {
        arr.sort((a, b) => a - b);
        let s0 = arr[0], prev = arr[0];
        const flush = () => { edge += horiz ? `M${s0 * CS} ${k * CS}H${(prev + 1) * CS}` : `M${k * CS} ${s0 * CS}V${(prev + 1) * CS}`; };
        for (let j = 1; j < arr.length; j++) { if (arr[j] === prev + 1) prev = arr[j]; else { flush(); s0 = prev = arr[j]; } }
        flush();
      }
    };
    merge(h, true);
    merge(v, false);
    return { fill, edge };
  }
  /** 영역 그리기. o: { fill, hatch(패턴 id), line, w, dash } */
  function regionSvg(set, o) {
    if (!set || !set.size) return '';
    const { fill, edge } = regionPaths(set);
    let g = '';
    if (o.fill) g += `<path d="${fill}" fill="${o.fill}"/>`;
    if (o.hatch) g += `<path d="${fill}" fill="url(#${o.hatch})"/>`;
    if (o.line) g += `<path d="${edge}" fill="none" stroke="${o.line}" stroke-width="${o.w}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} stroke-linecap="${o.dash ? 'butt' : 'square'}"/>`;
    return g;
  }
  /** 이동 후 공격 구역의 45도 사선 무늬 */
  function hatchDefs(id) {
    const A = DESIGN.hl.moveAtk;
    return `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${A.period}" height="${A.period}" patternTransform="rotate(45)">`
      + `<line x1="0" y1="0" x2="0" y2="${A.period}" stroke="${A.hatch}" stroke-width="${A.hatchW}"/></pattern></defs>`;
  }
  const moveStyle = () => ({ fill: DESIGN.hl.move.fill, line: DESIGN.hl.move.line, w: DESIGN.hl.move.w });
  const moveAtkStyle = (id) => ({ hatch: id, line: DESIGN.hl.moveAtk.line, w: DESIGN.hl.moveAtk.w, dash: DESIGN.hl.moveAtk.dash });
  const artyStyle = () => ({ fill: DESIGN.hl.arty.fill, line: DESIGN.hl.arty.line, w: DESIGN.hl.arty.w, dash: DESIGN.hl.arty.dash });
  const signalStyle = (side) => {
    const Z = DESIGN.hl.signal;
    return side === 'own' || ROLE(side) === 'def' ? { fill: Z.fill, line: Z.line, w: Z.w, dash: Z.dash } : { fill: Z.att, line: Z.attLine, w: Z.w, dash: Z.dash };
  };
  /** 리치 테마의 칸 표시: 칸마다 얇은 윤곽 + 영역 바깥 경계 (평소에는 격자선이 없으므로 이때만 칸 모양이 보임) */
  function richCells(set, o) {
    if (!set || !set.size) return '';
    let cellsD = '';
    for (const i of set) { const p = posOf(i); cellsD += `M${p.c * CS + 0.5} ${p.r * CS + 0.5}h${CS - 1}v${CS - 1}h${1 - CS}z`; }
    return `<path d="${cellsD}" fill="${o.fill}" stroke="${o.cell}" stroke-width="1" vector-effect="non-scaling-stroke"/>`
      + regionSvg(set, { line: o.edge, w: o.w });
  }
  /** 공격 대상 링 (중심 = 유닛 틀 중심). 맥박은 연출 줄이기에서 정지 */
  function targetRing(cx, cy) {
    const T = DESIGN.hl.target;
    const pulse = ui.reduceMotion ? '' : `<animate attributeName="r" values="${T.r};${T.r2};${T.r}" dur="${T.pulseMs}ms" repeatCount="indefinite"/>`;
    return `<circle cx="${cx}" cy="${cy}" r="${T.r}" fill="none" stroke="${T.line}" stroke-width="${T.w}">${pulse}</circle>`;
  }
  /** 알약 배지 (명중률 70% / 시야 밖 ?) */
  function pillBadge(cx, cy, text, o = DESIGN.hl.badge, bg = o.bg, line = o.line) {
    return `<g><rect x="${cx - o.w / 2}" y="${cy - o.h / 2}" width="${o.w}" height="${o.h}" rx="${o.h / 2}" fill="${bg}" stroke="${line}" stroke-width="${o.lineW || 1}"/>`
      + `<text x="${cx}" y="${cy + 0.5}" fill="#fff" font-size="${o.font}" font-weight="800" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif">${esc(text)}</text></g>`;
  }
  /** 오폭 경고: 주황 사각 테두리 + 우상단 경고 삼각형(느낌표) */
  function ffWarning(x, y) {
    const F = DESIGN.hl.ff;
    const tx = x + 31, ty = y + 9;
    return `<rect x="${x + 1.3}" y="${y + 1.3}" width="${CS - 2.6}" height="${CS - 2.6}" fill="none" stroke="${F.line}" stroke-width="${F.w}"/>`
      + `<polygon points="${tx},${ty - 6.5} ${tx + 7},${ty + 5.5} ${tx - 7},${ty + 5.5}" fill="${F.tri}" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>`
      + `<text x="${tx}" y="${ty + 1.8}" fill="#fff" font-size="9" font-weight="900" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif">!</text>`;
  }
  const cellX = (p) => p.c * CS, cellY = (p) => p.r * CS;
  const unitCx = (p) => p.c * CS + 20, unitCy = (p) => p.r * CS + 19;

  /* =====================================================================
     PC 리치 테마: 지도 바탕은 canvas(RICH_MAP)에 한 번 그려 두고, 유닛은 이미지 SVG.
     안개 판정은 기본 테마와 같은 코드(render)를 그대로 쓰므로 시야 밖 적은 만들지 않는다.
     ===================================================================== */
  const THEME_KEY = 'chuncheon1950.theme', GRID_KEY = 'chuncheon1950.gridAlways';
  const rich = {
    on: false,
    assets: {},      // 시나리오 id → { status: 'loading'|'ok'|'fail', img }
    bgKey: '',       // 지금 캔버스에 그려진 (시나리오, 크기)
    timer: 0,
    canvas: null,
    angle: new Map(),   // 유닛 id → 그림의 임시 회전각 (기본 방향 기준, 도). 화면 전용: 엔진·저장·이벤트와 무관
    angTok: new Map(),  // 유닛 id → 진행 중인 회전 연출 번호 (새 회전이 오면 이전 것은 멈춤)
  };
  ui.themePref = (() => { try { const v = localStorage.getItem(THEME_KEY); return v === 'basic' || v === 'rich' ? v : null; } catch (e) { return null; } })();
  ui.gridAlways = (() => { try { return localStorage.getItem(GRID_KEY) === '1'; } catch (e) { return false; } })();
  const scenArt = () => { const sc = SCENARIOS.find((x) => x.id === GAME_CONFIG.SCENARIO_ID); return (sc && sc.art) || null; };
  /** 기본값: 너비 900px 이상 + 마우스 환경이면 리치. 사용자가 고르면 그 선택 */
  const autoTheme = () => (window.innerWidth >= DESIGN.layout.wideMinW && !!window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches ? 'rich' : 'basic');
  const wantTheme = () => ui.themePref || autoTheme();
  /** 리치 테마를 쓸 수 있는 화면 배치 (RICH_ON_PHONE 이 false 면 PC 넓은 화면만) */
  const RICH_ON_PHONE = true;   // 시험: 휴대폰(좁은 화면·휴대폰 가로)에서도 설정에서 고르면 리치. 기본값은 여전히 autoTheme (휴대폰은 기본)
  const richLayout = () => RICH_ON_PHONE || (ui.wide && !ui.compact);
  const artStatus = () => (rich.assets[GAME_CONFIG.SCENARIO_ID] || {}).status || null;

  /** 그림 세트 불러오기. 하나라도 실패하면 이 시나리오는 기본 테마로 */
  function loadArt(id, art) {
    rich.assets[id] = { status: 'loading', img: null };
    const files = Object.fromEntries(Object.entries(DESIGN.rich.units).map(([k, v]) => [k, v.img]));
    const list = RICH_MAP.artSources(art, files);
    const img = { terrain: {}, unit: {}, runway: null, patch: null };
    Promise.all(list.map((it) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => {
        if (it.kind === 'terrain') img.terrain[it.key] = im;
        else if (it.kind === 'unit') img.unit[it.key] = { src: it.src, w: im.naturalWidth, h: im.naturalHeight };
        else img[it.kind] = im;
        res();
      };
      im.onerror = () => {
        const U = it.kind === 'unit' && DESIGN.rich.units[it.key];
        if (U && U.optional) { res(); return; }   // 선택 그림 (박격포): 없으면 대체 그림 사용
        rej(new Error(it.src));
      };
      im.src = it.src;
    }))).then(() => {
      rich.assets[id] = { status: 'ok', img };
      if (GAME_CONFIG.SCENARIO_ID === id) applyTheme();
    }, () => {
      rich.assets[id] = { status: 'fail', img: null };
      if (GAME_CONFIG.SCENARIO_ID === id && wantTheme() === 'rich' && richLayout()) showNotice(t('theme.loadFail'));
      if (GAME_CONFIG.SCENARIO_ID === id) applyTheme();
    });
  }
  /** 지금 리치 테마로 그려야 하는가 (그림을 아직 불러오는 중이면 기본으로 보여 주고, 끝나면 전환) */
  function richWanted(startLoad = true) {
    const art = scenArt();
    if (wantTheme() !== 'rich' || !art || !richLayout()) return false;
    if (!artStatus() && startLoad) loadArt(GAME_CONFIG.SCENARIO_ID, art);
    return artStatus() === 'ok';
  }
  const richImg = () => rich.assets[GAME_CONFIG.SCENARIO_ID].img;
  function applyTheme() {
    const on = richWanted();
    const changed = on !== rich.on;
    rich.on = on;
    boardEl.classList.toggle('rich', on);
    boardEl.classList.toggle('grid-on', on && ui.gridAlways);
    if (on) paintRichBg();
    renderThemeSettings();
    if (changed && ui.state) render();
  }
  /** 지도 바탕 다시 그리기: 크기(칸 px × dpr)가 바뀔 때만 */
  function paintRichBg() {
    if (!rich.on || !rich.canvas) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const size = Math.round(N * (ui.cellSize || cellPx()) * dpr);
    const key = `${GAME_CONFIG.SCENARIO_ID}:${size}`;
    if (key === rich.bgKey || size <= 0) return;
    rich.bgKey = key;
    RICH_MAP.paint(rich.canvas, {
      n: N, size, art: scenArt(), img: richImg(), keyAt: (r, c) => terrainAt(r, c).key,
      runways: (GAME_CONFIG.OVERLAYS || []).filter((o) => o.kind === 'runway'),
      seed: [...GAME_CONFIG.SCENARIO_ID].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7),
    });
  }
  /** 화면 배치가 바뀌었을 때: 테마 판정이 달라졌으면 전환, 아니면 바탕만 (연속 변화는 0.2초 뒤 한 번) */
  function themeOnLayout() {
    if (!rich.canvas) return;
    const want = wantTheme() === 'rich' && !!scenArt() && richLayout();
    if ((want && !artStatus()) || (want && artStatus() === 'ok') !== rich.on) { applyTheme(); return; }
    renderThemeSettings();
    if (!rich.on) return;
    clearTimeout(rich.timer);
    rich.timer = setTimeout(paintRichBg, DESIGN.rich.resizeMs);
  }
  /** 상단의 작은 안내 (몇 초 뒤 사라짐) */
  function showNotice(text) {
    const el = $('#notice');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => { el.hidden = true; }, DESIGN.rich.noticeMs);
  }
  /** 유닛 그림자·어둡게 필터 (문서에 한 번만) */
  function ensureRichDefs() {
    if (document.getElementById('rich-defs')) return;
    const X = DESIGN.rich.shadow, b = DESIGN.rich.doneBright;
    const sh = `<feGaussianBlur in="SourceAlpha" stdDeviation="${X.blur * CS}"/><feOffset dx="${X.dx * CS}" dy="${X.dy * CS}" result="o"/>`
      + `<feFlood flood-color="#000" flood-opacity="${X.alpha}"/><feComposite in2="o" operator="in" result="s"/>`;
    const f = (id, dim) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${sh}`
      + (dim ? `<feComponentTransfer in="SourceGraphic" result="g"><feFuncR type="linear" slope="${b}"/><feFuncG type="linear" slope="${b}"/><feFuncB type="linear" slope="${b}"/></feComponentTransfer>` : '')
      + `<feMerge><feMergeNode in="s"/><feMergeNode in="${dim ? 'g' : 'SourceGraphic'}"/></feMerge></filter>`;
    document.body.insertAdjacentHTML('beforeend', `<svg id="rich-defs" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true" focusable="false"><defs>${f('rich-shadow', false)}${f('rich-shadow-dim', true)}</defs></svg>`);
  }
  /**
   * 리치 유닛: { body: 링 + 그림자 + 그림 (그림 층), top: 배지·체력·완료 표시 (맨 위 층) }. 한 칸 = 40 좌표, 중심 (20,20)
   * 공격 측은 그림만 180도 회전 (그림자 필터는 회전 바깥에 걸어 방향이 같음)
   */
  function richUnitParts(side, type, opts = {}) {
    const D = DESIGN.side[ROLE(side)], RU = DESIGN.rich;
    let U = RU.units[type] || RU.units.infantry;
    let im = richImg().unit[type];
    if (!im && U.fallback && richImg().unit[U.fallback]) {   // 전용 그림이 없음 → 대체 병종 그림을 줄여서
      const F = RU.units[U.fallback];
      im = richImg().unit[U.fallback];
      U = { ...F, size: F.size * U.fallbackScale, ring: U.ring };
    }
    if (!im) im = richImg().unit.infantry;
    const ar = im.w / im.h;
    const w = U.by === 'h' ? U.size * CS * ar : U.size * CS, h = U.by === 'h' ? U.size * CS : U.size * CS / ar;
    const R = U.ring * CS;
    let body = `<circle cx="20" cy="20" r="${R}" fill="${D.line}" fill-opacity="${RU.ringFill}" stroke="${D.line}" stroke-width="${RU.ringW}" vector-effect="non-scaling-stroke"/>`;
    if (opts.selected) body += `<circle class="pulse-sel" style="animation-duration:${DESIGN.hl.sel.pulseMs}ms" cx="20" cy="20" r="${R}" fill="${D.line}" fill-opacity="0.16" stroke="${RU.selLine}" stroke-width="${RU.selW}" vector-effect="non-scaling-stroke"/>`;
    const deg = (ROLE(side) === 'att' ? 180 : 0) + (opts.angle || 0);   // 공격 측은 180도 + 임시 회전각
    const rot = deg ? ` transform="rotate(${+deg.toFixed(2)} 20 20)"` : '';
    body += `<g filter="url(#${opts.done ? 'rich-shadow-dim' : 'rich-shadow'})"><image href="${esc(im.src)}" x="${(20 - w / 2).toFixed(2)}" y="${(20 - h / 2).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="none"${rot}/></g>`;
    const B = RU.badge, txt = t('unit.' + type + '.badge');
    const bh = B.h * CS, bw = Math.max(bh, (B.charW * [...txt].length + 2 * B.pad) * CS);
    const bx = 20 + R * B.at, by = 20 + R * B.at;
    let top = `<rect x="${(bx - bw / 2).toFixed(2)}" y="${(by - bh / 2).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" rx="${(bh * 0.25).toFixed(2)}" fill="${D.line}" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke"/>`
      + `<text x="${bx.toFixed(2)}" y="${(by + 0.3).toFixed(2)}" fill="#fff" font-size="${(B.font * CS).toFixed(2)}" font-weight="800" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif">${esc(txt)}</text>`;
    if (!opts.noHp) {   // 체력: 기본 테마와 같은 칸 아래쪽 막대
      const max = GAME_CONFIG.MAX_HP, pw = 4, ph = 2.6, gap = 1.2, total = max * pw + (max - 1) * gap;
      for (let i = 0; i < max; i++) {
        top += `<rect x="${(20 - total / 2 + i * (pw + gap)).toFixed(2)}" y="33.6" width="${pw}" height="${ph}" fill="${i < opts.hp ? D.line : '#FBF7EA'}" stroke="#111" stroke-width="0.6"/>`;
      }
    }
    if (opts.done) {   // 왼쪽 위 원형 체크 (기본 테마와 같은 표시)
      const H = DESIGN.hl.done, cx = (20 - R * 0.62).toFixed(2), cy = (20 - R * 0.62).toFixed(2);
      top += `<circle cx="${cx}" cy="${cy}" r="${H.r}" fill="${H.fill}" stroke="#fff" stroke-width="1"/><path d="M${cx - 2.8} ${+cy + 0.2}L${cx - 0.8} ${+cy + 2.3}L${+cx + 2.9} ${cy - 2}" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return { body, top };
  }
  const richSvg = (inner, aria = 'aria-hidden="true"') => `<svg viewBox="0 0 40 40" ${aria} focusable="false" overflow="visible">${inner}</svg>`;
  /** 연출 층 유닛 (이동·등장·파괴) */
  function fxUnitHtml(side, type, hp) {
    if (!rich.on) return unitSvg(side, type, { hp });
    const p = richUnitParts(side, type, { hp });
    return richSvg(p.body) + richSvg(p.top);
  }
  function fxUnitEl(cs) {
    const el = document.createElement('div');
    el.className = rich.on ? 'fx-unit rich' : 'fx-unit';
    el.style.width = el.style.height = cs + 'px';
    return el;
  }

  /* ---------- 공격할 때 방향 전환 (리치 전용, 연출만) ----------
     그림 <image> 의 rotate 만 바꾼다. 그림자 필터는 그 바깥 <g> 에 걸려 있어 그림 모양을 따라 돌지만
     오프셋은 회전하지 않음 (항상 오른쪽 아래). 링·배지·체력은 다른 요소라 돌지 않음 */
  const normDeg = (a) => ((a % 360) + 540) % 360 - 180;   // (-180, 180]
  /** 공격자 칸 중심 → 대상 칸 중심 방향을 기본 방향(방어 측 위, 공격 측 아래) 기준 회전각으로. 보병·대전차는 ±60도 */
  function faceAngle(side, type, from, to) {
    const abs = Math.atan2(to.c - from.c, -(to.r - from.r)) * 180 / Math.PI;   // 위 = 0, 시계 방향 +
    let a = normDeg(abs - (ROLE(side) === 'att' ? 180 : 0));
    const lim = DESIGN.rich.face.limit[type];
    if (lim != null) a = Math.max(-lim, Math.min(lim, a));
    return a;
  }
  /** 화면에 있는 그 유닛 그림에 회전각 적용 (현재 화면 상태에서 위치를 찾음. 없으면 값만 기록) */
  function applyUnitAngle(id, a) {
    if (a) rich.angle.set(id, a); else rich.angle.delete(id);
    const u = ui.view && getUnit(ui.view, id);
    if (!u || !rich.on) return;
    const im = cells[idx(u.r, u.c)].dyn.querySelector('.unit image');
    if (!im) return;
    const deg = (ROLE(u.side) === 'att' ? 180 : 0) + a;
    if (deg) im.setAttribute('transform', `rotate(${+deg.toFixed(2)} 20 20)`); else im.removeAttribute('transform');
  }
  /** 지금 각도에서 목표 각도로 (짧은 쪽으로) 돌림. 같은 유닛의 새 회전이 시작되면 이전 회전은 그 자리에서 멈춤 */
  function turnUnit(id, to, ms) {
    const from = rich.angle.get(id) || 0, d = normDeg(to - from);
    const my = (rich.angTok.get(id) || 0) + 1;
    rich.angTok.set(id, my);
    if (!d) return Promise.resolve();
    return tween(ms * speedMul(), (p) => {
      if (rich.angTok.get(id) !== my) return;
      applyUnitAngle(id, from + d * (p * p * (3 - 2 * p)));
    });
  }
  /** 모든 임시 회전값을 0으로 (턴이 넘어갈 때·연출 정리) */
  function resetAngles() {
    for (const id of [...rich.angle.keys()]) { rich.angTok.set(id, (rich.angTok.get(id) || 0) + 1); applyUnitAngle(id, 0); }
    rich.angle.clear();
  }

  /* ---------- 보드 생성 ---------- */
  function buildBoard() {
    const cl = $('#col-labels'), rl = $('#row-labels');
    cl.innerHTML = ''; rl.innerHTML = '';
    boardEl.innerHTML = '';
    cells.length = 0;
    VB = N * CS;
    ALL_TILES = new Set(Array.from({ length: N * N }, (_, i) => i));
    document.documentElement.style.setProperty('--n', String(N));
    // 리치 테마 지도 바탕 (장식 전용, 맨 아래 층). 기본 테마에서는 CSS 로 숨김
    rich.canvas = document.createElement('canvas');
    rich.canvas.className = 'rich-bg';
    rich.canvas.setAttribute('aria-hidden', 'true');
    rich.bgKey = '';
    boardEl.appendChild(rich.canvas);
    ensureRichDefs();
    for (let i = 0; i < N; i++) {
      cl.insertAdjacentHTML('beforeend', `<span>${i}</span>`);
      rl.insertAdjacentHTML('beforeend', `<span>${i}</span>`);
    }
    for (let i = 0; i < N * N; i++) {
      const { r, c } = posOf(i);
      const el = document.createElement('div');
      el.className = 'cell';
      el.innerHTML = terrainSvg(terrainAt(r, c).key, r, c, 'ter', true) + '<div class="dyn"></div>';   // 지형(+장식 표식)은 시야와 무관하게 항상 그림
      // Pointer Events: 터치와 마우스를 이벤트마다 구분 (하이브리드 기기). 호버는 마우스(펜)일 때만
      el.addEventListener('pointerdown', (e) => { ui.pointer = e.pointerType === 'touch' ? 'touch' : 'mouse'; });
      el.addEventListener('click', () => onCellClick(i));
      el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { ui.pointer = 'mouse'; onCellHover(i); } });
      el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') onCellLeave(i); });
      boardEl.appendChild(el);
      cells.push({ el, dyn: el.lastChild });
    }
    const layer = (cls) => `<svg class="hl-layer ${cls}" viewBox="0 0 ${VB} ${VB}" preserveAspectRatio="none" aria-hidden="true" focusable="false"></svg>`;
    boardEl.insertAdjacentHTML('beforeend', gridLayerSvg() + layer('hl-under') + layer('hl-over') + layer('hl-hover') + '<div class="fx-layer"></div>');
    hlUnder = boardEl.querySelector('.hl-under');
    hlOver = boardEl.querySelector('.hl-over');
    hlHover = boardEl.querySelector('.hl-hover');
    fxLayer = boardEl.querySelector('.fx-layer');
  }
  boardEl.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    ui.mouse = { x: e.clientX, y: e.clientY };
    if ($('#tooltip').style.display === 'block') placeTip();
  });

  /* ---------- 렌더링 ---------- */
  function unitHtml(u, selected) {
    const done = u.side === ui.view.turn && u.acted;
    // 행동 한도 소진: 화면을 보는 진영 자신의 턴, 자기 유닛만 (상대 진영의 소모 현황은 표시하지 않음)
    const spent = !done && u.side === ui.viewer && ui.view.turn === ui.viewer && activationBlocked(ui.view, u);
    let label = t('aria.unit', { side: S(u.side), unit: U(u.type), hp: u.hp, max: GAME_CONFIG.MAX_HP });
    if (done) label += ', ' + t('aria.done');
    else if (spent) label += ', ' + t('aria.actSpent');
    // 쿨다운: 화면을 보는 진영 자신의 유닛만 (상대 유닛의 사격 대기는 표시하지 않음)
    const cool = ui.viewer && ui.viewer !== 'all' && u.side === ui.viewer ? cooldownTurnsLeft(ui.view, u) : 0;
    if (cool) label += ', ' + t('aria.cooldown', { n: cool });
    const coolHtml = cool ? `<div class="cool-badge" aria-hidden="true"><span>${esc(t('cool.badge', { n: cool }))}</span></div>` : '';
    if (rich.on) {   // 그림 층 + 맨 위 층(배지·체력·완료): 아래 칸 유닛 그림이 위 칸 배지를 덮지 않게
      const p = richUnitParts(u.side, u.type, { hp: u.hp, selected, done, angle: rich.angle.get(u.id) || 0 });
      return `<div class="unit ${u.side} rich${spent ? ' act-spent' : ''}">${richSvg(p.body, `role="img" aria-label="${esc(label)}"`)}</div><div class="unit-top">${richSvg(p.top)}</div>${coolHtml}`;
    }
    return `<div class="unit ${u.side}${spent ? ' act-spent' : ''}">${unitSvg(u.side, u.type, { hp: u.hp, selected, done, label })}</div>${coolHtml}`;
  }

  /** 본부·거점 표식 (공개 정보) */
  function markersHtml(st, r, c) {
    let html = '';
    for (const side of GAME_CONFIG.ROUND_ORDER) {
      const hq = GAME_CONFIG.HQ[side];
      if (hq && hq.r === r && hq.c === c) html += hqSvg(side, t('aria.hq', { side: S(side) }));
    }
    const obj = objectiveAt(st, r, c);
    // 여러 칸 거점은 기준 칸(첫 칸)에만 표식 하나
    if (obj && (!objInfo(obj.id).cells || (obj.r === r && obj.c === c))) {
      const owner = GAME_CONFIG.SIDES[obj.owner] ? S(obj.owner) : { t: 'aria.neutral' };
      html += objSvg(obj.owner, t('aria.obj', { name: OB(obj.id), side: owner }), ui.anim.hideFlag === obj.id, !!objInfo(obj.id).cells);
    }
    return html;
  }

  /* ---------- 통신 범위 ---------- */
  const SIGNAL_ZONE_KEY = 'chuncheon1950.showSignalZone';
  ui.showSignal = (() => { try { return localStorage.getItem(SIGNAL_ZONE_KEY) !== '0'; } catch (e) { return true; } })();
  /** 통신 유닛들의 보너스 범위 (signalRange 맨해튼 거리, 통신 칸 자신 제외) → 진영별 칸 집합 */
  function signalZoneSets(st, signals) {
    const R = GAME_CONFIG.COMBAT.signalRange;
    const out = Object.fromEntries(GAME_CONFIG.ROUND_ORDER.map((s) => [s, new Set()]));
    for (const u of signals) {
      for (let dr = -R; dr <= R; dr++) {
        const rem = R - Math.abs(dr);
        for (let dc = -rem; dc <= rem; dc++) {
          const r = u.r + dr, c = u.c + dc;
          if ((dr || dc) && inBounds(r, c)) out[u.side].add(idx(r, c));
        }
      }
    }
    return out;
  }
  /** 화면에 그릴 통신 유닛: 시점 진영의 통신만 ('all' 이면 양쪽). 토글이 꺼져 있으면 선택한 통신만 */
  function shownSignals(st, me, sel) {
    if (!me) return [];
    if (sel && GAME_CONFIG.UNIT_TYPES[sel.type].isSignal && !ui.showSignal) return [sel];
    if (!ui.showSignal) return [];
    return st.units.filter((u) => GAME_CONFIG.UNIT_TYPES[u.type].isSignal && (me === 'all' || u.side === me));
  }

  /** 공격 대상: 시야 안의 적 중 제자리 공격 범위 + 이동 후 공격 가능 칸에서의 공격 범위 */
  function attackTargets(st, sel, me) {
    const set = new Set();
    const ty = GAME_CONFIG.UNIT_TYPES[sel.type];
    if (!ty.canAttack) return set;
    const vis = getVisibleTiles(st, me);
    for (const i of ui.atkSet) {
      const p = posOf(i);
      const o = getUnitAt(st, p.r, p.c);
      if (o && o.side !== me && vis.has(i)) set.add(i);
    }
    if (!ty.indirect || ty.moveFire) {
      const R = fireRange(st, sel.side, sel.type);   // 간접 화력 설정이 없으면 병종 사거리
      for (const k of ui.moveAtkSet) {
        const p = posOf(k);
        for (const e of st.units) {
          if (e.side === me || !vis.has(idx(e.r, e.c))) continue;
          const d = manhattan(p, e);
          if (d >= R.min && d <= R.max) set.add(idx(e.r, e.c));
        }
      }
    }
    return set;
  }

  /** 간접 화력 사거리 영역. fires 시나리오는 진영 시야 안 칸(또렷)과 안개 속 칸(흐리게)을 나눠 그림 — 칸 구분만이고 적 유무는 드러내지 않음 */
  function fireRegionSvg(st, me) {
    if (!GAME_CONFIG.FIRES) return regionSvg(ui.atkSet, artyStyle());
    const vis = getVisibleTiles(st, me), seen = new Set(), fog = new Set();
    for (const i of ui.atkSet) (vis.has(i) ? seen : fog).add(i);
    const F = DESIGN.hl.artyFog;
    return regionSvg(fog, { fill: F.fill, line: F.line, w: F.w, dash: F.dash }) + regionSvg(seen, artyStyle());
  }
  /** 이동도 사격도 되는 칸: 이동 채움 위에 사격 사거리 윤곽만 (채움 없음) */
  function dualRegionSvg() {
    if (!ui.dualSet || !ui.dualSet.size) return '';
    const A = artyStyle();
    return regionSvg(ui.dualSet, { line: A.line, w: A.w, dash: A.dash });
  }
  /** 상태 하이라이트 층 (아래: 영역 채움·사선·윤곽 / 위: 링·배지) */
  function renderHighlights(st, me, sel, deployTargetsSet = null) {
    let under = hatchDefs('hl-hatch'), over = objGroupSvg(st);
    const zones = signalZoneSets(st, shownSignals(st, me, sel));
    for (const side of GAME_CONFIG.ROUND_ORDER) under += regionSvg(zones[side], signalStyle(side));
    if (deployTargetsSet) under += rich.on ? richCells(deployTargetsSet, DESIGN.rich.move) : regionSvg(deployTargetsSet, moveStyle());
    if (sel && rich.on) {   // 리치: 평소 격자선 없음. 선택 시 이동 칸(흰 12% + 칸 윤곽)과 공격 대상 칸(붉은 윤곽)만
      const ty = GAME_CONFIG.UNIT_TYPES[sel.type], M2 = DESIGN.rich.move, T2 = DESIGN.rich.target;
      under += richCells(ui.moveSet, M2);
      under += regionSvg(ui.moveAtkSet, moveAtkStyle('hl-hatch'));
      if (ty.indirect) under += fireRegionSvg(st, me) + dualRegionSvg();
      if (!deployTargetsSet) for (const i of attackTargets(st, sel, me)) { const p = posOf(i); over += `<rect x="${cellX(p) + 1.3}" y="${cellY(p) + 1.3}" width="${CS - 2.6}" height="${CS - 2.6}" fill="none" stroke="${T2.line}" stroke-width="${T2.w}" vector-effect="non-scaling-stroke"/>`; }
      if (ty.isSignal && sel.side === me) {
        const R = GAME_CONFIG.COMBAT.signalRange, B = DESIGN.hl.sigBadge;
        for (const a of st.units) {
          if (a.side !== me || a.id === sel.id || !GAME_CONFIG.UNIT_TYPES[a.type].canAttack || manhattan(a, sel) > R) continue;
          over += pillBadge(unitCx(a), cellY(a) + 3, `+${GAME_CONFIG.COMBAT.signalBonus}`, B, DESIGN.hl.signal.badge, '#fff');
        }
      }
    } else if (sel) {
      const ty = GAME_CONFIG.UNIT_TYPES[sel.type];
      under += regionSvg(ui.moveSet, moveStyle());
      under += regionSvg(ui.moveAtkSet, moveAtkStyle('hl-hatch'));
      if (ty.indirect) under += fireRegionSvg(st, me) + dualRegionSvg();
      if (!deployTargetsSet) for (const i of attackTargets(st, sel, me)) { const p = posOf(i); over += targetRing(unitCx(p), unitCy(p)); }
      // 통신 선택: 보너스를 받는 아군 공격 유닛 위에 +20 배지 (아군 통신만)
      if (ty.isSignal && sel.side === me) {
        const R = GAME_CONFIG.COMBAT.signalRange, B = DESIGN.hl.sigBadge;
        for (const a of st.units) {
          if (a.side !== me || a.id === sel.id || !GAME_CONFIG.UNIT_TYPES[a.type].canAttack || manhattan(a, sel) > R) continue;
          over += pillBadge(unitCx(a), cellY(a) + 3, `+${GAME_CONFIG.COMBAT.signalBonus}`, B, DESIGN.hl.signal.badge, '#fff');
        }
      }
    }
    hlUnder.innerHTML = under;
    hlOver.innerHTML = over;
  }

  /** 시작 화면 배경: 지형과 본부·거점 표식만 (안개·유닛 없음) */
  function renderStartBg() {
    const st = ui.state;
    for (let i = 0; i < N * N; i++) {
      const { r, c } = posOf(i);
      cells[i].el.className = 'cell';
      cells[i].dyn.innerHTML = markersHtml(st, r, c);
    }
    hlUnder.innerHTML = ''; hlOver.innerHTML = objGroupSvg(st);
    clearHover();
  }

  function render() {
    if (ui.screen === 'start') { renderStartBg(); return; }
    if (ui.deploy) { renderDeploy(); return; }
    const st = ui.view;
    const me = ui.viewer;
    const vis = visOf(st, me);
    const playerTurn = playerCanAct();
    const sel = playerTurn && ui.selectedId ? getUnit(st, ui.selectedId) : null;
    ui.moveSet = new Set();
    ui.atkSet = new Set();
    ui.dualSet = new Set();      // 이동도 사격도 되는 칸 (박격포)
    ui.moveAtkSet = new Set();   // 이동 후에도 공격 가능한 칸 (남은 이동력 >= 공격 비용, 강 진입 칸은 남은 이동력 0 이라 제외됨)
    ui.moveLeftAt = new Map();   // 칸 → 도착 시 남은 이동력 (자기 진영이 아는 정보만으로 계산됨)
    if (sel) {
      const selT = GAME_CONFIG.UNIT_TYPES[sel.type];
      const showMoveAtk = GAME_CONFIG.ENABLE_MOVE_ATTACK && selT.canAttack && !(selT.indirect && !selT.moveFire) && !onCooldown(st, sel);
      for (const tile of getReachableTiles(st, sel.id)) {
        const k = idx(tile.r, tile.c);
        ui.moveSet.add(k);
        ui.moveLeftAt.set(k, tile.remaining);
        if (showMoveAtk && tile.remaining >= attackCost(sel.type)) ui.moveAtkSet.add(k);
      }
      for (const tile of getAttackableTiles(st, sel.id)) ui.atkSet.add(idx(tile.r, tile.c));
      // 이동 후 사격 병종(박격포): 이동도 사격도 되는 칸(최소 사거리와 이동 거리가 겹침, 안개 속 칸 포함)은 따로 모아
      // 이동 표시를 유지하고, 누르면 '이동 / 사격'을 고르게 함. 보이는 적이 있는 칸은 이동 칸이 아니므로 그대로 사격 대상
      if (selT.indirect && selT.moveFire) for (const k of ui.moveSet) if (ui.atkSet.has(k)) { ui.atkSet.delete(k); ui.dualSet.add(k); }
    }
    const indirect = sel && GAME_CONFIG.UNIT_TYPES[sel.type].indirect;

    for (let i = 0; i < N * N; i++) {
      const { r, c } = posOf(i);
      const cls = ['cell'];
      if (!vis.has(i)) cls.push('fog');   // 안개는 이미 계산된 시야로 덮개만 얹음 (지형은 그대로 보임)
      if (ui.moveSet.has(i)) cls.push('can-move');
      if (ui.atkSet.has(i)) cls.push(indirect ? 'can-fire' : 'can-attack');
      if (ui.flash.has(i) && vis.has(i)) cls.push('flash');
      const u = getUnitAt(st, r, c);
      // 시야 밖 적 유닛은 DOM 에 아예 넣지 않음 (aria-label 포함). 연출 중인 유닛은 연출 층이 대신 그림
      const shown = !!u && !!me && (me === 'all' || u.side === me || vis.has(i)) && !ui.anim.hideUnits.has(u.id);
      if (ui.actingId && shown && u.id === ui.actingId) cls.push('acting');
      if (playerTurn && shown && u.side === me && !u.acted) cls.push('clickable');
      let html = markersHtml(st, r, c);
      if (shown) html += unitHtml(u, !!sel && sel.id === u.id);
      cells[i].el.className = cls.join(' ');
      cells[i].dyn.innerHTML = html;
    }
    renderHighlights(st, me, sel);
    clearHover();
    if (ui.touchArm >= 0 && sel && (ui.atkSet.has(ui.touchArm) || ui.dualSet.has(ui.touchArm))) renderHover(ui.touchArm); else ui.touchArm = -1;
    renderHeader();
    renderPanel();
    renderTutMarks();
    renderCoach();
  }

  /* =====================================================================
     상단 HUD: 넓은 화면 한 줄 / 좁은 화면 두 줄. 공간이 모자라면 낮은 우선순위부터 숨김 (줄바꿈 없음)
     적의 남은 유닛 수는 표시하지 않음 (안개 규칙: 내 유닛 수만)
     ===================================================================== */
  const txSpan = (s) => `<span class="tx">${esc(s)}</span>`;
  const dotHtml = (side) => `<span class="dot" style="background:${sideColor(side)}"></span>`;
  /** HUD 칩 하나 채우기. html 이 null 이면 숨김 */
  function setChip(id, html, title = null, cls = 'chip') {
    const el = $('#' + id);
    if (html == null) { el.hidden = true; el.innerHTML = ''; el.removeAttribute('title'); return; }
    el.hidden = false;
    el.className = cls;
    el.innerHTML = html;
    if (title) el.title = title; else el.removeAttribute('title');
  }
  // 숨기는 순서: 내 유닛 수 → 시나리오 이름 → 거점 이름 → 증원 예정을 짧게 → 거점 소유 글자(색 점은 남음) → 증원 예정
  const HUD_LEVELS = ['hide-units', 'hide-title', 'hide-objname', 'short-reinf', 'hide-owner', 'hide-reinf'];
  function fitHud() {
    const hud = $('#hud');
    hud.classList.remove(...HUD_LEVELS);
    const rows = ui.wide ? [hud] : [$('#hud-r1'), $('#hud-r2')];
    hud.classList.add('measuring');
    const over = () => rows.some((r) => r.scrollWidth > r.clientWidth + 1);
    for (let k = 0; k < HUD_LEVELS.length && over(); k++) hud.classList.add(HUD_LEVELS[k]);
    hud.classList.remove('measuring');   // 그래도 넘치면 현재 턴 칩이 말줄임으로 줄어듦
  }

  function renderHeader() {
    const st = ui.view;
    const me = ui.viewer;
    const W = ui.wide;
    if (ui.screen === 'start' || ui.screen === 'curtain' || !me || !st) {   // 가림막·빈 화면: 게임 정보 없음
      for (const id of ['hud-round', 'hud-turn', 'hud-act', 'hud-goal', 'hud-units', 'hud-reinf']) setChip(id, null);
      $('#hud-objs').innerHTML = '';
      return;
    }
    if (ui.deploy) { renderDeployHud(); fitHud(); return; }
    const max = GAME_CONFIG.MAX_ROUNDS;
    const roundFull = t('hud.round', { n: st.round, max });
    setChip('hud-round', txSpan(W ? roundFull : t('hud.roundShort', { n: st.round, max })), roundFull);
    let turn;
    if (st.winner) turn = t('hdr.gameOver');
    else if (!hotseat()) turn = t(st.turn === AI_SIDE ? 'hdr.turnAI' : 'hdr.turnPlayer', { side: S(st.turn) });
    else turn = t('hdr.turnHotseat', { side: S(st.turn) });
    setChip('hud-turn', (st.winner ? '' : dotHtml(st.turn)) + txSpan(turn), turn, 'chip ' + (st.winner ? 'gray' : 'blue'));
    // 행동 n/N: 지금 턴을 하는 진영이 화면을 보는 진영일 때만 (상대 진영의 소모 횟수는 어디에도 없음)
    const act = me !== 'all' && !st.winner ? activationStatus(st, me) : null;
    if (act) {
      const ap = { left: act.left, limit: act.limit };
      setChip('hud-act', txSpan(t('hud.act', ap)), t('hud.actTip', ap), 'chip ' + (act.left ? '' : 'orange'));
    } else setChip('hud-act', null);
    // 거점 칩: 색 점 = 소유 진영 (지도 마커와 같은 색). 2인 대전은 현재 플레이어 기준 (아군/적)
    const rel = hotseat() && me !== 'all';
    $('#hud-objs').innerHTML = st.objectives.map((o) => {
      const owner = !GAME_CONFIG.SIDES[o.owner] ? t('aria.neutral') : rel ? t(o.owner === me ? 'hud.ownAlly' : 'hud.ownEnemy') : t(W ? sideNameKey(o.owner) : SS(o.owner).t);
      const name = t(W ? OB(o.id).t : OBS(o.id).t);
      const full = `${t('hud.objName', { name: OB(o.id) })} ${owner} (${o.r},${o.c})`;
      return `<span class="chip" title="${esc(full)}" aria-label="${esc(full)}">${dotHtml(o.owner)}<span class="obj-name">${esc(t('hud.objName', { name }))}</span><span class="obj-own">${esc(owner)}</span></span>`;
    }).join('');
    // 목표 칩: 거점 승리 조건(holdObjectives)이 있는 시나리오만
    const WS = holdSide();
    const symGoal = roundLimitType() === 'roundLimitScore';   // 양쪽 같은 라운드 제한 판정 (대칭 시나리오): 자기 점유 수
    if (st.score) {
      // 점수제: 총점은 공개 정보 (양쪽 합계만). 화면을 보는 진영을 먼저 (종료 후 전체 공개·관전은 플레이어 진영)
      const a = me === 'all' || !GAME_CONFIG.SIDES[me] ? PLAYER : me, b = enemyOf(a);
      const left = st.winner ? null : GAME_CONFIG.MAX_ROUNDS - st.round + 1;
      const sp = { a: S(a), b: S(b), sa: st.score[a], sb: st.score[b] };
      const full = t('hud.score', sp) + (left ? ' · ' + t('hud.roundsLeft', { n: left }) : '');
      const short = `${dotHtml(a)}<span class="sc">${st.score[a]}</span><span class="sc-sep">:</span>${dotHtml(b)}<span class="sc">${st.score[b]}</span>`
        + (left ? txSpan(' · ' + t('hud.roundsLeftShort', { n: left })) : '');
      const wide = txSpan(t('hud.scoreLbl')) + ` ${dotHtml(a)}${txSpan(t('hud.scoreSide', { side: S(a), n: st.score[a] }))}<span class="sc-sep">:</span>${dotHtml(b)}${txSpan(t('hud.scoreSide', { side: S(b), n: st.score[b] }))}`
        + (left ? txSpan(' · ' + t('hud.roundsLeft', { n: left })) : '');
      setChip('hud-goal', W ? wide : short, full, 'chip score-chip');
      $('#hud-goal').setAttribute('aria-label', full);
    } else if (symGoal) {
      // 화면을 보는 진영 자신의 점유 수만 (종료 후 전체 공개·AI 모드 관전 시에는 플레이어 진영)
      const own = me === 'all' ? (hotseat() ? null : PLAYER) : me;
      if (own) {
        const gp = { have: st.objectives.filter((o) => o.owner === own).length, total: st.objectives.length };
        const full = t('hud.goalSym', gp);
        setChip('hud-goal', txSpan(W ? full : t('hud.goalSymShort', gp)), full, 'chip orange');
      } else setChip('hud-goal', null);
    } else if (WS) {
      const have = st.objectives.filter((o) => o.owner === WS).length, need = holdCount();
      const attackerView = hotseat() && me === WS;
      const gp = { att: S(WS), have, need };
      const goalFull = t(attackerView ? 'hud.goalAttack' : 'hdr.northNeed', gp);
      setChip('hud-goal', txSpan(W ? goalFull : t(attackerView ? 'hud.goalAttackShort' : 'hud.goalShort', { ...gp, att: SS(WS) })), goalFull, 'chip orange');
    } else setChip('hud-goal', null);
    const mine = me === 'all' ? (hotseat() ? null : PLAYER) : me;
    if (mine) setChip('hud-units', txSpan(t('hud.myUnits', { n: st.units.filter((u) => u.side === mine).length })));
    else setChip('hud-units', null);
    // 증원 도착 예정: 지금 화면을 보는 진영 자신의 것만 (상대 일정은 어디에도 표시하지 않음). 종료 후 전체 공개 시에도 숨김
    const next = me !== 'all' && !st.winner ? pendingArrivals(st, me)[0] : null;
    if (next) {
      const full = t('hud.reinf', { n: next.round, count: next.count });
      const short = t('hud.reinfShort', { n: next.round, count: next.count });
      setChip('hud-reinf', `<span class="tx rf-full">${esc(W ? full : short)}</span><span class="tx rf-short">${esc(short)}</span>`, full, 'chip green');
    } else setChip('hud-reinf', null);
    fitHud();
  }

  /* =====================================================================
     유닛 카드: 헤더 → HP → 이동력 → 지형 → 통신 → 스탯 5칸 → 버튼
     적 유닛은 지금 화면에서 이미 보이는 정보만 (위치·지형·HP·병종 기본값)
     ===================================================================== */
  const pipsHtml = (hp, side) => `<span class="pips" style="color:${ROLE(side) === 'def' ? 'var(--def-text)' : 'var(--att-text)'}" aria-hidden="true">${Array.from({ length: GAME_CONFIG.MAX_HP }, (_, k) => `<i class="${k < hp ? 'on' : ''}"></i>`).join('')}</span>`;
  const nameColor = (side) => (ROLE(side) === 'def' ? 'var(--def-text)' : 'var(--att-text)');
  const symHtml = (side, type) => `<span class="uc-sym" aria-hidden="true">${unitSvg(side, type, { noHp: true })}</span>`;
  /** 방어 보정 = 이 칸에 선 유닛을 노리는 공격의 명중률 보정의 반대 부호 (도심 -20% → 방어 +20) */
  const defModText = (ter) => { const d = -ter.hitMod; return d ? `${d > 0 ? '+' : ''}${d}` : '0'; };
  const rangeText = (ty, u = null) => {
    if (!ty.canAttack) return t('stat.rangeNone');
    const R = u ? fireRange(ui.view, u.side, u.type) : { min: ty.rangeMin, max: ty.rangeMax };   // 간접 화력 설정 반영 (공개 값)
    return R.min === R.max ? `${R.max}` : `${R.min}~${R.max}`;
  };

  /** 카드에 보여 줄 유닛: 선택한 내 유닛, 또는 지금 보이는 유닛 (시야 밖은 null) */
  function cardUnit() {
    const st = ui.view, me = ui.viewer;
    if (!st || !me || ui.deploy) return { u: null, sel: null };
    const sel = ui.selectedId && st.turn === me ? getUnit(st, ui.selectedId) : null;
    let inspect = ui.inspectId ? getUnit(st, ui.inspectId) : null;
    if (inspect && me !== 'all' && inspect.side !== me && !visOf(st, me).has(idx(inspect.r, inspect.c))) inspect = null;
    return { u: sel || inspect, sel };
  }

  /** 상태 칩과 안내 문장 (기존 상태 문구 재사용) */
  function unitStatus(u, sel) {
    const me = ui.viewer;
    if (u.side !== me || !sel) return { chip: { text: t(u.side === me ? 'card.ally' : 'card.enemy'), cls: u.side === me ? 'chip' : 'chip red' }, note: '' };
    const ty = GAME_CONFIG.UNIT_TYPES[u.type];
    const MA = GAME_CONFIG.ENABLE_MOVE_ATTACK;
    let note, chip;
    const cool = !u.acted && cooldownTurnsLeft(ui.view, u);
    if (!u.acted && activationBlocked(ui.view, u)) {
      chip = { text: t('card.actSpent'), cls: 'chip orange' };
      note = t('status.actSpentNote');
    } else if (cool) {   // 간접 화력 쿨다운 (내 유닛): 이동은 가능
      chip = { text: t('card.cooldown'), cls: 'chip orange' };
      note = (cool === 1 ? t('status.coolNext') : t('status.coolN', { n: cool })) + (u.moved ? '' : t('status.coolMove'));
    } else if (u.acted) {
      chip = { text: t('status.done'), cls: 'chip gray' };
      note = ui.note && ui.note.id === u.id ? t(ui.note.reason.k, ui.note.reason.p) : '';
    } else if (u.moved && MA) {
      const reason = moveAttackBlockReason(u);
      chip = reason ? { text: t('card.moved'), cls: 'chip' } : { text: t('card.movedCan'), cls: 'chip blue' };
      note = reason ? t('status.movedBlocked', { reason: { t: reason.k, p: reason.p } }) : t('status.movedCanAttack', { left: moveLeftOf(u), cost: attackCost(u.type), pen: GAME_CONFIG.MOVE_ATTACK_PENALTY });
    } else if (u.moved) {
      chip = { text: t('card.moved'), cls: 'chip' };
      note = ((ty.indirect && !ty.moveFire) || !GAME_CONFIG.ATTACK_AFTER_MOVE) ? t('status.movedNoAttack') : t('status.movedLegacy');
    } else {
      chip = { text: t('card.ready'), cls: 'chip green' };
      if (MA && !ty.indirect && ty.canAttack) note = t('status.idleMA', { cost: attackCost(u.type) });
      else if (ty.indirect && ty.moveFire) note = t('status.idleArty', { range: rangeText(ty, u) }) + (MA ? t('status.mortarMoveFire', { cost: attackCost(u.type), pen: GAME_CONFIG.MOVE_ATTACK_PENALTY }) : '');
      else if (ty.indirect) note = t('status.idleArty', { range: rangeText(ty, u) }) + (MA ? t('status.artyNoFireAfterMove') : '');
      else note = t('status.idle');
    }
    return { chip, note };
  }

  /** 이동력 줄: 남은/최대, 공격 비용, 보조 문구 (기존 계산 attackCost·moveLeftOf 사용) */
  function moveInfo(u) {
    const ty = GAME_CONFIG.UNIT_TYPES[u.type];
    const left = u.acted ? 0 : moveLeftOf(u);
    const MA = GAME_CONFIG.ENABLE_MOVE_ATTACK && ty.canAttack && !(ty.indirect && !ty.moveFire);
    const cost = attackCost(u.type);
    let sub = '';
    if (ty.indirect && !ty.moveFire) sub = t('tip.artyMove');
    else if (!ty.canAttack) sub = t('card.noAtk');
    else if (MA && !u.acted) sub = t('card.maRange', { n: Math.max(0, left - cost) });
    return { left, max: ty.move, cost: MA ? cost : null, sub };
  }
  /** 통신 상자: 'on' | 'off' | 'na' (기존 hasSignalSupport 사용, 아군 정보만) */
  function signalState(u) {
    const ty = GAME_CONFIG.UNIT_TYPES[u.type];
    if (ty.isSignal || !ty.canAttack) return 'na';
    return hasSignalSupport(ui.view, u) ? 'on' : 'off';
  }

  function cardFullHtml(u, sel) {
    const me = ui.viewer;
    const own = u.side === me || me === 'all';
    const ty = GAME_CONFIG.UNIT_TYPES[u.type];
    const ter = terrainAt(u.r, u.c);
    const max = GAME_CONFIG.MAX_HP;
    const { chip, note } = unitStatus(u, sel);
    let h = `<div class="uc-head">${symHtml(u.side, u.type)}<div class="uc-id">
        <div class="uc-name tx" style="color:${nameColor(u.side)}">${esc(whoName(u.side, u.type))}</div>
        <div class="uc-pos tx">${esc(t('card.pos', { pos: P(u), terrain: TR(ter.key) }))}</div></div>
        <span class="${chip.cls}"><span class="tx">${esc(chip.text)}</span></span></div>`;
    if (note) h += `<div class="uc-note">${esc(note)}</div>`;
    h += `<div class="uc-row"><span class="uc-lbl">${esc(t('stat.hp'))}</span>${pipsHtml(u.hp, u.side)}<span class="uc-val">${u.hp} / ${max}</span></div>`;
    if (own && u.side === me) {
      const mv = moveInfo(u);
      h += `<div><div class="uc-row"><span class="uc-lbl">${esc(t('card.moveLbl'))}</span><span class="uc-val">${mv.left}/${mv.max}</span>`
        + (mv.cost != null ? `<span class="uc-lbl">·</span><span class="tx">${esc(t('card.cost', { n: mv.cost }))}</span>` : '') + `</div>`
        + (mv.sub ? `<div class="uc-sub tx" title="${esc(mv.sub)}">${esc(mv.sub)}</div>` : '') + `</div>`;
    }
    const actLine = actCardText(u);
    if (actLine) h += `<div class="uc-row"><span class="uc-lbl">${esc(t('card.actLbl'))}</span><span class="tx">${esc(actLine)}</span></div>`;
    h += `<div class="box tx" title="${esc(t('ter.hitMod'))} ${ter.hitMod}%">${esc(t('card.terrain', { terrain: TR(ter.key), def: defModText(ter), cost: ter.moveCost }))}</div>`;
    if (u.side === me) {
      const sg = signalState(u), n = GAME_CONFIG.COMBAT.signalBonus;
      h += `<div class="box tx ${sg === 'on' ? 'on' : ''}">${esc(t(sg === 'on' ? 'card.sigOn' : sg === 'off' ? 'card.sigOff' : 'card.sigNA', { n }))}</div>`;
    }
    const e = effectiveStats(u);
    const cell = (k, v, base) => `<div><div class="k tx">${esc(t(k))}</div><div class="v">${v}${base != null && base !== v ? `<s>${base}</s>` : ''}</div></div>`;
    h += `<div class="stat5">${cell('stat.atkSoft', e.atkSoft, ty.atkSoft)}${cell('stat.atkArmor', e.atkArmor, ty.atkArmor)}${cell('stat.def', e.def, ty.def)}${cell('stat.vision', ty.vision)}${cell('stat.range', rangeText(ty, u))}</div>`;
    return h;
  }

  /** 유닛 카드의 행동 줄: 자기 진영 유닛, 자기 턴, 한도가 있을 때만 */
  function actCardText(u) {
    const st = ui.view, me = ui.viewer;
    if (!st || u.side !== me || !activationStatus(st, me)) return '';
    if (u.acted) return t('card.actDone');
    if (hasActivated(st, u)) return t('card.actActive');
    if (activationBlocked(st, u)) return t('card.actSpent');
    return t('card.actReady');
  }

  /** 좁은 화면 한 줄 요약 카드 */
  function cardSumHtml(u) {
    const me = ui.viewer;
    if (!u) {
      const st = ui.view;
      const idle = !st || st.winner || hotseat() || st.turn !== AI_SIDE ? '' : t('hint.aiTurn');
      return `<span class="sum-main"><span class="sum-sub tx">${esc(playerCanAct() ? t('hint.pickUnitTap') : idle)}</span></span>`;
    }
    const ter = terrainAt(u.r, u.c);
    const bits = [];
    if (u.side === me) {
      const mv = moveInfo(u);
      bits.push(t('card.sumMove', { left: mv.left, max: mv.max }));
      if (mv.cost != null) bits.push(t('card.cost', { n: mv.cost }));
      bits.push(terName(ter));
      const sg = signalState(u);
      if (sg !== 'na') bits.push(t(sg === 'on' ? 'card.sumSigOn' : 'card.sumSigOff', { n: GAME_CONFIG.COMBAT.signalBonus }));
      if (!u.acted && activationBlocked(ui.view, u)) bits.unshift(t('card.actSpent'));
    } else bits.push(P(u), terName(ter));
    return `${symHtml(u.side, u.type)}<span class="sum-main"><span class="sum-top"><span class="uc-name tx" style="font-size:14px;color:${nameColor(u.side)}">${esc(whoName(u.side, u.type))}</span>${pipsHtml(u.hp, u.side)}</span>`
      + `<span class="sum-sub tx">${esc(bits.join(' · '))}</span></span><span class="chev" aria-hidden="true">▲</span>`;
  }

  function renderPanel() {
    const st = ui.view;
    const me = ui.viewer;
    const playerTurn = playerCanAct();
    const { u, sel } = cardUnit();
    const info = $('#unit-info');
    $('#card').hidden = !!ui.deploy;
    if (u) info.innerHTML = cardFullHtml(u, sel);
    else {
      const idle = !st || hotseat() || ui.state.turn !== AI_SIDE ? '' : t('hint.aiTurn');
      info.innerHTML = `<div class="card-empty">${esc(playerTurn ? t('hint.pickUnit') : (st && st.winner ? '' : idle))}</div>`;
    }
    $('#card-sum').innerHTML = cardSumHtml(u);
    $('#card-sum').disabled = !u;
    $('#card-sum').setAttribute('aria-label', u ? t('aria.expandCard', { who: whoName(u.side, u.type) }) : t('panel.unit'));
    if (!u && ui.pop === 'card') closePop(false);
    $('#btn-wait').disabled = !(playerTurn && sel && !sel.acted);
    $('#btn-deselect').disabled = !(playerTurn && sel);
    renderControls();
  }

  /** 좁은 화면: 남은 행동(행동 제한 n/N 의 n > 0)과 아직 행동할 수 있는 유닛이 있으면 턴 종료를 한 번 더 확인 */
  function endNeedsConfirm() {
    const st = ui.state, me = ui.viewer;
    if (ui.wide || ui.deploy || !st || st.winner || !me || me === 'all' || st.turn !== me) return false;
    const act = activationStatus(st, me);
    if (!act || act.left === 0) return false;   // 행동 제한이 꺼져 있거나 다 쓴 경우: 한 번에 종료
    return st.units.some((x) => x.side === me && !x.acted && !activationBlocked(st, x));
  }
  function disarmEnd(redraw = true) {
    clearTimeout(ui.endArmTimer);
    ui.endArmTimer = 0;
    if (!ui.endArmed) return;
    ui.endArmed = false;
    if (redraw) renderControls();
  }
  function armEnd() {
    ui.endArmed = true;
    clearTimeout(ui.endArmTimer);
    ui.endArmTimer = setTimeout(() => disarmEnd(), DESIGN.endArmMs);
    renderControls();
  }

  /** 턴 종료 버튼 (배치 중: 배치 완료 / 종료 후: 결과 보기) + 행동 가능 유닛 수 */
  function renderControls() {
    const st = ui.view, me = ui.viewer;
    const btn = $('#btn-end-turn');
    let label, n = null, enabled;
    if (ui.deploy) {
      const d = ui.deploy;
      const total = ui.state.units.filter((x) => x.side === d.side).length;
      label = t('btn.deployDoneGo');
      enabled = me === d.side && !ui.busy && d.placed.size === total;
    } else if (st && st.winner) {
      label = t('btn.showResult');
      enabled = ui.screen === 'game' && !$('#overlay').classList.contains('show');
    } else {
      label = t('btn.endTurn');
      enabled = playerCanAct();
      if (st && me && st.turn === me) n = st.units.filter((x) => x.side === me && !x.acted && !activationBlocked(st, x)).length;
    }
    // 행동 한도를 다 쓰면 턴 종료 버튼 강조 (연출 줄이기: 움직임 없이 테두리만)
    const act = !ui.deploy && st && !st.winner && me && me !== 'all' ? activationStatus(st, me) : null;
    btn.classList.toggle('act-out', !!act && act.left === 0 && playerCanAct());
    if (ui.endArmed && !(enabled && endNeedsConfirm())) disarmEnd(false);
    if (ui.endArmed) label = t('btn.endTurnArm');
    btn.classList.toggle('armed', ui.endArmed);
    $('#end-label').textContent = label;
    $('#end-cnt').textContent = n == null ? '' : String(n);
    $('#end-cnt').hidden = n == null;
    btn.disabled = !enabled;
    const cnt = n == null ? '' : t('act.count', { n });
    $('#act-count').textContent = cnt;
    btn.setAttribute('aria-label', cnt ? `${label} · ${cnt}` : label);
    btn.title = cnt ? `${label} · ${cnt}` : label;
  }

  /* =====================================================================
     로그: 구조화된 메시지 {k, p, cls, bar} 로 저장 → 표시할 때 현재 언어로 (언어를 바꾸면 지난 로그도 번역)
     bar: 왼쪽 색 막대 (round 라운드 시작 / def·att 진영 역할 / unk 시야 밖 원인)
     ===================================================================== */
  const LOG_MAX = 300;
  function barOf(m) {
    if (m.k === 'log.round' || m.k === 'log.turn' || m.k === 'log.victory') return 'round';
    if (m.bar) return GAME_CONFIG.SIDES[m.bar] ? ROLE(m.bar) : m.bar;
    if (GAME_CONFIG.SIDES[m.cls]) return ROLE(m.cls);
    return '';
  }
  function logDom(m) {
    const div = document.createElement('div');
    div.className = 'logline ' + (m.cls === 'bad' || m.cls === 'sys' ? m.cls : '');
    div.dataset.bar = barOf(m);
    div.textContent = tr(m);
    const log = $('#log');
    const empty = log.querySelector('.log-empty');
    if (empty) empty.remove();
    log.prepend(div);   // 최신이 위
    while (log.children.length > LOG_MAX) log.lastChild.remove();
  }
  /** 현재 시점에서 보이는 로그 목록 */
  function currentLog() {
    if (!ui.viewer || ui.screen === 'curtain') return [];
    if (ui.viewer === 'all') return hotseat() ? ui.history : ui.logs[PLAYER];
    return ui.logs[ui.viewer] || [];
  }
  /** 한 진영의 로그에 추가. 지금 화면 시점이 그 진영이면 바로 표시 */
  function pushLog(side, m) {
    if (!m || !ui.logs[side]) return;
    const list = ui.logs[side];
    list.push(m);
    if (list.length > LOG_MAX) list.shift();
    if (ui.viewer === side && ui.screen !== 'curtain') {
      logDom(m);
      if (!ui.drawerOpen) ui.unread++;
      renderLogbar();
    }
  }
  /** 모든 진영 공통 시스템 메시지 */
  function addLog(m) {
    for (const s of logSides()) pushLog(s, m);
  }
  /** 로그 드로어를 현재 시점·언어 기준으로 다시 그림 */
  function renderLog() {
    const log = $('#log');
    log.innerHTML = '';
    const list = currentLog();
    for (const m of list.slice(-LOG_MAX)) logDom(m);
    if (!list.length && ui.viewer && ui.screen !== 'curtain') log.innerHTML = `<div class="log-empty">${esc(t('log.empty'))}</div>`;
    renderLogbar();
  }
  /** 지도 아래 한 줄 로그 바: 가장 최근 이벤트 + 새 소식 N + 열림 표시 */
  function renderLogbar() {
    const list = currentLog();
    const last = list.length ? list[list.length - 1] : null;
    const bar = $('#logbar');
    const text = last ? tr(last) : '';
    $('#logbar-text').textContent = text;
    bar.title = text;
    const nb = $('#logbar-new');
    nb.hidden = ui.drawerOpen || ui.unread <= 0;
    nb.textContent = t('log.new', { n: ui.unread });
    $('#logbar-ind').textContent = ui.wide ? (ui.drawerOpen ? '◀' : '▶') : (ui.drawerOpen ? '▼' : '▲');
    const label = `${t('panel.log')} (L)${text ? ': ' + text : ''}`;
    bar.setAttribute('aria-label', label);
    bar.setAttribute('aria-expanded', String(ui.drawerOpen));
    $('#btn-log').setAttribute('aria-expanded', String(ui.drawerOpen));
  }

  /** 이벤트가 화면에서 가리키는 칸들 */
  function eventCells(ev) {
    switch (ev.type) {
      case 'move': return [ev.from, ev.to];
      case 'ambush': return [ev.at];
      case 'diceRoll': return [ev.target];
      case 'damage': case 'splashDamage': case 'destroyed': case 'captured': case 'objectiveLost': case 'arrival': return [ev.pos];
      default: return [];
    }
  }

  /**
   * 이벤트에 "누가 볼 수 있는가"를 붙임 (visibleTo, descBy[진영] = 메시지, cellsBy[진영]).
   * visMap: 진영별 시야 (행동 전/후 합집합). 전체 기록(history)에도 추가.
   */
  function annotate(events, visMap) {
    const fresh = events.filter((ev) => !ev.visibleTo);
    annotateVis(events, visMap);
    // 로그 색 막대: 사건의 진영. 시야 밖에서 온 공격과 그 피해는 'unk' (출처 불명, 주황)
    const roll = fresh.find((e) => e.type === 'diceRoll');
    const unseenSrc = (s) => !!roll && roll.side !== s && !visMap[s].has(idx(roll.from.r, roll.from.c));
    const hitTypes = ['diceRoll', 'damage', 'splashDamage', 'destroyed'];
    for (const ev of fresh) {
      for (const s of Object.keys(ev.descBy)) {
        const d = ev.descBy[s];
        if (hitTypes.includes(ev.type) && unseenSrc(s)) d.bar = 'unk';
        else if (ev.side) d.bar = ev.side;
      }
    }
    return events;
  }
  function annotateVis(events, visMap) {
    for (const ev of events) {
      if (ev.visibleTo) continue;
      ev.visibleTo = [];
      ev.descBy = {};
      ev.cellsBy = {};
      for (const s of GAME_CONFIG.ROUND_ORDER) {
        const vis = visMap[s];
        const d = describeEvent(ev, vis, s);
        if (!d) continue;
        ev.visibleTo.push(s);
        ev.descBy[s] = d;
        ev.cellsBy[s] = eventCells(ev).filter((p) => p && vis.has(idx(p.r, p.c)));
      }
      const full = describeFull(ev);
      if (full) { if (ev.side) full.bar = ev.side; ui.history.push(full); }
    }
    return events;
  }

  /** 로그용 주사위 표기 (메시지 파라미터). d10: "d10=4 / 명중 6/10", d100: "d100=43 / 명중률 60%" */
  function diceLog(ev, hideChance = false) {
    const d10 = (ev.sides || 100) === 10;
    const need = hideChance ? '?' : (d10 ? { t: 'dicelog.need10', p: { n: ev.need } } : { t: 'dicelog.need100', p: { n: ev.chance } });
    return { t: d10 ? 'dicelog.d10' : 'dicelog.d100', p: { roll: ev.roll, need, moved: ev.movedAttack ? { t: 'dicelog.moved' } : '' } };
  }
  const VERB = (ev) => ({ t: ev.indirect ? 'verb.fire' : 'verb.attack' });
  const RES = (ev) => ({ t: ev.hit ? 'res.hit' : 'res.miss' });

  /** 전체 공개용 기록 (전투 되돌아보기) */
  function describeFull(ev) {
    switch (ev.type) {
      case 'move': return M('log.move', { who: WHO(ev.side, ev.unitType), from: P(ev.from), to: P(ev.to) }, ev.side);
      case 'ambush': return M('log.ambushFull', { who: WHO(ev.side, ev.unitType), enemy: S(enemyOf(ev.side)), blocker: U(ev.blockerType), at: P(ev.at) }, ev.side);
      case 'diceRoll': return M('log.attackFull', { who: WHO(ev.side, ev.unitType), from: P(ev.from), target: P(ev.target), verb: VERB(ev), dice: diceLog(ev), res: RES(ev) }, ev.side);
      case 'damage': case 'splashDamage':
        return M('log.damage', { who: WHO(ev.side, ev.unitType), pos: P(ev.pos), n: ev.amount, splash: ev.type === 'splashDamage' ? { t: 'log.splash' } : '', hp: ev.hp }, '');
      case 'destroyed': return M('log.destroyedFull', { who: WHO(ev.side, ev.unitType), pos: P(ev.pos) }, 'bad');
      case 'scored': return ev.pts ? M('log.scoredMine', { n: ev.round, side: S(ev.side), pts: ev.pts, list: SCORE_LIST(ev.by) }, ev.side) : null;
      case 'captured': return M('log.capturedFull', { side: S(ev.side), obj: OB(ev.objectiveId), pos: P(ev.pos) }, 'sys');
      case 'objectiveLost': return M(ev.contested ? 'log.objContested' : 'log.objLost', { obj: OB(ev.objectiveId) }, 'sys');
      case 'arrival': return M('log.arrivalFull', { who: WHO(ev.side, ev.unitType), pos: P(ev.pos) }, ev.side);
      case 'roundStart': return M('log.round', { n: ev.round }, 'sys');
      case 'turnStart': return M('log.turn', { side: S(ev.side) }, 'sys');
      default: return null;   // victory 는 showResult 에서 한 번만 기록
    }
  }

  /** me 진영 시점의 메시지. 보이지 않는 정보는 null (안개 규칙) */
  function describeEvent(ev, vis, me = PLAYER) {
    const mine = ev.side === me;
    const seen = (p) => p && vis.has(idx(p.r, p.c));
    const hs = hotseat();
    switch (ev.type) {
      case 'move':
        if (mine) return M('log.move', { who: WHO(ev.side, ev.unitType), from: P(ev.from), to: P(ev.to) }, ev.side);
        if (seen(ev.to)) return M('log.enemyMove', { unit: U(ev.unitType), to: P(ev.to) }, ev.side);
        if (seen(ev.from)) return M('log.enemyVanish', { unit: U(ev.unitType) }, ev.side);
        return null;
      case 'ambush':
        if (mine) return M('log.ambushMine', { who: WHO(ev.side, ev.unitType), blocker: U(ev.blockerType), at: P(ev.at) }, 'bad');
        if (seen(ev.at)) return M('log.ambushSeen', { unit: U(ev.unitType), blocker: U(ev.blockerType), at: P(ev.at) }, ev.side);
        return null;
      case 'diceRoll': {
        if (mine) {
          // 2인 모드: 시야 밖 사격의 명중 여부는 표적 유무를 드러내므로 숨김
          if (hs && ev.fogged) return M('log.attackFogHidden', { who: WHO(ev.side, ev.unitType), target: P(ev.target), verb: VERB(ev) }, ev.side);
          return M('log.attack', { who: WHO(ev.side, ev.unitType), target: P(ev.target), verb: VERB(ev), dice: diceLog(ev, ev.fogged), res: RES(ev) }, ev.side);
        }
        if (seen(ev.target) || seen(ev.from)) {
          // 2인 모드: 공격자가 시야 밖이면 출처·명중률·주사위를 숨기고 결과만
          if (hs && !seen(ev.from)) return M('log.attackHiddenSrc', { verb: VERB(ev), target: P(ev.target), res: RES(ev) }, ev.side);
          const src = seen(ev.from) ? REL(false, ev.unitType) : { t: 'who.unknown' };
          // 공격자가 보이지 않으면 '이동 후' 표시는 빼서 시야 밖 유닛의 움직임을 알려 주지 않음
          return M('log.attack', { who: src, target: P(ev.target), verb: VERB(ev), dice: diceLog(seen(ev.from) ? ev : { ...ev, movedAttack: false }), res: RES(ev) }, ev.side);
        }
        return null;
      }
      case 'damage':
      case 'splashDamage':
        if (mine || seen(ev.pos)) {
          return M('log.damage', { who: REL(mine, ev.unitType), pos: P(ev.pos), n: ev.amount, splash: ev.type === 'splashDamage' ? { t: 'log.splash' } : '', hp: ev.hp }, mine ? 'bad' : '');
        }
        return null;
      case 'destroyed':
        if (mine || seen(ev.pos)) return M('log.destroyed', { who: REL(mine, ev.unitType), pos: P(ev.pos) }, mine ? 'bad' : 'sys');
        return null;
      case 'captured':
        if (hs && !mine && !seen(ev.pos)) return null;
        return M('log.captured', { side: S(ev.side), obj: OB(ev.objectiveId), pos: P(ev.pos) }, 'sys');
      case 'objectiveLost':
        // 점유자 변화는 거점 칩과 같은 공개 정보. 2인 모드는 점령 로그와 같게 시야 밖이면 숨김
        if (hs && !seen(ev.pos)) return null;
        return M(ev.contested ? 'log.objContested' : 'log.objLost', { obj: OB(ev.objectiveId) }, 'sys');
      case 'arrival':
        // 예약 투입: 자기 진영은 항상, 상대 진영은 등장 칸이 시야 안일 때만 (시야 밖 도착은 로그 없음)
        if (mine) return M('log.arrivalMine', { who: WHO(ev.side, ev.unitType), pos: P(ev.pos) }, ev.side);
        if (seen(ev.pos)) return M('log.arrivalSeen', { unit: U(ev.unitType), pos: P(ev.pos) }, ev.side);
        return null;
      case 'roundStart':
        return M('log.round', { n: ev.round }, 'sys');
      case 'turnStart':
        return M('log.turn', { side: S(ev.side) }, 'sys');
      case 'scored':
        // 점수판은 공개 정보: 상대는 합계만 (어느 거점에서 받았는지는 숨김)
        if (!ev.pts) return null;
        if (mine) return M('log.scoredMine', { n: ev.round, side: S(ev.side), pts: ev.pts, list: SCORE_LIST(ev.by) }, ev.side);
        return M('log.scoredEnemy', { n: ev.round, side: S(ev.side), pts: ev.pts }, ev.side);
      default:
        return null;
    }
  }
  /** 점수 내역 (거점 짧은 이름 + 점수) */
  const SCORE_LIST = (by) => Object.entries(by).map(([id, p]) => ({ t: 'log.scoreItem', p: { obj: OBS(id), n: p } }));

  /** annotate 된 이벤트를 각 진영 로그에 (그 진영이 볼 수 있는 것만) */
  function logEvents(events) {
    for (const ev of events) {
      for (const s of logSides()) if (ev.descBy && ev.descBy[s]) pushLog(s, ev.descBy[s]);
    }
  }

  /* =====================================================================
     연출 (이벤트 재생 전용. 게임 상태는 건드리지 않음)
     모든 시간은 DESIGN 값 × 속도 배율. gameId 가 바뀌면(다시 시작·처음 화면) 즉시 끝남
     ===================================================================== */
  const cellPx = () => cells[0].el.offsetWidth;
  /** 0→1 진행률로 step(p) 를 부름. 다시 시작 등으로 토큰이 바뀌면 바로 끝냄 */
  function tween(ms, step, token = ui.gameId) {
    return new Promise((res) => {
      if (ms <= 0) { step(1); res(); return; }
      const t0 = performance.now();
      const f = (now) => {
        if (token !== ui.gameId) { res(); return; }
        const p = Math.min(1, (now - t0) / ms);
        step(p);
        if (p < 1) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
  }
  const easeOut = (p) => 1 - (1 - p) * (1 - p);
  /** 연출용 임시 SVG (지도 좌표, 한 칸 = 40). 끝나면 반드시 remove */
  function fxSvg(inner = '') {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VB} ${VB}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = inner;
    fxLayer.appendChild(svg);
    return svg;
  }
  /** 연출 층 정리 (다시 시작·처음 화면·가림막) */
  function clearFx() {
    resetAngles();
    if (fxLayer) fxLayer.innerHTML = '';
    ui.anim = { hideUnits: new Set(), hideFlag: null };
    const b = bannerEl;
    b.style.opacity = '0';
    b.style.transform = 'translate(-50%, -60px)';
  }

  /**
   * 이동 연출. full = [출발, ...경로]. seen(p): 보는 사람에게 그 칸이 보이는가.
   * 시야 밖 구간은 기다리지 않고 건너뜀(경로를 드러내지 않음), 시야 밖 → 안: 첫 칸에서 서서히 나타남, 안 → 밖: 즉시 사라짐
   */
  async function animateMove({ side, type, hp, full, seen, own }) {
    const token = ui.gameId;
    const F = DESIGN.fx, rm = ui.reduceMotion, mul = speedMul();
    if (!full.some(seen)) return;   // 전혀 보이지 않는 이동은 재생하지 않음
    const cs = cellPx();
    const el = fxUnitEl(cs);
    el.innerHTML = fxUnitHtml(side, type, hp);
    // 시야 밖 구간에서는 DOM 에서 아예 빼서 위치가 남지 않게 함
    const attach = () => { if (!el.isConnected) fxLayer.appendChild(el); };
    const detach = () => el.remove();
    const place = (r, c) => { el.style.transform = `translate(${c * cs}px, ${r * cs}px)`; };
    let line = null;
    if (own && !rm && full.length > 1) {
      const pts = full.map((p) => `${p.c * CS + 20},${p.r * CS + 20}`).join(' ');
      const L = F.path;
      line = fxSvg(`<polyline points="${pts}" fill="none" stroke="${L.line}" stroke-width="${L.w}" stroke-dasharray="${L.dash}" stroke-linecap="round" stroke-linejoin="round" opacity="${L.opacity}"/>`);
    }
    let shown = seen(full[0]);
    if (shown) { place(full[0].r, full[0].c); attach(); }
    for (let k = 1; k < full.length; k++) {
      if (token !== ui.gameId) break;
      const a = full[k - 1], b = full[k];
      if (!seen(b)) { detach(); shown = false; continue; }   // 시야 밖으로 나가면 즉시 사라짐
      if (!shown) {   // 시야 안 첫 칸에서 나타남
        place(b.r, b.c);
        el.style.opacity = '0';
        attach();
        await tween(F.fadeInMs * mul, (p) => { el.style.opacity = String(p); }, token);
        shown = true;
        continue;
      }
      if (rm) { place(b.r, b.c); await rawWait(F.stepMsRM * mul); continue; }
      await tween((rich.on ? DESIGN.rich.stepMs : F.stepMs) * mul, (p) => {
        const q = rich.on ? p * p * (3 - 2 * p) : easeOut(p);
        place(a.r + (b.r - a.r) * q, a.c + (b.c - a.c) * q);
      }, token);
    }
    el.remove();
    if (line) {   // 경로 점선은 이동 뒤 0.5초에 걸쳐 사라짐 (기다리지 않음)
      const ln = line;
      tween(F.path.fadeMs * mul, (p) => { ln.style.opacity = String(1 - p); }, token).then(() => ln.remove());
    }
  }

  /** 등장할 유닛 숨겨 두기: 보는 사람이 볼 수 있는 도착만 (시야 밖 도착은 그리지 않으므로 대상 아님) */
  function holdArrivals(events) {
    const me = ui.viewer;
    const list = events.filter((e) => e.type === 'arrival' && e.descBy && e.descBy[me]);
    if (!ui.reduceMotion) for (const e of list) ui.anim.hideUnits.add(e.unitId);
    return list;
  }
  /** 숨겨 둔 도착 유닛을 첫 칸에서 서서히 나타나게 함 (기존 '시야 진입' 페이드인과 같은 시간) */
  async function playArrivals(list) {
    if (!list || !list.length) return;
    const token = ui.gameId, mul = speedMul();
    if (!ui.reduceMotion) {
      const cs = cellPx();
      await Promise.all(list.map((e) => {
        const el = fxUnitEl(cs);
        el.style.transform = `translate(${e.pos.c * cs}px, ${e.pos.r * cs}px)`;
        el.style.opacity = '0';
        el.innerHTML = fxUnitHtml(e.side, e.unitType, GAME_CONFIG.MAX_HP);
        fxLayer.appendChild(el);
        return tween(DESIGN.fx.fadeInMs * mul, (p) => { el.style.opacity = String(p); }, token).then(() => el.remove());
      }));
    }
    if (token !== ui.gameId) return;
    for (const e of list) ui.anim.hideUnits.delete(e.unitId);
    render();
  }

  /** 피격: 좌우 감쇠 흔들림 (연출 줄이기: 붉은 링 정지 표시) */
  async function shakeFx(pos) {
    const token = ui.gameId, mul = speedMul(), F = DESIGN.fx;
    if (ui.reduceMotion) {
      const R = F.hitRingRM;
      const svg = fxSvg(`<circle cx="${unitCx(pos)}" cy="${unitCy(pos)}" r="${DESIGN.hl.target.r}" fill="none" stroke="${R.line}" stroke-width="${R.w}"/>`);
      await rawWait(R.ms * mul);
      svg.remove();
      return;
    }
    const els = [...cells[idx(pos.r, pos.c)].dyn.querySelectorAll('.unit, .unit-top')];
    if (!els.length) return;
    let ring = null;
    if (rich.on) {   // 리치: 대상 링이 붉게 깜빡임
      const u = getUnitAt(ui.view, pos.r, pos.c), H2 = DESIGN.rich.hitRing;
      const rr = ((u && DESIGN.rich.units[u.type]) || DESIGN.rich.units.infantry).ring * CS;
      ring = fxSvg(`<circle cx="${cellX(pos) + 20}" cy="${cellY(pos) + 20}" r="${rr}" fill="${H2.line}" fill-opacity="0.22" stroke="${H2.line}" stroke-width="${H2.w}" vector-effect="non-scaling-stroke"/>`);
    }
    await tween(F.shake.ms * mul, (p) => {
      for (const el of els) el.style.transform = `translateX(${(F.shake.amp * Math.sin(p * Math.PI * 6) * (1 - p)).toFixed(2)}px)`;
      if (ring) ring.style.opacity = String(Math.abs(Math.cos(p * Math.PI * 2)));
    }, token);
    for (const el of els) el.style.transform = '';
    if (ring) ring.remove();
  }
  /** 피해 숫자 -N (아군 오폭은 주황) */
  async function damageNumberFx(pos, amount, friendlyFire) {
    const token = ui.gameId, mul = speedMul(), D = DESIGN.fx.dmg;
    const cx = unitCx(pos), cy = unitCy(pos) - 4;
    const svg = fxSvg(`<text x="${cx}" y="${cy}" fill="${friendlyFire ? D.ff : D.color}" stroke="#fff" stroke-width="${D.stroke}" paint-order="stroke" stroke-linejoin="round" font-size="${D.font}" font-weight="900" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif">-${amount}</text>`);
    const txt = svg.firstChild;
    if (ui.reduceMotion) { await rawWait(D.msRM * mul); svg.remove(); return; }
    await tween(D.ms * mul, (p) => {
      txt.setAttribute('y', (cy - D.rise * easeOut(p)).toFixed(2));
      txt.setAttribute('opacity', p < D.fadeFrom ? '1' : String(1 - (p - D.fadeFrom) / (1 - D.fadeFrom)));
    }, token);
    svg.remove();
  }
  /** 빗나감: 회색 × (글자 없음) */
  async function missFx(pos) {
    const token = ui.gameId, mul = speedMul(), X = DESIGN.fx.miss;
    const cx = unitCx(pos), cy = unitCy(pos), s = X.size;
    const d = `M${-s} ${-s}L${s} ${s}M${-s} ${s}L${s} ${-s}`;
    const svg = fxSvg(`<g transform="translate(${cx} ${cy})"><path d="${d}" stroke="#fff" stroke-width="${X.w + 2.4}" stroke-linecap="round"/><path d="${d}" stroke="${X.color}" stroke-width="${X.w}" stroke-linecap="round"/></g>`);
    const g = svg.firstChild;
    if (ui.reduceMotion) { await rawWait(X.ms * mul); svg.remove(); return; }
    await tween(X.ms * mul, (p) => {
      g.setAttribute('transform', `translate(${cx} ${(cy - X.rise * easeOut(p)).toFixed(2)})`);
      g.setAttribute('opacity', p < 0.6 ? '1' : String(1 - (p - 0.6) / 0.4));
    }, token);
    svg.remove();
  }
  /** 파괴: 기호가 흐려지고 연기 원 3개가 퍼짐 (연출 줄이기: 즉시 제거) */
  async function destroyFx(ev) {
    if (ui.reduceMotion) return;
    const token = ui.gameId, mul = speedMul(), X = DESIGN.fx.destroy;
    const cs = cellPx();
    const el = fxUnitEl(cs);
    el.style.transform = `translate(${ev.pos.c * cs}px, ${ev.pos.r * cs}px)`;
    el.innerHTML = fxUnitHtml(ev.side, ev.unitType, 0);
    fxLayer.appendChild(el);
    const cx = unitCx(ev.pos), cy = unitCy(ev.pos);
    const svg = fxSvg([[-7, 2], [0, -2], [7, 3]].map(([dx, dy]) => `<circle cx="${cx + dx}" cy="${cy + dy}" r="4" fill="${X.smoke}" opacity="0"/>`).join(''));
    const puffs = [...svg.children];
    await tween(X.ms * mul, (p) => {
      el.style.opacity = String(1 - p);
      puffs.forEach((c, k) => {
        c.setAttribute('cy', String(cy + [2, -2, 3][k] - 14 * p));
        c.setAttribute('r', String(4 + 7 * p));
        c.setAttribute('opacity', String(X.smokeOpacity * Math.sin(Math.PI * p)));
      });
    }, token);
    el.remove();
    svg.remove();
  }
  /** 포격 착탄: 충격 링 + 중심/인접 섬광 + 파편 (연출 줄이기: 섬광 색칠만 정지 표시) */
  async function impactFx(pos, vis, single = false) {
    const token = ui.gameId, mul = speedMul(), X0 = DESIGN.fx.impact;
    const k = single ? DESIGN.impactSmall : 1;   // 박격포(한 칸): 같은 연출을 작게, 인접 칸 번쩍임 없음
    const X = { ...X0, r1: X0.r1 * k, debris: Math.round(X0.debris * k) };
    const cx = cellX(pos) + 20, cy = cellY(pos) + 20;
    let flashes = `<rect x="${cellX(pos)}" y="${cellY(pos)}" width="${CS}" height="${CS}" fill="${X.center}"/>`;
    if (!single) for (const q of nbrs4(pos)) if (vis.has(idx(q.r, q.c))) flashes += `<rect x="${cellX(q)}" y="${cellY(q)}" width="${CS}" height="${CS}" fill="${X.side}"/>`;
    if (ui.reduceMotion) {
      const svg = fxSvg(flashes);
      await rawWait(X.msRM * mul);
      svg.remove();
      return;
    }
    let debris = '';
    for (let k = 0; k < X.debris; k++) {
      const a = (k / X.debris) * Math.PI * 2 + 0.3;
      debris += `<line data-a="${a}" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="${X.debrisColor}" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    const svg = fxSvg(`<g class="fl" opacity="0">${flashes}</g><circle cx="${cx}" cy="${cy}" r="${X.r0}" fill="none" stroke="${DESIGN.hl.impact.line}" stroke-width="${X.w0}"/>${debris}`);
    const fl = svg.querySelector('.fl'), ring = svg.querySelector('circle'), lines = [...svg.querySelectorAll('line')];
    await tween(X.ms * mul, (p) => {
      fl.setAttribute('opacity', String(p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75));
      ring.setAttribute('r', String(X.r0 + (X.r1 - X.r0) * easeOut(p)));
      ring.setAttribute('stroke-width', String(X.w0 + (X.w1 - X.w0) * p));
      ring.setAttribute('opacity', String(1 - p));
      for (const l of lines) {
        const a = +l.dataset.a, r0 = (6 + 22 * easeOut(p)) * k, r1 = r0 + 6 * k * (1 - p);
        l.setAttribute('x1', String(cx + Math.cos(a) * r0)); l.setAttribute('y1', String(cy + Math.sin(a) * r0));
        l.setAttribute('x2', String(cx + Math.cos(a) * r1)); l.setAttribute('y2', String(cy + Math.sin(a) * r1));
        l.setAttribute('opacity', String(1 - p));
      }
    }, token);
    svg.remove();
  }
  /** 거점 점령: 옛 깃발 내려감 → 새 색 깃발 올라옴 + 테두리 링 한 번 퍼짐 (연출 줄이기: 즉시 바꾸고 유지) */
  async function captureFx(ev, view) {
    const token = ui.gameId, mul = speedMul(), X = DESIGN.fx.capture;
    const x = cellX(ev.pos), y = cellY(ev.pos), newCol = sideColor(ev.side), oldCol = sideColor(ev.prevOwner);
    if (ui.reduceMotion) {
      ui.view = view; render();
      const svg = fxSvg(`<rect x="${x + 1}" y="${y + 1}" width="${CS - 2}" height="${CS - 2}" fill="none" stroke="${newCol}" stroke-width="2.4"/>`);
      await rawWait(X.holdMsRM * mul);
      svg.remove();
      return;
    }
    ui.anim.hideFlag = ev.objectiveId;
    ui.view = view; render();
    const svg = fxSvg(`<rect class="ring" x="${x + 2}" y="${y + 2}" width="${CS - 4}" height="${CS - 4}" fill="none" stroke="${newCol}" stroke-width="2"/>`
      + `<g class="old" transform="translate(${x} ${y})">${flagShape(oldCol)}</g><g class="new" transform="translate(${x} ${y + 9})" opacity="0">${flagShape(newCol)}</g>`);
    const ring = svg.querySelector('.ring'), oldF = svg.querySelector('.old'), newF = svg.querySelector('.new');
    const ringP = tween(X.ringMs * mul, (p) => {
      const g = 2 - 10 * easeOut(p);
      ring.setAttribute('x', String(x + g)); ring.setAttribute('y', String(y + g));
      ring.setAttribute('width', String(CS - 2 * g)); ring.setAttribute('height', String(CS - 2 * g));
      ring.setAttribute('opacity', String(1 - p));
    }, token);
    await tween(X.downMs * mul, (p) => { oldF.setAttribute('transform', `translate(${x} ${y + 9 * p})`); oldF.setAttribute('opacity', String(1 - p)); }, token);
    await tween(X.upMs * mul, (p) => { newF.setAttribute('transform', `translate(${x} ${y + 9 * (1 - easeOut(p))})`); newF.setAttribute('opacity', String(p)); }, token);
    await ringP;
    svg.remove();
    if (token !== ui.gameId) return;
    ui.anim.hideFlag = null;
    render();
  }

  /** 턴 전환 배너 (마지막 라운드는 주황 + 오래 머묾). 화면 낭독기에도 알림 */
  async function showBanner(side, round) {
    const token = ui.gameId, mul = speedMul(), B = DESIGN.fx.banner;
    const final = round >= GAME_CONFIG.MAX_ROUNDS;
    const text = t(final ? 'banner.final' : 'banner.turn', { side: S(side), n: round, max: GAME_CONFIG.MAX_ROUNDS });
    const el = bannerEl;
    el.textContent = text;
    el.style.background = final ? B.colors.final : B.colors[ROLE(side)];
    announce(text);
    const hold = (final ? B.finalHoldMs : B.holdMs) * mul;
    if (ui.reduceMotion) {
      el.style.transform = 'translate(-50%, 0)';
      await tween(B.fadeMsRM * mul, (p) => { el.style.opacity = String(p); }, token);
      await rawWait(hold);
      await tween(B.fadeMsRM * mul, (p) => { el.style.opacity = String(1 - p); }, token);
      return;
    }
    el.style.opacity = '1';
    await tween(B.inMs * mul, (p) => { el.style.transform = `translate(-50%, ${(-60 * (1 - easeOut(p))).toFixed(1)}px)`; }, token);
    await rawWait(hold);
    if (token !== ui.gameId) return;
    await tween(B.outMs * mul, (p) => { el.style.transform = `translate(-50%, ${(-60 * p).toFixed(1)}px)`; el.style.opacity = String(1 - p); }, token);
  }

  /** 주사위: 숫자를 돌리다 멈추고 결과 표시 (연출 줄이기: 결과만) */
  async function showDice(ev, title, hideChance, hideResult = false) {
    const box = diceEl;
    const Dz = DESIGN.dice, mul = speedMul();
    const d10 = (ev.sides || 100) === 10;
    const sides = d10 ? 10 : 100;
    const fogN = GAME_CONFIG.COMBAT.fogPenalty;
    const sub = d10
      ? (hideChance ? t('dice.subD10Fog', { n: fogN }) : t('dice.subD10', { need: ev.need, pct: ev.chance }))
      : (hideChance ? t('dice.subD100Fog', { n: fogN }) : t('dice.subD100', { pct: ev.chance }));
    box.innerHTML = `<div class="dice-title">${esc(title)}${ev.movedAttack && ev.side === ui.viewer ? esc(t('dice.movedTag')) : ''}</div><div class="dice-num">--</div>
      <div class="dice-sub">${esc(sub)}</div>
      <div class="dice-result"></div>`;
    box.classList.add('show');
    const num = box.querySelector('.dice-num');
    const res = box.querySelector('.dice-result');
    if (!ui.reduceMotion) {
      const start = performance.now();
      while (performance.now() - start < Dz.spinMs * mul) {
        num.textContent = 1 + Math.floor(Math.random() * sides);
        await rawWait(Dz.tickMs);
      }
    }
    if (hideResult) {   // 2인 모드 시야 밖 사격: 주사위는 굴리되 결과는 숨김
      num.textContent = '?';
      res.textContent = t('dice.unknownResult');
      res.className = 'dice-result miss';
    } else {
      num.textContent = ev.roll;
      res.textContent = rollLine(ev, hideChance);
      res.className = 'dice-result ' + (ev.hit ? 'hit' : 'miss');
    }
    announce(t('live.dice', { who: title, result: res.textContent }));
    await rawWait((ui.reduceMotion ? Dz.holdMsRM : Dz.holdMs) * mul);
    box.classList.remove('show');
  }

  /**
   * 공격 재생: 주사위 → 명중/빗나감(착탄) → 피격 흔들림 → 피해 숫자·파괴. pre/post = 공격 전/후 상태.
   * vis: 보는 사람의 시야. 시야 밖 칸의 결과는 재생하지 않음
   */
  async function playAttack(events, pre, post, vis) {
    const token = ui.gameId, me = ui.viewer;
    const ev = events.find((e) => e.type === 'diceRoll');
    ui.view = pre; render();
    if (!ev) { ui.view = post; render(); return; }
    const mine = ev.side === me;
    const tVis = vis.has(idx(ev.target.r, ev.target.c));
    const fVis = vis.has(idx(ev.from.r, ev.from.c));
    const faced = rich.on && !ui.reduceMotion && tVis && fVis ? ev.attackerId : null;   // 방향 전환: 예광선과 같은 조건 (보이는 공격만)
    if (rich.on && !ui.reduceMotion && tVis && fVis) {   // 리치: 공격자 → 대상 짧은 예광선 (양 끝이 모두 보일 때만)
      const X = DESIGN.rich.tracer, x1 = cellX(ev.from) + 20, y1 = cellY(ev.from) + 20, x2 = cellX(ev.target) + 20, y2 = cellY(ev.target) + 20;
      const svg = fxSvg(`<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="${X.line}" stroke-width="${X.w}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
      const ln = svg.firstChild;
      turnUnit(faced, faceAngle(ev.side, ev.unitType, ev.from, ev.target), DESIGN.rich.face.turnMs);   // 예광선과 동시에 (기다리지 않음)
      await tween(X.ms * speedMul(), (p) => {
        const a = Math.max(0, p * 1.6 - 0.6), b = Math.min(1, p * 1.6);
        ln.setAttribute('x1', String(x1 + (x2 - x1) * a)); ln.setAttribute('y1', String(y1 + (y2 - y1) * a));
        ln.setAttribute('x2', String(x1 + (x2 - x1) * b)); ln.setAttribute('y2', String(y1 + (y2 - y1) * b));
      }, token);
      svg.remove();
      if (token !== ui.gameId) return;
    }
    if (mine || tVis || fVis) {
      const who = mine ? REL(true, ev.unitType) : (fVis ? REL(false, ev.unitType) : { t: 'dice.enemyFire' });
      await showDice(ev, t('dice.title', { who, pos: P(ev.target) }), mine && ev.fogged, hotseat() && mine && ev.fogged);
      if (token !== ui.gameId) return;
    }
    if (!ev.hit) { if (tVis) await missFx(ev.target); }
    else if (ev.indirect && tVis) await impactFx(ev.target, vis, GAME_CONFIG.UNIT_TYPES[ev.unitType].splash === false);
    else if (mine && !tVis && !hotseat()) pushLog(me, M('log.hitUnknown', null, me));
    if (token !== ui.gameId) return;
    const dmg = events.filter((e) => (e.type === 'damage' || e.type === 'splashDamage') && vis.has(idx(e.pos.r, e.pos.c)));
    await Promise.all(dmg.map((e) => shakeFx(e.pos)));
    if (faced) turnUnit(faced, 0, DESIGN.rich.face.backMs);   // 공격 연출이 끝나면 원래 방향으로 (기다리지 않음)
    if (token !== ui.gameId) return;
    ui.view = post; render();
    const dead = events.filter((e) => e.type === 'destroyed' && vis.has(idx(e.pos.r, e.pos.c)));
    await Promise.all([...dmg.map((e) => damageNumberFx(e.pos, e.amount, e.side === ev.side)), ...dead.map(destroyFx)]);
  }

  /** 실제로 지나간 경로: 이동 가능 칸 경로에서 최종 칸까지 (매복으로 멈춘 경우 그 앞까지) */
  function travelledPath(reach, to) {
    if (!reach) return [to];
    const k = reach.path.findIndex((p) => samePos(p, to));
    return k >= 0 ? reach.path.slice(0, k + 1) : [to];
  }

  /* ---------- 입력 ---------- */
  /** 지금 화면을 보는 사람이 조작할 차례인가 (AI 모드: 국군 턴 / 2인 모드: 가림막이 걷힌 현재 턴 진영). 연출 중에는 잠금 */
  function playerCanAct() {
    return !!ui.state && !ui.deploy && !ui.busy && !ui.state.winner && ui.viewer === ui.state.turn && (hotseat() || ui.state.turn === PLAYER);
  }

  function select(id) {
    ui.selectedId = id;
    ui.note = null;
    ui.inspectId = null;
    hideTip();
    if (ui.tut) tutRecord({ kind: 'select', unit: id }, []);
    render();
    const u = getUnit(ui.state, id);
    if (u && !u.acted && activationBlocked(ui.state, u)) announce(t('live.actSpent'));   // 하이라이트 없음 + 카드에 '행동 한도 소진'
  }

  function onCellClick(i) {
    const touch = ui.pointer === 'touch';
    const armed = ui.touchArm;
    ui.touchArm = -1;
    if (touch) hideBalloon();
    if (ui.screen !== 'deploy' && ui.screen !== 'game') return;
    if (ui.deploy) { onDeployClick(i); return; }
    const st = ui.state;
    const me = ui.viewer;
    const p = posOf(i);
    // 터치: 유닛을 고르지 않은 상태에서 빈 칸(보이는 유닛 없음)을 탭하면 지형 말풍선 (마우스 호버 툴팁 대신)
    if (touch && me && !ui.selectedId) {
      const vis0 = visOf(st, me);
      const o = getUnitAt(st, p.r, p.c);
      const seenUnit = o && (me === 'all' || o.side === me || vis0.has(i));
      if (!seenUnit) { showBalloon(i); if (ui.inspectId) { ui.inspectId = null; renderPanel(); } return; }
    }
    if (!playerCanAct()) return;
    const vis = getVisibleTiles(st, me);
    const occ = getUnitAt(st, p.r, p.c);
    const occShown = occ && (occ.side === me || vis.has(i)) ? occ : null;
    const sel = ui.selectedId ? getUnit(st, ui.selectedId) : null;
    if (ui.tut) {
      const at = { r: p.r, c: p.c };
      const act = sel && ui.atkSet.has(i) ? { kind: 'preview', unit: sel.id, at }
        : sel && ui.dualSet.has(i) ? { kind: 'dual', unit: sel.id, at }
        : sel && ui.moveSet.has(i) ? { kind: 'move', unit: sel.id, at }
        : occShown && occShown.side === me ? (sel && occShown.id === sel.id ? null : { kind: 'select', unit: occShown.id })
        : { kind: 'cell' };
      if (act && !tutOk(act)) { tutBlocked(); return; }
    }

    if (sel && ui.atkSet.has(i)) {
      // 터치: 첫 탭 = 명중률 배지(포병은 착탄 미리보기 포함), 같은 대상 두 번째 탭 = 공격 확인창
      if (touch && armed !== i) { ui.touchArm = i; clearHover(); renderHover(i); return; }
      clearHover();
      if (ATTACK_CONFIRM) showAttackConfirm(sel.id, p); else playerAttack(sel.id, p);
      return;
    }
    if (sel && ui.dualSet.has(i)) {
      // 이동도 사격도 되는 칸: 터치는 첫 탭 = 명중률 배지, 두 번째 탭 = 선택 창. 마우스는 바로 선택 창
      if (touch && armed !== i) { ui.touchArm = i; clearHover(); renderHover(i); return; }
      clearHover();
      showMoveFireChoice(sel.id, p);
      return;
    }
    if (touch) clearHover();
    if (sel && ui.moveSet.has(i)) { playerMove(sel.id, p); return; }
    if (occShown && occShown.side === me) {
      if (sel && occShown.id === sel.id) return;   // 제자리: 공격 대상은 이미 표시됨
      select(occShown.id);
      return;
    }
    ui.selectedId = null;
    ui.inspectId = occShown ? occShown.id : null;
    hideTip();
    render();
  }

  async function playerMove(id, dest) {
    const st = ui.state;
    const token = ui.gameId;
    const before = cloneState(st);
    const reach = getReachableTiles(st, id).find((x) => samePos(x, dest));
    const events = moveUnit(st, id, dest);   // 상태는 여기서 확정
    // AI 모드는 기존과 같이 이동 후 시야 기준, 2인 모드는 양 진영의 이동 전/후 시야 기준
    annotate(events, hotseat() ? visMapOf(before, st) : visMapOf(st));
    ui.turnEvents.push(...events);
    const u = getUnit(st, id);
    if (u && !st.winner && getAttackableTiles(st, id).length === 0) {
      if (GAME_CONFIG.ENABLE_MOVE_ATTACK && GAME_CONFIG.UNIT_TYPES[u.type].canAttack) {
        // 공격할 수 없는 사유를 패널에 남김 (선택은 유지해서 보여 줌). 인접한 '보이는' 적만 따지므로 안개 정보는 새지 않음
        const reason = moveAttackBlockReason(u) || { k: 'ma.noEnemy', p: { left: moveLeftOf(u), cost: attackCost(u.type) } };
        ui.note = { id, reason };
        finishUnit(st, id);
      } else {
        finishUnit(st, id);
        ui.selectedId = null;
      }
    }
    // 연출: 내 유닛 이동 경로 + 거점 점령
    const mv = events.find((e) => e.type === 'move');
    hideTip();
    if (mv && !samePos(mv.from, mv.to)) {
      const b0 = getUnit(before, id);
      ui.busy = true;
      ui.anim.hideUnits.add(id);
      ui.view = st; render();
      await animateMove({ side: b0.side, type: b0.type, hp: b0.hp, full: [mv.from, ...travelledPath(reach, mv.to)], seen: () => true, own: true });
      if (token !== ui.gameId) return;
      ui.anim.hideUnits.delete(id);
      const cap = events.find((e) => e.type === 'captured');
      if (cap) await captureFx(cap, st);
      if (token !== ui.gameId) return;
      ui.busy = false;
    }
    ui.view = st;
    logEvents(events);
    if (ui.tut) tutRecord({ kind: 'move', unit: id, at: { r: dest.r, c: dest.c } }, events);
    if (st.winner) { render(); showResult(); return; }
    render();
  }

  async function playerAttack(id, target) {
    const st = ui.state;
    const token = ui.gameId;
    ui.busy = true;
    hideTip();
    const before = cloneState(st);
    const visBefore = getVisibleTiles(st, ui.viewer);
    const events = resolveAttack(st, id, target, ui.tut ? ui.tut.rng : Math.random);   // 상태는 여기서 확정 (튜토리얼: 단계 시드)
    annotate(events, hotseat() ? visMapOf(before, st) : visMapOf(before));
    ui.turnEvents.push(...events);
    await playAttack(events, before, st, visBefore);
    if (token !== ui.gameId) return;
    ui.view = st;
    ui.busy = false;
    ui.selectedId = null;
    if (ui.tut) tutorialRecord(ui.tut.log, { kind: 'attack', unit: id, at: { r: target.r, c: target.c } }, events, st);
    render();
    logEvents(events);
    if (ui.tut) tutRecord(null, []);
    if (st.winner) showResult();
  }

  /* ---------- 명중률 표시 (계산은 computeHitChance 하나만 사용) ---------- */
  /** 명중률 큰 글씨: d10 "명중 7/10 (70%)", d100 "명중률 70%" */
  function hitHeadline(hc) {
    return hc.sides === 10 ? t('hit.headD10', { need: hc.need, pct: hc.chance }) : t('hit.headD100', { pct: hc.chance });
  }
  /** 보정 항목의 이름 (긴 이름 / 한 줄 내역용 짧은 이름) */
  function partLabel(x, short = false) {
    switch (x.key) {
      case 'atkDiff': return short ? t('part.atkDiff.short') : t('part.atkDiff', x.p);
      case 'terrain': return short ? t('terrain.' + x.p.terrain) : t('part.terrain', { terrain: TR(x.p.terrain) });
      case 'signal': return t(short ? 'part.signal.short' : 'part.signal');
      case 'moved': return t(short ? 'part.moved.short' : 'part.moved');
      default: return t('part.' + x.key);
    }
  }
  /** 한 줄 내역 (반올림 전 값) + 최종 결과. 예: "기본 50 + 공격차 10 - 숲 10 - 이동 후 10 = 40 → 4/10" */
  function hitFormulaLine(hc) {
    const C = GAME_CONFIG.COMBAT;
    let s = '';
    hc.parts.forEach((x, k) => {
      const v = x.value;
      s += k === 0 ? `${partLabel(x, true)} ${v}` : ` ${v < 0 ? '-' : '+'} ${partLabel(x, true)} ${Math.abs(v)}`;
    });
    s += ` = ${hc.raw}`;
    if (hc.sides === 10) {
      s += ` → ${hc.need}/10`;
      const rounded = Math.floor((hc.raw + 5) / 10) * 10;
      if (rounded < C.minHitD10) s += ' ' + t('hit.min', { n: C.minHitD10 });
      else if (rounded > C.maxHitD10) s += ' ' + t('hit.max', { n: C.maxHitD10 });
    } else if (hc.raw !== hc.chance) s += ` → ${hc.chance}%`;
    return s;
  }
  /** 주사위 결과 문구: "7 ≤ 9 ✓ 명중" / "8 > 7 ✗ 빗나감". hideNeed: 시야 밖 사격처럼 명중 기준을 보여 주면 안 될 때 */
  function rollLine(ev, hideNeed = false) {
    if (hideNeed) return t(ev.hit ? 'dice.hitOnly' : 'dice.missOnly');
    return t(ev.hit ? 'dice.rollHit' : 'dice.rollMiss', { roll: ev.roll, need: ev.need ?? ev.chance });
  }

  /** 지형 설명 (상수에서 생성): 이동 비용, 명중률 보정, 특수 규칙 */
  function terrainInfo(ter) {
    const notes = [];
    if (ter.consumesAll) notes.push({ k: 'ter.noteEnd' });
    if (ter.partialEntry) notes.push({ k: 'ter.notePartial', partial: true });
    if (ter.impassableFor && ter.impassableFor.length) notes.push({ k: 'ter.noteImpassable', p: { list: ter.impassableFor.map(typeName).join(t('list.sep')) } });
    return {
      cost: String(ter.moveCost),
      hit: ter.hitMod ? `${ter.hitMod > 0 ? '+' : ''}${ter.hitMod}%` : '0',
      notes,
    };
  }
  function terrainTipHtml(p) {
    const ter = terrainAt(p.r, p.c);
    const info = terrainInfo(ter);
    let html = `<div class="big">${esc(terName(ter))} <span class="hint">(${p.r},${p.c})</span></div>`;
    html += `<div class="row"><span>${esc(t('ter.moveCost'))}</span><span>${info.cost}</span></div>`;
    html += `<div class="row"><span>${esc(t('ter.hitMod'))}</span><span>${info.hit}</span></div>`;
    for (const n of info.notes) html += `<div class="hint">${esc(t(n.k, n.p))}</div>`;
    return html;
  }

  /** 범례 (탭 4개: 지형 / 병종 / 표시 / 하이라이트). 미니 그림은 지도와 같은 렌더러, 수치는 상수에서 */
  const LEGEND_TAB_KEY = 'legendTab';
  function renderLegend() {
    const sw = (inner, extra = '') => `<span class="sw ${extra}">${inner}</span>`;
    const item = (swHtml, name, desc = '') => `<div class="li">${swHtml}<span><span class="nm">${esc(name)}</span>${desc ? ` <span class="ds">${esc(desc)}</span>` : ''}</span></div>`;
    const mini = (inner, id = '') => `<svg viewBox="0 0 40 40" aria-hidden="true" overflow="visible">${id ? hatchDefs(id) : ''}${inner}</svg>`;
    const bare = (svg) => svg.replace(/^<svg[^>]*>|<\/svg>$/g, '');
    const plainBg = terrainSvgInner('plain', 1, 0);
    const one = new Set([0]);   // 한 칸짜리 영역 (좌표 0,0 = 미니 그림 전체)
    const H = DESIGN.hl;
    let html = '';
    switch (ui.legendTab) {
      case 'terrain': {
        const seen = new Set();
        for (const row of GAME_CONFIG.MAP) for (const ch of row) {
          if (seen.has(ch)) continue;
          seen.add(ch);
          const ter = GAME_CONFIG.TERRAIN[ch];
          const info = terrainInfo(ter);
          const bits = [t('legend.terrainStats', { cost: info.cost, hit: info.hit }), ...info.notes.filter((n) => !n.partial).map((n) => t(n.k, n.p))];
          html += item(sw(terrainSvg(ter.key, 0, 0, '')), terName(ter), bits.join(', '));
        }
        break;
      }
      case 'units':
        for (const type of Object.keys(GAME_CONFIG.UNIT_TYPES).filter(scenarioHasType)) html += item(sw(unitSvg(DEF(), type, { noHp: true })), typeName(type));
        html += item(sw(unitSvg(DEF(), 'infantry', { noHp: true })), t('legend.sideSouth', SP()));
        html += item(sw(unitSvg(ATT(), 'infantry', { noHp: true })), t('legend.sideNorth', SP()));
        break;
      case 'marks':
        if (GAME_CONFIG.ROUND_ORDER.some((sd) => GAME_CONFIG.HQ[sd])) html += item(sw(hqSvg(DEF(), '')), t('legend.hq'));
        html += item(sw(objSvg(DEF(), '')), t('legend.obj'));
        html += item(sw(objSvg(ATT(), '')), t('legend.objNorth', SP()));
        html += item(sw(terrainSvg('plain', 1, 0, ''), 'fog'), t('legend.fog'));
        break;
      default:   // 하이라이트 9종 (2단계)
        html += item(sw(mini(plainBg + bare(unitSvg(DEF(), 'infantry', { noHp: true, selected: true })))), t('legend.hl.selected'));
        html += item(sw(mini(plainBg + regionSvg(one, moveStyle()))), t('legend.hl.move'));
        html += item(sw(mini(plainBg + regionSvg(one, moveStyle()) + regionSvg(one, moveAtkStyle('lg-hatch')), 'lg-hatch')), t('legend.hl.moveAtk', { n: GAME_CONFIG.MOVE_ATTACK_PENALTY }));
        html += item(sw(mini(plainBg + bare(unitSvg(ATT(), 'infantry', { noHp: true })) + targetRing(20, 19))), t('legend.hl.target'));
        html += item(sw(mini(plainBg + regionSvg(one, artyStyle()))), t('legend.hl.arty'));
        html += item(sw(mini(plainBg + `<rect x="1.2" y="1.2" width="37.6" height="37.6" fill="${H.impact.centerFill}" stroke="${H.impact.line}" stroke-width="${H.impact.centerW}"/>`)), t('legend.hl.impact'));
        html += item(sw(mini(plainBg + ffWarning(0, 0))), t('legend.hl.ff'));
        html += item(sw(mini(plainBg + regionSvg(one, signalStyle('own')) + pillBadge(20, 20, `+${GAME_CONFIG.COMBAT.signalBonus}`, H.sigBadge, H.signal.badge, '#fff'))), t('legend.hl.signal', { n: GAME_CONFIG.COMBAT.signalBonus }));
        html += item(sw(mini(plainBg + bare(unitSvg(DEF(), 'infantry', { noHp: true, done: true })))), t('legend.hl.done'));
        if (actLimitsOf(ui.act)) {
          html += item(sw(mini(plainBg + bare(unitSvg(DEF(), 'infantry', { noHp: true }))), 'act-spent'), t('legend.hl.actSpent'));
          html += `<div class="li"><span><span class="ds">${esc(t('legend.actRule'))}</span></span></div>`;
        }
        break;
    }
    $('#legend').innerHTML = html;
    document.querySelectorAll('#legend-tabs [data-tab]').forEach((b) => {
      const on = b.dataset.tab === ui.legendTab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $('#legend').setAttribute('aria-label', t('legend.tab.' + ui.legendTab));
  }
  function setLegendTab(tab) {
    ui.legendTab = tab;
    try { localStorage.setItem(LEGEND_TAB_KEY, tab); } catch (e) { /* 저장 불가 환경 */ }
    renderLegend();
  }

  /* ---------- 마우스 올림: 명중률 배지, 착탄 미리보기, 오폭 경고, 툴팁 ---------- */
  function clearHover() { if (hlHover) hlHover.innerHTML = ''; }
  /** 공격 가능 칸 위에서만: 명중률 배지(시야 밖은 ?), 포병이면 착탄 십자 5칸과 오폭 경고 */
  function renderHover(i) {
    const st = ui.state, me = ui.viewer;
    const sel = getUnit(st, ui.selectedId);
    const p = posOf(i);
    const hc = computeHitChance(st, sel.id, p);   // 확인창과 같은 함수·같은 값
    const H = DESIGN.hl;
    let g = '';
    const selTy = GAME_CONFIG.UNIT_TYPES[sel.type];
    if (selTy.indirect && selTy.splash === false) {   // 박격포: 목표 칸만
      g += `<rect x="${cellX(p)}" y="${cellY(p)}" width="${CS}" height="${CS}" fill="${H.impact.centerFill}" stroke="${H.impact.line}" stroke-width="${H.impact.centerW}"/>`;
    } else if (selTy.indirect) {
      for (const q of nbrs4(p)) {
        g += `<rect x="${cellX(q)}" y="${cellY(q)}" width="${CS}" height="${CS}" fill="${H.impact.sideFill}" stroke="${H.impact.line}" stroke-width="${H.impact.sideW}" stroke-dasharray="${H.impact.sideDash}"/>`;
      }
      g += `<rect x="${cellX(p)}" y="${cellY(p)}" width="${CS}" height="${CS}" fill="${H.impact.centerFill}" stroke="${H.impact.line}" stroke-width="${H.impact.centerW}"/>`;
      if (!hc.fogged) {   // 오폭 경고는 자기 유닛만 (아군 유닛 칸은 항상 보이므로 시야 밖 중심에서는 생기지 않음)
        for (const q of [p, ...nbrs4(p)]) {
          const o = getUnitAt(st, q.r, q.c);
          if (o && o.side === me) g += ffWarning(cellX(q), cellY(q));
        }
      }
    }
    g += pillBadge(cellX(p) + CS / 2, cellY(p) - H.badge.h / 2 + 2, hc.fogged ? '?' : `${hc.chance}%`);
    hlHover.innerHTML = g;
  }

  function onCellHover(i) {
    ui.hoverIdx = i;
    const st = ui.state;
    const p = posOf(i);
    const me = ui.viewer;
    clearHover();
    if (!playerCanAct() || !ui.selectedId || !(ui.atkSet.has(i) || ui.dualSet.has(i))) {
      if (st && !ui.busy && me) {
        let pre = '';
        // 이동 칸: 도착 시 남은 이동력과 이동 후 공격 가능 여부 (자기 진영이 아는 정보로만 계산된 값)
        const selU = playerCanAct() && ui.selectedId ? getUnit(st, ui.selectedId) : null;
        if (selU && ui.moveSet.has(i) && GAME_CONFIG.ENABLE_MOVE_ATTACK) {
          const selT = GAME_CONFIG.UNIT_TYPES[selU.type];
          const left = ui.moveLeftAt.get(i);
          if (selT.indirect && !selT.moveFire) pre = `<div class="hint">${esc(t('tip.artyMove'))}</div><hr style="border:0;border-top:1px solid var(--line);margin:6px 0">`;
          else if (selT.canAttack) {
            const cost = attackCost(selU.type);
            const ok = left >= cost;
            const ter = terrainAt(p.r, p.c);
            const msg = ok ? t('tip.moveAtkOk', { n: GAME_CONFIG.MOVE_ATTACK_PENALTY })
              : (ter.consumesAll ? t('tip.moveAtkTerrain', { terrain: TR(ter.key) }) : t('tip.moveAtkNo', { left, cost }));
            pre = `<div><b>${esc(t('tip.moveLeft', { left, cost }))}</b></div>
              <div class="${ok ? 'hint' : 'warn'}">${esc(msg)}</div>
              <hr style="border:0;border-top:1px solid var(--line);margin:6px 0">`;
          }
        }
        showTip(i, pre + terrainTipHtml(p));   // 지형은 공개 정보
      } else hideTip();
      return;
    }
    const sel = getUnit(st, ui.selectedId);
    renderHover(i);
    let html = attackPreviewHtml(st, sel, p, me);
    html += `<hr style="border:0;border-top:1px solid var(--line);margin:6px 0">${terrainTipHtml(p)}`;
    if (ATTACK_CONFIRM) html += `<div class="hint" style="margin-top:4px">${esc(t('tip.clickConfirm'))}</div>`;
    showTip(i, html);
  }

  /**
   * 공격 미리보기 (툴팁·공격 확인 창 공용). 시야 밖이면 명중률·대상 정보를 보여 주지 않음 (안개 규칙)
   */
  function attackPreviewHtml(st, sel, p, me) {
    const ty = GAME_CONFIG.UNIT_TYPES[sel.type];
    const hc = computeHitChance(st, sel.id, p);
    const C = GAME_CONFIG.COMBAT;
    let html = '';
    if (hc.fogged) {
      html += `<div class="big">${esc(t('hit.unknown'))}</div><div class="hint">${esc(t('hit.fogNote', { n: C.fogPenalty }))}</div>`;
      if (hc.movedAttack) html += `<div class="warn">${esc(t('hit.movedWarn', { n: GAME_CONFIG.MOVE_ATTACK_PENALTY }))}</div>`;
      const ip = hc.parts.find((x) => x.key === 'indirect');   // 간접 사격 추가 감점 (고정값이라 안개와 무관)
      if (ip) html += `<div class="warn">${esc(t('hit.indirectWarn', { n: ip.value }))}</div>`;
      if (ty.fixedDamage != null) html += `<div class="hint">${esc(t('tgt.fixedDmg', { n: ty.fixedDamage }))}</div>`;
    } else {
      html += `<div class="big">${esc(hitHeadline(hc))}</div>`;
      html += `<div class="hint">${esc(hitFormulaLine(hc))}</div>`;
      if (hc.movedAttack) html += `<div class="warn">${esc(t('hit.movedWarn', { n: GAME_CONFIG.MOVE_ATTACK_PENALTY }))}</div>`;
      html += hc.parts.map((x) => `<div class="row"><span>${esc(partLabel(x))}</span><span>${x.value > 0 ? '+' : ''}${x.value}</span></div>`).join('');
      if (hc.sides !== 10 && hc.raw !== hc.chance) html += `<div class="row"><span>${esc(t('hit.clamp100', { min: C.minHit, max: C.maxHit }))}</span><span></span></div>`;
      const target = getUnitAt(st, p.r, p.c);
      if (target) {
        html += `<div style="margin-top:4px">${esc(t('tgt.label', { who: REL(target.side === me, target.type), hp: target.hp }))}</div>`;
        html += `<div>${esc(t('tgt.dmg', { dmg: hc.damage, hp: Math.max(0, target.hp - hc.damage) }))}${hc.damage >= target.hp ? esc(t('tgt.kill')) : ''}</div>`;
        html += `<div class="hint">${esc(t('tgt.expected', { v: (hc.chance / 100 * Math.min(hc.damage, target.hp)).toFixed(2) }))}</div>`;
      } else {
        html += `<div style="margin-top:4px" class="hint">${esc(t('tgt.empty'))}</div>`;
      }
    }
    if (ty.indirect && ty.splash === false) html += `<div class="hint">${esc(t('mortar.single'))}</div>`;
    else if (ty.indirect) {
      html += `<div class="hint">${esc(t('arty.splash', { n: C.splashDamage }))}</div>`;
      const friendly = [];   // 오폭 경고는 자기 유닛만 (상대 정보 없음)
      const center = getUnitAt(st, p.r, p.c);
      if (center && center.side === me) friendly.push(t('arty.center', { unit: U(center.type) }));
      for (const [dr, dc] of DIRS) {
        const o = getUnitAt(st, p.r + dr, p.c + dc);
        if (o && o.side === me) friendly.push(typeName(o.type));
      }
      if (friendly.length) html += `<div class="warn">${esc(t('arty.ff', { list: friendly.join(t('list.sep')) }))}</div>`;
    }
    return html;
  }

  /* ---------- 공격 확인 창 ---------- */
  /** 공격 전에 계산값·명중 확률을 보여 주고 확인을 받음 */
  function showAttackConfirm(id, target) {
    const st = ui.state, me = ui.viewer;
    const sel = getUnit(st, id);
    if (!sel) return;
    const ty = GAME_CONFIG.UNIT_TYPES[sel.type];
    const hc = computeHitChance(st, id, target);
    const tu = getUnitAt(st, target.r, target.c);
    if (ui.tut) tutRecord({ kind: 'preview', unit: id, at: { r: target.r, c: target.c } }, [], false);
    // 시야 밖 칸은 유닛 유무를 드러내지 않음
    const what = hc.fogged ? { t: 'confirm.whatFog', p: { pos: P(target) } }
      : tu ? { t: 'confirm.whatUnit', p: { who: REL(tu.side === me, tu.type), pos: P(target) } }
      : { t: 'confirm.whatEmpty', p: { pos: P(target) } };
    const kind = ty.indirect ? 'fire' : 'attack';
    const pct = hc.fogged ? '' : `<div class="confirm-pct ${hc.chance >= 50 ? 'good' : 'bad'}">${hc.chance}%</div>`;
    hideTip();
    if (!ui.wide) { showAttackSheet(id, target, sel, hc, tu, what, kind, pct); return; }
    showOverlay(`<div class="atk-confirm">
      <h2>${esc(t('confirm.title.' + kind))}</h2>
      <div style="margin-bottom:8px">${esc(t('confirm.line', { unit: U(sel.type), from: P(sel), what }))}</div>
      ${pct}
      ${attackPreviewHtml(st, sel, target, me)}
      <div class="hint" style="margin-top:6px">${esc(t('confirm.terrain', { terrain: TR(terrainAt(target.r, target.c).key) }))}</div>
      <div class="btn-row" style="margin-top:14px"><button class="primary" id="btn-atk-yes">${esc(t('confirm.yes.' + kind))}</button><button id="btn-atk-no">${esc(t('confirm.no'))}</button></div>
    </div>`, () => showAttackConfirm(id, target));
    ui.confirm = { id, target };
    $('#btn-atk-yes').onclick = confirmAttack;
    $('#btn-atk-no').onclick = cancelAttack;
    $('#btn-atk-yes').focus();
  }
  /**
   * 좁은 화면 공격 확인 시트: 요약 한 줄 · 명중 막대 · 보정 칩(최대 DESIGN.atkSheet.maxChips) + 접힌 '자세히'(기존 창 내용 전부).
   * 보여 주는 값은 기존 창과 같은 계산값이고 시야 밖이면 기존 창처럼 명중률·대상·보정 내역을 숨김 (안개 규칙)
   */
  function showAttackSheet(id, target, sel, hc, tu, what, kind, pct) {
    const st = ui.state, me = ui.viewer;
    const S = DESIGN.atkSheet;
    const ty = GAME_CONFIG.UNIT_TYPES[sel.type];
    // 안개 속 칸: 대상 이름 대신 '미확인 칸', 명중률 '?' (적 유무를 드러내지 않음). 고정 피해 병종은 피해를 보여 줌 (대상과 무관한 값)
    const tgtName = hc.fogged ? t('sheet.unknownCell') : tu ? typeName(tu.type) : t('sheet.empty');
    const pctTx = hc.fogged ? '?' : hc.chance + '%';
    const dmg = ty.fixedDamage != null ? ty.fixedDamage : (!hc.fogged && tu ? hc.damage : null);
    const sum = dmg != null ? t('sheet.sum', { unit: U(sel.type), target: tgtName, pct: pctTx, dmg })
      : t('sheet.sumNoDmg', { unit: U(sel.type), target: tgtName, pct: pctTx });
    const lvl = hc.fogged ? 'unk' : hc.chance >= S.hiAt ? 'hi' : hc.chance < S.loBelow ? 'lo' : 'mid';
    const sign = (v) => (v > 0 ? '+' : '\u2212') + Math.abs(v);
    // 칩: 기존 창이 보여 주는 보정 중 0 이 아닌 것만 (시야 밖이면 시야 밖·이동 후 공격만). 큰 값부터
    const parts = hc.parts.filter((x) => x.key !== 'base' && x.value !== 0 && (!hc.fogged || x.key === 'fog' || x.key === 'moved' || x.key === 'indirect'));
    const chips = parts.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .map((x) => ({ tx: `${partLabel(x, true)} ${sign(x.value)}`, cls: x.value < 0 ? 'red' : 'green' }));
    if (ty.indirect && ty.splash !== false) {   // 오폭 경고: 피해 범위(목표 + 인접 4칸)의 자기 유닛 수 (아군 위치는 늘 아는 정보)
      const near = [getUnitAt(st, target.r, target.c), ...DIRS.map(([dr, dc]) => getUnitAt(st, target.r + dr, target.c + dc))];
      const n = near.filter((o) => o && o.side === me).length;
      if (n) chips.unshift({ tx: t('sheet.ffN', { n }), cls: 'red ff' });
    }
    const shown = chips.length > S.maxChips ? chips.slice(0, S.maxChips - 1) : chips;
    const more = chips.length - shown.length;
    const chipHtml = shown.map((c) => `<span class="chip ${c.cls}" title="${esc(c.tx)}"><span class="tx">${esc(c.tx)}</span></span>`).join('')
      + (more ? `<span class="chip gray"><span class="tx">${esc(t('sheet.moreChips', { n: more }))}</span></span>` : '');
    const lvlTx = t('sheet.lvl.' + lvl);
    const open = !!ui.sheetOpen;
    showOverlay(`<div class="atk-sheet">
      <div class="sh-body" id="sh-body">
        <div class="sh-sum" title="${esc(sum)}">${esc(sum)}</div>
        <div class="sh-hit lvl-${lvl}" role="img" aria-label="${esc(pctTx + ' · ' + lvlTx)}"><div class="sh-meter"><span style="width:${hc.fogged ? 0 : hc.chance}%"></span></div><span class="sh-lvl">${esc(lvlTx)}</span></div>
        ${chipHtml ? `<div class="sh-chips">${chipHtml}</div>` : ''}
        <button class="sh-more" id="sh-more" aria-expanded="${open}" aria-controls="sh-detail">${esc(t(open ? 'sheet.less' : 'sheet.more'))}</button>
        <div class="sh-detail" id="sh-detail"${open ? '' : ' hidden'}>
          <h2>${esc(t('confirm.title.' + kind))}</h2>
          <div style="margin-bottom:8px">${esc(t('confirm.line', { unit: U(sel.type), from: P(sel), what }))}</div>
          ${pct}
          ${attackPreviewHtml(st, sel, target, me)}
          <div class="hint" style="margin-top:6px">${esc(t('confirm.terrain', { terrain: TR(terrainAt(target.r, target.c).key) }))}</div>
        </div>
      </div>
      <div class="sh-foot"><button id="btn-atk-no">${esc(t('sheet.no'))}</button><button class="primary" id="btn-atk-yes">${esc(t('sheet.yes.' + kind))}</button></div>
    </div>`, () => showAttackConfirm(id, target), 'sheet');
    ui.confirm = { id, target };
    $('#btn-atk-yes').onclick = confirmAttack;
    $('#btn-atk-no').onclick = cancelAttack;
    $('#sh-more').onclick = () => {   // 접기·펼치기 (언어를 바꿔 다시 그려도 상태 유지)
      const o = $('#sh-detail').hidden;
      ui.sheetOpen = o;
      $('#sh-detail').hidden = !o;
      $('#sh-more').setAttribute('aria-expanded', String(o));
      $('#sh-more').textContent = t(o ? 'sheet.less' : 'sheet.more');
      keepUnitsAboveSheet();   // 시트 높이가 바뀌면 지도 위치도 다시 맞춤
    };
    $('#btn-atk-yes').focus();
    keepUnitsAboveSheet();
  }
  /** 시트가 공격자·대상 칸을 가리면 지도를 그만큼 위로 밈 (상태 변화 없음, 상단 상태 줄 아래까지만) */
  function keepUnitsAboveSheet() {
    const wrap = boardWrapEl;   // 가림막 중에도 null 이 아니게 보관한 참조
    const c = ui.confirm;
    const sel = c && getUnit(ui.state, c.id);
    if (!sel || ui.wide || !$('#overlay').classList.contains('sheet')) { wrap.style.transform = ''; return; }
    // 지금 적용 중인 이동량(전환 중이면 그 순간 값)을 빼서 원래 위치 기준으로 계산
    const tf = getComputedStyle(wrap).transform;
    const cur = tf && tf !== 'none' ? new DOMMatrixReadOnly(tf).m42 : 0;
    const rs = [idx(sel.r, sel.c), idx(c.target.r, c.target.c)].map((i) => cells[i].el.getBoundingClientRect());
    const limit = $('#modal').getBoundingClientRect().top - DESIGN.atkSheet.margin;
    const top = $('#hud').getBoundingClientRect().bottom + DESIGN.atkSheet.margin;
    const low = Math.max(...rs.map((r) => r.bottom)) - cur, high = Math.min(...rs.map((r) => r.top)) - cur;
    const shift = Math.min(Math.max(0, low - limit), Math.max(0, high - top));
    wrap.style.transform = shift > 0 ? `translateY(${-Math.ceil(shift)}px)` : '';
  }
  /** 이동도 사격도 되는 칸(박격포): 이동 / 사격 / 취소. 사격을 고르면 기존 확인 창(좁은 화면은 시트)으로 */
  function showMoveFireChoice(id, target) {
    const sel = getUnit(ui.state, id);
    if (!sel) return;
    hideTip();
    showOverlay(`<div class="atk-confirm move-fire-choice">
      <h2>${esc(t('choice.title'))}</h2>
      <div style="margin-bottom:8px">${esc(t('choice.line', { unit: U(sel.type), from: P(sel), pos: P(target) }))}</div>
      <div class="btn-row" style="margin-top:14px"><button class="primary" id="btn-ch-move">${esc(t('choice.move'))}</button><button id="btn-ch-fire">${esc(t('choice.fire'))}</button><button id="btn-ch-no">${esc(t('confirm.no'))}</button></div>
    </div>`, () => showMoveFireChoice(id, target));
    ui.choice = { id, target };
    $('#btn-ch-move').onclick = () => choiceDo('move');
    $('#btn-ch-fire').onclick = () => choiceDo('fire');
    $('#btn-ch-no').onclick = () => choiceDo(null);
    $('#btn-ch-move').focus();
  }
  function choiceDo(what) {
    const c = ui.choice;
    if (!c) return;
    ui.choice = null;
    hideOverlay();
    const k = idx(c.target.r, c.target.c);
    const ok = playerCanAct() && getUnit(ui.state, c.id) && ui.dualSet.has(k);
    if (ok && ui.tut && what && !tutOk({ kind: what === 'move' ? 'move' : 'preview', unit: c.id, at: c.target })) { tutBlocked(); render(); return; }
    if (ok && what === 'move') { playerMove(c.id, c.target); return; }
    if (ok && what === 'fire') { if (ATTACK_CONFIRM) showAttackConfirm(c.id, c.target); else playerAttack(c.id, c.target); return; }
    render();   // 취소: 선택은 유지
  }
  function confirmAttack() {
    const c = ui.confirm;
    if (!c) return;
    ui.confirm = null;
    hideOverlay();
    const k = idx(c.target.r, c.target.c);
    if (ui.tut && !tutOk({ kind: 'attack', unit: c.id, at: c.target })) { tutBlocked(); render(); return; }
    if (playerCanAct() && getUnit(ui.state, c.id) && (ui.atkSet.has(k) || ui.dualSet.has(k))) playerAttack(c.id, c.target);
  }
  function cancelAttack() {
    if (!ui.confirm) return;
    ui.confirm = null;
    hideOverlay();
    render();   // 선택은 유지 → 다른 대상을 고르거나 이동할 수 있음
  }

  function onCellLeave(i) {
    if (ui.hoverIdx === i) { hideTip(); clearHover(); }
  }

  /** 툴팁: 커서에서 조금 떨어진 오른쪽 아래(가장자리에서는 반대쪽)에 둬서 커서 주변 칸을 가리지 않음 */
  function placeTip(i) {
    const tip = $('#tooltip');
    const off = DESIGN.tipOffset;
    let mx, my;
    if (ui.mouse) { mx = ui.mouse.x; my = ui.mouse.y; }
    else if (i != null) { const r = cells[i].el.getBoundingClientRect(); mx = r.right; my = r.bottom; }
    else return;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const cell = cellPx();
    let x = mx + off, y = my + Math.round(cell * 0.75);
    if (x + tw > window.innerWidth - 8) x = mx - tw - off;
    if (y + th > window.innerHeight - 8) y = my - th - Math.round(cell * 0.75);
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  /** 터치용 지형 말풍선: 칸 위쪽에 약 3초 (지형은 공개 정보) */
  function showBalloon(i) {
    const p = posOf(i), ter = terrainAt(p.r, p.c);
    const tip = $('#tooltip');
    tip.className = 'balloon';
    tip.innerHTML = `<b>${esc(terName(ter))}</b> <span class="hint">${P(p)}</span><div>${esc(t('tip.balloon', { cost: ter.moveCost, def: defModText(ter) }))}</div>`;
    tip.style.display = 'block';
    const r = cells[i].el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 6;
    if (y < 8) y = r.bottom + 6;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tw - 8, x)) + 'px';
    tip.style.top = y + 'px';
    clearTimeout(ui.balloonTimer);
    ui.balloonTimer = setTimeout(hideBalloon, DESIGN.touch.balloonMs);
  }
  function hideBalloon() {
    clearTimeout(ui.balloonTimer);
    const tip = $('#tooltip');
    if (tip.classList.contains('balloon')) { tip.style.display = 'none'; tip.className = ''; }
  }
  function showTip(i, html) {
    const tip = $('#tooltip');
    tip.className = '';
    clearTimeout(ui.balloonTimer);
    tip.innerHTML = html;
    tip.style.display = 'block';
    placeTip(i);
  }
  function hideTip() {
    $('#tooltip').style.display = 'none';
    clearHover();
  }

  /* ---------- 턴 진행 ---------- */
  async function onEndTurn() {
    if (ui.deploy) { onDeployDone(); return; }
    if (ui.state && ui.state.winner) { if (!$('#overlay').classList.contains('show')) showResult(); return; }
    if (!playerCanAct()) return;
    if (ui.tut && !tutOk({ kind: 'endTurn' })) { tutBlocked(); return; }
    if (!ui.endArmed && endNeedsConfirm()) { armEnd(); return; }   // 첫 누름: 버튼만 확인 상태로
    disarmEnd(false);
    ui.selectedId = null;
    ui.inspectId = null;
    hideTip();
    resetAngles();
    if (ui.tut) { tutEndTurn(); return; }
    const ended = ui.state.turn;
    const events = endTurn(ui.state);
    ui.view = ui.state;
    annotate(events, visMapOf(ui.state));
    logEvents(events);
    ui.turnEvents.push(...events);
    if (ui.state.winner) { render(); showResult(); return; }
    if (hotseat()) { handOver(ended, ui.state.turn); return; }
    const arrivals = holdArrivals(events);   // 상대 턴 시작의 도착 중 시야 안인 것: 턴 배너 뒤에 나타남
    render();
    await runAiTurn(arrivals);
  }

  /* ---------- 2인 모드: 가림막 / 지난 턴 요약 ---------- */
  /** 화면에서 이전 플레이어의 정보를 모두 지움 (DOM 에도 남기지 않음) */
  function clearScreen() {
    ui.viewer = null;
    ui.selectedId = null;
    ui.inspectId = null;
    ui.actingId = null;
    ui.flash = new Set();
    ui.touchArm = -1;
    ui.unread = 0;
    hideTip();
    hideBalloon();
    clearFx();
    diceEl.classList.remove('show');
    diceEl.innerHTML = '';
    closePop(false);
    ui.view = ui.state;
    renderLog();
    render();
  }

  /** 턴 교대: 즉시 가림막 → "준비 완료" 후 새 플레이어 시점 + 지난 턴 요약 → 확인 후 턴 배너 */
  function handOver(endedSide, nextSide) {
    const pending = ui.turnEvents;
    ui.turnEvents = [];
    clearScreen();
    const reveal = () => {
      setScreen('game');
      ui.viewer = nextSide;
      renderLog();
      render();
      showSummary(nextSide, pending, !endedSide, () => showBanner(nextSide, ui.state.round));
    };
    if (!ui.useCurtain) { reveal(); return; }
    showCurtain({
      side: nextSide, round: true,
      line: () => (endedSide ? t('curtain.endedLine', { side: S(endedSide) }) : t('curtain.startLine')),
    }, reveal);
  }

  const READY_DELAY_MS = 500;   // 실수로 바로 넘기지 않도록 버튼 활성화 지연
  /**
   * 가림막: 지도·로그·유닛·점수를 DOM 에서 모두 뺀 검은 화면 + 가운데 카드.
   * o: { side: 다음 플레이어, round: 라운드 칩 표시(false 면 배치 칩), line: 현재 언어로 첫 줄을 만드는 함수 }
   */
  function showCurtain(o, onReady) {
    const token = ui.gameId;
    const readyAt = performance.now() + READY_DELAY_MS;
    setScreen('curtain');
    renderHeader();
    renderLog();
    const draw = () => {
      const chip = o.round ? t('hud.round', { n: ui.state.round, max: GAME_CONFIG.MAX_ROUNDS }) : t('curtain.deployChip');
      showOverlay(`<div class="curtain-card"><span class="chip"><span class="tx">${esc(chip)}</span></span>
        <h2 class="curtain-who" style="color:${nameColor(o.side)}">${esc(t('curtain.turnOf', { side: S(o.side) }))}</h2>
        <p>${esc(o.line())}</p><p>${esc(t('curtain.pass', { side: S(o.side) }))}</p>
        <button class="primary btn-go" id="btn-ready" disabled>${esc(t('btn.ready'))}</button>
        <div class="hint">${esc(t('curtain.hidden'))}</div></div>`, draw, 'curtain');
      const btn = $('#btn-ready');
      const enable = () => { if (token === ui.gameId && btn.isConnected) { btn.disabled = false; btn.focus(); } };
      const left = readyAt - performance.now();
      if (left <= 0) enable(); else setTimeout(enable, left);
      btn.onclick = () => {
        if (btn.disabled || token !== ui.gameId) return;
        hideOverlay();
        onReady();
      };
    };
    draw();
  }

  const FLASH_MS = 2600;
  /** 새 플레이어 시야 안에서 일어난 사건만 카드로 요약. 확인을 누르면 그 칸을 잠깐 강조하고 after() */
  function showSummary(side, events, first, after) {
    if (first) { after(); return; }
    const seen = events.filter((ev) => ev.descBy && ev.descBy[side] && ev.type !== 'turnStart' && ev.type !== 'roundStart' && ev.type !== 'victory');
    const token = ui.gameId;
    const done = () => {
      hideOverlay();
      if (token !== ui.gameId) return;
      const flash = new Set();
      for (const ev of seen) for (const p of ev.cellsBy[side] || []) flash.add(idx(p.r, p.c));
      ui.flash = flash;
      render();
      setTimeout(() => { if (token === ui.gameId && ui.flash === flash) { ui.flash = new Set(); render(); } }, FLASH_MS);
      after();
    };
    const draw = () => {
      const rows = seen.map((ev) => {
        const d = ev.descBy[side];
        return `<div class="logline ${d.cls === 'bad' || d.cls === 'sys' ? d.cls : ''}" data-bar="${esc(barOf(d))}">${esc(tr(d))}</div>`;
      }).join('');
      showOverlay(`<div class="summary-card">
        <div class="uc-row" style="justify-content:space-between;flex-wrap:wrap"><h2 style="margin:0">${esc(t('panel.summary'))}</h2>
          <span class="chip blue">${dotHtml(side)}<span class="tx">${esc(t('summary.viewChip', { side: S(side) }))}</span></span></div>
        <div class="hint">${esc(t('summary.sub'))}</div>
        <div class="summary-list">${rows || `<div class="log-empty">${esc(t('summary.none'))}</div>`}</div>
        ${rows ? `<div class="hint">${esc(t('summary.foot'))}</div>` : ''}
        <div class="btn-row" style="justify-content:flex-end"><button class="primary" id="btn-sum-ok">${esc(t('btn.ok'))}</button></div></div>`, draw, 'summary');
      $('#btn-sum-ok').onclick = done;
      $('#btn-sum-ok').focus();
    };
    draw();
  }

  async function runAiTurn(arrivals = []) {
    const st = ui.state;
    const token = ui.gameId;
    if (st.turn !== AI_SIDE || st.winner) return;
    ui.busy = true;
    let prev = cloneState(st);
    ui.view = prev;
    render();
    await showBanner(AI_SIDE, st.round);
    if (token !== ui.gameId) return;
    await playArrivals(arrivals);
    if (token !== ui.gameId) return;
    const actions = aiTakeTurn(st, AI_SIDE, Math.random, ui.practice ? 'easy' : ui.difficulty, { recordSnapshots: true });   // 상태는 여기서 확정 (연습 판은 쉬움)
    for (const a of actions) {
      if (token !== ui.gameId) return;
      const visPrev = getVisibleTiles(prev, PLAYER);
      const visAfter = getVisibleTiles(a.snapshot, PLAYER);
      const vis = new Set([...visPrev, ...visAfter]);
      annotate(a.events, visMapOf(prev, a.snapshot));
      const moveEvents = a.events.filter((e) => e.type === 'move' || e.type === 'ambush' || e.type === 'captured');
      const attackEvents = a.events.filter((e) => !moveEvents.includes(e));
      const shownMove = moveEvents.some((e) => e.descBy[PLAYER]);
      const shownAttack = attackEvents.some((e) => e.descBy[PLAYER]);
      const visibleUnit = visPrev.has(idx(a.from.r, a.from.c)) || visAfter.has(idx(a.to.r, a.to.c));
      ui.actingId = visibleUnit ? a.unitId : null;
      if (a.moveSnapshot) {
        const mv = moveEvents.find((e) => e.type === 'move');
        if (mv && !samePos(mv.from, mv.to)) {
          // 이동 연출: 국군 시야 안의 칸만 재생 (시야 밖 경로는 드러내지 않음)
          const u0 = getUnit(prev, a.unitId);
          const reach = getReachableTiles(prev, a.unitId).find((x) => samePos(x, mv.to));
          ui.anim.hideUnits.add(a.unitId);
          ui.view = a.moveSnapshot; render();
          await animateMove({ side: u0.side, type: u0.type, hp: u0.hp, full: [mv.from, ...travelledPath(reach, mv.to)], seen: (p) => visPrev.has(idx(p.r, p.c)), own: false });
          if (token !== ui.gameId) return;
          ui.anim.hideUnits.delete(a.unitId);
        }
        const cap = moveEvents.find((e) => e.type === 'captured');
        if (cap && visPrev.has(idx(cap.pos.r, cap.pos.c))) await captureFx(cap, a.moveSnapshot);
        if (token !== ui.gameId) return;
        ui.view = a.moveSnapshot;
        render();
        logEvents(moveEvents);
      }
      if (token !== ui.gameId) return;
      if (attackEvents.some((e) => e.type === 'diceRoll')) {
        await playAttack(attackEvents, a.moveSnapshot || prev, a.snapshot, vis);
        if (token !== ui.gameId) return;
      }
      ui.view = a.snapshot;
      render();
      logEvents(attackEvents);
      if (shownMove || shownAttack) await wait(STEP_MS * 0.4);
      prev = a.snapshot;
    }
    if (token !== ui.gameId) return;
    ui.actingId = null;
    ui.view = st;
    if (st.winner) { resetAngles(); ui.busy = false; render(); showResult(); return; }
    const events = endTurn(st);
    annotate(events, visMapOf(st));
    logEvents(events);
    resetAngles();   // 턴이 넘어가면 임시 회전값 초기화
    ui.busy = false;
    const ownArrivals = holdArrivals(events);   // 플레이어 증원: 배너와 함께 나타남
    render();
    if (st.winner) { showResult(); return; }
    showBanner(st.turn, st.round);   // 플레이어 턴 배너 (입력은 막지 않음)
    playArrivals(ownArrivals);
  }

  /* ---------- 시작 / 결과 ---------- */
  /** 새 게임: 직접 배치를 고르면 배치 단계 (AI 모드는 국군만, 2인 모드는 라운드 순서대로 양쪽), 아니면 기본 배치로 바로 시작 */
  function newGame() {
    ui.gameId++;
    ui.state = createInitialState();   // 기본 배치에서 출발
    ui.view = ui.state;
    ui.selectedId = null;
    ui.inspectId = null;
    ui.actingId = null;
    ui.busy = false;
    ui.logs = emptyLogs();
    ui.history = [];
    ui.turnEvents = [];
    ui.flash = new Set();
    ui.unread = 0;
    ui.touchArm = -1;
    ui.viewer = hotseat() ? null : PLAYER;
    $('#log').innerHTML = '';
    diceEl.classList.remove('show');
    clearFx();
    hideOverlay();
    closePop(false);
    applyModeUi();
    // 직접 배치: 배치 구역과 시작 유닛이 있는 진영만 (예: 공중 강습으로 시작하는 진영은 배치 단계 없음)
    const canPlace = (s) => !!GAME_CONFIG.DEPLOY_ZONES[s] && GAME_CONFIG.DEPLOYMENT[s].length > 0;
    const sides = hotseat() ? GAME_CONFIG.ROUND_ORDER.filter(canPlace) : [PLAYER].filter(canPlace);
    if (!ui.manualDeploy || !sides.length) { ui.deploy = null; startBattle({}); return; }
    ui.deploy = { side: null, queue: sides, done: {}, placed: new Set() };
    beginDeploySide(true);
  }

  /** 배치가 끝난 뒤(또는 기본 배치로) 실제 게임 시작 */
  function startBattle(doneOverride = null) {
    const done = doneOverride || ui.deploy.done;
    ui.deploy = null;
    ui.state = createInitialState(done);
    ui.state.actLimits = actLimitsOf(ui.act);   // 설정 메뉴의 행동 한도 (시뮬레이션은 쓰지 않음)
    if (GAME_CONFIG.FIRES) ui.state.firesOv = firesOvOf(ui.fire);   // 화력 설정 (fires 시나리오만. 없으면 상태에 키를 만들지 않음)
    const first = startTurn(ui.state);   // 첫 진영의 1라운드 예약 투입이 있으면 여기서 등장
    ui.view = ui.state;
    ui.selectedId = null;
    ui.inspectId = null;
    ui.history.push(M('log.round', { n: 1 }, 'sys'));
    addLog(M('log.round', { n: 1 }, 'sys'));
    const firstArrivals = first.filter((e) => e.type === 'arrival');
    annotate(firstArrivals, visMapOf(ui.state));
    logEvents(firstArrivals);
    ui.turnEvents.push(...firstArrivals);
    if (hotseat()) { handOver(null, ui.state.turn); return; }
    ui.viewer = PLAYER;
    setScreen('game');
    renderLog();
    render();
    if (ui.state.turn === PLAYER) showBanner(PLAYER, ui.state.round);
    runAiTurn();
  }

  /* ---------- 시작 전 배치 (유닛 트레이 → 초록 구역의 칸) ---------- */
  const DEPLOY_KEY = 'chuncheon1950.lastDeployment';
  /** 지난 배치 저장 칸: 춘천은 예전 키(진영 id) 그대로, 다른 시나리오는 '시나리오:진영' */
  const deploySlot = (side) => (GAME_CONFIG.SCENARIO_ID === DEFAULT_SCENARIO_ID ? side : `${GAME_CONFIG.SCENARIO_ID}:${side}`);
  function loadLastDeployment(side) {
    try {
      const v = JSON.parse(localStorage.getItem(DEPLOY_KEY) || '{}');
      const p = v && v[deploySlot(side)];
      return p && !deploymentError(side, p) ? p : null;
    } catch (e) { return null; }
  }
  function saveLastDeployment(side, pos) {
    try {
      const v = JSON.parse(localStorage.getItem(DEPLOY_KEY) || '{}') || {};
      v[deploySlot(side)] = pos;
      localStorage.setItem(DEPLOY_KEY, JSON.stringify(v));
    } catch (e) { /* 저장 불가 환경 */ }
  }
  /** 진영 유닛의 현재 위치 (DEPLOYMENT 순서 = 유닛 배열 순서) */
  const sidePositions = (st, side) => st.units.filter((u) => u.side === side).map((u) => ({ r: u.r, c: u.c }));
  function applyPositions(st, side, pos) {
    st.units.filter((u) => u.side === side).forEach((u, i) => { u.r = pos[i].r; u.c = pos[i].c; });
  }
  /** 배치를 마친(지도에 놓은) 아군 유닛. 아직 트레이에 있는 유닛은 칸을 차지하지 않음 */
  function placedAt(st, r, c) {
    const d = ui.deploy;
    return st.units.find((u) => u.side === d.side && d.placed.has(u.id) && u.r === r && u.c === c) || null;
  }
  const deployUnits = (side) => ui.state.units.filter((u) => u.side === side);
  function nextUnplaced(type) {
    const u = deployUnits(ui.deploy.side).find((x) => x.type === type && !ui.deploy.placed.has(x.id));
    return u ? u.id : null;
  }

  /** 대기열 맨 앞 진영의 배치 시작. 2인 모드는 가림막 뒤에서 넘김 */
  function beginDeploySide(first) {
    const d = ui.deploy;
    d.side = d.queue[0];
    d.placed = new Set();
    ui.selectedId = null;
    const side = d.side;
    if (!hotseat()) { ui.viewer = side; setScreen('deploy'); renderLog(); render(); return; }
    clearScreen();
    const reveal = () => { ui.viewer = side; setScreen('deploy'); renderLog(); render(); };
    if (!ui.useCurtain) { reveal(); return; }
    showCurtain({ side, round: false, line: () => t(first ? 'curtain.deployFirstLine' : 'curtain.deployNextLine', { side: S(side) }) }, reveal);
  }

  function onDeployDone() {
    const d = ui.deploy;
    if (!d || ui.viewer !== d.side || ui.busy) return;
    if (d.placed.size < deployUnits(d.side).length) return;   // 모두 놓기 전에는 완료 불가
    const pos = sidePositions(ui.state, d.side);
    const err = deploymentError(d.side, pos);
    if (err) { addLog(M('log.deployError', { msg: { t: err.k, p: err.p } }, 'sys')); return; }
    d.done[d.side] = pos;
    saveLastDeployment(d.side, pos);
    const list = ui.state.units.filter((u) => u.side === d.side).map((u) => ({ t: 'log.deployItem', p: { unit: U(u.type), pos: P(u) } }));
    ui.history.push(M('log.deployed', { side: S(d.side), list }, d.side));
    d.queue.shift();
    if (d.queue.length) beginDeploySide(false); else startBattle();
  }

  /** 선택한 유닛을 놓을 수 있는 칸: 빈 배치 칸 + (이미 놓은 유닛이면) 자리를 바꿀 수 있는 아군 칸. 규칙은 canDeployAt 그대로 */
  function deployTargets(st, u) {
    const set = new Set();
    const placed = ui.deploy.placed.has(u.id);
    for (let i = 0; i < N * N; i++) {
      const { r, c } = posOf(i);
      if (!canDeployAt(u.side, u.type, r, c)) continue;
      const o = placedAt(st, r, c);
      if (!o) set.add(i);
      else if (placed && o.id !== u.id && canDeployAt(o.side, o.type, u.r, u.c)) set.add(i);
    }
    return set;
  }
  /** 배치 가능 구역 (그 진영 병종 중 하나라도 놓을 수 있는 칸) = 영역 하나 */
  function deployZoneSet(side) {
    const types = [...new Set(GAME_CONFIG.DEPLOYMENT[side].map((d) => d.type))];
    const set = new Set();
    for (let i = 0; i < N * N; i++) {
      const { r, c } = posOf(i);
      if (types.some((ty) => canDeployAt(side, ty, r, c))) set.add(i);
    }
    return set;
  }

  function onDeployClick(i) {
    const d = ui.deploy, me = ui.viewer, st = ui.state;
    if (!d || me !== d.side || ui.busy) return;
    const p = posOf(i);
    const own = placedAt(st, p.r, p.c);
    const sel = ui.selectedId ? getUnit(st, ui.selectedId) : null;
    hideTip();
    if (sel && (!own || own.id !== sel.id) && deployTargets(st, sel).has(i)) {
      const wasPlaced = d.placed.has(sel.id);
      if (own) { own.r = sel.r; own.c = sel.c; }   // 자리 바꾸기 (놓은 유닛끼리)
      sel.r = p.r; sel.c = p.c;
      d.placed.add(sel.id);
      ui.selectedId = wasPlaced ? null : nextUnplaced(sel.type);   // 트레이에서 고른 병종은 남은 유닛을 이어서 놓음
    } else if (own) {
      ui.selectedId = sel && sel.id === own.id ? null : own.id;
    } else {
      ui.selectedId = null;
    }
    render();
  }

  function renderDeploy() {
    const st = ui.state, me = ui.viewer, side = ui.deploy.side;
    const active = me === side && !ui.busy;
    const sel = active && ui.selectedId ? getUnit(st, ui.selectedId) : null;
    const targets = sel ? deployTargets(st, sel) : new Set();
    for (let i = 0; i < N * N; i++) {
      const { r, c } = posOf(i);
      const cls = ['cell'];
      if (targets.has(i)) cls.push('can-move');
      // 배치 중에는 안개와 상대 유닛(AI 기본 배치 포함)을 그리지 않음. 아직 놓지 않은 유닛도 그리지 않음
      const u = active ? placedAt(st, r, c) : null;
      if (u) cls.push('clickable');
      cells[i].el.className = cls.join(' ');
      cells[i].dyn.innerHTML = markersHtml(st, r, c) + (u ? unitHtml(u, !!sel && sel.id === u.id) : '');
    }
    ui.moveSet = new Set(); ui.moveAtkSet = new Set(); ui.atkSet = new Set();
    if (active) {
      const Z = DESIGN.deployZone;
      let under = regionSvg(deployZoneSet(side), { fill: Z.fill, line: Z.line, w: Z.w, dash: Z.dash });
      const sigs = ui.showSignal ? st.units.filter((u) => u.side === side && ui.deploy.placed.has(u.id) && GAME_CONFIG.UNIT_TYPES[u.type].isSignal) : [];
      under += regionSvg(signalZoneSets(st, sigs)[side], signalStyle(side));
      under += regionSvg(targets, moveStyle());
      hlUnder.innerHTML = under;
    } else hlUnder.innerHTML = '';
    hlOver.innerHTML = objGroupSvg(st);
    clearHover();
    renderHeader();
    renderTray();
    renderPanel();
    if (!ui.wide && $('#side').offsetHeight !== ui.lastSideH) fitLayout();
  }

  /** 직접 배치 HUD: 제목 · 배치 가능 행 · 배치 n/전체 */
  function renderDeployHud() {
    const d = ui.deploy, side = d.side;
    const active = ui.viewer === side;
    const z = GAME_CONFIG.DEPLOY_ZONES[side].rows;
    const rows = `${z[0]}~${z[1]}`;
    setChip('hud-round', null);
    const title = active ? t('hud.deployTitle', { side: S(side) }) : t('hdr.handover');
    setChip('hud-turn', dotHtml(side) + txSpan(title), title, 'chip blue');
    // 구역 안내: 시나리오 문구(zoneLabelKey)가 있으면 그 문구, 없으면 'N~M행'
    const label = GAME_CONFIG.ZONE_LABEL_KEY ? t(GAME_CONFIG.ZONE_LABEL_KEY) : null;
    const zoneFull = label ? t('hud.deployZoneLabel', { zone: label }) : t('hud.deployZone', { rows });
    const zoneShort = label || t('hud.deployZoneShort', { rows });
    $('#hud-objs').innerHTML = active ? `<span class="chip green" title="${esc(zoneFull)}">${txSpan(ui.wide ? zoneFull : zoneShort)}</span>` : '';
    const total = deployUnits(side).length, n = d.placed.size;
    if (active) setChip('hud-goal', txSpan(t('hud.deployCount', { n, max: total })), null, 'chip ' + (n === total ? 'green' : 'orange'));
    else setChip('hud-goal', null);
    setChip('hud-units', null);
    setChip('hud-reinf', null);
  }

  /** 유닛 트레이: 병종 기호, 이름, 놓은 수/전체, 남음 n 또는 완료 */
  function renderTray() {
    const tray = $('#tray');
    const d = ui.deploy;
    if (!d || ui.viewer !== d.side) { tray.innerHTML = ''; return; }
    const st = ui.state, side = d.side;
    const units = deployUnits(side);
    const types = [...new Set(units.map((u) => u.type))];
    const sel = ui.selectedId ? getUnit(st, ui.selectedId) : null;
    const items = types.map((ty) => {
      const all = units.filter((u) => u.type === ty);
      const n = all.filter((u) => d.placed.has(u.id)).length, left = all.length - n;
      const on = !!sel && sel.type === ty && !d.placed.has(sel.id);
      const chip = left ? `<span class="chip orange sm">${esc(t('deploy.left', { n: left }))}</span>` : `<span class="chip green sm">${esc(t('deploy.complete'))}</span>`;
      const label = `${typeName(ty)} ${n}/${all.length} · ${left ? t('deploy.left', { n: left }) : t('deploy.complete')}`;
      return `<button class="tray-item" data-type="${esc(ty)}" aria-pressed="${on}" aria-label="${esc(label)}" title="${esc(label)}"${left ? '' : ' disabled'}>`
        + `<span class="sym" aria-hidden="true">${unitSvg(side, ty, { noHp: true })}</span><span class="nm tx">${esc(typeName(ty))}</span><span class="ct">${n}/${all.length}</span>${chip}</button>`;
    }).join('');
    const last = loadLastDeployment(side);
    const hint = sel && d.placed.has(sel.id) ? t('deploy.selHint') : t('deploy.hint');
    tray.innerHTML = `<div class="sec-lbl tx tray-title">${esc(t('deploy.trayTitle', { side: S(side) }))}</div><div class="tray-list">${items}</div>
      <div class="hint">${esc(hint)}</div>
      <div class="tray-btns"><button id="btn-deploy-default">${esc(t('btn.deployFill'))}</button>`
      + `<button id="btn-deploy-last"${last ? '' : ` disabled title="${esc(t('deploy.noLast'))}"`}>${esc(t('btn.deployLast'))}</button>`
      + `<button id="btn-deploy-reset"${d.placed.size ? '' : ' disabled'}>${esc(t('btn.deployReset'))}</button></div>`;
    tray.querySelectorAll('.tray-item').forEach((b) => {
      b.onclick = () => {
        const id = nextUnplaced(b.dataset.type);
        ui.selectedId = ui.selectedId === id ? null : id;
        render();
        const again = tray.querySelector(`.tray-item[data-type="${b.dataset.type}"]`);
        if (again && !again.disabled) again.focus();
      };
    });
    const fill = (pos) => { applyPositions(st, side, pos); d.placed = new Set(units.map((u) => u.id)); ui.selectedId = null; render(); };
    $('#btn-deploy-default').onclick = () => fill(GAME_CONFIG.DEPLOYMENT[side]);
    $('#btn-deploy-last').onclick = () => { const p = loadLastDeployment(side); if (p) fill(p); };
    $('#btn-deploy-reset').onclick = () => { d.placed = new Set(); ui.selectedId = null; render(); };
  }

  /** 전술 프로필 선택지 (설명은 마우스를 올리면 툴팁으로) */
  function profileOptionsHtml() {
    return listTacticProfiles().map((p) => `<option value="${esc(p.id)}" title="${esc(p.description)}">${esc(p.name)}</option>`).join('');
  }
  /** 이 시나리오 난이도 목록에 없는 프로필 → 바탕 프로필(extends), 없으면 기본 프로필 */
  function fitDifficulty(id) {
    const ids = listTacticProfiles().map((p) => p.id), P = GAME_CONFIG.AI.TACTIC_PROFILES;
    for (let k = id; k; k = P[k] && P[k].extends) if (ids.includes(k)) return k;
    return ids.includes(GAME_CONFIG.AI.DEFAULT_PROFILE) ? GAME_CONFIG.AI.DEFAULT_PROFILE : ids[0];
  }
  /** 설정 패널의 난이도 선택 (시나리오·언어가 바뀌면 다시 채움) */
  function renderDiffSelect() {
    ui.difficulty = fitDifficulty(ui.difficulty);
    const diffSel = $('#difficulty-select');
    diffSel.innerHTML = profileOptionsHtml();
    diffSel.value = ui.difficulty;
    diffSel.title = resolveProfile(ui.difficulty).description;
  }

  /** 모드에 따라 보이는 컨트롤 정리 */
  function applyModeUi() {
    $('#diff-wrap').hidden = hotseat();
    $('#speed-label').textContent = t(hotseat() ? 'speed.fx' : 'speed.ai');
  }

  /* ---------- 오버레이 (공격 확인·시작·승패·가림막·요약). 열려 있는 동안 포커스를 안에 가둠 ---------- */
  const OVERLAY_KINDS = ['confirm', 'start', 'result', 'summary', 'curtain', 'sheet', 'rules'];
  /** redraw: 언어를 바꿨을 때 이 창을 현재 언어로 다시 그리는 함수. kind: 배경 종류 */
  function showOverlay(html, redraw = null, kind = 'confirm') {
    const ov = $('#overlay');
    if (!ov.classList.contains('show')) {
      const a = document.activeElement;
      ui.overlayReturn = a && a !== document.body && !ov.contains(a) ? a : null;
    }
    ui.overlay = redraw;
    ov.classList.remove(...OVERLAY_KINDS);
    ov.classList.add(kind, 'show');
    const modal = $('#modal');
    modal.innerHTML = html;
    const h = modal.querySelector('h1, h2');
    modal.setAttribute('aria-label', h ? h.textContent : t('app.docTitle'));
    hideTip();
    hideBalloon();
    if (ui.state && ui.screen === 'game') renderControls();
  }
  function hideOverlay() {
    ui.rulesBack = null;
    ui.confirm = null;
    ui.choice = null;
    ui.overlay = null;
    const ov = $('#overlay');
    ov.classList.remove('show', ...OVERLAY_KINDS);
    $('#modal').innerHTML = '';
    ui.sheetOpen = false;
    boardWrapEl.style.transform = '';   // 공격 시트로 밀었던 지도 원위치 (가림막 중에는 문서에서 떨어져 있으므로 보관한 참조로)
    const back = ui.overlayReturn;
    ui.overlayReturn = null;
    if (back && back.isConnected && back.offsetParent && !back.disabled) back.focus();
    if (ui.state && ui.screen === 'game') renderControls();
  }

  /** 인트로: 이동·공격 규칙 (상수에서 생성) */
  function introMoveRuleHtml() {
    const C = GAME_CONFIG;
    if (!C.ENABLE_MOVE_ATTACK) return `<li>${t('intro.moveLegacy')}</li>`;
    const costs = Object.keys(C.UNIT_TYPES).filter((k) => C.UNIT_TYPES[k].canAttack && !C.UNIT_TYPES[k].indirect)
      .map((k) => t('intro.costItem', { unit: U(k), n: attackCost(k) })).join(t('intro.listSep'));
    return `<li>${t('intro.moveMA', { costs })}</li><li>${t('intro.maPenalty', { pen: C.MOVE_ATTACK_PENALTY })}</li>`;
  }
  /** 인트로: 명중률·주사위 규칙 (상수에서 생성) */
  function introHitRuleHtml() {
    const C = GAME_CONFIG, CB = C.COMBAT;
    const mv = C.ENABLE_MOVE_ATTACK ? t('intro.hit.mv', { n: Math.abs(C.MOVE_ATTACK_PENALTY) }) : '';
    const dice = diceSides() === 10 ? t('intro.hit.d10', { min: CB.minHitD10, max: CB.maxHitD10 }) : t('intro.hit.d100', { min: CB.minHit, max: CB.maxHit });
    return `<li>${t('intro.hit', { base: CB.baseHit, per: CB.perPoint, fog: Math.abs(CB.fogPenalty), mv, dice, range: CB.signalRange, bonus: CB.signalBonus })}</li>`;
  }
  const langButtonsHtml = () => `<div class="seg" role="group" aria-label="${esc(t('lang.label'))}">${['ko', 'en'].map((l) => `<button data-lang="${l}" lang="${l}" class="${getLang() === l ? 'active' : ''}" aria-pressed="${getLang() === l}">${l.toUpperCase()}</button>`).join('')}</div>`;

  /* ---------- 시작 화면: 흐린 지도 배경 + 가운데 카드 ---------- */
  const OPT_DEPLOY_KEY = 'manualDeploy', OPT_CURTAIN_KEY = 'useCurtain';
  const SCEN_KEY = 'scenarioId';   // 선택한 시나리오 (다음 방문 때 기억, 기본 춘천)
  function loadScenarioPref() {
    try { const v = localStorage.getItem(SCEN_KEY); return SCENARIOS.some((x) => x.id === v) ? v : DEFAULT_SCENARIO_ID; } catch (e) { return DEFAULT_SCENARIO_ID; }
  }
  /** 시나리오 적용: 설정·플레이어 진영·지도·빈 상태를 바꿈 (시작 화면에서만 호출) */
  function applyScenario(id, save = true) {
    loadScenario(id);
    PLAYER = GAME_CONFIG.PLAYER_SIDE;
    AI_SIDE = enemyOf(PLAYER);
    ui.logs = emptyLogs();
    ui.viewer = PLAYER;
    buildBoard();
    ui.state = createInitialState();
    ui.view = ui.state;
    loadActPref();
    renderActSettings();
    loadFirePref();
    renderFireSettings();
    applyScenarioStrings();
    renderDiffSelect();
    rich.on = false;
    boardEl.classList.remove('rich', 'grid-on');
    if (save) { try { localStorage.setItem(SCEN_KEY, GAME_CONFIG.SCENARIO_ID); } catch (e) { /* 저장 불가 환경 */ } }
    fitLayout();
  }
  /** 시나리오 이름이 들어가는 고정 문구 (HUD 제목) */
  function applyScenarioStrings() {
    const sc = SCENARIOS.find((x) => x.id === GAME_CONFIG.SCENARIO_ID);
    $('#hud-title').textContent = sc ? t(sc.nameKey) : t('app.title');
  }
  /** 시나리오 카드 (이름, 한 줄 설명, 지도 미리보기, 칩 3개) */
  function scenarioCardsHtml(selId) {
    return listScenarios().map((sc) => {
      const name = t(sc.nameKey);
      const chips = [t('scen.chip.player', { side: { t: (SCENARIOS.find((x) => x.id === sc.id).sides[sc.playerSide] || {}).nameKey } }), t('scen.chip.rounds', { n: sc.rounds }), t('scen.chip.scale', { m: sc.scaleMeters })];
      return `<button class="scen-card" role="radio" data-scen="${esc(sc.id)}" aria-checked="${sc.id === selId}" aria-label="${esc(name + ' · ' + chips.join(' · '))}">`
        + `<span class="scen-map" role="img" aria-label="${esc(t('aria.scenMap', { name }))}" style="--scen-map:${DESIGN.scenMap}px">${miniMapSvg(sc.id)}</span>`
        + `<span class="scen-body"><span class="t tx" title="${esc(name)}">${esc(name)}</span><span class="d">${esc(t(sc.descKey))}</span>`
        + `<span class="scen-chips">${chips.map((c) => `<span class="chip sm" title="${esc(c)}"><span class="tx">${esc(c)}</span></span>`).join('')}</span></span></button>`;
    }).join('');
  }
  const savePref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) { /* 저장 불가 환경 */ } };
  const loadPref = (k, def) => { try { const v = localStorage.getItem(k); return v === '1' ? true : v === '0' ? false : def; } catch (e) { return def; } };

  function showIntro(keep = null) {
    if (ui.screen !== 'start') setScreen('start');
    render();
    const sel = keep || { mode: ui.mode, diff: resolveProfile(ui.difficulty).id };
    const draw = (focusSel = null) => {
      const hs = sel.mode === 'hotseat';
      sel.diff = fitDifficulty(sel.diff);   // 시나리오를 바꾸면 그 시나리오 목록 안으로
      const prof = resolveProfile(sel.diff);
      const sc = SCENARIOS.find((x) => x.id === GAME_CONFIG.SCENARIO_ID);
      const sub = t((hs ? 'start.subHotseat' : 'start.sub') + (GAME_CONFIG.SYMMETRIC ? 'Sym' : ''), { place: { t: sc.subKey }, max: GAME_CONFIG.MAX_ROUNDS, ...SP() });
      showOverlay(`<div class="start-card">
        <div class="start-top"><div style="min-width:0"><h1 class="start-title">${esc(t('app.title'))}</h1><div class="start-sub">${esc(sub)}</div></div>${langButtonsHtml()}</div>
        <div><div class="sec-lbl">${esc(t('start.scenario'))}</div><div class="scen-list" role="radiogroup" aria-label="${esc(t('start.scenario'))}">${scenarioCardsHtml(GAME_CONFIG.SCENARIO_ID)}</div></div>
        <div><div class="sec-lbl">${esc(t('intro.mode'))}</div><div class="mode-grid" role="group" aria-label="${esc(t('intro.mode'))}">
          <button class="mode-card" data-mode="ai" aria-pressed="${!hs}"><span class="t tx">${esc(t('mode.ai'))}</span><span class="d tx">${esc(t('mode.aiDesc', SP()))}</span></button>
          <button class="mode-card" data-mode="hotseat" aria-pressed="${hs}"><span class="t tx">${esc(t('mode.hotseatShort'))}</span><span class="d tx">${esc(t('mode.hotseatDesc'))}</span></button>
        </div></div>
        ${hs ? '' : `<div><div class="sec-lbl">${esc(t('lbl.aiDifficulty'))}</div><div class="diff-grid${listTacticProfiles().length === 3 ? ' n3' : ''}" role="group" aria-label="${esc(t('lbl.aiDifficulty'))}">`
          + listTacticProfiles().map((p) => `<button data-diff="${esc(p.id)}" aria-pressed="${p.id === prof.id}" title="${esc(p.name)}"><span class="tx">${esc(p.name)}</span></button>`).join('')
          + `</div><div class="desc-box" id="intro-diff-desc">${esc(prof.description)}</div></div>`}
        <div class="opt-list">${GAME_CONFIG.ROUND_ORDER.some((x) => GAME_CONFIG.DEPLOY_ZONES[x] && GAME_CONFIG.DEPLOYMENT[x].length) ? `<label class="opt"><input type="checkbox" id="opt-deploy"${ui.manualDeploy ? ' checked' : ''}><span class="tx">${esc(t('start.optDeploy'))}</span></label>` : ''}
          ${hs ? `<label class="opt"><input type="checkbox" id="opt-curtain"${ui.useCurtain ? ' checked' : ''}><span class="tx">${esc(t('start.optCurtain'))}</span></label>` : ''}</div>
        <button class="primary btn-go" id="btn-start">${esc(t('btn.startGo'))}</button>
        <div class="links"><button class="link" id="btn-rules">${esc(t('start.rules'))}</button><button class="link" id="btn-tutorial">${esc(t('btn.tutorial'))}</button></div>
      </div>`, () => draw(), 'start');
      const modal = $('#modal');
      modal.querySelectorAll('[data-lang]').forEach((b) => { b.onclick = () => setLanguage(b.dataset.lang); });
      modal.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { sel.mode = b.dataset.mode; draw(`[data-mode="${sel.mode}"]`); }; });
      modal.querySelectorAll('[data-scen]').forEach((b) => {
        b.onclick = () => {
          if (b.dataset.scen !== GAME_CONFIG.SCENARIO_ID) { applyScenario(b.dataset.scen); render(); }
          draw(`[data-scen="${b.dataset.scen}"]`);
        };
        b.onkeydown = (e) => {   // 라디오 그룹: 위/아래(좌/우) 화살표로 이동
          if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
          const list = [...modal.querySelectorAll('[data-scen]')];
          const k = (list.indexOf(b) + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length;
          e.preventDefault();
          list[k].click();
        };
      });
      modal.querySelectorAll('[data-diff]').forEach((b) => { b.onclick = () => { sel.diff = b.dataset.diff; draw(`[data-diff="${sel.diff}"]`); }; });
      if ($('#opt-deploy')) $('#opt-deploy').onchange = (e) => { ui.manualDeploy = e.target.checked; savePref(OPT_DEPLOY_KEY, ui.manualDeploy); };   // 배치 구역이 없는 시나리오(고정 배치)는 항목 없음
      if ($('#opt-curtain')) $('#opt-curtain').onchange = (e) => { ui.useCurtain = e.target.checked; savePref(OPT_CURTAIN_KEY, ui.useCurtain); };
      $('#btn-rules').onclick = () => showRules(() => draw('#btn-rules'));
      $('#btn-tutorial').onclick = () => startTutorial(0);
      $('#btn-start').onclick = () => {
        ui.mode = sel.mode;
        ui.difficulty = sel.diff;
        $('#difficulty-select').value = ui.difficulty;
        $('#difficulty-select').title = resolveProfile(ui.difficulty).description;
        newGame();
      };
      const f = focusSel && modal.querySelector(focusSel);
      (f || $('#btn-start')).focus();
    };
    draw();
  }

  /** 규칙 보기 (시작 화면의 보조 링크) */
  /** 규칙 화면의 행동 제한 한 줄 (설정 메뉴 값 = 공개 정보. 소모 현황은 없음) */
  function introActRuleHtml() {
    const lim = actLimitsOf(ui.act);
    if (!lim) return '';
    const list = GAME_CONFIG.ROUND_ORDER.map((s) => {
      const n = lim[ROLE(s)];
      return n == null ? { t: 'intro.actItemNone', p: { side: S(s) } } : { t: 'intro.actItem', p: { side: S(s), n } };
    });
    return `<li>${esc(t('intro.act', { list }))}</li>`;
  }
  /** 규칙 화면의 간접 화력 한 줄 (fires 시나리오만. 값은 시나리오 기본값 = 공개 정보) */
  function introFireRuleHtml() {
    const F = GAME_CONFIG.FIRES;
    if (!F) return '';
    const v = (type, k) => (F[type] && F[type][k] != null ? F[type][k] : 0);
    let s = `<li>${esc(t(F.blindFire !== false ? 'intro.blindFire' : 'intro.noBlindFire', { n: GAME_CONFIG.COMBAT.fogPenalty }))}</li>`;
    if (F.artillery) s += `<li>${esc(t('intro.artyCool', { range: v('artillery', 'range'), cd: v('artillery', 'cooldown') }))}</li>`;
    if (F.mortar && scenarioHasType('mortar')) s += `<li>${esc(t('intro.mortar', { range: v('mortar', 'range'), cd: v('mortar', 'cooldown'), dmg: GAME_CONFIG.UNIT_TYPES.mortar.fixedDamage }))}</li>`;
    return s;
  }
  /** 현재 시나리오의 진행·승리 조건 (시나리오 데이터 = 공개 정보). 규칙 화면 1·7번 항목 */
  function victoryLinesHtml() {
    const C = GAME_CONFIG;
    const when = C.OBJECTIVE_CHECK_AFTER ? { t: 'intro.when.side', p: { side: S(C.OBJECTIVE_CHECK_AFTER) } } : { t: 'intro.when.round' };
    // 배치 구역: 시작 유닛이 있는 진영만. 플레이어 진영이 아니면 '2인 대전의 …'
    const zoneOf = (s) => (C.ZONE_LABEL_KEY ? { t: C.ZONE_LABEL_KEY } : { t: 'intro.zoneRows', p: { rows: C.DEPLOY_ZONES[s].rows.join('~') } });
    const zones = C.ROUND_ORDER.filter((s) => C.DEPLOY_ZONES[s] && C.DEPLOYMENT[s].length)
      .map((s) => ({ t: s === PLAYER ? 'intro.deployItem' : 'intro.deployItemHs', p: { side: S(s), zone: zoneOf(s) } }));
    const hasHq = C.ROUND_ORDER.some((s) => C.HQ[s]);
    return `${zones.length ? `<li>${t('intro.deploy', { list: zones })}</li>` : ''}
        <li>${t(surviveSide() ? 'intro.round' : 'intro.roundSym', { order: C.ROUND_ORDER.map((s) => t('log.turn', { side: S(s) })).join(' → '), max: C.MAX_ROUNDS })}</li>
        ${roundLimitType() === 'roundLimitPoints'
    ? `<li>${t('intro.points', { max: C.MAX_ROUNDS, list: C.OBJECTIVES.map((o) => ({ t: 'intro.pointItem', p: { obj: OBS(o.id), n: C.OBJECTIVE_POINTS[o.id] } })) })} ${t(C.SCORE_TIMING === 'roundEnd' ? 'intro.pointsRoundEnd' : 'intro.pointsOwnTurn')}${C.SCORE_TARGET ? ' ' + t('intro.pointsTarget', { n: C.SCORE_TARGET }) : ''}</li>`
    : roundLimitType() === 'roundLimitScore'
    ? `<li>${t('intro.objectivesSym', { total: C.OBJECTIVES.length, max: C.MAX_ROUNDS })}</li>`
    : holdSide() ? `<li>${t('intro.objectives', { when, att: S(holdSide()), n: holdCount() })}</li>` : ''}
        ${C.OBJECTIVE_CONTROL === 'presence' ? `<li>${t('intro.presence')}</li>` : ''}
        <li>${t(hasHq ? 'intro.hqLoss' : 'intro.annihilation')}</li>
        ${C.REINFORCEMENTS.length ? `<li>${t('intro.reinf')}</li>` : ''}`;
  }
  const RULE_SECS = ['goal', 'move', 'hit', 'terrain', 'fog', 'units', 'obj', 'fires', 'terms'];
  /** 규칙 항목 하나. 수치는 규칙·시나리오 데이터에서 (현재 판의 상태·숨은 정보는 읽지 않음) */
  function ruleSectionHtml(id) {
    const C = GAME_CONFIG, CB = C.COMBAT;
    const li = (s) => `<li>${s}</li>`;
    const pct = (v) => `${v > 0 ? '+' : ''}${v}%`;
    switch (id) {
      case 'goal':
        return `<div class="hint">${t(C.SYMMETRIC ? 'intro.whoAISym' : 'intro.whoAI', SP())}</div><ul>${li(esc(t('rules.flow')))}${victoryLinesHtml()}</ul>`;
      case 'move':
        return `<ul>${introMoveRuleHtml()}${li(t('intro.pass'))}${introActRuleHtml()}${actLimitsOf(ui.act) ? li(esc(t('rules.actShown'))) : ''}</ul>`;
      case 'hit':
        return `<ul>${introHitRuleHtml()}${li(esc(t('rules.dmg', { min: CB.minDamage, pen: CB.hpPenaltyPerLoss })))}</ul>`;
      case 'terrain': {
        const chars = [...new Set(C.MAP.join(''))].filter((ch) => C.TERRAIN[ch]);
        const rows = chars.map((ch) => {
          const ter = C.TERRAIN[ch];
          const notes = [];
          if (ter.impassableFor && ter.impassableFor.length) notes.push(t('rules.ter.blocked', { units: ter.impassableFor.map((k) => U(k)) }));
          if (ter.consumesAll) notes.push(t('rules.ter.endMove'));
          if (ter.partialEntry) notes.push(t('rules.ter.partial'));
          return `<tr><td>${esc(t(terrainNameKey(ter.key)))}</td><td>${ter.moveCost}</td><td>${pct(ter.hitMod)}</td><td>${esc(notes.join(' · '))}</td></tr>`;
        }).join('');
        return `<table class="rules-table"><thead><tr><th>${esc(t('rules.th.terrain'))}</th><th>${esc(t('rules.th.cost'))}</th><th>${esc(t('rules.th.hit'))}</th><th class="wrap">${esc(t('rules.th.note'))}</th></tr></thead><tbody>${rows}</tbody></table>`;
      }
      case 'fog':
        return `<ul>${li(esc(t('rules.fog1')))}${li(esc(t('rules.fog2', { fog: Math.abs(CB.fogPenalty) })))}${li(t('intro.fog'))}</ul>`;
      case 'units': {
        const types = Object.keys(C.UNIT_TYPES).filter(scenarioHasType);
        const rows = types.map((k) => {
          const ty = C.UNIT_TYPES[k];
          return `<tr><td class="ru-name">${symHtml(PLAYER, k)}<span>${esc(t(ty.nameKey))}</span></td><td>${ty.move}</td><td>${ty.vision}</td><td>${ty.canAttack ? `${ty.atkSoft}/${ty.atkArmor}` : '-'}</td><td>${ty.def}</td><td>${esc(rangeText(ty, { side: PLAYER, type: k }))}</td></tr>`
            + `<tr class="ru-desc"><td colspan="6">${esc(t('unitDesc.' + k))}</td></tr>`;
        }).join('');
        return `<table class="rules-table units"><thead><tr><th>${esc(t('rules.th.unit'))}</th><th>${esc(t('rules.th.mv'))}</th><th>${esc(t('rules.th.vis'))}</th><th class="wrap">${esc(t('rules.th.atk'))}</th><th>${esc(t('rules.th.def'))}</th><th>${esc(t('rules.th.rng'))}</th></tr></thead><tbody>${rows}</tbody></table>
          <ul>${li(t('intro.symbols', SP()))}</ul>`;
      }
      case 'obj': {
        const general = C.OBJECTIVE_CONTROL === 'presence' ? li(esc(t('intro.presence'))) + li(esc(t('rules.contest'))) : li(esc(t('rules.sticky')));
        return `<div class="rules-victory"><ul>${victoryLinesHtml()}</ul></div><ul>${general}</ul>`;
      }
      case 'fires': {
        const art = C.UNIT_TYPES.artillery;
        return `<ul>${li(t('intro.arty', { range: rangeText(art, { side: PLAYER, type: 'artillery' }), splash: CB.splashDamage }))}${introFireRuleHtml()}${C.FIRES ? li(esc(t('rules.enemyCd'))) : ''}</ul>`;
      }
      case 'terms':
        return `<ul>${['range', 'cooldown', 'contest', 'fog', 'action', 'moveAttack', 'splash'].map((k) => li(esc(t('rules.term.' + k)))).join('')}</ul>`;
      default: return '';
    }
  }
  /**
   * 규칙 화면 (시작 화면 '규칙 보기', 게임 중 설정의 '규칙', 연습 판의 '?'). 한 번에 한 항목만 펼침.
   * kind 'rules' = 게임 중 (닫으면 같은 화면, 게임 상태는 그대로). 좁은 화면은 전체 화면 시트
   */
  function showRules(back, kind = 'rules') {
    const sc = SCENARIOS.find((x) => x.id === GAME_CONFIG.SCENARIO_ID);
    const open = RULE_SECS.includes(ui.rulesOpen) ? ui.rulesOpen : 'goal';
    showOverlay(`<div class="rules-sheet">
      <div class="rules-head"><h2>${esc(t('rules.title'))}</h2><button class="x-btn rules-x" id="btn-rules-x" aria-label="${esc(t('aria.close'))}">×</button></div>
      <div class="rules-now hint">${esc(t('rules.now', { name: { t: sc.nameKey } }))}</div>
      <div class="rules-list">${RULE_SECS.map((id) => `<details class="rule-sec" data-sec="${id}"${id === open ? ' open' : ''}><summary>${esc(t('rules.sec.' + id))}</summary><div class="rule-body">${ruleSectionHtml(id)}</div></details>`).join('')}</div>
      <div class="btn-row"><button class="primary" id="btn-rules-back">${esc(t('btn.back'))}</button></div>
    </div>`, () => showRules(back, kind), kind);
    const close = () => { ui.rulesBack = null; back(); };
    ui.rulesBack = close;
    const modal = $('#modal');
    modal.querySelectorAll('details.rule-sec').forEach((d) => d.addEventListener('toggle', () => {
      if (!d.open) return;
      ui.rulesOpen = d.dataset.sec;
      modal.querySelectorAll('details.rule-sec').forEach((o) => { if (o !== d) o.open = false; });
    }));
    $('#btn-rules-back').onclick = close;
    $('#btn-rules-x').onclick = close;
    $('#btn-rules-x').focus();
  }
  /** 게임 중 규칙 창: 가림막 중에는 열지 않음 (2인 대전 정보 보호). 닫으면 열기 전 화면으로 */
  function openRulesInGame() {
    if (ui.screen !== 'game' || !ui.viewer) return;
    closePop(false);
    const resultOpen = !!(ui.state && ui.state.winner && $('#overlay').classList.contains('show'));
    showRules(resultOpen ? showResult : hideOverlay, 'rules');
  }

  /* =====================================================================
     튜토리얼 (8단계 실습 + 연습 판). 판정·주사위·안개는 일반 게임과 같은 엔진 호출이고,
     이 코드는 허용 입력 관문, 코치 창, 깜빡이는 표시, 단계 이동만 맡는다. 정답·추천은 보여 주지 않는다
     ===================================================================== */
  const TUT_KEY = 'chuncheon1950.tutorial';   // { seen, done:[단계 id] } — 저장이 안 돼도 동작
  function tutLoad() { try { const v = JSON.parse(localStorage.getItem(TUT_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
  function tutMark(patch) { try { localStorage.setItem(TUT_KEY, JSON.stringify({ ...tutLoad(), ...patch })); } catch (e) { /* 저장 불가 환경 */ } }
  const tutOk = (act) => (act.kind === 'dual'
    ? tutorialAllows(ui.tut.step, { ...act, kind: 'move' }, ui.state, ui.tut.log) || tutorialAllows(ui.tut.step, { ...act, kind: 'preview' }, ui.state, ui.tut.log)
    : tutorialAllows(ui.tut.step, act, ui.state, ui.tut.log));
  /** 지금 목표에 맞는 안내 한 줄 (대상 위치는 이미 보이는 깜빡임으로만 가리킴) */
  function tutHintText() {
    const { step, log } = ui.tut;
    const g = step.goal[tutorialCurrent(step, log, ui.state)];
    if (!g) return t('tut.hintDone');
    const pick = g.unit && ui.selectedId !== g.unit && !['selectBlocked', 'selectCooldown'].includes(g.do);
    const key = pick ? 'select' : ['contested', 'own'].includes(g.do) ? 'attack' : g.do;
    return t('tut.hint', { what: { t: 'tut.what.' + key } });
  }
  function tutBlocked() {
    if (!ui.tut) return;
    ui.tut.hint = tutHintText();
    renderCoach();
    announce(ui.tut.hint);
  }
  /** 입력 기록 → 목표 진행. action 이 null 이면 진행만 다시 셈 */
  function tutRecord(action, events, clearHint = true) {
    if (!ui.tut) return;
    if (action) tutorialRecord(ui.tut.log, action, events, ui.state);
    if (clearHint) ui.tut.hint = null;
    const prog = tutorialProgress(ui.tut.step, ui.tut.log, ui.state);
    if (prog.complete && !ui.tut.complete) {
      ui.tut.complete = true;
      const done = new Set(tutLoad().done || []);
      done.add(ui.tut.step.id);
      tutMark({ done: [...done] });
      announce(t(ui.tut.step.doneKey, tutorialParams()));
    }
    renderCoach();
  }
  /** 턴 종료: 엔진 endTurn + 단계의 정해진 상대 행동 (AI 없음). 로그는 일반 게임처럼 내 시야 기준 */
  function tutEndTurn() {
    const st = ui.state;
    const before = cloneState(st);
    const events = tutorialEndTurn(st, ui.tut.step, ui.tut.rng);
    ui.view = st;
    annotate(events, visMapOf(before, st));
    ui.turnEvents.push(...events);
    logEvents(events);
    tutRecord({ kind: 'endTurn' }, events);
    render();
  }
  /** 튜토리얼 시작 (k 단계). 원래 시나리오·모드는 기억했다가 종료할 때 되돌림 (저장된 시나리오 선택은 건드리지 않음) */
  function startTutorial(k = 0) {
    if (!ui.tut && !ui.practice) { ui.tutBack = GAME_CONFIG.SCENARIO_ID; ui.tutMode = ui.mode; }
    ui.practice = false;
    ui.mode = 'ai';
    tutMark({ seen: true });
    if (GAME_CONFIG.SCENARIO_ID !== TUTORIAL_ID) applyScenario(TUTORIAL_ID, false);
    loadTutStep(k);
  }
  /** 단계 불러오기 (이전·다음·다시 해 보기 모두 여기서 시작 상태로) */
  function loadTutStep(k) {
    const steps = tutorialSteps();
    k = Math.max(0, Math.min(steps.length - 1, k));
    const step = steps[k];
    ui.gameId++;
    ui.busy = false;
    clearFx();
    diceEl.classList.remove('show');
    hideOverlay();
    closePop(false);
    ui.deploy = null;
    ui.tut = { k, step, log: [], rng: createSeededRng(step.seed), hint: null, complete: false };
    ui.state = tutorialState(step);
    ui.view = ui.state;
    ui.viewer = PLAYER;
    ui.selectedId = null;
    ui.inspectId = null;
    ui.actingId = null;
    ui.logs = emptyLogs();
    ui.history = [];
    ui.turnEvents = [];
    ui.flash = new Set();
    ui.unread = 0;
    ui.touchArm = -1;
    ui.coachHtml = '';
    $('#log').innerHTML = '';
    if (ui.endArmed) disarmEnd(false);
    applyModeUi();
    setScreen('game');
    renderLog();
    render();
    fitLayout();
  }
  /** 마지막 단계 뒤: 연습 판 제안 */
  function showPracticeOffer() {
    const sc = findScenario(PRACTICE_ID);
    const n = sc.deployments.filter((d) => d.side === sc.playerSide && !d.round).length;
    showOverlay(`<h2>${esc(t('tut.practice.title'))}</h2><p>${esc(t('tut.practice.body', { n, max: sc.rounds }))}</p>
      <div class="btn-row"><button class="primary" id="btn-practice-go">${esc(t('btn.practiceGo'))}</button><button id="btn-practice-main">${esc(t('btn.toMain'))}</button></div>`, showPracticeOffer, 'confirm');
    $('#btn-practice-go').onclick = startPractice;
    $('#btn-practice-main').onclick = goMenu;
    $('#btn-practice-go').focus();
  }
  /** 연습 판: 일반 규칙·AI 그대로 (중립 AI 쉬움). 코치 창 없음, 위쪽 '?' 로 규칙 */
  function startPractice() {
    if (!ui.tut && !ui.practice) { ui.tutBack = GAME_CONFIG.SCENARIO_ID; ui.tutMode = ui.mode; }
    ui.tut = null;
    ui.practice = true;
    ui.mode = 'ai';
    applyScenario(PRACTICE_ID, false);
    newGame();
  }
  /** 튜토리얼·연습 판을 떠날 때: 원래 시나리오와 모드로 */
  function tutCleanup() {
    const back = ui.tutBack;
    ui.tut = null;
    ui.practice = false;
    if (ui.tutMode) ui.mode = ui.tutMode;
    ui.tutBack = null;
    ui.tutMode = null;
    renderCoach();
    if (back && GAME_CONFIG.SCENARIO_ID !== back) applyScenario(back, false);
  }
  /** 처음 실행할 때 한 번: 튜토리얼을 해 볼까요? */
  function showTutAsk() {
    if (ui.screen !== 'start') setScreen('start');
    render();
    showOverlay(`<div class="start-card tut-ask"><h2>${esc(t('tut.ask.title'))}</h2><p>${esc(t('tut.ask.body'))}</p>
      <div class="btn-row"><button class="primary" id="btn-tut-yes">${esc(t('btn.tutStart'))}</button><button id="btn-tut-later">${esc(t('btn.tutLater'))}</button></div></div>`, showTutAsk, 'start');
    $('#btn-tut-yes').onclick = () => startTutorial(0);
    $('#btn-tut-later').onclick = () => { tutMark({ seen: true }); showIntro(); };
    $('#btn-tut-yes').focus();
  }
  /** 깜빡이는 표시 (눌러 볼 곳만. 좋고 나쁨의 표시가 아님) + 턴 종료 버튼 표시 + 연습 판의 '?' */
  function renderTutMarks() {
    $('#btn-help').hidden = !((ui.tut || ui.practice) && ui.screen === 'game');
    let layer = boardEl.querySelector('.tut-layer');
    const cellsHl = ui.tut && ui.screen === 'game' && !ui.busy ? tutorialHighlight(ui.tut.step, ui.tut.log, ui.state, ui.selectedId) : [];
    const g = ui.tut ? ui.tut.step.goal[tutorialCurrent(ui.tut.step, ui.tut.log, ui.state)] : null;
    $('#btn-end-turn').classList.toggle('tut-pulse-btn', !!g && g.do === 'endTurn');
    if (!cellsHl.length) { if (layer) layer.innerHTML = ''; return; }
    if (!layer) { layer = document.createElement('div'); layer.className = 'tut-layer'; layer.setAttribute('aria-hidden', 'true'); boardEl.appendChild(layer); }
    layer.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    layer.style.gridTemplateRows = `repeat(${N}, 1fr)`;
    layer.innerHTML = cellsHl.map(([r, c]) => `<div class="tut-pulse" style="grid-row:${r + 1};grid-column:${c + 1}"></div>`).join('');
  }
  /** 코치 창: 진행 점, n/8, 제목, 문구(넘치면 문구만 스크롤), 안내 한 줄, 이전·다시 해 보기·다음·종료 */
  function renderCoach() {
    const el = $('#coach');
    if (!ui.tut || ui.screen !== 'game') { if (!el.hidden) { el.hidden = true; el.innerHTML = ''; ui.coachHtml = ''; } return; }
    const steps = tutorialSteps(), { k, step } = ui.tut, max = steps.length;
    const prog = tutorialProgress(step, ui.tut.log, ui.state);
    const P = tutorialParams();
    const doneIds = new Set(tutLoad().done || []);
    if (prog.complete) doneIds.add(step.id);
    const dots = steps.map((s, i) => `<span class="cdot${i === k ? ' cur' : ''}${doneIds.has(s.id) ? ' done' : ''}"></span>`).join('');
    const html = `<div class="coach-head"><span class="coach-dots" aria-hidden="true">${dots}</span><span class="coach-n" aria-label="${esc(t('aria.tutProgress', { n: k + 1, max }))}">${esc(t('tut.progress', { n: k + 1, max }))}</span>`
      + `<span class="coach-title tx">${esc(t(step.titleKey))}</span>${prog.complete ? `<span class="chip green sm">${esc(t('tut.doneChip'))}</span>` : ''}</div>`
      + `<div class="coach-text">${esc(t(step.textKey, P))}${prog.complete ? `<div class="coach-done">${esc(t(step.doneKey, P))}</div>` : ''}</div>`
      + `<div class="coach-hint" role="status">${ui.tut.hint ? esc(ui.tut.hint) : ''}</div>`
      + `<div class="coach-btns"><button id="tut-prev"${k === 0 ? ' disabled' : ''}>${esc(t('btn.tutPrev'))}</button><button id="tut-retry">${esc(t('btn.tutRetry'))}</button>`
      + `<button id="tut-next"${prog.complete ? ' class="primary"' : ''}>${esc(t('btn.tutNext'))}</button><button id="tut-exit">${esc(t('btn.tutExit'))}</button></div>`;
    el.hidden = false;
    if (html === ui.coachHtml) return;   // 같은 내용이면 다시 그리지 않음 (버튼 초점 유지)
    const focusId = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
    ui.coachHtml = html;
    el.innerHTML = html;
    $('#tut-prev').onclick = () => loadTutStep(k - 1);
    $('#tut-retry').onclick = () => loadTutStep(k);
    $('#tut-next').onclick = () => (k + 1 < max ? loadTutStep(k + 1) : showPracticeOffer());
    $('#tut-exit').onclick = goMenu;
    if (focusId && $('#' + focusId)) $('#' + focusId).focus();
  }

  /* ---------- 게임 기록 (묶음별 누적, localStorage). 값은 언어와 무관한 코드값 ---------- */
  const RECORD_KEY = 'chuncheon1950.gameRecords';
  function loadGameRecords() {
    try {
      const v = JSON.parse(localStorage.getItem(RECORD_KEY) || '{}');
      if (!v || typeof v !== 'object') return {};
      // 행동 제한 이전(rulesVersion 5 이하) 기록은 제한 없음으로 간주
      for (const list of Object.values(v)) for (const r of list || []) {
        if (!('activationLimit' in r)) r.activationLimit = null;
        if (!('activationCustom' in r)) r.activationCustom = false;
      }
      return v;
    } catch (e) { return {}; }
  }
  function saveGameRecord(st) {
    if (ui.recordedGameId === ui.gameId) return;   // 한 판에 한 번만
    ui.recordedGameId = ui.gameId;
    const rec = buildGameRecord(st, ui.difficulty, hotseat() ? 'hotseat' : 'ai');   // 난이도 = 프로필 id
    const base = rec.mode === 'ai' ? rec.difficulty : 'hotseat';   // 누적 묶음: AI 는 난이도별, 2인은 따로
    const group = rec.scenarioId === DEFAULT_SCENARIO_ID ? base : `${rec.scenarioId}:${base}`;   // 춘천은 예전 묶음 이름 그대로
    const all = loadGameRecords();
    (all[group] = all[group] || []).push(rec);
    try { localStorage.setItem(RECORD_KEY, JSON.stringify(all)); } catch (e) { /* 저장 불가 환경 */ }
    // 게임이 끝난 뒤에만 출력 (진행 중에는 콘솔에 아무것도 남기지 않음)
    console.log(t('rec.console', {
      mode: { t: rec.mode === 'ai' ? 'mode.ai' : 'mode.hotseat' }, diff: rec.difficulty ? resolveProfile(rec.difficulty).name : '-',
      scen: { t: SCENARIOS.find((x) => x.id === rec.scenarioId).nameKey },
      winner: rec.winner === 'draw' ? { t: 'result.titleDraw' } : S(rec.winner), round: rec.round, reason: REASON(rec.reason), ...SP(),
      dl: rec[`${DEF()}Losses`], al: rec[`${ATT()}Losses`], obj: rec.objectivesCaptured,
    }));
    console.table(summarizeGameRecords(all));
  }
  // 콘솔에서 확인/초기화용
  window.getGameRecords = loadGameRecords;
  window.clearGameRecords = () => { try { localStorage.removeItem(RECORD_KEY); } catch (e) { /* 무시 */ } };

  /** 승패 화면: 전장 전체 공개(안개 해제, 적 유닛 모두 표시) 위에 결과 카드 */
  function showResult() {
    const st = ui.state;
    if (!st.winner) return;
    const draw = st.winner === 'draw';
    if (ui.recordedGameId !== ui.gameId) {
      const m = draw ? M('log.draw', { reason: REASON(st.winReason) }, 'sys') : M('log.victory', { side: S(st.winner), reason: REASON(st.winReason) }, 'sys');
      addLog(m);
      if (!ui.history.some((h) => h.final)) ui.history.push({ ...m, final: true });
    }
    if (!ui.practice) saveGameRecord(st);   // 연습 판은 게임 기록에 넣지 않음
    if (ui.viewer !== 'all') {
      ui.viewer = 'all';
      ui.selectedId = null;
      ui.inspectId = null;
      ui.view = st;
      hideTip();
      closePop(false);
      renderLog();
      render();
    }
    const C = GAME_CONFIG;
    const hs = hotseat();
    const win = st.winner === PLAYER;
    const title = draw ? t('result.titleDraw') : hs ? t('result.titleWin', { side: S(st.winner) }) : t(win ? 'result.titleWin' : 'result.titleLose', { side: S(PLAYER) });
    const cls = draw ? 'draw' : hs ? ROLE(st.winner) : (win ? 'win' : 'lose');
    const reason = draw && st.winReason === 'annihilation' ? t('result.r.drawAnnihilation')
      : t('result.r.' + st.winReason + (st.score && ['limitHp', 'limitDraw'].includes(st.winReason) ? 'Points' : ''), { winner: S(st.winner), loser: S(enemyOf(st.winner)), n: reasonParams(st.winReason).n, target: GAME_CONFIG.SCORE_TARGET })
        + (st.score ? ' (' + t('result.finalScore', { a: S(PLAYER), b: S(AI_SIDE), sa: st.score[PLAYER], sb: st.score[AI_SIDE] }) + ')' : '');
    const rec = buildGameRecord(st, ui.difficulty, hs ? 'hotseat' : 'ai');   // 손실 수는 기록과 같은 계산
    // 전장에 나온 유닛 수 (시작 배치 + 이미 도착한 증원). 도착하지 않은 증원은 세지 않음
    const startN = (s) => sideTotalUnits(s) - (st.pending || []).filter((p) => p.side === s).length;
    const alive = Object.fromEntries(C.ROUND_ORDER.map((s) => [s, startN(s) - rec[`${s}Losses`]]));
    const held = st.objectives.filter((o) => o.owner === PLAYER).length;
    const scoreBox = st.score ? () => box(`${st.score[PLAYER]} : ${st.score[AI_SIDE]}`, t('result.box.score')) : null;
    const box = (v, k) => `<div class="num-box"><div class="v">${esc(v)}</div><div class="k tx" title="${esc(k)}">${esc(k)}</div></div>`;
    const round = box(`${st.round}/${C.MAX_ROUNDS}`, t('result.box.round'));
    const boxes = hs
      ? round + box(`${alive[DEF()]}/${startN(DEF())}`, t('result.box.aliveSide', { side: S(DEF()) })) + box(`${alive[ATT()]}/${startN(ATT())}`, t('result.box.aliveSide', { side: S(ATT()) }))
        + (scoreBox ? scoreBox() : box(`${held}/${C.OBJECTIVES.length}`, t('result.box.objSide', { side: S(PLAYER) })))
      : round + box(`${alive[PLAYER]}/${startN(PLAYER)}`, t('result.box.alive')) + box(t('result.kills', { n: rec[AI_SIDE + 'Losses'] }), t('result.box.kills'))
        + (scoreBox ? scoreBox() : box(`${held}/${C.OBJECTIVES.length}`, t('result.box.obj')));
    const chips = ui.practice ? `<span class="chip">${esc(t('scen.practice.name'))}</span>`
      : `<span class="chip">${esc(t(hs ? 'mode.hotseatShort' : 'mode.ai'))}</span>${hs ? '' : `<span class="chip">${esc(resolveProfile(ui.difficulty).name)}</span>`}`;
    showOverlay(`<span class="chip blue reveal-chip"><span class="tx">${esc(t('result.revealChip'))}</span></span>
      <div class="result-card"><h2 class="result-title ${cls}">${esc(title)}</h2>
        <div class="result-reason">${esc(reason)}</div>
        <div class="chips-c">${chips}</div>
        <div class="num-grid">${boxes}</div>
        <div class="btn-row"><button class="primary" id="btn-again">${esc(t('btn.again'))}</button><button id="btn-menu2">${esc(t(ui.practice ? 'btn.toMain' : 'btn.menu'))}</button>`
      + (ui.practice ? `<button id="btn-rules-res">${esc(t('btn.rulesView'))}</button>` : '')
      + `<button id="btn-close">${esc(t('btn.viewMap'))}</button><button id="btn-replay">${esc(t('btn.replay'))}</button></div></div>`, showResult, 'result');
    announce(`${title}. ${reason}`);
    $('#btn-again').onclick = newGame;
    $('#btn-close').onclick = hideOverlay;
    $('#btn-menu2').onclick = goMenu;
    $('#btn-replay').onclick = showReplay;
    if ($('#btn-rules-res')) $('#btn-rules-res').onclick = () => showRules(showResult, 'rules');
    $('#btn-again').focus();
  }

  /** 전투 되돌아보기: 양쪽 시점과 무관한 전체 기록 (게임 종료 후에만) */
  function showReplay() {
    if (!ui.state || !ui.state.winner) return;
    const rows = ui.history.map((h) => `<div class="logline ${h.cls === 'bad' || h.cls === 'sys' ? h.cls : ''}" data-bar="${esc(barOf(h))}">${esc(tr(h))}</div>`).join('');
    showOverlay(`<h2>${esc(t('replay.title'))}</h2><div class="hint">${esc(t('replay.count', { n: ui.history.length }))}</div>
      <div class="replay">${rows}</div>
      <div class="btn-row"><button class="primary" id="btn-replay-back">${esc(t('btn.toResult'))}</button><button id="btn-replay-close">${esc(t('btn.viewMap'))}</button></div>`, showReplay, 'result');
    $('#btn-replay-back').onclick = showResult;
    $('#btn-replay-close').onclick = hideOverlay;
    $('#btn-replay-back').focus();
  }

  /** 처음 화면(모드 선택)으로. 진행 중이던 게임·연출은 버리고, 화면 정보도 지움 */
  function goMenu() {
    if (ui.tut || ui.practice) tutCleanup();
    ui.gameId++;
    ui.busy = false;
    clearFx();
    diceEl.classList.remove('show');
    ui.deploy = null;
    clearScreen();
    ui.state = createInitialState();
    ui.view = ui.state;
    ui.viewer = PLAYER;
    ui.logs = emptyLogs();
    ui.history = [];
    $('#log').innerHTML = '';
    hideOverlay();
    showIntro();
  }

  /* =====================================================================
     화면 전환 · 레이아웃 (넓은/좁은 화면 판정, 지도 자동 확대)
     ===================================================================== */
  /** 'start' | 'deploy' | 'game' | 'curtain'. 가림막 동안에는 지도를 DOM 에서 떼어 냄 (CSS 로 가리기만 하지 않음) */
  function setScreen(name) {
    ui.screen = name;
    document.body.dataset.screen = name;
    if (name === 'curtain') { if (boardWrapEl.isConnected) boardWrapEl.remove(); }
    else if (!boardWrapEl.isConnected) $('#map-host').appendChild(boardWrapEl);
    if (name !== 'game' && name !== 'deploy') { closePop(false); if (ui.drawerOpen) setDrawer(false); }
    $('#tray').hidden = name !== 'deploy';
    $('#logbar').hidden = name === 'deploy' && !ui.wide;   // 좁은 배치 화면: 로그 바 대신 지도·트레이를 크게
    fitLayout();
  }
  const sideWidth = (W) => { const L = DESIGN.layout; return Math.round(Math.min(L.sideMax, Math.max(L.sideMin, W * L.sideVw))); };
  function fitLayout() {
    const L = DESIGN.layout;
    const W = window.innerWidth, H = window.innerHeight;
    const compact = !(W >= L.wideMinW && W / H >= L.wideMinAspect) && W / H >= L.wideMinAspect && H < L.compactMaxH;
    const wide = (W >= L.wideMinW && W / H >= L.wideMinAspect) || compact;   // compact 는 넓은 화면 배치를 작은 크기로
    const changed = wide !== ui.wide || compact !== ui.compact;
    ui.wide = wide;
    ui.compact = compact;
    const app = $('#app');
    app.classList.toggle('wide', wide);
    app.classList.toggle('narrow', !wide);
    app.classList.toggle('compact', compact);
    const root = document.documentElement.style;
    const sw = sideWidth(W);
    root.setProperty('--side-w', sw + 'px');
    const lbl = wide && !compact ? L.lblWide : L.lblNarrow;
    root.setProperty('--lbl', lbl + 'px');
    const cf = $('#card-full');
    if (wide && !compact) { cf.removeAttribute('role'); cf.removeAttribute('aria-modal'); }
    else { cf.setAttribute('role', 'dialog'); cf.setAttribute('aria-label', t('panel.unit')); }
    if (changed) {
      if (ui.pop === 'card' && wide && !compact) closePop(false);
      $('#logbar').hidden = ui.screen === 'deploy' && !wide;
      if (ui.state && ui.screen !== 'start') { renderHeader(); renderPanel(); }
    } else fitHud();
    renderLogbar();
    root.setProperty('--abar-free', '0px');   // 올리기 전 높이로 지도 크기 계산
    const abarH = wide ? 0 : $('#controls').offsetHeight;   // 바닥 안전 영역 포함. 높이는 CSS 고정값 (숨김 상태에서 잰 0 이 굳지 않게 JS 로 덮어쓰지 않음)
    const extra = lbl + L.frameBorder;
    let availW, availH;
    if (ui.screen === 'start' || ui.screen === 'curtain') {
      availW = W - 2 * L.gap;
      availH = H - 2 * L.gap;
    } else if (wide) {
      const hudH = $('#hud').offsetHeight, logH = $('#logbar').offsetHeight;
      const g = compact ? L.narrowGap : L.gap;
      availH = H - hudH - logH - 6 - 2 * g;
      availW = W - sw - (ui.drawerOpen ? sw + g : 0) - 3 * g;
    } else {
      const hudH = $('#hud').offsetHeight, logH = $('#logbar').hidden ? 0 : $('#logbar').offsetHeight + L.narrowGap;
      ui.lastSideH = $('#side').offsetHeight;   // 요약 카드 또는 트레이 (액션 바는 고정)
      availW = W - L.narrowSide;
      availH = H - hudH - logH - ui.lastSideH - abarH - 3 * L.narrowGap;
    }
    let cell = Math.floor((Math.min(availW, availH) - extra) / N);
    cell = Math.max(L.cellFloor, Math.min(L.cellMax, cell));   // cellMin 미만이면 하단 UI 를 우선 (지도가 더 작아짐)
    root.setProperty('--cell', cell + 'px');
    ui.cellSize = cell;
    themeOnLayout();
    if (!wide && (ui.screen === 'game' || ui.screen === 'deploy')) {   // 게임 화면 아래 빈 공간만큼 조작 줄을 올림 (게임 중에는 높이가 같아 위치 고정)
      const free = H - $('#side').getBoundingClientRect().bottom - L.narrowGap - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--abar-h'));
      root.setProperty('--abar-free', Math.max(0, Math.floor(free)) + 'px');
    }
    if (ui.confirm) keepUnitsAboveSheet();
  }
  let layoutRaf = 0;
  const onResize = () => { cancelAnimationFrame(layoutRaf); layoutRaf = requestAnimationFrame(() => { hideBalloon(); hideTip(); fitLayout(); }); };

  /* ---------- 로그 드로어 / 팝업 (범례·설정·좁은 화면 카드 시트) ---------- */
  function setDrawer(open, restoreFocus = false) {
    open = !!open;
    if (open && !ui.wide) closePop(false);   // 좁은 화면: 시트는 한 번에 하나
    ui.drawerOpen = open;
    $('#app').classList.toggle('drawer-open', open);
    if (open) ui.unread = 0;
    renderLogbar();
    fitLayout();
    if (!open && restoreFocus) $('#btn-log').focus();
  }
  function toggleDrawer() { if (ui.screen === 'game' || ui.screen === 'deploy') setDrawer(!ui.drawerOpen, ui.drawerOpen); }

  const POPS = {
    legend: { el: '#pop-legend', btn: '#btn-legend' },
    settings: { el: '#pop-settings', btn: '#btn-settings' },
    card: { el: '#card-full', btn: '#card-sum' },
  };
  const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  /** 범례와 설정은 서로 배타적. 좁은 화면에서는 로그 시트와도 배타적 */
  function openPop(name) {
    if (ui.pop === name) return;
    if (name === 'card' && ui.wide && !ui.compact) return;
    closePop(false);
    if (!ui.wide && ui.drawerOpen) setDrawer(false);
    const p = POPS[name];
    ui.popReturn = $(p.btn);   // 닫으면 여는 버튼으로 포커스를 돌려줌
    ui.pop = name;
    if (name === 'card') $('#card').classList.add('expanded'); else $(p.el).hidden = false;
    $(p.btn).setAttribute('aria-expanded', 'true');
    if (name === 'legend') renderLegend();
    const f = focusables($(p.el))[0];
    if (f) f.focus();
  }
  function closePop(restore = true) {
    const name = ui.pop;
    if (!name) return;
    const p = POPS[name];
    if (name === 'card') $('#card').classList.remove('expanded'); else $(p.el).hidden = true;
    $(p.btn).setAttribute('aria-expanded', 'false');
    ui.pop = null;
    const back = ui.popReturn;
    ui.popReturn = null;
    if (restore && back && back.isConnected && back.offsetParent && !back.disabled) back.focus();
  }
  function togglePop(name) {
    if (ui.screen !== 'game' && ui.screen !== 'deploy') return;
    if (ui.pop === name) closePop(); else openPop(name);
  }
  /** Tab 키: 열린 창(오버레이 > 팝업) 안에서만 포커스가 돌게 함 */
  function trapFocus(e) {
    const ov = $('#overlay');
    const box = ov.classList.contains('show') ? $('#modal') : (ui.pop ? $(POPS[ui.pop].el) : null);
    if (!box) return;
    const f = focusables(box);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- 언어 ---------- */
  const LANG_KEY = 'lang';
  function initialLang() {
    try { const v = localStorage.getItem(LANG_KEY); if (v && STRINGS[v]) return v; } catch (e) { /* 저장 불가 환경 */ }
    return (navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : 'en';
  }
  /** 정적 문구(data-i18n)와 아이콘 버튼·창의 aria-label 을 현재 언어로 */
  function applyStaticStrings() {
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('#lang-seg [data-lang], #seg-lang [data-lang]').forEach((b) => {
      const on = b.dataset.lang === getLang();
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    for (const id of ['#lang-seg', '#seg-lang']) $(id).setAttribute('aria-label', t('lang.label'));
    $('#speed-seg').setAttribute('aria-label', t(hotseat() ? 'speed.fx' : 'speed.ai'));
    $('#seg-signal').setAttribute('aria-label', t('lbl.signalToggle'));
    $('#seg-reduce').setAttribute('aria-label', t('lbl.reduceMotion'));
    $('#btn-log').setAttribute('aria-label', t('aria.log'));
    $('#btn-legend').setAttribute('aria-label', t('aria.legend'));
    $('#btn-settings').setAttribute('aria-label', t('aria.settings'));
    $('#btn-log').title = t('aria.log');
    $('#btn-legend').title = t('aria.legend');
    $('#btn-settings').title = t('aria.settings');
    $('#pop-legend').setAttribute('aria-label', t('panel.legend'));
    $('#pop-settings').setAttribute('aria-label', t('settings.title'));
    $('#drawer').setAttribute('aria-label', t('panel.log'));
    $('#legend-tabs').setAttribute('aria-label', t('panel.legend'));
    $('#hud').setAttribute('aria-label', t('aria.hud'));
  }
  /** 게임 도중에도 전환 가능: 진행 상태와 진행 중인 연출은 그대로 두고 화면 문구만 다시 그림 */
  function setLanguage(lang) {
    setLang(lang);
    try { localStorage.setItem(LANG_KEY, getLang()); } catch (e) { /* 저장 불가 환경 */ }
    document.documentElement.lang = getLang();
    document.title = t('app.docTitle');
    applyStaticStrings();
    applyScenarioStrings();
    applyModeUi();
    renderActSettings();
    renderFireSettings();
    renderThemeSettings();
    renderLegend();
    renderDiffSelect();
    hideTip();
    hideBalloon();
    if (ui.state) { render(); renderLog(); }
    if (ui.overlay && $('#overlay').classList.contains('show')) {
      const confirm = ui.confirm;
      ui.overlay();
      if (confirm && !ui.confirm) ui.confirm = confirm;
    }
    fitLayout();
  }

  /* ---------- 설정 ---------- */
  const REDUCE_KEY = 'reduceMotion';
  function initialReduceMotion() {
    try { const v = localStorage.getItem(REDUCE_KEY); if (v === '1' || v === '0') return v === '1'; } catch (e) { /* 저장 불가 환경 */ }
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  const syncSeg = (sel, on) => document.querySelectorAll(sel + ' [data-v]').forEach((b) => {
    const a = (b.dataset.v === '1') === on;
    b.classList.toggle('active', a);
    b.setAttribute('aria-pressed', String(a));
  });
  /** 다음 연출부터 적용 (진행 중인 연출은 그대로 끝남) */
  function setReduceMotion(on, save = true) {
    ui.reduceMotion = !!on;
    document.body.classList.toggle('reduce-motion', ui.reduceMotion);
    syncSeg('#seg-reduce', ui.reduceMotion);
    if (save) { try { localStorage.setItem(REDUCE_KEY, ui.reduceMotion ? '1' : '0'); } catch (e) { /* 저장 불가 환경 */ } }
    renderLegend();
    if (ui.state) render();   // 링 맥박 켜기/끄기
  }
  function setShowSignal(on) {
    ui.showSignal = !!on;
    syncSeg('#seg-signal', ui.showSignal);
    try { localStorage.setItem(SIGNAL_ZONE_KEY, ui.showSignal ? '1' : '0'); } catch (err) { /* 저장 불가 환경 */ }
    if (ui.state) render();
  }

  /* ---------- 화면 테마 (기본 / PC 리치) ---------- */
  function setThemePref(v) {
    ui.themePref = v;
    try { localStorage.setItem(THEME_KEY, v); } catch (e) { /* 저장 불가 환경 */ }
    applyTheme();
  }
  function setGridAlways(on) {
    ui.gridAlways = !!on;
    try { localStorage.setItem(GRID_KEY, ui.gridAlways ? '1' : '0'); } catch (e) { /* 저장 불가 환경 */ }
    applyTheme();
  }
  /** 설정의 테마 항목: 리치를 쓸 수 있는 화면 배치에서만 보임 (RICH_ON_PHONE 이 false 면 PC 넓은 화면만) */
  function renderThemeSettings() {
    const box = $('#theme-rows');
    if (!box) return;
    box.hidden = !richLayout();
    const art = !!scenArt(), want = wantTheme();
    document.querySelectorAll('#seg-theme [data-theme]').forEach((b) => {
      const a = b.dataset.theme === want;
      b.classList.toggle('active', a);
      b.setAttribute('aria-pressed', String(a));
      if (b.dataset.theme === 'rich') b.disabled = !art;
    });
    syncSeg('#seg-grid', ui.gridAlways);
    document.querySelectorAll('#seg-grid [data-v]').forEach((b) => { b.disabled = !art || want !== 'rich'; });
    const note = !art ? t('theme.noArt') : artStatus() === 'fail' && want === 'rich' ? t('theme.loadFail') : artStatus() === 'loading' && want === 'rich' ? t('theme.loading') : '';
    const el = $('#theme-note');
    el.hidden = !note;
    el.textContent = note;
    el.title = note;
  }

  /* ---------- 행동 제한 설정 (시나리오별 localStorage). 값은 그 진영의 다음 턴부터 적용 ---------- */
  const ACT_KEY = 'chuncheon1950.activationLimits';
  const ROLES = ['def', 'att'];
  const actMax = (role) => sideTotalUnits(sideByRole(role));   // 그 진영의 최대 유닛 수 (증원 포함)
  function actDefaults() {
    const a = GAME_CONFIG.ACTIVATIONS;
    return { on: !!GAME_CONFIG.ENABLE_ACTIVATION_LIMIT, def: a ? a.def ?? null : null, att: a ? a.att ?? null : null };
  }
  /** 저장값 → ui.act = { on, def, att } (값 null = 제한 없음). 범위를 벗어난 값은 제한 없음으로 */
  function loadActPref() {
    let p = actDefaults();
    try {
      const all = JSON.parse(localStorage.getItem(ACT_KEY) || '{}');
      const v = all && all[GAME_CONFIG.SCENARIO_ID];
      if (v && typeof v === 'object') {
        p = { on: v.on !== false };
        for (const r of ROLES) p[r] = Number.isInteger(v[r]) && v[r] >= 1 && v[r] <= actMax(r) ? v[r] : null;
      }
    } catch (e) { /* 저장 불가 환경 */ }
    ui.act = p;
    return p;
  }
  function saveActPref() {
    try {
      const all = JSON.parse(localStorage.getItem(ACT_KEY) || '{}') || {};
      all[GAME_CONFIG.SCENARIO_ID] = { on: ui.act.on, def: ui.act.def, att: ui.act.att };
      localStorage.setItem(ACT_KEY, JSON.stringify(all));
    } catch (e) { /* 저장 불가 환경 */ }
  }
  /** 설정 → 엔진의 state.actLimits ({def, att} 또는 null) */
  function actLimitsOf(p) {
    if (!p || !p.on || !GAME_CONFIG.ENABLE_ACTIVATION_LIMIT) return null;
    return p.def == null && p.att == null ? null : { def: p.def, att: p.att };
  }
  /** 설정을 바꿈: 진행 중인 게임은 다음 턴 시작부터 (engine startActivations 가 그때 읽음) */
  function setActPref(next) {
    ui.act = { ...ui.act, ...next };
    saveActPref();
    if (ui.state) ui.state.actLimits = actLimitsOf(ui.act);
    renderActSettings();
    renderLegend();
  }
  function renderActSettings() {
    if (!ui.act) loadActPref();
    const p = ui.act;
    syncSeg('#seg-act', p.on);
    $('#seg-act').setAttribute('aria-label', t('lbl.actLimit'));
    const rows = GAME_CONFIG.ROUND_ORDER.map((side) => {
      const role = ROLE(side), v = p[role];
      const val = v == null ? t('act.unlimited') : String(v);
      const name = S(side);
      const lbl = t('act.sideLbl', { side: name });
      const off = !p.on;
      return `<div class="set-row act-row"><span class="set-lbl tx" title="${esc(lbl)}">${esc(lbl)}</span>`
        + `<div class="stepper" role="group" aria-label="${esc(t('aria.actVal', { side: name, v: val }))}">`
        + `<button type="button" data-act-role="${role}" data-d="-1" aria-label="${esc(t('aria.actDec', { side: name }))}"${off || v === 1 ? ' disabled' : ''}>−</button>`
        + `<output class="tx" aria-live="polite" title="${esc(val)}">${esc(val)}</output>`
        + `<button type="button" data-act-role="${role}" data-d="1" aria-label="${esc(t('aria.actInc', { side: name }))}"${off || v == null ? ' disabled' : ''}>+</button>`
        + `</div></div>`;
    }).join('');
    $('#act-rows').innerHTML = rows
      + `<div class="act-foot"><span class="hint tx" title="${esc(t('act.nextTurn'))}">${esc(t('act.nextTurn'))}</span>`
      + `<button type="button" id="btn-act-reset">${esc(t('btn.actReset'))}</button></div>`;
    $('#act-rows').setAttribute('aria-label', t('lbl.actLimit'));
    $('#act-rows').querySelectorAll('[data-act-role]').forEach((b) => {
      b.onclick = () => {
        const role = b.dataset.actRole, max = actMax(role), d = Number(b.dataset.d);
        const cur = ui.act[role];
        // 1 … 최대 유닛 수 → 제한 없음
        let next = cur == null ? (d < 0 ? max : null) : cur + d;
        if (next != null && next > max) next = null;
        if (next != null && next < 1) next = 1;
        setActPref({ [role]: next });
        const again = $(`#act-rows [data-act-role="${role}"][data-d="${d}"]`);
        const back = $(`#act-rows [data-act-role="${role}"][data-d="${-d}"]`);
        if (again && !again.disabled) again.focus(); else if (back) back.focus();
      };
    });
    $('#btn-act-reset').onclick = () => setActPref(actDefaults());
  }

  /* ---------- 화력 설정 (fires 시나리오, 시나리오별 localStorage). 값은 그 진영의 다음 턴부터 적용 ---------- */
  const FIRE_KEY = 'chuncheon1950.fires';
  const scenarioHasType = (type) => GAME_CONFIG.ROUND_ORDER.some((s) => GAME_CONFIG.DEPLOYMENT[s].some((d) => d.type === type) || GAME_CONFIG.REINFORCEMENTS.some((g) => g.side === s && g.type === type));
  const fireItems = () => (GAME_CONFIG.FIRES ? DESIGN.fireSettings.filter((it) => GAME_CONFIG.FIRES[it.type] && scenarioHasType(it.type)) : []);
  function fireDefaults() {
    const F = GAME_CONFIG.FIRES || {}, p = {};
    for (const it of fireItems()) { p[it.type] = p[it.type] || {}; p[it.type][it.key] = F[it.type][it.key] ?? 0; }
    return p;
  }
  /** 저장값 → ui.fire = { 병종: { 항목: 값 } }. 범위를 벗어나거나 없는 값은 시나리오 기본값 */
  function loadFirePref() {
    const p = fireDefaults();
    try {
      const all = JSON.parse(localStorage.getItem(FIRE_KEY) || '{}');
      const v = all && all[GAME_CONFIG.SCENARIO_ID];
      if (v && typeof v === 'object') for (const it of fireItems()) {
        const x = v[it.type] && v[it.type][it.key];
        if (Number.isInteger(x) && x >= it.min && x <= it.max) p[it.type][it.key] = x;
      }
    } catch (e) { /* 저장 불가 환경 */ }
    ui.fire = p;
    return p;
  }
  function saveFirePref() {
    try {
      const all = JSON.parse(localStorage.getItem(FIRE_KEY) || '{}') || {};
      all[GAME_CONFIG.SCENARIO_ID] = ui.fire;
      localStorage.setItem(FIRE_KEY, JSON.stringify(all));
    } catch (e) { /* 저장 불가 환경 */ }
  }
  /** 설정 → 엔진의 state.firesOv (안개 속 사격 여부는 넣지 않음: 시나리오 값만) */
  const firesOvOf = (p) => JSON.parse(JSON.stringify(p || fireDefaults()));
  function setFirePref(type, key, val) {
    ui.fire = { ...ui.fire, [type]: { ...ui.fire[type], [key]: val } };
    saveFirePref();
    if (ui.state && GAME_CONFIG.FIRES) ui.state.firesOv = firesOvOf(ui.fire);   // engine startFires 가 그 진영의 다음 턴에 읽음
    renderFireSettings();
  }
  function renderFireSettings() {
    const box = $('#fire-rows');
    const items = fireItems();
    box.hidden = !items.length;   // 간접 화력 설정이 없는 시나리오(춘천)에서는 숨김
    if (!items.length) { box.innerHTML = ''; return; }
    if (!ui.fire || items.some((it) => !ui.fire[it.type] || ui.fire[it.type][it.key] == null)) loadFirePref();
    const rows = items.map((it) => {
      const v = ui.fire[it.type][it.key];
      const lbl = t('fire.lbl.' + it.key, { unit: U(it.type) });
      const val = t('fire.val.' + it.key, { n: v });
      return `<div class="set-row act-row"><span class="set-lbl tx" title="${esc(lbl)}">${esc(lbl)}</span>`
        + `<div class="stepper" role="group" aria-label="${esc(lbl + ': ' + val)}">`
        + `<button type="button" data-fire="${it.type}.${it.key}" data-d="-1" aria-label="${esc(t('aria.fireDec', { what: lbl }))}"${v <= it.min ? ' disabled' : ''}>−</button>`
        + `<output class="tx" aria-live="polite" title="${esc(val)}">${esc(val)}</output>`
        + `<button type="button" data-fire="${it.type}.${it.key}" data-d="1" aria-label="${esc(t('aria.fireInc', { what: lbl }))}"${v >= it.max ? ' disabled' : ''}>+</button>`
        + `</div></div>`;
    }).join('');
    box.innerHTML = `<div class="set-row"><span class="set-lbl tx" title="${esc(t('tip.fires'))}">${esc(t('lbl.fires'))}</span></div>` + rows
      + `<div class="act-foot"><span class="hint tx" title="${esc(t('act.nextTurn'))}">${esc(t('act.nextTurn'))}</span>`
      + `<button type="button" id="btn-fire-reset">${esc(t('btn.actReset'))}</button></div>`;
    box.setAttribute('aria-label', t('lbl.fires'));
    box.querySelectorAll('[data-fire]').forEach((b) => {
      b.onclick = () => {
        const [type, key] = b.dataset.fire.split('.'), d = Number(b.dataset.d);
        const it = items.find((x) => x.type === type && x.key === key);
        const next = Math.max(it.min, Math.min(it.max, ui.fire[type][key] + d * it.step));
        setFirePref(type, key, next);
        const again = box.querySelector(`[data-fire="${type}.${key}"][data-d="${d}"]`);
        const back = box.querySelector(`[data-fire="${type}.${key}"][data-d="${-d}"]`);
        if (again && !again.disabled) again.focus(); else if (back) back.focus();
      };
    });
    $('#btn-fire-reset').onclick = () => {
      ui.fire = fireDefaults();
      saveFirePref();
      if (ui.state && GAME_CONFIG.FIRES) ui.state.firesOv = firesOvOf(ui.fire);
      renderFireSettings();
    };
  }

  /* ---------- 바인딩 ---------- */
  $('#btn-end-turn').onclick = onEndTurn;
  $('#btn-wait').onclick = () => {
    if (!playerCanAct() || !ui.selectedId) return;
    if (ui.tut) { tutBlocked(); return; }   // 튜토리얼: 행동 끝내기는 단계 입력이 아님
    finishUnit(ui.state, ui.selectedId);
    ui.selectedId = null;
    hideTip();
    closePop(false);
    render();
  };
  $('#btn-deselect').onclick = () => { ui.selectedId = null; hideTip(); closePop(false); render(); };
  $('#btn-restart').onclick = () => { closePop(false); if (ui.tut) loadTutStep(ui.tut.k); else newGame(); };
  $('#btn-rules-game').onclick = openRulesInGame;
  $('#btn-help').onclick = openRulesInGame;
  $('#btn-menu').onclick = () => { closePop(false); goMenu(); };
  $('#difficulty-select').onchange = (e) => { ui.difficulty = e.target.value; e.target.title = resolveProfile(ui.difficulty).description; };
  document.querySelectorAll('#lang-seg [data-lang], #seg-lang [data-lang]').forEach((b) => { b.onclick = () => setLanguage(b.dataset.lang); });
  document.querySelectorAll('#speed-seg button').forEach((b) => {
    b.onclick = () => {
      ui.speed = b.dataset.speed;   // 다음 연출부터 적용
      document.querySelectorAll('#speed-seg button').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    };
  });
  document.querySelectorAll('#seg-signal [data-v]').forEach((b) => { b.onclick = () => setShowSignal(b.dataset.v === '1'); });
  document.querySelectorAll('#seg-reduce [data-v]').forEach((b) => { b.onclick = () => setReduceMotion(b.dataset.v === '1'); });
  document.querySelectorAll('#seg-act [data-v]').forEach((b) => { b.onclick = () => setActPref({ on: b.dataset.v === '1' }); });
  document.querySelectorAll('#seg-theme [data-theme]').forEach((b) => { b.onclick = () => setThemePref(b.dataset.theme); });
  document.querySelectorAll('#seg-grid [data-v]').forEach((b) => { b.onclick = () => setGridAlways(b.dataset.v === '1'); });
  $('#btn-log').onclick = toggleDrawer;
  $('#logbar').onclick = toggleDrawer;
  $('#drawer-close').onclick = () => setDrawer(false, true);
  $('#btn-legend').onclick = () => togglePop('legend');
  $('#btn-settings').onclick = () => togglePop('settings');
  document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => closePop(); });
  $('#card-sum').onclick = () => openPop('card');
  $('#card-close').onclick = () => closePop();
  document.querySelectorAll('#legend-tabs [data-tab]').forEach((b) => {
    b.onclick = () => setLegendTab(b.dataset.tab);
    b.onkeydown = (e) => {   // 탭 목록: 좌우 화살표로 이동
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tabs = [...document.querySelectorAll('#legend-tabs [data-tab]')];
      const k = (tabs.indexOf(b) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      setLegendTab(tabs[k].dataset.tab);
      tabs[k].focus();
      e.preventDefault();
    };
  });
  // 바깥 영역을 누르면 팝업·시트를 닫음. 터치로 지도 밖을 누르면 명중률 배지도 해제
  document.addEventListener('pointerdown', (e) => {
    const tgt = e.target;
    if (ui.pop) {
      const p = POPS[ui.pop];
      if (!$(p.el).contains(tgt) && !$(p.btn).contains(tgt) && !$('#overlay').contains(tgt)) closePop(false);
    }
    if (!ui.wide && ui.drawerOpen && !$('#drawer').contains(tgt) && !$('#logbar').contains(tgt) && !$('#btn-log').contains(tgt)) setDrawer(false);
    if (e.pointerType === 'touch' && ui.touchArm >= 0 && !boardEl.contains(tgt)) { ui.touchArm = -1; clearHover(); }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { trapFocus(e); return; }
    if (ui.choice) {   // 이동/사격 선택 창: M = 이동, F = 사격, Esc = 취소
      if (e.key === 'Escape') { e.preventDefault(); choiceDo(null); }
      else if (e.code === 'KeyM') { e.preventDefault(); choiceDo('move'); }
      else if (e.code === 'KeyF') { e.preventDefault(); choiceDo('fire'); }
      return;
    }
    if (ui.confirm) {   // 공격 확인 창: Enter = 공격, Esc = 취소 (다른 키보다 우선)
      if (e.key === 'Escape') { e.preventDefault(); cancelAttack(); }
      else if (e.key === 'Enter') { e.preventDefault(); confirmAttack(); }
      return;
    }
    if (ui.rulesBack && e.key === 'Escape') { e.preventDefault(); ui.rulesBack(); return; }
    if ($('#overlay').classList.contains('show')) return;   // 시작·승패·가림막·요약 창이 떠 있을 때는 단축키 없음
    if (ui.screen !== 'game' && ui.screen !== 'deploy') return;
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'select' || tag === 'textarea';
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.code === 'KeyL') { e.preventDefault(); toggleDrawer(); return; }   // 한글 입력 상태에서도 같은 키
      if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) { e.preventDefault(); togglePop('legend'); return; }
    }
    if (e.key === 'Escape') {
      if (ui.pop) { e.preventDefault(); closePop(); return; }
      if (ui.drawerOpen) { e.preventDefault(); setDrawer(false, true); return; }
      if (!ui.busy) { ui.selectedId = null; ui.inspectId = null; ui.touchArm = -1; hideTip(); if (ui.state) render(); }
    }
  });
  window.addEventListener('resize', onResize);
  // 좁은 화면: 지도 열(로그 줄 포함)·카드 크기가 render 밖에서 바뀌어도 조작 줄 위치를 다시 맞춤
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (!ui.wide) onResize(); }); ro.observe($('#map-col')); ro.observe($('#side')); }
  window.addEventListener('orientationchange', onResize);

  loadScenario(loadScenarioPref());   // 지난번에 고른 시나리오 (기본 춘천)
  PLAYER = GAME_CONFIG.PLAYER_SIDE;
  AI_SIDE = enemyOf(PLAYER);
  ui.logs = emptyLogs();
  ui.viewer = PLAYER;
  buildBoard();
  ui.legendTab = (() => { try { const v = localStorage.getItem(LEGEND_TAB_KEY); return ['terrain', 'units', 'marks', 'hl'].includes(v) ? v : 'terrain'; } catch (e) { return 'terrain'; } })();
  ui.manualDeploy = loadPref(OPT_DEPLOY_KEY, true);
  ui.useCurtain = loadPref(OPT_CURTAIN_KEY, true);
  ui.state = createInitialState();
  ui.view = ui.state;
  syncSeg('#seg-signal', ui.showSignal);
  loadActPref();   // 행동 제한 설정 (이 시나리오)
  loadFirePref();   // 화력 설정 (이 시나리오, fires 가 있을 때만 항목이 생김)
  setReduceMotion(initialReduceMotion(), false);
  applyTheme();    // 그림 세트가 있으면 불러오기 시작 (끝날 때까지 기본 테마)
  setLanguage(initialLang());   // 정적 문구·범례·난이도 목록·화면을 현재 언어로
  if (tutLoad().seen) showIntro(); else showTutAsk();   // 처음 실행: 튜토리얼을 한 번 물어봄 (저장이 안 되면 매번 물어봄)
})();
