// views/calendar.js - the Duolingo-style tracker the user asked for, split
// into two complementary views of the same data: a year-long heatmap for
// "how consistent have I been lately" and a month grid for "what exactly
// happened on day X", with a detail panel underneath driven by whichever
// day was last clicked in either widget.

import { icon } from './../icons.js';
import { escapeHtml, fmtDateLong } from './../dom.js';
import { dateKey, addDays, todayKey, monthMatrix, progressForCategory, formatMinutesShort, worklogEntriesForDate, formatClockTime } from './../logic.js';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayActivityLevel(day, categories) {
  if (!day) return 0;
  const active = categories.filter((c) => !c.archived);
  if (active.length === 0) return 0;
  const met = active.filter((c) => day.categoryProgress?.[c.id]?.goalMet).length;
  const frac = met / active.length;
  if (frac === 0) return 0;
  if (frac < 0.34) return 1;
  if (frac < 0.67) return 2;
  if (frac < 1) return 3;
  return 4;
}

export function render(root, store) {
  const today = todayKey();
  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();
  let selectedKey = today;

  function buildHeatmap() {
    const data = store.data;
    const end = today;
    let start = addDays(end, -363);
    // Pad backward to the preceding Sunday so columns align to whole weeks.
    while (new Date(start.split('-')[0], start.split('-')[1] - 1, start.split('-')[2]).getDay() !== 0) {
      start = addDays(start, -1);
    }
    let endPadded = end;
    while (new Date(endPadded.split('-')[0], endPadded.split('-')[1] - 1, endPadded.split('-')[2]).getDay() !== 6) {
      endPadded = addDays(endPadded, 1);
    }

    const cells = [];
    let cursor = start;
    while (cursor <= endPadded) {
      const isFuture = cursor > end;
      const day = data.days[cursor];
      const level = dayActivityLevel(day, data.categories);
      const perfect = !!day?.perfectDay;
      cells.push({ key: cursor, level, perfect, isFuture });
      cursor = addDays(cursor, 1);
    }
    return cells
      .map((c) => {
        if (c.isFuture) return `<div class="cell" style="background:transparent" data-key="${c.key}"></div>`;
        const tip = `${c.key}${c.level > 0 ? ` - ${c.level === 4 ? 'all goals met' : 'partial progress'}` : ' - no activity'}`;
        return `<div class="cell ${c.perfect ? 'perfect' : ''}" data-level="${c.level}" data-key="${c.key}" data-tip="${tip}"></div>`;
      })
      .join('');
  }

  function buildMonthGrid() {
    const data = store.data;
    const rows = monthMatrix(viewYear, viewMonth);
    const dow = DOW.map((d) => `<div class="dow">${d}</div>`).join('');
    const cells = rows
      .flat()
      .map((key) => {
        if (!key) return `<div class="day-cell empty"></div>`;
        const day = data.days[key];
        const dateNum = Number(key.split('-')[2]);
        const isToday = key === today;
        const isSelected = key === selectedKey;
        const isPerfect = !!day?.perfectDay;
        const hasActivity = !!day && Object.keys(day.categoryProgress || {}).length > 0;
        const dots = store
          .activeCategories()
          .map((c) => {
            const met = day?.categoryProgress?.[c.id]?.goalMet;
            return `<span class="${met ? 'met' : ''}" style="${met ? `background:${c.color}` : ''}"></span>`;
          })
          .join('');
        return `<div class="day-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${isPerfect ? 'perfect' : ''} ${hasActivity ? 'has-activity' : ''}" data-key="${key}">
          <span>${dateNum}</span>
          <span class="dots">${dots}</span>
        </div>`;
      })
      .join('');
    return `<div class="month-grid">${dow}${cells}</div>`;
  }

  function buildDetail() {
    const data = store.data;
    const day = data.days[selectedKey];
    const cats = store.activeCategories();
    const logsForDay = worklogEntriesForDate(data.worklog, selectedKey);

    const rows = cats
      .map((c) => {
        const prog = progressForCategory(day, c);
        const label = c.goalType === 'count' ? `${prog.count}/${c.goalValue}` : `${formatMinutesShort(prog.minutes)} / ${formatMinutesShort(c.goalValue)}`;
        return `<div class="row between" style="padding:7px 0;border-bottom:1px solid var(--border-soft)">
          <div class="row"><span style="color:${c.color}">${icon(c.icon, 16)}</span><span style="font-size:13px">${escapeHtml(c.name)}</span></div>
          <div class="row"><span class="mono mute" style="font-size:12px">${label}</span>${prog.goalMet ? `<span class="green">${icon('check', 14)}</span>` : ''}</div>
        </div>`;
      })
      .join('');

    const logsHtml = logsForDay.length
      ? logsForDay
          .map((l) => {
            const cat = store.getCategory(l.categoryId);
            const text = l.note || l.intent || (l.status === 'active' ? 'Session in progress' : 'Session logged');
            const time = `${formatClockTime(l.startedAt)}${l.endedAt ? ` - ${formatClockTime(l.endedAt)}` : ' - now'}`;
            return `<div class="log-entry" style="padding:8px 0">
              <div style="width:18px;color:${cat ? cat.color : 'var(--mute)'}">${icon(cat ? cat.icon : 'book', 14)}</div>
              <div style="flex:1;min-width:0">
                <div class="mono mute" style="font-size:11px;margin-bottom:2px">${escapeHtml(time)}</div>
                <div class="log-note">${escapeHtml(text)}</div>
              </div>
            </div>`;
          })
          .join('')
      : `<div class="mute" style="font-size:12.5px;padding:8px 0">No sessions logged this day.</div>`;

    return `
      <div class="row between" style="margin-bottom:10px">
        <div style="font-weight:600;font-size:14px">${fmtDateLong(selectedKey)}</div>
        ${day?.perfectDay ? `<span class="badge done">${icon('star', 12)} PERFECT DAY</span>` : ''}
      </div>
      ${rows || `<div class="mute" style="font-size:12.5px">No categories tracked.</div>`}
      <div style="margin-top:14px;font-weight:600;font-size:13px">Sessions</div>
      ${logsHtml}
    `;
  }

  function paint() {
    root.innerHTML = `
      <div class="view fade-in">
        <div class="view-header">
          <div>
            <h1>Calendar</h1>
            <div class="sub">Streaks, perfect days, and per-day history</div>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px">
          <div class="row between" style="margin-bottom:10px">
            <div style="font-weight:600;font-size:13px">Past year</div>
            <div class="row" style="font-size:11px" class="mute">
              <span class="mute">Less</span>
              <span class="cell" style="width:10px;height:10px;background:var(--border-soft);display:inline-block;border-radius:2px"></span>
              <span class="cell" style="width:10px;height:10px;background:rgba(74,222,128,0.45);display:inline-block;border-radius:2px"></span>
              <span class="cell" style="width:10px;height:10px;background:var(--diff-green);display:inline-block;border-radius:2px"></span>
              <span class="cell" style="width:10px;height:10px;background:var(--phosphor);display:inline-block;border-radius:2px"></span>
              <span class="mute">More</span>
            </div>
          </div>
          <div class="heatmap" id="heatmap">${buildHeatmap()}</div>
        </div>

        <div class="grid grid-cols-2">
          <div class="card">
            <div class="row between" style="margin-bottom:12px">
              <button class="btn btn-icon btn-sm" id="cal-prev">${icon('chevronLeft', 14)}</button>
              <div style="font-weight:600;font-size:13.5px" class="mono" id="cal-month-label"></div>
              <button class="btn btn-icon btn-sm" id="cal-next">${icon('chevronRight', 14)}</button>
            </div>
            <div id="month-grid-root">${buildMonthGrid()}</div>
          </div>
          <div class="card" id="day-detail">${buildDetail()}</div>
        </div>
      </div>
    `;

    root.querySelector('#cal-month-label').textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });

    root.querySelector('#cal-prev').addEventListener('click', () => {
      viewMonth -= 1;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear -= 1;
      }
      paint();
    });
    root.querySelector('#cal-next').addEventListener('click', () => {
      viewMonth += 1;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear += 1;
      }
      paint();
    });

    root.querySelectorAll('.day-cell[data-key]').forEach((cell) => {
      cell.addEventListener('click', () => {
        selectedKey = cell.dataset.key;
        paint();
      });
    });
    root.querySelectorAll('.heatmap .cell[data-key]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const key = cell.dataset.key;
        if (!key) return;
        selectedKey = key;
        viewYear = Number(key.split('-')[0]);
        viewMonth = Number(key.split('-')[1]) - 1;
        paint();
      });
    });
  }

  paint();
  const unsub = store.subscribe(paint);
  return () => unsub();
}
