/**
 * Vercel Serverless Function: Contract Submission, Dashboard Approval & Email Dispatch
 * Endpoint: /api/send-contract
 *
 * Flows:
 * - Bulgarian contracts (/, /:slug, /c/:token, /partner):
 *   1. Client submission stores full contract data + signature in pendingContracts (appears on BG /dashboard).
 *   2. Dashboard reviewer clicks "Подпиши" -> inspects all details -> clicks "Информацията е вярна".
 *   3. Server counter-signs PDF with IRIS provider signature and emails final PDF once.
 *      (Demo recipient set to kaloyan.tosev@gmail.com)
 * - Romanian contracts (/ro): retain direct submission & email dispatch.
 */

import fs from 'fs';
import path from 'path';
import { generateContractPdf, generateContractRoPdf, generateContractPartnerPdf } from './pdfGenerator.js';
import { verifySession } from './auth.js';
import {
  recordContractAttribution,
  recordPendingPartner,
  recordPendingContract,
  getPendingContractById,
  updatePendingContractEmailMeta,
  deletePendingContract,
  getPendingPartnerById,
  getContractById,
  findAffiliateBySlug,
  getCustomLink,
  useCustomLink,
  getPartnerLink,
  getSettings,
  getProviderSignatureState,
  saveProviderSignature
} from './store.js';

const APPROVED_CONTRACT_RECIPIENT_EMAIL = 'sales@irisbgsf.com';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb'
    }
  }
};

function formatBulgarianDate(dStr) {
  if (!dStr || dStr === '—') {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${d}.${m}.${y} г.`;
  }
  const isoMatch = String(dStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y} г.`;
  }
  const dmyMatch = String(dStr).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y} г.`;
  }
  return String(dStr);
}

function resolveAssetsDir() {
  const candidates = [
    path.join(process.cwd(), 'assets'),
    path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')), '..', 'assets'),
    path.join(process.cwd(), 'scratch', 'IRIS подпис на документи', 'assets')
  ];
  return candidates.find(d => fs.existsSync(path.join(d, 'contract_template.pdf'))) || path.join(process.cwd(), 'assets');
}

async function resolveSalesRecipientEmail(isPartner = false) {
  let targetEmail = APPROVED_CONTRACT_RECIPIENT_EMAIL;
  if (!isPartner) {
    try {
      const settings = await getSettings();
      const candidate = settings?.contractRecipientEmail || process.env.CONTRACT_RECIPIENT_EMAIL || APPROVED_CONTRACT_RECIPIENT_EMAIL;
      if (candidate && !String(candidate).toLowerCase().includes('kaloyan.tosev')) {
        targetEmail = candidate;
      }
    } catch (e) {}
  }
  return targetEmail;
}

function resolveDashboardUrl(req) {
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  if (host && !host.includes('localhost')) {
    return `${proto}://${host}/dashboard`;
  }
  return 'https://dogovor-irispay.vercel.app/dashboard';
}

async function fetchResendMessageId(apiKey, emailId) {
  if (!apiKey || !emailId) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 300));
    }
    try {
      const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (res.ok) {
        const info = await res.json();
        const rawId = info?.message_id || info?.messageId || null;
        if (rawId) {
          const s = String(rawId).trim();
          return s.startsWith('<') ? s : `<${s}>`;
        }
      }
    } catch (_) {}
  }
  return null;
}

async function sendViaResend({ targetEmail, contactEmail, subject, text, html, attachments = [], headers = null }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[Email Notification Prepared] -> To: ${targetEmail} | Subject: ${subject}`);
    return {
      success: true,
      provider: 'ready_for_production',
      targetEmail,
      subject,
      hasAttachment: attachments.length > 0,
      messageId: null
    };
  }

  const defaultFrom = (targetEmail && String(targetEmail).includes('@irisbgsf.com'))
    ? 'IRIS Pay <sales@irisbgsf.com>'
    : 'IRIS Pay <onboarding@resend.dev>';
  const fromAddress = process.env.EMAIL_FROM || defaultFrom;
  const resendPayload = {
    from: fromAddress,
    to: [targetEmail],
    reply_to: (contactEmail && contactEmail !== '—') ? contactEmail : undefined,
    subject,
    text,
    html
  };
  if (attachments.length > 0) {
    resendPayload.attachments = attachments;
  }
  if (headers && Object.keys(headers).length > 0) {
    resendPayload.headers = headers;
  }

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(resendPayload)
  });

  console.log('Resend HTTP status:', resendRes.status, resendRes.statusText);
  if (resendRes.ok) {
    const resendData = await resendRes.json();
    return {
      success: true,
      provider: 'resend',
      id: resendData.id,
      targetEmail,
      subject,
      hasAttachment: attachments.length > 0,
      apiKey
    };
  }

  const errData = await resendRes.json();
  console.warn('Resend response status:', resendRes.status, errData);
  return {
    success: false,
    provider: 'resend',
    targetEmail,
    error: errData.message || 'Resend error',
    notice: 'За изпращане до sales@irisbgsf.com е необходимо домейнът irisbgsf.com да бъде верифициран в Resend.'
  };
}

async function sendPendingContractAlertEmail({
  targetEmail,
  dashboardUrl,
  contractKind,
  companyName = '—',
  companyEik = '—',
  companyRepresentative = '—',
  contactEmail = '—',
  contactPhone = '—',
  displayDate = '',
  partnerDisplayName = null,
  customCommission = null
}) {
  const cleanCompName = (companyName && companyName !== '—')
    ? String(companyName).replace(/["'„“«»]/g, '').trim()
    : 'Търговец';
  const commSubjectPart = customCommission ? ` - Индивидуална комисионна: ${customCommission}` : '';
  const isPartner = contractKind === 'partner';
  const isFromPartner = contractKind === 'from_partner';

  const kindLabel = isPartner
    ? 'Партньорски договор (/partner)'
    : isFromPartner
      ? 'Договор с търговец (през партньор)'
      : 'Договор с търговец (Без партньор / Директен)';

  const subject = isPartner
    ? `Нов подписан партньорски договор (${cleanCompName} - ЕИК ${companyEik || '—'})`
    : isFromPartner
      ? `Нов подписан договор (${cleanCompName}) от Партньор "${partnerDisplayName || 'Партньор'}"${commSubjectPart}`
      : `Нов подписан договор (${cleanCompName}) — Без партньор${commSubjectPart}`;

  const textBody = `
Ново известие за подписан договор (очаква преглед и подпис от IRIS Pay):
Вид договор: ${kindLabel}
${partnerDisplayName ? `От партньор: ${partnerDisplayName}\n` : ''}Фирма: ${companyName}
ЕИК: ${companyEik}
Представляващ: ${companyRepresentative}
Имейл за контакт: ${contactEmail}
Телефон: ${contactPhone}
Дата: ${displayDate}${customCommission ? `\nИндивидуална комисионна: ${customCommission}` : ''}

Прегледайте и подпишете договора директно в Dashboard:
${dashboardUrl}
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 24px; }
    .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 10px rgba(15,23,42,0.06); }
    .header { background: #1F3864; color: #ffffff; padding: 20px 24px; }
    .badge { display: inline-block; background: #F59E0B; color: #0f172a; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px; }
    .header h1 { margin: 0; font-size: 17px; font-weight: 700; color: #ffffff; line-height: 1.35; }
    .content { padding: 24px; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .info-table td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .info-table tr:last-child td { border-bottom: none; }
    .info-table td.label { font-weight: 600; color: #64748b; width: 42%; }
    .info-table td.val { font-weight: 600; color: #0f172a; }
    .cta-wrap { text-align: center; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 18px; }
    .cta-btn { display: inline-block; background: #059669; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14.5px; padding: 12px 24px; border-radius: 8px; }
    .cta-link { display: block; margin-top: 10px; font-size: 12.5px; color: #2563eb; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="badge">Очаква подпис от IRIS Pay</div>
      <h1>${subject}</h1>
    </div>
    <div class="content">
      <table class="info-table">
        <tr>
          <td class="label">Вид договор:</td>
          <td class="val" style="color:#1F3864;">${kindLabel}</td>
        </tr>
        ${partnerDisplayName ? `
        <tr>
          <td class="label">От партньор:</td>
          <td class="val" style="color:#0D9488;font-weight:700;">${partnerDisplayName}</td>
        </tr>
        ` : ''}
        <tr>
          <td class="label">Фирма:</td>
          <td class="val">${companyName}</td>
        </tr>
        <tr>
          <td class="label">ЕИК:</td>
          <td class="val">${companyEik}</td>
        </tr>
        <tr>
          <td class="label">Представляващ:</td>
          <td class="val">${companyRepresentative}</td>
        </tr>
        <tr>
          <td class="label">Имейл за контакт:</td>
          <td class="val"><a href="mailto:${contactEmail}" style="color:#2563eb;text-decoration:none;">${contactEmail}</a></td>
        </tr>
        <tr>
          <td class="label">Телефон:</td>
          <td class="val"><a href="tel:${contactPhone}" style="color:#2563eb;text-decoration:none;">${contactPhone}</a></td>
        </tr>
        <tr>
          <td class="label">Дата:</td>
          <td class="val">${displayDate}</td>
        </tr>
        ${customCommission ? `
        <tr>
          <td class="label">Индивидуална комисионна:</td>
          <td class="val" style="color:#D97706;font-weight:700;">${customCommission}</td>
        </tr>
        ` : ''}
      </table>

      <div class="cta-wrap">
        <a href="${dashboardUrl}" class="cta-btn">Отвори Dashboard за преглед и подписване →</a>
        <a href="${dashboardUrl}" class="cta-link">${dashboardUrl}</a>
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

  const sendRes = await sendViaResend({
    targetEmail,
    contactEmail,
    subject,
    text: textBody,
    html: htmlBody
  });

  let messageId = null;
  if (sendRes.success && sendRes.id && sendRes.apiKey) {
    messageId = await fetchResendMessageId(sendRes.apiKey, sendRes.id);
  }

  return {
    ...sendRes,
    subject,
    messageId
  };
}

function buildContractPdfFilename({ isRo = false, isPartner = false, companyName = '—' }) {
  const safeCompName = (companyName && companyName !== '—')
    ? String(companyName).replace(/["'„“«»<>:\/\\|?*]/g, '').trim()
    : (isRo ? 'Comerciant' : 'Търговец');
  if (isPartner) return `Dogovor_Partniorstvo_${safeCompName}.pdf`;
  if (isRo) return `Contract_IRISPay_RO_${safeCompName}.pdf`;
  return `Договор (${safeCompName}).pdf`;
}

async function buildContractPdfBytes({
  isRo = false,
  isPartner = false,
  companyName = '—',
  companyEik = '—',
  companyAddress = '',
  companyRepresentative = '—',
  companyRepresentativePin = '',
  bankName = '',
  bankIban = '',
  website = '',
  contactAddress = '',
  contactEmail = '—',
  contactPhone = '—',
  displayDate = '',
  signatureImageBase64 = null,
  includeProviderSignature = false,
  providerSignatureBase64 = null,
  customCommission = null,
  partnerTerms = null
}) {
  const assetsDir = resolveAssetsDir();
  const pdfParams = {
    companyName: (companyName && companyName !== '—') ? companyName : '',
    companyEik: (companyEik && companyEik !== '—') ? companyEik : '',
    companyAddress: companyAddress || '',
    companyRepresentative: (companyRepresentative && companyRepresentative !== '—') ? companyRepresentative : '',
    companyRepresentativePin: companyRepresentativePin || '',
    bankName: bankName || '',
    bankIban: bankIban || '',
    website: website || '',
    contactAddress: contactAddress || companyAddress || '',
    contactEmail: (contactEmail && contactEmail !== '—') ? contactEmail : '',
    contactPhone: (contactPhone && contactPhone !== '—') ? contactPhone : '',
    contractDate: displayDate,
    signatureImageBase64,
    providerSignatureBase64,
    includeProviderSignature,
    customCommission,
    partnerTerms
  };

  return isPartner
    ? await generateContractPartnerPdf(pdfParams, assetsDir)
    : isRo
      ? await generateContractRoPdf(pdfParams, assetsDir)
      : await generateContractPdf(pdfParams, assetsDir);
}

async function generateAndSendContractEmail({
  isRo = false,
  isPartner = false,
  targetEmail,
  companyName = '—',
  companyEik = '—',
  companyAddress = '',
  companyRepresentative = '—',
  companyRepresentativePin = '',
  bankName = '',
  bankIban = '',
  website = '',
  contactAddress = '',
  contactEmail = '—',
  contactPhone = '—',
  displayDate = '',
  signatureImageBase64 = null,
  includeProviderSignature = false,
  providerSignatureBase64 = null,
  customCommission = null,
  partnerTerms = null,
  partnerDisplayName = null,
  fallbackPdfBase64 = null,
  subjectOverride = null,
  replyToMessageId = null
}) {
  const cleanCompName = (companyName && companyName !== '—')
    ? String(companyName).replace(/["'„“«»]/g, '').trim()
    : (isRo ? 'Comerciant' : 'Търговец');
  const commSubjectPart = customCommission ? ` - Индивидуална комисионна: ${customCommission}` : '';
  const defaultSubject = isPartner
    ? `Договор за партньорство (${cleanCompName} - ЕИК ${companyEik || '—'})`
    : isRo
      ? (partnerDisplayName
          ? `Румъния - Подписан договор (${cleanCompName}) от Партньор "${partnerDisplayName}"${commSubjectPart}`
          : `Румъния - Подписан договор (${cleanCompName})${commSubjectPart}`)
      : (partnerDisplayName
          ? `Подписан договор (${cleanCompName}) от Партньор "${partnerDisplayName}"${commSubjectPart}`
          : `Подписан договор (${cleanCompName})${commSubjectPart}`);
  const emailSubject = subjectOverride || defaultSubject;

  const partnerTextLine = partnerDisplayName ? `\nОт партньор: ${partnerDisplayName}` : '';
  const customCommTextLine = customCommission ? `\nИндивидуална комисионна (Приложение 1): ${customCommission}` : '';
  const countryLine = isRo ? '\nПазар / Държава: Румъния (România)' : '';
  const textBody = `
${isRo ? 'CUI / ЕИК' : 'ЕИК'}: ${companyEik}
Фирма: ${companyName}
Представляващ: ${companyRepresentative}
Имейл за контакт: ${contactEmail}
Телефон: ${contactPhone}
Дата: ${displayDate}${countryLine}${partnerTextLine}${customCommTextLine}
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 24px; }
    .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #0f172a; color: #ffffff; padding: 18px 24px; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 700; color: #ffffff; }
    .content { padding: 24px; }
    .info-table { width: 100%; border-collapse: collapse; }
    .info-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .info-table tr:last-child td { border-bottom: none; }
    .info-table td.label { font-weight: 600; color: #64748b; width: 42%; }
    .info-table td.val { font-weight: 600; color: #0f172a; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${emailSubject}</h1>
    </div>
    <div class="content">
      <table class="info-table">
        <tr>
          <td class="label">ЕИК:</td>
          <td class="val">${companyEik}</td>
        </tr>
        <tr>
          <td class="label">Фирма:</td>
          <td class="val">${companyName}</td>
        </tr>
        <tr>
          <td class="label">Представляващ:</td>
          <td class="val">${companyRepresentative}</td>
        </tr>
        <tr>
          <td class="label">Имейл за контакт:</td>
          <td class="val"><a href="mailto:${contactEmail}" style="color:#2563eb;text-decoration:none;">${contactEmail}</a></td>
        </tr>
        <tr>
          <td class="label">Телефон:</td>
          <td class="val"><a href="tel:${contactPhone}" style="color:#2563eb;text-decoration:none;">${contactPhone}</a></td>
        </tr>
        <tr>
          <td class="label">Дата:</td>
          <td class="val">${displayDate}</td>
        </tr>
        ${isRo ? `
        <tr>
          <td class="label">Пазар / Държава:</td>
          <td class="val" style="color:#0D9488;font-weight:700;">Румъния (România)</td>
        </tr>
        ` : ''}
        ${partnerDisplayName ? `
        <tr>
          <td class="label">От партньор:</td>
          <td class="val" style="color:#1F3864;font-weight:700;">${partnerDisplayName}</td>
        </tr>
        ` : ''}
        ${customCommission ? `
        <tr>
          <td class="label">Индивидуална комисионна:</td>
          <td class="val" style="color:#D97706;font-weight:700;">${customCommission} (Приложение № 1)</td>
        </tr>
        ` : ''}
      </table>
    </div>
  </div>
</body>
</html>
`.trim();

  // Generate pristine vector PDF
  let finalPdfBase64 = null;
  try {
    const generatedBytes = await buildContractPdfBytes({
      isRo,
      isPartner,
      companyName,
      companyEik,
      companyAddress,
      companyRepresentative,
      companyRepresentativePin,
      bankName,
      bankIban,
      website,
      contactAddress,
      contactEmail,
      contactPhone,
      displayDate,
      signatureImageBase64,
      providerSignatureBase64,
      includeProviderSignature,
      customCommission,
      partnerTerms
    });

    if (generatedBytes && generatedBytes.length > 0) {
      finalPdfBase64 = Buffer.from(generatedBytes).toString('base64');
      console.log(`[Vector PDF] Generated ${isPartner ? 'Partner' : (isRo ? 'Romanian' : 'Bulgarian')} vector PDF (providerSigned=${includeProviderSignature}). Size:`, generatedBytes.length);
    }
  } catch (genErr) {
    console.warn('[Vector PDF] Generation error, checking fallback:', genErr);
  }

  if (!finalPdfBase64 && fallbackPdfBase64) {
    let rawBase64 = String(fallbackPdfBase64).trim();
    const base64Marker = ';base64,';
    const markerIdx = rawBase64.indexOf(base64Marker);
    if (markerIdx !== -1) {
      rawBase64 = rawBase64.substring(markerIdx + base64Marker.length).trim();
    } else {
      rawBase64 = rawBase64.replace(/^data:[^;]*;base64,/, '').trim();
    }
    const pdfMagicIdx = rawBase64.indexOf('JVBERi');
    if (pdfMagicIdx !== -1 && pdfMagicIdx < 80) {
      rawBase64 = rawBase64.substring(pdfMagicIdx).trim();
    }
    rawBase64 = rawBase64.replace(/[\r\n\s"']+$/, '');
    if (rawBase64.length > 50) {
      finalPdfBase64 = rawBase64;
    }
  }

  const attachments = [];
  if (finalPdfBase64 && finalPdfBase64.length > 50) {
    const pdfFilename = buildContractPdfFilename({ isRo, isPartner, companyName });

    attachments.push({
      filename: pdfFilename,
      content: finalPdfBase64,
      contentType: 'application/pdf'
    });
  }

  let headers = null;
  if (replyToMessageId) {
    const cleanRef = String(replyToMessageId).trim();
    const normRef = cleanRef.startsWith('<') ? cleanRef : `<${cleanRef}>`;
    headers = {
      'In-Reply-To': normRef,
      'References': normRef
    };
  }

  const sendResult = await sendViaResend({
    targetEmail,
    contactEmail,
    subject: emailSubject,
    text: textBody,
    html: htmlBody,
    attachments,
    headers
  });

  if (sendResult.provider === 'ready_for_production') {
    return {
      ...sendResult,
      data: {
        companyEik,
        companyName,
        companyRepresentative,
        contactEmail,
        contactPhone,
        contractDate: displayDate
      },
      message: `Договорът е изпратен към ${targetEmail}.`
    };
  }

  return sendResult;
}

function renderPodpis404Html() {
  return `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 — Страницата не съществува</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: #f1f5f9; color: #0f172a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .box { max-width: 440px; width: 100%; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 36px 28px; text-align: center; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06); }
    .code { font-size: 48px; font-weight: 800; color: #cbd5e1; line-height: 1; margin-bottom: 12px; }
    h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    p { font-size: 14px; color: #64748b; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="box">
    <div class="code">404</div>
    <h1>Страницата не съществува</h1>
    <p>Този еднократен под-сайт вече не е активен или е бил използван.</p>
  </div>
</body>
</html>`;
}

function renderPodpisPageHtml() {
  return `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IRIS Pay | Официален подпис</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: #f1f5f9; color: #0f172a; min-height: 100vh; display: flex; flex-direction: column; }
    .portal-header { background: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 14px 24px; box-shadow: 0 1px 3px rgba(15,23,42,0.04); }
    .header-inner { max-width: 780px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .brand-group { display: flex; align-items: center; gap: 14px; }
    .brand-logo { height: 32px; width: auto; display: block; }
    .header-divider { width: 1px; height: 26px; background: #e2e8f0; }
    .header-title { font-size: 16px; font-weight: 700; color: #1F3864; }
    .header-subtitle { font-size: 12px; color: #64748b; }
    .once-badge { font-size: 11.5px; font-weight: 700; color: #0f766e; background: #f0fdfa; border: 1px solid #99f6e4; padding: 5px 11px; border-radius: 999px; white-space: nowrap; }
    main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 28px 16px; }
    .sign-card { max-width: 680px; width: 100%; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06); }
    .card-title { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
    .card-desc { font-size: 13.5px; color: #64748b; line-height: 1.55; margin-bottom: 20px; }
    .canvas-wrapper { position: relative; background: #ffffff; border: 2px dashed #cbd5e1; border-radius: 12px; overflow: hidden; height: 240px; transition: border-color 0.15s ease; }
    .canvas-wrapper:hover { border-color: #94a3b8; }
    .canvas-wrapper.shake-error { border-color: #ef4444; animation: shake 0.35s ease; }
    @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
    #providerSigCanvas { width: 100%; height: 100%; display: block; cursor: crosshair; touch-action: none; }
    .canvas-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; font-size: 14px; color: #94a3b8; font-weight: 500; text-align: center; padding: 16px; }
    .actions-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
    .btn-redraw { background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 22px; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.15s ease; }
    .btn-redraw:hover:not(:disabled) { background: #f1f5f9; border-color: #94a3b8; }
    .btn-send { flex: 1; min-width: 200px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; border: none; border-radius: 10px; padding: 13px 24px; font-size: 15px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25); transition: all 0.15s ease; }
    .btn-send:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37, 99, 235, 0.32); }
    .btn-send:disabled, .btn-redraw:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #ffffff; padding: 11px 20px; border-radius: 10px; font-size: 13.5px; font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.2); display: none; z-index: 9999; }
    .toast.error { background: #dc2626; }
    .toast.success { background: #059669; }
    .done-box { text-align: center; padding: 12px 4px; }
    .done-icon { width: 56px; height: 56px; border-radius: 50%; background: #ecfdf5; color: #059669; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; margin-bottom: 14px; border: 1px solid #a7f3d0; }
    .done-preview { margin: 18px auto 0; max-width: 280px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 12px; }
    .done-preview img { max-height: 70px; max-width: 100%; display: block; margin: 0 auto; }
  </style>
</head>
<body>
  <header class="portal-header">
    <div class="header-inner">
      <div class="brand-group">
        <img src="/assets/iris-logo.svg" alt="IRIS Pay" class="brand-logo">
        <div class="header-divider"></div>
        <div>
          <div class="header-title">Официален подпис — IRIS Pay</div>
          <div class="header-subtitle">За автоматично полагане върху договори</div>
        </div>
      </div>
      <span class="once-badge">Еднократен линк</span>
    </div>
  </header>

  <main>
    <div class="sign-card" id="signCard">
      <h1 class="card-title">Положете Вашия подпис</h1>
      <p class="card-desc">
        Начертайте подписа си в полето по-долу. След натискане на <strong>„Изпрати“</strong>, подписът се запазва в системата за всички договори и тази страница автоматично спира да съществува.
      </p>

      <div class="canvas-wrapper" id="canvasWrapper">
        <canvas id="providerSigCanvas" width="760" height="280"></canvas>
        <div class="canvas-hint" id="canvasHint">Начертайте Вашия подпис тук с мишка, тъчпад или пръст</div>
      </div>

      <div class="actions-row">
        <button type="button" class="btn-redraw" id="btnRedrawSig">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          Преправи
        </button>
        <button type="button" class="btn-send" id="btnSendProviderSig">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Изпрати
        </button>
      </div>
    </div>
  </main>

  <div class="toast" id="toastEl"></div>

  <script>
    (function () {
      const canvas = document.getElementById('providerSigCanvas');
      const wrapper = document.getElementById('canvasWrapper');
      const hint = document.getElementById('canvasHint');
      const btnRedraw = document.getElementById('btnRedrawSig');
      const btnSend = document.getElementById('btnSendProviderSig');
      const signCard = document.getElementById('signCard');
      const toastEl = document.getElementById('toastEl');
      const ctx = canvas.getContext('2d');

      let isDrawing = false;
      let hasDrawn = false;

      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000000';

      function showToast(msg, type) {
        toastEl.textContent = msg;
        toastEl.className = 'toast ' + (type || '');
        toastEl.style.display = 'block';
        setTimeout(() => { toastEl.style.display = 'none'; }, 3600);
      }

      function getCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const sx = canvas.width / rect.width;
        const sy = canvas.height / rect.height;
        const point = (e.touches && e.touches[0]) ? e.touches[0] : e;
        return {
          x: (point.clientX - rect.left) * sx,
          y: (point.clientY - rect.top) * sy
        };
      }

      function startDraw(e) {
        if (e.cancelable) e.preventDefault();
        isDrawing = true;
        hasDrawn = true;
        hint.style.display = 'none';
        const c = getCoords(e);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.arc(c.x, c.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
      }

      function moveDraw(e) {
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
      canvas.addEventListener('mousemove', moveDraw);
      window.addEventListener('mouseup', stopDraw);
      canvas.addEventListener('touchstart', startDraw, { passive: false });
      canvas.addEventListener('touchmove', moveDraw, { passive: false });
      window.addEventListener('touchend', stopDraw);

      btnRedraw.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasDrawn = false;
        hint.style.display = 'flex';
      });

      function exportTrimmedSignaturePng() {
        const w = canvas.width;
        const h = canvas.height;
        const imgData = ctx.getImageData(0, 0, w, h).data;
        let minX = w, minY = h, maxX = 0, maxY = 0;
        let found = false;

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const alpha = imgData[(y * w + x) * 4 + 3];
            if (alpha > 8) {
              found = true;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (!found) return null;

        const pad = 12;
        const sx = Math.max(0, minX - pad);
        const sy = Math.max(0, minY - pad);
        const sw = Math.min(w - sx, (maxX - minX + 1) + pad * 2);
        const sh = Math.min(h - sy, (maxY - minY + 1) + pad * 2);

        const out = document.createElement('canvas');
        out.width = sw;
        out.height = sh;
        const octx = out.getContext('2d');
        octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        return out.toDataURL('image/png');
      }

      btnSend.addEventListener('click', async () => {
        const trimmedPng = hasDrawn ? exportTrimmedSignaturePng() : null;
        if (!trimmedPng) {
          wrapper.classList.add('shake-error');
          setTimeout(() => wrapper.classList.remove('shake-error'), 400);
          showToast('Моля, начертайте подпис преди да изпратите.', 'error');
          return;
        }

        btnSend.disabled = true;
        btnRedraw.disabled = true;
        btnSend.textContent = 'Запазване...';

        try {
          const resp = await fetch('/api/send-contract?action=saveProviderSignature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'saveProviderSignature',
              signatureImageBase64: trimmedPng
            })
          });
          const resData = await resp.json();

          if (resp.ok && resData.success) {
            signCard.innerHTML =
              '<div class="done-box">' +
                '<div class="done-icon">✓</div>' +
                '<h1 class="card-title">Подписът е запазен успешно!</h1>' +
                '<p class="card-desc" style="margin-bottom:0;">Официалният подпис на IRIS Pay вече е запомнен в системата и ще се поставя автоматично върху одобрените договори. Този временен под-сайт вече не съществува.</p>' +
                '<div class="done-preview"><img src="' + trimmedPng + '" alt="Запазен подпис"></div>' +
              '</div>';
            showToast('Подписът е запазен!', 'success');
          } else {
            btnSend.disabled = false;
            btnRedraw.disabled = false;
            btnSend.textContent = 'Изпрати';
            showToast(resData.error || 'Грешка при запазване на подписа.', 'error');
          }
        } catch (err) {
          btnSend.disabled = false;
          btnRedraw.disabled = false;
          btnSend.textContent = 'Изпрати';
          showToast('Мрежова грешка при изпращане.', 'error');
        }
      });
    })();
  </script>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET requests (one-time /podpis page + authenticated signature retrieval)
  if (req.method === 'GET') {
    const action = req.query?.action;
    if (action === 'podpisPage') {
      const provState = await getProviderSignatureState();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      if (provState.locked) {
        return res.status(404).send(renderPodpis404Html());
      }
      return res.status(200).send(renderPodpisPageHtml());
    }

    if (action === 'getProviderSignature') {
      const session = verifySession(req);
      if (!session) {
        return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      }
      const provState = await getProviderSignatureState();
      return res.status(200).json({
        success: true,
        locked: provState.locked,
        createdAt: provState.createdAt,
        signatureImageBase64: provState.signatureImageBase64
      });
    }

    if (action === 'downloadContract') {
      const session = verifySession(req);
      if (!session) {
        return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      }

      const pendingId = req.query?.pendingId || null;
      const pendingPartnerId = req.query?.pendingPartnerId || null;
      const contractId = req.query?.contractId || null;

      let pdfSpec = null;

      if (pendingId) {
        const pending = await getPendingContractById(pendingId);
        if (!pending) {
          return res.status(404).json({ error: 'Договорът не е намерен.' });
        }
        const isPartner = pending.contractKind === 'partner';
        let resolvedPartnerTerms = pending.partnerTerms || null;
        if (isPartner && pending.partnerToken && !resolvedPartnerTerms) {
          try {
            const foundLink = await getPartnerLink(pending.partnerToken);
            if (foundLink) resolvedPartnerTerms = foundLink;
          } catch (_) {}
        }
        pdfSpec = {
          isRo: false,
          isPartner,
          companyName: pending.companyName,
          companyEik: pending.companyEik,
          companyAddress: pending.companyAddress,
          companyRepresentative: pending.companyRepresentative,
          bankName: pending.bankName,
          bankIban: pending.bankIban,
          website: pending.website,
          contactAddress: pending.contactAddress || pending.companyAddress,
          contactEmail: pending.contactEmail,
          contactPhone: pending.contactPhone,
          displayDate: formatBulgarianDate(pending.contractDate),
          signatureImageBase64: pending.signatureImageBase64 || null,
          includeProviderSignature: false,
          providerSignatureBase64: null,
          customCommission: pending.customCommission || null,
          partnerTerms: resolvedPartnerTerms
        };
      } else if (pendingPartnerId) {
        const pp = await getPendingPartnerById(pendingPartnerId);
        if (!pp) {
          return res.status(404).json({ error: 'Партньорският договор не е намерен.' });
        }
        const snap = pp.contractSnapshot || {};
        let resolvedPartnerTerms = snap.partnerTerms || null;
        if (pp.partnerToken && !resolvedPartnerTerms) {
          try {
            const foundLink = await getPartnerLink(pp.partnerToken);
            if (foundLink) resolvedPartnerTerms = foundLink;
          } catch (_) {}
        }
        const provState = await getProviderSignatureState();
        const savedProviderSig = (provState?.locked && provState?.signatureImageBase64)
          ? provState.signatureImageBase64
          : null;
        pdfSpec = {
          isRo: false,
          isPartner: true,
          companyName: snap.companyName || pp.companyName,
          companyEik: snap.companyEik || pp.companyEik,
          companyAddress: snap.companyAddress || '',
          companyRepresentative: snap.companyRepresentative || '—',
          bankName: snap.bankName || '',
          bankIban: snap.bankIban || '',
          website: snap.website || '',
          contactAddress: snap.contactAddress || snap.companyAddress || '',
          contactEmail: snap.contactEmail || pp.contactEmail || '—',
          contactPhone: snap.contactPhone || pp.contactPhone || '—',
          displayDate: snap.contractDate || formatBulgarianDate(pp.createdAt),
          signatureImageBase64: snap.signatureImageBase64 || null,
          includeProviderSignature: true,
          providerSignatureBase64: savedProviderSig,
          customCommission: snap.customCommission || null,
          partnerTerms: resolvedPartnerTerms
        };
      } else if (contractId) {
        const contract = await getContractById(contractId);
        if (!contract) {
          return res.status(404).json({ error: 'Подписаният договор не е намерен.' });
        }
        const snap = contract.contractData || {};
        const isRo = snap.isRo !== undefined ? Boolean(snap.isRo) : contract.country === 'ro';
        const isPartner = Boolean(snap.isPartner || snap.contractKind === 'partner');
        const includeProviderSignature = snap.includeProviderSignature !== undefined
          ? Boolean(snap.includeProviderSignature)
          : !isRo;

        let savedProviderSig = null;
        if (includeProviderSignature) {
          const provState = await getProviderSignatureState();
          if (provState?.locked && provState?.signatureImageBase64) {
            savedProviderSig = provState.signatureImageBase64;
          }
        }

        pdfSpec = {
          isRo,
          isPartner,
          companyName: snap.companyName || contract.companyName,
          companyEik: snap.companyEik || contract.companyEik,
          companyAddress: snap.companyAddress || '',
          companyRepresentative: snap.companyRepresentative || '—',
          companyRepresentativePin: snap.companyRepresentativePin || '',
          bankName: snap.bankName || '',
          bankIban: snap.bankIban || '',
          website: snap.website || '',
          contactAddress: snap.contactAddress || snap.companyAddress || '',
          contactEmail: snap.contactEmail || '—',
          contactPhone: snap.contactPhone || '—',
          displayDate: snap.contractDate || (isRo
            ? String(contract.date || '').slice(0, 10)
            : formatBulgarianDate(contract.date)),
          signatureImageBase64: snap.signatureImageBase64 || null,
          includeProviderSignature,
          providerSignatureBase64: savedProviderSig,
          customCommission: snap.customCommission || contract.commission || null,
          partnerTerms: snap.partnerTerms || null
        };
      } else {
        return res.status(400).json({ error: 'Липсва ID на договора за изтегляне.' });
      }

      try {
        const pdfBytes = await buildContractPdfBytes(pdfSpec);
        const pdfFilename = buildContractPdfFilename(pdfSpec);
        const asciiFilename = pdfFilename
          .replace(/[^\x20-\x7E]/g, '_')
          .replace(/["\\]/g, '')
          .trim() || 'contract.pdf';

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(pdfFilename)}`
        );
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.status(200).send(Buffer.from(pdfBytes));
      } catch (dlErr) {
        console.error('[Download Contract] Error generating PDF:', dlErr);
        return res.status(500).json({ error: 'Грешка при генериране на PDF договора.' });
      }
    }

    return res.status(405).json({ error: 'Method Not Allowed.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Използвайте POST заявка.' });
  }

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const action = req.query?.action || data?.action || null;

    // =========================================================================
    // FLOW 0: One-Time Official IRIS Pay Signature Capture (/podpis)
    // =========================================================================
    if (action === 'saveProviderSignature') {
      const currentProvState = await getProviderSignatureState();
      if (currentProvState.locked) {
        return res.status(404).json({ error: 'Страницата не съществува. Официалният подпис вече е запазен.' });
      }

      const sigDataUrl = data?.signatureImageBase64;
      if (!sigDataUrl || typeof sigDataUrl !== 'string' || !sigDataUrl.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Моля, начертайте валиден подпис.' });
      }

      const saved = await saveProviderSignature({ signatureImageBase64: sigDataUrl });
      console.log('[Provider Signature] One-time official signature captured and locked at', saved.createdAt);
      return res.status(200).json({
        success: true,
        locked: true,
        createdAt: saved.createdAt,
        message: 'Официалният подпис на IRIS Pay беше запазен успешно.'
      });
    }

    // =========================================================================
    // FLOW 1: Dashboard Review Confirmation -> Counter-Sign & Send Final Email
    // =========================================================================
    if (action === 'approveContract') {
      const session = verifySession(req);
      if (!session) {
        return res.status(401).json({
          error: 'Нямате оторизация за тази операция. Моля, влезте през /login.',
          code: 'UNAUTHORIZED'
        });
      }

      const pendingId = data?.pendingId || req.query?.pendingId;
      if (!pendingId) {
        return res.status(400).json({ error: 'Липсва ID на чакащия договор.' });
      }

      const pending = await getPendingContractById(pendingId);
      if (!pending) {
        return res.status(404).json({ error: 'Договорът вече е подписан и изпратен или не е намерен.' });
      }

      const isPartner = pending.contractKind === 'partner';
      const displayDate = formatBulgarianDate(pending.contractDate);

      let resolvedPartnerTerms = pending.partnerTerms || null;
      if (isPartner && pending.partnerToken && !resolvedPartnerTerms) {
        try {
          const foundLink = await getPartnerLink(pending.partnerToken);
          if (foundLink) resolvedPartnerTerms = foundLink;
        } catch (ptErr) {}
      }

      // Use saved official IRIS Pay signature if submitted via /podpis; otherwise fallback to demo SVG
      const provState = await getProviderSignatureState();
      const savedProviderSig = (provState?.locked && provState?.signatureImageBase64)
        ? provState.signatureImageBase64
        : null;

      const targetEmail = await resolveSalesRecipientEmail(isPartner);
      const replySubject = pending.notificationSubject
        ? (String(pending.notificationSubject).startsWith('Re:') ? pending.notificationSubject : `Re: ${pending.notificationSubject}`)
        : null;

      const sendResult = await generateAndSendContractEmail({
        isRo: false,
        isPartner,
        targetEmail,
        companyName: pending.companyName,
        companyEik: pending.companyEik,
        companyAddress: pending.companyAddress,
        companyRepresentative: pending.companyRepresentative,
        bankName: pending.bankName,
        bankIban: pending.bankIban,
        website: pending.website,
        contactAddress: pending.contactAddress,
        contactEmail: pending.contactEmail,
        contactPhone: pending.contactPhone,
        displayDate,
        signatureImageBase64: pending.signatureImageBase64,
        providerSignatureBase64: savedProviderSig,
        includeProviderSignature: true,
        customCommission: pending.customCommission,
        partnerTerms: resolvedPartnerTerms,
        partnerDisplayName: pending.partnerName,
        subjectOverride: replySubject,
        replyToMessageId: pending.notificationMessageId || null
      });

      if (!sendResult.success) {
        return res.status(200).json(sendResult);
      }

      // Remove from pending review queue so it can never be sent twice
      await deletePendingContract({ id: pendingId });

      // Post-sign actions:
      // - For /partner contracts: create pendingPartner notification so manager can create affiliate link/commission
      // - For real merchant contracts: record attribution in affiliates/contracts stats (including snapshot for downloads)
      const signedSnapshot = {
        contractKind: pending.contractKind || (isPartner ? 'partner' : 'direct'),
        isPartner,
        isRo: false,
        companyName: pending.companyName,
        companyEik: pending.companyEik,
        companyAddress: pending.companyAddress,
        companyRepresentative: pending.companyRepresentative,
        bankName: pending.bankName,
        bankIban: pending.bankIban,
        website: pending.website,
        contactAddress: pending.contactAddress || pending.companyAddress,
        contactEmail: pending.contactEmail,
        contactPhone: pending.contactPhone,
        contractDate: displayDate,
        signatureImageBase64: pending.signatureImageBase64,
        includeProviderSignature: true,
        customCommission: pending.customCommission,
        partnerTerms: resolvedPartnerTerms,
        partnerName: pending.partnerName
      };

      let createdPendingPartner = null;
      if (isPartner) {
        try {
          createdPendingPartner = await recordPendingPartner({
            companyName: pending.companyName,
            companyEik: pending.companyEik,
            contactEmail: pending.contactEmail,
            contactPhone: pending.contactPhone,
            partnerToken: pending.partnerToken || null,
            contractSnapshot: signedSnapshot
          });
        } catch (ppErr) {
          console.warn('Could not record post-sign pending partner:', ppErr);
        }
      } else if (!pending.isDemo) {
        try {
          await recordContractAttribution({
            affiliateSlug: pending.affiliateRef,
            companyName: pending.companyName,
            companyEik: pending.companyEik,
            commission: pending.customCommission,
            country: 'bg',
            contractData: signedSnapshot
          });
        } catch (attErr) {
          console.warn('Could not record approved contract attribution:', attErr);
        }
      }

      return res.status(200).json({
        ...sendResult,
        approved: true,
        isPartner,
        isDemo: Boolean(pending.isDemo),
        pendingPartner: createdPendingPartner,
        message: `Договорът е подписан от IRIS Pay и изпратен към ${targetEmail}.`
      });
    }

    // =========================================================================
    // FLOW 2: Public Form Submission (/, /:slug, /c/:token, /partner, /ro)
    // =========================================================================
    const {
      companyName = '—',
      companyEik = '—',
      companyAddress = '',
      companyRepresentative = '—',
      companyRepresentativePin = '',
      bankName = '',
      bankIban = '',
      website = '',
      contactAddress = '',
      contactEmail = '—',
      contactPhone = '—',
      contractDate = '',
      signatureImageBase64 = null,
      pdfBase64 = null,
      affiliateRef = null,
      customToken = null,
      country = 'bg'
    } = data || {};

    const targetCountry = String(country || 'bg').toLowerCase();
    const isRo = targetCountry === 'ro';
    const isPartner = targetCountry === 'partner' || data?.contractType === 'partner';

    let customCommission = null;
    let validatedCustomLink = null;
    if (customToken) {
      try {
        const link = await getCustomLink(customToken);
        if (link && !link.used) {
          customCommission = link.commission;
          validatedCustomLink = link;
        } else if (link && link.used) {
          console.warn('[SendContract] Submitted with already used custom token:', customToken);
        }
      } catch (tokenErr) {
        console.warn('[SendContract] Error checking custom token:', tokenErr);
      }
    }

    const refCode = affiliateRef || data.ref || data.affiliate || validatedCustomLink?.partnerSlug || null;
    let partnerDisplayName = validatedCustomLink?.partnerName || null;

    if (!isRo) {
      // Bulgarian contracts (partner, from partner, or direct) wait in dashboard for review & IRIS signature before emailing
      if (!isPartner && refCode && !partnerDisplayName) {
        try {
          const foundAff = await findAffiliateBySlug({ slug: refCode, country: 'bg' });
          if (foundAff?.name) partnerDisplayName = foundAff.name;
        } catch (affErr) {}
      }

      let resolvedPartnerTerms = data?.partnerTerms || null;
      if (isPartner && data?.partnerToken) {
        try {
          const foundLink = await getPartnerLink(data.partnerToken);
          if (foundLink) resolvedPartnerTerms = foundLink;
        } catch (ptErr) {}
      }

      const displayDate = formatBulgarianDate(contractDate);
      const contractKind = isPartner ? 'partner' : (refCode ? 'from_partner' : 'direct');

      if (validatedCustomLink) {
        try {
          await useCustomLink({
            token: validatedCustomLink.token,
            companyName,
            companyEik,
            contractId: null
          });
        } catch (useErr) {
          console.warn('Error marking custom link as used:', useErr);
        }
      }

      const pendingEntry = await recordPendingContract({
        contractKind,
        companyName,
        companyEik,
        companyAddress,
        companyRepresentative,
        bankName,
        bankIban,
        website,
        contactAddress: contactAddress || companyAddress,
        contactEmail,
        contactPhone,
        contractDate: displayDate,
        signatureImageBase64,
        customCommission,
        customToken: validatedCustomLink?.token || null,
        affiliateRef: refCode,
        partnerName: partnerDisplayName,
        partnerToken: data?.partnerToken || null,
        partnerTerms: resolvedPartnerTerms
      });

      // Send lightweight notification to sales with dashboard link (no PDF attached yet)
      try {
        const alertRecipient = await resolveSalesRecipientEmail(isPartner);
        const dashboardUrl = resolveDashboardUrl(req);
        const alertRes = await sendPendingContractAlertEmail({
          targetEmail: alertRecipient,
          dashboardUrl,
          contractKind,
          companyName,
          companyEik,
          companyRepresentative,
          contactEmail,
          contactPhone,
          displayDate,
          partnerDisplayName,
          customCommission
        });
        if (alertRes && (alertRes.messageId || alertRes.subject)) {
          await updatePendingContractEmailMeta(pendingEntry.id, {
            notificationMessageId: alertRes.messageId || null,
            notificationSubject: alertRes.subject || null
          });
        }
      } catch (alertErr) {
        console.warn('[Pending Review] Could not dispatch sales alert email:', alertErr);
      }

      console.log(`[Pending Review] Stored ${contractKind} contract "${companyName}" (${pendingEntry.id}) awaiting dashboard approval.`);
      return res.status(200).json({
        success: true,
        pendingApproval: true,
        pendingId: pendingEntry.id,
        contractKind,
        message: 'Договорът е получен успешно и изчаква проверка и подпис от екипа на IRIS Pay.'
      });
    }

    // Romanian flow (/ro): unchanged direct attribution + immediate email dispatch
    const roDisplayDate = String(contractDate || '').trim() || new Date().toISOString().slice(0, 10);
    let attribution = null;
    try {
      attribution = await recordContractAttribution({
        affiliateSlug: refCode,
        companyName,
        companyEik,
        commission: customCommission,
        country: targetCountry,
        contractData: {
          contractKind: refCode ? 'from_partner' : 'direct',
          isPartner: false,
          isRo: true,
          companyName,
          companyEik,
          companyAddress,
          companyRepresentative,
          companyRepresentativePin,
          bankName,
          bankIban,
          website,
          contactAddress,
          contactEmail,
          contactPhone,
          contractDate: roDisplayDate,
          signatureImageBase64,
          includeProviderSignature: false,
          customCommission,
          partnerName: partnerDisplayName
        }
      });
      if (attribution && attribution.partnerName) {
        partnerDisplayName = attribution.partnerName;
      }
    } catch (attErr) {
      console.warn('Could not record contract attribution:', attErr);
    }

    if (validatedCustomLink) {
      try {
        await useCustomLink({
          token: validatedCustomLink.token,
          companyName,
          companyEik,
          contractId: attribution?.id || null
        });
      } catch (useErr) {
        console.warn('Error marking custom link as used:', useErr);
      }
    }

    let targetEmail = 'sales@irisbgsf.com';
    try {
      const settings = await getSettings();
      const roEmail = settings?.contractRecipientRoEmail || process.env.CONTRACT_RECIPIENT_RO_EMAIL || 'sales@irisbgsf.com';
      targetEmail = roEmail.toLowerCase().includes('kaloyan.tosev') ? 'sales@irisbgsf.com' : roEmail;
    } catch (e) {
      targetEmail = 'sales@irisbgsf.com';
    }

    const displayDate = String(contractDate || '').trim() || new Date().toISOString().slice(0, 10);
    const result = await generateAndSendContractEmail({
      isRo: true,
      isPartner: false,
      targetEmail,
      companyName,
      companyEik,
      companyAddress,
      companyRepresentative,
      companyRepresentativePin,
      bankName,
      bankIban,
      website,
      contactAddress,
      contactEmail,
      contactPhone,
      displayDate,
      signatureImageBase64,
      includeProviderSignature: false,
      customCommission,
      partnerDisplayName,
      fallbackPdfBase64: pdfBase64
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error processing contract email dispatch:', error);
    return res.status(500).json({
      error: 'Възникна грешка при обработката на заявката за договор.',
      details: error.message
    });
  }
}
