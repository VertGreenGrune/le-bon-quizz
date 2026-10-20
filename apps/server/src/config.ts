/** Matches docker-compose.yml, so `docker compose up -d` + `pnpm db:migrate` works with no .env. */
export const DEFAULT_DATABASE_URL = 'postgresql://lbq:lbq@localhost:5432/lbq';
