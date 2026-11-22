// v345: iOS 26 Liquid Glass — настоящая линзовая рефракция кромки в Chromium (Android Telegram):
// backdrop-filter: url(#svg) с картой смещения под форму пилюли/круга + лёгкая дисперсия (R/G/B смещаются по-разному).
// В WebKit (iOS WKWebView) SVG-фильтры в backdrop-filter не работают — там остаётся CSS-кромка (.n3-edge) с blur/brightness.
const NS = 'http://www.w3.org/2000/svg';
const isChromium = () => { const ua = navigator.userAgent || ''; return /Chrome\/|Chromium\//.test(ua) && !/iPhone|iPad|iPod|CriOS|FxiOS|EdgiOS/.test(ua); };

// карта смещения: R/G = 128 ± наружная нормаль × сила. Сила растёт к кромке (выпуклая линза).
function mapURL(w, h, r, bezel) {
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h)); r = Math.min(r, w / 2, h / 2);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h); const d = img.data;
  const hx = w / 2, hy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5 - hx, py = y + 0.5 - hy;
    const qx = Math.abs(px) - (hx - r), qy = Math.abs(py) - (hy - r);
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0); const ol = Math.hypot(ox, oy);
    const sd = ol + Math.min(Math.max(qx, qy), 0) - r; // <0 внутри
    let nx = 0, ny = 0;
    if (ol > 0) { nx = ox / ol; ny = oy / ol; } else if (qx > qy) nx = 1; else ny = 1;
    nx *= Math.sign(px) || 1; ny *= Math.sign(py) || 1;
    const din = -sd; let m = 0;
    if (din < bezel) { const t = 1 - Math.max(din, 0) / bezel; m = 1 - Math.sqrt(1 - t * t); } // профиль круга: сильнее у края
    const i = (y * w + x) * 4;
    d[i] = 128 + Math.round(127 * m * nx); d[i + 1] = 128 + Math.round(127 * m * ny); d[i + 2] = 128; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c.toDataURL('image/png');
}

function makeFilter(svg, id, scale) {
  const f = document.createElementNS(NS, 'filter');
  f.setAttribute('id', id); f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', '100%'); f.setAttribute('height', '100%');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  // дисперсия: красный смещается сильнее, синий слабее — тонкая цветная кайма на кромке
  f.innerHTML = `<feImage x="0" y="0" width="10" height="10" preserveAspectRatio="none" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="dr"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale * 0.9}" xChannelSelector="R" yChannelSelector="G" result="dg"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale * 0.8}" xChannelSelector="R" yChannelSelector="G" result="db"/>
    <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
    <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
    <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
    <feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg"/>
    <feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1"/>`;
  svg.appendChild(f); return f.querySelector('feImage');
}

export function initGlass345() {
  if (!isChromium()) return;
  const surface = document.getElementById('n3Surface'); const fab = document.getElementById('n3Fab');
  if (!surface || !fab || typeof ResizeObserver === 'undefined') return;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.appendChild(svg);
  const items = [
    { el: surface, img: makeFilter(svg, 'lg345s', 30), key: '', t: 0 },
    { el: fab, img: makeFilter(svg, 'lg345f', 22), key: '', t: 0 },
  ];
  const fit = (it, exact) => {
    const w = it.el.offsetWidth, h = it.el.offsetHeight; if (!w || !h) return;
    it.img.setAttribute('width', String(w)); it.img.setAttribute('height', String(h)); // во время анимации карта растягивается
    if (!exact) return;
    const r = parseFloat(getComputedStyle(it.el).borderTopLeftRadius) || h / 2;
    const key = `${w}x${h}r${Math.round(r)}`; if (key === it.key) return; it.key = key;
    it.img.setAttribute('href', mapURL(w, h, r, Math.min(16, h * 0.34)));
  };
  const ro = new ResizeObserver((ents) => {
    for (const e of ents) { const it = items.find((x) => x.el === e.target); if (!it) continue;
      fit(it, false); clearTimeout(it.t); it.t = setTimeout(() => fit(it, true), 90); }
  });
  items.forEach((it) => { fit(it, true); ro.observe(it.el); });
  document.documentElement.classList.add('lg-refract');
}
