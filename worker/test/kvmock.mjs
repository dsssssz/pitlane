export class MemKV {
  constructor() { this.m = new Map(); this.puts = 0; }
  async get(k) { const e = this.m.get(k); if (!e) return null; if (e.exp && e.exp < Date.now() / 1000) { this.m.delete(k); return null; } return e.v; }
  async put(k, v, o = {}) { this.puts++; let exp = null; if (o.expiration) exp = o.expiration; else if (o.expirationTtl) exp = Math.floor(Date.now() / 1000) + o.expirationTtl; this.m.set(k, { v: String(v), exp, meta: o.metadata || null }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const all = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const slice = all.slice(start, start + limit);
    const done = start + limit >= all.length;
    return { keys: slice.map((name) => ({ name, expiration: this.m.get(name).exp || undefined, metadata: this.m.get(name).meta || undefined })), list_complete: done, cursor: done ? undefined : String(start + limit) };
  }
  ttl(k) { const e = this.m.get(k); return e && e.exp ? e.exp - Math.floor(Date.now() / 1000) : null; }
  dump() { return [...this.m.entries()].map(([k, e]) => [k, e.v]); }
}
