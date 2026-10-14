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
    const repName = (document.getElementById('companyRepresentative').value || 'Представляващ Търговеца').trim();

    if (currentSigMode === 'draw' && hasDrawn && canvas) {
      const dataUrl = canvas.toDataURL();
      return `
        <div class="placed-merchant-sig drawn">
          <img src="${dataUrl}" alt="Подпис" style="max-height:44px; display:block;">
          <div style="font-size:12px; font-weight:bold; margin-top:2px;">/ ${repName} /</div>
        </div>
      `;
    } else if (currentSigMode === 'type') {
      const sigText = (typedSigInput && typedSigInput.value.trim()) || repName;
      let fontClass = 'style-script';
      if (selectedFontFamily === 'Great Vibes') fontClass = 'style-vibes';
      if (selectedFontFamily === 'Playfair Display') fontClass = 'style-serif';

      return `
        <div class="placed-merchant-sig typed">
          <div class="font-sample ${fontClass}" style="font-size:22px; line-height:1.2;">${sigText}</div>
          <div style="font-size:12px; font-weight:bold; font-family:var(--font-doc); margin-top:2px;">/ ${repName} /</div>
        </div>
      `;
    } else if (currentSigMode === 'upload' && uploadedImgDataUrl) {
      return `
        <div class="placed-merchant-sig drawn">
          <img src="${uploadedImgDataUrl}" alt="Подпис" style="max-height:44px; display:block;">
          <div style="font-size:12px; font-weight:bold; margin-top:2px;">/ ${repName} /</div>
        </div>
      `;
    } else {
      return `
        <div class="placed-merchant-sig typed">
          <div class="font-sample style-script" style="font-size:22px; line-height:1.2;">${repName}</div>
          <div style="font-size:12px; font-weight:bold; font-family:var(--font-doc); margin-top:2px;">/ ${repName} /</div>
        </div>
      `;
    }
  }

  function applySignature() {
    const sigHtml = createSignatureElementHtml();

    // Sign all 3 Merchant slots on Page 7 (Provider remains strictly blank)
    const slot1 = document.getElementById('contractSigDisplay1');
    const slot2 = document.getElementById('contractSigDisplay2');
    const slot3 = document.getElementById('contractSigDisplay3');
    if (slot1) slot1.innerHTML = sigHtml;
    if (slot2) slot2.innerHTML = sigHtml;
    if (slot3) slot3.innerHTML = sigHtml;

    isContractSigned = true;
    updateBadge('badgeContract', 'Подписан', true);

    // If sign both is checked, sign Appendix 1 slot
    if (!signBothCheckbox || signBothCheckbox.checked) {
      const appendixSlot = document.getElementById('appendixSigDisplay');
      if (appendixSlot) {
        appendixSlot.innerHTML = sigHtml;
      }
      isAppendixSigned = true;
      updateBadge('badgeAppendix', 'Подписан', true);
    }

    if (removeSignatureBtn) removeSignatureBtn.style.display = 'inline-block';
    
    // Update step indicator 3
    const step3 = document.getElementById('stepIndicator3');
    if (step3) step3.classList.add('completed');

    showToast('Електронният подпис е положен успешно на документите!', 'success');
  }

  function removeSignature() {
    const slot1 = document.getElementById('contractSigDisplay1');
    const slot2 = document.getElementById('contractSigDisplay2');
    const slot3 = document.getElementById('contractSigDisplay3');
    const appendixSlot = document.getElementById('appendixSigDisplay');

    const defaultDots = `<div class="sig-underline-dots">....................................................................</div>`;
    if (slot1) slot1.innerHTML = defaultDots;
    if (slot2) slot2.innerHTML = defaultDots;
    if (slot3) slot3.innerHTML = defaultDots;
    if (appendixSlot) appendixSlot.innerHTML = `<div class="dotted-sig-line">....................................................................</div>`;

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

      // Check required fields
      const requiredInputs = form.querySelectorAll('input[required]');
      let firstMissing = null;
      requiredInputs.forEach(input => {
        if (!input.disabled && !input.value.trim()) {
          if (!firstMissing) firstMissing = input;
          input.style.borderColor = '#dc2626';
        } else {
          input.style.borderColor = '';
        }
      });

      // Check bank name
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

      if (firstMissing) {
        firstMissing.focus();
        showToast('Моля, попълнете всички задължителни полета, отбелязани със звездичка (*).', 'error');
        return;
      }

      // Check signature status
      if (!isContractSigned || !isAppendixSigned) {
        showToast('Моля, положете Вашия електронен подпис върху Договора и Приложение 1 преди изпращане.', 'error');
        const sigSec = document.getElementById('signatureSectionCard');
        if (sigSec) sigSec.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      // Check General Terms agreement
      const agreeTerms = document.getElementById('agreeTermsCheckbox');
      const confirmData = document.getElementById('confirmDataCheckbox');
      if (!agreeTerms || !agreeTerms.checked) {
        showToast('Необходимо е да се съгласите с Общите условия на „Айрис Солюшънс“ АД.', 'error');
        if (agreeTerms) agreeTerms.focus();
        return;
      }
      if (!confirmData || !confirmData.checked) {
        showToast('Моля, потвърдете верността на въведените данни.', 'error');
        if (confirmData) confirmData.focus();
        return;
      }

      // Populate Success Modal Data
      const compName = document.getElementById('companyName').value.trim();
      const compEik = document.getElementById('companyEik').value.trim();
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
