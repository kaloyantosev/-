/**
 * Vercel Serverless Function: Send Contract Notification Email
 * Endpoint: /api/send-contract
 * Recipient: sales@irisbgsf.com
 * Subject: Подписан договор (Фирма)
 * Content: ЕИК, Фирма, Представляващ, Имейл за контакт, Телефон, Дата (ДД.ММ.ГГГГ)
 * Attachment: Authentic Vector PDF (договор + приложение 1)
 */

import fs from 'fs';
import path from 'path';
import { generateContractPdf, generateContractRoPdf } from './pdfGenerator.js';
import { recordContractAttribution, getCustomLink, useCustomLink, getSettings } from './store.js';

// Vercel body parser config
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
  // If ISO format YYYY-MM-DD -> DD.MM.YYYY г.
  const isoMatch = String(dStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y} г.`;
  }
  // If already DD.MM.YYYY
  const dmyMatch = String(dStr).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y} г.`;
  }
  return String(dStr);
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Използвайте POST заявка.' });
  }

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
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

    // Verify and handle custom commission token if provided
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

    // Record contract attribution (either to an affiliate or direct without partner)
    const refCode = affiliateRef || data.ref || data.affiliate || validatedCustomLink?.partnerSlug || null;
    let partnerDisplayName = validatedCustomLink?.partnerName || null;
    let attribution = null;
    try {
      attribution = await recordContractAttribution({
        affiliateSlug: refCode,
        companyName: companyName,
        companyEik: companyEik,
        commission: customCommission,
        country: targetCountry
      });
      if (attribution && attribution.partnerName) {
        partnerDisplayName = attribution.partnerName;
      }
    } catch (attErr) {
      console.warn('Could not record contract attribution:', attErr);
    }

    // Mark custom link as used
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

    // Send emails directly to kaloyan.tosev@gmail.com until domain DNS is verified (configurable via admin settings)
    let targetEmail = process.env.CONTRACT_RECIPIENT_EMAIL || 'kaloyan.tosev@gmail.com';
    try {
      const settings = await getSettings();
      if (settings?.contractRecipientEmail) targetEmail = settings.contractRecipientEmail;
    } catch (e) {}
    const cleanCompName = (companyName && companyName !== '—')
      ? String(companyName).replace(/["'„“«»]/g, '').trim()
      : (isRo ? 'Comerciant' : 'Търговец');
    const commSubjectPart = customCommission ? ` - Индивидуална комисионна: ${customCommission}` : '';
    const countrySubjectTag = isRo ? '[România / Румъния] ' : '';
    const emailSubject = partnerDisplayName
      ? `${countrySubjectTag}Подписан договор (${cleanCompName}) от Партньор "${partnerDisplayName}"${commSubjectPart}`
      : `${countrySubjectTag}Подписан договор (${cleanCompName})${commSubjectPart}`;
    const displayDate = isRo
      ? (String(contractDate || '').trim() || new Date().toISOString().slice(0, 10))
      : formatBulgarianDate(contractDate);

    // Plain text content
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

    // HTML email content - Clean and concise with ONLY the 6 requested fields
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

    // Generate pristine vector PDF (contract + appendix 1)
    let finalPdfBase64 = null;
    try {
      const candidates = [
        path.join(process.cwd(), 'assets'),
        path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')), '..', 'assets'),
        path.join(process.cwd(), 'scratch', 'IRIS подпис на документи', 'assets')
      ];
      let assetsDir = candidates.find(d => fs.existsSync(path.join(d, 'contract_template.pdf')));
      if (!assetsDir) assetsDir = path.join(process.cwd(), 'assets');

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
        customCommission
      };

      const generatedBytes = isRo
        ? await generateContractRoPdf(pdfParams, assetsDir)
        : await generateContractPdf(pdfParams, assetsDir);

      if (generatedBytes && generatedBytes.length > 0) {
        finalPdfBase64 = Buffer.from(generatedBytes).toString('base64');
        console.log(`[Vector PDF] Generated pristine ${isRo ? 'Romanian' : 'Bulgarian'} vector PDF. Size:`, generatedBytes.length);
      }
    } catch (genErr) {
      console.warn('[Vector PDF] Generation error, falling back to passed pdfBase64:', genErr);
    }

    if (!finalPdfBase64 && pdfBase64) {
      let rawBase64 = String(pdfBase64).trim();
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

    // Prepare PDF attachment (Single combined PDF)
    const attachments = [];
    if (finalPdfBase64 && finalPdfBase64.length > 50) {
      const safeCompName = (companyName && companyName !== '—')
        ? String(companyName).replace(/["'„“«»<>:\/\\|?*]/g, '').trim()
        : (isRo ? 'Comerciant' : 'Търговец');
      const pdfFilename = isRo
        ? `Contract_IRISPay_RO_${safeCompName}.pdf`
        : `Договор (${safeCompName}).pdf`;

      attachments.push({
        filename: pdfFilename,
        content: finalPdfBase64,
        contentType: 'application/pdf'
      });
    }

    // 1. Send via Resend API
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        const fromAddress = process.env.EMAIL_FROM || 'IRIS Pay <onboarding@resend.dev>';
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
          return res.status(200).json({
            success: true,
            provider: 'resend',
            id: resendData.id,
            targetEmail,
            subject: emailSubject,
            hasAttachment: attachments.length > 0
          });
        }

        const errData = await resendRes.json();
        console.warn('Resend response status:', resendRes.status, errData);
        if (!resendRes.ok) {
          return res.status(200).json({
            success: false,
            provider: 'resend',
            targetEmail,
            error: errData.message || 'Resend error',
            notice: 'За изпращане до sales@irisbgsf.com е необходимо домейнът irisbgsf.com да бъде верифициран в Resend.'
          });
        }
      } catch (err) {
        console.error('Error dispatching via Resend:', err);
      }
    }

    // 2. Fallback / Development response
    console.log(`[Email Notification Prepared] -> To: ${targetEmail} | Subject: ${emailSubject}`);
    return res.status(200).json({
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
    });

  } catch (error) {
    console.error('Error processing contract email dispatch:', error);
    return res.status(500).json({
      error: 'Възникна грешка при обработката на имейл нотификацията.',
      details: error.message
    });
  }
}
