import { describe, expect, it } from 'vitest';
import type { LobbyTeamsPayload, RankedTeam } from '@lbq/shared';
import { hostReducer, initialHostState, teamLobbyStatus, type HostAction } from './hostReducer';

const run = (actions: HostAction[]) => actions.reduce(hostReducer, initialHostState);

const team = (id: 0 | 1 | 2 | 3, ...names: string[]): LobbyTeamsPayload['teams'][number] => ({
  id,
  name: `T${id}`,
  members: names.map((n) => ({ id: n, nickname: n, avatar: 'fox' as const })),
});
const ranked: RankedTeam[] = [{ id: 1, name: 'Équipe Bleue', score: 600, playerCount: 5 }];

describe('hostReducer (team mode)', () => {
  it('keeps the mode, the teams and the team standings', () => {
    const s = run([
      {
        type: 'state',
        payload: { phase: 'LOBBY', mode: 'teams', questionIndex: -1, totalQuestions: 3 },
        now: 0,
      },
      { type: 'teams', payload: { teams: [team(0, 'a'), team(1)] } },
      {
        type: 'state',
        payload: { phase: 'LEADERBOARD', mode: 'teams', questionIndex: 0, totalQuestions: 3 },
        now: 0,
      },
      {
        type: 'leaderboard',
        top: [{ nickname: 'a', avatar: 'fox' as const, score: 10 }],
        teams: ranked,
      },
      {
        type: 'podium',
        top: [{ nickname: 'a', avatar: 'fox' as const, score: 10 }],
        teams: ranked,
      },
    ]);
    expect(s.mode).toBe('teams');
    expect(s.teams).toHaveLength(2);
    expect(s.leaderboardTeams).toEqual(ranked);
    expect(s.podiumTeams).toEqual(ranked);
  });

  it('solo standings carry no teams', () => {
    const s = run([
      { type: 'leaderboard', top: [] },
      { type: 'podium', top: [] },
    ]);
    expect(s.mode).toBe('solo');
    expect(s.leaderboardTeams).toEqual([]);
    expect(s.podiumTeams).toEqual([]);
  });
});

describe('teamLobbyStatus', () => {
  const players = (...teamIds: (0 | 1 | undefined)[]) =>
    teamIds.map((teamId, i) => ({
      id: `p${i}`,
      nickname: `p${i}`,
      avatar: 'fox' as const,
      teamId,
    }));

  it('is ready once every player has a team and 2 teams have players', () => {
    expect(teamLobbyStatus({ players: [], teams: [team(0), team(1)] }).ready).toBe(false);
    expect(
      teamLobbyStatus({ players: players(0, undefined), teams: [team(0, 'p0'), team(1)] }),
    ).toMatchObject({ ready: false, unassigned: 1 });
    expect(
      teamLobbyStatus({ players: players(0, 0), teams: [team(0, 'p0', 'p1'), team(1)] }),
    ).toMatchObject({ ready: false, unassigned: 0 });
    expect(
      teamLobbyStatus({ players: players(0, 1), teams: [team(0, 'p0'), team(1, 'p1')] }).ready,
    ).toBe(true);
  });

  it('hints at unbalanced teams (more than twice as many players), ignoring empty ones', () => {
    const status = (...sizes: number[]) =>
      teamLobbyStatus({
        players: [],
        teams: sizes.map((n, i) =>
          team(i as 0 | 1 | 2, ...Array.from({ length: n }, (_, j) => `${i}-${j}`)),
        ),
      }).unbalanced;
    expect(status(2, 4)).toBe(false);
    expect(status(2, 5)).toBe(true);
    expect(status(1, 3, 0)).toBe(true);
    expect(status(3, 0)).toBe(false);
  });
});
