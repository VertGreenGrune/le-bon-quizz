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
- **Status:** in-progress (T16 agent, worktree ../lbq-T16)
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

- T17 AI-generated quizzes from a topic (to be detailed later)
- ~~T18 Redis state + Socket.IO Redis adapter + load test~~ — **cancelled** (2026-10-20): games have ~6 players, 15 max; one server process is enough. Do not add Redis/multi-instance work.

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
- 2026-10-21, T20 agent: avatars contract as decided in the T20 section (PLAN.md §4–§6 updated),
  plus: new client event `player:avatars` `{ pin }` → `Ack<{ taken: AvatarId[] }>` (join-screen
  hint), `closest.avatar?` in `RevealDetails`, type `LobbyMember` (`lobby:players` items /
  `lobby:teams` members). `RankedPlayer.avatar`, `LobbyMember.avatar`, the join/rejoin ack
  `avatar` and `GameReportRow.avatar` (`AvatarId | null`) are **required** (test fixtures must set
  them). `Scored` in `game/scoring.ts` gained `avatar`. Prisma migration `20261021190534_avatars`.
  Nothing touched in the editor or the quiz API (T16).
