/**
 * IRIS Pay România | Semnare electronică contract
 * Arhitectură identică cu portalul principal, 100% sincronizat și stabil.
 */

function initRoPortal() {
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
  const customBankInputWrapper = document.getElementById('customBankInputWrapper');
  const customBankInput = document.getElementById('customBankInput');
  const companyEikInput = document.getElementById('companyEik');
  const btnVerifyCui = document.getElementById('btnVerifyCui');
  const eikFeedbackMsg = document.getElementById('eikFeedbackMsg');
  const companyNameInput = document.getElementById('companyName');
  const companyRepresentativeInput = document.getElementById('companyRepresentative');
  const companyRepPinInput = document.getElementById('companyRepresentativePin');
  const companyVerifyBanner = document.getElementById('companyVerifyBanner');
  const btnVerifyDataYes = document.getElementById('btnVerifyDataYes');
  const btnVerifyDataNo = document.getElementById('btnVerifyDataNo');
  const companyInputsWrapper = document.getElementById('companyInputsWrapper');
  const noWebsiteCheckbox = document.getElementById('noWebsiteCheckbox');
  const merchantWebsiteInput = document.getElementById('merchantWebsite');
  const extraWebsitesCheckbox = document.getElementById('extraWebsitesCheckbox');
  const extraWebsitesWrapper = document.getElementById('extraWebsitesWrapper');
  const extraWebsite1 = document.getElementById('extraWebsite1');
  const extraWebsite2 = document.getElementById('extraWebsite2');
  const contactEmailInput = document.getElementById('contactEmail');
  const contactPhoneInput = document.getElementById('contactPhone');
  const contactEmailError = document.getElementById('contactEmailError');
  const submitContractBtn = document.getElementById('submitContractBtn');
  const loadingOverlay = document.getElementById('loadingScreenOverlay');
  const docViewport = document.getElementById('docViewport');

  // Today's date automatically formatted as DD.MM.YYYY
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayDmy = `${dd}.${mm}.${yyyy}`;
  const todayYmd = `${yyyy}-${mm}-${dd}`;

  if (contractDateInput) {
    contractDateInput.value = todayDmy;
    document.querySelectorAll('.live-field[data-field="date"]').forEach(el => {
      el.textContent = todayDmy;
      el.classList.add('filled');
      el.classList.remove('underlined');
    });
  }
  if (hiddenNativeDatePicker) {
    hiddenNativeDatePicker.value = todayYmd;
  }

  // Pre-cached verified records for zero-latency fallback
  const knownRegistryCompanies = {
    '14399840': {
      name: 'DANTE INTERNATIONAL SA (eMAG)',
      address: 'Municipiul București, Sector 2, Str. Gara Herăstrău nr. 6, Clădirea Globalworth Square',
      rep: 'Tudor Manea',
      phone: '021 200 52 00'
    },
    '1590120': {
      name: 'OMV PETROM SA',
      address: 'Municipiul București, Sector 1, Str. Coralilor nr. 22 (Petrom City)',
      rep: 'Christina Verchere'
    },
    '2816464': {
      name: 'DEDEMAN SRL',
      address: 'Municipiul Bacău, Str. Alexei Tolstoi nr. 8, Județ Bacău',
      rep: 'Dragoș Pavăl'
    },
    '5022638': {
      name: 'RCS & RDS SA (DIGI)',
      address: 'Municipiul București, Sector 5, Str. Dr. Staicovici nr. 75, Forum 2000 Building',
      rep: 'Serghei Bulgac'
    },
    '41973874': {
      name: 'SMART BILL SRL',
      address: 'Municipiul Sibiu, Str. Someșului nr. 19, Județ Sibiu',
      rep: 'Radu Hasan'
    },
    '208455895': {
      name: '„Айрис Солюшънс“ АД / IRIS Solutions AD',
      address: 'гр. София, п.к. 1164, р-н Лозенец, бул. „Христо Смирненски“ № 78, ет. 4',
      rep: 'Галя Димитрова Димитрова'
    },
    '206132646': {
      name: '„Айрис Солюшънс“ АД / IRIS Solutions AD',
      address: 'гр. София, п.к. 1164, р-н Лозенец, бул. „Христо Смирненски“ № 78, ет. 4',
      rep: 'Галя Димитрова Димитрова'
    }
  };

  // Detect custom commission one-time link token and partner referral
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const cToken = urlParams.get('c') || urlParams.get('custom');
    const pSlug = urlParams.get('ref') || urlParams.get('affiliate');
    if (pSlug) window.irisCurrentAffiliate = pSlug.toLowerCase().trim();
    if (cToken) {
      window.irisCustomToken = cToken.trim();
      fetch(`/api/custom-link?token=${encodeURIComponent(window.irisCustomToken)}`)
        .then(async r => {
          if (r.ok) {
            const d = await r.json();
            if (d && d.valid && d.commission) {
              window.irisCustomCommission = d.commission;
              applyCustomCommissionUi(d.commission);
            }
          }
        }).catch(() => {});
    }
  } catch (e) {}

  // =========================================================================
  // 2. Real-time Live Field Synchronization
  // =========================================================================
  const liveSyncMap = {
    companyName: {
      input: companyNameInput,
      placeholder: '........................................................................'
    },
    companyEik: {
      input: companyEikInput,
      placeholder: '..................................'
    },
    companyAddress: {
      input: companyAddressInput,
      placeholder: '.....................................................................................................................................................'
    },
    companyRepresentative: {
      input: companyRepresentativeInput,
      placeholder: '...................................................................................................'
    },
    companyRepresentativePin: {
      input: companyRepPinInput,
      placeholder: '..................................'
    },
    bankName: {
      input: bankNameSelect,
      placeholder: '…........................................'
    },
    bankIban: {
      input: bankIbanInput,
      placeholder: '….........................................................................'
    },
    merchantWebsite: {
      input: merchantWebsiteInput,
      placeholder: '........................................................'
    },
    contactAddress: {
      input: contactAddressInput,
      placeholder: '...................................................................................................'
    },
    contactEmail: {
      input: contactEmailInput,
      placeholder: '................................................................................'
    },
    contactPhone: {
      input: contactPhoneInput,
      placeholder: '..........................................................'
    }
  };

  function updateFieldInDoc(fieldName, val, placeholder) {
    const targets = document.querySelectorAll(`.live-field[data-field="${fieldName}"]`);
    let cleanVal = (val || '').trim();

    targets.forEach(el => {
      const oldVal = el.textContent;
      if (cleanVal) {
        if (oldVal !== cleanVal) {
          el.textContent = cleanVal;
          el.classList.remove('text-animating');
          void el.offsetWidth; // DOM reflow for CSS flash animation
          el.classList.add('text-animating');
        }
        el.classList.add('filled');
        el.classList.remove('underlined');
      } else {
        el.textContent = placeholder || '.........................';
        el.classList.remove('filled');
        el.classList.add('underlined');
        el.classList.remove('text-animating');
      }
    });

    if (typeof autoFitPdfMasks === 'function') {
      autoFitPdfMasks();
    }
  }

  function syncWebsites() {
    if (noWebsiteCheckbox && noWebsiteCheckbox.checked) {
      updateFieldInDoc('merchantWebsite', 'Fără website', liveSyncMap.merchantWebsite.placeholder);
      return;
    }
    const sites = [];
    if (merchantWebsiteInput && merchantWebsiteInput.value.trim()) {
      sites.push(merchantWebsiteInput.value.trim());
    }
    if (extraWebsitesCheckbox && extraWebsitesCheckbox.checked) {
      if (extraWebsite1 && extraWebsite1.value.trim()) sites.push(extraWebsite1.value.trim());
      if (extraWebsite2 && extraWebsite2.value.trim()) sites.push(extraWebsite2.value.trim());
    }
    const finalVal = sites.join(', ');
    updateFieldInDoc('merchantWebsite', finalVal, liveSyncMap.merchantWebsite.placeholder);
  }

  function syncAllFields() {
    Object.keys(liveSyncMap).forEach(key => {
      if (key === 'merchantWebsite') return;
      const { input, placeholder } = liveSyncMap[key];
      if (input) {
        const val = (key === 'bankName' && input.value === 'custom')
          ? (customBankInput?.value || '')
          : input.value;
        updateFieldInDoc(key, val, placeholder);
      }
    });

    syncWebsites();

    const dVal = contractDateInput ? contractDateInput.value.trim() : '';
    document.querySelectorAll('.live-field[data-field="date"]').forEach(el => {
      if (dVal) {
        el.textContent = dVal;
        el.classList.add('filled');
        el.classList.remove('underlined');
      } else {
        el.textContent = '.........................';
        el.classList.remove('filled');
        el.classList.add('underlined');
      }
    });

    const repVal = (companyRepresentativeInput?.value || '').trim();
    if (typedSigInput && !typedSigInput.dataset.userEdited && repVal) {
      typedSigInput.value = repVal;
      updateTypedFontSamples(repVal);
    }
  }

  // Bind live input typing events to all fields
  Object.keys(liveSyncMap).forEach(key => {
    if (key === 'merchantWebsite') return;
    const { input, placeholder } = liveSyncMap[key];
    if (input) {
      input.addEventListener('input', () => {
        const val = (key === 'bankName' && input.value === 'custom')
          ? (customBankInput?.value || '')
          : input.value;
        updateFieldInDoc(key, val, placeholder);

        if (key === 'companyRepresentative') {
          const rVal = input.value.trim();
          if (typedSigInput && !typedSigInput.dataset.userEdited) {
            typedSigInput.value = rVal;
            updateTypedFontSamples(rVal);
          }
        }
      });
    }
  });

  // Calendar Picker
  if (btnCalendarTrigger && hiddenNativeDatePicker) {
    btnCalendarTrigger.addEventListener('click', () => {
      if (typeof hiddenNativeDatePicker.showPicker === 'function') {
        hiddenNativeDatePicker.showPicker();
      } else {
        hiddenNativeDatePicker.focus();
        hiddenNativeDatePicker.click();
      }
    });

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

  if (contractDateInput) {
    contractDateInput.addEventListener('input', () => {
      const val = contractDateInput.value.trim();
      document.querySelectorAll('.live-field[data-field="date"]').forEach(el => {
        if (val) {
          el.textContent = val;
          el.classList.add('filled');
          el.classList.remove('underlined');
        } else {
          el.textContent = '.........................';
          el.classList.remove('filled');
          el.classList.add('underlined');
        }
      });
    });
  }

  // Same Address Checkbox
  if (sameAddressCheckbox && companyAddressInput && contactAddressInput) {
    sameAddressCheckbox.addEventListener('change', () => {
      if (sameAddressCheckbox.checked) {
        contactAddressInput.value = companyAddressInput.value;
        contactAddressInput.disabled = true;
        updateFieldInDoc('contactAddress', companyAddressInput.value, liveSyncMap.contactAddress.placeholder);
      } else {
        contactAddressInput.disabled = false;
      }
    });

    companyAddressInput.addEventListener('input', () => {
      if (sameAddressCheckbox.checked) {
        contactAddressInput.value = companyAddressInput.value;
        updateFieldInDoc('contactAddress', companyAddressInput.value, liveSyncMap.contactAddress.placeholder);
      }
    });
  }

  // Bank Selection
  if (bankNameSelect) {
    bankNameSelect.addEventListener('change', () => {
      if (bankNameSelect.value === 'custom') {
        if (customBankInputWrapper) customBankInputWrapper.style.display = 'block';
        if (customBankInput) {
          customBankInput.focus();
          updateFieldInDoc('bankName', customBankInput.value, liveSyncMap.bankName.placeholder);
        }
      } else {
        if (customBankInputWrapper) customBankInputWrapper.style.display = 'none';
        updateFieldInDoc('bankName', bankNameSelect.value, liveSyncMap.bankName.placeholder);
      }
    });
  }

  if (customBankInput) {
    customBankInput.addEventListener('input', () => {
      if (bankNameSelect?.value === 'custom') {
        updateFieldInDoc('bankName', customBankInput.value, liveSyncMap.bankName.placeholder);
      }
    });
  }

  // Websites
  if (merchantWebsiteInput) merchantWebsiteInput.addEventListener('input', syncWebsites);
  if (extraWebsite1) extraWebsite1.addEventListener('input', syncWebsites);
  if (extraWebsite2) extraWebsite2.addEventListener('input', syncWebsites);

  if (noWebsiteCheckbox) {
    noWebsiteCheckbox.addEventListener('change', () => {
      if (noWebsiteCheckbox.checked) {
        if (merchantWebsiteInput) {
          merchantWebsiteInput.value = '';
          merchantWebsiteInput.disabled = true;
        }
        if (extraWebsitesCheckbox) extraWebsitesCheckbox.checked = false;
        if (extraWebsitesWrapper) extraWebsitesWrapper.style.display = 'none';
      } else {
        if (merchantWebsiteInput) merchantWebsiteInput.disabled = false;
      }
      syncWebsites();
    });
  }

  if (extraWebsitesCheckbox && extraWebsitesWrapper) {
    extraWebsitesCheckbox.addEventListener('change', () => {
      extraWebsitesWrapper.style.display = extraWebsitesCheckbox.checked ? 'flex' : 'none';
      syncWebsites();
    });
  }

  // =========================================================================
  // 3. CUI / EIK Company Registry Lookup (ANAF Romania & Registry Agency)
  // =========================================================================
  let eikDebounceTimer = null;

  async function fetchCompanyData(rawCui) {
    const cleanDigits = (rawCui || '').replace(/^RO/i, '').replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 2) return null;

    // 1. Fast Cache check
    if (knownRegistryCompanies[cleanDigits]) {
      return { uic: cleanDigits, ...knownRegistryCompanies[cleanDigits] };
    }

    // 2. Query official API (Romania first)
    try {
      const respRo = await fetch(`/api/company?country=ro&eik=${encodeURIComponent(cleanDigits)}`);
      if (respRo.ok) {
        const d = await respRo.json();
        if (d && d.found && (d.name || d.address || d.rep)) {
          return d;
        }
      }
    } catch (e) {}

    // 3. Fallback: Query Bulgaria if 9 or 13 digits
    if (cleanDigits.length === 9 || cleanDigits.length === 13) {
      try {
        const respBg = await fetch(`/api/company?country=bg&eik=${encodeURIComponent(cleanDigits)}`);
        if (respBg.ok) {
          const d = await respBg.json();
          if (d && d.found && (d.name || d.address || d.rep)) {
            return d;
          }
        }
      } catch (e) {}
    }

    return null;
  }

  async function handleEikLookup(rawVal) {
    const cleanDigits = (rawVal || '').replace(/^RO/i, '').replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 2) return;

    if (eikFeedbackMsg) {
      eikFeedbackMsg.style.display = 'block';
      eikFeedbackMsg.className = 'field-hint-msg';
      eikFeedbackMsg.textContent = '⟳ Se caută datele companiei în registrul oficial...';
    }

    const data = await fetchCompanyData(cleanDigits);

    if (data && (data.name || data.address || data.rep)) {
      if (companyNameInput && data.name) {
        companyNameInput.value = data.name;
        updateFieldInDoc('companyName', data.name, liveSyncMap.companyName.placeholder);
      }
      if (companyAddressInput && data.address) {
        companyAddressInput.value = data.address;
        updateFieldInDoc('companyAddress', data.address, liveSyncMap.companyAddress.placeholder);
        if (sameAddressCheckbox && sameAddressCheckbox.checked && contactAddressInput) {
          contactAddressInput.value = data.address;
          updateFieldInDoc('contactAddress', data.address, liveSyncMap.contactAddress.placeholder);
        }
      }
      if (companyRepresentativeInput && data.rep) {
        companyRepresentativeInput.value = data.rep;
        updateFieldInDoc('companyRepresentative', data.rep, liveSyncMap.companyRepresentative.placeholder);
        if (typedSigInput && !typedSigInput.dataset.userEdited) {
          typedSigInput.value = data.rep;
          updateTypedFontSamples(data.rep);
        }
      }
      if (contactPhoneInput && !contactPhoneInput.value && data.phone) {
        contactPhoneInput.value = data.phone;
        updateFieldInDoc('contactPhone', data.phone, liveSyncMap.contactPhone.placeholder);
      }

      if (eikFeedbackMsg) eikFeedbackMsg.style.display = 'none';

      if (companyVerifyBanner) {
        companyVerifyBanner.style.display = 'flex';
      }

      showToast('Datele companiei au fost identificate cu succes!', 'success');
    } else {
      if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
      if (eikFeedbackMsg) {
        eikFeedbackMsg.style.display = 'block';
        eikFeedbackMsg.className = 'field-hint-msg';
        eikFeedbackMsg.textContent = 'Compania nu a fost găsită automat în registru. Puteți introduce datele manual.';
      }
    }
  }

  if (companyEikInput) {
    companyEikInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      updateFieldInDoc('companyEik', val, liveSyncMap.companyEik.placeholder);

      clearTimeout(eikDebounceTimer);
      const clean = val.replace(/^RO/i, '').replace(/\D/g, '');
      if (clean.length < 5) {
        if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
        if (eikFeedbackMsg) {
          eikFeedbackMsg.style.display = 'block';
          eikFeedbackMsg.className = 'field-hint-msg';
          eikFeedbackMsg.textContent = 'Introduceți CUI pentru completare automată din registrul oficial ANAF';
        }
        return;
      }

      eikDebounceTimer = setTimeout(() => {
        handleEikLookup(val);
      }, 350);
    });

    companyEikInput.addEventListener('blur', () => {
      const val = companyEikInput.value.trim();
      const clean = val.replace(/^RO/i, '').replace(/\D/g, '');
      if (clean.length >= 5) {
        handleEikLookup(val);
      }
    });

    companyEikInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleEikLookup(companyEikInput.value.trim());
      }
    });
  }

  if (btnVerifyDataYes) {
    btnVerifyDataYes.addEventListener('click', () => {
      if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
      if (eikFeedbackMsg) eikFeedbackMsg.style.display = 'none';
      if (companyInputsWrapper) companyInputsWrapper.classList.add('is-verified');
      showToast('Datele companiei au fost confirmate!', 'success');
    });
  }

  if (btnVerifyDataNo) {
    btnVerifyDataNo.addEventListener('click', () => {
      if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
      if (eikFeedbackMsg) eikFeedbackMsg.style.display = 'none';
      if (companyInputsWrapper) companyInputsWrapper.classList.remove('is-verified');
      if (companyNameInput) companyNameInput.focus();
      showToast('Puteți corecta datele direct în câmpurile de mai jos.', 'info');
    });
  }

  // =========================================================================
  // 4. Electronic Signature Engine (Draw / Type / Upload)
  // =========================================================================
  const sigTabs = document.querySelectorAll('.sig-tab-btn');
  const sigContents = document.querySelectorAll('.sig-tab-content');
  let currentSigMode = 'draw';
  let hasDrawn = false;
  let isContractSigned = false;
  let isAppendixSigned = false;

  const canvas = document.getElementById('sigCanvas');
  const canvasHint = document.getElementById('canvasWatermark') || document.querySelector('.canvas-watermark');
  const clearCanvasBtn = document.getElementById('clearCanvasBtn');
  let isDrawing = false;
  let ctx = null;

  const typedSigInput = document.getElementById('typedSigInput');
  const fontCards = document.querySelectorAll('.font-card');
  let selectedFontFamily = 'Homemade Apple';

  const sigFileInput = document.getElementById('sigFileInput');
  const uploadPreviewWrapper = document.getElementById('uploadPreviewWrapper');
  const uploadPreviewImg = document.getElementById('uploadPreviewImg');
  let uploadedImgDataUrl = null;

  const applySignatureBtn = document.getElementById('applySignatureBtn');

  // Tab switching
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

      if (currentSigMode === 'type') {
        const repVal = (companyRepresentativeInput?.value || '').trim();
        if (typedSigInput && !typedSigInput.value.trim() && repVal) {
          typedSigInput.value = repVal;
        }
        updateTypedFontSamples(typedSigInput ? typedSigInput.value : repVal);
      }
    });
  });

  // Canvas Drawing
  if (canvas) {
    ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    canvas.style.touchAction = 'none';

    function getCoords(e) {
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

    function startDraw(e) {
      if (e.cancelable) e.preventDefault();
      isDrawing = true;
      hasDrawn = true;
      if (canvasHint) canvasHint.style.display = 'none';
      const c = getCoords(e);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.arc(c.x, c.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
    }

    function draw(e) {
      if (!isDrawing) return;
      if (e.cancelable) e.preventDefault();
      hasDrawn = true;
      const c = getCoords(e);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }

    function stopDraw() {
      isDrawing = false;
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDraw);
  }

  if (clearCanvasBtn && canvas && ctx) {
    clearCanvasBtn.addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawn = false;
      if (canvasHint) canvasHint.style.display = 'block';
      resetSignatures();
    });
  }

  // Typed Signature
  function updateTypedFontSamples(text) {
    const val = text || (companyRepresentativeInput?.value || '').trim() || 'Ion Popescu';
    document.querySelectorAll('.font-sample').forEach(sample => {
      sample.textContent = val;
    });
  }

  if (typedSigInput) {
    typedSigInput.addEventListener('input', (e) => {
      typedSigInput.dataset.userEdited = 'true';
      updateTypedFontSamples(e.target.value.trim());
    });
  }

  fontCards.forEach(card => {
    card.addEventListener('click', () => {
      fontCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectedFontFamily = card.dataset.font || 'Homemade Apple';
    });
  });

  // Upload Signature
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

  function getSignatureHtml() {
    if (currentSigMode === 'draw') {
      if (!hasDrawn || !canvas) return null;
      const dataUrl = canvas.toDataURL('image/png');
      return `<div class="placed-merchant-sig drawn"><img src="${dataUrl}" alt="Semnătură" style="max-height:48px; max-width:100%; display:block;"></div>`;
    } else if (currentSigMode === 'type') {
      const repVal = (companyRepresentativeInput?.value || '').trim();
      const sigText = (typedSigInput && typedSigInput.value.trim()) || repVal;
      if (!sigText || sigText.length < 2) return null;

      let fontClass = 'style-script';
      if (selectedFontFamily === 'Great Vibes') fontClass = 'style-vibes';
      if (selectedFontFamily === 'Playfair Display') fontClass = 'style-serif';

      return `<div class="placed-merchant-sig typed"><div class="font-sample ${fontClass}" style="font-size:24px; line-height:1.2; color:#000000; font-style:italic;">${escapeHtml(sigText)}</div></div>`;
    } else if (currentSigMode === 'upload' && uploadedImgDataUrl) {
      return `<div class="placed-merchant-sig drawn"><img src="${uploadedImgDataUrl}" alt="Semnătură" style="max-height:48px; max-width:100%; display:block;"></div>`;
    }
    return null;
  }

  function applySignature() {
    let sigHtml = getSignatureHtml();

    if (!sigHtml) {
      if (currentSigMode === 'type') {
        const repVal = (companyRepresentativeInput?.value || '').trim();
        if (repVal) {
          if (typedSigInput) typedSigInput.value = repVal;
          updateTypedFontSamples(repVal);
          sigHtml = getSignatureHtml();
        }
      }
    }

    if (!sigHtml) {
      if (currentSigMode === 'draw') {
        showToast('Vă rugăm să desenați semnătura în casetă cu mouse-ul sau ecranul tactil.', 'error');
      } else if (currentSigMode === 'type') {
        showToast('Vă rugăm să introduceți numele dumneavoastră pentru semnătură.', 'error');
        if (typedSigInput) typedSigInput.focus();
      } else {
        showToast('Vă rugăm să alegeți un fișier cu semnătura dumneavoastră.', 'error');
      }
      return;
    }

    const allSlots = [
      document.getElementById('contractMerchantSigSlot'),
      document.getElementById('contractMerchantSigSlotEn'),
      document.getElementById('contractMerchantTermsSigSlot'),
      document.getElementById('contractMerchantTermsSigSlotEn'),
      document.getElementById('appendixMerchantSigSlot'),
      document.getElementById('appendixMerchantSigSlotEn')
    ];

    allSlots.forEach(slot => {
      if (slot) {
        slot.innerHTML = sigHtml;
        slot.style.border = 'none';
        slot.style.background = 'transparent';
      }
    });

    isContractSigned = true;
    isAppendixSigned = true;

    const badgeContract = document.getElementById('badgeContract');
    const badgeAppendix = document.getElementById('badgeAppendix');
    if (badgeContract) {
      badgeContract.textContent = 'Semnat';
      badgeContract.className = 'status-badge signed';
    }
    if (badgeAppendix) {
      badgeAppendix.textContent = 'Semnat';
      badgeAppendix.className = 'status-badge signed';
    }

    const sBoxC = document.getElementById('statusBoxContract');
    const sBoxA = document.getElementById('statusBoxAppendix');
    if (sBoxC) {
      const ic = sBoxC.querySelector('.status-icon');
      if (ic) { ic.textContent = '✓'; ic.className = 'status-icon signed'; ic.style.color = '#059669'; }
    }
    if (sBoxA) {
      const ic = sBoxA.querySelector('.status-icon');
      if (ic) { ic.textContent = '✓'; ic.className = 'status-icon signed'; ic.style.color = '#059669'; }
    }

    showToast('Contractul și Anexa 1 au fost semnate cu succes!', 'success');
  }

  function resetSignatures() {
    isContractSigned = false;
    isAppendixSigned = false;

    const allSlots = [
      document.getElementById('contractMerchantSigSlot'),
      document.getElementById('contractMerchantSigSlotEn'),
      document.getElementById('contractMerchantTermsSigSlot'),
      document.getElementById('contractMerchantTermsSigSlotEn'),
      document.getElementById('appendixMerchantSigSlot'),
      document.getElementById('appendixMerchantSigSlotEn')
    ];

    allSlots.forEach(slot => {
      if (slot) {
        slot.innerHTML = '';
        slot.style.border = '1px dashed #cbd5e1';
      }
    });

    const badgeContract = document.getElementById('badgeContract');
    const badgeAppendix = document.getElementById('badgeAppendix');
    if (badgeContract) {
      badgeContract.textContent = 'Nesemnat';
      badgeContract.className = 'status-badge';
    }
    if (badgeAppendix) {
      badgeAppendix.textContent = 'Nesemnat';
      badgeAppendix.className = 'status-badge';
    }

    const sBoxC = document.getElementById('statusBoxContract');
    const sBoxA = document.getElementById('statusBoxAppendix');
    if (sBoxC) {
      const ic = sBoxC.querySelector('.status-icon');
      if (ic) { ic.textContent = '●'; ic.className = 'status-icon pending'; ic.style.color = '#F59E0B'; }
    }
    if (sBoxA) {
      const ic = sBoxA.querySelector('.status-icon');
      if (ic) { ic.textContent = '●'; ic.className = 'status-icon pending'; ic.style.color = '#F59E0B'; }
    }
  }

  if (applySignatureBtn) {
    applySignatureBtn.addEventListener('click', applySignature);
  }

  // Document slots click handler (delegated for dynamically rendered PDF overlays)
  const docContainerEl = document.getElementById('mainDocContainer');
  if (docContainerEl) {
    docContainerEl.addEventListener('click', (e) => {
      const slot = e.target.closest('.sig-slot-box');
      if (!slot) return;
      const repVal = (companyRepresentativeInput?.value || '').trim();
      if (hasDrawn || (typedSigInput && typedSigInput.value.trim()) || repVal || uploadedImgDataUrl) {
        applySignature();
      } else {
        const sigCard = document.getElementById('signatureSectionCard');
        if (sigCard) {
          sigCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          sigCard.style.outline = '2px solid #00bff2';
          setTimeout(() => { sigCard.style.outline = 'none'; }, 1800);
          showToast('Vă rugăm să alegeți modul de semnare (Desenare sau Text).', 'info');
        }
      }
    });
  }

  // =========================================================================
  // 5. Toast & Helpers
  // =========================================================
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  function showToast(msg, type = 'success') {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = (type === 'error') ? '#DC2626' : (type === 'info' ? '#0369A1' : '#1F3864');
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3400);
  }

  // Zoom controls
  let currentZoom = 100;
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomLevelDisplay = document.getElementById('zoomLevelDisplay');
  const mainDocContainer = document.getElementById('mainDocContainer');

  if (zoomInBtn && zoomOutBtn && zoomLevelDisplay && mainDocContainer) {
    zoomInBtn.addEventListener('click', () => {
      if (currentZoom < 140) {
        currentZoom += 10;
        zoomLevelDisplay.textContent = `${currentZoom}%`;
        mainDocContainer.style.transform = `scale(${currentZoom / 100})`;
        mainDocContainer.style.transformOrigin = 'top center';
      }
    });

    zoomOutBtn.addEventListener('click', () => {
      if (currentZoom > 70) {
        currentZoom -= 10;
        zoomLevelDisplay.textContent = `${currentZoom}%`;
        mainDocContainer.style.transform = `scale(${currentZoom / 100})`;
        mainDocContainer.style.transformOrigin = 'top center';
      }
    });
  }

  // =========================================================================
  // 6. Form Submission
  // =========================================================================
  if (submitContractBtn) {
    submitContractBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const compName = (companyNameInput?.value || '').trim();
      const compEik = (companyEikInput?.value || '').trim();
      const compAddress = (companyAddressInput?.value || '').trim();
      const compRep = (companyRepresentativeInput?.value || '').trim();
      const compRepPin = (companyRepPinInput?.value || '').trim();
      const bankVal = bankNameSelect ? bankNameSelect.value.trim() : '';
      const bankNameText = (bankVal === 'custom') ? ((customBankInput?.value || '').trim()) : bankVal;
      const bankIbanVal = (bankIbanInput?.value || '').trim();
      const contactAddrVal = (contactAddressInput?.value || compAddress || '').trim();
      const emailVal = (contactEmailInput?.value || '').trim();
      const phoneVal = (contactPhoneInput?.value || '').trim();
      const cDate = (contractDateInput?.value || '').trim() || todayDmy;

      if (!compEik || !compName || !compAddress || !compRep || !bankNameText || !bankIbanVal || !contactAddrVal || !emailVal || !phoneVal) {
        showToast('Vă rugăm să completați toate câmpurile obligatorii (*).', 'error');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailVal)) {
        showToast('Vă rugăm să introduceți o adresă de e-mail validă.', 'error');
        if (contactEmailError) contactEmailError.style.display = 'block';
        if (contactEmailInput) contactEmailInput.focus();
        return;
      }
      if (contactEmailError) contactEmailError.style.display = 'none';

      if (!isContractSigned || !isAppendixSigned) {
        applySignature();
        if (!isContractSigned) {
          showToast('Vă rugăm să aplicați semnătura pe Contract și Anexa 1.', 'error');
          const sigCard = document.getElementById('signatureSectionCard');
          if (sigCard) sigCard.scrollIntoView({ behavior: 'smooth' });
          return;
        }
      }

      const agreeTerms = document.getElementById('agreeTermsCheckbox');
      const confirmData = document.getElementById('confirmDataCheckbox');

      if (!agreeTerms || !agreeTerms.checked) {
        showToast('Este necesar să fiți de acord cu Termenii și Condițiile Generale IRIS Pay.', 'error');
        if (agreeTerms) agreeTerms.focus();
        return;
      }
      if (!confirmData || !confirmData.checked) {
        showToast('Vă rugăm să confirmați exactitatea datelor și dreptul de reprezentare.', 'error');
        if (confirmData) confirmData.focus();
        return;
      }

      let websiteVal = '';
      if (!noWebsiteCheckbox || !noWebsiteCheckbox.checked) {
        const sites = [];
        if (merchantWebsiteInput && merchantWebsiteInput.value.trim()) sites.push(merchantWebsiteInput.value.trim());
        if (extraWebsitesCheckbox && extraWebsitesCheckbox.checked) {
          if (extraWebsite1 && extraWebsite1.value.trim()) sites.push(extraWebsite1.value.trim());
          if (extraWebsite2 && extraWebsite2.value.trim()) sites.push(extraWebsite2.value.trim());
        }
        websiteVal = sites.join(', ');
      }

      // Capture merchant signature image as pure black PNG Base64
      let sigBase64 = null;
      try {
        if (currentSigMode === 'draw' && hasDrawn && canvas) {
          sigBase64 = canvas.toDataURL('image/png');
        } else if (currentSigMode === 'upload' && uploadedImgDataUrl) {
          sigBase64 = uploadedImgDataUrl;
        } else {
          // Render typed signature using the exact selected font in black, without any underline
          const sigText = (typedSigInput && typedSigInput.value.trim()) || compRep || 'Reprezentant';
          const off = document.createElement('canvas');
          const octx = off.getContext('2d');
          let canvasFont = '34px "Homemade Apple", cursive';
          if (selectedFontFamily === 'Great Vibes') {
            canvasFont = '44px "Great Vibes", cursive';
          } else if (selectedFontFamily === 'Playfair Display') {
            canvasFont = 'italic 600 32px "Playfair Display", serif';
          }
          octx.font = canvasFont;
          const textW = Math.ceil(octx.measureText(sigText).width);
          off.width = Math.max(320, textW + 24);
          off.height = 90;
          octx.clearRect(0, 0, off.width, off.height);
          octx.font = canvasFont;
          octx.fillStyle = '#000000';
          octx.textBaseline = 'middle';
          octx.fillText(sigText, 12, 46);
          sigBase64 = off.toDataURL('image/png');
        }
      } catch (sigErr) {
        console.warn('[RO Signature capture error]:', sigErr);
      }

      const payload = {
        country: 'ro',
        targetEmail: 'sales@irisbgsf.com',
        companyName: compName,
        companyEik: compEik,
        companyAddress: compAddress,
        companyRepresentative: compRep,
        companyRepresentativePin: compRepPin,
        bankName: bankNameText,
        bankIban: bankIbanVal,
        website: websiteVal,
        contactAddress: contactAddrVal,
        contactEmail: emailVal,
        contactPhone: phoneVal,
        contractDate: cDate,
        signatureImageBase64: sigBase64,
        affiliateRef: window.irisCurrentAffiliate || null,
        customToken: window.irisCustomToken || null
      };

      if (loadingOverlay) loadingOverlay.style.display = 'flex';
      submitContractBtn.disabled = true;
      submitContractBtn.textContent = 'Se trimite...';

      try {
        const response = await fetch('/api/send-contract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const resData = await response.json();
        await new Promise(res => setTimeout(res, 400));

        if (response.ok && resData.success) {
          if (loadingOverlay) loadingOverlay.style.display = 'none';

          const successModalOverlay = document.getElementById('successModalOverlay');
          const modalCloseBtn = document.getElementById('modalCloseBtn');
          if (successModalOverlay) {
            successModalOverlay.style.display = 'flex';
          }

          showToast('Contractul și Anexa 1 au fost trimise cu succes!', 'success');

          const autoReloadTimer = setTimeout(() => {
            window.location.reload();
          }, 5000);

          if (modalCloseBtn) {
            modalCloseBtn.onclick = () => {
              clearTimeout(autoReloadTimer);
              window.location.reload();
            };
          }

          if (successModalOverlay) {
            successModalOverlay.onclick = (e) => {
              if (e.target === successModalOverlay) {
                clearTimeout(autoReloadTimer);
                window.location.reload();
              }
            };
          }
        } else {
          showToast(resData.error || 'A apărut o eroare la trimiterea contractului.', 'error');
        }
      } catch (err) {
        showToast('Eroare de conexiune la trimiterea contractului.', 'error');
      } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        submitContractBtn.disabled = false;
        submitContractBtn.innerHTML = '<span>Trimite</span>';
      }
    });
  }

  // =========================================================================
  // 7. Exact PDF.js Document Renderer & Interactive Coordinate Overlays
  // =========================================================================
  function applyCustomCommissionUi(commissionVal) {
    if (!commissionVal || !String(commissionVal).trim()) return;
    const cleanComm = String(commissionVal).trim();
    const cd = document.getElementById('appCommissionDisplay');
    const cde = document.getElementById('appCommissionDisplayEn');
    const wrapRo = document.getElementById('annexFeeOverrideRo');
    const wrapEn = document.getElementById('annexFeeOverrideEn');
    if (cd) cd.textContent = cleanComm;
    if (cde) cde.textContent = cleanComm;
    if (wrapRo) wrapRo.style.display = 'block';
    if (wrapEn) wrapEn.style.display = 'block';
  }

  function autoFitPdfMasks() {
    document.querySelectorAll('.pdf-mask[data-autofit="true"]').forEach(mask => {
      const baseSz = parseFloat(mask.dataset.baseSize || '10.0');
      const baseLh = parseFloat(mask.dataset.baseLh || '12.6');
      let sz = baseSz;
      let lh = baseLh;
      mask.style.fontSize = `calc(${sz} * var(--pt))`;
      mask.style.lineHeight = `calc(${lh} * var(--pt))`;
      while (mask.scrollHeight > mask.clientHeight + 1 && sz > 6.6) {
        sz = Number((sz - 0.35).toFixed(2));
        lh = Number((sz * 1.24).toFixed(2));
        mask.style.fontSize = `calc(${sz} * var(--pt))`;
        mask.style.lineHeight = `calc(${lh} * var(--pt))`;
      }
    });
  }

  function pctBox(x0, y0, w, h, W, H) {
    return `left:${((x0 / W) * 100).toFixed(4)}%; top:${((y0 / H) * 100).toFixed(4)}%; width:${((w / W) * 100).toFixed(4)}%; height:${((h / H) * 100).toFixed(4)}%;`;
  }

  function buildPdfOverlayHtml(docType, pageNum, W, H) {
    if (docType === 'contract' && pageNum === 3) {
      return `
        <div class="pdf-mask" style="${pctBox(75.5, 42.5, 220.0, 15.0, W, H)} font-size:calc(10.98 * var(--pt)); line-height:calc(13.5 * var(--pt));">
          Today <span class="live-field underlined" data-field="date">.........................</span>, in Bucharest, between:
        </div>
        <div class="pdf-mask" style="${pctBox(302.0, 42.5, 234.5, 15.0, W, H)} font-size:calc(10.98 * var(--pt)); line-height:calc(13.5 * var(--pt));">
          Astăzi <span class="live-field underlined" data-field="date">.........................</span>, în București, între:
        </div>
        <div class="pdf-mask" data-autofit="true" data-base-size="10.5" data-base-lh="13.8" style="${pctBox(75.5, 234.5, 220.0, 160.0, W, H)} font-size:calc(10.5 * var(--pt)); line-height:calc(13.8 * var(--pt));">
          <div style="padding-left:calc(15.5 * var(--pt)); text-align:justify;">
            2. &nbsp;<span class="live-field underlined" data-field="companyName">................................</span>, registered in the CRRNPLE at the Registry Agency, with UIC <span class="live-field underlined" data-field="companyEik">................</span>, with headquarters and address of management: <span class="live-field underlined" data-field="companyAddress">................................................</span>, represented by <span class="live-field underlined" data-field="companyRepresentative">................................</span>, with PIN <span class="live-field underlined" data-field="companyRepresentativePin">................</span>, telephone: <span class="live-field underlined" data-field="contactPhone">........................</span>, hereby referred to as “Merchant”, on the other hand
          </div>
          <div style="margin-top:calc(12 * var(--pt)); font-size:calc(10.98 * var(--pt));">Together referred to as Parties,</div>
        </div>
        <div class="pdf-mask" data-autofit="true" data-base-size="10.5" data-base-lh="13.8" style="${pctBox(302.0, 232.0, 234.5, 162.0, W, H)} font-size:calc(10.5 * var(--pt)); line-height:calc(13.8 * var(--pt));">
          <div style="padding-left:calc(15.5 * var(--pt)); text-align:justify;">
            2. &nbsp;<span class="live-field underlined" data-field="companyName">................................</span>, înregistrat în CRRNPLE la Agenția Registrului, având CUI <span class="live-field underlined" data-field="companyEik">................</span>, cu sediul social și adresa de conducere: <span class="live-field underlined" data-field="companyAddress">................................................</span>, reprezentată de <span class="live-field underlined" data-field="companyRepresentative">................................</span>, cu CNP <span class="live-field underlined" data-field="companyRepresentativePin">................</span>, telefon: <span class="live-field underlined" data-field="contactPhone">........................</span>, denumită în continuare “Comerciantul”, pe de o parte
          </div>
          <div style="margin-top:calc(12 * var(--pt)); font-size:calc(10.98 * var(--pt));">Denumite împreună Părțile, Întrucât:</div>
        </div>
      `;
    }

    if (docType === 'contract' && pageNum === 6) {
      return `
        <div class="pdf-mask" data-autofit="true" data-base-size="10.3" data-base-lh="14.5" style="${pctBox(111.5, 289.5, 184.0, 42.0, W, H)} font-size:calc(10.3 * var(--pt)); line-height:calc(14.5 * var(--pt));">
          <div>Bank/Payment institution: <span class="live-field underlined" data-field="bankName">….........................</span></div>
          <div><strong>IBAN:</strong> <span class="live-field underlined" data-field="bankIban">…........................................</span></div>
        </div>
        <div class="pdf-mask" data-autofit="true" data-base-size="10.3" data-base-lh="14.5" style="${pctBox(338.0, 260.5, 198.5, 48.0, W, H)} font-size:calc(10.3 * var(--pt)); line-height:calc(14.5 * var(--pt));">
          <div>Bancă/Instituție de plată: <span class="live-field underlined" data-field="bankName">….........................</span></div>
          <div><strong>IBAN:</strong> <span class="live-field underlined" data-field="bankIban">…........................................</span></div>
        </div>
        <div class="pdf-mask" data-autofit="true" data-base-size="10.3" data-base-lh="14.2" style="${pctBox(75.5, 421.5, 220.0, 100.0, W, H)} font-size:calc(10.3 * var(--pt)); line-height:calc(14.2 * var(--pt));">
          <div>Name: <span class="live-field underlined" data-field="companyRepresentative">.........................</span></div>
          <div>Email: <span class="live-field underlined" data-field="contactEmail">.........................</span></div>
          <div>CNP: <span class="live-field underlined" data-field="companyRepresentativePin">.........................</span></div>
          <div>Phone Number: <span class="live-field underlined" data-field="contactPhone">.........................</span></div>
          <div>Authorized location: <span class="live-field underlined" data-field="merchantWebsite">.........................</span></div>
        </div>
        <div class="pdf-mask" data-autofit="true" data-base-size="10.3" data-base-lh="14.2" style="${pctBox(302.0, 407.0, 234.5, 100.0, W, H)} font-size:calc(10.3 * var(--pt)); line-height:calc(14.2 * var(--pt));">
          <div>Nume: <span class="live-field underlined" data-field="companyRepresentative">.........................</span></div>
          <div>Email: <span class="live-field underlined" data-field="contactEmail">.........................</span></div>
          <div>PIN: <span class="live-field underlined" data-field="companyRepresentativePin">.........................</span></div>
          <div>Număr de telefon: <span class="live-field underlined" data-field="contactPhone">.........................</span></div>
          <div>Locația autorizată: <span class="live-field underlined" data-field="merchantWebsite">.........................</span></div>
        </div>
      `;
    }

    if (docType === 'contract' && pageNum === 11) {
      return `
        <div class="pdf-mask" data-autofit="true" data-base-size="10.3" data-base-lh="14.0" style="${pctBox(75.5, 172.5, 220.0, 72.0, W, H)} font-size:calc(10.3 * var(--pt)); line-height:calc(14.0 * var(--pt));">
          <div><strong>For the Merchant:</strong></div>
          <div>Address: <span class="live-field underlined" data-field="contactAddress">........................................</span></div>
          <div>E-mail: <span class="live-field underlined" data-field="contactEmail">........................................</span></div>
          <div>Telephone: <span class="live-field underlined" data-field="contactPhone">........................................</span></div>
        </div>
        <div class="pdf-mask" data-autofit="true" data-base-size="10.3" data-base-lh="14.0" style="${pctBox(302.0, 172.5, 234.5, 72.0, W, H)} font-size:calc(10.3 * var(--pt)); line-height:calc(14.0 * var(--pt));">
          <div><strong>Pentru Comerciant:</strong></div>
          <div>Adresa: <span class="live-field underlined" data-field="contactAddress">........................................</span></div>
          <div>E-mail: <span class="live-field underlined" data-field="contactEmail">........................................</span></div>
          <div>Telefon: <span class="live-field underlined" data-field="contactPhone">........................................</span></div>
        </div>
      `;
    }

    if (docType === 'contract' && pageNum === 14) {
      return `
        <div class="sig-slot-box" id="contractMerchantSigSlotEn" title="Faceți clic pentru a semna contractul" style="${pctBox(76.5, 566.0, 185.0, 27.0, W, H)}"></div>
        <div class="sig-slot-box contract-merchant-sig-slot" id="contractMerchantSigSlot" title="Faceți clic pentru a semna contractul" style="${pctBox(303.08, 551.0, 195.0, 28.0, W, H)}"></div>
        <div class="sig-slot-box" id="contractMerchantTermsSigSlotEn" title="Faceți clic pentru a semna contractul" style="${pctBox(76.5, 696.0, 185.0, 26.0, W, H)}"></div>
        <div class="sig-slot-box contract-merchant-terms-sig-slot" id="contractMerchantTermsSigSlot" title="Faceți clic pentru a semna contractul" style="${pctBox(303.08, 682.0, 195.0, 36.0, W, H)}"></div>
      `;
    }

    if (docType === 'appendix' && pageNum === 1) {
      return `
        <div class="pdf-mask calibri-font" id="annexFeeOverrideEn" style="display:block; ${pctBox(93.5, 431.0, 470.0, 33.0, W, H)}">
          <strong>Payment initiation fee – <span id="appCommissionDisplayEn">0.49%</span> of the transaction value.</strong> The fee is due by the 10th of the month following the month of implementation.
        </div>
        <div class="sig-slot-box" id="appendixMerchantSigSlotEn" title="Faceți clic pentru a semna contractul" style="${pctBox(382.5, 615.0, 175.0, 42.0, W, H)}"></div>
      `;
    }

    if (docType === 'appendix' && pageNum === 2) {
      return `
        <div class="pdf-mask calibri-font" id="annexFeeOverrideRo" style="display:block; ${pctBox(93.5, 421.0, 445.0, 33.0, W, H)}">
          <strong>Taxă de inițiere a plății – <span id="appCommissionDisplay">0.49%</span> din valoarea tranzacției.</strong> Taxa se plătește până la data de 10 a lunii următoare lunii implementării.
        </div>
        <div class="sig-slot-box appendix-merchant-sig-slot" id="appendixMerchantSigSlot" title="Faceți clic pentru a semna contractul" style="${pctBox(382.5, 605.0, 175.0, 42.0, W, H)}"></div>
      `;
    }

    return '';
  }

  async function initPdfDocumentPreview() {
    const container = document.getElementById('mainDocContainer');
    if (!container) return;

    try {
      const pdfjsLib = await import('/assets/pdfjs/pdf.min.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.mjs';

      const [contractPdf, appendixPdf] = await Promise.all([
        pdfjsLib.getDocument('/assets/contract_ro_template.pdf?v=20261112').promise,
        pdfjsLib.getDocument('/assets/appendix_ro_template.pdf?v=20261112').promise
      ]);

      container.innerHTML = '';

      const pageQueue = [];
      for (let i = 1; i <= contractPdf.numPages; i++) {
        pageQueue.push({ pdf: contractPdf, docType: 'contract', pageNum: i, total: contractPdf.numPages });
      }
      for (let i = 1; i <= appendixPdf.numPages; i++) {
        pageQueue.push({ pdf: appendixPdf, docType: 'appendix', pageNum: i, total: appendixPdf.numPages });
      }

      const ptTrackedSheets = [];
      const renderScale = Math.min(Math.max(window.devicePixelRatio || 1.5, 1.5), 2.2) * 1.35;

      for (const item of pageQueue) {
        const page = await item.pdf.getPage(item.pageNum);
        const baseVp = page.getViewport({ scale: 1 });
        const W = baseVp.width;
        const H = baseVp.height;

        const card = document.createElement('div');
        card.className = 'doc-page-card';
        card.id = item.docType === 'contract' ? `pageCard${item.pageNum}` : `pageCard${14 + item.pageNum}`;

        const topTab = document.createElement('div');
        topTab.className = 'page-top-tab';
        const label = item.docType === 'contract'
          ? `PAGINA ${item.pageNum} DIN ${item.total} • CONTRACT`
          : `ANEXA 1 • PAGINA ${item.pageNum} DIN ${item.total} (${item.pageNum === 1 ? 'EN' : 'RO'})`;
        topTab.innerHTML = `<span class="page-tab-badge">${label}</span>`;

        const sheet = document.createElement('div');
        sheet.className = 'a4-sheet pdf-sheet';
        sheet.style.aspectRatio = `${W} / ${H}`;
        sheet.dataset.pageWidthPt = String(W);

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-page-canvas';
        const hiVp = page.getViewport({ scale: renderScale });
        canvas.width = Math.floor(hiVp.width);
        canvas.height = Math.floor(hiVp.height);
        sheet.appendChild(canvas);

        const overlayHtml = buildPdfOverlayHtml(item.docType, item.pageNum, W, H);
        if (overlayHtml) {
          const overlay = document.createElement('div');
          overlay.className = 'pdf-overlay-layer';
          overlay.innerHTML = overlayHtml;
          sheet.appendChild(overlay);
          ptTrackedSheets.push(sheet);
        }

        card.appendChild(topTab);
        card.appendChild(sheet);
        container.appendChild(card);

        const renderCtx = canvas.getContext('2d', { alpha: false });
        await page.render({ canvasContext: renderCtx, viewport: hiVp }).promise;
      }

      const updatePtVars = () => {
        ptTrackedSheets.forEach(sheet => {
          const wPt = parseFloat(sheet.dataset.pageWidthPt || '595.38');
          const overlay = sheet.querySelector('.pdf-overlay-layer');
          if (overlay && sheet.clientWidth > 0) {
            overlay.style.setProperty('--pt', `${sheet.clientWidth / wPt}px`);
          }
        });
        autoFitPdfMasks();
      };

      updatePtVars();
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(updatePtVars);
        ro.observe(container);
      }
      window.addEventListener('resize', updatePtVars);

      // Sync all form fields & custom commission into newly created overlays
      syncAllFields();
      if (window.irisCustomCommission) {
        applyCustomCommissionUi(window.irisCustomCommission);
      }
      if (isContractSigned || isAppendixSigned) {
        applySignature();
      }
    } catch (err) {
      console.error('[RO PDF Preview Error]:', err);
      container.innerHTML = `<div class="pdf-loading-state" style="color:#dc2626;">Eroare la încărcarea documentelor PDF: ${escapeHtml(err.message)}</div>`;
    }
  }

  // Initial Sync & Render
  syncAllFields();
  initPdfDocumentPreview();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRoPortal);
} else {
  initRoPortal();
}
