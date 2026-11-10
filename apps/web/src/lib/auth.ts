// Shared-password session auth. Edge-runtime safe (Web Crypto only) so the
// same helpers work in middleware.ts and in route handlers.
//
// Cookie value (v2): `<expiresAtMs>.<role>.<base64url(HMAC-SHA256(SESSION_SECRET, "v2.<role>.<expiresAtMs>"))>`
// role is 'admin' or 'site'.
//
// v1 token decision: v1 tokens (old format: `<exp>.<sig>`) are REJECTED.
// They cannot carry a role and therefore cannot claim admin. Users with v1
// tokens must log in again to receive a v2 token.

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

/** True when the minimum required env vars are present to authenticate someone. */
export function authConfigured(): boolean {
  return Boolean(
    process.env.SESSION_SECRET && (process.env.SITE_PASSWORD || process.env.ADMIN_PASSWORD),
  );
}

/** Create a signed v2 session token carrying the given role. */
export async function createSessionToken(
  role: 'admin' | 'site',
  now = Date.now(),
): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not set');
  const exp = now + SESSION_MAX_AGE_SEC * 1000;
  return `${exp}.${role}.${await hmac(secret, `v2.${role}.${exp}`)}`;
}

/**
 * Verify a session token and return its role, or null if invalid/expired.
 * Only v2 tokens are accepted. v1 tokens are rejected (see file header).
 */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<'admin' | 'site' | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return null;

  // v2 format has exactly three dot-separated segments: exp.role.sig
  const firstDot = token.indexOf('.');
  if (firstDot <= 0) return null;
  const secondDot = token.indexOf('.', firstDot + 1);
  if (secondDot <= firstDot + 1) return null;
  // Reject anything with a fourth dot (garbage)
  if (token.indexOf('.', secondDot + 1) !== -1) return null;

  const expStr = token.slice(0, firstDot);
  const role = token.slice(firstDot + 1, secondDot) as 'admin' | 'site';
  const sig = token.slice(secondDot + 1);

  if (role !== 'admin' && role !== 'site') return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;

  const expected = await hmac(secret, `v2.${role}.${expStr}`);
  if (!safeEqual(sig, expected)) return null;

  return role;
}

/**
 * Compare a submitted password with ADMIN_PASSWORD and SITE_PASSWORD.
 * Returns the matched role, or null if no match.
 * Always performs constant-time work for both comparisons to avoid timing leaks.
 */
export async function checkPassword(input: string): Promise<'admin' | 'site' | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  // Use sentinel empty strings so hmac computation is always performed,
  // even when an env var is unset (prevents timing differences).
  const adminPw = process.env.ADMIN_PASSWORD ?? '';
  const sitePw = process.env.SITE_PASSWORD ?? '';

  const [inputHash, adminHash, siteHash] = await Promise.all([
    hmac(secret, `pw.${input}`),
    hmac(secret, `pw.${adminPw}`),
    hmac(secret, `pw.${sitePw}`),
  ]);

  // Admin takes precedence when both passwords happen to be identical.
  if (process.env.ADMIN_PASSWORD && safeEqual(inputHash, adminHash)) return 'admin';
  if (process.env.SITE_PASSWORD && safeEqual(inputHash, siteHash)) return 'site';
  return null;
}

/** Only allow same-site relative redirect targets. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
