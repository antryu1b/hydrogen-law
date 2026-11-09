// Shared-password session auth. Edge-runtime safe (Web Crypto only) so the
// same helpers work in middleware.ts and in route handlers.
//
// Cookie value: `<expiresAtMs>.<base64url(HMAC-SHA256(SESSION_SECRET, "v1.<expiresAtMs>"))>`

export const SESSION_COOKIE = 'hl_session';
/** Header the MCP proxies send so middleware lets them call /api/* without a cookie. */
export const MCP_PROXY_HEADER = 'x-mcp-proxy-token';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

function toBase64Url(buf: ArrayBuffer): string {
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export function authConfigured(): boolean {
  return Boolean(process.env.SITE_PASSWORD && process.env.SESSION_SECRET);
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not set');
  const exp = now + SESSION_MAX_AGE_SEC * 1000;
  return `${exp}.${await hmac(secret, `v1.${exp}`)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return safeEqual(sig, await hmac(secret, `v1.${expStr}`));
}

/** Compare a submitted password with SITE_PASSWORD without leaking length/timing. */
export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.SITE_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!expected || !secret) return false;
  const [a, b] = await Promise.all([hmac(secret, `pw.${input}`), hmac(secret, `pw.${expected}`)]);
  return safeEqual(a, b);
}

/** Only allow same-site relative redirect targets. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
