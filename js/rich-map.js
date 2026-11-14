'use strict';
/* =====================================================================
   PC 리치 테마: 지도 바탕 그림 (순수 canvas, 장식 전용)
   규칙 로직은 이 파일을 읽지 않는다. 지형 코드·시야·이동은 엔진이 그대로 결정한다.
   - 마스크는 직접 만든 숫자 배열로 계산하고 putImageData 로 올린다 (이미지 픽셀은 읽지 않음: file:// 에서도 동작)
   - 모든 길이는 칸 수 단위. 실제 픽셀 = 칸 수 × cell × dpr
   ===================================================================== */
const RICH_MAP = (() => {
  const K = {
    maskRes: 40,   // 마스크 해상도 (한 칸당 px)
    // 지형 그림 한 장이 덮는 칸 수 (거울 반복 전 한 장 기준)
    tile: { plain: 8.7, forest: 8.7, paddy: 8.7, river: 9.6, city: 5.2 },
    // 지형 경계 블러 반경 (칸). 습지는 기갑 진입 불가 칸이라 경계를 또렷하게
    blur: { plain: 0.11, forest: 0.12, river: 0.07, paddy: 0.07, city: 0.17 },
    forestShadow: { blur: 0.1, dx: 0.05, dy: 0.05, alpha: 0.18 },
    bank: { width: 0.15, rgb: [222, 204, 160], alpha: 0.4 },
    riverInset: 0.1,   // 강물 그림을 강이 아닌 이웃 쪽에서 안으로 줄이는 폭 (칸, 장식만: 규칙상 강 칸은 그대로)
    village: {
      noisePeriod: 0.6, noiseAmp: 0.32, edge: 0.04,            // 경계 일그러짐 (울퉁불퉁하되 들쭉날쭉하지 않게)
      rim: { width: 0.05, rgb: [70, 70, 64], alpha: 0.55 },      // 마을 안쪽 가장자리의 어두운 테
      dirt: { width: 0.15, rgb: [138, 124, 92], alpha: 0.7 },    // 흙색 띠
      grass: { width: 0.3, rgb: [176, 158, 92], alpha: 0.18 },   // 바깥 풀 변색 띠
      breakPeriod: 0.7,                                          // 띠가 끊기는 간격
      bushes: { perCell: 0.35, minD: 0.1, maxD: 0.5, rMin: 0.08, rMax: 0.13, shadow: 0.16 },
    },
    // 시나리오 art 가 켜는 장식 (art.dryField / art.fields / art.decor). 없는 시나리오는 아무것도 그리지 않음
    dry: { period: 1.9, edge: 0.07 },                         // 마른 밭: 노이즈 한 격자(칸), 경계 부드러움
    field: { blur: 0.28, noisePeriod: 0.75, amp: 0.55, edge: 0.18, tile: 6.2 },   // 밀밭: 경계를 흐리고 불규칙하게
    strip: { shadow: { dx: 0.05, dy: 0.06, blur: 0.05, alpha: 0.26 } },          // 방풍림 등 줄 장식의 옅은 그림자
    scar: { alpha: 0.92 },
    runway: { inset: 0.11, edge: 'rgba(225,225,220,0.85)', bars: 4, barLen: 0.22, barGap: 0.06 },
    vignette: 0.28,
    grain: 5,
  };

  /* ---------- 난수·노이즈 (시드 고정: 같은 시나리오는 항상 같은 그림) ---------- */
  function prng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** 값 노이즈 (0~1). period: 격자 한 칸의 크기 (px) */
  function valueNoise(W, H, period, rnd) {
    const gw = Math.ceil(W / period) + 2, gh = Math.ceil(H / period) + 2;
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const out = new Float32Array(W * H);
    const sm = (x) => x * x * (3 - 2 * x);
    for (let y = 0; y < H; y++) {
      const fy = y / period, iy = Math.floor(fy), ty = sm(fy - iy);
      for (let x = 0; x < W; x++) {
        const fx = x / period, ix = Math.floor(fx), tx = sm(fx - ix);
        const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
        out[y * W + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
      }
    }
    return out;
  }
  /** 두 옥타브 노이즈 */
  function noise2(W, H, period, rnd) {
    const a = valueNoise(W, H, period, rnd), b = valueNoise(W, H, period / 2.3, rnd);
    for (let i = 0; i < a.length; i++) a[i] = a[i] * 0.7 + b[i] * 0.3;
    return a;
  }

  /* ---------- 마스크 ---------- */
  function cellMask(n, R, pred) {
    const W = n * R, m = new Float32Array(W * W);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!pred(r, c)) continue;
      for (let y = r * R; y < (r + 1) * R; y++) m.fill(1, y * W + c * R, y * W + (c + 1) * R);
    }
    return m;
  }
  /** 가우시안 근사 (상자 블러 3회, 가장자리는 늘려서 지도 끝이 흐려지지 않게) */
  function blur(src, W, H, sigma) {
    if (sigma < 0.5) return Float32Array.from(src);
    const r = Math.max(1, Math.round(Math.sqrt(sigma * sigma + 1) * 0.87));   // 3회 상자 ≈ σ
    let a = Float32Array.from(src), b = new Float32Array(src.length);
    const pass = (from, to, horiz) => {
      const len = horiz ? W : H, lines = horiz ? H : W, w = 2 * r + 1;
      for (let l = 0; l < lines; l++) {
        const at = (k) => (horiz ? l * W + Math.min(len - 1, Math.max(0, k)) : Math.min(len - 1, Math.max(0, k)) * W + l);
        let s = 0;
        for (let k = -r; k <= r; k++) s += from[at(k)];
        for (let k = 0; k < len; k++) {
          to[horiz ? l * W + k : k * W + l] = s / w;
          s += from[at(k + r + 1)] - from[at(k - r)];
        }
      }
    };
    for (let i = 0; i < 3; i++) { pass(a, b, true); pass(b, a, false); }
    return a;
  }
  /** 안쪽(값 > 0.5)까지의 거리 (px, 안쪽은 0). 2단계 챔퍼 */
  function distOutside(m, W, H) {
    const INF = 1e9, d = new Float32Array(W * H), D = Math.SQRT2;
    for (let i = 0; i < d.length; i++) d[i] = m[i] > 0.5 ? 0 : INF;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + D); if (x < W - 1) v = Math.min(v, d[i - W + 1] + D); }
      d[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + D); if (x > 0) v = Math.min(v, d[i + W - 1] + D); }
      d[i] = v;
    }
    return d;
  }
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  /** 숫자 배열(0~1) → 단색 + 알파 캔버스 */
  function alphaCanvas(arr, W, H, rgb, mul = 1) {
    const cv = newCanvas(W, H), cx = cv.getContext('2d'), im = cx.createImageData(W, H), d = im.data;
    for (let i = 0; i < arr.length; i++) {
      const k = i * 4;
      d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2];
      d[k + 3] = Math.round(255 * Math.min(1, Math.max(0, arr[i] * mul)));
    }
    cx.putImageData(im, 0, 0);
    return cv;
  }
  /** 마스크 값(0~1 배열 arr) 중 mask 안의 픽셀에서 위에서부터 share 비율이 되는 문턱값 (표본 추출) */
  function quantileIn(arr, mask, share) {
    const v = [];
    for (let i = 0; i < arr.length; i += 5) if (mask[i] > 0.5) v.push(arr[i]);
    if (!v.length) return 2;
    v.sort((a, b) => a - b);
    return v[Math.min(v.length - 1, Math.max(0, Math.floor(v.length * (1 - share))))];
  }
  /** 채도·밝기를 줄인 복사본 (canvas 필터가 있으면 필터, 없으면 합성 모드로 근사. 이미지 픽셀을 읽지 않음) */
  function tinted(src, sat, bright) {
    const cv = newCanvas(src.width, src.height), cx = cv.getContext('2d');
    if ('filter' in cx) {
      cx.filter = `saturate(${Math.round(sat * 100)}%) brightness(${Math.round(bright * 100)}%)`;
      cx.drawImage(src, 0, 0);
      cx.filter = 'none';
    } else {
      cx.drawImage(src, 0, 0);
      cx.globalCompositeOperation = 'saturation';
      cx.fillStyle = `rgba(128,128,128,${1 - sat})`;
      cx.fillRect(0, 0, cv.width, cv.height);
      cx.globalCompositeOperation = 'multiply';
      const g = Math.round(255 * bright);
      cx.fillStyle = `rgb(${g},${g},${g})`;
      cx.fillRect(0, 0, cv.width, cv.height);
    }
    return cv;
  }
  /** 거울 반복으로 그림을 깐 전체 크기 캔버스. offPx: 시작 오프셋 [x, y] (px, 거울 대칭축을 옮길 때) */
  function mirrored(img, S, tilePx, offPx = [0, 0]) {
    const cv = newCanvas(S, S), cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    const fold = (v) => -(((v % (2 * tilePx)) + 2 * tilePx) % (2 * tilePx));   // 2장(원본+뒤집힘) 단위로 접음
    const ox = fold(offPx[0]), oy = fold(offPx[1]);
    for (let j = 0, y = oy; y < S; j++, y += tilePx) {
      for (let i = 0, x = ox; x < S; i++, x += tilePx) {
        cx.save();
        cx.translate(x + (i % 2 ? tilePx : 0), y + (j % 2 ? tilePx : 0));
        cx.scale(i % 2 ? -1 : 1, j % 2 ? -1 : 1);
        cx.drawImage(img, 0, 0, tilePx + 0.5, tilePx + 0.5);
        cx.restore();
      }
    }
    return cv;
  }
  /** layer 에 mask 를 알파로 곱해서 ctx 에 그림 */
  function drawMasked(ctx, layer, mask, S) {
    const lc = layer.getContext('2d');
    lc.globalCompositeOperation = 'destination-in';
    lc.imageSmoothingQuality = 'high';
    lc.drawImage(mask, 0, 0, S, S);
    lc.globalCompositeOperation = 'source-over';
    ctx.drawImage(layer, 0, 0);
  }

  /**
   * 마을 모양 알파: 칸 마스크 → 블러 → 저주파 노이즈로 경계 일그러뜨림 → 문턱값.
   * 반환: { alpha, dist(바깥 거리 px), band, grass } (모두 마스크 해상도 배열)
   */
  function villageShape(base, W, R, rnd) {
    const V = K.village;
    const b = blur(base, W, W, K.blur.city * R);
    const nz = noise2(W, W, V.noisePeriod * R, rnd);
    const alpha = new Float32Array(W * W);
    for (let i = 0; i < alpha.length; i++) {
      const v = b[i] + (nz[i] - 0.5) * V.noiseAmp * Math.min(1, b[i] * 4) * Math.min(1, (1 - b[i]) * 4 + 0.15);
      alpha[i] = smooth(0.5 - V.edge, 0.5 + V.edge, v);
    }
    const dist = distOutside(alpha, W, W);
    const inv = new Float32Array(W * W);
    for (let i = 0; i < inv.length; i++) inv[i] = 1 - alpha[i];
    const din = distOutside(inv, W, W), rw = V.rim.width * R;
    const rim = new Float32Array(W * W);
    for (let i = 0; i < rim.length; i++) rim[i] = alpha[i] * (1 - smooth(rw * 0.4, rw, din[i]));
    const brk = noise2(W, W, V.breakPeriod * R, rnd);
    const band = new Float32Array(W * W), grass = new Float32Array(W * W);
    const dw = V.dirt.width * R, gw = V.grass.width * R;
    for (let i = 0; i < band.length; i++) {
      const d = dist[i];
      if (d <= 0 || d > dw + gw + 2) continue;
      const cut = smooth(0.2, 0.34, brk[i]);   // 군데군데 끊김
      const wob = 0.75 + 0.5 * nz[i];          // 두께가 일정하지 않게
      band[i] = (1 - smooth(dw * 0.45 * wob, dw * wob, d)) * cut;
      grass[i] = smooth(dw * 0.5, dw, d) * (1 - smooth(dw + gw * 0.4, dw + gw, d)) * (0.4 + 0.6 * smooth(0.25, 0.6, brk[i]));
    }
    return { alpha, dist, band, grass, rim };
  }

  /** 덤불: 숲 그림을 동그랗게 떼어 마을 가장자리 근처에만 흩뿌림 */
  function drawBushes(ctx, forestImg, dist, W, R, unit, count, rnd) {
    const B = K.village.bushes;
    let placed = 0;
    for (let tries = 0; tries < count * 60 && placed < count; tries++) {
      const x = Math.floor(rnd() * W), y = Math.floor(rnd() * W);
      const d = dist[y * W + x] / R;
      if (d < B.minD || d > B.maxD) continue;
      const px = x * unit, py = y * unit;
      const rad = (B.rMin + (B.rMax - B.rMin) * rnd()) * R * unit;
      // 그림자
      const sg = ctx.createRadialGradient(px + rad * 0.35, py + rad * 0.35, 0, px + rad * 0.35, py + rad * 0.35, rad * 1.25);
      sg.addColorStop(0, `rgba(0,0,0,${B.shadow})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(px + rad * 0.35, py + rad * 0.35, rad * 1.25, 0, Math.PI * 2); ctx.fill();
      // 덤불 (원 3~4개 겹침)
      ctx.save();
      ctx.beginPath();
      const blobs = 3 + Math.floor(rnd() * 2);
      for (let k = 0; k < blobs; k++) {
        const a = rnd() * Math.PI * 2, rr = rad * (0.55 + 0.35 * rnd());
        ctx.moveTo(px + Math.cos(a) * rad * 0.4 + rr, py + Math.sin(a) * rad * 0.4);
        ctx.arc(px + Math.cos(a) * rad * 0.4, py + Math.sin(a) * rad * 0.4, rr, 0, Math.PI * 2);
      }
      ctx.clip();
      const sx = rnd() * (forestImg.width - 120), sy = rnd() * (forestImg.height - 120);
      ctx.drawImage(forestImg, sx, sy, 110, 110, px - rad * 1.3, py - rad * 1.3, rad * 2.6, rad * 2.6);
      ctx.restore();
      placed++;
    }
  }

  /**
   * 지도 바탕 전체를 canvas 에 그림.
   * o: { n, size(캔버스 px), keyAt(r,c)→지형 키, img: {terrain:{key:Image}, runway, patch}, art, runways:[{col, rows}], seed }
   */
  function paint(canvas, o) {
    const { n, size: S } = o;
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const R = K.maskRes, W = n * R, cellPx = S / n, unit = S / W;
    const rnd = prng(o.seed || 1);
    const key = (r, c) => o.keyAt(r, c);
    const tex = (k) => o.img.terrain[k] || o.img.terrain.plain;
    const tileOf = (k) => (K.tile[k] || 8.7) * cellPx;
    const offOf = (k) => { const v = (o.art.terrainOffset || {})[k] || [0, 0]; return [v[0] * cellPx, v[1] * cellPx]; };
    const patches = (o.art.overlays || []).filter((v) => v.type === 'patch');
    const inPatch = (r, c) => patches.some((p) => r >= p.rows[0] && r <= p.rows[1] && c >= p.cols[0] && c <= p.cols[1]);

    // 1. 평지 바탕 (전체)
    ctx.drawImage(mirrored(tex('plain'), S, tileOf('plain'), offOf('plain')), 0, 0);

    // 1b. 마른 밭 · 밀밭 (art 가 켠 시나리오만): 평지 칸 위에만, 습지·숲·강·마을은 아래에서 다시 덮음
    const decorImg = o.img.decor || {};
    const plainMask = cellMask(n, R, (r, c) => key(r, c) === 'plain');
    const plainSoft = blur(plainMask, W, W, 0.06 * R);
    if (o.art.dryField && decorImg[o.art.dryField.src]) {
      const nz = noise2(W, W, K.dry.period * R, rnd);
      const t = quantileIn(nz, plainMask, o.art.dryField.share == null ? 0.3 : o.art.dryField.share);
      const al = new Float32Array(W * W);
      for (let i = 0; i < al.length; i++) al[i] = smooth(t - K.dry.edge, t + K.dry.edge, nz[i]) * plainSoft[i];
      drawMasked(ctx, mirrored(decorImg[o.art.dryField.src], S, tileOf('plain'), offOf('plain')), alphaCanvas(al, W, W, [0, 0, 0]), S);
    }
    for (const f of o.art.fields || []) {
      const im = decorImg[f.src];
      if (!im) continue;
      const FD = K.field;
      const base = cellMask(n, R, (r, c) => r >= f.rows[0] && r <= f.rows[1] && c >= f.cols[0] && c <= f.cols[1] && key(r, c) === 'plain');
      const b = blur(base, W, W, FD.blur * R), nz = noise2(W, W, FD.noisePeriod * R, rnd), al = new Float32Array(W * W);
      for (let i = 0; i < al.length; i++) {
        const v = b[i] + (nz[i] - 0.5) * FD.amp * Math.min(1, b[i] * 3) * Math.min(1, (1 - b[i]) * 3 + 0.1);
        al[i] = smooth(0.5 - FD.edge, 0.5 + FD.edge, v) * plainSoft[i];   // 평지 밖으로는 번지지 않음
      }
      const layer = tinted(mirrored(im, S, FD.tile * cellPx, offOf('plain')), f.saturation == null ? 0.55 : f.saturation, f.brightness == null ? 0.85 : f.brightness);
      drawMasked(ctx, layer, alphaCanvas(al, W, W, [0, 0, 0]), S);
    }

    // 2. 습지
    const paddy = cellMask(n, R, (r, c) => key(r, c) === 'paddy');
    if (paddy.some((v) => v)) drawMasked(ctx, mirrored(tex('paddy'), S, tileOf('paddy'), offOf('paddy')), alphaCanvas(blur(paddy, W, W, K.blur.paddy * R), W, W, [0, 0, 0]), S);

    // 3. 강: 모래빛 강둑 → 물
    const river = cellMask(n, R, (r, c) => key(r, c) === 'river');
    const iv = Math.round(K.riverInset * R);   // 강이 아닌 이웃 쪽 가장자리를 깎음 → 물길이 칸보다 조금 좁고 끝이 둥글게
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (key(r, c) !== 'river') continue;
      const cut = (x0, x1, y0, y1) => { for (let y = y0; y < y1; y++) river.fill(0, y * W + x0, y * W + x1); };
      if (c === 0 || key(r, c - 1) !== 'river') cut(c * R, c * R + iv, r * R, (r + 1) * R);
      if (c === n - 1 || key(r, c + 1) !== 'river') cut((c + 1) * R - iv, (c + 1) * R, r * R, (r + 1) * R);
      if (r > 0 && key(r - 1, c) !== 'river') cut(c * R, (c + 1) * R, r * R, r * R + iv);
      if (r < n - 1 && key(r + 1, c) !== 'river') cut(c * R, (c + 1) * R, (r + 1) * R - iv, (r + 1) * R);
    }
    if (river.some((v) => v)) {
      const d = distOutside(river, W, W), bw = K.bank.width * R;
      const bank = new Float32Array(W * W);
      for (let i = 0; i < bank.length; i++) bank[i] = d[i] === 0 ? 1 : 1 - smooth(bw * 0.6, bw, d[i]);
      ctx.drawImage(alphaCanvas(blur(bank, W, W, 0.03 * R), W, W, K.bank.rgb, K.bank.alpha), 0, 0, S, S);
      drawMasked(ctx, mirrored(tex('river'), S, tileOf('river'), offOf('river')), alphaCanvas(blur(river, W, W, K.blur.river * R), W, W, [0, 0, 0]), S);
    }

    // 4. 숲: 주변 평지에 부드러운 그림자 → 숲
    const forest = cellMask(n, R, (r, c) => key(r, c) === 'forest');
    if (forest.some((v) => v)) {
      const F = K.forestShadow;
      ctx.drawImage(alphaCanvas(blur(forest, W, W, F.blur * R), W, W, [0, 0, 0], F.alpha), F.dx * cellPx, F.dy * cellPx, S, S);
      drawMasked(ctx, mirrored(tex('forest'), S, tileOf('forest'), offOf('forest')), alphaCanvas(blur(forest, W, W, K.blur.forest * R), W, W, [0, 0, 0]), S);
    }

    // 5. 도심(마을): 울퉁불퉁한 알파 + 끊긴 흙색 띠 + 옅은 풀 변색 + 근처 덤불
    const V = K.village;
    const drawVillage = (base, layerCv, bushCount) => {
      const sh = villageShape(base, W, R, rnd);
      ctx.drawImage(alphaCanvas(sh.grass, W, W, V.grass.rgb, V.grass.alpha), 0, 0, S, S);
      ctx.drawImage(alphaCanvas(sh.band, W, W, V.dirt.rgb, V.dirt.alpha), 0, 0, S, S);
      drawMasked(ctx, layerCv, alphaCanvas(sh.alpha, W, W, [0, 0, 0]), S);
      ctx.drawImage(alphaCanvas(sh.rim, W, W, V.rim.rgb, V.rim.alpha), 0, 0, S, S);
      if (bushCount > 0) drawBushes(ctx, tex('forest'), sh.dist, W, R, unit, bushCount, rnd);
    };
    let cityCells = 0;
    const city = cellMask(n, R, (r, c) => { const on = key(r, c) === 'city' && !inPatch(r, c); if (on) cityCells++; return on; });
    if (cityCells) drawVillage(city, mirrored(tex('city'), S, tileOf('city'), offOf('city')), Math.round(cityCells * V.bushes.perCell));

    // 6. 공항 건물 조각 (칸 영역보다 pad 만큼 크게)
    for (const p of patches) {
      const im = o.img.patch;
      if (!im) continue;
      const pad = p.pad == null ? 0.1 : p.pad;
      const x0 = (p.cols[0] - pad) * cellPx, y0 = (p.rows[0] - pad) * cellPx;
      const w = (p.cols[1] - p.cols[0] + 1 + 2 * pad) * cellPx, h = (p.rows[1] - p.rows[0] + 1 + 2 * pad) * cellPx;
      const lay = newCanvas(S, S);
      lay.getContext('2d').drawImage(im, x0, y0, w, h);
      const base = new Float32Array(W * W);
      for (let y = Math.max(0, Math.round((p.rows[0] - pad) * R)); y < Math.min(W, Math.round((p.rows[1] + 1 + pad) * R)); y++) {
        for (let x = Math.max(0, Math.round((p.cols[0] - pad) * R)); x < Math.min(W, Math.round((p.cols[1] + 1 + pad) * R)); x++) base[y * W + x] = 1;
      }
      drawVillage(base, lay, Math.round((p.rows[1] - p.rows[0] + 1) * (p.cols[1] - p.cols[0] + 1) * V.bushes.perCell * 0.5));
    }

    // 6b. 줄·자국 장식 (art.decor: 방풍림·흙길·포격 자국. 규칙과 무관한 바탕 그림이라 유닛·선택·거점 표시보다 아래층)
    for (const d of o.art.decor || []) {
      const im = decorImg[d.src];
      if (!im) continue;
      if (d.type === 'strip') {
        const a = { x: (d.from[1] + 0.5) * cellPx, y: (d.from[0] + 0.5) * cellPx }, e = { x: (d.to[1] + 0.5) * cellPx, y: (d.to[0] + 0.5) * cellPx };
        const len = Math.hypot(e.x - a.x, e.y - a.y) + cellPx, ang = Math.atan2(e.y - a.y, e.x - a.x);   // 첫·끝 칸을 모두 덮는 길이
        const mx = (a.x + e.x) / 2, my = (a.y + e.y) / 2, w = len, h = len * im.height / im.width;
        const put = (c2, ox, oy) => { c2.save(); c2.translate(mx + ox, my + oy); c2.rotate(ang); c2.drawImage(im, -w / 2, -h / 2, w, h); c2.restore(); };
        if (d.shadow) {
          const SH = K.strip.shadow, lay = newCanvas(S, S), lx = lay.getContext('2d');
          put(lx, 0, 0);
          lx.globalCompositeOperation = 'source-in';
          lx.fillStyle = '#000';
          lx.fillRect(0, 0, S, S);
          ctx.save();
          ctx.globalAlpha = SH.alpha;
          if ('filter' in ctx) ctx.filter = `blur(${SH.blur * cellPx}px)`;
          ctx.drawImage(lay, SH.dx * cellPx, SH.dy * cellPx);
          ctx.restore();
        }
        put(ctx, 0, 0);
      } else if (d.type === 'scar') {
        const w = d.size * cellPx / (d.fill || 1), h = w * im.height / im.width;
        ctx.save();
        ctx.globalAlpha = K.scar.alpha;
        ctx.translate((d.at[1] + 0.5) * cellPx, (d.at[0] + 0.5) * cellPx);
        ctx.rotate((d.rot || 0) * Math.PI / 180);
        ctx.drawImage(im, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }

    // 7. 활주로 (규칙상 표식일 뿐: 이동·지형·시야와 무관)
    if (o.img.runway) {
      const im = o.img.runway, RW = K.runway;
      for (const rw of o.runways || []) {
        const x0 = (rw.col + RW.inset) * cellPx, w = (1 - 2 * RW.inset) * cellPx;
        const y0 = rw.rows[0] * cellPx, y1 = (rw.rows[1] + 1) * cellPx, piece = 2 * w;
        for (let y = y0; y < y1 - 0.5; y += piece) {
          const h = Math.min(piece, y1 - y);
          ctx.drawImage(im, 0, 0, im.width, im.height * (h / piece), x0, y, w, h);
        }
        ctx.strokeStyle = RW.edge;
        ctx.lineWidth = Math.max(1, cellPx * 0.018);
        ctx.strokeRect(x0 + ctx.lineWidth / 2, y0 + ctx.lineWidth / 2, w - ctx.lineWidth, y1 - y0 - ctx.lineWidth);
        // 문턱 표지: 위아래 끝에 흰 줄무늬 4개씩
        ctx.fillStyle = 'rgba(245,245,240,0.9)';
        const bw = w / (RW.bars * 2 + 1), bl = RW.barLen * cellPx, gap = RW.barGap * cellPx;
        for (let k = 0; k < RW.bars; k++) {
          const bx = x0 + bw * (1 + 2 * k);
          ctx.fillRect(bx, y0 + gap, bw, bl);
          ctx.fillRect(bx, y1 - gap - bl, bw, bl);
        }
      }
    }

    // 8. 마무리: 비네트 + 필름 입자
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.38, S / 2, S / 2, S * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${K.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const GS = 128, gc = newCanvas(GS, GS), gx = gc.getContext('2d'), gi = gx.createImageData(GS, GS);
    for (let i = 0; i < GS * GS; i++) { const v = 128 + Math.round((rnd() * 2 - 1) * K.grain); gi.data[i * 4] = gi.data[i * 4 + 1] = gi.data[i * 4 + 2] = v; gi.data[i * 4 + 3] = 255; }
    gx.putImageData(gi, 0, 0);
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(gc, 'repeat');
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** art 에 나오는 이미지 경로 목록 (불러오기용) */
  function artSources(art, unitFiles) {
    const out = [];
    for (const [k, src] of Object.entries(art.terrain || {})) out.push({ kind: 'terrain', key: k, src });
    for (const ov of art.overlays || []) if (ov.src) out.push({ kind: ov.type, key: ov.type, src: ov.src });
    const seen = new Set();   // 장식 그림 (마른 밭·밀밭·줄·자국): 같은 파일은 한 번만 불러옴
    for (const v of [art.dryField, ...(art.fields || []), ...(art.decor || [])]) {
      if (v && v.src && !seen.has(v.src)) { seen.add(v.src); out.push({ kind: 'decor', key: v.src, src: v.src }); }
    }
    for (const [type, file] of Object.entries(unitFiles)) out.push({ kind: 'unit', key: type, src: `assets/units/${art.unitSet}/${file}.png` });
    return out;
  }

  return { paint, artSources, K };
})();
