/**
 * 소리 관리자 (화면 전용. 규칙·판정·게임 난수와 무관).
 *  - AUDIO: 소리 목록(논리 이름 → sound/ 의 실제 파일), 동시 재생 상한, 기본 볼륨 등 상수
 *  - createAudio(env): 로드·재생·볼륨·음소거·동시 재생 제한·BGM 반복. env 로 AudioContext·fetch·저장소를 받아 테스트에서 바꿔 끼움
 *  - 소리 크기는 소리 종류(AUDIO.gain)와 사용자 볼륨으로만 정함. 거리·위치·좌우·음높이 변화 없음 (정보가 새지 않게)
 *  - 변형 파일 고르기는 소리 전용 난수(audioRng). Math.random 과 게임 주사위 스트림은 쓰지 않음
 *  - 언제 어떤 소리를 낼지는 연출 시간표(js/fx.js planAttackFx 의 sounds)가 같은 시야 판정으로 정함
 */
const AUDIO = {
  dir: 'sound/',
  exts: ['m4a', 'mp3', 'wav'],        // 이 순서로 찾음 (files 에 확장자를 적은 항목은 그 파일만)
  maxVoices: 8, maxSame: 3,           // 동시 재생 상한: 전체, 같은 소리
  dedupeMs: 50,                       // 같은 소리를 이 시간 안에 또 부르면 한 번만
  fadeOutMs: 80,                      // 상한을 넘겨 끌 때·이동 소리를 끝낼 때
  bgmFadeMs: 1000,
  volume: { music: 0.5, sfx: 0.8 },   // 사용자 볼륨 기본값 (0~1)
  musicCeil: 0.6,                     // 음악 최대치 (효과음을 덮지 않게 효과음보다 낮음)
  storeKey: 'chuncheon1950.audio',
  // 논리 이름 → 파일(변형이 여러 개면 재생할 때마다 무작위, 직전 것은 피함). 확장자가 없으면 exts 순서로 찾음.
  // 파일이 아직 없는 소리는 빈 목록: 파일을 sound/ 에 넣고 여기에 이름을 적으면 바로 나옴
  files: {
    ui_click: ['ui_click.wav'], ui_cancel: ['ui_cancel.wav'], ui_error: ['ui_error.wav'], ui_turn_end: ['ui_turn_end.wav'],
    fire_rifle: ['fire_rifle.wav'], fire_tank: ['fire_tank.wav'], fire_at: ['fire_at.wav'],
    hit_small: ['hit_small.wav'], hit_big: ['hit_big.wav'], miss_dirt: ['miss_dirt.wav'],
    mortar_fire: ['motar_fire.wav'], mortar_impact: ['moratr_impact.wav'],        // 실제 파일 이름 그대로 (철자 주의)
    artillery_fire: ['artillery_fire.wav'], artillery_impact: ['artillery_impact.wav'],
    unit_destroyed: ['unit_destroyed.wav'],
    move_infantry: ['move_infantry.wav'], move_vehicle: ['move_vehicle.wav'],
    shell_whistle: [], score_up: [], objective_captured: [], victory: [], defeat: [],
  },
  // 로딩 순서: UI → 전투 핵심 → 나머지
  loadOrder: ['ui_click', 'ui_cancel', 'ui_error', 'ui_turn_end',
    'fire_rifle', 'fire_tank', 'fire_at', 'hit_small', 'hit_big', 'miss_dirt', 'mortar_fire', 'mortar_impact', 'artillery_fire', 'artillery_impact',
    'unit_destroyed', 'move_infantry', 'move_vehicle', 'shell_whistle', 'score_up', 'objective_captured', 'victory', 'defeat'],
  gain: {},                           // 소리별 크기 보정 (기본 1). 종류로만 정함
  vehicleTypes: ['armor', 'recon', 'signal', 'artillery'],   // 이동 소리: 이 병종은 move_vehicle, 나머지는 move_infantry
  menuBgm: null,                      // 메뉴·시나리오 선택 화면 음악 (예: 'sound/bgm_menu'). 파일이 없으면 null
};

/** 소리 전용 난수 (게임 난수와 분리) */
function audioRng(seed) {
  let a = (seed >>> 0) || 0x1234567;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/** 이동 소리 이름 (병종으로만 정함) */
function moveSoundOf(unitType) { return AUDIO.vehicleTypes.includes(unitType) ? 'move_vehicle' : 'move_infantry'; }

/**
 * env = {
 *   makeContext(): AudioContext 또는 null,  fetchFile(url): Promise<ArrayBuffer|null> (없으면 null, 읽기 자체가 막히면 throw),
 *   makeElement(url): HTMLAudioElement 대체 경로용 (없어도 됨),  now(): ms,  store: { get(), set(v) } (실패해도 됨),  warn(msg),  seed
 * }
 */
function createAudio(env) {
  const A = AUDIO;
  const rng = audioRng(env.seed || 1);
  const now = env.now || (() => Date.now());
  const warn = env.warn || (() => {});
  const S = { musicOn: true, sfxOn: true, music: A.volume.music, sfx: A.volume.sfx, muted: false };
  try { const v = env.store && env.store.get(); if (v && typeof v === 'object') for (const k of Object.keys(S)) if (typeof v[k] === typeof S[k]) S[k] = v[k]; } catch (e) { /* 저장소를 못 읽어도 기본값으로 */ }
  const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
  S.music = clamp01(S.music); S.sfx = clamp01(S.sfx);
  const save = () => { try { if (env.store) env.store.set({ ...S }); } catch (e) { /* 저장 불가: 이 세션 안에서만 */ } };

  let ctx = null, sfxBus = null, musicBus = null, unlocked = false, hidden = false, useElements = false;
  const bank = new Map();      // 파일 경로 → { state: 'loading'|'ready'|'missing', buffer | el }
  const lastVar = new Map();   // 논리 이름 → 직전에 쓴 변형 번호
  const lastAt = new Map();    // 논리 이름 → 직전 재생 시각
  const voices = [];           // 재생 중 { id, t, stop(fadeMs), done }
  const bgm = { want: null, trim: [0, 0], cur: null, token: 0 };
  let loading = Promise.resolve();   // 효과음 로딩 (테스트에서 기다릴 때)

  const sfxLevel = () => (S.muted || !S.sfxOn ? 0 : S.sfx);
  const musicLevel = () => (S.muted || !S.musicOn ? 0 : S.music * A.musicCeil);
  function applyLevels() {
    if (sfxBus) sfxBus.gain.value = sfxLevel();
    if (musicBus) musicBus.gain.value = musicLevel();
    for (const v of voices) if (v.el) v.el.volume = clamp01(sfxLevel() * v.g);
    if (bgm.cur && bgm.cur.el) bgm.cur.el.volume = clamp01(musicLevel());
  }

  /** 파일 하나 읽기. names: 시도할 경로들 (확장자 순). 끝나면 { buffer } | { el } | null */
  async function loadFirst(names) {
    for (const url of names) {
      if (bank.has(url)) { const b = bank.get(url); if (b.state === 'ready') return b; if (b.state === 'missing') continue; }
      bank.set(url, { state: 'loading' });
      try {
        let entry = null;
        if (!useElements && ctx) {
          let data;
          try { data = await env.fetchFile(url); } catch (e) { useElements = true; }   // file:// 등 읽기가 막힌 환경: 오디오 태그로
          if (data) entry = { state: 'ready', buffer: await ctx.decodeAudioData(data) };
        }
        if (!entry && useElements && env.makeElement) {
          const el = await env.makeElement(url);
          if (el) entry = { state: 'ready', el };
        }
        if (entry) { bank.set(url, entry); return entry; }
      } catch (e) { /* 디코딩 실패: 다음 후보 */ }
      bank.set(url, { state: 'missing' });
    }
    return null;
  }
  const candidates = (name) => (/\.[a-z0-9]+$/i.test(name) ? [A.dir + name] : A.exts.map((x) => `${A.dir}${name}.${x}`));
  const pathCandidates = (p) => (/\.[a-z0-9]+$/i.test(p) ? [p] : A.exts.map((x) => `${p}.${x}`));
  const ready = new Map();     // 논리 이름 → [읽힌 항목] (변형)
  async function loadAll() {
    for (const id of A.loadOrder) {
      const list = A.files[id] || [];
      const got = [];
      for (const name of list) {
        const e = await loadFirst(candidates(name));
        if (e) got.push(e); else warn(`[audio] ${id}: ${name} 을(를) 읽지 못했습니다 (소리 없이 진행)`);
      }
      ready.set(id, got);
    }
  }

  /** 처음 터치·클릭 때 한 번: 소리 시스템 시작 + 로딩. 그 전의 재생 요청은 무시됨 */
  function unlock() {
    if (unlocked) { if (ctx && ctx.state === 'suspended' && !hidden) { try { ctx.resume(); } catch (e) { /* 무시 */ } } return; }
    unlocked = true;
    try { ctx = env.makeContext ? env.makeContext() : null; } catch (e) { ctx = null; }
    if (ctx) {
      try {
        sfxBus = ctx.createGain(); musicBus = ctx.createGain();
        sfxBus.connect(ctx.destination); musicBus.connect(ctx.destination);
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) { ctx = null; sfxBus = musicBus = null; }
    }
    if (!ctx) useElements = true;
    applyLevels();
    loading = loadAll().catch(() => {});
    if (bgm.want) startBgm();
  }

  function dropVoice(v) { const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); }
  /** 효과음 재생. 못 내는 상황(잠김·꺼짐·아직 안 읽힘·없는 파일·중복)은 null. 위치·거리 인자는 없음 */
  function play(id) {
    if (!unlocked || hidden || sfxLevel() <= 0) return null;
    const list = ready.get(id);
    if (!list || !list.length) return null;
    const t = now();
    if (lastAt.has(id) && t - lastAt.get(id) < A.dedupeMs) return null;
    lastAt.set(id, t);
    // 상한: 같은 소리 maxSame, 전체 maxVoices. 넘으면 가장 오래된 것을 줄여서 끔
    const same = voices.filter((v) => v.id === id);
    if (same.length >= A.maxSame) same[0].stop(A.fadeOutMs);
    if (voices.length >= A.maxVoices) voices[0].stop(A.fadeOutMs);
    let k = 0;
    if (list.length > 1) { do { k = Math.floor(rng() * list.length); } while (k === lastVar.get(id)); }
    lastVar.set(id, k);
    const entry = list[k], g = A.gain[id] == null ? 1 : A.gain[id];
    const v = { id, t, g, done: false };
    try {
      if (entry.buffer && ctx) {
        const src = ctx.createBufferSource(), gain = ctx.createGain();
        src.buffer = entry.buffer;
        gain.gain.value = g;
        src.connect(gain); gain.connect(sfxBus);
        v.stop = (fadeMs = 0) => {
          if (v.done) return;
          v.done = true; dropVoice(v);
          try {
            const at = ctx.currentTime, f = Math.max(0, fadeMs) / 1000;
            if (f > 0 && gain.gain.linearRampToValueAtTime) { gain.gain.setValueAtTime(g, at); gain.gain.linearRampToValueAtTime(0, at + f); }
            src.stop(at + f);
          } catch (e) { /* 이미 끝남 */ }
        };
        src.onended = () => { v.done = true; dropVoice(v); };
        src.start();
      } else if (entry.el) {
        const el = entry.el.cloneNode(true);
        el.volume = clamp01(sfxLevel() * g);
        v.el = el;
        v.stop = () => { if (v.done) return; v.done = true; dropVoice(v); try { el.pause(); } catch (e) { /* 무시 */ } };
        el.onended = () => { v.done = true; dropVoice(v); };
        const p = el.play();
        if (p && p.catch) p.catch(() => { v.done = true; dropVoice(v); });
      } else return null;
    } catch (e) { return null; }
    voices.push(v);
    return v;
  }
  function stopVoice(v, fadeMs = A.fadeOutMs) { if (v && v.stop) v.stop(fadeMs); }
  function stopAllSfx() { for (const v of voices.slice()) v.stop(0); }

  /* ---------- BGM: Web Audio 루프 (loopStart/loopEnd 로 앞뒤 빈 구간을 건너뜀) ---------- */
  function fadeOutBgm(cur) {
    if (!cur) return;
    try {
      if (cur.src && ctx) {
        const at = ctx.currentTime, f = A.bgmFadeMs / 1000;
        cur.gain.gain.setValueAtTime(cur.gain.gain.value, at);
        cur.gain.gain.linearRampToValueAtTime(0, at + f);
        cur.src.stop(at + f);
      } else if (cur.el) cur.el.pause();
    } catch (e) { /* 무시 */ }
  }
  async function startBgm() {
    const my = ++bgm.token, path = bgm.want;
    fadeOutBgm(bgm.cur);
    bgm.cur = null;
    if (!path || !unlocked) return;
    const entry = await loadFirst(pathCandidates(path));
    if (my !== bgm.token) return;                       // 그 사이 다른 음악으로 바뀜
    if (!entry) { warn(`[audio] 음악 ${path} 을(를) 읽지 못했습니다 (음악 없이 진행)`); return; }
    try {
      if (entry.buffer && ctx) {
        const src = ctx.createBufferSource(), gain = ctx.createGain();
        src.buffer = entry.buffer;
        src.loop = true;
        const dur = entry.buffer.duration || 0, a = Math.max(0, bgm.trim[0] || 0), b = Math.max(0, bgm.trim[1] || 0);
        if (dur > a + b) { src.loopStart = a; src.loopEnd = dur - b; }
        const at = ctx.currentTime;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(1, at + A.bgmFadeMs / 1000);   // 페이드 인
        src.connect(gain); gain.connect(musicBus);
        src.start(at, a);
        bgm.cur = { src, gain, path };
      } else if (entry.el) {
        const el = entry.el;
        el.loop = true;                                 // 오디오 태그 경로: 이음매가 들릴 수 있음
        el.volume = clamp01(musicLevel());
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
        bgm.cur = { el, path };
      }
    } catch (e) { bgm.cur = null; }
  }
  /** 음악 바꾸기. path: 'sound/bgm_x' (확장자 없이) 또는 null(끄기). trim: [앞, 뒤] 초 (루프에서 건너뛸 빈 구간) */
  function setBgm(path, trim) {
    const p = path || null;
    if (p === bgm.want && bgm.cur) return;
    bgm.want = p;
    bgm.trim = Array.isArray(trim) ? trim : [0, 0];
    if (unlocked) startBgm();
  }

  /** 탭이 가려짐: 효과음 정지 + 전체 일시 정지. 돌아오면 음악만 이어짐 */
  function setHidden(h) {
    hidden = !!h;
    if (hidden) {
      stopAllSfx();
      try { if (ctx && ctx.suspend) ctx.suspend(); } catch (e) { /* 무시 */ }
      if (bgm.cur && bgm.cur.el) { try { bgm.cur.el.pause(); } catch (e) { /* 무시 */ } }
    } else {
      try { if (ctx && unlocked && ctx.resume) ctx.resume(); } catch (e) { /* 무시 */ }
      if (bgm.cur && bgm.cur.el) { const p = bgm.cur.el.play(); if (p && p.catch) p.catch(() => {}); }
    }
  }

  const set = (patch) => { Object.assign(S, patch); S.music = clamp01(S.music); S.sfx = clamp01(S.sfx); applyLevels(); if (sfxLevel() <= 0) stopAllSfx(); save(); };
  return {
    unlock, play, stopVoice, stopAllSfx, setBgm, setHidden,
    setMusicOn: (on) => set({ musicOn: !!on }), setSfxOn: (on) => set({ sfxOn: !!on }),
    setMusicVolume: (v) => set({ music: v }), setSfxVolume: (v) => set({ sfx: v }),
    setMuted: (m) => set({ muted: !!m }),
    settings: () => ({ ...S }),
    levels: () => ({ sfx: sfxLevel(), music: musicLevel() }),
    stats: () => ({ unlocked, voices: voices.length, ids: voices.map((v) => v.id), bgm: bgm.cur ? bgm.cur.path : null, wantBgm: bgm.want, loaded: [...ready].filter(([, l]) => l.length).map(([k]) => k), elements: useElements }),
    whenLoaded: () => loading,
  };
}

if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { AUDIO, audioRng, moveSoundOf, createAudio });
