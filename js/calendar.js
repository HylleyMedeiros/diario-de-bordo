// Calendar Tab & Pre-Creation Date Picker Modal for Diário de Bordo
import { toDateKey, parseDateKey, MONTHS_FULL, MONTHS_SHORT, WEEKDAYS_SHORT } from './db.js';
import { ICONS, getMoodById } from './icons.js';

let calViewYear = new Date().getFullYear();
let calViewMonth = new Date().getMonth();
let calSelectedDateKey = toDateKey(new Date());

// --- Shared Month Grid Builder ---
function buildCalendarCells(year, month) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Dom
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateKey: dk });
  }
  return cells;
}

// --- Modal Date Picker when clicking the '+' button ---
export function openDatePickerModal({ entries = [], initialDateKey = null, onConfirm }) {
  const modal = document.getElementById('datepicker-modal');
  if (!modal) return;

  const todayKey = toDateKey(new Date());
  let selectedKey = initialDateKey || todayKey;
  const initDt = parseDateKey(selectedKey);
  let viewYear = initDt.getFullYear();
  let viewMonth = initDt.getMonth();

  const entriesByDay = new Set(entries.map((e) => e.dateKey));
  const milestoneDays = new Set(entries.filter((e) => e.isMilestone).map((e) => e.dateKey));

  const render = () => {
    const cells = buildCalendarCells(viewYear, viewMonth);
    const selDt = parseDateKey(selectedKey);
    const selFormatted = `${selDt.getDate()} de ${MONTHS_FULL[selDt.getMonth()]} de ${selDt.getFullYear()}`;
    const isToday = selectedKey === todayKey;

    modal.innerHTML = `
      <div class="modal-backdrop" data-close-dp></div>
      <div class="modal-sheet datepicker-sheet">
        <div class="modal-header">
          <div>
            <h3>Escolher Data</h3>
            <p class="modal-subtitle">${selFormatted}${isToday ? ' · Hoje' : ''}</p>
          </div>
          <button class="icon-btn" data-close-dp aria-label="Fechar">${ICONS.close}</button>
        </div>

        <div class="cal-nav-row">
          <button class="icon-btn" id="dp-prev" aria-label="Mês anterior">${ICONS.chevLeft}</button>
          <span class="cal-month-title">${capitalize(MONTHS_FULL[viewMonth])} ${viewYear}</span>
          <button class="icon-btn" id="dp-next" aria-label="Próximo mês">${ICONS.chevRight}</button>
        </div>

        <div class="cal-weekdays">
          ${WEEKDAYS_SHORT.map((w) => `<span>${w}</span>`).join('')}
        </div>

        <div class="cal-grid">
          ${cells.map((cell) => {
            if (!cell) return `<div class="cal-cell empty"></div>`;
            const isSel = cell.dateKey === selectedKey;
            const isTod = cell.dateKey === todayKey;
            const hasEntry = entriesByDay.has(cell.dateKey);
            const hasMs = milestoneDays.has(cell.dateKey);
            return `
              <button class="cal-cell ${isSel ? 'selected' : ''} ${isTod ? 'today' : ''} ${hasEntry ? 'has-entry' : ''} ${hasMs ? 'has-milestone' : ''}"
                data-dp-date="${cell.dateKey}">
                <span>${cell.day}</span>
                ${hasMs ? `<span class="cal-milestone-star" aria-hidden="true">★</span>` : ''}
                ${hasEntry ? `<i class="cal-dot"></i>` : ''}
              </button>
            `;
          }).join('')}
        </div>

        <div class="modal-footer dp-footer">
          <button class="btn-secondary" id="dp-today-btn">Hoje</button>
          <button class="btn-gold dp-confirm-btn" id="dp-confirm-btn">
            Confirmar e Abrir Cápsula
          </button>
        </div>
      </div>
    `;

    modal.querySelectorAll('[data-close-dp]').forEach((el) => {
      el.addEventListener('click', () => modal.classList.remove('open'));
    });

    modal.querySelector('#dp-prev')?.addEventListener('click', () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      render();
    });

    modal.querySelector('#dp-next')?.addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      render();
    });

    modal.querySelector('#dp-today-btn')?.addEventListener('click', () => {
      selectedKey = todayKey;
      const t = new Date();
      viewYear = t.getFullYear();
      viewMonth = t.getMonth();
      render();
    });

    modal.querySelectorAll('[data-dp-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedKey = btn.dataset.dpDate;
        render();
      });
    });

    modal.querySelector('#dp-confirm-btn')?.addEventListener('click', () => {
      modal.classList.remove('open');
      onConfirm?.(selectedKey);
    });
  };

  render();
  modal.classList.add('open');
}

// --- Full Calendar Tab ---
export function renderCalendarTab(container, entries, callbacks = {}) {
  const todayKey = toDateKey(new Date());
  const byDate = {};
  const milestoneDays = new Set();
  for (const e of entries) {
    if (!byDate[e.dateKey]) byDate[e.dateKey] = [];
    byDate[e.dateKey].push(e);
    if (e.isMilestone) milestoneDays.add(e.dateKey);
  }

  const cells = buildCalendarCells(calViewYear, calViewMonth);
  const selEntries = byDate[calSelectedDateKey] || [];
  const selDt = parseDateKey(calSelectedDateKey);
  const selLabel = `${selDt.getDate()} de ${MONTHS_FULL[selDt.getMonth()]} de ${selDt.getFullYear()}`;

  const monthPrefix = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-`;
  const monthDaysCount = Object.keys(byDate).filter((k) => k.startsWith(monthPrefix)).length;

  container.innerHTML = `
    <div class="tab-header-bar">
      <h2>Calendário</h2>
      <button class="pill-subtle-btn" id="cal-jump-today">Hoje</button>
    </div>

    <div class="card cal-card">
      <div class="cal-nav-row">
        <button class="icon-btn" id="cal-prev" aria-label="Mês anterior">${ICONS.chevLeft}</button>
        <div class="cal-month-wrap">
          <span class="cal-month-title">${capitalize(MONTHS_FULL[calViewMonth])} ${calViewYear}</span>
          <span class="cal-month-sub">${monthDaysCount} ${monthDaysCount === 1 ? 'dia registrado' : 'dias registrados'}</span>
        </div>
        <button class="icon-btn" id="cal-next" aria-label="Próximo mês">${ICONS.chevRight}</button>
      </div>

      <div class="cal-weekdays">
        ${WEEKDAYS_SHORT.map((w) => `<span>${w}</span>`).join('')}
      </div>

      <div class="cal-grid">
        ${cells.map((cell) => {
          if (!cell) return `<div class="cal-cell empty"></div>`;
          const list = byDate[cell.dateKey] || [];
          const isSel = cell.dateKey === calSelectedDateKey;
          const isTod = cell.dateKey === todayKey;
          const hasEntry = list.length > 0;
          const hasMs = milestoneDays.has(cell.dateKey);
          return `
            <button class="cal-cell ${isSel ? 'selected' : ''} ${isTod ? 'today' : ''} ${hasEntry ? 'has-entry' : ''} ${hasMs ? 'has-milestone' : ''}"
              data-cal-date="${cell.dateKey}">
              <span>${cell.day}</span>
              ${hasMs ? `<span class="cal-milestone-star" aria-hidden="true">★</span>` : ''}
              ${hasEntry ? `<i class="cal-dot"></i>` : ''}
            </button>
          `;
        }).join('')}
      </div>
    </div>

    <div class="cal-selected-section">
      <div class="section-row-between cal-selected-header">
        <div>
          <h3 class="cal-selected-title">${selLabel}</h3>
          <span class="cal-selected-count">
            ${selEntries.length === 0 ? 'Nenhum registro nesta data' : `${selEntries.length} ${selEntries.length === 1 ? 'registro' : 'registros'}`}
          </span>
        </div>
        <button class="btn-gold btn-sm" id="cal-create-for-day">
          ${ICONS.plus}
          <span>Escrever</span>
        </button>
      </div>

      <div class="cal-day-entries">
        ${selEntries.length === 0
          ? `
            <div class="card cal-empty-day">
              <p>Este dia ainda está em branco.</p>
              <button class="gold-outline-btn btn-sm" id="cal-empty-create">Criar cápsula para ${selDt.getDate()} ${MONTHS_SHORT[selDt.getMonth()]}</button>
            </div>
          `
          : selEntries.map((entry) => {
              const mood = getMoodById(entry.mood);
              const preview = (entry.content || entry.authorQuote || '').trim().slice(0, 110);
              const photoCount = (entry.photos || []).length;
              const audioCount = (entry.audios || []).length;
              const goodCount = (entry.goodThings || []).filter((g) => g.trim() !== '').length;
              const momentCount = (entry.timelineMoments || []).length;
              return `
                <article class="card cal-entry-card ${entry.isMilestone ? 'timeline-card-milestone' : ''}" data-open-entry="${entry.id}">
                  ${entry.isMilestone ? `
                    <div class="milestone-badge-inline">
                      <span class="ms-star">${ICONS.starFilled}</span>
                      <span>${escapeHtml((entry.milestoneTitle || '').trim() || 'Evento Marcante')}</span>
                    </div>
                  ` : ''}
                  <div class="cal-entry-top">
                    <span class="cal-entry-time">${entry.timeStr || ''}</span>
                    <span class="mood-badge-mini" style="color:${mood.color}" title="${mood.label}">${mood.svg}</span>
                  </div>
                  <h4 class="cal-entry-title">${escapeHtml(entry.title || 'Sem título')}</h4>
                  ${preview ? `<p class="cal-entry-preview">${escapeHtml(preview)}${preview.length >= 110 ? '...' : ''}</p>` : ''}
                  ${(photoCount || audioCount || goodCount || momentCount || (entry.tags && entry.tags.length))
                    ? `<div class="cal-entry-meta">
                        ${momentCount ? `<span>⏱ ${momentCount}</span>` : ''}
                        ${photoCount ? `<span>📷 ${photoCount}</span>` : ''}
                        ${audioCount ? `<span>🎙️ ${audioCount}</span>` : ''}
                        ${goodCount ? `<span>✦ ${goodCount}</span>` : ''}
                        ${(entry.tags || []).slice(0, 3).map((t) => `<span class="tag-mini">#${escapeHtml(t)}</span>`).join('')}
                      </div>`
                    : ''}
                </article>
              `;
            }).join('')}
      </div>
    </div>
  `;

  container.querySelector('#cal-prev')?.addEventListener('click', () => {
    calViewMonth--;
    if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
    renderCalendarTab(container, entries, callbacks);
  });

  container.querySelector('#cal-next')?.addEventListener('click', () => {
    calViewMonth++;
    if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
    renderCalendarTab(container, entries, callbacks);
  });

  container.querySelector('#cal-jump-today')?.addEventListener('click', () => {
    const t = new Date();
    calViewYear = t.getFullYear();
    calViewMonth = t.getMonth();
    calSelectedDateKey = toDateKey(t);
    renderCalendarTab(container, entries, callbacks);
  });

  container.querySelectorAll('[data-cal-date]').forEach((btn) => {
    btn.addEventListener('click', () => {
      calSelectedDateKey = btn.dataset.calDate;
      renderCalendarTab(container, entries, callbacks);
    });
  });

  const createHandler = () => callbacks.onCreateForDate?.(calSelectedDateKey);
  container.querySelector('#cal-create-for-day')?.addEventListener('click', createHandler);
  container.querySelector('#cal-empty-create')?.addEventListener('click', createHandler);

  container.querySelectorAll('[data-open-entry]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.openEntry;
      const found = entries.find((e) => e.id === id);
      if (found) callbacks.onOpenEntry?.(found);
    });
  });
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
