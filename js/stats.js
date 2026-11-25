// Statistics Tab & S.A.R.A. Pattern Radar for Diário de Bordo (Etapa 3)
import { toDateKey, parseDateKey, MONTHS_SHORT } from './db.js';
import { MOODS, ICONS } from './icons.js';
import { computeSaraRadar } from './sara.js';

function computeStreaks(entries) {
  const uniqueDays = Array.from(new Set(entries.map((e) => e.dateKey))).sort();
  if (!uniqueDays.length) return { current: 0, best: 0, uniqueCount: 0 };

  const daySet = new Set(uniqueDays);
  const today = new Date();
  const todayKey = toDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday);

  let current = 0;
  let cursor = null;
  if (daySet.has(todayKey)) cursor = new Date(today);
  else if (daySet.has(yesterdayKey)) cursor = new Date(yesterday);

  while (cursor) {
    const key = toDateKey(cursor);
    if (daySet.has(key)) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  let best = 1;
  let run = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    const prev = parseDateKey(uniqueDays[i - 1]);
    const curr = parseDateKey(uniqueDays[i]);
    const diffDays = Math.round((curr - prev) / 86400000);
    if (diffDays === 1) {
      run++;
      if (run > best) best = run;
    } else if (diffDays > 1) {
      run = 1;
    }
  }

  return { current, best, uniqueCount: uniqueDays.length };
}

export function renderStatsTab(container, entries, { gratitudeCount = 0, onOpenGratitudeWall } = {}) {
  const { current: currentStreak, best: bestStreak, uniqueCount } = computeStreaks(entries);
  const totalEntries = entries.length;
  const totalPhotos = entries.reduce((sum, e) => sum + (e.photos?.length || 0), 0);
  const totalAudios = entries.reduce((sum, e) => sum + (e.audios?.length || 0), 0);
  const totalWords = entries.reduce((sum, e) => {
    const momentsText = (e.timelineMoments || []).map((m) => `${m.title || ''} ${m.note || ''}`).join(' ');
    const text = `${e.title || ''} ${e.content || ''} ${e.authorQuote || ''} ${e.nightReflection || ''} ${momentsText}`.trim();
    return sum + (text ? text.split(/\s+/).length : 0);
  }, 0);

  const totalMilestones = entries.filter((e) => e.isMilestone).length;
  const totalSealed = entries.filter((e) => e.isSealed).length;
  const totalGoodThings = entries.reduce(
    (sum, e) => sum + ((e.goodThings || []).filter((g) => g.trim() !== '').length),
    0
  );
  const totalAuthorQuotes = entries.filter((e) => (e.authorQuote || '').trim() !== '').length;

  const radar = computeSaraRadar(entries);

  // Mood distribution
  const moodCounts = {};
  MOODS.forEach((m) => (moodCounts[m.id] = 0));
  entries.forEach((e) => {
    const id = moodCounts[e.mood] !== undefined ? e.mood : 'neutro';
    moodCounts[id]++;
  });

  const moodRows = MOODS.map((m) => ({
    ...m,
    count: moodCounts[m.id],
    pct: totalEntries > 0 ? Math.round((moodCounts[m.id] / totalEntries) * 100) : 0
  })).sort((a, b) => b.count - a.count);

  const activeMoodRows = moodRows.filter((m) => m.count > 0);
  const dominantMood = activeMoodRows[0] || null;

  // Last 6 months activity
  const now = new Date();
  const monthsData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`;
    const count = entries.filter((e) => (e.dateKey || '').startsWith(prefix)).length;
    monthsData.push({ label: MONTHS_SHORT[d.getMonth()].replace('.', ''), count });
  }
  const maxMonthCount = Math.max(1, ...monthsData.map((m) => m.count));

  container.innerHTML = `
    <div class="tab-header-bar">
      <h2>Estatísticas</h2>
      <span class="header-meta-pill">${totalEntries} ${totalEntries === 1 ? 'registro' : 'registros'}</span>
    </div>

    <!-- Primary KPI Grid -->
    <div class="stats-kpi-grid">
      <div class="card kpi-card">
        <span class="kpi-icon gold">${ICONS.calendar}</span>
        <strong class="kpi-value">${uniqueCount}</strong>
        <span class="kpi-label">Dias registrados</span>
      </div>
      <div class="card kpi-card">
        <span class="kpi-icon gold">${ICONS.flame}</span>
        <strong class="kpi-value">${currentStreak}</strong>
        <span class="kpi-label">Sequência atual</span>
        <span class="kpi-sub">Recorde: ${bestStreak} ${bestStreak === 1 ? 'dia' : 'dias'}</span>
      </div>
      <div class="card kpi-card">
        <span class="kpi-icon gold">${ICONS.gallery}</span>
        <strong class="kpi-value">${totalPhotos}</strong>
        <span class="kpi-label">Fotos salvas</span>
      </div>
      <div class="card kpi-card">
        <span class="kpi-icon gold">${ICONS.mic}</span>
        <strong class="kpi-value">${totalAudios}</strong>
        <span class="kpi-label">Notas de áudio</span>
        <span class="kpi-sub">${totalWords.toLocaleString('pt-BR')} palavras</span>
      </div>
    </div>

    <!-- Capsule Highlights (Etapa 2A + 2B) -->
    <section class="card stats-section-card">
      <h3>Destaques das Cápsulas</h3>
      <div class="capsule-highlights-row">
        <div class="ch-pill">
          <span class="ch-icon gold">${ICONS.starFilled}</span>
          <strong>${totalMilestones}</strong>
          <span>${totalMilestones === 1 ? 'Evento Marcante' : 'Eventos Marcantes'}</span>
        </div>
        <div class="ch-pill">
          <span class="ch-icon gold">${ICONS.sealCheck}</span>
          <strong>${totalSealed}</strong>
          <span>${totalSealed === 1 ? 'Cápsula Selada' : 'Cápsulas Seladas'}</span>
        </div>
        <div class="ch-pill">
          <span class="ch-icon gold">${ICONS.sparkle}</span>
          <strong>${totalGoodThings}</strong>
          <span>Coisas Boas (S.A.R.A.)</span>
        </div>
        <div class="ch-pill">
          <span class="ch-icon gold">${ICONS.quote}</span>
          <strong>${totalAuthorQuotes}</strong>
          <span>${totalAuthorQuotes === 1 ? 'Frase Autoral' : 'Frases Autorais'}</span>
        </div>
      </div>
    </section>

    <!-- Gratitude People Wall Shortcut -->
    <button type="button" class="card stats-gratitude-shortcut" id="stats-open-gratitude">
      <div class="sgs-left">
        <span class="sgs-icon">${ICONS.heart}</span>
        <div>
          <strong>Mural de Gratidão com Pessoas</strong>
          <span>${gratitudeCount === 0 ? 'Cadastre pessoas marcantes da sua jornada' : `${gratitudeCount} ${gratitudeCount === 1 ? 'pessoa marcante salva' : 'pessoas marcantes salvas'}`}</span>
        </div>
      </div>
      <span class="sgs-chev">${ICONS.chevRight}</span>
    </button>

    <!-- S.A.R.A. Pattern Radar (Etapa 3) -->
    <section class="card stats-section-card sara-radar-card">
      <div class="radar-header">
        <span class="radar-title-wrap">${ICONS.radar} Radar de Padrões · S.A.R.A.</span>
        <span class="header-meta-pill">Análise local</span>
      </div>

      <!-- Consistency: Night Reinterpretation & Sealed Capsules -->
      <div class="radar-block">
        <h4 class="radar-sub-title">Frequência Reflexiva</h4>
        <div class="radar-consistency-grid">
          <div class="radar-metric-box">
            <div class="radar-metric-top">
              <span>${ICONS.moon} Olhar da Noite</span>
              <strong>${radar.consistency.nightCount}/${radar.consistency.totalEntries} (${radar.consistency.nightPct}%)</strong>
            </div>
            <div class="radar-bar-track">
              <div class="radar-bar-fill" style="width:${radar.consistency.nightPct}%"></div>
            </div>
          </div>
          <div class="radar-metric-box">
            <div class="radar-metric-top">
              <span>${ICONS.sealCheck} Cápsulas Seladas</span>
              <strong>${radar.consistency.sealedCount}/${radar.consistency.totalEntries} (${radar.consistency.sealedPct}%)</strong>
            </div>
            <div class="radar-bar-track">
              <div class="radar-bar-fill" style="width:${radar.consistency.sealedPct}%"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Time Bands in Linha do Dia -->
      <div class="radar-block">
        <div class="section-row-between">
          <h4 class="radar-sub-title">Horários com Mais Marcos na Linha do Dia</h4>
          <span class="radar-total-lbl">${radar.consistency.totalMoments} ${radar.consistency.totalMoments === 1 ? 'marco' : 'marcos'}</span>
        </div>
        ${radar.consistency.totalMoments === 0
          ? `<p class="stats-empty-note">Adicione momentos na Linha do Dia para descobrir seus horários mais vivos.</p>`
          : `
            <div class="radar-bands-list">
              ${radar.timeBands.map((b) => `
                <div class="radar-band-row ${b.isPeak ? 'peak' : ''}">
                  <div class="radar-band-info">
                    <strong>${b.label}</strong>
                    <span>${b.range}</span>
                  </div>
                  <div class="radar-bar-track">
                    <div class="radar-bar-fill" style="width:${b.count > 0 ? Math.max(8, b.pct) : 0}%"></div>
                  </div>
                  <span class="radar-band-val">${b.count} <small>(${b.pct}%)</small></span>
                </div>
              `).join('')}
            </div>
          `}
      </div>

      <!-- Recurring Themes in Coisas Boas -->
      <div class="radar-block">
        <h4 class="radar-sub-title">Temas Recorrentes em Coisas Boas</h4>
        ${radar.goodThingsThemes.length === 0
          ? `<p class="stats-empty-note">Preencha "Coisas Boas Que Só Esse Dia Me Deu" para revelar o que mais traz sentido aos seus dias.</p>`
          : `
            <div class="radar-themes-cloud">
              ${radar.goodThingsThemes.map((th) => `
                <span class="radar-theme-pill">${escapeHtml(th.word)} <strong>${th.count}</strong></span>
              `).join('')}
            </div>
          `}
      </div>

      <!-- Most Frequent #tags -->
      <div class="radar-block">
        <h4 class="radar-sub-title">Etiquetas (#tags) Mais Frequentes</h4>
        ${radar.topTags.length === 0
          ? `<p class="stats-empty-note">Use #tags nos seus registros para acompanhar temas recorrentes.</p>`
          : `
            <div class="stats-tags-cloud">
              ${radar.topTags.map((item) => `
                <span class="tag-chip">#${escapeHtml(item.tag)} <strong>${item.count}</strong></span>
              `).join('')}
            </div>
          `}
      </div>
    </section>

    <!-- Mood Distribution -->
    <section class="card stats-section-card">
      <div class="section-row-between">
        <h3>Distribuição de Humores</h3>
        ${dominantMood ? `<span class="dominant-mood-pill" style="color:${dominantMood.color}">${dominantMood.label}</span>` : ''}
      </div>

      ${totalEntries === 0
        ? `<p class="stats-empty-note">Seus humores aparecerão aqui conforme você escrever no diário.</p>`
        : `
          <div class="mood-bars-list">
            ${(activeMoodRows.length ? activeMoodRows : moodRows.slice(0, 4)).map((m) => `
              <div class="mood-bar-row">
                <div class="mood-bar-left">
                  <span class="mood-bar-icon" style="color:${m.color}">${m.svg}</span>
                  <span class="mood-bar-name">${m.label}</span>
                </div>
                <div class="mood-bar-track">
                  <div class="mood-bar-fill" style="width:${m.pct}%; background:${m.color}"></div>
                </div>
                <span class="mood-bar-pct">${m.count} <small>(${m.pct}%)</small></span>
              </div>
            `).join('')}
          </div>
        `}
    </section>

    <!-- Monthly Activity Chart -->
    <section class="card stats-section-card">
      <h3>Ritmo dos Últimos 6 Meses</h3>
      <div class="month-bars-chart">
        ${monthsData.map((m) => {
          const hPct = Math.round((m.count / maxMonthCount) * 100);
          return `
            <div class="month-col">
              <span class="month-col-val">${m.count || ''}</span>
              <div class="month-col-track">
                <div class="month-col-bar" style="height:${m.count > 0 ? Math.max(12, hPct) : 4}%"></div>
              </div>
              <span class="month-col-lbl">${m.label}</span>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;

  container.querySelector('#stats-open-gratitude')?.addEventListener('click', () => {
    onOpenGratitudeWall?.();
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
