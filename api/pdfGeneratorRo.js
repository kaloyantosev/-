import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export async function generateContractRoPdf(data, assetsDir = 'assets') {
  const {
    companyName = '—',
    companyEik = '—',
    companyAddress = '—',
    companyRepresentative = '—',
    companyRepresentativePin = '—',
    bankName = '—',
    bankIban = '—',
    website = '',
    contactAddress = '',
    contactEmail = '—',
    contactPhone = '—',
    contractDate = '',
    signatureImageBase64 = null,
    customCommission = null
  } = data || {};

  const contractPath = path.join(assetsDir, 'contract_ro_template.pdf');
  const appendixPath = path.join(assetsDir, 'appendix_ro_template.pdf');
  const timesPath = path.join(assetsDir, 'fonts', 'times.ttf');
  const timesBoldPath = path.join(assetsDir, 'fonts', 'timesbd.ttf');
  const calibriPath = path.join(assetsDir, 'calibri.ttf');
  const calibriBoldPath = path.join(assetsDir, 'calibrib.ttf');

  const contractBytes = fs.readFileSync(contractPath);
  const appendixBytes = fs.readFileSync(appendixPath);

  const timesBytes = fs.existsSync(timesPath) ? fs.readFileSync(timesPath) : fs.readFileSync(calibriPath);
  const timesBoldBytes = fs.existsSync(timesBoldPath) ? fs.readFileSync(timesBoldPath) : fs.readFileSync(calibriBoldPath);
  const calibriBytes = fs.readFileSync(calibriPath);
  const calibriBoldBytes = fs.readFileSync(calibriBoldPath);

  const pdfDoc = await PDFDocument.load(contractBytes);
  pdfDoc.registerFontkit(fontkit);

  const times = await pdfDoc.embedFont(timesBytes, { subset: true, features: { liga: false, calt: false } });
  const timesBold = await pdfDoc.embedFont(timesBoldBytes, { subset: true, features: { liga: false, calt: false } });
  const calibri = await pdfDoc.embedFont(calibriBytes, { subset: true, features: { liga: false, calt: false } });
  const calibriBold = await pdfDoc.embedFont(calibriBoldBytes, { subset: true, features: { liga: false, calt: false } });

  // Merchant signature
  let sigImage = null;
  if (signatureImageBase64) {
    try {
      const cleanB64 = signatureImageBase64.replace(/^data:image\/[a-z]+;base64,/, '').trim();
      const sigImgBytes = Buffer.from(cleanB64, 'base64');
      sigImage = await pdfDoc.embedPng(sigImgBytes);
    } catch (e) {
      console.warn('Could not embed custom signature:', e.message);
    }
  }

  if (!sigImage) {
    const fallbackSigPath = 'temp_merchant_sig.png';
    if (fs.existsSync(fallbackSigPath)) {
      const fallbackSigBytes = fs.readFileSync(fallbackSigPath);
      sigImage = await pdfDoc.embedPng(fallbackSigBytes);
    }
  }

  const pages = pdfDoc.getPages();

  function wrap(text, f, size, maxW) {
    const rawWords = String(text || '').split(/\s+/).filter(Boolean);
    const words = [];
    // Break any single token wider than maxW so text never crosses into the other column
    for (const rw of rawWords) {
      if (f.widthOfTextAtSize(rw, size) <= maxW) {
        words.push(rw);
      } else {
        let chunk = '';
        for (const ch of rw) {
          if (f.widthOfTextAtSize(chunk + ch, size) <= maxW) {
            chunk += ch;
          } else {
            if (chunk) words.push(chunk);
            chunk = ch;
          }
        }
        if (chunk) words.push(chunk);
      }
    }
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (f.widthOfTextAtSize(test, size) <= maxW) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  function drawWrapped(page, text, { x, yTop, width, f, size = 10.98, lineHeight = 14.5, color = rgb(0, 0, 0) }) {
    const pH = page.getHeight();
    const lines = wrap(text, f, size, width);
    lines.forEach((line, idx) => {
      const y = pH - yTop - (idx * lineHeight) - size;
      page.drawText(line, { x, y, size, font: f, color });
    });
    return lines.length;
  }

  function drawAutoFitWrapped(page, text, { x, yTop, width, maxHeight, f, startSize = 10.5, startLineHeight = 14.0 }) {
    let size = startSize;
    let lineHeight = startLineHeight;
    let lines = wrap(text, f, size, width);
    while ((lines.length * lineHeight) > maxHeight && size > 6.8) {
      size = Number((size - 0.35).toFixed(2));
      lineHeight = Number((size * 1.28).toFixed(2));
      lines = wrap(text, f, size, width);
    }
    const pH = page.getHeight();
    lines.forEach((line, idx) => {
      const y = pH - yTop - (idx * lineHeight) - size;
      page.drawText(line, { x, y, size, font: f, color: rgb(0, 0, 0) });
    });
    return { count: lines.length, size, lineHeight, bottomYTop: yTop + (lines.length * lineHeight) };
  }

  function drawSequentialLines(page, items, { x, yBaseStart, width, maxHeight = 999, f, size = 10.5, lineHeight = 14.5 }) {
    let curSize = size;
    let curLh = lineHeight;
    let built = [];
    while (true) {
      built = [];
      for (const item of items) {
        const fontToUse = item.bold ? timesBold : f;
        const lines = wrap(item.text, fontToUse, curSize, width);
        for (const line of lines) built.push({ line, fontToUse });
      }
      if ((built.length * curLh) <= maxHeight || curSize <= 6.8) break;
      curSize = Number((curSize - 0.35).toFixed(2));
      curLh = Number((curSize * 1.28).toFixed(2));
    }
    const pH = page.getHeight();
    let curBase = yBaseStart;
    for (const entry of built) {
      page.drawText(entry.line, { x, y: pH - curBase, size: curSize, font: entry.fontToUse, color: rgb(0, 0, 0) });
      curBase += curLh;
    }
    return curBase;
  }

  const cleanDate = String(contractDate || '').trim() || new Date().toISOString().slice(0, 10);
  const colLeftX = 76.5;
  const colLeftWidth = 218.5;
  const colRightX = 303.08;
  const colRightWidth = 233.0;

  // ------------------------------------------
  // PAGE 3: Preamble, Dates & Merchant Section (Dynamic flow into empty space)
  // ------------------------------------------
  const p3 = pages[2];
  const p3H = p3.getHeight();

  // EN Date
  p3.drawRectangle({ x: colLeftX - 1, y: p3H - 58, width: colLeftWidth + 1, height: 15, color: rgb(1, 1, 1) });
  p3.drawText(`Today ${cleanDate}, in Bucharest, between:`, { x: colLeftX, y: p3H - 53.34, size: 10.98, font: times });

  // RO Date
  p3.drawRectangle({ x: colRightX - 1, y: p3H - 58, width: colRightWidth + 1, height: 15, color: rgb(1, 1, 1) });
  p3.drawText(`Astăzi ${cleanDate}, în București, între:`, { x: colRightX, y: p3H - 53.34, size: 10.98, font: times });

  // Cover both Merchant item 2 AND "Together referred to as..." down to y=396 (safely above table border at y=403.7)
  p3.drawRectangle({ x: 75.5, y: p3H - 396, width: 221, height: 164, color: rgb(1, 1, 1) });
  const enMerchantText = `2.  ${companyName}, registered in the CRRNPLE at the Registry Agency, with UIC ${companyEik}, with headquarters and address of management: ${companyAddress}, represented by ${companyRepresentative}, with PIN ${companyRepresentativePin || '—'}, telephone: ${contactPhone}, hereby referred to as “Merchant”, on the other hand`;
  const enRes = drawAutoFitWrapped(p3, enMerchantText, { x: 92.28, yTop: 235, width: 202.5, maxHeight: 132, f: times, startSize: 10.6, startLineHeight: 14.0 });
  p3.drawText('Together referred to as Parties,', { x: colLeftX, y: p3H - (enRes.bottomYTop + 20), size: 10.98, font: times });

  // RO: Cover both Merchant item 2 AND "Denumite împreună Părțile..." down to y=396
  p3.drawRectangle({ x: 302.0, y: p3H - 396, width: 235, height: 166, color: rgb(1, 1, 1) });
  const roMerchantText = `2.  ${companyName}, înregistrat în CRRNPLE la Agenția Registrului, având CUI ${companyEik}, cu sediul social și adresa de conducere: ${companyAddress}, reprezentată de ${companyRepresentative}, cu CNP ${companyRepresentativePin || '—'}, telefon: ${contactPhone}, denumită în continuare “Comerciantul”, pe de o parte`;
  const roRes = drawAutoFitWrapped(p3, roMerchantText, { x: 318.86, yTop: 233, width: 217.2, maxHeight: 134, f: times, startSize: 10.6, startLineHeight: 14.0 });
  p3.drawText('Denumite împreună Părțile, Întrucât:', { x: colRightX, y: p3H - (roRes.bottomYTop + 20), size: 10.98, font: times });

  // ------------------------------------------
  // PAGE 6: Art. 4 Bank details & Art. 5 Authorized Rep
  // ------------------------------------------
  const p6 = pages[5];
  const p6H = p6.getHeight();

  // Art. 4 EN Bank (keep original bullet at x=94.50, auto-fit above Art. 5 at y=335)
  p6.drawRectangle({ x: 111.5, y: p6H - 332, width: 184, height: 44, color: rgb(1, 1, 1) });
  drawSequentialLines(p6, [
    { text: `Bank/Payment institution: ${bankName}` },
    { text: `IBAN: ${bankIban}`, bold: true }
  ], { x: 112.5, yBaseStart: 300.92, width: 182.0, maxHeight: 40, f: times, size: 10.3, lineHeight: 14.5 });

  // Art. 4 RO Bank (keep original bullet at x=321.08, auto-fit above Art. 5 at y=335)
  p6.drawRectangle({ x: 338.0, y: p6H - 330, width: 198, height: 70, color: rgb(1, 1, 1) });
  drawSequentialLines(p6, [
    { text: `Bancă/Instituție de plată: ${bankName}` },
    { text: `IBAN: ${bankIban}`, bold: true }
  ], { x: 339.08, yBaseStart: 271.82, width: 196.5, maxHeight: 65, f: times, size: 10.3, lineHeight: 14.5 });

  // Art. 5 EN Rep (auto-fit above IV. RIGHTS at y=524)
  p6.drawRectangle({ x: colLeftX - 1, y: p6H - 520, width: colLeftWidth + 1, height: 100, color: rgb(1, 1, 1) });
  drawSequentialLines(p6, [
    { text: `Name: ${companyRepresentative}` },
    { text: `Email: ${contactEmail}` },
    { text: `CNP: ${companyRepresentativePin || '—'}` },
    { text: `Phone Number: ${contactPhone}` },
    { text: `Authorized location: ${website || companyAddress}` }
  ], { x: colLeftX, yBaseStart: 432.64, width: colLeftWidth, maxHeight: 96, f: times, size: 10.5, lineHeight: 14.5 });

  // Art. 5 RO Rep (auto-fit above IV. DREPTURI at y=510)
  p6.drawRectangle({ x: colRightX - 1, y: p6H - 506, width: colRightWidth + 1, height: 100, color: rgb(1, 1, 1) });
  drawSequentialLines(p6, [
    { text: `Nume: ${companyRepresentative}` },
    { text: `Email: ${contactEmail}` },
    { text: `PIN: ${companyRepresentativePin || '—'}` },
    { text: `Număr de telefon: ${contactPhone}` },
    { text: `Locația autorizată: ${website || companyAddress}` }
  ], { x: colRightX, yBaseStart: 418.06, width: colRightWidth, maxHeight: 96, f: times, size: 10.5, lineHeight: 14.5 });

  // ------------------------------------------
  // PAGE 11: Art. 13 Correspondence Contacts (Yellow highlight covered)
  // ------------------------------------------
  const p11 = pages[10];
  const p11H = p11.getHeight();

  p11.drawRectangle({ x: colLeftX - 2, y: p11H - 243, width: colLeftWidth + 3, height: 73, color: rgb(1, 1, 1) });
  drawSequentialLines(p11, [
    { text: 'For the Merchant:', bold: true },
    { text: `Address: ${contactAddress || companyAddress}` },
    { text: `E-mail: ${contactEmail}` },
    { text: `Telephone: ${contactPhone}` }
  ], { x: colLeftX, yBaseStart: 183.74, width: colLeftWidth, f: times, size: 10.5, lineHeight: 14.2 });

  p11.drawRectangle({ x: colRightX - 2, y: p11H - 243, width: colRightWidth + 3, height: 73, color: rgb(1, 1, 1) });
  drawSequentialLines(p11, [
    { text: 'Pentru Comerciant:', bold: true },
    { text: `Adresa: ${contactAddress || companyAddress}` },
    { text: `E-mail: ${contactEmail}` },
    { text: `Telefon: ${contactPhone}` }
  ], { x: colRightX, yBaseStart: 183.74, width: colRightWidth, f: times, size: 10.5, lineHeight: 14.2 });

  // ------------------------------------------
  // PAGE 14: Signatures
  // ------------------------------------------
  const p14 = pages[13];
  const p14H = p14.getHeight();

  if (sigImage) {
    // 1st signature block (under Contract)
    p14.drawImage(sigImage, { x: colLeftX, y: p14H - 592, width: 90, height: 26 });
    p14.drawImage(sigImage, { x: colRightX, y: p14H - 578, width: 90, height: 26 });

    // 2nd signature block (General Terms and Conditions acceptance)
    p14.drawImage(sigImage, { x: colLeftX, y: p14H - 720, width: 90, height: 24 });
    p14.drawImage(sigImage, { x: colRightX, y: p14H - 714, width: 90, height: 26 });
  }

  // ------------------------------------------
  // APPEND APPENDIX (ANNEX 1) PAGES
  // ------------------------------------------
  const appDoc = await PDFDocument.load(appendixBytes);
  const [appP1, appP2] = await pdfDoc.copyPages(appDoc, [0, 1]);
  pdfDoc.addPage(appP1);
  pdfDoc.addPage(appP2);

  const appP1H = appP1.getHeight();
  const appP2H = appP2.getHeight();

  // Payment initiation fee on Annex 1 (default 0.49%, or customCommission override)
  const commValue = (customCommission && String(customCommission).trim()) || '0.49%';

  // Page 1 (EN Annex 1): 3. at x=76.50, text at x=94.50, base=440.80 / 456.22
  appP1.drawRectangle({ x: 93, y: appP1H - 462, width: 472, height: 34, color: rgb(1, 1, 1) });
  const enBoldPart = `Payment initiation fee – ${commValue} of the transaction value. `;
  appP1.drawText(enBoldPart, { x: 94.5, y: appP1H - 440.8, size: 10.98, font: calibriBold });
  const enBoldW = calibriBold.widthOfTextAtSize(enBoldPart, 10.98);
  appP1.drawText('The fee is due by the 10th of the month following', { x: 94.5 + enBoldW, y: appP1H - 440.8, size: 10.98, font: calibri });
  appP1.drawText('the month of implementation.', { x: 94.5, y: appP1H - 456.22, size: 10.98, font: calibri });

  // Page 2 (RO Annex 1): 3. at x=76.50, text at x=94.50, base=430.78 / 446.26
  appP2.drawRectangle({ x: 93, y: appP2H - 452, width: 472, height: 34, color: rgb(1, 1, 1) });
  const roBoldPart = `Taxă de inițiere a plății – ${commValue} din valoarea tranzacției. `;
  appP2.drawText(roBoldPart, { x: 94.5, y: appP2H - 430.78, size: 10.98, font: calibriBold });
  const roBoldW = calibriBold.widthOfTextAtSize(roBoldPart, 10.98);
  appP2.drawText('Taxa se plătește până la data de 10 a lunii', { x: 94.5 + roBoldW, y: appP2H - 430.78, size: 10.98, font: calibri });
  appP2.drawText('următoare lunii implementării.', { x: 94.5, y: appP2H - 446.26, size: 10.98, font: calibri });

  // Signatures on Annex 1
  if (sigImage) {
    // Page 1: under "For the Merchant" (x=382.54, y0=600.62)
    appP1.drawImage(sigImage, { x: 382.5, y: appP1H - 655, width: 105, height: 35 });
    // Page 2: under "Pentru Comerciant:" (x=382.54, y0=590.67)
    appP2.drawImage(sigImage, { x: 382.5, y: appP2H - 645, width: 105, height: 35 });
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  return pdfBytes;
}
