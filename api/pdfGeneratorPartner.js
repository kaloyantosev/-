import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

/**
 * Dynamic Vector PDF Generator for Partnership Agreement ("Договор за партньорска дейност") + Annex 1.
 * Flows text and tables dynamically across A4 pages so any input length renders cleanly without clipping or overlap.
 */
export async function generateContractPartnerPdf(data, assetsDir = 'assets') {
  const {
    companyName = '—',
    companyEik = '—',
    companyAddress = '—',
    companyRepresentative = '—',
    contactAddress = '',
    contactEmail = '—',
    contactPhone = '—',
    contractDate = '',
    signatureImageBase64 = null,
    partnerTerms = null
  } = data || {};

  const timesPath = path.join(assetsDir, 'fonts', 'times.ttf');
  const timesBoldPath = path.join(assetsDir, 'fonts', 'timesbd.ttf');
  const calibriPath = path.join(assetsDir, 'calibri.ttf');
  const calibriBoldPath = path.join(assetsDir, 'calibrib.ttf');

  const regularBytes = fs.existsSync(timesPath) ? fs.readFileSync(timesPath) : fs.readFileSync(calibriPath);
  const boldBytes = fs.existsSync(timesBoldPath) ? fs.readFileSync(timesBoldPath) : fs.readFileSync(calibriBoldPath);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const font = await pdfDoc.embedFont(regularBytes, { subset: true, features: { liga: false, calt: false } });
  const fontBold = await pdfDoc.embedFont(boldBytes, { subset: true, features: { liga: false, calt: false } });

  let sigImage = null;
  if (signatureImageBase64) {
    try {
      const cleanB64 = signatureImageBase64.replace(/^data:image\/[a-z]+;base64,/, '').trim();
      const sigImgBytes = Buffer.from(cleanB64, 'base64');
      sigImage = await pdfDoc.embedPng(sigImgBytes);
    } catch (e) {
      console.warn('[Partner PDF] Could not embed signature:', e.message);
    }
  }

  const templatePath = path.join(assetsDir, 'partner_contract_template.pdf');
  if (fs.existsSync(templatePath)) {
    const tplBytes = fs.readFileSync(templatePath);
    const tplDoc = await PDFDocument.load(tplBytes);
    tplDoc.registerFontkit(fontkit);

    const calRegBytes = fs.existsSync(calibriPath) ? fs.readFileSync(calibriPath) : regularBytes;
    const calBldBytes = fs.existsSync(calibriBoldPath) ? fs.readFileSync(calibriBoldPath) : boldBytes;
    const tplFont = await tplDoc.embedFont(calRegBytes, { subset: true, features: { liga: false, calt: false } });
    const tplFontBold = await tplDoc.embedFont(calBldBytes, { subset: true, features: { liga: false, calt: false } });

    let tplSigImage = null;
    if (signatureImageBase64) {
      try {
        const cleanB64 = signatureImageBase64.replace(/^data:image\/[a-z]+;base64,/, '').trim();
        tplSigImage = await tplDoc.embedPng(Buffer.from(cleanB64, 'base64'));
      } catch (_) {}
    }

    const wrapSimple = (text, f, size, maxW) => {
      const words = String(text || '').split(/\s+/).filter(Boolean);
      const out = [];
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (f.widthOfTextAtSize(test, size) <= maxW) {
          cur = test;
        } else {
          if (cur) out.push(cur);
          cur = w;
        }
      }
      if (cur) out.push(cur);
      return out.length ? out : ['—'];
    };

    const drawMaskText = (pObj, x, yTopBaseline, boxW, boxH, text, { size = 10.8, bold = true, maxW = null, align = 'left', lineHeight = 13 } = {}) => {
      const pH = pObj.getHeight();
      const f = bold ? tplFontBold : tplFont;
      // Cover the dotted placeholder cleanly
      pObj.drawRectangle({
        x: x - 1,
        y: pH - yTopBaseline - (boxH - 11) - 2,
        width: boxW + 2,
        height: boxH + 2,
        color: rgb(1, 1, 1)
      });
      const lines = maxW ? wrapSimple(text, f, size, maxW) : [String(text || '—')];
      lines.slice(0, 2).forEach((ln, idx) => {
        let drawX = x;
        if (align === 'center') {
          drawX = x + Math.max(0, (boxW - f.widthOfTextAtSize(ln, size)) / 2);
        }
        pObj.drawText(ln, {
          x: drawX,
          y: pH - yTopBaseline - (idx * lineHeight),
          size,
          font: f,
          color: rgb(0, 0, 0)
        });
      });
    };

    const drawDynamicFlowBlock = (pObj, x, yTopStart, boxW, boxH, paragraphs) => {
      const pH = pObj.getHeight();
      pObj.drawRectangle({
        x: x - 1,
        y: pH - yTopStart - boxH,
        width: boxW + 2,
        height: boxH + 4,
        color: rgb(1, 1, 1)
      });

      const layoutParagraphs = (fontSize) => {
        const lineHeight = fontSize * 1.24;
        const spaceW = tplFont.widthOfTextAtSize(' ', fontSize);
        const renderedLines = [];
        let totalH = 0;

        for (const p of paragraphs) {
          const tokens = [];
          for (const seg of p.segments) {
            const f = seg.bold ? tplFontBold : tplFont;
            const parts = String(seg.text || '').split(/\s+/).filter(Boolean);
            for (const part of parts) {
              if (f.widthOfTextAtSize(part, fontSize) <= boxW) {
                tokens.push({ text: part, f });
              } else {
                let chunk = '';
                for (const ch of part) {
                  if (f.widthOfTextAtSize(chunk + ch, fontSize) <= boxW) {
                    chunk += ch;
                  } else {
                    if (chunk) tokens.push({ text: chunk, f });
                    chunk = ch;
                  }
                }
                if (chunk) tokens.push({ text: chunk, f });
              }
            }
          }

          let curLine = [];
          let curW = 0;
          const pLines = [];
          for (const tok of tokens) {
            const tw = tok.f.widthOfTextAtSize(tok.text, fontSize);
            const add = curLine.length ? spaceW + tw : tw;
            if (curW + add <= boxW) {
              curLine.push(tok);
              curW += add;
            } else {
              if (curLine.length) pLines.push(curLine);
              curLine = [tok];
              curW = tw;
            }
          }
          if (curLine.length) pLines.push(curLine);
          if (!pLines.length) pLines.push([]);

          pLines.forEach((lw, idx) => {
            renderedLines.push({ words: lw, yOffset: totalH });
            totalH += lineHeight;
          });
          totalH += (p.spaceAfter || 0);
        }
        return { renderedLines, totalH, spaceW, fontSize };
      };

      const sizes = [10.8, 10.1, 9.4, 8.7, 8.0, 7.4, 6.8, 6.2];
      let chosen = layoutParagraphs(sizes[sizes.length - 1]);
      for (const sz of sizes) {
        const attempt = layoutParagraphs(sz);
        if (attempt.totalH <= boxH) {
          chosen = attempt;
          break;
        }
      }

      for (const line of chosen.renderedLines) {
        let curX = x;
        const drawY = pH - yTopStart - chosen.fontSize - line.yOffset;
        line.words.forEach((w, idx) => {
          if (idx > 0) curX += chosen.spaceW;
          pObj.drawText(w.text, { x: curX, y: drawY, size: chosen.fontSize, font: w.f, color: rgb(0, 0, 0) });
          curX += w.f.widthOfTextAtSize(w.text, chosen.fontSize);
        });
      }
    };

    const tplPages = tplDoc.getPages();
    const p1 = tplPages[0];
    const now = new Date();
    const fallbackDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    const cDate = String(contractDate || fallbackDate).trim();

    drawMaskText(p1, 96.5, 108.8, 64, 14, cDate, { align: 'center' });
    drawDynamicFlowBlock(p1, 70.9, 230, 456, 126, [
      {
        segments: [
          { text: '2.', bold: false },
          { text: `${companyName},`, bold: true },
          { text: 'регистрирано в ТРРЮЛНЦ към Агенцията по вписвания с ЕИК', bold: false },
          { text: `${companyEik},`, bold: true },
          { text: 'представлявано от', bold: false },
          { text: `${companyRepresentative},`, bold: true },
          { text: 'с търговски адрес', bold: false },
          { text: `${companyAddress},`, bold: true },
          { text: 'наричан по-долу за краткост ИЗПЪЛНИТЕЛ.', bold: false }
        ],
        spaceAfter: 0
      }
    ]);

    if (tplPages[6]) {
      const p7 = tplPages[6];
      const p7H = p7.getHeight();
      drawDynamicFlowBlock(p7, 70.9, 218, 456, 74, [
        { segments: [{ text: 'Адрес:', bold: false }, { text: contactAddress || companyAddress, bold: true }], spaceAfter: 2 },
        { segments: [{ text: 'E-mail:', bold: false }, { text: contactEmail, bold: true }], spaceAfter: 2 },
        { segments: [{ text: 'Телефон:', bold: false }, { text: contactPhone, bold: true }], spaceAfter: 0 }
      ]);

      if (tplSigImage) {
        const dSig = tplSigImage.scaleToFit(160, 46);
        p7.drawImage(tplSigImage, {
          x: 354,
          y: p7H - 674 - dSig.height,
          width: dSig.width,
          height: dSig.height
        });
      }
    }

    // Replace page 8 (Annex 1) with dynamic Annex 1 reflecting partnerTerms + signature
    if (tplPages.length >= 8) {
      tplDoc.removePage(7);
    }
    const annexPage = tplDoc.addPage([595.32, 841.92]);
    const AP_W = 595.32;
    const AP_H = 841.92;
    const AP_ML = 70.9;
    const AP_MR = 70.9;
    const AP_CW = AP_W - AP_ML - AP_MR;
    let apY = 64;

    const annexTitle = 'Приложение 1';
    annexPage.drawText(annexTitle, {
      x: (AP_W - tplFontBold.widthOfTextAtSize(annexTitle, 13)) / 2,
      y: AP_H - apY - 13,
      size: 13,
      font: tplFontBold,
      color: rgb(0, 0, 0)
    });
    apY += 32;

    const drawApRow = (cells, { bold = false, bg = null, fontSize = 9.8, lineHeight = 13, pad = 6 } = {}) => {
      const f = bold ? tplFontBold : tplFont;
      const wrapped = cells.map(c => wrapSimple(c.text, c.bold ? tplFontBold : f, fontSize, c.width - pad * 2));
      const maxL = Math.max(...wrapped.map(l => l.length));
      const rowH = maxL * lineHeight + pad * 2;
      let cx = AP_ML;
      cells.forEach((c, idx) => {
        if (bg) {
          annexPage.drawRectangle({ x: cx, y: AP_H - apY - rowH, width: c.width, height: rowH, color: bg });
        }
        annexPage.drawRectangle({
          x: cx,
          y: AP_H - apY - rowH,
          width: c.width,
          height: rowH,
          borderWidth: 0.7,
          borderColor: rgb(0.25, 0.25, 0.25)
        });
        const cf = c.bold ? tplFontBold : f;
        wrapped[idx].forEach((ln, li) => {
          annexPage.drawText(ln, {
            x: cx + pad,
            y: AP_H - apY - pad - (li * lineHeight) - fontSize,
            size: fontSize,
            font: cf,
            color: rgb(0, 0, 0)
          });
        });
        cx += c.width;
      });
      apY += rowH;
    };

    const terms = partnerTerms || {
      months: 12,
      includeOneTime: true,
      includePercent: true,
      tiers: [
        { label: 'До 10 търговеца', oneTime: '50', percent: '5' },
        { label: 'От 11 до 50 търговеца', oneTime: '75', percent: '7' },
        { label: 'Над 50 търговеца', oneTime: '100', percent: '10' }
      ]
    };
    const incOneTime = terms.includeOneTime !== false;
    const incPercent = terms.includePercent !== false;
    const monthsVal = Math.max(1, parseInt(terms.months, 10) || 12);
    const activeTiers = (Array.isArray(terms.tiers) && terms.tiers.length > 0)
      ? terms.tiers
      : [{ label: 'За всеки търговец', oneTime: '50', percent: '5' }];

    const descParts = [];
    if (incOneTime) {
      descParts.push('1. Еднократно, при подписване на договор с търговец. Комисионната е дължима в месеца, следващ направена успешна транзакция от страна на търговеца.');
    }
    if (incPercent) {
      const numPrefix = incOneTime ? '2.' : '1.';
      descParts.push(`${numPrefix} Процент от прихода на привлечените от него търговци, за първите ${monthsVal} месеца от срока на договора между Компанията и Търговеца. Комисионната се изплаща ежемесечно на база реализирания нетен приход от търговеца за съответния период.`);
    }
    const rewardDescText = descParts.join(' ') || 'Съгласно договорените условия по-долу.';

    const c1W = 34;
    const c2W = 185;
    const c3W = AP_CW - c1W - c2W;
    drawApRow([
      { text: 'No', width: c1W, bold: true },
      { text: 'Услуга', width: c2W, bold: true },
      { text: 'Възнаграждение', width: c3W, bold: true }
    ], { bg: rgb(0.94, 0.96, 0.98) });

    drawApRow([
      { text: '1.', width: c1W },
      {
        text: 'За всеки привлечен клиент подписал рамков договор за извършване на плащания чрез услугата по иницииране на плащане на Айрис Солюшънс АД и направил минимум 1 успешна трансакция.',
        width: c2W
      },
      { text: rewardDescText, width: c3W }
    ]);

    apY += 8;
    const tierW = AP_CW / activeTiers.length;
    drawApRow(
      activeTiers.map(t => ({ text: String(t.label || 'Етап'), width: tierW, bold: true })),
      { bg: rgb(0.94, 0.96, 0.98) }
    );
    drawApRow(
      activeTiers.map(t => {
        const parts = [];
        if (incOneTime) parts.push(`${t.oneTime} EUR еднократно`);
        if (incPercent) parts.push(`${t.percent}% от прихода`);
        return { text: parts.join(' + ') || '—', width: tierW, bold: true };
      })
    );

    apY += 16;
    const foot1 = 'Посочените възнаграждения са крайни.';
    annexPage.drawText(foot1, { x: AP_ML, y: AP_H - apY - 10.5, size: 10.5, font: tplFont, color: rgb(0, 0, 0) });
    apY += 18;

    let foot2 = '';
    if (incOneTime && incPercent) {
      foot2 = 'Еднократното възнаграждение и процентът се отнасят само за привлечения клиент в съответната графа, в която попада.';
    } else if (incOneTime) {
      foot2 = 'Еднократното възнаграждение се отнася само за привлечения клиент в съответната графа, в която попада.';
    } else if (incPercent) {
      foot2 = 'Процентът се отнася само за привлечения клиент в съответната графа, в която попада.';
    }
    if (foot2) {
      wrapSimple(foot2, tplFont, 10.5, AP_CW).forEach(ln => {
        annexPage.drawText(ln, { x: AP_ML, y: AP_H - apY - 10.5, size: 10.5, font: tplFont, color: rgb(0, 0, 0) });
        apY += 14;
      });
    }

    apY += 36;
    const sigY = AP_H - apY;
    annexPage.drawText('За Компанията:', { x: AP_ML, y: sigY, size: 11, font: tplFontBold, color: rgb(0, 0, 0) });
    annexPage.drawText('За Изпълнителя:', { x: 354, y: sigY, size: 11, font: tplFontBold, color: rgb(0, 0, 0) });
    if (tplSigImage) {
      const dSig = tplSigImage.scaleToFit(160, 46);
      annexPage.drawImage(tplSigImage, {
        x: 354,
        y: sigY - 10 - dSig.height,
        width: dSig.width,
        height: dSig.height
      });
    }
    annexPage.drawLine({ start: { x: AP_ML, y: sigY - 60 }, end: { x: AP_ML + 150, y: sigY - 60 }, thickness: 0.7, color: rgb(0.3, 0.3, 0.3) });
    annexPage.drawLine({ start: { x: 354, y: sigY - 60 }, end: { x: 354 + 150, y: sigY - 60 }, thickness: 0.7, color: rgb(0.3, 0.3, 0.3) });

    return await tplDoc.save({ useObjectStreams: true });
  }

  // A4 dimensions in points
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN_L = 56;
  const MARGIN_R = 56;
  const MARGIN_T = 56;
  const MARGIN_B = 56;
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let cursorY = MARGIN_T; // top-down coordinate

  function ensureSpace(neededHeight) {
    if (cursorY + neededHeight > PAGE_H - MARGIN_B) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      cursorY = MARGIN_T;
    }
  }

  function wrapText(text, f, size, maxW) {
    const rawWords = String(text || '').split(/\s+/).filter(Boolean);
    const tokens = [];
    for (const rw of rawWords) {
      if (f.widthOfTextAtSize(rw, size) <= maxW) {
        tokens.push(rw);
      } else {
        let chunk = '';
        for (const ch of rw) {
          if (f.widthOfTextAtSize(chunk + ch, size) <= maxW) {
            chunk += ch;
          } else {
            if (chunk) tokens.push(chunk);
            chunk = ch;
          }
        }
        if (chunk) tokens.push(chunk);
      }
    }
    const lines = [];
    let cur = '';
    for (const w of tokens) {
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

  function drawParagraph(text, { size = 10.5, lineHeight = 14.5, bold = false, indent = 0, spaceAfter = 6, align = 'left' } = {}) {
    const f = bold ? fontBold : font;
    const availW = CONTENT_W - indent;
    const lines = wrapText(text, f, size, availW);
    for (const line of lines) {
      ensureSpace(lineHeight);
      let x = MARGIN_L + indent;
      if (align === 'center') {
        x = (PAGE_W - f.widthOfTextAtSize(line, size)) / 2;
      }
      page.drawText(line, { x, y: PAGE_H - cursorY - size, size, font: f, color: rgb(0, 0, 0) });
      cursorY += lineHeight;
    }
    cursorY += spaceAfter;
  }

  function drawHeading(text, { size = 11.5, spaceBefore = 10, spaceAfter = 5, center = false } = {}) {
    cursorY += spaceBefore;
    ensureSpace(size + 18);
    drawParagraph(text, {
      size,
      lineHeight: size + 4,
      bold: true,
      spaceAfter,
      align: center ? 'center' : 'left'
    });
  }

  function drawRichSegments(segments, { size = 10.5, lineHeight = 14.5, indent = 0, spaceAfter = 6 } = {}) {
    // segments: [{ text, bold }]
    const words = [];
    for (const seg of segments) {
      const f = seg.bold ? fontBold : font;
      const parts = String(seg.text || '').split(/\s+/).filter(Boolean);
      for (const p of parts) {
        if (f.widthOfTextAtSize(p, size) <= CONTENT_W - indent) {
          words.push({ text: p, f, bold: !!seg.bold });
        } else {
          let chunk = '';
          for (const ch of p) {
            if (f.widthOfTextAtSize(chunk + ch, size) <= CONTENT_W - indent) {
              chunk += ch;
            } else {
              if (chunk) words.push({ text: chunk, f, bold: !!seg.bold });
              chunk = ch;
            }
          }
          if (chunk) words.push({ text: chunk, f, bold: !!seg.bold });
        }
      }
    }

    const lines = [];
    let curLine = [];
    let curW = 0;
    const spaceW = font.widthOfTextAtSize(' ', size);
    const maxW = CONTENT_W - indent;

    for (const w of words) {
      const wWidth = w.f.widthOfTextAtSize(w.text, size);
      const added = curLine.length ? spaceW + wWidth : wWidth;
      if (curW + added <= maxW) {
        curLine.push(w);
        curW += added;
      } else {
        if (curLine.length) lines.push(curLine);
        curLine = [w];
        curW = wWidth;
      }
    }
    if (curLine.length) lines.push(curLine);

    for (const lineWords of lines) {
      ensureSpace(lineHeight);
      let x = MARGIN_L + indent;
      lineWords.forEach((w, idx) => {
        if (idx > 0) x += spaceW;
        page.drawText(w.text, { x, y: PAGE_H - cursorY - size, size, font: w.f, color: rgb(0, 0, 0) });
        x += w.f.widthOfTextAtSize(w.text, size);
      });
      cursorY += lineHeight;
    }
    cursorY += spaceAfter;
  }

  function drawSignatureRow(labelLeft, labelRight) {
    ensureSpace(88);
    cursorY += 16;
    const yLabel = PAGE_H - cursorY - 11;
    const xLeft = MARGIN_L;
    const xRight = PAGE_W - MARGIN_R - 170;

    page.drawText(labelLeft, { x: xLeft, y: yLabel, size: 11, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText(labelRight, { x: xRight, y: yLabel, size: 11, font: fontBold, color: rgb(0, 0, 0) });

    if (sigImage) {
      const dSig = sigImage.scaleToFit(150, 40);
      page.drawImage(sigImage, {
        x: xRight,
        y: yLabel - 48,
        width: dSig.width,
        height: dSig.height
      });
    }

    page.drawLine({
      start: { x: xLeft, y: yLabel - 52 },
      end: { x: xLeft + 150, y: yLabel - 52 },
      thickness: 0.7,
      color: rgb(0.3, 0.3, 0.3)
    });
    page.drawLine({
      start: { x: xRight, y: yLabel - 52 },
      end: { x: xRight + 150, y: yLabel - 52 },
      thickness: 0.7,
      color: rgb(0.3, 0.3, 0.3)
    });

    cursorY += 76;
  }

  const cleanDate = String(contractDate || '').trim() || new Date().toLocaleDateString('bg-BG');
  const cleanAddr = String(contactAddress || companyAddress || '—').trim();

  // =========================================================================
  // TITLE & PREAMBLE
  // =========================================================================
  drawParagraph('Договор за партньорска дейност', { size: 15, lineHeight: 20, bold: true, align: 'center', spaceAfter: 12 });

  drawRichSegments([
    { text: 'Днес,' },
    { text: cleanDate, bold: true },
    { text: 'в гр. София се сключи настоящият договор за консултантска дейност между страните:' }
  ]);

  drawRichSegments([
    { text: '1. „Айрис Солюшънс“ АД, регистрирано в ТРРЮЛНЦ към Агенцията по вписвания с ЕИК 208455895, със седалище, адрес на управление: гр. София, бул. „Христо Смирненски“ № 78, ет. 4, представлявано от изп. директор Галя Димитрова, чрез пълномощника си Михаел Михайлов, наричано по-долу за краткост „Компанията“, от една страна,' }
  ], { indent: 12 });

  drawParagraph('и', { spaceAfter: 6, indent: 12 });

  drawRichSegments([
    { text: '2.' },
    { text: companyName, bold: true },
    { text: ', регистрирано в ТРРЮЛНЦ към Агенцията по вписвания с ЕИК' },
    { text: companyEik, bold: true },
    { text: ', представлявано от' },
    { text: companyRepresentative, bold: true },
    { text: ', с търговски адрес' },
    { text: companyAddress, bold: true },
    { text: ', наричан по-долу за краткост ИЗПЪЛНИТЕЛ.' }
  ], { indent: 12, spaceAfter: 10 });

  drawParagraph('СТРАНИТЕ СЕ СПОРАЗУМЯХА ЗА СЛЕДНОТО:', { bold: true, spaceAfter: 8 });

  // =========================================================================
  // SECTIONS 1 - 15
  // =========================================================================
  drawHeading('1. ОПРЕДЕЛЕНИЯ И ДЕФИНИЦИИ');
  drawParagraph('1.1. В договора термините, изброени по-долу, ще имат следното значение, освен ако контекстът не налага друго тълкуване:');
  drawParagraph('„Компанията“ е „Айрис Солюшънс“ - лицензирана платежна институция от Българска Народна Банка, предоставяща Услугите.');
  drawParagraph('„Изпълнител“ е физическо или юридическо лице, което е ангажирано от Компанията за популяризиране на продуктите и услугите на Компанията на пазара, без да има представителство или да действа от името или за сметка на „Компанията“.');
  drawParagraph('„Дейности на Изпълнителя“ са всички видове дейности за маркетинг и популяризиране на продуктите и услугите на Компанията, като срещи, обаждания, оферти, преговори, презентации, печатни материали, изпълнявани от Изпълнителя за привличане клиенти, които да ползват платежните продукти и услуги на Компанията;');
  drawParagraph('„Клиенти, привлечени от Изпълнителя“ са лицата, които са привлечени от Изпълнителя и имат подписано споразумение за ползване на продуктите и услугите на Компанията.');
  drawParagraph('„Услуги“ са платежните услуги по иницииране на плащане и доставка на информация по сметка, съгласно чл. 4, т. 7 и т. 8 от ЗПУПС. Компанията е лицензирана от Българска Народна Банка и вписана в регистъра на доставчиците. Услугите се реализират посредством Платежен терминал, IRIS PSD2 HUB или други софтуерни решения на Компанията.');
  drawParagraph('„Платежен терминал“ е софтуерно решение на Компанията, което се инсталира и/или интегрира със системите на Търговеца, чрез което е възможна обмяна на информация между Търговеца и неговите клиенти и се приемат плащания от сметка, с които се заплаща за стоки/услуги на Търговеца. Плащанията може да са свързани с:');
  drawParagraph('* заплащане на стоки/услуги в онлайн магазин на Търговеца;', { indent: 14, spaceAfter: 3 });
  drawParagraph('* заплащане на стоки/услуги във физически магазин на Търговеца;', { indent: 14, spaceAfter: 3 });
  drawParagraph('* заплащане по фактури на Търговеца;', { indent: 14, spaceAfter: 6 });
  drawParagraph('IRIS PSD2 HUB е софтуерна платформа, която посредством API интеграция предоставя възможност на клиентите да ползват услугите по доставка на информация по сметка или иницииране на плащане.');
  drawParagraph('„Търговец“ е лице, осъществяващо стопанска дейност или предоставящо услуги по занятие, което предоставя стоки/услуги, чието заплащане е възможно посредством „Платежния терминал“.');
  drawParagraph('„Регулатор“ е всяка институция или организация, регулираща дейността на Компанията, в качеството й на лицензирана платежна институция, включително, но не само: Българска Народна Банка, ЕЦБ, органи за защита на личните данни, органи за борба с изпирането на пари и финансиране на тероризъм.');
  drawParagraph('„Регулация“ е всеки настоящ или бъдещ закон, нормативен акт, указания, насоки, изискване или друг акт, издаден от Регулатор.');
  drawParagraph('„Права на интелектуална собственост“ са авторско право, права върху база данни, права върху търговски марки, дизайн, домейни, ноу-хау и поверителна информация.');
  drawParagraph('„Лични данни“ са всички данни и информация на физически лица, съхранявани и обработвани от Изпълнителя във връзка с предоставянето на Услуги по настоящия Договор.');
  drawParagraph('„Договор“ е настоящият договор за партньорска дейност между Компанията и Изпълнителя.');

  drawHeading('2. ПРЕДМЕТ НА ДОГОВОРА');
  drawParagraph('Компанията възлага на Изпълнителя да популяризира Услугите чрез извършване на консултантски дейности и посредничество за сключване на договор между Компанията и Банкови и Небанкови институции, както и Търговци, срещу възнаграждение.');
  drawParagraph('Изпълнителят няма изключителност, което означава, че Компанията има право свободно да сключва сходни договори с други лица, които да действат като Изпълнители.');

  drawHeading('3. ПРАВА И ЗАДЪЛЖЕНИЯ НА СТРАНИТЕ');
  drawParagraph('След сключване на Договора, Изпълнителят следва да извършва активни консултантски дейности и да популяризира продуктите и услугите на Компанията.');
  drawParagraph('Изпълнителят няма право да сключва каквито и да е споразумения от името на Компанията. За избягване на всякакво съмнение, Изпълнителят не сключва споразумения за платежни услуги с клиенти или партньори от името и за сметка на Компанията. В комуникацията си с потенциални клиенти и трети лица - Търговци, Изпълнителят винаги информира, че действа като Консултант и не представлява Компанията.');
  drawParagraph('Изпълнителят, включително неговите служители, трябва да изпълнява възложените дейности добросъвестно и в съответствие с всички правила и разпоредби.');
  drawParagraph('Компанията може да даде на Изпълнителя задължителни указания относно изпълнението на Договора.');
  drawParagraph('Компанията дължи на Изпълнителя възнаграждение, съгласно уговореното в Договора.');
  drawParagraph('Компанията може едностранно да измени обхвата и начина на предоставяне на платежните продукти и услуги по раздел 4 от Договора, като уведоми писмено Изпълнителя за всяко такова предстоящо изменение.');

  drawHeading('4. ДЕЙНОСТИ НА ИЗПЪЛНИТЕЛЯ');
  drawParagraph('Компанията и Изпълнителят извършват различни дейности за популяризиране на продуктите и услугите на Компанията и привличането на нови клиенти. Дейностите на Изпълнителя, свързани с популяризирането на продуктите и услугите на Компанията включват, но не се ограничават до:');
  drawParagraph('• Изпращане на Email съобщения и други маркетингови материали, публикуване на маркетингова информация на своя уебсайт и в негови офиси;', { indent: 12 });
  drawParagraph('• Информиране на потенциалните клиенти за различните продукти и услуги на Компанията, условията по тях, както и подпомагане на процедурите за кандидатстване за тях;', { indent: 12 });
  drawParagraph('• Организиране на презентации за търговци и корпоративни клиенти;', { indent: 12 });
  drawParagraph('• Окомплектоване и събиране на необходимите документи за сключване на споразумение между Компанията и клиентите;', { indent: 12 });
  drawParagraph('• Идентификация на потенциални клиенти – физически и юридически лица. Идентификацията представлява събиране на данни за физическите лица – клиенти, представляващите и/или притежаващите юридически лица, съгласно указания на Компанията.', { indent: 12 });
  drawParagraph('• Други консултантски дейности, указани от Компанията.', { indent: 12 });
  drawParagraph('До 10-то число на месеца, следващ месеца на отчитане, Изпълнителят предоставя отчет до Компанията съгласно предоставен от нея образец отчет за извършените дейности.');

  drawHeading('5. ВЪЗНАГРАЖДЕНИЕ НА ИЗПЪЛНИТЕЛЯ');
  drawParagraph('Изпълнителят има право да получава възнаграждение за своите услуги. Възнаграждението е посочено в Приложение 1, което е неразделна част от Договора, като е допустимо сключването на индивидуални анекси към Приложение 1 за конкретни крайни клиенти.');
  drawParagraph('Компанията заплаща възнаграждението на Изпълнителя на месечна база, до 20-то число на месеца, следващ края на изтеклия отчетен период. За целта Компанията подготвя подробен отчет за дължимото от Компанията възнаграждение за продуктите и услугите, които ползват клиентите на Компанията, в резултат на действията на Изпълнителя.');
  drawParagraph('Заплащането на възнаграждението на Изпълнителя се извършва от Компанията чрез банков превод по банкова сметка на Изпълнителя. Освен ако не е предвидено друго, всяка от страните носи отговорност за собствените си разходи, направени по време на изпълнението на задълженията си по Договора, включително, но не само, такси за банков превод, счетоводни, юридически и други такси.');
  drawParagraph('Изпълнителят се съгласява, че в случай, че ползването на продукти или услуги за конкретен привлечен търговец бъде прекратено в рамките на периода от сключване на договора с клиента до изплащането на възнаграждението за отчетния период, Изпълнителят няма право на възнаграждение за този конкретен търговец.');

  drawHeading('6. ЗАЩИТА НА ЛИЧНИТЕ ДАННИ');
  drawParagraph('Страните действат като самостоятелни администратори на лични данни. Всяка една от страните по Договора по всяко време следва да спазва своите задължения по отношение на защитата на личните данни, които се обработват от всяка една от страните в хода на изпълнение на задълженията си по този Договор.');
  drawParagraph('В случай, че Изпълнителят събира документи и записи, съдържащи лични данни, следва да спазва всички мерки и стандарти, установени от приложимото законодателство за защита на личните данни, включително въвеждането в сила и поддържане на всички технически и организационни мерки за предотвратяване на неразрешено или незаконно обработване на Лични данни и случайна загуба, унищожаване или увреждане на Лични данни, включително предприемане на разумни стъпки, за да се гарантира надеждността на служителите с достъп до личните данни.');
  drawParagraph('В случай че клиент на Компанията изяви желание обработените от Изпълнителя Лични данни да бъдат прехвърлени на Компанията, Изпълнителят следва да извърши това действие съгласно указанията на Компанията.');

  drawHeading('7. РЕГУЛАТОРНО СЪОТВЕТСТВИЕ');
  drawParagraph('Всяка страна спазва всички приложими към дейността ѝ законови и регулаторни изисквания, включително но не само Закона за платежните услуги и платежните системи, Закона за мерките срещу изпиране на пари, Закона за мерките срещу финансирането на тероризма в изпълнение на ангажиментите си по това споразумение.');
  drawParagraph('Компанията осъществява комуникацията с всички Регулатори по отношение на извършваната от нея дейност, като Изпълнителят се задължава да ѝ съдейства в случаи на необходимост. Всяка страна незабавно предоставя на другата информация, документация и помощ за целите на спазването на законовите и регулаторните изисквания, включително във връзка с разследване на регулаторен орган, както и във връзка с жалби и писма от клиенти.');

  drawHeading('8. КОНФИДЕНЦИАЛНОСТ');
  drawParagraph('Всяка страна („Получател“) се задължава да третира като поверителна цялата информация на другата страна („Откриваща страна“). Информация, свързана с бизнес моделите, информация за продуктите (с изключение на информацията, която се използва за маркетинг), процедурите и процесите и възнаграждението на Изпълнителя също се счита за поверителна информация. Задължението за неразгласяване на поверителна информация продължава да се прилага за период от 3 години след прекратяване на Договора.');
  drawParagraph('Получателят може да използва поверителната информация само за целите на настоящия Договор и може да я предоставя на служители, директори, подизпълнители, агенти, представители на трети страни, професионални съветници и трети страни, с достъп до поверителната информация само до степента и според изискванията за изпълнение на Договора или получаването на услугите. Получателят трябва да гарантира поверителността на информацията в съответствие със стандарта, изискван съгласно Договора.');
  drawParagraph('Получателят може да разкрие поверителна информация, когато това се изисква от Регулатор. В тези обстоятелства Получателят уведомява незабавно разгласяващата страна с предварително писмено известие за разкриването, така че разкриващата страна да има достатъчна възможност (където е възможно) да предотврати или контролира начина на оповестяване чрез подходящи правни средства.');

  drawHeading('9. ПРАВА НА ИНТЕЛЕКТУАЛНА СОБСТВЕНОСТ');
  drawParagraph('При спазване на всички условия на настоящия Договор, Компанията оправомощава Изпълнителя да използва логото на Компанията, в съответствие с условията, посочени в Договора и указанията на Компанията, с единствената цел да се популяризират платежните услуги, предлагани от Компанията.');
  drawParagraph('Права върху интелектуална собственост върху: всеки софтуер или документация, предоставени от Компанията на Изпълнителя за или във връзка с Договора; и всякакви персонализирани графични интерфейси, дизайнерски елементи, графики или други приложения или съдържание, които Компанията може да предоставя, остават собственост на Компанията.');
  drawParagraph('Когато се предоставя софтуер, документация или други материали, които дават възможност на Изпълнителя да популяризира услугите на Компанията, последният предоставя на Изпълнителя неизключителен, непрехвърлим лиценз за използване на софтуера, документацията или други материали само за тази цел и в съответствие с Договора.');
  drawParagraph('Правото на използване на знаците и всеки софтуер, документация или други материали, предоставени съгласно Договора, ще продължи само за посочения от Възложителя срок, но не по-дълго от срока на действие на Договора и не може да бъде прехвърляно или подлицензирано изцяло или частично.');
  drawParagraph('Изпълнителят няма право да изготвя и/или промотира рекламни материали, отнасящи се до Услугите, без предварително да ги е получил от Компанията или да е получил предварително писмено съгласие от Компанията за тяхното изготвяне и/или промотиране.');

  drawHeading('10. ОТГОВОРНОСТ И САНКЦИИ');
  drawParagraph('Компанията отговаря за предоставянето на платежните продукти и услуги при спазване на сключените споразумения с Клиентите за предоставяне на платежни услуги. Изпълнителят не носи отговорност, произтичаща от претенции на клиенти, основани на лошо качество на платежните услуги на компанията.');
  drawParagraph('В случай че Изпълнителят е действал недобросъвестно, в резултат на което не е изпълнил свое задължение по Договора, той дължи неустойка в размер на 200 (двеста) лева за всеки отделен случай. За недобросъвестно действие се счита:');
  drawParagraph('• всяко действие или бездействие на Изпълнителя, което има за цел или последици увреждане на Компанията по какъвто и да е начин;', { indent: 12 });
  drawParagraph('• получаване от Изпълнителя или друго лице на възнаграждение и изгода, което не би било дължимо, ако Изпълнителят действа с грижата на добър търговец, съобразно добросъвестната търговска практика и в интерес на Компанията;', { indent: 12 });
  drawParagraph('• получаване на изгода от Изпълнителя без никаква (или несъразмерна) изгода за Компанията.', { indent: 12 });
  drawParagraph('Недобросъвестното действие включва, но не се ограничава до: използване на подставено лице, на което да се посредничи за сключване на договор с Компанията, искане или получаване на пари от потенциален клиент за посредничество, неидентифициране на потенциалния клиент, измама и др.');
  drawParagraph('Компанията има право да компенсира, прихваща от дължимото възнаграждение на Изпълнителя или от всяка дължима сума на Изпълнителя съгласно Договора, всяка отговорност, задължение или неустойка на Изпълнителя, възникнали във връзка с Договора.');
  drawParagraph('В случай че реално претърпените вреди надвишават сумата на предвидената неустойка по Договора, изправната страна има право на обезщетение за разликата.');

  drawHeading('11. СРОК И ПРЕКРАТЯВАНЕ');
  drawParagraph('Договорът влиза в сила от датата на подписване от двете страни и е безсрочен.');
  drawParagraph('Договорът може да бъде прекратен:');
  drawParagraph('• По взаимно съгласие на Страните, изразено в писмена форма;', { indent: 12 });
  drawParagraph('• с 1 (едно)-месечно писмено предизвестие, изпратено от която и да е от страните до другата страна;', { indent: 12 });
  drawParagraph('• незабавно от Компанията, в случай че настъпи някое от следните обстоятелства: (а) това се изисква съгласно акт на Регулатор; (б) Изпълнителят е действал недобросъвестно, причини вреди на репутацията или интересите на Компанията; (в) Изпълнителят не е в състояние да изплати задълженията си или стане неплатежоспособен; (г) Изпълнителят изпадне в несъстоятелност или ликвидация; (д) възникне конфликт на интереси по отношение на Изпълнителя при извършване на дейностите му, предмет на Договора.', { indent: 12 });
  drawParagraph('Прекратяването на Договора, независимо от причината, не засяга правата на клиентите или партньорите да използват платежните услуги съгласно подписаните споразумения с Компанията.');
  drawParagraph('При прекратяване на Договора, Изпълнителят има право да получава договореното възнаграждение за Търговците, за които е посредничил и които са сключили договор с Компанията за ползване на Платежния терминал преди прекратяване на Договора. Компанията не дължи възнаграждението по предходното изречение, в случай че Договорът е прекратен на някое от основанията по т. 11.2.3.');

  drawHeading('12. ИЗМЕНЕНИЯ В ДОГОВОРА');
  drawParagraph('Компанията има право да променя условията на Договора с едномесечно предварително известие, изпратено в писмена форма до Изпълнителя. Изменението влиза в сила автоматично с изтичане на предварителното известие без изричното съгласие на Изпълнителя, а в случай че Изпълнителят не приема промените, той има право да прекрати едностранно Договора, считано от датата на влизане в сила на изменението.');
  drawParagraph('В случаите, когато изменението се налага поради нормативни причини, като законови промени, инструкция или друг правен акт, приет от регулатор, изменението в споразумението за Изпълнителя влиза в сила с незабавно действие от момента на съобщаването му от Компанията.');

  drawHeading('13. ДРУГИ');
  drawParagraph('Изпълнителят не може да прехвърля на трети лица никакви свои права и задължения, без предварително писмено съгласие на Компанията, което не бива да бъде неоснователно задържано или забавено.');
  drawParagraph('Компанията може да прехвърли свои права или задължения по Договора на трети лица, за което Компанията уведомява Изпълнителя своевременно. Прехвърлянето има сила по отношение на Изпълнителя от момента на уведомяването.');
  drawParagraph('Изпълнителят няма право да възложи на подизпълнители някое от задълженията си по настоящия Договор без предварително писмено съгласие на Компанията, което не бива да бъде неоснователно задържано или забавено. Изпълнителят носи отговорност към Компанията за действията или бездействията на неговите подизпълнители и/или техните служители, както и за неговите собствени.');

  drawHeading('14. КОРЕСПОНДЕНЦИЯ');
  drawParagraph('Всяко известие или друг документ, който ще бъде връчен съгласно Договора, може да бъде доставен или изпратен по пощата или по имейл на адресите на страните, посочени по-долу:');

  drawParagraph('За Компанията:', { bold: true, spaceAfter: 2 });
  drawParagraph('Адрес: гр. София, бул. „Христо Смирненски“ № 78, ет. 4', { indent: 10, spaceAfter: 2 });
  drawParagraph('E-mail: sales@irisbgsf.com', { indent: 10, spaceAfter: 2 });
  drawParagraph('Телефон: 0895 353 594', { indent: 10, spaceAfter: 8 });

  drawParagraph('За Изпълнителя:', { bold: true, spaceAfter: 2 });
  drawRichSegments([{ text: 'Адрес:' }, { text: cleanAddr, bold: true }], { indent: 10, spaceAfter: 2 });
  drawRichSegments([{ text: 'E-mail:' }, { text: contactEmail, bold: true }], { indent: 10, spaceAfter: 2 });
  drawRichSegments([{ text: 'Телефон:' }, { text: contactPhone, bold: true }], { indent: 10, spaceAfter: 8 });

  drawParagraph('В случай на промяна на данните по предходната точка, страната, за която се отнася промяната, е длъжна да уведоми писмено другата страна по договора в срок от 7 /седем/ календарни дни от настъпването й. Ако някоя от страните промени посочените данни и не изпълни задължението си да уведоми другата за промяната, всяка кореспонденция или съобщение на посочените адреси се смятат за валидно получени.');

  drawHeading('15. РАЗНИ');
  drawParagraph('Ако страните не са в състояние да разрешат спорове помежду си, споровете се решават окончателно от компетентните съдилища в София, България по реда на българското законодателство.');
  drawParagraph('Ако някое от условията на Договора е или стане незаконно, невалидно или неприложимо, това не засяга законността, валидността или приложимостта на което да е друго условие в Договора.');
  drawParagraph('Настоящият Договор се изготви и подписа в два еднообразни екземпляра – по един за всяка една от страните. Неизменна част от него е Приложение № 1 – Възнаграждение.');

  drawSignatureRow('За Компанията:', 'За Изпълнителя:');

  // =========================================================================
  // ANNEX 1 (New Page)
  // =========================================================================
  page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  cursorY = MARGIN_T;

  drawParagraph('Приложение 1', { size: 14, lineHeight: 18, bold: true, align: 'center', spaceAfter: 14 });

  // Draw dynamic table for Приложение 1
  const col1W = 36;
  const col2W = 195;
  const col3W = CONTENT_W - col1W - col2W;

  function drawTableRow(cells, { bold = false, bg = null, fontSize = 9.5, lineHeight = 12.5, pad = 6 } = {}) {
    const f = bold ? fontBold : font;
    const wrappedCells = cells.map(c => wrapText(c.text, c.bold ? fontBold : f, fontSize, c.width - pad * 2));
    const maxLines = Math.max(...wrappedCells.map(l => l.length));
    const rowH = maxLines * lineHeight + pad * 2;
    ensureSpace(rowH);

    let x = MARGIN_L;
    cells.forEach((c, idx) => {
      if (bg) {
        page.drawRectangle({ x, y: PAGE_H - cursorY - rowH, width: c.width, height: rowH, color: bg });
      }
      page.drawRectangle({
        x,
        y: PAGE_H - cursorY - rowH,
        width: c.width,
        height: rowH,
        borderWidth: 0.7,
        borderColor: rgb(0.25, 0.25, 0.25)
      });
      const cellFont = c.bold ? fontBold : f;
      wrappedCells[idx].forEach((line, lIdx) => {
        page.drawText(line, {
          x: x + pad,
          y: PAGE_H - cursorY - pad - (lIdx * lineHeight) - fontSize,
          size: fontSize,
          font: cellFont,
          color: rgb(0, 0, 0)
        });
      });
      x += c.width;
    });

    cursorY += rowH;
  }

  const terms = partnerTerms || {
    months: 12,
    includeOneTime: true,
    includePercent: true,
    tiers: [
      { label: 'До 10 търговеца', oneTime: '50', percent: '5' },
      { label: 'От 11 до 50 търговеца', oneTime: '75', percent: '7' },
      { label: 'Над 50 търговеца', oneTime: '100', percent: '10' }
    ]
  };
  const incOneTime = terms.includeOneTime !== false;
  const incPercent = terms.includePercent !== false;
  const monthsVal = Math.max(1, parseInt(terms.months, 10) || 12);
  const activeTiers = (Array.isArray(terms.tiers) && terms.tiers.length > 0)
    ? terms.tiers
    : [{ label: 'За всеки търговец', oneTime: '50', percent: '5' }];

  const descParts = [];
  if (incOneTime) {
    descParts.push('1. Еднократно, при подписване на договор с търговец. Комисионната е дължима в месеца, следващ направена успешна транзакция от страна на търговеца.');
  }
  if (incPercent) {
    const numPrefix = incOneTime ? '2.' : '1.';
    descParts.push(`${numPrefix} Процент от прихода на привлечените от него търговци, за първите ${monthsVal} месеца от срока на договора между Компанията и Търговеца. Комисионната се изплаща ежемесечно на база реализирания нетен приход от търговеца за съответния период.`);
  }
  const rewardDescText = descParts.join(' ') || 'Съгласно договорените условия по-долу.';

  drawTableRow([
    { text: 'No', width: col1W, bold: true },
    { text: 'Услуга', width: col2W, bold: true },
    { text: 'Възнаграждение', width: col3W, bold: true }
  ], { bg: rgb(0.94, 0.96, 0.98) });

  drawTableRow([
    { text: '1.', width: col1W },
    {
      text: 'За всеки привлечен клиент подписал рамков договор за извършване на плащания чрез услугата по иницииране на плащане на Айрис Солюшънс АД и направил минимум 1 успешна трансакция.',
      width: col2W
    },
    {
      text: rewardDescText,
      width: col3W
    }
  ]);

  const tierW = CONTENT_W / activeTiers.length;
  drawTableRow(
    activeTiers.map(t => ({ text: String(t.label || 'Етап'), width: tierW, bold: true })),
    { bg: rgb(0.94, 0.96, 0.98) }
  );

  drawTableRow(
    activeTiers.map(t => {
      const parts = [];
      if (incOneTime) parts.push(`${t.oneTime} EUR еднократно`);
      if (incPercent) parts.push(`${t.percent}% от прихода`);
      return { text: parts.join(' + ') || '—', width: tierW, bold: true };
    })
  );

  cursorY += 14;
  drawParagraph('Посочените възнаграждения са крайни.', { spaceAfter: 4 });
  if (incOneTime && incPercent) {
    drawParagraph('Еднократното възнаграждение и процентът се отнасят само за привлечения клиент в съответната графа, в която попада.', { spaceAfter: 16 });
  } else if (incOneTime) {
    drawParagraph('Еднократното възнаграждение се отнася само за привлечения клиент в съответната графа, в която попада.', { spaceAfter: 16 });
  } else if (incPercent) {
    drawParagraph('Процентът се отнася само за привлечения клиент в съответната графа, в която попада.', { spaceAfter: 16 });
  }

  drawSignatureRow('За Компанията:', 'За Изпълнителя:');

  // Add subtle page numbers
  const allPages = pdfDoc.getPages();
  allPages.forEach((p, idx) => {
    const label = `${idx + 1} / ${allPages.length}`;
    p.drawText(label, {
      x: PAGE_W - MARGIN_R - font.widthOfTextAtSize(label, 9),
      y: 28,
      size: 9,
      font,
      color: rgb(0.45, 0.45, 0.45)
    });
  });

  return await pdfDoc.save({ useObjectStreams: true });
}
