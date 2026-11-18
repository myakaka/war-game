# 개발용: 병종 그림의 색 톤 측정 (게임이 불러오지 않음). python tools/art-tone.py [폴더...]
import sys, glob, os
import numpy as np
from PIL import Image
import colorsys

def stats(path):
    im = Image.open(path)
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    mask = a[..., 3] > 200
    rgb = a[..., :3][mask] / 255.0
    mx, mn = rgb.max(1), rgb.min(1)
    v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    # 평균 색상은 원형 평균 (도)
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat_ok = (mx - mn) > 1e-3
    hr = np.deg2rad(h[sat_ok])
    H = np.rad2deg(np.arctan2(np.sin(hr).mean(), np.cos(hr).mean())) % 360 if sat_ok.any() else 0
    ys, xs = np.where(mask)
    return dict(H=H, S=float(s.mean()), V=float(v.mean()), n=int(mask.sum()), mode=im.mode,
                bbox=(int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())) if mask.any() else None, size=im.size)

if __name__ == '__main__':
    dirs = sys.argv[1:] or ['assets/units/ru', 'assets/units/ua']
    print('파일 | H | S | V | 불투명 픽셀 | 모드 | 크기 | 불투명 영역')
    for d in dirs:
        for f in sorted(glob.glob(os.path.join(d, '*.png'))):
            s = stats(f)
            print(f"{f.replace(os.sep,'/')} | {s['H']:.0f} | {s['S']:.3f} | {s['V']:.3f} | {s['n']} | {s['mode']} | {s['size']} | {s['bbox']}")
