// v108: подставляет реквизиты из legal-config.js в документы (только textContent / href).
import { LEGAL_CONFIG, LEGAL_REVISION, legalReady } from './legal-config.js';
const c = LEGAL_CONFIG;
const ready = legalReady(c);
document.documentElement.classList.toggle('legal-ready', ready);
document.documentElement.classList.toggle('legal-empty', !ready);
document.querySelectorAll('[data-legal-rev]').forEach((el) => { el.textContent = LEGAL_REVISION; });
if (ready) {
  document.querySelectorAll('[data-legal="name"]').forEach((el) => { el.textContent = c.operatorName; });
  document.querySelectorAll('[data-legal="inn"]').forEach((el) => { el.textContent = c.inn; });
  document.querySelectorAll('[data-legal="tax"]').forEach((el) => { el.textContent = c.taxStatus || ''; });
  document.querySelectorAll('[data-legal="email"]').forEach((el) => {
    el.textContent = c.email;
    if (el.tagName === 'A') el.setAttribute('href', 'mailto:' + c.email);
  });
  document.querySelectorAll('[data-legal-if]').forEach((el) => { el.hidden = false; });
  document.querySelectorAll('[data-legal-unless]').forEach((el) => { el.hidden = true; });
}
