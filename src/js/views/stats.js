// views/stats.js - every chart here is a plain inline <svg> built from
// template strings. No chart library: this app ships zero runtime npm
// dependencies beyond Electron itself (see DESIGN.md), and these charts
// are simple enough that hand-rolling them keeps that true without
// sacrificing anything visually.

import { escapeHtml } from './../dom.js';
import { addDays, todayKey, formatMinutesShort } from './../logic.js';

function coinsBarChart(data, days = 14) {
  const today = todayKey();
  const keys = [];
  for (let i = days - 1; i >= 0; i--) keys.push(addDays(today, -i));
  const values = keys.map((k) => data.days[k]?.coinsEarned || 0);
  const max = Math.max(1, ...values);

  const w = 700;
  const h = 160;
  const padBottom = 22;
  const barW = (w / days) * 0.62;
  const gap = w / days;

  const bars = values
    .map((v, i) => {
      const barH = (v / max) * (h - padBottom - 6);
      const x = i * gap + (gap - barW) / 2;
      const y = h - padBottom - barH;
      const isToday = keys[i] === today;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, barH).toFixed(1)}" rx="2" fill="${isToday ? 'var(--phosphor)' : 'var(--violet)'}" opacity="${isToday ? 1 : 0.75}"/>`;
    })
    .join('');

  const labels = keys
    .map((k, i) => {
      if (i % Math.ceil(days / 7) !== 0) return '';
      const x = i * gap + gap / 2;
      const d = Number(k.split('-')[2]);
      return `<text x="${x.toFixed(1)}" y="${h - 5}" font-size="9.5" fill="var(--mute)" text-anchor="middle" font-family="var(--font-mono)">${d}</text>`;
    })
    .join('');

  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <line x1="0" y1="${h - padBottom}" x2="${w}" y2="${h - padBottom}" stroke="var(--border)" stroke-width="1"/>
    ${bars}${labels}
  </svg>`;
}

function categoryTimeChart(data, categories, days = 7) {
  const today = todayKey();
  const keys = [];
  for (let i = days - 1; i >= 0; i--) keys.push(addDays(today, -i));

  const totals = categories.map((c) => {
    const minutes = keys.reduce((sum, k) => sum + (data.days[k]?.categoryProgress?.[c.id]?.minutes || 0), 0);
    return { category: c, minutes };
  });
  const max = Math.max(1, ...totals.map((t) => t.minutes));

  return totals
    .map(({ category, minutes }) => {
      const pct = Math.min(100, (minutes / max) * 100);
      return `
        <div style="margin-bottom:10px">
          <div class="row between" style="margin-bottom:4px">
            <span style="font-size:12.5px">${escapeHtml(category.name)}</span>
            <span class="mono mute" style="font-size:11.5px">${formatMinutesShort(minutes)}</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${category.color}"></div></div>
        </div>`;
    })
    .join('');
}

export function render(root, store) {
  function paint() {
    const data = store.data;
    const cats = store.activeCategories();
    const dayKeys = Object.keys(data.days);
    const totalCoinsAllTime = dayKeys.reduce((sum, k) => sum + (data.days[k].coinsEarned || 0), 0);
    const totalSessions = dayKeys.reduce(
      (sum, k) => sum + Object.values(data.days[k].categoryProgress || {}).reduce((s, p) => s + (p.sessions?.length || 0), 0),
      0
    );

    root.innerHTML = `
      <div class="view fade-in">
        <div class="view-header">
          <div>
            <h1>Stats</h1>
            <div class="sub">Trends across your tracked history</div>
          </div>
        </div>

        <div class="grid grid-cols-4" style="margin-bottom:16px">
          <div class="card-tight"><div class="mute" style="font-size:11.5px">Overall streak</div><div class="mono" style="font-size:20px">${data.streaks.overall?.current || 0}</div></div>
          <div class="card-tight"><div class="mute" style="font-size:11.5px">Longest streak</div><div class="mono" style="font-size:20px">${data.streaks.overall?.longest || 0}</div></div>
          <div class="card-tight"><div class="mute" style="font-size:11.5px">Total sessions</div><div class="mono" style="font-size:20px">${totalSessions}</div></div>
          <div class="card-tight"><div class="mute" style="font-size:11.5px">Lifetime coins</div><div class="mono" style="font-size:20px">${totalCoinsAllTime}</div></div>
        </div>

        <div class="card" style="margin-bottom:16px">
          <div style="font-weight:600;font-size:13.5px;margin-bottom:8px">Coins earned - last 14 days</div>
          ${coinsBarChart(data)}
        </div>

        <div class="card">
          <div style="font-weight:600;font-size:13.5px;margin-bottom:10px">Time by category - last 7 days</div>
          ${cats.length ? categoryTimeChart(data, cats) : '<div class="mute" style="font-size:12.5px">No categories tracked.</div>'}
        </div>
      </div>
    `;
  }

  paint();
  const unsub = store.subscribe(paint);
  return () => unsub();
}
