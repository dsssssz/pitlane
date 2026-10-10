/**
 * v134: Paddock — единая точка записи ленты.
 *
 * Раньше лента жила в одном KV-ключе `pulse`, и каждый пост, лайк, счётчик комментариев и удаление делали
 * read-modify-write всего списка. KV согласован «в конечном счёте» (до ~60 с между локациями), поэтому
 * лайк или комментарий, обработанный в другом дата-центре вскоре после поста, записывал назад устаревшую
 * копию и стирал свежий пост («не публикуется»). Теперь все изменения идут последовательно через один
 * Durable Object (строгая согласованность), а KV `pulse` — только снимок для быстрых GET.
 *
 * Идемпотентность: клиент шлёт `cid` (свой id сообщения); повтор с тем же cid от того же пилота не создаёт
 * дубль, а возвращает уже сохранённый пост — авто-повтор после обрыва связи безопасен.
 */

export const PULSE_KEEP = 200;
export const PULSE_MAX_BYTES = 3_000_000;
export const PULSE_CID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const CID_WINDOW_MS = 24 * 3600e3;

const byAt = (a, b) => (b.at || 0) - (a.at || 0);

/** Обрезка до лимитов (число постов и байты снимка). Возвращает оставшиеся строки (новые сверху). */
export function trimPulse(rows) {
  let list = rows.filter((r) => r && r.id).sort(byAt).slice(0, PULSE_KEEP);
  let ser = JSON.stringify(list);
  while (ser.length > PULSE_MAX_BYTES && list.length > 1) {
    list = list.slice(0, Math.max(1, Math.floor(list.length * 0.8)));
    ser = JSON.stringify(list);
  }
  return list;
}

/**
 * Чистая операция над лентой. Мутирует `rows` (массив объектов), возвращает
 * { rows, res, changed:Set<id>, removed:Set<id> }.
 */
export function applyPulseOp(rows, op) {
  const changed = new Set();
  const removed = new Set();
  let res = { ok: true };
  const find = (id) => rows.find((x) => x && x.id === id);
  switch (op && op.t) {
    case 'add': {
      const row = op.row;
      if (!row || !row.id) { res = { ok: false, error: 'invalid' }; break; }
      if (row.cid && row.pilotId) {
        const dup = rows.find((x) => x && x.cid === row.cid && x.pilotId === row.pilotId && (Date.now() - (x.at || 0)) < CID_WINDOW_MS);
        if (dup) { res = { ok: true, dup: true, id: dup.id }; break; }
      }
      rows.unshift(row);
      changed.add(row.id);
      res = { ok: true, id: row.id };
      break;
    }
    case 'like': {
      const p = find(op.id);
      if (!p) { res = { ok: false, error: 'not found', status: 404 }; break; }
      p.likes = Array.isArray(p.likes) ? [...new Set(p.likes)].slice(0, 5000) : [];
      const i = p.likes.indexOf(op.who);
      const want = typeof op.want === 'boolean' ? op.want : i < 0;
      if (want && i < 0) p.likes.push(op.who);
      if (!want && i >= 0) p.likes.splice(i, 1);
      changed.add(p.id);
      res = { ok: true, id: p.id, likeCount: p.likes.length, liked: p.likes.includes(op.who) };
      break;
    }
    case 'cc': {
      const map = op.map || {};
      for (const [id, n] of Object.entries(map)) {
        const p = find(id);
        if (p) { p.cc = Math.max(0, Number(n) || 0); changed.add(id); }
      }
      break;
    }
    case 'del': {
      const p = find(op.id);
      if (p && p.pilotId && p.pilotId === op.pid) {
        rows.splice(rows.indexOf(p), 1);
        removed.add(p.id);
        res = { ok: true, deleted: true };
      } else res = { ok: true, deleted: false };
      break;
    }
    case 'purge': { // удаление аккаунта: посты автора и его лайки
      let posts = 0, likes = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (!r) continue;
        if (r.pilotId === op.pid) { rows.splice(i, 1); removed.add(r.id); posts++; continue; }
        if (Array.isArray(r.likes) && r.likes.includes(op.pid)) { r.likes = r.likes.filter((x) => x !== op.pid); changed.add(r.id); likes++; }
      }
      res = { ok: true, posts, likes };
      break;
    }
    case 'replace': { // служебные миграции: целиком новая лента
      const next = (Array.isArray(op.rows) ? op.rows : []).filter((r) => r && r.id);
      const ids = new Set(next.map((r) => r.id));
      for (const r of rows) if (!ids.has(r.id)) removed.add(r.id);
      rows.splice(0, rows.length, ...next);
      for (const r of next) changed.add(r.id);
      break;
    }
    default:
      res = { ok: false, error: 'bad op' };
  }
  return { rows, res, changed, removed };
}

async function readKvList(kv) {
  const raw = await kv.get('pulse');
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

/** Одна операция над лентой: через Durable Object, если он привязан; иначе (тесты/локально) — напрямую в KV. */
export async function pulseOp(env, op) {
  const ns = env && env.PULSE_HUB;
  if (ns && typeof ns.idFromName === 'function') {
    const stub = ns.get(ns.idFromName('pulse'));
    const r = await stub.fetch('https://pulse-hub/op', { method: 'POST', body: JSON.stringify(op) });
    if (!r.ok) throw new Error('pulse hub ' + r.status);
    return await r.json();
  }
  const rows = await readKvList(env.PITLANE);
  const out = applyPulseOp(rows, op);
  let kept = rows;
  if (out.changed.size || out.removed.size) {
    kept = trimPulse(rows);
    await env.PITLANE.put('pulse', JSON.stringify(kept));
  } else kept = rows.slice().sort(byAt);
  return { res: out.res, rows: kept };
}

/** Durable Object: держит ленту (по ключу на пост), сериализует изменения, пишет снимок в KV. */
export class PulseHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.rows = null;
    this.q = Promise.resolve();
  }

  async load() {
    if (this.rows) return;
    const st = this.state.storage;
    if (!(await st.get('seeded'))) {
      // первый запуск: перенос текущей ленты из KV (только чтение KV)
      const seed = trimPulse(await readKvList(this.env.PITLANE));
      for (let i = 0; i < seed.length; i += 100) {
        const batch = {};
        for (const r of seed.slice(i, i + 100)) batch['p:' + r.id] = r;
        await st.put(batch);
      }
      await st.put('seeded', Date.now());
      this.rows = seed;
      return;
    }
    const m = await st.list({ prefix: 'p:' });
    this.rows = [...m.values()].filter((r) => r && r.id).sort(byAt);
  }

  async run(op) {
    await this.load();
    const out = applyPulseOp(this.rows, op);
    const st = this.state.storage;
    if (out.changed.size || out.removed.size) {
      const kept = trimPulse(this.rows);
      const keep = new Set(kept.map((r) => r.id));
      for (const r of this.rows) if (!keep.has(r.id)) out.removed.add(r.id);
      for (const id of out.removed) out.changed.delete(id);
      this.rows = kept;
      const put = {};
      for (const id of out.changed) { const r = kept.find((x) => x.id === id); if (r) put['p:' + id] = r; }
      if (Object.keys(put).length) await st.put(put);
      if (out.removed.size) await st.delete([...out.removed].map((id) => 'p:' + id));
      await this.env.PITLANE.put('pulse', JSON.stringify(kept));
    }
    return { res: out.res, rows: this.rows };
  }

  async fetch(req) {
    let op;
    try { op = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
    // явная очередь: KV-запись внутри run() открывает input gate, поэтому порядок держим сами
    const p = this.q.then(() => this.run(op));
    this.q = p.catch(() => {});
    try {
      const out = await p;
      return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      this.rows = null; // перечитать состояние при следующем запросе
      return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500 });
    }
  }
}
