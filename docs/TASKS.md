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
- **Status:** in-progress (T4 agent, worktree ../lbq-T4, branch task/T4-e2e)
- **Depends on:** T1, T2, T3
- **Scope:** `e2e/**`, Playwright config, root `package.json` script, `README.md`. T6/T7/T8
  edit app code in parallel: **don't refactor app code**. Only a minimal fix if a bug blocks
  the test, noted below; report other bugs below instead of fixing them.
- **Deliverable:** Playwright test: 1 host + 3 players play the demo quiz to the podium.
  Instructions in README to test on real phones over LAN (`vite --host`).

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
- **Status:** todo
- **Depends on:** T4, T5
- **Scope:** `Dockerfile`s, `fly.toml`/equivalent, `.github/workflows/**`, `.env.example`
- **Deliverable:** CI (lint, typecheck, tests), deploy web + server + Postgres, Sentry.

---

## Phase 3 — Polish (to be detailed later)
- T10 Animations & sounds (Framer Motion, music, countdown sounds)
- T11 Streaks & bonus scoring
- T12 Game reports page + CSV export
- T13 i18n FR/EN

## Phase 4 — Extras (to be detailed later)
- T14 More question types (type answer, poll, slider)
- T15 Team mode
- T16 Public quiz library
- T17 AI-generated quizzes from a topic
- T18 Redis state + Socket.IO Redis adapter + load test (200 players)

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
