// shopdesk — scrypt password hashing + session middleware (no native deps)
import crypto from 'node:crypto';
import { q } from './db.js';

const SESSION_DAYS = 30;
export const COOKIE = 'shopdesk_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64, { N: Number(N), r: Number(r), p: Number(p) });
    const expected = Buffer.from(hashHex, 'hex');
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const expiresStr = `${expires.getFullYear()}-${p(expires.getMonth() + 1)}-${p(expires.getDate())} ${p(expires.getHours())}:${p(expires.getMinutes())}:${p(expires.getSeconds())}`;
  q.run('INSERT INTO sessions(token, user_id, expires_at) VALUES (?,?,?)', token, userId, expiresStr);
  return token;
}

export function destroySession(token) {
  q.run('DELETE FROM sessions WHERE token = ?', token);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function attachUser(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE];
  req.sessionToken = token || null;
  req.user = null;
  if (token) {
    const row = q.get(
      `SELECT u.id, u.name, u.email, u.role, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now','localtime')`,
      token
    );
    if (row) req.user = { id: row.id, name: row.name, email: row.email, role: row.role };
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only an admin can do that.' });
  next();
}
