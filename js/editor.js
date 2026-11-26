// Capsule of the Day Editor for Diário de Bordo (Etapa 2A)
import {
  saveEntry,
  deleteEntry,
  toDateKey,
  toTimeStr,
  formatEntryDateParts,
  buildTimestamp,
  compressPhotoWithStats,
  extractAudioDuration,
  formatBytes
} from './db.js';
import { ICONS, MOODS, getMoodById } from './icons.js';
import { isCapsuleConsistent, findTemporalEchoes } from './echo.js';

const CAPSULE_TABS = [
  { id: 'overview', label: 'Visão Geral', icon: ICONS.overview },
  { id: 'timeline', label: 'Linha do Dia', icon: ICONS.clock },
  { id: 'photos', label: 'Fotos', icon: ICONS.gallery },
  { id: 'audios', label: 'Áudios', icon: ICONS.mic },
  { id: 'text', label: 'Texto & Autoria', icon: ICONS.textAuthor },
  { id: 'goodThings', label: 'Coisas Boas', icon: ICONS.sparkle }
];

const FONT_PRESETS = [
  { id: 'default', label: 'Padrão', css: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" },
  { id: 'serif', label: 'Clássica', css: "'Playfair Display', Georgia, 'Times New Roman', serif" },
  { id: 'italic-serif', label: 'Literária', css: "Georgia, 'Times New Roman', serif", italic: true },
  { id: 'handwriting', label: 'Manuscrita', css: "'Caveat', 'Segoe Script', cursive" },
  { id: 'condensed', label: 'Condensada', css: "'Oswald', 'Arial Narrow', sans-serif" },
  { id: 'mono', label: 'Máquina', css: "'JetBrains Mono', 'Consolas', monospace" }
];

const TEXT_COLORS = [
  '#EAEAEA',
  '#B8B8B8',
  '#D4B483',
  '#C98A6B',
  '#B56565',
  '#8FB996',
  '#8DA9C4'
];

const PAPER_THEMES = [
  { id: 'deep', label: 'Escuro Profundo' },
  { id: 'charcoal', label: 'Carvão Suave' },
  { id: 'lined', label: 'Folha Pautada' },
  { id: 'dotted', label: 'Folha Pontilhada' },
  { id: 'warm', label: 'Noturno Quente' }
];

const EMOJI_GROUPS = [
  { icon: '😀', items: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤔','🤫','🤭','🤗','😌','😔','😢','😭','😤','😠','🤯','😴','🥺','😎'] },
  { icon: '🌿', items: ['🌙','⭐','✨','☀️','🌅','🌄','🌌','🌧️','🌈','🔥','🌊','🌿','🌱','🌲','🌻','🌹','🍀','🍂','🦋','🐾','☕','🍵','🍷','🎵','🎧','📚','✍️','🧭'] },
  { icon: '💛', items: ['💛','🤍','🖤','❤️','🧡','💜','💙','💚','🙏','🙌','👏','💪','🤝','✌️','🫶','🎯','🏆','💡','🕯️','🗝️','📷','🎙️','✈️','🏔️','🏕️','🏡','⏳','🕊️'] }
];

const SARA_PLACEHOLDERS = [
  'Um detalhe pequeno que fez meu dia valer a pena...',
  'Uma conversa, sorriso ou conquista inesperada de hoje...',
  'Algo único que só aconteceu neste dia...',
  'Um momento de paz, foco ou gratidão...',
  'Mais uma lembrança boa para guardar deste dia...'
];

let currentState = null;
let activeCapsuleTab = 'overview';
let undoStack = [];
let redoStack = [];
let editorObjectUrls = [];
let activeDrawer = null; // null | 'typography' | 'emoji' | 'tags'
let activeEmojiTab = 0;
let lastCompressionSummary = null;
let momentComposerOpen = false;
let editingMomentId = null;
let momentDraft = { time: '12:00', title: '', note: '', photoId: null };
let linkNextUploadedPhotoToMoment = false;

// Audio recording & playback state
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let mediaStream = null;
let activeAudioPlayer = null;

function revokeEditorUrls() {
  editorObjectUrls.forEach((u) => URL.revokeObjectURL(u));
  editorObjectUrls = [];
}

function stopActiveAudioPlayback() {
  if (activeAudioPlayer) {
    activeAudioPlayer.pause();
    activeAudioPlayer = null;
  }
}

function cleanupRecording() {
  clearInterval(recordingTimer);
  recordingTimer = null;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch { /* noop */ }
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  mediaRecorder = null;
  audioChunks = [];
  recordingSeconds = 0;
}

function getFilledGoodThings(list = currentState?.goodThings || []) {
  return list.map((s) => String(s || '').trim()).filter(Boolean);
}

function pushUndoSnapshot() {
  if (!currentState) return;
  const snap = JSON.stringify({
    title: currentState.title,
    content: currentState.content,
    checklist: currentState.checklist,
    authorQuote: currentState.authorQuote,
    milestoneTitle: currentState.milestoneTitle,
    goodThings: currentState.goodThings,
    timelineMoments: currentState.timelineMoments,
    nightReflection: currentState.nightReflection
  });
  if (undoStack[undoStack.length - 1] !== snap) {
    undoStack.push(snap);
    if (undoStack.length > 40) undoStack.shift();
    redoStack = [];
  }
}

export function openEditor({
  entry = null,
  dateKey = null,
  allTags = [],
  allEntries = [],
  initialTab = 'overview',
  onSaved,
  onDeleted,
  onToast,
  onOpenLightbox,
  onApplyQuoteToMural,
  onOpenEcho
}) {
  const modal = document.getElementById('editor-screen');
  if (!modal) return;

  stopActiveAudioPlayback();
  cleanupRecording();
  revokeEditorUrls();
  activeDrawer = null;
  activeEmojiTab = 0;
  lastCompressionSummary = null;
  momentComposerOpen = false;
  editingMomentId = null;
  linkNextUploadedPhotoToMoment = false;

  const now = new Date();
  const isEditing = Boolean(entry && entry.id);
  const initialGoodThings = Array.isArray(entry?.goodThings) && entry.goodThings.length > 0
    ? [...entry.goodThings].slice(0, 5)
    : ['', '', ''];

  currentState = {
    id: entry?.id || null,
    dateKey: entry?.dateKey || dateKey || toDateKey(now),
    timeStr: entry?.timeStr || toTimeStr(now),
    title: entry?.title || '',
    content: entry?.content || '',
    mood: entry?.mood || 'neutro',
    isMilestone: Boolean(entry?.isMilestone),
    milestoneTitle: entry?.milestoneTitle || '',
    isSealed: Boolean(entry?.isSealed),
    sealedAt: entry?.sealedAt || null,
    authorQuote: entry?.authorQuote || '',
    goodThings: initialGoodThings,
    timelineMoments: Array.isArray(entry?.timelineMoments) ? entry.timelineMoments.map((m) => ({ ...m })) : [],
    nightReflection: entry?.nightReflection || '',
    nightReflectionUpdatedAt: entry?.nightReflectionUpdatedAt || null,
    tags: entry?.tags ? [...entry.tags] : [],
    checklist: entry?.checklist ? entry.checklist.map((c) => ({ ...c })) : [],
    photos: entry?.photos ? entry.photos.map((p) => ({ ...p })) : [],
    videos: entry?.videos ? entry.videos.map((v) => ({ ...v })) : [],
    audios: entry?.audios ? entry.audios.map((a) => ({ ...a })) : [],
    style: {
      fontFamily: entry?.style?.fontFamily || 'default',
      fontSize: entry?.style?.fontSize || 16,
      fontWeight: entry?.style?.fontWeight || 'normal',
      fontStyle: entry?.style?.fontStyle || 'normal',
      textAlign: entry?.style?.textAlign || 'left',
      textColor: entry?.style?.textColor || '#EAEAEA',
      paperTheme: entry?.style?.paperTheme || 'deep'
    },
    createdAt: entry?.createdAt || null
  };

  activeCapsuleTab = CAPSULE_TABS.some((t) => t.id === initialTab) ? initialTab : 'overview';

  undoStack = [
    JSON.stringify({
      title: currentState.title,
      content: currentState.content,
      checklist: currentState.checklist,
      authorQuote: currentState.authorQuote,
      milestoneTitle: currentState.milestoneTitle,
      goodThings: currentState.goodThings,
      timelineMoments: currentState.timelineMoments,
      nightReflection: currentState.nightReflection
    })
  ];
  redoStack = [];

  const callbacks = {
    isEditing,
    allTags,
    allEntries,
    onSaved,
    onDeleted,
    onToast,
    onOpenLightbox,
    onApplyQuoteToMural,
    onOpenEcho
  };

  renderEditorShell(modal, callbacks);
  modal.classList.add('open');
}

function closeEditor(modal) {
  stopActiveAudioPlayback();
  cleanupRecording();
  revokeEditorUrls();
  activeDrawer = null;
  modal.classList.remove('open');
}

function getFontCss(fontId) {
  return FONT_PRESETS.find((f) => f.id === fontId) || FONT_PRESETS[0];
}

function applyTypographyToFields(modal) {
  const s = currentState.style;
  const preset = getFontCss(s.fontFamily);
  const contentEl = modal.querySelector('#ed-content');
  const titleEl = modal.querySelector('#ed-title');
  const surface = modal.querySelector('.editor-surface');

  if (surface) {
    PAPER_THEMES.forEach((t) => surface.classList.remove(`paper-${t.id}`));
    surface.classList.add(`paper-${s.paperTheme || 'deep'}`);
  }

  if (contentEl) {
    contentEl.style.fontFamily = preset.css;
    contentEl.style.fontSize = `${s.fontSize}px`;
    contentEl.style.fontWeight = s.fontWeight;
    contentEl.style.fontStyle = preset.italic ? 'italic' : s.fontStyle;
    contentEl.style.textAlign = s.textAlign;
    contentEl.style.color = s.textColor;
  }
  if (titleEl) {
    titleEl.style.fontFamily = preset.css;
    titleEl.style.textAlign = s.textAlign;
  }
}

function autoResizeTextarea(el, minHeight = 140) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(minHeight, el.scrollHeight) + 'px';
}

function updateUndoRedoButtons(modal) {
  const undoBtn = modal.querySelector('#ed-undo');
  const redoBtn = modal.querySelector('#ed-redo');
  if (undoBtn) undoBtn.disabled = undoStack.length <= 1;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function renderCapsuleTabsBar(modal) {
  const bar = modal.querySelector('#ed-capsule-tabs');
  if (!bar) return;

  const photoCount = currentState.photos.length + currentState.videos.length;
  const audioCount = currentState.audios.length;
  const momentCount = currentState.timelineMoments.length;
  const goodCount = getFilledGoodThings().length;
  const hasTextOrQuote = Boolean(currentState.title.trim() || currentState.content.trim() || currentState.authorQuote.trim());
  const hasNight = Boolean(currentState.nightReflection.trim());

  const getBadge = (id) => {
    if (id === 'timeline') {
      if (momentCount > 0) return `<span class="capsule-tab-badge">${momentCount}</span>`;
      if (hasNight) return `<span class="capsule-tab-dot"></span>`;
    }
    if (id === 'photos' && photoCount > 0) return `<span class="capsule-tab-badge">${photoCount}</span>`;
    if (id === 'audios' && audioCount > 0) return `<span class="capsule-tab-badge">${audioCount}</span>`;
    if (id === 'goodThings' && goodCount > 0) return `<span class="capsule-tab-badge">${goodCount}/5</span>`;
    if (id === 'text' && hasTextOrQuote) return `<span class="capsule-tab-dot"></span>`;
    if (id === 'overview' && currentState.isMilestone) return `<span class="capsule-tab-star">★</span>`;
    return '';
  };

  bar.innerHTML = CAPSULE_TABS.map((tab) => `
    <button class="capsule-tab ${activeCapsuleTab === tab.id ? 'active' : ''}" data-cap-tab="${tab.id}" type="button">
      <span class="capsule-tab-icon">${tab.icon}</span>
      <span>${tab.label}</span>
      ${getBadge(tab.id)}
    </button>
  `).join('');

  bar.querySelectorAll('[data-cap-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.capTab;
      if (target === activeCapsuleTab) return;
      switchCapsuleTab(modal, target, modal._callbacks);
    });
  });

  // Ensure active tab button scrolls nicely into view on narrow screens
  const activeBtn = bar.querySelector('.capsule-tab.active');
  activeBtn?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
}

function switchCapsuleTab(modal, tabId, callbacks) {
  activeCapsuleTab = tabId;
  if (tabId !== 'text') {
    activeDrawer = null;
    const drawer = modal.querySelector('#ed-drawer');
    if (drawer) {
      drawer.hidden = true;
      drawer.innerHTML = '';
    }
  }
  const toolbar = modal.querySelector('#ed-toolbar');
  if (toolbar) toolbar.hidden = tabId !== 'text';

  renderCapsuleTabsBar(modal);
  renderActiveCapsulePane(modal, callbacks);
}

function renderEditorShell(modal, callbacks) {
  modal._callbacks = callbacks;
  const parts = formatEntryDateParts(currentState.dateKey, currentState.timeStr);
  const mood = getMoodById(currentState.mood);

  modal.innerHTML = `
    <div class="editor-surface paper-${currentState.style.paperTheme || 'deep'}">
      <!-- Top Bar -->
      <header class="editor-topbar">
        <button class="icon-btn" id="ed-close" aria-label="Fechar editor">${ICONS.close}</button>
        <div class="editor-topbar-center">
          <span class="capsule-header-tag">Cápsula do Dia</span>
        </div>
        <div class="editor-topbar-right">
          <button class="icon-btn ed-history-btn" id="ed-undo" title="Desfazer" aria-label="Desfazer">${ICONS.undo}</button>
          <button class="icon-btn ed-history-btn" id="ed-redo" title="Refazer" aria-label="Refazer">${ICONS.redo}</button>
          <div class="ed-more-wrap">
            <button class="icon-btn" id="ed-more-btn" title="Opções" aria-label="Mais opções">${ICONS.dotsH}</button>
            <div class="ed-dropdown" id="ed-dropdown">
              <button class="ed-dropdown-item" id="ed-cycle-paper">Mudar fundo do papel</button>
              ${callbacks.isEditing ? `<button class="ed-dropdown-item danger" id="ed-delete-entry">${ICONS.trash} Excluir registro</button>` : ''}
            </div>
          </div>
          <button class="btn-save-pill" id="ed-save">Salvar</button>
        </div>
      </header>

      <!-- Date & Mood Header + Capsule Tab Bar -->
      <div class="capsule-sticky-head">
        <div class="editor-meta-row">
          <button class="editor-date-trigger" id="ed-date-trigger" title="Alterar data e hora">
            <span class="ed-day-big">${parts.day}</span>
            <span class="ed-date-rest">${parts.monthShort} ${parts.year} · ${parts.time}</span>
            <span class="ed-caret-down">${ICONS.chevDown}</span>
          </button>

          <button class="editor-mood-trigger" id="ed-mood-trigger" title="Humor: ${mood.label}" style="color:${mood.color}">
            ${mood.svg}
          </button>
        </div>

        <!-- Inline Date/Time Picker Panel -->
        <div class="ed-inline-popover" id="ed-datetime-panel" hidden>
          <div class="ed-dt-grid">
            <label>
              <span>Data</span>
              <input type="date" id="ed-date-input" class="dark-input" value="${currentState.dateKey}">
            </label>
            <label>
              <span>Hora</span>
              <input type="time" id="ed-time-input" class="dark-input" value="${currentState.timeStr}">
            </label>
          </div>
          <button class="btn-gold btn-xs" id="ed-dt-done">Aplicar data</button>
        </div>

        <!-- Inline Mood Picker Panel -->
        <div class="ed-inline-popover" id="ed-mood-panel" hidden>
          <p class="popover-title">Como você está se sentindo?</p>
          <div class="mood-grid">
            ${MOODS.map((m) => `
              <button class="mood-option ${m.id === currentState.mood ? 'active' : ''}" data-pick-mood="${m.id}" style="--mood-color:${m.color}">
                <span class="mood-option-icon">${m.svg}</span>
                <span>${m.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 5 Capsule Tabs -->
        <nav class="capsule-tabs" id="ed-capsule-tabs" aria-label="Seções da Cápsula do Dia"></nav>
      </div>

      <!-- Scrollable Active Tab Content -->
      <div class="editor-scroll" id="ed-scroll">
        <div class="capsule-pane" id="ed-capsule-body"></div>
      </div>

      <!-- Contextual Drawer (Typography / Emoji / Tags on Text tab) -->
      <div class="editor-drawer" id="ed-drawer" hidden></div>

      <!-- Hidden File Pickers -->
      <input type="file" id="ed-photo-file-input" accept="image/*" multiple hidden>
      <input type="file" id="ed-video-file-input" accept="video/*" multiple hidden>
      <input type="file" id="ed-audio-file-input" accept="audio/*" multiple hidden>

      <!-- Bottom Formatting Toolbar (shown on Texto & Autoria tab) -->
      <div class="editor-toolbar" id="ed-toolbar" ${activeCapsuleTab !== 'text' ? 'hidden' : ''}>
        <button class="tb-btn" data-tool="paper" title="Tema do papel">${ICONS.paperBg}</button>
        <button class="tb-btn" data-tool="photos" title="Anexar fotos com compressão">${ICONS.gallery}</button>
        <button class="tb-btn" data-tool="typography" title="Formatação e fonte">${ICONS.typography}</button>
        <button class="tb-btn" data-tool="checklist" title="Lista de tarefas">${ICONS.checklist}</button>
        <button class="tb-btn" data-tool="quote" title="Inserir citação">${ICONS.quote}</button>
        <button class="tb-btn" data-tool="emoji" title="Inserir emoji">${ICONS.emoji}</button>
        <button class="tb-btn" data-tool="bullet" title="Lista com marcadores">${ICONS.bulletList}</button>
        <button class="tb-btn" data-tool="tags" title="Adicionar #tags">${ICONS.tag}</button>
        <button class="tb-btn" data-tool="audio" title="Ir para Áudios do Dia">${ICONS.mic}</button>
      </div>
    </div>
  `;

  renderCapsuleTabsBar(modal);
  renderActiveCapsulePane(modal, callbacks);
  updateUndoRedoButtons(modal);
  wireShellEvents(modal, callbacks);
}

function wireShellEvents(modal, callbacks) {
  modal.querySelector('#ed-close').addEventListener('click', () => closeEditor(modal));

  modal.querySelector('#ed-undo').addEventListener('click', () => {
    if (undoStack.length <= 1) return;
    const cur = undoStack.pop();
    redoStack.push(cur);
    const prev = JSON.parse(undoStack[undoStack.length - 1]);
    currentState.title = prev.title || '';
    currentState.content = prev.content || '';
    currentState.checklist = prev.checklist || [];
    currentState.authorQuote = prev.authorQuote || '';
    currentState.milestoneTitle = prev.milestoneTitle || '';
    currentState.goodThings = Array.isArray(prev.goodThings) ? prev.goodThings : ['', '', ''];
    currentState.timelineMoments = Array.isArray(prev.timelineMoments) ? prev.timelineMoments : [];
    currentState.nightReflection = prev.nightReflection || '';
    renderActiveCapsulePane(modal, callbacks);
    renderCapsuleTabsBar(modal);
    updateUndoRedoButtons(modal);
  });

  modal.querySelector('#ed-redo').addEventListener('click', () => {
    if (redoStack.length === 0) return;
    const nextStr = redoStack.pop();
    undoStack.push(nextStr);
    const next = JSON.parse(nextStr);
    currentState.title = next.title || '';
    currentState.content = next.content || '';
    currentState.checklist = next.checklist || [];
    currentState.authorQuote = next.authorQuote || '';
    currentState.milestoneTitle = next.milestoneTitle || '';
    currentState.goodThings = Array.isArray(next.goodThings) ? next.goodThings : ['', '', ''];
    currentState.timelineMoments = Array.isArray(next.timelineMoments) ? next.timelineMoments : [];
    currentState.nightReflection = next.nightReflection || '';
    renderActiveCapsulePane(modal, callbacks);
    renderCapsuleTabsBar(modal);
    updateUndoRedoButtons(modal);
  });

  // More dropdown
  const dropdown = modal.querySelector('#ed-dropdown');
  modal.querySelector('#ed-more-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  modal.addEventListener('click', () => dropdown.classList.remove('open'));

  modal.querySelector('#ed-cycle-paper')?.addEventListener('click', () => {
    cyclePaperTheme(modal, callbacks.onToast);
  });

  modal.querySelector('#ed-delete-entry')?.addEventListener('click', async () => {
    if (!currentState.id) return;
    if (confirm('Deseja realmente excluir esta Cápsula do Dia permanentemente?')) {
      await deleteEntry(currentState.id);
      closeEditor(modal);
      callbacks.onDeleted?.();
      callbacks.onToast?.('Registro excluído');
    }
  });

  // Date & Time toggle
  const dtPanel = modal.querySelector('#ed-datetime-panel');
  const moodPanel = modal.querySelector('#ed-mood-panel');

  modal.querySelector('#ed-date-trigger').addEventListener('click', () => {
    moodPanel.hidden = true;
    dtPanel.hidden = !dtPanel.hidden;
  });

  modal.querySelector('#ed-dt-done').addEventListener('click', () => {
    const newDate = modal.querySelector('#ed-date-input').value;
    const newTime = modal.querySelector('#ed-time-input').value;
    if (newDate) currentState.dateKey = newDate;
    if (newTime) currentState.timeStr = newTime;
    const p = formatEntryDateParts(currentState.dateKey, currentState.timeStr);
    modal.querySelector('.ed-day-big').textContent = p.day;
    modal.querySelector('.ed-date-rest').textContent = `${p.monthShort} ${p.year} · ${p.time}`;
    dtPanel.hidden = true;
    if (activeCapsuleTab === 'overview') renderActiveCapsulePane(modal, callbacks);
  });

  // Mood toggle
  modal.querySelector('#ed-mood-trigger').addEventListener('click', () => {
    dtPanel.hidden = true;
    moodPanel.hidden = !moodPanel.hidden;
  });

  modal.querySelectorAll('[data-pick-mood]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentState.mood = btn.dataset.pickMood;
      const m = getMoodById(currentState.mood);
      const trigger = modal.querySelector('#ed-mood-trigger');
      trigger.innerHTML = m.svg;
      trigger.style.color = m.color;
      trigger.title = `Humor: ${m.label}`;
      modal.querySelectorAll('[data-pick-mood]').forEach((b) => b.classList.toggle('active', b.dataset.pickMood === currentState.mood));
      moodPanel.hidden = true;
      if (activeCapsuleTab === 'overview') renderActiveCapsulePane(modal, callbacks);
    });
  });

  // Photo picker with automatic lightweight compression (~1280px, JPEG 0.82)
  const photoInput = modal.querySelector('#ed-photo-file-input');
  photoInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    callbacks.onToast?.(`Comprimindo ${files.length} ${files.length === 1 ? 'foto' : 'fotos'}...`);
    let origTotal = 0;
    let compTotal = 0;
    let added = 0;
    let firstAddedId = null;

    for (const file of files) {
      try {
        const res = await compressPhotoWithStats(file, 1280, 0.82);
        origTotal += res.originalSize;
        compTotal += res.compressedSize;
        added++;
        const photoId = `ph_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        if (!firstAddedId) firstAddedId = photoId;
        currentState.photos.push({
          id: photoId,
          name: file.name,
          type: res.blob.type || 'image/jpeg',
          caption: '',
          originalSize: res.originalSize,
          compressedSize: res.compressedSize,
          width: res.width,
          height: res.height,
          blob: res.blob
        });
      } catch {
        // skip unsupported/corrupted file
      }
    }
    photoInput.value = '';

    if (added > 0) {
      if (linkNextUploadedPhotoToMoment && firstAddedId) {
        momentDraft.photoId = firstAddedId;
      }
      linkNextUploadedPhotoToMoment = false;
      const savedPct = origTotal > 0 ? Math.max(0, Math.round(((origTotal - compTotal) / origTotal) * 100)) : 0;
      lastCompressionSummary = {
        count: added,
        original: formatBytes(origTotal),
        compressed: formatBytes(compTotal),
        savedPct
      };
      callbacks.onToast?.(
        `${added} ${added === 1 ? 'foto comprimida' : 'fotos comprimidas'} (${lastCompressionSummary.original} → ${lastCompressionSummary.compressed})`
      );
      renderCapsuleTabsBar(modal);
      if (activeCapsuleTab === 'photos' || activeCapsuleTab === 'overview' || activeCapsuleTab === 'timeline') {
        renderActiveCapsulePane(modal, callbacks);
      }
    } else {
      linkNextUploadedPhotoToMoment = false;
      callbacks.onToast?.('Nenhuma imagem válida selecionada.');
    }
  });

  // Video file picker
  const videoInput = modal.querySelector('#ed-video-file-input');
  videoInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    let added = 0;
    for (const file of files) {
      if (file.type && !file.type.startsWith('video/')) continue;
      currentState.videos.push({
        id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        blob: file,
        name: file.name || 'video.mp4',
        type: file.type || 'video/mp4',
        size: file.size || 0,
        caption: '',
        createdAt: Date.now()
      });
      added++;
    }
    videoInput.value = '';
    if (added > 0) {
      renderCapsuleTabsBar(modal);
      if (activeCapsuleTab === 'photos' || activeCapsuleTab === 'overview') {
        renderActiveCapsulePane(modal, callbacks);
      }
      callbacks.onToast?.(`${added} ${added === 1 ? 'vídeo anexado' : 'vídeos anexados'}!`);
    }
  });

  // Device audio file picker
  const audioInput = modal.querySelector('#ed-audio-file-input');
  audioInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    callbacks.onToast?.(`Importando ${files.length} ${files.length === 1 ? 'áudio' : 'áudios'}...`);
    let added = 0;
    for (const file of files) {
      if (file.type && !file.type.startsWith('audio/')) continue;
      const duration = await extractAudioDuration(file);
      const cleanName = file.name ? file.name.replace(/\.[^.]+$/, '') : 'Áudio do aparelho';
      currentState.audios.push({
        id: `au_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        blob: file,
        duration,
        mimeType: file.type || 'audio/mpeg',
        title: cleanName,
        source: 'file',
        createdAt: Date.now(),
        recordedAt: Date.now()
      });
      added++;
    }
    audioInput.value = '';
    if (added > 0) {
      renderCapsuleTabsBar(modal);
      if (activeCapsuleTab === 'audios' || activeCapsuleTab === 'overview') {
        renderActiveCapsulePane(modal, callbacks);
      }
      callbacks.onToast?.(`${added} ${added === 1 ? 'áudio anexado' : 'áudios anexados'}!`);
    }
  });

  // Bottom Toolbar actions (visible on Texto & Autoria tab)
  modal.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      const contentInput = modal.querySelector('#ed-content');
      if (tool === 'paper') {
        cyclePaperTheme(modal, callbacks.onToast);
      } else if (tool === 'photos') {
        linkNextUploadedPhotoToMoment = false;
        photoInput.click();
      } else if (tool === 'typography') {
        toggleDrawer(modal, 'typography', callbacks);
      } else if (tool === 'checklist') {
        currentState.checklist.push({ id: `ck_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text: '', done: false });
        pushUndoSnapshot();
        renderChecklistZone(modal, true);
        updateUndoRedoButtons(modal);
      } else if (tool === 'quote' && contentInput) {
        insertTextAtCursor(contentInput, '\n“ ”');
        currentState.content = contentInput.value;
        autoResizeTextarea(contentInput);
        pushUndoSnapshot();
      } else if (tool === 'emoji') {
        toggleDrawer(modal, 'emoji', callbacks);
      } else if (tool === 'bullet' && contentInput) {
        const prefix = contentInput.value && !contentInput.value.endsWith('\n') ? '\n• ' : '• ';
        insertTextAtCursor(contentInput, prefix);
        currentState.content = contentInput.value;
        autoResizeTextarea(contentInput);
        pushUndoSnapshot();
      } else if (tool === 'tags') {
        toggleDrawer(modal, 'tags', callbacks);
      } else if (tool === 'audio') {
        switchCapsuleTab(modal, 'audios', callbacks);
      }
    });
  });

  // Save Button
  modal.querySelector('#ed-save').addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      callbacks.onToast?.('Finalize ou cancele a gravação de áudio antes de salvar.');
      return;
    }

    const cleanChecklist = currentState.checklist.filter((c) => c.text.trim() !== '' || c.done);
    const cleanGoodThings = getFilledGoodThings().slice(0, 5);
    const hasSomething =
      currentState.title.trim() ||
      currentState.content.trim() ||
      currentState.authorQuote.trim() ||
      currentState.nightReflection.trim() ||
      currentState.isMilestone ||
      currentState.isSealed ||
      currentState.timelineMoments.length > 0 ||
      cleanGoodThings.length > 0 ||
      cleanChecklist.length > 0 ||
      currentState.photos.length > 0 ||
      currentState.videos.length > 0 ||
      currentState.audios.length > 0;

    if (!hasSomething) {
      callbacks.onToast?.('Preencha algum conteúdo (texto, momento, foto, áudio ou coisa boa) antes de salvar.');
      return;
    }

    const saved = await saveEntry({
      ...currentState,
      milestoneTitle: currentState.isMilestone ? currentState.milestoneTitle.trim() : '',
      isSealed: Boolean(currentState.isSealed),
      sealedAt: currentState.isSealed ? (currentState.sealedAt || Date.now()) : null,
      authorQuote: currentState.authorQuote.trim(),
      goodThings: cleanGoodThings,
      timelineMoments: currentState.timelineMoments.map((m, idx) => ({ ...m, order: idx })),
      nightReflection: currentState.nightReflection.trim(),
      nightReflectionUpdatedAt: currentState.nightReflection.trim()
        ? (currentState.nightReflectionUpdatedAt || Date.now())
        : null,
      checklist: cleanChecklist,
      timestamp: buildTimestamp(currentState.dateKey, currentState.timeStr)
    });

    closeEditor(modal);
    callbacks.onSaved?.(saved);
    callbacks.onToast?.('Cápsula do Dia salva no Diário de Bordo!');
  });
}

function renderActiveCapsulePane(modal, callbacks) {
  const host = modal.querySelector('#ed-capsule-body');
  if (!host) return;

  revokeEditorUrls();
  // Restart subtle pane entrance animation
  host.classList.remove('capsule-pane');
  void host.offsetWidth;
  host.classList.add('capsule-pane');

  if (activeCapsuleTab === 'overview') renderOverviewTab(modal, host, callbacks);
  else if (activeCapsuleTab === 'timeline') renderTimelineTab(modal, host, callbacks);
  else if (activeCapsuleTab === 'photos') renderPhotosTab(modal, host, callbacks);
  else if (activeCapsuleTab === 'audios') renderAudiosTab(modal, host, callbacks);
  else if (activeCapsuleTab === 'text') renderTextTab(modal, host, callbacks);
  else if (activeCapsuleTab === 'goodThings') renderGoodThingsTab(modal, host);
}

// ============================================================================
// TAB 1: VISÃO GERAL (Evento Marcante + Cápsula Selada + Eco Temporal + Resumo)
// ============================================================================
function renderOverviewTab(modal, host, callbacks) {
  const filledGood = getFilledGoodThings();
  const hasQuote = Boolean(currentState.authorQuote.trim());
  const sealStatus = isCapsuleConsistent(currentState);
  const echoes = findTemporalEchoes(currentState, callbacks.allEntries || [], 2);

  const sealedDateStr = currentState.sealedAt
    ? (() => {
        const dt = new Date(currentState.sealedAt);
        return `Selada em ${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')} às ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      })()
    : 'Memória selada com consistência';

  const sealCardHtml = currentState.isSealed
    ? `
      <section class="seal-card sealed">
        <div class="seal-card-row">
          <div class="seal-emblem">${ICONS.sealCheck}</div>
          <div class="seal-text">
            <h4>Cápsula Selada</h4>
            <p>${sealedDateStr}</p>
          </div>
          <button type="button" class="btn-unseal-subtle" id="ed-unseal-btn">Reabrir</button>
        </div>
      </section>
    `
    : (sealStatus.consistent
        ? `
          <section class="seal-card ready">
            <div class="seal-card-row">
              <div class="seal-emblem">${ICONS.seal}</div>
              <div class="seal-text">
                <h4>Cápsula Completa</h4>
                <p>Narrativa e registros prontos para selar este dia.</p>
              </div>
              <button type="button" class="btn-seal-capsule" id="ed-seal-btn">Selar</button>
            </div>
          </section>
        `
        : `
          <section class="seal-card">
            <div class="seal-card-row">
              <div class="seal-emblem">${ICONS.seal}</div>
              <div class="seal-text">
                <h4>Estado da Cápsula</h4>
                <p>Combine narrativa e registro para selar o dia.</p>
              </div>
            </div>
            <div class="seal-criteria-row">
              <span class="seal-criterion ${sealStatus.hasNarrative ? 'met' : ''}">
                ${sealStatus.hasNarrative ? '✓' : '○'} Texto ou Autoria
              </span>
              <span class="seal-criterion ${sealStatus.hasRichMedia ? 'met' : ''}">
                ${sealStatus.hasRichMedia ? '✓' : '○'} Foto, Áudio ou Coisa Boa
              </span>
            </div>
          </section>
        `);

  const echoesHtml = echoes.length > 0
    ? `
      <section class="echo-section" aria-label="Eco Temporal">
        <div class="echo-section-head">
          <span class="echo-head-title">${ICONS.echo} Naquele Tempo · Eco Temporal</span>
          <span class="echo-head-sub">${echoes.length} ${echoes.length === 1 ? 'lembrança' : 'lembranças'}</span>
        </div>
        <div class="echo-list">
          ${echoes.map((item) => {
            const e = item.entry;
            const ep = formatEntryDateParts(e.dateKey, e.timeStr);
            const snippet = (e.authorQuote || e.content || '').trim();
            let thumbHtml = '';
            if (e.photos && e.photos[0]?.blob) {
              const url = URL.createObjectURL(e.photos[0].blob);
              editorObjectUrls.push(url);
              thumbHtml = `<img class="echo-thumb" src="${url}" alt="Miniatura da memória">`;
            }
            return `
              <button type="button" class="card echo-card" data-open-echo="${e.id}">
                <div class="echo-card-main">
                  <div class="echo-top-row">
                    <span class="echo-reason-pill">${escapeHtml(item.reason)}</span>
                    <span class="echo-date-row">${ep.day} ${ep.monthShort} ${ep.year}</span>
                  </div>
                  ${e.title ? `<strong class="echo-title">${escapeHtml(e.title)}</strong>` : ''}
                  ${snippet ? `<p class="echo-snippet">${escapeHtml(snippet)}</p>` : ''}
                </div>
                ${thumbHtml}
              </button>
            `;
          }).join('')}
        </div>
      </section>
    `
    : '';

  const mediaTotal = currentState.photos.length + currentState.videos.length;
  const mediaLabel = currentState.videos.length > 0
    ? (currentState.photos.length > 0
        ? `${currentState.photos.length} foto${currentState.photos.length > 1 ? 's' : ''} · ${currentState.videos.length} vídeo${currentState.videos.length > 1 ? 's' : ''}`
        : (currentState.videos.length === 1 ? 'Vídeo no dia' : 'Vídeos no dia'))
    : (currentState.photos.length === 1 ? 'Foto no dia' : 'Fotos no dia');

  host.innerHTML = `
    <!-- Evento Marcante Card -->
    <section class="milestone-card ${currentState.isMilestone ? 'active' : ''}">
      <div class="milestone-row">
        <div class="milestone-info">
          <span class="milestone-star-icon ${currentState.isMilestone ? 'lit' : ''}">
            ${currentState.isMilestone ? ICONS.starFilled : ICONS.star}
          </span>
          <div>
            <h4>Evento Marcante</h4>
            <p>${currentState.isMilestone ? 'Este dia está destacado como marco especial' : 'Sinalize se hoje aconteceu algo memorável'}</p>
          </div>
        </div>
        <button
          type="button"
          class="milestone-switch ${currentState.isMilestone ? 'on' : ''}"
          id="ed-milestone-toggle"
          role="switch"
          aria-checked="${currentState.isMilestone}"
          aria-label="Marcar como Evento Marcante">
          <span class="milestone-knob"></span>
        </button>
      </div>

      ${currentState.isMilestone ? `
        <div class="milestone-title-box">
          <input
            type="text"
            id="ed-milestone-title"
            class="dark-input"
            maxlength="70"
            placeholder="Título curto do marco (ex: Primeiro projeto lançado)"
            value="${escapeHtml(currentState.milestoneTitle)}">
        </div>
      ` : ''}
    </section>

    ${sealCardHtml}

    <!-- Capsule Summary Grid (interactive jump to tabs) -->
    <section class="capsule-summary-grid" aria-label="Resumo da Cápsula">
      <button type="button" class="capsule-stat-tile" data-jump-tab="photos">
        <span class="cstat-icon">${ICONS.gallery}</span>
        <strong>${mediaTotal}</strong>
        <span>${mediaLabel}</span>
      </button>

      <button type="button" class="capsule-stat-tile" data-jump-tab="audios">
        <span class="cstat-icon">${ICONS.mic}</span>
        <strong>${currentState.audios.length}</strong>
        <span>${currentState.audios.length === 1 ? 'Áudio salvo' : 'Áudios salvos'}</span>
      </button>

      <button type="button" class="capsule-stat-tile ${hasQuote ? 'filled' : ''}" data-jump-tab="text">
        <span class="cstat-icon">${ICONS.quote}</span>
        <strong>${hasQuote ? 'Registrada' : 'Em branco'}</strong>
        <span>Frase / Autoria</span>
      </button>

      <button type="button" class="capsule-stat-tile ${filledGood.length ? 'filled' : ''}" data-jump-tab="goodThings">
        <span class="cstat-icon">${ICONS.sparkle}</span>
        <strong>${filledGood.length}/5</strong>
        <span>Coisas boas</span>
      </button>
    </section>

    <!-- Timeline & Night Reinterpretation Strip -->
    <button type="button" class="card overview-timeline-strip" data-jump-tab="timeline">
      <div class="ots-left">
        <span class="ots-icon">${ICONS.clock}</span>
        <div>
          <strong>Linha do Dia${currentState.timelineMoments.length ? ` (${currentState.timelineMoments.length} ${currentState.timelineMoments.length === 1 ? 'momento' : 'momentos'})` : ''}</strong>
          <span class="ots-times">${currentState.timelineMoments.length
            ? currentState.timelineMoments.slice(0, 4).map((m) => m.time).join(' · ') + (currentState.timelineMoments.length > 4 ? ' …' : '')
            : 'Construa a linha horária do dia'}</span>
        </div>
      </div>
      <div class="ots-right">
        ${currentState.nightReflection.trim() ? `<span class="ots-night-pill">${ICONS.moon} Noite</span>` : ''}
        <span class="ots-arrow">${ICONS.chevRight}</span>
      </div>
    </button>

    <!-- Quick Title & Previews -->
    <section class="card overview-card">
      <label class="field-label" for="ed-ov-title">Título do Dia</label>
      <input
        id="ed-ov-title"
        class="dark-input"
        type="text"
        placeholder="Dê um título curto para este dia..."
        value="${escapeHtml(currentState.title)}">

      ${hasQuote ? `
        <div class="overview-mini-quote" data-jump-tab="text">
          <span class="ov-mini-lbl">Frase / Autoria</span>
          <p>“${escapeHtml(currentState.authorQuote.trim())}”</p>
        </div>
      ` : ''}

      ${filledGood.length ? `
        <div class="overview-mini-sara" data-jump-tab="goodThings">
          <span class="ov-mini-lbl">Coisas Boas de Hoje</span>
          <ul>
            ${filledGood.slice(0, 3).map((g) => `<li>${escapeHtml(g)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <div class="overview-tags-row">
        ${currentState.tags.map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}
        <button type="button" class="pill-subtle-btn" id="ed-ov-add-tags">
          ${currentState.tags.length ? 'Editar #tags' : '+ Adicionar #tags'}
        </button>
      </div>
    </section>

    ${echoesHtml}
  `;

  host.querySelector('#ed-milestone-toggle')?.addEventListener('click', () => {
    currentState.isMilestone = !currentState.isMilestone;
    renderCapsuleTabsBar(modal);
    renderOverviewTab(modal, host, callbacks);
    callbacks.onToast?.(
      currentState.isMilestone ? 'Dia marcado como Evento Marcante ★' : 'Selo de Evento Marcante removido'
    );
    if (currentState.isMilestone) {
      setTimeout(() => host.querySelector('#ed-milestone-title')?.focus(), 50);
    }
  });

  host.querySelector('#ed-seal-btn')?.addEventListener('click', () => {
    currentState.isSealed = true;
    currentState.sealedAt = Date.now();
    renderOverviewTab(modal, host, callbacks);
    callbacks.onToast?.('Cápsula selada! Toque em Salvar para confirmar.');
  });

  host.querySelector('#ed-unseal-btn')?.addEventListener('click', () => {
    currentState.isSealed = false;
    currentState.sealedAt = null;
    renderOverviewTab(modal, host, callbacks);
    callbacks.onToast?.('Selo reaberto para edição.');
  });

  host.querySelectorAll('[data-open-echo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = (callbacks.allEntries || []).find((e) => e.id === btn.dataset.openEcho);
      if (target) callbacks.onOpenEcho?.(target, { elevated: true });
    });
  });

  let snapTimer = null;
  host.querySelector('#ed-milestone-title')?.addEventListener('input', (e) => {
    currentState.milestoneTitle = e.target.value;
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      pushUndoSnapshot();
      updateUndoRedoButtons(modal);
    }, 400);
  });

  host.querySelector('#ed-ov-title')?.addEventListener('input', (e) => {
    currentState.title = e.target.value;
    renderCapsuleTabsBar(modal);
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      pushUndoSnapshot();
      updateUndoRedoButtons(modal);
    }, 400);
  });

  host.querySelectorAll('[data-jump-tab]').forEach((el) => {
    el.addEventListener('click', () => switchCapsuleTab(modal, el.dataset.jumpTab, callbacks));
  });

  host.querySelector('#ed-ov-add-tags')?.addEventListener('click', () => {
    switchCapsuleTab(modal, 'text', callbacks);
    toggleDrawer(modal, 'tags', callbacks);
  });
}

// ============================================================================
// TAB 1B: LINHA DO DIA (Reedição Cronológica Viva + Olhar da Noite)
// ============================================================================
function renderTimelineTab(modal, host, callbacks) {
  const moments = currentState.timelineMoments;
  const nightTimeStr = currentState.nightReflectionUpdatedAt
    ? (() => {
        const dt = new Date(currentState.nightReflectionUpdatedAt);
        return `Atualizado às ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      })()
    : '';

  const photoPickerHtml = momentComposerOpen
    ? `
      <div class="moment-photo-picker">
        <span class="field-label">Vincular foto opcional</span>
        <div class="moment-photo-options">
          ${currentState.photos.map((ph, idx) => {
            const url = URL.createObjectURL(ph.blob);
            editorObjectUrls.push(url);
            const selected = momentDraft.photoId === ph.id;
            return `
              <button type="button" class="moment-photo-opt ${selected ? 'selected' : ''}" data-mom-pick-photo="${ph.id}" title="Foto ${idx + 1}">
                <img src="${url}" alt="Foto ${idx + 1}">
              </button>
            `;
          }).join('')}
          <button type="button" class="moment-photo-add-btn" id="mom-new-photo-btn">
            ${ICONS.plus}
            <span>Nova foto</span>
          </button>
        </div>
      </div>
    `
    : '';

  const composerHtml = momentComposerOpen
    ? `
      <section class="card moment-composer">
        <div class="section-row-between">
          <span class="moment-composer-heading">${editingMomentId ? 'Editar Momento' : 'Novo Momento do Dia'}</span>
          <button type="button" class="icon-btn" id="mom-cancel-top" aria-label="Fechar">${ICONS.close}</button>
        </div>

        <div class="moment-time-row">
          <label class="field-label" for="mom-time-input">Horário</label>
          <input type="time" id="mom-time-input" class="dark-input moment-time-input" value="${escapeHtml(momentDraft.time)}">
        </div>

        <div class="time-preset-chips">
          ${['08:00', '10:30', '14:00', '17:30', '21:00'].map((t) => `
            <button type="button" class="time-preset-chip ${momentDraft.time === t ? 'active' : ''}" data-time-preset="${t}">${t}</button>
          `).join('')}
          <button type="button" class="time-preset-chip" id="mom-time-now">Agora</button>
        </div>

        <input
          type="text"
          id="mom-title-input"
          class="dark-input"
          maxlength="90"
          placeholder="Título do acontecimento (ex: Café da manhã, Reunião, Caminhada)"
          value="${escapeHtml(momentDraft.title)}">

        <textarea
          id="mom-note-input"
          class="dark-input dark-textarea"
          rows="2"
          placeholder="Nota curta ou detalhe desse momento...">${escapeHtml(momentDraft.note)}</textarea>

        ${photoPickerHtml}

        <div class="moment-composer-actions">
          <button type="button" class="btn-secondary btn-sm" id="mom-cancel-btn">Cancelar</button>
          <button type="button" class="btn-gold btn-sm" id="mom-save-btn">
            ${editingMomentId ? 'Atualizar momento' : 'Adicionar à linha'}
          </button>
        </div>
      </section>
    `
    : '';

  const railHtml = moments.length === 0
    ? (!momentComposerOpen
        ? `
          <div class="card capsule-empty-box">
            <div class="capsule-empty-icon">${ICONS.clock}</div>
            <h4>Seu dia ainda não tem marcos horários</h4>
            <p>Adicione acontecimentos ao longo da manhã, tarde e noite para enxergar a história do dia se formando.</p>
            <button type="button" class="gold-outline-btn btn-sm" id="mom-empty-add">Adicionar primeiro horário</button>
          </div>
        `
        : '')
    : `
      <div class="day-timeline-rail">
        ${moments.map((m, idx) => {
          const linkedPhoto = m.photoId ? currentState.photos.find((p) => p.id === m.photoId) : null;
          let photoThumbHtml = '';
          if (linkedPhoto && linkedPhoto.blob) {
            const url = URL.createObjectURL(linkedPhoto.blob);
            editorObjectUrls.push(url);
            photoThumbHtml = `
              <div class="day-moment-photo-wrap">
                <img class="day-moment-photo-thumb" src="${url}" alt="${escapeHtml(m.title || 'Foto do momento')}" data-mom-zoom-photo="${linkedPhoto.id}" data-mom-caption="${escapeHtml(linkedPhoto.caption || m.title || '')}">
              </div>
            `;
          }
          return `
            <div class="day-moment-item" data-moment-id="${m.id}">
              <div class="day-moment-node" aria-hidden="true"></div>
              <article class="card day-moment-card">
                <div class="day-moment-head">
                  <span class="day-moment-time">${escapeHtml(m.time)}</span>
                  <div class="day-moment-actions">
                    <button type="button" class="moment-mini-btn" data-mom-up="${idx}" ${idx === 0 ? 'disabled' : ''} title="Mover para cima">${ICONS.arrowUp}</button>
                    <button type="button" class="moment-mini-btn" data-mom-down="${idx}" ${idx === moments.length - 1 ? 'disabled' : ''} title="Mover para baixo">${ICONS.arrowDown}</button>
                    <button type="button" class="moment-mini-btn" data-mom-edit="${m.id}" title="Editar momento">${ICONS.editQuote}</button>
                    <button type="button" class="moment-mini-btn danger" data-mom-del="${idx}" title="Remover momento">&times;</button>
                  </div>
                </div>
                ${m.title ? `<h4 class="day-moment-title">${escapeHtml(m.title)}</h4>` : ''}
                ${m.note ? `<p class="day-moment-note">${escapeHtml(m.note)}</p>` : ''}
                ${photoThumbHtml}
              </article>
            </div>
          `;
        }).join('')}
      </div>
    `;

  host.innerHTML = `
    <div class="capsule-section-head">
      <div>
        <h3>Linha do Dia</h3>
        <p>Registre os momentos por horário e releia tudo à noite</p>
      </div>
      <div class="timeline-head-btns">
        ${moments.length >= 2 ? `
          <button type="button" class="icon-btn" id="mom-sort-btn" title="Ordenar cronologicamente por horário" aria-label="Ordenar por horário">
            ${ICONS.sortTime}
          </button>
        ` : ''}
        <button type="button" class="btn-gold btn-sm" id="mom-toggle-composer">
          ${momentComposerOpen ? ICONS.close : ICONS.plus}
          <span>${momentComposerOpen ? 'Fechar' : 'Momento'}</span>
        </button>
      </div>
    </div>

    ${composerHtml}
    ${railHtml}

    <!-- Dedicated Night Reinterpretation Card -->
    <section class="night-reflection-card">
      <div class="night-reflection-head">
        <span class="night-reflection-label">${ICONS.moon} Reinterpretação · Olhar da Noite</span>
        ${nightTimeStr ? `<span class="night-reflection-time">${nightTimeStr}</span>` : ''}
      </div>
      <p class="night-reflection-sub">Ao revisitar os acontecimentos acima, o que ganhou um novo sentido quando o dia terminou?</p>
      <textarea
        id="ed-night-reflection"
        class="night-reflection-textarea"
        rows="3"
        placeholder="Escreva sua releitura da noite sem alterar os fatos registrados durante o dia...">${escapeHtml(currentState.nightReflection)}</textarea>
    </section>
  `;

  const openNewComposer = () => {
    editingMomentId = null;
    momentDraft = { time: toTimeStr(new Date()), title: '', note: '', photoId: null };
    momentComposerOpen = true;
    renderTimelineTab(modal, host, callbacks);
    setTimeout(() => host.querySelector('#mom-title-input')?.focus(), 60);
  };

  host.querySelector('#mom-toggle-composer')?.addEventListener('click', () => {
    if (momentComposerOpen) {
      momentComposerOpen = false;
      editingMomentId = null;
      renderTimelineTab(modal, host, callbacks);
    } else {
      openNewComposer();
    }
  });

  host.querySelector('#mom-empty-add')?.addEventListener('click', openNewComposer);

  host.querySelector('#mom-sort-btn')?.addEventListener('click', () => {
    currentState.timelineMoments.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    pushUndoSnapshot();
    updateUndoRedoButtons(modal);
    renderTimelineTab(modal, host, callbacks);
    callbacks.onToast?.('Momentos ordenados pelo horário!');
  });

  if (momentComposerOpen) {
    const timeInp = host.querySelector('#mom-time-input');
    const titleInp = host.querySelector('#mom-title-input');
    const noteInp = host.querySelector('#mom-note-input');

    const syncDraftInputs = () => {
      if (timeInp) momentDraft.time = timeInp.value || '12:00';
      if (titleInp) momentDraft.title = titleInp.value;
      if (noteInp) momentDraft.note = noteInp.value;
    };

    const closeComposer = () => {
      momentComposerOpen = false;
      editingMomentId = null;
      renderTimelineTab(modal, host, callbacks);
    };

    host.querySelector('#mom-cancel-top')?.addEventListener('click', closeComposer);
    host.querySelector('#mom-cancel-btn')?.addEventListener('click', closeComposer);

    host.querySelectorAll('[data-time-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        momentDraft.time = btn.dataset.timePreset;
        if (timeInp) timeInp.value = momentDraft.time;
        host.querySelectorAll('[data-time-preset]').forEach((b) =>
          b.classList.toggle('active', b.dataset.timePreset === momentDraft.time)
        );
      });
    });

    host.querySelector('#mom-time-now')?.addEventListener('click', () => {
      momentDraft.time = toTimeStr(new Date());
      if (timeInp) timeInp.value = momentDraft.time;
      host.querySelectorAll('[data-time-preset]').forEach((b) => b.classList.remove('active'));
    });

    host.querySelectorAll('[data-mom-pick-photo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncDraftInputs();
        const pid = btn.dataset.momPickPhoto;
        momentDraft.photoId = momentDraft.photoId === pid ? null : pid;
        renderTimelineTab(modal, host, callbacks);
      });
    });

    host.querySelector('#mom-new-photo-btn')?.addEventListener('click', () => {
      syncDraftInputs();
      linkNextUploadedPhotoToMoment = true;
      modal.querySelector('#ed-photo-file-input')?.click();
    });

    host.querySelector('#mom-save-btn')?.addEventListener('click', () => {
      syncDraftInputs();
      const cleanTitle = momentDraft.title.trim();
      const cleanNote = momentDraft.note.trim();
      if (!cleanTitle && !cleanNote && !momentDraft.photoId) {
        callbacks.onToast?.('Escreva um título, nota ou vincule uma foto ao momento.');
        return;
      }

      if (editingMomentId) {
        const target = currentState.timelineMoments.find((m) => m.id === editingMomentId);
        if (target) {
          target.time = momentDraft.time || '12:00';
          target.title = cleanTitle;
          target.note = cleanNote;
          target.photoId = momentDraft.photoId || null;
        }
        callbacks.onToast?.('Momento atualizado!');
      } else {
        const newMom = {
          id: `mom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          time: momentDraft.time || toTimeStr(new Date()),
          title: cleanTitle,
          note: cleanNote,
          photoId: momentDraft.photoId || null,
          order: currentState.timelineMoments.length
        };
        currentState.timelineMoments.push(newMom);
        currentState.timelineMoments.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        callbacks.onToast?.('Momento adicionado à Linha do Dia!');
      }

      momentComposerOpen = false;
      editingMomentId = null;
      pushUndoSnapshot();
      updateUndoRedoButtons(modal);
      renderCapsuleTabsBar(modal);
      renderTimelineTab(modal, host, callbacks);
    });
  }

  host.querySelectorAll('[data-mom-up]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.momUp);
      if (i <= 0) return;
      const arr = currentState.timelineMoments;
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      pushUndoSnapshot();
      updateUndoRedoButtons(modal);
      renderTimelineTab(modal, host, callbacks);
    });
  });

  host.querySelectorAll('[data-mom-down]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.momDown);
      const arr = currentState.timelineMoments;
      if (i >= arr.length - 1) return;
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      pushUndoSnapshot();
      updateUndoRedoButtons(modal);
      renderTimelineTab(modal, host, callbacks);
    });
  });

  host.querySelectorAll('[data-mom-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = currentState.timelineMoments.find((m) => m.id === btn.dataset.momEdit);
      if (!target) return;
      editingMomentId = target.id;
      momentDraft = {
        time: target.time || '12:00',
        title: target.title || '',
        note: target.note || '',
        photoId: target.photoId || null
      };
      momentComposerOpen = true;
      renderTimelineTab(modal, host, callbacks);
      host.closest('#ed-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  host.querySelectorAll('[data-mom-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentState.timelineMoments.splice(Number(btn.dataset.momDel), 1);
      pushUndoSnapshot();
      updateUndoRedoButtons(modal);
      renderCapsuleTabsBar(modal);
      renderTimelineTab(modal, host, callbacks);
    });
  });

  host.querySelectorAll('[data-mom-zoom-photo]').forEach((img) => {
    img.addEventListener('click', () => {
      const pid = img.dataset.momZoomPhoto;
      const idx = currentState.photos.findIndex((p) => p.id === pid);
      if (idx === -1) return;
      const lbItems = currentState.photos.map((p) => {
        const u = URL.createObjectURL(p.blob);
        editorObjectUrls.push(u);
        return { url: u, caption: p.caption || '' };
      });
      callbacks.onOpenLightbox?.(lbItems, idx);
    });
  });

  const nightInp = host.querySelector('#ed-night-reflection');
  if (nightInp) {
    autoResizeTextarea(nightInp, 90);
    let nightSnapTimer = null;
    nightInp.addEventListener('input', () => {
      currentState.nightReflection = nightInp.value;
      currentState.nightReflectionUpdatedAt = Date.now();
      autoResizeTextarea(nightInp, 90);
      renderCapsuleTabsBar(modal);
      clearTimeout(nightSnapTimer);
      nightSnapTimer = setTimeout(() => {
        pushUndoSnapshot();
        updateUndoRedoButtons(modal);
      }, 450);
    });
  }
}

// ============================================================================
// TAB 2: FOTOS & VÍDEOS DO DIA (Compressão Leve Automática + Legenda + Lightbox)
// ============================================================================
function renderPhotosTab(modal, host, callbacks) {
  const photoInput = modal.querySelector('#ed-photo-file-input');
  const videoInput = modal.querySelector('#ed-video-file-input');

  const cardsHtml = currentState.photos.map((ph, idx) => {
    const url = URL.createObjectURL(ph.blob);
    editorObjectUrls.push(url);
    const sizeText = formatBytes(ph.compressedSize || ph.blob?.size || 0);
    const savedBadge = ph.originalSize && ph.compressedSize && ph.originalSize > ph.compressedSize
      ? ` · -${Math.round(((ph.originalSize - ph.compressedSize) / ph.originalSize) * 100)}%`
      : '';

    return `
      <article class="card capsule-photo-card">
        <div class="capsule-photo-frame">
          <img src="${url}" alt="Foto ${idx + 1}" data-ed-zoom="${idx}">
          <span class="photo-size-pill">${sizeText}${savedBadge}</span>
          <button type="button" class="thumb-remove-btn" data-ed-del-photo="${idx}" aria-label="Remover foto">&times;</button>
        </div>
        <div class="capsule-photo-caption-wrap">
          <input
            type="text"
            class="photo-caption-input"
            data-photo-caption="${idx}"
            maxlength="140"
            placeholder="Legenda ou contexto curto desta foto..."
            value="${escapeHtml(ph.caption || '')}">
        </div>
      </article>
    `;
  }).join('');

  const videosHtml = currentState.videos.map((vid, idx) => {
    const url = URL.createObjectURL(vid.blob);
    editorObjectUrls.push(url);
    const sizeText = formatBytes(vid.size || vid.blob?.size || 0);
    return `
      <article class="card capsule-video-card">
        <div class="capsule-video-frame">
          <video class="capsule-video-player" src="${url}" controls playsinline preload="metadata"></video>
          <span class="photo-size-pill">${sizeText}</span>
          <button type="button" class="thumb-remove-btn" data-ed-del-video="${idx}" aria-label="Remover vídeo">&times;</button>
        </div>
        <div class="capsule-photo-caption-wrap">
          <input
            type="text"
            class="photo-caption-input"
            data-video-caption="${idx}"
            maxlength="140"
            placeholder="Legenda ou contexto curto deste vídeo..."
            value="${escapeHtml(vid.caption || '')}">
        </div>
      </article>
    `;
  }).join('');

  const hasAnyMedia = currentState.photos.length > 0 || currentState.videos.length > 0;

  host.innerHTML = `
    <div class="capsule-section-head">
      <div>
        <h3>Fotos &amp; Vídeos</h3>
        <p>Fotos comprimidas (1280px · JPEG 82%) e vídeos locais</p>
      </div>
      <div class="photos-head-actions">
        <button type="button" class="btn-secondary btn-sm" id="cap-add-videos-btn" title="Anexar vídeos">
          ${ICONS.video}
          <span>Vídeo</span>
        </button>
        <button type="button" class="btn-gold btn-sm" id="cap-add-photos-btn">
          ${ICONS.gallery}
          <span>Foto</span>
        </button>
      </div>
    </div>

    ${lastCompressionSummary ? `
      <div class="compression-banner">
        <span>✓ ${lastCompressionSummary.count} ${lastCompressionSummary.count === 1 ? 'foto otimizada' : 'fotos otimizadas'}: ${lastCompressionSummary.original} → <strong>${lastCompressionSummary.compressed}</strong>${lastCompressionSummary.savedPct > 0 ? ` (-${lastCompressionSummary.savedPct}%)` : ''}</span>
        <button type="button" id="dismiss-comp-banner" aria-label="Fechar aviso">&times;</button>
      </div>
    ` : ''}

    ${!hasAnyMedia
      ? `
        <div class="card capsule-empty-box" id="cap-photos-empty-drop">
          <div class="capsule-empty-icon">${ICONS.gallery}</div>
          <h4>Nenhuma foto ou vídeo nesta cápsula</h4>
          <p>Escolha múltiplas fotos ou vídeos da galeria, ou compartilhe direto para o Diário de Bordo.</p>
          <div class="photos-empty-btns">
            <button type="button" class="gold-outline-btn btn-sm" id="cap-add-photos-empty">Selecionar fotos</button>
            <button type="button" class="gold-outline-btn btn-sm" id="cap-add-videos-empty">Selecionar vídeos</button>
          </div>
        </div>
      `
      : `
        ${currentState.photos.length > 0 ? `<div class="capsule-photos-list">${cardsHtml}</div>` : ''}
        ${currentState.videos.length > 0 ? `
          <div class="capsule-videos-section">
            <h4 class="capsule-sub-heading">${ICONS.video} Vídeos do Dia (${currentState.videos.length})</h4>
            <div class="capsule-photos-list">${videosHtml}</div>
          </div>
        ` : ''}
      `}
  `;

  host.querySelector('#cap-add-photos-btn')?.addEventListener('click', () => {
    linkNextUploadedPhotoToMoment = false;
    photoInput?.click();
  });
  host.querySelector('#cap-add-photos-empty')?.addEventListener('click', () => {
    linkNextUploadedPhotoToMoment = false;
    photoInput?.click();
  });
  host.querySelector('#cap-add-videos-btn')?.addEventListener('click', () => videoInput?.click());
  host.querySelector('#cap-add-videos-empty')?.addEventListener('click', () => videoInput?.click());
  host.querySelector('#dismiss-comp-banner')?.addEventListener('click', () => {
    lastCompressionSummary = null;
    renderPhotosTab(modal, host, callbacks);
  });

  host.querySelectorAll('[data-ed-del-video]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentState.videos.splice(Number(btn.dataset.edDelVideo), 1);
      renderCapsuleTabsBar(modal);
      renderPhotosTab(modal, host, callbacks);
    });
  });

  host.querySelectorAll('[data-video-caption]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.videoCaption);
      if (currentState.videos[idx]) currentState.videos[idx].caption = inp.value;
    });
  });

  host.querySelectorAll('[data-ed-zoom]').forEach((img) => {
    img.addEventListener('click', () => {
      const lbItems = currentState.photos.map((p) => {
        const u = URL.createObjectURL(p.blob);
        editorObjectUrls.push(u);
        return { url: u, caption: p.caption || '' };
      });
      callbacks.onOpenLightbox?.(lbItems, Number(img.dataset.edZoom));
    });
  });

  host.querySelectorAll('[data-ed-del-photo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [removed] = currentState.photos.splice(Number(btn.dataset.edDelPhoto), 1);
      if (removed?.id) {
        currentState.timelineMoments.forEach((m) => {
          if (m.photoId === removed.id) m.photoId = null;
        });
      }
      renderCapsuleTabsBar(modal);
      renderPhotosTab(modal, host, callbacks);
    });
  });

  host.querySelectorAll('[data-photo-caption]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.photoCaption);
      if (currentState.photos[idx]) currentState.photos[idx].caption = inp.value;
    });
  });
}

// ============================================================================
// TAB 3: ÁUDIOS DO DIA (Gravação Direta + Anexar Arquivo + Player c/ Seek)
// ============================================================================
function renderAudiosTab(modal, host, callbacks) {
  const audioInput = modal.querySelector('#ed-audio-file-input');
  const isRecording = mediaRecorder && mediaRecorder.state === 'recording';

  const audiosHtml = currentState.audios.map((au, idx) => {
    const dt = new Date(au.recordedAt || au.createdAt || Date.now());
    const hhmm = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const sourceLabel = au.source === 'file' ? 'Arquivo' : 'Gravação';
    return `
      <article class="card capsule-audio-card" data-audio-idx="${idx}">
        <div class="capsule-audio-top">
          <button type="button" class="audio-play-btn" data-audio-play="${idx}" aria-label="Reproduzir áudio">${ICONS.play}</button>
          <div class="audio-mid">
            <input
              type="text"
              class="audio-title-input"
              data-audio-title="${idx}"
              maxlength="70"
              placeholder="Nota de áudio ${idx + 1} (título opcional)"
              value="${escapeHtml(au.title || '')}">
            <div class="audio-meta-line">
              <span class="audio-source-tag">${sourceLabel} · ${hhmm}</span>
              <span class="audio-dur" data-audio-time="${idx}">${formatSeconds(au.duration || 0)}</span>
            </div>
          </div>
          <button type="button" class="icon-btn audio-del-btn" data-audio-del="${idx}" title="Excluir áudio">${ICONS.trash}</button>
        </div>
        <div class="audio-progress-track interactive" data-audio-seek="${idx}" title="Clique para avançar ou voltar">
          <div class="audio-progress-fill" data-audio-bar="${idx}"></div>
        </div>
      </article>
    `;
  }).join('');

  host.innerHTML = `
    <div class="capsule-section-head">
      <div>
        <h3>Áudios do Dia</h3>
        <p>Grave sua voz ou anexe áudios salvos no aparelho</p>
      </div>
    </div>

    <section class="card audio-studio-card ${isRecording ? 'recording' : ''}">
      <div class="rec-status-row">
        <span class="rec-dot ${isRecording ? 'pulsing' : ''}"></span>
        <span class="rec-timer" id="rec-timer">${formatSeconds(recordingSeconds)}</span>
        <span class="rec-hint">${isRecording ? 'Gravando áudio...' : 'Pronto para gravar'}</span>
      </div>

      ${isRecording ? `
        <div class="audio-wave-bars" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="audio-dual-actions">
          <button type="button" class="btn-secondary" id="rec-cancel">Cancelar</button>
          <button type="button" class="btn-gold" id="rec-stop">${ICONS.stop} Parar e Salvar</button>
        </div>
      ` : `
        <div class="audio-dual-actions">
          <button type="button" class="btn-gold" id="rec-start">
            ${ICONS.mic}
            <span>Gravar áudio</span>
          </button>
          <button type="button" class="gold-outline-btn" id="audio-pick-file">
            ${ICONS.audioFile}
            <span>Anexar arquivo</span>
          </button>
        </div>
      `}
    </section>

    ${currentState.audios.length === 0
      ? `
        <div class="card capsule-empty-box">
          <div class="capsule-empty-icon">${ICONS.mic}</div>
          <h4>Nenhum áudio neste dia</h4>
          <p>Notas de voz capturam nuances e emoções que o texto nem sempre traduz. Tudo fica salvo offline no IndexedDB.</p>
        </div>
      `
      : `<div class="ed-audio-list">${audiosHtml}</div>`}
  `;

  host.querySelector('#audio-pick-file')?.addEventListener('click', () => audioInput?.click());

  host.querySelector('#rec-start')?.addEventListener('click', async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      callbacks.onToast?.('Seu navegador não suporta gravação de áudio neste contexto.');
      return;
    }
    try {
      stopActiveAudioPlayback();
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
      mediaRecorder = mime ? new MediaRecorder(mediaStream, { mimeType: mime }) : new MediaRecorder(mediaStream);
      audioChunks = [];
      recordingSeconds = 0;

      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) audioChunks.push(ev.data);
      };

      mediaRecorder.start(250);
      recordingTimer = setInterval(() => {
        recordingSeconds++;
        const timerEl = host.querySelector('#rec-timer');
        if (timerEl) timerEl.textContent = formatSeconds(recordingSeconds);
      }, 1000);

      renderAudiosTab(modal, host, callbacks);
    } catch {
      callbacks.onToast?.('Permissão de microfone negada ou microfone indisponível.');
      cleanupRecording();
    }
  });

  host.querySelector('#rec-cancel')?.addEventListener('click', () => {
    cleanupRecording();
    renderAudiosTab(modal, host, callbacks);
  });

  host.querySelector('#rec-stop')?.addEventListener('click', () => {
    if (!mediaRecorder) return;
    const durationSaved = Math.max(1, recordingSeconds);
    const mimeSaved = mediaRecorder.mimeType || 'audio/webm';
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: mimeSaved });
      cleanupRecording();
      if (blob.size > 0) {
        const nowTs = Date.now();
        currentState.audios.push({
          id: `au_${nowTs}_${Math.random().toString(36).slice(2, 6)}`,
          blob,
          duration: durationSaved,
          mimeType: mimeSaved,
          title: '',
          source: 'recorded',
          createdAt: nowTs,
          recordedAt: nowTs
        });
        renderCapsuleTabsBar(modal);
        renderAudiosTab(modal, host, callbacks);
        callbacks.onToast?.('Áudio salvo na Cápsula do Dia!');
      }
    };
    mediaRecorder.stop();
  });

  host.querySelectorAll('[data-audio-title]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.audioTitle);
      if (currentState.audios[idx]) currentState.audios[idx].title = inp.value;
    });
  });

  host.querySelectorAll('[data-audio-play]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.audioPlay);
      const item = currentState.audios[idx];
      if (!item || !item.blob) return;

      const isSame = activeAudioPlayer && activeAudioPlayer._idx === idx;
      if (isSame && !activeAudioPlayer.paused) {
        activeAudioPlayer.pause();
        btn.innerHTML = ICONS.play;
        return;
      }
      if (isSame && activeAudioPlayer.paused) {
        activeAudioPlayer.play().catch(() => {});
        btn.innerHTML = ICONS.pause;
        return;
      }

      stopActiveAudioPlayback();
      host.querySelectorAll('[data-audio-play]').forEach((b) => (b.innerHTML = ICONS.play));
      host.querySelectorAll('[data-audio-bar]').forEach((bar) => (bar.style.width = '0%'));

      const url = URL.createObjectURL(item.blob);
      editorObjectUrls.push(url);
      const audio = new Audio(url);
      audio._idx = idx;
      activeAudioPlayer = audio;

      const barEl = host.querySelector(`[data-audio-bar="${idx}"]`);
      const timeEl = host.querySelector(`[data-audio-time="${idx}"]`);

      btn.innerHTML = ICONS.pause;
      audio.ontimeupdate = () => {
        const dur = audio.duration && isFinite(audio.duration) ? audio.duration : (item.duration || 1);
        const pct = Math.min(100, (audio.currentTime / dur) * 100);
        if (barEl) barEl.style.width = `${pct}%`;
        if (timeEl) timeEl.textContent = `${formatSeconds(audio.currentTime)} / ${formatSeconds(dur)}`;
      };
      audio.onended = () => {
        btn.innerHTML = ICONS.play;
        if (barEl) barEl.style.width = '0%';
        if (timeEl) timeEl.textContent = formatSeconds(item.duration || 0);
        activeAudioPlayer = null;
      };
      audio.play().catch(() => {
        btn.innerHTML = ICONS.play;
      });
    });
  });

  host.querySelectorAll('[data-audio-seek]').forEach((track) => {
    track.addEventListener('click', (e) => {
      const idx = Number(track.dataset.audioSeek);
      if (!activeAudioPlayer || activeAudioPlayer._idx !== idx) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const dur = activeAudioPlayer.duration && isFinite(activeAudioPlayer.duration)
        ? activeAudioPlayer.duration
        : (currentState.audios[idx]?.duration || 0);
      if (dur > 0) activeAudioPlayer.currentTime = ratio * dur;
    });
  });

  host.querySelectorAll('[data-audio-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopActiveAudioPlayback();
      currentState.audios.splice(Number(btn.dataset.audioDel), 1);
      renderCapsuleTabsBar(modal);
      renderAudiosTab(modal, host, callbacks);
    });
  });
}

// ============================================================================
// TAB 4: TEXTO & AUTORIA (Frase/Autoria do Dia + Escrita Livre + Checklist + Tags)
// ============================================================================
function renderTextTab(modal, host, callbacks) {
  host.innerHTML = `
    <!-- Dedicated Author Quote Card -->
    <section class="author-quote-card">
      <div class="author-quote-head">
        <span class="author-quote-label">${ICONS.quote} Frase / Autoria do Dia</span>
        <button type="button" class="btn-mural-promote" id="ed-send-to-mural" title="Aplicar esta frase no Mural do Topo">
          ${ICONS.pinMural}
          <span>Usar no Mural</span>
        </button>
      </div>
      <textarea
        id="ed-author-quote"
        class="author-quote-textarea"
        rows="2"
        placeholder="Escreva uma frase autoral, insight ou reflexão-síntese que nasceu hoje...">${escapeHtml(currentState.authorQuote)}</textarea>
    </section>

    <!-- Free Writing Area -->
    <input id="ed-title" class="ed-title-input" type="text" placeholder="Título" value="${escapeHtml(currentState.title)}" autocomplete="off">
    <textarea id="ed-content" class="ed-content-input" placeholder="Escreva mais aqui...">${escapeHtml(currentState.content)}</textarea>

    <div id="ed-checklist-zone"></div>
    <div id="ed-tags-zone"></div>
  `;

  applyTypographyToFields(modal);
  renderChecklistZone(modal);
  renderTagsZone(modal);

  const titleInput = host.querySelector('#ed-title');
  const contentInput = host.querySelector('#ed-content');
  const quoteInput = host.querySelector('#ed-author-quote');

  autoResizeTextarea(contentInput, 140);
  autoResizeTextarea(quoteInput, 56);

  let snapTimer = null;
  const scheduleSnapshot = () => {
    renderCapsuleTabsBar(modal);
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      pushUndoSnapshot();
      updateUndoRedoButtons(modal);
    }, 450);
  };

  quoteInput.addEventListener('input', () => {
    currentState.authorQuote = quoteInput.value;
    autoResizeTextarea(quoteInput, 56);
    scheduleSnapshot();
  });

  titleInput.addEventListener('input', () => {
    currentState.title = titleInput.value;
    scheduleSnapshot();
  });

  contentInput.addEventListener('input', () => {
    currentState.content = contentInput.value;
    autoResizeTextarea(contentInput, 140);
    scheduleSnapshot();
  });

  host.querySelector('#ed-send-to-mural')?.addEventListener('click', async () => {
    const q = currentState.authorQuote.trim();
    if (!q) {
      callbacks.onToast?.('Escreva uma frase autoral antes de enviar ao mural.');
      quoteInput.focus();
      return;
    }
    await callbacks.onApplyQuoteToMural?.(q, currentState.dateKey);
  });
}

// ============================================================================
// TAB 5: COISAS BOAS QUE SÓ ESSE DIA ME DEU (Foco Intencional / S.A.R.A.)
// ============================================================================
function renderGoodThingsTab(modal, host) {
  if (!Array.isArray(currentState.goodThings) || currentState.goodThings.length === 0) {
    currentState.goodThings = ['', '', ''];
  }
  const filledCount = getFilledGoodThings().length;
  const pct = Math.min(100, Math.round((filledCount / 5) * 100));

  host.innerHTML = `
    <section class="sara-header card">
      <div class="sara-header-top">
        <span class="sara-badge">${ICONS.sparkle} Foco Intencional · S.A.R.A.</span>
        <span class="sara-counter">${filledCount}/5</span>
      </div>
      <h3>Coisas Boas Que Só Esse Dia Me Deu</h3>
      <p>Registre de 3 a 5 momentos únicos e positivos de hoje para treinar sua atenção para o que importa.</p>
      <div class="sara-progress-track">
        <div class="sara-progress-fill" style="width:${pct}%"></div>
      </div>
    </section>

    <div class="sara-list">
      ${currentState.goodThings.map((val, idx) => `
        <div class="sara-item-row ${val.trim() ? 'filled' : ''}">
          <span class="sara-index-badge">${String(idx + 1).padStart(2, '0')}</span>
          <input
            type="text"
            class="sara-input"
            data-sara-idx="${idx}"
            maxlength="160"
            placeholder="${SARA_PLACEHOLDERS[idx % SARA_PLACEHOLDERS.length]}"
            value="${escapeHtml(val)}">
          ${currentState.goodThings.length > 1 ? `
            <button type="button" class="sara-remove-btn" data-sara-del="${idx}" aria-label="Remover item">&times;</button>
          ` : ''}
        </div>
      `).join('')}
    </div>

    ${currentState.goodThings.length < 5 ? `
      <button type="button" class="gold-outline-btn sara-add-btn" id="sara-add-btn">
        ${ICONS.plus}
        <span>Adicionar coisa boa (${currentState.goodThings.length}/5)</span>
      </button>
    ` : ''}
  `;

  let snapTimer = null;
  host.querySelectorAll('[data-sara-idx]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.saraIdx);
      currentState.goodThings[idx] = inp.value;
      inp.closest('.sara-item-row')?.classList.toggle('filled', inp.value.trim() !== '');
      const countNow = getFilledGoodThings().length;
      const counterEl = host.querySelector('.sara-counter');
      const fillEl = host.querySelector('.sara-progress-fill');
      if (counterEl) counterEl.textContent = `${countNow}/5`;
      if (fillEl) fillEl.style.width = `${Math.min(100, Math.round((countNow / 5) * 100))}%`;
      renderCapsuleTabsBar(modal);

      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        pushUndoSnapshot();
        updateUndoRedoButtons(modal);
      }, 450);
    });
  });

  host.querySelectorAll('[data-sara-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.saraDel);
      currentState.goodThings.splice(idx, 1);
      pushUndoSnapshot();
      renderCapsuleTabsBar(modal);
      renderGoodThingsTab(modal, host);
    });
  });

  host.querySelector('#sara-add-btn')?.addEventListener('click', () => {
    if (currentState.goodThings.length >= 5) return;
    currentState.goodThings.push('');
    renderGoodThingsTab(modal, host);
    const inputs = host.querySelectorAll('.sara-input');
    inputs[inputs.length - 1]?.focus();
  });
}

// ============================================================================
// Helpers for Text Tab (Checklist, Tags, Paper, Typography, Emoji)
// ============================================================================
function cyclePaperTheme(modal, onToast) {
  const idx = PAPER_THEMES.findIndex((t) => t.id === currentState.style.paperTheme);
  const next = PAPER_THEMES[(idx + 1) % PAPER_THEMES.length];
  currentState.style.paperTheme = next.id;
  applyTypographyToFields(modal);
  onToast?.(`Papel: ${next.label}`);
}

function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  const pos = start + text.length;
  textarea.selectionStart = textarea.selectionEnd = pos;
  textarea.focus();
}

function renderChecklistZone(modal, focusLast = false) {
  const zone = modal.querySelector('#ed-checklist-zone');
  if (!zone) return;

  if (!currentState.checklist.length) {
    zone.innerHTML = '';
    return;
  }

  zone.innerHTML = `
    <div class="ed-checklist-block">
      ${currentState.checklist.map((item, idx) => `
        <div class="ed-check-row ${item.done ? 'done' : ''}" data-ck-idx="${idx}">
          <span class="ck-handle" aria-hidden="true">≡</span>
          <button type="button" class="ck-box ${item.done ? 'checked' : ''}" data-ck-toggle="${idx}" aria-label="Marcar tarefa">
            ${item.done ? ICONS.check : ''}
          </button>
          <input class="ck-input" type="text" data-ck-input="${idx}" placeholder="Item da lista..." value="${escapeHtml(item.text)}">
          <button type="button" class="ck-del" data-ck-del="${idx}" title="Remover item">&times;</button>
        </div>
      `).join('')}
      <button type="button" class="ck-add-row" id="ed-ck-add">
        ${ICONS.plus}
        <span>Adicionar item</span>
      </button>
    </div>
  `;

  zone.querySelectorAll('[data-ck-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.ckToggle);
      currentState.checklist[idx].done = !currentState.checklist[idx].done;
      pushUndoSnapshot();
      renderChecklistZone(modal);
    });
  });

  zone.querySelectorAll('[data-ck-input]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.ckInput);
      currentState.checklist[idx].text = inp.value;
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        currentState.checklist.push({ id: `ck_${Date.now()}`, text: '', done: false });
        renderChecklistZone(modal, true);
      }
    });
  });

  zone.querySelectorAll('[data-ck-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.ckDel);
      currentState.checklist.splice(idx, 1);
      pushUndoSnapshot();
      renderChecklistZone(modal);
    });
  });

  zone.querySelector('#ed-ck-add')?.addEventListener('click', () => {
    currentState.checklist.push({ id: `ck_${Date.now()}`, text: '', done: false });
    renderChecklistZone(modal, true);
  });

  if (focusLast) {
    const inputs = zone.querySelectorAll('.ck-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }
}

function renderTagsZone(modal) {
  const zone = modal.querySelector('#ed-tags-zone');
  if (!zone) return;
  if (!currentState.tags.length) {
    zone.innerHTML = '';
    return;
  }

  zone.innerHTML = `
    <div class="ed-tags-list">
      ${currentState.tags.map((tag, idx) => `
        <span class="tag-chip">
          #${escapeHtml(tag)}
          <button type="button" class="tag-chip-del" data-del-tag="${idx}" aria-label="Remover tag">&times;</button>
        </span>
      `).join('')}
    </div>
  `;

  zone.querySelectorAll('[data-del-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentState.tags.splice(Number(btn.dataset.delTag), 1);
      renderTagsZone(modal);
    });
  });
}

function toggleDrawer(modal, type, callbacks) {
  const drawer = modal.querySelector('#ed-drawer');
  if (!drawer) return;

  if (activeDrawer === type) {
    activeDrawer = null;
    drawer.hidden = true;
    drawer.innerHTML = '';
    highlightToolbar(modal, null);
    return;
  }

  activeDrawer = type;
  drawer.hidden = false;
  highlightToolbar(modal, type);

  if (type === 'typography') renderTypographyDrawer(modal, drawer);
  else if (type === 'emoji') renderEmojiDrawer(modal, drawer);
  else if (type === 'tags') renderTagsDrawer(modal, drawer, callbacks);
}

function highlightToolbar(modal, activeTool) {
  modal.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === activeTool);
  });
}

function renderTypographyDrawer(modal, drawer) {
  const s = currentState.style;
  drawer.innerHTML = `
    <div class="drawer-header">
      <button type="button" class="icon-btn" id="dr-close" aria-label="Fechar">${ICONS.close}</button>
      <span class="drawer-title">Tipografia</span>
      <button type="button" class="icon-btn" id="dr-ok" aria-label="Confirmar">${ICONS.check}</button>
    </div>

    <div class="typo-controls-row">
      <div class="typo-align-group">
        <button type="button" class="typo-mini-btn ${s.textAlign === 'left' ? 'active' : ''}" data-align="left" title="Alinhar à esquerda">${ICONS.alignLeft}</button>
        <button type="button" class="typo-mini-btn ${s.textAlign === 'center' ? 'active' : ''}" data-align="center" title="Centralizar">${ICONS.alignCenter}</button>
        <button type="button" class="typo-mini-btn ${s.textAlign === 'right' ? 'active' : ''}" data-align="right" title="Alinhar à direita">${ICONS.alignRight}</button>
      </div>
      <div class="typo-divider"></div>
      <div class="typo-size-group">
        <button type="button" class="typo-size-btn" id="typo-dec">A-</button>
        <span class="typo-size-val">${s.fontSize}</span>
        <button type="button" class="typo-size-btn" id="typo-inc">A+</button>
      </div>
    </div>

    <div class="typo-colors-row">
      ${TEXT_COLORS.map((hex) => `
        <button type="button" class="color-swatch ${s.textColor === hex ? 'active' : ''}" data-color="${hex}" style="background:${hex}" aria-label="Cor ${hex}"></button>
      `).join('')}
    </div>

    <div class="typo-style-grid">
      <button type="button" class="typo-card ${s.fontWeight === 'normal' && s.fontStyle === 'normal' ? 'active' : ''}" data-wstyle="normal">Normal</button>
      <button type="button" class="typo-card ${s.fontWeight === '700' ? 'active' : ''}" data-wstyle="bold" style="font-weight:700">Negrito</button>
      <button type="button" class="typo-card ${s.fontStyle === 'italic' ? 'active' : ''}" data-wstyle="italic" style="font-style:italic">Itálico</button>
      ${FONT_PRESETS.map((fp) => `
        <button type="button" class="typo-card ${s.fontFamily === fp.id ? 'active' : ''}" data-font="${fp.id}" style="font-family:${fp.css};${fp.italic ? 'font-style:italic;' : ''}">
          ${fp.label}
        </button>
      `).join('')}
    </div>
  `;

  const closeFn = () => toggleDrawer(modal, 'typography', {});
  drawer.querySelector('#dr-close').addEventListener('click', closeFn);
  drawer.querySelector('#dr-ok').addEventListener('click', closeFn);

  drawer.querySelectorAll('[data-align]').forEach((b) => {
    b.addEventListener('click', () => {
      currentState.style.textAlign = b.dataset.align;
      applyTypographyToFields(modal);
      renderTypographyDrawer(modal, drawer);
    });
  });

  drawer.querySelector('#typo-dec').addEventListener('click', () => {
    currentState.style.fontSize = Math.max(12, currentState.style.fontSize - 1);
    applyTypographyToFields(modal);
    renderTypographyDrawer(modal, drawer);
  });

  drawer.querySelector('#typo-inc').addEventListener('click', () => {
    currentState.style.fontSize = Math.min(28, currentState.style.fontSize + 1);
    applyTypographyToFields(modal);
    renderTypographyDrawer(modal, drawer);
  });

  drawer.querySelectorAll('[data-color]').forEach((b) => {
    b.addEventListener('click', () => {
      currentState.style.textColor = b.dataset.color;
      applyTypographyToFields(modal);
      renderTypographyDrawer(modal, drawer);
    });
  });

  drawer.querySelectorAll('[data-wstyle]').forEach((b) => {
    b.addEventListener('click', () => {
      const mode = b.dataset.wstyle;
      if (mode === 'normal') {
        currentState.style.fontWeight = 'normal';
        currentState.style.fontStyle = 'normal';
      } else if (mode === 'bold') {
        currentState.style.fontWeight = currentState.style.fontWeight === '700' ? 'normal' : '700';
      } else if (mode === 'italic') {
        currentState.style.fontStyle = currentState.style.fontStyle === 'italic' ? 'normal' : 'italic';
      }
      applyTypographyToFields(modal);
      renderTypographyDrawer(modal, drawer);
    });
  });

  drawer.querySelectorAll('[data-font]').forEach((b) => {
    b.addEventListener('click', () => {
      currentState.style.fontFamily = b.dataset.font;
      applyTypographyToFields(modal);
      renderTypographyDrawer(modal, drawer);
    });
  });
}

function renderEmojiDrawer(modal, drawer) {
  const group = EMOJI_GROUPS[activeEmojiTab] || EMOJI_GROUPS[0];
  drawer.innerHTML = `
    <div class="emoji-tabs-bar">
      ${EMOJI_GROUPS.map((g, i) => `
        <button type="button" class="emoji-tab-btn ${i === activeEmojiTab ? 'active' : ''}" data-etab="${i}">${g.icon}</button>
      `).join('')}
      <button type="button" class="icon-btn emoji-close-btn" id="dr-close" aria-label="Fechar">${ICONS.close}</button>
    </div>
    <div class="emoji-grid">
      ${group.items.map((em) => `<button type="button" class="emoji-cell" data-em="${em}">${em}</button>`).join('')}
    </div>
  `;

  drawer.querySelector('#dr-close').addEventListener('click', () => toggleDrawer(modal, 'emoji', {}));
  drawer.querySelectorAll('[data-etab]').forEach((b) => {
    b.addEventListener('click', () => {
      activeEmojiTab = Number(b.dataset.etab);
      renderEmojiDrawer(modal, drawer);
    });
  });

  const contentInput = modal.querySelector('#ed-content');
  drawer.querySelectorAll('[data-em]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!contentInput) return;
      insertTextAtCursor(contentInput, b.dataset.em);
      currentState.content = contentInput.value;
      autoResizeTextarea(contentInput, 140);
      pushUndoSnapshot();
    });
  });
}

function renderTagsDrawer(modal, drawer, callbacks) {
  const suggested = (callbacks.allTags || []).filter((t) => !currentState.tags.includes(t)).slice(0, 8);
  const presets = ['gratidão', 'reflexão', 'família', 'metas', 'viagem', 'ideias'].filter(
    (t) => !currentState.tags.includes(t) && !suggested.includes(t)
  );
  const chips = [...suggested, ...presets].slice(0, 8);

  drawer.innerHTML = `
    <div class="drawer-header">
      <span class="drawer-title">Etiquetas (#tags)</span>
      <button type="button" class="icon-btn" id="dr-close" aria-label="Fechar">${ICONS.close}</button>
    </div>
    <div class="tag-input-row">
      <span class="tag-hash">#</span>
      <input id="ed-tag-input" class="dark-input" type="text" placeholder="Digite uma etiqueta e pressione Enter">
      <button type="button" class="btn-gold btn-sm" id="ed-tag-add-btn">Adicionar</button>
    </div>
    ${chips.length ? `
      <div class="tag-suggestions">
        ${chips.map((c) => `<button type="button" class="tag-suggest-pill" data-add-suggest="${escapeHtml(c)}">#${escapeHtml(c)}</button>`).join('')}
      </div>
    ` : ''}
  `;

  drawer.querySelector('#dr-close').addEventListener('click', () => toggleDrawer(modal, 'tags', callbacks));

  const addTag = (raw) => {
    const clean = String(raw || '').trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase();
    if (!clean) return;
    if (!currentState.tags.includes(clean)) {
      currentState.tags.push(clean);
      renderTagsZone(modal);
    }
    renderTagsDrawer(modal, drawer, callbacks);
  };

  const inp = drawer.querySelector('#ed-tag-input');
  inp.focus();
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(inp.value);
    }
  });
  drawer.querySelector('#ed-tag-add-btn').addEventListener('click', () => addTag(inp.value));
  drawer.querySelectorAll('[data-add-suggest]').forEach((b) => {
    b.addEventListener('click', () => addTag(b.dataset.addSuggest));
  });
}

function formatSeconds(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
