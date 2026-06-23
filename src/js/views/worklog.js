// views/worklog.js - the day-history console. It reads the structured
// session log created by state.js and renders both a 24-hour timeline and
// a detailed list, so "what did I do today?" is answerable at a glance.

import { icon } from './../icons.js';
import { escapeHtml, fmtDateLong, debounce } from './../dom.js';
import {
  todayKey,
  addDays,
  formatClockTime,
  formatDuration,
  formatMinutesShort,
  worklogEntriesForDate,
  filterWorklogEntries,
  buildHourlyTimeline,
} from './../logic.js';

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function hourOptions(selected) {
  return Array.from({ length: 25 }, (_, h) => {
    const label = h === 24 ? '24:00' : `${String(h).padStart(2, '0')}:00`;
    return `<option value="${h}" ${Number(selected) === h ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

function entryText(entry) {
  return entry.note || entry.intent || (entry.status === 'active' ? 'Session in progress' : 'Session logged');
}

function statusLabel(entry) {
  if (entry.status === 'active') return 'ACTIVE';
  if (entry.status === 'discarded') return 'DISCARDED';
  return entry.completed ? 'DONE' : 'LOGGED';
}

function entryDuration(entry) {
  if (!entry.durationSec) return entry.status === 'active' ? 'running' : '0m';
  return entry.durationSec < 60 ? formatDuration(entry.durationSec) : formatMinutesShort(entry.durationSec / 60);
}

function timelineHtml(timeline, store) {
  return timeline
    .map((hour) => {
      const blocks = hour.entries
        .map((entry) => {
          const cat = store.getCategory(entry.categoryId);
          const color = cat?.color || 'var(--mute)';
          const label = escapeHtml(cat ? cat.name : 'Unknown');
          return `<div class="timeline-block ${entry.status}" style="left:${entry.offsetPct}%;width:${entry.widthPct}%;--block-color:${color}" data-tip="${label} - ${escapeHtml(entryText(entry))}"></div>`;
        })
        .join('');
      return `<div class="timeline-hour ${hour.entries.length ? 'has-work' : ''}">
        <div class="timeline-label mono">${hour.label}</div>
        <div class="timeline-track">${blocks}</div>
        <div class="timeline-min mono">${hour.totalMinutes ? `${hour.totalMinutes}m` : ''}</div>
      </div>`;
    })
    .join('');
}

function detailsHtml(entries, store) {
  if (!entries.length) {
    return `<div class="empty-state">${icon('book', 30)}<div>No logged work in this range.</div><div class="mute-2" style="font-size:12px">Start a focus session and it will appear here automatically.</div></div>`;
  }

  return entries
    .map((entry) => {
      const cat = store.getCategory(entry.categoryId);
      const color = cat?.color || 'var(--mute)';
      const timeRange = `${formatClockTime(entry.startedAt)}${entry.endedAt ? ` - ${formatClockTime(entry.endedAt)}` : ' - now'}`;
      const countText = entry.count ? ` - ${entry.count} ${cat?.countLabel?.toLowerCase() || 'items'}` : '';
      return `<div class="log-entry timeline-entry ${entry.status}">
        <div class="log-time mono">
          <div>${escapeHtml(timeRange)}</div>
          <div class="mute-2">${entryDuration(entry)}${countText}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div class="row between wrap" style="gap:8px;margin-bottom:4px">
            <div class="log-tag" style="color:${color}">${icon(cat ? cat.icon : 'book', 12)}<span>${escapeHtml(cat ? cat.name : 'Unknown')}</span></div>
            <span class="badge ${entry.status === 'active' ? 'active' : entry.status === 'discarded' ? 'idle' : entry.completed ? 'done' : 'idle'}">${statusLabel(entry)}</span>
          </div>
          ${entry.intent ? `<div class="log-intent">${escapeHtml(entry.intent)}</div>` : ''}
          <div class="log-note">${escapeHtml(entryText(entry))}</div>
        </div>
      </div>`;
    })
    .join('');
}

export function render(root, store) {
  let selectedDate = todayKey();
  let search = '';
  let categoryFilter = 'all';
  let fromHour = 0;
  let toHour = 24;

  function filteredEntries() {
    const dayEntries = worklogEntriesForDate(store.data.worklog, selectedDate);
    return filterWorklogEntries(dayEntries, { categoryId: categoryFilter, search, fromHour, toHour, dateKey: selectedDate });
  }

  function paint() {
    const data = store.data;
    const cats = store.activeCategories();
    const entries = filteredEntries();
    const completed = entries.filter((entry) => entry.status === 'completed');
    const totalMinutes = completed.reduce((sum, entry) => sum + Math.round((entry.durationSec || 0) / 60), 0);
    const timeline = buildHourlyTimeline(entries, selectedDate);

    root.innerHTML = `
      <div class="view fade-in">
        <div class="view-header">
          <div>
            <h1>Work Log</h1>
            <div class="sub">${fmtDateLong(selectedDate)} - ${data.worklog.length} total entr${data.worklog.length === 1 ? 'y' : 'ies'}</div>
          </div>
          <div class="row wrap">
            <button class="btn btn-icon" id="log-prev-day" data-tip="Previous day">${icon('chevronLeft', 14)}</button>
            <input class="input mono" id="log-date" type="date" value="${selectedDate}" style="width:150px"/>
            <button class="btn btn-icon" id="log-next-day" data-tip="Next day">${icon('chevronRight', 14)}</button>
            <button class="btn" id="export-log">${icon('download', 14)} Export CSV</button>
          </div>
        </div>

        <div class="card-tight row wrap log-filterbar">
          <div class="field" style="flex:1;min-width:220px">
            <input class="input" id="log-search" placeholder="Search intent or notes..." value="${escapeHtml(search)}"/>
          </div>
          <div class="field" style="min-width:170px">
            <select class="select" id="log-cat-filter">
              <option value="all">All categories</option>
              ${cats.map((c) => `<option value="${c.id}" ${categoryFilter === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field log-hour-field">
            <select class="select mono" id="log-from-hour">${hourOptions(fromHour)}</select>
          </div>
          <div class="field log-hour-field">
            <select class="select mono" id="log-to-hour">${hourOptions(toHour)}</select>
          </div>
        </div>

        <div class="grid grid-cols-4 log-summary-grid">
          <div class="card-tight"><div class="mute" style="font-size:11.5px">Sessions</div><div class="mono" style="font-size:20px">${completed.length}</div></div>
          <div class="card-tight"><div class="mute" style="font-size:11.5px">Tracked time</div><div class="mono" style="font-size:20px">${formatMinutesShort(totalMinutes)}</div></div>
          <div class="card-tight"><div class="mute" style="font-size:11.5px">Active now</div><div class="mono" style="font-size:20px">${entries.filter((e) => e.status === 'active').length}</div></div>
          <div class="card-tight"><div class="mute" style="font-size:11.5px">Range</div><div class="mono" style="font-size:20px">${String(fromHour).padStart(2, '0')}-${String(toHour).padStart(2, '0')}</div></div>
        </div>

        <div class="card log-timeline-card">
          <div class="row between wrap" style="margin-bottom:12px">
            <div style="font-weight:600;font-size:13.5px">24-hour timeline</div>
            <div class="mute mono" style="font-size:11.5px">Laptop local time</div>
          </div>
          <div class="timeline-grid">${timelineHtml(timeline, store)}</div>
        </div>

        <div class="card" id="log-list">${detailsHtml(entries, store)}</div>
      </div>
    `;

    root.querySelector('#log-prev-day').addEventListener('click', () => {
      selectedDate = addDays(selectedDate, -1);
      paint();
    });
    root.querySelector('#log-next-day').addEventListener('click', () => {
      selectedDate = addDays(selectedDate, 1);
      paint();
    });
    root.querySelector('#log-date').addEventListener('change', (e) => {
      selectedDate = e.target.value || todayKey();
      paint();
    });
    const searchInput = root.querySelector('#log-search');
    searchInput.addEventListener(
      'input',
      debounce((e) => {
        search = e.target.value;
        paint();
        root.querySelector('#log-search').focus();
        root.querySelector('#log-search').setSelectionRange(search.length, search.length);
      }, 180)
    );
    root.querySelector('#log-cat-filter').addEventListener('change', (e) => {
      categoryFilter = e.target.value;
      paint();
    });
    root.querySelector('#log-from-hour').addEventListener('change', (e) => {
      fromHour = Math.min(Number(e.target.value), toHour - 1);
      paint();
    });
    root.querySelector('#log-to-hour').addEventListener('change', (e) => {
      toHour = Math.max(Number(e.target.value), fromHour + 1);
      paint();
    });
    root.querySelector('#export-log').addEventListener('click', async () => {
      const rows = [['date', 'start', 'end', 'category', 'status', 'durationSec', 'count', 'intent', 'note'].map(csvEscape).join(',')];
      for (const l of data.worklog) {
        const cat = store.getCategory(l.categoryId);
        rows.push([l.date, l.startedAt, l.endedAt || '', cat ? cat.name : l.categoryId, l.status || 'completed', l.durationSec || 0, l.count || 0, l.intent || '', l.note || ''].map(csvEscape).join(','));
      }
      const result = await window.api.exportFile('overclock-worklog.csv', rows.join('\n'));
      if (result && result.ok) {
        root.querySelector('#export-log').innerHTML = `${icon('check', 14)} Exported`;
        setTimeout(() => paint(), 1600);
      }
    });
  }

  paint();
  const unsub = store.subscribe(paint);
  const liveRefresh = setInterval(() => {
    if (store.data.worklog.some((entry) => entry.status === 'active')) paint();
  }, 30000);
  return () => {
    clearInterval(liveRefresh);
    unsub();
  };
}
