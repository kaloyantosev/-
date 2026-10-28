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
  const fontRegularPath = path.join(assetsDir, 'calibri.ttf');
  const fontBoldPath = path.join(assetsDir, 'calibrib.ttf');

  const contractBytes = fs.readFileSync(contractPath);
  const appendixBytes = fs.readFileSync(appendixPath);
  const fontRegularBytes = fs.readFileSync(fontRegularPath);
  const fontBoldBytes = fs.readFileSync(fontBoldPath);

  const pdfDoc = await PDFDocument.load(contractBytes);
  pdfDoc.registerFontkit(fontkit);

  const font = await pdfDoc.embedFont(fontRegularBytes, { subset: true, features: { liga: false, calt: false } });
  const fontBold = await pdfDoc.embedFont(fontBoldBytes, { subset: true, features: { liga: false, calt: false } });

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

  // Fallback signature check if available
  if (!sigImage) {
    const fallbackSigPath = 'temp_merchant_sig.png';
    if (fs.existsSync(fallbackSigPath)) {
      const fallbackSigBytes = fs.readFileSync(fallbackSigPath);
      sigImage = await pdfDoc.embedPng(fallbackSigBytes);
    }
  }

  const pages = pdfDoc.getPages();

  // Helper: Wrap text cleanly
  function wrap(text, f, size, maxW) {
    const words = String(text || '').split(/\s+/);
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
    return lines;
  }

  function drawWrapped(page, text, { x, yTop, width, f, size = 10, lineHeight = 13, color = rgb(0,0,0) }) {
    const pH = page.getHeight();
    const lines = wrap(text, f, size, width);
    lines.forEach((line, idx) => {
      const y = pH - yTop - (idx * lineHeight) - size;
      page.drawText(line, { x, y, size, font: f, color });
    });
    return lines.length;
  }

  const cleanDate = String(contractDate || '').trim() || new Date().toISOString().slice(0, 10);
  const colLeftX = 76.5;
  const colLeftWidth = 218.5;
  const colRightX = 302.0;
  const colRightWidth = 235.0;

  // ------------------------------------------
  // PAGE 3: Preamble, Dates & Merchant Section
  // ------------------------------------------
  const p3 = pages[2];
  const p3H = p3.getHeight();

  // EN Date
  p3.drawRectangle({ x: colLeftX, y: p3H - 60, width: colLeftWidth, height: 22, color: rgb(1, 1, 1) });
  p3.drawText(`Today ${cleanDate}, in Bucharest, between:`, { x: colLeftX, y: p3H - 54, size: 10.5, font });

  // RO Date
  p3.drawRectangle({ x: colRightX, y: p3H - 60, width: colRightWidth, height: 22, color: rgb(1, 1, 1) });
  p3.drawText(`Astăzi ${cleanDate}, în București, între:`, { x: colRightX, y: p3H - 54, size: 10.5, font });

  // Merchant item 2 (enlarged text ~10pt with 12.8 lineHeight so it never overflows)
  // EN Merchant
  p3.drawRectangle({ x: colLeftX, y: p3H - 336, width: colLeftWidth, height: 104, color: rgb(1, 1, 1) });
  const enMerchantText = `2.  ${companyName}, registered in the CRRNPLE at the Registry Agency, with UIC/CUI ${companyEik}, with headquarters and address of management: ${companyAddress}, represented by ${companyRepresentative}, with PIN/CNP ${companyRepresentativePin || '—'}, telephone: ${contactPhone}, hereby referred to as "Merchant", on the other hand`;
  drawWrapped(p3, enMerchantText, { x: colLeftX, yTop: 235, width: colLeftWidth, f: font, size: 9.8, lineHeight: 12.6 });

  // RO Merchant
  p3.drawRectangle({ x: colRightX, y: p3H - 336, width: colRightWidth, height: 104, color: rgb(1, 1, 1) });
  const roMerchantText = `2.  ${companyName}, înregistrat în CRRNPLE la Agenția Registrului, având CUI ${companyEik}, cu sediul social și adresa de conducere: ${companyAddress}, reprezentată de ${companyRepresentative}, cu CNP ${companyRepresentativePin || '—'}, telefon: ${contactPhone}, denumită în continuare "Comerciantul", pe de o parte`;
  drawWrapped(p3, roMerchantText, { x: colRightX, yTop: 235, width: colRightWidth, f: font, size: 9.8, lineHeight: 12.6 });

  // ------------------------------------------
  // PAGE 6: Art. 4 Bank details & Art. 5 Authorized Rep
  // ------------------------------------------
  const p6 = pages[5];
  const p6H = p6.getHeight();

  // Art. 4 EN Bank (enlarged text)
  p6.drawRectangle({ x: colLeftX, y: p6H - 330, width: colLeftWidth, height: 44, color: rgb(1, 1, 1) });
  p6.drawText(`• Bank/Payment institution: ${bankName}`, { x: colLeftX, y: p6H - 304, size: 10.5, font });
  p6.drawText(`• IBAN: ${bankIban}`, { x: colLeftX, y: p6H - 322, size: 10.5, font: fontBold });

  // Art. 4 RO Bank (enlarged text)
  p6.drawRectangle({ x: colRightX, y: p6H - 302, width: colRightWidth, height: 44, color: rgb(1, 1, 1) });
  p6.drawText(`• Bancă/Instituție de plată: ${bankName}`, { x: colRightX, y: p6H - 276, size: 10.5, font });
  p6.drawText(`• IBAN: ${bankIban}`, { x: colRightX, y: p6H - 294, size: 10.5, font: fontBold });

  // Art. 5 EN Rep (enlarged text with neat vertical breathing room)
  p6.drawRectangle({ x: colLeftX, y: p6H - 520, width: colLeftWidth, height: 100, color: rgb(1, 1, 1) });
  p6.drawText(`Name: ${companyRepresentative}`, { x: colLeftX, y: p6H - 436, size: 10.5, font });
  p6.drawText(`Email: ${contactEmail}`, { x: colLeftX, y: p6H - 454, size: 10.5, font });
  p6.drawText(`CNP: ${companyRepresentativePin || '—'}`, { x: colLeftX, y: p6H - 472, size: 10.5, font });
  p6.drawText(`Phone Number: ${contactPhone}`, { x: colLeftX, y: p6H - 490, size: 10.5, font });
  p6.drawText(`Authorized location: ${website || companyAddress}`, { x: colLeftX, y: p6H - 508, size: 10.5, font });

  // Art. 5 RO Rep (enlarged text with neat vertical breathing room)
  p6.drawRectangle({ x: colRightX, y: p6H - 505, width: colRightWidth, height: 100, color: rgb(1, 1, 1) });
  p6.drawText(`Nume: ${companyRepresentative}`, { x: colRightX, y: p6H - 421, size: 10.5, font });
  p6.drawText(`Email: ${contactEmail}`, { x: colRightX, y: p6H - 439, size: 10.5, font });
  p6.drawText(`CNP: ${companyRepresentativePin || '—'}`, { x: colRightX, y: p6H - 457, size: 10.5, font });
  p6.drawText(`Număr de telefon: ${contactPhone}`, { x: colRightX, y: p6H - 475, size: 10.5, font });
  p6.drawText(`Locația autorizată: ${website || companyAddress}`, { x: colRightX, y: p6H - 493, size: 10.5, font });

  // ------------------------------------------
  // PAGE 11: Art. 13 Correspondence Contacts (Yellow highlight covered & removed)
  // ------------------------------------------
  const p11 = pages[10];
  const p11H = p11.getHeight();

  // EN Correspondence: Cover yellow boxes completely and redraw in clean black with wrapping
  p11.drawRectangle({ x: colLeftX - 2, y: p11H - 250, width: colLeftWidth + 4, height: 82, color: rgb(1, 1, 1) });
  p11.drawText(`For the Merchant:`, { x: colLeftX, y: p11H - 180, size: 10.5, font: fontBold, color: rgb(0, 0, 0) });
  const enAddrLines = wrap(`Address: ${contactAddress || companyAddress}`, font, 9.5, colLeftWidth);
  enAddrLines.forEach((l, idx) => {
    p11.drawText(l, { x: colLeftX, y: p11H - 195 - (idx * 12), size: 9.5, font });
  });
  const enOffset = (enAddrLines.length - 1) * 12;
  p11.drawText(`E-mail: ${contactEmail}`, { x: colLeftX, y: p11H - 209 - enOffset, size: 9.5, font });
  p11.drawText(`Telephone: ${contactPhone}`, { x: colLeftX, y: p11H - 223 - enOffset, size: 9.5, font });

  // RO Correspondence: Cover yellow boxes completely and redraw in clean black with wrapping
  p11.drawRectangle({ x: colRightX - 2, y: p11H - 250, width: colRightWidth + 4, height: 82, color: rgb(1, 1, 1) });
  p11.drawText(`Pentru Comerciant:`, { x: colRightX, y: p11H - 180, size: 10.5, font: fontBold, color: rgb(0, 0, 0) });
  const roAddrLines = wrap(`Adresa: ${contactAddress || companyAddress}`, font, 9.5, colRightWidth);
  roAddrLines.forEach((l, idx) => {
    p11.drawText(l, { x: colRightX, y: p11H - 195 - (idx * 12), size: 9.5, font });
  });
  const roOffset = (roAddrLines.length - 1) * 12;
  p11.drawText(`E-mail: ${contactEmail}`, { x: colRightX, y: p11H - 209 - roOffset, size: 9.5, font });
  p11.drawText(`Telefon: ${contactPhone}`, { x: colRightX, y: p11H - 223 - roOffset, size: 9.5, font });

  // ------------------------------------------
  // PAGE 14: Signatures (Precisely aligned in allocated spaces)
  // ------------------------------------------
  const p14 = pages[13];
  const p14H = p14.getHeight();

  if (sigImage) {
    // 1st signature block (under Contract)
    // Left: For the Merchant: Y_top ~ 553-564, text "received" starts at 595.8
    p14.drawImage(sigImage, { x: colLeftX, y: p14H - 592, width: 90, height: 26 });
    // Right: Pentru Comerciant: Y_top ~ 538-550, text "primit" starts at 581.3
    p14.drawImage(sigImage, { x: colRightX, y: p14H - 578, width: 90, height: 26 });

    // 2nd signature block (General Terms and Conditions acceptance)
    // Left: For the Merchant: Y_top ~ 684-696, bottom border at 724.4
    p14.drawImage(sigImage, { x: colLeftX, y: p14H - 720, width: 90, height: 24 });
    // Right: Pentru Comerciant: Y_top ~ 669-681, bottom border at 724.4
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

  // Custom commission on Annex 1 if applicable
  const commValue = customCommission || '0.25%';
  if (customCommission) {
    // Page 1 (EN Annex 1)
    appP1.drawRectangle({ x: 76.5, y: appP1H - 465, width: 480, height: 42, color: rgb(1, 1, 1) });
    const enFeeText = `3. Payment initiation fee – ${commValue} of the transaction value. The fee is due by the 10th of the month following the month of implementation.`;
    drawWrapped(appP1, enFeeText, { x: 76.5, yTop: 432, width: 460, f: fontBold, size: 9.5, lineHeight: 13 });

    // Page 2 (RO Annex 1)
    appP2.drawRectangle({ x: 76.5, y: appP2H - 302, width: 480, height: 42, color: rgb(1, 1, 1) });
    const roFeeText = `3. Taxă de inițiere a plății – ${commValue} din valoarea tranzacției. Taxa se plătește până la data de 10 a lunii următoare lunii implementării.`;
    drawWrapped(appP2, roFeeText, { x: 76.5, yTop: 270, width: 460, f: fontBold, size: 9.5, lineHeight: 13 });
  }

  // Signatures on Annex 1
  if (sigImage) {
    // Page 1: under "For the Merchant"
    appP1.drawImage(sigImage, { x: 382.0, y: appP1H - 655, width: 105, height: 35 });
    // Page 2: under "Pentru Comerciant:"
    appP2.drawImage(sigImage, { x: 382.0, y: appP2H - 495, width: 105, height: 35 });
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  return pdfBytes;
}
