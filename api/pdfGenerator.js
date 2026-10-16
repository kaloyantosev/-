import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export async function generateContractPdf(data, assetsDir = 'assets') {
  const {
    companyName = '„Техно Солюшънс“ ЕООД',
    companyEik = '205891234',
    companyAddress = 'гр. Варна, бул. Княз Борис I № 45, ет. 2',
    companyRepresentative = 'Иван Георгиев Иванов',
    bankName = 'УниКредит Булбанк',
    bankIban = 'BG12 UNCR 7000 1523 4567 89',
    website = 'www.technosolutions.bg',
    contactAddress = 'гр. Варна, бул. Княз Борис I № 45, ет. 2',
    contactEmail = 'kaloyan.tosev@gmail.com',
    contactPhone = '0888 123 456',
    contractDate = '16.10.2026 г.',
    signatureImageBase64 = null
  } = data || {};

  const contractPath = path.join(assetsDir, 'contract_template.pdf');
  const appendixPath = path.join(assetsDir, 'appendix_template.pdf');
  const fontRegularPath = path.join(assetsDir, 'calibri.ttf');
  const fontBoldPath = path.join(assetsDir, 'calibrib.ttf');

  const contractBytes = fs.readFileSync(contractPath);
  const appendixBytes = fs.readFileSync(appendixPath);
  const fontRegularBytes = fs.readFileSync(fontRegularPath);
  const fontBoldBytes = fs.readFileSync(fontBoldPath);

  const pdfDoc = await PDFDocument.load(contractBytes);
  pdfDoc.registerFontkit(fontkit);

  const font = await pdfDoc.embedFont(fontRegularBytes);
  const fontBold = await pdfDoc.embedFont(fontBoldBytes);

  // Embed merchant signature image
  let sigImage = null;
  if (signatureImageBase64) {
    try {
      const cleanB64 = signatureImageBase64.replace(/^data:image\/[a-z]+;base64,/, '').trim();
      const sigImgBytes = Buffer.from(cleanB64, 'base64');
      sigImage = await pdfDoc.embedPng(sigImgBytes);
    } catch (e) {
      console.warn('Could not embed custom signature, falling back:', e.message);
    }
  }

  // If no custom signature image provided, check fallback
  if (!sigImage) {
    const fallbackSigPath = 'temp_merchant_sig.png';
    if (fs.existsSync(fallbackSigPath)) {
      const fallbackSigBytes = fs.readFileSync(fallbackSigPath);
      sigImage = await pdfDoc.embedPng(fallbackSigBytes);
    }
  }

  const pages = pdfDoc.getPages();

  // ==========================================
  // PAGE 1 (docSheet1)
  // ==========================================
  const p1 = pages[0];
  const p1H = p1.getHeight();
  const fontSize = 11.5;
  const leftX = 70.8;
  const indentX = 106.4;
  const maxX = 527.2;

  // 1. Clean continuous date line (eliminates stray dots and huge gaps)
  p1.drawRectangle({
    x: 70.0,
    y: p1H - 147.0,
    width: 340.0,
    height: 16.0,
    color: rgb(1, 1, 1)
  });

  let curDateX = leftX;
  const dateY = p1H - 142.5;

  const tDnes = 'Днес, ';
  p1.drawText(tDnes, { x: curDateX, y: dateY, size: fontSize, font, color: rgb(0, 0, 0) });
  curDateX += font.widthOfTextAtSize(tDnes, fontSize);

  const cleanDateStr = String(contractDate || '').trim();
  p1.drawText(cleanDateStr, { x: curDateX, y: dateY, size: fontSize, font: fontBold, color: rgb(0, 0, 0) });
  curDateX += fontBold.widthOfTextAtSize(cleanDateStr, fontSize);

  const tBetween = ', в гр. София, между:';
  p1.drawText(tBetween, { x: curDateX, y: dateY, size: fontSize, font, color: rgb(0, 0, 0) });

  // 2. Clean continuous Section 2 merchant paragraph (dynamic wrapping, zero gaps, matching Section 1)
  p1.drawRectangle({
    x: 70.0,
    y: p1H - 376.0,
    width: 458.0,
    height: 88.0,
    color: rgb(1, 1, 1)
  });

  const safeCompName = String(companyName || '„Търговец“').trim();
  const safeCompEik = String(companyEik || '—').trim();
  const safeCompAddr = String(companyAddress || '—').trim();
  const safeCompRep = String(companyRepresentative || '—').trim();

  const chunks = [
    { text: '2. ', isBold: false },
    { text: safeCompName, isBold: true },
    { text: ', регистрирано в ТРРЮЛНЦ към Агенцията по вписванията с ЕИК ', isBold: false },
    { text: safeCompEik, isBold: true },
    { text: ', със седалище, адрес на управление: ', isBold: false },
    { text: safeCompAddr, isBold: true },
    { text: ', представлявано от ', isBold: false },
    { text: safeCompRep, isBold: true },
    { text: ', наричано по-долу за краткост „Търговец“, от друга страна,', isBold: false }
  ];

  const words = [];
  for (const c of chunks) {
    const f = c.isBold ? fontBold : font;
    const parts = c.text.split(/( +)/);
    for (const p of parts) {
      if (!p) continue;
      const w = f.widthOfTextAtSize(p, fontSize);
      words.push({ text: p, isBold: c.isBold, font: f, width: w, isSpace: /^\s+$/.test(p) });
    }
  }

  const lines = [];
  let currentLine = [];
  let currentLineWidth = 0;

  for (const w of words) {
    const lineMax = (lines.length === 0) ? (maxX - indentX) : (maxX - leftX);
    if (w.isSpace && currentLine.length === 0) continue;
    if (currentLineWidth + w.width > lineMax && currentLine.length > 0) {
      while (currentLine.length > 0 && currentLine[currentLine.length - 1].isSpace) {
        currentLineWidth -= currentLine.pop().width;
      }
      lines.push(currentLine);
      currentLine = [];
      currentLineWidth = 0;
      if (w.isSpace) continue;
    }
    currentLine.push(w);
    currentLineWidth += w.width;
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  const yBaselines = [301.8, 318.5, 335.5, 352.5, 369.5];

  lines.forEach((line, idx) => {
    const y = p1H - (yBaselines[idx] || (301.8 + idx * 16.8));
    let x = (idx === 0) ? indentX : leftX;
    for (const item of line) {
      p1.drawText(item.text, { x, y, size: fontSize, font: item.font, color: rgb(0, 0, 0) });
      x += item.width;
    }
  });

  // ==========================================
  // PAGE 3 (docSheet3)
  // ==========================================
  const p3 = pages[2];
  const p3H = p3.getHeight();

  // Bank (Raised baseline to match label on exact same line)
  p3.drawRectangle({
    x: 252.95,
    y: p3H - 338.5,
    width: 277.05,
    height: 16.0,
    color: rgb(1, 1, 1)
  });
  p3.drawText(String(bankName || ''), {
    x: 258.95,
    y: p3H - 334.8,
    size: 11.5,
    font: font,
    color: rgb(0, 0, 0)
  });

  // IBAN (Raised baseline, font: normal unbolded)
  p3.drawRectangle({
    x: 133.73,
    y: p3H - 355.3,
    width: 396.27,
    height: 16.0,
    color: rgb(1, 1, 1)
  });
  p3.drawText(String(bankIban || ''), {
    x: 139.73,
    y: p3H - 351.6,
    size: 11.5,
    font: font,
    color: rgb(0, 0, 0)
  });

  // Website: When website is added, remove "(ако има)" and draw "Сайт: [URL]"
  const cleanSite = String(website || '').trim();
  if (cleanSite && cleanSite !== '—') {
    // Cover "• Сайт(ако има):" from x=105 to line end
    p3.drawRectangle({
      x: 105.0,
      y: p3H - 372.5,
      width: 422.2,
      height: 16.0,
      color: rgb(1, 1, 1)
    });
    p3.drawText('Сайт: ', {
      x: 106.4,
      y: p3H - 368.6,
      size: 11.5,
      font: font,
      color: rgb(0, 0, 0)
    });
    const siteLabelW = font.widthOfTextAtSize('Сайт: ', 11.5);
    p3.drawText(cleanSite, {
      x: 106.4 + siteLabelW,
      y: p3H - 368.6,
      size: 11.5,
      font: font,
      color: rgb(0, 0, 0)
    });
  } else {
    p3.drawRectangle({
      x: 180.24,
      y: p3H - 372.5,
      width: 349.76,
      height: 16.0,
      color: rgb(1, 1, 1)
    });
    p3.drawText('—', {
      x: 186.24,
      y: p3H - 368.6,
      size: 11.5,
      font: font,
      color: rgb(0, 0, 0)
    });
  }

  // ==========================================
  // PAGE 6 (docSheet6)
  // ==========================================
  const p6 = pages[5];
  const p6H = p6.getHeight();

  // Address (Raised baseline to match label on exact same line)
  p6.drawRectangle({
    x: 104.45,
    y: p6H - 570.2,
    width: 425.55,
    height: 16.0,
    color: rgb(1, 1, 1)
  });
  p6.drawText(String(contactAddress || companyAddress || ''), {
    x: 110.45,
    y: p6H - 566.5,
    size: 11.5,
    font: font,
    color: rgb(0, 0, 0)
  });

  // Email (Raised baseline to match label on exact same line)
  p6.drawRectangle({
    x: 103.98,
    y: p6H - 587.0,
    width: 426.02,
    height: 16.0,
    color: rgb(1, 1, 1)
  });
  p6.drawText(String(contactEmail || ''), {
    x: 109.98,
    y: p6H - 583.3,
    size: 11.5,
    font: font,
    color: rgb(0, 0, 0)
  });

  // Phone (Raised baseline to match label on exact same line)
  p6.drawRectangle({
    x: 117.38,
    y: p6H - 603.8,
    width: 412.62,
    height: 16.0,
    color: rgb(1, 1, 1)
  });
  p6.drawText(String(contactPhone || ''), {
    x: 123.38,
    y: p6H - 600.1,
    size: 11.5,
    font: font,
    color: rgb(0, 0, 0)
  });

  // ==========================================
  // PAGE 9 (docSheet9 - Contract Signatures)
  // ==========================================
  const p9 = pages[8];
  const p9H = p9.getHeight();

  // Provider slot remains strictly blank (provider signs after receiving the merchant contract)

  // Merchant Slot 1: Placed directly under "За Търговеца:", strictly without printed name
  if (sigImage) {
    p9.drawImage(sigImage, {
      x: 368.94,
      y: p9H - 408.0,
      width: 95.0,
      height: 24.0
    });
  }

  // Merchant Slot 2: Provide plenty of space directly under "За Търговеца:" without going to the side
  // Shift Terms receipt clause slightly down so Slot 2 has ample vertical height
  p9.drawRectangle({
    x: 70.0,
    y: p9H - 502.0,
    width: 458.0,
    height: 34.0,
    color: rgb(1, 1, 1)
  });

  // Redraw Terms receipt banner cleanly shifted 12pt lower
  p9.drawText('* Получил съм екземпляр и съм съгласен в отношенията ни да се прилагат Общи условия', {
    x: 70.8,
    y: p9H - 482.7,
    size: 10.0,
    font: fontBold,
    color: rgb(0, 0, 0)
  });
  p9.drawText('на “Айрис Солюшънс“ АД относно използване на Продукт Платежен терминал.', {
    x: 70.8,
    y: p9H - 496.7,
    size: 10.0,
    font: fontBold,
    color: rgb(0, 0, 0)
  });

  // Draw Merchant Signature 2 directly under "За Търговеца:" aligned with Slot 1 & 3, strictly without printed name
  if (sigImage) {
    p9.drawImage(sigImage, {
      x: 368.94,
      y: p9H - 468.0,
      width: 95.0,
      height: 23.0
    });
  }

  // Merchant Slot 3: Placed directly under "За Търговеца:", strictly without printed name
  if (sigImage) {
    p9.drawImage(sigImage, {
      x: 368.94,
      y: p9H - 558.0,
      width: 95.0,
      height: 24.0
    });
  }

  // ==========================================
  // PAGE 10 (Appendix 1)
  // ==========================================
  const appDoc = await PDFDocument.load(appendixBytes);
  const [appPage] = await pdfDoc.copyPages(appDoc, [0]);
  pdfDoc.addPage(appPage);

  const p10 = pdfDoc.getPages()[9];
  const p10H = p10.getHeight();

  // Provider slot remains strictly blank (provider signs after receiving the merchant contract)

  // Merchant slot: Placed directly under "За Търговеца:", strictly without printed name
  if (sigImage) {
    p10.drawImage(sigImage, {
      x: 392.65,
      y: p10H - 569.67,
      width: 95.0,
      height: 24.0
    });
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
