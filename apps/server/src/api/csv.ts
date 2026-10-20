/**
 * RFC 4180 CSV. Text cells starting with = + - @ (or tab/CR) get a leading `'` so that
 * spreadsheet apps don't evaluate player-chosen nicknames as formulas.
 */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
