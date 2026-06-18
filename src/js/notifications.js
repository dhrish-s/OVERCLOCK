// notifications.js - renders the in-app toast stack. The main process
// already fires a native Windows toast for water/walk reminders even when
// the window is hidden in the tray; this module is the *in-window* echo of
// that, plus the place celebration events (perfect day, level-up) surface
// from, so the user doesn't need to be looking at the exact card that
// changed to notice something happened.

import { icon } from './icons.js';

let stackEl = null;
let unsubscribeReminder = null;

function ensureStack() {
  if (stackEl) return stackEl;
  stackEl = document.createElement('div');
  stackEl.className = 'toast-stack';
  document.body.appendChild(stackEl);
  return stackEl;
}

const ICONS_BY_KIND = {
  water: 'water',
  walk: 'footprints',
  perfect: 'star',
  levelup: 'trophy',
  reward: 'gift',
  info: 'bell',
};

export function showToast({ kind = 'info', title, body, timeout = 8000 }) {
  const root = ensureStack();
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `
    <div class="toast-icon">${icon(ICONS_BY_KIND[kind] || 'bell', 18)}</div>
    <div style="min-width:0">
      <div class="toast-title"></div>
      <div class="toast-body"></div>
    </div>
    <button class="toast-close" aria-label="Dismiss">${icon('x', 14)}</button>
  `;
  node.querySelector('.toast-title').textContent = title || '';
  node.querySelector('.toast-body').textContent = body || '';
  node.querySelector('.toast-close').addEventListener('click', () => node.remove());
  root.appendChild(node);
  if (timeout) setTimeout(() => node.remove(), timeout);
  return node;
}

/** Wire the main process's reminder IPC into the toast stack. Call once at
 * app startup; safe to call again (it tears down the previous listener). */
export function initReminderBridge() {
  if (unsubscribeReminder) unsubscribeReminder();
  unsubscribeReminder = window.api.onReminder((payload) => {
    showToast({ kind: payload.kind, title: payload.title, body: payload.body, timeout: 12000 });
  });
}
