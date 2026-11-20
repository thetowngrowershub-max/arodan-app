// Minimal HS256 JSON Web Tokens using Node's crypto (no extra dependency).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

const b64 = (b) => Buffer.from(b).toString('base64url');

export function signToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ sub: userId, iat: now, exp: now + config.sessionDays * 86400 }));
  const sig = createHmac('sha256', config.jwtSecret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/** Returns the user id, or null if the token is missing, forged or expired. */
export function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = createHmac('sha256', config.jwtSecret).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (typeof p.sub !== 'string' || typeof p.exp !== 'number' || p.exp < Date.now() / 1000) return null;
    return p.sub;
  } catch {
    return null;
  }
}
