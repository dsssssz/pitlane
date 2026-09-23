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

- Service worker cache `pitlane-v67`: app shell + vendored `./vendor/three/*`.
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

### Worker deploy log (2026-09-23)

Deployed with wrangler@3.114.17 + `CLOUDFLARE_API_TOKEN` from box-secrets card.
Version ID: `df7b9c5a-91f3-43d7-8a7f-c7249f34dd65` → https://pitlane-api.pitlane-taksimaga.workers.dev
Weather field + `?weather=` filter live on Worker.


## 12. Duels / Challenge

- `POST /duel` `{ type: "drag"|"lap", trackId?, createdBy?, note? }` → duel JSON (`duel:<id>`, TTL ~8d)
- `GET /duel/:id` → duel JSON (auto-expire after 7d if incomplete)
- `POST /duel/:id/run` body like tops row — **A/B only**; each side one locked run; when both present → `status: ready` + `winner`
- `GET /duels?mine=<pilotId>` → recent duels for pilot (KV index `duelidx:<id>`)
- Client deep link: `?duel=ID` / `#duel=ID`. Guest ok via `X-Pilot-Id` device id + nick.

### Worker deploy log (duels MVP 2026-09-23)

Deployed with wrangler@3.114.17. Version ID: `83b8356b-4091-463a-b020-1af5ca3ef1c1` → https://pitlane-api.pitlane-taksimaga.workers.dev
Duels routes live: POST/GET /duel, POST /duel/:id/run, GET /duels?mine=


## 13. Sector Battle (client MVP)

- Lap records already store cumulative `sectors: [s1,s2,s3]` ms; UI converts to splits.
- Personal bests / «оптимал» (sum of best sectors) computed client-side from own history on the selected track.
- A/B GPS required for win/lose emphasis; no Worker sector tops in this MVP.
- SW cache: `pitlane-v67`.


## 14. Crews / Экипажи MVP

- `POST /crew` `{ name, trackId, createdBy?, nick? }` → crew + inviteCode (max 10 members)
- `GET /crew/:id` → public crew
- `POST /crew/:id/join` `{ nick, pilotId? }`
- `POST /crew/join` `{ code, nick }` — join by invite code
- `GET /crew/:id/board` — monthly A/B best lap per member on crew.trackId (from `lap:{trackId}` tops + memberBests)
- `POST /crew/:id/best` — client push after publishing A/B lap on matching track
- `GET /crews?mine=<pilotId>`
- Client: tops button «Экипаж», deep link `?crew=ID`, auto-push best after lap
- Rank: personal best A/B lap (lower better). Team badge = count with ≥1 A/B lap. Team avg = average of bests.
- SW cache: `pitlane-v67`


### Worker deploy log (crews MVP 2026-09-23)

Deployed with wrangler@3.114.17. Version ID: `81960051-1c84-497d-a568-b7a4df2b4906` → https://pitlane-api.pitlane-taksimaga.workers.dev
Crews live: POST/GET /crew, join, board, best, GET /crews?mine=
Client SW: `pitlane-v67`. Ship SHA `a03b2b5eddbf`.


## 15. Session of the day + autodrome discovery

- Soft feature: one cult track as «сессия дня».
- Pick order: Worker KV `session:day` `{ "trackId": "moscow", "title?": "…" }` → else date-hash (Europe/Moscow) over cult tracks.
- `GET /session/today` → `{ trackId, title, date, source, tops, attendees }` — tops = A/B laps on that track with `at` in today's Moscow date.
- `POST /session/today/checkin` `{ nick, pilotId? }` → KV `session:att:{date}:{trackId}` (TTL ~2d).
- Client fallback: same date-hash + filter `listLap` by day if Worker empty/offline.
- Discovery: tops «Автодромы» + lap «Автодромы · справочник» → RU cards (blurb / configs / real site or «уточняйте…»). No booking integration.
- SW cache: `pitlane-v67`. Completes «Делай» roadmap (no Pro monetization).

### Worker deploy log (session-of-day 2026-09-23)

Deployed with wrangler@3.114.17. Version ID: `ebd5e335-1c02-43ff-8f2d-90e2caa81234` → https://pitlane-api.pitlane-taksimaga.workers.dev
Routes live: GET /session/today, POST /session/today/checkin
Client SW: `pitlane-v67`. Ship SHA `cced8b543fd9`. Completes «Делай» roadmap.

