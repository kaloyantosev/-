/**
 * Persistent Affiliate & Contract Attribution Store
 * IRIS Pay Document Portal
 * 
 * Supports both local environment and Vercel/AWS Lambda serverless environments
 * (handles read-only /var/task filesystem by utilizing /tmp).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const LOCAL_DATA_DIR = path.join(ROOT_DIR, 'data');
const LOCAL_DATA_FILE = path.join(LOCAL_DATA_DIR, 'affiliates.json');
const TMP_DATA_FILE = path.join(os.tmpdir(), 'iris_affiliates.json');

// All demo/initial affiliate links removed as requested
const DEFAULT_AFFILIATES = [];
const DEFAULT_CONTRACTS = [];

// In-memory cache for fast read/write within the container
let cachedStore = null;

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/**
 * Load store data from /tmp (if modified), bundled local file, or default empty structure
 */
export function loadStore() {
  if (cachedStore) {
    return cachedStore;
  }

  // 1. Try /tmp file first (contains latest writes in serverless)
  try {
    if (fs.existsSync(TMP_DATA_FILE)) {
      const raw = fs.readFileSync(TMP_DATA_FILE, 'utf-8');
      cachedStore = JSON.parse(raw);
      return cachedStore;
    }
  } catch (err) {
    console.warn('[Store] Warning reading tmp data file:', err.message);
  }

  // 2. Try local project file
  try {
    if (fs.existsSync(LOCAL_DATA_FILE)) {
      const raw = fs.readFileSync(LOCAL_DATA_FILE, 'utf-8');
      cachedStore = JSON.parse(raw);
      return cachedStore;
    }
  } catch (err) {
    console.warn('[Store] Warning reading local data file:', err.message);
  }

  // 3. Fallback to empty default
  cachedStore = {
    affiliates: DEFAULT_AFFILIATES,
    contracts: DEFAULT_CONTRACTS,
    updatedAt: new Date().toISOString()
  };
  return cachedStore;
}

/**
 * Save store data safely without crashing on read-only filesystems (EROFS)
 */
export function saveStore(data) {
  cachedStore = data;
  data.updatedAt = new Date().toISOString();
  const serialized = JSON.stringify(data, null, 2);

  // In serverless environments, /var/task is read-only (EROFS). Always write to /tmp.
  if (IS_SERVERLESS) {
    try {
      fs.writeFileSync(TMP_DATA_FILE, serialized, 'utf-8');
      return;
    } catch (err) {
      console.error('[Store] Error writing to tmp data file:', err);
      return;
    }
  }

  // In local development, try local directory first
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DATA_FILE, serialized, 'utf-8');
  } catch (err) {
    // If local write fails (e.g. read-only permission / EROFS), fall back to /tmp
    console.warn('[Store] Local write failed with', err.code || err.message, '- falling back to tmpdir');
    try {
      fs.writeFileSync(TMP_DATA_FILE, serialized, 'utf-8');
    } catch (tmpErr) {
      console.error('[Store] Failed to write to tmp fallback:', tmpErr);
    }
  }
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

      // Filter by Month: format YYYY-MM
      if (month) {
        const cMonth = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}`;
        if (cMonth !== month) return false;
      }

      // Filter by Date From: format YYYY-MM-DD
      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        if (cDate < from) return false;
      }

      // Filter by Date To: format YYYY-MM-DD
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        if (cDate > to) return false;
      }

      return true;
    });

    // Total all-time contracts
    const totalAllTime = store.contracts.filter(
      c => c.affiliateSlug.toLowerCase() === aff.slug.toLowerCase()
    ).length;

    // Latest contract date
    const latestContract = store.contracts
      .filter(c => c.affiliateSlug.toLowerCase() === aff.slug.toLowerCase())
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    return {
      id: aff.id,
      name: aff.name,
      slug: aff.slug,
      createdAt: aff.createdAt,
      active: aff.active !== false,
      contractCount: affContracts.length,
      totalContractCount: totalAllTime,
      lastContractDate: latestContract ? latestContract.date : null,
      contracts: affContracts
    };
  }).filter(aff => {
    if (!searchLower) return true;
    return (
      aff.name.toLowerCase().includes(searchLower) ||
      aff.slug.toLowerCase().includes(searchLower)
    );
  }).sort((a, b) => b.contractCount - a.contractCount || a.name.localeCompare(b.name));
}

/**
 * Create a new affiliate partner (without email)
 */
export function createAffiliate({ name, slug }) {
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

  const monthNamesBG = [
    'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
    'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'
  ];

  const monthsList = Array.from(monthsSet).sort().reverse().map(ym => {
    const [y, m] = ym.split('-');
    const mIdx = parseInt(m, 10) - 1;
    return {
      value: ym,
      label: `${monthNamesBG[mIdx]} ${y} г.`
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
