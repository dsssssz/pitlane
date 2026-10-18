#!/usr/bin/env python3
"""v167: убрать зелёный/мятный из растровых ассетов — зелёные пиксели → платина/графит той же яркости.
Использование: python3 tools/degreen.py файл... (перезаписывает на месте, формат и прозрачность сохраняются)."""
import sys, os
import numpy as np
from PIL import Image

PLAT = np.array([201, 198, 191], dtype=np.float32) / 255.0  # тон платины (тёплый серый)

DARK = 1.0
def degreen(arr):
    rgb = arr[..., :3].astype(np.float32) / 255.0
    mx = rgb.max(-1); mn = rgb.min(-1); d = mx - mn
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.zeros_like(mx)
    m = d > 1e-6
    gi = m & (mx == g)
    h[gi] = (((b - r)[gi] / d[gi]) + 2) * 60
    ri = m & (mx == r) & ~gi
    h[ri] = (((g - b)[ri] / d[ri]) % 6) * 60
    bi = m & (mx == b) & ~gi & ~ri
    h[bi] = (((r - g)[bi] / d[bi]) + 4) * 60
    sat = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    # зелёный диапазон (жёлто-зелёный … бирюзовый), заметная насыщенность; плавная маска по краям
    w = np.clip((sat - 0.12) / 0.18, 0, 1) * np.clip((62 - np.abs(h - 122)) / 14, 0, 1)  # полный вес 74°…170°, мягкий край
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    tgt = luma[..., None] * DARK * (PLAT / PLAT.mean())
    out = rgb * (1 - w[..., None]) + np.clip(tgt, 0, 1) * w[..., None]
    arr = arr.copy(); arr[..., :3] = np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)
    return arr, float(w.mean())

args = sys.argv[1:]
if args and args[0] == '--graphite': DARK = 0.55; args = args[1:]  # ливрея машины → графит
for p in args:
    im = Image.open(p); fmt = im.format; mode = 'RGBA' if ('A' in im.getbands() or im.mode == 'P') else 'RGB'
    a = np.array(im.convert(mode)); a2, share = degreen(a)
    o = Image.fromarray(a2, mode)
    ext = os.path.splitext(p)[1].lower()
    kw = {}
    if ext == '.webp': kw = dict(quality=86, method=6)
    elif ext in ('.jpg', '.jpeg'): kw = dict(quality=88, optimize=True, progressive=True); o = o.convert('RGB')
    elif ext == '.avif': kw = dict(quality=70)
    elif ext == '.png': kw = dict(optimize=True)
    o.save(p, **kw)
    print(f'{p}: зелёного было {share*100:.2f}%')
