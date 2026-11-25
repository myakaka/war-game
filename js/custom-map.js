'use strict';
/* =====================================================================
   내 맵 (맵 만들기): 사용자가 만든 10×10 맵을 시나리오로 바꾸는 순수 로직. DOM 없음, 화면은 ui.js 의 showMapEdit.
   - 맵 기록 rec = { v: 1, id: 'my_…', name, map: [10줄 문자열: '.' 평지 · 'e' 엄폐물(구덩이·수풀·모래주머니 자동) · 'T' 참호 · 'x' 철조망 · R 바위 · W 부서진 차 · L 담장 · D 도랑 · B 잔해], units: { ua: [{ type, r, c }], ru: [...] } }
   - 규칙은 소형 전장(skirmish)을 틀로 그대로 물려받음: 주사위 규칙, 은폐, 12라운드, 남은 체력 승리. 맵(지형)과 시작 배치만 다름
   - 유닛은 자기 진영 쪽 끝 3줄(우크라이나군 7~9행, 러시아군 0~2행)에만 놓을 수 있음 (직접 배치 구역과 같음)
   - 저장: localStorage 한 키. 파일로 내보내기·가져오기는 JSON 문자열 (customMapToFile / parseCustomMapFile)
   - 내 맵의 이름은 사용자가 입력한 글이라 문자열 키 'scen.custom.<id>.name' 으로 런타임에 ko/en 에 넣어 기존 화면 코드가 그대로 쓰게 함
   ===================================================================== */
const CUSTOM_MAP_KEY = 'chuncheon1950.customMaps';
const CUSTOM_MAP = Object.freeze({
  SIZE: 10, MAX_UNITS: 6, NAME_MAX: 20, MAX_MAPS: 12, FILE_MAX: 20000,
  TERRAIN: '.eTxRWLDB', COVER_KIND: Object.freeze({ R: 'rock', W: 'wreck', L: 'wall', D: 'ditch', B: 'rubble' }), TYPES: Object.freeze(['infantry', 'recon', 'mortar']), SIDES: Object.freeze(['ua', 'ru']),
  ZONE: Object.freeze({ ua: Object.freeze([7, 9]), ru: Object.freeze([0, 2]) }),   // [첫 행, 끝 행]
  TEMPLATE: 'skirmish',
});

/** 새 맵 id: 'my_' + 영숫자 (파일에서 가져온 맵도 새 id 를 받아 기존 맵을 덮어쓰지 않음) */
const customMapNewId = () => 'my_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const customMapIdOk = (id) => typeof id === 'string' && /^my_[a-z0-9]{4,24}$/.test(id);

/** 틀(소형 전장)의 지형과 시작 배치를 그대로 복사한 새 맵 */
function customMapFromTemplate() {
  const tpl = SCENARIOS.find((s) => s.id === CUSTOM_MAP.TEMPLATE);
  const units = { ua: [], ru: [] };
  for (const d of (tpl && tpl.deployments) || []) if (!(d.round || 0) && d.pos && units[d.side]) units[d.side].push({ type: d.type, r: d.pos[0], c: d.pos[1] });
  const map = tpl ? tpl.map.slice() : Array.from({ length: CUSTOM_MAP.SIZE }, () => '.'.repeat(CUSTOM_MAP.SIZE));
  return { v: 1, id: customMapNewId(), name: '', map, units };
}

/** 아무 입력(저장소·파일)을 안전한 맵 기록으로. 맞지 않는 부분은 고치거나 버림. 못 쓰면 null */
function sanitizeCustomMap(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const N = CUSTOM_MAP.SIZE;
  if (!Array.isArray(raw.map) || raw.map.length !== N) return null;
  const map = raw.map.map((row) => {
    const s = typeof row === 'string' ? row.slice(0, N) : '';
    return Array.from({ length: N }, (_, i) => (CUSTOM_MAP.TERRAIN.includes(s[i]) && s[i] !== undefined ? s[i] : '.')).join('');
  });
  const units = { ua: [], ru: [] }, used = new Set();
  for (const side of CUSTOM_MAP.SIDES) {
    const [r0, r1] = CUSTOM_MAP.ZONE[side];
    for (const u of (raw.units && Array.isArray(raw.units[side]) ? raw.units[side] : [])) {
      if (!u || !CUSTOM_MAP.TYPES.includes(u.type) || !Number.isInteger(u.r) || !Number.isInteger(u.c)) continue;
      if (u.r < r0 || u.r > r1 || u.c < 0 || u.c >= N || used.has(u.r * N + u.c) || units[side].length >= CUSTOM_MAP.MAX_UNITS) continue;
      used.add(u.r * N + u.c); units[side].push({ type: u.type, r: u.r, c: u.c });
    }
  }
  const name = typeof raw.name === 'string' ? raw.name.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, CUSTOM_MAP.NAME_MAX) : '';
  return { v: 1, id: customMapIdOk(raw.id) ? raw.id : null, name, map, units };
}

/** 저장·플레이 전에 막아야 하는 문제 [{ k: 문구 키, p: 값 }]. 없으면 빈 배열 */
function customMapProblems(rec) {
  const out = [];
  for (const side of CUSTOM_MAP.SIDES) if (!rec.units[side].length) out.push({ k: 'mapEdit.errNoUnits', p: { side: { t: 'side.' + side } } });
  return out;
}

/** 엄폐물 칸 종류·방향 자동 지정 (칸 좌표만으로 정해져 같은 맵은 항상 같음). 방향성 엄폐 규칙과 그림이 같이 읽음 */
function customCoverCells(map) {
  const cells = {}, skins = ['crater', 'bush', 'sandbag'];
  map.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === 'e' || CUSTOM_MAP.COVER_KIND[row[c]]) {
    let h = (r * 73856093) ^ (c * 19349663); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h = (h ^ (h >>> 15)) >>> 0;
    cells[`${r},${c}`] = { skin: CUSTOM_MAP.COVER_KIND[row[c]] || skins[h % 3], rotation: [0, 90, 180, 270][(h >>> 4) % 4] };
  } });
  return cells;
}

/** 맵 기록 → 시나리오 데이터 (틀을 복사해 맵·배치·이름만 바꿈). 틀이 없으면 null */
function buildCustomScenario(rec) {
  const tpl = SCENARIOS.find((s) => s.id === CUSTOM_MAP.TEMPLATE);
  if (!tpl) return null;
  const s = JSON.parse(JSON.stringify(tpl));
  s.id = rec.id;
  s.nameKey = `scen.custom.${rec.id}.name`; s.descKey = 'scen.custom.desc'; s.subKey = 'scen.custom.sub';
  s.tags = ['custom', 'twoPlayer'];
  s.custom = true;
  s.symmetric = false;
  s.map = rec.map.map((row) => row.replace(/[RWLDB]/g, 'e'));   // 새 엄폐물 글자는 규칙상 엄폐물('e'), 종류는 coverCells 가 정함
  s.deployments = [];
  for (const side of CUSTOM_MAP.SIDES) for (const u of rec.units[side]) s.deployments.push({ round: 0, side, type: u.type, pos: [u.r, u.c] });
  // 소형 전장의 칸별 엄폐물 종류·방향은 그 맵 좌표용 → 내 맵은 엄폐물 칸마다 종류(구덩이·수풀·모래주머니)와 방향을 칸 좌표로 정해 규칙(coverCells)과 그림(art.cover.cells)이 같은 값을 읽게 함
  s.coverCells = customCoverCells(rec.map);
  if (s.art && s.art.cover) s.art.cover.cells = s.coverCells;
  return s;
}

/** 맵 이름: 사용자가 입력한 글 (ko/en 에 같은 값으로 들어감). 비었으면 언어별 번호 이름 */
function customMapName(rec, index, lang = 'ko') {
  return rec.name || STRINGS[lang]['mapEdit.defaultName'].replace('{n}', index);
}

/** 시나리오 목록에 등록(같은 id 가 있으면 교체). 검사에 실패하면 등록하지 않고 오류 목록을 돌려줌 */
function registerCustomMap(rec, index = 1) {
  const s = buildCustomScenario(rec);
  if (!s) return [{ k: 'mapEdit.errBuild' }];
  const errs = validateScenario(s);
  if (errs.length) return errs.map((m) => ({ k: 'mapEdit.errBuild', p: {}, detail: m }));
  for (const lang of ['ko', 'en']) STRINGS[lang][s.nameKey] = customMapName(rec, index, lang);
  const k = SCENARIOS.findIndex((x) => x.id === s.id);
  if (k >= 0) SCENARIOS[k] = s; else SCENARIOS.push(s);
  return [];
}
function unregisterCustomMap(id) {
  const k = SCENARIOS.findIndex((x) => x.id === id && x.custom);
  if (k >= 0) SCENARIOS.splice(k, 1);
  delete STRINGS.ko[`scen.custom.${id}.name`]; delete STRINGS.en[`scen.custom.${id}.name`];
}

/** 저장소에서 내 맵 목록 읽기 (깨진 항목은 버림, 최대 개수까지). getStorage: localStorage 를 돌려주는 함수 */
function readCustomMaps(getStorage) {
  try {
    const raw = JSON.parse(getStorage().getItem(CUSTOM_MAP_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const x of raw) { const r = sanitizeCustomMap(x); if (r && r.id && !out.some((o) => o.id === r.id)) out.push(r); if (out.length >= CUSTOM_MAP.MAX_MAPS) break; }
    return out;
  } catch (e) { return []; }
}
function writeCustomMaps(getStorage, list) {
  try { getStorage().setItem(CUSTOM_MAP_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
}
/** 저장된 내 맵을 모두 시나리오로 등록 (게임 시작 때 한 번) */
function registerSavedCustomMaps(getStorage) {
  readCustomMaps(getStorage).forEach((rec, i) => registerCustomMap(rec, i + 1));
}

/** 파일로 내보낼 JSON 문자열 / 파일 내용 → 맵 기록 (id 는 비움: 가져오면 새 id). 못 읽으면 null */
const customMapToFile = (rec) => JSON.stringify({ app: 'sasu-map', v: 1, name: rec.name, map: rec.map, units: rec.units });
function parseCustomMapFile(text) {
  try {
    if (typeof text !== 'string' || text.length > CUSTOM_MAP.FILE_MAX) return null;
    const o = JSON.parse(text);
    if (!o || o.app !== 'sasu-map') return null;
    const rec = sanitizeCustomMap(o);
    if (!rec) return null;
    rec.id = null;
    return rec;
  } catch (e) { return null; }
}

if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { CUSTOM_MAP, CUSTOM_MAP_KEY, customMapNewId, customMapIdOk, customMapFromTemplate, sanitizeCustomMap, customMapProblems, buildCustomScenario, customMapName, registerCustomMap, unregisterCustomMap, readCustomMaps, writeCustomMaps, registerSavedCustomMaps, customMapToFile, parseCustomMapFile });
