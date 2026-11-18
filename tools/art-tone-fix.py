# 개발용(게임이 불러오지 않음): 러시아군 병종 그림의 채도(S)·밝기(V)를 중앙값에 맞추고, 투명 여백을 잘라 가볍게 만든다.
#   python tools/art-tone-fix.py            # ru/_orig 의 원본을 읽어 ru/ 에 보정본을 쓴다 (_orig 가 없으면 만든다)
# 규칙: S ±0.03, V ±0.05 안으로. 이미 안이면 그대로. 한 번에 최대 ±20%, 안 되면 보정 없이 보고.
# 색상(H)과 알파는 건드리지 않는다. 투명 PNG 가 아닌 파일(infantry)은 배포하지 않으므로 건너뛴다 (측정에는 흰 바탕 제외로 포함).
import os, shutil, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'units')
RU, UA = os.path.join(ROOT, 'ru'), os.path.join(ROOT, 'ua')
TOL_S, TOL_V, MAXCHG, LONG_PX = 0.03, 0.05, 0.20, 512

def hsv(rgb):
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    dd = np.maximum(d, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4))
    return h, s, mx
def rgb_of(h, s, v):
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    out = np.empty(h.shape + (3,), np.float32)
    for k, (a, b, c) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        m = i == k
        out[m, 0], out[m, 1], out[m, 2] = a[m], b[m], c[m]
    return out
def measure(path_or_arr, proxy=False):
    a = np.asarray(Image.open(path_or_arr).convert('RGBA')).astype(np.float32) / 255 if isinstance(path_or_arr, str) else path_or_arr
    m = a[..., 3] > 200 / 255
    if proxy:   # 알파가 없는 파일: 흰 바탕(가장 어두운 채널 > 0.92)을 뺀 픽셀만
        m &= a[..., :3].min(-1) < 0.92
    _, s, v = hsv(a[..., :3][m])
    return float(s.mean()), float(v.mean())
def adjust(a, ks, kv):
    h, s, v = hsv(a[..., :3])
    out = a.copy()
    out[..., :3] = rgb_of(h, np.clip(s * ks, 0, 1), np.clip(v * kv, 0, 1))
    return out
def crop_small(img):
    a = np.asarray(img)
    ys, xs = np.where(a[..., 3] > 0)
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    k = LONG_PX / max(img.size)
    if k < 1: img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    return img

def main():
    orig = os.path.join(RU, '_orig')
    if not os.path.isdir(orig):
        os.makedirs(orig)
        for f in os.listdir(RU):
            if f.endswith('.png'): shutil.copy2(os.path.join(RU, f), os.path.join(orig, f))
    names = sorted(f for f in os.listdir(orig) if f.endswith('.png'))
    meas = {}
    for f in names:
        im = Image.open(os.path.join(orig, f))
        meas[f] = measure(os.path.join(orig, f), proxy=im.mode != 'RGBA')
    S0 = float(np.median([m[0] for m in meas.values()])); V0 = float(np.median([m[1] for m in meas.values()]))
    print(f'기준(중앙값): S={S0:.3f} V={V0:.3f}   허용 S {S0-TOL_S:.3f}~{S0+TOL_S:.3f}, V {V0-TOL_V:.3f}~{V0+TOL_V:.3f}')
    print('파일 | 전 S | 전 V | 후 S | 후 V | 결과')
    for f in names:
        im = Image.open(os.path.join(orig, f))
        s, v = meas[f]
        if im.mode != 'RGBA':
            print(f'{f} | {s:.3f} | {v:.3f} | - | - | 건너뜀: 투명 배경 없음 (RGB). 게임에 연결하지 않음 — 투명 PNG 로 다시 필요')
            continue
        a = np.asarray(im).astype(np.float32) / 255
        tS = min(max(s, S0 - TOL_S + 0.004), S0 + TOL_S - 0.004) if abs(s - S0) > TOL_S else s
        tV = min(max(v, V0 - TOL_V + 0.004), V0 + TOL_V - 0.004) if abs(v - V0) > TOL_V else v
        ks, kv = tS / s, tV / v
        note = '그대로'
        cur = a
        if (ks, kv) != (1, 1):
            if abs(ks - 1) > MAXCHG or abs(kv - 1) > MAXCHG:
                note = f'보정 안 함: 필요한 변화 S {ks-1:+.0%}, V {kv-1:+.0%} (한계 ±20%)'
            else:
                cur = adjust(a, ks, kv)
                for _ in range(4):   # 밝기 클리핑 등으로 어긋난 만큼 다시 맞춤
                    s2, v2 = measure(cur)
                    k2s = tS / s2 if abs(s2 - tS) > 0.002 else 1
                    k2v = tV / v2 if abs(v2 - tV) > 0.002 else 1
                    if (k2s, k2v) == (1, 1): break
                    ks, kv = ks * k2s, kv * k2v
                    if abs(ks - 1) > MAXCHG or abs(kv - 1) > MAXCHG: break
                    cur = adjust(a, ks, kv)
                note = f'보정: S {ks-1:+.1%}, V {kv-1:+.1%}'
        s2, v2 = measure(cur)
        okS, okV = abs(s2 - S0) <= TOL_S + 1e-4, abs(v2 - V0) <= TOL_V + 1e-4
        if not (okS and okV) and note.startswith('보정:'): note += ' (경고: 허용 범위 밖)'
        print(f'{f} | {s:.3f} | {v:.3f} | {s2:.3f} | {v2:.3f} | {note}')
        out = Image.fromarray(np.round(cur * 255).astype(np.uint8), 'RGBA')
        # 알파는 원본 그대로 (색 보정이 알파를 바꾸지 않았는지 확인)
        assert np.array_equal(np.asarray(out)[..., 3], np.asarray(im)[..., 3])
        crop_small(out).save(os.path.join(RU, f), optimize=True)
    # 우크라이나 새 정찰: 보정 없이 여백만 정리
    uo = os.path.join(UA, '_orig')
    if not os.path.isdir(uo):
        os.makedirs(uo); shutil.copy2(os.path.join(UA, 'recon.png'), os.path.join(uo, 'recon.png'))
    crop_small(Image.open(os.path.join(uo, 'recon.png')).convert('RGBA')).save(os.path.join(UA, 'recon.png'), optimize=True)
main()
