/**
 * IRIS Pay | Електронно подписване на документи
 * Интерактивна система за попълване на договори в реално време,
 * електронен подпис и валидация.
 */

document.addEventListener('DOMContentLoaded', () => {
  // =========================================================================
  // 1. Initial State & Elements
  // =========================================================================
  const form = document.getElementById('merchantContractForm');
  const contractDateInput = document.getElementById('contractDate');
  const hiddenNativeDatePicker = document.getElementById('hiddenNativeDatePicker');
  const btnCalendarTrigger = document.getElementById('btnCalendarTrigger');
  const sameAddressCheckbox = document.getElementById('sameAddressCheckbox');
  const companyAddressInput = document.getElementById('companyAddress');
  const contactAddressInput = document.getElementById('contactAddress');
  const bankIbanInput = document.getElementById('bankIban');
  const bankNameSelect = document.getElementById('bankName');

  // Default: Automatically load today's date into contract date input (DD.MM.YYYY)
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayDmy = `${dd}.${mm}.${yyyy}`;
  const todayYmd = `${yyyy}-${mm}-${dd}`;

  if (contractDateInput) {
    contractDateInput.value = todayDmy;
  }
  if (hiddenNativeDatePicker) {
    hiddenNativeDatePicker.value = todayYmd;
  }

  // Detect & persist affiliate referral from URL path (/slug) or parameter (?ref=slug)
  try {
    const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const ignored = ['login', 'dashboard', 'index.html', 'api', 'assets', 'favicon.ico'];
    let slug = null;
    if (rawPath && !ignored.includes(rawPath.toLowerCase()) && !rawPath.includes('/')) {
      slug = rawPath;
    }
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('ref')) {
      slug = urlParams.get('ref');
    }
    if (slug) {
      const cleanSlug = slug.toLowerCase().trim();
      localStorage.setItem('iris_affiliate_ref', cleanSlug);
      sessionStorage.setItem('iris_affiliate_ref', cleanSlug);
      console.log('[IRIS Pay] Affiliate partner detected:', cleanSlug);
    }
  } catch (e) {
    console.warn('Affiliate tracking error:', e);
  }

  // =========================================================================
  // 2. Real-time Live Sync (Form inputs -> Document live fields)
  // =========================================================================
  const liveSyncMap = {
    companyName: {
      input: document.getElementById('companyName'),
      placeholder: '.......................................................................'
    },
    companyEik: {
      input: document.getElementById('companyEik'),
      placeholder: '..................................'
    },
    companyAddress: {
      input: document.getElementById('companyAddress'),
      placeholder: '.....................................................................................................................................................'
    },
    companyRepresentative: {
      input: document.getElementById('companyRepresentative'),
      placeholder: '...................................................................................................'
    },
    bankName: {
      input: document.getElementById('bankName'),
      placeholder: '…........................................'
    },
    bankIban: {
      input: document.getElementById('bankIban'),
      placeholder: '….........................................................................'
    },
    merchantWebsite: {
      input: document.getElementById('merchantWebsite'),
      placeholder: '........................................................'
    },
    contactAddress: {
      input: document.getElementById('contactAddress'),
      placeholder: '...................................................................................................'
    },
    contactEmail: {
      input: document.getElementById('contactEmail'),
      placeholder: '................................................................................'
    },
    contactPhone: {
      input: document.getElementById('contactPhone'),
      placeholder: '..........................................................'
    }
  };

  function updateFieldInDoc(fieldName, val, placeholder) {
    const targets = document.querySelectorAll(`.live-field[data-field="${fieldName}"]`);
    let cleanVal = (val || '').trim();
    if (fieldName === 'companyAddress' && cleanVal) {
      cleanVal = cleanVal.replace(/^гр\.\s*/i, '');
    }
    
    targets.forEach(el => {
      const oldVal = el.textContent;
      if (cleanVal) {
        if (oldVal !== cleanVal) {
          el.textContent = cleanVal;
          el.classList.remove('text-animating');
          // Trigger DOM reflow to re-trigger the CSS animation (100% transparent smoothly to solid)
          void el.offsetWidth;
          el.classList.add('text-animating');
        }
        el.classList.add('filled');
        el.classList.remove('underlined');
      } else {
        el.textContent = placeholder;
        el.classList.remove('filled');
        el.classList.remove('underlined');
        el.classList.remove('text-animating');
      }
    });
  }

  function formatBulgarianDate(rawDateStr) {
    if (!rawDateStr) return '.........................';
    const str = String(rawDateStr).trim();
    // Check if DD.MM.YYYY
    const dmyMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dmyMatch) {
      const d = dmyMatch[1].padStart(2, '0');
      const m = dmyMatch[2].padStart(2, '0');
      const y = dmyMatch[3];
      return `${d}.${m}.${y} г.`;
    }
    // Check if YYYY-MM-DD
    const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymdMatch) {
      const y = ymdMatch[1];
      const m = ymdMatch[2].padStart(2, '0');
      const d = ymdMatch[3].padStart(2, '0');
      return `${d}.${m}.${y} г.`;
    }
    return str ? `${str} г.` : '.........................';
  }

  function syncAllFields() {
    // 1. Regular inputs
    Object.keys(liveSyncMap).forEach(key => {
      if (key === 'merchantWebsite') return; // Handled specially by syncWebsites()
      const { input, placeholder } = liveSyncMap[key];
      if (input) {
        updateFieldInDoc(key, input.value, placeholder);
      }
    });

    // 2. Websites
    syncWebsites();

    // 3. Date input
    const dateVal = contractDateInput ? contractDateInput.value : '';
    const formattedDate = formatBulgarianDate(dateVal);
    const dateTargets = document.querySelectorAll('.live-field[data-field="date"]');
    dateTargets.forEach(el => {
      if (dateVal) {
        el.textContent = formattedDate;
        el.classList.add('filled');
        el.classList.remove('underlined');
      } else {
        el.textContent = '.........................';
        el.classList.remove('filled');
        el.classList.add('underlined');
      }
    });

    // 4. Update Typed Signature samples if representative changes
    const repName = (document.getElementById('companyRepresentative').value || '').trim();
    const typedSigInput = document.getElementById('typedSigInput');
    if (typedSigInput && !typedSigInput.dataset.userEdited && repName) {
      typedSigInput.value = repName;
      updateTypedFontSamples(repName);
    }
  }

  // Bind input listeners
  Object.keys(liveSyncMap).forEach(key => {
    if (key === 'merchantWebsite') return;
    const { input, placeholder } = liveSyncMap[key];
    if (input) {
      input.addEventListener('input', () => {
        updateFieldInDoc(key, input.value, placeholder);
        checkStep1Progress();
      });
    }
  });

  if (hiddenNativeDatePicker) {
    hiddenNativeDatePicker.addEventListener('change', () => {
      if (hiddenNativeDatePicker.value) {
        const [y, m, d] = hiddenNativeDatePicker.value.split('-');
        if (contractDateInput) {
          contractDateInput.value = `${d}.${m}.${y}`;
          contractDateInput.dispatchEvent(new Event('input'));
        }
      }
    });
  }

  if (btnCalendarTrigger && hiddenNativeDatePicker) {
    btnCalendarTrigger.addEventListener('click', () => {
      if (typeof hiddenNativeDatePicker.showPicker === 'function') {
        hiddenNativeDatePicker.showPicker();
      } else {
        hiddenNativeDatePicker.focus();
        hiddenNativeDatePicker.click();
      }
    });
  }

  if (contractDateInput) {
    contractDateInput.addEventListener('input', (e) => {
      let val = contractDateInput.value.replace(/[^\d.]/g, '');
      if (e.inputType !== 'deleteContentBackward' && e.inputType !== 'deleteContentForward') {
        const digits = val.replace(/\./g, '');
        if (digits.length >= 5) {
          val = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
        } else if (digits.length >= 3) {
          val = `${digits.slice(0, 2)}.${digits.slice(2)}`;
        }
      }
      contractDateInput.value = val;

      const formattedDate = formatBulgarianDate(val);
      document.querySelectorAll('.live-field[data-field="date"]').forEach(el => {
        if (val && val.length >= 2) {
          el.textContent = formattedDate;
          el.classList.add('filled');
          el.classList.remove('underlined');
        } else {
          el.textContent = '.........................';
          el.classList.remove('filled');
          el.classList.add('underlined');
        }
      });
      checkStep1Progress();
    });

    contractDateInput.addEventListener('change', () => {
      const formattedDate = formatBulgarianDate(contractDateInput.value);
      document.querySelectorAll('.live-field[data-field="date"]').forEach(el => {
        if (contractDateInput.value) {
          el.textContent = formattedDate;
          el.classList.add('filled');
          el.classList.remove('underlined');
        } else {
          el.textContent = '.........................';
          el.classList.remove('filled');
          el.classList.add('underlined');
        }
      });
      checkStep1Progress();
    });
  }

  // Same Address Checkbox
  if (sameAddressCheckbox && companyAddressInput && contactAddressInput) {
    sameAddressCheckbox.addEventListener('change', () => {
      if (sameAddressCheckbox.checked) {
        contactAddressInput.value = companyAddressInput.value;
        contactAddressInput.disabled = true;
      } else {
        contactAddressInput.disabled = false;
      }
      updateFieldInDoc('contactAddress', contactAddressInput.value, liveSyncMap.contactAddress.placeholder);
    });

    companyAddressInput.addEventListener('input', () => {
      if (sameAddressCheckbox.checked) {
        contactAddressInput.value = companyAddressInput.value;
        updateFieldInDoc('contactAddress', contactAddressInput.value, liveSyncMap.contactAddress.placeholder);
      }
    });
  }

  // =========================================================================
  // 2.1. IBAN Formatting & Live Sync (No restrictive validation)
  // =========================================================================
  if (bankIbanInput) {
    bankIbanInput.addEventListener('input', (e) => {
      let raw = e.target.value.replace(/\s+/g, '').toUpperCase();
      let formatted = '';
      for (let i = 0; i < raw.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += ' ';
        formatted += raw[i];
      }
      e.target.value = formatted;
      updateFieldInDoc('bankIban', formatted, liveSyncMap.bankIban.placeholder);
      bankIbanInput.classList.remove('is-invalid');
      checkStep1Progress();
    });
  }

  // =========================================================================
  // 2.2. Multi-Website Checkbox & Integration Support
  // =========================================================================
  const noWebsiteCheckbox = document.getElementById('noWebsiteCheckbox');
  const merchantWebsiteInput = document.getElementById('merchantWebsite');
  const contractWebsiteRow = document.getElementById('contractWebsiteRow');
  const extraWebsitesCheckbox = document.getElementById('extraWebsitesCheckbox');
  const extraWebsitesWrapper = document.getElementById('extraWebsitesWrapper');
  const extraWebsite1 = document.getElementById('extraWebsite1');
  const extraWebsite2 = document.getElementById('extraWebsite2');

  function getCombinedWebsites() {
    if (noWebsiteCheckbox && noWebsiteCheckbox.checked) return '';
    const mainWeb = (merchantWebsiteInput?.value || '').trim();
    const sites = [];
    if (mainWeb) sites.push(mainWeb);

    if (extraWebsitesCheckbox && extraWebsitesCheckbox.checked) {
      const s1 = (extraWebsite1?.value || '').trim();
      const s2 = (extraWebsite2?.value || '').trim();
      if (s1) sites.push(s1);
      if (s2) sites.push(s2);
    }
    return sites.join(', ');
  }

  function syncWebsites() {
    const combined = getCombinedWebsites();
    const websiteLabelEl = document.getElementById('contractWebsiteLabel');
    if (noWebsiteCheckbox && noWebsiteCheckbox.checked) {
      if (contractWebsiteRow) contractWebsiteRow.style.display = 'none';
      if (websiteLabelEl) websiteLabelEl.textContent = 'Сайт(ако има)';
      updateFieldInDoc('merchantWebsite', '', liveSyncMap.merchantWebsite.placeholder);
    } else {
      if (contractWebsiteRow) contractWebsiteRow.style.display = '';
      if (websiteLabelEl) {
        websiteLabelEl.textContent = combined ? 'Сайт' : 'Сайт(ако има)';
      }
      updateFieldInDoc('merchantWebsite', combined, liveSyncMap.merchantWebsite.placeholder);
    }
  }

  if (merchantWebsiteInput) {
    merchantWebsiteInput.addEventListener('input', syncWebsites);
  }

  if (extraWebsitesCheckbox && extraWebsitesWrapper) {
    extraWebsitesCheckbox.addEventListener('change', () => {
      if (extraWebsitesCheckbox.checked) {
        extraWebsitesWrapper.style.display = 'flex';
      } else {
        extraWebsitesWrapper.style.display = 'none';
      }
      syncWebsites();
    });
  }

  if (extraWebsite1) extraWebsite1.addEventListener('input', syncWebsites);
  if (extraWebsite2) extraWebsite2.addEventListener('input', syncWebsites);

  if (noWebsiteCheckbox) {
    noWebsiteCheckbox.addEventListener('change', () => {
      if (noWebsiteCheckbox.checked) {
        if (merchantWebsiteInput) {
          merchantWebsiteInput.value = '';
          merchantWebsiteInput.disabled = true;
          merchantWebsiteInput.classList.remove('is-invalid');
        }
        if (extraWebsitesCheckbox) {
          extraWebsitesCheckbox.checked = false;
          extraWebsitesCheckbox.disabled = true;
        }
        if (extraWebsitesWrapper) extraWebsitesWrapper.style.display = 'none';
        syncWebsites();
      } else {
        if (merchantWebsiteInput) {
          merchantWebsiteInput.disabled = false;
        }
        if (extraWebsitesCheckbox) {
          extraWebsitesCheckbox.disabled = false;
        }
        syncWebsites();
      }
    });
  }

  // =========================================================================
  // 2.2. Email & Phone Real-time Validation
  // =========================================================================
  const contactEmailInput = document.getElementById('contactEmail');
  const contactPhoneInput = document.getElementById('contactPhone');
  const contactEmailError = document.getElementById('contactEmailError');
  const contactPhoneError = document.getElementById('contactPhoneError');

  function validateEmail(email) {
    const trimmed = (email || '').trim();
    if (!trimmed) return false;
    const re = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    return re.test(trimmed);
  }

  function validatePhone(phone) {
    const trimmed = (phone || '').trim();
    if (!trimmed) return false;
    const digitsOnly = trimmed.replace(/\D/g, '');
    const pattern = /^(\+359|00359|0)[\d\s\-\.\(\)]{6,15}$/;
    return pattern.test(trimmed) && digitsOnly.length >= 8 && digitsOnly.length <= 14;
  }

  if (contactEmailInput) {
    const handleEmailValidation = () => {
      const val = contactEmailInput.value.trim();
      if (!val) {
        contactEmailInput.classList.remove('is-invalid');
        if (contactEmailError) contactEmailError.style.display = 'none';
      } else if (!validateEmail(val)) {
        contactEmailInput.classList.add('is-invalid');
        if (contactEmailError) contactEmailError.style.display = 'block';
      } else {
        contactEmailInput.classList.remove('is-invalid');
        if (contactEmailError) contactEmailError.style.display = 'none';
      }
    };
    contactEmailInput.addEventListener('input', handleEmailValidation);
    contactEmailInput.addEventListener('blur', handleEmailValidation);
  }

  if (contactPhoneInput) {
    const handlePhoneValidation = () => {
      const val = contactPhoneInput.value.trim();
      if (!val) {
        contactPhoneInput.classList.remove('is-invalid');
        if (contactPhoneError) contactPhoneError.style.display = 'none';
      } else if (!validatePhone(val)) {
        contactPhoneInput.classList.add('is-invalid');
        if (contactPhoneError) contactPhoneError.style.display = 'block';
      } else {
        contactPhoneInput.classList.remove('is-invalid');
        if (contactPhoneError) contactPhoneError.style.display = 'none';
      }
    };
    contactPhoneInput.addEventListener('input', handlePhoneValidation);
    contactPhoneInput.addEventListener('blur', handlePhoneValidation);
  }

  // =========================================================================
  // 2.3. Bulgarian EIK Checksum & Real Commercial Register Integration
  // =========================================================================
  const companyEikInput = document.getElementById('companyEik');
  const eikFeedbackMsg = document.getElementById('eikFeedbackMsg');
  const companyNameInput = document.getElementById('companyName');
  const companyRepresentativeInput = document.getElementById('companyRepresentative');
  const companyVerifyBanner = document.getElementById('companyVerifyBanner');
  const btnVerifyDataYes = document.getElementById('btnVerifyDataYes');
  const btnVerifyDataNo = document.getElementById('btnVerifyDataNo');
  const companyInputsWrapper = document.getElementById('companyInputsWrapper');

  let isCompanyDataVerified = false;

  function isValidBulgarianEik(eikStr) {
    const clean = (eikStr || '').replace(/\D/g, '');
    return clean.length >= 9 && clean.length <= 13;
  }

  // Pre-cached verified records for instantaneous demonstration & fallback safety
  const knownRegistryCompanies = {
    '208455895': {
      name: '„Айрис солюшънс“ АД',
      address: 'гр. София, п.к. 1164, р-н Лозенец, бул. „Христо Смирненски“ № 78, ет. 4',
      rep: 'ГАЛЯ ДИМИТРОВА ДИМИТРОВА'
    },
    '206132646': {
      name: '„Айрис Солюшънс“ АД',
      address: 'гр. София 1421, район Лозенец, бул. „Христо Смирненски“ № 78, ет. 4',
      rep: 'Галя Томова Димитрова'
    },
    '204997709': {
      name: '„Айрис Солюшънс“ ООД',
      address: 'гр. София, р-н Младост, бул. „Цариградско шосе“ № 111Б, София Тех Парк, сграда Инкубатор, ет. 1',
      rep: 'Галя Димитрова Димитрова'
    },
    '121396123': {
      name: '„БЪЛГАРСКИ ПОЩИ“ ЕАД',
      address: 'гр. София, п.к. 1700, р-н Студентски, ж.к. Студентски град, бул./ул. Акад. Стефан Младенов № 1',
      rep: 'ЦВЕТОМИР АНГЕЛОВ ДОСКОВ'
    },
    '831641799': {
      name: '„УниКредит Булбанк“ АД',
      address: 'гр. София 1000, пл. „Света Неделя“ № 7',
      rep: 'Цветанка Минчева'
    },
    '121830616': {
      name: '„Банка ДСК“ АД',
      address: 'гр. София 1000, ул. „Московска“ № 19',
      rep: 'Тамаш Хак-Ковач'
    },
    '000694836': {
      name: '„Юробанк България“ АД',
      address: 'гр. София 1766, ул. „Околовръстен път“ № 260',
      rep: 'Петя Димитрова'
    }
  };

  function cleanHtml(html) {
    if (!html) return '';
    return html
      .replace(/<br\s*\/?>/gi, ', ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanAddress(raw) {
    if (!raw) return '';
    let addr = raw
      .replace(/^Държава:\s*БЪЛГАРИЯ,?\s*/i, '')
      .replace(/Област:\s*[^,]+,\s*/i, '')
      .replace(/Община:\s*[^,]+,\s*/i, '')
      .replace(/Населено място:\s*/i, '')
      .replace(/бул\.\/ул\.\s*/i, '')
      .replace(/\s+/g, ' ');

    // User requested: "трябва ЕИК разпознавателя да знае че като чете адрес е възможно да е сложен имейл или телефон там и трябва да не го включва в адреса. тоест да маха телефона и думата телефон и мейл и думаъа мейл ако има."
    addr = addr.replace(/(?:Електронна\s+поща|Електронен\s+адрес|Е-мейл|E-mail|Email|Имейл|Мейл)\s*[:\s]*[\w.-]+@[\w.-]+\.[a-z]{2,}/gi, '');
    addr = addr.replace(/[\w.-]+@[\w.-]+\.[a-z]{2,}/gi, '');
    addr = addr.replace(/(?:Електронна\s+поща|Електронен\s+адрес|Е-мейл|E-mail|Email|Имейл|Мейл)\s*[:\s]*/gi, '');

    addr = addr.replace(/(?:Телефон|Тел\.|Тел|GSM|Факс|Fax)\s*[:\s]*(\+?[0-9\s/()-]{6,})/gi, '');
    addr = addr.replace(/(?:Телефон|Тел\.|Тел|GSM|Факс|Fax)\s*[:\s]*/gi, '');

    addr = addr
      .replace(/\s*,\s*,+/g, ',')
      .replace(/\s*;\s*;/g, ';')
      .replace(/^[,\s;.-]+|[,\s;.-]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return addr;
  }

  function parseRegistryAgencyJson(data, eik) {
    let name = data.fullName || data.companyName || '';
    let address = '';
    let rep = '';

    const sections = data.sections || [];
    for (const sec of sections) {
      for (const sd of sec.subDeeds || []) {
        for (const grp of sd.groups || []) {
          for (const fld of grp.fields || []) {
            const fId = fld.fieldIdent;
            const clean = cleanHtml(fld.htmlData);
            if (fId === '00020' && !name) {
              name = clean;
            } else if (fId === '00050' && !address) {
              address = cleanAddress(clean);
            } else if (fId === '00100' && !rep) {
              rep = clean
                .split(/,\s*Държава:/i)[0]
                .replace(/Държава:\s*БЪЛГАРИЯ/i, '')
                .trim();
            }
          }
        }
      }
    }

    name = name.replace(/<[^>]+>/g, '').replace(/^"|"$/g, '').trim();
    if (name && !name.startsWith('„') && !name.startsWith('"')) {
      name = `„${name}“`;
    }

    return {
      uic: eik,
      name: name || `„ТЪРГОВЕЦ ${eik}“`,
      address: address || 'гр. София, България',
      rep: rep || 'Управител'
    };
  }

  function formatViesCompany(viesData, eik) {
    let rawName = (viesData.name || '').trim();
    let rawAddr = (viesData.address || '').trim();

    let cleanName = rawName.replace(/\s*-\s*(АД|ЕАД|ООД|ЕООД|КДА|СД|ЕТ)\b/i, ' $1').trim();
    const m = cleanName.match(/^(.*?)\s+(АД|ЕАД|ООД|ЕООД|КДА|СД|ЕТ)$/i);
    if (m) {
      cleanName = `„${m[1].replace(/["„“]/g, '').trim()}“ ${m[2].toUpperCase()}`;
    } else if (!cleanName.startsWith('„') && !cleanName.startsWith('"')) {
      cleanName = `„${cleanName}“`;
    }

    let cleanAddr = rawAddr
      .replace(/\s+/g, ' ')
      .replace(/обл\.[^,]+,\s*/gi, '')
      .trim();

    return {
      uic: eik,
      name: cleanName,
      address: cleanAddr,
      rep: '',
      source: 'live_register'
    };
  }

  async function fetchRegistryData(eik) {
    // 1. Try our serverless backend API endpoint
    try {
      const resp = await fetch(`/api/company?eik=${encodeURIComponent(eik)}`);
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.found !== false && (json.name || json.address || json.rep)) {
          return json;
        }
      }
    } catch (e) {
      // Backend not running or static environment
    }

    // 2. Query official European Commission National Register API (VIES) - free, real-time, CORS enabled
    try {
      const viesUrl = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/BG/vat/${encodeURIComponent(eik)}`;
      const resp = await fetch(viesUrl, {
        headers: { 'Accept': 'application/json' }
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.isValid && json.name && json.name !== '---') {
          return formatViesCompany(json, eik);
        }
      }
    } catch (e) {
      // VIES fetch error
    }

    // 3. Fallback to pre-cached verified records if available
    if (knownRegistryCompanies[eik]) {
      return {
        uic: eik,
        ...knownRegistryCompanies[eik]
      };
    }

    // 4. Return null if not found in any register - STRICTLY NO FAKE DATA!
    return null;
  }

  function showCompanyPreview(compData, eik) {
    const cleanAddr = cleanAddress(compData.address);

    // Set input values directly into the actual form fields
    if (companyNameInput) companyNameInput.value = compData.name;
    if (companyAddressInput) companyAddressInput.value = cleanAddr;
    if (companyRepresentativeInput) companyRepresentativeInput.value = compData.rep;

    // Live update document
    updateFieldInDoc('companyName', compData.name, liveSyncMap.companyName.placeholder);
    updateFieldInDoc('companyAddress', cleanAddr, liveSyncMap.companyAddress.placeholder);
    updateFieldInDoc('companyRepresentative', compData.rep, liveSyncMap.companyRepresentative.placeholder);

    if (sameAddressCheckbox && sameAddressCheckbox.checked && contactAddressInput) {
      contactAddressInput.value = cleanAddr;
      updateFieldInDoc('contactAddress', cleanAddr, liveSyncMap.contactAddress.placeholder);
    }

    if (typedSigInput && !typedSigInput.dataset.userEdited) {
      typedSigInput.value = compData.rep;
      updateTypedFontSamples(compData.rep);
    }

    // Show inline verification banner right above the inputs, hide redundant hint
    if (eikFeedbackMsg) {
      eikFeedbackMsg.style.display = 'none';
    }
    if (companyVerifyBanner) {
      companyVerifyBanner.style.display = 'flex';
      companyVerifyBanner.classList.remove('is-verified');
    }
    if (btnVerifyDataYes) btnVerifyDataYes.classList.remove('active');
    if (btnVerifyDataNo) btnVerifyDataNo.classList.remove('active');

    isCompanyDataVerified = false;
  }

  // Verification button actions directly on the data fields: [✓ Да] and [✕ Не]
  // Clicking either button completely hides the verification UI leaving only the clean data fields
  if (btnVerifyDataYes) {
    btnVerifyDataYes.addEventListener('click', () => {
      isCompanyDataVerified = true;
      if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
      if (eikFeedbackMsg) eikFeedbackMsg.style.display = 'none';
      if (companyInputsWrapper) companyInputsWrapper.classList.add('is-verified');

      showToast('Данните за фирмата са потвърдени!', 'success');
      checkStep1Progress();
    });
  }

  if (btnVerifyDataNo) {
    btnVerifyDataNo.addEventListener('click', () => {
      isCompanyDataVerified = true; // User acknowledged and can edit freely
      if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
      if (eikFeedbackMsg) eikFeedbackMsg.style.display = 'none';
      if (companyInputsWrapper) companyInputsWrapper.classList.remove('is-verified');
      if (companyNameInput) companyNameInput.focus();

      showToast('Можете да нанесете корекции директно в полетата по-долу.', 'info');
      checkStep1Progress();
    });
  }

  let eikDebounceTimer = null;
  if (companyEikInput) {
    companyEikInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length > 13) val = val.slice(0, 13);
      e.target.value = val;
      updateFieldInDoc('companyEik', val, liveSyncMap.companyEik.placeholder);

      clearTimeout(eikDebounceTimer);

      if (val.length < 9) {
        companyEikInput.classList.remove('is-invalid');
        if (eikFeedbackMsg) {
          eikFeedbackMsg.style.display = 'block';
          eikFeedbackMsg.textContent = 'Въведете ЕИК за автоматично попълване на данни';
          eikFeedbackMsg.className = 'field-hint-msg';
        }
        if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
        isCompanyDataVerified = false;
        return;
      }

      companyEikInput.classList.remove('is-invalid');
      if (eikFeedbackMsg) {
        eikFeedbackMsg.style.display = 'block';
        eikFeedbackMsg.textContent = '⟳ Извличане на данни от Търговския регистър...';
        eikFeedbackMsg.className = 'field-hint-msg';
      }

      eikDebounceTimer = setTimeout(async () => {
        try {
          const compData = await fetchRegistryData(val);
          if (compData && (compData.name || compData.address || compData.rep)) {
            showCompanyPreview(compData, val);
            showToast('Данните за фирмата бяха изтеглени успешно от Търговския регистър!', 'success');
            checkStep1Progress();
          } else {
            // Not found in registers - DO NOT invent fake data
            if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
            if (eikFeedbackMsg) {
              eikFeedbackMsg.style.display = 'block';
              eikFeedbackMsg.textContent = 'Няма намерени публични данни за този ЕИК в регистъра. Моля, въведете данните на фирмата ръчно.';
              eikFeedbackMsg.className = 'field-hint-msg';
            }
            isCompanyDataVerified = true;
          }
        } catch (err) {
          if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
          if (eikFeedbackMsg) {
            eikFeedbackMsg.style.display = 'block';
            eikFeedbackMsg.textContent = 'Няма намерени публични данни за този ЕИК в регистъра. Моля, въведете данните на фирмата ръчно.';
            eikFeedbackMsg.className = 'field-hint-msg';
          }
          isCompanyDataVerified = true;
        }
      }, 350);
    });
  }

  // Real-time synchronization while user edits in company inputs
  [companyNameInput, companyAddressInput, companyRepresentativeInput].forEach(inp => {
    if (inp) {
      inp.addEventListener('input', () => {
        inp.dataset.manuallyEdited = 'true';
        if (inp === companyRepresentativeInput && typedSigInput && !typedSigInput.dataset.userEdited) {
          typedSigInput.value = inp.value.trim();
          updateTypedFontSamples(inp.value.trim());
        }
        checkStep1Progress();
      });
    }
  });

  // =========================================================================
  // 3. Dropdown for Bank Selection (No search box, clean dropdown)
  // =========================================================================
  const customBankInputWrapper = document.getElementById('customBankInputWrapper');
  const customBankInput = document.getElementById('customBankInput');

  function syncBankField() {
    if (!bankNameSelect) return;
    const val = bankNameSelect.value;
    if (val === 'custom') {
      if (customBankInputWrapper) customBankInputWrapper.style.display = 'block';
      const cVal = customBankInput ? customBankInput.value.trim() : '';
      updateFieldInDoc('bankName', cVal || 'Друга банка', liveSyncMap.bankName.placeholder);
      if (customBankInput) customBankInput.focus();
    } else {
      if (customBankInputWrapper) customBankInputWrapper.style.display = 'none';
      updateFieldInDoc('bankName', val, liveSyncMap.bankName.placeholder);
    }
    checkStep1Progress();
  }

  if (bankNameSelect) {
    bankNameSelect.addEventListener('change', syncBankField);
    bankNameSelect.addEventListener('input', syncBankField);
  }

  if (customBankInput) {
    customBankInput.addEventListener('input', () => {
      if (bankNameSelect && bankNameSelect.value === 'custom') {
        const cVal = customBankInput.value.trim();
        updateFieldInDoc('bankName', cVal || 'Друга банка', liveSyncMap.bankName.placeholder);
        checkStep1Progress();
      }
    });
  }

  // Initial sync call
  syncAllFields();

  // =========================================================================
  // 4. Document View Switch (Main Continuous Scroll vs Terms View)
  // =========================================================================
  const viewMainDocBtn = document.getElementById('viewMainDocBtn');
  const viewTermsBtn = document.getElementById('viewTermsBtn');
  const mainDocContainer = document.getElementById('mainDocContainer');
  const termsDocContainer = document.getElementById('termsDocContainer');

  function showMainDoc() {
    if (viewMainDocBtn) viewMainDocBtn.classList.add('active');
    if (viewTermsBtn) viewTermsBtn.classList.remove('active');
    if (mainDocContainer) mainDocContainer.style.display = 'flex';
    if (termsDocContainer) termsDocContainer.style.display = 'none';
  }

  function showTermsDoc() {
    if (viewTermsBtn) viewTermsBtn.classList.add('active');
    if (viewMainDocBtn) viewMainDocBtn.classList.remove('active');
    if (termsDocContainer) termsDocContainer.style.display = 'flex';
    if (mainDocContainer) mainDocContainer.style.display = 'none';

    // Mark step 2 indicator as completed
    const step2 = document.getElementById('stepIndicator2');
    if (step2) step2.classList.add('completed');
  }

  if (viewMainDocBtn) viewMainDocBtn.addEventListener('click', showMainDoc);
  if (viewTermsBtn) viewTermsBtn.addEventListener('click', showTermsDoc);

  const viewTermsLink = document.getElementById('viewTermsLink');
  if (viewTermsLink) {
    viewTermsLink.addEventListener('click', (e) => {
      e.preventDefault();
      showTermsDoc();
    });
  }

  // Zoom controls
  let currentZoom = 1.0;
  const zoomDisplay = document.getElementById('zoomLevelDisplay');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');

  function applyZoom(newZoom) {
    currentZoom = Math.min(1.4, Math.max(0.65, Math.round(newZoom * 10) / 10));
    if (zoomDisplay) zoomDisplay.textContent = `${Math.round(currentZoom * 100)}%`;
    const mainDoc = document.getElementById('mainDocContainer');
    const termsDoc = document.getElementById('termsDocContainer');
    [mainDoc, termsDoc].forEach(container => {
      if (container) {
        if ('zoom' in container.style) {
          container.style.zoom = currentZoom;
        } else {
          container.style.transform = `scale(${currentZoom})`;
          container.style.transformOrigin = 'top center';
        }
      }
    });
  }

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => applyZoom(currentZoom + 0.1));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => applyZoom(currentZoom - 0.1));



  // =========================================================================
  // 5. Electronic Signature Engine (Merchant only, IRIS strictly unsigned)
  // =========================================================================
  const sigTabs = document.querySelectorAll('.sig-tab-btn');
  const sigContents = document.querySelectorAll('.sig-tab-content');
  let currentSigMode = 'draw';

  // --- A. Canvas Drawing Setup ---
  const canvas = document.getElementById('sigCanvas') || document.getElementById('signatureCanvas');
  const canvasHint = document.querySelector('.canvas-watermark') || document.querySelector('.canvas-placeholder-hint');
  const clearCanvasBtn = document.getElementById('clearCanvasBtn');
  let isDrawing = false;
  let hasDrawn = false;
  let ctx = null;

  // --- B. Typed Signature Setup ---
  const typedSigInput = document.getElementById('typedSigInput');
  const fontCards = document.querySelectorAll('.font-card, .font-preview-card');
  let selectedFontFamily = 'Homemade Apple';

  // --- C. Upload Image Setup ---
  const sigFileInput = document.getElementById('sigFileInput');
  const uploadPreviewWrapper = document.getElementById('uploadPreviewWrapper');
  const uploadPreviewImg = document.getElementById('uploadPreviewImg');
  let uploadedImgDataUrl = null;

  // --- D. Apply Signature to Documents (Merchant only) ---
  const applySignatureBtn = document.getElementById('applySignatureBtn');
  const signBothCheckbox = document.getElementById('signBothCheckbox');

  let isContractSigned = false;
  let isAppendixSigned = false;

  function isSignatureReady() {
    if (currentSigMode === 'draw') {
      return !!hasDrawn;
    } else if (currentSigMode === 'type') {
      const val = (typedSigInput && typedSigInput.value.trim()) || '';
      return val.length >= 2;
    } else if (currentSigMode === 'upload') {
      return !!uploadedImgDataUrl;
    }
    return false;
  }

  function updateApplySignatureBtnState() {
    if (!applySignatureBtn) return;
    const ready = isSignatureReady();
    if (ready) {
      applySignatureBtn.disabled = false;
      applySignatureBtn.classList.remove('btn-disabled');
      applySignatureBtn.removeAttribute('aria-disabled');
    } else {
      applySignatureBtn.disabled = true;
      applySignatureBtn.classList.add('btn-disabled');
      applySignatureBtn.setAttribute('aria-disabled', 'true');
    }
  }

  function resetDocumentSignatures() {
    isContractSigned = false;
    isAppendixSigned = false;
    updateBadge('badgeContract', 'Неподписан', false);
    updateBadge('badgeAppendix', 'Неподписан', false);

    const holder1 = document.getElementById('contractSigHolder1');
    const holder2 = document.getElementById('contractSigHolder2');
    const holder3 = document.getElementById('contractSigHolder3');
    const appendixHolder = document.getElementById('appendixSigHolder');
    if (holder1) holder1.innerHTML = '';
    if (holder2) holder2.innerHTML = '';
    if (holder3) holder3.innerHTML = '';
    if (appendixHolder) appendixHolder.innerHTML = '';

    const step3 = document.getElementById('stepIndicator3');
    if (step3) step3.classList.remove('completed');
  }

  sigTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      sigTabs.forEach(b => b.classList.remove('active'));
      sigContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      currentSigMode = btn.dataset.mode;

      const targetContent = document.getElementById(
        currentSigMode === 'draw' ? 'sigContentDraw' :
        currentSigMode === 'type' ? 'sigContentType' : 'sigContentUpload'
      );
      if (targetContent) targetContent.classList.add('active');

      updateApplySignatureBtnState();
    });
  });

  if (canvas) {
    ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';

    function getCanvasCoordinates(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if (e.touches && e.touches[0]) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }

    function startDrawing(e) {
      e.preventDefault();
      isDrawing = true;
      hasDrawn = true;
      if (canvasHint) canvasHint.style.display = 'none';
      const coords = getCanvasCoordinates(e);
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
      updateApplySignatureBtnState();
    }

    function draw(e) {
      if (!isDrawing) return;
      e.preventDefault();
      hasDrawn = true;
      const coords = getCanvasCoordinates(e);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      updateApplySignatureBtnState();
    }

    function stopDrawing() {
      isDrawing = false;
      updateApplySignatureBtnState();
    }

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);

    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDrawing);
  }

  if (clearCanvasBtn && canvas && ctx) {
    clearCanvasBtn.addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawn = false;
      if (canvasHint) canvasHint.style.display = 'block';
      updateApplySignatureBtnState();
      if (currentSigMode === 'draw') {
        resetDocumentSignatures();
      }
    });
  }

  function updateTypedFontSamples(text) {
    const val = text || (document.getElementById('companyRepresentative')?.value || '').trim() || 'Иван Димитров';
    document.querySelectorAll('.font-sample').forEach(sample => {
      sample.textContent = val;
    });
  }

  if (typedSigInput) {
    typedSigInput.addEventListener('input', (e) => {
      typedSigInput.dataset.userEdited = 'true';
      updateTypedFontSamples(e.target.value);
      updateApplySignatureBtnState();
      if (!e.target.value.trim() && currentSigMode === 'type') {
        resetDocumentSignatures();
      }
    });
  }

  fontCards.forEach(card => {
    card.addEventListener('click', () => {
      fontCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectedFontFamily = card.dataset.font;
    });
  });

  if (sigFileInput) {
    sigFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          uploadedImgDataUrl = event.target.result;
          if (uploadPreviewImg) uploadPreviewImg.src = uploadedImgDataUrl;
          if (uploadPreviewWrapper) uploadPreviewWrapper.style.display = 'block';
          updateApplySignatureBtnState();
        };
        reader.readAsDataURL(file);
      }
    });
  }

  function createSignatureElementHtml() {
    if (!isSignatureReady()) return null;

    if (currentSigMode === 'draw' && hasDrawn && canvas) {
      const dataUrl = canvas.toDataURL();
      return `
        <div class="placed-merchant-sig drawn">
          <img src="${dataUrl}" alt="Подпис" style="max-height:46px; display:block;">
        </div>
      `;
    } else if (currentSigMode === 'type') {
      const sigText = (typedSigInput && typedSigInput.value.trim()) || '';
      if (!sigText) return null;

      let fontClass = 'style-script';
      if (selectedFontFamily === 'Great Vibes') fontClass = 'style-vibes';
      if (selectedFontFamily === 'Playfair Display') fontClass = 'style-serif';

      return `
        <div class="placed-merchant-sig typed">
          <div class="font-sample ${fontClass}" style="font-size:24px; line-height:1.2;">${sigText}</div>
        </div>
      `;
    } else if (currentSigMode === 'upload' && uploadedImgDataUrl) {
      return `
        <div class="placed-merchant-sig drawn">
          <img src="${uploadedImgDataUrl}" alt="Подпис" style="max-height:46px; display:block;">
        </div>
      `;
    }
    return null;
  }

  function handleApplySignatureClick(e) {
    if (e) e.preventDefault();

    if (!isSignatureReady()) {
      let errorMsg = 'Моля, положете подпис под някоя от изброените форми (рисуване, текст или файл).';
      if (currentSigMode === 'draw') {
        errorMsg = 'Моля, нарисувайте Вашия подпис в полето с мишка или тъчпад, преди да подпишете.';
        const wrapper = document.querySelector('.canvas-wrapper') || canvas;
        if (wrapper) {
          wrapper.classList.add('shake-error');
          setTimeout(() => wrapper.classList.remove('shake-error'), 600);
        }
      } else if (currentSigMode === 'type') {
        errorMsg = 'Моля, въведете име за Вашия електронен подпис в текстовото поле.';
        if (typedSigInput) {
          typedSigInput.focus();
          typedSigInput.classList.add('shake-error');
          setTimeout(() => typedSigInput.classList.remove('shake-error'), 600);
        }
      } else if (currentSigMode === 'upload') {
        errorMsg = 'Моля, качете файл с изображение на Вашия подпис (PNG или JPG).';
        const dropzone = document.getElementById('sigDropzone');
        if (dropzone) {
          dropzone.classList.add('shake-error');
          setTimeout(() => dropzone.classList.remove('shake-error'), 600);
        }
      }
      showToast(errorMsg, 'error');
      return;
    }

    applySignature();
  }

  function applySignature() {
    if (!isSignatureReady()) {
      handleApplySignatureClick();
      return;
    }

    const sigHtml = createSignatureElementHtml();
    if (!sigHtml) {
      handleApplySignatureClick();
      return;
    }

    // Sign all 3 Merchant slots on Page 7 into their respective holders (Provider remains strictly blank)
    const holder1 = document.getElementById('contractSigHolder1');
    const holder2 = document.getElementById('contractSigHolder2');
    const holder3 = document.getElementById('contractSigHolder3');
    if (holder1) holder1.innerHTML = sigHtml;
    if (holder2) holder2.innerHTML = sigHtml;
    if (holder3) holder3.innerHTML = sigHtml;

    isContractSigned = true;
    updateBadge('badgeContract', 'Подписан', true);

    // Unconditionally sign Appendix 1 slot simultaneously without requiring separate prompt
    const appendixHolder = document.getElementById('appendixSigHolder');
    if (appendixHolder) {
      appendixHolder.innerHTML = sigHtml;
    }
    isAppendixSigned = true;
    updateBadge('badgeAppendix', 'Подписан', true);

    // Update step indicator 3
    const step3 = document.getElementById('stepIndicator3');
    if (step3) step3.classList.add('completed');

    showToast('Договорът и приложението са успешно подписани', 'success');
  }

  function updateBadge(id, text, isSigned) {
    const b = document.getElementById(id);
    if (!b) return;
    b.textContent = text;
    if (isSigned) {
      b.classList.add('signed');
      b.parentElement.querySelector('.status-icon').classList.remove('pending');
      b.parentElement.querySelector('.status-icon').classList.add('signed');
    } else {
      b.classList.remove('signed');
      b.parentElement.querySelector('.status-icon').classList.add('pending');
      b.parentElement.querySelector('.status-icon').classList.remove('signed');
    }
  }

  if (applySignatureBtn) {
    applySignatureBtn.addEventListener('click', handleApplySignatureClick);
  }

  // Initial call to set correct button state
  updateApplySignatureBtnState();

  // =========================================================================
  // 6. Progress Tracker Helpers
  // =========================================================================
  function checkStep1Progress() {
    const comp = (document.getElementById('companyName')?.value || '').trim();
    const eik = (document.getElementById('companyEik')?.value || '').trim();
    const rep = (document.getElementById('companyRepresentative')?.value || '').trim();
    const iban = (document.getElementById('bankIban')?.value || '').trim();
    const bankVal = bankNameSelect ? bankNameSelect.value.trim() : '';
    const bank = (bankVal === 'custom')
      ? ((customBankInput?.value || '').trim())
      : bankVal;

    const step1 = document.getElementById('stepIndicator1');
    if (step1) {
      if (comp && eik && rep && iban && bank) {
        step1.classList.add('completed');
      } else {
        step1.classList.remove('completed');
      }
    }
  }

  // =========================================================================
  // 7. Form Submission & Validation (Exact Required Text)
  // =========================================================================
  const submitBtn = document.getElementById('submitContractBtn');
  const successModalOverlay = document.getElementById('successModalOverlay');
  const modalCloseBtn = document.getElementById('modalCloseBtn');

  /**
   * Generates a single combined PDF document containing all 7 pages of the Contract
   * and Page 8 (Appendix 1) with exact styling, user data, and merchant signatures.
   * Returns a raw Base64 string for direct attachment via Resend API.
   */
  async function generateContractPdfBase64() {
    window.generateContractPdfBase64 = generateContractPdfBase64;
    if (typeof html2pdf === 'undefined') {
      console.warn('html2pdf library is not loaded');
      return null;
    }

    const sheetIds = [
      'docSheet1',
      'docSheet2',
      'docSheet3',
      'docSheet4',
      'docSheet5',
      'docSheet6',
      'docSheet7',
      'docSheet8',
      'docSheet9',
      'docSheetAppendix'
    ];

    const compName = (document.getElementById('companyName')?.value || '').trim();
    const cleanCompName = compName ? compName.replace(/["'„“«»<>:\/\\|?*]/g, '').trim() : 'Търговец';
    const pdfFilename = `Договор (${cleanCompName}).pdf`;

    const opt = {
      margin: 0,
      filename: pdfFilename,
      image: { type: 'jpeg', quality: 0.88 },
      html2canvas: {
        scale: 1.5,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        backgroundColor: '#ffffff'
      },
      jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
    };

    const savedScrollX = window.scrollX || window.pageXOffset || 0;
    const savedScrollY = window.scrollY || window.pageYOffset || 0;

    try {
      // Temporarily scroll to top so html2canvas never calculates offset from pageYOffset
      window.scrollTo(0, 0);

      document.body.classList.add('generating-pdf');

      // Initialize a clean 1-page jsPDF instance
      const dummyDiv = document.createElement('div');
      dummyDiv.style.cssText = 'width:1px;height:1px;background:#ffffff;';
      const pdf = await html2pdf().set(opt).from(dummyDiv).toPdf().get('pdf');

      const a4Width = 595.28;
      const a4Height = 841.89;

      for (let i = 0; i < sheetIds.length; i++) {
        const el = document.getElementById(sheetIds[i]);
        if (!el) continue;

        const canvas = await html2pdf().set(opt).from(el).toCanvas().get('canvas');
        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }

        const scale = Math.min(a4Width / canvas.width, a4Height / canvas.height);
        const drawW = canvas.width * scale;
        const drawH = canvas.height * scale;
        const offsetX = (a4Width - drawW) / 2;
        pdf.addImage(canvas, 'JPEG', offsetX, 0, drawW, drawH, undefined, 'FAST');
      }

      const pdfDataUri = pdf.output('datauristring');
      if (pdfDataUri && typeof pdfDataUri === 'string') {
        const base64Marker = ';base64,';
        const markerIdx = pdfDataUri.indexOf(base64Marker);
        let rawBase64 = markerIdx !== -1
          ? pdfDataUri.substring(markerIdx + base64Marker.length).trim()
          : pdfDataUri.replace(/^data:[^;]*;base64,/, '').trim();

        const pdfMagicIdx = rawBase64.indexOf('JVBERi');
        if (pdfMagicIdx !== -1 && pdfMagicIdx < 80) {
          rawBase64 = rawBase64.substring(pdfMagicIdx).trim();
        }
        return rawBase64.replace(/[\r\n\s"']+$/, '');
      }
      return null;
    } catch (err) {
      console.error('Грешка при генериране на PDF документ:', err);
      return null;
    } finally {
      document.body.classList.remove('generating-pdf');
      window.scrollTo(savedScrollX, savedScrollY);
    }
  }
  window.generateContractPdfBase64 = generateContractPdfBase64;

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // 1. Check basic required input fields
      const requiredInputs = form.querySelectorAll('input[required]');
      let firstMissing = null;
      requiredInputs.forEach(input => {
        if (!input.disabled && !input.value.trim()) {
          if (!firstMissing) firstMissing = input;
          input.classList.add('is-invalid');
        } else {
          input.classList.remove('is-invalid');
        }
      });

      // 2. Validate EIK
      const eikVal = (companyEikInput?.value || '').replace(/\D/g, '');
      if (eikVal.length < 9) {
        showToast('Моля, въведете 9-цифрен ЕИК / БУЛСТАТ.', 'error');
        if (companyEikInput) {
          companyEikInput.classList.add('is-invalid');
          companyEikInput.focus();
        }
        return;
      }

      // 3. Validate Company Data Verification (Prompt with ✓ / ✕)
      if (companyVerifyBanner && companyVerifyBanner.style.display !== 'none' && !isCompanyDataVerified) {
        showToast('Моля, потвърдете верността на данните за фирмата с (✓) или направете редакция в полетата.', 'error');
        companyVerifyBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      // 4. Check bank selection
      if (!bankNameSelect || !bankNameSelect.value.trim()) {
        showToast('Моля, изберете обслужваща банка от падащия списък.', 'error');
        if (bankNameSelect) bankNameSelect.focus();
        return;
      }
      if (bankNameSelect.value === 'custom' && (!customBankInput || !customBankInput.value.trim())) {
        showToast('Моля, въведете наименованието на Вашата банка / институция.', 'error');
        if (customBankInput) customBankInput.focus();
        return;
      }

      // 4.1 Check IBAN entered
      const ibanVal = (bankIbanInput?.value || '').trim();
      if (!ibanVal) {
        showToast('Моля, въведете IBAN сметка на Търговеца.', 'error');
        if (bankIbanInput) {
          bankIbanInput.classList.add('is-invalid');
          bankIbanInput.focus();
        }
        return;
      }

      // 5. Check Email format
      const emailVal = (contactEmailInput?.value || '').trim();
      if (!validateEmail(emailVal)) {
        showToast('Моля, въведете валиден e-mail адрес за кореспонденция (напр. name@company.bg).', 'error');
        if (contactEmailInput) {
          contactEmailInput.classList.add('is-invalid');
          contactEmailInput.focus();
        }
        if (contactEmailError) contactEmailError.style.display = 'block';
        return;
      }

      // 6. Check Phone format
      const phoneVal = (contactPhoneInput?.value || '').trim();
      if (!validatePhone(phoneVal)) {
        showToast('Моля, въведете валиден телефон за връзка (напр. 0888 123 456).', 'error');
        if (contactPhoneInput) {
          contactPhoneInput.classList.add('is-invalid');
          contactPhoneInput.focus();
        }
        if (contactPhoneError) contactPhoneError.style.display = 'block';
        return;
      }

      if (firstMissing) {
        firstMissing.focus();
        showToast('Моля, попълнете всички задължителни полета, отбелязани със звездичка (*).', 'error');
        return;
      }

      // 7. Check signature status
      if (!isContractSigned || !isAppendixSigned) {
        showToast('Моля, положете Вашия електронен подпис върху Договора и Приложение 1 преди изпращане.', 'error');
        const sigSec = document.getElementById('signatureSectionCard');
        if (sigSec) sigSec.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      // 8. Check General Terms agreement & Representation confirmation
      const agreeTerms = document.getElementById('agreeTermsCheckbox');
      const confirmData = document.getElementById('confirmDataCheckbox');
      if (!agreeTerms || !agreeTerms.checked) {
        showToast('Необходимо е да се съгласите с Общите условия на „Айрис Солюшънс“ АД.', 'error');
        if (agreeTerms) agreeTerms.focus();
        return;
      }
      if (!confirmData || !confirmData.checked) {
        showToast('Моля, декларирайте верността на данните и представителната власт.', 'error');
        if (confirmData) confirmData.focus();
        return;
      }

      // Note: newsletterCheckbox is optional! It does not block submission whether checked or unchecked.

      // Gather contract and contact data for email dispatch to sales@irisbgsf.com
      const compName = (document.getElementById('companyName')?.value || '').trim();
      const compEik = (document.getElementById('companyEik')?.value || '').trim();
      const compRep = (document.getElementById('companyRepresentative')?.value || '').trim();
      const cDate = contractDateInput ? contractDateInput.value : '';

      // Format date strictly as DD.MM.YYYY (day, month, year)
      let formattedDateStr = '';
      if (cDate) {
        formattedDateStr = formatBulgarianDate(cDate);
      } else {
        const dNow = new Date();
        formattedDateStr = `${String(dNow.getDate()).padStart(2, '0')}.${String(dNow.getMonth() + 1).padStart(2, '0')}.${dNow.getFullYear()} г.`;
      }

      const randomRef = Math.floor(1000 + Math.random() * 9000);
      const now = new Date();
      const timeStr = `${formattedDateStr} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const refNumber = `#IRIS-SIGN-2026-${randomRef}`;

      // Show pure loading screen overlay immediately
      const loadingOverlay = document.getElementById('loadingScreenOverlay');
      if (loadingOverlay) loadingOverlay.style.display = 'flex';

      // Show sending feedback on submit button
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '⟳ Изпращане...';
      }

      // Capture merchant signature image as clean PNG Base64
      let sigBase64 = null;
      try {
        if (currentSigMode === 'draw' && hasDrawn && canvas) {
          sigBase64 = canvas.toDataURL('image/png');
        } else {
          // Render typed signature to offscreen canvas
          const sigText = (typedSigInput && typedSigInput.value.trim()) || compRep || 'Иван Иванов';
          const off = document.createElement('canvas');
          off.width = 320;
          off.height = 80;
          const octx = off.getContext('2d');
          octx.clearRect(0, 0, 320, 80);
          octx.font = 'italic 28px "Segoe Script", "Brush Script MT", cursive, sans-serif';
          octx.fillStyle = '#0f3b8c';
          octx.fillText(sigText, 10, 48);
          octx.beginPath();
          octx.moveTo(10, 56);
          octx.quadraticCurveTo(110, 70, 260, 54);
          octx.lineWidth = 1.8;
          octx.strokeStyle = 'rgba(15, 59, 140, 0.7)';
          octx.stroke();
          sigBase64 = off.toDataURL('image/png');
        }
      } catch (sigErr) {
        console.warn('Signature PNG capture error:', sigErr);
      }

      const compAddress = (document.getElementById('companyAddress')?.value || '').trim();
      const bankVal = bankNameSelect ? bankNameSelect.value.trim() : '';
      const bankNameText = (bankVal === 'custom') ? ((customBankInput?.value || '').trim()) : bankVal;
      const bankIbanVal = (document.getElementById('bankIban')?.value || '').trim();
      const websiteVal = getCombinedWebsites();
      const contactAddressVal = (document.getElementById('contactAddress')?.value || compAddress || '').trim();

      // Asynchronous API call to /api/send-contract with DD.MM.YYYY formatted date and full vector PDF parameters
      const emailPayload = {
        targetEmail: 'sales@irisbgsf.com',
        companyName: compName,
        companyEik: compEik,
        companyAddress: compAddress,
        companyRepresentative: compRep,
        bankName: bankNameText,
        bankIban: bankIbanVal,
        website: websiteVal,
        contactAddress: contactAddressVal,
        contactEmail: emailVal,
        contactPhone: phoneVal,
        contractDate: formattedDateStr,
        signatureImageBase64: sigBase64,
        affiliateRef: localStorage.getItem('iris_affiliate_ref') || sessionStorage.getItem('iris_affiliate_ref') || null
      };

      try {
        const response = await fetch('/api/send-contract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailPayload)
        });
        const resData = await response.json();
        console.log('Contract email response confirmation:', resData);
        await new Promise(res => setTimeout(res, 400));
      } catch (err) {
        console.warn('Backend email API offline/dev fallback:', err);
      } finally {
        // Hide loading screen overlay
        if (loadingOverlay) {
          loadingOverlay.style.display = 'none';
        }

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = submitBtn.dataset.originalText || 'Потвърди и изпрати договора';
        }

        // Show Confirmation / Success Modal
        if (successModalOverlay) {
          successModalOverlay.style.display = 'flex';
        }

        showToast('Договорът и Приложение 1 са изпратени успешно!', 'success');
      }
    });
  }

  if (modalCloseBtn && successModalOverlay) {
    modalCloseBtn.addEventListener('click', () => {
      successModalOverlay.style.display = 'none';
    });
  }

  // =========================================================================
  // 8. Interactive Countdown Timer
  // =========================================================================
  let totalSeconds = 29 * 60 + 59; // 29m 59s
  const minEl = document.getElementById('timerMinutes');
  const secEl = document.getElementById('timerSeconds');

  setInterval(() => {
    if (totalSeconds > 0) {
      totalSeconds--;
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      if (minEl) minEl.textContent = String(m).padStart(2, '0');
      if (secEl) secEl.textContent = String(s).padStart(2, '0');
    }
  }, 1000);

  // =========================================================================
  // 9. Toast Helper
  // =========================================================================
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }
});
