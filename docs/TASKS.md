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
- **Status:** in-progress (claude T1, worktree ../lbq-T1)
- **Depends on:** T0
- **Scope:** `apps/server/src/game/**`, `apps/server/src/socket/**`
- **Deliverable:** PIN generation, rooms, state machine (PLAN.md §2), server timer, scoring
  (§3), all events of §4, one answer per player, late answers ignored, rejoin by
  sessionToken, kick. Vitest unit tests for state machine + scoring.

### T2 — Shared screen (host view)
- **Status:** in-progress (claude-T2, worktree ../lbq-T2, branch task/T2-host-screen)
- **Depends on:** T0
- **Scope:** `apps/web/src/host/**`, plus adding the `/host/:pin` route in `apps/web/src/main.tsx`
  (one line). Reuse `components/shapes.tsx` and `lib/socket.ts` (already exist, from T0).
  `/host/new` = create a game with `DEMO_QUIZ` then show its PIN.
- **Deliverable:** `/host/:pin` — lobby (PIN, player names), question + countdown + answer
  counter, reveal with distribution bars, leaderboard, podium, host buttons (start/next/end).
  Uses the demo quiz via `host:create`.

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
- **Status:** todo
- **Depends on:** T1, T2, T3
- **Scope:** `e2e/**`, small fixes anywhere (note them below)
- **Deliverable:** Playwright test: 1 host + 3 players play the demo quiz to the podium.
  Instructions in README to test on real phones over LAN (`vite --host`).

---

## Phase 2 — MVP

### T5 — Database + REST API + auth
- **Status:** todo
- **Depends on:** T0
- **Scope:** `apps/server/prisma/**`, `apps/server/src/api/**`, `apps/server/src/auth/**`
- **Deliverable:** Prisma schema (PLAN.md §5), migrations, seed, endpoints of §6, host auth,
  zod validation, docker-compose for Postgres.

### T6 — Quiz editor UI
- **Status:** todo
- **Depends on:** T0 (mock API OK), T5 for real integration
- **Scope:** `apps/web/src/editor/**`, `apps/web/src/auth/**`, `apps/web/src/api/**`
- **Deliverable:** login/register, quiz list, quiz editor (questions, 2–4 choices, correct
  answer, time limit, points, image upload), "Start game" button → `/host/:pin`.

### T7 — Load games from DB + save results
- **Status:** todo
- **Depends on:** T1, T5
- **Scope:** `apps/server/src/game/**` (persistence adapter only)
- **Deliverable:** `host:create` loads quiz from DB and checks ownership; on ENDED save
  `GameSession` + `PlayerResult`; history/report endpoints return real data.

### T8 — QR code, reconnection hardening, wake-lock
- **Status:** todo
- **Depends on:** T2, T3
- **Scope:** `apps/web/src/host/**` (QR only), `apps/web/src/player/**`
- **Deliverable:** QR code in lobby → `/join?pin=`, robust rejoin after phone lock, Wake Lock API.

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
- `apps/web/src/main.tsx` is touched by T2, T3, T6 (one route line each) — expect trivial
  merge conflicts there; keep both sides.
