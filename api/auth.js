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
 * - Cryptographically signed stateless session tokens (tamper-proof, robust across all lambda/server environments)
 * - HttpOnly & SameSite=Lax cookie + Bearer token support
 */

import crypto from 'crypto';

// Server secret salt for password hashing & token signing
const SERVER_SALT = process.env.AUTH_SECRET || 'iris_pay_secure_salt_8f4b29a10c7e43d99a2f7';

// Valid credentials
const VALID_USERNAME = 'sales';
// Pre-computed HMAC-SHA256 hash of '1!2@3№4$' with SERVER_SALT
const EXPECTED_HASH = crypto.createHmac('sha256', SERVER_SALT).update('1!2@3№4$').digest('hex');

// In-memory rate-limiting store: ip -> { attempts: count, lockoutUntil: timestamp, firstAttempt: timestamp }
const rateLimitMap = new Map();

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
      message: `Твърде много неуспешни опити. Достъпът е временно блокиран за ${minutesLeft} минути с цел защита.`
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

/**
 * Creates a cryptographically signed session token.
 * Stateless, tamper-proof, and resilient across multiple serverless lambdas.
 */
export function createSessionToken(username) {
  const payload = {
    user: username,
    exp: Date.now() + SESSION_TTL_MS,
    nonce: crypto.randomBytes(16).toString('hex')
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SERVER_SALT).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
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
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;

  const expectedSignature = crypto.createHmac('sha256', SERVER_SALT).update(payloadB64).digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf-8');
  const expBuf = Buffer.from(expectedSignature, 'utf-8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (!payload || !payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return {
      user: payload.user,
      expiresAt: payload.exp
    };
  } catch (err) {
    return null;
  }
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
    res.setHeader('Set-Cookie', 'iris_auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
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
      // No remaining attempts displayed as requested by user
      return res.status(401).json({
        error: 'Грешно потребителско име или парола.'
      });
    }

    // Successful login: reset rate limit
    resetRateLimit(ip);

    // Create cryptographically signed token
    const token = createSessionToken(VALID_USERNAME);
    const expiresAt = Date.now() + SESSION_TTL_MS;

    console.log(`[Security] Successful login for user "${VALID_USERNAME}" from IP ${ip}`);

    // Set secure cookie
    res.setHeader(
      'Set-Cookie',
      `iris_auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
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
