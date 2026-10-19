/**
 * Persistent Affiliate & Contract Attribution Store
 * IRIS Pay Document Portal
 * 
 * Supports:
 * 1. Vercel KV / Upstash Redis (Cloud persistence across all serverless containers)
 * 2. Fallback to /tmp in Lambda environments
 * 3. Fallback to local data/affiliates.json in local development
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

const DEFAULT_AFFILIATES = [];
const DEFAULT_CONTRACTS = [];

let cachedStore = null;

// Cloud Database configuration (Vercel KV or Upstash Redis with any prefix)
export function getKvConfig() {
  // 1. Direct standard keys
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return { url: process.env.KV_REST_API_URL.replace(/\/+$/, ''), token: process.env.KV_REST_API_TOKEN };
  }
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return { url: process.env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, ''), token: process.env.UPSTASH_REDIS_REST_TOKEN };
  }

  // 2. Scan all process.env keys for any prefixed Upstash / KV variables (e.g. DATABASE_DOGOVORI_...)
  const envKeys = Object.keys(process.env);

  const urlKey = envKeys.find(k => 
    (k.includes('REST_API_URL') || k.includes('REDIS_REST_URL') || (k.includes('UPSTASH') && k.includes('URL'))) &&
    process.env[k] && String(process.env[k]).startsWith('http')
  );

  const tokenKey = envKeys.find(k => 
    (k.includes('REST_API_TOKEN') || k.includes('REDIS_REST_TOKEN') || (k.includes('UPSTASH') && k.includes('TOKEN'))) &&
    process.env[k] && String(process.env[k]).length > 10
  );

  if (urlKey && tokenKey) {
    return {
      url: String(process.env[urlKey]).replace(/\/+$/, ''),
      token: String(process.env[tokenKey])
    };
  }

  return null;
}

const KV_STORE_KEY = 'iris_affiliates_store_v1';

async function fetchFromKv() {
  const kv = getKvConfig();
  if (!kv) return null;

  try {
    const res = await fetch(`${kv.url}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kv.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(["GET", KV_STORE_KEY])
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.result) {
      const parsed = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
      return parsed;
    }
    return null;
  } catch (err) {
    console.warn('[Store] Warning fetching from Vercel KV:', err.message);
    return null;
  }
}

async function saveToKv(data) {
  const kv = getKvConfig();
  if (!kv) return false;

  try {
    const serialized = JSON.stringify(data);
    const res = await fetch(`${kv.url}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kv.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(["SET", KV_STORE_KEY, serialized])
    });
    if (!res.ok) {
      const errTxt = await res.text();
      console.warn('[Store] Upstash KV save error:', res.status, errTxt);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Store] Warning saving to Vercel KV:', err.message);
    return false;
  }
}

/**
 * Load store data from Vercel KV, /tmp, or local file
 */
export async function loadStore() {
  // 1. Try Vercel KV cloud storage first if configured
  const kvData = await fetchFromKv();
  if (kvData && Array.isArray(kvData.affiliates)) {
    cachedStore = kvData;
    return cachedStore;
  }

  if (cachedStore) {
    return cachedStore;
  }

  // 2. Try /tmp file
  try {
    if (fs.existsSync(TMP_DATA_FILE)) {
      const raw = fs.readFileSync(TMP_DATA_FILE, 'utf-8');
      cachedStore = JSON.parse(raw);
      return cachedStore;
    }
  } catch (err) {
    // ignore
  }

  // 3. Try local project file
  try {
    if (fs.existsSync(LOCAL_DATA_FILE)) {
      const raw = fs.readFileSync(LOCAL_DATA_FILE, 'utf-8');
      cachedStore = JSON.parse(raw);
      return cachedStore;
    }
  } catch (err) {
    // ignore
  }

  cachedStore = {
    affiliates: DEFAULT_AFFILIATES,
    contracts: DEFAULT_CONTRACTS,
    updatedAt: new Date().toISOString()
  };
  return cachedStore;
}

/**
 * Save store data safely to Vercel KV and disk fallback
 */
export async function saveStore(data) {
  cachedStore = data;
  data.updatedAt = new Date().toISOString();

  // 1. Save to Vercel KV cloud if configured
  const savedKv = await saveToKv(data);
  if (savedKv) {
    console.log('[Store] Successfully persisted to Vercel KV cloud storage.');
  }

  // 2. Backup to /tmp or local file
  const serialized = JSON.stringify(data, null, 2);
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    try {
      fs.writeFileSync(TMP_DATA_FILE, serialized, 'utf-8');
    } catch (e) {
      // ignore
    }
  } else {
    try {
      if (!fs.existsSync(LOCAL_DATA_DIR)) {
        fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(LOCAL_DATA_FILE, serialized, 'utf-8');
    } catch (e) {
      try {
        fs.writeFileSync(TMP_DATA_FILE, serialized, 'utf-8');
      } catch (err2) {}
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
export async function getAffiliatesData({ month = '', fromDate = '', toDate = '', search = '' } = {}) {
  const store = await loadStore();
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
 * Create a new affiliate partner
 */
export async function createAffiliate({ name, slug }) {
  const store = await loadStore();
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
  await saveStore(store);
  return newAff;
}

/**
 * Record a contract attribution
 */
export async function recordContractAttribution({ affiliateSlug, companyName, companyEik }) {
  if (!affiliateSlug) return null;
  const cleanSlug = sanitizeSlug(affiliateSlug);
  if (!cleanSlug) return null;

  const store = await loadStore();

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
  await saveStore(store);
  console.log(`[Store] Contract attribution recorded for ${aff.slug}:`, newContract);
  return {
    ...newContract,
    partnerName: aff.name
  };
}

/**
 * Delete a specific contract
 */
export async function deleteContract({ contractId }) {
  if (!contractId) {
    throw new Error('Липсва идентификатор (ID) на договора.');
  }

  const store = await loadStore();
  const initialLength = store.contracts.length;
  store.contracts = store.contracts.filter(c => c.id !== contractId);

  if (store.contracts.length === initialLength) {
    throw new Error('Договорът с това ID не е намерен.');
  }

  await saveStore(store);
  console.log(`[Store] Deleted contract ${contractId}. Remaining: ${store.contracts.length}`);
  return { success: true };
}

/**
 * Summary KPI stats for dashboard
 */
export async function getDashboardSummary({ month = '', fromDate = '', toDate = '' } = {}) {
  const store = await loadStore();
  const affiliates = await getAffiliatesData({ month, fromDate, toDate });

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

  const kvConfig = getKvConfig();
  const cloudStatus = {
    connected: Boolean(kvConfig),
    provider: kvConfig ? 'Upstash Redis / Vercel KV' : 'Не е свързана (Local/Tmp)',
    host: kvConfig ? kvConfig.url.split('//').pop().split('/')[0] : null
  };

  return {
    totalPartners,
    totalContractsAllTime,
    periodContracts,
    topPartner,
    monthsList,
    cloudStatus
  };
}
