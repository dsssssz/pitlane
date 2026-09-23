# Pitlane Worker deploy

Deploy from your machine (not from the agent box). Requires Cloudflare account + Wrangler.

## 1. Worker + KV

```bash
cp wrangler.toml.example wrangler.toml
# edit id = "<your_kv_namespace_id>"

npm i -g wrangler   # or: npx wrangler …
wrangler kv namespace create PITLANE
# paste the id into wrangler.toml

wrangler deploy
```

Copy the Worker URL, e.g. `https://pitlane-api.<subdomain>.workers.dev`.

## 2. Point the PWA at the API

In `index.html` set (leave empty until a real URL exists — do **not** invent one):

```html
<meta name="pitlane-api" content="https://pitlane-api.YOUR_SUBDOMAIN.workers.dev" />
```

Or set `window.PITLANE_API` before the module loads. Without this meta, the app uses localStorage only.

## 3. OTP / SMS / sessions

- Default: `SMS_DEMO` on (`1` or unset) → `/auth/otp` may return `demoCode` when Twilio is missing; UI shows a «демо» banner.
- Production: `wrangler secret put SMS_DEMO` → `0`. If Twilio is not configured, Worker returns **503** `{ error: "SMS not configured" }` and **never** leaks `demoCode`.
- Rate limits (KV): ~5 OTP / phone / 15 min; ~20 / IP / 15 min → HTTP 429.
- `/auth/verify` returns `{ ok, token, phone, nick, user }`. Client stores `token` and sends `Authorization: Bearer …` on API calls. Fallback header `X-Pilot-Id` remains for reads; **writes** to tops / pulse / garage require a valid session (`sess:<token>` in KV).

### Optional Twilio

```bash
wrangler secret put TWILIO_SID
wrangler secret put TWILIO_TOKEN
wrangler secret put TWILIO_FROM   # e.g. +1…
```

## 4. Garage sync

- `GET /garage` → `{ cars, carId }` (auth required)
- `PUT /garage` `{ cars, carId }` (auth required, ~1.5 MB cap)
- Client merges garage on login and periodically PUTs when logged in + `apiBase` set.

## 5. Tops anti-cheat

- Client publishes only when `valid && gps && gpsQ in ('A','B')` (or C when «только валидные» filter is unchecked).
- Worker `sanitizeStraight` / `sanitizeLap` keep `gpsQ, avgAcc, hz, flags` and **override** `valid` server-side: A/B only for public tops; `teleport` / `speed` → `valid:false`.

## 6. Share links

- `POST /share` `{ "payload": { … } }` → `{ "id": "…" }` (KV `share:<id>`, TTL 30d)
- `GET /share/:id` → payload JSON
- Client prefers `?s=id` / `#s=id` when Worker returns id; else `#r=<base64url JSON>` works offline.

## 7. CORS

Allowed origins include `https://dsssssz.github.io` and local ports. Add more via env `EXTRA_ORIGINS` (comma-separated). CORS allows `Authorization`.

## 8. Health

`GET /health` → `{ ok: true, service: "pitlane-api" }`

## 9. Offline / SW

- Service worker cache `pitlane-v62`: app shell + vendored `./vendor/three/*`.
- CDN Three URLs also cached in `pitlane-three-v1` on first load (fallback).
- GLB models prefetch into `pitlane-glb-v1` on activate (same name the app already uses).

## 10. Methodology & weather (weeks 1–2)

- Client page: `method.html` (linked from tops header, share card footer, account).
- GPS grades A/B/C shown as Честный / Ок / Слабый GPS on tops, after-run share card, and lap history.
- Lap submits may include `weather`: `dry` | `damp` | `wet` from Open-Meteo `weather_code`:
  - dry: 0–3, 45, 48
  - damp: 51, 53, 56, 61
  - wet: other precip (≥51 except damp list)
- Worker `sanitizeStraight` / `sanitizeLap` keep `weather`. GET `/tops/lap/:id?weather=dry` filters.
- Ring tops UI chips: Все | Сухо | Сыро | Мокро (default Сухо when dry rows exist).

## 11. Worker deploy (this box)

```bash
# secrets from box-secrets.json card.CLOUDFLARE_API_TOKEN
export CLOUDFLARE_API_TOKEN=…
npx wrangler deploy
```

If deploy fails, client still ships; Worker source in `worker-index.js` includes weather — redeploy when CF token works.
