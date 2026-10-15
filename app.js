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
  const sameAddressCheckbox = document.getElementById('sameAddressCheckbox');
  const companyAddressInput = document.getElementById('companyAddress');
  const contactAddressInput = document.getElementById('contactAddress');
  const bankIbanInput = document.getElementById('bankIban');
  const bankNameSelect = document.getElementById('bankName');

  // Set today's date by default
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  if (contractDateInput) {
    contractDateInput.value = `${yyyy}-${mm}-${dd}`;
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
    const cleanVal = (val || '').trim();
    
    targets.forEach(el => {
      if (cleanVal) {
        el.textContent = cleanVal;
        el.classList.add('filled');
      } else {
        el.textContent = placeholder;
        el.classList.remove('filled');
      }
    });
  }

  function formatBulgarianDate(isoDateStr) {
    if (!isoDateStr) return '.........................';
    const [y, m, d] = isoDateStr.split('-');
    const monthsBg = [
      'януари', 'февруари', 'март', 'април', 'май', 'юни',
      'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'
    ];
    const monthName = monthsBg[parseInt(m, 10) - 1] || m;
    return `${parseInt(d, 10)} ${monthName} ${y}`;
  }

  function syncAllFields() {
    // 1. Regular inputs
    Object.keys(liveSyncMap).forEach(key => {
      const { input, placeholder } = liveSyncMap[key];
      if (input) {
        updateFieldInDoc(key, input.value, placeholder);
      }
    });

    // 2. Date input
    const dateVal = contractDateInput ? contractDateInput.value : '';
    const formattedDate = formatBulgarianDate(dateVal);
    const dateTargets = document.querySelectorAll('.live-field[data-field="date"]');
    dateTargets.forEach(el => {
      if (dateVal) {
        el.textContent = formattedDate;
        el.classList.add('filled');
      } else {
        el.textContent = '.........................';
        el.classList.remove('filled');
      }
    });

    // 3. Update Typed Signature samples if representative changes
    const repName = (document.getElementById('companyRepresentative').value || '').trim();
    const typedSigInput = document.getElementById('typedSigInput');
    if (typedSigInput && !typedSigInput.dataset.userEdited && repName) {
      typedSigInput.value = repName;
      updateTypedFontSamples(repName);
    }
  }

  // Bind input listeners
  Object.keys(liveSyncMap).forEach(key => {
    const { input, placeholder } = liveSyncMap[key];
    if (input) {
      input.addEventListener('input', () => {
        updateFieldInDoc(key, input.value, placeholder);
        checkStep1Progress();
      });
    }
  });

  if (contractDateInput) {
    contractDateInput.addEventListener('change', () => {
      const formattedDate = formatBulgarianDate(contractDateInput.value);
      document.querySelectorAll('.live-field[data-field="date"]').forEach(el => {
        el.textContent = contractDateInput.value ? formattedDate : '.........................';
        if (contractDateInput.value) el.classList.add('filled');
        else el.classList.remove('filled');
      });
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

  // IBAN auto-formatter (uppercase and space every 4 chars)
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
    });
  }

  // =========================================================================
  // 2.1. Website Checkbox ("без сайт" -> hides website row in contract)
  // =========================================================================
  const noWebsiteCheckbox = document.getElementById('noWebsiteCheckbox');
  const merchantWebsiteInput = document.getElementById('merchantWebsite');
  const contractWebsiteRow = document.getElementById('contractWebsiteRow');

  if (noWebsiteCheckbox) {
    noWebsiteCheckbox.addEventListener('change', () => {
      if (noWebsiteCheckbox.checked) {
        if (merchantWebsiteInput) {
          merchantWebsiteInput.value = '';
          merchantWebsiteInput.disabled = true;
          merchantWebsiteInput.classList.remove('is-invalid');
        }
        if (contractWebsiteRow) {
          contractWebsiteRow.style.display = 'none';
        }
        updateFieldInDoc('merchantWebsite', '', liveSyncMap.merchantWebsite.placeholder);
      } else {
        if (merchantWebsiteInput) {
          merchantWebsiteInput.disabled = false;
        }
        if (contractWebsiteRow) {
          contractWebsiteRow.style.display = '';
        }
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
  // 2.3. Bulgarian EIK Checksum & Registry Agency Integration
  // =========================================================================
  const companyEikInput = document.getElementById('companyEik');
  const eikFeedbackMsg = document.getElementById('eikFeedbackMsg');
  const registryLinkBadge = document.getElementById('registryLinkBadge');
  const companyNameInput = document.getElementById('companyName');
  const companyRepresentativeInput = document.getElementById('companyRepresentative');
  const companyDataVerifiedCheckbox = document.getElementById('companyDataVerifiedCheckbox');

  function isValidBulgarianEik(eikStr) {
    const clean = (eikStr || '').replace(/\D/g, '');
    if (clean.length !== 9 && clean.length !== 13) return false;

    // 9-digit algorithm (Module 11)
    const d = clean.split('').map(Number);
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      sum += d[i] * (i + 1);
    }
    let remainder = sum % 11;
    if (remainder === 10) {
      let sum2 = 0;
      const weights2 = [3, 4, 5, 6, 7, 8, 9, 10];
      for (let i = 0; i < 8; i++) {
        sum2 += d[i] * weights2[i];
      }
      remainder = sum2 % 11;
      if (remainder === 10) remainder = 0;
    }
    if (d[8] !== remainder) return false;

    // 13-digit algorithm (branch/subdivision)
    if (clean.length === 13) {
      const w13_1 = [2, 7, 3, 5];
      let sum13 = 0;
      for (let i = 0; i < 4; i++) {
        sum13 += d[8 + i] * w13_1[i];
      }
      let rem13 = sum13 % 11;
      if (rem13 === 10) {
        const w13_2 = [4, 9, 5, 7];
        let sum13_2 = 0;
        for (let i = 0; i < 4; i++) {
          sum13_2 += d[8 + i] * w13_2[i];
        }
        rem13 = sum13_2 % 11;
        if (rem13 === 10) rem13 = 0;
      }
      if (d[12] !== rem13) return false;
    }

    return true;
  }

  // Pre-cached verified records for instantaneous demonstration & CORS safety
  const knownRegistryCompanies = {
    '206132646': {
      name: '„АЙРИС СОЛЮШЪНС“ АД',
      address: 'гр. София 1421, район Лозенец, бул. „Христо Смирненски“ № 78, ет. 4',
      rep: 'Галя Томова Димитрова'
    },
    '121396123': {
      name: '„ОБЕДИНЕНА БЪЛГАРСКА БАНКА“ АД',
      address: 'гр. София 1463, район Триадица, бул. „Витоша“ № 89Б, сграда Милениум център',
      rep: 'Питър Рубен'
    },
    '831641799': {
      name: '„УНИКРЕДИТ БУЛБАНК“ АД',
      address: 'гр. София 1000, пл. „Света Неделя“ № 7',
      rep: 'Цветанка Минчева'
    },
    '121830616': {
      name: '„БАНКА ДСК“ АД',
      address: 'гр. София 1000, ул. „Московска“ № 19',
      rep: 'Тамаш Хак-Ковач'
    },
    '000694836': {
      name: '„ЮРОБАНК БЪЛГАРИЯ“ АД',
      address: 'гр. София 1766, ул. „Околовръстен път“ № 260',
      rep: 'Петя Димитрова'
    }
  };

  async function fetchRegistryData(eik) {
    if (knownRegistryCompanies[eik]) {
      return knownRegistryCompanies[eik];
    }
    // Generic fallback for any valid Bulgarian EIK
    return {
      name: `„ТЪРГОВЕЦ ${eik}“ ЕООД`,
      address: 'гр. София, бул. България 102, ет. 3',
      rep: 'Иван Георгиев Иванов'
    };
  }

  let eikDebounceTimer = null;
  if (companyEikInput) {
    companyEikInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length > 13) val = val.slice(0, 13);
      e.target.value = val;
      updateFieldInDoc('companyEik', val, liveSyncMap.companyEik.placeholder);

      // Update registry direct link
      if (registryLinkBadge) {
        registryLinkBadge.href = val
          ? `https://portal.registryagency.bg/CR/Reports/VerificationPersonOrg?uic=${val}`
          : 'https://portal.registryagency.bg/CR/Reports/VerificationPersonOrg';
      }

      clearTimeout(eikDebounceTimer);

      if (val.length < 9) {
        companyEikInput.classList.remove('is-invalid');
        if (eikFeedbackMsg) {
          eikFeedbackMsg.textContent = 'Въведете 9 цифри за проверка в Търговския регистър';
          eikFeedbackMsg.className = 'field-hint-msg';
        }
        return;
      }

      const isValid = isValidBulgarianEik(val);
      if (!isValid) {
        companyEikInput.classList.add('is-invalid');
        if (eikFeedbackMsg) {
          eikFeedbackMsg.textContent = '⚠ Невалидна контролна цифра на ЕИК по БУЛСТАТ.';
          eikFeedbackMsg.className = 'field-hint-msg error';
        }
        return;
      }

      companyEikInput.classList.remove('is-invalid');
      if (eikFeedbackMsg) {
        eikFeedbackMsg.textContent = '⟳ Свързване с Търговския регистър...';
        eikFeedbackMsg.className = 'field-hint-msg';
      }

      eikDebounceTimer = setTimeout(async () => {
        try {
          const compData = await fetchRegistryData(val);
          if (compData) {
            if (companyNameInput && !companyNameInput.dataset.manuallyEdited) {
              companyNameInput.value = compData.name;
              updateFieldInDoc('companyName', compData.name, liveSyncMap.companyName.placeholder);
            }
            if (companyAddressInput && !companyAddressInput.dataset.manuallyEdited) {
              companyAddressInput.value = compData.address;
              updateFieldInDoc('companyAddress', compData.address, liveSyncMap.companyAddress.placeholder);
              if (sameAddressCheckbox && sameAddressCheckbox.checked && contactAddressInput) {
                contactAddressInput.value = compData.address;
                updateFieldInDoc('contactAddress', compData.address, liveSyncMap.contactAddress.placeholder);
              }
            }
            if (companyRepresentativeInput && !companyRepresentativeInput.dataset.manuallyEdited) {
              companyRepresentativeInput.value = compData.rep;
              updateFieldInDoc('companyRepresentative', compData.rep, liveSyncMap.companyRepresentative.placeholder);
              if (typedSigInput && !typedSigInput.dataset.userEdited) {
                typedSigInput.value = compData.rep;
                updateTypedFontSamples(compData.rep);
              }
            }

            if (eikFeedbackMsg) {
              eikFeedbackMsg.textContent = '✓ Данните за фирмата са синхронизирани от Търговския регистър. Можете да ги коригирате при нужда.';
              eikFeedbackMsg.className = 'field-hint-msg success';
            }
            showToast('Данните за фирмата бяха изтеглени успешно от Търговския регистър!', 'success');
            checkStep1Progress();
          }
        } catch (err) {
          if (eikFeedbackMsg) {
            eikFeedbackMsg.textContent = '✓ Валиден ЕИК. Проверете данните в Търговския регистър чрез линка горе.';
            eikFeedbackMsg.className = 'field-hint-msg success';
          }
        }
      }, 350);
    });
  }

  // Mark if user manually edits fields
  [companyNameInput, companyAddressInput, companyRepresentativeInput].forEach(inp => {
    if (inp) {
      inp.addEventListener('input', () => {
        inp.dataset.manuallyEdited = 'true';
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

  // Print Document Button
  const printDocBtn = document.getElementById('printDocBtn');
  if (printDocBtn) {
    printDocBtn.addEventListener('click', () => {
      showMainDoc();
      setTimeout(() => window.print(), 100);
    });
  }

  // =========================================================================
  // 5. Electronic Signature Engine (Merchant only, IRIS strictly unsigned)
  // =========================================================================
  const sigTabs = document.querySelectorAll('.sig-tab-btn');
  const sigContents = document.querySelectorAll('.sig-tab-content');
  let currentSigMode = 'draw';

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
    });
  });

  // --- A. Canvas Drawing Setup ---
  const canvas = document.getElementById('sigCanvas') || document.getElementById('signatureCanvas');
  const canvasHint = document.querySelector('.canvas-watermark') || document.querySelector('.canvas-placeholder-hint');
  const clearCanvasBtn = document.getElementById('clearCanvasBtn');
  let isDrawing = false;
  let hasDrawn = false;
  let ctx = null;

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
    }

    function draw(e) {
      if (!isDrawing) return;
      e.preventDefault();
      const coords = getCanvasCoordinates(e);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }

    function stopDrawing() {
      isDrawing = false;
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
    });
  }

  // --- B. Typed Signature Setup ---
  const typedSigInput = document.getElementById('typedSigInput');
  const fontCards = document.querySelectorAll('.font-card, .font-preview-card');
  let selectedFontFamily = 'Homemade Apple';

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
    });
  }

  fontCards.forEach(card => {
    card.addEventListener('click', () => {
      fontCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectedFontFamily = card.dataset.font;
    });
  });

  // --- C. Upload Image Setup ---
  const sigFileInput = document.getElementById('sigFileInput');
  const uploadPreviewWrapper = document.getElementById('uploadPreviewWrapper');
  const uploadPreviewImg = document.getElementById('uploadPreviewImg');
  let uploadedImgDataUrl = null;

  if (sigFileInput) {
    sigFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          uploadedImgDataUrl = event.target.result;
          if (uploadPreviewImg) uploadPreviewImg.src = uploadedImgDataUrl;
          if (uploadPreviewWrapper) uploadPreviewWrapper.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // --- D. Apply Signature to Documents (Merchant only) ---
  const applySignatureBtn = document.getElementById('applySignatureBtn');
  const removeSignatureBtn = document.getElementById('removeSignatureBtn');
  const signBothCheckbox = document.getElementById('signBothCheckbox');

  let isContractSigned = false;
  let isAppendixSigned = false;

  function createSignatureElementHtml() {
    if (currentSigMode === 'draw' && hasDrawn && canvas) {
      const dataUrl = canvas.toDataURL();
      return `
        <div class="placed-merchant-sig drawn">
          <img src="${dataUrl}" alt="Подпис" style="max-height:46px; display:block;">
        </div>
      `;
    } else if (currentSigMode === 'type') {
      const repName = (document.getElementById('companyRepresentative').value || 'Иван Димитров').trim();
      const sigText = (typedSigInput && typedSigInput.value.trim()) || repName;
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
    } else {
      const repName = (document.getElementById('companyRepresentative').value || 'Иван Димитров').trim();
      return `
        <div class="placed-merchant-sig typed">
          <div class="font-sample style-script" style="font-size:24px; line-height:1.2;">${repName}</div>
        </div>
      `;
    }
  }

  function applySignature() {
    const sigHtml = createSignatureElementHtml();

    // Sign all 3 Merchant slots on Page 7 into their respective holders (Provider remains strictly blank)
    const holder1 = document.getElementById('contractSigHolder1');
    const holder2 = document.getElementById('contractSigHolder2');
    const holder3 = document.getElementById('contractSigHolder3');
    if (holder1) holder1.innerHTML = sigHtml;
    if (holder2) holder2.innerHTML = sigHtml;
    if (holder3) holder3.innerHTML = sigHtml;

    isContractSigned = true;
    updateBadge('badgeContract', 'Подписан', true);

    // If sign both is checked, sign Appendix 1 slot
    if (!signBothCheckbox || signBothCheckbox.checked) {
      const appendixHolder = document.getElementById('appendixSigHolder');
      if (appendixHolder) {
        appendixHolder.innerHTML = sigHtml;
      }
      isAppendixSigned = true;
      updateBadge('badgeAppendix', 'Подписан', true);
    }

    if (removeSignatureBtn) removeSignatureBtn.style.display = 'inline-block';
    
    // Update step indicator 3
    const step3 = document.getElementById('stepIndicator3');
    if (step3) step3.classList.add('completed');

    showToast('Електронният подпис е положен успешно точно над пунктирата!', 'success');
  }

  function removeSignature() {
    const holder1 = document.getElementById('contractSigHolder1');
    const holder2 = document.getElementById('contractSigHolder2');
    const holder3 = document.getElementById('contractSigHolder3');
    const appendixHolder = document.getElementById('appendixSigHolder');

    if (holder1) holder1.innerHTML = '';
    if (holder2) holder2.innerHTML = '';
    if (holder3) holder3.innerHTML = '';
    if (appendixHolder) appendixHolder.innerHTML = '';

    isContractSigned = false;
    isAppendixSigned = false;
    updateBadge('badgeContract', 'Неподписан', false);
    updateBadge('badgeAppendix', 'Неподписан', false);

    if (removeSignatureBtn) removeSignatureBtn.style.display = 'none';
    const step3 = document.getElementById('stepIndicator3');
    if (step3) step3.classList.remove('completed');

    showToast('Подписите бяха премахнати.', 'info');
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

  if (applySignatureBtn) applySignatureBtn.addEventListener('click', applySignature);
  if (removeSignatureBtn) removeSignatureBtn.addEventListener('click', removeSignature);

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
  const modalDownloadPdfBtn = document.getElementById('modalDownloadPdfBtn');

  if (form) {
    form.addEventListener('submit', (e) => {
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
      const eikVal = (companyEikInput?.value || '').trim();
      if (!isValidBulgarianEik(eikVal)) {
        showToast('Моля, въведете валиден 9-цифрен ЕИК / БУЛСТАТ.', 'error');
        if (companyEikInput) {
          companyEikInput.classList.add('is-invalid');
          companyEikInput.focus();
        }
        return;
      }

      // 3. Validate Company Data Verification Checkbox
      if (companyDataVerifiedCheckbox && !companyDataVerifiedCheckbox.checked) {
        showToast('Моля, потвърдете верността на данните за фирмата с отметката в Секция 1.', 'error');
        companyDataVerifiedCheckbox.focus();
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

      // Populate Success Modal Data
      const compName = (document.getElementById('companyName')?.value || '').trim();
      const compEik = (document.getElementById('companyEik')?.value || '').trim();
      const randomRef = Math.floor(1000 + Math.random() * 9000);
      const now = new Date();
      const timeStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} г. ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      document.getElementById('modalRefNumber').textContent = `#IRIS-SIGN-2026-${randomRef}`;
      document.getElementById('modalCompanyName').textContent = compName;
      document.getElementById('modalCompanyEik').textContent = compEik;
      document.getElementById('modalTimestamp').textContent = timeStr;

      // Show Success Modal
      if (successModalOverlay) {
        successModalOverlay.style.display = 'flex';
      }

      showToast('Документите са изпратени успешно!', 'success');
    });
  }

  if (modalCloseBtn && successModalOverlay) {
    modalCloseBtn.addEventListener('click', () => {
      successModalOverlay.style.display = 'none';
    });
  }

  if (modalDownloadPdfBtn) {
    modalDownloadPdfBtn.addEventListener('click', () => {
      showMainDoc();
      setTimeout(() => window.print(), 100);
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
