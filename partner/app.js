/**
 * IRIS Pay | Портал за подписване на Договор за партньорска дейност (/partner)
 */

function initPartnerPortal() {
  const contractDateInput = document.getElementById('contractDate');
  const hiddenNativeDatePicker = document.getElementById('hiddenNativeDatePicker');
  const btnCalendarTrigger = document.getElementById('btnCalendarTrigger');
  const sameAddressCheckbox = document.getElementById('sameAddressCheckbox');
  const companyAddressInput = document.getElementById('companyAddress');
  const contactAddressInput = document.getElementById('contactAddress');
  const companyEikInput = document.getElementById('companyEik');
  const eikFeedbackMsg = document.getElementById('eikFeedbackMsg');
  const companyNameInput = document.getElementById('companyName');
  const companyRepresentativeInput = document.getElementById('companyRepresentative');
  const companyVerifyBanner = document.getElementById('companyVerifyBanner');
  const btnVerifyDataYes = document.getElementById('btnVerifyDataYes');
  const btnVerifyDataNo = document.getElementById('btnVerifyDataNo');
  const companyInputsWrapper = document.getElementById('companyInputsWrapper');
  const contactEmailInput = document.getElementById('contactEmail');
  const contactPhoneInput = document.getElementById('contactPhone');
  const contactEmailError = document.getElementById('contactEmailError');
  const submitContractBtn = document.getElementById('submitContractBtn');
  const loadingOverlay = document.getElementById('loadingScreenOverlay');

  // Today's date DD.MM.YYYY
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayDmy = `${dd}.${mm}.${yyyy}`;
  const todayYmd = `${yyyy}-${mm}-${dd}`;

  if (contractDateInput) contractDateInput.value = todayDmy;
  if (hiddenNativeDatePicker) hiddenNativeDatePicker.value = todayYmd;

  // Load custom Annex 1 terms if ?p=token is present
  let activePartnerToken = null;
  let activePartnerTerms = null;
  function applyPartnerTermsToAnnex(terms) {
    if (!terms) return;
    activePartnerTerms = terms;
    const incOneTime = terms.includeOneTime !== false;
    const incPercent = terms.includePercent !== false;
    const monthsVal = Math.max(1, parseInt(terms.months, 10) || 12);
    const tiers = (Array.isArray(terms.tiers) && terms.tiers.length > 0)
      ? terms.tiers
      : [{ label: 'За всеки търговец', oneTime: '50', percent: '5' }];

    const descCell = document.getElementById('partnerAnnexDescCell');
    if (descCell) {
      const parts = [];
      if (incOneTime) {
        parts.push('1. Еднократно, при подписване на договор с търговец. Комисионната е дължима в месеца, следващ направена успешна транзакция от страна на търговеца.');
      }
      if (incPercent) {
        const num = incOneTime ? '2.' : '1.';
        parts.push(`${num} Процент от прихода на привлечените от него търговци, за първите ${monthsVal} месеца от срока на договора между Компанията и Търговеца. Комисионната се изплаща ежемесечно на база реализирания нетен приход от търговеца за съответния период.`);
      }
      descCell.innerHTML = parts.join('<br><br>') || 'Съгласно договорените условия по-долу.';
    }

    const thead = document.getElementById('partnerTierTableHead');
    const tbody = document.getElementById('partnerTierTableBody');
    const colW = (100 / tiers.length).toFixed(2);
    if (thead) {
      thead.innerHTML = `<tr>${tiers.map(t => `<th style="width:${colW}%;">${escapeHtml(t.label)}</th>`).join('')}</tr>`;
    }
    if (tbody) {
      tbody.innerHTML = `<tr>${tiers.map(t => {
        const p = [];
        if (incOneTime) p.push(`${escapeHtml(String(t.oneTime))} EUR еднократно`);
        if (incPercent) p.push(`${escapeHtml(String(t.percent))}% от прихода`);
        return `<td><strong>${p.join(' + ') || '—'}</strong></td>`;
      }).join('')}</tr>`;
    }

    const footnote = document.getElementById('partnerAnnexFootnote');
    if (footnote) {
      if (incOneTime && incPercent) {
        footnote.textContent = 'Еднократното възнаграждение и процентът се отнасят само за привлечения клиент в съответната графа, в която попада.';
      } else if (incOneTime) {
        footnote.textContent = 'Еднократното възнаграждение се отнася само за привлечения клиент в съответната графа, в която попада.';
      } else if (incPercent) {
        footnote.textContent = 'Процентът се отнася само за привлечения клиент в съответната графа, в която попада.';
      } else {
        footnote.textContent = '';
      }
    }
  }

  function showNotFoundPage() {
    document.title = 'Страницата не съществува | IRIS Pay';
    document.body.style.margin = '0';
    document.body.style.background = '#F8FAFC';
    document.body.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;">
        <div style="max-width:520px;width:100%;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;padding:40px 32px;text-align:center;box-shadow:0 10px 30px rgba(15,23,42,0.06);">
          <div style="width:56px;height:56px;margin:0 auto 20px;border-radius:50%;background:#FEF2F2;color:#DC2626;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;">404</div>
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0F172A;">Тази страница не съществува</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">
            Линкът, който сте отворили, не е валиден или не съществува.<br>
            Може би сте имали предвид:<br>
            <a href="https://dogovor-irispay.vercel.app/" style="color:#1E40AF;font-weight:600;text-decoration:underline;word-break:break-all;">https://dogovor-irispay.vercel.app/</a>
          </p>
          <a href="https://dogovor-irispay.vercel.app/" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#1E3A8A,#2563EB);color:#FFFFFF;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">
            Към https://dogovor-irispay.vercel.app/
          </a>
        </div>
      </div>
    `;
  }

  try {
    const cleanPath = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (cleanPath !== 'partner' && cleanPath !== 'partner/index.html') {
      showNotFoundPage();
      return;
    }

    const pToken = new URLSearchParams(window.location.search).get('p');
    if (pToken) {
      activePartnerToken = pToken.trim();
      fetch(`/api/custom-link?partnerToken=${encodeURIComponent(activePartnerToken)}`)
        .then(async r => {
          if (r.ok) {
            const d = await r.json();
            if (d && d.valid && d.partnerTerms) {
              applyPartnerTermsToAnnex(d.partnerTerms);
            }
          } else {
            showNotFoundPage();
          }
        }).catch(() => {});
    }
  } catch (e) {}

  // =========================================================================
  // 1. Live Field Synchronization
  // =========================================================================
  const liveSyncMap = {
    companyName: { input: companyNameInput, placeholder: '........................................................................' },
    companyEik: { input: companyEikInput, placeholder: '........................' },
    companyAddress: { input: companyAddressInput, placeholder: '........................................................................' },
    companyRepresentative: { input: companyRepresentativeInput, placeholder: '..................................................' },
    contactAddress: { input: contactAddressInput, placeholder: '......................................................................................' },
    contactEmail: { input: contactEmailInput, placeholder: '......................................................................' },
    contactPhone: { input: contactPhoneInput, placeholder: '........................................................' }
  };

  function updateFieldInDoc(fieldName, val, placeholder) {
    const targets = document.querySelectorAll(`.live-field[data-field="${fieldName}"]`);
    const cleanVal = (val || '').trim();
    targets.forEach(el => {
      const oldVal = el.textContent;
      if (cleanVal) {
        if (oldVal !== cleanVal) {
          el.textContent = cleanVal;
          el.classList.remove('text-animating');
          void el.offsetWidth;
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
    if (typeof autoFitPartnerMasks === 'function') {
      autoFitPartnerMasks();
    }
  }

  function autoFitPartnerMasks() {
    document.querySelectorAll('.pdf-flow-mask').forEach(mask => {
      const sizes = [10.8, 10.1, 9.4, 8.7, 8.0, 7.4, 6.8, 6.2];
      for (let i = 0; i < sizes.length; i++) {
        const sz = sizes[i];
        mask.style.fontSize = `calc(${sz} * var(--pt))`;
        mask.style.lineHeight = `calc(${(sz * 1.24).toFixed(2)} * var(--pt))`;
        if (mask.scrollHeight <= mask.clientHeight + 2 || i === sizes.length - 1) {
          break;
        }
      }
    });
  }

  function syncAllFields() {
    Object.keys(liveSyncMap).forEach(key => {
      const { input, placeholder } = liveSyncMap[key];
      if (input) updateFieldInDoc(key, input.value, placeholder);
    });
    updateFieldInDoc('date', todayDmy, todayDmy);
  }

  if (contactEmailInput && contactEmailError) {
    contactEmailInput.addEventListener('input', () => {
      const val = contactEmailInput.value.trim();
      if (!val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        contactEmailError.style.display = 'none';
      }
    });
    contactEmailInput.addEventListener('blur', () => {
      const val = contactEmailInput.value.trim();
      contactEmailError.style.display = (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) ? 'block' : 'none';
    });
  }

  Object.keys(liveSyncMap).forEach(key => {
    const { input, placeholder } = liveSyncMap[key];
    if (input) {
      input.addEventListener('input', () => {
        updateFieldInDoc(key, input.value, placeholder);
        if (key === 'companyRepresentative' && typedSigInput && !typedSigInput.dataset.userEdited) {
          typedSigInput.value = input.value.trim();
          updateTypedFontSamples(input.value.trim());
        }
      });
    }
  });

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
      updateFieldInDoc('date', contractDateInput.value.trim(), '..............2026');
    });
  }

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

  // =========================================================================
  // 2. Bulgarian Registry Lookup (EIK)
  // =========================================================================
  let eikTimer = null;

  async function lookupBgCompany(eikRaw) {
    const clean = (eikRaw || '').replace(/\D/g, '');
    if (clean.length < 9) return;
    if (eikFeedbackMsg) {
      eikFeedbackMsg.style.display = 'block';
      eikFeedbackMsg.textContent = '⟳ Търсене в Търговския регистър...';
    }
    try {
      const resp = await fetch(`/api/company?country=bg&eik=${encodeURIComponent(clean)}`);
      if (resp.ok) {
        const d = await resp.json();
        if (d && d.found && (d.name || d.address || d.rep)) {
          if (companyNameInput && d.name) {
            companyNameInput.value = d.name;
            updateFieldInDoc('companyName', d.name, liveSyncMap.companyName.placeholder);
          }
          if (companyAddressInput && d.address) {
            companyAddressInput.value = d.address;
            updateFieldInDoc('companyAddress', d.address, liveSyncMap.companyAddress.placeholder);
            if (sameAddressCheckbox && sameAddressCheckbox.checked && contactAddressInput) {
              contactAddressInput.value = d.address;
              updateFieldInDoc('contactAddress', d.address, liveSyncMap.contactAddress.placeholder);
            }
          }
          if (companyRepresentativeInput && d.rep) {
            companyRepresentativeInput.value = d.rep;
            updateFieldInDoc('companyRepresentative', d.rep, liveSyncMap.companyRepresentative.placeholder);
            if (typedSigInput && !typedSigInput.dataset.userEdited) {
              typedSigInput.value = d.rep;
              updateTypedFontSamples(d.rep);
            }
          }
          if (eikFeedbackMsg) eikFeedbackMsg.style.display = 'none';
          if (companyVerifyBanner) companyVerifyBanner.style.display = 'flex';
          showToast('Данните на фирмата бяха заредени успешно!', 'success');
          return;
        }
      }
    } catch (e) {}

    if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
    if (eikFeedbackMsg) {
      eikFeedbackMsg.style.display = 'block';
      eikFeedbackMsg.textContent = 'Фирмата не е намерена автоматично. Можете да въведете данните ръчно.';
    }
  }

  if (companyEikInput) {
    companyEikInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      updateFieldInDoc('companyEik', val, liveSyncMap.companyEik.placeholder);
      clearTimeout(eikTimer);
      const clean = val.replace(/\D/g, '');
      if (clean.length === 9 || clean.length === 13) {
        eikTimer = setTimeout(() => lookupBgCompany(clean), 350);
      } else {
        if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
      }
    });
  }

  if (btnVerifyDataYes) {
    btnVerifyDataYes.addEventListener('click', () => {
      if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
      if (companyInputsWrapper) companyInputsWrapper.classList.add('is-verified');
      showToast('Данните са потвърдени.', 'success');
    });
  }

  if (btnVerifyDataNo) {
    btnVerifyDataNo.addEventListener('click', () => {
      if (companyVerifyBanner) companyVerifyBanner.style.display = 'none';
      if (companyInputsWrapper) companyInputsWrapper.classList.remove('is-verified');
      if (companyNameInput) companyNameInput.focus();
    });
  }

  // =========================================================================
  // 3. Electronic Signature (Draw / Type / Upload)
  // =========================================================================
  const sigTabs = document.querySelectorAll('.sig-tab-btn');
  const sigContents = document.querySelectorAll('.sig-tab-content');
  let currentSigMode = 'draw';
  let hasDrawn = false;
  let isSigned = false;

  const canvas = document.getElementById('sigCanvas');
  const canvasHint = document.getElementById('canvasWatermark');
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

  sigTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      sigTabs.forEach(b => b.classList.remove('active'));
      sigContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      currentSigMode = btn.dataset.mode;
      const target = document.getElementById(
        currentSigMode === 'draw' ? 'sigContentDraw' :
        currentSigMode === 'type' ? 'sigContentType' : 'sigContentUpload'
      );
      if (target) target.classList.add('active');
      if (currentSigMode === 'type') {
        const repVal = (companyRepresentativeInput?.value || '').trim();
        if (typedSigInput && !typedSigInput.value.trim() && repVal) typedSigInput.value = repVal;
        updateTypedFontSamples(typedSigInput ? typedSigInput.value : repVal);
      }
    });
  });

  if (canvas) {
    ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    canvas.style.touchAction = 'none';

    const getCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      if (e.touches && e.touches[0]) {
        return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
      }
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    };

    const startDraw = (e) => {
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
    };

    const draw = (e) => {
      if (!isDrawing) return;
      if (e.cancelable) e.preventDefault();
      hasDrawn = true;
      const c = getCoords(e);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
    };

    const stopDraw = () => { isDrawing = false; };

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

  function updateTypedFontSamples(text) {
    const val = text || (companyRepresentativeInput?.value || '').trim() || 'Иван Иванов';
    document.querySelectorAll('.font-sample').forEach(s => { s.textContent = val; });
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

  if (sigFileInput) {
    sigFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          uploadedImgDataUrl = ev.target.result;
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
      return `<div class="placed-merchant-sig drawn"><img src="${canvas.toDataURL('image/png')}" alt="Подпис" style="max-height:44px; max-width:100%; display:block;"></div>`;
    } else if (currentSigMode === 'type') {
      const repVal = (companyRepresentativeInput?.value || '').trim();
      const sigText = (typedSigInput && typedSigInput.value.trim()) || repVal;
      if (!sigText || sigText.length < 2) return null;
      let fontClass = 'style-script';
      if (selectedFontFamily === 'Great Vibes') fontClass = 'style-vibes';
      if (selectedFontFamily === 'Playfair Display') fontClass = 'style-serif';
      return `<div class="placed-merchant-sig typed"><div class="font-sample ${fontClass}" style="font-size:24px; line-height:1.2; color:#000000; font-style:italic;">${escapeHtml(sigText)}</div></div>`;
    } else if (currentSigMode === 'upload' && uploadedImgDataUrl) {
      return `<div class="placed-merchant-sig drawn"><img src="${uploadedImgDataUrl}" alt="Подпис" style="max-height:44px; max-width:100%; display:block;"></div>`;
    }
    return null;
  }

  function applySignature() {
    let sigHtml = getSignatureHtml();
    if (!sigHtml && currentSigMode === 'type') {
      const repVal = (companyRepresentativeInput?.value || '').trim();
      if (repVal) {
        if (typedSigInput) typedSigInput.value = repVal;
        updateTypedFontSamples(repVal);
        sigHtml = getSignatureHtml();
      }
    }
    if (!sigHtml) {
      showToast('Моля, нарисувайте или въведете своя подпис.', 'error');
      return;
    }

    ['partnerContractSigSlot', 'partnerAppendixSigSlot'].forEach(id => {
      const slot = document.getElementById(id);
      if (slot) {
        slot.innerHTML = sigHtml;
        slot.style.border = 'none';
        slot.style.background = 'transparent';
      }
    });

    isSigned = true;
    ['badgeContract', 'badgeAppendix'].forEach(id => {
      const b = document.getElementById(id);
      if (b) { b.textContent = 'Подписано'; b.className = 'status-badge signed'; }
    });
    ['statusBoxContract', 'statusBoxAppendix'].forEach(id => {
      const box = document.getElementById(id);
      const ic = box?.querySelector('.status-icon');
      if (ic) { ic.textContent = '✓'; ic.className = 'status-icon signed'; ic.style.color = '#059669'; }
    });
    showToast('Подписът е положен върху споразумението и Приложение 1!', 'success');
  }

  function resetSignatures() {
    isSigned = false;
    ['partnerContractSigSlot', 'partnerAppendixSigSlot'].forEach(id => {
      const slot = document.getElementById(id);
      if (slot) { slot.innerHTML = ''; slot.style.border = '1px dashed #cbd5e1'; }
    });
    ['badgeContract', 'badgeAppendix'].forEach(id => {
      const b = document.getElementById(id);
      if (b) { b.textContent = 'Неподписано'; b.className = 'status-badge'; }
    });
    ['statusBoxContract', 'statusBoxAppendix'].forEach(id => {
      const box = document.getElementById(id);
      const ic = box?.querySelector('.status-icon');
      if (ic) { ic.textContent = '●'; ic.className = 'status-icon pending'; ic.style.color = '#F59E0B'; }
    });
  }

  if (applySignatureBtn) applySignatureBtn.addEventListener('click', applySignature);

  document.querySelectorAll('.sig-slot-box').forEach(slot => {
    slot.style.cursor = 'pointer';
    slot.title = 'Кликнете, за да положите подпис';
    slot.addEventListener('click', () => {
      const repVal = (companyRepresentativeInput?.value || '').trim();
      if (hasDrawn || (typedSigInput && typedSigInput.value.trim()) || repVal || uploadedImgDataUrl) {
        applySignature();
      } else {
        const sigCard = document.getElementById('signatureSectionCard');
        if (sigCard) sigCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('Моля, първо нарисувайте или въведете подпис.', 'info');
      }
    });
  });

  // =========================================================================
  // 4. Helpers & Zoom
  // =========================================================================
  function escapeHtml(str) {
    return (str || '').replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }

  function showToast(msg, type = 'success') {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = (type === 'error') ? '#DC2626' : (type === 'info' ? '#0369A1' : '#1F3864');
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3400);
  }

  let currentZoom = 110;
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomLevelDisplay = document.getElementById('zoomLevelDisplay');
  const mainDocContainer = document.getElementById('mainDocContainer');

  if (mainDocContainer) {
    mainDocContainer.style.transform = `scale(${currentZoom / 100})`;
    mainDocContainer.style.transformOrigin = 'top center';
  }
  if (zoomLevelDisplay) {
    zoomLevelDisplay.textContent = `${currentZoom}%`;
  }

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
  // 5. Submit Form -> /api/send-contract (Partner PDF)
  // =========================================================================
  if (submitContractBtn) {
    submitContractBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const compEik = (companyEikInput?.value || '').trim();
      const compName = (companyNameInput?.value || '').trim();
      const compAddress = (companyAddressInput?.value || '').trim();
      const compRep = (companyRepresentativeInput?.value || '').trim();
      const contactAddrVal = (contactAddressInput?.value || compAddress || '').trim();
      const emailVal = (contactEmailInput?.value || '').trim();
      const phoneVal = (contactPhoneInput?.value || '').trim();
      const cDate = todayDmy;

      if (!compEik || !compName || !compAddress || !compRep || !contactAddrVal || !emailVal || !phoneVal) {
        showToast('Моля, попълнете всички задължителни полета (*).', 'error');
        const firstEmpty = [companyEikInput, companyNameInput, companyAddressInput, companyRepresentativeInput, contactAddressInput, contactEmailInput, contactPhoneInput].find(el => el && !el.value.trim());
        if (firstEmpty) {
          firstEmpty.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstEmpty.focus();
        }
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        showToast('Моля, въведете валиден имейл адрес.', 'error');
        if (contactEmailError) contactEmailError.style.display = 'block';
        if (contactEmailInput) contactEmailInput.focus();
        return;
      }
      if (contactEmailError) contactEmailError.style.display = 'none';

      if (!isSigned) {
        applySignature();
        if (!isSigned) {
          showToast('Моля, положете подпис върху споразумението и Приложение 1.', 'error');
          const sigCard = document.getElementById('signatureSectionCard');
          if (sigCard) sigCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }

      const confirmData = document.getElementById('confirmDataCheckbox');
      if (!confirmData || !confirmData.checked) {
        showToast('Моля, потвърдете верността на данните и представителната си власт.', 'error');
        if (confirmData) {
          confirmData.scrollIntoView({ behavior: 'smooth', block: 'center' });
          confirmData.focus();
        }
        return;
      }

      let sigBase64 = null;
      try {
        if (currentSigMode === 'draw' && hasDrawn && canvas) {
          sigBase64 = canvas.toDataURL('image/png');
        } else if (currentSigMode === 'upload' && uploadedImgDataUrl) {
          sigBase64 = uploadedImgDataUrl;
        } else {
          const sigText = (typedSigInput && typedSigInput.value.trim()) || compRep || 'Изпълнител';
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
      } catch (err) {}

      const payload = {
        country: 'partner',
        contractType: 'partner',
        targetEmail: 'sales@irisbgsf.com',
        companyName: compName,
        companyEik: compEik,
        companyAddress: compAddress,
        companyRepresentative: compRep,
        contactAddress: contactAddrVal,
        contactEmail: emailVal,
        contactPhone: phoneVal,
        contractDate: cDate,
        signatureImageBase64: sigBase64,
        partnerToken: activePartnerToken,
        partnerTerms: activePartnerTerms
      };

      if (loadingOverlay) loadingOverlay.style.display = 'flex';
      submitContractBtn.disabled = true;

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
          if (successModalOverlay) successModalOverlay.style.display = 'flex';
          showToast('Споразумението за партньорство е изпратено успешно!', 'success');

          const autoReloadTimer = setTimeout(() => window.location.reload(), 5000);
          if (modalCloseBtn) {
            modalCloseBtn.onclick = () => { clearTimeout(autoReloadTimer); window.location.reload(); };
          }
          if (successModalOverlay) {
            successModalOverlay.onclick = (ev) => {
              if (ev.target === successModalOverlay) { clearTimeout(autoReloadTimer); window.location.reload(); }
            };
          }
        } else {
          showToast(resData.error || 'Възникна грешка при изпращането.', 'error');
        }
      } catch (err) {
        showToast('Грешка при свързване със сървъра.', 'error');
      } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        submitContractBtn.disabled = false;
      }
    });
  }

  function buildPartnerPdfOverlayHtml(pageNum) {
    if (pageNum === 1) {
      return `
        <div class="pdf-mask" style="left:calc(96.5 * var(--pt));top:calc(99.8 * var(--pt));width:calc(64 * var(--pt));height:calc(13 * var(--pt));text-align:center;">
          <span class="live-field underlined" data-field="date">..............2026</span>
        </div>
        <div class="pdf-mask pdf-flow-mask" style="left:calc(70.5 * var(--pt));top:calc(230 * var(--pt));width:calc(457 * var(--pt));height:calc(126 * var(--pt));line-height:calc(13.4 * var(--pt));text-align:justify;">
          <div>2. <span class="live-field underlined" data-field="companyName">........................................................................</span>, регистрирано в ТРРЮЛНЦ към Агенцията по вписвания с ЕИК <span class="live-field underlined" data-field="companyEik">........................</span>, представлявано от <span class="live-field underlined" data-field="companyRepresentative">..................................................</span>, с търговски адрес <span class="live-field underlined" data-field="companyAddress">........................................................................</span>, наричан по-долу за краткост ИЗПЪЛНИТЕЛ.</div>
        </div>
      `;
    }
    if (pageNum === 7) {
      return `
        <div class="pdf-mask pdf-flow-mask" style="left:calc(70.5 * var(--pt));top:calc(218 * var(--pt));width:calc(457 * var(--pt));height:calc(74 * var(--pt));line-height:calc(13.4 * var(--pt));">
          <div style="margin-bottom:calc(2 * var(--pt));">Адрес: <span class="live-field underlined" data-field="contactAddress">........................................................................</span></div>
          <div style="margin-bottom:calc(2 * var(--pt));">E-mail: <span class="live-field underlined" data-field="contactEmail">......................................................................</span></div>
          <div>Телефон: <span class="live-field underlined" data-field="contactPhone">........................................................</span></div>
        </div>
        <div class="sig-slot-box" id="partnerContractSigSlot" style="left:calc(352 * var(--pt));top:calc(674 * var(--pt));width:calc(185 * var(--pt));height:calc(50 * var(--pt));"></div>
      `;
    }
    return '';
  }

  async function initPartnerPdfPreview() {
    const host = document.getElementById('partnerPdfPagesHost');
    if (!host) return;

    try {
      const pdfjsLib = await import('/assets/pdfjs/pdf.min.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.mjs';

      const pdfDoc = await pdfjsLib.getDocument('/assets/partner_contract_template.pdf?v=20261112_2').promise;
      const contractPageCount = Math.min(7, pdfDoc.numPages);
      const totalPages = contractPageCount + 1; // +1 for Page 8 (Приложение 1)

      host.innerHTML = '';
      const ptTrackedSheets = [];
      const renderScale = Math.min(Math.max(window.devicePixelRatio || 1.5, 1.5), 2.2) * 1.35;

      for (let pageNum = 1; pageNum <= contractPageCount; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const baseVp = page.getViewport({ scale: 1 });
        const W = baseVp.width;
        const H = baseVp.height;

        const card = document.createElement('div');
        card.className = 'doc-page-card';
        card.id = `pageCard${pageNum}`;

        const topTab = document.createElement('div');
        topTab.className = 'page-top-tab';
        const suffix = pageNum === contractPageCount ? 'КОРЕСПОНДЕНЦИЯ И ПОДПИСИ' : 'СПОРАЗУМЕНИЕ';
        topTab.innerHTML = `<span class="page-tab-badge">СТРАНИЦА ${pageNum} ОТ ${totalPages} • ${suffix}</span>`;

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

        const overlayHtml = buildPartnerPdfOverlayHtml(pageNum);
        if (overlayHtml) {
          const overlay = document.createElement('div');
          overlay.className = 'pdf-overlay-layer';
          overlay.innerHTML = overlayHtml;
          sheet.appendChild(overlay);
          ptTrackedSheets.push(sheet);
        }

        card.appendChild(topTab);
        card.appendChild(sheet);
        host.appendChild(card);

        const renderCtx = canvas.getContext('2d', { alpha: false });
        await page.render({ canvasContext: renderCtx, viewport: hiVp }).promise;
      }

      const updatePtVars = () => {
        ptTrackedSheets.forEach(sheet => {
          const wPt = parseFloat(sheet.dataset.pageWidthPt || '595.32');
          const overlay = sheet.querySelector('.pdf-overlay-layer');
          if (overlay && sheet.clientWidth > 0) {
            overlay.style.setProperty('--pt', `${sheet.clientWidth / wPt}px`);
          }
        });
        autoFitPartnerMasks();
      };

      updatePtVars();
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(updatePtVars);
        ro.observe(host);
      }
      window.addEventListener('resize', updatePtVars);

      const contractSlot = document.getElementById('partnerContractSigSlot');
      if (contractSlot) {
        contractSlot.addEventListener('click', () => {
          const sigCard = document.getElementById('signatureSectionCard');
          if (sigCard) sigCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }

      syncAllFields();
      if (isSigned) {
        applySignature();
      }
    } catch (err) {
      console.error('[Partner PDF Preview Error]:', err);
      host.innerHTML = `<div class="pdf-loading-state" style="color:#dc2626;">Грешка при зареждане на документа: ${err.message}</div>`;
    }
  }

  syncAllFields();
  initPartnerPdfPreview();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPartnerPortal);
} else {
  initPartnerPortal();
}
