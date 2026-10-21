/** "1789", "2,5" (French decimal comma, no thousands separator so years read naturally). */
export function formatNumber(value: number): string {
  return value.toLocaleString('fr-FR', { useGrouping: false, maximumFractionDigits: 6 });
}

/** `formatNumber` + the optional unit ("42 km"). */
export function formatValue(value: number, unit?: string): string {
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

/** Nearest slider position: `min + k × step`, within [min, max] (float noise removed). */
export function snapToStep(value: number, min: number, max: number, step: number): number {
  const last = Math.floor((max - min) / step + 1e-9); // index of the highest position
  const k = Math.min(Math.max(Math.round((value - min) / step), 0), last);
  return Number((min + k * step).toPrecision(12));
}
