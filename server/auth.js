// shopdesk — scrypt password hashing + session middleware (async, MongoDB-backed)
import crypto from 'node:crypto';
import { models } from './db.js';

const SESSION_DAYS = 30;
export const COOKIE = 'shopdesk_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64, { N: Number(N), r: Number(r), p: Number(p) });
    const expected = Buffer.from(hashHex, 'hex');
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export async function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await models.Session.create({ token, userId: user._id, businessId: user.businessId, expiresAt });
  return token;
}

export async function destroySession(token) {
  await models.Session.deleteOne({ token });
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

export async function attachUser(req, _res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    req.sessionToken = cookies[COOKIE] || null;
    req.user = null;
    req.businessId = null;
    if (req.sessionToken) {
      const session = await models.Session.findOne({ token: req.sessionToken, expiresAt: { $gt: new Date() } }).lean();
      if (session) {
        const user = await models.User.findById(session.userId).lean();
        if (user) {
          req.user = { id: String(user._id), name: user.name, email: user.email, role: user.role, businessId: String(user.businessId) };
          req.businessId = user.businessId;
        }
      }
    }
  } catch (err) {
    console.error('attachUser failed:', err);
    req.user = null; req.businessId = null;
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

export function sessionCookie(token, secure = true) {
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
