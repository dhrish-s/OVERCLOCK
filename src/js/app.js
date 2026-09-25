// app.js - entry point. Boots the store, builds the app-shell chrome
// (titlebar + nav rail) once, then routes between the six views. Every
// view module exports render(root, store) and returns a cleanup function;
// the router always calls the previous view's cleanup before mounting the
// next one so store subscriptions never pile up.

import { store } from './state.js';
import { icon } from './icons.js';
import { initReminderBridge } from './notifications.js';
import { formatDuration } from './logic.js';
import { getActiveSessionInfo, onSessionEvent, restoreActiveSession, resumeActiveSession } from './timer.js';

import { render as renderDashboard } from './views/dashboard.js';
import { render as renderCalendar } from './views/calendar.js';
import { render as renderRewards } from './views/rewards.js';
import { render as renderWorklog } from './views/worklog.js';
import { render as renderStats } from './views/stats.js';
import { render as renderSettings } from './views/settings.js';

const ROUTES = [
  { id: 'dashboard', label: 'Today', iconName: 'home', render: renderDashboard },
  { id: 'calendar', label: 'Calendar', iconName: 'calendar', render: renderCalendar },
  { id: 'rewards', label: 'Rewards', iconName: 'gift', render: renderRewards },
  { id: 'worklog', label: 'Log', iconName: 'book', render: renderWorklog },
  { id: 'stats', label: 'Stats', iconName: 'chart', render: renderStats },
  { id: 'settings', label: 'Settings', iconName: 'settings', render: renderSettings },
];

let currentRouteId = 'dashboard';
let currentCleanup = null;
let activeSessionTicker = null;

function buildShell() {
  document.body.innerHTML = `
    <div id="app-shell">
      <div id="titlebar">
        <div class="brand"><span class="dot"></span>OVERCLOCK</div>
        <div class="spacer"></div>
        <div class="active-session-mini hidden" id="active-session-mini">
          ${icon('pulse', 13)}
          <span class="active-session-name"></span>
          <span class="active-session-time mono"></span>
        </div>
        <div class="header-stat" id="stat-level" data-tip="Level">${icon('trophy', 13)}<span></span></div>
        <div class="header-stat" id="stat-coins" data-tip="Coins">${icon('coin', 13)}<span></span></div>
        <div class="header-stat" id="stat-stars" data-tip="Stars">${icon('star', 13)}<span></span></div>
        <div class="header-stat" id="stat-streak" data-tip="Overall streak">${icon('flame', 13)}<span></span></div>
        <div class="win-controls">
          <button class="win-btn" id="win-min" aria-label="Minimize">${icon('minimizeWin', 13)}</button>
          <button class="win-btn" id="win-max" aria-label="Maximize">${icon('maximizeWin', 13)}</button>
          <button class="win-btn close" id="win-close" aria-label="Close">${icon('x', 13)}</button>
        </div>
      </div>
      <div id="main-row">
        <div id="nav-rail"></div>
        <div id="view-root"></div>
      </div>
    </div>
  `;

  document.getElementById('win-min').addEventListener('click', () => window.api.minimizeWindow());
  document.getElementById('win-max').addEventListener('click', () => window.api.maximizeWindow());
  document.getElementById('win-close').addEventListener('click', () => window.api.closeWindow());
  document.getElementById('active-session-mini').addEventListener('click', () => resumeActiveSession(store));

  renderNav();
  updateHeaderStats();
}

function updateActiveSessionMini() {
  const mini = document.getElementById('active-session-mini');
  if (!mini) return;
  const session = getActiveSessionInfo();
  mini.classList.toggle('hidden', !session);
  if (!session) return;
  const elapsedSec = session.elapsedSec ?? Math.max(0, Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000));
  mini.querySelector('.active-session-name').textContent = session.intent || session.categoryName;
  mini.querySelector('.active-session-time').textContent = formatDuration(elapsedSec);
  mini.dataset.tip = session.intent ? session.categoryName : 'Current active session';
}

function syncActiveSessionTicker() {
  if (activeSessionTicker) clearInterval(activeSessionTicker);
  activeSessionTicker = getActiveSessionInfo() && !document.hidden ? setInterval(updateActiveSessionMini, 5000) : null;
}

function renderNav() {
  const rail = document.getElementById('nav-rail');
  rail.innerHTML = '';
  ROUTES.forEach((route) => {
    if (route.id === 'settings') {
      const spacer = document.createElement('div');
      spacer.className = 'nav-spacer';
      rail.appendChild(spacer);
    }
    const btn = document.createElement('button');
    btn.className = `nav-item ${route.id === currentRouteId ? 'active' : ''}`;
    btn.innerHTML = `${icon(route.iconName, 20)}<span class="label">${route.label}</span>`;
    btn.addEventListener('click', () => navigate(route.id));
    rail.appendChild(btn);
  });
}

function updateHeaderStats() {
  const data = store.data;
  const set = (id, text) => {
    const node = document.querySelector(`#${id} span`);
    if (node) node.textContent = text;
  };
  set('stat-level', `Lvl ${data.profile.level}`);
  set('stat-coins', data.profile.coins);
  set('stat-stars', data.profile.stars);
  set('stat-streak', (data.streaks.overall && data.streaks.overall.current) || 0);
}

function navigate(routeId) {
  const route = ROUTES.find((r) => r.id === routeId) || ROUTES[0];
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  currentRouteId = route.id;
  renderNav();
  const viewRoot = document.getElementById('view-root');
  viewRoot.innerHTML = '';
  currentCleanup = route.render(viewRoot, store);
  viewRoot.scrollTop = 0;
}

async function init() {
  await store.init();
  restoreActiveSession(store);
  buildShell();
  store.subscribe(updateHeaderStats);
  onSessionEvent(() => {
    updateActiveSessionMini();
    syncActiveSessionTicker();
  });
  document.addEventListener('visibilitychange', () => {
    updateActiveSessionMini();
    syncActiveSessionTicker();
  });
  updateActiveSessionMini();
  initReminderBridge();
  navigate('dashboard');
}

init().catch((err) => {
  console.error('[overclock] fatal init error:', err);
  document.body.innerHTML = `
    <div style="height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0e13;color:#e7e9ee;font-family:'Segoe UI',system-ui,sans-serif;padding:40px;text-align:center">
      <div>
        <div style="font-size:18px;font-weight:600;margin-bottom:8px">Overclock failed to start</div>
        <div style="color:#80889b;font-size:13px;font-family:Consolas,monospace">${String(err && err.message ? err.message : err)}</div>
      </div>
    </div>
  `;
});
