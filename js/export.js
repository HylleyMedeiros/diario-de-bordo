// Export & Native Sharing Helpers for Diário de Bordo (Web Share API + File System Access API)
import { formatEntryDateParts, normalizeEntry } from './db.js';
import { getMoodById } from './icons.js';

function sanitizeFileSlug(str, fallback = 'registro') {
  const clean = String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return clean || fallback;
}

function getExtForPhoto(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'jpg';
}

function getExtForVideo(mime, origName = '') {
  const m = String(mime || '').toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('quicktime') || /\.mov$/i.test(origName)) return 'mov';
  if (m.includes('3gpp')) return '3gp';
  return 'mp4';
}

/**
 * Converts a saved entry's photos and videos into valid File[] objects
 * suitable for navigator.share({ files }) and local folder export.
 */
export function buildEntryMediaFiles(rawEntry) {
  const entry = normalizeEntry(rawEntry);
  const datePrefix = entry.dateKey || 'diario';
  const lastMod = entry.updatedAt || entry.timestamp || Date.now();
  const files = [];

  (entry.photos || []).forEach((ph, idx) => {
    if (!ph || !ph.blob) return;
    const type = ph.blob.type || ph.type || 'image/jpeg';
    const ext = getExtForPhoto(type);
    const num = String(idx + 1).padStart(2, '0');
    const name = `${datePrefix}_foto-${num}.${ext}`;
    files.push(new File([ph.blob], name, { type, lastModified: lastMod }));
  });

  (entry.videos || []).forEach((vid, idx) => {
    if (!vid || !vid.blob) return;
    const type = vid.blob.type || vid.type || 'video/mp4';
    const ext = getExtForVideo(type, vid.name);
    const num = String(idx + 1).padStart(2, '0');
    const name = `${datePrefix}_video-${num}.${ext}`;
    files.push(new File([vid.blob], name, { type, lastModified: lastMod }));
  });

  return files;
}

/**
 * Formats an entire Day Capsule into a clean, readable UTF-8 .txt report.
 */
export function formatEntryAsText(rawEntry) {
  const entry = normalizeEntry(rawEntry);
  const p = formatEntryDateParts(entry.dateKey, entry.timeStr);
  const mood = getMoodById(entry.mood);
  const lines = [];

  lines.push('====================================================');
  lines.push('DIÁRIO DE BORDO');
  lines.push('====================================================');
  lines.push(`Data: ${p.day} de ${p.monthFull} de ${p.year} (${p.weekday})`);
  lines.push(`Hora: ${p.time}`);
  lines.push(`Humor: ${mood.label}`);

  if (entry.isMilestone) {
    lines.push(`Evento Marcante: ★ ${(entry.milestoneTitle || '').trim() || 'Sim'}`);
  }
  if (entry.isSealed) {
    lines.push('Estado: Cápsula Selada');
  }
  lines.push('');

  if (entry.title.trim()) {
    lines.push(`TÍTULO: ${entry.title.trim()}`);
    lines.push('');
  }

  if (entry.authorQuote.trim()) {
    lines.push('FRASE / AUTORIA DO DIA:');
    lines.push(`"${entry.authorQuote.trim()}"`);
    lines.push('');
  }

  if (entry.content.trim()) {
    lines.push('RELATO DO DIA:');
    lines.push(entry.content.trim());
    lines.push('');
  }

  if (entry.timelineMoments.length > 0) {
    lines.push('LINHA DO DIA (MARCOS HORÁRIOS):');
    entry.timelineMoments.forEach((m) => {
      const head = m.title ? `${m.time} — ${m.title}` : m.time;
      lines.push(`• ${head}`);
      if (m.note && m.note.trim()) {
        lines.push(`  ${m.note.trim()}`);
      }
    });
    lines.push('');
  }

  if (entry.nightReflection.trim()) {
    lines.push('REINTERPRETAÇÃO · OLHAR DA NOITE:');
    lines.push(entry.nightReflection.trim());
    lines.push('');
  }

  const goodThings = (entry.goodThings || []).map((g) => String(g || '').trim()).filter(Boolean);
  if (goodThings.length > 0) {
    lines.push('COISAS BOAS QUE SÓ ESSE DIA ME DEU (S.A.R.A.):');
    goodThings.forEach((g, idx) => {
      lines.push(`${idx + 1}. ${g}`);
    });
    lines.push('');
  }

  if (entry.checklist.length > 0) {
    lines.push('LISTA DE TAREFAS:');
    entry.checklist.forEach((c) => {
      lines.push(`[${c.done ? 'x' : ' '}] ${c.text || ''}`);
    });
    lines.push('');
  }

  if (entry.tags.length > 0) {
    lines.push(`ETIQUETAS: ${entry.tags.map((t) => `#${t}`).join(' ')}`);
    lines.push('');
  }

  const hasAttachments = entry.photos.length > 0 || entry.videos.length > 0 || entry.audios.length > 0;
  if (hasAttachments) {
    lines.push('ANEXOS DO DIA:');
    entry.photos.forEach((ph, idx) => {
      lines.push(`- Foto ${idx + 1}${ph.caption ? `: ${ph.caption}` : ''}`);
    });
    entry.videos.forEach((vid, idx) => {
      lines.push(`- Vídeo ${idx + 1}${vid.caption ? `: ${vid.caption}` : ''}`);
    });
    entry.audios.forEach((au, idx) => {
      lines.push(`- Áudio ${idx + 1}${au.title ? `: ${au.title}` : ''}`);
    });
    lines.push('');
  }

  return lines.join('\r\n');
}

/**
 * Shares entry photos and videos via Web Share API (Google Photos & Android apps).
 */
export async function shareEntryMedia(rawEntry, { onToast } = {}) {
  const entry = normalizeEntry(rawEntry);
  const p = formatEntryDateParts(entry.dateKey, entry.timeStr);
  const files = buildEntryMediaFiles(entry);
  const title = entry.title.trim() || `Diário de Bordo · ${p.day} ${p.monthShort} ${p.year}`;
  const snippetSource = entry.authorQuote.trim() || entry.content.trim();
  const text = snippetSource
    ? `${title}\n\n${snippetSource.slice(0, 260)}${snippetSource.length > 260 ? '...' : ''}`
    : title;

  if (files.length === 0) {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: formatEntryAsText(entry) });
        return { ok: true, mode: 'text' };
      } catch (err) {
        if (err?.name === 'AbortError') return { ok: false, aborted: true };
      }
    }
    onToast?.('Este dia não possui fotos ou vídeos anexados para compartilhar.');
    return { ok: false, reason: 'no-media' };
  }

  const canShareFiles =
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files });

  if (!canShareFiles) {
    onToast?.('Compartilhamento direto de arquivos indisponível neste navegador. Use "Salvar na Pasta DIARIO".');
    return { ok: false, reason: 'unsupported' };
  }

  try {
    await navigator.share({ files, title, text });
    return { ok: true, mode: 'files', count: files.length };
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, aborted: true };
    onToast?.('Não foi possível abrir o menu de compartilhamento para estas mídias.');
    return { ok: false, reason: 'error' };
  }
}

function triggerSequentialDownloads(items) {
  items.forEach((item, index) => {
    setTimeout(() => {
      const url = URL.createObjectURL(item.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, index * 200);
  });
}

async function writeItemsToDirectoryOrFallback(items, { onFsSuccess, onFallback, onToast } = {}) {
  if (typeof window.showDirectoryPicker === 'function') {
    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({
        id: 'diario-de-bordo-dir',
        mode: 'readwrite'
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        return { ok: false, aborted: true };
      }
      triggerSequentialDownloads(items);
      const msg = onFallback ? onFallback(items, 'restricted') : `Pasta direta restrita — baixando ${items.length} arquivo(s)...`;
      onToast?.(msg);
      return { ok: true, mode: 'download-fallback', count: items.length };
    }

    try {
      if (typeof dirHandle.queryPermission === 'function') {
        const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted' && typeof dirHandle.requestPermission === 'function') {
          const req = await dirHandle.requestPermission({ mode: 'readwrite' });
          if (req !== 'granted') throw new Error('Permissão negada');
        }
      }

      for (const item of items) {
        const fileHandle = await dirHandle.getFileHandle(item.name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(item.blob);
        await writable.close();
      }

      const msg = onFsSuccess ? onFsSuccess(dirHandle.name, items) : `Salvo em "${dirHandle.name}"!`;
      onToast?.(msg);
      return { ok: true, mode: 'fs-access', folder: dirHandle.name, count: items.length };
    } catch {
      triggerSequentialDownloads(items);
      const msg = onFallback ? onFallback(items, 'blocked') : `Gravação direta bloqueada — baixando ${items.length} arquivo(s)...`;
      onToast?.(msg);
      return { ok: true, mode: 'download-fallback', count: items.length };
    }
  }

  triggerSequentialDownloads(items);
  const msg = onFallback ? onFallback(items, 'unsupported') : `Baixando ${items.length} arquivo(s)...`;
  onToast?.(msg);
  return { ok: true, mode: 'download-fallback', count: items.length };
}

/**
 * Shares a single generated File (e.g. Mural do Dia PNG/JPEG) via Web Share API.
 */
export async function shareSingleFile(file, { title = 'Diário de Bordo', text = '', onToast } = {}) {
  if (!file) return { ok: false, reason: 'no-file' };

  const files = [file];
  const canShareFiles =
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files });

  if (!canShareFiles) {
    onToast?.('Compartilhamento direto de imagem indisponível neste navegador. Use "Salvar na Pasta DIARIO".');
    return { ok: false, reason: 'unsupported' };
  }

  try {
    await navigator.share({ files, title, text });
    return { ok: true, mode: 'file' };
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, aborted: true };
    onToast?.('Não foi possível abrir o menu de compartilhamento para este arquivo.');
    return { ok: false, reason: 'error' };
  }
}

/**
 * Saves a single generated file (e.g. Mural do Dia PNG/JPEG) into the selected DIARIO folder
 * with automatic download fallback.
 */
export async function saveSingleFileToDiarioFolder(fileName, blob, { onToast } = {}) {
  if (!blob) return { ok: false, reason: 'no-blob' };
  const items = [{ name: fileName, blob }];
  return writeItemsToDirectoryOrFallback(items, {
    onFsSuccess: (folder) => `Mural salvo em "${folder}": ${fileName}`,
    onFallback: (_, reason) =>
      reason === 'unsupported'
        ? `Baixando ${fileName}...`
        : `Pasta direta indisponível — baixando ${fileName}...`,
    onToast
  });
}

/**
 * Saves entry report (.txt) and all photos/videos directly to a user-selected
 * local directory (e.g. DIARIO) via File System Access API, with automatic download fallback.
 */
export async function saveEntryToDiarioFolder(rawEntry, { onToast } = {}) {
  const entry = normalizeEntry(rawEntry);
  const datePart = entry.dateKey || 'diario';
  const timePart = (entry.timeStr || '00:00').replace(':', 'h');
  const slug = sanitizeFileSlug(entry.title, 'relato');
  const txtName = `${datePart}_${timePart}_${slug}.txt`;

  const txtBlob = new Blob([formatEntryAsText(entry)], { type: 'text/plain;charset=utf-8' });
  const mediaFiles = buildEntryMediaFiles(entry);

  const items = [
    { name: txtName, blob: txtBlob },
    ...mediaFiles.map((file) => ({ name: file.name, blob: file }))
  ];

  const mediaMsg = mediaFiles.length > 0 ? ` + ${mediaFiles.length} ${mediaFiles.length === 1 ? 'mídia' : 'mídias'}` : '';
  return writeItemsToDirectoryOrFallback(items, {
    onFsSuccess: (folder) => `Salvo em "${folder}": relato .txt${mediaMsg}!`,
    onFallback: (list, reason) =>
      reason === 'unsupported'
        ? `Baixando ${list.length} ${list.length === 1 ? 'arquivo' : 'arquivos'} (.txt + mídias)...`
        : `Pasta direta restrita — baixando ${list.length} ${list.length === 1 ? 'arquivo' : 'arquivos'} (.txt + mídias)...`,
    onToast
  });
}
