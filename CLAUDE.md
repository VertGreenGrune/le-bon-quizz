# Le Bon Quizz

A Kahoot-like live quiz web app. A host shows questions on a **shared screen** (TV/projector);
players join from their **smartphone browser** (PIN or QR code, no install, nickname only) and
answer by tapping big colored shapes (red ▲, blue ◆, yellow ●, green ■).

- Full plan, architecture and contracts: @docs/PLAN.md
- Task board (who does what, status): @docs/TASKS.md

## Stack (decided — do not change without the user's approval)

- TypeScript everywhere, **pnpm workspaces** monorepo
- `apps/web` — React + Vite, Tailwind CSS, Framer Motion, React Router
- `apps/server` — Node.js, Fastify (REST) + Socket.IO (real-time) in one process
- `packages/shared` — shared TS types + zod schemas (socket events, game states, quiz schema)
- PostgreSQL + Prisma; Redis later (scaling only); S3-compatible storage for images
- Hosting target: Fly.io / Railway / Render (persistent WebSockets — no serverless for sockets)

## Repository layout

```
apps/web/            React app: routes /editor, /host/:pin, /play (phone), /join
apps/server/         Fastify + Socket.IO + Prisma
packages/shared/     Types and zod schemas — THE contract between web and server
docs/                PLAN.md (architecture), TASKS.md (task board)
```

## Commands

```
pnpm install       # once (pnpm 10, Node >= 22)
pnpm dev           # server :3001 + web :5173 (exposed on LAN for phones)
pnpm typecheck     # all packages
pnpm test          # Vitest, all packages
```

Phones on the same Wi-Fi: open `http://<PC LAN IP>:5173`. The web app connects to
`<same host>:3001` by default (override with `VITE_SERVER_URL`, see `.env.example`).

## Rules for working on this project (multi-agent)

Each agent works in its **own git worktree / branch** (`task/T1-game-server`, …) and the user
merges into `main`. Run `pnpm install` in a new worktree, and `pnpm typecheck && pnpm test`
before finishing.


Several Claude agents work on this repo in parallel. To avoid conflicts:

1. **Before starting**, read `docs/TASKS.md`, pick a task whose dependencies are `done`,
   and mark it `in-progress` with your agent name/worktree. Only work on files inside that
   task's **scope**.
2. **`packages/shared` is the contract.** Never change an existing event/type silently. If you
   need a change, update `packages/shared` AND the protocol section of `docs/PLAN.md` in the
   same change, and note it under "Contract changes" in `docs/TASKS.md`.
3. Server is authoritative: timer, scoring and answer validation live on the server only.
   Never send the correct answer to players before the `REVEAL` phase.
4. When done, set the task to `done` in `docs/TASKS.md` with a one-line summary and any
   follow-ups. Keep `docs/PLAN.md` true if you changed architecture.
5. Don't commit secrets; use `.env` (gitignored) + `.env.example`.

## Conventions

- Code, identifiers, commits in English; UI text in French first (i18n-ready, EN later).
- Validate every incoming socket payload / HTTP body with the zod schemas from `packages/shared`.
- Socket event names: `domain:action` (e.g. `player:join`, `game:state`).
- Tests: Vitest (unit), Playwright (e2e, phone + host flows).
