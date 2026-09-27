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

function roundedRect(ctx, x, y, width, height, radius = 8) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function fitText(ctx, text, maxWidth) {
  const value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) return value;
  let shortened = value;
  while (shortened.length && ctx.measureText(`${shortened}...`).width > maxWidth) shortened = shortened.slice(0, -1);
  return `${shortened}...`;
}

function assignShareLanes(items) {
  const laneEnds = [];
  return items.map((item) => {
    let lane = laneEnds.findIndex((endMinute) => endMinute <= item.startMinute);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.endMinute;
    return { ...item, lane };
  });
}

export function createDaySharePng(summary) {
  const width = 1200;
  // Keep unusually busy days readable in an image; the text export keeps every entry.
  const shownItems = summary.items.slice(0, 24);
  const overflowCount = Math.max(0, summary.items.length - shownItems.length);
  const rowHeight = summary.includeNotes ? 82 : 66;
  const timelineItems = assignShareLanes(summary.items);
  const laneCount = Math.max(1, ...timelineItems.map((item) => item.lane + 1));
  const timelineHeight = 112 + laneCount * 15;
  const listHeight = Math.max(86, shownItems.length * (rowHeight + 14) + (overflowCount ? 34 : 0));
  const height = 332 + timelineHeight + listHeight + 110;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0D0F10';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#4ADE80';
  ctx.beginPath();
  ctx.arc(65, 55, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFB454';
  ctx.font = '700 18px Segoe UI, sans-serif';
  ctx.fillText('OVERCLOCK', 83, 62);
  ctx.fillStyle = '#EDF0EE';
  ctx.font = '700 42px Segoe UI, sans-serif';
  ctx.fillText('Daily work summary', 64, 124);
  ctx.fillStyle = '#9AA29F';
  ctx.font = '18px Segoe UI, sans-serif';
  ctx.fillText(summary.dateLabel, 65, 158);

  const metrics = [
    ['SESSIONS', String(summary.sessionCount)],
    ['TRACKED TIME', formatMinutesShort(summary.totalMinutes)],
    ['TOP CATEGORY', summary.categories[0]?.name || 'No activity'],
  ];
  metrics.forEach(([label, value], index) => {
    const x = 64 + index * 362;
    roundedRect(ctx, x, 190, 338, 96, 8);
    ctx.fillStyle = '#1D2122';
    ctx.fill();
    ctx.strokeStyle = '#303638';
    ctx.stroke();
    ctx.fillStyle = '#9AA29F';
    ctx.font = '13px Consolas, monospace';
    ctx.fillText(label, x + 20, 219);
    ctx.fillStyle = '#EDF0EE';
    ctx.font = '600 27px Segoe UI, sans-serif';
    ctx.fillText(fitText(ctx, value, 298), x + 20, 258);
  });

  const timelineY = 322;
  ctx.fillStyle = '#EDF0EE';
  ctx.font = '600 18px Segoe UI, sans-serif';
  ctx.fillText('Timeline', 64, timelineY);
  ctx.fillStyle = '#9AA29F';
  ctx.font = '13px Consolas, monospace';
  ctx.fillText('LOCAL TIME', 1040, timelineY);

  const trackX = 64;
  const trackY = timelineY + 38;
  const trackWidth = width - 128;
  const trackHeight = 30 + laneCount * 15;
  roundedRect(ctx, trackX, trackY, trackWidth, trackHeight, 6);
  ctx.fillStyle = '#151819';
  ctx.fill();
  ctx.strokeStyle = '#303638';
  ctx.stroke();
  // A fixed 24-hour scale makes different shared days easy to compare.
  for (let hour = 0; hour <= 24; hour += 3) {
    const x = trackX + (hour / 24) * trackWidth;
    ctx.strokeStyle = '#24292B';
    ctx.beginPath();
    ctx.moveTo(x, trackY);
    ctx.lineTo(x, trackY + trackHeight);
    ctx.stroke();
    ctx.fillStyle = '#626B68';
    ctx.font = '11px Consolas, monospace';
    ctx.fillText(String(hour).padStart(2, '0'), Math.min(x + 4, trackX + trackWidth - 18), trackY + 17);
  }
  for (const item of timelineItems) {
    const x = trackX + (item.startMinute / 1440) * trackWidth;
    const itemWidth = Math.max(5, ((item.endMinute - item.startMinute) / 1440) * trackWidth);
    roundedRect(ctx, x, trackY + 26 + item.lane * 15, itemWidth, 10, 2);
    ctx.fillStyle = item.categoryColor;
    ctx.fill();
  }

  let y = trackY + trackHeight + 58;
  ctx.fillStyle = '#EDF0EE';
  ctx.font = '600 18px Segoe UI, sans-serif';
  ctx.fillText('Activity', 64, y);
  y += 24;
  if (!shownItems.length) {
    ctx.fillStyle = '#9AA29F';
    ctx.font = '17px Segoe UI, sans-serif';
    ctx.fillText('No tracked work for this day.', 64, y + 42);
  }
  for (const item of shownItems) {
    y += 14;
    ctx.fillStyle = item.categoryColor;
    ctx.fillRect(64, y, 4, rowHeight - 10);
    ctx.fillStyle = '#9AA29F';
    ctx.font = '14px Consolas, monospace';
    ctx.fillText(`${shareClockLabel(item.startedAt)} - ${shareClockLabel(item.endedAt)}`, 86, y + 19);
    ctx.fillStyle = item.categoryColor;
    ctx.font = '600 15px Segoe UI, sans-serif';
    ctx.fillText(fitText(ctx, item.categoryName, 250), 86, y + 44);
    ctx.fillStyle = '#EDF0EE';
    ctx.font = '600 17px Segoe UI, sans-serif';
    ctx.fillText(fitText(ctx, item.task, 560), 360, y + 22);
    if (item.note) {
      ctx.fillStyle = '#9AA29F';
      ctx.font = '14px Segoe UI, sans-serif';
      ctx.fillText(fitText(ctx, item.note, 560), 360, y + 47);
    }
    ctx.fillStyle = '#9AA29F';
    ctx.font = '14px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(formatMinutesShort(item.durationMinutes), 1136, y + 22);
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#24292B';
    ctx.beginPath();
    ctx.moveTo(86, y + rowHeight - 1);
    ctx.lineTo(1136, y + rowHeight - 1);
    ctx.stroke();
    y += rowHeight;
  }
  if (overflowCount) {
    ctx.fillStyle = '#9AA29F';
    ctx.font = '14px Segoe UI, sans-serif';
    ctx.fillText(`Plus ${overflowCount} more ${overflowCount === 1 ? 'entry' : 'entries'} in the text export`, 86, y + 20);
  }

  ctx.fillStyle = '#626B68';
  ctx.font = '13px Segoe UI, sans-serif';
  ctx.fillText('Generated locally by Overclock. No activity data was uploaded.', 64, height - 38);
  return canvas.toDataURL('image/png');
}
