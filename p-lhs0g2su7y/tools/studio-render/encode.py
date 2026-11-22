# Студийные превью: PNG 3120×1950 (2× суперсэмплинг) → 1560/1170/780 px, WebP q84 и AVIF q62 (Pillow).
# python3 encode.py <папка с PNG> <img/cars/studio>
import sys
from PIL import Image, ImageFilter
src, dst = sys.argv[1], sys.argv[2]
IDS = ['g87-m2', 'gt3rs', 'mclaren-765lt', 'g63', 'm4', 'm3', 'x6', 'isf', 'c63-ed507', 'spark']
for i in IDS:
    im = Image.open(f'{src}/{i}.png').convert('RGB')
    for w in (1560, 1170, 780):
        r = im.resize((w, round(w * 0.625)), Image.LANCZOS)
        if w == 1560: r = r.filter(ImageFilter.UnsharpMask(radius=1.0, percent=35, threshold=2))
        r.save(f'{dst}/{i}-{w}.webp', 'WEBP', quality=84, method=6)
        r.save(f'{dst}/{i}-{w}.avif', 'AVIF', quality=62, speed=4)
