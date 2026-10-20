/** Only same-app paths, so `?next=` can't redirect elsewhere. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/editor';
}
