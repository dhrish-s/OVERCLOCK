// logic.js - pure functions only. No `window`, no `document`, no IPC.
// Anything that decides game-rules math lives here so it can be unit
// tested in plain Node (see /test/logic.test.mjs) instead of trusted on
// faith inside a renderer.

/** Local YYYY-MM-DD key for a Date - never UTC, so "today" matches the
 * user's wall clock, not GMT. */
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const dt = keyToDate(key);
  dt.setDate(dt.getDate() + n);
  return dateKey(dt);
}

/** b - a, in whole days. */
export function diffDays(keyA, keyB) {
  const a = keyToDate(keyA);
  const b = keyToDate(keyB);
  return Math.round((b - a) / 86400000);
}

export function todayKey() {
  return dateKey(new Date());
}

export function dayBounds(key) {
  const start = keyToDate(key);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function dateKeyFromIso(iso) {
  if (!iso) return todayKey();
  return dateKey(new Date(iso));
}

export function formatClockTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function monthMatrix(year, monthIndex) {
  // Returns a 6x7 grid of date keys (or null for padding cells) for a
  // standard month calendar, Sunday-first.
  const first = new Date(year, monthIndex, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(dateKey(new Date(year, monthIndex, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/**
 * Roll a streak forward for "today" given whether the goal was met.
 * - Same-day re-evaluation is a no-op (idempotent: safe to call many
 *   times in one day as progress comes in).
 * - A one-day gap simply increments.
 * - A larger gap breaks the streak back to 1, unless enough streak
 *   shields are available to silently cover every missed day in between.
 */
export function updateStreakForToday(streak, today, goalMet, shieldsAvailable = 0) {
  const s = {
    current: streak?.current || 0,
    longest: streak?.longest || 0,
    lastDate: streak?.lastDate || null,
  };
  let shieldsUsed = 0;

  if (!goalMet) {
    return { streak: s, shieldsUsed };
  }

  if (!s.lastDate) {
    s.current = 1;
  } else {
    const gap = diffDays(s.lastDate, today);
    if (gap <= 0) {
      // already counted today (or a clock oddity) - no change
    } else if (gap === 1) {
      s.current += 1;
    } else {
      const missedDays = gap - 1;
      if (shieldsAvailable >= missedDays) {
        shieldsUsed = missedDays;
        s.current += 1;
      } else {
        s.current = 1;
      }
    }
  }

  s.lastDate = today;
  s.longest = Math.max(s.longest, s.current);
  return { streak: s, shieldsUsed };
}

/** If a streak's lastDate is older than yesterday and we're just viewing
 * (not logging) it, the streak is effectively broken for display purposes
 * even though we don't mutate state until the user acts. */
export function isStreakAlive(streak, today) {
  if (!streak || !streak.lastDate) return false;
  const gap = diffDays(streak.lastDate, today);
  return gap <= 1;
}

export function xpForNextLevel(level) {
  return 100 + (level - 1) * 50;
}

export function applyXp(profile, amount) {
  let { level, xp } = profile;
  xp += amount;
  let leveledUp = false;
  while (xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level);
    level += 1;
    leveledUp = true;
  }
  return { level, xp, leveledUp };
}

export function randomInRange(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/**
 * Draw one reward from a pool without repeating until every reward in
 * the pool has been seen once. `usedIds` tracks the current cycle; once
 * everything has been drawn, the cycle resets (but the just-drawn reward
 * still won't repeat immediately, since it seeds the new cycle's used list).
 */
export function drawReward(pool, usedIds = []) {
  const eligible = pool.filter((r) => !r.disabled);
  if (eligible.length === 0) return { reward: null, newUsedIds: usedIds, cycleReset: false };

  let candidates = eligible.filter((r) => !usedIds.includes(r.id));
  let cycleReset = false;
  if (candidates.length === 0) {
    cycleReset = true;
    candidates = eligible;
  }
  const reward = candidates[Math.floor(Math.random() * candidates.length)];
  const newUsedIds = cycleReset ? [reward.id] : [...usedIds, reward.id];
  return { reward, newUsedIds, cycleReset };
}

export function isPerfectDay(day, categories) {
  const active = categories.filter((c) => !c.archived);
  if (active.length === 0) return false;
  return active.every((c) => day?.categoryProgress?.[c.id]?.goalMet === true);
}

export function progressForCategory(day, category) {
  const prog = day?.categoryProgress?.[category.id];
  if (!prog) return { count: 0, minutes: 0, goalMet: false, pct: 0 };
  const count = prog.count || 0;
  const minutes = prog.minutes || 0;
  let pct = 0;
  if (category.goalType === 'count' && category.goalValue > 0) {
    pct = Math.min(1, count / category.goalValue);
  } else if (category.goalType === 'minutes' && category.goalValue > 0) {
    pct = Math.min(1, minutes / category.goalValue);
  }
  return { count, minutes, goalMet: !!prog.goalMet, pct };
}

export function targetForCategory(category, dayMode) {
  const modeFocusIds = Array.isArray(dayMode?.focusCategoryIds) ? dayMode.focusCategoryIds : [];
  const isFocus = modeFocusIds.includes(category.id);
  const goalType = category.goalType;
  const fallbackValue = Number(category.goalValue) || 1;
  const baselineValue = Number(category.baselineGoalValue) || fallbackValue;
  const focusValue = Number(category.focusGoalValue) || fallbackValue;
  const goalValue = isFocus ? Math.max(baselineValue, focusValue) : baselineValue;
  return {
    categoryId: category.id,
    role: isFocus ? 'focus' : 'baseline',
    goalType,
    goalValue,
  };
}

export function progressForTarget(day, category, target) {
  const prog = day?.categoryProgress?.[category.id];
  const count = prog?.count || 0;
  const minutes = prog?.minutes || 0;
  const actual = target.goalType === 'count' ? count : minutes;
  const pct = target.goalValue > 0 ? Math.min(1, actual / target.goalValue) : 0;
  return {
    count,
    minutes,
    actual,
    goalMet: actual >= target.goalValue,
    pct,
  };
}

export function buildDailyMissions(day, categories, dayMode) {
  return categories
    .filter((c) => !c.archived)
    .map((category) => {
      const target = targetForCategory(category, dayMode);
      const progress = progressForTarget(day, category, target);
      return { category, target, progress };
    });
}

export function dailyMissionStatus(day, categories, dayMode) {
  const missions = buildDailyMissions(day, categories, dayMode);
  const baseline = missions.filter((m) => m.target.role === 'baseline');
  const focus = missions.filter((m) => m.target.role === 'focus');
  return {
    missions,
    baselineMet: baseline.every((m) => m.progress.goalMet),
    focusMet: focus.every((m) => m.progress.goalMet),
    complete: missions.length > 0 && missions.every((m) => m.progress.goalMet),
  };
}
export function rangeEndingOn(endKey, days) {
  const keys = [];
  for (let i = Math.max(1, days) - 1; i >= 0; i--) keys.push(addDays(endKey, -i));
  return keys;
}

export function reviewForRange(data, categories, dayModes, endKey = todayKey(), days = 7) {
  const active = categories.filter((c) => !c.archived);
  const modes = Array.isArray(dayModes) ? dayModes : [];
  const defaultMode = modes[0] || { id: 'balanced', focusCategoryIds: [] };
  const keys = rangeEndingOn(endKey, days);
  const categoryStats = active.map((category) => ({ categoryId: category.id, complete: 0, possible: 0, minutes: 0, count: 0 }));
  let missionCompleteDays = 0;
  let baselineCompleteDays = 0;
  let totalMinutes = 0;
  let totalSessions = 0;
  let totalCoins = 0;

  for (const key of keys) {
    const day = data.days?.[key] || { categoryProgress: {} };
    const modeId = day.plan?.modeId || data.dailyPlanning?.defaultModeId || defaultMode.id;
    const mode = modes.find((m) => m.id === modeId) || defaultMode;
    const status = dailyMissionStatus(day, active, mode);
    if (status.complete) missionCompleteDays += 1;
    if (status.baselineMet) baselineCompleteDays += 1;
    totalCoins += day.coinsEarned || 0;

    for (const mission of status.missions) {
      const stat = categoryStats.find((s) => s.categoryId === mission.category.id);
      if (!stat) continue;
      stat.possible += 1;
      if (mission.progress.goalMet) stat.complete += 1;
      stat.minutes += mission.progress.minutes;
      stat.count += mission.progress.count;
      totalMinutes += mission.progress.minutes;
      totalSessions += day.categoryProgress?.[mission.category.id]?.sessions?.length || 0;
    }
  }

  const weakest = categoryStats
    .filter((s) => s.possible > 0)
    .sort((a, b) => a.complete / a.possible - b.complete / b.possible)[0] || null;

  return {
    keys,
    missionCompleteDays,
    baselineCompleteDays,
    totalMinutes,
    totalSessions,
    totalCoins,
    weakestCategoryId: weakest?.categoryId || null,
    categoryStats,
  };
}
export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatMinutesShort(totalMinutes) {
  const m = Math.round(totalMinutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function entryStartMs(entry) {
  return new Date(entry.startedAt || entry.createdAt || 0).getTime();
}

function entryEndMs(entry, fallbackEndMs = Date.now()) {
  if (entry.endedAt) return new Date(entry.endedAt).getTime();
  if (entry.status === 'active') return fallbackEndMs;
  return entryStartMs(entry);
}

export function normalizedWorklogEntry(entry, now = new Date()) {
  const nowMs = now.getTime();
  const startMs = entryStartMs(entry);
  const endMs = Math.max(startMs, entryEndMs(entry, nowMs));
  const durationSec =
    typeof entry.durationSec === 'number' ? entry.durationSec : Math.max(0, Math.round((endMs - startMs) / 1000));
  return {
    ...entry,
    startedAt: entry.startedAt || entry.createdAt || new Date(startMs).toISOString(),
    endedAt: entry.endedAt || null,
    durationSec,
    status: entry.status || 'completed',
    date: entry.date || dateKey(new Date(startMs)),
  };
}

export function worklogEntriesForDate(worklog, key, now = new Date()) {
  const { start, end } = dayBounds(key);
  const startMs = start.getTime();
  const endMs = end.getTime();
  return (worklog || [])
    .map((entry) => normalizedWorklogEntry(entry, now))
    .filter((entry) => {
      const s = entryStartMs(entry);
      const e = entryEndMs(entry, now.getTime());
      return s < endMs && e >= startMs;
    })
    .sort((a, b) => entryStartMs(a) - entryStartMs(b));
}

export function filterWorklogEntries(entries, { categoryId = 'all', search = '', fromHour = 0, toHour = 24, dateKey: rangeDateKey = null } = {}) {
  const q = search.trim().toLowerCase();
  const baseDate = rangeDateKey || entries?.[0]?.date || todayKey();
  const { start } = dayBounds(baseDate);
  const rangeStartMs = start.getTime() + Number(fromHour) * 3600000;
  const rangeEndMs = start.getTime() + Number(toHour) * 3600000;
  return (entries || []).filter((entry) => {
    if (categoryId !== 'all' && entry.categoryId !== categoryId) return false;
    if (q) {
      const haystack = `${entry.note || ''} ${entry.intent || ''} ${entry.status || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return entryStartMs(entry) < rangeEndMs && entryEndMs(entry) >= rangeStartMs;
  });
}

export function buildHourlyTimeline(entries, key, now = new Date()) {
  const { start } = dayBounds(key);
  const dayStartMs = start.getTime();
  return Array.from({ length: 24 }, (_, hour) => {
    const hourStart = dayStartMs + hour * 3600000;
    const hourEnd = hourStart + 3600000;
    const hourEntries = (entries || [])
      .map((entry) => normalizedWorklogEntry(entry, now))
      .filter((entry) => entryStartMs(entry) < hourEnd && entryEndMs(entry, now.getTime()) > hourStart)
      .map((entry) => {
        const s = Math.max(entryStartMs(entry), hourStart);
        const e = Math.min(entryEndMs(entry, now.getTime()), hourEnd);
        return {
          ...entry,
          offsetPct: ((s - hourStart) / 3600000) * 100,
          widthPct: Math.max(2, ((e - s) / 3600000) * 100),
        };
      });
    const totalMinutes = hourEntries.reduce((sum, entry) => {
      const s = Math.max(entryStartMs(entry), hourStart);
      const e = Math.min(entryEndMs(entry, now.getTime()), hourEnd);
      return sum + Math.max(0, Math.round((e - s) / 60000));
    }, 0);
    return { hour, label: `${String(hour).padStart(2, '0')}:00`, entries: hourEntries, totalMinutes };
  });
}
