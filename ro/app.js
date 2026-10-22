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
              const cd = document.getElementById('appCommissionDisplay');
              const cde = document.getElementById('appCommissionDisplayEn');
              if (cd) cd.textContent = d.commission;
              if (cde) cde.textContent = d.commission;
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

  // Document slots click handler
  document.querySelectorAll('.sig-slot-box').forEach(slot => {
    slot.style.cursor = 'pointer';
    slot.title = 'Faceți clic pentru a semna contractul';
    slot.addEventListener('click', () => {
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
  });

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
          // Render typed signature in black
          const sigText = (typedSigInput && typedSigInput.value.trim()) || compRep || 'Reprezentant';
          const off = document.createElement('canvas');
          off.width = 320;
          off.height = 80;
          const octx = off.getContext('2d');
          octx.clearRect(0, 0, 320, 80);
          octx.font = 'italic 28px "Segoe Script", "Homemade Apple", "Brush Script MT", cursive, sans-serif';
          octx.fillStyle = '#000000';
          octx.fillText(sigText, 10, 48);
          octx.beginPath();
          octx.moveTo(10, 56);
          octx.quadraticCurveTo(110, 70, 260, 54);
          octx.lineWidth = 1.8;
          octx.strokeStyle = '#000000';
          octx.stroke();
          sigBase64 = off.toDataURL('image/png');
        }
      } catch (sigErr) {
        console.warn('[RO Signature capture error]:', sigErr);
      }

      const payload = {
        country: 'ro',
        targetEmail: 'kaloyan.tosev@gmail.com',
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

        if (response.ok && resData.success) {
          showToast('Contractul a fost semnat și trimis cu succes!', 'success');
          alert('Felicitări! Contractul IRIS Pay a fost semnat electronic cu succes. O copie a fost transmisă către echipa IRIS Pay.');
          window.location.reload();
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

  // Initial Sync
  syncAllFields();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRoPortal);
} else {
  initRoPortal();
}
