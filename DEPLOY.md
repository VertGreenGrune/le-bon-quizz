# Deploying Le Bon Quizz (Fly.io)

Production = **one Fly app** running one Docker image (`Dockerfile`) that serves the web app,
the REST API and Socket.IO on the same origin, plus **Fly Managed Postgres** and a small
**volume** for uploaded images. Errors go to **Sentry** (optional).

```
https://lebonquizz.fly.dev ──► Fly proxy (TLS) ──► 1 machine: node dist/index.js  ──► Postgres
                                                     /          web app (apps/web/dist)
                                                     /api/*     REST API
                                                     /socket.io realtime
                                                     /uploads/* images (volume /data)
```

Why one app and not separate web/server apps: the host session cookie is `SameSite=Lax`, and
`*.fly.dev` is a public suffix, so `lbq-web.fly.dev` → `lbq-api.fly.dev` would be cross-site and
host login would break. Same origin also means no CORS and no `VITE_SERVER_URL` to bake in.

Why exactly **one machine**: live games are kept in memory (`Map<pin, Game>`). Two machines
would split players across games. The volume (one per machine) enforces this. Scaling out
needs Redis (T18).

Commands below are for PowerShell on Windows; they are the same in bash.
Replace `lebonquizz` everywhere if that app name is already taken on Fly (it is global).

---

## 0. Check locally first (optional, needs Docker Desktop)

```powershell
docker build -t lebonquizz .
docker compose up -d   # local Postgres
docker run --rm -e DATABASE_URL=postgresql://lbq:lbq@host.docker.internal:5432/lbq lebonquizz ./node_modules/.bin/prisma migrate deploy
docker run --rm -p 8080:8080 -e DATABASE_URL=postgresql://lbq:lbq@host.docker.internal:5432/lbq lebonquizz
```

Open http://localhost:8080 (`/host/new` = demo game). Without Docker:
`pnpm build`, then `$env:WEB_DIST_DIR="../web/dist"; pnpm --filter @lbq/server start`.

## 1. Install flyctl and sign in

```powershell
iwr https://fly.io/install.ps1 -useb | iex     # then open a new terminal
fly auth signup                                 # or: fly auth login
```

A credit card is required by Fly, even for small apps.

## 2. Create the app and its volume

From the repository root (where `fly.toml` is):

```powershell
fly apps create lebonquizz
fly volumes create lbq_data --app lebonquizz --region cdg --size 1
```

`fly volumes create` warns that a single volume means no redundancy — answer **y** (this app
must run on one machine, see above).

If you changed the app name, update `app`, `CORS_ORIGIN` and `PUBLIC_URL` in `fly.toml`.

## 3. Create the database

**Recommended — Fly Managed Postgres:**

```powershell
fly mpg create          # interactive: name "lebonquizz-db", region cdg (Paris), smallest plan
fly mpg list            # note the cluster ID
fly mpg attach <CLUSTER_ID> --app lebonquizz   # sets the DATABASE_URL secret on the app
```

(Managed Postgres commands are recent; if yours differ, `fly mpg --help`.)

**Cheaper alternative** — any hosted Postgres (Neon, Supabase, the older unmanaged
`fly postgres create`, …): get its connection string, then
`fly secrets set DATABASE_URL="postgresql://…?sslmode=require" --app lebonquizz --stage`.

Check: `fly secrets list --app lebonquizz` shows `DATABASE_URL`.
Prices change; check https://fly.io/docs/about/pricing/ (the app machine itself is a
shared-cpu-1x / 512 MB that stops when nobody is connected).

Migrations run automatically on every deploy (`release_command` in `fly.toml` =
`prisma migrate deploy`). If that step fails with prepared-statement or advisory-lock errors,
`DATABASE_URL` points to a PgBouncer pooler in transaction mode: use the provider's **direct**
connection string instead.

## 4. Sentry (optional, can be done later)

1. Create an account at https://sentry.io, then two projects: **Node.js** (`lbq-server`) and
   **React** (`lbq-web`). Each gives a DSN (`https://…@….ingest.sentry.io/…`).
2. Server DSN (secret):
   ```powershell
   fly secrets set SENTRY_DSN="https://…" --app lebonquizz --stage
   ```
3. Browser DSN (public, baked into the JS at build time): put it in `fly.toml` →
   `[build.args] VITE_SENTRY_DSN = 'https://…'` and commit it.

Without DSNs Sentry stays off. `SENTRY_TRACES_SAMPLE_RATE` (`[env]`, default 0) enables
performance tracing on the server.

## 5. First deploy

```powershell
fly deploy --ha=false
```

This builds the image on Fly's builders (nothing to build locally), runs the migrations, and
starts the machine. Then:

```powershell
fly status                                  # 1 machine, "started"
curl https://lebonquizz.fly.dev/health      # {"status":"ok"}
fly logs                                    # live logs
```

Open https://lebonquizz.fly.dev — create an account, a quiz, launch it; join from a phone on
mobile data (not just Wi-Fi) via the QR code.

**Optional demo account** (`demo@lebonquizz.local` + the demo quiz). Use a real password,
the default `demo1234` is public:

```powershell
fly ssh console --app lebonquizz -C "sh -c 'SEED_DEMO_PASSWORD=<a-strong-password> node dist/seed.js'"
```

## 6. Deploy from GitHub Actions

CI (`.github/workflows/ci.yml`) runs on every push/PR: Prettier check, typecheck, unit +
Postgres integration tests, build, Playwright e2e, Docker image build. Nothing to configure.

Deploying from GitHub (`.github/workflows/deploy.yml`, manual "Run workflow" button):

```powershell
fly tokens create deploy --app lebonquizz --expiry 8760h   # copy the token (FlyV1 …)
gh secret set FLY_API_TOKEN                                # paste it (or: GitHub → Settings → Secrets → Actions)
```

Then GitHub → Actions → **Deploy (Fly.io)** → Run workflow.

To deploy automatically when CI passes on `main`, replace the `on:` block of `deploy.yml` with:

```yaml
on:
  workflow_dispatch:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
```

and add `if: ${{ github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success' }}`
under `deploy:` (next to `runs-on`).

## 7. Later

- **Custom domain:** `fly certs add quiz.example.com --app lebonquizz`, create the DNS records
  it prints, then set `CORS_ORIGIN` and `PUBLIC_URL` in `fly.toml` to `https://quiz.example.com`
  and redeploy. Images uploaded before keep their old absolute `*.fly.dev` URL (still works).
- **Deploys interrupt live games** (in-memory state, one machine). Deploy between sessions.
- **Rollback:** `fly releases --app lebonquizz --image`, then
  `fly deploy --image <previous image ref>`. Migrations are not rolled back.
- **Backups:** Managed Postgres has daily backups; the uploads volume has daily snapshots
  (`fly volumes snapshots list <volume id>`).
- **Secrets:** `fly secrets list`, `fly secrets set KEY=value` (restarts the app),
  `fly secrets unset KEY`.

## Reference — runtime configuration

| Variable                    | Where                     | Value in production                          |
| --------------------------- | ------------------------- | -------------------------------------------- |
| `DATABASE_URL`              | secret                    | set by `fly mpg attach`                      |
| `SENTRY_DSN`                | secret                    | server DSN (optional)                        |
| `NODE_ENV`                  | `fly.toml` / image        | `production` (Secure cookie)                 |
| `PORT`                      | `fly.toml` / image        | `8080`                                       |
| `WEB_DIST_DIR`              | image                     | `/app/public` (web app served by the server) |
| `UPLOAD_DIR`                | `fly.toml` / image        | `/data/uploads` (volume)                     |
| `TRUST_PROXY`               | `fly.toml`                | `true` (`https` behind Fly's proxy)          |
| `CORS_ORIGIN`, `PUBLIC_URL` | `fly.toml`                | `https://lebonquizz.fly.dev`                 |
| `VITE_SENTRY_DSN`           | `fly.toml` `[build.args]` | browser DSN (optional, public)               |
