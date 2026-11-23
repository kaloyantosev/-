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
  deletePendingContract,
  findAffiliateBySlug,
  getCustomLink,
  useCustomLink,
  getPartnerLink,
  getSettings
} from './store.js';

const DEMO_APPROVED_RECIPIENT_EMAIL = 'kaloyan.tosev@gmail.com';

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
  fallbackPdfBase64 = null
}) {
  const cleanCompName = (companyName && companyName !== '—')
    ? String(companyName).replace(/["'„“«»]/g, '').trim()
    : (isRo ? 'Comerciant' : 'Търговец');
  const commSubjectPart = customCommission ? ` - Индивидуална комисионна: ${customCommission}` : '';
  const emailSubject = isPartner
    ? `Договор за партньорство (${cleanCompName} - ЕИК ${companyEik || '—'})`
    : isRo
      ? (partnerDisplayName
          ? `Румъния - Подписан договор (${cleanCompName}) от Партньор "${partnerDisplayName}"${commSubjectPart}`
          : `Румъния - Подписан договор (${cleanCompName})${commSubjectPart}`)
      : (partnerDisplayName
          ? `Подписан договор (${cleanCompName}) от Партньор "${partnerDisplayName}"${commSubjectPart}`
          : `Подписан договор (${cleanCompName})${commSubjectPart}`);

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

    const generatedBytes = isPartner
      ? await generateContractPartnerPdf(pdfParams, assetsDir)
      : isRo
        ? await generateContractRoPdf(pdfParams, assetsDir)
        : await generateContractPdf(pdfParams, assetsDir);

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
    const safeCompName = (companyName && companyName !== '—')
      ? String(companyName).replace(/["'„“«»<>:\/\\|?*]/g, '').trim()
      : (isRo ? 'Comerciant' : 'Търговец');
    const pdfFilename = isPartner
      ? `Dogovor_Partniorstvo_${safeCompName}.pdf`
      : isRo
        ? `Contract_IRISPay_RO_${safeCompName}.pdf`
        : `Договор (${safeCompName}).pdf`;

    attachments.push({
      filename: pdfFilename,
      content: finalPdfBase64,
      contentType: 'application/pdf'
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const defaultFrom = (targetEmail && String(targetEmail).includes('@irisbgsf.com'))
      ? 'IRIS Pay <sales@irisbgsf.com>'
      : 'IRIS Pay <onboarding@resend.dev>';
    const fromAddress = process.env.EMAIL_FROM || defaultFrom;
    const resendPayload = {
      from: fromAddress,
      to: [targetEmail],
      reply_to: (contactEmail && contactEmail !== '—') ? contactEmail : undefined,
      subject: emailSubject,
      text: textBody,
      html: htmlBody
    };
    if (attachments.length > 0) {
      resendPayload.attachments = attachments;
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
        subject: emailSubject,
        hasAttachment: attachments.length > 0
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

  console.log(`[Email Notification Prepared] -> To: ${targetEmail} | Subject: ${emailSubject}`);
  return {
    success: true,
    provider: 'ready_for_production',
    targetEmail,
    subject: emailSubject,
    data: {
      companyEik,
      companyName,
      companyRepresentative,
      contactEmail,
      contactPhone,
      contractDate: displayDate
    },
    hasAttachment: attachments.length > 0,
    message: `Договорът е изпратен към ${targetEmail}.`
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Използвайте POST заявка.' });
  }

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const action = req.query?.action || data?.action || null;

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

      // Demo phase: always send approved BG contracts once to kaloyan.tosev@gmail.com with provider demo signature
      const targetEmail = DEMO_APPROVED_RECIPIENT_EMAIL;
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
        includeProviderSignature: true,
        customCommission: pending.customCommission,
        partnerTerms: resolvedPartnerTerms,
        partnerDisplayName: pending.partnerName
      });

      if (!sendResult.success) {
        return res.status(200).json(sendResult);
      }

      // Remove from pending review queue so it can never be sent twice
      await deletePendingContract({ id: pendingId });

      // Post-sign actions:
      // - For /partner contracts: create pendingPartner notification so manager can create affiliate link/commission
      // - For real merchant contracts: record attribution in affiliates/contracts stats
      let createdPendingPartner = null;
      if (isPartner) {
        try {
          createdPendingPartner = await recordPendingPartner({
            companyName: pending.companyName,
            companyEik: pending.companyEik,
            contactEmail: pending.contactEmail,
            contactPhone: pending.contactPhone,
            partnerToken: pending.partnerToken || null
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
            country: 'bg'
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
    let attribution = null;
    try {
      attribution = await recordContractAttribution({
        affiliateSlug: refCode,
        companyName,
        companyEik,
        commission: customCommission,
        country: targetCountry
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
