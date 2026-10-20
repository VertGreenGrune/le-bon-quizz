import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { DEFAULT_DATABASE_URL } from './config.js';

export type { PrismaClient };

export function createPrisma(url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
