# Le Bon Quizz

A Kahoot-like live quiz. A host shows the questions on a shared screen (TV / projector);
players join from their phone's browser with a PIN and a nickname (no install) and answer by
tapping big colored shapes (red ▲, blue ◆, yellow ●, green ■).

- Architecture, protocol, data model: [docs/PLAN.md](docs/PLAN.md)
- Task board: [docs/TASKS.md](docs/TASKS.md)

## Requirements

- Node.js ≥ 22 and pnpm 10 (`corepack enable` or `npm i -g pnpm`)
- Docker (only for the database: quiz editor, accounts, game history). The demo quiz works
  without it.

## Getting started

```sh
pnpm install
docker compose up -d                     # Postgres on localhost:5432 (lbq/lbq) — optional for the demo
pnpm --filter @lbq/server db:migrate     # create the tables
pnpm --filter @lbq/server db:seed        # demo host demo@lebonquizz.local / demo1234
pnpm dev                                 # server :3001 + web :5173
```

Then open <http://localhost:5173>:

1. **Shared screen**: open `/host/new` — a game with the demo quiz is created and its PIN shown.
2. **Players**: open `/join` in other tabs/devices, type the PIN and a nickname.
3. Click **Commencer** on the shared screen, answer on the phones, then **Suivant** /
   **Question suivante** until the podium.

Configuration is optional; see [.env.example](.env.example) (copy it to `.env`).

## Playing with real phones over Wi-Fi

The dev servers listen on all interfaces, so phones on the **same Wi-Fi network** as the PC can
play.

1. Find the PC's LAN IP address:
   - Windows: `ipconfig` → "IPv4 Address" of the Wi-Fi adapter (e.g. `192.168.1.42`)
   - macOS: `ipconfig getifaddr en0` · Linux: `hostname -I`
2. Run `pnpm dev`.
3. On the PC, open the shared screen with the **LAN address**, not `localhost`:
   `http://192.168.1.42:5173/host/new`. The lobby shows the join address based on the URL you
   opened, so players see a usable address.
4. On each phone, open `http://192.168.1.42:5173/join` and enter the PIN.

The web app connects to the game server on the same host, port 3001
(`http://192.168.1.42:3001`), so no configuration is needed. Override it with
`VITE_SERVER_URL` if the server runs elsewhere.

If phones can't load the page or stay on "Connexion…":

- Both devices must be on the same network (no guest Wi-Fi / client isolation).
- Allow Node.js through the firewall for **private networks** (Windows asks the first time
  Node listens; otherwise *Windows Defender Firewall → Allow an app*), ports 5173 and 3001.
- Check the server answers from the phone: `http://192.168.1.42:3001/health` → `{"status":"ok"}`.
- Some VPNs block LAN traffic; turn them off on the PC.

Worth testing on real devices: locking the phone mid-game and coming back (rejoin), slow
networks, and 3–4 phones answering at the same time.

## Tests

```sh
pnpm typecheck     # all packages + e2e
pnpm test          # Vitest unit tests (all packages)
pnpm test:e2e      # Playwright end-to-end tests
```

API integration tests run only when `TEST_DATABASE_URL` is set (the database is wiped).

### End-to-end (Playwright)

[e2e/full-game.spec.ts](e2e/full-game.spec.ts) plays the whole demo quiz: one host screen and
three phones (separate browser contexts with a mobile viewport) join with the PIN, answer every
question, and the test checks the reveal, the leaderboard, the podium order and the end screen.

First run only, download the browser:

```sh
pnpm exec playwright install chromium
```

`pnpm test:e2e` starts its own server on port **3004** and web app on port **5184** (no clash
with `pnpm dev`) and stops them at the end. Change them with `E2E_SERVER_PORT` /
`E2E_WEB_PORT`. Useful options:

```sh
pnpm test:e2e --headed          # watch the browsers
pnpm test:e2e --ui              # Playwright UI mode
pnpm exec playwright show-trace test-results/<test>/trace.zip   # after a failure
```

The demo-quiz test needs no database.

## Repository layout

```
apps/web/          React + Vite + Tailwind: shared screen (/host), phone (/join, /play), editor
apps/server/       Fastify (REST) + Socket.IO (real-time) + Prisma
packages/shared/   Types and zod schemas — the contract between web and server
e2e/               Playwright tests
docs/              PLAN.md (architecture), TASKS.md (task board)
```
