/** Competition ranks for scores sorted best first: equal scores share a rank (1, 2, 2, 4). */
export function competitionRanks(scores: readonly number[]): number[] {
  const ranks: number[] = [];
  scores.forEach((score, i) =>
    ranks.push(i > 0 && scores[i - 1] === score ? ranks[i - 1]! : i + 1),
  );
  return ranks;
}
