/* v143: видео + телеметрия. Камера (getUserMedia) → canvas (кадр + оверлей скорости/времени) → MediaRecorder → файл.
 * В Telegram WebView камера/MediaRecorder часто недоступны — тогда спокойный экран с объяснением и ссылкой на веб-версию. */
export function pickMime(isSupported) {
  const list = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of list) { try { if (isSupported(m)) return m; } catch (_) {} }
  return '';
}
export function support(env = globalThis) {
  const nav = env.navigator || {};
  const cam = !!(nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function');
  const rec = typeof env.MediaRecorder === 'function';
  const cap = !!(env.HTMLCanvasElement && env.HTMLCanvasElement.prototype && 'captureStream' in env.HTMLCanvasElement.prototype);
  const secure = env.isSecureContext !== false;
  const reason = !secure ? 'insecure' : !cam ? 'no-camera' : !rec ? 'no-recorder' : !cap ? 'no-capture' : '';
  return { ok: !reason, reason, mime: rec && env.MediaRecorder.isTypeSupported ? pickMime((m) => env.MediaRecorder.isTypeSupported(m)) : '' };
}
export function fmtClock(ms) { ms = Math.max(0, ms | 0); const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), d = Math.floor((ms % 1000) / 100); return m + ':' + String(s).padStart(2, '0') + '.' + d; }
export function fileName(mime, now = new Date()) { const p = (n) => String(n).padStart(2, '0'); return `pitlane-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.${/mp4/.test(mime) ? 'mp4' : 'webm'}`; }

/** Оверлей: крупная скорость снизу слева, время справа, тонкая шкала скорости, марка PITLANE. Без свечения. */
export function drawOverlay(ctx, W, H, o) {
  const s = Math.min(W, H) / 720;
  const g = ctx.createLinearGradient(0, H * 0.62, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)');
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.62, W, H * 0.38);
  const pad = 36 * s;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f4f4f2'; ctx.font = `300 ${132 * s}px Manrope, system-ui, sans-serif`; ctx.textAlign = 'left';
  ctx.fillText(String(Math.round(o.speed || 0)), pad, H - pad - 26 * s);
  ctx.fillStyle = 'rgba(244,244,242,.6)'; ctx.font = `600 ${18 * s}px Manrope, system-ui, sans-serif`;
  ctx.fillText('КМ/Ч', pad + 4 * s, H - pad);
  ctx.textAlign = 'right'; ctx.fillStyle = '#f4f4f2'; ctx.font = `400 ${64 * s}px Manrope, system-ui, sans-serif`;
  ctx.fillText(fmtClock(o.ms), W - pad, H - pad - 26 * s);
  ctx.fillStyle = 'rgba(244,244,242,.6)'; ctx.font = `600 ${18 * s}px Manrope, system-ui, sans-serif`;
  ctx.fillText((o.label || 'ВРЕМЯ').toUpperCase(), W - pad, H - pad);
  const bw = W - pad * 2, by = H - pad - 190 * s;
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(pad, by, bw, 3 * s);
  ctx.fillStyle = 'rgb(158,205,176)'; ctx.fillRect(pad, by, bw * Math.min(1, (o.speed || 0) / 300), 3 * s);
  ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(244,244,242,.85)'; ctx.font = `700 ${20 * s}px Manrope, system-ui, sans-serif`;
  ctx.fillText('PITLANE', pad, pad + 20 * s);
  if (o.rec) { ctx.textAlign = 'right'; ctx.fillStyle = '#d49a9a'; ctx.font = `600 ${18 * s}px Manrope, system-ui, sans-serif`; ctx.fillText('● REC', W - pad, pad + 20 * s); }
}

export function openVideo({ getSpeed, getLabel, hap, webUrl, autostart = false, onClose }) {
  let root = document.getElementById('vtSheet');
  if (root) root.remove();
  root = document.createElement('div'); root.id = 'vtSheet'; root.className = 'vt-sheet'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Видео с телеметрией');
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const close = mk('button', 'vt-close', 'Закрыть'); close.type = 'button'; close.id = 'vtClose';
  const stage = mk('div', 'vt-stage'); const canvas = mk('canvas', 'vt-canvas'); canvas.width = 720; canvas.height = 1280; stage.appendChild(canvas);
  const msg = mk('p', 'vt-msg'); msg.setAttribute('role', 'status');
  const btn = mk('button', 'vt-rec', 'Включить камеру'); btn.type = 'button';
  const out = mk('div', 'vt-out');
  root.append(close, stage, msg, btn, out);
  document.body.appendChild(root);
  const S = support();
  let stream = null, rec = null, chunks = [], raf = 0, t0 = 0, video = null, phase = 'idle';
  const stop = () => { cancelAnimationFrame(raf); try { rec && rec.state !== 'inactive' && rec.stop(); } catch (_) {} stream?.getTracks().forEach((t) => t.stop()); stream = null; };
  close.addEventListener('click', () => { stop(); root.remove(); try { onClose?.(); } catch (_) {} });
  if (!S.ok) {
    stage.classList.add('vt-off'); stage.textContent = '';
    stage.append(mk('b', null, 'Запись здесь недоступна'), mk('span', null, S.reason === 'no-camera' || S.reason === 'insecure' ? 'Это окно не даёт доступ к камере. Откройте PITLANE в браузере телефона — там запись работает.' : 'Браузер не умеет записывать видео с оверлеем. Откройте PITLANE в Chrome или Safari.'));
    btn.textContent = 'Открыть в браузере'; btn.addEventListener('click', () => { try { window.Telegram?.WebApp?.openLink ? window.Telegram.WebApp.openLink(webUrl) : window.open(webUrl, '_blank', 'noopener'); } catch (_) {} });
    return { root, support: S };
  }
  const ctx = canvas.getContext('2d');
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#0d0d0e'; ctx.fillRect(0, 0, W, H);
    if (video && video.readyState >= 2) { const vw = video.videoWidth, vh = video.videoHeight; const k = Math.max(W / vw, H / vh); ctx.drawImage(video, (W - vw * k) / 2, (H - vh * k) / 2, vw * k, vh * k); }
    drawOverlay(ctx, W, H, { speed: getSpeed(), ms: phase === 'rec' ? performance.now() - t0 : 0, label: getLabel?.() || 'время', rec: phase === 'rec' });
  };
  msg.textContent = 'Закрепите телефон в держателе. Скорость берётся из текущего источника GPS.';
  const step = async () => {
    hap?.(8);
    if (phase === 'idle') {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
      catch (_) { msg.textContent = 'Нет доступа к камере. Разрешите камеру в настройках и повторите.'; return; }
      video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream; await video.play().catch(() => {});
      phase = 'ready'; btn.textContent = 'Запись'; msg.textContent = ''; loop(); return;
    }
    if (phase === 'ready') {
      chunks = []; const cs = canvas.captureStream(30);
      try { rec = new MediaRecorder(cs, S.mime ? { mimeType: S.mime, videoBitsPerSecond: 6e6 } : undefined); } catch (_) { msg.textContent = 'Запись не запустилась на этом устройстве.'; return; }
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || S.mime || 'video/webm'; const blob = new Blob(chunks, { type }); const name = fileName(type);
        out.textContent = ''; const url = URL.createObjectURL(blob);
        const a = mk('a', 'vt-dl', 'Сохранить видео'); a.href = url; a.download = name; out.appendChild(a);
        if (navigator.canShare && typeof File === 'function') { const f = new File([blob], name, { type }); if (navigator.canShare({ files: [f] })) { const sh = mk('button', 'vt-share', 'Поделиться'); sh.type = 'button'; sh.addEventListener('click', () => navigator.share({ files: [f], title: 'PITLANE' }).catch(() => {})); out.appendChild(sh); } }
        msg.textContent = (blob.size / 1048576).toFixed(1) + ' МБ · ' + name;
      };
      rec.start(1000); t0 = performance.now(); phase = 'rec'; btn.textContent = 'Стоп'; btn.classList.add('on'); return;
    }
    if (phase === 'rec') { try { rec.stop(); } catch (_) {} phase = 'ready'; btn.textContent = 'Запись'; btn.classList.remove('on'); }
  };
  btn.addEventListener('click', () => { void step(); });
  // v154: «С видео» под стартом — камера и запись включаются сразу (замер/круг уже запущены под оверлеем)
  if (autostart) void (async () => { await step(); if (phase === 'ready') await step(); })();
  return { root, support: S, canvas, ctx, phase: () => phase };
}
