/* =====================================================================
   지도 확대/이동 (보기 전용). 게임 상태·규칙·안개와 무관한 순수 계산만 (DOM 없음)
   보기 상태 v = { z, tx, ty }: 지도 틀(라벨 포함)을 왼쪽 위 기준으로 z 배 키운 뒤 (tx, ty) px 만큼 옮김.
   화면 좌표 = 틀 좌표 × z + t. 틀 크기 w × h 는 배율 1 일 때의 크기이며 보이는 창(뷰포트)과 같음
   ===================================================================== */
const ZOOM = {
  minZoom: 1.0,       // 전체 보기 (기본, 이동 없음)
  maxZoom: 2.5,
  step: 1.25,         // + / − 버튼과 키 한 번
  wheelK: 0.0015,     // 휠 deltaY 1 당 배율 지수
  dragPx: 8,          // 누른 지점에서 이 거리(화면 px) 이상 움직이면 끌기 (칸 선택 안 함)
  animMs: 120,        // 확대/축소 보간 (150ms 이내)
};

const zoomIdentity = () => ({ z: 1, tx: 0, ty: 0 });
const clampZoom = (z) => Math.min(ZOOM.maxZoom, Math.max(ZOOM.minZoom, z));

/** 지도가 뷰포트를 항상 덮도록 이동 제한 (가장자리가 뷰포트 가장자리 안으로 들어오지 않음). 배율 1 이면 이동 없음 */
function clampPan(v, w, h) {
  const z = clampZoom(v.z);
  const clamp = (t, size) => Math.min(0, Math.max(size - size * z, t));
  return { z, tx: clamp(v.tx, w), ty: clamp(v.ty, h) };
}

/** 뷰포트 안의 점 (px, py) 가 가리키는 지도 지점을 고정한 채 배율을 z2 로 */
function zoomAt(v, z2, px, py, w, h) {
  const z = clampZoom(z2);
  const mx = (px - v.tx) / v.z, my = (py - v.ty) / v.z;
  return clampPan({ z, tx: px - mx * z, ty: py - my * z }, w, h);
}

/** 화면(뷰포트 기준) 좌표 ↔ 틀 좌표 */
const screenToFrame = (v, x, y) => ({ x: (x - v.tx) / v.z, y: (y - v.ty) / v.z });
const frameToScreen = (v, x, y) => ({ x: x * v.z + v.tx, y: y * v.z + v.ty });

/**
 * 뷰포트 좌표 → 칸 (지도 밖이면 null). geo = { ox, oy (틀 안에서 첫 칸의 왼쪽 위), cell, n }
 */
function pointToCell(v, x, y, geo) {
  const p = screenToFrame(v, x, y);
  const c = Math.floor((p.x - geo.ox) / geo.cell), r = Math.floor((p.y - geo.oy) / geo.cell);
  return r >= 0 && c >= 0 && r < geo.n && c < geo.n ? { r, c } : null;
}
/** 칸 중심의 뷰포트 좌표 */
function cellToPoint(v, r, c, geo) {
  return frameToScreen(v, geo.ox + (c + 0.5) * geo.cell, geo.oy + (r + 0.5) * geo.cell);
}

/** 누르기와 끌기 구분: 누른 지점에서 dragPx 이상 움직였으면 끌기 */
const isDrag = (dx, dy) => Math.hypot(dx, dy) >= ZOOM.dragPx;

/**
 * 틀 좌표의 사각형들(box: {x0, y0, x1, y1})이 모두 뷰포트 안(가장자리 여유 pad)에 보이도록 보기를 조정.
 * 지금 배율에서 들어가면 배율 유지·최소 이동, 안 들어가면 필요한 만큼만 축소 (1 까지)
 */
function fitBoxes(v, boxes, w, h, pad = 0) {
  if (!boxes.length) return clampPan(v, w, h);
  const x0 = Math.min(...boxes.map((b) => b.x0)), y0 = Math.min(...boxes.map((b) => b.y0));
  const x1 = Math.max(...boxes.map((b) => b.x1)), y1 = Math.max(...boxes.map((b) => b.y1));
  const z = clampZoom(Math.min(v.z, (w - 2 * pad) / Math.max(1, x1 - x0), (h - 2 * pad) / Math.max(1, y1 - y0)));
  const pan = (t, a, b, size) => {
    const lo = a * z + t, hi = b * z + t;   // 화면에서의 양 끝
    if (lo < pad) t += pad - lo;
    else if (hi > size - pad) t -= hi - (size - pad);
    return t;
  };
  return clampPan({ z, tx: pan(v.tx * (z / v.z), x0, x1, w), ty: pan(v.ty * (z / v.z), y0, y1, h) }, w, h);
}

if (typeof module !== 'undefined') Object.assign(module.exports, { ZOOM, zoomIdentity, clampZoom, clampPan, zoomAt, screenToFrame, frameToScreen, pointToCell, cellToPoint, isDrag, fitBoxes });
