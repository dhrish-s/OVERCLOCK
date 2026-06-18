// state.js - the single in-memory source of truth for the renderer.
// Views read from `store.data` and call `store.mutate(fn)` to change it;
// every mutation re-runs derived fields (streaks, perfect-day, level) and
// persists to disk through the locked-down IPC bridge in preload.js.

import {
  uid,
  todayKey,
  updateStreakForToday,
  dailyMissionStatus,
  applyXp,
  randomInRange,
} from './logic.js';

const DEFAULT_CATEGORIES = [
  {
    id: 'cat_leetcode',
    name: 'LeetCode',
    icon: 'code',
    color: '#FFB454',
    goalType: 'count',
    goalValue: 2,
    baselineGoalValue: 1,
    focusGoalValue: 4,
    countLabel: 'Problems solved',
    timerMode: 'pomodoro',
    timerWorkSec: 25 * 60,
    timerBreakSec: 5 * 60,
    coinMin: 15,
    coinMax: 25,
    order: 0,
    archived: false,
  },
  {
    id: 'cat_jobs',
    name: 'Job Applications',
    icon: 'briefcase',
    color: '#8B7CF6',
    goalType: 'count',
    goalValue: 3,
    baselineGoalValue: 1,
    focusGoalValue: 8,
    countLabel: 'Applications sent',
    timerMode: 'stopwatch',
    timerWorkSec: 0,
    timerBreakSec: 0,
    coinMin: 10,
    coinMax: 20,
    order: 1,
    archived: false,
  },
  {
    id: 'cat_sysdesign',
    name: 'System Design Study',
    icon: 'layers',
    color: '#4ADE80',
    goalType: 'minutes',
    goalValue: 45,
    baselineGoalValue: 15,
    focusGoalValue: 90,
    countLabel: 'Topics covered',
    timerMode: 'countdown',
    timerWorkSec: 45 * 60,
    timerBreakSec: 0,
    coinMin: 20,
    coinMax: 30,
    order: 2,
    archived: false,
  },
  {
    id: 'cat_oss',
    name: 'Open Source / GitHub',
    icon: 'github',
    color: '#F2555A',
    goalType: 'minutes',
    goalValue: 30,
    baselineGoalValue: 10,
    focusGoalValue: 60,
    countLabel: 'Commits / PRs',
    timerMode: 'stopwatch',
    timerWorkSec: 0,
    timerBreakSec: 0,
    coinMin: 20,
    coinMax: 35,
    order: 3,
    archived: false,
  },
];

const DEFAULT_DAY_MODES = [
  { id: 'balanced', label: 'Balanced', description: 'Keep every active category warm at baseline.', focusCategoryIds: [] },
  { id: 'leetcode_heavy', label: 'LeetCode Heavy', description: 'Push problem-solving harder while keeping other areas alive.', focusCategoryIds: ['cat_leetcode'] },
  { id: 'github_heavy', label: 'GitHub Heavy', description: 'Push open-source or portfolio output while keeping other areas alive.', focusCategoryIds: ['cat_oss'] },
  { id: 'jobs_heavy', label: 'Job Search Heavy', description: 'Push applications and job-search output while keeping other areas alive.', focusCategoryIds: ['cat_jobs'] },
  { id: 'system_heavy', label: 'System Design Heavy', description: 'Push architecture study while keeping other areas alive.', focusCategoryIds: ['cat_sysdesign'] },
  { id: 'recovery', label: 'Recovery', description: 'Minimum viable momentum after a rough day.', focusCategoryIds: [] },
];
const DEFAULT_SMALL_REWARDS = [
  { id: 'r_smallnap', label: '15–20 min power nap', tier: 'small', cost: 60, disabled: false },
  { id: 'r_song', label: 'Listen to one song, no multitasking', tier: 'small', cost: 40, disabled: false },
  { id: 'r_shower', label: 'Take a quick shower break', tier: 'small', cost: 40, disabled: false },
  { id: 'r_stretch', label: '10 min stretch / walk outside', tier: 'small', cost: 35, disabled: false },
  { id: 'r_snacksmall', label: 'Grab a small snack', tier: 'small', cost: 45, disabled: false },
];

const DEFAULT_BIG_REWARDS = [
  { id: 'r_ps4', label: 'PS4 session', tier: 'big', cost: 2, disabled: false },
  { id: 'r_temu', label: 'Buy something from Temu', tier: 'big', cost: 2, disabled: false },
  { id: 'r_chips', label: 'Buy chips', tier: 'big', cost: 1, disabled: false },
  { id: 'r_youtube', label: '30 min YouTube, guilt-free', tier: 'big', cost: 1, disabled: false },
];

export function createDefaultData() {
  return {
    version: 1,
    profile: {
      displayName: 'Sam',
      level: 1,
      xp: 0,
      coins: 0,
      stars: 0,
      streakShields: 0,
      createdAt: new Date().toISOString(),
    },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    days: {},
    dailyPlanning: {
      defaultModeId: 'balanced',
      dayModes: DEFAULT_DAY_MODES.map((m) => ({ ...m, focusCategoryIds: [...m.focusCategoryIds] })),
    },
    streaks: { overall: { current: 0, longest: 0, lastDate: null } },
    rewards: {
      small: DEFAULT_SMALL_REWARDS.map((r) => ({ ...r })),
      big: DEFAULT_BIG_REWARDS.map((r) => ({ ...r })),
      usedSmallIds: [],
      usedBigIds: [],
      history: [],
    },
    worklog: [],
    settings: {
      waterReminderMinutes: 60,
      walkReminderMinutes: 90,
      remindersEnabled: true,
      soundEnabled: true,
      launchOnStartup: true,
    },
  };
}

function defaultModeId(data) {
  return data.dailyPlanning?.defaultModeId || 'balanced';
}

function dayModeById(data, modeId) {
  const modes = data.dailyPlanning?.dayModes || [];
  return modes.find((m) => m.id === modeId) || modes.find((m) => m.id === defaultModeId(data)) || null;
}

function createDayPlan(data, modeId = defaultModeId(data)) {
  return { modeId, selectedAt: null, customOverrides: {} };
}

function ensureDayShape(data, key) {
  if (!data.days[key]) {
    data.days[key] = { categoryProgress: {}, perfectDay: false, coinsEarned: 0, starsEarned: 0, plan: createDayPlan(data) };
  }
  if (!data.days[key].plan) data.days[key].plan = createDayPlan(data);
  return data.days[key];
}

function ensureStreakShape(data, categoryId) {
  if (!data.streaks[categoryId]) {
    data.streaks[categoryId] = { current: 0, longest: 0, lastDate: null };
  }
  return data.streaks[categoryId];
}

class Store {
  constructor() {
    this.data = createDefaultData();
    this.listeners = new Set();
    this._saveTimer = null;
    this._ready = false;
  }

  async init() {
    const loaded = await window.api.loadData();
    if (loaded && loaded.profile) {
      this.data = migrate(loaded);
    } else {
      this.data = createDefaultData();
      await this._saveNow();
    }
    this._ready = true;
    this._emit();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    for (const fn of this.listeners) fn(this.data);
  }

  /** Run `fn(data)` which may mutate `data` in place, then persist + notify. */
  mutate(fn) {
    fn(this.data);
    this._emit();
    this._scheduleSave();
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveNow(), 350);
  }

  async _saveNow() {
    try {
      await window.api.saveData(this.data);
    } catch (err) {
      console.error('Save failed', err);
    }
  }

  // ---- domain operations ----

  getCategory(id) {
    return this.data.categories.find((c) => c.id === id);
  }

  activeCategories() {
    return this.data.categories.filter((c) => !c.archived).sort((a, b) => a.order - b.order);
  }

  dayModeForDate(key = todayKey()) {
    const modeId = this.data.days[key]?.plan?.modeId || defaultModeId(this.data);
    return dayModeById(this.data, modeId);
  }

  setDayModeForDate(modeId, key = todayKey()) {
    const mode = dayModeById(this.data, modeId);
    if (!mode) return { ok: false, error: 'Unknown day mode.' };
    this.mutate((data) => {
      const day = ensureDayShape(data, key);
      day.plan = { ...day.plan, modeId: mode.id, selectedAt: new Date().toISOString() };
    });
    return { ok: true, mode };
  }

  /** Log a finished session against a category: adds minutes/count, rolls
   * coins, recomputes goal-met / streaks / perfect-day / level for today. */
  logSession({ categoryId, seconds, count, note, intent, completed }) {
    let result = { coinsEarned: 0, leveledUp: false, perfectDayJustHit: false, streakNow: 0 };
    this.mutate((data) => {
      const category = data.categories.find((c) => c.id === categoryId);
      if (!category) return;
      const today = todayKey();
      const day = ensureDayShape(data, today);
      const dayMode = dayModeById(data, day.plan?.modeId || defaultModeId(data));
      const wasPerfectBefore = dailyMissionStatus(day, data.categories, dayMode).complete;

      if (!day.categoryProgress[categoryId]) {
        day.categoryProgress[categoryId] = { sessions: [], minutes: 0, count: 0, goalMet: false };
      }
      const prog = day.categoryProgress[categoryId];
      const minutesAdded = Math.round((seconds || 0) / 60);
      prog.minutes += minutesAdded;
      prog.count += count || 0;
      prog.sessions.push({
        id: uid('sess'),
        startedAt: new Date(Date.now() - (seconds || 0) * 1000).toISOString(),
        endedAt: new Date().toISOString(),
        durationSec: seconds || 0,
        count: count || 0,
        note: note || '',
        intent: intent || '',
        completed: !!completed,
      });

      if (category.goalType === 'count') {
        prog.goalMet = prog.count >= category.goalValue;
      } else {
        prog.goalMet = prog.minutes >= category.goalValue;
      }

      const coins = randomInRange(category.coinMin, category.coinMax);
      prog.coinsEarned = (prog.coinsEarned || 0) + coins;
      day.coinsEarned = (day.coinsEarned || 0) + coins;
      data.profile.coins += coins;

      const xpResult = applyXp(data.profile, Math.round(coins * 0.6));
      data.profile.level = xpResult.level;
      data.profile.xp = xpResult.xp;

      // Per-category streak.
      const catStreak = ensureStreakShape(data, categoryId);
      const { streak: newCatStreak } = updateStreakForToday(catStreak, today, prog.goalMet);
      data.streaks[categoryId] = newCatStreak;

      // Overall perfect-day streak + bonus star, only the moment it flips.
      const nowPerfect = dailyMissionStatus(day, data.categories, dayMode).complete;
      day.perfectDay = nowPerfect;
      if (nowPerfect && !wasPerfectBefore) {
        data.profile.stars += 1;
        day.starsEarned = (day.starsEarned || 0) + 1;
        const overall = ensureStreakShape(data, 'overall');
        const { streak: newOverall } = updateStreakForToday(
          overall,
          today,
          true,
          data.profile.streakShields
        );
        data.streaks.overall = newOverall;
        result.perfectDayJustHit = true;
      }

      if (note && note.trim()) {
        data.worklog.unshift({
          id: uid('log'),
          date: today,
          categoryId,
          note: note.trim(),
          intent: intent || '',
          completed: !!completed,
          createdAt: new Date().toISOString(),
        });
      }

      result.coinsEarned = coins;
      result.leveledUp = xpResult.leveledUp;
      result.streakNow = newCatStreak.current;
    });
    return result;
  }

  /** Manually adjust today's count for a category without a timer session
   * (e.g. logging one more job application sent outside a focus block). */
  addQuickCount({ categoryId, amount, note }) {
    return this.logSession({ categoryId, seconds: 0, count: amount, note });
  }

  claimReward(tier) {
    const data = this.data;
    const pool = tier === 'big' ? data.rewards.big : data.rewards.small;
    const balanceKey = tier === 'big' ? 'stars' : 'coins';

    const affordableNow = pool.filter((r) => !r.disabled).filter((r) => r.cost <= data.profile[balanceKey]);
    if (affordableNow.length === 0) return { ok: false, reason: 'insufficient-balance' };

    let outcome = null;
    this.mutate((d) => {
      const usedKey = tier === 'big' ? 'usedBigIds' : 'usedSmallIds';
      const livePool = tier === 'big' ? d.rewards.big : d.rewards.small;
      const affordable = livePool.filter((r) => !r.disabled && r.cost <= d.profile[balanceKey]);
      const usedIds = d.rewards[usedKey] || [];

      // Draw only from rewards the user can currently afford, so a cheap
      // reward doesn't sit "saved" behind an expensive one forever.
      const eligibleUsed = usedIds.filter((id) => affordable.some((r) => r.id === id));
      const candidatesUnused = affordable.filter((r) => !eligibleUsed.includes(r.id));
      const drawPool = candidatesUnused.length > 0 ? candidatesUnused : affordable;
      const cycleReset = candidatesUnused.length === 0;
      const reward = drawPool[Math.floor(Math.random() * drawPool.length)];

      d.profile[balanceKey] -= reward.cost;
      d.rewards[usedKey] = cycleReset ? [reward.id] : [...usedIds, reward.id];
      d.rewards.history.unshift({
        id: uid('claim'),
        rewardId: reward.id,
        label: reward.label,
        tier,
        cost: reward.cost,
        claimedAt: new Date().toISOString(),
      });
      outcome = { ok: true, reward, cycleReset };
    });
    return outcome;
  }

  importData(parsed) {
    if (!parsed || typeof parsed !== 'object' || !parsed.profile || !parsed.categories) {
      return { ok: false, error: 'That file does not look like an Overclock backup.' };
    }
    this.mutate((data) => {
      Object.assign(data, migrate(parsed));
    });
    return { ok: true };
  }

  resetAll() {
    this.mutate((data) => {
      Object.assign(data, createDefaultData());
    });
  }
}

function backfillFlexibleGoals(data) {
  const defaults = createDefaultData();
  const defaultCategoryById = new Map(defaults.categories.map((c) => [c.id, c]));
  for (const category of data.categories || []) {
    const fallback = defaultCategoryById.get(category.id) || category;
    if (typeof category.baselineGoalValue !== 'number') {
      category.baselineGoalValue = Number(fallback.baselineGoalValue) || Number(category.goalValue) || 1;
    }
    if (typeof category.focusGoalValue !== 'number') {
      category.focusGoalValue = Number(fallback.focusGoalValue) || Number(category.goalValue) || 1;
    }
  }
  if (!data.dailyPlanning) data.dailyPlanning = defaults.dailyPlanning;
  if (!data.dailyPlanning.defaultModeId) data.dailyPlanning.defaultModeId = defaults.dailyPlanning.defaultModeId;
  if (!Array.isArray(data.dailyPlanning.dayModes) || data.dailyPlanning.dayModes.length === 0) {
    data.dailyPlanning.dayModes = defaults.dailyPlanning.dayModes;
  }
  for (const day of Object.values(data.days || {})) {
    if (!day.plan) day.plan = createDayPlan(data);
    if (!day.plan.modeId) day.plan.modeId = defaultModeId(data);
    if (!day.plan.customOverrides) day.plan.customOverrides = {};
  }
}
function migrate(data) {
  // Single version today; this is the seam for future schema migrations
  // so old local backups never silently corrupt on upgrade.
  if (!data.version) data.version = 1;
  if (!data.rewards) data.rewards = createDefaultData().rewards;
  if (!data.rewards.usedSmallIds) data.rewards.usedSmallIds = [];
  if (!data.rewards.usedBigIds) data.rewards.usedBigIds = [];
  if (!data.rewards.history) data.rewards.history = [];
  if (!data.worklog) data.worklog = [];
  if (!data.streaks) data.streaks = { overall: { current: 0, longest: 0, lastDate: null } };
  if (!data.streaks.overall) data.streaks.overall = { current: 0, longest: 0, lastDate: null };
  if (typeof data.profile.streakShields !== 'number') data.profile.streakShields = 0;
  if (typeof data.profile.stars !== 'number') data.profile.stars = 0;
  if (typeof data.settings.launchOnStartup !== 'boolean') data.settings.launchOnStartup = true;
  backfillFlexibleGoals(data);
  return data;
}

export const store = new Store();
