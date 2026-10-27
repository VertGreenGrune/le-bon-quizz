/**
 * Link of the « Télécommande » QR code. The token is in the fragment (`#…`): browsers never send
 * it in HTTP requests, so it stays out of server / proxy logs.
 */
export function remoteUrl(origin: string, pin: string, remoteToken: string): string {
  return `${origin}/remote/${encodeURIComponent(pin)}#${encodeURIComponent(remoteToken)}`;
}

/** Toast shown on the TV when the number of connected remotes changes (null: none). */
export function remoteToast(before: number | null, after: number): string | null {
  if (before === null || before === after) return null;
  return after > before ? '📱 Télécommande connectée' : '📱 Télécommande déconnectée';
}
