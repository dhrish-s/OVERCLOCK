// views/dashboard.js - the "Today" view. Composes category-card components
// around the day's progress, plus the pulse-trace strip: a small telemetry
// readout that idles near-flat and spikes when a session starts/ends,
// scaled to coins earned. It's the one place this app spends its "signature
// animated element" budget - see DESIGN.md.

import { icon } from './../icons.js';
import { escapeHtml, greeting } from './../dom.js';
import { todayKey, progressForCategory, formatMinutesShort, xpForNextLevel, isStreakAlive } from './../logic.js';
import { openFocusModal, onSessionEvent, getActiveCategoryId } from './../timer.js';
import { showToast } from './../notifications.js';

const PULSE_SLOTS = 30;
let pulseTicks = Array.from({ length: PULSE_SLOTS }, () => 0.05 + Math.random() * 0.05);

function pushPulse(magnitude) {
  pulseTicks = [...pulseTicks.slice(1), Math.max(0.05, Math.min(1, magnitude))];
}

function renderPulseSvg() {
  const w = 760;
  const h = 56;
  const gap = w / PULSE_SLOTS;
  const bars = pulseTicks
    .map((mag, i) => {
      const barH = Math.max(2, mag * (h - 8));
      const x = i * gap + gap * 0.28;
      const y = h - barH - 4;
      const isLast = i === pulseTicks.length - 1;
      return `<rect class="${isLast && mag > 0.3 ? 'spike-anim' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(gap * 0.44).toFixed(1)}" height="${barH.toFixed(1)}" rx="1.5" fill="var(--phosphor)" opacity="${0.35 + mag * 0.65}" style="${isLast && mag > 0.3 ? 'animation:spike-pop 0.6s ease-out;' : ''}"/>`;
    })
    .join('');
  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <path class="pulse-trace-path" d="M0 ${h - 3} H${w}" stroke="var(--border)" stroke-width="1" fill="none"/>
      ${bars}
    </svg>`;
}

function statusBadge(catId, day, category) {
  const activeId = getActiveCategoryId();
  if (activeId === catId) return `<span class="badge active"><span class="pip"></span>ACTIVE</span>`;
  const prog = progressForCategory(day, category);
  if (prog.goalMet) return `<span class="badge done"><span class="pip"></span>DONE</span>`;
  return `<span class="badge idle"><span class="pip"></span>IDLE</span>`;
}

function categoryCardHtml(category, day, streak, today) {
  const prog = progressForCategory(day, category);
  const pctLabel = category.goalType === 'count' ? `${prog.count}/${category.goalValue}` : `${formatMinutesShort(prog.minutes)} / ${formatMinutesShort(category.goalValue)}`;
  const streakAlive = isStreakAlive(streak, today) && streak.current > 0;
  return `
    <div class="card category-card" data-cat-id="${category.id}">
      <div class="cat-head">
        <div class="cat-icon-wrap" style="color:${category.color}">${icon(category.icon, 19)}</div>
        <div style="flex:1;min-width:0">
          <div class="cat-name">${escapeHtml(category.name)}</div>
          <div class="cat-meta">${escapeHtml(category.countLabel)}</div>
        </div>
        <div class="cat-status">${statusBadge(category.id, day, category)}</div>
      </div>
      <div class="cat-body">
        <div class="ring-wrap">
          <svg class="progress-ring ${prog.goalMet ? 'done' : ''}" width="64" height="64" viewBox="0 0 100 100" style="--pct:${prog.pct}">
            <circle class="track" cx="50" cy="50" r="44"/>
            <circle class="fill" cx="50" cy="50" r="44" pathLength="100"/>
          </svg>
          <div class="ring-label">${Math.round(prog.pct * 100)}%</div>
        </div>
        <div style="flex:1">
          <div class="cat-progress-text">${pctLabel}</div>
          <div class="cat-streak ${streakAlive ? '' : 'dead'}">${icon('flame', 14, streakAlive ? 'flame-live' : '')}<span>${streak.current} day${streak.current === 1 ? '' : 's'}</span></div>
        </div>
      </div>
      <div class="cat-actions">
        <button class="btn btn-primary btn-block start-session-btn" data-cat-id="${category.id}">${icon('play', 14)} Start session</button>
      </div>
    </div>
  `;
}

export function render(root, store) {
  const unsubs = [];

  function paint() {
    const data = store.data;
    const today = todayKey();
    const day = data.days[today] || { categoryProgress: {}, perfectDay: false, coinsEarned: 0 };
    const cats = store.activeCategories();
    const overall = data.streaks.overall || { current: 0, longest: 0 };
    const coinsToday = day.coinsEarned || 0;
    const nextLevelXp = xpForNextLevel(data.profile.level);

    root.innerHTML = `
      <div class="view fade-in">
        <div class="view-header">
          <div>
            <h1>${greeting()}, ${escapeHtml(data.profile.displayName || 'there')}</h1>
            <div class="sub">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          </div>
          <div class="row">
            <span class="chip">${icon('flame', 14, overall.current > 0 ? 'flame-live' : '')} ${overall.current} overall streak</span>
            <span class="chip coin">${icon('coin', 14)} +${coinsToday} today</span>
          </div>
        </div>

        <div class="card" style="margin-bottom:18px;padding:10px 14px">
          <div id="pulse-trace">${renderPulseSvg()}</div>
        </div>

        <div class="grid grid-cols-2" id="category-grid"></div>

        <div class="card-raised" style="margin-top:18px" id="today-summary"></div>
      </div>
    `;

    const grid = root.querySelector('#category-grid');
    grid.innerHTML = cats
      .map((c) => categoryCardHtml(c, day, data.streaks[c.id] || { current: 0, longest: 0, lastDate: null }, today))
      .join('');

    grid.querySelectorAll('.start-session-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = store.getCategory(btn.dataset.catId);
        if (cat) openFocusModal(cat, store);
      });
    });

    const summary = root.querySelector('#today-summary');
    const allDone = cats.length > 0 && cats.every((c) => progressForCategory(day, c).goalMet);
    summary.innerHTML = `
      <div class="row between wrap">
        <div class="row">
          ${icon(day.perfectDay ? 'star' : 'shield', 18, day.perfectDay ? 'violet' : '')}
          <div>
            <div style="font-weight:600;font-size:13.5px">${day.perfectDay ? 'Perfect day - every goal met' : allDone ? 'All goals met - keep going' : 'Today\u2019s summary'}</div>
            <div class="mute" style="font-size:12px">Level ${data.profile.level} · ${data.profile.xp}/${nextLevelXp} XP · ${data.profile.coins} coins · ${data.profile.stars} stars</div>
          </div>
        </div>
        <div class="bar-track" style="width:160px"><div class="bar-fill" style="width:${Math.min(100, (data.profile.xp / nextLevelXp) * 100)}%"></div></div>
      </div>
    `;
  }

  paint();

  unsubs.push(store.subscribe(paint));
  unsubs.push(
    onSessionEvent((evt) => {
      if (evt.type === 'start') {
        pushPulse(0.25);
      } else if (evt.type === 'end') {
        const cat = store.getCategory(evt.categoryId);
        const mag = cat ? evt.result.coinsEarned / Math.max(1, cat.coinMax) : 0.5;
        pushPulse(Math.max(0.35, mag));
        if (evt.result.perfectDayJustHit) {
          showToast({ kind: 'perfect', title: 'Perfect day!', body: 'Every category goal met - +1 star.', timeout: 9000 });
        } else if (evt.result.leveledUp) {
          showToast({ kind: 'levelup', title: 'Level up!', body: `You're now level ${store.data.profile.level}.`, timeout: 9000 });
        }
      }
      paint();
    })
  );

  return () => unsubs.forEach((fn) => fn());
}
