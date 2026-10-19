/**
 * Secure Authentication & Session Management Module
 * IRIS Pay Document Portal
 * 
 * Credentials:
 *   User: sales
 *   Password: 1!2@3№4$
 * 
 * Security features:
 * - HMAC-SHA256 / timingSafeEqual password verification (prevents timing attacks)
 * - Anti-Brute-Force Rate Limiting (locks out after 5 failed attempts for 15 min)
 * - Cryptographic 256-bit session tokens with expiration
 * - HttpOnly & SameSite=Strict cookie + Bearer token support
 * - Session invalidation on logout
 */

import crypto from 'crypto';

// Server salt for password hashing (unique to instance)
const SERVER_SALT = process.env.AUTH_SECRET || 'iris_pay_secure_salt_8f4b29a10c7e43d';

// Valid credentials
const VALID_USERNAME = 'sales';
// Pre-computed HMAC-SHA256 hash of '1!2@3№4$' with SERVER_SALT
const EXPECTED_HASH = crypto.createHmac('sha256', SERVER_SALT).update('1!2@3№4$').digest('hex');

// In-memory rate-limiting store: ip -> { attempts: count, lockoutUntil: timestamp, firstAttempt: timestamp }
const rateLimitMap = new Map();
// Active sessions store: token -> { user, ip, userAgent, createdAt, expiresAt }
const sessionsMap = new Map();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPTS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record) return { allowed: true };

  // Check if locked out
  if (record.lockoutUntil && now < record.lockoutUntil) {
    const minutesLeft = Math.ceil((record.lockoutUntil - now) / 60000);
    return {
      allowed: false,
      lockout: true,
      minutesLeft,
      message: `Твърде много неуспешни опити. Достъпът е блокиран за още ${minutesLeft} минути с цел защита.`
    };
  }

  // If window expired, reset
  if (now - record.firstAttempt > ATTEMPTS_WINDOW_MS) {
    rateLimitMap.delete(ip);
    return { allowed: true };
  }

  return { allowed: true, attempts: record.attempts };
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { attempts: 0, firstAttempt: now, lockoutUntil: 0 };
  record.attempts += 1;

  if (record.attempts >= MAX_FAILED_ATTEMPTS) {
    record.lockoutUntil = now + LOCKOUT_DURATION_MS;
    console.warn(`[Security Alert] IP ${ip} locked out due to ${record.attempts} failed login attempts.`);
  }

  rateLimitMap.set(ip, record);
}

function resetRateLimit(ip) {
  rateLimitMap.delete(ip);
}

export function extractToken(req) {
  // 1. From Authorization Header
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. From Cookie Header
  const cookieHeader = req.headers['cookie'] || '';
  const match = cookieHeader.match(/iris_auth_token=([^;]+)/);
  if (match) {
    return match[1].trim();
  }

  // 3. From Query Param
  if (req.query?.token) {
    return String(req.query.token).trim();
  }

  return null;
}

export function verifySession(req) {
  const token = extractToken(req);
  if (!token) return null;

  const session = sessionsMap.get(token);
  if (!session) return null;

  // Check expiry
  if (Date.now() > session.expiresAt) {
    sessionsMap.delete(token);
    return null;
  }

  return session;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const ip = getClientIp(req);
  const action = req.query?.action || req.body?.action || 'login';

  // 1. Session check endpoint
  if (req.method === 'GET' || action === 'check') {
    const session = verifySession(req);
    if (session) {
      return res.status(200).json({
        authenticated: true,
        user: session.user,
        expiresAt: session.expiresAt
      });
    }
    return res.status(200).json({ authenticated: false });
  }

  // 2. Logout endpoint
  if (action === 'logout') {
    const token = extractToken(req);
    if (token) {
      sessionsMap.delete(token);
    }
    res.setHeader('Set-Cookie', 'iris_auth_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    return res.status(200).json({ success: true, message: 'Успешен изход.' });
  }

  // 3. Login endpoint
  if (req.method === 'POST') {
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.message });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { username, password } = body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Моля, въведете потребителско име и парола.' });
    }

    // Verify username
    const isUserValid = String(username).trim().toLowerCase() === VALID_USERNAME;

    // Verify password with timingSafeEqual
    const givenHash = crypto.createHmac('sha256', SERVER_SALT).update(String(password)).digest('hex');
    const isPasswordValid = crypto.timingSafeEqual(
      Buffer.from(givenHash, 'utf-8'),
      Buffer.from(EXPECTED_HASH, 'utf-8')
    );

    if (!isUserValid || !isPasswordValid) {
      recordFailedAttempt(ip);
      const remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - (rateLimitMap.get(ip)?.attempts || 0));
      return res.status(401).json({
        error: 'Грешно потребителско име или парола.',
        remainingAttempts: remainingAttempts > 0 ? remainingAttempts : 0
      });
    }

    // Successful login: reset rate limit
    resetRateLimit(ip);

    // Create secure 256-bit random session token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_TTL_MS;

    sessionsMap.set(token, {
      user: VALID_USERNAME,
      ip,
      userAgent: req.headers['user-agent'] || '',
      createdAt: Date.now(),
      expiresAt
    });

    console.log(`[Security] Successful login for user "${VALID_USERNAME}" from IP ${ip}`);

    // Set secure cookie
    res.setHeader(
      'Set-Cookie',
      `iris_auth_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`
    );

    return res.status(200).json({
      success: true,
      token,
      user: VALID_USERNAME,
      expiresAt,
      message: 'Успешен вход в системата.'
    });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
