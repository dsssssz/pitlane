#!/usr/bin/env python3
"""v136: запечённый зелёный неон → сдержанный мятный акцент v133 (--acc-rgb 158,205,176, тон ~143°).
Пиксели зелёного тона (70–170°) с насыщенностью > 0.3: тон → 143°, насыщенность ≤ 0.26, яркость ×0.88.
Остальное не трогаем. Файл перезаписывается, только если не стал тяжелее оригинала (лестница качества).
  python3 tools/mute-green.py img/track-maps/*.webp img/banners/duels-*.webp img/tg/banner.jpg img/icon-*.png …"""
import sys, io, os
import numpy as np
from PIL import Image

def mute(im):
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255.0
    rgb, al = a[..., :3], a[..., 3:]
    mx, mn = rgb.max(-1), rgb.min(-1); d = mx - mn
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.zeros_like(mx); nz = d > 1e-6
    hr = nz & (mx == r); hg = nz & (mx == g) & ~hr; hb = nz & ~hr & ~hg
    h[hr] = ((g - b)[hr] / d[hr]) % 6; h[hg] = (b - r)[hg] / d[hg] + 2; h[hb] = (r - g)[hb] / d[hb] + 4
    h *= 60; s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0); v = mx
    m = (h >= 70) & (h <= 170) & (s > 0.3)
    # плавный край маски по насыщенности, чтобы не было ступеней
    w = np.clip((s - 0.3) / 0.15, 0, 1) * m
    s2 = np.minimum(s, 0.26); v2 = v * 0.88; h2 = np.full_like(h, 143.0)
    def hsv2rgb(H, S, V):
        c = V * S; x = c * (1 - np.abs((H / 60) % 2 - 1)); z = V - c
        k = (H // 60).astype(int) % 6
        R = np.choose(k, [c, x, 0 * c, 0 * c, x, c]); G = np.choose(k, [x, c, c, x, 0 * c, 0 * c]); B = np.choose(k, [0 * c, 0 * c, x, c, c, x])
        return np.stack([R + z, G + z, B + z], -1)
    new = hsv2rgb(h2, s2, v2)
    out = rgb * (1 - w[..., None]) + new * w[..., None]
    o = np.concatenate([out, al], -1)
    return Image.fromarray((np.clip(o, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA'), float(m.mean())

def save(img, path, orig_size, mode, has_alpha):
    ext = os.path.splitext(path)[1].lower()
    if not has_alpha: img = img.convert('RGB')
    tries = []
    if ext == '.webp': tries = [dict(format='WEBP', quality=q, method=6) for q in (82, 78, 74, 70, 66, 62)]
    elif ext in ('.jpg', '.jpeg'): tries = [dict(format='JPEG', quality=q, optimize=True, progressive=True) for q in (86, 82, 78, 74, 70)]
    elif ext == '.png': tries = [dict(format='PNG', optimize=True)] + [dict(format='PNG', optimize=True, _pal=n) for n in (256, 128)]
    for t in tries:
        t = dict(t); pal = t.pop('_pal', None); im2 = img
        if pal: im2 = img.convert('RGBA' if has_alpha else 'RGB').quantize(pal, method=Image.Quantize.FASTOCTREE if has_alpha else Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        buf = io.BytesIO(); im2.save(buf, **t)
        if buf.tell() <= orig_size:
            open(path, 'wb').write(buf.getvalue()); return buf.tell(), t
    return None, None

for p in sys.argv[1:]:
    raw = open(p, 'rb').read(); im = Image.open(io.BytesIO(raw)); alpha = im.mode in ('RGBA', 'LA') or 'transparency' in im.info
    out, share = mute(im)
    n, how = save(out, p, len(raw), im.mode, alpha)
    print(f'{p}: green {share*100:.2f}% · {len(raw)} → {n if n else "НЕ сохранено (тяжелее)"} {how or ""}')
