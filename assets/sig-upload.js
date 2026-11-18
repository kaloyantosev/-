/**
 * Shared Signature Image Upload & SVG-to-PNG Normalization Helper
 * Supports PNG, JPG/JPEG, SVG, WebP, GIF across BG, RO, and Partner contracts.
 */
(function (global) {
  'use strict';

  var MAX_PNG_DIM = 1200;
  var SVG_TARGET_LONG_SIDE = 960;

  function parseSvgLength(val) {
    if (!val) return 0;
    var s = String(val).trim();
    if (!s || s.endsWith('%')) return 0;
    var m = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*(px|pt|mm|cm|in)?$/i);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    var unit = (m[2] || 'px').toLowerCase();
    if (unit === 'pt') return n * 1.3333;
    if (unit === 'in') return n * 96;
    if (unit === 'cm') return n * 37.795;
    if (unit === 'mm') return n * 3.7795;
    return n;
  }

  function utf8ToBase64(str) {
    if (typeof TextEncoder !== 'undefined') {
      var bytes = new TextEncoder().encode(str);
      var bin = '';
      for (var i = 0; i < bytes.length; i++) {
        bin += String.fromCharCode(bytes[i]);
      }
      return btoa(bin);
    }
    return btoa(unescape(encodeURIComponent(str)));
  }

  function sanitizeAndSizeSvg(svgText) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(svgText, 'image/svg+xml');
    var svgEl = doc && doc.documentElement;

    if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
      throw new Error('INVALID_SVG');
    }

    // Strip scripts and inline event attributes
    var scripts = svgEl.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      scripts[i].remove();
    }
    var allEls = svgEl.querySelectorAll('*');
    for (var j = 0; j < allEls.length; j++) {
      var attrs = allEls[j].attributes;
      for (var k = attrs.length - 1; k >= 0; k--) {
        if (/^on/i.test(attrs[k].name)) {
          allEls[j].removeAttribute(attrs[k].name);
        }
      }
    }

    if (!svgEl.getAttribute('xmlns')) {
      svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    var vbAttr = svgEl.getAttribute('viewBox');
    var vbW = 0;
    var vbH = 0;
    if (vbAttr) {
      var parts = vbAttr.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && !isNaN(parts[2]) && !isNaN(parts[3]) && parts[2] > 0 && parts[3] > 0) {
        vbW = parts[2];
        vbH = parts[3];
      }
    }

    var attrW = parseSvgLength(svgEl.getAttribute('width'));
    var attrH = parseSvgLength(svgEl.getAttribute('height'));

    var baseW = vbW || attrW || 600;
    var baseH = vbH || attrH || 240;

    if (!vbAttr && attrW > 0 && attrH > 0) {
      svgEl.setAttribute('viewBox', '0 0 ' + attrW + ' ' + attrH);
    } else if (!vbAttr && (!attrW || !attrH)) {
      svgEl.setAttribute('viewBox', '0 0 ' + baseW + ' ' + baseH);
    }

    // Scale proportionally so exported PNG is crisp for PDF embedding
    var scale = SVG_TARGET_LONG_SIDE / Math.max(baseW, baseH);
    var outW = Math.max(200, Math.round(baseW * scale));
    var outH = Math.max(80, Math.round(baseH * scale));

    svgEl.setAttribute('width', String(outW));
    svgEl.setAttribute('height', String(outH));

    var serialized = new XMLSerializer().serializeToString(svgEl);
    var dataUrl = 'data:image/svg+xml;base64,' + utf8ToBase64(serialized);

    return { dataUrl: dataUrl, width: outW, height: outH };
  }

  function renderDataUrlToPng(dataUrl, targetWidth, targetHeight) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var natW = targetWidth || img.naturalWidth || img.width || 800;
          var natH = targetHeight || img.naturalHeight || img.height || 300;
          var ratio = Math.min(1, MAX_PNG_DIM / Math.max(natW, natH));
          var w = Math.max(1, Math.round(natW * ratio));
          var h = Math.max(1, Math.round(natH * ratio));

          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          var pngUrl = canvas.toDataURL('image/png');
          resolve(pngUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = function () {
        reject(new Error('IMAGE_LOAD_ERROR'));
      };
      img.src = dataUrl;
    });
  }

  function readFileAsText(file) {
    if (typeof file.text === 'function') {
      return file.text();
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (ev) { resolve(ev.target.result); };
      reader.onerror = function () { reject(new Error('FILE_READ_ERROR')); };
      reader.readAsText(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (ev) { resolve(ev.target.result); };
      reader.onerror = function () { reject(new Error('FILE_READ_ERROR')); };
      reader.readAsDataURL(file);
    });
  }

  function isSvgFile(file) {
    var type = (file.type || '').toLowerCase();
    var name = (file.name || '').toLowerCase();
    return type.indexOf('svg') !== -1 || /\.svg$/i.test(name);
  }

  function isSupportedImageFile(file) {
    if (!file) return false;
    if (isSvgFile(file)) return true;
    var type = (file.type || '').toLowerCase();
    var name = (file.name || '').toLowerCase();
    if (/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(type)) return true;
    if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) return true;
    return false;
  }

  /**
   * Normalizes any uploaded signature image (SVG, PNG, JPG, WebP, GIF) into a crisp PNG Data URL.
   * For SVG, if canvas export fails for any browser-specific reason, falls back to sanitized SVG Data URL
   * so backend vector fallback can still embed it.
   */
  async function processSignatureFile(file) {
    if (!isSupportedImageFile(file)) {
      throw new Error('UNSUPPORTED_FORMAT');
    }

    if (isSvgFile(file)) {
      var svgText = await readFileAsText(file);
      var prepared = sanitizeAndSizeSvg(svgText);
      try {
        return await renderDataUrlToPng(prepared.dataUrl, prepared.width, prepared.height);
      } catch (canvasErr) {
        console.warn('[Signature Upload] Canvas SVG rasterization fallback to SVG data URI:', canvasErr);
        return prepared.dataUrl;
      }
    }

    var rawUrl = await readFileAsDataUrl(file);
    try {
      return await renderDataUrlToPng(rawUrl);
    } catch (rasterErr) {
      // Keep original PNG/JPEG if canvas somehow fails
      return rawUrl;
    }
  }

  function bindSignatureUpload(opts) {
    var fileInput = opts.fileInput;
    var dropzone = opts.dropzone;
    var previewImg = opts.previewImg;
    var previewWrapper = opts.previewWrapper;
    var onLoaded = opts.onLoaded;
    var onError = opts.onError;

    async function handleFile(file) {
      if (!file) return;
      try {
        var normalizedDataUrl = await processSignatureFile(file);
        if (previewImg) previewImg.src = normalizedDataUrl;
        if (previewWrapper) previewWrapper.style.display = 'block';
        if (typeof onLoaded === 'function') onLoaded(normalizedDataUrl, file);
      } catch (err) {
        if (typeof onError === 'function') onError(err, file);
      }
    }

    if (fileInput) {
      fileInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) handleFile(file);
      });
    }

    if (dropzone) {
      dropzone.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = '#2563eb';
        dropzone.style.background = '#eff6ff';
      });
      dropzone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = '';
        dropzone.style.background = '';
      });
      dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = '';
        dropzone.style.background = '';
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleFile(file);
      });
    }
  }

  global.irisProcessSignatureFile = processSignatureFile;
  global.irisBindSignatureUpload = bindSignatureUpload;
})(window);
