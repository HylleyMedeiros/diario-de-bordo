// High-Resolution 4-Quadrant "Mural do Dia" Poster Generator & Editable Studio
import { normalizeEntry, formatEntryDateParts } from './db.js';
import { ICONS, getMoodById } from './icons.js';
import { shareSingleFile, saveSingleFileToDiarioFolder } from './export.js';

const POSTER_W = 2160;
const POSTER_H = 2700;

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

function loadBitmapFromBlob(blob) {
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

function drawPhotosQuadrant(ctx, rect, palette, photoEntries) {
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

  const visible = photoEntries.slice(0, 6);
  const slots = [];

  if (visible.length === 1) {
    slots.push({ x, y, w, h });
  } else if (visible.length === 2) {
    const rowH = (h - g) / 2;
    slots.push({ x, y, w, h: rowH });
    slots.push({ x, y: y + rowH + g, w, h: rowH });
  } else if (visible.length === 3) {
    const topH = Math.round((h - g) * 0.57);
    const botH = h - g - topH;
    const halfW = (w - g) / 2;
    slots.push({ x, y, w, h: topH });
    slots.push({ x, y: y + topH + g, w: halfW, h: botH });
    slots.push({ x: x + halfW + g, y: y + topH + g, w: halfW, h: botH });
  } else if (visible.length === 4) {
    const halfW = (w - g) / 2;
    const halfH = (h - g) / 2;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        slots.push({ x: x + c * (halfW + g), y: y + r * (halfH + g), w: halfW, h: halfH });
      }
    }
  } else if (visible.length === 5) {
    const topH = Math.round((h - g) * 0.54);
    const botH = h - g - topH;
    const topW = (w - g) / 2;
    const botW = (w - 2 * g) / 3;
    slots.push({ x, y, w: topW, h: topH });
    slots.push({ x: x + topW + g, y, w: topW, h: topH });
    for (let c = 0; c < 3; c++) {
      slots.push({ x: x + c * (botW + g), y: y + topH + g, w: botW, h: botH });
    }
  } else {
    const halfW = (w - g) / 2;
    const rowH = (h - 2 * g) / 3;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        slots.push({ x: x + c * (halfW + g), y: y + r * (rowH + g), w: halfW, h: rowH });
      }
    }
  }

  slots.forEach((slot, idx) => {
    const item = visible[idx];
    if (item && item.bitmap) {
      drawCoverImage(ctx, item.bitmap, slot.x, slot.y, slot.w, slot.h, 20);
    } else {
      ctx.save();
      roundRectPath(ctx, slot.x, slot.y, slot.w, slot.h, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.restore();
    }

    if (idx === slots.length - 1 && total > slots.length) {
      const extra = total - slots.length;
      ctx.save();
      roundRectPath(ctx, slot.x, slot.y, slot.w, slot.h, 20);
      ctx.fillStyle = 'rgba(10, 10, 12, 0.62)';
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 54px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${extra}`, slot.x + slot.w / 2, slot.y + slot.h / 2);
      ctx.restore();
    }
  });
}

function formatSec(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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

  const x = rect.x + 42;
  const y = rect.y + 120;
  const w = rect.w - 84;
  const maxVisible = 5;
  const list = audioEntries.slice(0, maxVisible);
  const cardH = 128;
  const gap = 16;

  list.forEach((au, idx) => {
    const cy = y + idx * (cardH + gap);
    ctx.save();
    roundRectPath(ctx, x, cy, w, cardH, 22);
    ctx.fillStyle = palette.q3Card;
    ctx.fill();

    // Play circle
    const cx = x + 52;
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
    const textX = x + 102;
    const durText = formatSec(au.duration || 0);
    ctx.font = '700 25px "Inter", system-ui, sans-serif';
    const durW = ctx.measureText(durText).width;
    const maxTitleW = w - 102 - durW - 56;
    const titleStr = (au.title || '').trim() || `Nota de áudio ${idx + 1}`;
    ctx.fillStyle = palette.q3Text;
    ctx.font = '700 28px "Inter", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(truncateLine(ctx, titleStr, maxTitleW), textX, cy + 24);

    // Sub-meta + mini waveform bars
    const dt = new Date(au.recordedAt || au.createdAt || Date.now());
    const hhmm = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const origin = au.source === 'file' ? 'Arquivo' : 'Gravação';
    ctx.font = '500 21px "Inter", system-ui, sans-serif';
    ctx.globalAlpha = 0.7;
    ctx.fillText(`${origin} · ${hhmm}`, textX, cy + 66);
    ctx.globalAlpha = 1;

    // Decorative waveform bars
    const waveX = x + w - durW - 140;
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
    ctx.fillText(durText, x + w - durW - 28, midY);

    ctx.restore();
  });

  if (total > maxVisible) {
    ctx.save();
    ctx.fillStyle = palette.q3Badge;
    ctx.font = '600 22px "Inter", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`+ ${total - maxVisible} áudio(s) adicional(is)`, x + 6, y + maxVisible * (cardH + gap) + 4);
    ctx.restore();
  }
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
  const y = rect.y + 120;
  const w = rect.w - 84;
  const h = rect.h - 162;
  const g = 16;

  const visible = videoEntries.slice(0, 4);
  const slots = [];

  if (visible.length === 1) {
    slots.push({ x, y, w, h });
  } else if (visible.length === 2) {
    const rowH = (h - g) / 2;
    slots.push({ x, y, w, h: rowH });
    slots.push({ x, y: y + rowH + g, w, h: rowH });
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

function renderDayMuralCanvas(canvas, state) {
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / POSTER_W;
  const palette = PALETTES.find((p) => p.id === state.paletteId) || PALETTES[0];
  const entry = state.entry;
  const parts = formatEntryDateParts(entry.dateKey, entry.timeStr);
  const mood = getMoodById(entry.mood);

  ctx.save();
  ctx.scale(scale, scale);

  // 1. Poster Background
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  // 2. Editorial Header
  const padX = 88;
  const metaY = 78;
  ctx.font = '700 24px "Inter", system-ui, sans-serif';
  ctx.fillStyle = palette.accent;
  ctx.textBaseline = 'top';
  const dateHeader = `${parts.day} DE ${parts.monthFull.toUpperCase()} DE ${parts.year}  ·  ${parts.weekday.toUpperCase()}  ·  ${parts.time}`;
  ctx.fillText(dateHeader, padX, metaY);

  // Mood + Milestone on right of meta row
  const rightMeta = entry.isMilestone
    ? `★ ${(entry.milestoneTitle || 'Evento Marcante').trim()}  ·  ${mood.label}`
    : `Humor: ${mood.label}`;
  ctx.font = '600 23px "Inter", system-ui, sans-serif';
  ctx.fillStyle = palette.headerSub;
  const rightW = ctx.measureText(rightMeta).width;
  ctx.fillText(truncateLine(ctx, rightMeta, 780), POSTER_W - padX - Math.min(rightW, 780), metaY);

  // Main Day Title
  const mainTitle = entry.title.trim() || `Cápsula de ${parts.day} de ${parts.monthFull}`;
  ctx.font = '700 66px "Playfair Display", Georgia, serif';
  ctx.fillStyle = palette.headerText;
  const titleLines = wrapTextLines(ctx, mainTitle, POSTER_W - padX * 2).slice(0, 2);
  titleLines.forEach((line, idx) => {
    const str = idx === 1 && titleLines.length === 2 ? truncateLine(ctx, line, POSTER_W - padX * 2) : line;
    ctx.fillText(str, padX, 132 + idx * 78);
  });

  // Header divider
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, 316);
  ctx.lineTo(POSTER_W - padX, 316);
  ctx.stroke();

  // 3. Four Quadrant Grid Geometry
  const gap = 28;
  const gridTop = 348;
  const gridBottom = 2566;
  const gridH = gridBottom - gridTop;
  const colW = (POSTER_W - padX * 2 - gap) / 2; // 978
  const rowHTop = 1234;
  const rowHBot = gridH - gap - rowHTop; // 956

  const q1 = { x: padX, y: gridTop, w: colW, h: rowHTop };
  const q2 = { x: padX + colW + gap, y: gridTop, w: colW, h: rowHTop };
  const q3 = { x: padX, y: gridTop + rowHTop + gap, w: colW, h: rowHBot };
  const q4 = { x: padX + colW + gap, y: gridTop + rowHTop + gap, w: colW, h: rowHBot };

  const selectedPhotos = state.photos.filter((_, i) => state.selectedPhotoIds.has(i));
  const selectedAudios = state.audios.filter((_, i) => state.selectedAudioIds.has(i));
  const selectedVideos = state.videos.filter((_, i) => state.selectedVideoIds.has(i));

  drawTextQuadrant(ctx, q1, palette, state.narrativeText, state.fontMode);
  drawPhotosQuadrant(ctx, q2, palette, selectedPhotos);
  drawAudiosQuadrant(ctx, q3, palette, selectedAudios);
  drawVideosQuadrant(ctx, q4, palette, selectedVideos);

  // 4. Footer
  const footY = 2608;
  if (entry.tags.length > 0) {
    ctx.font = '600 23px "Inter", system-ui, sans-serif';
    ctx.fillStyle = palette.headerSub;
    const tagsStr = entry.tags.slice(0, 5).map((t) => `#${t}`).join('   ');
    ctx.fillText(truncateLine(ctx, tagsStr, 1200), padX, footY);
  }
  const brand = 'DIÁRIO DE BORDO  ·  MURAL DO DIA';
  ctx.font = '700 22px "Inter", system-ui, sans-serif';
  ctx.fillStyle = palette.accent;
  const brandW = ctx.measureText(brand).width;
  ctx.fillText(brand, POSTER_W - padX - brandW, footY);

  ctx.restore();
}

// ============================================================================
// Editable Studio UI (#day-mural-screen)
// ============================================================================
export async function openDayMuralStudio(rawEntry, { onToast, onOpenLightbox } = {}) {
  const screen = document.getElementById('day-mural-screen');
  if (!screen) return;

  const entry = normalizeEntry(rawEntry);
  const parts = formatEntryDateParts(entry.dateKey, entry.timeStr);

  const state = {
    entry,
    paletteId: 'ouro-obsidiana',
    fontMode: 'auto',
    format: 'png', // 'png' | 'jpeg'
    narrativeText: buildInitialNarrative(entry),
    photos: entry.photos.map((p) => ({ ...p, bitmap: null })),
    audios: entry.audios.map((a) => ({ ...a })),
    videos: entry.videos.map((v) => ({ ...v, thumb: null })),
    selectedPhotoIds: new Set(entry.photos.map((_, i) => i)),
    selectedAudioIds: new Set(entry.audios.map((_, i) => i)),
    selectedVideoIds: new Set(entry.videos.map((_, i) => i))
  };

  let thumbObjectUrls = [];
  const revokeThumbUrls = () => {
    thumbObjectUrls.forEach((u) => URL.revokeObjectURL(u));
    thumbObjectUrls = [];
  };

  const closeStudio = () => {
    revokeThumbUrls();
    screen.classList.remove('open');
  };

  const renderStudioMarkup = () => {
    revokeThumbUrls();

    const photoThumbsHtml = state.photos.length
      ? state.photos.map((ph, idx) => {
          const url = URL.createObjectURL(ph.blob);
          thumbObjectUrls.push(url);
          const sel = state.selectedPhotoIds.has(idx);
          return `
            <button type="button" class="mural-pick-thumb ${sel ? 'selected' : ''}" data-ms-photo="${idx}" title="Foto ${idx + 1}">
              <img src="${url}" alt="Foto ${idx + 1}">
              <span class="mp-check">${sel ? ICONS.check : ''}</span>
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
            <span class="capsule-header-tag">Mural do Dia · 4 Quadrantes</span>
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
            <canvas id="ms-preview-canvas" class="mural-preview-canvas" width="720" height="900" title="Toque para ampliar"></canvas>
            <span class="mural-preview-hint">Prévia ao vivo · Exportação em 2160 × 2700 px · Toque para ampliar</span>
          </div>

          <div class="mural-studio-controls">
            <!-- Palette Picker -->
            <section class="card mural-control-card">
              <label class="field-label">Paleta dos 4 Blocos</label>
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

            <!-- Q1 Text Review & Font Control -->
            <section class="card mural-control-card">
              <div class="section-row-between">
                <label class="field-label" for="ms-narrative-input">1. Bloco de Texto (Superior Esquerdo)</label>
                <div class="mural-font-bar">
                  ${FONT_MODES.map((fm) => `
                    <button type="button" class="mfmt-btn ${state.fontMode === fm.id ? 'active' : ''}" data-ms-font="${fm.id}">${fm.label}</button>
                  `).join('')}
                </div>
              </div>
              <textarea id="ms-narrative-input" class="dark-input dark-textarea" rows="4" placeholder="Revise o relato corrido que aparecerá no bloco de texto...">${escapeHtml(state.narrativeText)}</textarea>
            </section>

            <!-- Q2 Photos Selector -->
            <section class="card mural-control-card">
              <label class="field-label">2. Bloco de Fotos (Superior Direito · ${state.selectedPhotoIds.size}/${state.photos.length})</label>
              <div class="mural-pick-grid">${photoThumbsHtml}</div>
            </section>

            <!-- Q3 Audios Selector -->
            <section class="card mural-control-card">
              <label class="field-label">3. Bloco de Áudios (Inferior Esquerdo · ${state.selectedAudioIds.size}/${state.audios.length})</label>
              <div class="mural-pick-chips">${audioChipsHtml}</div>
            </section>

            <!-- Q4 Videos Selector -->
            <section class="card mural-control-card">
              <label class="field-label">4. Bloco de Vídeos (Inferior Direito · ${state.selectedVideoIds.size}/${state.videos.length})</label>
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
    const redraw = () => {
      if (canvas) renderDayMuralCanvas(canvas, state);
    };
    redraw();

    screen.querySelector('#ms-close')?.addEventListener('click', closeStudio);

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
        if (state.selectedPhotoIds.has(idx)) state.selectedPhotoIds.delete(idx);
        else state.selectedPhotoIds.add(idx);
        btn.classList.toggle('selected', state.selectedPhotoIds.has(idx));
        btn.querySelector('.mp-check').innerHTML = state.selectedPhotoIds.has(idx) ? ICONS.check : '';
        redraw();
      });
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
      const hiCanvas = document.createElement('canvas');
      hiCanvas.width = POSTER_W;
      hiCanvas.height = POSTER_H;
      renderDayMuralCanvas(hiCanvas, state);
      const isJpeg = state.format === 'jpeg';
      const mime = isJpeg ? 'image/jpeg' : 'image/png';
      const ext = isJpeg ? 'jpg' : 'png';
      const fileName = `${entry.dateKey || 'diario'}_mural-do-dia.${ext}`;
      const blob = await new Promise((resolve) =>
        hiCanvas.toBlob((b) => resolve(b), mime, isJpeg ? 0.93 : undefined)
      );
      return { blob, fileName, mime };
    };

    canvas?.addEventListener('click', async () => {
      onToast?.('Gerando prévia em alta resolução...');
      const { blob } = await buildHighResBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      thumbObjectUrls.push(url);
      onOpenLightbox?.([{ url, caption: `Mural do Dia · ${parts.day} ${parts.monthShort} ${parts.year} (2160 × 2700 px)` }], 0);
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
      const title = entry.title.trim() || `Mural do Dia · ${parts.day} ${parts.monthShort} ${parts.year}`;
      await shareSingleFile(file, { title, text: title, onToast });
    });
  };

  renderStudioMarkup();
  screen.classList.add('open');

  // Asynchronously load full photo bitmaps and extract real video frame thumbnails
  Promise.all([
    Promise.all(state.photos.map(async (p) => { p.bitmap = await loadBitmapFromBlob(p.blob); })),
    Promise.all(state.videos.map(async (v) => { v.thumb = await extractVideoThumbnail(v.blob); }))
  ]).then(() => {
    const canvas = screen.querySelector('#ms-preview-canvas');
    if (canvas && screen.classList.contains('open')) {
      renderDayMuralCanvas(canvas, state);
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
