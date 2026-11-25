// Mural de Gratidão com Pessoas for Diário de Bordo (Etapa 3)
import {
  getAllGratitudePeople,
  saveGratitudePerson,
  deleteGratitudePerson,
  compressPhotoWithStats,
  formatEntryDateParts,
  formatBytes
} from './db.js';
import { ICONS, getMoodById } from './icons.js';

const ROLE_PRESETS = ['Família', 'Amigo(a)', 'Amor', 'Mentor(a)', 'Colega', 'Inspiração'];

let gratitudeObjectUrls = [];

function revokeGratitudeUrls() {
  gratitudeObjectUrls.forEach((u) => URL.revokeObjectURL(u));
  gratitudeObjectUrls = [];
}

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '★';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAssociatedEntries(person, entries = []) {
  const linkedSet = new Set(person.linkedEntryIds || []);
  return entries
    .filter((e) => {
      if (linkedSet.has(e.id)) return true;
      if (Array.isArray(e.gratitudePersonIds) && e.gratitudePersonIds.includes(person.id)) return true;
      if (person.dateKey && e.dateKey === person.dateKey) return true;
      return false;
    })
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

export async function openGratitudeWall({
  entries = [],
  onChanged,
  onOpenEntry,
  onOpenLightbox,
  onToast
}) {
  const screen = document.getElementById('gratitude-screen');
  if (!screen) return;

  let people = await getAllGratitudePeople();
  let viewMode = 'list'; // 'list' | 'detail' | 'form'
  let selectedPersonId = null;
  let draft = null;
  let lastPhotoStats = null;

  const closeWall = () => {
    revokeGratitudeUrls();
    screen.classList.remove('open');
  };

  const reloadPeople = async () => {
    people = await getAllGratitudePeople();
    await onChanged?.(people);
  };

  const startForm = (existing = null) => {
    lastPhotoStats = null;
    draft = existing
      ? {
          id: existing.id,
          name: existing.name || '',
          role: existing.role || '',
          reason: existing.reason || '',
          dateKey: existing.dateKey || '',
          linkedEntryIds: [...(existing.linkedEntryIds || [])],
          photo: existing.photo ? { ...existing.photo } : null,
          createdAt: existing.createdAt
        }
      : {
          id: null,
          name: '',
          role: '',
          reason: '',
          dateKey: '',
          linkedEntryIds: [],
          photo: null,
          createdAt: null
        };
    viewMode = 'form';
    render();
  };

  const render = () => {
    revokeGratitudeUrls();

    if (viewMode === 'list') {
      renderListView();
    } else if (viewMode === 'detail') {
      const person = people.find((p) => p.id === selectedPersonId);
      if (!person) {
        viewMode = 'list';
        renderListView();
        return;
      }
      renderDetailView(person);
    } else if (viewMode === 'form') {
      renderFormView();
    }
  };

  const renderListView = () => {
    const cardsHtml = people.map((person) => {
      const assoc = getAssociatedEntries(person, entries);
      let avatarHtml = `<div class="gratitude-monogram">${escapeHtml(getInitials(person.name))}</div>`;
      if (person.photo && person.photo.blob) {
        const url = URL.createObjectURL(person.photo.blob);
        gratitudeObjectUrls.push(url);
        avatarHtml = `<img class="gratitude-portrait" src="${url}" alt="${escapeHtml(person.name)}">`;
      }

      const dateText = person.dateKey
        ? (() => {
            const p = formatEntryDateParts(person.dateKey);
            return `${p.day} ${p.monthShort} ${p.year}`;
          })()
        : '';

      return `
        <article class="card gratitude-card" data-gp-open="${person.id}">
          <div class="gratitude-portrait-wrap">
            ${avatarHtml}
            ${person.role ? `<span class="gratitude-role-pill">${escapeHtml(person.role)}</span>` : ''}
          </div>
          <div class="gratitude-card-body">
            <h4>${escapeHtml(person.name || 'Sem nome')}</h4>
            ${person.reason
              ? `<p class="gratitude-reason-preview">${escapeHtml(person.reason)}</p>`
              : `<p class="gratitude-reason-preview muted">Toque para registrar o motivo da gratidão</p>`}
            <div class="gratitude-card-foot">
              ${dateText ? `<span>${dateText}</span>` : '<span>Pessoa marcante</span>'}
              ${assoc.length > 0 ? `<span class="gratitude-link-count">${assoc.length} ${assoc.length === 1 ? 'dia' : 'dias'}</span>` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');

    screen.innerHTML = `
      <div class="editor-surface paper-deep">
        <header class="editor-topbar">
          <button type="button" class="icon-btn" id="gp-close" aria-label="Voltar">${ICONS.close}</button>
          <div class="editor-topbar-center">
            <span class="capsule-header-tag">Mural de Gratidão</span>
          </div>
          <div class="editor-topbar-right">
            <button type="button" class="btn-gold btn-sm" id="gp-add-btn">
              ${ICONS.plus}
              <span>Pessoa</span>
            </button>
          </div>
        </header>

        <div class="editor-scroll">
          <div class="gratitude-intro">
            <span class="gratitude-intro-icon">${ICONS.heart}</span>
            <div>
              <h2>Pessoas Marcantes</h2>
              <p>Guarde rostos, histórias e motivos pelos quais você é grato — tudo salvo com compressão leve no IndexedDB.</p>
            </div>
          </div>

          ${people.length === 0
            ? `
              <div class="card capsule-empty-box">
                <div class="capsule-empty-icon">${ICONS.users}</div>
                <h4>Seu Mural de Gratidão está vazio</h4>
                <p>Cadastre alguém que marcou sua jornada com foto, papel na sua vida, motivo de gratidão e dias associados.</p>
                <button type="button" class="btn-gold btn-sm" id="gp-empty-add">
                  ${ICONS.plus}
                  <span>Cadastrar primeira pessoa</span>
                </button>
              </div>
            `
            : `<div class="gratitude-grid">${cardsHtml}</div>`}
        </div>
      </div>
    `;

    screen.querySelector('#gp-close')?.addEventListener('click', closeWall);
    screen.querySelector('#gp-add-btn')?.addEventListener('click', () => startForm(null));
    screen.querySelector('#gp-empty-add')?.addEventListener('click', () => startForm(null));
    screen.querySelectorAll('[data-gp-open]').forEach((card) => {
      card.addEventListener('click', () => {
        selectedPersonId = card.dataset.gpOpen;
        viewMode = 'detail';
        render();
      });
    });
  };

  const renderDetailView = (person) => {
    const assoc = getAssociatedEntries(person, entries);
    let photoUrl = null;
    if (person.photo && person.photo.blob) {
      photoUrl = URL.createObjectURL(person.photo.blob);
      gratitudeObjectUrls.push(photoUrl);
    }

    const dateLabel = person.dateKey
      ? (() => {
          const p = formatEntryDateParts(person.dateKey);
          return `${p.day} de ${p.monthFull} de ${p.year}`;
        })()
      : '';

    screen.innerHTML = `
      <div class="editor-surface paper-deep">
        <header class="editor-topbar">
          <button type="button" class="icon-btn" id="gp-back-list" aria-label="Voltar ao mural">${ICONS.chevLeft}</button>
          <div class="editor-topbar-center">
            <span class="capsule-header-tag">Gratidão</span>
          </div>
          <div class="editor-topbar-right">
            <button type="button" class="icon-btn" id="gp-delete-person" title="Excluir pessoa" aria-label="Excluir">${ICONS.trash}</button>
            <button type="button" class="btn-save-pill" id="gp-edit-person">Editar</button>
          </div>
        </header>

        <div class="editor-scroll">
          <section class="gratitude-detail-hero">
            <div class="gratitude-detail-avatar ${photoUrl ? 'clickable' : ''}" id="gp-detail-avatar">
              ${photoUrl
                ? `<img src="${photoUrl}" alt="${escapeHtml(person.name)}">`
                : `<div class="gratitude-monogram large">${escapeHtml(getInitials(person.name))}</div>`}
            </div>
            <h2>${escapeHtml(person.name)}</h2>
            <div class="gratitude-detail-meta">
              ${person.role ? `<span class="gratitude-role-pill">${escapeHtml(person.role)}</span>` : ''}
              ${dateLabel ? `<span class="gratitude-date-chip">${dateLabel}</span>` : ''}
            </div>
          </section>

          <section class="gratitude-reason-box">
            <span class="ov-mini-lbl">${ICONS.heart} Motivo da Gratidão</span>
            <p>${person.reason ? escapeHtml(person.reason) : 'Nenhum motivo detalhado ainda.'}</p>
          </section>

          <section class="gratitude-linked-section">
            <div class="section-row-between">
              <h3>Registros do Diário Associados</h3>
              <span class="header-meta-pill">${assoc.length}</span>
            </div>

            ${assoc.length === 0
              ? `
                <div class="card cal-empty-day">
                  <p>Nenhum dia do diário vinculado a ${escapeHtml(person.name)} ainda.</p>
                  <button type="button" class="gold-outline-btn btn-sm" id="gp-link-from-detail">Vincular dias do diário</button>
                </div>
              `
              : `
                <div class="cal-day-entries">
                  ${assoc.map((e) => {
                    const ep = formatEntryDateParts(e.dateKey, e.timeStr);
                    const mood = getMoodById(e.mood);
                    const snippet = (e.content || e.authorQuote || '').trim().slice(0, 100);
                    return `
                      <article class="card cal-entry-card" data-gp-entry="${e.id}">
                        <div class="cal-entry-top">
                          <span class="cal-entry-time">${ep.day} ${ep.monthShort} ${ep.year} · ${ep.time}</span>
                          <span class="mood-badge-mini" style="color:${mood.color}">${mood.svg}</span>
                        </div>
                        <h4 class="cal-entry-title">${escapeHtml(e.title || 'Registro do dia')}</h4>
                        ${snippet ? `<p class="cal-entry-preview">${escapeHtml(snippet)}${snippet.length >= 100 ? '...' : ''}</p>` : ''}
                      </article>
                    `;
                  }).join('')}
                </div>
              `}
          </section>
        </div>
      </div>
    `;

    screen.querySelector('#gp-back-list')?.addEventListener('click', () => {
      viewMode = 'list';
      render();
    });
    screen.querySelector('#gp-edit-person')?.addEventListener('click', () => startForm(person));
    screen.querySelector('#gp-link-from-detail')?.addEventListener('click', () => startForm(person));

    screen.querySelector('#gp-delete-person')?.addEventListener('click', async () => {
      if (confirm(`Remover ${person.name || 'esta pessoa'} do Mural de Gratidão?`)) {
        await deleteGratitudePerson(person.id);
        await reloadPeople();
        onToast?.('Pessoa removida do Mural de Gratidão.');
        viewMode = 'list';
        render();
      }
    });

    if (photoUrl) {
      screen.querySelector('#gp-detail-avatar')?.addEventListener('click', () => {
        onOpenLightbox?.([{ url: photoUrl, caption: `${person.name}${person.role ? ' · ' + person.role : ''}` }], 0);
      });
    }

    screen.querySelectorAll('[data-gp-entry]').forEach((card) => {
      card.addEventListener('click', () => {
        const entry = entries.find((e) => e.id === card.dataset.gpEntry);
        if (entry) onOpenEntry?.(entry, { elevated: true });
      });
    });
  };

  const renderFormView = () => {
    let previewUrl = null;
    if (draft.photo && draft.photo.blob) {
      previewUrl = URL.createObjectURL(draft.photo.blob);
      gratitudeObjectUrls.push(previewUrl);
    }

    const sortedEntries = [...entries].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    screen.innerHTML = `
      <div class="editor-surface paper-deep">
        <header class="editor-topbar">
          <button type="button" class="icon-btn" id="gp-form-cancel" aria-label="Cancelar">${ICONS.close}</button>
          <div class="editor-topbar-center">
            <span class="capsule-header-tag">${draft.id ? 'Editar Pessoa' : 'Nova Pessoa'}</span>
          </div>
          <div class="editor-topbar-right">
            <button type="button" class="btn-save-pill" id="gp-form-save">Salvar</button>
          </div>
        </header>

        <div class="editor-scroll">
          <div class="gratitude-form-body">
            <!-- Photo Picker with Automatic Lightweight Compression -->
            <div class="gratitude-form-photo-row">
              <div class="gratitude-form-avatar">
                ${previewUrl
                  ? `<img src="${previewUrl}" alt="Prévia">`
                  : `<div class="gratitude-monogram large">${escapeHtml(getInitials(draft.name || '★'))}</div>`}
              </div>
              <div class="gratitude-form-photo-actions">
                <label class="gold-outline-btn btn-sm file-trigger-btn">
                  ${ICONS.gallery}
                  <span>${previewUrl ? 'Trocar foto' : 'Escolher foto'}</span>
                  <input type="file" id="gp-photo-input" accept="image/*" hidden>
                </label>
                ${previewUrl ? `<button type="button" class="text-btn-danger" id="gp-remove-photo">Remover foto</button>` : ''}
                ${lastPhotoStats ? `<span class="helper-caption">Otimizada: ${lastPhotoStats.original} → ${lastPhotoStats.compressed}</span>` : `<span class="helper-caption">Compressão leve automática no navegador</span>`}
              </div>
            </div>

            <div class="form-section">
              <label class="field-label" for="gp-name-input">Nome *</label>
              <input id="gp-name-input" class="dark-input" type="text" maxlength="60" placeholder="Ex: Maria, João, Prof. Carlos..." value="${escapeHtml(draft.name)}">
            </div>

            <div class="form-section">
              <label class="field-label" for="gp-role-input">Papel / Relação</label>
              <input id="gp-role-input" class="dark-input" type="text" maxlength="40" placeholder="Ex: Família, Amigo(a), Mentor(a)..." value="${escapeHtml(draft.role)}">
              <div class="role-chips-row">
                ${ROLE_PRESETS.map((r) => `
                  <button type="button" class="time-preset-chip ${draft.role === r ? 'active' : ''}" data-gp-role="${r}">${r}</button>
                `).join('')}
              </div>
            </div>

            <div class="form-section">
              <label class="field-label" for="gp-reason-input">Motivo da Gratidão</label>
              <textarea id="gp-reason-input" class="dark-input dark-textarea" rows="3" placeholder="Por que você é grato(a) por essa pessoa estar na sua vida?">${escapeHtml(draft.reason)}</textarea>
            </div>

            <div class="form-section">
              <label class="field-label" for="gp-date-input">Data marcante (opcional)</label>
              <input id="gp-date-input" class="dark-input" type="date" value="${escapeHtml(draft.dateKey)}">
            </div>

            <div class="form-section">
              <label class="field-label">Vincular a dias do diário (opcional)</label>
              ${sortedEntries.length === 0
                ? `<p class="helper-caption">Quando você criar registros no diário, poderá associá-los aqui.</p>`
                : `
                  <div class="entry-link-picker">
                    ${sortedEntries.slice(0, 30).map((e) => {
                      const ep = formatEntryDateParts(e.dateKey, e.timeStr);
                      const checked = draft.linkedEntryIds.includes(e.id);
                      return `
                        <button type="button" class="entry-link-option ${checked ? 'checked' : ''}" data-gp-link-id="${e.id}">
                          <span class="ck-box ${checked ? 'checked' : ''}">${checked ? ICONS.check : ''}</span>
                          <div class="elo-text">
                            <strong>${escapeHtml(e.title || 'Registro sem título')}</strong>
                            <span>${ep.day} ${ep.monthShort} ${ep.year}</span>
                          </div>
                        </button>
                      `;
                    }).join('')}
                  </div>
                `}
            </div>
          </div>
        </div>
      </div>
    `;

    const syncFormFields = () => {
      draft.name = screen.querySelector('#gp-name-input')?.value || '';
      draft.role = screen.querySelector('#gp-role-input')?.value || '';
      draft.reason = screen.querySelector('#gp-reason-input')?.value || '';
      draft.dateKey = screen.querySelector('#gp-date-input')?.value || '';
    };

    screen.querySelector('#gp-form-cancel')?.addEventListener('click', () => {
      viewMode = draft.id ? 'detail' : 'list';
      render();
    });

    screen.querySelector('#gp-remove-photo')?.addEventListener('click', () => {
      syncFormFields();
      draft.photo = null;
      lastPhotoStats = null;
      renderFormView();
    });

    screen.querySelector('#gp-photo-input')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      syncFormFields();
      try {
        onToast?.('Comprimindo foto...');
        const res = await compressPhotoWithStats(file, 1080, 0.82);
        draft.photo = {
          blob: res.blob,
          originalSize: res.originalSize,
          compressedSize: res.compressedSize,
          width: res.width,
          height: res.height
        };
        lastPhotoStats = {
          original: formatBytes(res.originalSize),
          compressed: formatBytes(res.compressedSize)
        };
        renderFormView();
      } catch {
        onToast?.('Não foi possível processar esta imagem.');
      }
    });

    screen.querySelectorAll('[data-gp-role]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncFormFields();
        draft.role = btn.dataset.gpRole;
        renderFormView();
      });
    });

    screen.querySelectorAll('[data-gp-link-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncFormFields();
        const eid = btn.dataset.gpLinkId;
        const idx = draft.linkedEntryIds.indexOf(eid);
        if (idx >= 0) draft.linkedEntryIds.splice(idx, 1);
        else draft.linkedEntryIds.push(eid);
        renderFormView();
      });
    });

    screen.querySelector('#gp-form-save')?.addEventListener('click', async () => {
      syncFormFields();
      if (!draft.name.trim()) {
        onToast?.('Informe o nome da pessoa antes de salvar.');
        screen.querySelector('#gp-name-input')?.focus();
        return;
      }

      const saved = await saveGratitudePerson({
        ...draft,
        name: draft.name.trim(),
        role: draft.role.trim(),
        reason: draft.reason.trim()
      });

      await reloadPeople();
      selectedPersonId = saved.id;
      viewMode = 'detail';
      render();
      onToast?.('Pessoa salva no Mural de Gratidão!');
    });
  };

  render();
  screen.classList.add('open');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
