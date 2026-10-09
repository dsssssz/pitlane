// v116: tiny in-memory stand-in for Durable Objects + WebSocket hibernation API (Node tests only).
export function makeLive(DOClass) {
  const objs = new Map();
  let lastClient = null;
  class End {
    constructor() { this.peer = null; this.inbox = []; this.closed = null; this.att = null; this.tags = []; this.onmsg = null; this.owner = null; }
    accept() {}
    send(data) {
      if (this.closed) throw new Error('closed');
      const p = this.peer;
      if (p.owner) return p.owner.webSocketMessage(p, data); // client → DO (hibernation handler)
      p.inbox.push(JSON.parse(data));
      if (p.onmsg) p.onmsg(JSON.parse(data));
    }
    close(code, reason) {
      if (this.closed) return;
      this.closed = { code, reason };
      this.peer.closed = this.peer.closed || { code, reason };
      if (this.owner) void this.owner.webSocketClose(this, code, reason, true);
      else if (this.peer.owner) void this.peer.owner.webSocketClose(this.peer, code, reason, true);
    }
    serializeAttachment(a) { this.att = JSON.parse(JSON.stringify(a)); }
    deserializeAttachment() { return this.att; }
  }
  class Pair { constructor() { const a = new End(); const b = new End(); a.peer = b; b.peer = a; this[0] = a; this[1] = b; } }
  function ctxFor(obj) {
    const store = new Map(); const socks = [];
    return {
      storage: { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); } , _m: store },
      acceptWebSocket(ws, tags) { ws.tags = tags || []; ws.owner = obj(); socks.push(ws); },
      getWebSockets(tag) { return socks.filter((w) => !w.closed && (!tag || w.tags.includes(tag))); },
    };
  }
  const env = {};
  const ns = {
    idFromName: (n) => 'id:' + n,
    get(id) {
      if (!objs.has(id)) { let o; const ctx = ctxFor(() => o); o = new DOClass(ctx, env); objs.set(id, o); }
      const o = objs.get(id);
      return { fetch: (req) => o.fetch(req) };
    },
  };
  const upgrade = (client, hdr) => { lastClient = client; return new Response(null, { status: 200, headers: { 'x-ws': '1', ...(hdr || {}) } }); };
  Object.assign(env, { __WebSocketPair: Pair, __upgrade: upgrade });
  return { ns, env, Pair, upgrade, takeClient: () => { const c = lastClient; lastClient = null; return c; }, objs };
}
