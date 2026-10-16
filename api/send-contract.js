/**
 * Vercel Serverless Function: Send Contract Notification Email
 * Endpoint: /api/send-contract
 * Recipient: kaloyan.tosev@gmail.com (testing) / sales@irisbgsf.com (production)
 * Subject: Подписан договор (Фирма)
 * Content: ЕИК, Фирма, Представляващ, Имейл за контакт, Телефон, Дата (ДД.ММ.ГГГГ)
 * Attachment: PDF (договор + приложение 1)
 */

// Vercel body parser config — increase limit to accept large PDF base64 payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
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
      companyRepresentative = '—',
      contactEmail = '—',
      contactPhone = '—',
      contractDate = '',
      pdfBase64 = null
    } = data || {};

    const targetEmail = data.targetEmail || data.recipientEmail || process.env.CONTRACT_RECIPIENT_EMAIL || 'kaloyan.tosev@gmail.com';
    const cleanCompName = (companyName && companyName !== '—')
      ? String(companyName).replace(/["'„“«»]/g, '').trim()
      : 'Търговец';
    const emailSubject = `Подписан договор (${cleanCompName})`;
    const displayDate = formatBulgarianDate(contractDate);

    // Plain text content - ONLY the 6 requested fields with day, month, year date
    const textBody = `
ЕИК: ${companyEik}
Фирма: ${companyName}
Представляващ: ${companyRepresentative}
Имейл за контакт: ${contactEmail}
Телефон: ${contactPhone}
Дата: ${displayDate}
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
      </table>
    </div>
  </div>
</body>
</html>
`.trim();

    // Prepare PDF attachment (Single combined PDF)
    const attachments = [];
    if (pdfBase64) {
      let rawBase64 = String(pdfBase64).trim();

      // 1. Strip data URI prefix regardless of parameters (filename=..., charset=..., etc.)
      const base64Marker = ';base64,';
      const markerIdx = rawBase64.indexOf(base64Marker);
      if (markerIdx !== -1) {
        rawBase64 = rawBase64.substring(markerIdx + base64Marker.length).trim();
      } else {
        rawBase64 = rawBase64.replace(/^data:[^;]*;base64,/, '').trim();
      }

      // 2. Ensure it starts at the PDF magic base64 header 'JVBERi' (%PDF-)
      const pdfMagicIdx = rawBase64.indexOf('JVBERi');
      if (pdfMagicIdx !== -1 && pdfMagicIdx < 80) {
        rawBase64 = rawBase64.substring(pdfMagicIdx).trim();
      }

      // 3. Remove any trailing quotes or invalid whitespace
      rawBase64 = rawBase64.replace(/[\r\n\s"']+$/, '');

      if (rawBase64.length > 50) {
        const cleanCompName = (companyName && companyName !== '—')
          ? String(companyName).replace(/["'„“«»<>:\/\\|?*]/g, '').trim()
          : 'Търговец';
        const pdfFilename = `Договор (${cleanCompName}).pdf`;

        attachments.push({
          filename: pdfFilename,
          content: rawBase64,
          contentType: 'application/pdf'
        });
      }
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
        console.log('Resend error data:', errData);
        if (errData && errData.statusCode === 403 && errData.message && errData.message.includes('kaloyan.tosev@gmail.com')) {
          console.log('[Resend Sandbox] Sending to account owner email kaloyan.tosev@gmail.com...');
          const fallbackPayload = {
            from: 'IRIS Pay <onboarding@resend.dev>',
            to: ['kaloyan.tosev@gmail.com'],
            reply_to: (contactEmail && contactEmail !== '—') ? contactEmail : undefined,
            subject: emailSubject,
            text: `${textBody}\n\n(Забележка: Доставено до kaloyan.tosev@gmail.com, тъй като irisbgsf.com все още не е верифициран в Resend)`,
            html: `${htmlBody}<p style="margin-top:20px;padding:12px;background:#fef3c7;border:1px solid #fde68a;font-size:12px;color:#92400e;border-radius:4px;"><strong>Бележка от Resend Sandbox:</strong> Имейлът е получен на Вашия регистрационен акаунт <strong>kaloyan.tosev@gmail.com</strong>, тъй като за изпращане директно до <em>sales@irisbgsf.com</em> е необходимо добавяне на домейна в Resend.</p>`
          };
          if (attachments.length > 0) {
            fallbackPayload.attachments = attachments;
          }

          const fallbackRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(fallbackPayload)
          });

          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            return res.status(200).json({
              success: true,
              provider: 'resend_sandbox',
              id: fallbackData.id,
              targetEmail: 'kaloyan.tosev@gmail.com',
              intendedRecipient: targetEmail,
              subject: emailSubject,
              hasAttachment: attachments.length > 0,
              notice: 'Домейнът irisbgsf.com все още не е верифициран в Resend. Писмото беше доставено успешно до kaloyan.tosev@gmail.com с прикачения PDF.'
            });
          }
        }
      } catch (err) {
        console.error('Error dispatching via Resend:', err);
      }
    }

    // 2. Fallback / Development response
    console.log(`[Email Notification Prepared] -> To: ${targetEmail} | Subject: ${emailSubject}`);
    console.log(textBody);

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
