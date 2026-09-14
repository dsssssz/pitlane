# Pitlane Worker deploy

Deploy from your machine (not from this box). Requires Cloudflare account + Wrangler.

## 1. Worker + KV

```bash
npm i -g wrangler
# or: npx wrangler …

# create KV namespace once
wrangler kv namespace create PITLANE

# wrangler.toml example:
# name = "pitlane-api"
# main = "worker-index.js"
# compatibility_date = "2024-09-01"
# [[kv_namespaces]]
# binding = "PITLANE"
# id = "<your_kv_id>"

wrangler deploy
```

Copy the Worker URL, e.g. `https://pitlane-api.<subdomain>.workers.dev`.

## 2. Point the PWA at the API

In `index.html` set:

```html
<meta name="pitlane-api" content="https://pitlane-api.YOUR_SUBDOMAIN.workers.dev" />
```

Or set `window.PITLANE_API` before the module loads. Without this meta, the app uses localStorage only.

## 3. OTP / SMS

- Default: `SMS_DEMO` is on → `/auth/otp` returns `demoCode` in JSON (no real SMS).
- Production demo off: `wrangler secret put SMS_DEMO` → value `0`.

### Optional Twilio

```bash
wrangler secret put TWILIO_SID
wrangler secret put TWILIO_TOKEN
wrangler secret put TWILIO_FROM   # e.g. +1…
```

If all three are set, Worker tries Twilio SMS; on failure / missing env it still stores OTP and may echo `demoCode` when `SMS_DEMO!=0`.

## 4. Share links

- `POST /share` `{ "payload": { … } }` → `{ "id": "…" }` (KV `share:<id>`, TTL 30d)
- `GET /share/:id` → payload JSON
- Client prefers `?s=id` / `#s=id` when Worker returns id; else `#r=<base64url JSON>` works offline.

## 5. CORS

Allowed origins include `https://dsssssz.github.io` and local ports. Add more via env `EXTRA_ORIGINS` (comma-separated).

## 6. Health

`GET /health` → `{ ok: true, service: "pitlane-api" }`
