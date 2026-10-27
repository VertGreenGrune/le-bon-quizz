# Task board

How to use (for every agent):
1. Pick a `todo` task whose **Depends on** tasks are all `done`.
2. Change its status to `in-progress (<your agent name>)` **on `main`** and commit it there
   (`chore: claim T<n>`) before creating your worktree/branch — claims made only inside a
   worktree are invisible to the other agents.
3. Stay inside the task's **Scope** (files/folders). Need to touch something else? Note it
   under "Contract changes / cross-task notes" instead of silently editing.
4. When finished: status `done`, add a one-line summary under the task.

Status values: `todo` · `in-progress (agent)` · `blocked (reason)` · `done`

Tasks that can run **in parallel** once T0 is done: T1, T2, T3 (phase 1); then T5–T8 (phase 2).

---

## Phase 1 — Realtime prototype

### T0 — Monorepo scaffold + shared contract
- **Status:** done
- **Depends on:** —
- **Scope:** root (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, lint/format),
  `packages/shared/**`, empty skeletons of `apps/web` (Vite React TS + Tailwind) and
  `apps/server` (Fastify + Socket.IO, `GET /health`)
- **Deliverable:** `pnpm dev` starts web + server; `packages/shared` exports types + zod
  schemas for every event in PLAN.md §4, `GamePhase`, quiz schema, and a hardcoded demo quiz.
- **Summary:** pnpm monorepo; `@lbq/shared` (consumed as TS source, no build step) exports
  `events.ts` (typed `ClientToServerEvents` / `ServerToClientEvents`, zod payload schemas,
  `Ack<T>`, room helpers), `game.ts` (`GamePhase`, `SHAPES`, constants), `quiz.ts`
  (`QuizSchema`), `DEMO_QUIZ` (id `demo`). Server: Fastify + typed Socket.IO, `/health`,
  empty `registerSocketHandlers` in `apps/server/src/socket/index.ts`. Web: Vite + React 19 +
  React Router + Tailwind v4 (answer colors in `index.css` `@theme`), `ShapeIcon` +
  `shapeBg` in `apps/web/src/components/shapes.tsx`, typed singleton `getSocket()` in
  `apps/web/src/lib/socket.ts`. Verified: typecheck, tests, `pnpm dev`, socket connect.
- **Follow-up for T9:** server runs via `tsx` (no compile step yet); add a real build.

### T1 — Game server (in-memory)
- **Status:** done
- **Depends on:** T0
- **Scope:** `apps/server/src/game/**`, `apps/server/src/socket/**`
- **Deliverable:** PIN generation, rooms, state machine (PLAN.md §2), server timer, scoring
  (§3), all events of §4, one answer per player, late answers ignored, rejoin by
  sessionToken, kick. Vitest unit tests for state machine + scoring.
- **Summary:** transport-agnostic `Game` class (`game/Game.ts`: state machine, timers, scoring,
  join/rejoin/kick/answer) + `GameManager` (PIN registry, idle/ENDED sweep) + `loadQuiz`
  (`game/quizzes.ts`, demo only); `socket/index.ts` validates every payload with the shared zod
  schemas and maps `GameError` → `Ack` errors. QUESTION_INTRO auto-advances after 3 s;
  ANSWERING ends on timer / all *connected* players answered; `host:next` can skip both.
  27 Vitest tests (scoring, ranking, full game, timers, kick, disconnect/rejoin).
- **Follow-ups:** T7 replaces `loadQuiz` (DB + ownership). No `host:rejoin` event: a host
  reconnects by sending any host action with its `hostToken` (re-joins the host room).

### T2 — Shared screen (host view)
- **Status:** done
- **Depends on:** T0
- **Scope:** `apps/web/src/host/**`, plus adding the `/host/:pin` route in `apps/web/src/main.tsx`
  (one line). Reuse `components/shapes.tsx` and `lib/socket.ts` (already exist, from T0).
  `/host/new` = create a game with `DEMO_QUIZ` then show its PIN.
- **Deliverable:** `/host/:pin` — lobby (PIN, player names), question + countdown + answer
  counter, reveal with distribution bars, leaderboard, podium, host buttons (start/next/end).
  Uses the demo quiz via `host:create`.
- **Summary:** `apps/web/src/host/`: pure `hostReducer` (folds server events, tolerant to
  `question:show`/`game:state` order, unit-tested), `useHostGame` (typed listeners + host
  actions, StrictMode-safe `host:create`, hostToken in sessionStorage), `HostPage` + `screens`
  (lobby with PIN/join URL/click-to-kick, intro bar, countdown + answer counter + 2×2 answers,
  reveal with distribution bars, top-5 leaderboard, animated podium, Start/Skip/Next/End).
  Route `/host/:pin` (`/host/new` creates a demo game). Not yet run against a real server (T1).
- **Follow-ups:** (1) protocol has no host rejoin: reloading `/host/:pin` or a socket
  reconnect drops the host out of `game:<PIN>:host` — needs a `host:rejoin { pin, hostToken }`
  (contract change, T1/T8). (2) Assumes the server sends `game:state` + `lobby:players` right
  after `host:create`; lobby is shown until then. (3) "Passer" during ANSWERING sends
  `host:next`; T1 should either end ANSWERING early or reject it. (4) QR code = T8, sounds = T10.

### T3 — Player controller (phone)
- **Status:** done
- **Depends on:** T0
- **Scope:** `apps/web/src/player/**`, plus adding the `/join` and `/play` routes in
  `apps/web/src/main.tsx`. Reuse `components/shapes.tsx` and `lib/socket.ts`.
- **Deliverable:** `/join` (PIN + nickname), `/play` with 2–4 big shape buttons, waiting
  screens, result feedback (correct/wrong, points, rank), sessionToken stored in
  sessionStorage for rejoin, vibration on tap. Portrait, touch-friendly.
- **Summary:** `/join` (PIN prefilled from `?pin=`, nickname, French error messages) and `/play`
  (lobby / get-ready / 2–4 shape buttons fired on pointer-down / answered / correct-wrong with
  points + rank / standings / podium / end / kicked screens, countdown from `remainingMs`,
  "Reconnexion…" banner). Pure reducer `player/playerState.ts` (unit-tested) driven by a
  module-level store `player/playerStore.ts` bound to the shared socket; session in
  sessionStorage (`player/session.ts`), auto `player:rejoin` on every new socket connection.
  Vibration on tap and on result. Not yet tested against the real T1 server.
- **Follow-ups:** T4: verify rejoin flow with T1 (expects server to re-send `game:state` +
  `question:prompt`); T8: wake-lock + rejoin on `visibilitychange`. Optimistic answer is reverted
  if the ack fails with anything other than `ALREADY_ANSWERED`.

### T4 — Phase 1 integration & e2e test
- **Status:** done
- **Depends on:** T1, T2, T3
- **Scope:** `e2e/**`, Playwright config, root `package.json` script, `README.md`. T6/T7/T8
  edit app code in parallel: **don't refactor app code**. Only a minimal fix if a bug blocks
  the test, noted below; report other bugs below instead of fixing them.
- **Deliverable:** Playwright test: 1 host + 3 players play the demo quiz to the podium.
  Instructions in README to test on real phones over LAN (`vite --host`).
- **Summary:** Playwright (`playwright.config.ts`, Chromium) starts its own server :3004 + web
  :5184 (`E2E_SERVER_PORT` / `E2E_WEB_PORT`). `e2e/full-game.spec.ts`: host `/host/new` + 3
  phones (separate mobile contexts) join by PIN, answer all 4 demo questions with a fixed plan
  (answers read from `DEMO_QUIZ`), checks correct/wrong feedback, reveal, leaderboard, podium
  order (Alice > Bob > Chloé), end screen. Passes in ~20 s, stable over repeated runs, no DB
  needed. Root scripts: `pnpm test:e2e`; `pnpm typecheck` now also checks `e2e/`. `README.md`:
  setup, LAN phone testing (LAN IP, firewall, `/health` check), tests. No app code changed,
  no bug found on the happy path.
- **Follow-ups:** (1) T9: run `pnpm exec playwright install --with-deps chromium && pnpm
  test:e2e` in CI (uploads `playwright-report/`). (2) e2e not yet covered: phone reload/rejoin
  mid-question, kick, host reload (blocked by missing `host:rejoin`, see T2 follow-ups), timer
  expiry with no answer, DB quizzes (T6/T7). (3) After T7, the demo quiz must keep working
  without login or this test breaks.

---

## Phase 2 — MVP

### T5 — Database + REST API + auth
- **Status:** done
- **Depends on:** T0
- **Scope:** `apps/server/prisma/**`, `apps/server/src/api/**`, `apps/server/src/auth/**`
- **Deliverable:** Prisma schema (PLAN.md §5), migrations, seed, endpoints of §6, host auth,
  zod validation, docker-compose for Postgres.
- **Summary:** Prisma 7 (`prisma-client` generator → `src/generated/prisma`, gitignored, built by
  `postinstall`/`typecheck`; `@prisma/adapter-pg`) + `init` migration + seed (demo host
  `demo@lebonquizz.local`/`demo1234`, `DEMO_QUIZ` kept with id `demo`); all §6 endpoints with
  shared zod bodies (`packages/shared/src/api.ts`); scrypt passwords + DB sessions (cookie or
  Bearer); local-disk image uploads; `docker-compose.yml` (Postgres 17). 10 integration tests
  run when `TEST_DATABASE_URL` is set (skipped otherwise), plus unit tests.
- **Follow-ups:** T7 — use `getQuizForOwner` (`src/api/quizzes.service.ts`) and
  `getUserBySessionToken` (`src/auth`) for `host:create` (`host:create` has no auth field yet:
  read the `lbq_session` cookie from the socket handshake, or add `authToken` to the payload as
  a contract change); write `GameSession.quizTitle`. T9 — run `prisma migrate deploy` on
  deploy, S3 storage for uploads, rate-limit `/auth/login`, Postgres service in CI for
  `TEST_DATABASE_URL`. T6 — `fetch(..., { credentials: 'include' })`.

### Wave 2 coordination (T4, T6, T7, T8 run in parallel) — read before starting

- **Ports — each agent uses its own** so dev servers / Playwright don't collide:
  | Task | Server | Web |
  |---|---|---|
  | T4 | 3004 | 5184 |
  | T6 | 3006 | 5186 |
  | T7 | 3007 | 5187 |
  | T8 | 3008 | 5188 |
  Start them separately, never with root `pnpm dev` (it uses 3001/5173, reserved for the user):
  `PORT=<server> pnpm --filter @lbq/server dev` and
  `VITE_SERVER_URL=http://localhost:<server> pnpm --filter @lbq/web dev --port <web> --strictPort`.
  Stop every process you started before finishing.
- **Postgres is shared**: one container (`docker compose up -d` from any worktree reuses it;
  compose project name is fixed). **Never run `docker compose down`** — others are using it.
- **Test database per agent** (API tests wipe it): `TEST_DATABASE_URL=postgresql://lbq:lbq@localhost:5432/lbq_test_<task>`
  (e.g. `lbq_test_t7`). Dev data: the normal `lbq` database, don't wipe it.
- **Contract between T6 and T7 for "Start game"**: the editor navigates to
  `/host/new?quizId=<id>` (no `quizId` = demo quiz). T6 makes the host page pass that `quizId`
  to `host:create`. T7 makes the server identify the host from the session cookie on the
  socket handshake and check ownership (`UNAUTHORIZED` / `QUIZ_NOT_FOUND`), and sets
  `withCredentials: true` in `apps/web/src/lib/socket.ts`. Quiz `demo` keeps working without login.

### T6 — Quiz editor UI
- **Status:** done
- **Depends on:** T0 (mock API OK), T5 for real integration
- **Scope:** `apps/web/src/editor/**`, `apps/web/src/auth/**`, `apps/web/src/api/**`, the
  `/editor` routes in `main.tsx`, and the `quizId` query param in `host/useHostGame.ts` +
  `host/HostPage.tsx` (only that — T8 also edits `host/`).
- **Deliverable:** login/register, quiz list, quiz editor (questions, 2–4 choices, correct
  answer, time limit, points, image upload), "Start game" button → `/host/new?quizId=<id>`.
- **Summary:** `api/` — typed `createApiClient` for every §6 endpoint (`credentials: 'include'`,
  `ApiError` with API code / `NETWORK`), app instance `api` in `api/index.ts`, `validate()` = shared
  zod schema → French per-field errors. `auth/` — `AuthProvider` (`/auth/me`), `RequireAuth`
  (→ `/login?next=`), `/login` + `/register` (`LoginBody`/`RegisterBody`). `editor/` — `/editor`
  (list, launch, edit, duplicate, delete) and `/editor/new` | `/editor/:quizId` (title,
  description, cover, question sidebar with error badges, add/duplicate/move/delete, MCQ or
  true/false, 2–4 choices with shapes, several correct answers in MCQ, time, points, image upload
  with drag & drop), validated with `QuizInput` on save (empty extra choices dropped), unsaved
  changes warning, "Lancer la partie" saves then opens `/host/new?quizId=<id>`. Host page passes
  `quizId` to `host:create` (`createDemoGame` → `createGame(quizId = 'demo')`). Pure editor model
  `editor/draft.ts` unit-tested (+ client, validation). Smoke-tested against the real server
  (register → create → upload → update → duplicate → delete → logout); UI not clicked through
  in a browser (no Playwright yet).
- **Follow-ups:** T7 — `host:create` with a DB quiz id answers `QUIZ_NOT_FOUND` until T7 lands
  (the host page shows that error). T12 — `api.games.*` and `exportCsvUrl` are ready for the
  reports page. Uploaded images that are replaced/removed are never deleted (T9 with S3).

### T7 — Load games from DB + save results
- **Status:** done
- **Depends on:** T1, T5
- **Scope:** `apps/server/src/game/**` (persistence adapter), `apps/server/src/socket/**`
  (handshake auth), `apps/web/src/lib/socket.ts` (`withCredentials` only), game history/report
  endpoints in `apps/server/src/api/**`.
- **Deliverable:** `host:create` loads quiz from DB and checks ownership; on ENDED save
  `GameSession` + `PlayerResult`; history/report endpoints return real data.
- **Summary:** `game/persistence.ts`: `GamePersistence` adapter (`authenticate`, `loadQuiz`,
  `saveGame`) with a Prisma implementation (wired in `src/index.ts`) and `demoOnlyPersistence`
  (default, no DB). `host:create` reads the host token from the handshake (`lbq_session` cookie,
  or `auth.token`), loads the host's own quiz (`UNAUTHORIZED` if anonymous, `QUIZ_NOT_FOUND` if
  not owned); `demo` works without login (a logged-in owner of the seeded `demo` row gets the DB
  copy). `Game` gained `startedAt`, per-player `correctCount`, `standings()` and an `onEnded`
  hook: on ENDED, a logged-in host's started game is saved (`GameSession` with quizTitle
  snapshot + `PlayerResult`s; `quizId` null if the quiz was deleted meanwhile), so the existing
  `/api/games*` endpoints now return real data. `game/quizzes.ts` removed. Web socket uses
  `withCredentials: true`. Tests: Game hook/standings, cookie parsing, adapter + history/report
  against Postgres; verified live with a socket client (cookie auth → game → `/api/games`).
- **Follow-ups:** (1) The handshake cookie is read once per socket connection: if a host logs
  in *after* the shared socket connected, `host:create` still sees them as anonymous — T6 should
  reconnect the socket after login/logout (`getSocket().disconnect().connect()`). (2) Games
  abandoned without reaching ENDED (idle sweep, server restart) are not saved. (3) Kicked players
  are not in the saved results.

### T8 — QR code, reconnection hardening, wake-lock
- **Status:** done
- **Depends on:** T2, T3
- **Scope:** `apps/web/src/host/**` (QR code in the lobby screen only), `apps/web/src/player/**`
- **Deliverable:** QR code in lobby → `/join?pin=` (PIN pre-filled; the QR must use the PC's
  LAN address, not `localhost`, so phones can open it), robust rejoin after phone lock,
  Wake Lock API.
- **Summary:** lobby shows a QR code (`qrcode.react`) → `<origin>/join?pin=` (PIN pre-filled).
  When the host page is on `localhost`, the origin is swapped for the PC's LAN IPv4s
  (`host/joinUrl.ts`, unit-tested), which `vite.config.ts` detects at dev-server start and
  injects as `__LAN_HOSTS__` (virtual adapters — WSL, Hyper-V, Docker, VPN — ranked last); a
  "try another address" link cycles through them if the PC has several. Rejoin hardening in
  `player/playerStore.ts`: on `visibilitychange`/`pageshow`/`online` the phone reconnects
  immediately if disconnected (no back-off wait), or sends `player:rejoin` as a 3 s liveness
  probe if the socket looks connected; any rejoin timeout drops the half-open socket and
  reconnects; a reconnect during an in-flight rejoin no longer blocks the new rejoin. Wake lock
  (`player/useWakeLock.ts`): Screen Wake Lock API during a game, re-acquired on return to the
  tab; without it (plain-HTTP LAN = not a secure context, old browsers) falls back to
  NoSleep.js's silent video, started by the "Entrer" tap. Verified with Chromium (phone emulated,
  opened via the LAN URL): join from QR URL, offline→online, wake probe, drop mid-question then
  answer.
- **Follow-ups:** T9 — production is HTTPS so the native wake lock is used there; for a deployed
  build `__LAN_HOSTS__` is the build machine's LAN (only used if the page is on `localhost`, so
  harmless). Real phones still to be tested (iOS Safari: wake lock needs iOS 16.4+, video
  fallback is best-effort). Host reconnection (`host:rejoin`) is still open (T2 follow-up).

### T9 — Deployment
- **Status:** done
- **Depends on:** T4, T5
- **Scope:** `Dockerfile`s, `fly.toml`/equivalent, `.github/workflows/**`, `.env.example`
- **Deliverable:** CI (lint, typecheck, tests), deploy web + server + Postgres, Sentry.
- **Summary:** real server build — `pnpm build` bundles the server with esbuild
  (`apps/server/build.mjs` → `dist/index.js`, `dist/instrument.js`, `dist/seed.js`; inlines
  `@lbq/shared` + generated Prisma client, npm deps external), `pnpm --filter @lbq/server start`
  runs it. Production = **one process / one origin**: with `WEB_DIST_DIR` the server also serves
  `apps/web/dist` (`src/web.ts`, SPA fallback, immutable `assets/`, unit-tested) — required since
  the session cookie is `SameSite=Lax` and `*.fly.dev` is a public suffix (separate web/API apps
  would break login). Root multi-stage `Dockerfile` (`pnpm deploy --prod`, openssl for Prisma
  migrations) + `.dockerignore`; `fly.toml` (Paris, 1 machine because games are in memory, volume
  `/data` for uploads, `release_command` = `prisma migrate deploy`, `/health` check, auto-stop);
  Sentry on server (`@sentry/node` 11, `src/instrument.ts` preloaded with `--import`, Fastify 5xx
  auto-captured) and web (`@sentry/react`, `src/lib/sentry.ts`), both off without a DSN.
  `.github/workflows/ci.yml`: Prettier check, typecheck, tests with a Postgres 17 service
  (`TEST_DATABASE_URL`), build, Playwright e2e (report artifact), Docker build;
  `deploy.yml`: manual `flyctl deploy` (`FLY_API_TOKEN`). `DEPLOY.md`: exact steps (flyctl,
  app + volume, Managed Postgres, secrets, Sentry, first deploy, GitHub token, custom domain,
  rollback). Verified locally: image builds, `migrate deploy` + seed + server run in the
  container against Postgres, HTTPS-style login cookie, socket game (create/join/start), SIGTERM
  shutdown < 1 s, e2e passes. Nothing deployed, CI not run on GitHub yet.
- **Follow-ups:** (1) First push: check the CI run on GitHub (action versions, Postgres service).
  (2) Image is ~1 GB uncompressed, mostly the Prisma CLI kept for migrations — could run
  migrations from a separate slim stage. (3) Uploads are on a Fly volume; S3 storage still open
  (old images never deleted, see T6). (4) Rate-limit `/auth/login` (T5 follow-up) not done.
  (5) Sentry source maps are not uploaded (stack traces in the browser are minified); add
  `@sentry/vite-plugin` with a `SENTRY_AUTH_TOKEN` if needed. (6) `vite build` warns about a
  500 kB+ chunk (code-splitting the editor would help).

---

## Phase 3 — Polish

Order (T10 and T13 touch almost every screen, so they must not run alongside other UI work):
- **Wave 3 (parallel):** T9, T11, T12, T19
- **Wave 4 (alone):** T10
- ~~Wave 5: T13~~ cancelled (French only)

### Wave 3 coordination — read before starting
- Ports: T9 3009/5189 · T11 3011/5191 · T12 3012/5192 · T19 3019/5199. Same rules as wave 2
  (start server/web separately, never root `pnpm dev`, stop your processes when done).
- Shared Postgres (never `docker compose down`); test DB `lbq_test_<task>` (e.g. `lbq_test_t11`).
- Contract changes are **decided here** so T11 and T19 don't collide in `packages/shared`:
  - T11: `PlayerResultPayload` gains `streak: number` (consecutive correct answers including
    this one, 0 if wrong) and `streakBonus: number` (already included in `pointsEarned`).
  - T19: new client event `host:rejoin` `{ pin, hostToken }` → ack `Ack`, after which the server
    re-sends to that socket everything the host screen needs for the current phase.
- Only T11 edits `apps/server/src/game/scoring.ts`; only T19 edits `useHostGame.ts`.

### T9 — see Phase 2 (deployment). Can run in wave 3.

### T11 — Streaks & bonus scoring
- **Status:** done
- **Depends on:** T1
- **Scope:** `apps/server/src/game/**` (scoring + per-player streak), `packages/shared/src/events.ts`
  (`streak`, `streakBonus` only), PLAN.md §3/§4, `apps/web/src/player/**` (show the streak on the
  result screen, minimal styling — T10 polishes it later).
- **Deliverable:** streak bonus per PLAN.md §3 (+100 per consecutive correct answer after the
  first, capped at +500), reset on wrong/no answer; included in score and leaderboard; unit tests.
- **Summary:** `streakBonus(streak)` in `game/scoring.ts` (`min(100 * (streak - 1), 500)`);
  `Player.streak` is updated at REVEAL (wrong / no answer → 0) and the bonus is added to
  `pointsEarned`, the total score, leaderboard, podium and saved results. A 0-point question gives
  no bonus but keeps the streak going. `PlayerResultPayload` gains `streak` + `streakBonus`
  (re-sent on rejoin during REVEAL). Phone result screen shows "🔥 Série de N · bonus + X" from a
  streak of 2. Tests: `streakBonus` table, 8-question game (growth, cap, reset on wrong and on no
  answer, 0-point question), streak kept across rejoin; existing totals updated (demo quiz all
  correct = 5600). typecheck, unit (+ Postgres on `lbq_test_t11`) and e2e pass.
- **Follow-ups:** T10 — style the streak on the phone (🔥 animation), maybe show streaks on the
  host leaderboard (would need a contract change). `e2e/full-game.spec.ts` header comment
  ("Bob ≤ 2000") is now ≤ 2100 with the bonus; the ranking assertion still holds.

### T12 — Game reports page + CSV export
- **Status:** done
- **Depends on:** T6, T7
- **Scope:** `apps/web/src/reports/**`, `/reports` + `/reports/:gameId` routes in `main.tsx`, a
  "Mes parties" link in the editor header (one line in `apps/web/src/editor/**`). Server
  endpoints already exist (`/api/games`, `/api/games/:id`, `/api/games/:id/export.csv`); only
  fix them if broken, noted below.
- **Deliverable:** list of past games (date, quiz, players, winner), report per game (final
  ranking, per-question % correct and answer distribution, hardest questions first), CSV
  download button, empty state.
- **Summary:** `apps/web/src/reports/`: `/reports` (`GameListPage`: date, duration, PIN, quiz,
  player count, winner, empty state) and `/reports/:gameId` (`GameReportPage`: stats tiles,
  final ranking with medals, per-question cards with % correct, distribution bars per shape with
  correct answers marked + "Sans réponse", sorted hardest first or quiz order, "Exporter CSV"
  link, 404 → "Partie introuvable"); pure helpers `reportStats.ts` unit-tested. "Mes parties" link
  in `EditorShell`. The DB had no per-question data, so (cross-scope, see notes) the server now
  records and saves it. Verified with Playwright against a real server: demo host logged in,
  4 phones, list → report → CSV download.
- **Follow-ups:** CSV still only exports the ranking (per-question export could be added).
  Games saved before this change show "détail par question indisponible". T13: strings to i18n.

### T19 — Game robustness (host reconnection, abandoned games)
- **Status:** done
- **Depends on:** T7, T8
- **Scope:** `apps/server/src/socket/**`, `apps/server/src/game/**` (except `scoring.ts`),
  `packages/shared/src/events.ts` (`host:rejoin` only), PLAN.md §4,
  `apps/web/src/host/useHostGame.ts` + `HostPage.tsx`.
- **Deliverable:** reloading or reconnecting the host screen resumes the game (`host:rejoin` with
  the hostToken from sessionStorage, full resync of the current phase); games abandoned before
  ENDED (host gone and idle sweep, `host:end` early) are saved if they had started; kicked players
  appear in saved results; tests. Extend T4's e2e with a host reload mid-question.
- **Summary:** `host:rejoin` `{ pin, hostToken }` (shared contract + PLAN.md §4): `Game.resyncHost`
  re-sends to that socket `game:state`, `lobby:players` and the phase payloads (`question:show`,
  `answer:count`, the stored `question:reveal`, `leaderboard`, `podium`). `useHostGame` emits it
  on every socket (re)connection once it has a pin + hostToken (sessionStorage), so a reload or
  reconnect resumes the game; an unknown game / bad token shows "Partie introuvable". Abandoned
  games: `Game` tracks connected host sockets (`hostConnected`/`hostDisconnected`,
  `hostGoneSince`); `GameManager.sweep` ends (→ `onEnded` → saved if started) games whose host
  is gone for 10 min (`HOST_GONE_TTL_MS`, then the usual 5 min ENDED grace) or idle for 2 h,
  instead of silently dropping them; `host:end` early already saved. Players kicked after the
  start are kept in `standings()` (ranked below the remaining players, so saved ranks match the
  podium); lobby kicks are forgotten. Tests: host resync per phase, host presence, kicked
  standings, sweep end/save (server), resync on a fresh reducer (web); e2e reloads the host
  screen mid-question 3 and checks question + `1 / 3` counter + "Passer" before continuing.
- **Follow-ups:** (1) A server restart still loses live games (in memory until T18); a graceful
  `SIGTERM` handler in `src/index.ts` could `end()` every game to save them (outside scope).
  (2) `PlayerResult` has no "kicked" flag (schema is T5's scope); kicked players are only told
  apart by their rank. (3) T10: the host resync arrives as separate events, so animations
  should not replay on a rejoin (e.g. podium reveal).

### T10 — Animations & sounds (wave 4, run alone)
- **Status:** done
- **Depends on:** wave 3 merged
- **Scope:** `apps/web/src/host/**`, `apps/web/src/player/**`, `apps/web/src/components/**`,
  `apps/web/public/sounds/**`, `index.css`. No server or contract changes.
- **Deliverable:** Framer Motion transitions between phases, countdown animation, answers
  revealing one by one, animated distribution bars, leaderboard re-ordering animation, podium
  reveal (3rd → 2nd → 1st) with confetti, streak "🔥" on phones, button press feedback. Sounds
  on the host screen only (lobby music, countdown tick, reveal, podium), mute toggle remembered,
  only royalty-free/CC0 files (list sources in `public/sounds/CREDITS.md`). Respect
  `prefers-reduced-motion`. e2e test still passes.
- **Summary:** host (`host/screens.tsx`, `HostPage.tsx`): fade/slide transition between screens
  (`AnimatePresence`, one key per screen — ANSWERING → REVEAL animates in place), circular
  countdown ring that empties and turns red + pulses for the last 5 s, answers flying in one by
  one, reveal (wrong answers fade, right ones pulse with a white ring), distribution bars growing
  in sequence with counting numbers, answer counter / lobby player count pop, leaderboard
  re-ordering (previous standings for 1.2 s, then `layout` re-order with scores counting up —
  `hostReducer` keeps `previousLeaderboard`, unchanged by a resync), podium 3rd → 2nd → 1st with
  crown + confetti (`components/motion.tsx`: `Confetti`, `CountUp`). Phones (`PlayPage.tsx`):
  bouncing shapes while waiting, big question number on "get ready", buttons pop in + `whileTap`
  press, answered shape pop + ripple, points counting up, 🔥 flickering streak badge, score bump,
  red countdown ≤ 5 s, staggered podium + confetti for the winner. Sounds (host only,
  `host/sounds.ts`): lobby music loop, player-join pop, tick on the last 5 s, reveal "ta-da",
  podium drum roll + fanfare (timed on the podium delays); 🔊/🔇 toggle in the header remembered in
  `localStorage`; retried on the first click if autoplay is blocked. The first screen after a
  reload (`host:rejoin`) is shown without entrance animations and without its sound (T19
  follow-up 3). `prefers-reduced-motion`: `<MotionConfig reducedMotion="user">` on both pages, no
  confetti / count-ups, CSS animations neutralised in `index.css`. Sound files are synthesized by
  `apps/web/scripts/generate-sounds.mjs` (deterministic, original work, CC0) — listed in
  `public/sounds/CREDITS.md`. Tests: sound rules + mute storage, previous leaderboard in the
  reducer; e2e passes unchanged. Checked in Chromium with screenshots (host 1600×900 + Pixel 7).
- **Follow-ups:** (1) Not tried on real phones / a real TV (performance of confetti on low-end
  TVs). (2) WAV files (~650 kB total); could be converted to Opus/MP3 if size matters. (3) No
  music during ANSWERING (only the last-5-s tick); easy to add with another loop. (4) T13: the new
  UI strings (`Couper le son`, `Série de`…) need i18n.

### T13 — i18n FR/EN
- **Status:** cancelled (2026-10-20, user decision: the app is **French only**, no translation
  layer. Write UI text directly in French; ignore earlier "needs i18n" follow-ups.)

## Phase 4 — Extras

### T15 — Team mode (run alone: touches server, shared, host, phones, editor, DB, reports)
- **Status:** done
- **Depends on:** T10, T11, T12, T19 (all done)
- **Ports:** server 3015 / web 5195, test DB `lbq_test_t15` (same rules as wave 3).

**User requirements (2026-10-20):** when the host creates a game they choose **"Solo"** or
**"Équipes"**; in team mode **players choose their own team**; the final team score must be
**fair when teams have different sizes**.

**Design (decided — follow it, note any deviation below):**
- **Creating a game:** "Lancer" in the editor and "Animer une partie (démo)" on the home page
  open a small dialog: _Solo_ / _Équipes_ + number of teams (2, 3 or 4, default 2). It navigates
  to `/host/new?quizId=<id>&mode=teams&teams=<n>` (`mode` absent = solo; old URLs keep working).
- **Teams** reuse the 4 answer colors/shapes: Équipe Rouge ▲, Bleue ◆, Jaune ●, Verte ■ (first
  `n`). No custom names (keeps the phone UI simple).
- **Lobby, phone:** after the nickname, the phone shows the teams as big colored buttons with
  their member count/names; the player taps one. They can switch team until the game starts.
  The phone shows its team color during the whole game (header band).
- **Lobby, host screen:** players listed in team columns. The host can move a player to another
  team (tap the player → pick a team) and press **"Mélanger"** (random balanced teams, e.g. for
  players who didn't choose). "Commencer" is disabled until every player has a team and at least
  2 teams have players; empty teams are dropped at start. If one team has more than twice as many
  players as another, show a non-blocking hint ("équipes déséquilibrées — le score reste
  équitable").
- **Fair scoring = average per player, per question.** Each player scores exactly as in solo
  (time-based points + streak bonus, PLAN.md §3). For each question, a team earns
  `round(sum of its members' points on that question / number of its members present)`, where
  "present" = connected when ANSWERING started (a player who disconnects mid-question still
  counts and gets 0; a player absent for the whole question doesn't drag the team down). Team
  score = sum of those per-question averages. Kicked players stop counting from the next
  question. Ties share a rank. Why: a plain sum favors big teams; the average makes a team of 2
  and a team of 5 comparable, and counting "present" players makes it fair if someone's phone
  drops. Show this rule in one line on the host leaderboard: "Score d'équipe = moyenne des
  points par joueur".
- **During the game:** host leaderboard shows the team ranking (score + member count) and
  below it the individual ranking. Phone result screen shows own points + team score + team rank.
- **End:** team podium (winning team in its color, confetti) + "Meilleur joueur" (top
  individual) on the host; phones show their team's rank and their own rank.
- **Solo mode is unchanged.**
- **Small-game tweaks (games are ~6 players, 15 max):** `LEADERBOARD_SIZE` → show all players
  (up to 15); `MAX_PLAYERS_PER_GAME` → 30.

**Contract (packages/shared + PLAN.md §4, decided):**
- `host:create` `{ quizId, mode?: 'solo' | 'teams', teamCount?: 2 | 3 | 4 }`.
- New `player:team` `{ pin, teamId }` → `Ack` (LOBBY only, else `GAME_ALREADY_STARTED`).
- New host events `host:moveplayer` `{ pin, hostToken, playerId, teamId }` and `host:shuffle`
  `{ pin, hostToken }` → `Ack`.
- `TeamId` = `0 | 1 | 2 | 3` (= shape index). `GameStatePayload` gains
  `mode: 'solo' | 'teams'`; new event `lobby:teams` (to all) `{ teams: { id, name, members:
  { id, nickname }[] }[] }`; `lobby:players` items gain `teamId?`.
- `PlayerResultPayload` gains optional `team?: { id, score, rank }`.
- `leaderboard` and `podium` gain optional `teams?: { id, name, score, playerCount }[]`.
- On `player:rejoin` / `host:rejoin`, the resync includes the team payloads.

**Persistence & reports:** `GameSession.mode`; `PlayerResult.teamId` (nullable); new
`TeamResult` (gameSessionId, teamId, name, score, playerCount, rank) — migration. Reports page
shows the team ranking for team games and a "Solo"/"Équipes" badge in the game list; CSV gets a
team column.

**Tests:** scoring unit tests with unequal teams (e.g. team of 2 vs team of 5, someone absent
for a question, someone disconnecting mid-question, kicked player, ties); team lobby rules;
persistence; extend e2e with a team game (2 teams, 1 vs 2 players) up to the team podium.
Solo e2e must still pass.

- **Summary:** shared contract as decided (+ error code `TEAMS_NOT_READY`, `RankedTeam`,
  `StandingsPayload`, `TeamId`/`TeamCount`/`GameMode`/`TEAM_NAMES` in `game.ts`;
  `LEADERBOARD_SIZE` 15, `MAX_PLAYERS_PER_GAME` 30). Server: `Game` takes `GameSettings`
  (`mode`, `teamCount`); `setTeam` (player choice + host move), `shuffleTeams` (random, sizes
  differ by ≤ 1), `start()` checks the teams and drops empty ones, `scoreTeams()` at REVEAL adds
  `teamQuestionPoints` (rounded average of present members, `scoring.ts`) — present = connected
  at ANSWERING start or answered; `lobby:teams` broadcast on join / team change / kick and in
  both resyncs; `player:result.team`, `leaderboard.teams`, `podium.teams`; socket handlers
  `player:team`, `host:moveplayer`, `host:shuffle`. DB: migration `20261020201734_teams`
  (`GameSession.mode` enum, `PlayerResult.teamId`, `TeamResult`), saved by `persistence.ts`;
  `/api/games*` return `mode`, `teamId`, `teams`; CSV gets a `team` column for team games only
  (solo export unchanged). Web: `components/StartGameDialog.tsx` (Solo / Équipes + 2–4 teams)
  opened by "Animer une partie (démo)", "▶ Lancer" and "▶ Lancer la partie";
  `lib/gameOptions.ts` (`hostUrl` / `parseGameOptions`, replaces `editor/hostUrl.ts`); host
  `teamScreens.tsx` (team columns with tap-to-move/exclude menu, "Mélanger", "sans équipe" and
  "déséquilibrées" hints, "Commencer" gated by `teamLobbyStatus`; team ranking beside the
  individual one + rule line; team podium + "Meilleur joueur"); the individual leaderboard
  shrinks its rows for up to 15 players. Phone: team picker in the lobby, header band in the
  team color, team score + rank on result / standings, team podium (team rank + own rank).
  Reports: Solo / Équipes badge, team ranking, team column. Tests: `Game.teams.test.ts` (2 vs 5,
  absent / mid-question drop, kick, ties, lobby rules, shuffle, resyncs, solo has no team
  data), team persistence + CSV (Postgres), web reducers / lobby status / URL options / ranks;
  new `e2e/team-game.spec.ts` (home dialog → 2 teams 1 vs 2, host moves a player, team results,
  team podium); solo e2e unchanged. Checked with screenshots (host 1600×900, Pixel 7).
- **Deviations / notes:** (1) new error code `TEAMS_NOT_READY` (no existing code fitted).
  (2) "present" also includes a player who was offline at ANSWERING start but rejoined and
  answered (otherwise their points would be ignored). (3) "Mélanger" re-deals **every** player,
  including those who chose; the host can then move individuals. (4) A team emptied by kicks
  after the start keeps its score (0 players). (5) Team ranks are not in the
  `leaderboard`/`podium` payloads (as specified): clients derive them from the sorted scores
  (`web/src/lib/ranks.ts`). (6) `lobby:teams` keeps its name after the lobby (also used for the
  phone's team band). **After merging, run `pnpm --filter @lbq/server db:migrate`** on the dev DB.
- **Follow-ups:** not tried on real phones; no team-ranking re-order animation between
  questions (only the individual ranking animates); reports CSV has no per-team sheet.

### T14 — More question types: réponse libre, sondage, curseur (run alone, after T15)
- **Status:** done
- **Depends on:** T15 merged (builds on its scoring and contract; must work in solo AND team mode)
- **Ports:** server 3014 / web 5194, test DB `lbq_test_t14`.

**Three new types** (existing `MCQ` and `TRUE_FALSE` unchanged). All UI text in French.

1. **`TYPE_ANSWER` — Réponse libre.** Players type their answer on the phone.
   - Editor: question text + 1 to 3 accepted answers (e.g. "Léonard de Vinci", "De Vinci") +
     toggle **"Tolérer les petites fautes"** (default **on**).
   - Matching (server only): compare after normalizing both sides — trim, lower case, remove
     accents, punctuation and extra spaces, ignore a leading article (le/la/les/l'/un/une/des).
     With tolerance on, also accept a typo distance (Levenshtein) of 1 for normalized answers
     of 5–9 characters and 2 for 10+. Numbers must match exactly ("8" ≠ "9").
   - Phone: text field (max 40 characters) + "Valider" button; keyboard opens automatically.
   - Points: same time-based points + streak as MCQ when correct.
   - Reveal (host): the accepted answer(s) + the answers players typed, grouped after
     normalization, top 6 with counts, correct ones in green.
2. **`POLL` — Sondage.** 2–4 choices, **no correct answer**, 0 points.
   - Phone: the usual shape buttons; after the reveal it shows "Merci pour ton vote !" (no
     correct/wrong).
   - Streak: **unchanged** (a poll neither breaks nor extends it). Team mode: the question gives
     0 to everyone, so team scores don't move.
   - Reveal (host): distribution bars with percentages, no "correct" highlight.
3. **`SLIDER` — Curseur.** Players guess a number on a slider.
   - Editor: min, max, step (default 1), correct value, **tolérance** ± margin (default 0 =
     exact), optional unit (e.g. "km", "ans"). Validation: min < max, correct value in range and
     on a step, margin ≥ 0.
   - Phone: big slider with the current value displayed large + "Valider".
   - Correct if `|guess − correct| ≤ margin`. Points = time-based points ×
     (1 − 0.5 × distance / margin) — exact = full points, edge of the margin = half (margin 0:
     exact guess = full points). Outside the margin = wrong, 0 points, streak broken.
   - Reveal (host): an axis with each guess as a dot, the correct value and margin band, and
     "Le plus proche : <pseudo>".

**Contract (packages/shared + PLAN.md §4; additive, existing clients keep working):**
- `QuestionType` gains `TYPE_ANSWER`, `POLL`, `SLIDER`. `QuestionSchema` becomes a
  discriminated union on `type` (MCQ/TRUE_FALSE/POLL: `choices`; POLL choices have no
  `isCorrect`; TYPE_ANSWER: `acceptedAnswers: string[1..3]`, `typoTolerance: boolean`; SLIDER:
  `slider: { min, max, step, correct, margin, unit? }`).
- `question:show` (host) and `question:prompt` (phones) gain `type`; prompt carries what the phone
  needs and **never the answer**: `choiceCount` (choice types), `slider: { min, max, step, unit? }`
  (no `correct`/`margin`), `maxLength: 40` (TYPE_ANSWER).
- `player:answer`: `{ pin, questionIndex }` + exactly one of `choiceIndex` | `text` | `value`
  (zod union; the server rejects the wrong kind for the question with `INVALID_PAYLOAD`).
- `question:reveal` gains `type` and per type: TYPE_ANSWER `acceptedAnswers`, `topAnswers:
  { text, count, correct }[]`; SLIDER `correct`, `margin`, `guesses: number[]`, `closest?:
  { nickname, value }`; POLL `correctIndexes: []`.
- `PlayerResultPayload` gains optional `poll?: true` (phone shows the thank-you screen) and for
  SLIDER `yourValue`, `correctValue`.

**DB & reports:** Prisma `QuestionType` enum + new nullable columns or a `config Json` on
`Question` (agent's choice, migration); `QuestionResult` stores the type-specific stats (JSON).
Report page: per-type card (typed answers list, slider guesses, poll percentages — polls are
excluded from "hardest questions" and from % correct). CSV unchanged apart from the type.

**Demo quiz:** add one question of each new type to `DEMO_QUIZ` (and the seed) so they can be
tried right away, e.g. "En quelle année a eu lieu la prise de la Bastille ?" (slider 1700–1900,
correct 1789, margin 5), "Quel est le plus grand océan ?" (réponse libre: Pacifique), "Ton
dessert préféré ?" (sondage).

**Tests:** matching unit tests (accents, case, articles, typos at each length, numbers, tolerance
off); slider points (exact, inside, edge, outside, margin 0); poll keeps the streak and gives 0;
team mode averages with each new type; server rejects an answer of the wrong kind; prompt never
contains the answer. Update the e2e games (solo + teams) for the new demo questions.
- **Summary:** shared: `QuestionSchema` is a discriminated union on `type` (missing `type` still
  defaults to MCQ; poll choices drop `isCorrect`; slider refinements: min < max, correct in range
  and on a step, ≤ 100 000 positions), helpers `isChoiceQuestion` / `choiceTexts` /
  `correctChoiceIndexes` / `isOnStep`; contract as specified (+ `SliderPrompt`, `RevealDetails`,
  `TypedAnswerGroup`, `AnswerInput`). Server: `game/matching.ts` (normalization, Levenshtein,
  digits exact), `sliderPoints` in `scoring.ts`, `Game.answer(…, number | AnswerInput)` checks
  the kind per type (`INVALID_PAYLOAD`, also for a slider value out of [min, max]); polls skip the
  streak update; reveal + `QuestionStats` carry `type`, `answerCount`, `details` (top 6 typed
  answers grouped after normalization, slider guesses + closest — fastest wins a tie); results
  carry `poll` / `yourValue` / `correctValue` (re-sent on rejoin). DB: migration
  `20261021173853_question_types` (enum values, `Question.config` JSON, `QuestionResult.type` /
  `answerCount` / `details`); quiz service maps the union ↔ rows; old reports get `type: MCQ`,
  `answerCount` = sum of distribution, `details: {}`. Editor: `DraftQuestion` superset (switching
  type keeps what was typed; poll → 0 points, back → 1000), 5-type selector, accepted answers
  (1–3, « Tolérer les petites fautes »), slider fields (min/max/cran/bonne réponse/tolérance/unité)
  with French errors. Host: hint during typed/slider/poll questions, typed reveal (accepted +
  grouped answers), slider axis (dots, correct marker, margin band, « Le plus proche »), poll bars
  with % and nothing dimmed. Phone: text field (auto-focus, 40 max, Valider), big slider with −/+
  and Valider, « Merci pour ton vote ! », « Ta réponse / Bonne réponse » lines. Reports: per-type
  cards, polls excluded from % correct and sorted last in « plus difficiles ». Demo quiz (+ seed):
  dessert poll, Pacifique typed answer, Bastille slider (1700–1900, 1789 ± 5). Tests: matching,
  slider points, `Game.types.test.ts` (prompt/show never leak the answer, wrong kind rejected,
  poll keeps streak and gives 0, typed grouping, slider points/closest, rejoin, team averages
  with poll/typed/slider), shared schema tests, editor draft tests, persistence round trip of
  every type; existing Game tests use `CLASSIC_QUIZ` (`game/testing.ts`). Both e2e specs play the
  7-question demo (`e2e/answers.ts`). Checked with screenshots (host 1600×900, Pixel 7).
- **Notes:** CSV export unchanged (it only lists the ranking, so no per-question type column).
  `lib/numbers.ts` (French number formatting without grouping, `snapToStep`) is new in web.
  **After merging, run `pnpm --filter @lbq/server db:migrate`** and re-seed for the new demo
  questions. Not tried on real phones (range input + keyboard auto-open on iOS).

**Phase 4 order:** T15 (running) → T14 (alone) → **T16 ‖ T20** in parallel (little overlap:
T16 = editor/library/quiz API, T20 = join/lobby/rankings; both add an independent migration on
different models) → T17 later.

### T16 — Public / private quizzes + quiz library (after T14; can run in parallel with T20)
- **Status:** done
- **Depends on:** T14 merged
- **Ports:** server 3016 / web 5196, test DB `lbq_test_t16`.

**User requirement (2026-10-20):** when creating a quiz, the host chooses **Public** or
**Privé**. A public quiz can be used by the other hosts of the site to run their own games; a
private quiz can only be launched by its creator. (Players never pick quizzes — "available to
play" means other hosts can launch it.)

**Design (decided):**
- `Quiz.visibility` = `PRIVATE` | `PUBLIC`, **default `PRIVATE`** (existing quizzes stay private).
  Migration. Shared `QuizInput` / API types gain `visibility`.
- Editor: a clear "Visibilité : Privé / Public" switch on the quiz form (with one line of help:
  "Public : les autres animateurs pourront lancer ce quiz. Ils ne pourront pas le modifier.");
  a 🌐 Public / 🔒 Privé badge in "Mes quiz".
- **Bibliothèque** page `/library` (link in the editor header, login required): public quizzes of
  other hosts, cards with title, cover, author's name, number of questions, number of games
  played; search by title; sort by most played / newest. Actions: **"Lancer"** (opens the Solo/
  Équipes dialog from T15, then `/host/new?quizId=…`) and **"Copier dans mes quiz"** (creates an
  editable private copy owned by the current host, title suffixed " (copie)").
- Server: `host:create` allows a quiz if the host **owns it OR it is `PUBLIC`**; others →
  `QUIZ_NOT_FOUND` (don't reveal private quizzes exist). REST: `GET /api/library?search=&sort=`
  (public quizzes, **without** the correct answers in the list), `POST /api/library/:id/copy`.
  Only the owner can edit/delete a quiz, public or not.
- If the owner switches a quiz back to private or deletes it, it disappears from the library;
  games already played keep their report (quiz title snapshot from T7).
- Reports: each host only sees the games **they** hosted (unchanged). The author of a public quiz
  sees a "joué N fois" counter, not other hosts' results.
- Demo quiz: the seeded demo quiz becomes public, so new hosts see one item in the library.

**Tests:** visibility rules for `host:create` (owner/public/private-of-someone-else), library
listing excludes private quizzes and answers, copy creates a private owned quiz, only the owner
can edit; e2e: host B launches host A's public quiz.

- **Summary:** shared: `QuizVisibility` (`quiz.ts`), `QuizInput.visibility` optional (absent =
  `PRIVATE` on creation, unchanged on update, so older clients can't flip it by accident),
  `QuizDetail.visibility`, `QuizSummary.visibility` + `playCount`, `LibraryQuery` (`search`,
  `sort` = `popular` | `newest`), `LibraryQuiz`, `LIBRARY_LIMIT` (100). DB: migration
  `20261021190357_quiz_visibility` (`Quiz.visibility` enum, default `PRIVATE`). Server
  (`quizzes.service.ts`): `getPlayableQuiz` (own OR public) used by `GamePersistence.loadQuiz`,
  so `host:create` accepts other hosts' public quizzes and answers `QUIZ_NOT_FOUND` for their
  private ones; `listLibrary` (public quizzes of the *other* hosts, title search, most played =
  count of `GameSession`s, then newest) and `copyPublicQuiz`; new `api/library.routes.ts`
  (`GET /api/library`, `POST /api/library/:id/copy`); copies (duplicate too) are always private.
  Edit/delete/get stay owner-only. Seed: the demo quiz is public. Web: "Visibilité 🔒 Privé /
  🌐 Public" switch with its help line in the quiz form (`editor/visibility.tsx`), badge +
  "joué N fois / jamais joué" in "Mes quiz", "Bibliothèque" link in the editor header,
  `/library` (`library/LibraryPage.tsx`: search with 300 ms debounce, sort, cards with cover,
  author, questions, games played, "▶ Lancer" → Solo/Équipes dialog → `/host/new?quizId=…`,
  "Copier dans mes quiz" → banner with a link to edit the copy). Tests: shared schemas, API
  (default private, PUT keeps visibility, library filters/search/sort/no answers/playCount,
  back to private → gone, copy is private + owned + editable, private copy → 404, non-owner
  can't get/put/delete/duplicate a public quiz), persistence (`loadQuiz` owner / public /
  private-of-another / anonymous / public demo row), web client + draft + label; new
  `e2e/library.spec.ts` (A makes a quiz public in the editor, B searches the library, copies,
  launches A's quiz, plays it with a phone to the end, A sees "joué 1 fois"). Checked with
  screenshots (1600×900).
- **Notes:** (1) The library excludes the current host's own public quizzes (they are in "Mes
  quiz"); `POST /library/:id/copy` accepts any public quiz. (2) Launching a public quiz still
  requires a logged-in host (anonymous hosts only get the demo). (3) Since the seeded `demo` row
  is public, a logged-in host launching `demo` now plays (and counts a game on) that row instead
  of the built-in copy. (4) `e2e/library.spec.ts` needs `E2E_DATABASE_URL` (skipped without it);
  outside the scope: `playwright.config.ts` migrates that DB and passes it to the server, and the
  CI e2e job got a Postgres service. **After merging, run `pnpm --filter @lbq/server db:migrate`**
  and re-seed so the demo quiz becomes public.
- **Follow-ups:** no preview of a public quiz's questions before launching it; no pagination
  beyond 100 results; a host can't see who launched their public quiz (by design).

### T20 — Player avatars (after T14; can run in parallel with T16)
- **Status:** done
- **Depends on:** T14 merged (T15 lobby/teams must be in place)
- **Ports:** server 3020 / web 5200, test DB `lbq_test_t20`.

**User requirement (2026-10-20):** players choose an **avatar** when joining, shown next to
their nickname.

**Design (decided):**
- A fixed set of **24 avatars** bundled in the app (no upload, no external service): fun animal
  emojis on a colored circle (🦊 🐼 🐸 🦁 🐙 🦄 🐧 🐨 🐯 🐵 🐰 🐻 🐷 🐮 🐔 🦉 🐢 🐬 🦖 🐝 🦋 🐱 🐶 🐳),
  defined once in `packages/shared` (`AVATARS`: id, emoji, background color) and rendered by one
  `<Avatar>` component (size variants). Emoji rendering varies by phone; acceptable.
- **Changed (2026-10-21, user decision):** the emojis are replaced by **20 Batman: The Animated
  Series portraits** cut from a picture supplied by the user (`apps/web/public/avatars/<id>.jpg`,
  192 px JPEG; `AVATARS` = id + French name). DC / Warner Bros characters: fine for private
  games, to reconsider before a public deployment.
- Join flow (phone): PIN → nickname + avatar grid on the same screen; a random avatar is
  preselected; tapping changes it. Two players may pick the same avatar (no uniqueness rule —
  with ~6 players it rarely matters; avatars already taken in this game are shown dimmed as a
  hint). The choice is remembered on the phone (`localStorage`) for next games.
- Shown everywhere a player appears: phone header, host lobby (big, with a little pop when
  someone joins), team columns (T15), leaderboard, podium, "Meilleur joueur", slider "Le plus
  proche" (T14), reports ranking.
- Contract: `player:join` gains `avatar: AvatarId` (zod: one of `AVATARS`; missing → random, so
  old clients still work); `avatar` added to `lobby:players` / `lobby:teams` members,
  `RankedPlayer` (leaderboard/podium) and the rejoin ack. Persisted in `PlayerResult.avatar`
  (nullable, migration). PLAN.md §4/§5 updated.

**Tests:** invalid avatar rejected / missing → random; avatar in lobby, leaderboard, podium
payloads and saved results; e2e checks the avatar appears in the host lobby.

- **Summary:** shared `avatars.ts`: `AVATARS` (20 × id / name, images in `public/avatars/`), zod `AvatarId`,
  `findAvatar`, `isAvatarId`, `randomAvatarId(avoid)`. Contract as decided (`player:join.avatar?`,
  avatar in join/rejoin acks, `LobbyMember` for `lobby:players` / `lobby:teams`,
  `RankedPlayer.avatar`) + `closest.avatar?` in the slider reveal and a new
  `player:avatars { pin }` → `{ taken }` (needed for the "already taken" hint before joining).
  Server: `Player.avatar` (missing → random among the free ones), `Game.takenAvatars()`, avatar in
  every lobby / standings / closest payload and in `standings()`; migration
  `20261021190534_avatars` (`PlayerResult.avatar` nullable), report rows return `avatar` (null
  for old / unknown values). Web: `components/Avatar.tsx` (portrait image, xs–xl, neutral "?" for unknown);
  join screen = nickname + big preview + 5×4 grid, preselects the remembered avatar
  (`player/avatarChoice.ts`, localStorage `lbq:avatar`, saved on a successful join) or a random
  one, taken ones dimmed (polled every 4 s); phone header, lobby (big avatar pop), team picker
  members, podium; host lobby (avatar pops in), team columns, leaderboard (size follows the row
  size), podium, « Meilleur joueur », slider « Le plus proche » (avatar replaces 🎯); reports
  ranking + slider closest. Tests: shared avatars + join schema (invalid rejected, missing OK),
  `Game.avatars.test.ts` (chosen / random free / fallback, lobby, teams, leaderboard, podium,
  standings, closest), persistence (saved + returned, null for old rows), web avatar choice +
  reducer; solo e2e picks avatars, checks the "déjà pris" hint, the host lobby and the podium.
  Checked with screenshots (Pixel 7 join + team lobby, host 1600×900).
- **Notes:** CSV export unchanged (no avatar column). Game list (`GameSummary.winner`) has no
  avatar. **After merging, run `pnpm --filter @lbq/server db:migrate`.** Not tried on real
  phones. Old dev rows / remembered emoji ids from before the switch read as "no avatar" /
  a random preselection.

### T21 — Auto-pause when a player loses the connection + easy reconnection (run alone)
- **Status:** done
- **Depends on:** T14, T15, T16, T20 (all done)
- **Ports:** server 3021 / web 5201, test DB `lbq_test_t21`, e2e DB `lbq_e2e_t21`.

**User requirement (2026-10-21):** when a player loses the connection during a game, the game
**pauses**, and the player can **reconnect** and continue.

Already there: a phone that drops reconnects by itself (`player:rejoin`, T3/T8) and keeps its
score. Missing: the pause, and a way back when the session is lost (tab closed, phone restarted,
other phone).

**Design (decided — note any deviation below):**
- **When it pauses** (server-authoritative, `Game.ts`): the game pauses if, during
  `QUESTION_INTRO` or `ANSWERING`, a player who **still has to answer** is disconnected for more
  than **2 s** (grace period, so a 1-second Wi-Fi blip doesn't freeze the game). A player who
  already answered the current question doesn't pause it. If someone is disconnected when the host
  presses "Suivant" towards the next question, the game enters the next question already paused
  (in `QUESTION_INTRO`). REVEAL / LEADERBOARD / PODIUM don't pause (the host drives them), but the
  host screen shows who is disconnected. The **host screen** losing its connection during a timed
  phase also pauses the game (nobody can see the question).
- **Fair timing:** the timer freezes during the pause. When the pause starts, the remaining time
  is restored to its value at the moment of the disconnection (the 2 s grace is given back), and
  `responseMs` excludes paused time, so nobody loses speed points because of the pause. Answers
  are refused while paused (`GAME_PAUSED`).
- **Resume:** automatic as soon as every awaited player (and the host screen) is back, after a
  **3-2-1** countdown on the host screen and the phones. The host can also press **"Continuer
  sans <pseudo>"** (the missing player is then simply absent for this question — existing rule:
  absent players don't block the end of ANSWERING and, in team mode, don't count as "present")
  or **"Exclure"**. No automatic give-up: the host decides (after 60 s the "Continuer sans"
  button is highlighted).
- **Host screen:** an overlay "⏸ Partie en pause — en attente de <avatar> <pseudo>…" with the
  waiting time, one line per missing player, the buttons above, and a "<pseudo> est de retour !"
  flash when someone reconnects. Host sounds pause too.
- **Other phones:** "Partie en pause — on attend <pseudo>…" (timer frozen). The reconnected phone
  goes straight back to the current screen (already handled by the resync).
- **Reconnecting after the session is lost:**
  1. The phone session (pin + sessionToken) moves from `sessionStorage` to **`localStorage`**
     (keyed by PIN, removed when the game ends), so closing the tab or the browser and reopening
     `/join` or `/play` resumes the game automatically.
  2. **From another phone or a fresh browser:** on `/join`, entering the PIN and the **same
     nickname as a currently disconnected player** of a started game takes that player's place
     (same score, team, avatar, streak) after a confirmation screen "Reprendre la partie en tant
     que <pseudo> ?". Only disconnected players can be taken over (a connected player's nickname
     still gets `NICKNAME_TAKEN`); other new players still get `GAME_ALREADY_STARTED`. Fine for a
     game between friends; the host sees "<pseudo> est de retour !" like any reconnection.
- **Team mode / question types:** unchanged rules; the pause just delays the question.

**Contract (packages/shared + PLAN.md §2/§4, decided):**
- `GameStatePayload` gains optional `paused?: { waitingFor: { id, nickname, avatar }[],
  hostMissing: boolean, sinceMs: number }`; while paused, `remainingMs` is the frozen value.
- New host event `host:resume` `{ pin, hostToken }` → `Ack` ("Continuer sans…": resumes now,
  missing players become absent for the current question).
- `player:join` in a started game with the nickname of a disconnected player → ack
  `{ playerId, sessionToken, avatar, reclaimed: true, totalScore }`, followed by the normal
  resync; new error code `GAME_PAUSED` for answers sent during a pause.
- New server → client event `game:resuming` `{ inMs: 3000 }` (to all) for the 3-2-1 countdown.

**Tests:** pause after the 2 s grace (not before), no pause if the disconnected player already
answered, host disconnect pauses, timer frozen and grace time given back, `responseMs` excludes the
pause (points identical to an unpaused game), answers refused while paused, auto-resume with
countdown, `host:resume` and kick during a pause, entering the next question paused, nickname
takeover only for disconnected players, localStorage session survives a "tab close" (web unit
test). e2e: a phone goes offline mid-question (Playwright `context.setOffline`) → host shows the
pause → phone back online → countdown → game continues and finishes; second e2e: player's page
is closed and a new page takes over with the same nickname.

- **Summary:** shared: `GamePause`, `GameStatePayload.paused?`, `game:resuming { inMs }`,
  `host:resume`, error `GAME_PAUSED`, `PlayerJoinAck` (`reclaimed?`, `nickname?`, `totalScore?`),
  constants `PAUSE_GRACE_MS` / `RESUME_COUNTDOWN_MS` / `PAUSE_HINT_MS`. Server (`Game.ts`):
  `Player.offlineSince`; `checkPause()` re-evaluated on every drop / return / kick / host
  (dis)connection / phase entry — pauses after the grace of the earliest drop (immediately when a
  question starts with someone offline), freezes the timer at the drop (`Pause.frozenAt`,
  `remainingMs`), a phase timer expiring during the grace pauses instead; `endPause()` after the
  3-2-1 shifts `answeringStartedAt` by the paused time (identical points) and marks everyone
  connected as present; `resume()` (« Continuer sans ») excuses the missing players for the
  current question (absent, not awaited, not present for team averages); ANSWERING now ends when
  every non-excused player answered (a dropped player no longer ends it early: the game waits);
  `reclaim(nickname)` for a started game (disconnected players only, session token rotated);
  `lobby:players` items carry `offline`. Socket: `host:resume`, `player:join` → reclaim when
  started, `player:avatars` ack `started`. Web: phone session in localStorage keyed by PIN
  (`player/session.ts`, 12 h TTL, cleared at ENDED / kick / refused), `/join` goes straight to
  `/play` when a session is stored; started game → nickname field only, « Reprendre ma place » →
  « Reprendre la partie en tant que <pseudo> ? »; phone pause overlay (who it waits for, frozen
  timer, 3-2-1). Host: pause overlay (`host/pauseScreens.tsx`: waiting time, one line per missing
  player with « Exclure », « Continuer sans … » highlighted after 60 s, 3-2-1), « <pseudo> est de
  retour ! » toasts, « 📵 … hors ligne » header outside pauses, no tick while paused (tick on the
  3-2-1). Tests: `Game.pause.test.ts` (18: grace, already answered, timer expiring in the grace,
  host drop, frozen timer, auto-resume + countdown, drop during countdown, same points with /
  without pause, every question type, team mode, `resume`, kick, next question paused, skip,
  takeover rules), 3 existing tests updated to the new "wait" rule; web: session (tab close),
  phone / host reducers. e2e `e2e/pause.spec.ts`: offline → pause → online → countdown → game
  finishes; closed tab → same phone resumes by itself, then another phone takes over « bob ».
  Checked with screenshots (host 1600×900, Pixel 7).
- **Deviations / notes:** (1) **Outside scope:** `apps/server/src/index.ts` Socket.IO
  `pingInterval`/`pingTimeout` 5 s (defaults 25 s + 20 s): a phone that loses Wi-Fi without
  closing the socket (Playwright `setOffline` too) was only seen offline after ~45 s; now ≤ 10 s.
  The timer still runs during that detection delay (the server only knows the drop from then).
  (2) Additions: `lobby:players[].offline` (host shows who is offline outside pauses + the
  « de retour » flash), `player:avatars` ack `started` (join screen knows to offer the takeover
  before sending), join ack `nickname`. (3) « Continuer sans » excuses **all** missing players at
  once (the contract has no player id) and also uses the 3-2-1; a player still missing at the
  next question pauses it again (per spec). (4) Answers given by others *during* the 2 s grace
  keep their real response time (at most 2 s slower than the restored clock).
  (5) Takeover only in a started game (in the lobby the nickname stays `NICKNAME_TAKEN`).
- **Follow-ups:** not tried on real phones (iOS lock → socket closed → pause after ~2–10 s, which
  is wanted, but a player locking the phone during the reveal makes the next question start
  paused until they unlock).

### T22 — Media questions: sound clips (blind test) + picture reveal effects (run alone, after T21)
- **Status:** done
- **Depends on:** T21 merged (the sound must pause with the game; same host question screen)
- **Ports:** server 3022 / web 5202, test DB `lbq_test_t22`, e2e DB `lbq_e2e_t22`.

**User requirement (2026-10-21):** fun quizzes, "not just text": music and pictures.

**Design (decided):**
- **Sound clip on any question type** (optional): `audio: { url, startSec, durationSec }` —
  uploaded file (MP3, OGG, M4A/AAC, WAV; ≤ 10 MB; type checked by magic bytes like images),
  `startSec` ≥ 0 (start inside the file), `durationSec` 5–30 (default 15). Plays **on the host
  screen only** (TV speakers), from the start of ANSWERING, looping until the clip length if the
  answering time is longer; stops at REVEAL; **pauses with the game** (T21) and resumes after the
  3-2-1. Follows the host 🔊/🔇 toggle; background lobby music/ticks are ducked while a clip plays.
  Host screen: a big animated 🎵 visual + "Écoutez bien !" and a "Rejouer" button. Optional
  `audioOnReveal: true` = play the clip at REVEAL instead (e.g. "listen to the answer").
- **Picture reveal effect** (optional, questions with an image): `imageEffect: 'none' | 'blur' |
  'zoom' | 'pixelate'` — the picture starts unrecognisable and becomes clear progressively over
  the answering time (blur 30 px → 0, zoom ×6 on a random point → ×1, pixelate 8 → full), fully
  clear at REVEAL. Pauses with the game. Faster answers already earn more points, so guessing
  early pays off. Phones never get the image (unchanged).
- **Editor:** per question, "Ajouter un son" (upload, start time with a small player to pick the
  excerpt, duration, "jouer à la révélation") and "Effet sur l'image" (Aucun / Flou / Zoom /
  Pixelisé) with a live preview. When a quiz with uploaded sounds or images is switched to
  **Public**, show: "Vous devez avoir les droits sur les images et sons partagés publiquement."
- **Contract:** `questionBase` gains optional `audio`, `audioOnReveal`, `imageEffect` (zod, all
  question types); `QuestionShowPayload` (host) gains them; `QuestionPromptPayload` (phones)
  **doesn't**. Upload endpoint accepts audio (`POST /api/uploads/audio` or a `kind` field).
  Prisma: new nullable columns on `Question` (migration). PLAN.md §4–§6.
- **Tests:** schema (duration bounds, audio types by magic bytes, effect only with an image), the
  host screen plays/stops/pauses the clip (unit test of the audio controller with a fake `Audio`),
  e2e: a question with a sound and a blurred image is played (assert the `<audio>` starts and the
  blur decreases), and the phone payload contains neither.

- **Summary:** shared (`quiz.ts`): `QuestionAudioSchema` (`url`, `startSec` 0–3600 default 0,
  `durationSec` integer 5–30 default 15), `ImageEffect` enum, `questionBase` gains `audio?`,
  `audioOnReveal?`, `imageEffect?` (every type); the question union refines "effect needs an
  image"; `QuestionShowPayload` gains `audio?`, `audioOnReveal?: true`, `imageEffect?` (`none` not
  sent), `QuestionPromptPayload` unchanged; `AUDIO_UPLOAD_MAX_BYTES` (10 MB). Server: `showPayload`
  adds the media (host only); `POST /api/uploads/audio` (`sniffAudioType`: ID3 / MPEG frame →
  mp3, ADTS → aac, `OggS`, `ftyp` → m4a, RIFF/WAVE), size limits per route (image 5 MB, audio
  10 MB); migration `20261021201359_media` (`Question.audioUrl` / `audioStartSec` /
  `audioDurationSec` / `audioOnReveal`, enum `ImageEffect` column `imageEffect`, all nullable),
  mapped in `quizzes.service.ts` (so copies / duplicates keep them). Host: `host/clipPlayer.ts`
  (`ClipPlayer`: declarative `update(wish, muted)`, excerpt looped by `timeupdate` / `ended`,
  position kept across a pause, new key = restart, one-shot at the reveal, `replay()`, autoplay
  retry on the first click; `clipWish(question, phase, paused)`; `useQuestionClip` with a hidden
  `<audio data-testid="question-clip">`); `sounds.ts` `setDucked` (game sounds × 0.3 while a clip
  plays). `components/RevealImage.tsx` + `lib/imageEffect.ts` (`effectFrame`: blur / scale /
  pixel blocks doubling at a steady pace; `zoomOrigin` seeded by picture URL + question index so
  a reload zooms on the same point; pixelate = tiny canvas stretched with
  `image-rendering: pixelated`). Question screen: picture with its effect (progress from the
  clock, frozen while paused), « 🎵 Écoutez bien ! » badge + « ↻ Rejouer » (« Écoutez la
  réponse ! » at the reveal with `audioOnReveal`, « (son coupé) » when muted), at REVEAL the clear
  picture beside the results. Editor (`editor/MediaFields.tsx`): « 🎵 Ajouter un son » (upload /
  drag & drop, player, « Début de l'extrait » + « ⏱ Position du lecteur », duration 5–30 s,
  « ▶ Écouter l'extrait », « Jouer à la révélation »), « Effet sur l'image » (Aucun / Flou / Zoom /
  Pixelisé) with a looping live preview; an effect left without a picture is dropped on save;
  « ⚠️ Vous devez avoir les droits sur les images et sons partagés publiquement. » under the
  visibility switch when the quiz is public and has a cover, pictures or sounds (`hasMedia`).
  Tests: shared schema (defaults, duration / start bounds, effect only with an image), server
  `Game.media.test.ts` (media in `question:show` to the host only, nothing media-related in any
  phone / room payload), `uploads.test.ts` (magic bytes), API (audio upload 6 MB OK / 11 MB 413 /
  PNG 415, image route still 5 MB, media round trip, effect without image 400); web
  `clipPlayer.test.ts` (fake `Audio`: loop, pause / resume position, stop, mute, reveal once,
  « Rejouer »), `imageEffect.test.ts`, draft (round trip, dropped effect, `hasMedia`,
  `checkAudioFile`); e2e `e2e/media.spec.ts` (needs `E2E_DATABASE_URL`: uploads a PNG + generated
  WAV, editor shows the effect / sound and the public warning, game: the clip plays, the blur
  decreases, reveal stops the clip and clears the picture, the phone's socket frames contain no
  media). Checked with screenshots (host 1600×900 blur / zoom / pixelate, editor).
- **Notes:** (1) The intro screen (`QUESTION_INTRO`) still doesn't show the picture, so the effect
  starts with ANSWERING. (2) A host reload mid-question restarts the clip from the excerpt start.
  (3) Uploaded sounds, like images, are never deleted when replaced (T9 follow-up). (4) The clip
  `<audio>` is created by the host page and stays (paused) in the DOM after leaving it.
  **After merging, run `pnpm --filter @lbq/server db:migrate`.** Not tried on a real TV.

### T23 — Content: "Tim Burton" quiz + quiz import script (after T22)
- **Status:** done
- **Depends on:** T22 merged
- **Scope:** `content/quizzes/tim-burton/**` (quiz JSON + freely licensed media + `CREDITS.md`),
  `apps/server/scripts/import-quiz.ts` + a `quiz:import` script in `apps/server/package.json`.
- **Import script:** `pnpm --filter @lbq/server quiz:import <folder> <owner email>` validates the
  quiz JSON with `QuizInput`, copies its media into the uploads dir and creates the quiz (always
  **Privé**) for that host. Re-running it updates the same quiz (matched by title + owner) instead
  of duplicating it.
- **Quiz content:** French, ~15–20 questions, mixing every type and effect. Every fact checked
  against reliable sources (list them in `CREDITS.md`). **Copyright:** no movie stills, posters or
  soundtrack files downloaded from the web; pictures only from freely licensed sources (e.g.
  Wikimedia Commons CC-BY/CC-BY-SA/public domain photos of the director, actors, places), with
  author + license in `CREDITS.md`. **Music questions use placeholders**: the question is fully
  written (which track, excerpt start, duration) with `audio` pointing to
  `content/quizzes/tim-burton/audio/<name>.mp3`, and `CREDITS.md` lists the files the user must
  add from their own copies; the import script skips the sound with a warning if a file is missing.

- **Summary:** `apps/server/scripts/quizImport.ts` (`prepareQuiz`: reads `quiz.json`, copies local
  media into `UPLOAD_DIR` under a content-hash name (type checked by magic bytes, re-imports reuse
  the files) and rewrites them as `<base URL>/uploads/…`, missing sound → warning + question kept
  without it, missing picture / invalid quiz → error with the zod path, always `PRIVATE`;
  `saveImportedQuiz`: creates the quiz, or updates the host's quiz with the same title) + CLI
  `scripts/import-quiz.ts` (`quiz:import <folder> <email> [--base-url]`, base URL = `PUBLIC_URL` or
  `http://localhost:<PORT>`, folder resolved from where pnpm was launched). Quiz
  `content/quizzes/tim-burton/quiz.json` « L'étrange quiz de Tim Burton », 20 questions: 3 emoji
  rebus, 2 « Qui a dit ? », 1 intrus, 2 vrai/faux, 4 sliders (year, Depp films, box office, « dites
  son nom »), 4 typed answers, 1 poll, 4 blind tests (one `audioOnReveal`), 4 Commons photos with
  zoom / pixelate / blur (+ cover); 10–30 s, 1000 / 2000 / 0 points. `CREDITS.md`: every fact with
  its Wikipedia / Wikiquote source, author + license of each picture (CC BY / CC BY-SA), the 4 MP3
  files to add. Tests `scripts/quizImport.test.ts` (media copy + URL rewrite, idempotent files,
  missing sound / picture, invalid quiz, forced private; create-then-update and unknown host on
  Postgres). Imported into the dev DB for loicmoster@hotmail.fr (private, run twice → updated in
  place) and played once with a scripted socket game (host + 3 phones, all 20 questions to the
  podium: right / wrong / slider-edge results as expected, typed answers with typos accepted, no
  answer or media in phone prompts, report saved with 20 questions — then that test game and its
  temporary host session were deleted).
- **Notes:** (1) The 4 music files are not in the repo (`audio/` is empty): until they are added the
  blind tests are imported without sound (still answerable from the text). (2) Media URLs are
  absolute (`url()` in the schema): import with `--base-url` / `PUBLIC_URL` matching how the host
  screen reaches the server, and with `UPLOAD_DIR` = the running server's upload dir (the dev
  import used `<main checkout>/apps/server/uploads`, served by `pnpm dev` on :3001). (3) The quiz
  has portraits of real people under CC BY-SA: keep the credits if it is ever made public.

### T24 — Forgotten password: reset by e-mail (+ login rate limit, change password)
- **Status:** done
- **Depends on:** — (all auth work done; can run in parallel with T23, which only touches
  `content/**` and the import script)
- **Ports:** server 3024 / web 5204, test DB `lbq_test_t24`, e2e DB `lbq_e2e_t24`.

**User requirement (2026-10-22):** a host who forgot their password can get an e-mail to choose a
new one.

**Design (decided — note any deviation below):**
- **Flow:** "Mot de passe oublié ?" link on `/login` → `/forgot-password` (e-mail field) →
  always the same answer, whether the account exists or not: « Si un compte existe pour cette
  adresse, vous allez recevoir un e-mail avec un lien pour choisir un nouveau mot de passe. »
  (no account enumeration). The e-mail (French, plain text + simple HTML in the app colors)
  contains a link `<web origin>/reset-password?token=…` valid **1 hour**, single use. The page
  asks for the new password twice (same rules as registration, `PASSWORD_MIN_LENGTH`), then the
  host is **logged in** and sent to `/editor` with « Mot de passe modifié ✓ ». Expired / used /
  unknown link → clear message + button to ask for a new link.
- **Security:** token = 32 random bytes (base64url), only its **SHA-256 is stored** (like
  sessions); a new request invalidates the previous unused tokens of that user; on success
  **all existing sessions of the user are revoked** (logged out everywhere) and the token is
  marked used. Rate limits (in memory — one process): reset requests max 3 / hour per e-mail and
  10 / hour per IP (beyond: same neutral answer, nothing sent); **login** max 10 failed attempts
  / 15 min per IP + e-mail → `429` « Trop de tentatives, réessayez dans quelques minutes. »
  (closes T5/T9 follow-up "rate-limit /auth/login").
- **Change password while logged in:** small "Mon compte" page `/account` (link in the editor
  header): current password + new password ×2 → other sessions revoked, this one kept.
- **Sending e-mails:** `nodemailer` over **SMTP**, provider-agnostic, configured by env vars
  `SMTP_URL` (e.g. `smtps://user:pass@smtp-relay.brevo.com:465`), `MAIL_FROM` (« Le Bon Quizz
  <noreply@…> »), `PUBLIC_WEB_URL` (origin used in the link; default: the request's origin).
  - **Dev:** add a **Mailpit** service to `docker-compose.yml` (SMTP `localhost:1025`, web UI
    **http://localhost:8025** to read the captured mails); the dev default `SMTP_URL` points to
    it, so nothing real is ever sent in dev.
  - **No SMTP configured in production:** the server logs a warning at startup, the request
    still answers neutrally, and the reset link is written to the server log (so the admin can
    help someone).
  - `DEPLOY.md`: a section to set up a provider (recommended: **Brevo**, French, free tier
    300 mails/day; alternatives Resend, Mailjet), the Fly secrets, and the sender domain's
    SPF/DKIM records so mails don't land in spam.
- **Contract (`packages/shared/src/api.ts` + PLAN.md §5/§6/§7):** `POST /auth/forgot-password`
  `{ email }` → 204 (always); `POST /auth/reset-password` `{ token, password }` → `AuthResponse`
  (sets the cookie) or 400 `RESET_TOKEN_INVALID`; `POST /auth/change-password`
  `{ currentPassword, newPassword }` → 204 or 400 `WRONG_PASSWORD`; login may answer 429
  `TOO_MANY_ATTEMPTS`. Prisma: new `PasswordResetToken` (id = SHA-256 of the token, userId,
  expiresAt, usedAt?, createdAt) — migration. New routes `/forgot-password`, `/reset-password`,
  `/account`.

**Tests:** API (neutral answer for unknown e-mail, token stored hashed, link works once, expired
→ invalid, new request invalidates the old token, sessions revoked after reset, change password
with wrong current password, rate limits for reset and login), mailer with a fake transport
(French content, link with the token, `PUBLIC_WEB_URL`), web form validation. e2e (needs the
Mailpit container): forgot password → read the mail through Mailpit's API
(`http://localhost:8025/api/v1/…`) → open the link → new password → logged in → old password
refused, new one works.

- **Summary:** shared (`api.ts`): `ForgotPasswordBody`, `ResetPasswordBody`, `ChangePasswordBody`
  (new password = registration rules), error codes `TOO_MANY_ATTEMPTS` / `RESET_TOKEN_INVALID` /
  `WRONG_PASSWORD`. DB: `PasswordResetToken` (id = SHA-256 of the token, 1 h, `usedAt`), migration
  `20261022162431_password_reset`. Server (`api/auth.routes.ts`): `forgot-password` always 204,
  32-byte base64url token, previous unused tokens deleted, mail sent without awaiting (no timing
  hint); `reset-password` consumes the token with a conditional update (single use even when
  concurrent), deletes all sessions + other tokens, sets the new hash, logs in (cookie);
  `change-password` checks the current password, keeps this session only. Rate limits in memory
  (`auth/rateLimit.ts`, sliding window): login 10 failed / 15 min per IP + e-mail → 429 (a success
  resets it), reset 3 / h per e-mail and 10 / h per IP (neutral 204, nothing sent). Mail
  (`mail/`): `mailerFromEnv` — nodemailer on `SMTP_URL` + `MAIL_FROM`; dev default
  `smtp://localhost:1025` (Mailpit, added to `docker-compose.yml`, UI :8025); production without
  SMTP → startup warning + mail (with its link) written to the log; a failed send is logged with
  the link too. French mail, plain text + HTML in the app colors (`passwordResetMail`). Web:
  « Mot de passe oublié ? » on `/login` (carries the typed e-mail), `/forgot-password` (neutral
  message), `/reset-password?token=` (new password ×2 → logged in → `/editor` with « Mot de passe
  modifié ✓ »; invalid link → message + « Demander un nouveau lien »), `/account` « Mon compte »
  (name, e-mail, change password; link in the editor header); shared `auth/AuthCard.tsx`
  (layout + fields), `auth/passwordForm.ts`. DEPLOY.md §4b: Brevo step by step (domain, SPF /
  DKIM / DMARC, SMTP key, Fly secrets, test), alternatives, behaviour without SMTP. Tests:
  `api/password.test.ts` (Postgres: neutral answer, hashed token + 1 h, origin fallback, new
  request invalidates, rate limits, reset once / expired / unknown / weak, sessions revoked,
  change password wrong / right, login 429 + reset on success), `mail/mailer.test.ts` (fake
  transport, French content, link, log mailer, startup warning), `auth/rateLimit.test.ts`, web
  client + form validation; e2e `e2e/password-reset.spec.ts` (Mailpit API: forgot → mail → link →
  mismatched then matching passwords → `/editor` → link refused the 2nd time → old password 401,
  new 200 → « Mon compte » wrong then right current password).
- **Deviations / notes:** (1) Link origin: `PUBLIC_WEB_URL`, else **`CORS_ORIGIN`**, else the
  request's `Origin` header. The `Origin` header is chosen by the client, so a deployment must
  set one of the first two (`fly.toml` now sets `PUBLIC_WEB_URL`), otherwise someone could
  request a reset for a victim with a fake origin and get a phishing link sent from our domain.
  (2) The reset page doesn't check the token before the form is filled (no extra endpoint): an
  expired link is reported on submit. (3) `change-password` also deletes unused reset tokens; it
  has no rate limit of its own (it needs a session). (4) Rate-limit counters live in memory and
  reset on restart / deploy. (5) `.github/workflows/ci.yml` got a Mailpit service (outside
  scope). The e2e spec is skipped without `E2E_DATABASE_URL`, and locally (not in CI) when Mailpit
  isn't reachable. (6) nodemailer pinned to 8.x (matches `@types/nodemailer` 8). **After merging,
  run `pnpm --filter @lbq/server db:migrate`** and `docker compose up -d mailpit`.
- **Follow-ups:** not tried with a real SMTP provider (only Mailpit); no e-mail verification at
  registration (anyone can register with someone else's address — the reset mail then goes to
  the real owner, which is fine).

- T17 AI-generated quizzes from a topic (to be detailed later)
- ~~T18 Redis state + Socket.IO Redis adapter + load test~~ — **cancelled** (2026-10-20): games have ~6 players, 15 max; one server process is enough. Do not add Redis/multi-instance work.

---

## Phase 5 — Party features: beyond Kahoot

**User requirement (2026-10-22):** the game is "really close to Kahoot"; add fun features that
make it better, starting with **jokers** (copy an answer, block a player…) and **new question
types**. Inspiration (researched): Quizizz power-ups (Double Jeopardy, 50-50, Streak Saver,
Immunity, Time Freeze), Trivia Crack power-ups (bomb, double chance, extra time), Kahoot types
(puzzle/order, pin answer, word cloud), Jackbox (Fibbage bluffing, Trivia Murder Party ghosts),
Blooket Gold Quest (random chests, stealing), Gimkit (Draw That), "Qui veut gagner des millions"
jokers, Jeopardy final wager. Target audience: **friends, ~6 players, 15 max**, one TV.

**Order** (each task touches `Game.ts` + host + phones, so they run **one at a time** unless
noted): **T25 ‖ T27 → T26 → T31 → T28 → T30** (T29, T32 cancelled). Every feature is a **host option**
in the Solo/Équipes dialog or a question type in the editor, off by default when it changes the
classic game, and must work in solo + team mode, with the pause (T21) and the rejoin/resync.
Each agent designs its contract additively and documents it in PLAN.md + the notes below.
Ports: server `30<nn>` / web `52<nn>` with `nn` = task number (e.g. T25 → 3025 / 5225), test DB
`lbq_test_t<nn>`, e2e DB `lbq_e2e_t<nn>`.

### T25 — Jokers (power-ups) ⭐ user idea
- **Status:** done
- **Depends on:** T24 (everything merged)
- **Host option** « Jokers » (on by default in the dialog: it's the selling point) — each player
  gets **3 jokers drawn at random** at the start + **1 more every 3 correct answers in a row**
  (max 5 in hand). One joker per question per player, usable during QUESTION_INTRO / ANSWERING
  before answering. Phone: a joker bar at the bottom of the question screen; the target picker
  shows avatars. Host screen: big animated announcement « 🥶 Red a gelé Batou ! » + sound, and
  icons next to players on the leaderboard.
- **Jokers (French names, icons):**
  - **🎯 50/50** — hides half of the wrong choices on your phone (choice questions; for a slider:
    narrows the range around the answer; typed answer: shows the first letter).
  - **🪞 Copieur** — pick a player: you automatically give **their** answer as soon as they answer
    (your points use their answer time + 1 s). If they never answer, you get nothing.
  - **🥶 Gel** — pick a player: their buttons are frozen for **5 s** at the start of the next
    question they play (attack).
  - **🌀 Brouilleur** — pick a player: on their next question their buttons lose colors/shapes
    order (shuffled, grey) — they must read the text on the TV (attack).
  - **✖️2 Double ou rien** — this question: correct = points ×2, wrong = lose 500 points (floor 0).
  - **🛡️ Bouclier** — blocks the next attack aimed at you (Gel / Brouilleur / Voleur) and keeps your
    streak if you get this question wrong.
  - **🦹 Voleur** — pick a player: if you answer correctly, you steal **10 %** of their score.
  - **⏳ Sablier** — your speed points are computed as if you answered at half the elapsed time.
- Rules: attacks can't target the same player twice in one question; in team mode attacks and
  Voleur only target the other teams, Copieur only your own team; polls ignore jokers (refunded).
  Server-authoritative (the server applies 50/50 by sending the reduced choice list to that phone
  only, freezes by refusing early answers, etc.). Reports: jokers used per player.
- **Tests:** each joker's effect and its interaction with streaks, team averages, pause, rejoin,
  every question type; earning rule; refunds; e2e: two phones, one freezes the other, Copieur
  copies an answer.
- **Summary:** shared `jokers.ts`: `JokerType` (`fifty`, `copy`, `freeze`, `scramble`, `double`,
  `shield`, `thief`, `hourglass`), `JOKERS` (French name, icon, description, target / attack),
  constants (3 at start, max 5, +1 per streak of 3, Gel 5 s, −500, 10 %, +1 s) and **the single
  per-type table `jokerAvailability(type)`** / `jokerAllowed` (Wave 6: T27's types = one line
  each). Contract (additive): `host:create.jokers?`, `player:joker` → `Ack`, `joker:state` (each
  player: hand, played joker, shield, possible targets, attacked ids, effects of this phone only)
  and `joker:used` (TV announcement), `game:state.jokers?`, `RankedPlayer.jokers?` (leaderboard),
  `player:result.jokers?` (`JokerResult[]`), errors `JOKER_REFUSED` / `FROZEN`; REST
  `GameSummary.jokers?`, `GameReportRow.jokersUsed?`. Server: all joker logic in
  `game/jokers.ts` (`Jokers` class: deal, per-question reset where pending Gel / Brouilleur land,
  50/50 effects, Copieur chains, Double / Bouclier / Voleur / Sablier at REVEAL, streak rewards,
  payloads), `Game.ts` only calls hooks (`deal`, `startQuestion`, `checkAnswer`, `scoringMs`,
  `onAnswered`, `savesStreak`, `adjustPoints`, `afterScoring`, copier awaiting rules, resync) —
  answers go through one `recordAnswer` path (Copieur reuses it); team scores floored at 0.
  Migration `20261022200000_jokers` (`GameSession.jokers`, `PlayerResult.jokersUsed`), report +
  CSV `jokers` column. Web: start dialog « 🃏 Jokers » (on by default) → `&jokers=1`; phone
  `player/jokers.tsx` (joker bar under the get-ready / answer screens, bottom sheet with
  description + avatar target picker filtered like the server, frozen overlay with countdown,
  « Tu copies … » screen, grey scrambled buttons with texts, 50/50 empty slots / narrowed slider
  / first letter, result lines, toasts, vibration when attacked), small hooks in `PlayPage.tsx`;
  TV `host/jokerScreens.tsx` (queued big announcements with avatars + new CC0 `joker.wav`,
  leaderboard icons: joker played + hand) + « 🃏 Jokers » header badge; reports: badge + « Jokers
  joués » column. Tests: `Game.jokers.test.ts` (29: deal, earning + cap, every refusal, each joker,
  two copiers, copy of a past answer, copy miss, kicked target, Gel with a pause, Brouilleur
  waiting past poll / typed / slider, one attack per target, Bouclier block + streak, Voleur,
  Double floor, Sablier, typed / slider, team targeting + averages, rejoin resync, leaderboard /
  standings, paused), persistence (Postgres: saved jokers, summary flag, CSV), web
  `lib/jokers.test.ts`, `playerState.jokers.test.ts`, game options; e2e `e2e/jokers.spec.ts`
  (dialog option, Gel announced on TV + toast, Copieur, 50/50, frozen phone next question, 50/50
  greyed on a vrai/faux). Checked with screenshots (host 1600×900, Pixel 7).
- **Deviations / notes:** (1) Attacks (Gel, Brouilleur) always land on the target's **next**
  question (never the current one), and wait past questions they can't hit (polls; Brouilleur also
  typed / slider). (2) « Refunded » on polls = jokers are refused there and stay in hand (the
  bar is hidden). (3) 50/50 is refused when it would hide nothing (vrai/faux, 2 choices with one
  wrong). (4) Copieur's target is secret on the TV; a copier can't answer by itself after playing
  it; copying a player who already answered counts from the moment it is played. (5) The phone
  learns the question type in `joker:state.questionType` (to grey jokers during the intro).
  (6) Test hook: `E2E_JOKER_HAND=freeze,copy,fifty` gives everyone that hand (ignored in
  production); set in `playwright.config.ts` (outside scope). (7) Jokers are on by default in the
  dialog, so the team e2e now plays with jokers (unused). (8) 🦜 for Copieur: 🪞 isn't rendered by
  Windows fonts. **After merging, run `pnpm --filter @lbq/server db:migrate`.** Not tried on
  real phones.

### T26 — « Mytho ! » bluff question type (Fibbage-like) ⭐ the most "friends" feature
- **Status:** done
- **Depends on:** T25 and T27 merged (bluff votes must work with jokers and the new answer path)
- New type `BLUFF`: the editor gives a question with a surprising true answer ("Le premier film
  de Tim Burton s'appelle… ?"). Phase 1 (≈ 45 s): every phone **types a fake answer** meant to
  look true (rejected if too close to the real one — reuse `matching.ts`). Phase 2: the TV shows
  all fake answers + the true one, shuffled; each phone votes (can't vote for its own). Reveal,
  one by one: who wrote each lie and who fell for it. Points: **+1000 for finding the truth,
  +500 for each player fooled by your lie**. Works in team mode (team averages) and with jokers
  (Copieur copies the vote; 50/50 removes half of the lies).
- **Tests:** phases + timers + pause, duplicate lies merged, own-lie vote refused, scoring;
  e2e with 3 phones.
- **Summary:** shared (`quiz.ts`): `BLUFF` in the question union (`truth` ≤ 40, `voteTimeSec`
  5–120 default 20, `timeLimitSec` default 45), constants `BLUFF_MAX_LENGTH`,
  `BLUFF_DEFAULT_WRITE_SEC` / `_VOTE_SEC`, `BLUFF_FOOL_SHARE` (0.5); `jokerAvailability.BLUFF`
  (all jokers but Brouilleur and Sablier). Contract (`events.ts`, additive): error
  `LIE_TOO_CLOSE`, `question:show.bluff` (`BluffShow`), `question:prompt.bluff` (`BluffPrompt`,
  per phone), `RevealDetails.bluff` (`BluffOption`), `player:result.bluff`. Server: everything in
  `game/questionTypes/bluff.ts` (lies, merge + shuffle, own-lie rules, vote judge, fool points,
  payloads), wired in `questionTypes/index.ts`; `Game.ts` hooks: `answer()` stores the lie while
  writing (same `player:answer`), checks own-lie votes, `finishAnswering()` (every place that
  ended ANSWERING) starts the vote stage with a new timer or reveals, per-player prompts,
  awaited / answer count = lies while writing, kicked player's lie dropped, fool points added
  at the reveal (`extraBonusPoints`); jokers: `onBluffVote` (50/50 on the lies), `bluffLies`
  context. Migration `20261024120000_bluff` (enum value; settings in `Question.config`, mapped in
  `quizzes.service.ts`). Editor: « Mytho ! » type (`editor/BluffFields.tsx`: vraie réponse, temps
  pour voter; « Temps pour écrire », 45 s on switching). Phone (`player/bluff.tsx`): « 🤥 Invente
  un mytho » field with the « Trop proche » error, « Mytho enregistré ! » + « Changer mon mytho »,
  lettered vote buttons (own lie greyed « Ton mytho », 50/50 dimmed), « Vérité trouvée ! / Bien
  mythoné ! / Piégé ! » result with the truth, who fooled you, whom you fooled (avatars, points);
  `playerState` `lie` + `bluffStage` (Copieur writes its lie, Gel only blocks the vote). TV
  (`host/bluffScreens.tsx`): writing hint, lettered options, reveal one answer at a time (lies
  then « ✅ La vérité », authors and fooled players with avatars, past ones as struck chips;
  instant after a reload). Reports: `reports/bluffCard.tsx` (each lie, votes, authors), « ont
  trouvé la vérité ». Tests: `Game.bluff.test.ts` (14: stages + timers, no truth in any phone
  payload, too-close lies (case, accents, article, typo), replaced lie + rejoin, merged lies and
  own-vote refusal, scoring and reveal order, streak / no time points, host skips, pause in both
  stages + rejoin, kick, team averages, jokers: Copieur, copied own lie, 50/50, refused jokers),
  persistence round trip + saved details (Postgres), shared schema + joker table, editor draft,
  phone reducer; e2e `e2e/bluff.spec.ts` (3 phones: refused lie, own lie disabled, phone frames
  without the truth, reveal, results, report). Checked with screenshots (host 1600×900, Pixel 7).
- **Notes:** (1) A « Mytho ! » stays in `ANSWERING` for both stages (no new `GamePhase`): the
  vote restarts the timer (`setPhase('ANSWERING', voteTimeSec)`), so pause / resume / rejoin /
  host skip needed no special case. (2) Points don't depend on the speed (spec: +1000 / +500);
  scaled by `basePoints` (2000 → +2000 / +1000, 0 → nothing). (3) A lie can be changed until
  the vote starts. (4) The « too close » refusal tells the writer their lie looks like the truth
  — inherent to the rule. (5) Fixed on the way: `enterReveal` filled the shape distribution
  with any `choiceIndex` (a vote's index made a sparse array Prisma refused); now only real
  choices are counted. (6) With 0 or 1 lie the vote is short (the truth alone / one lie); no
  built-in decoys. (7) Docker Desktop was stopped: started it and ran `docker compose up -d`
  (never `down`). **After merging, run `pnpm --filter @lbq/server db:migrate`.** Not tried on
  real phones.

### Wave 6 coordination — T25 ‖ T27 run in parallel (read before starting)
- **Only T25 implements jokers.** T27 doesn't add joker code; for T27's types the joker rules are
  **decided here**: `WHO_OF_US` and `WORD_CLOUD` have no right answer → treated like `POLL`
  (jokers refunded / not offered); `ORDER` and `PIN` → every joker works **except 🎯 50/50**
  (greyed out). T25 must read joker availability from **one per-type table** (e.g.
  `jokerAvailability(type)` in `packages/shared`), so wiring T27's types is a one-line change at
  merge (done by the main agent after both are merged).
- **One answer path:** T27's answers go through the existing `Game.answer` / `AnswerInput` union
  (add `order: number[]`, `point: { x, y }` in 0–1 image coordinates, `playerId`; word cloud uses
  `text`) and the existing scoring flow — no separate path — so T25's joker hooks (Copieur,
  Double ou rien, Sablier, Voleur…) apply to them automatically.
- **Keep shared files easy to merge:** both tasks only **add** to `packages/shared/src/events.ts`
  / `quiz.ts`; T27 puts per-type logic in new files (`apps/server/src/game/questionTypes/*.ts`,
  new phone/host components) with small hooks in `Game.ts`, `PlayPage.tsx` and `screens.tsx`;
  T25 does the same for jokers (`game/jokers.ts`, new components). Each adds its own migration.
- Ports: T25 3025 / 5225, T27 3027 / 5227; test DBs `lbq_test_t25` / `lbq_test_t27`, e2e DBs
  `lbq_e2e_t25` / `lbq_e2e_t27`. Shared Postgres, never `docker compose down`.

### T27 — New question types: ordre, point sur l'image, « Qui de nous ? », nuage de mots
- **Status:** done
- **Depends on:** T24 — **runs in parallel with T25** (see "Wave 6 coordination" above)
- **`ORDER` — Remettre dans l'ordre:** 3–6 items (e.g. films by release year) dragged into order
  on the phone; full points if all correct, partial points per item in the right place.
- **`PIN` — Point sur l'image:** host image (map, poster, photo) + correct zone (circle drawn in
  the editor); players tap the picture on their phone (the phone gets the image for this type
  only); points by distance to the zone; reveal shows every pin with avatars.
- **`WHO_OF_US` — « Qui de nous… ? »:** "Qui est le plus susceptible de rater son train ?" —
  players vote for a **player of the game** (avatars on the phone); no right answer, the most
  voted gets a funny title on the TV; 0 points (or +200 to whoever voted with the majority —
  editor option).
- **`WORD_CLOUD` — Nuage de mots:** free text (≤ 20 chars), animated word cloud on the TV,
  0 points.
- **Tests:** scoring/partial points, phone payloads never leak the answer (except PIN image),
  reports; e2e for each type.
- **Summary:** shared (`quiz.ts`): 4 new `QuestionType`s in the discriminated union — `ORDER`
  (`items` 3–6, different, in the right order), `PIN` (`imageUrl` required, `zone { x, y, radius }`
  in picture fractions, no image effect; `PinPointSchema` / `PinZoneSchema`), `WHO_OF_US`
  (`majorityBonus`, default off), `WORD_CLOUD`; `NO_RIGHT_ANSWER_TYPES` + `hasRightAnswer` (POLL,
  WHO_OF_US, WORD_CLOUD), constants (`ORDER_MIN/MAX_ITEMS`, `WORD_CLOUD_MAX_LENGTH` 20,
  `WHO_OF_US_MAJORITY_BONUS` 200, `PIN_MIN/MAX_RADIUS`). Contract (`events.ts`, additive):
  `player:answer` / `AnswerInput` gain `order` | `point` | `playerId`; `question:show` gains `items`
  / `candidates`; `question:prompt` gains `items` (shuffled) / `imageUrl` (PIN only) / `candidates`
  / `maxLength` 20; `RevealDetails` gains `order` / `pin` / `votes` + `majorityBonus` / `words`
  (types `PinMark`, `VoteCount`); `player:result` gains `placed`, `votesReceived`, `withMajority`,
  and `poll: true` for the 3 types without a right answer. Server: per-type logic in
  `game/questionTypes/` (`order.ts` derangement shuffle + share of points per item in place,
  `pin.ts` full points in the zone / half at its edge fading to 0 at 0.2, `whoOfUs.ts` tally + most
  voted with ties, `wordCloud.ts` grouping after normalization, `index.ts` hooks: prepare / show /
  prompt / judge / settle (majority bonus at the reveal) / reveal / result); `Game.ts` only calls
  them (answers still go through `Game.answer` → time points, streak, team averages, pause,
  rejoin); `Answer` gains optional `order` / `point` / `votedFor`; streak untouched for every type
  without a right answer. DB: migration `20261022200000_more_question_types` (enum values only;
  settings in `Question.config`, mapped in `quizzes.service.ts`). Editor: 4 types in the selector,
  `editor/MoreTypeFields.tsx` (items with ↑ ↓ / add / remove, click-the-picture zone + size
  slider, majority bonus checkbox, word-cloud hint), draft model + French errors. TV
  (`host/moreTypeScreens.tsx`): items labelled A, B, C…, avatars to vote for, hints; reveals:
  right order with « ✓ n » per item, picture with the zone and every pin as an avatar (« n / m dans
  la zone »), most voted player(s) with a crown + funny title (« Légende vivante »…) and the other
  votes, animated word cloud (`lib/wordCloud.ts`). Phone (`player/moreAnswers.tsx`): drag-and-drop
  list (Framer Motion `Reorder`) + ↑ ↓, tap-the-picture pin + Valider, avatar grid, word field;
  « Presque ! » (yellow) for partial points, « n / m bien placés », votes received / majority
  bonus. Shared `components/PinPicture.tsx` (editor, phone, TV, report). Reports: per-type cards
  (`reports/moreTypeCards.tsx`), WHO_OF_US / WORD_CLOUD left out of % correct like polls. Tests:
  `Game.moreTypes.test.ts` (no leak in prompts / show, wrong kinds, order full / partial /
  untouched, pin in / near / far, votes + majority with ties, no-bonus option, word cloud, rejoin
  keeps the shuffle, pause, team averages), `questionTypes.test.ts`, persistence round trip +
  saved reveal details (Postgres), shared schemas, editor draft, word-cloud layout, report stats;
  e2e `e2e/question-types.spec.ts` (DB quiz with the 4 types, host + 2 phones to the report, phone
  frames contain neither the order nor the zone). Checked with screenshots (host 1600×900, Pixel 7).
- **Notes:** (1) The ORDER shuffle is the same for everyone (the TV shows the list with the same
  letters) and is a derangement, so an untouched list scores 0. (2) PIN distances are in picture
  fractions, so on a non-square picture the zone is an ellipse (drawn the same everywhere). (3) Votes
  for a player kicked during the question still count in the tally but aren't listed. (4) No change
  to `DEMO_QUIZ` / the seed (the solo / team e2e play it; the new types have their own e2e).
  (5) Jokers: per Wave 6, WHO_OF_US / WORD_CLOUD = like POLL, ORDER / PIN = all but 50/50 — to wire
  in T25's `jokerAvailability` at merge. **After merging, run `pnpm --filter @lbq/server db:migrate`.**
- **Follow-ups:** not tried on real phones (drag-and-drop on iOS Safari, picture tap precision);
  no ORDER / PIN question in the demo quiz yet.

### T32 — Ambiance: live reactions + end-of-game awards
- **Status:** cancelled (2026-10-22, user decision — was: emoji reactions from the phones on the
  TV + end-of-game awards). Don't implement.

### T29 — Twists: « Quitte ou double » final + Roue des surprises
- **Status:** cancelled (2026-10-22, user decision — was: final bet on the last question +
  random-event wheel). Don't implement.

### T31 — Game mode « Survie » (elimination with ghosts)
- **Status:** done
- **Depends on:** T27
- New mode in the dialog (Solo / Équipes / **Survie**): everyone has **3 ❤️**; a wrong or missing
  answer costs a heart; at 0 the player becomes a **👻 fantôme**: still answers, and each correct
  ghost answer lets them **haunt** a living player (Gel or Brouilleur from T25). Last survivor
  wins (ties → most points). Survie ends early when one player is left; host can set the hearts
  (1–5). Inspired by Jackbox Trivia Murder Party.
- **Summary:** shared: `GameMode` gains `survival`; new `survival.ts` (`SURVIVAL_MIN/MAX/DEFAULT_HEARTS`,
  zod `SurvivalHearts`, `HauntType` = `freeze` | `scramble`, `HAUNTS` French names); contract
  (additive, PLAN.md §3–§7): `host:create.hearts?`, `player:haunt { pin, haunt, targetId }`,
  `survival:state` (`SurvivalStatePayload`: hearts at start, per player hearts / eliminatedAt /
  lastLoss / haunts, `finished?`), `RankedPlayer.survival?`, `player:result.survival?`,
  `joker:used.haunt?`; REST `GameSummary.hearts?`, `GameReportRow.survival?`. Server: all rules in
  `game/survival.ts` (`Survival`: lives, `settle` at REVEAL — only `answer.correct` counts, so
  ORDER / PIN partial points and a BLUFF vote for a lie lose a heart; no loss on questions without a
  right answer, for excused or absent-all-question players —, haunts earned by correct ghost
  answers, `haunt`, `finished`, survivor ranking, payloads); `Game.ts` hooks only (start, intro,
  reveal, kick, join, both resyncs, `next()` → PODIUM once finished, `ranked()` for standings /
  leaderboard / results, `haunt()`). Haunts reuse the T25 engine: every « Survie » game has a
  `Jokers` instance, without hands when the option is off (`withHands`, `Game.withJokers` now
  drives `game:state.jokers`, joker play, reports); `Jokers.haunt()` sets the pending Gel /
  Brouilleur (Bouclier blocks it, one pending per kind) and announces `joker:used { haunt }`.
  Socket `player:haunt`. DB: migration `20261024160000_survival` (enum value, `GameSession.hearts`,
  `PlayerResult.hearts` / `eliminatedAt`), saved by `persistence.ts`; report + CSV `survival`
  column. Web: start dialog « 💀 Survie » + 1–5 hearts (`lib/gameOptions.ts`: `mode=survival&hearts=`);
  TV (`host/survivalScreens.tsx`): « 💀 Survie · n en vie » header, lobby rules + hearts per player,
  « Survivants » leaderboard with hearts / 👻 (ghost rows dimmed, 💔 when one was just lost), the
  « 💀 Éliminé ! » moment over the leaderboard (avatars turn grey, ghost flies off, new CC0
  `eliminated.wav`) then « 🏆 X est le dernier survivant ! », « Voir le podium » as soon as it's
  over, « Podium des survivants »; haunt announcements through `JokerAnnouncements`. Phone
  (`player/survival.tsx`): hearts in the header (« 👻 Fantôme »), result line (💔 / toujours en
  vie / haunt earned), full-screen « 💀 Éliminé ! Tu deviens un fantôme » (long vibration), « 👻
  Hanter un vivant » bar + sheet (Gel / Brouilleur, living targets), toasts, survivor podium.
  Reports: « 💀 Survie · n ❤️ » badge, « Classement des survivants » + Survie column. Tests:
  `Game.survival.test.ts` (29: start hearts, loss per type incl. ORDER / PIN partial, polls, BLUFF,
  ghosts, haunt earned / not on a poll, Gel / Brouilleur landing, refusals, stacking + Bouclier,
  game without jokers, early end, nobody left, last survivor with fewer points, ties, survivors at
  the end, alone, kick, saved record, « Continuer sans », mid-question drop, phone + host resync,
  solo untouched), persistence + report + CSV (Postgres), shared schemas, web helpers / reducers /
  URL options; e2e `e2e/survival.spec.ts` (3 phones, 1 heart: dialog, ghost, haunt Gel on the TV
  and the frozen phone, last survivor, podium after question 3 of 7). Checked with screenshots.
- **Deviations / notes:** (1) Ties → points (as specified), hearts left are not a tie-breaker; if
  every remaining player is eliminated on the same question they share the survivor group and are
  ranked by points, and the game ends (« Plus aucun survivant ! »). (2) A player absent for the
  whole question (offline at ANSWERING start, never answered, e.g. host skipped the pause) keeps
  their hearts like an excused one; one who drops mid-question loses one. (3) Haunts can be used
  from REVEAL to the next questions (not in LOBBY / PODIUM, not paused); a Bouclier blocks them,
  and it doesn't save a heart. (4) The early end happens after that question's leaderboard (the
  host still sees the « éliminé » moment). (5) The game started alone ends when that player is a
  ghost. **After merging, run `pnpm --filter @lbq/server db:migrate`.** Not tried on real phones.

### T28 — Buzzer round
- **Status:** done
- **Depends on:** T31
- Question option « Buzzer »: the question is shown on the TV without choices; phones show one
  huge **BUZZ** button; the first to buzz (server timestamp) answers **out loud**; the host
  presses ✅ / ❌ on the TV (or a host phone); wrong → that player is locked out and the others
  can buzz again; points to the winner only. Great for blind tests (T22 sound clips).
- **Summary:** shared: `questionBase.buzzer?` + refinement (only `BUZZER_QUESTION_TYPES` = MCQ,
  TRUE_FALSE, TYPE_ANSWER, SLIDER, ORDER; `buzzerAllowed`), `buzzerAnswer(q)` (the right answer in
  words: correct choices, accepted answers, « 1789 (± 5) », numbered items);
  `jokerAvailability(type, buzzer)` (buzzer → no joker, `freeze: true` = a pending Gel still
  lands), `jokerAllowed(…, buzzer)`. Contract (additive, PLAN.md §3–§5): `player:buzz`,
  `host:judge { correct }`, error `BUZZER_TAKEN`, `game:state.buzzer` (`BuzzerStatus`: holder,
  wrong), `question:show.buzzer.answer` (host only), `question:prompt.buzzer`,
  `RevealDetails.buzzer` (`BuzzerReveal`), `player:result.buzzer`, `joker:state.buzzer`. Server:
  `game/buzzer.ts` (round state + payloads) and `Game.ts` hooks: `buzz()` takes the hand and
  freezes the clock (`hold`, composes with the pause: a pause during a hold keeps it frozen after
  the 3-2-1), `judge()` (✅ → `basePoints` + usual streak, REVEAL; ❌ → locked out, clock goes on,
  REVEAL when everyone is out), Gel checked on clock time (`timerElapsedMs`), kick of the holder
  frees the hand, « Survie » spares the players who didn't buzz, the buzzer status rides in
  `game:state` so both resyncs (phone and host reload) get it for free. DB: migration
  `20261024200000_buzzer` (`Question.buzzer`), mapped in `quizzes.service.ts`. Editor: « 🔔
  Buzzer » checkbox (types that take it). TV (`host/buzzerScreens.tsx`): « Buzzez sur vos
  téléphones ! », the holder's big card (avatar, « X a buzzé ! », ✅ / ❌, « 👁 Voir la réponse
  (animateur) »), eliminated players, reveal (answer, « 🏆 X a trouvé ! » / « Personne n'a
  trouvé… »); new CC0 `buzz.wav` on a new holder (not replayed after a reload), clock and clip
  paused while someone answers. Phone (`player/buzzer.tsx`): huge BUZZ (fires on pointer-down),
  « À toi ! », « X a la main… » (disabled), « Raté ! » lockout, frozen countdown, result titles
  (« Bien joué ! » / « Raté ! » / « X a été plus rapide » neutral / « Personne n'a trouvé ») with
  the answer; joker bar hidden. Reports: « 🔔 Buzzer » badge + card (answer, found by, wrong).
  Tests: `Game.buzzer.test.ts` (18: prompt / show / no leak, first buzz wins, intro refused,
  frozen timer, lockout + timer goes on, no winner, all wrong, judge without holder, streak bonus,
  typed / slider, team average, Survie, jokers refused + Gel delays BUZZ, holder drop + judge while
  paused, pause during a hold, host resync, phone rejoin, kick holder), persistence round trip
  (Postgres), shared schema / `buzzerAnswer` / joker table, editor draft, host + phone reducers;
  e2e `e2e/buzzer.spec.ts` (3 phones: Bob buzzes, frozen phone clock, host reload while he has the
  hand, ❌, Alice ✅, no winner on the timer, phone frames without the answer, report). Checked
  with screenshots (host 1600×900, Pixel 7).
- **Deviations / notes:** (1) Not on every type: POLL / WHO_OF_US / WORD_CLOUD (no right
  answer), PIN (a point on a picture) and BLUFF are refused by the schema (the editor hides the
  option). (2) Judging is on the TV only (no host phone). (3) The answer for the host is sent in
  `question:show` (host room only, never to phones) and hidden on the TV until « Voir la réponse ».
  (4) Players who don't buzz follow the usual streak rule (no answer = streak reset). (5) « Passer »
  during a hold reveals without a winner. **After merging, run `pnpm --filter @lbq/server
  db:migrate`.** Not tried on real phones.

### T30 — « Dessine-moi » (Pictionary round)
- **Status:** done
- **Depends on:** T28
- Question type `DRAW`: one player (rotating) gets a secret word on their phone and **draws** with
  the finger; strokes stream live to the TV (small vector messages, not images); the others type
  guesses (reuse `matching.ts`, typo tolerance); points to the fastest guessers and to the drawer
  per correct guess. Word lists in the editor (or a built-in French list).
- **Summary:** shared: `DRAW` in the question union (`words` 0–30 × ≤ 30 chars, empty = built-in
  list; `timeLimitSec` default 90; no `imageUrl`), constants `DRAW_FINDER_SHARE` (0.2),
  `DRAW_DEFAULT_SEC`…; new `draw.ts` (1000 × 750 drawing space, palette of 8 colors, 3 sizes,
  eraser, limits, zod `DrawStrokeSchema`, `mergeStrokes`, `strokeStyle`, `wordHint`, `DRAW_WORDS`
  = 156 easy French words); `jokerAvailability.DRAW` = no joker; not in `BUZZER_QUESTION_TYPES`.
  Contract (additive, PLAN.md §3–§5): `player:draw` (`PlayerDrawPayload`), `draw:strokes`
  (`DrawStrokesPayload`), `player:answer` ack `guess?` (`DrawGuess` = found / close / wrong),
  `game:state.draw` (`DrawStatus`: drawer, found), `question:show.draw` (drawer + blanks),
  `question:prompt.draw` (`DrawPrompt`, `word` for the drawer only), `RevealDetails.draw`
  (`DrawReveal`: word, drawer, strokes, finders with times), `player:result.draw`. Server:
  `game/questionTypes/draw.ts` (rotation `pickDrawer` — fewest turns among the connected players,
  join order, teams take turns —, `pickWord` without repeats, `addStrokes` with limits,
  `checkGuess`, drawer points, payloads), `isNearMiss` in `matching.ts` (« Presque ! »: one typo
  more than accepted, or a word of the answer); `Game.ts` hooks: drawer + word at the intro,
  `guess()` (wrong guesses not recorded, a right one through `recordAnswer` + `game:state`
  broadcast), `draw()` (ANSWERING only, refused while paused, relayed to the host room), drawer
  left out of « all answered » / the answer count but awaited for the pause, drawer's streak
  untouched, « Survie » spares every heart on DRAW, both resyncs re-send the drawing. Migration
  `20261024230000_draw` (enum value; `words` in `Question.config`). Editor: « Dessine-moi » type
  (`editor/DrawFields.tsx`: words one per line, built-in list hint; « Temps pour dessiner », 90 s
  on switching; no picture). Phone (`player/draw.tsx`): drawer pad (word, 4:3 canvas with pointer
  capture, 8 colors, 3 sizes, 🧽 gomme, 🗑️ tout effacer, chunks flushed every 60 ms, redrawn from
  the server's drawing after a reload), guess field with « Non, pas … » / « Presque ! » feedback,
  « Trouvé ! » screen (also after a reload, from `game:state.draw.found`), get-ready line « X va
  dessiner », results (« Bien dessiné ! », « Le mot était … », finders). TV
  (`host/drawScreens.tsx`, `components/Drawing.tsx` SVG): « X va dessiner » on the intro, live
  board + drawer + blanks + finders (no guesses shown), the word at the reveal with the drawing
  kept. Reports: `reports/drawCard.tsx` (drawing from the saved vectors, word, drawer, finders with
  times). Tests: `Game.draw.test.ts` (20: rotation solo / offline / teams, built-in words, word
  secrecy in every payload, hint, guesses wrong / close / found / drawer / kind, near misses,
  scoring + cap + 0 points, timer, alone, team averages, Survie + haunt, strokes relay / clear /
  limits, pause, rejoin TV + drawer + finder, no joker), persistence round trip with the drawing
  (Postgres), shared `draw.test.ts`, web `playerState.draw.test.ts` (phone + TV reducers, SVG
  path), `draft.draw.test.ts`; e2e `e2e/draw.spec.ts` (3 phones: live strokes on the TV, wrong /
  « Presque ! » / found, word never in the guessers' frames, reveal, TV + drawer reloads
  mid-drawing, nobody finds, report with the drawing). Checked with screenshots (host 1600×900,
  Pixel 7).
- **Notes:** (1) Drawer points scale with `basePoints` (1000 → +200 per finder, max 1000; 2000 →
  +400, max 2000; 0 → nothing). (2) The guessers' phones show no drawing (they look at the TV);
  only the host room gets `draw:strokes` (+ the drawer on rejoin). (3) Wrong guesses are neither
  stored nor shown anywhere. (4) A game alone reveals at once (nobody to guess). (5) Strokes sent
  while paused are dropped (the pause overlay covers the pad anyway); the server's drawing wins
  after a reload. (6) The drawer counts in `playerCount` of the report (% found includes them).
  (7) No change to `content/` (T33 can add a DRAW question to the Harry Potter quiz now).
  **After merging, run `pnpm --filter @lbq/server db:migrate`.** Not tried on real phones (finger
  drawing on iOS Safari, canvas performance on low-end phones).

### T33 — Showcase quiz « Harry Potter — niveau expert » (content, after T28)
- **Status:** done
- **Depends on:** T28 merged (the buzzer must be in it). Content only — can run in parallel with
  T30 (T30 then adds one `DRAW` question to this quiz, see below).
- **Scope:** `content/quizzes/harry-potter/**` (`quiz.json`, freely licensed media, `CREDITS.md`,
  `README.md`). Reuses the T23 import script (`quiz:import`); fix it only if a new question type
  isn't supported, noted below.

**User requirement (2026-10-24):** one quiz that **shows every feature of the app**, to present
the game — on **Harry Potter, expert level**.

**Design (decided):**
- French, **~22 questions, expert level** (book-level details, not just film trivia: names,
  spells, dates, objects, genealogy, chapters), every fact checked against reliable sources
  (books / official Wizarding World / HP wiki cross-checked; list them in `CREDITS.md`). Varied
  time limits and points (0 / 1000 / 2000), easy openers then harder, a big finale.
- **Covers every feature at least once** (tick list in `README.md`, one line per feature with the
  question number):
  - question types: `MCQ` (incl. one with several right answers), `TRUE_FALSE`, `TYPE_ANSWER`
    (with typo tolerance, e.g. a spell name), `POLL`, `SLIDER` (e.g. a year or a number with a
    margin and a unit), `ORDER` (e.g. the 7 Horcruxes in the order they were destroyed, or the
    books by UK publication), `PIN` (a freely licensed photo or map: e.g. Glenfinnan viaduct on a
    map of Scotland, or a place in a King's Cross photo), `WHO_OF_US` (e.g. « Qui de nous serait
    envoyé à Serpentard ? », with the majority bonus), `WORD_CLOUD` (e.g. « Ton sortilège
    préféré »), `BLUFF` « Mytho ! » (an obscure true answer, e.g. a middle name);
  - media: a sound clip during the question, a clip `audioOnReveal`, and the 3 picture effects
    (blur, zoom, pixelate) + a cover image;
  - the **Buzzer** option on at least one question (T28);
  - an emoji rebus and a « Qui a dit ? » quote, like the Tim Burton quiz.
- **Game modes** (Solo / Équipes / Survie, Jokers) are launch options, not quiz content:
  `README.md` explains how to present them with this quiz (e.g. « Survie + Jokers » for a
  demo evening, « Équipes » for a big group) and lists which jokers can be shown on which question.
- **Copyright:** no film stills, posters, logos or soundtrack files from the web. Pictures only
  from freely licensed sources (Wikimedia Commons: filming locations, actors at premieres, King's
  Cross, Glenfinnan…), author + license in `CREDITS.md`. **Music = placeholders** like T23: the
  question is fully written with `audio` pointing to `content/quizzes/harry-potter/audio/<name>.mp3`
  (an `.gitignore` there keeps the user's files out of git), and `CREDITS.md` lists which excerpts
  the user must add from their own copies (e.g. « Hedwig's Theme » 0:00–0:15).
- **Import:** into the dev DB for `loicmoster@hotmail.fr` (private), then play it once with a
  scripted socket game (host + 3 phones, every question type, the buzzer question validated by the
  host) to check it works end to end; delete that test game afterwards.
- **When T30 is merged:** add one `DRAW` « Dessine-moi » question (e.g. a magical object to draw)
  and re-run the import — note it as a follow-up if T30 isn't done yet.

- **Summary:** `content/quizzes/harry-potter/` — `quiz.json` « Harry Potter — niveau expert », 22
  questions (book-level details, easy opener → 2000-point finale): 8 MCQ (one with 3 right
  answers), 2 vrai / faux (one true, one false), 4 réponses libres (typo tolerance), 1 sondage,
  2 curseurs (± 20 « points », ± 3 years), 1 ordre (the 6 Horcruxes, finale), 1 point sur l'image
  (Glenfinnan viaduct on a Commons relief map of Scotland, zone computed from the Wikipedia
  location-map bounds and checked on the picture), 1 « Qui de nous ? » (majority bonus), 1 nuage de
  mots, 1 « Mytho ! » (Ron's middle name), **buzzer** on a blind test (Q14, réponse libre + sound);
  sound during the question (3, 14), `audioOnReveal` (18), blur (6) / zoom (12) / pixelate (17),
  cover, emoji rebus (1), « Qui a dit ? » (11); 0 / 1000 / 2000 points, 15–45 s. `README.md`:
  question table, feature tick list with question numbers, how to present Solo / Équipes / Survie
  (+ hearts advice) and where to show each joker (from `jokerAvailability`). `CREDITS.md`: every
  fact with its source (HP wiki FR/EN citing the book chapters, Wikipedia, Wikiquote), the 5
  Commons pictures (author + CC BY / CC BY-SA licence, 960 px thumbnails), the 3 music files to add
  (`audio/.gitignore` keeps them out of git). No app code changed (the T23 import script handled
  every type). Imported into the dev DB for loicmoster@hotmail.fr (private) and played once with a
  scripted socket game on :3033 (host + 3 phones, all 22 questions to the podium, with generated
  test tones in place of the music: right / wrong / typo / partial PIN and ORDER results as
  expected, too-close lie and own-lie vote refused, buzzer ❌ then ✅ judged by the host, phone
  prompts without answers / media, report saved with 22 questions) — then the test game, its
  temporary host session and the test tones were deleted and the quiz re-imported without sound.
- **Follow-ups:** (1) add the 3 MP3s listed in `CREDITS.md` and re-run the import (the blind tests
  are playable without sound meanwhile). (2) When T30 is merged: add one « Dessine-moi » question
  (e.g. a magical object to draw) and re-import. (3) Portraits / photos are CC BY-SA: keep the
  credits if the quiz is ever made public.

### T34 — Content: « Batman, la série animée — niveau expert » (25 questions)
- **Status:** done
- **Depends on:** — (all question types exist). Content only, like T23 / T33.
- **Scope:** `content/quizzes/batman/**` (`quiz.json`, media, `CREDITS.md`, `README.md`,
  `images/.gitignore`). Reuses `quiz:import`; app code untouched (fix the import script only if
  needed, noted below).

**User requirement (2026-10-25):** a fun, **expert-level** quiz on **Batman: The Animated
Series** and its universe, **25 questions**, using only these types: **choix multiple, réponse
libre, curseur, ordre, point sur l'image** (a picture with many characters, find a precise one),
**« Mytho ! »**, **« Dessine-moi »**.

**Design (decided):**
- French. Universe = the DC Animated Universe around the series: *Batman: The Animated Series*
  (1992–1995), *The New Batman Adventures* (1997–1999), *Mask of the Phantasm* (1993), *SubZero*
  (1998), *Mystery of the Batwoman* (2003), with links to *Batman Beyond* / *Justice League* when
  fun. Expert = episode titles (French title + original), first appearances, original
  characters of the series (Harley Quinn, Renee Montoya, Baby Doll, Lock-Up, Roland Daggett…),
  creators (Bruce Timm, Eric Radomski, Paul Dini, Alan Burnett), voices (VO and French dub:
  Kevin Conroy / Richard Darbois, Mark Hamill / Pierre Hatet…), Shirley Walker's music, Emmys,
  Gotham details, villains' origins as told in the series (e.g. Mr. Freeze in « Heart of Ice »).
  Fun tone: emoji rebus, « Qui a dit ? » quotes, a few lighter questions between hard ones.
  Every fact checked against reliable sources (DC Animated Universe wiki cross-checked with
  Wikipedia / credits; French dub from a French dubbing reference), listed in `CREDITS.md`.
- **Mix (25):** ~7 choix multiple (incl. one with several right answers), ~5 réponse libre
  (typo tolerance on, several accepted spellings, e.g. « Pingouin » / « Le Pingouin »), ~3
  curseur (year, episode count, number…, with margin + unit), ~3 ordre (e.g. villains by first
  appearance, films by release, Robins in order), **2 point sur l'image** (same crowd picture,
  two different characters to find), ~3 « Mytho ! » (obscure true answers: a real name, a
  middle name, an episode detail), **2 « Dessine-moi »** (word lists from the universe:
  Batmobile, batarang, Bat-signal, carte du Joker, parapluie du Pingouin, pièce de Double-Face,
  point d'interrogation…, ≥ 8 words each). Varied time limits and points (1000 / 2000, one
  0-point warm-up allowed), easy opener → 2000-point finale. No other types.
- **The crowd picture (PIN), copyright:** no stills, posters or fan art from the web (Warner
  Bros / DC). Use, in this order:
  1. **the user's own picture** if they put one in `content/quizzes/batman/images/` (e.g.
     `foule.jpg`) — kept out of git by an `images/.gitignore` (`*` except `.gitignore` and the
     mosaic);
  2. otherwise a **mosaic built from the 20 avatar portraits** already in the app
     (`apps/web/public/avatars/*.jpg`, user-supplied), shuffled in a 5 × 4 grid with no names,
     saved as `content/quizzes/batman/images/mosaique.jpg` (generated by a small script kept in
     the folder, deterministic). The PIN zones (`{ x, y, radius }` in picture fractions) are
     computed from the grid / checked on the picture so each target character is inside its zone.
- **README.md:** the question table (number, type, theme, time, points), how the crowd picture
  works (drop your own `foule.jpg` and re-import to use it), and a suggested way to play
  (« Survie + Jokers » with friends).
- **Import:** into the dev DB for `loicmoster@hotmail.fr` (private), then play it once with a
  scripted socket game (host + 3 phones: every type incl. the PIN on a phone — check the phone
  prompt has the picture — the bluffs and the drawings), then delete that test game.

- **Summary:** `content/quizzes/batman/` — `quiz.json` « Batman, la série animée — niveau expert »,
  25 questions, only the requested types: 7 choix multiple (rébus 🎭 + 👻, « Qui a dit ? », one with
  3 right answers, VO voice of Mr. Freeze at 2000), 5 réponses libres (typo tolerance, 1–3 accepted
  spellings: Richard Darbois, Harleen Quinzel, Oswald Cobblepot, Andrea Beaumont, « Gueule
  d'argile »), 3 curseurs (85 épisodes ± 5, 1993 ± 1, 76 min ± 4), 3 ordres (the DCAU series, the
  films, finale = Bat-family chronology at 2000), 2 points sur l'image on the same crowd picture
  (Mr. Freeze, Renee Montoya), 3 « Mytho ! » (Bud et Lou, Arnold Wesker, Lyle Bolton at 2000),
  2 « Dessine-moi » (10 words each: Gotham objects, Gotham places / creatures); 20–45 s, 1000 /
  2000. No picture of the user's in `images/`, so the crowd picture is the **mosaic** of the 20
  avatar portraits (`images/mosaique.jpg`, 1008 × 808, 5 × 4 fixed shuffled grid, no names, also the
  cover), generated by `images/make-mosaic.ps1` (Windows PowerShell / System.Drawing — no image
  library in the repo; same bytes on every run, prints each portrait's centre); zones x/y = tile
  centres, radius 0.085 (inside the tile), checked on the picture. `images/.gitignore` keeps any
  other file (the user's own `foule.jpg`) out of git. `README.md`: question table, how the crowd
  picture works / how to use your own, how to play (Survie + Jokers, Équipes, which jokers where).
  `CREDITS.md`: every answer with its source (Wikipedia EN / FR, Wikiquote, AV Club episode
  pages), image origin. French titles that vary between sources (films, « Superman » series) are
  given in a neutral form. No app code changed. Imported into the dev DB for loicmoster@hotmail.fr
  (private, uploads in the main checkout's `apps/server/uploads`) and played once with a scripted
  socket game on :3034 (host + 3 phones, all 25 questions to the podium: right / wrong / typo /
  slider edge / partial ORDER and PIN results as expected, lies too close to the truth refused, own-lie
  vote refused, both drawings streamed and found, the PIN prompt carries the picture on every phone
  (fetched: HTTP 200) and never the zone, no truth / word in the guessers' prompts) — then the test
  game and its temporary host session were deleted.
- **Notes:** (1) `make-mosaic.ps1` needs Windows PowerShell (System.Drawing); changing its layout
  means updating the two zones. (2) The portraits are DC / Warner Bros characters (see T20): fine
  for private games. (3) Not tried on real phones.

### T35 — Content: « Halloween — les secrets les mieux gardés » (very hard, 25 questions)
- **Status:** done
- **Depends on:** — Content only; **runs in parallel with T34** (separate folder, different
  ports, different quiz title; both only add a section to this file).
- **Scope:** `content/quizzes/halloween/**` (`quiz.json`, media, `CREDITS.md`, `README.md`,
  `images/.gitignore` for a user picture). Reuses `quiz:import`; app code untouched.

**User requirement (2026-10-25):** a **really hard** quiz of **little-known facts** about
Halloween: **cultural traditions across the world, mysterious stories, witches**. **25
questions**, only these types: **choix multiple, réponse libre, curseur, ordre, point sur
l'image** (a picture with many characters, find a precise one), **« Mytho ! »**, **« Dessine-moi »**.

**Design (decided):**
- French, **very hard / little-known** (no « what do children say at the door »): origins
  (Samhain, Celtic and Christian calendars, the turnip lanterns before pumpkins, Stingy Jack),
  **the same night around the world** (Día de Muertos, Hungry Ghost Festival, Obon, Fèt Gede in
  Haiti, Pangangaluluwa, Allerheiligen, Kalan Goañv in Brittany, Dziady…), **mysterious stories
  and legends** (La Llorona, Baba Yaga, haunted places, famous hoaxes and unsolved cases),
  **witches** (Malleus Maleficarum, Salem, Pendle, Zugarramurdi, the last executions in Europe,
  real numbers of trials, the herbs and objects). Every fact checked against **reliable sources**
  (encyclopedias, museums, historians, academic or national sources — not listicles), listed in
  `CREDITS.md`; when sources disagree, ask about something they agree on. Fun tone despite the
  difficulty: a rebus, a « Qui a dit ? » (a historical or literary quote), a lighter question now
  and then.
- **Mix (25):** ~7 choix multiple (incl. one with several right answers), ~5 réponse libre (typo
  tolerance on, several accepted spellings), ~3 curseur (a year, a number of trials / victims, a
  weight…, with margin + unit), ~3 ordre (e.g. festivals by date in the year, witch trials in
  chronological order, traditions from oldest to newest), **2 point sur l'image** (same picture,
  two different characters to find), ~3 « Mytho ! » (obscure true answers), **2 « Dessine-moi »**
  (Halloween word lists: citrouille, chauve-souris, balai, chaudron, fantôme, squelette, toile
  d'araignée, chat noir, cercueil, crâne en sucre, chapeau de sorcière, momie…, ≥ 8 words each).
  Varied time limits and points (1000 / 2000), hard all along, a 2000-point finale.
- **The crowd picture (PIN):** use, in this order: (1) the **user's own picture** if they put
  one in `content/quizzes/halloween/images/` (kept out of git); (2) otherwise a **public-domain
  painting full of figures from Wikimedia Commons**, e.g. Pieter Bruegel the Elder, *The Triumph
  of Death* (c. 1562), Goya, *El Aquelarre* (1798), or a Bosch — reproduction of a 2D public
  domain work, check the Commons licence tag, credit it in `CREDITS.md`; a ≤ 1600 px wide copy is
  enough. The two characters to find must be precise and unambiguous (e.g. « le squelette qui
  joue de la vielle », « la chauve-souris »); compute and **check on the picture** that each one is
  inside its zone (`{ x, y, radius }` in picture fractions). The question text can tell the story
  of the painting.
- **README.md:** the question table (number, type, theme, time, points), the picture used and how
  to swap it, and a suggested way to play (e.g. « Équipes » for a Halloween party).
- **Import:** into the dev DB for `loicmoster@hotmail.fr` (private), then play it once with a
  scripted socket game (host + 3 phones: every type incl. the PIN on a phone — the phone prompt has
  the picture —, the bluffs and the drawings), then delete that test game.

- **Summary:** `content/quizzes/halloween/` — `quiz.json` « Halloween — les secrets les mieux
  gardés », exactly 25 questions, only the 7 allowed types: 7 QCM (rébus 🔥 + ⭕, « Qui a dit ? »
  Michelet, one with 3 right answers), 5 réponses libres (typo tolerance, 2–3 accepted spellings),
  3 curseurs (lunar month, 19 hanged at Salem ± 2, Houdini 1926 ± 3), 3 ordres (Toussaint →
  « trick or treat », festivals in the calendar, finale: 5 witch trials 1610 → 1782), 2 points sur
  l'image, 3 « Mytho ! » (cempasúchil, the Ankou, Giles Corey's « Plus de poids »), 2 « Dessine-moi »
  (11 creatures / 11 objects); 1000 / 2000 points (4 × 2000 incl. the finale), 20–90 s. No user
  picture was in `images/`, so the PIN picture (and cover) is Bruegel's _Le Triomphe de la Mort_
  (Prado, Commons `PD-Art` / `PD-old-100-expired`, resized to 1600 px): the hurdy-gurdy skeleton on
  the cart of skulls and the man in red-and-white checks under the table — both zones drawn and
  checked on the picture. `images/.gitignore` keeps any other picture out of git. `CREDITS.md`:
  the painting's credit and one source per answer (Wikipedia en/fr/de articles, Wikisource for
  Michelet, Folger for Macbeth, AFP/Africanews for the Fèt Gede); disputed facts avoided or
  reworded (Coligny calendar dropped; trick-or-treat's first print use is 1917, not 1927; Salem
  = 19 hanged; Logroño day not given). `README.md`: question table, the picture and how to swap
  it, how to play (Équipes for a party, Survie + Jokers with 3–4 hearts, where jokers work). No
  app code changed. Imported into the dev DB for loicmoster@hotmail.fr (private, 25 questions,
  media in the main checkout's `apps/server/uploads`, base URL :3001) and played once with a
  scripted socket game on :3035 (host + 3 phones, all 25 questions to the podium: right / wrong /
  typo / slider edge / partial PIN and ORDER results as expected, truth-as-lie refused
  `LIE_TOO_CLOSE`, own-lie vote refused, drawings relayed to the TV and guessed, both PIN prompts
  carried the picture, no answer, zone or right order in any phone prompt, report saved with 25
  questions) — then the test game and its temporary host session were deleted.
- **Notes:** the PIN zones are in picture fractions (the painting isn't square, so they are
  ellipses), re-check them if the picture is swapped. Not tried on real phones.

### T36 — Content: « Blind test d'Halloween » (25 film excerpts)
- **Status:** done
- **Depends on:** — Content only; can run in parallel with T34 / T35 (separate folder, ports
  3036 / 5236, different title).
- **Scope:** `content/quizzes/blind-test-halloween/**` (`quiz.json`, map picture, `CREDITS.md`,
  `README.md`, `audio/.gitignore`). Reuses `quiz:import`; app code untouched.

**User requirement (2026-10-25):** a blind test of **25 film music excerpts**, Halloween-themed
(witches, ghosts, monsters, Day of the Dead, autumn — not slasher horror), fairly hard, with
these question types only: **Buzzer, choix multiple, réponse libre, point sur l'image**.

**The 25 excerpts (chosen with the user — keep this list and this order):**
1. Hôtel Transylvanie (2012) — main theme — Mark Mothersbaugh
2. Le Magicien d'Oz (1939) — Ding-Dong! The Witch Is Dead — Harold Arlen & Yip Harburg
3. Wicked (2024) — Defying Gravity — Stephen Schwartz
4. The Rocky Horror Picture Show (1975) — Time Warp — Richard O'Brien
5. La Famille Addams (1991) — Addams Groove — MC Hammer
6. L'Étrange Noël de Monsieur Jack (1993) — Jack's Lament — Danny Elfman
7. Fantasia (1940) — Une nuit sur le mont Chauve — Moussorgski
8. Coco (2017) — Remember Me — Kristen Anderson-Lopez & Robert Lopez
9. Casper (1995) — Casper's Lullaby — James Horner
10. Le Fantôme de l'Opéra (2004) — The Phantom of the Opera — Andrew Lloyd Webber
11. Hocus Pocus (1993) — Main Title (score) — John Debney
12. Harry Potter et le Prisonnier d'Azkaban (2004) — A Window to the Past — John Williams
13. Kiki la petite sorcière (1989) — A Town with an Ocean View — Joe Hisaishi
14. Les Sorcières (1990) — Main Title — Stanley Myers
15. Le Château ambulant (2004) — Merry-Go-Round of Life — Joe Hisaishi
16. Sleepy Hollow (1999) — Main Titles — Danny Elfman
17. Coraline (2009) — Exploration — Bruno Coulais
18. La Légende de Manolo (2014) — main theme — Gustavo Santaolalla
19. Frankenstein Junior (1974) — Transylvanian Lullaby — John Morris
20. Dracula (1992) — Vampire Hunters — Wojciech Kilar
21. Le Crapaud et le Maître d'école (Disney, 1949) — The Headless Horseman — Bing Crosby
22. It's the Great Pumpkin, Charlie Brown (1966) — The Great Pumpkin Waltz — Vince Guaraldi
23. La Momie (1999) — main theme — Jerry Goldsmith
24. Twilight (2008) — Bella's Lullaby — Carter Burwell
25. Labyrinthe (1986) — Magic Dance — David Bowie

**Design (decided):**
- **One question per excerpt**, the sound playing during the question (`audio`, ~20 s, looped).
  Vary what is asked so it isn't 25 × « quel film ? »: the film, the composer / performer, the
  year (as a choice), the character, the country where the film takes place… Every fact checked
  (film credits, Wikipedia / official sources), listed in `CREDITS.md`.
- **Mix (25), only these types:** ~8 **Buzzer** (on réponse libre or choix multiple: « Buzzez et
  nommez le film ! » — best for the well-known excerpts), ~7 **choix multiple** (4 plausible
  choices: same era / same genre, so it stays hard), ~6 **réponse libre** (typo tolerance on,
  several accepted spellings: French and original titles, e.g. « Hôtel Transylvanie » /
  « Hotel Transylvania »), **4 point sur l'image** on **one world map** (« Écoutez ! Dans quel pays
  se déroule ce film ? »: e.g. Coco / Manolo → Mexique, Dracula / Frankenstein Junior →
  Transylvanie (Roumanie), La Momie → Égypte, Sleepy Hollow → État de New York; generous zones;
  only films with an unambiguous real place). Buzzer only on types that take it
  (`BUZZER_QUESTION_TYPES`), never on PIN. 1000 points, 2000 for the 5 hardest; 20–30 s.
- **Question texts never give the answer away**, and the excerpts must not either: for songs whose
  lyrics say the title (Ding-Dong!, Time Warp, Remember Me, Defying Gravity, Addams Groove,
  Magic Dance…), recommend an excerpt **before / without the title line**, or ask something else
  than the title for them (composer, performer, year, country).
- **Map:** a freely licensed world map from Wikimedia Commons (public domain or CC, credited in
  `CREDITS.md`), ≤ 1600 px wide, with no country names printed if possible (or the question must
  still be hard); zones computed and **checked on the picture**.
- **Music = placeholders** (copyright, like T23 / T33): `audio/01-hotel-transylvanie.mp3` …
  `audio/25-labyrinthe.mp3` (two-digit number + slug), `audio/.gitignore` keeps the user's files
  out of git. `CREDITS.md` + `README.md` list, for each file: the track, and a **recommended
  excerpt** (start time, ~20 s, avoiding the title lyrics). In `quiz.json`, `startSec` = that
  recommended start (best effort; the README explains: give full tracks and adjust `startSec` in
  `quiz.json` before re-importing, or give pre-cut excerpts and set `startSec` to 0).
- **README.md:** the question table (number, excerpt, type, what is asked, points), the list of
  the 25 MP3 files to add with their recommended excerpts, how to import, and how to play
  (e.g. « Équipes », buzzer judged by the host on the TV).
- **Import + test:** import for `loicmoster@hotmail.fr` (private). For the scripted test game
  (host + 3 phones: buzzer judged ❌ then ✅, typed answers, map pins — check the phones get the
  map), generate short **test tones** in place of the missing MP3s (like T33), then delete the test
  game and the test tones and **re-import without sound**, so the user's own files are used once
  they add them.

- **Summary:** `content/quizzes/blind-test-halloween/` — `quiz.json` « Blind test d'Halloween »,
  exactly 25 questions, one per excerpt in the spec's order, each with its sound during the
  question (`audio/NN-slug.mp3`, 20 s, looped): **8 buzzer** (1, 2, 5, 9, 10, 15, 22, 25 — 7 réponse
  libre + 1 choix multiple; 25 = 2000-point finale), **7 choix multiple** (4, 12, 13, 14, 17, 18,
  24), **6 réponse libre** (3, 6, 7, 16, 20, 21; typo tolerance, French + original spellings),
  **4 point sur l'image** on one world map (8 Coco → Mexique, 11 Hocus Pocus → Salem, 19
  Frankenstein Junior → Transylvanie, 23 La Momie → Égypte). What is asked varies: film, composer,
  performer / singer, director, year (Rocky Horror 1975 vs the 1973 stage show), character (which
  witch died), the heroine's job, the actress, a US state (Twilight: Washington vs Oregon where it
  was filmed), country / city; no text gives the answer. 1000 points, 2000 for 12, 17, 18, 21, 25;
  20–30 s. Map: Commons « World location map (equirectangular 180) » (TUBS, CC BY-SA 3.0, borders,
  no names), 1600 × 800 JPEG, also the cover; zones computed from lon / lat and checked drawn on the
  picture. `README.md`: question table, the 25 files with their recommended excerpts (before the
  sung title for Time Warp, Defying Gravity, Addams Groove, Magic Dance, organ intro for the
  Phantom…), how to adjust `startSec`, import, how to play. `CREDITS.md`: the files + excerpts, the
  map credit + zone maths, every answer with its source (Wikipedia film / soundtrack pages,
  AFI, Sony, Classic FM, Tampa Bay Times for the Razzie…). `audio/.gitignore` keeps the user's
  music out of git. No app code changed. Imported for loicmoster@hotmail.fr (private) with 25
  generated test tones, played once with a scripted socket game on :3036 (host + 3 phones, all 25
  questions to the podium: every buzzer judged ❌ then ✅ with `BUZZER_TAKEN` checked, typed answers
  with a missing letter / lower case without accents accepted, map pins in / near (partial) / far,
  phones got the map URL and never an answer, zone or sound, report saved with 25 questions) — then
  the test game, its temporary session, the tones and their uploaded copies were deleted and the
  quiz re-imported without sound (25 questions, 0 sounds).
- **Follow-ups:** (1) add the 25 MP3s listed in `README.md` and re-run the import; check the
  excerpt starts (`startSec`, all 0 except Jack's Lament at 5 s — best effort, depends on the
  version) so no sung title gives the answer away. (2) The map is CC BY-SA: keep the credit if the
  quiz is ever made public.

### T37 — Answer explanations + « select all » multiple-answer questions (run alone)
- **Status:** done
- **Depends on:** — (everything merged). Touches shared, server, editor, TV, phones, reports, DB.
- **Ports:** server 3037 / web 5237, test DB `lbq_test_t37`, e2e DB `lbq_e2e_t37`.

**User requirements (2026-10-25):** (1) when the answer is revealed, show **more information /
an explanation** about it. (2) For a choix multiple with **several right answers**, the player
must **select every answer they think is right, then validate**; only the **exact set of right
answers** wins the points, anything else is wrong (no points).

**Design (decided — note any deviation below):**
- **Explanation** — optional `explanation` (≤ 300 characters, trimmed; empty = none) on **every
  question type** (`questionBase`). Editor: a textarea « 💡 Explication (affichée après la
  réponse) » under the question, with a counter. Shown **only from REVEAL**: in `question:reveal`
  (TV) and `player:result` (phones) — **never** in `question:show` / `question:prompt` (it usually
  gives the answer away). TV: a « 💡 Le saviez-vous ? » card under the revealed answer (readable from
  the sofa, appears after the reveal animation; also after a host reload in REVEAL). Phone: the
  same text, smaller, on the result screen (scrollable if long). Saved in the report
  (`QuestionResult`) and shown on each question card of `/reports/:gameId`. Prisma: nullable
  column on `Question` + snapshot on `QuestionResult` (migration). Works with the import script
  (`quiz.json` field), copies / duplicates and the library.
- **« Select all » multiple answers** — applies automatically to an MCQ with **2 or more correct
  choices** (no new editor option; single-answer MCQ, TRUE_FALSE and POLL are unchanged: one tap
  answers). Editor: a hint when 2+ choices are ticked: « Plusieurs bonnes réponses : les joueurs
  devront toutes les cocher pour marquer ». Phone: the shape buttons become **toggles** (selected =
  check mark + outline), a hint « Plusieurs réponses possibles — coche toutes les bonnes », and a
  « Valider » button (disabled until at least one is selected); the answer is sent on « Valider »
  (speed points from that moment). Contract: `question:prompt.multiple?: true` (tells the phone to
  toggle — it reveals that there are 2+ right answers, like Kahoot's « select all », but never which
  ones nor how many); `player:answer` gains `choiceIndexes: number[]` (MCQ with `multiple` only; a
  single `choiceIndex` → `INVALID_PAYLOAD` there, and `choiceIndexes` on another question →
  `INVALID_PAYLOAD`). Scoring: correct **only if the selected set equals the set of correct
  choices** (no partial points), then the usual time points, streak, team averages, « Survie »
  heart. Reveal: `distribution` counts every selected choice (a player can count in several bars);
  the TV also shows « n joueurs ont tout trouvé ». Phone result: « Il fallait cocher : … » with the
  right shapes when wrong. TV during ANSWERING: « Plusieurs réponses possibles » under the question.
- **Interactions:** Jokers — 🎯 50/50 hides wrong choices as usual (still ≥ 1 left); 🦜 Copieur
  copies the whole selection; 🌀 Brouilleur's grey scrambled buttons become toggles too; ✖️2 Double
  ou rien / ⏳ Sablier as usual. Buzzer — unchanged (answer said out loud, host judges). Pause /
  rejoin — a phone that reloads gets `multiple` again (selection not kept, fine). Reports / CSV:
  the selection is counted in the distribution like the TV.
- **Docs:** PLAN.md §3 (scoring rule), §4 (contract), §5 (DB). The 3 existing multiple-answer
  questions (Harry Potter Q5, Halloween Q3, Batman Q15) switch to the new rule automatically.

**Tests:** shared schema (explanation length / optional, `choiceIndexes`), server (explanation
never in show / prompt, present in reveal + result + saved stats; multiple: exact set right,
subset / superset / wrong → 0, single `choiceIndex` refused, speed points from the validation,
jokers 50/50 + Copieur + Brouilleur, team / Survie, rejoin), editor draft (explanation round trip,
hint), phone reducer (toggles, validate); e2e: a multiple-answer question where one phone selects
the exact set (correct) and another a subset (wrong), then the explanation on the TV, the phones and
the report.

- **Summary:** shared (`quiz.ts`): `questionBase.explanation?` (≤ `EXPLANATION_MAX_LENGTH` 300,
  trimmed), helpers `questionExplanation(q)` (blank = none) and `isMultipleAnswer(q)` (MCQ with 2+
  right choices, not au buzzer). Contract (`events.ts`, additive): `player:answer` /
  `AnswerInput` gain `choiceIndexes` (1–4 indexes), `question:prompt.multiple?` and
  `question:show.multiple?`, `question:reveal.explanation?`, `RevealDetails.multiple { allFound }`,
  `player:result.multiple { correctIndexes, yours? }` + `explanation?`; `api.ts`
  `GameQuestionReport.explanation?`. Server (`Game.ts`): `judgeMultiple` (exact set → time points,
  else 0; duplicates / unknown index / single `choiceIndex` → `INVALID_PAYLOAD`, `choiceIndexes`
  on another question → `INVALID_PAYLOAD`), `Answer.choiceIndexes`, every ticked choice counted in
  `distribution`, explanation only in the reveal / results (both resyncs re-send them) and in
  `QuestionStats.explanation`. Jokers needed no change (50/50 hides wrong choices, Copieur replays
  the `AnswerInput`, Brouilleur effect unchanged). DB: migration `20261025120000_explanations`
  (`Question.explanation`, `QuestionResult.explanation`), mapped in `quizzes.service.ts` (so the
  import script, copies, duplicates and the library keep it) and returned by `/api/games/:id`.
  Editor: « 💡 Explication (affichée après la réponse) » textarea with a counter under the
  question, « ☑️ Plusieurs bonnes réponses : les joueurs devront toutes les cocher pour marquer »
  hint (`isMultipleAnswerDraft`). Phone (`player/multiAnswer.tsx`): toggles with ✓ + white ring
  (grey text buttons with a Brouilleur, 50/50 empty slots), « Plusieurs réponses possibles — coche
  toutes les bonnes », « Valider (n) » disabled until one is ticked (reducer `toggleChoice` /
  `selectedChoices`, store `toggleChoice` / `validateChoices`), « Réponse envoyée ! » with the
  ticked shapes, result « Il fallait cocher : … » and « 💡 Le saviez-vous ? » (result screens now
  scroll). TV: « ☑️ Plusieurs réponses possibles » while answering, « n joueurs ont tout trouvé »
  under the bars, « 💡 Le saviez-vous ? » card after the reveal animation (instant after a reload,
  every type). Reports: explanation on each question card, « n joueur(s) ont tout coché juste ».
  PLAN.md §3–§5. Tests: `Game.multiple.test.ts` (13: no explanation before the reveal / in reveal,
  result, stats, typed type, host resync; prompt / show `multiple`; exact / subset / superset /
  wrong; refused payloads; speed points from the validation + streak; rejoin; teams; Survie;
  50/50, Copieur, Brouilleur), persistence (explanations round trip + saved report with the
  « select all » count, Postgres), shared schema tests, `draft.explanation.test.ts`,
  `playerState.multiple.test.ts`; e2e `e2e/explanations.spec.ts` (editor field + hint, Alice exact
  set → correct, Bob a subset → wrong, no explanation in phone frames before the reveal, TV /
  phones / host reload / report). Checked with screenshots (host 1600×900, Pixel 7).
- **Notes:** (1) The TV gets `multiple` in `question:show` too (for its hint). (2) A refused
  « Valider » keeps the ticks; a reload loses them (as specified). (3) CSV unchanged (it only
  lists the ranking). **After merging, run `pnpm --filter @lbq/server db:migrate`.** Not tried on
  real phones.

### T38 — Content: « Halloween animé — dessins animés & séries » (very hard, 30 questions, a picture each)
- **Status:** in-progress (T38 agent)
- **Depends on:** — Content only (+ one small change to the import script, see below).
- **Ports:** server 3038 / web 5238, test DB `lbq_test_t38`.
- **Scope:** `content/quizzes/halloween-anime/**` (`quiz.json`, free pictures, `CREDITS.md`,
  `README.md`, `images/.gitignore`), `apps/server/scripts/quizImport.ts` (+ its test) for the
  missing-picture rule only.

**User requirement (2026-10-26):** a Halloween quiz focused on **cartoons, animation and TV
series**, **30 questions**, **fun but very hard**, **a picture to illustrate every question**. If a
picture can't be downloaded legally, write the question anyway and tell the user which picture to
add.

**Design (decided):**
- French, **very hard** (expert details, not « what is Scooby-Doo's dog called »): Halloween
  episodes and specials, and spooky animated films and series. Pick from, for example: _The
  Simpsons_ « Treehouse of Horror » (segments, numbers, the credit gags), _It's the Great Pumpkin,
  Charlie Brown_, _Scooby-Doo_ (villains unmasked, the original 1969 series, the sidekicks),
  _Courage the Cowardly Dog_, _Gravity Falls_ (« Summerween »), _Over the Garden Wall_, _Adventure
  Time_, _Hilda_, _Danny Phantom_, _Les Razmoket_ / _Rugrats_, _SpongeBob_, _Phineas et Ferb_,
  _Les Griffin_, _South Park_, the Addams family (animated 1973 / 1992, _Wednesday_ 2022),
  _Buffy_, _Charmed_, _Sabrina_ (1996 and 2018), _Stranger Things_, _Chair de poule_ /
  _Goosebumps_, _Fais-moi peur !_ / _Are You Afraid of the Dark?_, _La Petite Boutique des
  horreurs_… plus the history of animation (Disney's _The Skeleton Dance_ 1929, the Fleischer _Betty
  Boop_ ghosts, _Casper_ in 1945, _Le Crapaud et le Maître d'école_), and French dubs / creators /
  voices. Fun tone: an emoji rebus, a « Qui a dit ? » quote, lighter questions between hard ones.
  Every fact checked against reliable sources (Wikipedia en / fr, the series' wikis cross-checked,
  credits, interviews), listed in `CREDITS.md`; when sources disagree, ask about something else.
- **Types (30):** varied and fun — ~9 choix multiple (incl. one « select all » with several right
  answers), ~2 vrai / faux, ~6 réponse libre (typo tolerance, several spellings: French and
  original titles / names), ~3 curseur (year, episode number, count…), ~3 ordre, ~2 point sur
  l'image, ~3 « Mytho ! », ~2 « Qui de nous ? » / sondage for fun breaks (no points). **No
  « Dessine-moi »** (it can't have a picture). 1000 points, 2000 for the 5–6 hardest, a
  2000-point finale; 20–45 s.
- **Explanation on every question** (`explanation`, ≤ 300 characters): a sourced « 💡 Le
  saviez-vous ? » (behind-the-scenes fact, origin of the gag…), its source in the `CREDITS.md`
  « Le saviez-vous ? » table, as in `content/quizzes/halloween/CREDITS.md`.
- **A picture on every question** (`imageUrl`), which must **never give the answer away** (use
  `imageEffect` blur / zoom / pixelate when the picture is the clue, at least 6 questions). Pictures
  of series and cartoons are copyrighted (Disney, Warner, Fox, Nickelodeon, Netflix…), so:
  1. **Free pictures first:** Wikimedia Commons public domain or CC — public-domain cartoons
     (e.g. _The Skeleton Dance_ 1929, Fleischer cartoons whose copyright expired — check the
     Commons licence tag), CC photos of creators / voice actors / cosplay at conventions, houses
     and places of shoots, PD paintings, Halloween photos (pumpkins, costumes…). Copy ≤ 1600 px
     into `images/`, credit author + licence in `CREDITS.md`.
  2. **Otherwise a placeholder** (like the music of T23 / T33): the question is fully written with
     `imageUrl` = `images/<nn>-<slug>.jpg`, the file isn't in the repo (`images/.gitignore` keeps the
     user's files out of git, except the free ones you add — list them in it), and `README.md` has a
     **« Images à ajouter »** table: file name, question, exactly what the picture should show
     (e.g. « une capture de Bart en costume dans le générique de Treehouse of Horror V »), and
     whether it gets an effect. Prefer free pictures; placeholders only where no free picture fits.
  - **PIN questions** need a picture that exists: use free pictures for them (e.g. a crowd
    painting, a convention photo, a map), never placeholders.
- **Import script change:** today a missing picture is an error. Make it like a missing sound: a
  **missing picture → warning, the question is imported without it** (and without its
  `imageEffect`); still an error for a PIN question (picture required) and for the cover. Unit
  test in `scripts/quizImport.test.ts`. Note it under « Contract changes / cross-task notes ».
- **README.md:** question table (number, type, theme, picture, points), « Images à ajouter »,
  how to import / re-import once the pictures are added, how to play (e.g. « Équipes » for a
  party, « Survie + Jokers »).
- **Import + test:** import for `loicmoster@hotmail.fr` (private), play it once with a scripted
  socket game on :3038 (host + 3 phones, every type, the PIN prompt carries the picture, no answer
  / explanation in any phone prompt, explanations in the results), then delete the test game and
  its temporary session.

### Wave 7 coordination — T39 ‖ T40 run in parallel (read before starting)
- **T39 = host remote** (new phone page + server pairing), **T40 = TV themes** (styling of the TV
  screens + a quiz field). Overlap is small; keep it that way:
  - `packages/shared/src/events.ts`: both only **add** (T39: remote events / `GamePause.byHost?`;
    T40: `GameStatePayload.theme?`, `HostCreatePayload.theme?`).
  - `apps/web/src/host/HostPage.tsx`: T39 only adds the « 📱 Télécommande » button + dialog and
    the handler of relayed TV controls (new files `host/remote*.tsx`); T40 only wraps the page in
    the theme (new files `apps/web/src/themes/**`). Don't restyle what the other task adds.
  - T40 owns the look of the TV screens (`host/screens.tsx` and friends); T39 doesn't restyle them.
  - Only T40 adds a migration (`Quiz.theme`); T39 needs none (pairing lives in memory).
- Ports: T39 3039 / 5239, T40 3040 / 5240; test DBs `lbq_test_t39` / `lbq_test_t40`, e2e DBs
  `lbq_e2e_t39` / `lbq_e2e_t40`. Shared Postgres, never `docker compose down`.

### T39 — Host remote on the phone (« Télécommande »)
- **Status:** in-progress (T39 agent)
- **Depends on:** — (everything merged). Runs in parallel with T40 (see « Wave 7 coordination »).
- **Scope:** `packages/shared/src/events.ts` (additive), `apps/server/src/game/**` +
  `apps/server/src/socket/**` (pairing, remote room, manual pause), new `apps/web/src/remote/**`
  (route `/remote/:pin` in `main.tsx`), new `apps/web/src/host/remote*.tsx` + small hooks in
  `HostPage.tsx` / `useHostGame.ts`, PLAN.md §2 / §4 / §7, e2e.

**User requirement (2026-10-27):** control the game from the host's own phone — next, pause,
buzzer ✅ / ❌, see the answer secretly — so the host doesn't have to stand next to the PC.

**Design (decided — note any deviation below):**
- **Pairing (safe in a room full of players):** the TV header gets a « 📱 Télécommande » button →
  a dialog with a big QR code + link `<origin>/remote/<PIN>#<remoteToken>` (the token in the
  fragment, never sent in HTTP requests / logs) and « Fermer ». The QR is **only shown on
  demand**, never in the lobby by default. `remoteToken` = random 24 bytes, separate from the
  `hostToken` (created lazily by `host:remote` `{ pin, hostToken }` → ack `{ remoteToken }`).
  « Déconnecter la télécommande » in the same dialog revokes it (new token, the paired phones get
  `remote:revoked` and show « Télécommande déconnectée »). Several remotes may be paired (rare,
  fine). The token is kept in the phone's `localStorage` per PIN so a reload / lock reconnects.
  Works for logged-in and anonymous (demo) hosts.
- **Remote socket:** `remote:join` `{ pin, remoteToken }` → ack `{ ok }` + a full resync like
  `host:rejoin`. A remote joins the host room (gets `question:show`, `answer:count`,
  `question:reveal`, `leaderboard`, `lobby:players`…) plus a remote-only room
  `game:<PIN>:remote`. **A remote never counts as the host screen**: the TV still has to be
  connected (`hostMissing` pause unchanged). Every host action (`host:start`, `host:next`,
  `host:end`, `host:kick`, `host:resume`, `host:judge`, `host:moveplayer`, `host:shuffle`) accepts
  either the `hostToken` or a valid `remoteToken` (one small auth helper, zod-validated: a payload
  carries `hostToken` **or** `remoteToken`).
- **The answer, secretly:** `remote:answer` (remote room only, never the TV nor the phones) sent
  at each `QUESTION_INTRO` (and in the resync): the right answer in words for every type that has
  one — reuse / extend `buzzerAnswer` into a general `answerText(q)` in shared (MCQ / vrai-faux
  choices, accepted answers, slider value ± margin + unit, order, PIN « zone : … » (a small picture
  with the zone), Mytho = the truth, Dessine-moi = the word); types without a right answer → none.
  Plus the explanation, so the host can read it out. On the remote it's hidden behind « 👁 Voir
  la réponse » (press and hold, or tap to toggle) so players looking over the shoulder don't see
  it by accident.
- **Manual pause:** new `host:pause` `{ pin, hostToken | remoteToken }` during QUESTION_INTRO /
  ANSWERING: pauses like the automatic pause (timer frozen, answers refused `GAME_PAUSED`,
  `responseMs` excludes it, sound clip paused) with `paused.byHost: true`; « ▶ Reprendre » =
  `host:resume` → the usual 3-2-1. Available from the TV too (« ⏸ Pause » button next to « Passer »).
  If players are also missing, the pause stays until they're back or excused (existing rules).
  TV / phones overlay: « ⏸ Pause demandée par l'animateur ».
- **Remote screen (portrait, French, big buttons, one hand):** header PIN + phase + timer; one
  big main button that does the right thing for the phase (« ▶ Commencer » / « ⏭ Passer » /
  « Suivant » / « Voir le podium » / « Terminer »), « ⏸ Pause » / « ▶ Reprendre »; the current
  question text + type + `answer:count` (« 4 / 6 ont répondu »); « 👁 Voir la réponse »; buzzer:
  holder's avatar + name + big ✅ / ❌ (vibration when someone buzzes); during a pause: who is
  missing + « Continuer sans… » + « Exclure »; lobby: the player list (tap → exclure / changer
  d'équipe), « Mélanger » in team mode; leaderboard: top 5; « Terminer la partie » behind a
  confirmation. **TV controls relayed** to the TV (`remote:tv` `{ action: 'mute' | 'unmute' |
  'replay' }` → `tv:control` to the host room only): 🔇 son de la TV, ↻ rejouer l'extrait.
  Wake lock like the player phone. « Reconnexion… » banner.
- **TV:** small « 📱 Télécommande connectée » indicator in the header when a remote is paired;
  a toast when it connects / disconnects. The TV buttons keep working (both can be used).

**Tests:** server (pairing ack, wrong / revoked token refused `UNAUTHORIZED`, every host action
with a remote token, remote doesn't count as host — TV drop still pauses, `remote:answer` only
in the remote room and never in any player / TV payload, answer text per type, manual pause:
timer frozen / answers refused / same points / resume countdown / pause + missing player,
resync); shared (`answerText` per type, payload schemas); web (remote reducer, main-button
mapping per phase, token storage); e2e: TV opens the remote dialog → a phone context opens the
link → starts the game, sees the answer, pauses / resumes, judges a buzzer ✅, goes to the
podium, while a player phone plays (and its frames never contain the answer).

### T40 — TV themes (Halloween, Noël, Rétro…)
- **Status:** in-progress (T40 agent)
- **Depends on:** — (everything merged). Runs in parallel with T39 (see « Wave 7 coordination »).
- **Scope:** new `apps/web/src/themes/**`, host screens' styling (`apps/web/src/host/**` except
  T39's new files), light touches on the phone (`apps/web/src/player/**` lobby / waiting screens),
  `components/StartGameDialog.tsx`, the editor quiz form (theme picker), `lib/gameOptions.ts`,
  `apps/web/public/sounds/**` + `scripts/generate-sounds.mjs`, `packages/shared` (`quiz.ts`
  `theme`, `events.ts` additive), `apps/server` (migration `Quiz.theme`, quiz service,
  `host:create`, `game:state`), the 4 Halloween / Batman quiz.json `theme` fields, PLAN.md.

**User requirement (2026-10-27):** TV themes — Halloween, Christmas, retro… — the colors, the
background, the music and the confetti follow the quiz.

**Design (decided — note any deviation below):**
- **Themes** (`QuizTheme` in shared): `classic` (today's look, default), `halloween`, `christmas`
  (« Noël »), `retro` (80s arcade), `space` (« Espace ») — one file each in
  `apps/web/src/themes/`, same shape: CSS variables (background gradient, panel color, accent,
  text, timer ring), a display font (bundled locally — `@fontsource/*` or files in `public/`,
  **no external CDN**, OFL / free licence noted in CREDITS), a **background layer** (light
  CSS / SVG animation, ≤ 30 particles: Halloween = drifting fog + a few bats + flickering
  pumpkins; Noël = falling snow + garland lights; Rétro = pixel grid + scanlines + neon sun;
  Espace = twinkling stars + a slow planet), **confetti shapes** (pumpkins / bats, snowflakes /
  stars, pixel squares, stars), **sounds** (lobby music loop + podium fanfare + reveal sting per
  theme, synthesized CC0 by `generate-sounds.mjs` like T10 — spooky organ / sleigh bells /
  chiptune / synth pad — listed in `public/sounds/CREDITS.md`), and a lobby title decoration
  (e.g. « 🎃 » / « 🎄 » / pixel frame).
- **Never themed:** the 4 answer colors and shapes (red ▲, blue ◆, yellow ●, green ■ — they must
  match the phones), readability (contrast checked on every screen, the question text stays
  big and plain), the explanation card and the scoring. Animations respect
  `prefers-reduced-motion` and stay cheap for a low-end TV (CSS transforms / opacity only, no
  canvas loop when the tab is hidden).
- **Choosing it:** `Quiz.theme` (default `classic`, migration; `QuizInput.theme?` absent =
  unchanged / `classic` on creation; kept by copies, duplicates, library, import script). Editor:
  « Thème de la TV » picker with a small live preview card per theme. Start dialog: « Thème :
  celui du quiz (Halloween) / … » override → `&theme=` in `/host/new` → `host:create.theme?`. The
  server resolves (override or the quiz's theme) and sends `theme` in `game:state` (all clients,
  re-sent in both resyncs). Library cards show the theme as a small badge.
- **Phones:** only the lobby / « get ready » / waiting / podium backgrounds and the accent color
  follow the theme (the answer buttons never change); the podium confetti uses the theme's shapes.
- **Content:** set `theme` in `quiz.json` of the 3 Halloween quizzes (`halloween`, `halloween-anime`
  if merged, `blind-test-halloween`) → `halloween`, and re-import them for loicmoster@hotmail.fr;
  others stay `classic`.
- **Tests:** shared schema (theme default / unknown refused), server (`host:create` override vs
  quiz theme, `game:state.theme`, resyncs, persistence round trip + copy keeps it), web (theme
  registry: every theme defines every variable / sound / confetti, `gameOptions` URL parsing,
  reducers), e2e: launch a quiz with the Halloween theme (TV has the theme class / background, the
  lobby music file is the Halloween one, answer buttons keep their colors), override to Noël in the
  dialog, phone lobby follows. Screenshots of every theme on the lobby, a question, the reveal and
  the podium (host 1600×900, Pixel 7) — check contrast.

- **Later ideas (not specified):** AI-generated quizzes (T17); « Duel » question between the two
  leaders; seasonal themes/skins for the TV; spectator mode on a second screen.

---

## Contract changes / cross-task notes
_(Append here: date, agent, what changed in `packages/shared` or outside your scope, why.)_

- 2026-10-20, main agent (T0): players receive `question:prompt` instead of `question:show`
  (one event name = one payload type, needed for typed Socket.IO). `game:state` carries
  `remainingMs` instead of `endsAt` (avoids phone clock skew). All acks use
  `Ack<T>` = `{ ok: true, ...T } | { ok: false, error: { code, message } }`. PLAN.md §4 updated.
- 2026-10-20, T1 (no contract change), behaviour notes for T2/T3: join is LOBBY-only
  (`GAME_ALREADY_STARTED` afterwards); nicknames are unique case-insensitively; after
  `player:rejoin` the server re-sends `game:state`, plus `question:prompt` only if ANSWERING
  *and* not yet answered, `player:result` if REVEAL, `podium` if PODIUM. `answer:count.total`
  counts connected players (+ those who already answered). The last `player:answer` can
  trigger REVEAL events *before* its ack arrives — clients should not rely on that order.
  Ranks are competition ranks (ties share a rank).
- 2026-10-20, T5 agent: **added** (no existing type changed) `packages/shared/src/api.ts`
  (REST bodies/responses, `ApiErrorBody`), exported from the index. Outside T5 scope:
  `apps/server/src/index.ts` registers the API (`registerApi`) and CORS (HTTP + Socket.IO)
  now sends `credentials: true`; new `apps/server/src/db.ts` + `config.ts`;
  `apps/server/package.json` scripts (`postinstall`/`typecheck` run `prisma generate`,
  `db:*`); root `pnpm-workspace.yaml` `onlyBuiltDependencies` (prisma, esbuild);
  `docker-compose.yml`, `.env.example`, CLAUDE.md commands. PLAN.md §5 adds `Session` and
  `GameSession.quizTitle`/nullable `quizId`; §6 documents auth + error format.
- 2026-10-20, T7 agent (no event payload changed): `host:create` now authenticates the host from
  the socket handshake (`lbq_session` cookie, or `auth: { token }` for non-browser clients) —
  PLAN.md §4/§5 updated. Outside the T7 scope: `apps/server/src/index.ts` passes
  `createPrismaPersistence(prisma)` to `registerSocketHandlers` (signature is now
  `(io, { games?, persistence? })`); new `apps/server/vitest.config.ts` (`fileParallelism:
  false`) because `api.test.ts` and `game/persistence.test.ts` share and wipe the same
  `TEST_DATABASE_URL` database.
- 2026-10-20, T6 agent (outside T6 scope, no contract change): **fix** in
  `apps/server/src/index.ts` — `@fastify/cors` 11 only allows `GET,HEAD,POST` by default, so the
  browser blocked the editor's `PUT /quizzes/:id` and `DELETE /quizzes/:id` preflights; CORS now
  lists `methods: GET, HEAD, POST, PUT, DELETE`. Also added an "Espace animateur : mes quiz"
  link to `/editor` on the landing page (`apps/web/src/Home.tsx`) and the `/login` + `/register`
  routes in `main.tsx` (PLAN.md §7 updated). Note: the shared dev database `lbq` had no
  migration applied yet; T6 tested on `lbq_test_t6` only.
- 2026-10-20, T11 agent: as decided in wave 3, `PlayerResultPayload` gains `streak` and
  `streakBonus` (included in `pointsEarned`); PLAN.md §3 (streak rule) and §4 updated. Any code
  building a `PlayerResultPayload` (test fixtures) must now set both fields.
- `apps/web/src/main.tsx` is touched by T2, T3, T6 (one route line each) — expect trivial
  merge conflicts there; keep both sides.
- 2026-10-20, main agent (post-merge fix): `tsx watch` hangs before listening when run under
  `pnpm --parallel` (root `pnpm dev`) on Windows → server `dev` script is now
  `node --watch --env-file-if-exists=../../.env --import tsx src/index.ts`. Don't switch back.
  Host screen `/host/new` now times out after 8 s with a "server not reachable" message +
  retry button instead of spinning forever.
- 2026-10-20, T8 agent (no contract change). Outside T8 scope: `apps/web/vite.config.ts`
  (`define: { __LAN_HOSTS__ }`, LAN IPv4 detection for the QR code) and `apps/web/package.json`
  + `pnpm-lock.yaml` (deps `qrcode.react`, `nosleep.js`). In `host/` only `screens.tsx`
  (`LobbyScreen`) and the new `host/joinUrl.ts` were touched.
- 2026-10-20, T4 agent: root `package.json` gets devDeps `@playwright/test` and
  `@lbq/shared` (the e2e test reads `DEMO_QUIZ` for the correct answers), scripts `test:e2e`
  and `typecheck` (`… && tsc -p e2e`). Behaviour note: the last player's answer triggers
  REVEAL immediately, so that phone may skip the "Réponse envoyée !" screen — expected, not
  a bug.
- 2026-10-20, main agent (post-merge, wave 2): fixed T7 follow-up (1) — `reconnectSocket()` in
  `apps/web/src/lib/socket.ts`, called by `AuthProvider` after login/register/logout, so
  `host:create` sees the new session. Verified in a browser: login → "Lancer" on a DB quiz →
  lobby with PIN. Dev database `lbq` migrated + seeded (demo@lebonquizz.local / demo1234).
- 2026-10-20, T19 agent: **added** client event `host:rejoin` (payload `HostActionPayload`, ack
  `Ack`) in `packages/shared/src/events.ts`, as decided in the wave 3 coordination; PLAN.md §4
  (resync contents) and §5 (abandoned games, kicked players in saved results) updated. No other
  shared type changed; no file outside the T19 scope touched.
- 2026-10-20, T12 agent: the per-question report needed data that was never saved, so outside
  the T12 scope (all additive): Prisma model `QuestionResult` + migration
  `20261020200000_question_results`; `Game.questionStats` filled in `enterReveal` (small block in
  `apps/server/src/game/Game.ts`, T11/T19 may conflict there — keep both); `GameRecord.questions`
  saved by `persistence.ts`; `games.routes.ts` returns `winner` and `questions`. Shared
  (`api.ts`, additive): `GameSummary.winner`, `GameQuestionReport`, `GameReport.questions`.
  PLAN.md §5/§6/§7 updated. **After merging, run `pnpm --filter @lbq/server db:migrate`** on the
  dev DB. The migration was NOT applied to the shared `lbq` database (it would look like drift to
  the other wave-3 worktrees); T12 tested on `lbq_t12` / `lbq_test_t12`.
- 2026-10-20, T9 agent (no contract change). Outside the T9 scope: `apps/server/src/index.ts`
  (`trustProxy` via `TRUST_PROXY`, serves the web build when `WEB_DIST_DIR` is set, SIGINT/SIGTERM
  shutdown), new `apps/server/src/{web,web.test,instrument}.ts` + `build.mjs`;
  `apps/server/package.json` (`build`/`start` scripts, `prisma` moved to dependencies for
  `migrate deploy` in the image, deps `@sentry/node`, `esbuild`); web: new
  `apps/web/src/lib/serverUrl.ts` used by `api/index.ts` and `lib/socket.ts` (**a production
  build now defaults to `location.origin`**, dev unchanged), `lib/sentry.ts` imported first in
  `main.tsx` (one line), dep `@sentry/react`; root `package.json` (`format:check`),
  `.prettierignore` (`**/src/generated`); ran `pnpm format` on 4 files that failed the new CI
  check (`README.md`, `.vscode/settings.json`, `e2e/full-game.spec.ts`,
  `game/persistence.test.ts`) — trivial merge conflicts possible with T19, keep their side and
  re-run `pnpm format`. PLAN.md §9 (production) added; README + CLAUDE.md commands updated.
- 2026-10-20, T15 agent: team mode contract as decided in the T15 section (PLAN.md §3–§7
  updated), plus additions: error code `TEAMS_NOT_READY`; types `RankedTeam`, `StandingsPayload`,
  `LobbyTeamsPayload`, `HostMovePlayerPayload`, `PlayerTeamPayload`; `GameStatePayload.mode` is
  **required** (test fixtures building a `GameStatePayload` must set it); `LEADERBOARD_SIZE` 5 → 15,
  `MAX_PLAYERS_PER_GAME` 200 → 30. API (`api.ts`): `GameSummary.mode`, `GameReportRow.teamId`,
  `GameReport.teams` (`GameTeamReport`). Prisma migration `20261020201734_teams`.
  `editor/hostUrl.ts` moved to `web/src/lib/gameOptions.ts`.
- 2026-10-20, T10 agent (no contract change, no server change). Outside the listed T10 scope:
  new `apps/web/scripts/generate-sounds.mjs` (generator of the CC0 sound files, kept out of
  `public/` so it isn't shipped). `hostReducer` gained `previousLeaderboard` / `leaderboardFor`.
- 2026-10-21, T14 agent: question types contract as decided in the T14 section (PLAN.md §3–§6
  updated). `QuestionSchema` is now a zod discriminated union — code reading `q.choices` must
  narrow on `type` first (`isChoiceQuestion` / `choiceTexts` in shared). `QuestionShowPayload.type`,
  `QuestionPromptPayload.type`, `QuestionRevealPayload.type` and `GameQuestionReport.type` /
  `answerCount` / `details` are **required** (test fixtures must set them); `choiceCount` is now
  optional. `PlayerAnswerPayload` is a union (`choiceIndex` | `text` | `value`). Prisma migration
  `20261021173853_question_types`. `DEMO_QUIZ` has 7 questions (3 new types).
- 2026-10-21, T16 agent (REST only, no socket event changed): `QuizInput.visibility?`,
  `QuizDetail.visibility`, `QuizSummary.visibility` + `playCount` are **required** in responses
  (fixtures building a `QuizDetail` / `QuizSummary` must set them); new `LibraryQuery`,
  `LibraryQuiz`, `QuizVisibility`. `host:create` now also accepts other hosts' public quizzes
  (PLAN.md §4–§7 updated). Prisma migration `20261021190357_quiz_visibility`. Outside the T16
  scope: `playwright.config.ts` (`E2E_DATABASE_URL` → migrate + server `DATABASE_URL`),
  `.github/workflows/ci.yml` (Postgres service for the e2e job), README e2e paragraph; one link
  in `EditorShell.tsx` and one route in `main.tsx`.
- 2026-10-21, T20 agent: avatars contract as decided in the T20 section (PLAN.md §4–§6 updated),
  plus: new client event `player:avatars` `{ pin }` → `Ack<{ taken: AvatarId[] }>` (join-screen
  hint), `closest.avatar?` in `RevealDetails`, type `LobbyMember` (`lobby:players` items /
  `lobby:teams` members). `RankedPlayer.avatar`, `LobbyMember.avatar`, the join/rejoin ack
  `avatar` and `GameReportRow.avatar` (`AvatarId | null`) are **required** (test fixtures must set
  them). `Scored` in `game/scoring.ts` gained `avatar`. Prisma migration `20261021190534_avatars`.
  Nothing touched in the editor or the quiz API (T16).
- 2026-10-21, T21 agent: pause contract (PLAN.md §2/§4): `GameStatePayload.paused?` (`GamePause`),
  new events `host:resume` and `game:resuming`, error `GAME_PAUSED`, `player:join` ack is now
  `PlayerJoinAck` (+ `reclaimed?`, `nickname?`, `totalScore?`), `player:avatars` ack gains
  `started` (**required**), `lobby:players` items gain `offline?`. Behaviour change: ANSWERING no
  longer ends early when the last awaited player drops — the game pauses for them. Outside the
  T21 scope: Socket.IO heartbeat 5 s + 5 s in `apps/server/src/index.ts`. Phone sessions moved
  from sessionStorage to localStorage (`lbq:player-sessions`).
- 2026-10-21, T22 agent: media contract (PLAN.md §3–§6): `QuestionSchema` (every type) gains
  optional `audio` (`QuestionAudio`), `audioOnReveal`, `imageEffect` (`ImageEffect`), plus a union
  refinement (effect needs an image); `QuestionShowPayload` gains `audio?`, `audioOnReveal?`,
  `imageEffect?` (host only — `QuestionPromptPayload` unchanged); new `POST /api/uploads/audio`
  and `AUDIO_UPLOAD_MAX_BYTES`. Prisma migration `20261021201359_media`. The multipart plugin no
  longer has a global file size limit: each upload route sets its own (`apps/server/src/api/index.ts`).
- 2026-10-22, T23 agent (no contract change): outside the listed scope, `apps/server/tsconfig.json`
  includes `scripts/` (typechecked) and CLAUDE.md lists the `quiz:import` command. New top-level
  `content/` folder for bundled quiz content.
- 2026-10-22, T24 agent (REST only, additive): `ApiErrorCode` gains `TOO_MANY_ATTEMPTS`,
  `RESET_TOKEN_INVALID`, `WRONG_PASSWORD`; new bodies `ForgotPasswordBody`, `ResetPasswordBody`,
  `ChangePasswordBody` (PLAN.md §5–§7). Prisma migration `20261022162431_password_reset`.
  `ApiDeps` gains optional `mailer`, `publicWebUrl`, `rateLimits`. Also touched:
  `docker-compose.yml` (Mailpit service), `.github/workflows/ci.yml` (Mailpit service in the e2e
  job), `fly.toml` (`PUBLIC_WEB_URL`), `.env.example`, `apps/server/src/index.ts` (mailer wiring),
  `EditorShell.tsx` (« Mon compte » link + one-off `location.state.flash` banner), `main.tsx`
  (3 routes), README / CLAUDE.md (Mailpit). Login/register form pieces moved from `AuthPage.tsx`
  to `auth/AuthCard.tsx`.
- 2026-10-22, T25 agent (all additive, PLAN.md §3–§7): new `packages/shared/src/jokers.ts`
  (exported from the index) with **`jokerAvailability(type)`** — T27's types are wired there at
  merge (`WHO_OF_US` / `WORD_CLOUD`: `{ jokers: false }`; `ORDER` / `PIN`: `unavailable:
  ['fifty']`, `scramble: false`). `events.ts`: errors `JOKER_REFUSED` / `FROZEN`,
  `HostCreatePayload.jokers?`, `PlayerJokerPayload` + `player:joker`, `joker:state`
  (`PlayerJokersPayload`, `JokerEffects`), `joker:used` (`JokerUsedPayload`),
  `GameStatePayload.jokers?`, `RankedPlayer.jokers?`, `PlayerResultPayload.jokers?`
  (`JokerResult`). `api.ts`: `GameSummary.jokers?`, `GameReportRow.jokersUsed?`. Prisma
  migration `20261022200000_jokers`. In `Game.ts`, `answer()` now delegates to a private
  `recordAnswer(player, given, responseMs)` (T27: new answer kinds just go through it; the
  Copieur replays the original `AnswerInput`). Outside scope: `playwright.config.ts`
  (`E2E_JOKER_HAND`), `apps/server/src/index.ts` (passes it), `apps/web/scripts/generate-sounds.mjs`
  + `public/sounds/joker.wav`.
- 2026-10-22, T27 agent (additive): `QuestionType` gains `ORDER`, `PIN`, `WHO_OF_US`,
  `WORD_CLOUD`; `AnswerInput` / `PlayerAnswerPayload` gain `order` | `point` | `playerId`;
  `QuestionShowPayload` / `QuestionPromptPayload` / `RevealDetails` / `PlayerResultPayload` gain
  optional fields (PLAN.md §3–§5). `PlayerResultPayload.poll` is now also set for WHO_OF_US and
  WORD_CLOUD (no right answer). New shared helpers `hasRightAnswer` / `NO_RIGHT_ANSWER_TYPES`.
  Code switching on `Question['type']` must handle the 4 types (`isExtraQuestion` in
  `apps/server/src/game/questionTypes/`); `game/testing.ts` `rightAnswer` / `wrongAnswer` throw for
  them. Prisma migration `20261022200000_more_question_types`. Outside the listed scope:
  `e2e/answers.ts` (default branch narrowed to the choice types).
- 2026-10-22, main agent (post-merge, wave 6): T25 + T27 merged. `jokerAvailability` now lists
  the T27 types as decided (ORDER / PIN: all but 50/50, no Brouilleur; WHO_OF_US / WORD_CLOUD: no
  jokers); `Game.recordAnswer` routes T27 types to `judgeExtra`, so score jokers (Double ou rien,
  Sablier, Copieur…) apply to them. Tests: `packages/shared/src/jokers.test.ts`, "Jokers on the
  T27 question types" in `Game.jokers.test.ts`. Note: both migrations share the timestamp
  `20261022200000_*` (applied in name order, independent — no drift).
- 2026-10-24, T26 agent (additive, PLAN.md §3–§5): `QuestionType` gains `BLUFF` (+ `truth`,
  `voteTimeSec`); `ErrorCode` gains `LIE_TOO_CLOSE`; `QuestionShowPayload.bluff?`,
  `QuestionPromptPayload.bluff?`, `RevealDetails.bluff?`, `PlayerResultPayload.bluff?` (types
  `BluffShow`, `BluffPrompt`, `BluffOption`); `jokerAvailability.BLUFF`. `ExtraQuestion` (server)
  includes `BLUFF`; `extraPromptFields` / `judgeExtra` take an optional player id;
  `Game.promptPayload(player)` is now per player; new `Game.finishAnswering()` replaces the calls
  to `enterReveal()` that ended ANSWERING. `JokerContext.bluffLies?` + `Jokers.onBluffVote()`.
  Prisma migration `20261024120000_bluff`.
- 2026-10-24, T31 agent (additive, PLAN.md §3–§7): `GameMode` gains `'survival'` (code switching
  on the mode must handle it; `ModeBadge` does); new `packages/shared/src/survival.ts`;
  `HostCreatePayload.hearts?`, `PlayerHauntPayload` + `player:haunt`, `survival:state`
  (`SurvivalStatePayload`, `SurvivalPlayer`), `RankedPlayer.survival?`,
  `PlayerResultPayload.survival?`, `JokerUsedPayload.haunt?`; `GameSummary.hearts?`,
  `GameReportRow.survival?`. `Game.jokers` is now also set in « Survie » games without the Jokers
  option — use `Game.withJokers` for "players have jokers"; `Jokers` gains a 4th constructor
  argument `withHands` and `haunt()`. `PlayerStanding` / `GameRecord` gain `hearts` /
  `eliminatedAt`. Prisma migration `20261024160000_survival`. Outside the code scope:
  `apps/web/scripts/generate-sounds.mjs` + `public/sounds/eliminated.wav` (CC0, in CREDITS.md).
- 2026-10-24, T28 agent (additive, PLAN.md §3–§5): `Question.buzzer?` (+ `BUZZER_QUESTION_TYPES`,
  `buzzerAllowed`, `buzzerAnswer`); `jokerAvailability` / `jokerAllowed` take an optional
  `buzzer` flag and `JokerAvailability.freeze?`; events `player:buzz` (`PlayerBuzzPayload`),
  `host:judge` (`HostJudgePayload`), error `BUZZER_TAKEN`; `GameStatePayload.buzzer?`
  (`BuzzerStatus`), `QuestionShowPayload.buzzer?`, `QuestionPromptPayload.buzzer?`,
  `RevealDetails.buzzer?` (`BuzzerReveal`), `PlayerResultPayload.buzzer?`,
  `PlayerJokersPayload.buzzer?`. Prisma migration `20261024200000_buzzer`. Outside the code scope:
  `generate-sounds.mjs` + `public/sounds/buzz.wav` (CC0, in CREDITS.md); phone countdown got a
  `data-testid="countdown"`.
- 2026-10-24, T30 agent (additive, PLAN.md §3–§5): `QuestionType` gains `DRAW` (+ `words`); new
  `packages/shared/src/draw.ts` (exported); events `player:draw` (`PlayerDrawPayload`) and
  `draw:strokes` (`DrawStrokesPayload`); the `player:answer` ack type is now
  `Ack<{ guess?: DrawGuess }>`; `GameStatePayload.draw?` (`DrawStatus`),
  `QuestionShowPayload.draw?`, `QuestionPromptPayload.draw?` (`DrawPrompt`), `RevealDetails.draw?`
  (`DrawReveal`), `PlayerResultPayload.draw?`; `jokerAvailability.DRAW`. Server: `ExtraQuestion`
  includes `DRAW`; `QuestionSetup.draw?`; `Game.answer()` now returns `{ guess? }` (the socket
  handler sends it in the ack); `GameSettings.random` also picks the words. Prisma migration
  `20261024230000_draw`.
- 2026-10-24, main agent (post-merge T30 + T33): T33 follow-up (2) done — the Harry Potter quiz
  gets a « Dessine-moi » question (22, 10 magical objects, 90 s), the Horcruxes finale becomes 23;
  README (table, feature list, Survie / jokers sections) and CREDITS renumbered; re-imported for
  loicmoster@hotmail.fr (updated in place, 23 questions, private). Music still to add (3 MP3s).
- 2026-10-24, main agent (user feedback after a real game): (1) **PIN map missing on phones** —
  uploaded media are saved with absolute `http://localhost:3001/uploads/…` URLs, unreachable from
  a phone or a TV. New `apps/web/src/lib/mediaUrl.ts`: every `/uploads/` URL is rebuilt on the
  server the page talks to; used by `RevealImage`, `PinPicture`, the clip player, the editor
  previews and the quiz covers (`serverUrl.ts` now also exports a lazy `serverUrl()`). Use
  `mediaUrl()` for any new place that displays an uploaded file. (2) **Buzzer rule changed (user
  decision):** a wrong answer locks only that player, the question and its sound go on; when
  everyone has answered wrong, the locks are lifted and everyone can buzz again — only a right
  answer or the timer ends the question. `BuzzerRound.locked` (current locks) vs `wrong` (every
  wrong answer, reveal / report); wrong answers are recorded at REVEAL (one heart / streak reset
  at most); a locked player who drops doesn't pause the game. PLAN.md §3 updated; tests added.
- 2026-10-25, main agent (user requests): (1) « Réponse libre »: up to **10** accepted answers
  (`MAX_ACCEPTED_ANSWERS`, was 3; the editor showed no message when the add button disappeared —
  now « n / 10 » + « Maximum atteint »). (2) **Zoom on the phone for « point sur l'image »**
  (`player/moreAnswers.tsx` `PinAnswer` + pure math in `player/zoomPan.ts`): pinch (×1–×4), drag
  to pan, mouse wheel, ＋ / − / ⟲ buttons **under** the picture (never over it, so every spot stays
  tappable); a tap (< 8 px of movement) places the pin, a drag never does; the pin is measured on
  the picture as displayed (its bounding box includes the zoom), so the answer is the same picture
  fraction; the mark keeps its size. `e2e/question-types.spec.ts` drags, zooms and lands in the zone.
- 2026-10-25, T37 agent (additive, PLAN.md §3–§5): `Question.explanation?` +
  `EXPLANATION_MAX_LENGTH`, `questionExplanation`, `isMultipleAnswer`; `PlayerAnswerPayload` /
  `AnswerInput` gain `{ choiceIndexes }` (code switching on the answer kind must handle it);
  `QuestionPromptPayload.multiple?`, `QuestionShowPayload.multiple?`,
  `QuestionRevealPayload.explanation?`, `RevealDetails.multiple?`,
  `PlayerResultPayload.multiple?` / `explanation?`, `GameQuestionReport.explanation?`.
  `QuestionStats` (server) gains `explanation` (**required**, null = none). Prisma migration
  `20261025120000_explanations`. `testing.ts` `rightAnswer` / `wrongAnswer` return `choiceIndexes`
  for a « select all » MCQ.
