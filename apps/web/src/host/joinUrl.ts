/** LAN IPv4s of the dev PC, best first (injected by `vite.config.ts`). */
declare const __LAN_HOSTS__: string[] | undefined;

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

type PageLocation = Pick<Location, 'protocol' | 'hostname' | 'port' | 'origin'>;

/**
 * Origins phones can use to reach the web app, best first. A host page opened on `localhost`
 * would give phones a QR code pointing at themselves, so it is swapped for the PC's LAN
 * addresses (same protocol and port). Any other origin (LAN IP, real domain) is kept as is.
 */
export function joinOrigins(
  loc: PageLocation = location,
  lanHosts: readonly string[] = typeof __LAN_HOSTS__ === 'undefined' ? [] : __LAN_HOSTS__,
): string[] {
  if (!LOOPBACK.has(loc.hostname) || lanHosts.length === 0) return [loc.origin];
  const port = loc.port ? `:${loc.port}` : '';
  return lanHosts.map((host) => `${loc.protocol}//${host}${port}`);
}

/** URL encoded in the lobby QR code: the join screen with the PIN pre-filled. */
export function joinUrl(origin: string, pin: string): string {
  return `${origin}/join?pin=${encodeURIComponent(pin)}`;
}
