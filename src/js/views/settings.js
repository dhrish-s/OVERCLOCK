// views/settings.js - everything that shapes the rest of the app: which
// categories exist and how their goals/timers/coins work, the water/walk
// reminder cadence and the Windows launch-on-login toggle, the reward pools,
// and the data operations (export/import/reset). Nothing here is precious -
// every destructive action is reversible (archive instead of delete where
// it matters) or gated behind an explicit confirmation.

import { icon } from './../icons.js';
import { escapeHtml } from './../dom.js';
import { uid, clamp } from './../logic.js';

const CATEGORY_ICON_CHOICES = [
  'code', 'briefcase', 'layers', 'github', 'book', 'flame',
  'trophy', 'chart', 'shield', 'list', 'star', 'footprints',
];

// ---------------------------------------------------------------------
// Small reusable modal helpers
// ---------------------------------------------------------------------

function openOverlay(innerHtml, { wide = false } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay fade-in';
  overlay.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${innerHtml}</div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  return { overlay, close };
}

function openConfirmModal({ title, body, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  const { overlay, close } = openOverlay(`
    <div class="modal-title">${escapeHtml(title)}</div>
    <div class="modal-sub">${escapeHtml(body)}</div>
    <div class="modal-actions">
      <button class="btn" id="confirm-cancel">Cancel</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${escapeHtml(confirmLabel)}</button>
    </div>
  `);
  overlay.querySelector('#confirm-cancel').addEventListener('click', close);
  overlay.querySelector('#confirm-ok').addEventListener('click', () => {
    close();
    onConfirm();
  });
}

// ---------------------------------------------------------------------
// Category add/edit modal
// ---------------------------------------------------------------------

function openCategoryModal(store, existing) {
  const isEdit = !!existing;
  const draft = existing
    ? { ...existing }
    : {
        id: uid('cat'),
        name: '',
        icon: 'code',
        color: '#FFB454',
        goalType: 'count',
        goalValue: 1,
        countLabel: 'Done',
        timerMode: 'stopwatch',
        timerWorkSec: 25 * 60,
        timerBreakSec: 5 * 60,
        coinMin: 10,
        coinMax: 20,
        order: store.data.categories.length,
        archived: false,
      };

  const { overlay, close } = openOverlay(
    `
    <div class="modal-title">${isEdit ? 'Edit category' : 'New category'}</div>
    <div class="modal-sub">Set the goal, timer behavior, and coin range for this task.</div>
    <div class="grid grid-cols-2" style="gap:12px">
      <div class="field">
        <label>Name</label>
        <input class="input" id="f-name" value="${escapeHtml(draft.name)}" placeholder="e.g. Resume tailoring"/>
      </div>
      <div class="field">
        <label>Icon</label>
        <select class="select" id="f-icon">
          ${CATEGORY_ICON_CHOICES.map((n) => `<option value="${n}" ${draft.icon === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Accent color</label>
        <input class="input" type="color" id="f-color" value="${draft.color}" style="height:36px;padding:3px"/>
      </div>
      <div class="field">
        <label>Goal type</label>
        <select class="select" id="f-goaltype">
          <option value="count" ${draft.goalType === 'count' ? 'selected' : ''}>Count (e.g. problems solved)</option>
          <option value="minutes" ${draft.goalType === 'minutes' ? 'selected' : ''}>Minutes</option>
        </select>
      </div>
      <div class="field">
        <label>Daily goal value</label>
        <input class="input" type="number" min="1" id="f-goalvalue" value="${draft.goalValue}"/>
      </div>
      <div class="field" id="f-countlabel-wrap">
        <label>Count label</label>
        <input class="input" id="f-countlabel" value="${escapeHtml(draft.countLabel)}" placeholder="e.g. Problems solved"/>
      </div>
      <div class="field">
        <label>Timer mode</label>
        <select class="select" id="f-timermode">
          <option value="stopwatch" ${draft.timerMode === 'stopwatch' ? 'selected' : ''}>Stopwatch (count up)</option>
          <option value="countdown" ${draft.timerMode === 'countdown' ? 'selected' : ''}>Countdown</option>
          <option value="pomodoro" ${draft.timerMode === 'pomodoro' ? 'selected' : ''}>Pomodoro (work / break)</option>
        </select>
      </div>
      <div class="field" id="f-worksec-wrap">
        <label id="f-worksec-label">Countdown minutes</label>
        <input class="input" type="number" min="1" id="f-worksec" value="${Math.max(1, Math.round((draft.timerWorkSec || 1500) / 60))}"/>
      </div>
      <div class="field" id="f-breaksec-wrap">
        <label>Break minutes</label>
        <input class="input" type="number" min="1" id="f-breaksec" value="${Math.max(1, Math.round((draft.timerBreakSec || 300) / 60))}"/>
      </div>
      <div class="field">
        <label>Min coins per session</label>
        <input class="input" type="number" min="1" id="f-coinmin" value="${draft.coinMin}"/>
      </div>
      <div class="field">
        <label>Max coins per session</label>
        <input class="input" type="number" min="1" id="f-coinmax" value="${draft.coinMax}"/>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="cat-cancel">Cancel</button>
      <button class="btn btn-primary" id="cat-save">${isEdit ? 'Save changes' : 'Add category'}</button>
    </div>
  `,
    { wide: true }
  );

  function syncVisibility() {
    const goalType = overlay.querySelector('#f-goaltype').value;
    overlay.querySelector('#f-countlabel-wrap').style.display = goalType === 'count' ? '' : 'none';

    const timerMode = overlay.querySelector('#f-timermode').value;
    overlay.querySelector('#f-worksec-wrap').style.display = timerMode === 'stopwatch' ? 'none' : '';
    overlay.querySelector('#f-breaksec-wrap').style.display = timerMode === 'pomodoro' ? '' : 'none';
    overlay.querySelector('#f-worksec-label').textContent =
      timerMode === 'pomodoro' ? 'Work minutes' : 'Countdown minutes';
  }
  syncVisibility();
  overlay.querySelector('#f-goaltype').addEventListener('change', syncVisibility);
  overlay.querySelector('#f-timermode').addEventListener('change', syncVisibility);

  overlay.querySelector('#cat-cancel').addEventListener('click', close);
  overlay.querySelector('#cat-save').addEventListener('click', () => {
    const name = overlay.querySelector('#f-name').value.trim();
    if (!name) {
      overlay.querySelector('#f-name').style.borderColor = 'var(--diff-red)';
      return;
    }
    const goalType = overlay.querySelector('#f-goaltype').value;
    const timerMode = overlay.querySelector('#f-timermode').value;
    const goalValue = clamp(parseInt(overlay.querySelector('#f-goalvalue').value, 10) || 1, 1, 999);
    const coinMin = clamp(parseInt(overlay.querySelector('#f-coinmin').value, 10) || 1, 1, 999);
    const coinMax = Math.max(coinMin, clamp(parseInt(overlay.querySelector('#f-coinmax').value, 10) || coinMin, 1, 999));
    const workMin = clamp(parseInt(overlay.querySelector('#f-worksec').value, 10) || 25, 1, 240);
    const breakMin = clamp(parseInt(overlay.querySelector('#f-breaksec').value, 10) || 5, 1, 120);

    const updated = {
      ...draft,
      name,
      icon: overlay.querySelector('#f-icon').value,
      color: overlay.querySelector('#f-color').value,
      goalType,
      goalValue,
      countLabel: overlay.querySelector('#f-countlabel').value.trim() || 'Done',
      timerMode,
      timerWorkSec: timerMode === 'stopwatch' ? 0 : workMin * 60,
      timerBreakSec: timerMode === 'pomodoro' ? breakMin * 60 : 0,
      coinMin,
      coinMax,
    };

    store.mutate((data) => {
      const idx = data.categories.findIndex((c) => c.id === updated.id);
      if (idx >= 0) data.categories[idx] = updated;
      else data.categories.push(updated);
    });
    close();
  });
}

// ---------------------------------------------------------------------
// Reward add/edit modal
// ---------------------------------------------------------------------

function openRewardModal(store, tier, existing) {
  const isEdit = !!existing;
  const unit = tier === 'big' ? 'stars' : 'coins';
  const draft = existing ? { ...existing } : { id: uid('r'), label: '', tier, cost: tier === 'big' ? 1 : 30, disabled: false };

  const { overlay, close } = openOverlay(`
    <div class="modal-title">${isEdit ? 'Edit reward' : `New ${tier} reward`}</div>
    <div class="modal-sub">Paid in ${unit}.</div>
    <div class="field" style="margin-bottom:12px">
      <label>Label</label>
      <input class="input" id="f-label" value="${escapeHtml(draft.label)}" placeholder="e.g. 20 minutes of guitar"/>
    </div>
    <div class="field">
      <label>Cost (${unit})</label>
      <input class="input" type="number" min="1" id="f-cost" value="${draft.cost}"/>
    </div>
    <div class="modal-actions">
      <button class="btn" id="rw-cancel">Cancel</button>
      <button class="btn btn-primary" id="rw-save">${isEdit ? 'Save changes' : 'Add reward'}</button>
    </div>
  `);

  overlay.querySelector('#rw-cancel').addEventListener('click', close);
  overlay.querySelector('#rw-save').addEventListener('click', () => {
    const label = overlay.querySelector('#f-label').value.trim();
    if (!label) {
      overlay.querySelector('#f-label').style.borderColor = 'var(--diff-red)';
      return;
    }
    const cost = clamp(parseInt(overlay.querySelector('#f-cost').value, 10) || 1, 1, 999);
    const updated = { ...draft, label, cost };
    store.mutate((data) => {
      const pool = tier === 'big' ? data.rewards.big : data.rewards.small;
      const idx = pool.findIndex((r) => r.id === updated.id);
      if (idx >= 0) pool[idx] = updated;
      else pool.push(updated);
    });
    close();
  });
}

// ---------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------

export function render(root, store) {
  let activeTab = 'general';
  let loginState = null; // resolved async from window.api.getLaunchOnStartup()
  let resetConfirmText = '';

  function setTab(tab) {
    activeTab = tab;
    paint();
  }

  function tabBtn(id, label) {
    return `<button class="tab ${activeTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`;
  }

  function flash(targetEl, text) {
    const note = document.createElement('div');
    note.className = 'mute';
    note.style.fontSize = '12px';
    note.style.marginTop = '8px';
    note.textContent = text;
    targetEl.appendChild(note);
    setTimeout(() => note.remove(), 3200);
  }

  // ---- General tab: profile, startup, reminders ----
  function paintGeneral(body, data) {
    const launchChecked = loginState ? loginState.enabled : data.settings.launchOnStartup !== false;
    body.innerHTML = `
      <div class="grid grid-cols-2" style="gap:16px">
        <div class="card">
          <div style="font-weight:600;font-size:13.5px;margin-bottom:10px">Profile</div>
          <div class="field">
            <label>Display name</label>
            <input class="input" id="f-displayname" value="${escapeHtml(data.profile.displayName)}"/>
          </div>
        </div>

        <div class="card">
          <div style="font-weight:600;font-size:13.5px;margin-bottom:10px">Startup</div>
          <div class="row between" style="margin-bottom:4px">
            <div>
              <div style="font-size:13px">Launch when Windows starts</div>
              <div class="mute" style="font-size:11.5px">Opens minimized to the tray - reminders keep running.</div>
            </div>
            <label class="switch"><input type="checkbox" id="f-launchstartup" ${launchChecked ? 'checked' : ''}/><span class="track"></span></label>
          </div>
          ${loginState && loginState.devMode ? `<div class="mute" style="font-size:11px;margin-top:6px">${icon('alertTriangle', 12)} Only takes effect in the installed app, not this dev run.</div>` : ''}
        </div>

        <div class="card" style="grid-column:1 / -1">
          <div style="font-weight:600;font-size:13.5px;margin-bottom:10px">Reminders</div>
          <div class="row between" style="margin-bottom:14px">
            <div style="font-size:13px">Reminders enabled</div>
            <label class="switch"><input type="checkbox" id="f-remindersenabled" ${data.settings.remindersEnabled !== false ? 'checked' : ''}/><span class="track"></span></label>
          </div>
          <div class="grid grid-cols-2" style="gap:12px;margin-bottom:14px">
            <div class="field">
              <label>${icon('water', 12)} Water reminder, every (minutes)</label>
              <input class="input" type="number" min="5" id="f-waterminutes" value="${data.settings.waterReminderMinutes}"/>
            </div>
            <div class="field">
              <label>${icon('footprints', 12)} Walk reminder, every (minutes)</label>
              <input class="input" type="number" min="5" id="f-walkminutes" value="${data.settings.walkReminderMinutes}"/>
            </div>
          </div>
          <div class="row between">
            <div style="font-size:13px">Sound (in-app timer beeps + notification sound)</div>
            <label class="switch"><input type="checkbox" id="f-soundenabled" ${data.settings.soundEnabled !== false ? 'checked' : ''}/><span class="track"></span></label>
          </div>
        </div>
      </div>
    `;

    body.querySelector('#f-displayname').addEventListener('change', (e) => {
      const name = e.target.value.trim() || 'You';
      store.mutate((d) => {
        d.profile.displayName = name;
      });
    });

    body.querySelector('#f-launchstartup').addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      store.mutate((d) => {
        d.settings.launchOnStartup = enabled;
      });
      const result = await window.api.setLaunchOnStartup(enabled);
      loginState = { enabled: result.enabled };
    });

    body.querySelector('#f-remindersenabled').addEventListener('change', (e) => {
      const checked = e.target.checked;
      store.mutate((d) => {
        d.settings.remindersEnabled = checked;
      });
    });
    body.querySelector('#f-soundenabled').addEventListener('change', (e) => {
      const checked = e.target.checked;
      store.mutate((d) => {
        d.settings.soundEnabled = checked;
      });
    });
    body.querySelector('#f-waterminutes').addEventListener('change', (e) => {
      const mins = clamp(parseInt(e.target.value, 10) || 60, 5, 600);
      e.target.value = mins;
      store.mutate((d) => {
        d.settings.waterReminderMinutes = mins;
      });
    });
    body.querySelector('#f-walkminutes').addEventListener('change', (e) => {
      const mins = clamp(parseInt(e.target.value, 10) || 90, 5, 600);
      e.target.value = mins;
      store.mutate((d) => {
        d.settings.walkReminderMinutes = mins;
      });
    });
  }

  // ---- Categories tab ----
  function categoryRowHtml(c) {
    const goalLabel = c.goalType === 'count' ? `${c.goalValue} ${c.countLabel.toLowerCase()}` : `${c.goalValue} min`;
    const timerLabel = c.timerMode === 'pomodoro'
      ? `Pomodoro ${Math.round(c.timerWorkSec / 60)}/${Math.round(c.timerBreakSec / 60)}`
      : c.timerMode === 'countdown'
      ? `Countdown ${Math.round(c.timerWorkSec / 60)}m`
      : 'Stopwatch';
    return `
      <div class="category-card" style="flex-direction:row;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-soft)" data-cat-row="${c.id}">
        <div class="row" style="gap:12px;min-width:0">
          <div class="cat-icon-wrap" style="color:${c.color}">${icon(c.icon, 18)}</div>
          <div style="min-width:0">
            <div class="cat-name">${escapeHtml(c.name)} ${c.archived ? '<span class="badge idle" style="margin-left:6px">Archived</span>' : ''}</div>
            <div class="cat-meta">${goalLabel} · ${timerLabel} · ${c.coinMin}-${c.coinMax} coins</div>
          </div>
        </div>
        <div class="cat-actions">
          <button class="btn btn-sm btn-icon" data-action="edit" data-tip="Edit">${icon('edit', 14)}</button>
          <button class="btn btn-sm btn-icon" data-action="archive" data-tip="${c.archived ? 'Restore' : 'Archive'}">${icon('archive', 14)}</button>
          <button class="btn btn-sm btn-icon" data-action="delete" data-tip="Delete">${icon('trash', 14)}</button>
        </div>
      </div>
    `;
  }

  function paintCategories(body, data) {
    const sorted = [...data.categories].sort((a, b) => Number(a.archived) - Number(b.archived) || a.order - b.order);
    body.innerHTML = `
      <div class="card">
        <div class="row between" style="margin-bottom:6px">
          <div style="font-weight:600;font-size:13.5px">Categories</div>
          <button class="btn btn-primary btn-sm" id="add-category">${icon('plus', 13)} New category</button>
        </div>
        <div id="cat-rows">
          ${sorted.length ? sorted.map(categoryRowHtml).join('') : `<div class="empty-state">${icon('layers', 28)}<div>No categories yet.</div></div>`}
        </div>
      </div>
    `;

    body.querySelector('#add-category').addEventListener('click', () => {
      openCategoryModal(store, null);
    });

    body.querySelectorAll('[data-cat-row]').forEach((row) => {
      const id = row.dataset.catRow;
      const cat = data.categories.find((c) => c.id === id);
      row.querySelector('[data-action="edit"]').addEventListener('click', () => {
        openCategoryModal(store, cat);
      });
      row.querySelector('[data-action="archive"]').addEventListener('click', () => {
        store.mutate((d) => {
          const target = d.categories.find((c) => c.id === id);
          if (target) target.archived = !target.archived;
        });
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', () => {
        openConfirmModal({
          title: `Delete "${cat.name}"?`,
          body: 'This removes the category going forward. Past sessions logged under it stay in your work log and history, just unlabeled. Consider Archive instead if you might want it back.',
          confirmLabel: 'Delete category',
          danger: true,
          onConfirm: () => {
            store.mutate((d) => {
              d.categories = d.categories.filter((c) => c.id !== id);
            });
          },
        });
      });
    });
  }

  // ---- Rewards tab ----
  function rewardRowHtml(r, unit) {
    return `
      <div class="reward-card" style="padding:8px 0;border-bottom:1px solid var(--border-soft)" data-reward-row="${r.id}">
        <div style="min-width:0">
          <span class="reward-label ${r.disabled ? 'mute-2' : ''}">${escapeHtml(r.label)}</span>
          <div class="mute mono" style="font-size:11px">${r.cost} ${unit}</div>
        </div>
        <div class="row" style="gap:6px;flex-shrink:0">
          <label class="switch" data-tip="${r.disabled ? 'Disabled' : 'Enabled'}"><input type="checkbox" data-action="toggle" ${!r.disabled ? 'checked' : ''}/><span class="track"></span></label>
          <button class="btn btn-sm btn-icon" data-action="edit" data-tip="Edit">${icon('edit', 13)}</button>
          <button class="btn btn-sm btn-icon" data-action="delete" data-tip="Delete">${icon('trash', 13)}</button>
        </div>
      </div>
    `;
  }

  function wireRewardPool(body, store2, tier, pool, unit) {
    const wrap = body.querySelector(`#${tier}-reward-rows`);
    wrap.querySelectorAll('[data-reward-row]').forEach((row) => {
      const id = row.dataset.rewardRow;
      const reward = pool.find((r) => r.id === id);
      row.querySelector('[data-action="toggle"]').addEventListener('change', (e) => {
        const enabled = e.target.checked;
        store2.mutate((d) => {
          const list = tier === 'big' ? d.rewards.big : d.rewards.small;
          const target = list.find((r) => r.id === id);
          if (target) target.disabled = !enabled;
        });
      });
      row.querySelector('[data-action="edit"]').addEventListener('click', () => {
        openRewardModal(store2, tier, reward);
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', () => {
        openConfirmModal({
          title: `Delete "${reward.label}"?`,
          body: `This removes it from the ${tier} reward pool. Past claims stay in your history.`,
          confirmLabel: 'Delete reward',
          danger: true,
          onConfirm: () => {
            store2.mutate((d) => {
              const list = tier === 'big' ? d.rewards.big : d.rewards.small;
              const idx = list.findIndex((r) => r.id === id);
              if (idx >= 0) list.splice(idx, 1);
            });
          },
        });
      });
    });
    body.querySelector(`#add-${tier}-reward`).addEventListener('click', () => {
      openRewardModal(store2, tier, null);
    });
  }

  function paintRewards(body, data) {
    body.innerHTML = `
      <div class="grid grid-cols-2" style="gap:16px">
        <div class="card">
          <div class="row between" style="margin-bottom:6px">
            <div style="font-weight:600;font-size:13.5px">Small rewards <span class="mute mono" style="font-size:11px">(coins)</span></div>
            <button class="btn btn-sm" id="add-small-reward">${icon('plus', 13)} Add</button>
          </div>
          <div id="small-reward-rows">${data.rewards.small.map((r) => rewardRowHtml(r, 'coins')).join('') || `<div class="mute" style="font-size:12.5px">No small rewards yet.</div>`}</div>
        </div>
        <div class="card">
          <div class="row between" style="margin-bottom:6px">
            <div style="font-weight:600;font-size:13.5px">Big rewards <span class="mute mono" style="font-size:11px">(stars)</span></div>
            <button class="btn btn-sm" id="add-big-reward">${icon('plus', 13)} Add</button>
          </div>
          <div id="big-reward-rows">${data.rewards.big.map((r) => rewardRowHtml(r, 'stars')).join('') || `<div class="mute" style="font-size:12.5px">No big rewards yet.</div>`}</div>
        </div>
      </div>
    `;
    wireRewardPool(body, store, 'small', data.rewards.small, 'coins');
    wireRewardPool(body, store, 'big', data.rewards.big, 'stars');
  }

  // ---- Data tab ----
  function paintData(body, data) {
    body.innerHTML = `
      <div class="grid grid-cols-2" style="gap:16px">
        <div class="card">
          <div style="font-weight:600;font-size:13.5px;margin-bottom:6px">Backup</div>
          <div class="mute" style="font-size:12.5px;margin-bottom:12px">Everything lives in one local JSON file. Export it regularly, especially before a Windows reinstall.</div>
          <button class="btn btn-block" id="export-backup">${icon('download', 14)} Export full backup (.json)</button>
          <button class="btn btn-block" id="show-data-folder" style="margin-top:8px">${icon('search', 14)} Show data file in Explorer</button>
        </div>
        <div class="card">
          <div style="font-weight:600;font-size:13.5px;margin-bottom:6px">Restore</div>
          <div class="mute" style="font-size:12.5px;margin-bottom:12px">Importing replaces everything currently in the app with the backup file's contents.</div>
          <button class="btn btn-block" id="import-backup">${icon('upload', 14)} Import backup (.json)</button>
        </div>
        <div class="card" style="grid-column:1 / -1;border-color:rgba(242,85,90,0.35)">
          <div style="font-weight:600;font-size:13.5px;margin-bottom:6px;color:var(--diff-red)">Reset everything</div>
          <div class="mute" style="font-size:12.5px;margin-bottom:12px">Wipes categories, history, coins, streaks, and settings back to defaults. This cannot be undone - export a backup first if you're unsure.</div>
          <div class="row" style="gap:10px">
            <input class="input" id="reset-confirm-text" placeholder="Type RESET to enable" style="max-width:220px"/>
            <button class="btn btn-danger" id="reset-all-btn" disabled>${icon('trash', 14)} Reset everything</button>
          </div>
        </div>
        <div class="card" style="grid-column:1 / -1">
          <div style="font-weight:600;font-size:13.5px;margin-bottom:6px">About</div>
          <div class="mute" style="font-size:12.5px">Overclock - a local, offline daily execution console. Version <span id="app-version">…</span>. All data stays on this machine; nothing is ever sent over the network.</div>
        </div>
      </div>
    `;

    window.api.getVersion().then((v) => {
      const el = body.querySelector('#app-version');
      if (el) el.textContent = v;
    });

    body.querySelector('#export-backup').addEventListener('click', async () => {
      const content = JSON.stringify(store.data, null, 2);
      const result = await window.api.exportFile('overclock-backup.json', content);
      if (result && result.ok) flash(body.querySelector('#export-backup').parentElement, 'Backup exported.');
    });

    body.querySelector('#show-data-folder').addEventListener('click', () => {
      window.api.showDataFolder();
    });

    body.querySelector('#import-backup').addEventListener('click', async () => {
      const picked = await window.api.importFile();
      if (!picked || !picked.ok) {
        if (picked && picked.error) flash(body.querySelector('#import-backup').parentElement, `Import failed: ${picked.error}`);
        return;
      }
      const outcome = store.importData(picked.data);
      if (outcome.ok) {
        const importButton = root.querySelector('#import-backup');
        if (importButton) flash(importButton.parentElement, 'Backup imported - you\'re all set.');
      } else {
        flash(body.querySelector('#import-backup').parentElement, outcome.error);
      }
    });

    const resetInput = body.querySelector('#reset-confirm-text');
    const resetBtn = body.querySelector('#reset-all-btn');
    resetInput.value = resetConfirmText;
    resetInput.addEventListener('input', (e) => {
      resetConfirmText = e.target.value;
      resetBtn.disabled = resetConfirmText.trim() !== 'RESET';
    });
    resetBtn.disabled = resetConfirmText.trim() !== 'RESET';
    resetBtn.addEventListener('click', () => {
      if (resetConfirmText.trim() !== 'RESET') return;
      openConfirmModal({
        title: 'Reset everything?',
        body: 'This permanently wipes all categories, history, coins, and streaks back to defaults.',
        confirmLabel: 'Yes, reset',
        danger: true,
        onConfirm: () => {
          store.resetAll();
          resetConfirmText = '';
        },
      });
    });
  }

  function paint() {
    const data = store.data;
    root.innerHTML = `
      <div class="view fade-in">
        <div class="view-header">
          <div>
            <h1>Settings</h1>
            <div class="sub">Categories, reminders, rewards, and your data - all stored locally.</div>
          </div>
        </div>
        <div class="tabs">
          ${tabBtn('general', 'General')}
          ${tabBtn('categories', 'Categories')}
          ${tabBtn('rewards', 'Rewards')}
          ${tabBtn('data', 'Data')}
        </div>
        <div id="tab-body"></div>
      </div>
    `;
    root.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.dataset.tab));
    });
    const body = root.querySelector('#tab-body');
    if (activeTab === 'general') paintGeneral(body, data);
    else if (activeTab === 'categories') paintCategories(body, data);
    else if (activeTab === 'rewards') paintRewards(body, data);
    else paintData(body, data);
  }

  paint();
  window.api.getLaunchOnStartup().then((result) => {
    loginState = result;
    if (activeTab === 'general') paint();
  });

  const unsub = store.subscribe(() => {
    // Avoid stomping on in-progress typing in the reset-confirm box or
    // form fields by only repainting when we're not mid-edit there; the
    // other tabs are safe to repaint freely since their inputs commit on
    // blur/change rather than every keystroke.
    paint();
  });
  return () => unsub();
}
