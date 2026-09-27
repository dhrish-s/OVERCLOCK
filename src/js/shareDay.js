import { dayBounds, formatMinutesShort } from './logic.js';

const FALLBACK_COLOR = '#9AA29F';

function entryStartMs(entry) {
  return new Date(entry.startedAt || entry.createdAt || 0).getTime();
}

function entryEndMs(entry, nowMs) {
  const explicitEnd = entry.endedAt ? new Date(entry.endedAt).getTime() : NaN;
  if (Number.isFinite(explicitEnd)) return explicitEnd;
  if (entry.status === 'active') return nowMs;
  const durationSec = Number(entry.durationSec) || 0;
  return entryStartMs(entry) + durationSec * 1000;
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : FALLBACK_COLOR;
}

export function shareClockLabel(iso) {
  const date = new Date(iso);
  const hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function buildDayShareSummary(entries, categories, key, { includeNotes = true, now = new Date() } = {}) {
  const { start, end } = dayBounds(key);
  const dayStartMs = start.getTime();
  const dayEndMs = end.getTime();
  const nowMs = now.getTime();
  const categoryById = new Map((categories || []).map((category) => [category.id, category]));

  const items = (entries || [])
    .filter((entry) => entry.status !== 'discarded')
    .map((entry) => {
      const rawStart = entryStartMs(entry);
      const rawEnd = entryEndMs(entry, nowMs);
      const startedMs = Math.max(dayStartMs, rawStart);
      const endedMs = Math.min(dayEndMs, Math.max(rawStart, rawEnd));
      const category = categoryById.get(entry.categoryId);
      const task = (entry.intent || entry.note || (entry.status === 'active' ? 'Session in progress' : 'Session logged')).trim();
      const note = includeNotes && entry.note && entry.note.trim() !== task ? entry.note.trim() : '';
      return {
        id: entry.id,
        categoryName: category?.name || 'Unknown',
        categoryColor: safeColor(category?.color),
        task,
        note,
        startedAt: new Date(startedMs).toISOString(),
        endedAt: new Date(endedMs).toISOString(),
        startMinute: Math.max(0, (startedMs - dayStartMs) / 60000),
        endMinute: Math.min(1440, (endedMs - dayStartMs) / 60000),
        durationMinutes: Math.max(0, Math.round((endedMs - startedMs) / 60000)),
        active: entry.status === 'active',
      };
    })
    .filter((item) => item.endMinute >= item.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const categoryMinutes = new Map();
  for (const item of items) {
    categoryMinutes.set(item.categoryName, (categoryMinutes.get(item.categoryName) || 0) + item.durationMinutes);
  }

  return {
    key,
    dateLabel: start.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    includeNotes,
    sessionCount: items.length,
    totalMinutes: items.reduce((sum, item) => sum + item.durationMinutes, 0),
    firstStartMinute: items.length ? items[0].startMinute : null,
    lastEndMinute: items.length ? Math.max(...items.map((item) => item.endMinute)) : null,
    categories: [...categoryMinutes.entries()]
      .map(([name, minutes]) => ({ name, minutes }))
      .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name)),
    items,
  };
}

export function dayShareText(summary) {
  const lines = [
    'OVERCLOCK DAILY SUMMARY',
    summary.dateLabel,
    '',
    `${summary.sessionCount} ${summary.sessionCount === 1 ? 'session' : 'sessions'} | ${formatMinutesShort(summary.totalMinutes)} tracked`,
  ];

  if (!summary.items.length) {
    lines.push('', 'No tracked work.');
    return lines.join('\n');
  }

  lines.push('');
  for (const item of summary.items) {
    lines.push(`${shareClockLabel(item.startedAt)} - ${shareClockLabel(item.endedAt)} | ${item.categoryName} | ${formatMinutesShort(item.durationMinutes)}`);
    lines.push(`  ${item.task}`);
    if (item.note) lines.push(`  ${item.note}`);
  }
  lines.push('', 'Made with Overclock');
  return lines.join('\n');
}
