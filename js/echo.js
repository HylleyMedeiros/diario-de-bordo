// Temporal Echo ("Naquele Tempo") & Capsule Consistency / Sealing Engine (Etapa 2B)
import { parseDateKey, MONTHS_FULL } from './db.js';
import { getMoodById } from './icons.js';

/**
 * Checks whether a Day Capsule has enough narrative + rich media/reflection
 * to be marked as "Cápsula Completa" and eligible for sealing.
 */
export function isCapsuleConsistent(entry) {
  const hasNarrative = Boolean(
    (entry?.content || '').trim() ||
    (entry?.authorQuote || '').trim() ||
    (entry?.nightReflection || '').trim()
  );
  const hasRichMedia = Boolean(
    (entry?.photos || []).length > 0 ||
    (entry?.videos || []).length > 0 ||
    (entry?.audios || []).length > 0 ||
    (entry?.timelineMoments || []).length > 0 ||
    (entry?.goodThings || []).some((g) => String(g || '').trim() !== '')
  );
  return {
    consistent: hasNarrative && hasRichMedia,
    hasNarrative,
    hasRichMedia
  };
}

/**
 * Finds up to `limit` related past memories from IndexedDB entries
 * based on calendar anniversary/day-of-month, shared #tags, prior milestones, or mood.
 */
export function findTemporalEchoes(targetEntry, allEntries = [], limit = 2) {
  if (!targetEntry || !Array.isArray(allEntries) || allEntries.length === 0) return [];

  const targetDateKey = targetEntry.dateKey || '';
  const targetYear = targetDateKey.slice(0, 4);
  const targetMonthDay = targetDateKey.slice(5); // MM-DD
  const targetYearMonth = targetDateKey.slice(0, 7); // YYYY-MM
  const targetDay = targetDateKey.slice(8, 10); // DD
  const targetTs = targetEntry.timestamp || Date.now();
  const targetMood = targetEntry.mood || '';
  const targetTags = new Set(
    (targetEntry.tags || [])
      .map((t) => String(t || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const scored = [];

  for (const cand of allEntries) {
    if (!cand || cand.id === targetEntry.id) continue;

    const hasContent = Boolean(
      (cand.title || '').trim() ||
      (cand.content || '').trim() ||
      (cand.authorQuote || '').trim() ||
      (cand.nightReflection || '').trim() ||
      (cand.milestoneTitle || '').trim() ||
      (cand.timelineMoments || []).length > 0 ||
      (cand.photos || []).length > 0 ||
      (cand.videos || []).length > 0 ||
      (cand.audios || []).length > 0 ||
      (cand.goodThings || []).some((g) => String(g || '').trim() !== '')
    );
    if (!hasContent) continue;

    const candDateKey = cand.dateKey || '';
    const candYear = candDateKey.slice(0, 4);
    const candMonthDay = candDateKey.slice(5);
    const candYearMonth = candDateKey.slice(0, 7);
    const candDay = candDateKey.slice(8, 10);

    let score = 0;
    let bestWeight = 0;
    let reason = '';

    const consider = (weight, label) => {
      score += weight;
      if (weight > bestWeight) {
        bestWeight = weight;
        reason = label;
      }
    };

    // 1. Exact same month & day in a different year (strongest anniversary echo)
    if (targetMonthDay && candMonthDay === targetMonthDay && candYear && candYear !== targetYear) {
      consider(100, `Neste dia em ${candYear}`);
    } else if (targetDay && candDay === targetDay && candYearMonth && candYearMonth !== targetYearMonth) {
      // 2. Same day of the month in another month
      const dt = parseDateKey(candDateKey);
      consider(55, `No dia ${dt.getDate()} de ${MONTHS_FULL[dt.getMonth()]}`);
    }

    // 3. Shared #tags
    if (targetTags.size > 0 && Array.isArray(cand.tags) && cand.tags.length > 0) {
      const shared = cand.tags
        .map((t) => String(t || '').trim().toLowerCase())
        .filter((t) => t && targetTags.has(t));
      if (shared.length > 0) {
        consider(48 + 8 * shared.length, `Mesma tag #${shared[0]}`);
      }
    }

    // 4. Prior Milestone (Evento Marcante anterior)
    if (cand.isMilestone && ((cand.timestamp || 0) < targetTs || candDateKey !== targetDateKey)) {
      const msTitle = (cand.milestoneTitle || '').trim();
      consider(36, msTitle ? `Marco · ${msTitle}` : 'Evento Marcante anterior');
    }

    // 5. Same mood
    if (targetMood && cand.mood === targetMood) {
      const moodObj = getMoodById(targetMood);
      const moodWeight = targetMood !== 'neutro' ? 26 : 14;
      consider(moodWeight, `Mesmo humor · ${moodObj.label}`);
    }

    if (score === 0) continue;

    // Gentle tie-breaker favoring memories with visual or reflective richness
    if ((cand.photos || []).length > 0 || (cand.authorQuote || '').trim()) {
      score += 4;
    }

    scored.push({ entry: cand, reason, score });
  }

  scored.sort((a, b) => (b.score - a.score) || ((b.entry.timestamp || 0) - (a.entry.timestamp || 0)));
  return scored.slice(0, limit);
}
