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

- Production default (`wrangler.toml` `[vars] SMS_DEMO = "0"`): real Twilio only. No `demoCode` in responses. Missing/failed Twilio → **503** `{ error: "SMS not configured" | "SMS send failed" }`.
- Local/dev demo: set `SMS_DEMO=1` (var or `wrangler secret put SMS_DEMO` → `1`) → if Twilio absent/fails, `/auth/otp` returns `demoCode` and UI shows «демо» banner. **Never** leave `SMS_DEMO=1` on prod.
- Phone: normalized to RU `7XXXXXXXXXX` (accepts `8…` / 10-digit local).
- OTP: 4 digits, TTL 10 min, max **5** verify attempts then code wiped. Rate limits (KV): ~5 OTP / phone / 15 min; ~20 / IP / 15 min → HTTP 429.
- Codes are **not** logged in production. OTP stored in KV only after a successful send (or demo fallback).
- `/auth/verify` returns `{ ok, token, phone, nick, user }`. Client stores `token` and sends `Authorization: Bearer …` on API calls. Fallback header `X-Pilot-Id` remains for reads; **writes** to tops / pulse / garage require a valid session (`sess:<token>` in KV).

### Twilio (required for real SMS)

Maga must set these **Worker secrets** (not in git / not in chat). Account SID + Auth Token + From number from https://console.twilio.com :

```bash
cd /workspace/pitlane-auth   # or repo root with wrangler.toml
export CLOUDFLARE_API_TOKEN=…   # already on the box card
npx wrangler@3.114.17 secret put TWILIO_SID     # ACxxxxxxxx…
npx wrangler@3.114.17 secret put TWILIO_TOKEN   # auth token
npx wrangler@3.114.17 secret put TWILIO_FROM    # E.164, e.g. +1… or Twilio Messaging Service sender
# confirm SMS_DEMO is 0 (wrangler.toml vars) — optional override:
# echo 0 | npx wrangler@3.114.17 secret put SMS_DEMO
npx wrangler@3.114.17 deploy
```

Until secrets exist, `/auth/otp` returns 503 and phone login cannot complete on the live site.

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

- Service worker cache `pitlane-v70`: app shell + vendored `./vendor/three/*`.
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
- SW cache: `pitlane-v70`.


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
- SW cache: `pitlane-v70`


### Worker deploy log (crews MVP 2026-09-23)

Deployed with wrangler@3.114.17. Version ID: `81960051-1c84-497d-a568-b7a4df2b4906` → https://pitlane-api.pitlane-taksimaga.workers.dev
Crews live: POST/GET /crew, join, board, best, GET /crews?mine=
Client SW: `pitlane-v70`. Ship SHA `a03b2b5eddbf`.


## 15. Session of the day + autodrome discovery

- Soft feature: one cult track as «сессия дня».
- Pick order: Worker KV `session:day` `{ "trackId": "moscow", "title?": "…" }` → else date-hash (Europe/Moscow) over cult tracks.
- `GET /session/today` → `{ trackId, title, date, source, tops, attendees }` — tops = A/B laps on that track with `at` in today's Moscow date.
- `POST /session/today/checkin` `{ nick, pilotId? }` → KV `session:att:{date}:{trackId}` (TTL ~2d).
- Client fallback: same date-hash + filter `listLap` by day if Worker empty/offline.
- Discovery: tops «Автодромы» + lap «Автодромы · справочник» → RU cards (blurb / configs / real site or «уточняйте…»). No booking integration.
- SW cache: `pitlane-v70`. Completes «Делай» roadmap (no Pro monetization).

### Worker deploy log (session-of-day 2026-09-23)

Deployed with wrangler@3.114.17. Version ID: `ebd5e335-1c02-43ff-8f2d-90e2caa81234` → https://pitlane-api.pitlane-taksimaga.workers.dev
Routes live: GET /session/today, POST /session/today/checkin
Client SW: `pitlane-v70`. Ship SHA `cced8b543fd9`. Completes «Делай» roadmap.


## 16. Real SMS login (Twilio) — 2026-09-24

- Worker hardened: RU `normPhone`, OTP store-after-send, 5 verify attempts, `SMS_DEMO=0` in `[vars]`.
- Deployed wrangler@3.114.17. Version ID: `7c45750a-8bec-45eb-873d-e58fe0e985e7` → https://pitlane-api.pitlane-taksimaga.workers.dev
- Live `/auth/otp` returns **503** `{ error: "SMS not configured" }` until Maga sets Twilio secrets (none present yet).
- Client: clearer SMS errors; local code wiped when remote SMS path used; SW cache `pitlane-v70`.

### Maga next step (Twilio secrets)

```bash
export CLOUDFLARE_API_TOKEN=…   # box card
cd /path/to/pitlane
npx wrangler@3.114.17 secret put TWILIO_SID
npx wrangler@3.114.17 secret put TWILIO_TOKEN
npx wrangler@3.114.17 secret put TWILIO_FROM
# no redeploy strictly required after secret put, but harmless:
npx wrangler@3.114.17 deploy
```

Then phone login sends a real SMS; demo path stays off while `SMS_DEMO=0`.

## 17. Public sector tops (фото · никнейм · время)

- Lap POST now persists cumulative `sectors: [s1,s2,s3]` ms (+ optional `ms`) for A/B rows.
- Avatar thumb goes to KV `pilotmeta:<pilotId>` (not embedded on every lap row).
- `GET /tops/sector/:trackId?sector=0|1|2` → `{ trackId, sector, rows: [{ name, avatar, t, ms, car, gpsQ, pilotId }] }`
- `?sector=all` → `{ trackId, sectors: [S1rows, S2rows, S3rows] }`
- Client: tops «Секторы» + Sector Battle «Открыть топ секторов»; row = photo | nick | time.
- Empty state OK (no fake data). SW: `pitlane-v70`.

### Worker deploy log (sector tops 2026-09-24)

Deployed with wrangler@3.114.17. Version ID: `39a175de-23bc-4afc-ba60-9ed559b6f451` → https://pitlane-api.pitlane-taksimaga.workers.dev
Routes live: GET `/tops/sector/:trackId?sector=0|1|2|all`. Lap POST persists `sectors` + `pilotmeta` avatar.
Client SW: `pitlane-v70`. Ship SHA `580e87222d7b908d2f4c644687a49aeb8aa9a58c` (+ worker/src sync `af85a31fd9ad85b2fcbda9567c788cce6ffc322d`).


## 16. Satellite lap map (SW v72)

Lap-drive map uses **Leaflet + Esri World Imagery** (no API key). Outline overlays from `geo/outlines.js` (Sochi racing line; cult tracks = OSM facility footprints; others = SVG→WGS84 approx).

- Tiles: online-first; SW does **not** cache Esri/OSM tiles.
- Offline: dark canvas + neon outline + status «офлайн».
- No Mapbox/MapTiler key required. Maga does not need to add secrets for this.
- Worker untouched.

## 18. PITLANE license plates on the 3D podium (SW v73 → v74 black/neon look)

- `plates.js`: one shared canvas texture (v74: fully black plate + frame, big centred neon #39FF14 **PITLANE** with crisp glow, small neon PITLANE on the frame bottom; unlit face material, toneMapped off) + shared materials/geometries for every plate.
- Placement per model is **baked** (`PLATE_BAKED`, glbRoot-local) → zero raycast cost on car switch. `PLATE_CONFIG` (+ bumper raycast) is the re-bake source / fallback.
- Existing GLB plate meshes (Forza `ManufacturerPlate`, M3 `licenseplate`, X6 `plate`, Spark `plateholder`) are hidden and the PITLANE plate is mounted in their place; others get a new plate on the bumper.
- Plate meshes are named `PITLANE_plate_*` / `userData.__pitlanePlate` → excluded from body paint, forceBlackTrim and GLB dispose.
- Re-bake / visual check: `tools/plates-smoke.html?car=<id>&view=front|rear|frontclose|rearclose` (omit `&baked=1` to recompute from `PLATE_CONFIG`, read `window.__bake`).

## 19. Adaptive 3D quality on the podium (SW v75)

Goal: weak/mid Android GPUs (e.g. Honor 50, Adreno 642L @120 Hz) stop lagging; **high tier = the original podium, unchanged** (iPhone etc.).

| tier | pixel ratio | fps cap | mirror floor (Reflector) | shadows | MSAA |
|---|---|---|---|---|---|
| `high` | min(DPR, 2) — as before | none (every rAF, as before) | full res (512–1024), every frame | 1536/1024 PCFSoft, every frame | on |
| `medium` | min(DPR, 1.5) | 60 (so 120 Hz phones don't render 120 fps) | 512 px, refreshed every 2nd frame (+ exact refresh when the camera stops) | 1024, map re-rendered only on scene change / 1×s | on |
| `low` | min(DPR, 1.25) | 60 while touching, 30 while auto-rotating | off → flat black floor (neon ring kept neon, see below) | off | off (from next load; context flag) |

- Same on every tier: lights (incl. softbox RectAreaLights), RoomEnvironment env map, paint gloss/matte, PITLANE plates, intro, car switch, preload.
- Low tier ring: no mirror → the neon ring is drawn un-tonemapped (opacity 0.55) so it keeps its neon green.
- Auto-rotate on capped tiers is time-based, so rotation speed looks like 60 Hz (no more 2× speed on 120 Hz Android).
- **Initial tier**: `?quality=` → fresh `localStorage['pitlane-quality-v1']` (< 7 days) → GPU heuristic (`WEBGL_debug_renderer_info`: Adreno 3xx–6xx, Mali-T/G3x–G7x (2-digit), PowerVR → `medium`) → `high`.
- **FPS decides**: once the podium is visible, a GLB is loaded, the env is built and background GLB prefetch/parse finished (max 20 s wait), 1.5 s warm-up + 2 s sampling. If avg < 45 fps (Apple GPUs: < 24 fps, so iOS Low Power Mode's 30 fps cap is not mistaken for a weak GPU) → step down one tier, persist, re-measure. Never steps up within a session (no oscillation). Model swap / tab switch restarts the window. Stale (> 7 days) record → re-check from the heuristic tier.
- **Render on demand** (all tiers): renders only while the camera moves (auto-rotate, drag, damping), during 0.3–1.2 s after car load / paint / taps in the garage / resize, plus a 1 fps safety repaint when idle. Loop fully stops when the tab is hidden or the podium canvas is off-screen (other tabs: Замер, Круг, Топы…).
- Testing: `?quality=high|medium|low` forces a tier (not persisted, no measurement). Console logs `[pitlane] 3D quality: …`. Debug: `window.__pitlane3d.quality()` / `.frames()`.
- Reset a device: `localStorage.removeItem('pitlane-quality-v1')`.
- Also fixed: `Cannot access '_sectorTopIdx' before initialization` (declaration hoisted to the top of `app.js`).

## 20. Приватность, удаление аккаунта, юр. страницы, вход через Telegram (SW v76)

### 20.1 Непрозрачные ID пилотов (телефон больше нигде не публикуется)
- Каждый аккаунт получает случайный ID `p_<uuid>`. KV:
  - `pilot:<uuid>` → `{ id, createdAt, providers:[{type:'phone'|'tg', id}], nick, photoRef, trialEnds, plan, paidUntil }` (приватно, наружу не отдаётся)
  - `auth:phone:<7XXXXXXXXXX>` → `<uuid>`, `auth:tg:<telegramId>` → `<uuid>`
  - `sess:<token>` → `{ pilotId, nick, provider, at }` (TTL 90 дн.), `sessidx:<uuid>` → список токенов (для удаления)
  - старые сессии `{ phone }` автоматически переводятся на uuid при первом запросе; `user:<phone>` сворачивается в `pilot:<uuid>`.
- Все публичные ответы (`/tops/straight|lap|sector`, `/pulse`, `/duel*`, `/crew*`, `/session/today`, `/share/:id`) проходят через белые списки полей (`publicTopRow`, `publicPulse`, `publicDuel`, `publicCrew`): телефоноподобные ID/имена вырезаются (`pilotId:null`, имя → «пилот»). Фолбэк имени в Пульсе — «Пилот».
- Гости (без входа) — только `dev_…` ID устройства; телефон или чужой `p_…` в `X-Pilot-Id`/`body.pilotId` игнорируются. Для вошедших `pilotId` в теле запроса не может подменить сессию.
- Лайки Пульса хранятся по uuid; удалить пост может только автор (по uuid).
- Исправлено попутно: клиент слал кириллический ник в заголовке `X-Pilot-Name` → `fetch()` падал, и **все** запросы к топам/пульсу/дуэлям/экипажам молча уходили в localStorage. Теперь заголовок URI-кодируется, и приложение реально ходит в Worker.
- Новые эндпоинты: `GET /auth/config` → `{ sms, telegram, telegramBotId }`, `GET|PUT /me`, `DELETE /account`, `POST /auth/telegram`, `POST /admin/migrate-pilots`.

### 20.2 Миграция (идемпотентная)
`POST /admin/migrate-pilots` (`?dry=1` — только отчёт) с заголовком `X-Admin-Token`. Эндпоинт отвечает 404, пока не задан секрет `ADMIN_TOKEN` (≥ 24 символа). Находит телефонные ID в сессиях, `user:*`, `straight:*`, `lap:*`, `pulse` (посты и лайки), `crew:*` (участники, создатель, memberBests), `duel:*`, `pilotmeta:*`/`garage:*`/`crewidx:*`/`duelidx:*`, `session:att:*`; создаёт/находит аккаунт и переписывает на uuid (TTL ключей сохраняется), ники вида «пилот»+4 последних цифры телефона заменяются. Повторный запуск = все счётчики 0.
```bash
cd worker
openssl rand -hex 24 | npx wrangler@3.114.17 secret put ADMIN_TOKEN   # запомните значение
curl -X POST -H "X-Admin-Token: <значение>" https://pitlane-api.pitlane-taksimaga.workers.dev/admin/migrate-pilots
npx wrangler@3.114.17 secret delete ADMIN_TOKEN                        # выключить эндпоинт
```

### 20.3 Удаление аккаунта
- Worker `DELETE /account` (нужна сессия) удаляет: `pilot:<uuid>`, привязки `auth:*`, все сессии (`sessidx`), `pilotmeta`/аватар, `garage`, строки в `straight:*`/`lap:*` (секторы считаются из кругов), посты Пульса и лайки, участие в экипажах, дуэли, отметки «я на месте»; для телефона — ещё `otp:`/`rl:otp:ph:`/`user:`.
- Экипаж: если удаляемый — создатель и в экипаже есть другие, права переходят участнику, вступившему раньше всех; если никого не осталось — экипаж и инвайт удаляются. Дуэли с участием пилота удаляются целиком (живут 7 дней).
- Не удаляется: анонимные карточки `share:*` (без привязки к аккаунту, TTL 30 дн.), счётчики rate-limit по IP (15 мин).
- Клиент: Аккаунт → «Удалить аккаунт» → шторка, ввод «УДАЛИТЬ» → после успеха стираются токен, сессия и запись аккаунта (localStorage + IndexedDB), профиль (ник/аватар), списки дуэлей/экипажей, локальный кэш API и guest-ID устройства. **Остаются** (они локальные и к аккаунту не привязаны): гараж, покраска/номера, 3D-тир качества, история замеров, язык, звук.
- Страница для Google Play: `delete-account.html` — описание + кнопка удаления для вошедшего в этом браузере, для остальных — инструкция и email-заглушка.

### 20.4 Юридические страницы — ШАБЛОНЫ, нужна проверка юристом
`privacy.html`, `terms.html`, `offer.html`, `delete-account.html` (стиль `legal.css`, в precache SW). Ссылки: экран входа («Входя, вы принимаете Соглашение и Политику»), вкладка Аккаунт (блок документов), шторка безопасности, страница удаления.
Заглушки (подсвечены жёлтым `<mark class="ph">`), заполнить перед публикацией:
| Заглушка | Где |
|---|---|
| `[ФИО самозанятого]` | privacy, terms, offer, delete-account |
| `[ИНН]` | privacy, terms, offer |
| `[email для связи]` | privacy, terms, offer, delete-account |
| `[дата редакции]` | privacy, terms, offer |
| `[цена в месяц]`, `[цена в год]` | offer (в `app.js` сейчас `PRICE = { month: 390, year: 2990 }` — сверить) |
Что проверить юристу: хранение данных в Cloudflare (вне РФ) vs требование локализации (ч. 5 ст. 18 152-ФЗ) и уведомление Роскомнадзора об обработке/трансграничной передаче; условия возврата/автопродления в оферте (ЮKassa рекуррентные платежи); возрастное ограничение 18+.

### 20.5 Безопасность замеров
Одноразовая шторка перед первым «Старт» (разгон и круг), флаг `localStorage['pitlane-safety-ok-v1']`; строка на экране Замер: «Только треки и закрытые площадки. Не отвлекайтесь на телефон за рулём.»

### 20.6 Вход через Telegram — что сделать Маге
1. В Telegram открыть **@BotFather** → `/newbot` → имя (например «Pitlane») → username бота, оканчивающийся на `bot` (например `pitlane_login_bot`). BotFather пришлёт **токен** вида `123456789:AA…` — никому не показывать.
2. Там же: `/setdomain` → выбрать бота → отправить `dsssssz.github.io` (без https и пути). Без этого Telegram откажет с «Bot domain invalid».
   (В новом интерфейсе BotFather это может называться Bot Settings → Web Login / Allowed URLs — добавить `https://dsssssz.github.io`.)
3. Задать секрет Worker (токен вводится в терминал, не в чат):
   ```bash
   cd worker
   npx wrangler@3.114.17 secret put TELEGRAM_BOT_TOKEN
   ```
4. (Необязательно) в `worker/wrangler.toml` заменить `TELEGRAM_BOT_USERNAME = "YOUR_BOT_USERNAME"` на username бота и `npx wrangler@3.114.17 deploy`.
5. Проверка: `curl https://pitlane-api.pitlane-taksimaga.workers.dev/auth/config` → `"telegram":true`. В приложении на вкладке Аккаунт появится «Войти через Telegram».
- Пока секрета нет: `/auth/telegram` → 503 `Telegram not configured`, `/auth/config` → `telegram:false`, кнопка скрыта. Если выключены и SMS, и Telegram — показывается «Вход временно недоступен…».
- Проверка подписи: `data_check_string` (все поля кроме `hash`, по алфавиту, `key=value` через `\n`), ключ = SHA-256(bot_token), HMAC-SHA256 == `hash`; `auth_date` не старше 24 ч.
- Почему редирект, а не всплывающее окно: стандартный виджет открывает popup и передаёт результат через `postMessage` в iframe — в установленном PWA (iOS «На экран Домой», Android standalone) popup открывается в отдельном браузере/Custom Tab, связь с приложением теряется. Поэтому кнопка делает переход в том же окне на `oauth.telegram.org/auth?bot_id=…&origin=…&return_to=<app>`, Telegram возвращает на приложение с `#tgAuthResult=<base64 JSON>` (тот же подписанный payload, что у виджета). Также принимается формат `data-auth-url` (`?id=…&hash=…`). Риск: на iOS standalone переход на чужой домен показывается внутри приложения с панелью «Готово» — вход проходит в том же окне; если пользователь закроет панель до возврата, вход не завершится (нажать кнопку ещё раз).

### 20.7 Деплой Worker
Каноничный конфиг — `worker/wrangler.toml` (KV + `SMS_DEMO="0"`), исходник — `worker/src/index.js`; корневой `worker-index.js` теперь просто `export { default } from './worker/src/index.js'`, корневой `wrangler.toml` указывает на тот же файл.
```bash
cd worker && npm test          # офлайн-тесты (mock KV): миграция, публичные ответы без телефонов, DELETE /account, Telegram HMAC
npx wrangler@3.114.17 deploy
```

### Worker deploy log (v76, 2026-09-26)
Deployed wrangler@3.114.17 from `worker/`. Code version `779e8a9a-7e1e-4cf8-bde1-ab94e61d0ac7`; after temporary `ADMIN_TOKEN` put/delete the active version is `0f124317-148c-4c8a-812e-a37e5600ba25` (same code). Secrets on Worker: none (no Twilio, no Telegram, ADMIN_TOKEN removed). `SMS_DEMO="0"`.
Production migration (dry + run + re-run): prod KV had 13 keys (crew/crewinv/crewidx/duel/duelidx test data with non-phone ids) → `phonesFound: 0`, all counters 0. Live: `/auth/config` → `{"sms":false,"telegram":false}`, `/auth/telegram` → 503, `/admin/migrate-pilots` → 404, `DELETE /account` without session → 401; public tops/pulse/duel/crew responses contain no phone-like strings.

## 21. Telegram Mini App (SW v77)

Pitlane открывается как Mini App внутри Telegram (тот же сайт `https://dsssssz.github.io/pitlane/`, тот же аккаунт).

### 21.1 Что работает внутри Telegram
- **Определение среды** (`tma.js`): SDK `telegram-web-app.js` лежит у нас (`vendor/`, telegram.org в РФ тормозит) и грузится **только** если страница похожа на Telegram (hash `tgWebAppData`, `sessionStorage.__telegram__initParams`, `TelegramWebviewProxy` или `?tma=1`), с таймаутом 3,5 с. `isTMA` = есть `initData` или SDK сообщает реальную платформу. В обычном браузере/PWA SDK не загружается, ничего не меняется.
- **Оформление**: `ready()`, `expand()`, `requestFullscreen()` (8.0+, только iOS/Android), `disableVerticalSwipes()` (7.7+ — вращение 3D-машины не закрывает приложение), цвета шапки/фона/нижней панели `#1a1a1a` (нижняя 7.10+). `safeAreaInset + contentSafeAreaInset` → CSS `--tma-top/--tma-bottom` → верхний бар и нижнее меню не залезают под кнопки Telegram.
- **BackButton**: закрывает открытую шторку (дуэль, экипаж, шейр, автодромы, справка, удаление, безопасность), сворачивает экран круга, из вкладок возвращает в Бокс; скрыта во время активного замера.
- **Подтверждение закрытия** включено, пока идёт замер разгона или track-day сессия.
- **Вибро**: `HapticFeedback` вместо `navigator.vibrate` (на iOS WebView вибро нет); success на 0–100 и новом лучшем круге.
- **3D**: Telegram-Android сообщает класс устройства в UA (`LOW/AVERAGE/HIGH`) → стартовая подсказка tier (LOW→low, AVERAGE→medium, берётся более низкий из GPU-эвристики и подсказки); финально решает замер FPS, как раньше.
- **Вход**: тихий, без кнопки — `POST /auth/tma` с сырой `initData`. Та же учётка, что при входе через Telegram на сайте (`auth:tg:<id>` → `p_<uuid>`). Без токена бота Worker отвечает 503 и показывается обычное «Вход временно недоступен». Редирект на `oauth.telegram.org` внутри Mini App **не используется** (Bot API 10.2+: API Mini App работает только на исходном origin).
- **Deep links** `t.me/<bot>?startapp=<param>`: `duel_<id>`, `crew_<id>`, `s_<id>` / `lap_<id>` / `run_<id>` (шейр-карточка), `track_<id>` (вкладка Круг + трасса), `tops_<track>` (Топы + трасса секторов), `diag` (страница диагностики). Параметр обрабатывается один раз за запуск.
- **Шеринг**: дуэль/экипаж/результат → `WebApp.shareMessage` (8.0+) через `POST /tma/share-prepare` (Worker вызывает Bot API `savePreparedInlineMessage` с кнопкой «Открыть в PITLANE» → `t.me/<bot>?startapp=…`). Если нельзя (версия < 8.0, нет username бота, ошибка Bot API) — `openTelegramLink('https://t.me/share/url?url=…')` со ссылкой `t.me/<bot>?startapp=…`. `shareToStory` не сделан: нужна публичная https-картинка/видео, а шейр-карточка у нас рисуется на клиенте (canvas) — нужен хостинг медиа (R2) — отдельная задача.
- **Оплаты**: по правилам Telegram цифровые товары в Mini App — только за Stars. Поэтому внутри Telegram скрыто ВСЁ про Pro/цены/триал/оферту: кнопка Pro, остаток триала, «trial ·/Pro ·» в статусе, пейволлы, ссылка «Оферта Pro» (в приложении и на юр. страницах), раздел 7 «Подписка Pro» в соглашении, фраза про подписку в политике; `offer.html` в Telegram показывает только заголовок и «не относится к версии в Telegram». Карточка «Добавить на Домой» тоже скрыта. Pro-доступ в будущем будет просто читаться из аккаунта.
- **Внешние ссылки** внутри Mini App открываются через `openLink`/`openTelegramLink` — страница никогда не уходит на чужой origin.
- **GPS**: основной источник — `navigator.geolocation.watchPosition`, как в PWA. При отказе в доступе — понятное сообщение на русском + «Открыть настройки» (`LocationManager.openSettings()`, 8.0+) / «Повторить». Экран не гаснет: `navigator.wakeLock`, если его нет — беззвучное зацикленное видео 2 КБ (`vendor/nosleep.mp4`, NoSleep-приём) на время замера; wake lock берётся заново при каждом старте и при возврате в приложение.
- **Service Worker** на iOS внутри Telegram может отсутствовать — регистрация обёрнута, приложение работает без него (без офлайна).
- **Web Bluetooth** в Mini App недоступен (в приложении и не используется).

### 21.2 BotFather — что сделать Маге
Можно использовать того же бота, что для входа на сайте (раздел 20.6), — тогда аккаунты совпадут автоматически.
1. **@BotFather** → `/newbot` (если бота ещё нет) → имя «Pitlane» → username на `bot` (например `pitlane_app_bot`). Сохранить токен, никому не показывать.
2. `/mybots` → бот → **Bot Settings → Configure Mini App → Enable Mini App** → URL: `https://dsssssz.github.io/pitlane/`.
   - Флаг `?tma=1` **не нужен**: Telegram сам передаёт `tgWebAppData` в hash, по нему мы и определяем среду. Добавлять его можно для подстраховки (`https://dsssssz.github.io/pitlane/?tma=1` — принудительно пробует загрузить SDK), вреда нет, но и пользы в обычных клиентах нет.
   - Там же: **Configure Splash Screen** — иконка Pitlane, цвет фона `#1a1a1a` для светлой и тёмной темы.
3. **Кнопка меню** в чате с ботом: `/setmenubutton` → бот → отправить URL `https://dsssssz.github.io/pitlane/` → отправить название кнопки `PITLANE`.
4. **Политика конфиденциальности**: `/mybots` → бот → **Edit Bot → Edit Privacy Policy** (в старых версиях — команда `/setprivacypolicy`, если есть) → `https://dsssssz.github.io/pitlane/privacy.html`. Сначала заполнить в ней плейсхолдеры (раздел 20.4).
5. **Секреты Worker** (токен вводится в терминал, не в чат):
   ```bash
   cd worker
   npx wrangler@3.114.17 secret put TELEGRAM_BOT_TOKEN
   ```
   и в `worker/wrangler.toml` поставить `TELEGRAM_BOT_USERNAME = "<username без @>"` → `npx wrangler@3.114.17 deploy`. Username нужен для ссылок `t.me/<bot>?startapp=…` и для `shareMessage`; без него шеринг внутри Telegram отправит обычную ссылку на сайт.
6. Проверка: `curl https://pitlane-api.pitlane-taksimaga.workers.dev/auth/config` → `"tma":true`, `"telegramBot":"<username>"`, `"tmaShare":true`.

### 21.3 Как тестировать
- Открыть `https://t.me/<bot>?startapp` (или кнопку меню / «Открыть» в профиле бота) — приложение во весь экран, вход без кнопок (Аккаунт → «Telegram @ник»), нет ничего про Pro/оферту.
- Deep links: `t.me/<bot>?startapp=duel_<id>`, `…=crew_<id>`, `…=track_sochi`, `…=tops_sochi`.
- **Диагностика на iPhone до того, как доверять GPS**: открыть `https://t.me/<bot>?startapp=diag` — Mini App сразу откроет `tools/tma-check.html` (тот же origin). Либо временно поставить в Configure Mini App URL `https://dsssssz.github.io/pitlane/tools/tma-check.html`. Нажать «Старт GPS», 10–20 с под открытым небом (лучше в движении), «Взять wakeLock», «Проверить датчики» → «Скопировать отчёт» и прислать. Смотреть: частота (Гц за 10 с), точность, приходит ли поле `speed`, версия API, fullscreen/swipe, wakeLock, SW, WebGL GPU. В обычном браузере страница тоже работает (`https://dsssssz.github.io/pitlane/tools/tma-check.html`).
- Без Telegram всё как раньше: SDK не грузится, Pro/оферта видны, вход через Telegram-редирект/SMS.

### 21.4 Worker
- `POST /auth/tma` `{initData}` (или сырая строка): `secret = HMAC_SHA256(key="WebAppData", msg=bot_token)`, `hash == hex(HMAC_SHA256(secret, data_check_string))` (все поля кроме `hash`, по алфавиту, `k=v` через `\n`), `auth_date` не старше 24 ч, `user.id` → `auth:tg:<id>` → та же сессия (`provider:"tma"`). Лимит 60 запросов / 15 мин с IP. Нет токена → 503.
- `POST /tma/share-prepare` `{initData, param, text}` → `savePreparedInlineMessage` → `{id, link}`; `param` только `(duel|crew|lap|run|s|track|tops)_[A-Za-z0-9_-]`.
- `/auth/config` добавил `tma` и `tmaShare`.
- Тесты `cd worker && npm test`: валидная initData → тот же uuid, что у виджета; подделка, просрочка, другой бот, подпись по схеме виджета, пустая initData, нет user, нет токена; share-prepare с моком Bot API.
- Заодно исправлен редкий баг: `containsPhone()` принимал непрозрачный `p_<uuid>` за телефон (10+ цифр через дефисы) → лайк мог пропасть при миграции (тест иногда падал).

### 21.5 Риски
- Реальное поведение GPS в iOS-Telegram (частота, `speed`) проверено только моками — сначала `startapp=diag` на iPhone.
- `shareMessage` зависит от `savePreparedInlineMessage` (может потребовать включить inline-режим `/setinline`, если Bot API ответит ошибкой — тогда сработает фолбэк `t.me/share/url`).
- NoSleep-видео на iOS может не запуститься без жеста пользователя (запускается по кнопке Старт — это жест).
- В Telegram Desktop/Web fullscreen не запрашивается (только телефоны).
