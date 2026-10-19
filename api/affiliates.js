/**
 * Protected Affiliates & Tracking Management API
 * IRIS Pay Document Portal
 * 
 * Endpoints:
 * - GET  /api/affiliates: Fetch partners with contract counts filtered by month/period
 * - POST /api/affiliates: Create a new affiliate link
 */

import { verifySession } from './auth.js';
import { getAffiliatesData, createAffiliate, getDashboardSummary } from './store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

  // 2. GET: List affiliates & statistics
  if (req.method === 'GET') {
    try {
      const { month = '', fromDate = '', toDate = '', search = '' } = req.query || {};

      const affiliates = getAffiliatesData({ month, fromDate, toDate, search });
      const summary = getDashboardSummary({ month, fromDate, toDate });

      return res.status(200).json({
        success: true,
        summary,
        affiliates,
        user: session.user
      });
    } catch (err) {
      console.error('[Affiliates API GET error]:', err);
      return res.status(500).json({ error: 'Възникна грешка при зареждане на данните.' });
    }
  }

  // 3. POST: Create a new affiliate link
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { name, slug } = body || {};

      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Името на партньора е задължително.' });
      }

      const created = createAffiliate({ name, slug });

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
