// Main Application Controller for Diário de Bordo (Etapa 2A: Cápsula do Dia)
import {
  openDB,
  getAllEntries,
  getAllGratitudePeople,
  saveEntry,
  normalizeEntry,
  formatSplashDate,
  formatEntryDateParts,
  formatBytes,
  toDateKey
} from './db.js';
import { ICONS, getMoodById } from './icons.js';
import { isCapsuleConsistent, findTemporalEchoes } from './echo.js';
import { renderMural, openMuralCustomizer, loadMuralData, saveMuralData } from './mural.js';
import { openDatePickerModal, renderCalendarTab } from './calendar.js';
import { openEditor } from './editor.js';
import { renderStatsTab } from './stats.js';
import { renderMoreTab } from './more.js';
import { openGratitudeWall } from './gratitude.js';

let entries = [];
let gratitudePeople = [];
let activeTab = 'diary';
let searchQuery = '';
let searchOpen = false;
let timelineObjectUrls = [];
let readerObjectUrls = [];
let readerActiveAudio = null;
let deferredInstallPrompt = null;

const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// Capture PWA install prompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (activeTab === 'more') renderActiveTab();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  showToast('Diário de Bordo instalado com sucesso!');
  if (activeTab === 'more') renderActiveTab();
});

// Register Service Worker for 100% offline PWA (HTTPS & localhost compatible)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const nextWorker = reg.installing;
          if (!nextWorker) return;
          nextWorker.addEventListener('statechange', () => {
            if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Nova versão disponível! Recarregue para atualizar.');
            }
          });
        });
      })
      .catch(() => {
        // ignore if restricted
      });
  });
}

function revokeUrls(list) {
  list.forEach((u) => URL.revokeObjectURL(u));
  list.length = 0;
}

function getAllUniqueTags() {
  const counts = {};
  entries.forEach((e) => (e.tags || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
}

// --- Toast Notification ---
let toastTimer = null;
export function showToast(message) {
  const el = document.getElementById('app-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// --- Splash Screen ---
function initSplashScreen() {
  const splash = document.getElementById('splash-screen');
  const dateEl = document.getElementById('splash-date');
  if (dateEl) dateEl.textContent = formatSplashDate(new Date());

  if (!splash) return;
  const dismiss = () => {
    if (splash.classList.contains('fade-out')) return;
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 520);
  };

  splash.addEventListener('click', dismiss);
  setTimeout(dismiss, 1850);
}

// --- Data Refresh ---
async function refreshEntries() {
  entries = await getAllEntries();
  gratitudePeople = await getAllGratitudePeople();
  renderActiveTab();
}

function launchGratitudeWall() {
  openGratitudeWall({
    entries,
    onChanged: async (peopleList) => {
      gratitudePeople = Array.isArray(peopleList) ? peopleList : await getAllGratitudePeople();
      if (activeTab === 'stats' || activeTab === 'more') renderActiveTab();
    },
    onOpenEntry: (entry, opts) => openEntryReader(entry, 'overview', opts),
    onOpenLightbox: openLightbox,
    onToast: showToast
  });
}

// --- Promote Day's Author Quote to Top Mural ---
async function applyAuthorQuoteToMural(quote, dateKey) {
  const cleanQuote = String(quote || '').trim();
  if (!cleanQuote) return;
  const cur = await loadMuralData();
  const p = formatEntryDateParts(dateKey || toDateKey(new Date()));
  await saveMuralData({
    ...cur,
    quote: cleanQuote,
    author: `Autoria Própria · ${p.day} ${p.monthShort} ${p.year}`
  });
  await refreshMural();
  showToast('Frase aplicada ao Mural do Topo!');
}

// --- Navigation ---
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.dataset.tabPanel === tab);
  });
  document.querySelectorAll('.nav-btn[data-nav]').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === tab);
  });
  renderActiveTab();
}

async function renderActiveTab() {
  if (activeTab === 'diary') {
    renderTimeline();
  } else if (activeTab === 'calendar') {
    const container = document.getElementById('tab-calendar');
    renderCalendarTab(container, entries, {
      onCreateForDate: (dateKey) => launchEditor({ dateKey }),
      onOpenEntry: (entry) => openEntryReader(entry)
    });
  } else if (activeTab === 'stats') {
    const container = document.getElementById('tab-stats');
    renderStatsTab(container, entries, {
      gratitudeCount: gratitudePeople.length,
      onOpenGratitudeWall: launchGratitudeWall
    });
  } else if (activeTab === 'more') {
    const container = document.getElementById('tab-more');
    await renderMoreTab(container, {
      entriesCount: entries.length,
      gratitudeCount: gratitudePeople.length,
      pwaInstallEvent: deferredInstallPrompt,
      isStandalone,
      onCustomizeMural: () => {
        const muralEl = document.getElementById('mural-container');
        openMuralCustomizer(muralEl, getMuralCallbacks(), 'photos');
      },
      onOpenGratitudeWall: launchGratitudeWall,
      onDataChanged: async () => {
        await refreshMural();
        await refreshEntries();
      },
      onInstallPWA: handleInstallPWA,
      onToast: showToast
    });
  }
}

function getMuralCallbacks() {
  return {
    onSearch: () => toggleSearchBar(),
    onToast: showToast
  };
}

async function refreshMural() {
  const muralEl = document.getElementById('mural-container');
  if (muralEl) await renderMural(muralEl, getMuralCallbacks());
}

// --- Search Bar in Timeline ---
function toggleSearchBar(forceState = null) {
  searchOpen = forceState !== null ? forceState : !searchOpen;
  const bar = document.getElementById('timeline-search-bar');
  const inp = document.getElementById('timeline-search-input');
  if (!bar) return;
  bar.hidden = !searchOpen;
  if (searchOpen) {
    setTimeout(() => inp?.focus(), 60);
  } else {
    searchQuery = '';
    if (inp) inp.value = '';
    renderTimeline();
  }
}

// --- Timeline Rendering (Aba Diário) ---
function renderTimeline() {
  const container = document.getElementById('timeline-list');
  if (!container) return;
  revokeUrls(timelineObjectUrls);

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? entries.filter((e) => {
        const hay = [
          e.title || '',
          e.content || '',
          e.milestoneTitle || '',
          e.authorQuote || '',
          e.nightReflection || '',
          (e.timelineMoments || []).map((m) => `${m.title || ''} ${m.note || ''}`).join(' '),
          (e.goodThings || []).join(' '),
          (e.photos || []).map((p) => p.caption || '').join(' '),
          (e.audios || []).map((a) => a.title || '').join(' '),
          (e.tags || []).map((t) => `#${t}`).join(' '),
          (e.checklist || []).map((c) => c.text).join(' ')
        ].join(' ').toLowerCase();
        return hay.includes(q);
      })
    : entries;

  // Empty State (no entries yet)
  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-journey-wrap">
        <div class="card empty-journey-card">
          <div class="empty-journey-icon">${ICONS.feather}</div>
          <h3>Sua jornada começa aqui</h3>
          <p>Registre seus pensamentos, momentos, fotos e áudios em um espaço só seu — 100% privado e offline.</p>
          <button class="btn-gold empty-cta-btn" id="empty-start-btn">
            ${ICONS.plus}
            <span>Criar primeiro registro</span>
          </button>
        </div>
      </div>
    `;
    container.querySelector('#empty-start-btn')?.addEventListener('click', () => startCreationFlow());
    return;
  }

  // Empty search result
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-search-state">
        <p>Nenhum registro encontrado para "<strong>${escapeHtml(searchQuery)}</strong>".</p>
        <button class="pill-subtle-btn" id="clear-search-btn">Limpar busca</button>
      </div>
    `;
    container.querySelector('#clear-search-btn')?.addEventListener('click', () => toggleSearchBar(false));
    return;
  }

  // Group chronologically by year
  const grouped = new Map();
  for (const e of filtered) {
    const year = (e.dateKey || '').slice(0, 4) || String(new Date().getFullYear());
    if (!grouped.has(year)) grouped.set(year, []);
    grouped.get(year).push(e);
  }

  let html = '';
  for (const [year, yearEntries] of grouped.entries()) {
    html += `<div class="timeline-year-header">${year}</div>`;
    for (const entry of yearEntries) {
      const p = formatEntryDateParts(entry.dateKey, entry.timeStr);
      const mood = getMoodById(entry.mood);
      const contentTrim = (entry.content || '').trim();
      const quoteTrim = (entry.authorQuote || '').trim();
      const photos = entry.photos || [];
      const audios = entry.audios || [];
      const checklist = entry.checklist || [];
      const momentsCount = (entry.timelineMoments || []).length;
      const hasNight = Boolean((entry.nightReflection || '').trim());
      const goodThings = (entry.goodThings || []).filter((g) => g.trim() !== '');
      const doneCount = checklist.filter((c) => c.done).length;

      let thumbsHtml = '';
      if (photos.length > 0) {
        const visible = photos.slice(0, 4);
        const extra = photos.length - 4;
        thumbsHtml = `
          <div class="entry-thumbs-row">
            ${visible.map((ph, i) => {
              const url = URL.createObjectURL(ph.blob);
              timelineObjectUrls.push(url);
              const showExtra = i === 3 && extra > 0;
              return `
                <div class="entry-thumb-box">
                  <img src="${url}" alt="Foto ${i + 1}" loading="lazy">
                  ${showExtra ? `<div class="entry-thumb-more">+${extra}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      const badges = [];
      if (entry.isSealed) {
        badges.push(`<span class="meta-pill meta-pill-sealed">${ICONS.sealCheck} Selada</span>`);
      } else if (isCapsuleConsistent(entry).consistent) {
        badges.push(`<span class="meta-pill meta-pill-complete">${ICONS.seal} Completa</span>`);
      }
      if (momentsCount > 0) {
        badges.push(`<span class="meta-pill">${ICONS.clock} ${momentsCount} ${momentsCount === 1 ? 'momento' : 'momentos'}</span>`);
      }
      if (hasNight) {
        badges.push(`<span class="meta-pill">${ICONS.moon} Olhar da Noite</span>`);
      }
      if (audios.length > 0) {
        badges.push(`<span class="meta-pill">${ICONS.mic} ${audios.length}</span>`);
      }
      if (goodThings.length > 0) {
        badges.push(`<span class="meta-pill meta-pill-gold">${ICONS.sparkle} ${goodThings.length} ${goodThings.length === 1 ? 'coisa boa' : 'coisas boas'}</span>`);
      }
      if (quoteTrim) {
        badges.push(`<span class="meta-pill">${ICONS.quote} Autoria</span>`);
      }
      if (checklist.length > 0) {
        badges.push(`<span class="meta-pill">${ICONS.checklist} ${doneCount}/${checklist.length}</span>`);
      }
      (entry.tags || []).slice(0, 3).forEach((t) => {
        badges.push(`<span class="tag-mini">#${escapeHtml(t)}</span>`);
      });

      const previewHtml = contentTrim
        ? `<p class="timeline-card-preview">${escapeHtml(contentTrim)}</p>`
        : (quoteTrim ? `<p class="timeline-card-preview timeline-quote-preview">“${escapeHtml(quoteTrim)}”</p>` : '');

      html += `
        <article class="card timeline-card ${entry.isMilestone ? 'timeline-card-milestone' : ''} ${entry.isSealed ? 'timeline-card-sealed' : ''}" data-entry-id="${entry.id}">
          ${entry.isMilestone ? `
            <div class="milestone-badge-inline">
              <span class="ms-star">${ICONS.starFilled}</span>
              <span>${escapeHtml(entry.milestoneTitle.trim() || 'Evento Marcante')}</span>
            </div>
          ` : ''}

          <div class="timeline-card-header">
            <div class="timeline-date-line">
              <span class="tl-day">${p.day}</span>
              <span class="tl-month-time">${p.monthShort} ${p.time}</span>
            </div>
            <span class="tl-mood-icon" style="color:${mood.color}" title="${mood.label}">${mood.svg}</span>
          </div>

          ${entry.title ? `<h3 class="timeline-card-title">${escapeHtml(entry.title)}</h3>` : ''}
          ${previewHtml}
          ${badges.length ? `<div class="timeline-badges-row">${badges.join('')}</div>` : ''}
          ${thumbsHtml}
        </article>
      `;
    }
  }

  container.innerHTML = html;

  container.querySelectorAll('[data-entry-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const entry = entries.find((e) => e.id === card.dataset.entryId);
      if (entry) openEntryReader(entry);
    });
  });
}

// --- Creation Flow: '+' -> Date Picker Calendar (today pre-selected) -> Capsule Editor ---
function startCreationFlow(initialDateKey = null) {
  openDatePickerModal({
    entries,
    initialDateKey: initialDateKey || toDateKey(new Date()),
    onConfirm: (selectedDateKey) => {
      launchEditor({ dateKey: selectedDateKey });
    }
  });
}

function launchEditor({ entry = null, dateKey = null, initialTab = 'overview' }) {
  openEditor({
    entry,
    dateKey,
    initialTab,
    allTags: getAllUniqueTags(),
    allEntries: entries,
    onSaved: async () => {
      await refreshEntries();
    },
    onDeleted: async () => {
      await refreshEntries();
    },
    onToast: showToast,
    onOpenLightbox: openLightbox,
    onApplyQuoteToMural: applyAuthorQuoteToMural,
    onOpenEcho: (echoEntry, opts) => openEntryReader(echoEntry, 'overview', opts)
  });
}

// --- Capsule Entry Reader Modal (5 clean internal tabs matching the Editor) ---
function openEntryReader(rawEntry, initialTab = 'overview', options = {}) {
  const modal = document.getElementById('reader-modal');
  if (!modal) return;

  const entry = normalizeEntry(rawEntry);
  let readerTab = initialTab;
  const isElevated = Boolean(options.elevated);
  modal.classList.toggle('elevated', isElevated);

  const stopReaderAudio = () => {
    if (readerActiveAudio) {
      readerActiveAudio.pause();
      readerActiveAudio = null;
    }
  };

  const closeReader = () => {
    stopReaderAudio();
    revokeUrls(readerObjectUrls);
    modal.classList.remove('open', 'elevated');
  };

  const p = formatEntryDateParts(entry.dateKey, entry.timeStr);
  const mood = getMoodById(entry.mood);
  const st = entry.style || {};
  const goodThings = (entry.goodThings || []).filter((g) => g.trim() !== '');
  const moments = entry.timelineMoments || [];
  const hasNight = Boolean((entry.nightReflection || '').trim());
  const hasTextOrQuote = Boolean(entry.title.trim() || entry.content.trim() || entry.authorQuote.trim());

  const READER_TABS = [
    { id: 'overview', label: 'Visão Geral', icon: ICONS.overview },
    { id: 'timeline', label: 'Linha do Dia', icon: ICONS.clock },
    { id: 'photos', label: 'Fotos', icon: ICONS.gallery },
    { id: 'audios', label: 'Áudios', icon: ICONS.mic },
    { id: 'text', label: 'Texto & Autoria', icon: ICONS.textAuthor },
    { id: 'goodThings', label: 'Coisas Boas', icon: ICONS.sparkle }
  ];

  const getTabBadge = (id) => {
    if (id === 'timeline') {
      if (moments.length > 0) return `<span class="capsule-tab-badge">${moments.length}</span>`;
      if (hasNight) return `<span class="capsule-tab-dot"></span>`;
    }
    if (id === 'photos' && entry.photos.length > 0) return `<span class="capsule-tab-badge">${entry.photos.length}</span>`;
    if (id === 'audios' && entry.audios.length > 0) return `<span class="capsule-tab-badge">${entry.audios.length}</span>`;
    if (id === 'goodThings' && goodThings.length > 0) return `<span class="capsule-tab-badge">${goodThings.length}/5</span>`;
    if (id === 'text' && hasTextOrQuote) return `<span class="capsule-tab-dot"></span>`;
    if (id === 'overview' && entry.isMilestone) return `<span class="capsule-tab-star">★</span>`;
    return '';
  };

  const fontMap = {
    default: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    serif: "'Playfair Display', Georgia, serif",
    'italic-serif': "Georgia, serif",
    handwriting: "'Caveat', 'Segoe Script', cursive",
    condensed: "'Oswald', 'Arial Narrow', sans-serif",
    mono: "'JetBrains Mono', 'Consolas', monospace"
  };

  const textCss = `
    font-family: ${fontMap[st.fontFamily] || fontMap.default};
    font-size: ${st.fontSize || 16}px;
    font-weight: ${st.fontWeight || 'normal'};
    font-style: ${st.fontFamily === 'italic-serif' ? 'italic' : (st.fontStyle || 'normal')};
    text-align: ${st.textAlign || 'left'};
    color: ${st.textColor || '#EAEAEA'};
  `;

  const renderReaderShell = () => {
    stopReaderAudio();
    revokeUrls(readerObjectUrls);

    modal.innerHTML = `
      <div class="reader-surface paper-${st.paperTheme || 'deep'}">
        <header class="editor-topbar">
          <button class="icon-btn" id="rd-close" aria-label="Voltar">${ICONS.close}</button>
          <div class="editor-topbar-center">
            <span class="capsule-header-tag">Cápsula do Dia</span>
          </div>
          <div class="editor-topbar-right">
            <button class="btn-save-pill" id="rd-edit">Editar</button>
          </div>
        </header>

        <div class="capsule-sticky-head">
          <div class="editor-meta-row">
            <div class="reader-date-block">
              <span class="ed-day-big">${p.day}</span>
              <span class="ed-date-rest">${p.monthShort} ${p.year} · ${p.weekday}, ${p.time}</span>
            </div>
            <div class="reader-mood-pill" style="color:${mood.color}">
              <span class="reader-mood-svg">${mood.svg}</span>
              <span>${mood.label}</span>
            </div>
          </div>

          <nav class="capsule-tabs" id="rd-capsule-tabs" aria-label="Seções da Cápsula">
            ${READER_TABS.map((t) => `
              <button type="button" class="capsule-tab ${readerTab === t.id ? 'active' : ''}" data-rd-tab="${t.id}">
                <span class="capsule-tab-icon">${t.icon}</span>
                <span>${t.label}</span>
                ${getTabBadge(t.id)}
              </button>
            `).join('')}
          </nav>
        </div>

        <div class="reader-scroll">
          <div class="capsule-pane" id="rd-capsule-body"></div>
        </div>
      </div>
    `;

    modal.querySelector('#rd-close').addEventListener('click', closeReader);
    modal.querySelector('#rd-edit').addEventListener('click', () => {
      if (isElevated && !confirm('Abrir esta memória antiga no editor? Alterações não salvas no rascunho atual serão descartadas.')) {
        return;
      }
      const tabToEdit = readerTab;
      closeReader();
      launchEditor({ entry, initialTab: tabToEdit });
    });

    modal.querySelectorAll('[data-rd-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.rdTab === readerTab) return;
        readerTab = btn.dataset.rdTab;
        renderReaderShell();
      });
    });

    const activeBtn = modal.querySelector('#rd-capsule-tabs .capsule-tab.active');
    activeBtn?.scrollIntoView({ inline: 'nearest', block: 'nearest' });

    renderReaderPane(modal.querySelector('#rd-capsule-body'));
  };

  const renderReaderPane = (host) => {
    if (readerTab === 'overview') {
      const hasQuote = Boolean(entry.authorQuote.trim());
      const sealStatus = isCapsuleConsistent(entry);
      const echoes = findTemporalEchoes(entry, entries, 2);
      const sealedDateStr = entry.sealedAt
        ? (() => {
            const dt = new Date(entry.sealedAt);
            return `Selada em ${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')} às ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
          })()
        : 'Memória selada com consistência';

      const sealCardHtml = entry.isSealed
        ? `
          <section class="seal-card sealed">
            <div class="seal-card-row">
              <div class="seal-emblem">${ICONS.sealCheck}</div>
              <div class="seal-text">
                <h4>Cápsula Selada</h4>
                <p>${sealedDateStr}</p>
              </div>
              <button type="button" class="btn-unseal-subtle" id="rd-unseal-btn">Reabrir</button>
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
                  <button type="button" class="btn-seal-capsule" id="rd-seal-btn">Selar</button>
                </div>
              </section>
            `
            : '');

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
                  readerObjectUrls.push(url);
                  thumbHtml = `<img class="echo-thumb" src="${url}" alt="Miniatura da memória">`;
                }
                return `
                  <button type="button" class="card echo-card" data-rd-echo="${e.id}">
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

      host.innerHTML = `
        ${entry.isMilestone ? `
          <section class="milestone-card active reader-milestone-banner">
            <div class="milestone-row">
              <div class="milestone-info">
                <span class="milestone-star-icon lit">${ICONS.starFilled}</span>
                <div>
                  <h4>Evento Marcante</h4>
                  <p>${escapeHtml(entry.milestoneTitle.trim() || 'Este dia foi sinalizado como um marco especial.')}</p>
                </div>
              </div>
            </div>
          </section>
        ` : ''}

        ${sealCardHtml}

        <section class="capsule-summary-grid">
          <button type="button" class="capsule-stat-tile" data-rd-jump="photos">
            <span class="cstat-icon">${ICONS.gallery}</span>
            <strong>${entry.photos.length}</strong>
            <span>${entry.photos.length === 1 ? 'Foto no dia' : 'Fotos no dia'}</span>
          </button>
          <button type="button" class="capsule-stat-tile" data-rd-jump="audios">
            <span class="cstat-icon">${ICONS.mic}</span>
            <strong>${entry.audios.length}</strong>
            <span>${entry.audios.length === 1 ? 'Áudio salvo' : 'Áudios salvos'}</span>
          </button>
          <button type="button" class="capsule-stat-tile ${hasQuote ? 'filled' : ''}" data-rd-jump="text">
            <span class="cstat-icon">${ICONS.quote}</span>
            <strong>${hasQuote ? 'Registrada' : 'Em branco'}</strong>
            <span>Frase / Autoria</span>
          </button>
          <button type="button" class="capsule-stat-tile ${goodThings.length ? 'filled' : ''}" data-rd-jump="goodThings">
            <span class="cstat-icon">${ICONS.sparkle}</span>
            <strong>${goodThings.length}/5</strong>
            <span>Coisas boas</span>
          </button>
        </section>

        <button type="button" class="card overview-timeline-strip" data-rd-jump="timeline">
          <div class="ots-left">
            <span class="ots-icon">${ICONS.clock}</span>
            <div>
              <strong>Linha do Dia${moments.length ? ` (${moments.length} ${moments.length === 1 ? 'momento' : 'momentos'})` : ''}</strong>
              <span class="ots-times">${moments.length
                ? moments.slice(0, 4).map((m) => m.time).join(' · ') + (moments.length > 4 ? ' …' : '')
                : 'Nenhum marco horário registrado'}</span>
            </div>
          </div>
          <div class="ots-right">
            ${hasNight ? `<span class="ots-night-pill">${ICONS.moon} Noite</span>` : ''}
            <span class="ots-arrow">${ICONS.chevRight}</span>
          </div>
        </button>

        ${entry.title ? `<h1 class="reader-title" style="text-align:${st.textAlign || 'left'}">${escapeHtml(entry.title)}</h1>` : ''}

        ${hasQuote ? `
          <div class="overview-mini-quote" data-rd-jump="text">
            <span class="ov-mini-lbl">Frase / Autoria do Dia</span>
            <p>“${escapeHtml(entry.authorQuote.trim())}”</p>
          </div>
        ` : ''}

        ${entry.content.trim() ? `
          <div class="card reader-overview-excerpt" data-rd-jump="text">
            <p>${escapeHtml(entry.content.trim())}</p>
            <span class="reader-jump-link">Abrir em Texto &amp; Autoria →</span>
          </div>
        ` : ''}

        ${goodThings.length ? `
          <div class="overview-mini-sara" data-rd-jump="goodThings">
            <span class="ov-mini-lbl">Coisas Boas Que Só Esse Dia Me Deu</span>
            <ul>
              ${goodThings.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${entry.tags.length ? `
          <div class="ed-tags-list">
            ${entry.tags.map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}

        ${echoesHtml}
      `;

      host.querySelector('#rd-seal-btn')?.addEventListener('click', async () => {
        entry.isSealed = true;
        entry.sealedAt = Date.now();
        await saveEntry(entry);
        await refreshEntries();
        renderReaderShell();
        showToast('Cápsula selada com sucesso!');
      });

      host.querySelector('#rd-unseal-btn')?.addEventListener('click', async () => {
        entry.isSealed = false;
        entry.sealedAt = null;
        await saveEntry(entry);
        await refreshEntries();
        renderReaderShell();
        showToast('Selo da cápsula reaberto.');
      });

      host.querySelectorAll('[data-rd-echo]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = entries.find((e) => e.id === btn.dataset.rdEcho);
          if (target) openEntryReader(target, 'overview', options);
        });
      });

      host.querySelectorAll('[data-rd-jump]').forEach((el) => {
        el.addEventListener('click', () => {
          readerTab = el.dataset.rdJump;
          renderReaderShell();
        });
      });
      return;
    }

    if (readerTab === 'timeline') {
      const nightTimeStr = entry.nightReflectionUpdatedAt
        ? (() => {
            const dt = new Date(entry.nightReflectionUpdatedAt);
            return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
          })()
        : '';

      if (!moments.length && !hasNight) {
        host.innerHTML = `
          <div class="card capsule-empty-box">
            <div class="capsule-empty-icon">${ICONS.clock}</div>
            <h4>Linha do Dia em branco</h4>
            <p>Adicione acontecimentos por horário ou escreva sua releitura da noite.</p>
            <button type="button" class="gold-outline-btn btn-sm" id="rd-go-edit-timeline">Construir Linha do Dia</button>
          </div>
        `;
        host.querySelector('#rd-go-edit-timeline')?.addEventListener('click', () => {
          closeReader();
          launchEditor({ entry, initialTab: 'timeline' });
        });
        return;
      }

      const photoItems = entry.photos.map((ph) => {
        const u = URL.createObjectURL(ph.blob);
        readerObjectUrls.push(u);
        return { url: u, caption: ph.caption || '' };
      });

      const railHtml = moments.length
        ? `
          <div class="day-timeline-rail">
            ${moments.map((m) => {
              const pIdx = m.photoId ? entry.photos.findIndex((p) => p.id === m.photoId) : -1;
              const pItem = pIdx >= 0 ? photoItems[pIdx] : null;
              return `
                <div class="day-moment-item">
                  <div class="day-moment-node" aria-hidden="true"></div>
                  <article class="card day-moment-card">
                    <div class="day-moment-head">
                      <span class="day-moment-time">${escapeHtml(m.time)}</span>
                    </div>
                    ${m.title ? `<h4 class="day-moment-title">${escapeHtml(m.title)}</h4>` : ''}
                    ${m.note ? `<p class="day-moment-note">${escapeHtml(m.note)}</p>` : ''}
                    ${pItem ? `
                      <div class="day-moment-photo-wrap">
                        <img class="day-moment-photo-thumb" src="${pItem.url}" alt="${escapeHtml(m.title || 'Foto do momento')}" data-rd-mom-photo="${pIdx}">
                      </div>
                    ` : ''}
                  </article>
                </div>
              `;
            }).join('')}
          </div>
        `
        : '';

      const nightHtml = hasNight
        ? `
          <section class="night-reflection-card">
            <div class="night-reflection-head">
              <span class="night-reflection-label">${ICONS.moon} Reinterpretação · Olhar da Noite</span>
              ${nightTimeStr ? `<span class="night-reflection-time">${nightTimeStr}</span>` : ''}
            </div>
            <p class="night-reflection-read">${escapeHtml(entry.nightReflection.trim())}</p>
          </section>
        `
        : `
          <div class="card night-reflection-empty">
            <span class="night-reflection-label">${ICONS.moon} Olhar da Noite</span>
            <p>Ainda sem releitura noturna para este dia.</p>
            <button type="button" class="gold-outline-btn btn-sm" id="rd-go-edit-night">Registrar Olhar da Noite</button>
          </div>
        `;

      host.innerHTML = `
        <div class="capsule-section-head">
          <div>
            <h3>Linha do Dia</h3>
            <p>${moments.length} ${moments.length === 1 ? 'momento registrado' : 'momentos registrados'}</p>
          </div>
          <button type="button" class="pill-subtle-btn" id="rd-go-edit-timeline-top">Editar linha</button>
        </div>
        ${railHtml}
        ${nightHtml}
      `;

      host.querySelector('#rd-go-edit-timeline-top')?.addEventListener('click', () => {
        if (isElevated && !confirm('Abrir esta memória antiga no editor? Alterações não salvas no rascunho atual serão descartadas.')) return;
        closeReader();
        launchEditor({ entry, initialTab: 'timeline' });
      });

      host.querySelector('#rd-go-edit-night')?.addEventListener('click', () => {
        if (isElevated && !confirm('Abrir esta memória antiga no editor? Alterações não salvas no rascunho atual serão descartadas.')) return;
        closeReader();
        launchEditor({ entry, initialTab: 'timeline' });
      });

      host.querySelectorAll('[data-rd-mom-photo]').forEach((img) => {
        img.addEventListener('click', () => openLightbox(photoItems, Number(img.dataset.rdMomPhoto)));
      });
      return;
    }

    if (readerTab === 'photos') {
      if (!entry.photos.length) {
        host.innerHTML = `
          <div class="card capsule-empty-box">
            <div class="capsule-empty-icon">${ICONS.gallery}</div>
            <h4>Sem fotos nesta cápsula</h4>
            <p>Toque abaixo para adicionar fotos otimizadas deste dia.</p>
            <button type="button" class="gold-outline-btn btn-sm" id="rd-go-edit-photos">Adicionar fotos</button>
          </div>
        `;
        host.querySelector('#rd-go-edit-photos')?.addEventListener('click', () => {
          closeReader();
          launchEditor({ entry, initialTab: 'photos' });
        });
        return;
      }

      const photoItems = entry.photos.map((ph) => {
        const u = URL.createObjectURL(ph.blob);
        readerObjectUrls.push(u);
        return { url: u, caption: ph.caption || '', size: formatBytes(ph.compressedSize || ph.blob?.size || 0) };
      });

      host.innerHTML = `
        <div class="capsule-photos-list">
          ${photoItems.map((item, idx) => `
            <article class="card capsule-photo-card reader-photo-card" data-rd-photo="${idx}">
              <div class="capsule-photo-frame">
                <img src="${item.url}" alt="Foto ${idx + 1}">
                <span class="photo-size-pill">${item.size}</span>
              </div>
              ${item.caption ? `<p class="reader-photo-caption">${escapeHtml(item.caption)}</p>` : ''}
            </article>
          `).join('')}
        </div>
      `;

      host.querySelectorAll('[data-rd-photo]').forEach((card) => {
        card.addEventListener('click', () => {
          openLightbox(photoItems, Number(card.dataset.rdPhoto));
        });
      });
      return;
    }

    if (readerTab === 'audios') {
      if (!entry.audios.length) {
        host.innerHTML = `
          <div class="card capsule-empty-box">
            <div class="capsule-empty-icon">${ICONS.mic}</div>
            <h4>Sem áudios nesta cápsula</h4>
            <p>Grave uma nota de voz ou anexe um áudio para guardar suas lembranças faladas.</p>
            <button type="button" class="gold-outline-btn btn-sm" id="rd-go-edit-audios">Gravar ou anexar áudio</button>
          </div>
        `;
        host.querySelector('#rd-go-edit-audios')?.addEventListener('click', () => {
          closeReader();
          launchEditor({ entry, initialTab: 'audios' });
        });
        return;
      }

      const audioUrls = entry.audios.map((au) => {
        const u = URL.createObjectURL(au.blob);
        readerObjectUrls.push(u);
        return u;
      });

      host.innerHTML = `
        <div class="ed-audio-list">
          ${entry.audios.map((au, idx) => {
            const dt = new Date(au.recordedAt || au.createdAt || Date.now());
            const hhmm = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
            const sourceLabel = au.source === 'file' ? 'Arquivo' : 'Gravação';
            return `
              <article class="card capsule-audio-card">
                <div class="capsule-audio-top">
                  <button type="button" class="audio-play-btn" data-rd-audio="${idx}" aria-label="Reproduzir">${ICONS.play}</button>
                  <div class="audio-mid">
                    <div class="audio-title-static">${escapeHtml(au.title || `Nota de áudio ${idx + 1}`)}</div>
                    <div class="audio-meta-line">
                      <span class="audio-source-tag">${sourceLabel} · ${hhmm}</span>
                      <span class="audio-dur" data-rd-time="${idx}">${formatSeconds(au.duration || 0)}</span>
                    </div>
                  </div>
                </div>
                <div class="audio-progress-track interactive" data-rd-seek="${idx}" title="Clique para avançar ou voltar">
                  <div class="audio-progress-fill" data-rd-bar="${idx}"></div>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `;

      host.querySelectorAll('[data-rd-audio]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.rdAudio);
          if (readerActiveAudio && readerActiveAudio._idx === idx && !readerActiveAudio.paused) {
            readerActiveAudio.pause();
            btn.innerHTML = ICONS.play;
            return;
          }
          if (readerActiveAudio && readerActiveAudio._idx === idx && readerActiveAudio.paused) {
            readerActiveAudio.play().catch(() => {});
            btn.innerHTML = ICONS.pause;
            return;
          }
          stopReaderAudio();
          host.querySelectorAll('[data-rd-audio]').forEach((b) => (b.innerHTML = ICONS.play));
          host.querySelectorAll('[data-rd-bar]').forEach((bar) => (bar.style.width = '0%'));

          const audio = new Audio(audioUrls[idx]);
          audio._idx = idx;
          readerActiveAudio = audio;
          const bar = host.querySelector(`[data-rd-bar="${idx}"]`);
          const timeEl = host.querySelector(`[data-rd-time="${idx}"]`);
          const fallbackDur = entry.audios[idx]?.duration || 1;

          btn.innerHTML = ICONS.pause;
          audio.ontimeupdate = () => {
            const dur = audio.duration && isFinite(audio.duration) ? audio.duration : fallbackDur;
            if (bar) bar.style.width = `${Math.min(100, (audio.currentTime / dur) * 100)}%`;
            if (timeEl) timeEl.textContent = `${formatSeconds(audio.currentTime)} / ${formatSeconds(dur)}`;
          };
          audio.onended = () => {
            btn.innerHTML = ICONS.play;
            if (bar) bar.style.width = '0%';
            if (timeEl) timeEl.textContent = formatSeconds(fallbackDur);
            readerActiveAudio = null;
          };
          audio.play().catch(() => { btn.innerHTML = ICONS.play; });
        });
      });

      host.querySelectorAll('[data-rd-seek]').forEach((track) => {
        track.addEventListener('click', (e) => {
          const idx = Number(track.dataset.rdSeek);
          if (!readerActiveAudio || readerActiveAudio._idx !== idx) return;
          const rect = track.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const dur = readerActiveAudio.duration && isFinite(readerActiveAudio.duration)
            ? readerActiveAudio.duration
            : (entry.audios[idx]?.duration || 0);
          if (dur > 0) readerActiveAudio.currentTime = ratio * dur;
        });
      });
      return;
    }

    if (readerTab === 'text') {
      host.innerHTML = `
        ${entry.authorQuote.trim() ? `
          <section class="author-quote-card">
            <div class="author-quote-head">
              <span class="author-quote-label">${ICONS.quote} Frase / Autoria do Dia</span>
              <button type="button" class="btn-mural-promote" id="rd-send-to-mural">
                ${ICONS.pinMural}
                <span>Usar no Mural</span>
              </button>
            </div>
            <p class="reader-author-quote">“${escapeHtml(entry.authorQuote.trim())}”</p>
          </section>
        ` : ''}

        ${entry.title ? `<h1 class="reader-title" style="text-align:${st.textAlign || 'left'}">${escapeHtml(entry.title)}</h1>` : ''}
        ${entry.content ? `<div class="reader-content" style="${textCss}">${escapeHtml(entry.content)}</div>` : ''}

        ${(!entry.title && !entry.content && !entry.authorQuote.trim() && !entry.checklist.length) ? `
          <div class="card capsule-empty-box">
            <div class="capsule-empty-icon">${ICONS.textAuthor}</div>
            <h4>Nenhum texto escrito ainda</h4>
            <p>Registre sua narrativa livre ou uma frase autoral deste dia.</p>
            <button type="button" class="gold-outline-btn btn-sm" id="rd-go-edit-text">Escrever agora</button>
          </div>
        ` : ''}

        ${entry.checklist.length ? `
          <div class="ed-checklist-block reader-checklist">
            ${entry.checklist.map((item, idx) => `
              <button type="button" class="rd-check-row ${item.done ? 'done' : ''}" data-rd-ck="${idx}">
                <span class="ck-box ${item.done ? 'checked' : ''}">${item.done ? ICONS.check : ''}</span>
                <span class="rd-ck-text">${escapeHtml(item.text)}</span>
              </button>
            `).join('')}
          </div>
        ` : ''}

        ${entry.tags.length ? `
          <div class="ed-tags-list">
            ${entry.tags.map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}
      `;

      host.querySelector('#rd-send-to-mural')?.addEventListener('click', () => {
        applyAuthorQuoteToMural(entry.authorQuote, entry.dateKey);
      });

      host.querySelector('#rd-go-edit-text')?.addEventListener('click', () => {
        closeReader();
        launchEditor({ entry, initialTab: 'text' });
      });

      host.querySelectorAll('[data-rd-ck]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const idx = Number(btn.dataset.rdCk);
          entry.checklist[idx].done = !entry.checklist[idx].done;
          await saveEntry(entry);
          renderReaderPane(host);
          await refreshEntries();
        });
      });
      return;
    }

    if (readerTab === 'goodThings') {
      if (!goodThings.length) {
        host.innerHTML = `
          <div class="card capsule-empty-box">
            <div class="capsule-empty-icon">${ICONS.sparkle}</div>
            <h4>Coisas Boas Que Só Esse Dia Me Deu</h4>
            <p>Ainda não há momentos positivos listados nesta cápsula.</p>
            <button type="button" class="gold-outline-btn btn-sm" id="rd-go-edit-sara">Registrar Coisas Boas</button>
          </div>
        `;
        host.querySelector('#rd-go-edit-sara')?.addEventListener('click', () => {
          closeReader();
          launchEditor({ entry, initialTab: 'goodThings' });
        });
        return;
      }

      host.innerHTML = `
        <section class="sara-header card">
          <div class="sara-header-top">
            <span class="sara-badge">${ICONS.sparkle} Foco Intencional · S.A.R.A.</span>
            <span class="sara-counter">${goodThings.length}/5</span>
          </div>
          <h3>Coisas Boas Que Só Esse Dia Me Deu</h3>
        </section>

        <div class="sara-list">
          ${goodThings.map((val, idx) => `
            <div class="sara-item-row filled reader-sara-row">
              <span class="sara-index-badge">${String(idx + 1).padStart(2, '0')}</span>
              <p class="sara-read-text">${escapeHtml(val)}</p>
            </div>
          `).join('')}
        </div>
      `;
    }
  };

  renderReaderShell();
  modal.classList.add('open');
}

// --- Fullscreen Photo Lightbox (supports string URLs or { url, caption }) ---
export function openLightbox(items, startIdx = 0) {
  const lb = document.getElementById('photo-lightbox');
  const normalized = (items || []).map((it) => (typeof it === 'string' ? { url: it, caption: '' } : it));
  if (!lb || !normalized.length) return;
  let idx = startIdx;

  const render = () => {
    const cur = normalized[idx];
    lb.innerHTML = `
      <div class="lb-topbar">
        <span>${idx + 1} / ${normalized.length}</span>
        <button class="icon-btn" id="lb-close" aria-label="Fechar">${ICONS.close}</button>
      </div>
      <div class="lb-stage">
        ${normalized.length > 1 ? `<button class="lb-arrow lb-prev" id="lb-prev">${ICONS.chevLeft}</button>` : ''}
        <img src="${cur.url}" alt="Visualização ${idx + 1}">
        ${normalized.length > 1 ? `<button class="lb-arrow lb-next" id="lb-next">${ICONS.chevRight}</button>` : ''}
      </div>
      ${cur.caption ? `<div class="lb-caption">${escapeHtml(cur.caption)}</div>` : ''}
    `;
    lb.querySelector('#lb-close').addEventListener('click', closeLb);
    lb.querySelector('#lb-prev')?.addEventListener('click', () => {
      idx = (idx - 1 + normalized.length) % normalized.length;
      render();
    });
    lb.querySelector('#lb-next')?.addEventListener('click', () => {
      idx = (idx + 1) % normalized.length;
      render();
    });
  };

  const onKey = (e) => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLb();
    else if (e.key === 'ArrowLeft' && normalized.length > 1) {
      idx = (idx - 1 + normalized.length) % normalized.length;
      render();
    } else if (e.key === 'ArrowRight' && normalized.length > 1) {
      idx = (idx + 1) % normalized.length;
      render();
    }
  };

  function closeLb() {
    window.removeEventListener('keydown', onKey);
    lb.classList.remove('open');
  }

  window.addEventListener('keydown', onKey);
  render();
  lb.classList.add('open');
}

// --- PWA Install Handler ---
async function handleInstallPWA() {
  if (isStandalone) {
    showToast('O Diário de Bordo já está instalado como aplicativo!');
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      deferredInstallPrompt = null;
      showToast('Instalando Diário de Bordo...');
    }
    return;
  }

  const modal = document.getElementById('pwa-modal');
  if (!modal) return;
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-pwa></div>
    <div class="modal-sheet">
      <div class="modal-header">
        <h3>Instalar Diário de Bordo</h3>
        <button class="icon-btn" data-close-pwa aria-label="Fechar">${ICONS.close}</button>
      </div>
      <div class="modal-body pwa-guide-body">
        <p>Você pode instalar este aplicativo diretamente na sua tela inicial para usar em tela cheia e 100% offline:</p>
        <div class="pwa-step">
          <strong>No Computador (Chrome / Edge):</strong>
          <span>Clique no ícone de instalação <b>(⊕ ou monitor com seta)</b> no canto direito da barra de endereço do navegador.</span>
        </div>
        <div class="pwa-step">
          <strong>No Android (Chrome):</strong>
          <span>Toque no menu <b>⋮</b> no topo direito e escolha <b>"Instalar aplicativo"</b> ou <b>"Adicionar à tela inicial"</b>.</span>
        </div>
        <div class="pwa-step">
          <strong>No iPhone / iPad (Safari):</strong>
          <span>Toque no botão <b>Compartilhar</b> e selecione <b>"Adicionar à Tela de Início"</b>.</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-gold" data-close-pwa>Entendi</button>
      </div>
    </div>
  `;
  modal.querySelectorAll('[data-close-pwa]').forEach((el) => {
    el.addEventListener('click', () => modal.classList.remove('open'));
  });
  modal.classList.add('open');
}

function formatSeconds(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Bootstrap ---
async function init() {
  initSplashScreen();

  document.querySelector('[data-nav="diary"] .nav-icon').innerHTML = ICONS.diary;
  document.querySelector('[data-nav="calendar"] .nav-icon').innerHTML = ICONS.calendar;
  document.querySelector('[data-nav="stats"] .nav-icon').innerHTML = ICONS.stats;
  document.querySelector('[data-nav="more"] .nav-icon').innerHTML = ICONS.more;
  document.getElementById('fab-add-btn').innerHTML = ICONS.plus;

  document.querySelectorAll('.nav-btn[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.nav));
  });

  document.getElementById('fab-add-btn').addEventListener('click', () => startCreationFlow());

  const searchInput = document.getElementById('timeline-search-input');
  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderTimeline();
  });
  document.getElementById('timeline-search-close')?.addEventListener('click', () => toggleSearchBar(false));

  await openDB();
  await refreshMural();
  await refreshEntries();
}

init();
