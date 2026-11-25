// IndexedDB persistence layer for Diário de Bordo — 100% offline local storage (v3.0 backward-compatible)
const DB_NAME = 'DiarioDeBordoDB';
const DB_VERSION = 2;
const STORE_ENTRIES = 'entries';
const STORE_SETTINGS = 'settings';
const STORE_GRATITUDE = 'gratitude_people';

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const store = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
        store.createIndex('dateKey', 'dateKey', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_GRATITUDE)) {
        const gStore = db.createObjectStore(STORE_GRATITUDE, { keyPath: 'id' });
        gStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- Entry Normalization (ensures seamless compatibility between v1.0 and v2.0 entries) ---
export function normalizeEntry(raw = {}) {
  const now = Date.now();
  const dateKey = raw.dateKey || toDateKey(new Date());
  const timeStr = raw.timeStr || '12:00';

  const photos = Array.isArray(raw.photos)
    ? raw.photos
        .filter((p) => p && (p.blob || p.dataUrl))
        .map((p) => ({
          id: p.id || `ph_${now}_${Math.random().toString(36).slice(2, 7)}`,
          blob: p.blob || null,
          name: p.name || 'foto.jpg',
          type: p.type || p.blob?.type || 'image/jpeg',
          caption: typeof p.caption === 'string' ? p.caption : '',
          originalSize: typeof p.originalSize === 'number' ? p.originalSize : null,
          compressedSize: typeof p.compressedSize === 'number' ? p.compressedSize : (p.blob?.size || null),
          width: typeof p.width === 'number' ? p.width : null,
          height: typeof p.height === 'number' ? p.height : null
        }))
    : [];

  const audios = Array.isArray(raw.audios)
    ? raw.audios
        .filter((a) => a && (a.blob || a.dataUrl))
        .map((a) => ({
          id: a.id || `au_${now}_${Math.random().toString(36).slice(2, 7)}`,
          blob: a.blob || null,
          duration: typeof a.duration === 'number' ? a.duration : 0,
          createdAt: a.createdAt || now,
          recordedAt: a.recordedAt || a.createdAt || now,
          mimeType: a.mimeType || a.blob?.type || 'audio/webm',
          title: typeof a.title === 'string' ? a.title : '',
          source: a.source === 'file' ? 'file' : 'recorded'
        }))
    : [];

  const goodThings = Array.isArray(raw.goodThings)
    ? raw.goodThings.map((item) => (typeof item === 'string' ? item : String(item || ''))).slice(0, 5)
    : [];

  const timelineMoments = Array.isArray(raw.timelineMoments)
    ? raw.timelineMoments
        .filter((m) => m && typeof m === 'object')
        .map((m, idx) => ({
          id: m.id || `mom_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          time: typeof m.time === 'string' && /^\d{2}:\d{2}$/.test(m.time) ? m.time : '12:00',
          title: typeof m.title === 'string' ? m.title : '',
          note: typeof m.note === 'string' ? m.note : '',
          photoId: m.photoId || null,
          order: typeof m.order === 'number' ? m.order : idx
        }))
    : [];

  return {
    id: raw.id || `entry_${now}_${Math.random().toString(36).slice(2, 8)}`,
    dateKey,
    timeStr,
    timestamp: raw.timestamp || buildTimestamp(dateKey, timeStr),
    title: typeof raw.title === 'string' ? raw.title : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    mood: raw.mood || 'neutro',
    isMilestone: Boolean(raw.isMilestone),
    milestoneTitle: typeof raw.milestoneTitle === 'string' ? raw.milestoneTitle : '',
    isSealed: Boolean(raw.isSealed),
    sealedAt: typeof raw.sealedAt === 'number' ? raw.sealedAt : null,
    authorQuote: typeof raw.authorQuote === 'string' ? raw.authorQuote : '',
    goodThings,
    timelineMoments,
    nightReflection: typeof raw.nightReflection === 'string' ? raw.nightReflection : '',
    nightReflectionUpdatedAt: typeof raw.nightReflectionUpdatedAt === 'number' ? raw.nightReflectionUpdatedAt : null,
    gratitudePersonIds: Array.isArray(raw.gratitudePersonIds) ? raw.gratitudePersonIds.map(String) : [],
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t)) : [],
    checklist: Array.isArray(raw.checklist) ? raw.checklist.map((c) => ({ ...c })) : [],
    photos,
    audios,
    style: {
      fontFamily: raw.style?.fontFamily || 'default',
      fontSize: raw.style?.fontSize || 16,
      fontWeight: raw.style?.fontWeight || 'normal',
      fontStyle: raw.style?.fontStyle || 'normal',
      textAlign: raw.style?.textAlign || 'left',
      textColor: raw.style?.textColor || '#EAEAEA',
      paperTheme: raw.style?.paperTheme || 'deep'
    },
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now
  };
}

// --- Entries CRUD ---
export async function getAllEntries() {
  const store = await tx(STORE_ENTRIES, 'readonly');
  const items = await reqToPromise(store.getAll());
  return items.map(normalizeEntry).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

export async function getEntry(id) {
  const store = await tx(STORE_ENTRIES, 'readonly');
  const item = await reqToPromise(store.get(id));
  return item ? normalizeEntry(item) : null;
}

export async function saveEntry(entry) {
  const now = Date.now();
  const normalized = normalizeEntry({
    ...entry,
    timestamp: entry.timestamp || buildTimestamp(entry.dateKey, entry.timeStr || '12:00'),
    createdAt: entry.createdAt || now,
    updatedAt: now
  });
  const store = await tx(STORE_ENTRIES, 'readwrite');
  await reqToPromise(store.put(normalized));
  return normalized;
}

export async function deleteEntry(id) {
  const store = await tx(STORE_ENTRIES, 'readwrite');
  return reqToPromise(store.delete(id));
}

export async function clearAllData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_ENTRIES, STORE_SETTINGS, STORE_GRATITUDE], 'readwrite');
    t.objectStore(STORE_ENTRIES).clear();
    t.objectStore(STORE_SETTINGS).clear();
    t.objectStore(STORE_GRATITUDE).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// --- Gratitude People CRUD (Mural de Gratidão com Pessoas) ---
export function normalizeGratitudePerson(raw = {}) {
  const now = Date.now();
  const photo = raw.photo && (raw.photo.blob || raw.photo.dataUrl)
    ? {
        blob: raw.photo.blob || null,
        originalSize: typeof raw.photo.originalSize === 'number' ? raw.photo.originalSize : null,
        compressedSize: typeof raw.photo.compressedSize === 'number' ? raw.photo.compressedSize : (raw.photo.blob?.size || null),
        width: typeof raw.photo.width === 'number' ? raw.photo.width : null,
        height: typeof raw.photo.height === 'number' ? raw.photo.height : null
      }
    : null;

  return {
    id: raw.id || `person_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: typeof raw.name === 'string' ? raw.name : '',
    role: typeof raw.role === 'string' ? raw.role : '',
    reason: typeof raw.reason === 'string' ? raw.reason : '',
    dateKey: typeof raw.dateKey === 'string' ? raw.dateKey : '',
    linkedEntryIds: Array.isArray(raw.linkedEntryIds) ? raw.linkedEntryIds.map(String) : [],
    photo,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now
  };
}

export async function getAllGratitudePeople() {
  const store = await tx(STORE_GRATITUDE, 'readonly');
  const items = await reqToPromise(store.getAll());
  return items.map(normalizeGratitudePerson).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function saveGratitudePerson(person) {
  const now = Date.now();
  const normalized = normalizeGratitudePerson({
    ...person,
    createdAt: person.createdAt || now,
    updatedAt: now
  });
  const store = await tx(STORE_GRATITUDE, 'readwrite');
  await reqToPromise(store.put(normalized));
  return normalized;
}

export async function deleteGratitudePerson(id) {
  const store = await tx(STORE_GRATITUDE, 'readwrite');
  return reqToPromise(store.delete(id));
}

// --- Settings CRUD ---
export async function getSetting(key, fallback = null) {
  const store = await tx(STORE_SETTINGS, 'readonly');
  const res = await reqToPromise(store.get(key));
  return res ? res.value : fallback;
}

export async function saveSetting(key, value) {
  const store = await tx(STORE_SETTINGS, 'readwrite');
  return reqToPromise(store.put({ key, value, updatedAt: Date.now() }));
}

// --- Date Helpers (local timezone safe) ---
export function toDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toTimeStr(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function parseDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function buildTimestamp(dateKey, timeStr = '12:00') {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = (timeStr || '12:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0).getTime();
}

export const MONTHS_SHORT = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
export const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function formatSplashDate(date = new Date()) {
  return `${date.getDate()} de ${MONTHS_FULL[date.getMonth()]}`;
}

export function formatEntryDateParts(dateKey, timeStr) {
  const dt = parseDateKey(dateKey);
  return {
    day: String(dt.getDate()).padStart(2, '0'),
    monthShort: MONTHS_SHORT[dt.getMonth()],
    monthFull: MONTHS_FULL[dt.getMonth()],
    year: dt.getFullYear(),
    weekday: WEEKDAYS_SHORT[dt.getDay()],
    time: timeStr || '00:00'
  };
}

export function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// --- Photo Compression with Stats (Etapa 2A: max ~1280px, JPEG ~0.82) ---
export function compressPhotoWithStats(file, maxDimension = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || (file.type && !file.type.startsWith('image/'))) {
      return reject(new Error('Arquivo não é uma imagem'));
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      let wasResized = false;
      if (width > maxDimension || height > maxDimension) {
        wasResized = true;
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      // Fill deep dark background before JPEG encoding so transparent PNGs/WebPs render cleanly
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          const originalSize = file.size || 0;
          const useCanvasBlob = blob && (wasResized || blob.size <= originalSize || file.type !== 'image/jpeg');
          const finalBlob = useCanvasBlob ? blob : file;
          const compressedSize = finalBlob.size || originalSize;
          const savedPct = originalSize > 0
            ? Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100))
            : 0;
          resolve({
            blob: finalBlob,
            width,
            height,
            originalSize,
            compressedSize,
            savedPct
          });
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível decodificar a imagem'));
    };
    img.src = url;
  });
}

// --- Legacy Image Compression Helper (used by Mural) ---
export function compressImageFile(file, maxDimension = 1600, quality = 0.84) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Arquivo não é uma imagem'));
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        },
        file.type === 'image/png' ? 'image/png' : 'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

// --- Audio Metadata Duration Helper ---
export function extractAudioDuration(blob) {
  return new Promise((resolve) => {
    if (!blob) return resolve(0);
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let settled = false;

    const finish = (sec) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(sec);
    };

    const timer = setTimeout(() => finish(0), 2500);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const dur = audio.duration && isFinite(audio.duration) ? Math.round(audio.duration) : 0;
      finish(dur);
    };
    audio.onerror = () => finish(0);
    audio.src = url;
  });
}

// --- Blob <-> DataURL Helpers for Full JSON Backup ---
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    if (typeof blob === 'string') return resolve(blob);
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function dataURLToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(parts[1]);
  const len = binary.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

export async function exportFullBackup() {
  const entries = await getAllEntries();
  const mural = await getSetting('mural', null);

  const serializedEntries = [];
  for (const e of entries) {
    const photos = [];
    for (const p of e.photos || []) {
      const dataUrl = p.blob ? await blobToDataURL(p.blob) : (p.dataUrl || null);
      if (dataUrl) {
        photos.push({
          id: p.id,
          name: p.name || 'foto.jpg',
          type: p.type || 'image/jpeg',
          caption: p.caption || '',
          originalSize: p.originalSize || null,
          compressedSize: p.compressedSize || null,
          width: p.width || null,
          height: p.height || null,
          dataUrl
        });
      }
    }
    const audios = [];
    for (const a of e.audios || []) {
      const dataUrl = a.blob ? await blobToDataURL(a.blob) : (a.dataUrl || null);
      if (dataUrl) {
        audios.push({
          id: a.id,
          title: a.title || '',
          duration: a.duration || 0,
          createdAt: a.createdAt || Date.now(),
          recordedAt: a.recordedAt || a.createdAt || Date.now(),
          source: a.source || 'recorded',
          mimeType: a.mimeType || 'audio/webm',
          dataUrl
        });
      }
    }
    serializedEntries.push({ ...e, photos, audios });
  }

  let serializedMural = null;
  if (mural) {
    const muralPhotos = [];
    for (const mp of mural.photos || []) {
      const dataUrl = mp.blob ? await blobToDataURL(mp.blob) : (mp.dataUrl || null);
      if (dataUrl) muralPhotos.push({ id: mp.id, dataUrl });
    }
    serializedMural = {
      quote: mural.quote,
      author: mural.author,
      photos: muralPhotos
    };
  }

  const gratitudePeople = await getAllGratitudePeople();
  const serializedGratitude = [];
  for (const person of gratitudePeople) {
    let serializedPhoto = null;
    if (person.photo && (person.photo.blob || person.photo.dataUrl)) {
      const dataUrl = person.photo.blob ? await blobToDataURL(person.photo.blob) : person.photo.dataUrl;
      if (dataUrl) {
        serializedPhoto = {
          originalSize: person.photo.originalSize || null,
          compressedSize: person.photo.compressedSize || null,
          width: person.photo.width || null,
          height: person.photo.height || null,
          dataUrl
        };
      }
    }
    serializedGratitude.push({ ...person, photo: serializedPhoto });
  }

  return {
    app: 'Diário de Bordo',
    version: 4,
    exportedAt: new Date().toISOString(),
    entries: serializedEntries,
    mural: serializedMural,
    gratitudePeople: serializedGratitude
  };
}

export async function importFullBackup(backupData) {
  if (!backupData || !Array.isArray(backupData.entries)) {
    throw new Error('Arquivo de backup inválido.');
  }

  let importedCount = 0;
  for (const e of backupData.entries) {
    const photos = (e.photos || [])
      .map((p) => ({
        id: p.id || `ph_${Math.random().toString(36).slice(2, 9)}`,
        name: p.name || 'foto.jpg',
        type: p.type || 'image/jpeg',
        caption: typeof p.caption === 'string' ? p.caption : '',
        originalSize: typeof p.originalSize === 'number' ? p.originalSize : null,
        compressedSize: typeof p.compressedSize === 'number' ? p.compressedSize : null,
        width: typeof p.width === 'number' ? p.width : null,
        height: typeof p.height === 'number' ? p.height : null,
        blob: p.dataUrl ? dataURLToBlob(p.dataUrl) : null
      }))
      .filter((p) => p.blob);

    const audios = (e.audios || [])
      .map((a) => ({
        id: a.id || `au_${Math.random().toString(36).slice(2, 9)}`,
        title: typeof a.title === 'string' ? a.title : '',
        duration: a.duration || 0,
        createdAt: a.createdAt || Date.now(),
        recordedAt: a.recordedAt || a.createdAt || Date.now(),
        source: a.source === 'file' ? 'file' : 'recorded',
        mimeType: a.mimeType || 'audio/webm',
        blob: a.dataUrl ? dataURLToBlob(a.dataUrl) : null
      }))
      .filter((a) => a.blob);

    await saveEntry({ ...e, photos, audios });
    importedCount++;
  }

  if (backupData.mural) {
    const photos = (backupData.mural.photos || [])
      .map((p) => ({
        id: p.id || `mp_${Math.random().toString(36).slice(2, 9)}`,
        blob: p.dataUrl ? dataURLToBlob(p.dataUrl) : null
      }))
      .filter((p) => p.blob);

    await saveSetting('mural', {
      quote: backupData.mural.quote || '',
      author: backupData.mural.author || '',
      photos
    });
  }

  if (Array.isArray(backupData.gratitudePeople)) {
    for (const gp of backupData.gratitudePeople) {
      let photo = null;
      if (gp.photo && gp.photo.dataUrl) {
        const blob = dataURLToBlob(gp.photo.dataUrl);
        if (blob) {
          photo = {
            blob,
            originalSize: gp.photo.originalSize || null,
            compressedSize: gp.photo.compressedSize || blob.size,
            width: gp.photo.width || null,
            height: gp.photo.height || null
          };
        }
      }
      await saveGratitudePerson({ ...gp, photo });
    }
  }

  return importedCount;
}

export async function getStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      return { usage: est.usage || 0, quota: est.quota || 0 };
    } catch {
      return null;
    }
  }
  return null;
}
