/**
 * Admin Panel API Handler
 * IRIS Pay Document Portal
 * Endpoint: /api/admin
 * Protected: Requires role === 'admin'
 */

import { verifySession } from './auth.js';
import { 
  loadStore, 
  saveStore, 
  getSettings, 
  updateSettings, 
  getAllContracts, 
  deleteContract, 
  deleteAffiliate, 
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

  // 1. Verify admin session
  const session = verifySession(req);
  if (!session) {
    return res.status(401).json({
      error: 'Нямате оторизация за достъп. Моля, влезте като администратор през /login.',
      code: 'UNAUTHORIZED'
    });
  }

  if (session.role !== 'admin' && session.user !== 'admin') {
    return res.status(403).json({
      error: 'Нямате администраторски права за този панел.',
      code: 'FORBIDDEN'
    });
  }

  const action = req.query?.action || req.body?.action || 'overview';

  try {
    // 2. GET Overview & Data
    if (req.method === 'GET' && action === 'overview') {
      const store = await loadStore();
      const settings = await getSettings();
      const contracts = await getAllContracts();
      const customLinks = await listCustomLinks();

      return res.status(200).json({
        success: true,
        settings,
        affiliates: store.affiliates || [],
        contracts,
        customLinks,
        stats: {
          totalPartners: (store.affiliates || []).length,
          totalContracts: (store.contracts || []).length,
          totalCustomLinks: (store.customLinks || []).length,
          activeCustomLinks: (store.customLinks || []).filter(l => !l.used).length,
          usedCustomLinks: (store.customLinks || []).filter(l => l.used).length
        }
      });
    }

    // 3. GET Settings Only
    if (req.method === 'GET' && action === 'settings') {
      const settings = await getSettings();
      return res.status(200).json({ success: true, settings });
    }

    // 4. POST Update Settings
    if (req.method === 'POST' && action === 'settings') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { settings } = body;
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Невалидни данни за настройки.' });
      }

      const updated = await updateSettings(settings);
      return res.status(200).json({
        success: true,
        settings: updated,
        message: 'Настройките бяха запазени успешно.'
      });
    }

    // 5. GET Export Backup
    if (req.method === 'GET' && action === 'export-backup') {
      const store = await loadStore();
      res.setHeader('Content-Disposition', `attachment; filename="iris_backup_${new Date().toISOString().slice(0, 10)}.json"`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).send(JSON.stringify(store, null, 2));
    }

    // 6. POST Import Backup
    if (req.method === 'POST' && action === 'import-backup') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { backupData } = body;

      if (!backupData || typeof backupData !== 'object') {
        return res.status(400).json({ error: 'Невалиден формат на архивните данни.' });
      }

      const current = await loadStore();
      current.affiliates = Array.isArray(backupData.affiliates) ? backupData.affiliates : current.affiliates;
      current.contracts = Array.isArray(backupData.contracts) ? backupData.contracts : current.contracts;
      current.customLinks = Array.isArray(backupData.customLinks) ? backupData.customLinks : current.customLinks;
      if (backupData.settings) {
        current.settings = { ...current.settings, ...backupData.settings };
      }

      await saveStore(current);
      return res.status(200).json({
        success: true,
        message: 'Данните бяха успешно възстановени от архива.'
      });
    }

    // 7. DELETE Contract
    if (action === 'delete-contract') {
      const contractId = req.query?.id || req.body?.id;
      if (!contractId) return res.status(400).json({ error: 'Липсва ID на договора.' });

      await deleteContract(contractId);
      return res.status(200).json({ success: true, message: 'Договорът беше изтрит.' });
    }

    // 8. DELETE Affiliate
    if (action === 'delete-affiliate') {
      const slug = req.query?.slug || req.body?.slug;
      const affiliateId = req.query?.id || req.body?.id;
      if (!slug && !affiliateId) return res.status(400).json({ error: 'Липсва идентификатор на партньора.' });

      await deleteAffiliate({ affiliateId, slug });
      return res.status(200).json({ success: true, message: 'Партньорът беше изтрит.' });
    }

    // 9. DELETE Custom Link
    if (action === 'delete-custom-link') {
      const token = req.query?.token || req.body?.token;
      const id = req.query?.id || req.body?.id;
      if (!token && !id) return res.status(400).json({ error: 'Липсва параметър на линка.' });

      await deleteCustomLink({ id, token });
      return res.status(200).json({ success: true, message: 'Линкът беше изтрит.' });
    }

    return res.status(400).json({ error: 'Непознато действие.' });
  } catch (err) {
    console.error('[Admin API error]:', err);
    return res.status(500).json({ error: err.message || 'Вътрешна грешка на сървъра.' });
  }
}
