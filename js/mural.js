// Inspiration Mural (Photo Mosaic + Editable Philosophical Quote) for Diário de Bordo
import { getSetting, saveSetting, compressImageFile } from './db.js';
import { ICONS } from './icons.js';

export const DEFAULT_QUOTE = 'Quem tem um porquê para viver suporta quase qualquer como.';
export const DEFAULT_AUTHOR = 'Friedrich Nietzsche';

const PRESET_QUOTES = [
  { quote: 'Quem tem um porquê para viver suporta quase qualquer como.', author: 'Friedrich Nietzsche' },
  { quote: 'A felicidade da sua vida depende da qualidade dos seus pensamentos.', author: 'Marco Aurélio' },
  { quote: 'Não é o que acontece com você, mas como você reage que importa.', author: 'Epiteto' },
  { quote: 'Conhece-te a ti mesmo e conhecerás o universo e os deuses.', author: 'Sócrates' },
  { quote: 'Sofremos mais na imaginação do que na realidade.', author: 'Sêneca' },
  { quote: 'Escrever é a forma mais silenciosa de organizar a alma.', author: 'Diário de Bordo' }
];

// Artistic atmospheric SVG data URLs so the mural looks rich out of the box before user uploads photos
function makeDefaultArtSvg(index) {
  const palettes = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2c241d"/><stop offset="55%" stop-color="#3c2f23"/><stop offset="100%" stop-color="#1a1715"/></linearGradient></defs><rect width="400" height="260" fill="url(#g)"/><circle cx="290" cy="74" r="34" fill="#D4B483" fill-opacity="0.32"/><circle cx="290" cy="74" r="18" fill="#E8CE9F" fill-opacity="0.55"/><path d="M0 190 L95 120 L185 170 L285 100 L400 185 L400 260 L0 260 Z" fill="#171412" fill-opacity="0.82"/><path d="M0 220 L125 155 L250 205 L360 150 L400 175 L400 260 L0 260 Z" fill="#0f0e0d"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1f2533"/><stop offset="60%" stop-color="#2e2a38"/><stop offset="100%" stop-color="#17161a"/></linearGradient></defs><rect width="300" height="260" fill="url(#g)"/><path d="M168 58 A34 34 0 1 0 198 104 A26 26 0 1 1 168 58 Z" fill="#E2C799" fill-opacity="0.85"/><circle cx="65" cy="54" r="2" fill="#D4B483" fill-opacity="0.7"/><circle cx="230" cy="48" r="1.8" fill="#fff" fill-opacity="0.6"/><circle cx="110" cy="88" r="1.5" fill="#fff" fill-opacity="0.5"/><circle cx="245" cy="112" r="2" fill="#D4B483" fill-opacity="0.6"/><path d="M0 200 Q150 165 300 205 L300 260 L0 260 Z" fill="#121318"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 260"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#29241e"/><stop offset="100%" stop-color="#161412"/></linearGradient></defs><rect width="260" height="260" fill="url(#g)"/><circle cx="130" cy="130" r="78" fill="none" stroke="#D4B483" stroke-opacity="0.24" stroke-width="2"/><circle cx="130" cy="130" r="52" fill="none" stroke="#D4B483" stroke-opacity="0.35" stroke-width="1.5" stroke-dasharray="4 6"/><polygon points="130,68 140,120 192,130 140,140 130,192 120,140 68,130 120,120" fill="#D4B483" fill-opacity="0.25"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 260"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3a2c24"/><stop offset="55%" stop-color="#5e4636"/><stop offset="100%" stop-color="#1e1815"/></linearGradient></defs><rect width="260" height="260" fill="url(#g)"/><circle cx="130" cy="115" r="46" fill="#D4B483" fill-opacity="0.4"/><rect x="0" y="155" width="260" height="105" fill="#181412" fill-opacity="0.72"/><line x1="60" y1="175" x2="200" y2="175" stroke="#D4B483" stroke-opacity="0.35" stroke-width="2"/><line x1="90" y1="192" x2="170" y2="192" stroke="#D4B483" stroke-opacity="0.22" stroke-width="2"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 260"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1d2825"/><stop offset="100%" stop-color="#131716"/></linearGradient></defs><rect width="260" height="260" fill="url(#g)"/><path d="M40 260 L75 135 L110 260 Z" fill="#24332e"/><path d="M95 260 L145 105 L195 260 Z" fill="#1a2622"/><path d="M165 260 L205 148 L245 260 Z" fill="#293a34"/><circle cx="195" cy="65" r="24" fill="#D4B483" fill-opacity="0.25"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2c2620"/><stop offset="100%" stop-color="#181513"/></linearGradient></defs><rect width="300" height="180" fill="url(#g)"/><path d="M0 120 Q75 80 150 115 T300 105 L300 180 L0 180 Z" fill="#D4B483" fill-opacity="0.14"/><path d="M0 145 Q85 115 170 140 T300 132 L300 180 L0 180 Z" fill="#121110"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#222531"/><stop offset="50%" stop-color="#352c28"/><stop offset="100%" stop-color="#1c1b1d"/></linearGradient></defs><rect width="360" height="180" fill="url(#g)"/><circle cx="180" cy="95" r="55" fill="#D4B483" fill-opacity="0.18"/><path d="M0 135 L110 90 L215 125 L310 80 L360 110 L360 180 L0 180 Z" fill="#131214" fill-opacity="0.88"/></svg>`
  ];
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(palettes[index % palettes.length]);
}

let activeBlobUrls = [];

function revokeMuralUrls() {
  activeBlobUrls.forEach((u) => URL.revokeObjectURL(u));
  activeBlobUrls = [];
}

export async function loadMuralData() {
  const saved = await getSetting('mural', null);
  return {
    quote: saved?.quote ?? DEFAULT_QUOTE,
    author: saved?.author ?? DEFAULT_AUTHOR,
    photos: Array.isArray(saved?.photos) ? saved.photos : []
  };
}

export async function saveMuralData(data) {
  await saveSetting('mural', {
    quote: data.quote ?? DEFAULT_QUOTE,
    author: data.author ?? DEFAULT_AUTHOR,
    photos: Array.isArray(data.photos) ? data.photos : []
  });
}

export async function renderMural(container, callbacks = {}) {
  const data = await loadMuralData();
  revokeMuralUrls();

  const resolvedPhotos = [];
  for (let i = 0; i < 7; i++) {
    const userPhoto = data.photos[i];
    if (userPhoto && userPhoto.blob) {
      const url = URL.createObjectURL(userPhoto.blob);
      activeBlobUrls.push(url);
      resolvedPhotos.push(url);
    } else if (data.photos.length > 0 && data.photos[i % data.photos.length]?.blob) {
      // Repeat user's own uploaded photos cleanly across mosaic slots if they uploaded fewer than 7
      const url = URL.createObjectURL(data.photos[i % data.photos.length].blob);
      activeBlobUrls.push(url);
      resolvedPhotos.push(url);
    } else {
      resolvedPhotos.push(makeDefaultArtSvg(i));
    }
  }

  container.innerHTML = `
    <div class="mural-mosaic" aria-label="Mural de Inspiração">
      <div class="mural-row mural-row-top">
        <div class="mural-tile mural-tile-wide"><img src="${resolvedPhotos[0]}" alt="Mural 1" loading="eager"></div>
        <div class="mural-tile"><img src="${resolvedPhotos[1]}" alt="Mural 2" loading="eager"></div>
      </div>
      <div class="mural-row mural-row-mid">
        <div class="mural-tile"><img src="${resolvedPhotos[2]}" alt="Mural 3" loading="eager"></div>
        <div class="mural-tile"><img src="${resolvedPhotos[3]}" alt="Mural 4" loading="eager"></div>
        <div class="mural-tile"><img src="${resolvedPhotos[4]}" alt="Mural 5" loading="eager"></div>
      </div>
      <div class="mural-row mural-row-bot">
        <div class="mural-tile"><img src="${resolvedPhotos[5]}" alt="Mural 6" loading="eager"></div>
        <div class="mural-tile mural-tile-wide"><img src="${resolvedPhotos[6]}" alt="Mural 7" loading="eager"></div>
      </div>
    </div>
    <div class="mural-scrim"></div>

    <div class="mural-top-actions">
      <button class="mural-icon-btn" id="mural-search-btn" title="Buscar registros" aria-label="Buscar registros">
        ${ICONS.search}
      </button>
      <button class="mural-icon-btn" id="mural-more-btn" title="Personalizar mural" aria-label="Personalizar mural">
        ${ICONS.dotsV}
      </button>
    </div>

    <div class="mural-quote-wrap" id="mural-quote-tap" title="Toque para editar a citação">
      <p class="mural-quote-text">${escapeHtml(data.quote || DEFAULT_QUOTE)}</p>
      ${data.author ? `<span class="mural-quote-author">-- ${escapeHtml(data.author)}</span>` : ''}
    </div>

    <div class="mural-bottom-actions">
      <button class="mural-icon-btn mural-icon-sm" id="mural-edit-quote-btn" title="Editar citação" aria-label="Editar citação">
        ${ICONS.editQuote}
      </button>
      <button class="mural-icon-btn mural-icon-sm" id="mural-shuffle-quote-btn" title="Trocar citação filosófica" aria-label="Trocar citação">
        ${ICONS.quote}
      </button>
      <button class="mural-icon-btn mural-icon-sm" id="mural-edit-photos-btn" title="Escolher minhas fotos para o mural" aria-label="Escolher fotos do mural">
        ${ICONS.imageEdit}
      </button>
    </div>
  `;

  container.querySelector('#mural-search-btn')?.addEventListener('click', () => callbacks.onSearch?.());
  container.querySelector('#mural-more-btn')?.addEventListener('click', () => openMuralCustomizer(container, callbacks));
  container.querySelector('#mural-quote-tap')?.addEventListener('click', () => openMuralCustomizer(container, callbacks, 'quote'));
  container.querySelector('#mural-edit-quote-btn')?.addEventListener('click', () => openMuralCustomizer(container, callbacks, 'quote'));
  container.querySelector('#mural-edit-photos-btn')?.addEventListener('click', () => openMuralCustomizer(container, callbacks, 'photos'));

  container.querySelector('#mural-shuffle-quote-btn')?.addEventListener('click', async () => {
    const cur = await loadMuralData();
    const idx = PRESET_QUOTES.findIndex((p) => p.quote === cur.quote);
    const next = PRESET_QUOTES[(idx + 1) % PRESET_QUOTES.length];
    await saveMuralData({ ...cur, quote: next.quote, author: next.author });
    await renderMural(container, callbacks);
    callbacks.onToast?.('Citação atualizada');
  });
}

export async function openMuralCustomizer(muralContainer, callbacks = {}, focusTab = 'photos') {
  const modal = document.getElementById('mural-modal');
  if (!modal) return;
  const data = await loadMuralData();
  let workingPhotos = [...data.photos];
  let previewUrls = [];

  const cleanupPreviews = () => {
    previewUrls.forEach((u) => URL.revokeObjectURL(u));
    previewUrls = [];
  };

  const renderModalContent = () => {
    cleanupPreviews();
    const thumbsHtml = workingPhotos.length
      ? workingPhotos.map((p, idx) => {
          const url = URL.createObjectURL(p.blob);
          previewUrls.push(url);
          return `
            <div class="mural-edit-thumb">
              <img src="${url}" alt="Foto ${idx + 1}">
              <button class="thumb-remove-btn" data-remove-idx="${idx}" title="Remover foto">&times;</button>
            </div>
          `;
        }).join('')
      : `<div class="mural-empty-hint">Nenhuma foto pessoal selecionada ainda.<br>Usando arte padrão minimalista.</div>`;

    modal.innerHTML = `
      <div class="modal-backdrop" data-close-mural></div>
      <div class="modal-sheet">
        <div class="modal-header">
          <h3>Personalizar Mural</h3>
          <button class="icon-btn" data-close-mural aria-label="Fechar">${ICONS.close}</button>
        </div>

        <div class="modal-body">
          <div class="form-section">
            <label class="field-label">Citação filosófica</label>
            <textarea id="mural-quote-input" class="dark-input dark-textarea" rows="3" placeholder="Escreva uma frase que te inspira...">${escapeHtml(data.quote)}</textarea>
          </div>
          <div class="form-section">
            <label class="field-label">Autor (opcional)</label>
            <input id="mural-author-input" class="dark-input" type="text" placeholder="Ex: Friedrich Nietzsche" value="${escapeHtml(data.author || '')}">
          </div>

          <div class="form-section">
            <div class="section-row-between">
              <label class="field-label">Fotos do Mosaico (${workingPhotos.length}/7)</label>
              ${workingPhotos.length > 0 ? `<button class="text-btn-danger" id="mural-reset-photos">Usar padrão</button>` : ''}
            </div>
            <div class="mural-edit-grid">${thumbsHtml}</div>
            <label class="gold-outline-btn file-trigger-btn">
              ${ICONS.gallery}
              <span>Escolher fotos do dispositivo</span>
              <input type="file" id="mural-photo-picker" accept="image/*" multiple hidden>
            </label>
            <p class="helper-caption">Dica: Escolha até 7 fotos para preencher cada quadro do mosaico. Todas ficam salvas offline no navegador.</p>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" data-close-mural>Cancelar</button>
          <button class="btn-gold" id="mural-save-btn">Salvar Mural</button>
        </div>
      </div>
    `;

    modal.querySelectorAll('[data-close-mural]').forEach((el) => {
      el.addEventListener('click', () => {
        cleanupPreviews();
        modal.classList.remove('open');
      });
    });

    modal.querySelectorAll('[data-remove-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.removeIdx);
        workingPhotos.splice(idx, 1);
        data.quote = modal.querySelector('#mural-quote-input').value;
        data.author = modal.querySelector('#mural-author-input').value;
        renderModalContent();
      });
    });

    modal.querySelector('#mural-reset-photos')?.addEventListener('click', () => {
      workingPhotos = [];
      data.quote = modal.querySelector('#mural-quote-input').value;
      data.author = modal.querySelector('#mural-author-input').value;
      renderModalContent();
    });

    modal.querySelector('#mural-photo-picker')?.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      data.quote = modal.querySelector('#mural-quote-input').value;
      data.author = modal.querySelector('#mural-author-input').value;
      for (const file of files) {
        if (workingPhotos.length >= 7) break;
        try {
          const blob = await compressImageFile(file, 1100, 0.82);
          workingPhotos.push({ id: `mp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, blob });
        } catch {
          // ignore invalid image
        }
      }
      renderModalContent();
    });

    modal.querySelector('#mural-save-btn')?.addEventListener('click', async () => {
      const quote = modal.querySelector('#mural-quote-input').value.trim() || DEFAULT_QUOTE;
      const author = modal.querySelector('#mural-author-input').value.trim();
      await saveMuralData({ quote, author, photos: workingPhotos });
      cleanupPreviews();
      modal.classList.remove('open');
      if (muralContainer) {
        await renderMural(muralContainer, callbacks);
      }
      callbacks.onToast?.('Mural atualizado com sucesso!');
    });

    if (focusTab === 'quote') {
      setTimeout(() => modal.querySelector('#mural-quote-input')?.focus(), 120);
      focusTab = null;
    }
  };

  renderModalContent();
  modal.classList.add('open');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
