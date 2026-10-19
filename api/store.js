/**
 * Persistent Affiliate & Contract Attribution Store
 * IRIS Pay Document Portal
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'affiliates.json');

// Initial verified partners list
const DEFAULT_AFFILIATES = [
  { id: 'aff_1', name: 'ЛЛВ Технолоджис ЕООД', slug: 'llv-tech', email: 'sales@llvtechnology.com', createdAt: '2026-09-01T09:00:00.000Z', active: true },
  { id: 'aff_2', name: 'ТЕХ АКАДЕМИ ООД', slug: 'tech-academy', email: 'office@tech-academy.bg', createdAt: '2026-09-02T10:00:00.000Z', active: true },
  { id: 'aff_3', name: 'УРУКИ ООД', slug: 'uruki', email: 'uruki.ltd@gmail.com', createdAt: '2026-09-05T11:30:00.000Z', active: true },
  { id: 'aff_4', name: 'Счетоводна кантора Елвада ЕООД', slug: 'elvada', email: 'elvada@elvada.com', createdAt: '2026-09-08T14:00:00.000Z', active: true },
  { id: 'aff_5', name: 'Финблокс ЕООД', slug: 'finblox', email: 'george.shulev@finblox.io', createdAt: '2026-09-10T15:20:00.000Z', active: true },
  { id: 'aff_6', name: 'ПропъртиПиърс ООД', slug: 'propertypeers', email: 'sarasovi@propertypeers.eu', createdAt: '2026-09-12T09:45:00.000Z', active: true },
  { id: 'aff_7', name: 'Локалс ООД', slug: 'locals', email: 'evgenia.kondeva@locals.bg', createdAt: '2026-09-15T12:00:00.000Z', active: true },
  { id: 'aff_8', name: 'ТУГУД ТЕХНОЛОДЖИС ЕООД', slug: '2good-tech', email: 'office@2good.tech', createdAt: '2026-09-18T16:15:00.000Z', active: true },
  { id: 'aff_9', name: 'БАЛКАН СЪРВИСИС ООД', slug: 'balkan-services', email: 'vladimir.rashev@balkanservices.com', createdAt: '2026-09-20T10:30:00.000Z', active: true },
  { id: 'aff_10', name: 'Карма 17 ЕООД', slug: 'karma17', email: 'bob.bojkov@gmail.com', createdAt: '2026-09-22T13:40:00.000Z', active: true }
];

// Initial demo contracts to provide immediately visible, realistic statistics
const DEFAULT_CONTRACTS = [
  { id: 'cnt_101', affiliateSlug: 'tech-academy', companyName: '„Нова Трейд“ ЕООД', companyEik: '201948123', date: '2026-09-14T11:20:00.000Z' },
  { id: 'cnt_102', affiliateSlug: 'tech-academy', companyName: '„Дигитал Плюс“ ООД', companyEik: '204128994', date: '2026-09-28T14:35:00.000Z' },
  { id: 'cnt_103', affiliateSlug: 'tech-academy', companyName: '„ИТ Солюшънс БГ“ ЕООД', companyEik: '205881472', date: '2026-10-04T10:15:00.000Z' },
  { id: 'cnt_104', affiliateSlug: 'elvada', companyName: '„Прогрес Мениджмънт“ ООД', companyEik: '131492001', date: '2026-09-19T16:40:00.000Z' },
  { id: 'cnt_105', affiliateSlug: 'elvada', companyName: '„Смарт Файнънс“ ЕООД', companyEik: '206711902', date: '2026-10-11T13:05:00.000Z' },
  { id: 'cnt_106', affiliateSlug: 'llv-tech', companyName: '„Алфа Софтуер“ ООД', companyEik: '203491823', date: '2026-09-25T09:50:00.000Z' },
  { id: 'cnt_107', affiliateSlug: 'balkan-services', companyName: '„Еко Логистика“ ЕАД', companyEik: '175293041', date: '2026-10-08T15:30:00.000Z' },
  { id: 'cnt_108', affiliateSlug: 'finblox', companyName: '„Криптопей БГ“ ЕООД', companyEik: '207119448', date: '2026-10-15T12:10:00.000Z' }
];

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      affiliates: DEFAULT_AFFILIATES,
      contracts: DEFAULT_CONTRACTS,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

export function loadStore() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Store] Error loading data file, re-initializing:', err);
    return { affiliates: DEFAULT_AFFILIATES, contracts: DEFAULT_CONTRACTS };
  }
}

export function saveStore(data) {
  ensureDataFile();
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Clean & normalize a slug
 */
export function sanitizeSlug(input) {
  if (!input) return '';
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Get all affiliates with dynamic contract counters based on filters
 */
export function getAffiliatesData({ month = '', fromDate = '', toDate = '', search = '' } = {}) {
  const store = loadStore();
  const searchLower = (search || '').trim().toLowerCase();

  return store.affiliates.map(aff => {
    // Filter contracts for this affiliate
    const affContracts = store.contracts.filter(c => {
      if (c.affiliateSlug.toLowerCase() !== aff.slug.toLowerCase()) return false;

      const cDate = new Date(c.date);
      if (isNaN(cDate.getTime())) return false;

      // Month filter: format YYYY-MM
      if (month) {
        const cYearMonth = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}`;
        if (cYearMonth !== month) return false;
      }

      // From date filter: format YYYY-MM-DD
      if (fromDate) {
        const from = new Date(fromDate);
        if (!isNaN(from.getTime()) && cDate < from) return false;
      }

      // To date filter: format YYYY-MM-DD (end of day)
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        if (!isNaN(to.getTime()) && cDate > to) return false;
      }

      return true;
    });

    const allContractsForAff = store.contracts.filter(
      c => c.affiliateSlug.toLowerCase() === aff.slug.toLowerCase()
    );

    // Find latest contract date
    let lastContractDate = null;
    if (allContractsForAff.length > 0) {
      const sorted = [...allContractsForAff].sort((a, b) => new Date(b.date) - new Date(a.date));
      lastContractDate = sorted[0].date;
    }

    return {
      id: aff.id,
      name: aff.name,
      slug: aff.slug,
      email: aff.email || '',
      createdAt: aff.createdAt,
      active: aff.active !== false,
      contractCount: affContracts.length,
      totalContractCount: allContractsForAff.length,
      lastContractDate,
      contracts: affContracts
    };
  }).filter(aff => {
    if (!searchLower) return true;
    return (
      aff.name.toLowerCase().includes(searchLower) ||
      aff.slug.toLowerCase().includes(searchLower) ||
      (aff.email && aff.email.toLowerCase().includes(searchLower))
    );
  }).sort((a, b) => b.contractCount - a.contractCount || a.name.localeCompare(b.name));
}

/**
 * Create a new affiliate partner
 */
export function createAffiliate({ name, slug, email = '' }) {
  const store = loadStore();
  const cleanName = String(name || '').trim();
  const cleanSlug = sanitizeSlug(slug || name);

  if (!cleanName) {
    throw new Error('Името на партньора е задължително.');
  }
  if (!cleanSlug || cleanSlug.length < 2) {
    throw new Error('Кодът/линкът трябва да съдържа поне 2 символа (букви, цифри, тире).');
  }

  // Check for duplicate slug
  const exists = store.affiliates.find(a => a.slug.toLowerCase() === cleanSlug.toLowerCase());
  if (exists) {
    throw new Error(`Линк с код "${cleanSlug}" вече съществува за партньор "${exists.name}".`);
  }

  const newAff = {
    id: 'aff_' + Date.now(),
    name: cleanName,
    slug: cleanSlug,
    email: String(email || '').trim(),
    createdAt: new Date().toISOString(),
    active: true
  };

  store.affiliates.push(newAff);
  saveStore(store);
  return newAff;
}

/**
 * Record a contract attribution
 */
export function recordContractAttribution({ affiliateSlug, companyName, companyEik }) {
  if (!affiliateSlug) return null;
  const cleanSlug = sanitizeSlug(affiliateSlug);
  if (!cleanSlug) return null;

  const store = loadStore();

  // If partner does not exist yet, auto-register as custom affiliate
  let aff = store.affiliates.find(a => a.slug.toLowerCase() === cleanSlug.toLowerCase());
  if (!aff) {
    aff = {
      id: 'aff_' + Date.now(),
      name: cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1),
      slug: cleanSlug,
      email: '',
      createdAt: new Date().toISOString(),
      active: true
    };
    store.affiliates.push(aff);
  }

  const newContract = {
    id: 'cnt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    affiliateSlug: aff.slug,
    companyName: String(companyName || '—').trim(),
    companyEik: String(companyEik || '—').trim(),
    date: new Date().toISOString()
  };

  store.contracts.push(newContract);
  saveStore(store);
  console.log(`[Store] Contract attribution recorded for ${aff.slug}:`, newContract);
  return newContract;
}

/**
 * Summary KPI stats for dashboard
 */
export function getDashboardSummary({ month = '', fromDate = '', toDate = '' } = {}) {
  const store = loadStore();
  const affiliates = getAffiliatesData({ month, fromDate, toDate });

  const totalPartners = store.affiliates.length;
  const totalContractsAllTime = store.contracts.length;
  const periodContracts = affiliates.reduce((sum, a) => sum + a.contractCount, 0);

  // Top performing partner in period
  const topPartner = affiliates.length > 0 && affiliates[0].contractCount > 0
    ? { name: affiliates[0].name, slug: affiliates[0].slug, count: affiliates[0].contractCount }
    : null;

  // Distinct months available in data
  const monthsSet = new Set();
  store.contracts.forEach(c => {
    const d = new Date(c.date);
    if (!isNaN(d.getTime())) {
      monthsSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  });

  // Always include current and previous month
  const now = new Date();
  const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYm = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
  monthsSet.add(curYm);
  monthsSet.add(prevYm);

  const monthsList = Array.from(monthsSet).sort().reverse().map(ym => {
    const [y, m] = ym.split('-');
    const monthNames = [
      'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
      'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'
    ];
    return {
      value: ym,
      label: `${monthNames[parseInt(m, 10) - 1]} ${y} г.`
    };
  });

  return {
    totalPartners,
    totalContractsAllTime,
    periodContracts,
    topPartner,
    monthsList
  };
}
