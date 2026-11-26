// High-Resolution 4-Quadrant "Mural do Dia" Poster Generator & Editable Studio
import { normalizeEntry, formatEntryDateParts, getEntry, saveEntry } from './db.js';
import { ICONS, getMoodById } from './icons.js';
import { shareSingleFile, saveSingleFileToDiarioFolder } from './export.js';

const POSTER_W = 2160;
const BASE_POSTER_H = 2700;
const EXPORT_QUAD_W = 2880;
const STRIP_W = 1440;
const MAX_EXPORT_H = 14800;
const SIGNATURE_TEXT = 'Hylley Medeiros';
const SIGNATURE_FONT_STACK = "'Dancing Script', 'Brush Script MT', 'Segoe Script', 'Snell Roundhand', 'Caveat', cursive";
const KEY_PHRASE_MAX_LEN = 60;
const KEY_PHRASE_PRESETS = [
  'Foco & Construção',
  'Família & Gratidão',
  'Virada de Chave',
  'Flow & Criação',
  'Dia de Superação'
];

const PALETTES = [
  {
    id: 'ouro-obsidiana',
    name: 'Ouro & Obsidiana',
    bg: '#111113',
    headerText: '#F5F1EA',
    headerSub: '#A79F93',
    accent: '#D4B483',
    border: 'rgba(212, 180, 131, 0.28)',
    q1Bg: '#1D1B18',
    q1Text: '#F3EEE6',
    q1Badge: '#D4B483',
    q2Bg: '#17191C',
    q2Text: '#EAEFF5',
    q2Badge: '#C5B08E',
    q3Bg: '#1A1E1B',
    q3Card: '#232925',
    q3Text: '#E9F0EA',
    q3Badge: '#9CC1A3',
    q4Bg: '#1D181B',
    q4Card: '#262024',
    q4Text: '#F3EAEF',
    q4Badge: '#D49BA8'
  },
  {
    id: 'papel-grafite',
    name: 'Papel & Grafite',
    bg: '#ECE6DA',
    headerText: '#1F1D1A',
    headerSub: '#6B645A',
    accent: '#9A7440',
    border: 'rgba(31, 29, 26, 0.14)',
    q1Bg: '#FAF7F0',
    q1Text: '#22201D',
    q1Badge: '#9A7440',
    q2Bg: '#E4DCCE',
    q2Text: '#24211C',
    q2Badge: '#7D5C31',
    q3Bg: '#DCE4DE',
    q3Card: '#EEF3EF',
    q3Text: '#1D2820',
    q3Badge: '#4A6E53',
    q4Bg: '#E2E0EA',
    q4Card: '#F1EFF6',
    q4Text: '#23202D',
    q4Badge: '#5B537B'
  },
  {
    id: 'noite-atlantica',
    name: 'Noite Atlântica',
    bg: '#0C121D',
    headerText: '#F0F4FA',
    headerSub: '#8FA2BD',
    accent: '#7EC8C8',
    border: 'rgba(126, 200, 200, 0.25)',
    q1Bg: '#131D2E',
    q1Text: '#EDF3FC',
    q1Badge: '#7EC8C8',
    q2Bg: '#11222A',
    q2Text: '#E8F6F8',
    q2Badge: '#D4B483',
    q3Bg: '#161B2E',
    q3Card: '#1E253D',
    q3Text: '#E9EEFA',
    q3Badge: '#95A9EA',
    q4Bg: '#181E27',
    q4Card: '#222A36',
    q4Text: '#EFF3F8',
    q4Badge: '#E0B97C'
  },
  {
    id: 'terracota-areia',
    name: 'Terracota & Areia',
    bg: '#16110F',
    headerText: '#F7EFE9',
    headerSub: '#B7A295',
    accent: '#D98E6B',
    border: 'rgba(217, 142, 107, 0.28)',
    q1Bg: '#231915',
    q1Text: '#F8EFE8',
    q1Badge: '#E3A483',
    q2Bg: '#1E1A14',
    q2Text: '#F3ECE2',
    q2Badge: '#D4B483',
    q3Bg: '#1A1E18',
    q3Card: '#242921',
    q3Text: '#ECEFE9',
    q3Badge: '#A6BE8F',
    q4Bg: '#22171D',
    q4Card: '#2D1E26',
    q4Text: '#F6EAF0',
    q4Badge: '#D694AF'
  }
];

const FONT_MODES = [
  { id: 'auto', label: 'Auto' },
  { id: 'small', label: 'P', size: 28 },
  { id: 'medium', label: 'M', size: 35 },
  { id: 'large', label: 'G', size: 42 }
];

function buildInitialNarrative(entry) {
  const parts = [];
  if (entry.authorQuote.trim()) {
    parts.push(`“${entry.authorQuote.trim()}”`);
  }
  if (entry.content.trim()) {
    parts.push(entry.content.trim());
  }
  if (!entry.content.trim() && entry.timelineMoments.length > 0) {
    const timelineText = entry.timelineMoments
      .map((m) => `${m.time} — ${m.title || m.note || ''}`.trim())
      .filter(Boolean)
      .join('\n');
    if (timelineText) parts.push(timelineText);
  }
  if (entry.nightReflection.trim() && !entry.content.trim()) {
    parts.push(`Olhar da noite:\n${entry.nightReflection.trim()}`);
  }
  if (parts.length === 0) {
    const good = (entry.goodThings || []).map((g) => g.trim()).filter(Boolean);
    if (good.length > 0) {
      parts.push(good.map((g, i) => `${i + 1}. ${g}`).join('\n'));
    }
  }
  return parts.join('\n\n');
}

function closeBitmap(bmp) {
  if (bmp && typeof bmp.close === 'function') {
    try {
      bmp.close();
    } catch {
      // already closed or detached
    }
  }
}

function loadImageElementFromBlob(blob) {
  return new Promise((resolve) => {
    if (!blob) return resolve(null);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function decodePreviewBitmap(blob, maxSide = 720) {
  if (!blob) return { bitmap: null, width: 0, height: 0 };
  let full = null;
  if (typeof createImageBitmap === 'function') {
    try {
      full = await createImageBitmap(blob);
    } catch {
      full = null;
    }
  }
  if (!full) {
    full = await loadImageElementFromBlob(blob);
  }
  if (!full) return { bitmap: null, width: 0, height: 0 };

  const origW = full.naturalWidth || full.width || 0;
  const origH = full.naturalHeight || full.height || 0;
  if (!origW || !origH) {
    closeBitmap(full);
    return { bitmap: null, width: 0, height: 0 };
  }

  const longest = Math.max(origW, origH);
  if (longest <= maxSide) {
    return { bitmap: full, width: origW, height: origH };
  }

  const scale = maxSide / longest;
  const cw = Math.max(1, Math.round(origW * scale));
  const ch = Math.max(1, Math.round(origH * scale));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(full, 0, 0, cw, ch);
  closeBitmap(full);
  return { bitmap: c, width: origW, height: origH };
}

async function decodeOriginalBitmap(blob) {
  if (!blob) return null;
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fallback to HTMLImageElement if createImageBitmap rejects format/EXIF
    }
  }
  return loadImageElementFromBlob(blob);
}

function extractVideoThumbnail(blob) {
  return new Promise((resolve) => {
    if (!blob) return resolve(null);
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    let settled = false;

    const finish = (canvasOrNull) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(canvasOrNull);
    };

    const timer = setTimeout(() => finish(null), 2600);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const captureFrame = () => {
      try {
        const vw = video.videoWidth || 0;
        const vh = video.videoHeight || 0;
        if (!vw || !vh) return finish(null);
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(vw, vh));
        const cw = Math.max(1, Math.round(vw * scale));
        const ch = Math.max(1, Math.round(vh * scale));
        const c = document.createElement('canvas');
        c.width = cw;
        c.height = ch;
        const cx = c.getContext('2d');
        cx.drawImage(video, 0, 0, cw, ch);
        finish(c);
      } catch {
        finish(null);
      }
    };

    video.onloadeddata = () => {
      const targetTime = video.duration && isFinite(video.duration)
        ? Math.min(0.6, Math.max(0.05, video.duration * 0.15))
        : 0.1;
      if (targetTime > 0.05) {
        try {
          video.currentTime = targetTime;
        } catch {
          captureFrame();
        }
      } else {
        captureFrame();
      }
    };
    video.onseeked = captureFrame;
    video.onerror = () => finish(null);
    video.src = url;
  });
}

// ============================================================================
// Canvas Drawing Primitives (logical 2160 x 2700 coordinate space)
// ============================================================================
function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function drawCoverImage(ctx, imgSource, x, y, w, h, radius = 18) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.clip();

  const sw = imgSource.videoWidth || imgSource.naturalWidth || imgSource.width;
  const sh = imgSource.videoHeight || imgSource.naturalHeight || imgSource.height;
  if (sw && sh) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const scale = Math.max(w / sw, h / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.drawImage(imgSource, dx, dy, dw, dh);
  }
  ctx.restore();
}

function wrapTextLines(ctx, text, maxWidth) {
  const rawParagraphs = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const lines = [];

  for (const para of rawParagraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        // Break overly long single tokens gracefully
        if (ctx.measureText(word).width > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }

  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function truncateLine(ctx, text, maxWidth) {
  const s = String(text || '');
  if (ctx.measureText(s).width <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function drawQuadrantBox(ctx, x, y, w, h, bgColor, borderColor, badgeColor, label, countText) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 34);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  // Quadrant label pill
  const padX = 46;
  const padTop = 44;
  ctx.font = '700 23px "Inter", system-ui, sans-serif';
  ctx.fillStyle = badgeColor;
  ctx.textBaseline = 'top';
  ctx.fillText(label.toUpperCase(), x + padX, y + padTop);

  if (countText) {
    ctx.font = '600 22px "Inter", system-ui, sans-serif';
    ctx.globalAlpha = 0.78;
    const cw = ctx.measureText(countText).width;
    ctx.fillText(countText, x + w - padX - cw, y + padTop);
    ctx.globalAlpha = 1;
  }

  // Subtle divider line below quadrant header
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + padX, y + 92);
  ctx.lineTo(x + w - padX, y + 92);
  ctx.stroke();

  ctx.restore();
}

function drawEmptyQuadrantHint(ctx, x, y, w, h, color, message) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.48;
  ctx.font = '500 28px "Inter", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, x + w / 2, y + h / 2 + 24);
  ctx.restore();
}

function drawTextQuadrant(ctx, rect, palette, narrativeText, fontMode) {
  drawQuadrantBox(ctx, rect.x, rect.y, rect.w, rect.h, palette.q1Bg, palette.border, palette.q1Badge, 'Relato do Dia', '');

  const text = String(narrativeText || '').trim();
  if (!text) {
    drawEmptyQuadrantHint(ctx, rect.x, rect.y, rect.w, rect.h, palette.q1Text, 'Sem relato escrito neste dia');
    return;
  }

  const innerX = rect.x + 50;
  const innerY = rect.y + 124;
  const innerW = rect.w - 100;
  const innerH = rect.h - 172;

  let chosenSize = 32;
  let chosenLines = [];
  const modeDef = FONT_MODES.find((f) => f.id === fontMode);

  if (modeDef && modeDef.size) {
    chosenSize = modeDef.size;
    ctx.font = `400 ${chosenSize}px "Inter", "Segoe UI", system-ui, sans-serif`;
    chosenLines = wrapTextLines(ctx, text, innerW);
  } else {
    // Auto-fit font size between 44px and 24px for crisp readability
    for (let sz = 44; sz >= 24; sz -= 2) {
      ctx.font = `400 ${sz}px "Inter", "Segoe UI", system-ui, sans-serif`;
      const lines = wrapTextLines(ctx, text, innerW);
      const lineH = Math.round(sz * 1.48);
      if (lines.length * lineH <= innerH) {
        chosenSize = sz;
        chosenLines = lines;
        break;
      }
      if (sz === 24) {
        chosenSize = 24;
        chosenLines = lines;
      }
    }
  }

  const lineH = Math.round(chosenSize * 1.48);
  const maxLines = Math.max(1, Math.floor(innerH / lineH));

  ctx.save();
  ctx.font = `400 ${chosenSize}px "Inter", "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = palette.q1Text;
  ctx.textBaseline = 'top';

  const visible = chosenLines.slice(0, maxLines);
  if (chosenLines.length > maxLines && visible.length > 0) {
    const lastIdx = visible.length - 1;
    visible[lastIdx] = truncateLine(ctx, `${visible[lastIdx]}…`, innerW);
  }

  visible.forEach((line, idx) => {
    if (line !== '') {
      ctx.fillText(line, innerX, innerY + idx * lineH);
    }
  });
  ctx.restore();
}

function distributeRows(x, y, w, h, rowSpecs, g = 16) {
  const numRows = rowSpecs.length;
  if (numRows === 0) return [];
  const totalGaps = Math.max(0, numRows - 1) * g;
  const availH = Math.max(60, h - totalGaps);
  const weightSum = rowSpecs.reduce((acc, r) => acc + r.weight, 0);
  const slots = [];
  let curY = y;
  let usedH = 0;

  rowSpecs.forEach((spec, rIdx) => {
    const rowH = rIdx === numRows - 1
      ? Math.max(40, availH - usedH)
      : Math.round((availH * spec.weight) / weightSum);
    usedH += rowH;

    const cols = spec.cols;
    const colW = (w - (cols - 1) * g) / cols;
    for (let c = 0; c < cols; c++) {
      slots.push({
        x: x + c * (colW + g),
        y: curY,
        w: colW,
        h: rowH
      });
    }
    curY += rowH + g;
  });

  return slots;
}

function computePhotoGridSlots(x, y, w, h, count, g = 16) {
  if (count <= 0) return [];
  if (count === 1) return distributeRows(x, y, w, h, [{ cols: 1, weight: 1 }], g);
  if (count === 2) return distributeRows(x, y, w, h, [{ cols: 1, weight: 1 }, { cols: 1, weight: 1 }], g);
  if (count === 3) return distributeRows(x, y, w, h, [{ cols: 1, weight: 52 }, { cols: 2, weight: 48 }], g);
  if (count === 4) return distributeRows(x, y, w, h, [{ cols: 2, weight: 1 }, { cols: 2, weight: 1 }], g);
  if (count === 5) return distributeRows(x, y, w, h, [{ cols: 1, weight: 44 }, { cols: 2, weight: 28 }, { cols: 2, weight: 28 }], g);
  if (count === 6) return distributeRows(x, y, w, h, [{ cols: 2, weight: 1 }, { cols: 2, weight: 1 }, { cols: 2, weight: 1 }], g);
  if (count === 7) return distributeRows(x, y, w, h, [{ cols: 1, weight: 32 }, { cols: 2, weight: 22.66 }, { cols: 2, weight: 22.66 }, { cols: 2, weight: 22.68 }], g);
  if (count === 8) return distributeRows(x, y, w, h, [{ cols: 1, weight: 28 }, { cols: 2, weight: 25 }, { cols: 2, weight: 25 }, { cols: 3, weight: 22 }], g);
  if (count === 9) return distributeRows(x, y, w, h, [{ cols: 1, weight: 28 }, { cols: 2, weight: 18 }, { cols: 2, weight: 18 }, { cols: 2, weight: 18 }, { cols: 2, weight: 18 }], g);

  const rem = count - 1;
  const hasThreeRow = rem % 2 === 1;
  const twoRows = hasThreeRow ? Math.max(0, (rem - 3) / 2) : rem / 2;
  const specs = [{ cols: 1, weight: 540 }];
  for (let i = 0; i < twoRows; i++) specs.push({ cols: 2, weight: 420 });
  if (hasThreeRow) specs.push({ cols: 3, weight: 340 });
  return distributeRows(x, y, w, h, specs, g);
}

function computeMinPhotosQuadrantHeight(count) {
  if (count <= 6) return 0;
  if (count === 7) return 1640;
  if (count === 8) return 1780;
  if (count === 9) return 1940;
  const rem = count - 1;
  const hasThreeRow = rem % 2 === 1;
  const twoRows = hasThreeRow ? Math.max(0, (rem - 3) / 2) : rem / 2;
  return 160 + 540 + twoRows * 420 + (hasThreeRow ? 340 : 0) + (twoRows + (hasThreeRow ? 1 : 0)) * 16;
}

async function drawPhotosQuadrant(ctx, rect, palette, photoEntries, { highRes = false } = {}) {
  const total = photoEntries.length;
  drawQuadrantBox(
    ctx,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    palette.q2Bg,
    palette.border,
    palette.q2Badge,
    'Fotos',
    total > 0 ? `${total}` : ''
  );

  if (total === 0) {
    drawEmptyQuadrantHint(ctx, rect.x, rect.y, rect.w, rect.h, palette.q2Text, 'Nenhuma foto selecionada');
    return;
  }

  const x = rect.x + 42;
  const y = rect.y + 118;
  const w = rect.w - 84;
  const h = rect.h - 160;
  const g = 16;

  const slots = computePhotoGridSlots(x, y, w, h, total, g);

  for (let idx = 0; idx < slots.length; idx++) {
    const slot = slots[idx];
    const item = photoEntries[idx];
    let drew = false;

    if (item && highRes && item.blob) {
      const origBmp = await decodeOriginalBitmap(item.blob);
      try {
        if (origBmp) {
          drawCoverImage(ctx, origBmp, slot.x, slot.y, slot.w, slot.h, 20);
          drew = true;
        }
      } finally {
        closeBitmap(origBmp);
      }
    } else if (item && item.bitmap) {
      drawCoverImage(ctx, item.bitmap, slot.x, slot.y, slot.w, slot.h, 20);
      drew = true;
    }

    if (!drew) {
      ctx.save();
      roundRectPath(ctx, slot.x, slot.y, slot.w, slot.h, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.restore();
    }
  }
}

function formatSec(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function drawAudioCardList(ctx, x, y, w, cardH, gap, palette, audioEntries, maxVisible = audioEntries.length, cols = 1) {
  const total = audioEntries.length;
  const list = audioEntries.slice(0, maxVisible);
  const colCount = Math.max(1, cols);
  const colGap = 18;
  const cardW = colCount > 1 ? (w - (colCount - 1) * colGap) / colCount : w;

  list.forEach((au, idx) => {
    const col = idx % colCount;
    const row = Math.floor(idx / colCount);
    const cxPos = x + col * (cardW + colGap);
    const cy = y + row * (cardH + gap);

    ctx.save();
    roundRectPath(ctx, cxPos, cy, cardW, cardH, 22);
    ctx.fillStyle = palette.q3Card;
    ctx.fill();

    // Play circle
    const cx = cxPos + 52;
    const midY = cy + cardH / 2;
    ctx.beginPath();
    ctx.arc(cx, midY, 28, 0, Math.PI * 2);
    ctx.fillStyle = palette.q3Badge;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx - 7, midY - 11);
    ctx.lineTo(cx + 13, midY);
    ctx.lineTo(cx - 7, midY + 11);
    ctx.closePath();
    ctx.fillStyle = palette.q3Bg;
    ctx.fill();

    // Title & meta
    const textX = cxPos + 102;
    const durText = formatSec(au.duration || 0);
    ctx.font = '700 25px "Inter", system-ui, sans-serif';
    const durW = ctx.measureText(durText).width;
    const maxTitleW = cardW - 102 - durW - 170;
    const titleStr = (au.title || '').trim() || `Nota de áudio ${idx + 1}`;
    ctx.fillStyle = palette.q3Text;
    ctx.font = '700 28px "Inter", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    const titleTopOffset = Math.round(cardH * 0.19);
    const metaTopOffset = Math.round(cardH * 0.52);
    ctx.fillText(truncateLine(ctx, titleStr, Math.max(120, maxTitleW)), textX, cy + titleTopOffset);

    // Sub-meta
    const dt = new Date(au.recordedAt || au.createdAt || Date.now());
    const hhmm = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const origin = au.source === 'file' ? 'Arquivo' : 'Gravação';
    ctx.font = '500 21px "Inter", system-ui, sans-serif';
    ctx.globalAlpha = 0.7;
    ctx.fillText(`${origin} · ${hhmm}`, textX, cy + metaTopOffset);
    ctx.globalAlpha = 1;

    // Decorative waveform bars
    const waveX = cxPos + cardW - durW - 140;
    const heights = [12, 22, 16, 28, 19, 25, 13];
    ctx.fillStyle = palette.q3Badge;
    ctx.globalAlpha = 0.55;
    heights.forEach((bh, bIdx) => {
      const bx = waveX + bIdx * 12;
      roundRectPath(ctx, bx, midY - bh / 2, 6, bh, 3);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Duration pill on right
    ctx.fillStyle = palette.q3Badge;
    ctx.font = '700 25px "Inter", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(durText, cxPos + cardW - durW - 28, midY);

    ctx.restore();
  });

  if (total > maxVisible) {
    const visibleRows = Math.ceil(list.length / colCount);
    ctx.save();
    ctx.fillStyle = palette.q3Badge;
    ctx.font = '600 22px "Inter", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`+ ${total - maxVisible} áudio(s) adicional(is)`, x + 6, y + visibleRows * (cardH + gap) + 4);
    ctx.restore();
  }
}

function drawAudiosQuadrant(ctx, rect, palette, audioEntries) {
  const total = audioEntries.length;
  drawQuadrantBox(
    ctx,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    palette.q3Bg,
    palette.border,
    palette.q3Badge,
    'Áudios',
    total > 0 ? `${total}` : ''
  );

  if (total === 0) {
    drawEmptyQuadrantHint(ctx, rect.x, rect.y, rect.w, rect.h, palette.q3Text, 'Nenhum áudio selecionado');
    return;
  }

  const cols = rect.cols || 1;
  const maxVisible = rect.maxVisible || (cols === 2 ? 8 : 5);
  const cardH = rect.cardH || 118;
  drawAudioCardList(ctx, rect.x + 42, rect.y + 116, rect.w - 84, cardH, 16, palette, audioEntries, maxVisible, cols);
}

function drawVideosQuadrant(ctx, rect, palette, videoEntries) {
  const total = videoEntries.length;
  drawQuadrantBox(
    ctx,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    palette.q4Bg,
    palette.border,
    palette.q4Badge,
    'Vídeos',
    total > 0 ? `${total}` : ''
  );

  if (total === 0) {
    drawEmptyQuadrantHint(ctx, rect.x, rect.y, rect.w, rect.h, palette.q4Text, 'Nenhum vídeo selecionado');
    return;
  }

  const x = rect.x + 42;
  const y = rect.y + 118;
  const w = rect.w - 84;
  const h = rect.h - 158;
  const g = 16;

  const isFullWidth = Boolean(rect.fullWidth);
  const maxVis = isFullWidth ? 6 : 4;
  const visible = videoEntries.slice(0, maxVis);
  const slots = [];

  if (isFullWidth) {
    if (visible.length <= 4) {
      const cols = visible.length;
      const slotW = (w - (cols - 1) * g) / cols;
      for (let c = 0; c < cols; c++) {
        slots.push({ x: x + c * (slotW + g), y, w: slotW, h });
      }
    } else {
      const cols = 3;
      const rows = 2;
      const slotW = (w - 2 * g) / 3;
      const slotH = (h - g) / 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (r * cols + c < visible.length) {
            slots.push({ x: x + c * (slotW + g), y: y + r * (slotH + g), w: slotW, h: slotH });
          }
        }
      }
    }
  } else if (visible.length === 1) {
    slots.push({ x, y, w, h });
  } else if (visible.length === 2) {
    const halfW = (w - g) / 2;
    slots.push({ x, y, w: halfW, h });
    slots.push({ x: x + halfW + g, y, w: halfW, h });
  } else if (visible.length === 3) {
    const topH = Math.round((h - g) * 0.56);
    const botH = h - g - topH;
    const halfW = (w - g) / 2;
    slots.push({ x, y, w, h: topH });
    slots.push({ x, y: y + topH + g, w: halfW, h: botH });
    slots.push({ x: x + halfW + g, y: y + topH + g, w: halfW, h: botH });
  } else {
    const halfW = (w - g) / 2;
    const halfH = (h - g) / 2;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        slots.push({ x: x + c * (halfW + g), y: y + r * (halfH + g), w: halfW, h: halfH });
      }
    }
  }

  slots.forEach((slot, idx) => {
    const vid = visible[idx];
    ctx.save();
    roundRectPath(ctx, slot.x, slot.y, slot.w, slot.h, 22);
    ctx.fillStyle = palette.q4Card;
    ctx.fill();

    if (vid.thumb) {
      drawCoverImage(ctx, vid.thumb, slot.x, slot.y, slot.w, slot.h, 22);
    }

    // Bottom dark gradient scrim for title readability
    roundRectPath(ctx, slot.x, slot.y, slot.w, slot.h, 22);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, slot.y + slot.h * 0.45, 0, slot.y + slot.h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(slot.x, slot.y, slot.w, slot.h);

    // Center play badge
    const cx = slot.x + slot.w / 2;
    const cy = slot.y + slot.h / 2 - 12;
    const r = visible.length === 1 ? 44 : 32;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(18, 18, 18, 0.72)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = palette.q4Badge;
    ctx.stroke();

    const tri = r * 0.36;
    ctx.beginPath();
    ctx.moveTo(cx - tri * 0.65, cy - tri);
    ctx.lineTo(cx + tri * 1.15, cy);
    ctx.lineTo(cx - tri * 0.65, cy + tri);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Video caption or filename at bottom
    const rawLabel = (vid.caption || '').trim() || (vid.name || '').replace(/\.[^.]+$/, '') || `Vídeo ${idx + 1}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 22px "Inter", system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(truncateLine(ctx, rawLabel, slot.w - 36), slot.x + 18, slot.y + slot.h - 16);

    if (idx === slots.length - 1 && total > slots.length) {
      ctx.fillStyle = 'rgba(10, 10, 12, 0.62)';
      ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 50px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${total - slots.length}`, slot.x + slot.w / 2, slot.y + slot.h / 2);
    }

    ctx.restore();
  });
}

function getSelectedPhotos(state) {
  if (!Array.isArray(state.selectedPhotoOrder)) return [];
  return state.selectedPhotoOrder
    .map((idx) => state.photos[idx])
    .filter(Boolean);
}

function drawMuralFooter(ctx, {
  width,
  padX,
  dividerY,
  footY,
  tags,
  fallbackLeft,
  brand,
  palette,
  showSignature,
  maxTagsW,
  sigSize = 44
}) {
  ctx.save();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, dividerY);
  ctx.lineTo(width - padX, dividerY);
  ctx.stroke();

  ctx.font = '600 22px "Inter", system-ui, sans-serif';
  ctx.fillStyle = palette.headerSub;
  ctx.textBaseline = 'top';
  const leftText = Array.isArray(tags) && tags.length > 0
    ? tags.slice(0, 6).map((t) => `#${t}`).join('   ')
    : fallbackLeft;
  if (leftText) {
    ctx.fillText(truncateLine(ctx, leftText, maxTagsW), padX, footY);
  }

  if (showSignature) {
    ctx.save();
    ctx.font = `italic 600 ${sigSize}px ${SIGNATURE_FONT_STACK}`;
    ctx.fillStyle = palette.accent;
    ctx.globalAlpha = 0.94;
    ctx.textBaseline = 'top';
    const sigW = ctx.measureText(SIGNATURE_TEXT).width;
    ctx.fillText(SIGNATURE_TEXT, width - padX - sigW, dividerY + 16);

    ctx.font = '700 17px "Inter", system-ui, sans-serif';
    ctx.fillStyle = palette.headerSub;
    ctx.globalAlpha = 0.68;
    const brandW = ctx.measureText(brand).width;
    ctx.fillText(brand, width - padX - brandW, dividerY + 69);
    ctx.restore();
  } else {
    ctx.font = '700 22px "Inter", system-ui, sans-serif';
    ctx.fillStyle = palette.accent;
    const brandW = ctx.measureText(brand).width;
    ctx.fillText(brand, width - padX - brandW, footY);
  }

  ctx.restore();
}

function drawKeyPhraseSeal(ctx, { x, y, maxW, text, palette, fontSize = 23, pillH = 46 }) {
  const raw = String(text || '').trim();
  if (!raw) return;

  ctx.save();
  const star = '✦ ';
  ctx.font = `700 ${fontSize - 2}px "Inter", system-ui, sans-serif`;
  const starW = ctx.measureText(star).width;

  ctx.font = `600 ${fontSize}px "Inter", "Segoe UI", system-ui, sans-serif`;
  const padX = 20;
  const labelText = truncateLine(ctx, raw, Math.max(80, maxW - padX * 2 - starW));
  const textW = ctx.measureText(labelText).width;
  const pillW = Math.min(maxW, Math.ceil(padX * 2 + starW + textW));
  const midY = y + pillH / 2 + 1;

  roundRectPath(ctx, x, y, pillW, pillH, pillH / 2);
  ctx.fillStyle = palette.q1Bg;
  ctx.fill();

  ctx.globalAlpha = 0.78;
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = palette.accent;
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${fontSize - 2}px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = palette.accent;
  ctx.fillText(star, x + padX, midY);

  ctx.font = `600 ${fontSize}px "Inter", "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = palette.headerText;
  ctx.fillText(labelText, x + padX + starW, midY);
  ctx.restore();
}

function measureQuadrantsLayout(ctx, state) {
  const palette = PALETTES.find((p) => p.id === state.paletteId) || PALETTES[0];
  const entry = state.entry;
  const parts = formatEntryDateParts(entry.dateKey, entry.timeStr);
  const mood = getMoodById(entry.mood);

  const padX = 88;
  const fullW = POSTER_W - padX * 2; // 1984
  const gap = 28;
  const colW = (fullW - gap) / 2; // 978

  // 1. Dynamic Header
  const metaY = 78;
  const dateHeader = `${parts.day} DE ${parts.monthFull.toUpperCase()} DE ${parts.year}  ·  ${parts.weekday.toUpperCase()}  ·  ${parts.time}`;
  const rightMeta = entry.isMilestone
    ? `★ ${(entry.milestoneTitle || 'Evento Marcante').trim()}  ·  ${mood.label}`
    : `Humor: ${mood.label}`;
  const mainTitle = entry.title.trim() || `Cápsula de ${parts.day} de ${parts.monthFull}`;
  ctx.font = '700 66px "Playfair Display", Georgia, serif';
  const titleLines = wrapTextLines(ctx, mainTitle, fullW).slice(0, 2);

  const keyPhrase = String(state.keyPhrase || '').trim().slice(0, KEY_PHRASE_MAX_LEN);
  const keyPhraseH = 46;
  let keyPhraseY = null;
  let headerDividerY = titleLines.length > 1 ? 310 : 236;
  if (keyPhrase) {
    keyPhraseY = 132 + titleLines.length * 78 + 14;
    headerDividerY = keyPhraseY + keyPhraseH + 24;
  }
  const gridTop = headerDividerY + 32;

  const showSig = Boolean(state.showSignature);
  const footerH = showSig ? 136 : 104;
  const selectedPhotos = getSelectedPhotos(state);
  const selectedAudios = state.audios.filter((_, i) => state.selectedAudioIds.has(i));
  const selectedVideos = state.videos.filter((_, i) => state.selectedVideoIds.has(i));

  const minPhotosH = computeMinPhotosQuadrantHeight(selectedPhotos.length);
  const hasAudios = selectedAudios.length > 0;
  const hasVideos = selectedVideos.length > 0;

  let rowHTop;
  let q3 = null;
  let q4 = null;
  let gridBottom;

  if (!hasAudios && !hasVideos) {
    // Expand top row to fill ~88%+ of poster height with zero empty bottom gap
    rowHTop = Math.max(minPhotosH, BASE_POSTER_H - gridTop - footerH);
    gridBottom = gridTop + rowHTop;
  } else if (hasAudios && !hasVideos) {
    const audioCols = selectedAudios.length === 1 ? 1 : 2;
    const audioMaxVis = 8;
    const audioCardH = 114;
    const audioRows = Math.ceil(Math.min(selectedAudios.length, audioMaxVis) / audioCols);
    const extraNoteH = selectedAudios.length > audioMaxVis ? 36 : 0;
    const rowHBot = Math.min(720, Math.max(270, 116 + audioRows * audioCardH + Math.max(0, audioRows - 1) * 16 + extraNoteH + 40));
    rowHTop = Math.max(minPhotosH, 1280, BASE_POSTER_H - gridTop - gap - rowHBot - footerH);
    const botY = gridTop + rowHTop + gap;
    q3 = { x: padX, y: botY, w: fullW, h: rowHBot, cols: audioCols, maxVisible: audioMaxVis, cardH: audioCardH };
    gridBottom = botY + rowHBot;
  } else if (!hasAudios && hasVideos) {
    const vc = selectedVideos.length;
    const rowHBot = vc === 1 ? 574 : vc === 2 ? 534 : vc === 3 ? 494 : vc === 4 ? 464 : 750;
    rowHTop = Math.max(minPhotosH, 1280, BASE_POSTER_H - gridTop - gap - rowHBot - footerH);
    const botY = gridTop + rowHTop + gap;
    q4 = { x: padX, y: botY, w: fullW, h: rowHBot, fullWidth: true };
    gridBottom = botY + rowHBot;
  } else {
    const audioCardH = 116;
    const audioRows = Math.min(selectedAudios.length, 5);
    const extraNoteH = selectedAudios.length > 5 ? 34 : 0;
    const audioNeedH = 116 + audioRows * audioCardH + Math.max(0, audioRows - 1) * 16 + extraNoteH + 40;
    const vc = selectedVideos.length;
    const videoNeedH = vc === 1 ? 540 : vc === 2 ? 480 : 660;
    const rowHBot = Math.min(860, Math.max(420, audioNeedH, videoNeedH));
    rowHTop = Math.max(minPhotosH, 1280, BASE_POSTER_H - gridTop - gap - rowHBot - footerH);
    const botY = gridTop + rowHTop + gap;
    q3 = { x: padX, y: botY, w: colW, h: rowHBot, cols: 1, maxVisible: 5, cardH: audioCardH };
    q4 = { x: padX + colW + gap, y: botY, w: colW, h: rowHBot, fullWidth: false };
    gridBottom = botY + rowHBot;
  }

  const q1 = { x: padX, y: gridTop, w: colW, h: rowHTop };
  const q2 = { x: padX + colW + gap, y: gridTop, w: colW, h: rowHTop };

  const footerDividerY = gridBottom + 24;
  const footY = footerDividerY + (showSig ? 36 : 26);
  const totalH = footerDividerY + (showSig ? 112 : 80);

  return {
    palette,
    entry,
    parts,
    padX,
    fullW,
    metaY,
    dateHeader,
    rightMeta,
    titleLines,
    keyPhrase,
    keyPhraseY,
    keyPhraseH,
    headerDividerY,
    q1,
    q2,
    q3,
    q4,
    selectedPhotos,
    selectedAudios,
    selectedVideos,
    footerDividerY,
    footY,
    totalH
  };
}

async function renderDayMuralCanvas(canvas, state, { precomputedLayout = null, highRes = false } = {}) {
  const ctx = canvas.getContext('2d');
  const layout = precomputedLayout || measureQuadrantsLayout(ctx, state);
  const { palette, entry, parts } = layout;
  const scale = canvas.width / POSTER_W;

  ctx.save();
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Poster Background
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, POSTER_W, layout.totalH);

  // 2. Editorial Header
  ctx.font = '700 24px "Inter", system-ui, sans-serif';
  ctx.fillStyle = palette.accent;
  ctx.textBaseline = 'top';
  ctx.fillText(layout.dateHeader, layout.padX, layout.metaY);

  ctx.font = '600 23px "Inter", system-ui, sans-serif';
  ctx.fillStyle = palette.headerSub;
  const rightW = ctx.measureText(layout.rightMeta).width;
  ctx.fillText(truncateLine(ctx, layout.rightMeta, 780), POSTER_W - layout.padX - Math.min(rightW, 780), layout.metaY);

  ctx.font = '700 66px "Playfair Display", Georgia, serif';
  ctx.fillStyle = palette.headerText;
  layout.titleLines.forEach((line, idx) => {
    const str = idx === 1 && layout.titleLines.length === 2 ? truncateLine(ctx, line, layout.fullW) : line;
    ctx.fillText(str, layout.padX, 132 + idx * 78);
  });

  if (layout.keyPhrase && layout.keyPhraseY != null) {
    drawKeyPhraseSeal(ctx, {
      x: layout.padX,
      y: layout.keyPhraseY,
      maxW: layout.fullW,
      text: layout.keyPhrase,
      palette,
      fontSize: 23,
      pillH: layout.keyPhraseH
    });
  }

  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(layout.padX, layout.headerDividerY);
  ctx.lineTo(POSTER_W - layout.padX, layout.headerDividerY);
  ctx.stroke();

  // 3. Adaptive Quadrants
  drawTextQuadrant(ctx, layout.q1, palette, state.narrativeText, state.fontMode);
  await drawPhotosQuadrant(ctx, layout.q2, palette, layout.selectedPhotos, { highRes });
  if (layout.q3) {
    drawAudiosQuadrant(ctx, layout.q3, palette, layout.selectedAudios);
  }
  if (layout.q4) {
    drawVideosQuadrant(ctx, layout.q4, palette, layout.selectedVideos);
  }

  // 4. Thin Elegant Footer + Optional Signature
  drawMuralFooter(ctx, {
    width: POSTER_W,
    padX: layout.padX,
    dividerY: layout.footerDividerY,
    footY: layout.footY,
    tags: entry.tags,
    fallbackLeft: `${parts.day} ${parts.monthShort} ${parts.year} · ${parts.time}`,
    brand: 'DIÁRIO DE BORDO  ·  MURAL DO DIA',
    palette,
    showSignature: Boolean(state.showSignature),
    maxTagsW: 1120,
    sigSize: 44
  });

  ctx.restore();
}

// ============================================================================
// Continuous Vertical Strip ("Tira Vertical Contínua") Renderer
// ============================================================================
function measureVerticalStripLayout(ctx, state) {
  const palette = PALETTES.find((p) => p.id === state.paletteId) || PALETTES[0];
  const entry = state.entry;
  const parts = formatEntryDateParts(entry.dateKey, entry.timeStr);
  const mood = getMoodById(entry.mood);

  const padX = 64;
  const blockW = STRIP_W - padX * 2; // 1312
  const innerPadX = 44;
  const innerW = blockW - innerPadX * 2; // 1224

  // 1. Editorial Header
  const metaY = 72;
  const dateHeader = `${parts.day} DE ${parts.monthFull.toUpperCase()} DE ${parts.year}  ·  ${parts.weekday.toUpperCase()}  ·  ${parts.time}`;
  const titleY = 124;
  const mainTitle = entry.title.trim() || `Cápsula de ${parts.day} de ${parts.monthFull}`;
  ctx.font = '700 62px "Playfair Display", Georgia, serif';
  const titleLines = wrapTextLines(ctx, mainTitle, blockW).slice(0, 3);
  const titleLineH = 74;
  let cursorY = titleY + titleLines.length * titleLineH + 18;

  const keyPhrase = String(state.keyPhrase || '').trim().slice(0, KEY_PHRASE_MAX_LEN);
  const keyPhraseH = 46;
  let keyPhraseY = null;
  if (keyPhrase) {
    keyPhraseY = cursorY;
    cursorY += keyPhraseH + 16;
  }

  // Mood / Milestone / Sealed pills
  const badges = [{ text: `Humor: ${mood.label}`, bg: palette.q1Bg, border: palette.border, fg: palette.headerText }];
  if (entry.isMilestone) {
    badges.push({
      text: `★ ${(entry.milestoneTitle || 'Evento Marcante').trim()}`,
      bg: palette.q1Bg,
      border: palette.accent,
      fg: palette.accent
    });
  }
  if (entry.isSealed) {
    badges.push({
      text: '✓ Cápsula Selada',
      bg: palette.q3Bg,
      border: palette.q3Badge,
      fg: palette.q3Badge
    });
  }

  ctx.font = '600 22px "Inter", system-ui, sans-serif';
  const pillRows = [];
  let curRow = [];
  let curRowW = 0;
  for (const badge of badges) {
    const labelText = truncateLine(ctx, badge.text, blockW - 44);
    const pw = Math.ceil(ctx.measureText(labelText).width) + 40;
    if (curRow.length > 0 && curRowW + 12 + pw > blockW) {
      pillRows.push(curRow);
      curRow = [{ ...badge, text: labelText, w: pw }];
      curRowW = pw;
    } else {
      curRow.push({ ...badge, text: labelText, w: pw });
      curRowW += (curRow.length > 1 ? 12 : 0) + pw;
    }
  }
  if (curRow.length > 0) pillRows.push(curRow);

  const pillsStartY = cursorY;
  const pillH = 44;
  const pillRowGap = 12;
  cursorY += pillRows.length * (pillH + pillRowGap) + 12;
  const dividerY = cursorY;
  cursorY += 34;

  // 2. Full Narrative Text Block (never cuts paragraphs)
  const modeDef = FONT_MODES.find((f) => f.id === state.fontMode);
  const narrativeRaw = String(state.narrativeText || '').trim();
  let fontSize = 34;
  if (modeDef && modeDef.size) {
    fontSize = modeDef.size;
  } else if (narrativeRaw.length < 240) {
    fontSize = 38;
  } else if (narrativeRaw.length > 1800) {
    fontSize = 32;
  }

  const lineH = Math.round(fontSize * 1.54);
  const paraGapH = Math.round(lineH * 0.55);
  ctx.font = `400 ${fontSize}px "Inter", "Segoe UI", system-ui, sans-serif`;
  const lines = narrativeRaw ? wrapTextLines(ctx, narrativeRaw, innerW) : [];
  const textBodyH = lines.length > 0
    ? lines.reduce((acc, ln) => acc + (ln === '' ? paraGapH : lineH), 0)
    : 84;

  const textBlock = {
    x: padX,
    y: cursorY,
    w: blockW,
    h: 116 + textBodyH + 46,
    textStartX: padX + innerPadX,
    textStartY: cursorY + 116,
    fontSize,
    lineH,
    paraGapH,
    lines,
    narrativeRaw
  };
  cursorY += textBlock.h + 34;

  // 3. Full-Width Stacked Photos Block
  const selectedPhotos = getSelectedPhotos(state);
  let photosBlock = null;
  if (selectedPhotos.length > 0) {
    const photoGap = 28;
    let py = cursorY + 116;
    const items = [];
    for (const ph of selectedPhotos) {
      const sw = ph.naturalWidth || (ph.bitmap ? (ph.bitmap.naturalWidth || ph.bitmap.width) : 0) || ph.width || 0;
      const sh = ph.naturalHeight || (ph.bitmap ? (ph.bitmap.naturalHeight || ph.bitmap.height) : 0) || ph.height || 0;
      const rawRatio = sw > 0 && sh > 0 ? sh / sw : 0.75;
      const ratio = Math.max(0.56, Math.min(1.18, rawRatio));
      const imgH = Math.round(innerW * ratio);
      const capStr = (ph.caption || '').trim();
      let capLines = [];
      if (capStr) {
        ctx.font = '500 24px "Inter", system-ui, sans-serif';
        capLines = wrapTextLines(ctx, capStr, innerW - 12).slice(0, 3);
      }
      const capH = capLines.length > 0 ? 14 + capLines.length * 34 : 0;
      items.push({
        photo: ph,
        x: padX + innerPadX,
        y: py,
        w: innerW,
        h: imgH,
        capLines,
        capY: py + imgH + 14
      });
      py += imgH + capH + photoGap;
    }
    const photosH = py - photoGap - cursorY + 44;
    photosBlock = { x: padX, y: cursorY, w: blockW, h: photosH, items };
    cursorY += photosH + 34;
  }

  // 4. Discreet Audios Block (only when selected)
  const selectedAudios = state.audios.filter((_, i) => state.selectedAudioIds.has(i));
  let audiosBlock = null;
  if (selectedAudios.length > 0) {
    const cardH = 112;
    const cardGap = 16;
    const listH = selectedAudios.length * cardH + Math.max(0, selectedAudios.length - 1) * cardGap;
    const boxH = 112 + listH + 40;
    audiosBlock = {
      x: padX,
      y: cursorY,
      w: blockW,
      h: boxH,
      innerX: padX + innerPadX,
      innerY: cursorY + 112,
      cardH,
      cardGap,
      items: selectedAudios
    };
    cursorY += boxH + 34;
  }

  // 5. Discreet Videos Block (only when selected)
  const selectedVideos = state.videos.filter((_, i) => state.selectedVideoIds.has(i));
  let videosBlock = null;
  if (selectedVideos.length > 0) {
    const cols = selectedVideos.length === 1 ? 1 : 2;
    const tileGap = 22;
    const tileW = cols === 1 ? innerW : (innerW - tileGap) / 2;
    const tileH = cols === 1 ? 520 : 380;
    const rows = Math.ceil(selectedVideos.length / cols);
    const gridH = rows * tileH + Math.max(0, rows - 1) * tileGap;
    const boxH = 112 + gridH + 42;
    videosBlock = {
      x: padX,
      y: cursorY,
      w: blockW,
      h: boxH,
      cols,
      tileGap,
      tileW,
      tileH,
      innerX: padX + innerPadX,
      innerY: cursorY + 112,
      items: selectedVideos
    };
    cursorY += boxH + 34;
  }

  // 6. Footer
  const showSig = Boolean(state.showSignature);
  const footerDividerY = cursorY + 4;
  const footY = footerDividerY + (showSig ? 36 : 30);
  const totalH = footerDividerY + (showSig ? 112 : 96);

  return {
    palette,
    entry,
    parts,
    padX,
    blockW,
    innerW,
    metaY,
    dateHeader,
    titleY,
    titleLines,
    titleLineH,
    keyPhrase,
    keyPhraseY,
    keyPhraseH,
    pillRows,
    pillsStartY,
    pillH,
    pillRowGap,
    dividerY,
    textBlock,
    photosBlock,
    audiosBlock,
    videosBlock,
    footerDividerY,
    footY,
    totalH
  };
}

async function renderVerticalStripCanvas(canvas, state, precomputedLayout = null, { highRes = false } = {}) {
  const ctx = canvas.getContext('2d');
  const layout = precomputedLayout || measureVerticalStripLayout(ctx, state);
  const { palette, entry } = layout;
  const scale = canvas.width / STRIP_W;

  ctx.save();
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Continuous Background
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, STRIP_W, layout.totalH);

  // 2. Header Meta & Title
  ctx.font = '700 24px "Inter", system-ui, sans-serif';
  ctx.fillStyle = palette.accent;
  ctx.textBaseline = 'top';
  ctx.fillText(truncateLine(ctx, layout.dateHeader, layout.blockW), layout.padX, layout.metaY);

  ctx.font = '700 62px "Playfair Display", Georgia, serif';
  ctx.fillStyle = palette.headerText;
  layout.titleLines.forEach((line, idx) => {
    const str = idx === layout.titleLines.length - 1 && layout.titleLines.length === 3
      ? truncateLine(ctx, line, layout.blockW)
      : line;
    ctx.fillText(str, layout.padX, layout.titleY + idx * layout.titleLineH);
  });

  if (layout.keyPhrase && layout.keyPhraseY != null) {
    drawKeyPhraseSeal(ctx, {
      x: layout.padX,
      y: layout.keyPhraseY,
      maxW: layout.blockW,
      text: layout.keyPhrase,
      palette,
      fontSize: 22,
      pillH: layout.keyPhraseH
    });
  }

  // Status Pills (Mood, Milestone, Sealed)
  ctx.font = '600 22px "Inter", system-ui, sans-serif';
  layout.pillRows.forEach((row, rIdx) => {
    let px = layout.padX;
    const py = layout.pillsStartY + rIdx * (layout.pillH + layout.pillRowGap);
    row.forEach((pill) => {
      ctx.save();
      roundRectPath(ctx, px, py, pill.w, layout.pillH, 22);
      ctx.fillStyle = pill.bg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = pill.border;
      ctx.stroke();

      ctx.fillStyle = pill.fg;
      ctx.textBaseline = 'middle';
      ctx.fillText(pill.text, px + 20, py + layout.pillH / 2 + 1);
      ctx.restore();
      px += pill.w + 12;
    });
  });

  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(layout.padX, layout.dividerY);
  ctx.lineTo(STRIP_W - layout.padX, layout.dividerY);
  ctx.stroke();

  // 3. Narrative Text Block
  const tb = layout.textBlock;
  drawQuadrantBox(ctx, tb.x, tb.y, tb.w, tb.h, palette.q1Bg, palette.border, palette.q1Badge, 'Relato do Dia', '');
  if (!tb.narrativeRaw) {
    drawEmptyQuadrantHint(ctx, tb.x, tb.y, tb.w, tb.h, palette.q1Text, 'Sem relato escrito neste dia');
  } else {
    ctx.save();
    ctx.font = `400 ${tb.fontSize}px "Inter", "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = palette.q1Text;
    ctx.textBaseline = 'top';
    let ly = tb.textStartY;
    tb.lines.forEach((line) => {
      if (line === '') {
        ly += tb.paraGapH;
      } else {
        ctx.fillText(line, tb.textStartX, ly);
        ly += tb.lineH;
      }
    });
    ctx.restore();
  }

  // 4. Stacked High-Res Photos Block (streaming original blobs on export)
  if (layout.photosBlock) {
    const pb = layout.photosBlock;
    drawQuadrantBox(
      ctx,
      pb.x,
      pb.y,
      pb.w,
      pb.h,
      palette.q2Bg,
      palette.border,
      palette.q2Badge,
      'Fotos',
      `${pb.items.length}`
    );

    for (const item of pb.items) {
      ctx.save();
      roundRectPath(ctx, item.x, item.y, item.w, item.h, 22);
      ctx.fillStyle = '#121214';
      ctx.fill();

      let drew = false;
      if (highRes && item.photo.blob) {
        const origBmp = await decodeOriginalBitmap(item.photo.blob);
        try {
          if (origBmp) {
            drawCoverImage(ctx, origBmp, item.x, item.y, item.w, item.h, 22);
            drew = true;
          }
        } finally {
          closeBitmap(origBmp);
        }
      } else if (item.photo.bitmap) {
        drawCoverImage(ctx, item.photo.bitmap, item.x, item.y, item.w, item.h, 22);
        drew = true;
      }

      if (!drew) {
        ctx.fillStyle = palette.q2Text;
        ctx.globalAlpha = 0.5;
        ctx.font = '500 24px "Inter", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Carregando foto...', item.x + item.w / 2, item.y + item.h / 2);
        ctx.globalAlpha = 1;
      }

      roundRectPath(ctx, item.x, item.y, item.w, item.h, 22);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      if (item.capLines.length > 0) {
        ctx.fillStyle = palette.q2Text;
        ctx.globalAlpha = 0.85;
        ctx.font = '500 24px "Inter", system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        item.capLines.forEach((cLine, cIdx) => {
          ctx.fillText(cLine, item.x + 6, item.capY + cIdx * 34);
        });
      }
      ctx.restore();
    }
  }

  // 5. Discreet Audios Block
  if (layout.audiosBlock) {
    const ab = layout.audiosBlock;
    drawQuadrantBox(
      ctx,
      ab.x,
      ab.y,
      ab.w,
      ab.h,
      palette.q3Bg,
      palette.border,
      palette.q3Badge,
      'Áudios',
      `${ab.items.length}`
    );
    drawAudioCardList(ctx, ab.innerX, ab.innerY, layout.innerW, ab.cardH, ab.cardGap, palette, ab.items, ab.items.length);
  }

  // 6. Discreet Videos Block
  if (layout.videosBlock) {
    const vb = layout.videosBlock;
    drawQuadrantBox(
      ctx,
      vb.x,
      vb.y,
      vb.w,
      vb.h,
      palette.q4Bg,
      palette.border,
      palette.q4Badge,
      'Vídeos',
      `${vb.items.length}`
    );

    vb.items.forEach((vid, idx) => {
      const col = idx % vb.cols;
      const row = Math.floor(idx / vb.cols);
      const sx = vb.innerX + col * (vb.tileW + vb.tileGap);
      const sy = vb.innerY + row * (vb.tileH + vb.tileGap);

      ctx.save();
      roundRectPath(ctx, sx, sy, vb.tileW, vb.tileH, 22);
      ctx.fillStyle = palette.q4Card;
      ctx.fill();

      if (vid.thumb) {
        drawCoverImage(ctx, vid.thumb, sx, sy, vb.tileW, vb.tileH, 22);
      }

      roundRectPath(ctx, sx, sy, vb.tileW, vb.tileH, 22);
      ctx.clip();
      const grad = ctx.createLinearGradient(0, sy + vb.tileH * 0.45, 0, sy + vb.tileH);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.78)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx, sy, vb.tileW, vb.tileH);

      const cx = sx + vb.tileW / 2;
      const cy = sy + vb.tileH / 2 - 12;
      const r = vb.cols === 1 ? 42 : 32;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(18, 18, 18, 0.72)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = palette.q4Badge;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - r * 0.25, cy - r * 0.36);
      ctx.lineTo(cx + r * 0.44, cy);
      ctx.lineTo(cx - r * 0.25, cy + r * 0.36);
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      const rawLabel = (vid.caption || '').trim() || (vid.name || '').replace(/\.[^.]+$/, '') || `Vídeo ${idx + 1}`;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 22px "Inter", system-ui, sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.fillText(truncateLine(ctx, rawLabel, vb.tileW - 36), sx + 18, sy + vb.tileH - 16);

      ctx.restore();
    });
  }

  // 7. Continuous Footer + Optional Signature
  drawMuralFooter(ctx, {
    width: STRIP_W,
    padX: layout.padX,
    dividerY: layout.footerDividerY,
    footY: layout.footY,
    tags: entry.tags,
    fallbackLeft: `${layout.parts.day} ${layout.parts.monthShort} ${layout.parts.year} · ${layout.parts.time}`,
    brand: 'DIÁRIO DE BORDO  ·  TIRA CONTÍNUA',
    palette,
    showSignature: Boolean(state.showSignature),
    maxTagsW: 680,
    sigSize: 40
  });

  ctx.restore();
}

// ============================================================================
// Editable Studio UI (#day-mural-screen)
// ============================================================================
export async function openDayMuralStudio(rawEntry, { onToast, onOpenLightbox, onEntryUpdated } = {}) {
  const screen = document.getElementById('day-mural-screen');
  if (!screen) return;

  const entry = normalizeEntry(rawEntry);
  const parts = formatEntryDateParts(entry.dateKey, entry.timeStr);
  const initialKeyPhrase = (entry.muralKeyPhrase || '').trim().slice(0, KEY_PHRASE_MAX_LEN);
  let lastSavedKeyPhrase = initialKeyPhrase;
  let persistTimer = null;
  let persistQueue = Promise.resolve();

  const state = {
    entry,
    layoutMode: 'quadrants', // 'quadrants' | 'strip'
    paletteId: 'ouro-obsidiana',
    fontMode: 'auto',
    format: 'png', // 'png' | 'jpeg'
    showSignature: true,
    keyPhrase: initialKeyPhrase,
    narrativeText: buildInitialNarrative(entry),
    photos: entry.photos.map((p) => ({ ...p, bitmap: null, naturalWidth: 0, naturalHeight: 0 })),
    audios: entry.audios.map((a) => ({ ...a })),
    videos: entry.videos.map((v) => ({ ...v, thumb: null })),
    selectedPhotoOrder: entry.photos.map((_, i) => i),
    selectedAudioIds: new Set(entry.audios.map((_, i) => i)),
    selectedVideoIds: new Set(entry.videos.map((_, i) => i))
  };

  let photoThumbUrls = [];
  let refreshCanvas = () => {};
  let renderSeq = 0;

  const persistKeyPhrase = () => {
    clearTimeout(persistTimer);
    persistTimer = null;
    const cleaned = String(state.keyPhrase || '').trim().slice(0, KEY_PHRASE_MAX_LEN);
    if (cleaned === lastSavedKeyPhrase) return persistQueue;
    lastSavedKeyPhrase = cleaned;
    persistQueue = persistQueue.then(async () => {
      try {
        const fresh = await getEntry(entry.id);
        if (!fresh || fresh.muralKeyPhrase === cleaned) return;
        const updated = await saveEntry({ ...fresh, muralKeyPhrase: cleaned });
        entry.muralKeyPhrase = cleaned;
        await onEntryUpdated?.(updated);
      } catch {
        // Non-blocking persistence failure; mural generation still proceeds
      }
    });
    return persistQueue;
  };

  const schedulePersistKeyPhrase = () => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistKeyPhrase();
    }, 320);
  };

  const revokeThumbUrls = () => {
    photoThumbUrls.forEach((u) => URL.revokeObjectURL(u));
    photoThumbUrls = [];
  };

  const releasePreviewMedia = () => {
    state.photos.forEach((p) => {
      if (p.bitmap) {
        closeBitmap(p.bitmap);
        if (typeof p.bitmap.getContext === 'function') {
          p.bitmap.width = 1;
          p.bitmap.height = 1;
        }
        p.bitmap = null;
      }
    });
    state.videos.forEach((v) => {
      if (v.thumb && typeof v.thumb.getContext === 'function') {
        v.thumb.width = 1;
        v.thumb.height = 1;
        v.thumb = null;
      }
    });
  };

  const closeStudio = () => {
    renderSeq++;
    persistKeyPhrase();
    revokeThumbUrls();
    releasePreviewMedia();
    screen.classList.remove('open');
  };

  const renderStudioMarkup = () => {
    revokeThumbUrls();
    photoThumbUrls = state.photos.map((ph) => URL.createObjectURL(ph.blob));

    const photoThumbsHtml = state.photos.length
      ? state.photos.map((_, idx) => {
          const pos = state.selectedPhotoOrder.indexOf(idx);
          const sel = pos !== -1;
          return `
            <button type="button" class="mural-pick-thumb ${sel ? 'selected' : ''}" data-ms-photo="${idx}" title="Foto ${idx + 1}">
              <img src="${photoThumbUrls[idx]}" alt="Foto ${idx + 1}">
              <span class="mp-check ${pos === 0 ? 'is-hero' : ''}">${sel ? pos + 1 : ''}</span>
            </button>
          `;
        }).join('')
      : `<p class="helper-caption">Nenhuma foto anexada neste dia.</p>`;

    const audioChipsHtml = state.audios.length
      ? state.audios.map((au, idx) => {
          const sel = state.selectedAudioIds.has(idx);
          const label = (au.title || '').trim() || `Nota ${idx + 1}`;
          return `
            <button type="button" class="mural-pick-chip ${sel ? 'selected' : ''}" data-ms-audio="${idx}">
              <span>${escapeHtml(label)} · ${formatSec(au.duration || 0)}</span>
            </button>
          `;
        }).join('')
      : `<p class="helper-caption">Nenhum áudio anexado neste dia.</p>`;

    const videoChipsHtml = state.videos.length
      ? state.videos.map((vid, idx) => {
          const sel = state.selectedVideoIds.has(idx);
          const label = (vid.caption || '').trim() || (vid.name || '').replace(/\.[^.]+$/, '') || `Vídeo ${idx + 1}`;
          return `
            <button type="button" class="mural-pick-chip ${sel ? 'selected' : ''}" data-ms-video="${idx}">
              <span>${escapeHtml(label)}</span>
            </button>
          `;
        }).join('')
      : `<p class="helper-caption">Nenhum vídeo anexado neste dia.</p>`;

    screen.innerHTML = `
      <div class="editor-surface paper-deep">
        <header class="editor-topbar">
          <button type="button" class="icon-btn" id="ms-close" aria-label="Fechar">${ICONS.close}</button>
          <div class="editor-topbar-center">
            <span class="capsule-header-tag" id="ms-header-tag">Mural do Dia · 4 Quadrantes</span>
          </div>
          <div class="editor-topbar-right">
            <div class="mural-format-toggle" role="group" aria-label="Formato">
              <button type="button" class="mfmt-btn ${state.format === 'png' ? 'active' : ''}" data-ms-fmt="png">PNG</button>
              <button type="button" class="mfmt-btn ${state.format === 'jpeg' ? 'active' : ''}" data-ms-fmt="jpeg">JPG</button>
            </div>
          </div>
        </header>

        <div class="editor-scroll">
          <!-- Live High-Detail Preview -->
          <div class="mural-studio-preview-wrap">
            <div class="mural-preview-frame ${state.layoutMode === 'strip' ? 'mural-strip-scroll' : ''}" id="ms-preview-frame">
              <canvas id="ms-preview-canvas" class="mural-preview-canvas ${state.layoutMode === 'strip' ? 'strip-mode' : ''}" width="720" height="900" title="Toque para ampliar"></canvas>
            </div>
            <span class="mural-preview-hint" id="ms-preview-hint">Prévia ao vivo · Exportação em 2880 × 3600 px · Toque para ampliar</span>
          </div>

          <div class="mural-studio-controls">
            <!-- Layout Mode Selector -->
            <section class="card mural-control-card">
              <label class="field-label">Modo de Composição</label>
              <div class="mural-mode-grid">
                <button type="button" class="mural-mode-btn ${state.layoutMode === 'quadrants' ? 'active' : ''}" data-ms-mode="quadrants">
                  <strong>4 Quadrantes</strong>
                  <span>Grade adaptativa · 2880 px · alta nitidez</span>
                </button>
                <button type="button" class="mural-mode-btn ${state.layoutMode === 'strip' ? 'active' : ''}" data-ms-mode="strip">
                  <strong>Tira Vertical Contínua</strong>
                  <span>Rolo amplo 1440 px · zoom nítido na galeria</span>
                </button>
              </div>
            </section>

            <!-- Palette Picker -->
            <section class="card mural-control-card">
              <label class="field-label">Paleta de Cores</label>
              <div class="mural-palette-grid">
                ${PALETTES.map((pal) => `
                  <button type="button" class="mural-palette-btn ${state.paletteId === pal.id ? 'active' : ''}" data-ms-pal="${pal.id}">
                    <div class="mural-palette-dots">
                      <i style="background:${pal.q1Bg}; border-color:${pal.q1Badge}"></i>
                      <i style="background:${pal.q2Bg}; border-color:${pal.q2Badge}"></i>
                      <i style="background:${pal.q3Bg}; border-color:${pal.q3Badge}"></i>
                      <i style="background:${pal.q4Bg}; border-color:${pal.q4Badge}"></i>
                    </div>
                    <span>${pal.name}</span>
                  </button>
                `).join('')}
              </div>
            </section>

            <!-- Author Signature Toggle -->
            <section class="card mural-control-card">
              <div class="mural-signature-row">
                <div class="mural-signature-info">
                  <label class="field-label">Assinatura no Rodapé</label>
                  <span class="mural-signature-preview">${SIGNATURE_TEXT}</span>
                </div>
                <button type="button" class="mural-toggle-pill ${state.showSignature ? 'active' : ''}" id="ms-signature-toggle" aria-pressed="${state.showSignature ? 'true' : 'false'}">
                  ${state.showSignature ? 'Ativada' : 'Oculta'}
                </button>
              </div>
            </section>

            <!-- Optional Key Phrase / Day Seal -->
            <section class="card mural-control-card">
              <div class="section-row-between">
                <label class="field-label" for="ms-keyphrase-input">Frase-Chave / Selo do Dia (Opcional)</label>
                <span class="mural-char-counter" id="ms-keyphrase-count">${state.keyPhrase.length}/${KEY_PHRASE_MAX_LEN}</span>
              </div>
              <div class="mural-keyphrase-input-wrap">
                <input
                  type="text"
                  id="ms-keyphrase-input"
                  class="dark-input"
                  maxlength="${KEY_PHRASE_MAX_LEN}"
                  value="${escapeHtml(state.keyPhrase)}"
                  placeholder="Ex.: Sorocaba • Virada de chave"
                >
                <button
                  type="button"
                  class="mural-keyphrase-clear ${state.keyPhrase ? '' : 'hidden'}"
                  id="ms-keyphrase-clear"
                  aria-label="Limpar frase-chave"
                  title="Limpar"
                >×</button>
              </div>
              <div class="mural-preset-chips" id="ms-keyphrase-presets">
                ${KEY_PHRASE_PRESETS.map((preset) => `
                  <button
                    type="button"
                    class="mural-preset-chip ${state.keyPhrase.trim() === preset ? 'active' : ''}"
                    data-ms-preset="${escapeHtml(preset)}"
                  >${escapeHtml(preset)}</button>
                `).join('')}
              </div>
            </section>

            <!-- Text Review & Font Control -->
            <section class="card mural-control-card">
              <div class="section-row-between">
                <label class="field-label" for="ms-narrative-input" id="ms-label-text">1. Bloco de Texto (Superior Esquerdo)</label>
                <div class="mural-font-bar">
                  ${FONT_MODES.map((fm) => `
                    <button type="button" class="mfmt-btn ${state.fontMode === fm.id ? 'active' : ''}" data-ms-font="${fm.id}">${fm.label}</button>
                  `).join('')}
                </div>
              </div>
              <textarea id="ms-narrative-input" class="dark-input dark-textarea" rows="4" placeholder="Revise o relato corrido que aparecerá no bloco de texto...">${escapeHtml(state.narrativeText)}</textarea>
            </section>

            <!-- Photos Selector & Quick Order -->
            <section class="card mural-control-card">
              <label class="field-label" id="ms-label-photos">2. Bloco de Fotos (Superior Direito · ${state.selectedPhotoOrder.length}/${state.photos.length})</label>
              <div class="mural-pick-grid">${photoThumbsHtml}</div>
              <div class="mural-photo-order-wrap" id="ms-photo-order-wrap"></div>
            </section>

            <!-- Audios Selector -->
            <section class="card mural-control-card">
              <label class="field-label" id="ms-label-audios">3. Bloco de Áudios (Inferior Esquerdo · ${state.selectedAudioIds.size}/${state.audios.length})</label>
              <div class="mural-pick-chips">${audioChipsHtml}</div>
            </section>

            <!-- Videos Selector -->
            <section class="card mural-control-card">
              <label class="field-label" id="ms-label-videos">4. Bloco de Vídeos (Inferior Direito · ${state.selectedVideoIds.size}/${state.videos.length})</label>
              <div class="mural-pick-chips">${videoChipsHtml}</div>
            </section>
          </div>
        </div>

        <footer class="mural-studio-footer">
          <button type="button" class="gold-outline-btn" id="ms-save-folder">
            ${ICONS.folder}
            <span>Salvar na Pasta DIARIO</span>
          </button>
          <button type="button" class="btn-gold" id="ms-share-file">
            ${ICONS.share}
            <span>Compartilhar Mural</span>
          </button>
        </footer>
      </div>
    `;

    const canvas = screen.querySelector('#ms-preview-canvas');
    const previewFrame = screen.querySelector('#ms-preview-frame');
    let lastExportDims = { w: EXPORT_QUAD_W, h: Math.round(BASE_POSTER_H * (EXPORT_QUAD_W / POSTER_W)) };

    const syncStudioLabels = (isScrollable = false) => {
      const isStrip = state.layoutMode === 'strip';
      const headerTag = screen.querySelector('#ms-header-tag');
      const hintEl = screen.querySelector('#ms-preview-hint');
      const labelText = screen.querySelector('#ms-label-text');
      const labelPhotos = screen.querySelector('#ms-label-photos');
      const labelAudios = screen.querySelector('#ms-label-audios');
      const labelVideos = screen.querySelector('#ms-label-videos');

      if (headerTag) {
        headerTag.textContent = isStrip ? 'Mural do Dia · Tira Vertical Contínua' : 'Mural do Dia · 4 Quadrantes';
      }
      if (hintEl) {
        hintEl.textContent = isScrollable
          ? `Prévia ao vivo · Exportação em ${lastExportDims.w} × ${lastExportDims.h} px · Role e toque para ampliar`
          : `Prévia ao vivo · Exportação em ${lastExportDims.w} × ${lastExportDims.h} px · Toque para ampliar`;
      }
      if (labelText) {
        labelText.textContent = isStrip
          ? '1. Bloco de Texto (Abaixo do Cabeçalho)'
          : '1. Bloco de Texto (Superior Esquerdo)';
      }
      if (labelPhotos) {
        labelPhotos.textContent = `2. Bloco de Fotos (${isStrip ? 'Largura Ampla' : 'Superior Direito'} · ${state.selectedPhotoOrder.length}/${state.photos.length})`;
      }
      if (labelAudios) {
        labelAudios.textContent = `3. Bloco de Áudios (${isStrip ? 'Bloco Discreto' : 'Inferior Esquerdo'} · ${state.selectedAudioIds.size}/${state.audios.length})`;
      }
      if (labelVideos) {
        labelVideos.textContent = `4. Bloco de Vídeos (${isStrip ? 'Bloco Discreto' : 'Inferior Direito'} · ${state.selectedVideoIds.size}/${state.videos.length})`;
      }

      previewFrame?.classList.toggle('mural-strip-scroll', isScrollable);
      canvas?.classList.toggle('strip-mode', isScrollable);
    };

    const syncPhotoOrderUI = () => {
      const isStrip = state.layoutMode === 'strip';
      const labelPhotos = screen.querySelector('#ms-label-photos');
      if (labelPhotos) {
        labelPhotos.textContent = `2. Bloco de Fotos (${isStrip ? 'Largura Ampla' : 'Superior Direito'} · ${state.selectedPhotoOrder.length}/${state.photos.length})`;
      }

      screen.querySelectorAll('[data-ms-photo]').forEach((btn) => {
        const idx = Number(btn.dataset.msPhoto);
        const pos = state.selectedPhotoOrder.indexOf(idx);
        const sel = pos !== -1;
        btn.classList.toggle('selected', sel);
        const badge = btn.querySelector('.mp-check');
        if (badge) {
          badge.textContent = sel ? String(pos + 1) : '';
          badge.classList.toggle('is-hero', pos === 0);
        }
      });

      const orderWrap = screen.querySelector('#ms-photo-order-wrap');
      if (!orderWrap) return;

      const totalSel = state.selectedPhotoOrder.length;
      if (totalSel <= 1) {
        orderWrap.innerHTML = totalSel === 1
          ? `<p class="helper-caption">1 foto selecionada (em destaque principal). Selecione mais fotos para definir a ordem.</p>`
          : '';
        return;
      }

      orderWrap.innerHTML = `
        <div class="mural-photo-order-title">Ordem no mural (1º = foto principal em destaque)</div>
        <div class="mural-photo-order-list">
          ${state.selectedPhotoOrder.map((photoIdx, pos) => {
            const ph = state.photos[photoIdx];
            const thumbUrl = photoThumbUrls[photoIdx] || '';
            const rawName = (ph?.caption || '').trim() || (ph?.name || '').replace(/\.[^.]+$/, '') || `Foto ${photoIdx + 1}`;
            const isFirst = pos === 0;
            const isLast = pos === totalSel - 1;
            return `
              <div class="mural-order-item">
                <img class="mural-order-thumb" src="${thumbUrl}" alt="Foto ${photoIdx + 1}">
                <div class="mural-order-meta">
                  <span class="mural-order-rank ${isFirst ? 'is-hero' : ''}">${isFirst ? '1º · Destaque' : `${pos + 1}º`}</span>
                  <span class="mural-order-name">${escapeHtml(rawName)}</span>
                </div>
                <div class="mural-order-actions">
                  <button type="button" class="mural-order-btn mural-order-btn-top" data-ms-order-top="${pos}" ${isFirst ? 'disabled' : ''} title="Puxar para 1º lugar">Topo</button>
                  <button type="button" class="mural-order-btn" data-ms-order-up="${pos}" ${isFirst ? 'disabled' : ''} aria-label="Subir foto" title="Subir">↑</button>
                  <button type="button" class="mural-order-btn" data-ms-order-down="${pos}" ${isLast ? 'disabled' : ''} aria-label="Descer foto" title="Descer">↓</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    };

    const redraw = async () => {
      if (!canvas) return;
      const seq = ++renderSeq;
      const measureCtx = canvas.getContext('2d');
      let isScrollable = state.layoutMode === 'strip';

      if (state.layoutMode === 'strip') {
        const layout = measureVerticalStripLayout(measureCtx, state);
        const exportScale = Math.min(1, MAX_EXPORT_H / layout.totalH);
        lastExportDims = {
          w: Math.round(STRIP_W * exportScale),
          h: Math.round(layout.totalH * exportScale)
        };
        const previewW = 540;
        const previewH = Math.max(200, Math.round((previewW * layout.totalH) / STRIP_W));
        if (canvas.width !== previewW) canvas.width = previewW;
        if (canvas.height !== previewH) canvas.height = previewH;
        await renderVerticalStripCanvas(canvas, state, layout, { highRes: false });
      } else {
        const layout = measureQuadrantsLayout(measureCtx, state);
        const exportScale = Math.min(EXPORT_QUAD_W / POSTER_W, MAX_EXPORT_H / layout.totalH);
        lastExportDims = {
          w: Math.round(POSTER_W * exportScale),
          h: Math.round(layout.totalH * exportScale)
        };
        isScrollable = layout.totalH > POSTER_W * 1.45;
        const previewW = 720;
        const previewH = Math.max(400, Math.round((previewW * layout.totalH) / POSTER_W));
        if (canvas.width !== previewW) canvas.width = previewW;
        if (canvas.height !== previewH) canvas.height = previewH;
        await renderDayMuralCanvas(canvas, state, { precomputedLayout: layout, highRes: false });
      }

      if (seq !== renderSeq || !screen.classList.contains('open')) return;
      syncStudioLabels(isScrollable);
    };
    refreshCanvas = redraw;
    syncPhotoOrderUI();
    redraw();

    screen.querySelector('#ms-close')?.addEventListener('click', closeStudio);

    screen.querySelectorAll('[data-ms-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.layoutMode = btn.dataset.msMode;
        screen.querySelectorAll('[data-ms-mode]').forEach((b) =>
          b.classList.toggle('active', b.dataset.msMode === state.layoutMode)
        );
        if (previewFrame) previewFrame.scrollTop = 0;
        redraw();
      });
    });

    screen.querySelectorAll('[data-ms-fmt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.format = btn.dataset.msFmt;
        screen.querySelectorAll('[data-ms-fmt]').forEach((b) =>
          b.classList.toggle('active', b.dataset.msFmt === state.format)
        );
      });
    });

    screen.querySelectorAll('[data-ms-pal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.paletteId = btn.dataset.msPal;
        screen.querySelectorAll('[data-ms-pal]').forEach((b) =>
          b.classList.toggle('active', b.dataset.msPal === state.paletteId)
        );
        redraw();
      });
    });

    const sigToggleBtn = screen.querySelector('#ms-signature-toggle');
    sigToggleBtn?.addEventListener('click', () => {
      state.showSignature = !state.showSignature;
      sigToggleBtn.classList.toggle('active', state.showSignature);
      sigToggleBtn.setAttribute('aria-pressed', state.showSignature ? 'true' : 'false');
      sigToggleBtn.textContent = state.showSignature ? 'Ativada' : 'Oculta';
      redraw();
    });

    const keyPhraseInput = screen.querySelector('#ms-keyphrase-input');
    const keyPhraseCount = screen.querySelector('#ms-keyphrase-count');
    const keyPhraseClear = screen.querySelector('#ms-keyphrase-clear');
    const keyPhrasePresets = screen.querySelector('#ms-keyphrase-presets');
    let kpRenderTimer = null;

    const syncKeyPhraseUI = () => {
      const len = String(state.keyPhrase || '').length;
      const trimmed = String(state.keyPhrase || '').trim();
      if (keyPhraseInput && keyPhraseInput.value !== state.keyPhrase) {
        keyPhraseInput.value = state.keyPhrase;
      }
      if (keyPhraseCount) {
        keyPhraseCount.textContent = `${len}/${KEY_PHRASE_MAX_LEN}`;
      }
      if (keyPhraseClear) {
        keyPhraseClear.classList.toggle('hidden', len === 0);
      }
      keyPhrasePresets?.querySelectorAll('[data-ms-preset]').forEach((btn) => {
        btn.classList.toggle('active', trimmed === btn.dataset.msPreset);
      });
    };

    keyPhraseInput?.addEventListener('input', (e) => {
      state.keyPhrase = e.target.value.slice(0, KEY_PHRASE_MAX_LEN);
      syncKeyPhraseUI();
      clearTimeout(kpRenderTimer);
      kpRenderTimer = setTimeout(redraw, 90);
      schedulePersistKeyPhrase();
    });

    keyPhraseClear?.addEventListener('click', () => {
      state.keyPhrase = '';
      clearTimeout(kpRenderTimer);
      syncKeyPhraseUI();
      redraw();
      persistKeyPhrase();
    });

    keyPhrasePresets?.addEventListener('click', (e) => {
      const presetBtn = e.target.closest('[data-ms-preset]');
      if (!presetBtn) return;
      const preset = presetBtn.dataset.msPreset || '';
      state.keyPhrase = state.keyPhrase.trim() === preset ? '' : preset;
      clearTimeout(kpRenderTimer);
      syncKeyPhraseUI();
      redraw();
      persistKeyPhrase();
    });

    screen.querySelectorAll('[data-ms-font]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.fontMode = btn.dataset.msFont;
        screen.querySelectorAll('[data-ms-font]').forEach((b) =>
          b.classList.toggle('active', b.dataset.msFont === state.fontMode)
        );
        redraw();
      });
    });

    let textTimer = null;
    screen.querySelector('#ms-narrative-input')?.addEventListener('input', (e) => {
      state.narrativeText = e.target.value;
      clearTimeout(textTimer);
      textTimer = setTimeout(redraw, 110);
    });

    screen.querySelectorAll('[data-ms-photo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.msPhoto);
        const existingPos = state.selectedPhotoOrder.indexOf(idx);
        if (existingPos !== -1) state.selectedPhotoOrder.splice(existingPos, 1);
        else state.selectedPhotoOrder.push(idx);
        syncPhotoOrderUI();
        redraw();
      });
    });

    screen.querySelector('#ms-photo-order-wrap')?.addEventListener('click', (e) => {
      const topBtn = e.target.closest('[data-ms-order-top]');
      const upBtn = e.target.closest('[data-ms-order-up]');
      const downBtn = e.target.closest('[data-ms-order-down]');

      if (topBtn) {
        const pos = Number(topBtn.dataset.msOrderTop);
        if (pos > 0 && pos < state.selectedPhotoOrder.length) {
          const [moved] = state.selectedPhotoOrder.splice(pos, 1);
          state.selectedPhotoOrder.unshift(moved);
          syncPhotoOrderUI();
          redraw();
        }
      } else if (upBtn) {
        const pos = Number(upBtn.dataset.msOrderUp);
        if (pos > 0 && pos < state.selectedPhotoOrder.length) {
          const arr = state.selectedPhotoOrder;
          [arr[pos - 1], arr[pos]] = [arr[pos], arr[pos - 1]];
          syncPhotoOrderUI();
          redraw();
        }
      } else if (downBtn) {
        const pos = Number(downBtn.dataset.msOrderDown);
        if (pos >= 0 && pos < state.selectedPhotoOrder.length - 1) {
          const arr = state.selectedPhotoOrder;
          [arr[pos], arr[pos + 1]] = [arr[pos + 1], arr[pos]];
          syncPhotoOrderUI();
          redraw();
        }
      }
    });

    screen.querySelectorAll('[data-ms-audio]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.msAudio);
        if (state.selectedAudioIds.has(idx)) state.selectedAudioIds.delete(idx);
        else state.selectedAudioIds.add(idx);
        btn.classList.toggle('selected', state.selectedAudioIds.has(idx));
        redraw();
      });
    });

    screen.querySelectorAll('[data-ms-video]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.msVideo);
        if (state.selectedVideoIds.has(idx)) state.selectedVideoIds.delete(idx);
        else state.selectedVideoIds.add(idx);
        btn.classList.toggle('selected', state.selectedVideoIds.has(idx));
        redraw();
      });
    });

    const buildHighResBlob = async () => {
      await persistKeyPhrase();
      const hiCanvas = document.createElement('canvas');
      let exportW = EXPORT_QUAD_W;
      let exportH = Math.round(BASE_POSTER_H * (EXPORT_QUAD_W / POSTER_W));

      try {
        const measureCtx = hiCanvas.getContext('2d');
        if (state.layoutMode === 'strip') {
          const layout = measureVerticalStripLayout(measureCtx, state);
          const exportScale = Math.min(1, MAX_EXPORT_H / layout.totalH);
          exportW = Math.round(STRIP_W * exportScale);
          exportH = Math.round(layout.totalH * exportScale);
          hiCanvas.width = exportW;
          hiCanvas.height = exportH;
          await renderVerticalStripCanvas(hiCanvas, state, layout, { highRes: true });
        } else {
          const layout = measureQuadrantsLayout(measureCtx, state);
          const exportScale = Math.min(EXPORT_QUAD_W / POSTER_W, MAX_EXPORT_H / layout.totalH);
          exportW = Math.round(POSTER_W * exportScale);
          exportH = Math.round(layout.totalH * exportScale);
          hiCanvas.width = exportW;
          hiCanvas.height = exportH;
          await renderDayMuralCanvas(hiCanvas, state, { precomputedLayout: layout, highRes: true });
        }

        const isJpeg = state.format === 'jpeg';
        const mime = isJpeg ? 'image/jpeg' : 'image/png';
        const ext = isJpeg ? 'jpg' : 'png';
        const modeSlug = state.layoutMode === 'strip' ? 'tira-vertical' : 'mural-do-dia';
        const fileName = `${entry.dateKey || 'diario'}_${modeSlug}.${ext}`;
        const blob = await new Promise((resolve) =>
          hiCanvas.toBlob((b) => resolve(b), mime, isJpeg ? 0.92 : undefined)
        );
        return { blob, fileName, mime, exportW, exportH };
      } finally {
        hiCanvas.width = 1;
        hiCanvas.height = 1;
      }
    };

    canvas?.addEventListener('click', async () => {
      onToast?.('Gerando prévia em alta resolução...');
      const { blob, exportW, exportH } = await buildHighResBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      photoThumbUrls.push(url);
      const labelMode = state.layoutMode === 'strip' ? 'Tira Vertical' : 'Mural do Dia';
      onOpenLightbox?.([{ url, caption: `${labelMode} · ${parts.day} ${parts.monthShort} ${parts.year} (${exportW} × ${exportH} px)` }], 0);
    });

    screen.querySelector('#ms-save-folder')?.addEventListener('click', async () => {
      onToast?.('Renderizando Mural do Dia em alta resolução...');
      const { blob, fileName } = await buildHighResBlob();
      await saveSingleFileToDiarioFolder(fileName, blob, { onToast });
    });

    screen.querySelector('#ms-share-file')?.addEventListener('click', async () => {
      onToast?.('Renderizando Mural do Dia em alta resolução...');
      const { blob, fileName, mime } = await buildHighResBlob();
      if (!blob) return;
      const file = new File([blob], fileName, { type: mime, lastModified: Date.now() });
      const labelMode = state.layoutMode === 'strip' ? 'Tira Vertical' : 'Mural do Dia';
      const title = entry.title.trim() || `${labelMode} · ${parts.day} ${parts.monthShort} ${parts.year}`;
      await shareSingleFile(file, { title, text: title, onToast });
    });
  };

  renderStudioMarkup();
  screen.classList.add('open');

  document.fonts?.load('italic 600 44px "Dancing Script"').then(() => {
    if (screen.classList.contains('open')) {
      refreshCanvas();
    }
  }).catch(() => {});

  // Decode lightweight 720px bitmaps for live preview while recording original dimensions
  Promise.all([
    Promise.all(
      state.photos.map(async (p) => {
        const decoded = await decodePreviewBitmap(p.blob, 720);
        if (!screen.classList.contains('open')) {
          closeBitmap(decoded.bitmap);
          return;
        }
        p.bitmap = decoded.bitmap;
        p.naturalWidth = decoded.width;
        p.naturalHeight = decoded.height;
      })
    ),
    Promise.all(
      state.videos.map(async (v) => {
        const thumb = await extractVideoThumbnail(v.blob);
        if (!screen.classList.contains('open')) {
          if (thumb && typeof thumb.getContext === 'function') {
            thumb.width = 1;
            thumb.height = 1;
          }
          return;
        }
        v.thumb = thumb;
      })
    )
  ]).then(() => {
    if (screen.classList.contains('open')) {
      refreshCanvas();
    }
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
