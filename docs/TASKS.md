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
- **Status:** in-progress (T6 agent, worktree ../lbq-T6, branch task/T6-editor)
- **Depends on:** T0 (mock API OK), T5 for real integration
- **Scope:** `apps/web/src/editor/**`, `apps/web/src/auth/**`, `apps/web/src/api/**`, the
  `/editor` routes in `main.tsx`, and the `quizId` query param in `host/useHostGame.ts` +
  `host/HostPage.tsx` (only that — T8 also edits `host/`).
- **Deliverable:** login/register, quiz list, quiz editor (questions, 2–4 choices, correct
  answer, time limit, points, image upload), "Start game" button → `/host/new?quizId=<id>`.

### T7 — Load games from DB + save results
- **Status:** in-progress (T7 agent, worktree ../lbq-T7)
- **Depends on:** T1, T5
- **Scope:** `apps/server/src/game/**` (persistence adapter), `apps/server/src/socket/**`
  (handshake auth), `apps/web/src/lib/socket.ts` (`withCredentials` only), game history/report
  endpoints in `apps/server/src/api/**`.
- **Deliverable:** `host:create` loads quiz from DB and checks ownership; on ENDED save
  `GameSession` + `PlayerResult`; history/report endpoints return real data.

### T8 — QR code, reconnection hardening, wake-lock
- **Status:** todo
- **Depends on:** T2, T3
- **Scope:** `apps/web/src/host/**` (QR code in the lobby screen only), `apps/web/src/player/**`
- **Deliverable:** QR code in lobby → `/join?pin=` (PIN pre-filled; the QR must use the PC's
  LAN address, not `localhost`, so phones can open it), robust rejoin after phone lock,
  Wake Lock API.

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
- `apps/web/src/main.tsx` is touched by T2, T3, T6 (one route line each) — expect trivial
  merge conflicts there; keep both sides.
- 2026-10-20, main agent (post-merge fix): `tsx watch` hangs before listening when run under
  `pnpm --parallel` (root `pnpm dev`) on Windows → server `dev` script is now
  `node --watch --env-file-if-exists=../../.env --import tsx src/index.ts`. Don't switch back.
  Host screen `/host/new` now times out after 8 s with a "server not reachable" message +
  retry button instead of spinning forever.
