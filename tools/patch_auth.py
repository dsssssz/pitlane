from pathlib import Path
import re

app = Path('/workspace/pitlane-auth/app.js').read_text()

# Replace from auth section through restoreAuthIfNeeded / old form listeners
start = app.index('/* -------- auth + subscription (local demo) -------- */')
# Find end: restoreAuthIfNeeded(); after buyPlan listeners - keep buyPlan and guest buttons
# We'll replace register/login/form handlers

# Find the chunk from AUTH_KEY through btnRegister listener end, keep buyPlan etc.

marker_end = 'document.getElementById(\'btnOpenAuth\')?.addEventListener(\'click\', () => {\n  document.getElementById(\'auth\')?.classList.remove(\'hidden\');\n});'
if marker_end not in app:
    raise SystemExit('auth end marker missing')

# Keep everything before auth comment, then new auth, then from buyPlan onwards
buy_start = app.index('document.querySelectorAll(\'[data-buy]\')')
# Actually include logout/guest/openAuth in new code; cut from auth comment to before data-buy

pre = app[:start]
post = app[buy_start:]

new_auth = r'''/* -------- auth: SMS OTP + durable account store -------- */
const AUTH_KEY = 'pitlane-auth-v2';
const AUTH_KEY_LEGACY = 'pitlane-auth-v1';
const IDB_NAME = 'pitlane-auth';
const IDB_STORE = 'kv';

function normPhone(s) {
  const d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) return '7' + d.slice(1);
  if (d.length === 10) return '7' + d;
  return d;
}

function loadAuthSync() {
  try {
    let raw = localStorage.getItem(AUTH_KEY);
    if (!raw) raw = localStorage.getItem(AUTH_KEY_LEGACY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        parsed.users = parsed.users || {};
        parsed.otps = parsed.otps || {};
        return parsed;
      }
    }
  } catch (err) {
    console.warn('auth load', err);
  }
  try {
    const bak = JSON.parse(localStorage.getItem(AUTH_KEY + ':bak') || localStorage.getItem(AUTH_KEY_LEGACY + ':bak') || 'null');
    if (bak?.users) {
      bak.otps = bak.otps || {};
      return bak;
    }
  } catch (_) {}
  return { users: {}, otps: {}, session: null };
}

let authDb = loadAuthSync();

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, val) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('idb set', err);
  }
}

async function idbGet(key) {
  try {
    const db = await idbOpen();
    const val = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return val;
  } catch (_) {
    return null;
  }
}

function saveAuth() {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(authDb));
    localStorage.setItem(AUTH_KEY + ':bak', JSON.stringify(authDb));
    if (authDb.session) localStorage.setItem(AUTH_KEY + ':session', authDb.session);
    else localStorage.removeItem(AUTH_KEY + ':session');
    // also mirror legacy key so old code paths reading v1 still see session
    localStorage.setItem(AUTH_KEY_LEGACY, JSON.stringify(authDb));
    localStorage.setItem(AUTH_KEY_LEGACY + ':bak', JSON.stringify(authDb));
  } catch (err) {
    console.warn('auth save failed', err);
    const msg = document.getElementById('authMsg');
    if (msg) msg.textContent = 'Не удалось сохранить аккаунт на устройстве';
  }
  void idbSet('authDb', authDb);
}

async function restoreAuthIfNeeded() {
  const fromIdb = await idbGet('authDb');
  if (fromIdb?.users && Object.keys(fromIdb.users).length >= Object.keys(authDb.users || {}).length) {
    authDb = fromIdb;
    authDb.otps = authDb.otps || {};
  }
  if (!authDb.session) {
    const sid = localStorage.getItem(AUTH_KEY + ':session') || localStorage.getItem(AUTH_KEY_LEGACY + ':session');
    if (sid && authDb.users[sid]) authDb.session = sid;
  }
  saveAuth();
  refreshAccount();
}

function currentUser() {
  return authDb.session ? authDb.users[authDb.session] : null;
}

function isPro(u) {
  if (!u) return false;
  if (u.paidUntil && u.paidUntil > Date.now()) return true;
  if (u.trialEnds && u.trialEnds > Date.now()) return true;
  return false;
}

function refreshAccount() {
  const u = currentUser();
  document.getElementById('authForm')?.classList.toggle('hidden', !!u);
  const phones = document.querySelectorAll('#accPhone');
  if (!u) {
    phones.forEach((el) => { el.textContent = 'гость'; });
    const plan = document.getElementById('accPlan');
    if (plan) plan.textContent = '';
    return;
  }
  phones.forEach((el) => { el.textContent = '+' + u.phone + (u.nick ? (' · ' + u.nick) : ''); });
  const plan = document.getElementById('accPlan');
  if (plan) {
    plan.textContent = (isPro(u) ? ('Pro · ') : ('trial · ')) + 'аккаунт сохранён';
  }
  const setAcc = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setAcc('accDiscount', u.firstPaid ? 'уже использована' : '−50% на первую');
  setAcc('accPro', isPro(u) ? 'да' : 'нет');
  setAcc('priceMonth', (u.firstPaid ? PRICE.month : PRICE.monthOff) + ' ₽');
  setAcc('priceYear', (u.firstPaid ? PRICE.year : PRICE.yearOff) + ' ₽');
  const nickEl = document.getElementById('accNick');
  if (nickEl && u.nick) nickEl.value = u.nick;
}

function genOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function requestSmsCode(phone) {
  const p = normPhone(phone);
  if (p.length !== 11 || !p.startsWith('7')) throw new Error('Введите номер в формате +7…');
  const code = genOtp();
  const exp = Date.now() + 10 * 60 * 1000;
  authDb.otps[p] = { code, exp, tries: 0 };
  saveAuth();

  // Try remote Worker if configured
  try {
    if (typeof apiBase === 'function' && apiBase()) {
      const res = await fetch(apiBase() + '/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: p }),
      });
      if (res.ok) {
        const data = await res.json();
        // production: no code in body; demo worker may echo
        if (data?.demoCode) {
          return { phone: p, demoCode: String(data.demoCode) };
        }
        return { phone: p, demoCode: null };
      }
    }
  } catch (_) {}

  // No SMS gateway yet — show demo code so flow works; accounts still persist
  return { phone: p, demoCode: code };
}

async function verifySmsCode(phone, code, nick) {
  const p = normPhone(phone);
  const otp = authDb.otps[p];
  const c = String(code || '').trim();
  if (!otp) throw new Error('Сначала запроси код');
  if (Date.now() > otp.exp) throw new Error('Код истёк — запроси новый');
  otp.tries = (otp.tries || 0) + 1;
  if (otp.tries > 8) throw new Error('Слишком много попыток');

  let ok = c === String(otp.code);
  // remote verify if available
  try {
    if (!ok && typeof apiBase === 'function' && apiBase()) {
      const res = await fetch(apiBase() + '/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: p, code: c }),
      });
      if (res.ok) {
        const data = await res.json();
        ok = !!data?.ok;
        if (data?.user) {
          authDb.users[p] = { ...authDb.users[p], ...data.user, phone: p };
        }
      }
    }
  } catch (_) {}

  if (!ok) {
    saveAuth();
    throw new Error('Неверный код');
  }

  delete authDb.otps[p];
  const existing = authDb.users[p];
  const n = (nick || '').trim() || existing?.nick || ('пилот' + p.slice(-4));
  if (existing) {
    existing.nick = n;
    existing.lastLogin = Date.now();
    if (Array.isArray(state.garage) && state.garage.length) {
      existing.garage = state.garage;
      existing.carId = state.carId || null;
    }
  } else {
    authDb.users[p] = {
      phone: p,
      nick: n,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      trialEnds: Date.now() + 7 * 24 * 60 * 60 * 1000,
      paidUntil: null,
      plan: 'trial',
      firstPaid: false,
      garage: state.garage || [],
      carId: state.carId || null,
    };
  }
  authDb.session = p;
  saveProf({ ...profile(), nick: n });
  // restore garage from account if local empty
  const u = authDb.users[p];
  if ((!state.garage || !state.garage.length) && Array.isArray(u.garage) && u.garage.length) {
    state.garage = u.garage;
    state.carId = u.carId || u.garage[0]?.id || null;
    save();
  } else if (state.garage?.length) {
    u.garage = state.garage;
    u.carId = state.carId || null;
  }
  saveAuth();
  return u;
}

function showAuthStep(step) {
  document.getElementById('authStepPhone')?.classList.toggle('hidden', step !== 'phone');
  document.getElementById('authStepCode')?.classList.toggle('hidden', step !== 'code');
}

document.getElementById('btnSendSms')?.addEventListener('click', async () => {
  const phone = document.getElementById('authPhone')?.value;
  const nick = document.getElementById('authNick')?.value;
  const msg = document.getElementById('authMsg');
  try {
    const r = await requestSmsCode(phone);
    document.getElementById('authPhoneShow').textContent = '+' + r.phone;
    showAuthStep('code');
    if (r.demoCode) {
      msg.textContent = '';
      const m2 = document.getElementById('authMsg2');
      if (m2) m2.textContent = 'SMS-шлюз ещё не подключён — демо-код: ' + r.demoCode;
    } else {
      if (msg) msg.textContent = '';
      const m2 = document.getElementById('authMsg2');
      if (m2) m2.textContent = 'Код отправлен SMS';
    }
  } catch (err) {
    if (msg) msg.textContent = err.message;
  }
});

document.getElementById('btnVerifySms')?.addEventListener('click', async () => {
  const phone = document.getElementById('authPhone')?.value;
  const nick = document.getElementById('authNick')?.value;
  const code = document.getElementById('authCode')?.value;
  const m2 = document.getElementById('authMsg2');
  try {
    await verifySmsCode(phone, code, nick);
    if (m2) m2.textContent = '';
    showAuthStep('phone');
    refreshAccount();
    applyCarUI();
  } catch (err) {
    if (m2) m2.textContent = err.message;
  }
});

document.getElementById('btnSmsBack')?.addEventListener('click', () => {
  showAuthStep('phone');
});

document.getElementById('btnLogout')?.addEventListener('click', () => {
  // persist garage onto account before logout
  const u = currentUser();
  if (u) {
    u.garage = state.garage || [];
    u.carId = state.carId || null;
  }
  authDb.session = null;
  saveAuth();
  refreshAccount();
});
document.getElementById('btnGuest')?.addEventListener('click', () => {
  document.getElementById('auth')?.classList.add('hidden');
});
document.getElementById('btnOpenAuth')?.addEventListener('click', () => {
  document.getElementById('auth')?.classList.remove('hidden');
  showAuthStep('phone');
});

// persist garage into account on save hook
const _saveOrig = typeof save === 'function' ? save : null;
// monkey via wrap after - actually patch syncGarageToAccount calls

function syncGarageToAccount() {
  const u = currentUser();
  if (!u) return;
  u.garage = state.garage || [];
  u.carId = state.carId || null;
  const nickEl = document.getElementById('accNick');
  if (nickEl?.value?.trim()) {
    u.nick = nickEl.value.trim();
    saveProf({ ...profile(), nick: u.nick });
  }
  saveAuth();
}

'''

# Need PRICE constant - it's defined in old auth section. Keep PRICE before new auth.
# Extract PRICE from old block
price_m = re.search(r'const PRICE = \{[^}]+\};', app[start:start+500] if False else app)
# PRICE is in the section we're replacing - include it in new_auth
if 'const PRICE =' not in new_auth:
    new_auth = new_auth.replace(
        'const AUTH_KEY = \'pitlane-auth-v2\';',
        'const PRICE = { month: 390, year: 2990, monthOff: 195, yearOff: 1495 };\nconst AUTH_KEY = \'pitlane-auth-v2\';',
    )

# Remove duplicate PRICE if left in post - check
app = pre + new_auth + '\n' + post

# Hook save() to sync garage - find function save()
if 'syncGarageToAccount()' not in app:
    app = app.replace(
        'function save() {\n',
        'function save() {\n  try { syncGarageToAccount(); } catch (_) {}\n',
        1,
    )

# Call restoreAuthIfNeeded on boot - replace old call
if 'void restoreAuthIfNeeded()' not in app and 'restoreAuthIfNeeded();' in app:
    app = app.replace('restoreAuthIfNeeded();', 'void restoreAuthIfNeeded();', 1)
elif 'restoreAuthIfNeeded();' not in app:
    app = app.replace(
        "document.querySelectorAll('[data-buy]')",
        "void restoreAuthIfNeeded();\ndocument.querySelectorAll('[data-buy]')",
        1,
    )

# Remove old registerUser/loginUser if any leftover duplicates
# Check duplicate AUTH_KEY
print('AUTH_KEY count', app.count("const AUTH_KEY"))
print('PRICE count', app.count('const PRICE'))
print('restoreAuth', app.count('restoreAuthIfNeeded'))

Path('/workspace/pitlane-auth/app.js').write_text(app)
print('auth patched', len(app))
