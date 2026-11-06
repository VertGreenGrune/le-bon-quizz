import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';
import { DEFAULT_DATABASE_URL } from './src/config.js';

// The Prisma CLI doesn't read the root .env (the server scripts do, with --env-file-if-exists):
// load it here so `db:migrate` / `db:seed` hit the same database as `pnpm dev`. A DATABASE_URL
// already set (CI, Docker, the API tests' TEST_DATABASE_URL, `DATABASE_URL=… pnpm …`) always
// wins: the file is then not read at all, so its Neon URLs can't be picked up by mistake.
const givenUrl = process.env.DATABASE_URL;
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (!givenUrl && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations need a direct connection: on Neon, DATABASE_URL is the pooled (PgBouncer) one.
    url:
      givenUrl ??
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      DEFAULT_DATABASE_URL,
  },
});
