export interface CloudWord {
  text: string;
  count: number;
  /** Font size: 1.5rem for the least typed word up to 5rem for the most typed. */
  sizeRem: number;
  /** Slight tilt (degrees), alternating so the cloud looks hand-made. */
  rotate: number;
  /** Entrance delay (s): the most typed words appear last, as a climax. */
  delay: number;
}

const MIN_REM = 1.5;
const MAX_REM = 5;

/**
 * Word cloud layout (host reveal): sizes by count, and the biggest words in the middle of the
 * line-wrapped cloud (placed alternately right and left of the centre). `words`: most typed first.
 */
export function cloudLayout(words: readonly { text: string; count: number }[]): CloudWord[] {
  const max = Math.max(1, ...words.map((w) => w.count));
  const min = Math.min(max, ...words.map((w) => w.count));
  const sized = words.map((w, i) => ({
    ...w,
    sizeRem:
      max === min
        ? (MIN_REM + MAX_REM) / 2
        : Math.round((MIN_REM + ((w.count - min) / (max - min)) * (MAX_REM - MIN_REM)) * 10) / 10,
    rotate: i % 3 === 0 ? 0 : i % 3 === 1 ? -4 : 4,
    delay: 0.2 + (words.length - 1 - i) * 0.08,
  }));
  const centred: CloudWord[] = [];
  sized.forEach((w, i) => (i % 2 === 0 ? centred.push(w) : centred.unshift(w)));
  return centred;
}
