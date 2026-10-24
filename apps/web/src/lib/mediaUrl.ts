import { serverUrl } from './serverUrl';

/**
 * Uploaded media are saved with an absolute URL (`http://localhost:3001/uploads/…` when the quiz
 * was made or imported on the PC). A phone or a TV reaches the server at another address, so any
 * `/uploads/` URL is rebuilt on the server this page actually talks to. Other URLs are untouched.
 */
export function mediaUrl(url: string, server?: string): string;
export function mediaUrl(url: string | undefined, server?: string): string | undefined;
export function mediaUrl(url: string | undefined, server?: string): string | undefined {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url, 'http://placeholder');
  } catch {
    return url;
  }
  if (!parsed.pathname.startsWith('/uploads/')) return url;
  // Outside a browser (unit tests) there is no page server: keep the saved URL.
  const base = server ?? (typeof location === 'undefined' ? '' : serverUrl());
  if (!base) return url;
  return `${base.replace(/\/$/, '')}${parsed.pathname}${parsed.search}`;
}
