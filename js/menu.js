/**
 * 메뉴 구성 (순수 계산, DOM 없음). 화면은 ui.js 의 showMenu / showIntro 가 그린다.
 *  - 게임 제목: STRINGS 의 'gameTitle', 'gameSubtitle' 한 곳 (언어별). 탭 제목·설명 메타도 같은 값
 *  - readMenuStore: 저장소에서 메뉴에 필요한 것만 읽음. 못 읽으면 "저장 없음, 처음 아님"
 *  - menuModel: 저장 판·처음 실행 여부 → 큰 버튼 순서와 강조 버튼
 *  - scenarioCardModel: 시나리오 데이터 → 카드에 보일 이름·설명·태그(최대 3개)
 */
const MENU_KEYS = { tutorial: 'chuncheon1950.tutorial', records: 'chuncheon1950.gameRecords', save: 'chuncheon1950.savedGame', rulesNotice: 'chuncheon1950.rulesNotice' };

/**
 * getStorage(): localStorage 를 돌려주는 함수 (접근 자체가 오류를 낼 수 있어 함수로 받음).
 * 반환 { ok, firstRun, save }. save 는 공개 정보만: { scenarioId, round, maxRounds, mode, turn(2인 대전만) } 또는 null
 */
function readMenuStore(getStorage) {
  try {
    const st = getStorage();
    const J = (k) => { const v = st.getItem(k); return v ? JSON.parse(v) : null; };
    const tut = J(MENU_KEYS.tutorial) || {};
    const rec = J(MENU_KEYS.records) || {};
    const played = Object.values(rec).some((list) => Array.isArray(list) && list.length > 0);
    const seenTut = !!tut.seen || (Array.isArray(tut.done) && tut.done.length > 0);
    let save = null;
    const s = J(MENU_KEYS.save);
    if (s && typeof s.scenarioId === 'string' && Number.isInteger(s.round) && Number.isInteger(s.maxRounds)) {
      const mode = s.mode === 'hotseat' ? 'hotseat' : 'ai';
      // rulesUpdated: 지금 규칙보다 앞선 버전(또는 버전 기록 없음)으로 저장된 판 → 이어하기 때 규칙 업데이트 안내 (upgradeSavedState)
      const rulesUpdated = !(Number.isInteger(s.rulesVersion) && s.rulesVersion >= RULES.RULES_VERSION);
      save = { scenarioId: s.scenarioId, round: s.round, maxRounds: s.maxRounds, mode, turn: mode === 'hotseat' && typeof s.turn === 'string' ? s.turn : null, rulesUpdated };
    }
    return { ok: true, firstRun: !seenTut && !played && !save, save };
  } catch (e) {
    return { ok: false, firstRun: false, save: null };
  }
}

/** 이어하기 때 '규칙이 업데이트되어 후퇴와 제압이 적용됩니다' 안내를 보여야 하는가: 옛 규칙으로 저장된 판이고, 이 규칙 버전의 안내를 아직 안 봤을 때 (한 번만) */
function rulesNoticeNeeded(save, seenVersion) {
  return !!save && !!save.rulesUpdated && !(Number.isInteger(seenVersion) && seenVersion >= RULES.RULES_VERSION);
}

/**
 * 메인 메뉴의 큰 버튼. o = { save, firstRun, tutorialSteps }
 * 반환 { items: [{ id: 'continue'|'new'|'tutorial', primary }], secondary: ['rules', 'settings'] }
 *  - 저장 판이 있으면 이어하기가 맨 위·강조
 *  - 저장 판이 없고 처음 실행이면 튜토리얼이 맨 위·강조, 아니면 새 게임이 강조
 *  - 튜토리얼 단계가 없으면 튜토리얼 버튼 없음
 */
function menuModel(o) {
  const hasTut = (o.tutorialSteps || 0) > 0;
  const ids = [];
  if (o.save) ids.push('continue', 'new');
  else if (o.firstRun && hasTut) ids.push('tutorial', 'new');
  else ids.push('new');
  if (hasTut && !ids.includes('tutorial')) ids.push('tutorial');
  return { items: ids.map((id, k) => ({ id, primary: k === 0 })), secondary: ['rules', 'settings'] };
}

/** 시나리오 카드: 이름·한 줄 설명·태그는 시나리오 데이터에서 (summaryKey 가 있으면 그것, 없으면 descKey) */
function scenarioCardModel(sc) {
  return {
    id: sc.id,
    nameKey: sc.nameKey,
    descKey: sc.summaryKey || sc.descKey,
    tagKeys: (sc.tags || []).slice(0, 3).map((k) => 'tag.' + k),
    hasArt: !!(sc.art && sc.art.terrain),
  };
}

if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { MENU_KEYS, readMenuStore, menuModel, scenarioCardModel, rulesNoticeNeeded });
