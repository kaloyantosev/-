/**
 * Protected Affiliates & Tracking Management API
 * IRIS Pay Document Portal
 * 
 * Endpoints:
 * - GET    /api/affiliates: Fetch partners with contract counts filtered by month/period
 * - POST   /api/affiliates: Create a new affiliate link
 * - DELETE /api/affiliates: Delete an attributed contract (or action=deleteContract)
 */

import { verifySession } from './auth.js';
import { getAffiliatesData, createAffiliate, getDashboardSummary, deleteContract, deleteAffiliate } from './store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Session Authorization Verification
  const session = verifySession(req);
  if (!session) {
    return res.status(401).json({
      error: 'Нямате оторизация за достъп. Моля, влезте в профила си през /login.',
      code: 'UNAUTHORIZED'
    });
  }

  const action = req.query?.action || (typeof req.body === 'object' ? req.body?.action : null);

  // 2. DELETE (or POST with action=deleteContract / action=deleteAffiliate)
  if (req.method === 'DELETE' || action === 'deleteContract' || action === 'deleteAffiliate') {
    // Only users with role === 'admin' are allowed to delete contracts or partners
    if (session.role !== 'admin' && session.user !== 'admin') {
      return res.status(403).json({
        error: 'Нямате права за изтриване на договори или партньори. Тази операция изисква администраторски достъп през /admin.',
        code: 'FORBIDDEN'
      });
    }

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const reqAction = action || body?.action || req.query?.action;

      if (reqAction === 'deleteAffiliate') {
        const affiliateId = req.query?.affiliateId || body?.affiliateId;
        const slug = req.query?.slug || body?.slug;

        const result = await deleteAffiliate({ affiliateId, slug });
        return res.status(200).json({
          success: true,
          message: `Партньорът „${result.deletedAffiliate}“ беше изтрит. ${result.reattributedContracts} договора бяха прехвърлени като договори без партньор.`
        });
      }

      const contractId = req.query?.contractId || body?.contractId;
      if (!contractId) {
        return res.status(400).json({ error: 'Липсва ID на договора за изтриване.' });
      }

      await deleteContract({ contractId });

      return res.status(200).json({
        success: true,
        message: 'Договорът беше успешно изтрит.'
      });
    } catch (err) {
      console.error('[Affiliates API DELETE error]:', err);
      return res.status(400).json({ error: err.message || 'Грешка при изтриване.' });
    }
  }

  // 3. GET: List affiliates & statistics
  if (req.method === 'GET') {
    try {
      const { month = '', fromDate = '', toDate = '', search = '' } = req.query || {};

      const affiliates = await getAffiliatesData({ month, fromDate, toDate, search });
      const summary = await getDashboardSummary({ month, fromDate, toDate });

      return res.status(200).json({
        success: true,
        summary,
        affiliates,
        user: session.user,
        role: session.role
      });
    } catch (err) {
      console.error('[Affiliates API GET error]:', err);
      return res.status(500).json({ error: 'Възникна грешка при зареждане на данните.' });
    }
  }

  // 4. POST: Create a new affiliate link
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { name, slug } = body || {};

      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Името на партньора е задължително.' });
      }

      const created = await createAffiliate({ name, slug });

      return res.status(201).json({
        success: true,
        affiliate: created,
        message: `Успешно генериран нов affiliate link: /${created.slug}`
      });
    } catch (err) {
      console.error('[Affiliates API POST error]:', err);
      return res.status(400).json({ error: err.message || 'Грешка при създаване на партньор.' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
