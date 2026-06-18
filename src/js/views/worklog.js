// views/worklog.js - every note left at the end of a focus session, in one
// place: searchable, filterable by category, exportable to CSV via the
// main process's native save dialog (the renderer never touches the
// filesystem directly - see preload.js).

import { icon } from './../icons.js';
import { escapeHtml, fmtDateShort, debounce } from './../dom.js';

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function render(root, store) {
  let search = '';
  let categoryFilter = 'all';

  function filtered() {
    const data = store.data;
    return data.worklog.filter((l) => {
      if (categoryFilter !== 'all' && l.categoryId !== categoryFilter) return false;
      if (search && !l.note.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }

  function paint() {
    const data = store.data;
    const cats = store.activeCategories();
    const entries = filtered();

    root.innerHTML = `
      <div class="view fade-in">
        <div class="view-header">
          <div>
            <h1>Work Log</h1>
            <div class="sub">${data.worklog.length} entr${data.worklog.length === 1 ? 'y' : 'ies'} total</div>
          </div>
          <button class="btn" id="export-log">${icon('download', 14)} Export CSV</button>
        </div>

        <div class="card-tight row wrap" style="margin-bottom:14px;gap:10px">
          <div class="field" style="flex:1;min-width:200px">
            <input class="input" id="log-search" placeholder="Search notes..." value="${escapeHtml(search)}"/>
          </div>
          <div class="field" style="min-width:180px">
            <select class="select" id="log-cat-filter">
              <option value="all">All categories</option>
              ${cats.map((c) => `<option value="${c.id}" ${categoryFilter === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="card" id="log-list">
          ${
            entries.length
              ? entries
                  .map((l) => {
                    const cat = store.getCategory(l.categoryId);
                    return `<div class="log-entry">
                      <div class="log-date mono">${fmtDateShort(l.date)}</div>
                      <div style="flex:1;min-width:0">
                        <div class="log-tag" style="color:${cat ? cat.color : 'var(--mute)'}">${icon(cat ? cat.icon : 'book', 12)}<span>${escapeHtml(cat ? cat.name : 'Unknown')}</span></div>
                        <div class="log-note">${escapeHtml(l.note)}</div>
                      </div>
                    </div>`;
                  })
                  .join('')
              : `<div class="empty-state">${icon('book', 30)}<div>No entries match yet.</div><div class="mute-2" style="font-size:12px">Notes you leave at the end of a session show up here.</div></div>`
          }
        </div>
      </div>
    `;

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
    root.querySelector('#export-log').addEventListener('click', async () => {
      const rows = [['date', 'category', 'note'].map(csvEscape).join(',')];
      for (const l of data.worklog) {
        const cat = store.getCategory(l.categoryId);
        rows.push([l.date, cat ? cat.name : l.categoryId, l.note].map(csvEscape).join(','));
      }
      const content = rows.join('\n');
      const result = await window.api.exportFile('overclock-worklog.csv', content);
      if (result && result.ok) {
        root.querySelector('#export-log').innerHTML = `${icon('check', 14)} Exported`;
        setTimeout(() => paint(), 1600);
      }
    });
  }

  paint();
  const unsub = store.subscribe(paint);
  return () => unsub();
}
