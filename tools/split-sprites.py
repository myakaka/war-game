"""유닛 그림(군인 3명이 한 장)을 군인 한 명씩 따로 잘라 `<이름>_s1.png ~ _s3.png` 로 저장 (참호 안 배치용, 개발 때 한 번만 실행).
사용: python tools/split-sprites.py   (Pillow, numpy 필요) — 결과 파일은 저장소에 포함됨."""
import os, sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
JOBS = [  # (파일, 다운샘플, 팽창)  팽창이 클수록 가까운 조각을 한 사람으로 묶음
    ('assets/units/hostomel/infantry.png', 4, 2),
    ('assets/units/ru/infantry.png', 2, 0),
    ('assets/units/ua/recon.png', 4, 2),
    ('assets/units/ru/recon.png', 4, 2),
]

def label(a, ds, dil):
    H, W = a.shape; h, w = H // ds, W // ds
    m = a[:h * ds, :w * ds].reshape(h, ds, w, ds).any(axis=(1, 3))
    d = m.copy()
    for _ in range(dil):
        n = d.copy(); n[1:] |= d[:-1]; n[:-1] |= d[1:]; n[:, 1:] |= d[:, :-1]; n[:, :-1] |= d[:, 1:]; d = n
    lab = np.zeros((h, w), dtype=np.int32); k = 0
    for y in range(h):
        for x in range(w):
            if d[y, x] and not lab[y, x]:
                k += 1; q = deque([(y, x)]); lab[y, x] = k; cnt = 0
                while q:
                    cy, cx = q.popleft(); cnt += 1
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < h and 0 <= nx < w and d[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = k; q.append((ny, nx))
    return lab, k

for rel, ds, dil in JOBS:
    path = os.path.join(ROOT, rel)
    im = Image.open(path).convert('RGBA'); arr = np.array(im); a = arr[:, :, 3] > 40
    lab, k = label(a, ds, dil)
    full = np.kron(lab, np.ones((ds, ds), dtype=np.int32))
    pad = np.zeros(a.shape, dtype=np.int32); pad[:full.shape[0], :full.shape[1]] = full
    parts = []
    for i in range(1, k + 1):
        mask = (pad == i) & (arr[:, :, 3] > 0)
        if mask.sum() < 800: continue
        ys, xs = np.where(mask & a)
        parts.append((int(ys.min()), i, mask, int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1))
    parts.sort(key=lambda p: p[0])
    base = os.path.splitext(path)[0]
    for n, (_, i, mask, x0, x1, y0, y1) in enumerate(parts, 1):
        out = arr.copy(); out[~mask] = 0
        Image.fromarray(out[y0:y1, x0:x1]).save(f'{base}_s{n}.png', optimize=True)
        print(rel, n, (x1 - x0, y1 - y0))
    if len(parts) != 3: print('!! 군인 수가 3이 아님:', rel, len(parts)); sys.exit(1)
