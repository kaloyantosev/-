/**
 * IRIS Pay România | Semnare electronică contract
 * Script complet pentru sincronizare date în timp real, căutare ANAF, navigare automată, semnătură electronică și trimitere API (country: 'ro')
 */

(function () {
  'use strict';

  // Global references accessible by inline handlers
  let currentSigMode = 'draw';
  let hasDrawn = false;
  let isContractSigned = false;
  let isAppendixSigned = false;
  let activeTypedFont = 'Homemade Apple';
  let uploadedSigBase64 = null;
  let lastGeneratedSigBase64 = null;

  // Global helper functions
  window.switchSigTab = function (mode) {
    currentSigMode = mode;
    document.querySelectorAll('.sig-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    document.querySelectorAll('.sig-tab-content').forEach(content => {
      content.classList.remove('active');
    });

    const targetContent = document.getElementById(
      mode === 'draw' ? 'sigContentDraw' :
      mode === 'type' ? 'sigContentType' : 'sigContentUpload'
    );
    if (targetContent) targetContent.classList.add('active');

    scrollToDocSection('pageCard14');

    if (mode === 'type') {
      const repVal = (document.getElementById('companyRepresentative')?.value || '').trim();
      const typedInp = document.getElementById('typedSigInput');
      if (typedInp && !typedInp.value.trim() && repVal) {
        typedInp.value = repVal;
      }
      updateTypedFontSamples();
      if (typedInp && typedInp.value.trim().length >= 2) {
        applyTypedSignatureLive();
      }
    }
  };

  window.selectFontCard = function (el, fontName) {
    document.querySelectorAll('.font-card').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    activeTypedFont = fontName || el?.dataset?.font || 'Homemade Apple';
    if (currentSigMode === 'type') {
      applyTypedSignatureLive();
    }
  };

  function updateTypedFontSamples() {
    const typedInp = document.getElementById('typedSigInput');
    const repVal = (document.getElementById('companyRepresentative')?.value || '').trim();
    const text = (typedInp?.value || '').trim() || repVal || 'Ion Popescu';
    const s1 = document.getElementById('sample1');
    const s2 = document.getElementById('sample2');
    const s3 = document.getElementById('sample3');
    if (s1) s1.textContent = text;
    if (s2) s2.textContent = text;
    if (s3) s3.textContent = text;
  }

  function getSignatureImageBase64() {
    const canvas = document.getElementById('sigCanvas');
    if (currentSigMode === 'draw') {
      if (!hasDrawn || !canvas) return null;
      lastGeneratedSigBase64 = canvas.toDataURL('image/png');
      return lastGeneratedSigBase64;
    } else if (currentSigMode === 'type') {
      const typedInp = document.getElementById('typedSigInput');
      const repVal = (document.getElementById('companyRepresentative')?.value || '').trim();
      const text = (typedInp?.value || '').trim() || repVal || 'Ion Popescu';
      const off = document.createElement('canvas');
      off.width = 400;
      off.height = 100;
      const octx = off.getContext('2d');
      octx.clearRect(0, 0, 400, 100);
      octx.font = `italic 30px "${activeTypedFont}", cursive, sans-serif`;
      octx.fillStyle = '#1F3864';
      octx.textBaseline = 'middle';
      octx.fillText(text, 15, 45);
      octx.beginPath();
      octx.moveTo(15, 68);
      octx.quadraticCurveTo(140, 82, 320, 65);
      octx.lineWidth = 2;
      octx.strokeStyle = 'rgba(31, 56, 100, 0.7)';
      octx.stroke();
      lastGeneratedSigBase64 = off.toDataURL('image/png');
      return lastGeneratedSigBase64;
    } else if (currentSigMode === 'upload') {
      return uploadedSigBase64;
    }
    return lastGeneratedSigBase64;
  }

  function applySignatureToSlots(sigData, isType, textVal, fontName) {
    let contentHtml = '';
    if (isType) {
      let fontClass = 'style-script';
      if (fontName === 'Great Vibes') fontClass = 'style-vibes';
      if (fontName === 'Playfair Display') fontClass = 'style-serif';

      contentHtml = `
        <div class="placed-merchant-sig typed" style="padding:2px 4px; display:inline-block;">
          <div class="font-sample ${fontClass}" style="font-size:24px; line-height:1.2; color:#1E3A8A; font-style:italic;">
            ${escapeHtml(textVal)}
          </div>
        </div>
      `;
    } else {
      contentHtml = `<img src="${sigData}" alt="Semnătură Comerciant" style="max-width:100%; max-height:100%; object-fit:contain; display:block;">`;
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
        slot.innerHTML = contentHtml;
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

    const statusBoxContract = document.getElementById('statusBoxContract');
    const statusBoxAppendix = document.getElementById('statusBoxAppendix');
    if (statusBoxContract) {
      const icon = statusBoxContract.querySelector('.status-icon');
      if (icon) {
        icon.textContent = '✓';
        icon.className = 'status-icon signed';
        icon.style.color = '#059669';
      }
    }
    if (statusBoxAppendix) {
      const icon = statusBoxAppendix.querySelector('.status-icon');
      if (icon) {
        icon.textContent = '✓';
        icon.className = 'status-icon signed';
        icon.style.color = '#059669';
      }
    }
  }

  function applyTypedSignatureLive() {
    const typedInp = document.getElementById('typedSigInput');
    const repVal = (document.getElementById('companyRepresentative')?.value || '').trim();
    const text = (typedInp?.value || '').trim() || repVal;
    if (text.length >= 2) {
      const sigData = getSignatureImageBase64();
      applySignatureToSlots(sigData, true, text, activeTypedFont);
    }
  }

  window.applySignatureNow = function () {
    const typedInp = document.getElementById('typedSigInput');
    const repVal = (document.getElementById('companyRepresentative')?.value || '').trim();

    if (currentSigMode === 'type') {
      const text = (typedInp?.value || '').trim() || repVal;
      if (!text) {
        showToast('Vă rugăm să introduceți numele dumneavoastră pentru semnătură în câmpul de text.', 'error');
        if (typedInp) {
          typedInp.focus();
          typedInp.classList.add('shake-error');
          setTimeout(() => typedInp.classList.remove('shake-error'), 600);
        }
        return;
      }
      const sigData = getSignatureImageBase64();
      applySignatureToSlots(sigData, true, text, activeTypedFont);
    } else {
      const sigData = getSignatureImageBase64();
      if (!sigData) {
        showToast('Vă rugăm să desenați sau să încărcați o semnătură mai întâi.', 'error');
        return;
      }
      applySignatureToSlots(sigData, false, '', '');
    }

    let feedback = document.getElementById('sigAppliedNotice');
    const applyBtn = document.getElementById('applySignatureBtn');
    if (!feedback && applyBtn) {
      feedback = document.createElement('div');
      feedback.id = 'sigAppliedNotice';
      feedback.style.marginTop = '12px';
      feedback.style.padding = '10px 14px';
      feedback.style.background = '#ECFDF5';
      feedback.style.border = '1px solid #A7F3D0';
      feedback.style.borderRadius = '6px';
      feedback.style.fontSize = '13px';
      feedback.style.color = '#065F46';
      feedback.style.textAlign = 'center';
      applyBtn.parentNode.appendChild(feedback);
    }
    if (feedback) {
      feedback.style.display = 'block';
      feedback.innerHTML = `<strong>✓ Semnătura a fost aplicată pe Contract și Anexa 1!</strong><div style="font-size: 11px; color: #047857; margin-top: 3px;">Puteți vedea semnătura în paginile 14 și 16 ale documentului.</div>`;
    }

    scrollToDocSection('pageCard14');
    showToast('Semnătura a fost aplicată cu succes!');
  };

  // Smooth scroll helper to keep document viewport focused on current section
  function scrollToDocSection(pageCardId) {
    const docViewport = document.getElementById('docViewport');
    const targetCard = document.getElementById(pageCardId);
    if (!docViewport || !targetCard) return;

    const viewportRect = docViewport.getBoundingClientRect();
    const cardRect = targetCard.getBoundingClientRect();
    const targetScrollTop = docViewport.scrollTop + (cardRect.top - viewportRect.top) - 15;

    docViewport.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    });
  }

  // Live Field Updating with Smooth Re-animation on Keystrokes
  function updateLiveField(fieldName, value) {
    const targets = document.querySelectorAll(`.live-field[data-field="${fieldName}"]`);
    const cleanVal = (value || '').trim();

    targets.forEach(el => {
      const oldVal = el.textContent;
      if (cleanVal) {
        if (oldVal !== cleanVal) {
          el.textContent = cleanVal;
          el.classList.remove('text-animating');
          // Trigger DOM reflow to immediately play highlight animation
          void el.offsetWidth;
          el.classList.add('text-animating');
        }
        el.classList.add('filled');
        el.classList.remove('underlined');
      } else {
        el.textContent = '.........................';
        el.classList.remove('filled');
        el.classList.remove('underlined');
        el.classList.remove('text-animating');
      }
    });
  }

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

  // =========================================================================
  // ROMANIAN COMPANY LOOKUP (Official free ANAF REST API & Backend)
  // =========================================================================
  let cuiDebounceTimer = null;

  async function lookupRomanianCompany(cuiVal) {
    const eikFeedbackMsg = document.getElementById('eikFeedbackMsg');
    const companyVerifyBanner = document.getElementById('companyVerifyBanner');
    const companyInputsWrapper = document.getElementById('companyInputsWrapper');
    const companyNameInput = document.getElementById('companyName');
    const companyAddressInput = document.getElementById('companyAddress');
    const contactAddressInput = document.getElementById('contactAddress');
    const sameAddressCheckbox = document.getElementById('sameAddressCheckbox');
    const contactPhoneInput = document.getElementById('contactPhone');
    const companyRepInput = document.getElementById('companyRepresentative');
    const typedSigInput = document.getElementById('typedSigInput');

    const cleanDigits = cuiVal.replace(/^RO/i, '').replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 2) return;

    scrollToDocSection('pageCard3');

    if (eikFeedbackMsg) {
      eikFeedbackMsg.style.display = 'block';
      eikFeedbackMsg.className = 'field-hint-msg';
      eikFeedbackMsg.textContent = 'Se caută datele companiei în registrul oficial ANAF...';
    }

    try {
      const resp = await fetch(`/api/company?country=ro&eik=${encodeURIComponent(cleanDigits)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.found && data.name) {
          if (companyNameInput) {
            companyNameInput.value = data.name;
            updateLiveField('companyName', data.name);
          }
          if (companyAddressInput && data.address) {
            companyAddressInput.value = data.address;
            updateLiveField('companyAddress', data.address);
            if (sameAddressCheckbox && sameAddressCheckbox.checked && contactAddressInput) {
              contactAddressInput.value = data.address;
              updateLiveField('contactAddress', data.address);
            }
          }
          if (data.rep && companyRepInput && !companyRepInput.value.trim()) {
            companyRepInput.value = data.rep;
            updateLiveField('companyRepresentative', data.rep);
            if (typedSigInput && !typedSigInput.dataset.userEdited) {
              typedSigInput.value = data.rep;
              updateTypedFontSamples();
            }
          }
          if (contactPhoneInput && !contactPhoneInput.value && data.phone) {
            contactPhoneInput.value = data.phone;
            updateLiveField('contactPhone', data.phone);
          }

          if (eikFeedbackMsg) {
            eikFeedbackMsg.style.display = 'none';
          }

          if (companyVerifyBanner) {
            companyVerifyBanner.style.display = 'flex';
            companyVerifyBanner.classList.remove('is-verified');
          }

          showToast('Datele companiei au fost preluate cu succes!', 'success');
          return;
        }
      }
    } catch (err) {
      console.warn('CUI lookup error:', err);
    }

    if (eikFeedbackMsg) {
      eikFeedbackMsg.style.display = 'block';
      eikFeedbackMsg.className = 'field-hint-msg';
      eikFeedbackMsg.textContent = 'Compania nu a fost găsită automat. Puteți introduce datele manual.';
    }
  }

  window.triggerVerifyCui = function () {
    const inp = document.getElementById('companyEik');
    if (inp && inp.value.trim()) {
      lookupRomanianCompany(inp.value.trim());
    } else {
      showToast('Vă rugăm să introduceți un CUI / CIF pentru verificare.', 'error');
    }
  };

  // =========================================================================
  // MAIN INITIALIZATION
  // =========================================================================
  function initPortal() {
    const form = document.getElementById('merchantContractForm');
    const contractDateInput = document.getElementById('contractDate');
    const hiddenNativeDatePicker = document.getElementById('hiddenNativeDatePicker');
    const btnCalendarTrigger = document.getElementById('btnCalendarTrigger');
    const sameAddressCheckbox = document.getElementById('sameAddressCheckbox');
    const companyAddressInput = document.getElementById('companyAddress');
    const contactAddressInput = document.getElementById('contactAddress');
    const companyEikInput = document.getElementById('companyEik');
    const companyNameInput = document.getElementById('companyName');
    const companyRepInput = document.getElementById('companyRepresentative');
    const companyRepPinInput = document.getElementById('companyRepresentativePin');
    const bankIbanInput = document.getElementById('bankIban');
    const bankNameSelect = document.getElementById('bankName');
    const customBankInputWrapper = document.getElementById('customBankInputWrapper');
    const customBankInput = document.getElementById('customBankInput');
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
    const typedSigInput = document.getElementById('typedSigInput');
    const clearCanvasBtn = document.getElementById('clearCanvasBtn');
    const applySignatureBtn = document.getElementById('applySignatureBtn');
    const sigFileInput = document.getElementById('sigFileInput');
    const canvas = document.getElementById('sigCanvas');
    const canvasWatermark = document.getElementById('canvasWatermark') || document.querySelector('.canvas-watermark');
    const companyVerifyBanner = document.getElementById('companyVerifyBanner');
    const btnVerifyDataYes = document.getElementById('btnVerifyDataYes');
    const btnVerifyDataNo = document.getElementById('btnVerifyDataNo');
    const eikFeedbackMsg = document.getElementById('eikFeedbackMsg');
    const companyInputsWrapper = document.getElementById('companyInputsWrapper');

    // 1. Detect custom commission token & partner referral
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let detectedCustomToken = urlParams.get('c') || urlParams.get('custom');
      let detectedPartnerSlug = urlParams.get('ref') || urlParams.get('affiliate');

      if (detectedPartnerSlug) {
        window.irisCurrentAffiliate = detectedPartnerSlug.toLowerCase().trim();
      }

      if (detectedCustomToken) {
        window.irisCustomToken = detectedCustomToken.trim();
        fetch(`/api/custom-link?token=${encodeURIComponent(window.irisCustomToken)}`)
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json();
              if (data && data.valid && data.commission) {
                const commDisplay = document.getElementById('appCommissionDisplay');
                const commDisplayEn = document.getElementById('appCommissionDisplayEn');
                if (commDisplay) commDisplay.textContent = data.commission;
                if (commDisplayEn) commDisplayEn.textContent = data.commission;
              }
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      console.warn('URL param error:', e);
    }

    // 2. Compute today's date and prefill
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayDmy = `${dd}.${mm}.${yyyy}`;
    const todayYmd = `${yyyy}-${mm}-${dd}`;

    if (contractDateInput && !contractDateInput.value) {
      contractDateInput.value = todayDmy;
    }
    if (hiddenNativeDatePicker) {
      hiddenNativeDatePicker.value = todayYmd;
    }

    // 3. Calendar Trigger
    if (btnCalendarTrigger && hiddenNativeDatePicker) {
      btnCalendarTrigger.addEventListener('click', () => {
        scrollToDocSection('pageCard3');
        if (typeof hiddenNativeDatePicker.showPicker === 'function') {
          hiddenNativeDatePicker.showPicker();
        } else {
          hiddenNativeDatePicker.click();
        }
      });

      hiddenNativeDatePicker.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
          const [y, m, d] = val.split('-');
          const formatted = `${d}.${m}.${y}`;
          if (contractDateInput) contractDateInput.value = formatted;
          updateLiveField('date', formatted);
          scrollToDocSection('pageCard3');
        }
      });
    }

    if (contractDateInput) {
      contractDateInput.addEventListener('input', (e) => {
        updateLiveField('date', e.target.value.trim() || todayDmy);
      });
      contractDateInput.addEventListener('change', (e) => {
        updateLiveField('date', e.target.value.trim() || todayDmy);
      });
    }

    // 4. Verification Banner Buttons
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
        showToast('Puteți corecta manual câmpurile de mai jos.', 'info');
      });
    }

    // 5. Website Live Updating
    function updateWebsiteLive() {
      if (noWebsiteCheckbox && noWebsiteCheckbox.checked) {
        updateLiveField('merchantWebsite', 'Fără website');
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
      updateLiveField('merchantWebsite', sites.join(', '));
    }

    // 6. Comprehensive Field Sync Function
    function syncAllFields() {
      if (companyEikInput) updateLiveField('companyEik', companyEikInput.value);
      if (companyNameInput) updateLiveField('companyName', companyNameInput.value);
      if (companyAddressInput) updateLiveField('companyAddress', companyAddressInput.value);
      if (companyRepInput) updateLiveField('companyRepresentative', companyRepInput.value);
      if (companyRepPinInput) updateLiveField('companyRepresentativePin', companyRepPinInput.value);

      const bVal = (bankNameSelect?.value === 'custom') ? (customBankInput?.value || '') : (bankNameSelect?.value || '');
      updateLiveField('bankName', bVal);
      if (bankIbanInput) updateLiveField('bankIban', bankIbanInput.value);

      updateWebsiteLive();

      if (contactAddressInput) updateLiveField('contactAddress', contactAddressInput.value);
      if (contactEmailInput) updateLiveField('contactEmail', contactEmailInput.value);
      if (contactPhoneInput) updateLiveField('contactPhone', contactPhoneInput.value);

      const dVal = contractDateInput ? contractDateInput.value.trim() : '';
      updateLiveField('date', dVal || todayDmy);
    }

    // 7. Live Sync Bindings
    function bindSync(inputEl, fieldName, targetPage) {
      if (!inputEl) return;
      inputEl.addEventListener('input', () => {
        updateLiveField(fieldName, inputEl.value.trim());
      });
      if (targetPage) {
        inputEl.addEventListener('focus', () => {
          scrollToDocSection(targetPage);
        });
      }
    }

    bindSync(companyEikInput, 'companyEik', 'pageCard3');
    bindSync(contractDateInput, 'date', 'pageCard3');
    bindSync(companyNameInput, 'companyName', 'pageCard3');
    bindSync(companyAddressInput, 'companyAddress', 'pageCard3');
    bindSync(companyRepPinInput, 'companyRepresentativePin', 'pageCard3');

    bindSync(bankIbanInput, 'bankIban', 'pageCard6');
    if (bankNameSelect) {
      bankNameSelect.addEventListener('focus', () => scrollToDocSection('pageCard6'));
      bankNameSelect.addEventListener('change', () => {
        scrollToDocSection('pageCard6');
        if (bankNameSelect.value === 'custom') {
          if (customBankInputWrapper) customBankInputWrapper.style.display = 'block';
          if (customBankInput) {
            customBankInput.focus();
            updateLiveField('bankName', customBankInput.value.trim());
          }
        } else {
          if (customBankInputWrapper) customBankInputWrapper.style.display = 'none';
          updateLiveField('bankName', bankNameSelect.value);
        }
      });
    }

    if (customBankInput) {
      customBankInput.addEventListener('focus', () => scrollToDocSection('pageCard6'));
      customBankInput.addEventListener('input', () => {
        if (bankNameSelect?.value === 'custom') {
          updateLiveField('bankName', customBankInput.value.trim());
        }
      });
    }

    if (merchantWebsiteInput) {
      merchantWebsiteInput.addEventListener('focus', () => scrollToDocSection('pageCard6'));
      merchantWebsiteInput.addEventListener('input', () => {
        updateWebsiteLive();
      });
    }

    if (extraWebsite1) {
      extraWebsite1.addEventListener('focus', () => scrollToDocSection('pageCard6'));
      extraWebsite1.addEventListener('input', updateWebsiteLive);
    }
    if (extraWebsite2) {
      extraWebsite2.addEventListener('focus', () => scrollToDocSection('pageCard6'));
      extraWebsite2.addEventListener('input', updateWebsiteLive);
    }

    if (noWebsiteCheckbox) {
      noWebsiteCheckbox.addEventListener('change', () => {
        scrollToDocSection('pageCard6');
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
        updateWebsiteLive();
      });
    }

    if (extraWebsitesCheckbox && extraWebsitesWrapper) {
      extraWebsitesCheckbox.addEventListener('change', () => {
        scrollToDocSection('pageCard6');
        extraWebsitesWrapper.style.display = extraWebsitesCheckbox.checked ? 'flex' : 'none';
        updateWebsiteLive();
      });
    }

    bindSync(contactAddressInput, 'contactAddress', 'pageCard11');
    bindSync(contactEmailInput, 'contactEmail', 'pageCard11');
    bindSync(contactPhoneInput, 'contactPhone', 'pageCard11');

    // Representative Name listener (syncs with document & typed signature)
    if (companyRepInput) {
      companyRepInput.addEventListener('focus', () => scrollToDocSection('pageCard3'));
      companyRepInput.addEventListener('input', () => {
        const val = companyRepInput.value.trim();
        updateLiveField('companyRepresentative', val);
        if (typedSigInput && !typedSigInput.dataset.userEdited) {
          typedSigInput.value = val;
          updateTypedFontSamples();
          if (currentSigMode === 'type' && val.length >= 2) {
            applyTypedSignatureLive();
          }
        }
      });
    }

    // Address Checkbox
    if (sameAddressCheckbox && companyAddressInput && contactAddressInput) {
      sameAddressCheckbox.addEventListener('change', () => {
        scrollToDocSection('pageCard11');
        if (sameAddressCheckbox.checked) {
          contactAddressInput.value = companyAddressInput.value;
          contactAddressInput.disabled = true;
          updateLiveField('contactAddress', companyAddressInput.value.trim());
        } else {
          contactAddressInput.disabled = false;
        }
      });

      companyAddressInput.addEventListener('input', () => {
        if (sameAddressCheckbox.checked) {
          contactAddressInput.value = companyAddressInput.value;
          updateLiveField('contactAddress', companyAddressInput.value.trim());
        }
      });
    }

    // CUI Input Events
    if (companyEikInput) {
      companyEikInput.addEventListener('input', (e) => {
        let raw = e.target.value.trim();
        updateLiveField('companyEik', raw);

        clearTimeout(cuiDebounceTimer);
        const cleanDigits = raw.replace(/^RO/i, '').replace(/\D/g, '');
        if (cleanDigits.length < 2) return;

        cuiDebounceTimer = setTimeout(() => {
          lookupRomanianCompany(raw);
        }, 450);
      });

      companyEikInput.addEventListener('change', (e) => {
        if (e.target.value.trim().length >= 2) {
          lookupRomanianCompany(e.target.value.trim());
        }
      });

      companyEikInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.target.value.trim().length >= 2) {
            lookupRomanianCompany(e.target.value.trim());
          }
        }
      });
    }

    // 8. Electronic Signature Engine
    if (canvas) {
      const ctx = canvas.getContext('2d');
      let painting = false;
      canvas.style.touchAction = 'none';

      canvas.addEventListener('click', () => scrollToDocSection('pageCard14'));

      function getCanvasCoordinates(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let clientX = e.clientX;
        let clientY = e.clientY;
        if (e.touches && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        }
        return {
          x: (clientX - rect.left) * scaleX,
          y: (clientY - rect.top) * scaleY
        };
      }

      function startPosition(e) {
        painting = true;
        hasDrawn = true;
        if (canvasWatermark) canvasWatermark.style.display = 'none';
        const coords = getCanvasCoordinates(e);
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
        ctx.arc(coords.x, coords.y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#1F3864';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
      }

      function finishedPosition() {
        if (!painting) return;
        painting = false;
        ctx.beginPath();
        const sigData = getSignatureImageBase64();
        if (sigData) {
          applySignatureToSlots(sigData, false, '', '');
        }
      }

      function draw(e) {
        if (!painting) return;
        if (e.cancelable) e.preventDefault();
        const coords = getCanvasCoordinates(e);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1F3864';
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
      }

      if (window.PointerEvent) {
        canvas.addEventListener('pointerdown', startPosition);
        canvas.addEventListener('pointermove', draw);
        window.addEventListener('pointerup', finishedPosition);
        window.addEventListener('pointercancel', finishedPosition);
      } else {
        canvas.addEventListener('mousedown', startPosition);
        canvas.addEventListener('mousemove', draw);
        window.addEventListener('mouseup', finishedPosition);

        canvas.addEventListener('touchstart', (e) => {
          if (e.cancelable) e.preventDefault();
          startPosition(e);
        }, { passive: false });
        canvas.addEventListener('touchmove', (e) => {
          if (e.cancelable) e.preventDefault();
          draw(e);
        }, { passive: false });
        window.addEventListener('touchend', finishedPosition);
      }

      if (clearCanvasBtn) {
        clearCanvasBtn.addEventListener('click', () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          hasDrawn = false;
          if (canvasWatermark) canvasWatermark.style.display = 'block';
          resetSignatureStatus();
        });
      }
    }

    // Type signature input
    if (typedSigInput) {
      typedSigInput.addEventListener('focus', () => scrollToDocSection('pageCard14'));
      typedSigInput.addEventListener('input', (e) => {
        typedSigInput.dataset.userEdited = 'true';
        updateTypedFontSamples();
        if (currentSigMode === 'type') {
          applyTypedSignatureLive();
        }
      });
    }

    // File Upload Signature
    if (sigFileInput) {
      sigFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          uploadedSigBase64 = event.target.result;
          lastGeneratedSigBase64 = uploadedSigBase64;
          const uploadPreviewImg = document.getElementById('uploadPreviewImg');
          const uploadPreviewWrapper = document.getElementById('uploadPreviewWrapper');
          if (uploadPreviewImg) uploadPreviewImg.src = uploadedSigBase64;
          if (uploadPreviewWrapper) uploadPreviewWrapper.style.display = 'block';
          applySignatureToSlots(uploadedSigBase64, false, '', '');
          scrollToDocSection('pageCard14');
        };
        reader.readAsDataURL(file);
      });
    }

    // Document slots click handler: Allows direct signing from the document pages
    document.querySelectorAll('.sig-slot-box').forEach(slot => {
      slot.style.cursor = 'pointer';
      slot.title = 'Faceți clic pentru a semna contractul';
      slot.addEventListener('click', () => {
        const sigData = getSignatureImageBase64();
        if (sigData || (currentSigMode === 'type' && (typedSigInput?.value || companyRepInput?.value))) {
          window.applySignatureNow();
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

    // Initial Full Sync across document
    syncAllFields();

    // Smoothly scroll document viewport to Page 3 (contract preamble) on startup
    setTimeout(() => {
      scrollToDocSection('pageCard3');
    }, 280);

    // Form Submission
    if (submitContractBtn) {
      submitContractBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        const compName = (companyNameInput?.value || '').trim();
        const compEik = (companyEikInput?.value || '').trim();
        const compAddress = (companyAddressInput?.value || '').trim();
        const compRep = (companyRepInput?.value || '').trim();
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

        // Auto-apply signature if user provided name or drawing
        if (!isContractSigned || !isAppendixSigned) {
          const textVal = (typedSigInput?.value || '').trim() || compRep;
          if (currentSigMode === 'type' && textVal.length >= 2) {
            window.applySignatureNow();
          } else if (currentSigMode === 'draw' && hasDrawn && canvas) {
            window.applySignatureNow();
          } else if (currentSigMode === 'upload' && uploadedSigBase64) {
            window.applySignatureNow();
          } else {
            showToast('Vă rugăm să aplicați semnătura pe Contract și Anexa 1 înainte de trimitere.', 'error');
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

        const sigBase64 = getSignatureImageBase64();

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

          if (response.ok && resData.success) {
            showToast('Contractul a fost semnat și trimis cu succes!', 'success');
            alert('Felicitări! Contractul IRIS Pay a fost semnat electronic cu succes. O copie a fost transmisă către echipa IRIS Pay.');
            window.location.reload();
          } else {
            showToast(resData.error || 'A apărut o eroare la trimiterea contractului.', 'error');
          }
        } catch (err) {
          console.error('Error sending contract:', err);
          showToast('Eroare de conexiune la trimiterea contractului.', 'error');
        } finally {
          if (loadingOverlay) loadingOverlay.style.display = 'none';
          submitContractBtn.disabled = false;
          submitContractBtn.innerHTML = '<span>Trimite</span>';
        }
      });
    }

    // Zoom Controls
    let currentZoom = 100;
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomLevelDisplay = document.getElementById('zoomLevelDisplay');
    const mainDocContainer = document.getElementById('mainDocContainer');

    if (zoomInBtn && zoomOutBtn && zoomLevelDisplay && mainDocContainer) {
      zoomInBtn.addEventListener('click', () => {
        if (currentZoom < 140) {
          currentZoom += 10;
          applyZoom();
        }
      });

      zoomOutBtn.addEventListener('click', () => {
        if (currentZoom > 70) {
          currentZoom -= 10;
          applyZoom();
        }
      });

      function applyZoom() {
        zoomLevelDisplay.textContent = `${currentZoom}%`;
        const scale = currentZoom / 100;
        mainDocContainer.style.transform = `scale(${scale})`;
        mainDocContainer.style.transformOrigin = 'top center';
      }
    }
  }

  function resetSignatureStatus() {
    isContractSigned = false;
    isAppendixSigned = false;
    lastGeneratedSigBase64 = null;
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
        slot.style.border = 'none';
        slot.style.background = 'transparent';
      }
    });

    const statusBoxContract = document.getElementById('statusBoxContract');
    const statusBoxAppendix = document.getElementById('statusBoxAppendix');
    if (statusBoxContract) {
      const icon = statusBoxContract.querySelector('.status-icon');
      if (icon) {
        icon.textContent = '●';
        icon.className = 'status-icon pending';
        icon.style.color = '#F59E0B';
      }
    }
    if (statusBoxAppendix) {
      const icon = statusBoxAppendix.querySelector('.status-icon');
      if (icon) {
        icon.textContent = '●';
        icon.className = 'status-icon pending';
        icon.style.color = '#F59E0B';
      }
    }
  }

  // Self-executing initialization: runs immediately if DOM is already ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPortal);
  } else {
    initPortal();
  }

})();
