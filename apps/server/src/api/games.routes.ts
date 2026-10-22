import type { FastifyInstance } from 'fastify';
import {
  JOKERS,
  JokerType,
  TEAM_NAMES,
  isAvatarId,
  type GameReport,
  type GameSummary,
  type RevealDetails,
  type TeamId,
} from '@lbq/shared';
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
  mode: g.mode,
  ...(g.jokers && { jokers: true as const }),
});

/** Joker ids are written by the game server only; anything unknown is dropped. */
const jokerIds = (ids: string[]): JokerType[] =>
  ids.flatMap((id) => {
    const parsed = JokerType.safeParse(id);
    return parsed.success ? [parsed.data] : [];
  });

/** Team ids are written by the game server (0–3) only. */
const asTeamId = (id: number) => id as TeamId;

export async function gameRoutes(app: FastifyInstance, { prisma }: ApiDeps) {
  async function getReport(id: string, hostId: string): Promise<GameReport> {
    const g = await prisma.gameSession.findFirst({
      where: { id, hostId },
      include: {
        ...summaryInclude,
        questions: { orderBy: { index: 'asc' } },
        teams: { orderBy: [{ rank: 'asc' }, { teamId: 'asc' }] },
      },
    });
    if (!g) throw notFound('Partie');
    return {
      ...toSummary(g),
      results: g.results.map(
        ({ rank, nickname, avatar, score, correctCount, teamId, jokersUsed }) => {
          const jokers = jokerIds(jokersUsed);
          return {
            rank,
            nickname,
            avatar: isAvatarId(avatar) ? avatar : null,
            score,
            correctCount,
            teamId: teamId === null ? null : asTeamId(teamId),
            ...(jokers.length > 0 && { jokersUsed: jokers }),
          };
        },
      ),
      questions: g.questions.map(({ id: _id, gameSessionId: _g, answerCount, details, ...q }) => ({
        ...q,
        // Games saved before question types: every answer was a choice.
        answerCount: answerCount ?? q.distribution.reduce((sum, n) => sum + n, 0),
        details: (details ?? {}) as RevealDetails,
      })),
      teams: g.teams.map(({ teamId, name, score, playerCount, rank }) => ({
        teamId: asTeamId(teamId),
        name,
        score,
        playerCount,
        rank,
      })),
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
    // Team games get a `team` column (team name), games with jokers a `jokers` column (names);
    // classic solo exports are unchanged.
    const teams = report.mode === 'teams';
    const jokers = !!report.jokers;
    const teamCell = (id: TeamId | null) => (teams ? [id === null ? '' : TEAM_NAMES[id]] : []);
    const jokerCell = (used: JokerType[] = []) =>
      jokers ? [used.map((j) => JOKERS[j].name).join(', ')] : [];
    const csv = toCsv([
      [
        'rank',
        'nickname',
        'score',
        'correctCount',
        ...(teams ? ['team'] : []),
        ...(jokers ? ['jokers'] : []),
      ],
      ...report.results.map((r) => [
        r.rank,
        r.nickname,
        r.score,
        r.correctCount,
        ...teamCell(r.teamId),
        ...jokerCell(r.jokersUsed),
      ]),
    ]);
    const filename = `lebonquizz-${report.startedAt.slice(0, 10)}-${report.pin}.csv`;
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send('﻿' + csv); // BOM so Excel reads UTF-8 (accents in nicknames)
  });
}
