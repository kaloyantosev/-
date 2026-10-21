/**
 * Secure Authentication & Session Management Module (with 2FA & Admin Role)
 * IRIS Pay Document Portal
 * 
 * Credentials:
 *   Sales: sales@irisbgsf.com / 1!2@3№4$ (Requires 2FA sent to kaloyan.tosev@gmail.com)
 *   Admin: admin / q:?h+@N]52j5oh_
 */

import crypto from 'crypto';
import { getSettings } from './store.js';

// Server secret salt for password hashing & token signing
const SERVER_SALT = process.env.AUTH_SECRET || 'iris_pay_secure_salt_8f4b29a10c7e43d99a2f7';

// Valid credentials
const VALID_SALES_EMAIL = 'sales@irisbgsf.com';
const EXPECTED_SALES_HASH = crypto.createHmac('sha256', SERVER_SALT).update('1!2@3№4$').digest('hex');

const ADMIN_USERNAME = 'admin';
const EXPECTED_ADMIN_HASH = crypto.createHmac('sha256', SERVER_SALT).update('q:?h+@N]52j5oh_').digest('hex');

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

  if (record.lockoutUntil && now < record.lockoutUntil) {
    const minutesLeft = Math.ceil((record.lockoutUntil - now) / 60000);
    return {
      allowed: false,
      lockout: true,
      minutesLeft,
      message: `Твърде много неуспешни опити. Достъпът е временно блокиран за ${minutesLeft} минути с цел защита.`
    };
  }

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
 */
export function createSessionToken(username, role = 'sales') {
  const payload = {
    user: username,
    role,
    exp: Date.now() + SESSION_TTL_MS,
    nonce: crypto.randomBytes(16).toString('hex')
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SERVER_SALT).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

/**
 * Creates a signed 2FA Challenge Ticket.
 */
export function create2FaTicket(email, code) {
  const codeHash = crypto.createHmac('sha256', SERVER_SALT).update(String(code).trim()).digest('hex');
  const payload = {
    email,
    codeHash,
    exp: Date.now() + 10 * 60 * 1000, // 10 minutes
    nonce: crypto.randomBytes(12).toString('hex')
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SERVER_SALT).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a 2FA Challenge Ticket and code.
 */
export function verify2FaTicket(ticket, code) {
  if (!ticket || !code) return { valid: false, error: 'Липсва код или сесия за 2FA верификация.' };
  const parts = String(ticket).split('.');
  if (parts.length !== 2) return { valid: false, error: 'Невалиден 2FA билет.' };

  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', SERVER_SALT).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(signature, 'utf-8');
  const expBuf = Buffer.from(expectedSig, 'utf-8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: 'Невалиден подпис на 2FA заявката.' };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (!payload || Date.now() > payload.exp) {
      return { valid: false, error: 'Кодът за сигурност е изтекъл. Моля, поискайте нов код.' };
    }

    const testHash = crypto.createHmac('sha256', SERVER_SALT).update(String(code).trim()).digest('hex');
    const hashBuf = Buffer.from(testHash, 'utf-8');
    const expectedHashBuf = Buffer.from(payload.codeHash, 'utf-8');

    if (hashBuf.length !== expectedHashBuf.length || !crypto.timingSafeEqual(hashBuf, expectedHashBuf)) {
      return { valid: false, error: 'Грешен код за сигурност. Моля, проверете отново.' };
    }

    return { valid: true, email: payload.email };
  } catch (err) {
    return { valid: false, error: 'Грешка при проверка на кода.' };
  }
}

/**
 * Send 2FA email notification via Resend API
 */
async function send2FaEmail({ to, code }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[2FA Security Code Dev Fallback] -> To: ${to} | Code: ${code}`);
    return true;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; margin: 0; }
    .card { max-width: 460px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #1F3864; color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; }
    .content { padding: 32px 24px; text-align: center; }
    .p-desc { font-size: 14px; color: #64748b; margin-bottom: 24px; line-height: 1.5; }
    .code-box { display: inline-block; background: #F1F5F9; border: 2px dashed #2E75B6; border-radius: 8px; padding: 14px 28px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1F3864; font-family: monospace; margin-bottom: 24px; }
    .notice { font-size: 12px; color: #94a3b8; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>IRIS Pay Портал</h1>
    </div>
    <div class="content">
      <p class="p-desc">Вашият еднократен 6-цифрен код за двуфакторна автентикация (2FA) при вход е:</p>
      <div class="code-box">${code}</div>
      <p class="notice">Кодът е валиден 10 минути. Ако не сте заявили вход в системата, моля игнорирайте това съобщение.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'IRIS Pay Security <onboarding@resend.dev>',
        to: [to],
        subject: `Код за сигурност: ${code} - IRIS Pay Портал`,
        text: `Вашият код за двуфакторна автентикация в IRIS Pay Портал е: ${code} (валиден 10 минути).`,
        html
      })
    });
    console.log('[2FA Email Resend status]:', res.status);
    return res.ok;
  } catch (err) {
    console.error('[2FA Email Error]:', err);
    return false;
  }
}

export function extractToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const cookieHeader = req.headers['cookie'] || '';
  const match = cookieHeader.match(/iris_auth_token=([^;]+)/);
  if (match) {
    return match[1].trim();
  }

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
      role: payload.role || (payload.user === 'admin' ? 'admin' : 'sales'),
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
        role: session.role,
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

  // 3. Verify 2FA Code (Step 2 of login)
  if (action === 'verify-2fa') {
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.message });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { ticket, code } = body || {};

    const verification = verify2FaTicket(ticket, code);
    if (!verification.valid) {
      recordFailedAttempt(ip);
      return res.status(401).json({ error: verification.error });
    }

    // Success! Reset rate limit and issue full session token
    resetRateLimit(ip);
    const token = createSessionToken(VALID_SALES_EMAIL, 'sales');
    const expiresAt = Date.now() + SESSION_TTL_MS;

    res.setHeader(
      'Set-Cookie',
      `iris_auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
    );

    return res.status(200).json({
      success: true,
      token,
      user: VALID_SALES_EMAIL,
      role: 'sales',
      expiresAt,
      redirect: '/dashboard',
      message: 'Успешен вход в системата.'
    });
  }

  // 4. Resend 2FA Code
  if (action === 'resend-2fa') {
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.message });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { ticket } = body || {};

    // Validate current ticket first
    if (!ticket) return res.status(400).json({ error: 'Липсва 2FA сесия.' });
    const parts = String(ticket).split('.');
    if (parts.length !== 2) return res.status(400).json({ error: 'Невалидна 2FA сесия.' });

    let email = VALID_SALES_EMAIL;
    try {
      const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
      if (payload && payload.email) email = payload.email;
    } catch (e) {}

    const newCode = String(Math.floor(100000 + Math.random() * 900000));
    let targetEmail = process.env.AUTH_2FA_EMAIL || 'kaloyan.tosev@gmail.com';
    try {
      const settings = await getSettings();
      if (settings?.twoFaEmail) targetEmail = settings.twoFaEmail;
    } catch (e) {}
    await send2FaEmail({ to: targetEmail, code: newCode });

    const newTicket = create2FaTicket(email, newCode);
    return res.status(200).json({
      success: true,
      ticket: newTicket,
      message: 'Нов код за сигурност беше изпратен на вашия имейл.'
    });
  }

  // 5. Initial Login endpoint (Step 1)
  if (req.method === 'POST') {
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.message });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { username, password, email } = body || {};
    const inputUser = String(username || email || '').trim().toLowerCase();
    const inputPass = String(password || '');

    if (!inputUser || !inputPass) {
      return res.status(400).json({ error: 'Моля, въведете имейл / потребител и парола.' });
    }

    // A. Check ADMIN credentials (admin / q:?h+@N]52j5oh_)
    const isAdminUser = inputUser === ADMIN_USERNAME;
    const givenAdminHash = crypto.createHmac('sha256', SERVER_SALT).update(inputPass).digest('hex');
    const isAdminPassValid = crypto.timingSafeEqual(
      Buffer.from(givenAdminHash, 'utf-8'),
      Buffer.from(EXPECTED_ADMIN_HASH, 'utf-8')
    );

    if (isAdminUser && isAdminPassValid) {
      resetRateLimit(ip);
      const token = createSessionToken(ADMIN_USERNAME, 'admin');
      const expiresAt = Date.now() + SESSION_TTL_MS;

      console.log(`[Security] Successful ADMIN login from IP ${ip}`);
      res.setHeader(
        'Set-Cookie',
        `iris_auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
      );

      return res.status(200).json({
        success: true,
        token,
        user: ADMIN_USERNAME,
        role: 'admin',
        expiresAt,
        redirect: '/admin',
        message: 'Успешен администраторски вход.'
      });
    }

    // B. Check SALES credentials (sales@irisbgsf.com or sales / 1!2@3№4$)
    const isSalesUser = (inputUser === VALID_SALES_EMAIL || inputUser === 'sales');
    const givenSalesHash = crypto.createHmac('sha256', SERVER_SALT).update(inputPass).digest('hex');
    const isSalesPassValid = crypto.timingSafeEqual(
      Buffer.from(givenSalesHash, 'utf-8'),
      Buffer.from(EXPECTED_SALES_HASH, 'utf-8')
    );

    if (isSalesUser && isSalesPassValid) {
      resetRateLimit(ip);

      // Generate 6-digit 2FA code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      // Send 2FA email (defaults to kaloyan.tosev@gmail.com, configurable in admin)
      let target2FaEmail = process.env.AUTH_2FA_EMAIL || 'kaloyan.tosev@gmail.com';
      try {
        const settings = await getSettings();
        if (settings?.twoFaEmail) target2FaEmail = settings.twoFaEmail;
      } catch (e) {}

      console.log(`[Security] Sales login step 1 passed for ${inputUser}. Sending 2FA code to ${target2FaEmail}`);
      await send2FaEmail({ to: target2FaEmail, code });

      const ticket = create2FaTicket(VALID_SALES_EMAIL, code);

      return res.status(200).json({
        success: true,
        require2fa: true,
        ticket,
        targetEmail: VALID_SALES_EMAIL,
        message: 'Паролата е потвърдена. Изпратен е 6-цифрен код за сигурност.'
      });
    }

    // Invalid credentials
    recordFailedAttempt(ip);
    return res.status(401).json({
      error: 'Грешен имейл или парола.'
    });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
