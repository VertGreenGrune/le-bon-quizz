/** "jamais joué" / "joué 1 fois" / "joué N fois" (games of every host). */
export function playedLabel(count: number): string {
  return count === 0 ? 'jamais joué' : `joué ${count} fois`;
}
