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
    cachedStore = ensureStoreArrays(kvData);
    return cachedStore;
  }

  if (cachedStore) {
    return ensureStoreArrays(cachedStore);
  }

  // 2. Try /tmp file
  try {
    if (fs.existsSync(TMP_DATA_FILE)) {
      const raw = fs.readFileSync(TMP_DATA_FILE, 'utf-8');
      cachedStore = ensureStoreArrays(JSON.parse(raw));
      return cachedStore;
    }
  } catch (err) {
    // ignore
  }

  // 3. Try local project file
  try {
    if (fs.existsSync(LOCAL_DATA_FILE)) {
      const raw = fs.readFileSync(LOCAL_DATA_FILE, 'utf-8');
      cachedStore = ensureStoreArrays(JSON.parse(raw));
      return cachedStore;
    }
  } catch (err) {
    // ignore
  }

  cachedStore = {
    affiliates: DEFAULT_AFFILIATES,
    contracts: DEFAULT_CONTRACTS,
    customLinks: [],
    updatedAt: new Date().toISOString()
  };
  return cachedStore;
}

function ensureStoreArrays(st) {
  if (!st || typeof st !== 'object') return st;
  if (!Array.isArray(st.affiliates)) st.affiliates = [];
  if (!Array.isArray(st.contracts)) st.contracts = [];
  if (!Array.isArray(st.customLinks)) st.customLinks = [];
  if (!st.settings || typeof st.settings !== 'object') {
    st.settings = {
      standardCommission: '0.49%',
      integrationFee: '0 EUR',
      monthlyFee: '0 EUR',
      contractRecipientEmail: 'sales@irisbgsf.com',
      contractRecipientRoEmail: 'kaloyan.tosev@gmail.com',
      twoFaEmail: 'sales@irisbgsf.com',
      dashboardCardsOrder: ['partners', 'total', 'top', 'direct'],
      portalTitle: 'Портал за подписване на договор',
      bnbBadgeText: 'Лицензирана институция от БНБ',
      termsUrl: 'https://irisbgsf.com'
    };
  } else {
    // Ensure twoFaEmail is never pointing to kaloyan.tosev from old KV/store state
    if (st.settings.twoFaEmail && st.settings.twoFaEmail.toLowerCase().includes('kaloyan.tosev')) {
      st.settings.twoFaEmail = 'sales@irisbgsf.com';
    }
  }
  return st;
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
export async function getAffiliatesData({ month = '', fromDate = '', toDate = '', search = '', country = 'bg' } = {}) {
  const store = await loadStore();
  const searchLower = (search || '').trim().toLowerCase();
  const targetCountry = String(country || 'bg').toLowerCase();

  // Filter affiliates by country ('ro' vs 'bg' where undefined/null is treated as 'bg')
  const matchedAffiliates = store.affiliates.filter(a => {
    if (targetCountry === 'all') return true;
    return targetCountry === 'ro' ? a.country === 'ro' : a.country !== 'ro';
  });

  return matchedAffiliates.map(aff => {
    // Filter contracts for this affiliate matching country and period
    const affContracts = store.contracts.filter(c => {
      if (!c.affiliateSlug || c.affiliateSlug.toLowerCase() !== aff.slug.toLowerCase()) return false;
      if (targetCountry !== 'all') {
        const cIsRo = c.country === 'ro';
        if (targetCountry === 'ro' && !cIsRo) return false;
        if (targetCountry !== 'ro' && cIsRo) return false;
      }

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
    const totalAllTime = store.contracts.filter(c => {
      if (!c.affiliateSlug || c.affiliateSlug.toLowerCase() !== aff.slug.toLowerCase()) return false;
      if (targetCountry === 'all') return true;
      return targetCountry === 'ro' ? c.country === 'ro' : c.country !== 'ro';
    }).length;

    // Latest contract date
    const latestContract = store.contracts
      .filter(c => {
        if (!c.affiliateSlug || c.affiliateSlug.toLowerCase() !== aff.slug.toLowerCase()) return false;
        if (targetCountry === 'all') return true;
        return targetCountry === 'ro' ? c.country === 'ro' : c.country !== 'ro';
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    return {
      id: aff.id,
      name: aff.name,
      slug: aff.slug,
      country: aff.country || 'bg',
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
export async function createAffiliate({ name, slug, country = 'bg' }) {
  const store = await loadStore();
  const cleanName = String(name || '').trim();
  const cleanSlug = sanitizeSlug(slug || name);
  const targetCountry = String(country || 'bg').toLowerCase();

  if (!cleanName) {
    throw new Error('Името на партньора е задължително.');
  }
  if (!cleanSlug || cleanSlug.length < 2) {
    throw new Error('Кодът/линкът трябва да съдържа поне 2 символа (букви, цифри, тире).');
  }

  // Check for duplicate slug within same country
  const exists = store.affiliates.find(a => {
    const aCountry = a.country === 'ro' ? 'ro' : 'bg';
    return aCountry === targetCountry && a.slug.toLowerCase() === cleanSlug.toLowerCase();
  });

  if (exists) {
    throw new Error(`Линк с код "${cleanSlug}" вече съществува за партньор "${exists.name}".`);
  }

  const newAff = {
    id: 'aff_' + Date.now(),
    name: cleanName,
    slug: cleanSlug,
    country: targetCountry,
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
export async function recordContractAttribution({ affiliateSlug, companyName, companyEik, commission = null, country = 'bg' }) {
  const store = await loadStore();
  const targetCountry = String(country || 'bg').toLowerCase();
  const defaultComm = targetCountry === 'ro' ? '0.25%' : '0.49%';
  const cleanComm = commission ? formatCommissionText(commission) : defaultComm;

  const createDirectContract = async (logReason) => {
    const newContract = {
      id: 'cnt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      affiliateSlug: null,
      companyName: String(companyName || '—').trim(),
      companyEik: String(companyEik || '—').trim(),
      commission: cleanComm,
      country: targetCountry,
      date: new Date().toISOString()
    };
    store.contracts.push(newContract);
    await saveStore(store);
    console.log(`[Store] ${logReason}:`, newContract);
    return newContract;
  };

  if (!affiliateSlug) {
    return await createDirectContract('Direct contract recorded (no partner)');
  }

  const cleanSlug = sanitizeSlug(affiliateSlug);
  if (!cleanSlug) {
    return await createDirectContract('Direct contract recorded (invalid slug)');
  }

  // Look up partner ONLY in registered affiliates for this country
  const aff = store.affiliates.find(a => {
    const aCountry = a.country === 'ro' ? 'ro' : 'bg';
    return aCountry === targetCountry && a.slug && a.slug.toLowerCase() === cleanSlug.toLowerCase() && a.active !== false;
  });

  // If the partner does NOT exist in the portal, treat as direct contract without partner
  if (!aff) {
    return await createDirectContract(`Affiliate slug "${cleanSlug}" is not registered in portal for country ${targetCountry}. Recorded as direct contract without partner`);
  }

  // Partner is valid and registered in portal
  const newContract = {
    id: 'cnt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    affiliateSlug: aff.slug,
    companyName: String(companyName || '—').trim(),
    companyEik: String(companyEik || '—').trim(),
    commission: cleanComm,
    country: targetCountry,
    date: new Date().toISOString()
  };

  store.contracts.push(newContract);
  await saveStore(store);
  console.log(`[Store] Contract attribution recorded for registered partner ${aff.slug} (${targetCountry}):`, newContract);
  return {
    ...newContract,
    partnerName: aff.name
  };
}

/**
 * Delete a registered affiliate partner.
 * Existing contracts of this partner are preserved and safely re-attributed as direct contracts without partner.
 */
export async function deleteAffiliate({ affiliateId, slug }) {
  if (!affiliateId && !slug) {
    throw new Error('Липсва ID или slug на партньора за изтриване.');
  }

  const store = await loadStore();
  const affIndex = store.affiliates.findIndex(a => 
    (affiliateId && a.id === affiliateId) || 
    (slug && a.slug.toLowerCase() === String(slug).toLowerCase())
  );

  if (affIndex === -1) {
    throw new Error('Партньорът не е намерен.');
  }

  const targetAff = store.affiliates[affIndex];
  const targetSlug = targetAff.slug.toLowerCase();

  // Remove affiliate from store
  store.affiliates.splice(affIndex, 1);

  // Preserve contracts by converting them to direct contracts without partner
  let reattributedCount = 0;
  store.contracts = store.contracts.map(c => {
    if (c.affiliateSlug && c.affiliateSlug.toLowerCase() === targetSlug) {
      reattributedCount++;
      return { ...c, affiliateSlug: null };
    }
    return c;
  });

  await saveStore(store);
  console.log(`[Store] Deleted affiliate "${targetAff.name}" (/${targetAff.slug}). ${reattributedCount} contracts converted to direct.`);
  return { 
    success: true, 
    deletedAffiliate: targetAff.name,
    reattributedContracts: reattributedCount 
  };
}

/**
 * Delete a specific contract (supports { contractId } or contractId string)
 */
export async function deleteContract(arg) {
  const contractId = (typeof arg === 'object' && arg !== null) ? arg.contractId : arg;
  if (!contractId) {
    throw new Error('Липсва идентификатор (ID) на договора.');
  }

  const store = await loadStore();
  const initialLength = (store.contracts || []).length;
  store.contracts = (store.contracts || []).filter(c => c.id !== contractId);

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
export async function getDashboardSummary({ month = '', fromDate = '', toDate = '', country = 'bg' } = {}) {
  const store = await loadStore();
  const targetCountry = String(country || 'bg').toLowerCase();
  const affiliates = await getAffiliatesData({ month, fromDate, toDate, country: targetCountry });

  const totalPartners = store.affiliates.filter(a => {
    if (targetCountry === 'all') return true;
    return targetCountry === 'ro' ? a.country === 'ro' : a.country !== 'ro';
  }).length;

  const totalContractsAllTime = store.contracts.filter(c => {
    if (targetCountry === 'all') return true;
    return targetCountry === 'ro' ? c.country === 'ro' : c.country !== 'ro';
  }).length;

  const periodContracts = affiliates.reduce((sum, a) => sum + a.contractCount, 0);

  // Direct contracts without partner
  const directContractsInPeriod = store.contracts.filter(c => {
    if (c.affiliateSlug) return false;
    if (targetCountry !== 'all') {
      const cIsRo = c.country === 'ro';
      if (targetCountry === 'ro' && !cIsRo) return false;
      if (targetCountry !== 'ro' && cIsRo) return false;
    }

    const cDate = new Date(c.date);
    if (isNaN(cDate.getTime())) return false;
    if (month) {
      const cMonth = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}`;
      if (cMonth !== month) return false;
    }
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      if (cDate < from) return false;
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      if (cDate > to) return false;
    }
    return true;
  });

  const directContractsCount = directContractsInPeriod.length;
  const directContractsAllTime = store.contracts.filter(c => {
    if (c.affiliateSlug) return false;
    if (targetCountry === 'all') return true;
    return targetCountry === 'ro' ? c.country === 'ro' : c.country !== 'ro';
  }).length;

  // Top performing partner in period
  const topPartner = affiliates.length > 0 && affiliates[0].contractCount > 0
    ? { name: affiliates[0].name, slug: affiliates[0].slug, count: affiliates[0].contractCount }
    : null;

  // Distinct months available in data
  const monthsSet = new Set();
  store.contracts.filter(c => {
    if (targetCountry === 'all') return true;
    return targetCountry === 'ro' ? c.country === 'ro' : c.country !== 'ro';
  }).forEach(c => {
    const d = new Date(c.date);
    if (!isNaN(d.getTime())) {
      monthsSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  });

  const monthNamesBG = [
    'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
    'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'
  ];
  const monthNamesRO = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
  ];

  const monthsList = Array.from(monthsSet).sort().reverse().map(ym => {
    const [y, m] = ym.split('-');
    const mIdx = parseInt(m, 10) - 1;
    const label = targetCountry === 'ro'
      ? `${monthNamesRO[mIdx]} ${y}`
      : `${monthNamesBG[mIdx]} ${y} г.`;
    return {
      value: ym,
      label
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
    directContractsCount,
    directContractsAllTime,
    directContractsList: directContractsInPeriod,
    topPartner,
    monthsList,
    cloudStatus,
    cardsOrder: store.settings?.dashboardCardsOrder || ['partners', 'total', 'top', 'direct']
  };
}

/**
 * Format commission string nicely (e.g. "0.35" -> "0.35%", "0.35%" -> "0.35%")
 */
export function formatCommissionText(val) {
  let clean = String(val || '').trim();
  if (!clean) return '0.49%';
  clean = clean.replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(clean)) {
    return clean + '%';
  }
  return clean;
}

/**
 * Generate unique short token for one-time link
 */
export function generateCustomToken() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let rand = '';
  for (let i = 0; i < 7; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rand;
}

/**
 * Create a one-time custom commission link (direct or partner-specific)
 */
export async function createCustomLink({ commission, note = '', partnerSlug = null, country = 'bg' }) {
  const store = await loadStore();
  const targetCountry = String(country || 'bg').toLowerCase();
  const defaultComm = targetCountry === 'ro' ? '0.25%' : '0.49%';
  const cleanComm = commission ? formatCommissionText(commission) : defaultComm;
  const token = generateCustomToken();

  let matchedPartner = null;
  let resolvedSlug = null;
  let resolvedName = null;
  if (partnerSlug) {
    const cleanSlug = String(partnerSlug).toLowerCase().trim();
    matchedPartner = (store.affiliates || []).find(
      a => {
        const aCountry = a.country === 'ro' ? 'ro' : 'bg';
        return aCountry === targetCountry && a.slug && (a.slug.toLowerCase() === cleanSlug || a.slug.toLowerCase() === sanitizeSlug(cleanSlug)) && a.active !== false;
      }
    );
    if (matchedPartner) {
      resolvedSlug = matchedPartner.slug;
      resolvedName = matchedPartner.name;
    } else {
      resolvedSlug = sanitizeSlug(cleanSlug);
      resolvedName = partnerSlug;
    }
  }

  const newLink = {
    id: 'cl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    token,
    commission: cleanComm,
    note: String(note || '').trim(),
    partnerSlug: resolvedSlug,
    partnerName: resolvedName,
    country: targetCountry,
    createdAt: new Date().toISOString(),
    used: false,
    usedAt: null,
    usedByCompanyName: null,
    usedByEik: null,
    contractId: null
  };

  store.customLinks.push(newLink);
  await saveStore(store);
  console.log(`[Store] Created one-time custom commission link (${cleanComm}, ${targetCountry}): token=${token}, partner=${newLink.partnerSlug || 'none'}`);
  return newLink;
}

/**
 * Get custom link details by token
 */
export async function getCustomLink(token) {
  if (!token) return null;
  const store = await loadStore();
  const rawToken = String(token).toLowerCase().trim();
  const cleanToken = rawToken.replace(/^c-|^c_|^c\//, '').trim();

  return (store.customLinks || []).find(l => {
    const lTok = l.token.toLowerCase();
    return lTok === rawToken || lTok === cleanToken || ('c-' + lTok) === rawToken;
  }) || null;
}

/**
 * Mark a custom link as used after contract is signed and submitted
 */
export async function useCustomLink({ token, companyName, companyEik, contractId }) {
  if (!token) return null;
  const store = await loadStore();
  const rawToken = String(token).toLowerCase().trim();
  const cleanToken = rawToken.replace(/^c-|^c_|^c\//, '').trim();

  const link = (store.customLinks || []).find(l => {
    const lTok = l.token.toLowerCase();
    return lTok === rawToken || lTok === cleanToken || ('c-' + lTok) === rawToken;
  });

  if (!link || link.used) {
    return null;
  }

  link.used = true;
  link.usedAt = new Date().toISOString();
  link.usedByCompanyName = String(companyName || '—').trim();
  link.usedByEik = String(companyEik || '—').trim();
  link.contractId = contractId || null;

  await saveStore(store);
  console.log(`[Store] Custom link ${link.token} (${link.commission}) successfully marked as used by ${companyName}.`);
  return link;
}

/**
 * List all custom commission links (optionally filtered by country)
 */
export async function listCustomLinks(arg = null) {
  const store = await loadStore();
  const rawCountry = (typeof arg === 'object' && arg !== null) ? arg.country : arg;
  const targetCountry = rawCountry ? String(rawCountry).toLowerCase() : null;

  return (store.customLinks || [])
    .filter(l => {
      if (!targetCountry || targetCountry === 'all') return true;
      return targetCountry === 'ro' ? l.country === 'ro' : l.country !== 'ro';
    })
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Delete / cancel a custom link
 */
export async function deleteCustomLink({ id, token }) {
  const store = await loadStore();
  const initialLen = (store.customLinks || []).length;

  store.customLinks = (store.customLinks || []).filter(l => {
    if (id && l.id === id) return false;
    if (token) {
      const raw = String(token).toLowerCase().trim();
      const clean = raw.replace(/^c-|^c_|^c\//, '').trim();
      if (l.token.toLowerCase() === raw || l.token.toLowerCase() === clean) return false;
    }
    return true;
  });

  if (store.customLinks.length === initialLen) {
    throw new Error('Линкът не е намерен.');
  }

  await saveStore(store);
  console.log(`[Store] Deleted custom link (id=${id}, token=${token}). Remaining: ${store.customLinks.length}`);
  return { success: true };
}

/**
 * System and Site Settings
 */
export async function getSettings() {
  const store = await loadStore();
  return store.settings;
}

export async function updateSettings(newSettings) {
  const store = await loadStore();
  if (newSettings && newSettings.twoFaEmail && newSettings.twoFaEmail.toLowerCase().includes('kaloyan.tosev')) {
    newSettings.twoFaEmail = 'sales@irisbgsf.com';
  }
  store.settings = {
    ...store.settings,
    ...newSettings
  };
  await saveStore(store);
  return store.settings;
}

/**
 * Get all contracts with partner info (optionally filtered by country)
 */
export async function getAllContracts(arg = null) {
  const store = await loadStore();
  const rawCountry = (typeof arg === 'object' && arg !== null) ? arg.country : arg;
  const targetCountry = rawCountry ? String(rawCountry).toLowerCase() : null;
  const affMap = new Map((store.affiliates || []).map(a => [a.slug.toLowerCase(), a.name]));

  return (store.contracts || [])
    .filter(c => {
      if (!targetCountry || targetCountry === 'all') return true;
      return targetCountry === 'ro' ? c.country === 'ro' : c.country !== 'ro';
    })
    .slice()
    .map(c => ({
      ...c,
      partnerName: c.affiliateSlug ? (affMap.get(c.affiliateSlug.toLowerCase()) || c.affiliateSlug) : null
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}
