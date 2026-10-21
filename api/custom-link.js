/**
 * Custom Commission One-Time Link API
 * IRIS Pay Document Portal
 * 
 * Endpoints:
 * - GET    /api/custom-link?token=xyz : Public validation for visitors opening a custom link
 * - GET    /api/custom-link           : Protected listing for the dashboard
 * - POST   /api/custom-link           : Protected creation of a new one-time link
 * - DELETE /api/custom-link           : Protected deletion/cancellation of a custom link
 */

import { verifySession } from './auth.js';
import { 
  createCustomLink, 
  getCustomLink, 
  listCustomLinks, 
  deleteCustomLink 
} from './store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. PUBLIC GET with token: Validate one-time link for contract viewer
  if (req.method === 'GET' && req.query?.token) {
    try {
      const token = req.query.token;
      const link = await getCustomLink(token);

      if (!link) {
        return res.status(404).json({
          valid: false,
          error: 'Линкът за индивидуална комисионна не съществува или е изтекъл.'
        });
      }

      if (link.used) {
        return res.status(410).json({
          valid: false,
          used: true,
          usedAt: link.usedAt,
          companyName: link.usedByCompanyName,
          error: 'Този еднократен линк вече е използван за подписване на договор и не е активен.'
        });
      }

      return res.status(200).json({
        valid: true,
        used: false,
        token: link.token,
        commission: link.commission,
        partnerSlug: link.partnerSlug || null,
        partnerName: link.partnerName || null,
        note: link.note || ''
      });
    } catch (err) {
      console.error('[CustomLink API Public GET error]:', err);
      return res.status(500).json({ valid: false, error: 'Грешка при проверка на линка.' });
    }
  }

  // All other operations require admin session authorization
  const session = verifySession(req);
  if (!session) {
    return res.status(401).json({
      error: 'Нямате оторизация за достъп. Моля, влезте в профила си през /login.',
      code: 'UNAUTHORIZED'
    });
  }

  // 2. PROTECTED GET: List all custom links
  if (req.method === 'GET') {
    try {
      const country = req.query?.country || null;
      const links = await listCustomLinks(country);
      return res.status(200).json({
        success: true,
        links
      });
    } catch (err) {
      console.error('[CustomLink API GET list error]:', err);
      return res.status(500).json({ error: 'Грешка при зареждане на линковете.' });
    }
  }

  // 3. PROTECTED POST: Create a new custom commission link
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { commission, note = '', partnerSlug = null, country = 'bg' } = body || {};

      if (!commission || !String(commission).trim()) {
        return res.status(400).json({ error: 'Комисионната е задължителна (напр. 0.35%).' });
      }

      const link = await createCustomLink({ commission, note, partnerSlug, country });
      return res.status(201).json({
        success: true,
        link,
        token: link.token,
        partnerSlug: link.partnerSlug,
        partnerName: link.partnerName,
        commission: link.commission,
        country: link.country,
        message: `Успешно генериран еднократен линк с комисионна ${link.commission}`
      });
    } catch (err) {
      console.error('[CustomLink API POST error]:', err);
      return res.status(400).json({ error: err.message || 'Грешка при създаване на линка.' });
    }
  }

  // 4. PROTECTED DELETE: Cancel/delete an unused custom link
  if (req.method === 'DELETE') {
    // Only users with role === 'admin' are allowed to delete custom links
    if (session.role !== 'admin' && session.user !== 'admin') {
      return res.status(403).json({
        error: 'Нямате права за изтриване на еднократни оферти. Тази операция изисква администраторски достъп през /admin.',
        code: 'FORBIDDEN'
      });
    }

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const token = req.query?.token || body?.token;
      const id = req.query?.id || body?.id;

      if (!token && !id) {
        return res.status(400).json({ error: 'Липсва параметър за изтриване на линка.' });
      }

      await deleteCustomLink({ id, token });
      return res.status(200).json({
        success: true,
        message: 'Линкът беше успешно изтрит.'
      });
    } catch (err) {
      console.error('[CustomLink API DELETE error]:', err);
      return res.status(400).json({ error: err.message || 'Грешка при изтриване на линка.' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
