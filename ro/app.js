/**
 * IRIS Pay România | Semnare electronică contract
 * Script pentru sincronizare date în timp real, semnătură și trimitere API (country: 'ro')
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
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
  const contactPhoneError = document.getElementById('contactPhoneError');
  const submitContractBtn = document.getElementById('submitContractBtn');
  const loadingOverlay = document.getElementById('loadingScreenOverlay');
  const toast = document.getElementById('toastNotification');

  // Today's date in DD.MM.YYYY
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayDmy = `${dd}.${mm}.${yyyy}`;
  const todayYmd = `${yyyy}-${mm}-${dd}`;

  if (contractDateInput) {
    contractDateInput.value = todayDmy;
    updateLiveField('date', todayDmy);
  }
  if (hiddenNativeDatePicker) {
    hiddenNativeDatePicker.value = todayYmd;
  }

  // Calendar Trigger
  if (btnCalendarTrigger && hiddenNativeDatePicker) {
    btnCalendarTrigger.addEventListener('click', () => {
      if (typeof hiddenNativeDatePicker.showPicker === 'function') {
        hiddenNativeDatePicker.showPicker();
      } else {
        hiddenNativeDatePicker.click();
      }
    });

    hiddenNativeDatePicker.addEventListener('change', (e) => {
      const val = e.target.value; // YYYY-MM-DD
      if (val) {
        const [y, m, d] = val.split('-');
        const formatted = `${d}.${m}.${y}`;
        contractDateInput.value = formatted;
        updateLiveField('date', formatted);
      }
    });
  }

  if (contractDateInput) {
    contractDateInput.addEventListener('input', (e) => {
      updateLiveField('date', e.target.value.trim() || todayDmy);
    });
  }

  // Helper: Live field updater
  function updateLiveField(fieldName, value) {
    document.querySelectorAll(`.live-field[data-field="${fieldName}"]`).forEach(el => {
      if (value) {
        el.textContent = value;
        el.classList.add('filled');
        el.classList.remove('underlined');
      } else {
        el.textContent = '.........................';
        el.classList.remove('filled');
        el.classList.add('underlined');
      }
    });
  }

  // Live Sync Inputs
  function bindSync(inputEl, fieldName) {
    if (!inputEl) return;
    inputEl.addEventListener('input', () => {
      updateLiveField(fieldName, inputEl.value.trim());
    });
  }

  bindSync(companyNameInput, 'companyName');
  bindSync(companyEikInput, 'companyEik');
  bindSync(companyAddressInput, 'companyAddress');
  bindSync(companyRepInput, 'companyRepresentative');
  bindSync(companyRepPinInput, 'companyRepresentativePin');
  bindSync(bankIbanInput, 'bankIban');
  bindSync(contactAddressInput, 'contactAddress');
  bindSync(contactEmailInput, 'contactEmail');
  bindSync(contactPhoneInput, 'contactPhone');

  // Address Checkbox
  if (sameAddressCheckbox && companyAddressInput && contactAddressInput) {
    sameAddressCheckbox.addEventListener('change', () => {
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

  // Bank Selection
  if (bankNameSelect) {
    bankNameSelect.addEventListener('change', () => {
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
    customBankInput.addEventListener('input', () => {
      if (bankNameSelect.value === 'custom') {
        updateLiveField('bankName', customBankInput.value.trim());
      }
    });
  }

  // Website Management
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
      updateWebsiteLive();
    });
  }

  if (merchantWebsiteInput) merchantWebsiteInput.addEventListener('input', updateWebsiteLive);
  if (extraWebsite1) extraWebsite1.addEventListener('input', updateWebsiteLive);
  if (extraWebsite2) extraWebsite2.addEventListener('input', updateWebsiteLive);

  if (extraWebsitesCheckbox && extraWebsitesWrapper) {
    extraWebsitesCheckbox.addEventListener('change', () => {
      extraWebsitesWrapper.style.display = extraWebsitesCheckbox.checked ? 'flex' : 'none';
      updateWebsiteLive();
    });
  }

  // Detect custom commission token & partner slug from Romanian URL
  let detectedCustomToken = null;
  let detectedPartnerSlug = null;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('c')) detectedCustomToken = urlParams.get('c').trim();
    if (urlParams.get('custom')) detectedCustomToken = urlParams.get('custom').trim();
    if (urlParams.get('ref')) detectedPartnerSlug = urlParams.get('ref').trim();
    if (urlParams.get('affiliate')) detectedPartnerSlug = urlParams.get('affiliate').trim();

    // Check pathname: e.g. /ro, /ro/smartbill, /ro/c/token, /ro/smartbill/token
    const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const segments = rawPath.split('/').filter(Boolean);

    // If starts with 'ro'
    if (segments.length >= 2 && segments[0].toLowerCase() === 'ro') {
      const rest = segments.slice(1);
      if (rest.length === 2) {
        if (rest[0].toLowerCase() === 'c') {
          // /ro/c/:token
          detectedCustomToken = rest[1].trim();
        } else {
          // /ro/:partner/:token
          detectedPartnerSlug = rest[0].toLowerCase().trim();
          detectedCustomToken = rest[1].trim();
        }
      } else if (rest.length === 1) {
        const seg = rest[0].trim();
        if (seg.toLowerCase().startsWith('c-')) {
          detectedCustomToken = seg.substring(2).trim();
        } else if (seg.toLowerCase() !== 'login' && seg.toLowerCase() !== 'dashboard' && seg.toLowerCase() !== 'index.html') {
          detectedPartnerSlug = seg.toLowerCase().trim();
        }
      }
    }
  } catch (err) {
    console.warn('URL parsing error:', err);
  }

  if (detectedPartnerSlug) {
    window.irisCurrentAffiliate = detectedPartnerSlug;
    sessionStorage.setItem('iris_affiliate_ref_ro', detectedPartnerSlug);
    console.log('[IRIS Pay RO] Partner affiliate detected:', detectedPartnerSlug);
  }

  if (detectedCustomToken) {
    window.irisCustomToken = detectedCustomToken;
    console.log('[IRIS Pay RO] Custom commission token detected:', detectedCustomToken);

    fetch(`/api/custom-link?token=${encodeURIComponent(detectedCustomToken)}`)
      .then(async (res) => {
        const banner = document.getElementById('customFeeNotificationBanner');
        const commDisplay = document.getElementById('appCommissionDisplay');
        const commDisplayEn = document.getElementById('appCommissionDisplayEn');

        if (res.ok) {
          const data = await res.json();
          if (data && data.valid && data.commission) {
            window.irisCustomCommission = data.commission;
            if (commDisplay) {
              commDisplay.textContent = data.commission;
              commDisplay.style.color = '#059669';
            }
            if (commDisplayEn) {
              commDisplayEn.textContent = data.commission;
              commDisplayEn.style.color = '#059669';
            }

            if (data.partnerSlug) {
              window.irisCurrentAffiliate = data.partnerSlug;
            }

            if (banner) {
              banner.style.display = 'block';
              banner.style.background = '#F0FDF4';
              banner.style.border = '1px solid #BBF7D0';
              banner.style.color = '#166534';
              const partnerNotice = data.partnerName ? ` de la partenerul <strong>${data.partnerName}</strong>` : '';
              banner.innerHTML = `
                <div style="display:flex;align-items:flex-start;gap:8px;">
                  <span style="font-weight:700;font-size:15px;line-height:1;">✓</span>
                  <div>
                    <strong>Ofertă individuală${partnerNotice}:</strong> Contractul este generat cu un comision special de <strong>${data.commission}</strong> pentru inițierea plăților (Anexa 1).
                  </div>
                </div>
              `;
            }
          }
        } else if (res.status === 410) {
          window.irisCustomTokenUsed = true;
          if (banner) {
            banner.style.display = 'block';
            banner.style.background = '#FEF2F2';
            banner.style.border = '1px solid #FECACA';
            banner.style.color = '#991B1B';
            banner.innerHTML = `
              <div style="text-align: center; padding: 4px 0;">
                <div style="font-size: 14.5px; font-weight: 700; margin-bottom: 4px;">Acest link de unică folosință a fost deja utilizat</div>
                <div style="font-size: 12.5px;">Contractul pentru această ofertă a fost deja semnat și trimis. Linkul a fost dezactivat.</div>
              </div>
            `;
          }
          if (submitContractBtn) {
            submitContractBtn.disabled = true;
            submitContractBtn.style.opacity = '0.5';
          }
        }
      })
      .catch(e => console.warn('Error validating custom token:', e));
  }

  // =========================================================================
  // Signature Handling
  // =========================================================================
  let currentSigMode = 'draw';
  let isContractSigned = false;
  let isAppendixSigned = false;
  let hasDrawn = false;
  let activeTypedFont = 'Homemade Apple';

  const canvas = document.getElementById('sigCanvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const clearCanvasBtn = document.getElementById('clearCanvasBtn');
  const applySignatureBtn = document.getElementById('applySignatureBtn');
  const badgeContract = document.getElementById('badgeContract');
  const badgeAppendix = document.getElementById('badgeAppendix');
  const contractMerchantSigSlot = document.getElementById('contractMerchantSigSlot');
  const contractMerchantSigSlotEn = document.getElementById('contractMerchantSigSlotEn');
  const contractMerchantTermsSigSlot = document.getElementById('contractMerchantTermsSigSlot');
  const contractMerchantTermsSigSlotEn = document.getElementById('contractMerchantTermsSigSlotEn');
  const appendixMerchantSigSlot = document.getElementById('appendixMerchantSigSlot');
  const appendixMerchantSigSlotEn = document.getElementById('appendixMerchantSigSlotEn');
  const typedSigInput = document.getElementById('typedSigInput');
  const sigFileInput = document.getElementById('sigFileInput');
  const uploadPreviewWrapper = document.getElementById('uploadPreviewWrapper');
  const uploadPreviewImg = document.getElementById('uploadPreviewImg');

  // Signature tabs switch
  document.querySelectorAll('.sig-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sig-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sig-tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      currentSigMode = btn.dataset.mode;

      if (currentSigMode === 'draw') {
        document.getElementById('sigContentDraw').classList.add('active');
      } else if (currentSigMode === 'type') {
        document.getElementById('sigContentType').classList.add('active');
        if (typedSigInput && !typedSigInput.value.trim() && companyRepInput) {
          typedSigInput.value = companyRepInput.value.trim();
          updateTypedFontSamples();
        }
      } else if (currentSigMode === 'upload') {
        document.getElementById('sigContentUpload').classList.add('active');
      }
    });
  });

  // Canvas Drawing
  if (canvas && ctx) {
    let painting = false;

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
      const coords = getCanvasCoordinates(e);
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }

    function finishedPosition() {
      if (!painting) return;
      painting = false;
      ctx.beginPath();
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

    canvas.addEventListener('mousedown', startPosition);
    canvas.addEventListener('mouseup', finishedPosition);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseleave', finishedPosition);

    canvas.addEventListener('touchstart', (e) => {
      if (e.cancelable) e.preventDefault();
      startPosition(e);
    }, { passive: false });
    canvas.addEventListener('touchend', finishedPosition);
    canvas.addEventListener('touchmove', (e) => {
      if (e.cancelable) e.preventDefault();
      draw(e);
    }, { passive: false });
  }

  if (clearCanvasBtn && ctx && canvas) {
    clearCanvasBtn.addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawn = false;
      resetSignatureStatus();
      const feedback = document.getElementById('sigAppliedNotice');
      if (feedback) feedback.style.display = 'none';
    });
  }

  // Type Signature samples
  function updateTypedFontSamples() {
    const text = (typedSigInput?.value || '').trim() || (companyRepInput?.value || '').trim() || 'Ion Popescu';
    const s1 = document.getElementById('sample1');
    const s2 = document.getElementById('sample2');
    const s3 = document.getElementById('sample3');
    if (s1) s1.textContent = text;
    if (s2) s2.textContent = text;
    if (s3) s3.textContent = text;
  }

  if (typedSigInput) {
    typedSigInput.addEventListener('input', updateTypedFontSamples);
  }

  document.querySelectorAll('.font-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.font-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      activeTypedFont = card.dataset.font;
    });
  });

  // File Upload Signature
  let uploadedSigBase64 = null;
  if (sigFileInput) {
    sigFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        uploadedSigBase64 = event.target.result;
        if (uploadPreviewImg) uploadPreviewImg.src = uploadedSigBase64;
        if (uploadPreviewWrapper) uploadPreviewWrapper.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });
  }

  function resetSignatureStatus() {
    isContractSigned = false;
    isAppendixSigned = false;
    if (badgeContract) {
      badgeContract.textContent = 'Nesemnat';
      badgeContract.className = 'status-badge';
    }
    if (badgeAppendix) {
      badgeAppendix.textContent = 'Nesemnat';
      badgeAppendix.className = 'status-badge';
    }

    const allSlots = [
      contractMerchantSigSlot,
      contractMerchantSigSlotEn,
      contractMerchantTermsSigSlot,
      contractMerchantTermsSigSlotEn,
      appendixMerchantSigSlot,
      appendixMerchantSigSlotEn
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

  function getSignatureImageBase64() {
    if (currentSigMode === 'draw') {
      if (!hasDrawn || !canvas) return null;
      return canvas.toDataURL('image/png');
    } else if (currentSigMode === 'type') {
      const text = (typedSigInput?.value || '').trim() || (companyRepInput?.value || '').trim() || 'Ion Popescu';
      const off = document.createElement('canvas');
      off.width = 400;
      off.height = 100;
      const octx = off.getContext('2d');
      octx.clearRect(0, 0, 400, 100);
      octx.font = `italic 32px "${activeTypedFont}", cursive, sans-serif`;
      octx.fillStyle = '#1F3864';
      octx.textBaseline = 'middle';
      octx.fillText(text, 15, 45);
      octx.beginPath();
      octx.moveTo(15, 65);
      octx.quadraticCurveTo(140, 80, 320, 62);
      octx.lineWidth = 2;
      octx.strokeStyle = 'rgba(31, 56, 100, 0.7)';
      octx.stroke();
      return off.toDataURL('image/png');
    } else if (currentSigMode === 'upload') {
      return uploadedSigBase64;
    }
    return null;
  }

  // Apply Signature Button
  if (applySignatureBtn) {
    applySignatureBtn.addEventListener('click', () => {
      const sigData = getSignatureImageBase64();
      if (!sigData) {
        showToast('Vă rugăm să desenați, tastați sau încărcați o semnătură mai întâi.', 'error');
        return;
      }

      isContractSigned = true;
      isAppendixSigned = true;

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

      const imgHtml = `<img src="${sigData}" alt="Semnătură Comerciant" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;">`;
      const allSlots = [
        contractMerchantSigSlot,
        contractMerchantSigSlotEn,
        contractMerchantTermsSigSlot,
        contractMerchantTermsSigSlotEn,
        appendixMerchantSigSlot,
        appendixMerchantSigSlotEn
      ];

      allSlots.forEach(slot => {
        if (slot) {
          slot.innerHTML = imgHtml;
          slot.style.border = 'none';
          slot.style.background = 'transparent';
        }
      });

      // In-card confirmation notice
      let feedback = document.getElementById('sigAppliedNotice');
      if (!feedback) {
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
        applySignatureBtn.parentNode.appendChild(feedback);
      }
      feedback.style.display = 'block';
      feedback.innerHTML = `<strong>✓ Semnătura a fost aplicată pe Contract și Anexa 1!</strong><div style="font-size: 11px; color: #047857; margin-top: 3px;">Puteți vedea semnătura în paginile 8 și 9 ale documentului.</div>`;

      showToast('Semnătura a fost aplicată cu succes!');

      // Smooth scroll to signature slot
      const targetSlot = contractMerchantSigSlot || appendixMerchantSigSlot;
      if (targetSlot) {
        targetSlot.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // Allow clicking on any signature slot on document pages to focus the signature card
  document.querySelectorAll('.sig-slot-box').forEach(slot => {
    slot.style.cursor = 'pointer';
    slot.title = 'Faceți clic pentru a semna';
    slot.addEventListener('click', () => {
      const sigCard = document.getElementById('signatureSectionCard');
      if (sigCard) {
        sigCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        sigCard.style.outline = '2px solid #00bff2';
        setTimeout(() => { sigCard.style.outline = 'none'; }, 1500);
      }
    });
  });

  // Toast Helper
  function showToast(msg, type = 'success') {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = (type === 'error') ? '#DC2626' : '#1F3864';
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3200);
  }

  // Form Submission
  if (submitContractBtn) {
    submitContractBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      if (window.irisCustomTokenUsed) {
        showToast('Acest link de unică folosință a fost deja utilizat!', 'error');
        return;
      }

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

      // Validation
      if (!compEik || !compName || !compAddress || !compRep || !bankNameText || !bankIbanVal || !contactAddrVal || !emailVal || !phoneVal) {
        showToast('Vă rugăm să completați toate câmpurile obligatorii (*).', 'error');
        return;
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailVal)) {
        showToast('Vă rugăm să introduceți o adresă de e-mail validă.', 'error');
        if (contactEmailError) contactEmailError.style.display = 'block';
        if (contactEmailInput) contactEmailInput.focus();
        return;
      }
      if (contactEmailError) contactEmailError.style.display = 'none';

      // Check signature
      if (!isContractSigned || !isAppendixSigned) {
        showToast('Vă rugăm să aplicați semnătura pe Contract și Anexa 1 înainte de trimitere.', 'error');
        const sigCard = document.getElementById('signatureSectionCard');
        if (sigCard) sigCard.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      // Check consents
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

      // Collect website
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

      // Construct Payload with country: 'ro'
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
      mainDocContainer.style.transform = `scale(${currentZoom / 100})`;
      mainDocContainer.style.transformOrigin = 'top center';
      zoomLevelDisplay.textContent = `${currentZoom}%`;
    }
  }
});
