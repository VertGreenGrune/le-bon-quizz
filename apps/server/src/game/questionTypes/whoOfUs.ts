import type { VoteCount } from '@lbq/shared';

/**
 * WHO_OF_US — « Qui de nous ? » (PLAN.md §3): players vote for a player of the game. No right
 * answer; with `majorityBonus`, the voters of the most voted player(s) earn
 * WHO_OF_US_MAJORITY_BONUS.
 */

interface Candidate {
  id: string;
  nickname: string;
  avatar: VoteCount['avatar'];
}

/** Votes per player id. */
export function tallyVotes(votes: Iterable<string>): Map<string, number> {
  const tally = new Map<string, number>();
  for (const id of votes) tally.set(id, (tally.get(id) ?? 0) + 1);
  return tally;
}

/** Ids of the most voted players (all of them on a tie); empty without votes. */
export function mostVoted(tally: ReadonlyMap<string, number>): Set<string> {
  const max = Math.max(0, ...tally.values());
  return new Set(max > 0 ? [...tally].flatMap(([id, n]) => (n === max ? [id] : [])) : []);
}

/** Players with at least one vote, most voted first (ties by nickname). */
export function voteCounts(
  tally: ReadonlyMap<string, number>,
  candidates: Iterable<Candidate>,
): VoteCount[] {
  return [...candidates]
    .flatMap((c) => {
      const count = tally.get(c.id) ?? 0;
      return count > 0 ? [{ nickname: c.nickname, avatar: c.avatar, count }] : [];
    })
    .sort((a, b) => b.count - a.count || a.nickname.localeCompare(b.nickname));
}
