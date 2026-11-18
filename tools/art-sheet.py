# 개발용: 확인용 이미지 (tools/out/ru-sheet.png: 보정 전/후 두 줄, tools/out/ru-vs-ua.png: 같은 병종 쌍)
import os
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'units')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'); os.makedirs(OUT, exist_ok=True)
BG, CELL = (0x5a, 0x66, 0x48, 255), 200
NAMES = ['armor', 'infantry', 'recon', 'mortar', 'comms', 'antitank', 'artillery']
def fit(p):
    im = Image.open(p).convert('RGBA'); k = (CELL - 20) / max(im.size)
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
def sheet(rows, path, labels=None):
    W = CELL * max(len(r) for r in rows); H = CELL * len(rows)
    sh = Image.new('RGBA', (W, H), BG)
    for y, row in enumerate(rows):
        for x, p in enumerate(row):
            if p and os.path.exists(p):
                im = fit(p); sh.alpha_composite(im, (x * CELL + (CELL - im.width) // 2, y * CELL + (CELL - im.height) // 2))
    sh.convert('RGB').save(path)
ru = lambda n, d='': os.path.join(ROOT, 'ru', d, n + '.png')
sheet([[ru(n, '_orig') for n in NAMES], [ru(n) for n in NAMES]], os.path.join(OUT, 'ru-sheet.png'))
h = lambda n: os.path.join(ROOT, 'hostomel', n + '.png')
ua = os.path.join(ROOT, 'ua', 'recon.png')
sheet([[ru('armor'), h('armor')], [ru('infantry', '_orig'), h('infantry')], [ru('recon'), ua]], os.path.join(OUT, 'ru-vs-ua.png'))
