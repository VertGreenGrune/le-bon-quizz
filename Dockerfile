# syntax=docker/dockerfile:1
# Production image: one Node process serves the web app, the REST API and Socket.IO on the same
# origin (the host session cookie is SameSite=Lax). See DEPLOY.md.
#   docker build -t lebonquizz .
#   docker run -p 8080:8080 -e DATABASE_URL=postgresql://… lebonquizz

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.34.7 --activate
WORKDIR /repo

# Download dependencies from the lockfile alone (cached until pnpm-lock.yaml changes).
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch

COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --offline

# Public build-time settings of the web app (baked into the JS bundle).
ARG VITE_SENTRY_DSN=""
ARG VITE_SENTRY_ENVIRONMENT="production"
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT
RUN pnpm --filter @lbq/web build && pnpm --filter @lbq/server build

# Server package with production dependencies only (includes the Prisma CLI for migrations).
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm --filter @lbq/server deploy --legacy --prod /out/server \
 && cp -r apps/server/dist /out/server/dist \
 && cp -r apps/web/dist /out/server/public

FROM node:${NODE_VERSION}-slim AS runtime
# OpenSSL: Prisma's migration engine (`prisma migrate deploy`, the Fly release command).
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST_DIR=/app/public \
    UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=build /out/server ./
# Runs as root: Fly.io volumes (mounted at /data for uploads) are root-owned, and each Fly
# machine is its own micro-VM.
EXPOSE 8080
CMD ["node", "--enable-source-maps", "--import", "./dist/instrument.js", "dist/index.js"]
