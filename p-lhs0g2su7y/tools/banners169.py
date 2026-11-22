#!/usr/bin/env python3
"""v170: новые баннеры главной. Берёт img/banners/raw/{gps,tops,duels,video,track}.jpg (сгенерированные 1024×576),
делает bn-<k>-1560.webp (<200 КБ) и bn-<k>-800.webp, чистит зелень (tools/degreen.py) и вписывает в #bn52Track index.html + sw.js."""
import os, re, subprocess, sys
from PIL import Image, ImageFilter
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(R)
K = ['gps', 'tops', 'duels', 'video', 'track']
ONLY = [a for a in sys.argv[1:] if a in K] or K  # v174: можно пересобрать один баннер: banners169.py video
OLD = {'gps': './img/shop/gps-hero-720.webp', 'tops': './img/banners/tracks-800.webp', 'duels': './img/banners/duels-800.webp', 'video': './img/banners/paddock-800.webp', 'track': './img/track-maps/auto-msk-full.webp'}
for k in ONLY:
    src = f'img/banners/raw/{k}.jpg'
    if not os.path.exists(src): sys.exit('нет ' + src)
    tmp = f'/tmp/bn-{k}-dg.png'; Image.open(src).convert('RGB').save(tmp)
    subprocess.run([sys.executable, 'tools/degreen.py', tmp], check=False)  # зелень → платина до сжатия
    im = Image.open(tmp).convert('RGB')
    # оливковая/жёлто-зелёная трава (вне диапазона degreen) — почти в серый той же яркости
    import numpy as np
    hsv = np.array(im.convert('HSV')).astype(np.float32); h = hsv[..., 0] * 360 / 255
    m = ((h > 40) & (h < 170)).astype(np.float32) * np.clip((hsv[..., 1] - 18) / 40, 0, 1)
    a = np.array(im).astype(np.float32); L = (a @ np.array([.299, .587, .114], np.float32))[..., None]
    a = a * (1 - .88 * m[..., None]) + L * (.88 * m[..., None]); im = Image.fromarray(a.clip(0, 255).astype('uint8'))
    for w, cap in ((1560, 195000), (800, 80000)):
        o = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        if w == 1560: o = o.filter(ImageFilter.UnsharpMask(radius=1.2, percent=35, threshold=2))
        p = f'img/banners/bn-{k}-{w}.webp'; q = 92
        while True:
            o.save(p, 'WEBP', quality=q, method=6)
            if os.path.getsize(p) < cap or q <= 50: break
            q -= 4
        print(p, os.path.getsize(p), 'q', q)
h = open('index.html').read()
a = h.index('id="bn52Track"'); b = a + 2500
seg = h[a:b]
for k in K:
    new = f'./img/banners/bn-{k}-800.webp" srcset="./img/banners/bn-{k}-800.webp 800w, ./img/banners/bn-{k}-1560.webp 1560w" sizes="100vw'
    seg = seg.replace(OLD[k] + '"', new + '"', 1)
h = h[:a] + seg + h[b:]
open('index.html', 'w').write(h)
s = open('sw.js').read()
if 'bn-gps-800' not in s:
    s = s.replace("  './img/shop/gps-hero-720.webp',", "  './img/shop/gps-hero-720.webp',\n" + ''.join(f"  './img/banners/bn-{k}-800.webp',\n" for k in K).rstrip('\n'), 1)
open('sw.js', 'w').write(s)
print('wired', sum(f'bn-{k}-1560' in seg for k in K), 'of 5')
