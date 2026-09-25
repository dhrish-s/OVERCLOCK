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
  worklogIdleGaps,
} from './../logic.js';

const MANUAL_TASK_TEMPLATES = ['Gym', 'Class', 'Reading', 'Interview prep', 'Errands'];

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
  if (entry.type === 'manual') return 'MANUAL';
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
      const taskLabels = hour.entries
        .map((entry) => {
          const cat = store.getCategory(entry.categoryId);
          return `<span class="timeline-task"><span class="timeline-task-dot" style="--block-color:${cat?.color || 'var(--mute)'}"></span>${escapeHtml(cat?.name || 'Unknown')}: ${escapeHtml(entryText(entry))}</span>`;
        })
        .join('');
      return `<div class="timeline-hour ${hour.entries.length ? 'has-work' : ''}">
        <div class="timeline-label mono">${hour.label}</div>
        <div class="timeline-cell"><div class="timeline-track">${blocks}</div>${taskLabels ? `<div class="timeline-task-list">${taskLabels}</div>` : ''}</div>
        <div class="timeline-min mono">${hour.totalMinutes ? `${hour.totalMinutes}m` : ''}</div>
      </div>`;
    })
    .join('');
}

function idleGapsHtml(gaps) {
  if (!gaps.length) return '';
  return `<div class="idle-gap-list">${gaps
    .map((gap) => `<div class="idle-gap">${icon('pulse', 13)}<span>No tracked work from ${escapeHtml(formatClockTime(gap.startedAt))} to ${escapeHtml(formatClockTime(gap.endedAt))}</span><span class="mono mute">${formatMinutesShort(gap.durationMinutes)}</span></div>`)
    .join('')}</div>`;
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
            <div class="row log-entry-actions">
              <span class="badge ${entry.status === 'active' ? 'active' : entry.status === 'discarded' ? 'idle' : entry.type === 'manual' ? 'manual' : entry.completed ? 'done' : 'idle'}">${statusLabel(entry)}</span>
              ${entry.status !== 'active' && entry.type !== 'session' ? `<button class="btn btn-ghost btn-icon edit-log-entry" data-log-id="${entry.id}" data-tip="Edit entry">${icon('edit', 13)}</button><button class="btn btn-ghost btn-icon delete-log-entry" data-log-id="${entry.id}" data-tip="Delete entry">${icon('trash', 13)}</button>` : ''}
            </div>
          </div>
          ${entry.intent ? `<div class="log-intent">${escapeHtml(entry.intent)}</div>` : ''}
          <div class="log-note">${escapeHtml(entryText(entry))}</div>
        </div>
      </div>`;
    })
    .join('');
}

function defaultManualTimes(selectedDate) {
  const now = new Date();
  const isToday = todayKey() === selectedDate;
  const end = isToday ? now : new Date(2026, 0, 1, 9, 0);
  const start = new Date(end);
  start.setHours(Math.max(0, end.getHours() - 1), end.getMinutes(), 0, 0);
  if (start.getTime() === end.getTime()) end.setMinutes(end.getMinutes() + 30);
  const fmt = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return {
    startTime: fmt(start),
    endTime: fmt(end),
  };
}

function localDateTimeIso(dateKey, timeValue) {
  if (!timeValue) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = timeValue.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0).toISOString();
}

function timeInputValue(iso) {
  const value = new Date(iso);
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

export function render(root, store) {
  let selectedDate = todayKey();
  let search = '';
  let categoryFilter = 'all';
  let fromHour = 0;
  let toHour = 24;

  function openManualEntryModal(entry = null) {
    const editing = !!entry;
    const cats = editing ? store.data.categories : store.activeCategories();
    const entryDate = entry?.date || selectedDate;
    const defaults = entry
      ? { startTime: timeInputValue(entry.startedAt), endTime: timeInputValue(entry.endedAt) }
      : defaultManualTimes(selectedDate);
    const overlay = document.createElement('div');
    overlay.className = 'overlay fade-in';
    const modal = document.createElement('div');
    modal.className = 'modal wide';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function close() {
      overlay.remove();
    }

    modal.innerHTML = `
      <div class="row between" style="margin-bottom:4px">
        <div>
          <div class="modal-title">${editing ? 'Edit worklog entry' : 'Add manual entry'}</div>
          <div class="modal-sub">Times use the laptop clock. Worklog edits do not change coins or streaks.</div>
        </div>
        <button class="btn btn-ghost btn-icon" id="manual-close" aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="grid grid-cols-2" style="margin-bottom:12px">
        <div class="field">
          <label for="manual-date">Date</label>
          <input class="input mono" id="manual-date" type="date" value="${entryDate}"/>
        </div>
        <div class="field">
          <label for="manual-category">Category</label>
          <select class="select" id="manual-category">
            ${cats.map((c) => `<option value="${c.id}" ${entry?.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="manual-start">Start</label>
          <input class="input mono" id="manual-start" type="time" value="${defaults.startTime}"/>
        </div>
        <div class="field">
          <label for="manual-end">End</label>
          <input class="input mono" id="manual-end" type="time" value="${defaults.endTime}"/>
        </div>
      </div>
      <div class="manual-template-row" aria-label="Task templates">
        ${MANUAL_TASK_TEMPLATES.map((template) => `<button class="btn manual-template" data-template="${escapeHtml(template)}">${escapeHtml(template)}</button>`).join('')}
      </div>
      <div class="field" style="margin-bottom:12px">
        <label for="manual-intent">Task</label>
        <input class="input" id="manual-intent" value="${escapeHtml(entry?.intent || '')}" placeholder="e.g. Reviewed system design notes, helped with a resume, read docs..."/>
      </div>
      <div class="grid grid-cols-2" style="margin-bottom:12px">
        <div class="field">
          <label for="manual-count">Count</label>
          <input class="input mono" id="manual-count" type="number" min="0" step="1" value="${entry?.count || 0}"/>
        </div>
        <label class="row" style="gap:8px;align-items:center;padding-top:22px">
          <input type="checkbox" id="manual-completed" ${entry?.completed === false ? '' : 'checked'}/> Completed
        </label>
      </div>
      <div class="field">
        <label for="manual-note">Note</label>
        <textarea class="textarea" id="manual-note" placeholder="What did you actually do?">${escapeHtml(entry?.note || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn" id="manual-cancel">Cancel</button>
        <button class="btn btn-primary" id="manual-save">${icon(editing ? 'check' : 'plus', 14)} ${editing ? 'Save changes' : 'Add entry'}</button>
      </div>
    `;

    modal.querySelector('#manual-close').addEventListener('click', close);
    modal.querySelector('#manual-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    modal.querySelectorAll('.manual-template').forEach((button) => {
      button.addEventListener('click', () => {
        modal.querySelector('#manual-intent').value = button.dataset.template;
        modal.querySelector('#manual-intent').focus();
      });
    });
    modal.querySelector('#manual-save').addEventListener('click', () => {
      const dateValue = modal.querySelector('#manual-date').value || selectedDate;
      const startTime = modal.querySelector('#manual-start').value;
      const endTime = modal.querySelector('#manual-end').value;
      const values = {
        categoryId: modal.querySelector('#manual-category').value,
        startedAt: localDateTimeIso(dateValue, startTime),
        endedAt: localDateTimeIso(dateValue, endTime),
        intent: modal.querySelector('#manual-intent').value,
        note: modal.querySelector('#manual-note').value,
        count: modal.querySelector('#manual-count').value,
        completed: modal.querySelector('#manual-completed').checked,
      };
      let result = editing ? store.updateWorklogEntry(entry.id, values) : store.addManualWorklogEntry(values);
      if (result.conflict && window.confirm(`${result.error} Add it anyway?`)) {
        values.allowOverlap = true;
        result = editing ? store.updateWorklogEntry(entry.id, values) : store.addManualWorklogEntry(values);
      }
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      selectedDate = result.entry.date;
      close();
    });
    setTimeout(() => modal.querySelector('#manual-intent')?.focus(), 0);
  }

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
    const idleGaps = worklogIdleGaps(entries.filter((entry) => entry.status !== 'discarded'), selectedDate);

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
            <button class="btn btn-primary" id="add-manual-log">${icon('plus', 14)} Add entry</button>
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
          ${idleGapsHtml(idleGaps)}
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
    root.querySelector('#add-manual-log').addEventListener('click', () => openManualEntryModal());
    root.querySelectorAll('.edit-log-entry').forEach((button) => {
      button.addEventListener('click', () => {
        const entry = store.data.worklog.find((item) => item.id === button.dataset.logId);
        if (entry) openManualEntryModal(entry);
      });
    });
    root.querySelectorAll('.delete-log-entry').forEach((button) => {
      button.addEventListener('click', () => {
        if (!window.confirm('Delete this worklog entry?')) return;
        const result = store.deleteWorklogEntry(button.dataset.logId);
        if (!result.ok) window.alert(result.error);
      });
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
      const rows = [['date', 'type', 'start', 'end', 'category', 'status', 'durationSec', 'count', 'intent', 'note'].map(csvEscape).join(',')];
      for (const l of data.worklog) {
        const cat = store.getCategory(l.categoryId);
        rows.push([l.date, l.type || 'session', l.startedAt, l.endedAt || '', cat ? cat.name : l.categoryId, l.status || 'completed', l.durationSec || 0, l.count || 0, l.intent || '', l.note || ''].map(csvEscape).join(','));
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
    if (!document.hidden && store.data.worklog.some((entry) => entry.status === 'active')) paint();
  }, 60000);
  return () => {
    clearInterval(liveRefresh);
    unsub();
  };
}
