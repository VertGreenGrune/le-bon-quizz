import type { FastifyInstance } from 'fastify';
import type { GameReport, GameSummary } from '@lbq/shared';
import { currentUser } from '../auth/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ApiDeps } from './index.js';
import { toCsv } from './csv.js';
import { notFound } from './errors.js';

type IdParams = { Params: { id: string } };
// Results sorted by rank: the first one is the winner.
const summaryInclude = {
  _count: { select: { results: true } },
  results: { orderBy: [{ rank: 'asc' }, { score: 'desc' }] },
} satisfies Prisma.GameSessionInclude;
type GameRow = Prisma.GameSessionGetPayload<{ include: typeof summaryInclude }>;

const toSummary = (g: GameRow): GameSummary => ({
  id: g.id,
  quizId: g.quizId,
  quizTitle: g.quizTitle,
  pin: g.pin,
  startedAt: g.startedAt.toISOString(),
  endedAt: g.endedAt?.toISOString() ?? null,
  playerCount: g._count.results,
  winner: g.results[0]?.nickname ?? null,
});

export async function gameRoutes(app: FastifyInstance, { prisma }: ApiDeps) {
  async function getReport(id: string, hostId: string): Promise<GameReport> {
    const g = await prisma.gameSession.findFirst({
      where: { id, hostId },
      include: { ...summaryInclude, questions: { orderBy: { index: 'asc' } } },
    });
    if (!g) throw notFound('Partie');
    return {
      ...toSummary(g),
      results: g.results.map(({ rank, nickname, score, correctCount }) => ({
        rank,
        nickname,
        score,
        correctCount,
      })),
      questions: g.questions.map(({ id: _id, gameSessionId: _g, ...q }) => q),
    };
  }

  app.get('/games', async (request) => {
    const rows = await prisma.gameSession.findMany({
      where: { hostId: currentUser(request).id },
      orderBy: { startedAt: 'desc' },
      include: { ...summaryInclude, results: { ...summaryInclude.results, take: 1 } },
    });
    return rows.map(toSummary);
  });

  app.get<IdParams>('/games/:id', async (request) =>
    getReport(request.params.id, currentUser(request).id),
  );

  app.get<IdParams>('/games/:id/export.csv', async (request, reply) => {
    const report = await getReport(request.params.id, currentUser(request).id);
    const csv = toCsv([
      ['rank', 'nickname', 'score', 'correctCount'],
      ...report.results.map((r) => [r.rank, r.nickname, r.score, r.correctCount]),
    ]);
    const filename = `lebonquizz-${report.startedAt.slice(0, 10)}-${report.pin}.csv`;
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send('﻿' + csv); // BOM so Excel reads UTF-8 (accents in nicknames)
  });
}
