import { rgb } from 'pdf-lib';

function parseCssColor(raw) {
  if (!raw) return null;
  const val = String(raw).trim().toLowerCase();
  if (!val || val === 'none' || val === 'transparent') return 'none';
  if (val === 'currentcolor' || val === 'black') return rgb(0, 0, 0);
  if (val === 'white') return rgb(1, 1, 1);
  if (val === 'blue') return rgb(0, 0, 1);
  if (val === 'navy') return rgb(0, 0, 0.5);

  const hex3 = val.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (hex3) {
    return rgb(
      parseInt(hex3[1] + hex3[1], 16) / 255,
      parseInt(hex3[2] + hex3[2], 16) / 255,
      parseInt(hex3[3] + hex3[3], 16) / 255
    );
  }
  const hex6 = val.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i);
  if (hex6) {
    return rgb(
      parseInt(hex6[1], 16) / 255,
      parseInt(hex6[2], 16) / 255,
      parseInt(hex6[3], 16) / 255
    );
  }
  const rgbMatch = val.match(/^rgba?\(\s*([0-9.]+)\s*[,\s]\s*([0-9.]+)\s*[,\s]\s*([0-9.]+)/i);
  if (rgbMatch) {
    return rgb(
      Math.min(1, Number(rgbMatch[1]) / 255),
      Math.min(1, Number(rgbMatch[2]) / 255),
      Math.min(1, Number(rgbMatch[3]) / 255)
    );
  }
  return rgb(0, 0, 0);
}

function getAttr(attrStr, name) {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = attrStr.match(re);
  return m ? (m[1] !== undefined ? m[1] : m[2]) : null;
}

function getStyleProp(styleStr, prop) {
  if (!styleStr) return null;
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
  const m = styleStr.match(re);
  return m ? m[1].trim() : null;
}

function pointsToPath(pointsStr, close = false) {
  const nums = String(pointsStr || '').trim().match(/-?[0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?/gi);
  if (!nums || nums.length < 4) return null;
  const parts = [`M ${nums[0]} ${nums[1]}`];
  for (let i = 2; i + 1 < nums.length; i += 2) {
    parts.push(`L ${nums[i]} ${nums[i + 1]}`);
  }
  if (close) parts.push('Z');
  return parts.join(' ');
}

function parseSvgToDrawable(svgText) {
  const svgOpenMatch = svgText.match(/<svg\b([^>]*)>/i);
  const svgAttrs = svgOpenMatch ? svgOpenMatch[1] : '';

  let vx = 0, vy = 0, vw = 0, vh = 0;
  const vbRaw = getAttr(svgAttrs, 'viewBox');
  if (vbRaw) {
    const nums = vbRaw.trim().split(/[\s,]+/).map(Number);
    if (nums.length === 4 && nums.every(n => !isNaN(n)) && nums[2] > 0 && nums[3] > 0) {
      [vx, vy, vw, vh] = nums;
    }
  }
  if (!vw || !vh) {
    const wRaw = parseFloat(getAttr(svgAttrs, 'width') || '0');
    const hRaw = parseFloat(getAttr(svgAttrs, 'height') || '0');
    vw = wRaw > 0 ? wRaw : 300;
    vh = hRaw > 0 ? hRaw : 100;
  }

  const rootStyle = getAttr(svgAttrs, 'style') || '';
  const rootFill = getStyleProp(rootStyle, 'fill') || getAttr(svgAttrs, 'fill');
  const rootStroke = getStyleProp(rootStyle, 'stroke') || getAttr(svgAttrs, 'stroke');
  const rootStrokeW = parseFloat(getStyleProp(rootStyle, 'stroke-width') || getAttr(svgAttrs, 'stroke-width') || '1') || 1;

  const shapes = [];
  const tagRe = /<(path|polyline|polygon|line|rect|circle|ellipse)\b([^>]*?)\/?>/gi;
  let match;
  while ((match = tagRe.exec(svgText)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const style = getAttr(attrs, 'style') || '';

    let d = null;
    if (tag === 'path') {
      d = getAttr(attrs, 'd');
    } else if (tag === 'polyline') {
      d = pointsToPath(getAttr(attrs, 'points'), false);
    } else if (tag === 'polygon') {
      d = pointsToPath(getAttr(attrs, 'points'), true);
    } else if (tag === 'line') {
      const x1 = parseFloat(getAttr(attrs, 'x1') || '0');
      const y1 = parseFloat(getAttr(attrs, 'y1') || '0');
      const x2 = parseFloat(getAttr(attrs, 'x2') || '0');
      const y2 = parseFloat(getAttr(attrs, 'y2') || '0');
      d = `M ${x1} ${y1} L ${x2} ${y2}`;
    } else if (tag === 'rect') {
      const x = parseFloat(getAttr(attrs, 'x') || '0');
      const y = parseFloat(getAttr(attrs, 'y') || '0');
      const w = parseFloat(getAttr(attrs, 'width') || '0');
      const h = parseFloat(getAttr(attrs, 'height') || '0');
      if (w > 0 && h > 0) {
        d = `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
      }
    } else if (tag === 'circle') {
      const cx = parseFloat(getAttr(attrs, 'cx') || '0');
      const cy = parseFloat(getAttr(attrs, 'cy') || '0');
      const r = parseFloat(getAttr(attrs, 'r') || '0');
      if (r > 0) {
        d = `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
      }
    } else if (tag === 'ellipse') {
      const cx = parseFloat(getAttr(attrs, 'cx') || '0');
      const cy = parseFloat(getAttr(attrs, 'cy') || '0');
      const rx = parseFloat(getAttr(attrs, 'rx') || '0');
      const ry = parseFloat(getAttr(attrs, 'ry') || '0');
      if (rx > 0 && ry > 0) {
        d = `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
      }
    }

    if (!d || !d.trim()) continue;

    const rawFill = getStyleProp(style, 'fill') || getAttr(attrs, 'fill') || rootFill;
    const rawStroke = getStyleProp(style, 'stroke') || getAttr(attrs, 'stroke') || rootStroke;
    const strokeW = parseFloat(getStyleProp(style, 'stroke-width') || getAttr(attrs, 'stroke-width') || String(rootStrokeW)) || rootStrokeW;

    const parsedFill = rawFill ? parseCssColor(rawFill) : (tag === 'line' || tag === 'polyline' ? 'none' : rgb(0, 0, 0));
    const parsedStroke = rawStroke ? parseCssColor(rawStroke) : 'none';

    shapes.push({
      d: d.trim(),
      fillColor: parsedFill === 'none' ? undefined : parsedFill,
      strokeColor: parsedStroke === 'none' ? undefined : parsedStroke,
      strokeWidth: strokeW
    });
  }

  if (shapes.length === 0) return null;

  return {
    type: 'svg',
    width: vw,
    height: vh,
    scaleToFit(maxWidth, maxHeight) {
      const ratio = Math.min(maxWidth / vw, maxHeight / vh);
      return { width: vw * ratio, height: vh * ratio };
    },
    draw(page, { x, y, width, height }) {
      const scale = Math.min(width / vw, height / vh);
      const originX = x - vx * scale;
      const originY = y + height + vy * scale;
      for (const s of shapes) {
        try {
          const opts = { x: originX, y: originY, scale };
          if (s.fillColor) opts.color = s.fillColor;
          if (s.strokeColor) {
            opts.borderColor = s.strokeColor;
            opts.borderWidth = Math.max(0.4, s.strokeWidth * scale);
          }
          page.drawSvgPath(s.d, opts);
        } catch (_) {}
      }
    }
  };
}

function wrapPdfImage(img) {
  return {
    type: 'image',
    image: img,
    width: img.width,
    height: img.height,
    scaleToFit(maxWidth, maxHeight) {
      return img.scaleToFit(maxWidth, maxHeight);
    },
    draw(page, { x, y, width, height }) {
      page.drawImage(img, { x, y, width, height });
    }
  };
}

/**
 * Embeds any signature input (PNG, JPEG, or SVG data URI / base64 / raw XML)
 * into a unified drawable compatible with scaleToFit(maxW, maxH) and draw(page, { x, y, width, height }).
 */
export async function embedSignature(pdfDoc, signatureInput) {
  if (!signatureInput || typeof signatureInput !== 'string') return null;
  const trimmed = signatureInput.trim();
  if (!trimmed) return null;

  try {
    // Raw XML SVG text
    if (trimmed.startsWith('<') && /<svg[\s>]/i.test(trimmed)) {
      return parseSvgToDrawable(trimmed);
    }

    // Data URI
    const dataUriMatch = trimmed.match(/^data:([^;,]+)(;[^,]*)?,([\s\S]*)$/i);
    if (dataUriMatch) {
      const mime = dataUriMatch[1].toLowerCase().trim();
      const params = (dataUriMatch[2] || '').toLowerCase();
      const payload = dataUriMatch[3] || '';

      if (mime.includes('svg')) {
        const svgText = params.includes(';base64')
          ? Buffer.from(payload.trim(), 'base64').toString('utf-8')
          : (() => {
              try { return decodeURIComponent(payload); } catch { return payload; }
            })();
        return parseSvgToDrawable(svgText);
      }

      const imgBytes = Buffer.from(payload.trim(), 'base64');
      if (mime.includes('jpeg') || mime.includes('jpg')) {
        return wrapPdfImage(await pdfDoc.embedJpg(imgBytes));
      }
      if (mime.includes('png')) {
        return wrapPdfImage(await pdfDoc.embedPng(imgBytes));
      }
      // Sniff magic bytes
      if (imgBytes.length >= 3 && imgBytes[0] === 0xFF && imgBytes[1] === 0xD8 && imgBytes[2] === 0xFF) {
        return wrapPdfImage(await pdfDoc.embedJpg(imgBytes));
      }
      return wrapPdfImage(await pdfDoc.embedPng(imgBytes));
    }

    // Plain base64 without data: prefix
    const bytes = Buffer.from(trimmed, 'base64');
    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return wrapPdfImage(await pdfDoc.embedPng(bytes));
    }
    if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return wrapPdfImage(await pdfDoc.embedJpg(bytes));
    }
    const asText = bytes.toString('utf-8').trim();
    if (asText.startsWith('<') && /<svg[\s>]/i.test(asText)) {
      return parseSvgToDrawable(asText);
    }

    try {
      return wrapPdfImage(await pdfDoc.embedPng(bytes));
    } catch {
      return wrapPdfImage(await pdfDoc.embedJpg(bytes));
    }
  } catch (err) {
    console.warn('[Signature Embed] Could not embed signature:', err.message);
    return null;
  }
}
