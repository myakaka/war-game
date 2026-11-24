"""생성형 AI 그림 정리 도구 (게임이 불러오지 않음, Python + Pillow + numpy).
마젠타(#FF00FF) 배경을 투명으로 지우고(가장자리 번짐 제거), 여백을 자르고, 긴 변을 MAXPX 로 줄여 같은 이름으로 저장한다.
땅 질감(ground_*.png)은 정사각 JPG 로 줄인다. 원본은 assets/_raw/ 에 보관(이미 있으면 덮어쓰지 않음).
사용: python tools/prep-assets.py            (아래 목록 전체)
      python tools/prep-assets.py assets/cover/cover_rock.png ...   (지정한 파일만, 마젠타 그림)"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'assets' / '_raw'
MAXPX = 900      # 엄폐물·장식 그림 긴 변 상한 (칸은 화면에서 수십~백 px 라 충분)
GROUND_PX = 768  # 땅 질감 한 변 (plain.jpg 와 같은 크기)
SPRITES = ['assets/cover/cover_rock.png', 'assets/cover/cover_rubble.png', 'assets/cover/cover_wall.png',
           'assets/cover/cover_ditch.png', 'assets/cover/cover_wreck.png', 'assets/terrain/wire.png',
           'assets/decal/decal_scorch.png', 'assets/decal/decal_crater.png', 'assets/decal/decal_tracks.png', 'assets/decal/decal_debris.png']
ROTATE = {'assets/cover/cover_wreck.png': 90}   # 세로로 긴 부서진 차를 가로로 (담장처럼 위쪽이 정면)
GROUNDS = ['assets/terrain/ground_base.png', 'assets/terrain/ground_gravel.png', 'assets/terrain/ground_dark.png']


def keep_raw(p: Path):
    dst = RAW / p.relative_to(ROOT / 'assets')
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        dst.write_bytes(p.read_bytes())


def key_magenta(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g                       # 마젠타 정도 (회색·갈색 물체는 낮음)
    alpha = 1.0 - np.clip((m - 35.0) / (120.0 - 35.0), 0.0, 1.0)
    spill = np.clip(np.minimum(r, b) - g, 0.0, None)   # 갈색·회색은 파랑이 초록보다 낮거나 비슷해 거의 0, 분홍·보라 번짐만 큼
    r2 = r - spill; b2 = b - spill                  # 모든 칸에서 분홍·보라 번짐을 초록 쪽으로 눌러 지움
    out = np.dstack([r2, g, b2, alpha * 255.0]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def do_sprite(rel: str):
    p = ROOT / rel
    if not p.exists():
        print('없음', rel); return
    keep_raw(p)
    im = key_magenta(Image.open(RAW / p.relative_to(ROOT / 'assets')).convert('RGB'))
    bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if bb: im = im.crop(bb)
    if rel in ROTATE: im = im.rotate(ROTATE[rel], expand=True)   # 기본 방향(rotation 0)에서 정면이 위쪽(N)이 되도록 눕힘
    s = MAXPX / max(im.size)
    if s < 1: im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(p, optimize=True)
    print('그림', rel, im.size, '%.0f KB' % (p.stat().st_size / 1024))


def do_ground(rel: str):
    p = ROOT / rel
    if not p.exists():
        print('없음', rel); return
    keep_raw(p)
    im = Image.open(RAW / p.relative_to(ROOT / 'assets')).convert('RGB').resize((GROUND_PX, GROUND_PX), Image.LANCZOS)
    out = p.with_suffix('.jpg')
    im.save(out, quality=88, optimize=True)
    p.unlink()
    print('땅', out.relative_to(ROOT), '%.0f KB' % (out.stat().st_size / 1024))


TRENCHES = ['assets/terrain/trench_corner_left_bottom.png', 'assets/terrain/trench_end_open_top.png', 'assets/terrain/trench_straight_h_a.png',
            'assets/terrain/trench_straight_h_b.png', 'assets/terrain/trench_straight_v.png']


def do_ungreen(rel: str):
    """참호 그림 가장자리에 박힌 초록 풀색을 회갈색 땅에 어울리게 옮김 (갈색 흙은 초록이 없어 거의 그대로). 알파 불변"""
    p = ROOT / rel
    if not p.exists():
        print('없음', rel); return
    keep_raw(p)
    im = Image.open(RAW / p.relative_to(ROOT / 'assets')).convert('RGBA')
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    k = np.clip((g - r + 22.0) / 30.0, 0.0, 1.0)            # 풀 정도: 갈색 흙은 빨강이 초록보다 20쯤 높아 0, 올리브·초록 풀은 0.4~1
    luma = 0.3 * r + 0.59 * g + 0.11 * b
    tr, tg, tb = luma * 1.05, luma * 0.97, luma * 0.88       # 목표: 같은 밝기의 회갈색
    kk = k * 0.88
    a[..., 0], a[..., 1], a[..., 2] = r + (tr - r) * kk, g + (tg - g) * kk, b + (tb - b) * kk
    Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA').save(p, optimize=True)
    print('참호', rel)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args == ['--trench']:
        for t in TRENCHES: do_ungreen(t)
    elif args:
        for a in args: do_sprite(a)
    else:
        for s in SPRITES: do_sprite(s)
        for g in GROUNDS: do_ground(g)
        for t in TRENCHES: do_ungreen(t)
