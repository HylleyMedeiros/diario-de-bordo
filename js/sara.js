// S.A.R.A. Pattern Radar Analytics Engine for Diário de Bordo (Etapa 3)

const PT_STOPWORDS = new Set([
  'a', 'ao', 'aos', 'as', 'ate', 'bem', 'bom', 'boa', 'cada', 'com', 'como', 'coisa', 'coisas',
  'da', 'das', 'de', 'dela', 'dele', 'deles', 'depois', 'desse', 'dessa', 'deste', 'desta',
  'dia', 'dias', 'disso', 'do', 'dos', 'duas', 'dois', 'dum', 'duma', 'e', 'ela', 'elas',
  'ele', 'eles', 'em', 'entre', 'era', 'essa', 'esse', 'esta', 'este', 'estou', 'eu', 'faz',
  'fazer', 'fez', 'ficar', 'foi', 'fomos', 'for', 'foram', 'fui', 'grande', 'hoje', 'isso',
  'isto', 'ja', 'junto', 'la', 'lhe', 'lhes', 'logo', 'mais', 'mas', 'me', 'meu', 'meus',
  'minha', 'minhas', 'muito', 'muita', 'muitos', 'muitas', 'na', 'nada', 'nao', 'nas', 'nem',
  'nesse', 'nessa', 'neste', 'nesta', 'no', 'nos', 'nossa', 'nosso', 'novo', 'nova', 'num',
  'numa', 'nunca', 'o', 'ontem', 'os', 'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos', 'pode',
  'podem', 'poder', 'pois', 'por', 'porque', 'pouco', 'pra', 'pro', 'qual', 'quando', 'quase',
  'que', 'quem', 'quer', 'se', 'sem', 'sempre', 'ser', 'seu', 'seus', 'sim', 'so', 'sobre',
  'sou', 'sua', 'suas', 'tal', 'tambem', 'tao', 'tem', 'tendo', 'ter', 'teve', 'tive', 'toda',
  'todas', 'todo', 'todos', 'tudo', 'um', 'uma', 'umas', 'uns', 'vai', 'vamos', 'vez', 'vezes',
  'voce', 'voces', 'vos'
]);

const POSITIVE_MOODS = new Set(['radiante', 'feliz', 'tranquilo']);

function stripAccents(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getTimeBandId(timeStr) {
  const hour = Number(String(timeStr || '12:00').split(':')[0]);
  if (!Number.isFinite(hour)) return 'tarde';
  if (hour >= 5 && hour < 12) return 'manha';
  if (hour >= 12 && hour < 18) return 'tarde';
  if (hour >= 18 && hour < 23) return 'noite';
  return 'madrugada';
}

/**
 * Computes recurring behavioral and reflective patterns across saved diary entries:
 * - Most frequent #tags
 * - Recurring meaningful themes/words in "Coisas Boas do Dia"
 * - Peak time-of-day bands in "Linha do Dia"
 * - Frequency of "Reinterpretação da Noite" and "Cápsulas Seladas"
 */
export function computeSaraRadar(entries = []) {
  const totalEntries = entries.length;

  // 1. Most frequent #tags
  const tagCounts = {};
  for (const e of entries) {
    for (const rawTag of e.tags || []) {
      const t = String(rawTag || '').trim().toLowerCase();
      if (!t) continue;
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));

  // 2. Recurring themes/words in "Coisas Boas do Dia"
  const themeGroups = new Map(); // normalized -> { count, forms: Map<wordLower, count> }
  let totalGoodThings = 0;

  for (const e of entries) {
    for (const item of e.goodThings || []) {
      const cleanItem = String(item || '').trim();
      if (!cleanItem) continue;
      totalGoodThings++;

      const tokens = cleanItem
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/);

      const seenInItem = new Set();
      for (const tok of tokens) {
        const w = tok.replace(/^-+|-+$/g, '');
        if (w.length < 3) continue;
        const norm = stripAccents(w);
        if (norm.length < 3 || PT_STOPWORDS.has(norm) || /^\d+$/.test(norm)) continue;
        if (seenInItem.has(norm)) continue;
        seenInItem.add(norm);

        let group = themeGroups.get(norm);
        if (!group) {
          group = { count: 0, forms: new Map() };
          themeGroups.set(norm, group);
        }
        group.count++;
        group.forms.set(w, (group.forms.get(w) || 0) + 1);
      }
    }
  }

  const goodThingsThemes = Array.from(themeGroups.entries())
    .map(([, group]) => {
      let bestForm = '';
      let bestCount = -1;
      for (const [form, c] of group.forms.entries()) {
        if (c > bestCount) {
          bestCount = c;
          bestForm = form;
        }
      }
      return { word: bestForm, count: group.count };
    })
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, 8);

  // 3. Time-of-day bands with most moments in "Linha do Dia"
  const bandDefs = [
    { id: 'manha', label: 'Manhã', range: '05h–12h' },
    { id: 'tarde', label: 'Tarde', range: '12h–18h' },
    { id: 'noite', label: 'Noite', range: '18h–23h' },
    { id: 'madrugada', label: 'Madrugada', range: '23h–05h' }
  ];
  const bandStats = Object.fromEntries(
    bandDefs.map((b) => [b.id, { ...b, count: 0, positiveCount: 0, pct: 0, isPeak: false }])
  );

  let totalMoments = 0;
  for (const e of entries) {
    const moments = e.timelineMoments || [];
    if (!moments.length) continue;
    const isPositiveDay =
      POSITIVE_MOODS.has(e.mood) ||
      (e.goodThings || []).some((g) => String(g || '').trim() !== '');

    for (const m of moments) {
      const bandId = getTimeBandId(m.time);
      bandStats[bandId].count++;
      if (isPositiveDay) bandStats[bandId].positiveCount++;
      totalMoments++;
    }
  }

  let maxBandCount = 0;
  for (const b of bandDefs) {
    const cur = bandStats[b.id];
    cur.pct = totalMoments > 0 ? Math.round((cur.count / totalMoments) * 100) : 0;
    if (cur.count > maxBandCount) maxBandCount = cur.count;
  }
  const timeBands = bandDefs.map((b) => {
    const cur = bandStats[b.id];
    if (totalMoments > 0 && cur.count === maxBandCount && cur.count > 0) {
      cur.isPeak = true;
    }
    return cur;
  });

  // 4. Consistency of "Reinterpretação da Noite" & "Cápsulas Seladas"
  const nightCount = entries.filter((e) => (e.nightReflection || '').trim() !== '').length;
  const sealedCount = entries.filter((e) => Boolean(e.isSealed)).length;

  return {
    topTags,
    goodThingsThemes,
    timeBands,
    consistency: {
      totalEntries,
      nightCount,
      nightPct: totalEntries > 0 ? Math.round((nightCount / totalEntries) * 100) : 0,
      sealedCount,
      sealedPct: totalEntries > 0 ? Math.round((sealedCount / totalEntries) * 100) : 0,
      totalMoments,
      totalGoodThings
    }
  };
}
