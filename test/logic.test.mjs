import {
  dateKey,
  todayKey,
  addDays,
  diffDays,
  updateStreakForToday,
  isStreakAlive,
  xpForNextLevel,
  applyXp,
  drawReward,
  isPerfectDay,
  progressForCategory,
  formatDuration,
  formatMinutesShort,
  dayBounds,
  dateKeyFromIso,
  formatClockTime,
  monthMatrix,
  targetForCategory,
  progressForTarget,
  buildDailyMissions,
  dailyMissionStatus,
  rangeEndingOn,
  reviewForRange,
  normalizedWorklogEntry,
  worklogEntriesForDate,
  filterWorklogEntries,
  buildHourlyTimeline,
  worklogIdleGaps,
  overlappingWorklogEntries,
  worklogInsights,
} from '../src/js/logic.js';
import { FocusClock } from '../src/js/focusClock.js';
import { createDefaultData, Store } from '../src/js/state.js';
import { getActiveCategoryId, getActiveSessionInfo, restoreActiveSession } from '../src/js/timer.js';

let pass = 0;
let fail = 0;

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

function assertTrue(cond, label) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

// ---- date helpers ----
assertEqual(dateKey(new Date(2026, 5, 17)), '2026-06-17', 'dateKey formats month/day with leading zeros');
assertEqual(dayBounds('2026-06-17').start.getHours(), 0, 'dayBounds starts at local midnight');
assertEqual(dayBounds('2026-06-17').end.getDate(), 18, 'dayBounds ends at the next local day');
assertEqual(dateKeyFromIso(new Date(2026, 5, 17, 9, 30).toISOString()), '2026-06-17', 'dateKeyFromIso uses the local laptop date');
assertTrue(formatClockTime(new Date(2026, 5, 17, 9, 30).toISOString()).includes('9'), 'formatClockTime produces a local clock label');
assertEqual(addDays('2026-06-17', 1), '2026-06-18', 'addDays forward');
assertEqual(addDays('2026-06-01', -1), '2026-05-31', 'addDays crosses month boundary backward');
assertEqual(diffDays('2026-06-17', '2026-06-18'), 1, 'diffDays one day forward');
assertEqual(diffDays('2026-06-17', '2026-06-17'), 0, 'diffDays same day');
assertEqual(diffDays('2026-05-31', '2026-06-01'), 1, 'diffDays across month boundary');

// ---- streaks ----
{
  let streak = { current: 0, longest: 0, lastDate: null };
  let r = updateStreakForToday(streak, '2026-06-10', true);
  assertEqual(r.streak.current, 1, 'streak starts at 1 on first goal-met day');
  streak = r.streak;

  r = updateStreakForToday(streak, '2026-06-11', true);
  assertEqual(r.streak.current, 2, 'streak increments on consecutive day');
  streak = r.streak;

  // Re-evaluating the same day again must not double-count.
  r = updateStreakForToday(streak, '2026-06-11', true);
  assertEqual(r.streak.current, 2, 'same-day re-evaluation is idempotent');
  streak = r.streak;

  r = updateStreakForToday(streak, '2026-06-10', true);
  assertEqual(r.streak.lastDate, '2026-06-11', 'older activity cannot move a streak backward');

  // Gap of 2 days with no shields breaks the streak back to 1.
  r = updateStreakForToday(streak, '2026-06-13', true, 0);
  assertEqual(r.streak.current, 1, 'streak resets to 1 after an unshielded gap');
  assertEqual(r.shieldsUsed, 0, 'no shields consumed when none available');
  streak = r.streak;
}

{
  // Shield covers exactly one missed day.
  let streak = { current: 4, longest: 4, lastDate: '2026-06-10' };
  const r = updateStreakForToday(streak, '2026-06-12', true, 2);
  assertEqual(r.streak.current, 5, 'one streak shield bridges a single missed day');
  assertEqual(r.shieldsUsed, 1, 'exactly one shield consumed for a one-day gap');
}

{
  // Goal not met today should not mutate the streak at all.
  const streak = { current: 6, longest: 9, lastDate: '2026-06-10' };
  const r = updateStreakForToday(streak, '2026-06-11', false);
  assertEqual(r.streak, streak, 'missed goal leaves streak object unchanged');
}

assertTrue(isStreakAlive({ current: 3, lastDate: '2026-06-16' }, '2026-06-17'), 'streak alive with a 1-day gap (yesterday)');
assertTrue(!isStreakAlive({ current: 3, lastDate: '2026-06-14' }, '2026-06-17'), 'streak considered dead after a 3-day gap');

// ---- leveling ----
assertEqual(xpForNextLevel(1), 100, 'level 1 requires 100 xp');
assertEqual(xpForNextLevel(2), 150, 'level 2 requires 150 xp');
{
  const result = applyXp({ level: 1, xp: 90 }, 20);
  assertEqual(result.level, 2, 'gaining xp past threshold levels up');
  assertEqual(result.xp, 10, 'leftover xp carries over after leveling');
  assertTrue(result.leveledUp, 'leveledUp flag set true');
}
{
  const result = applyXp({ level: 1, xp: 0 }, 10);
  assertEqual(result.level, 1, 'small xp gain does not level up');
  assertTrue(!result.leveledUp, 'leveledUp flag false when no level change');
}

// ---- reward draw (no repeats until pool exhausted) ----
{
  const pool = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ];
  let used = [];
  const seen = [];
  for (let i = 0; i < 3; i++) {
    const { reward, newUsedIds } = drawReward(pool, used);
    seen.push(reward.id);
    used = newUsedIds;
  }
  const uniqueCount = new Set(seen).size;
  assertEqual(uniqueCount, 3, 'all three rewards drawn exactly once before any repeat');

  // Fourth draw must trigger a cycle reset since the pool was exhausted.
  const fourth = drawReward(pool, used);
  assertTrue(fourth.cycleReset, 'cycle resets once every reward has been used');
}
{
  // disabled rewards are never drawn
  const pool = [
    { id: 'a', label: 'A', disabled: true },
    { id: 'b', label: 'B' },
  ];
  for (let i = 0; i < 5; i++) {
    const { reward } = drawReward(pool, []);
    assertEqual(reward.id, 'b', 'disabled rewards are excluded from the draw');
  }
}

// ---- perfect day ----
{
  const categories = [
    { id: 'cat1', archived: false },
    { id: 'cat2', archived: false },
  ];
  const dayAllMet = { categoryProgress: { cat1: { goalMet: true }, cat2: { goalMet: true } } };
  const dayPartial = { categoryProgress: { cat1: { goalMet: true }, cat2: { goalMet: false } } };
  assertTrue(isPerfectDay(dayAllMet, categories), 'perfect day true when every active category is met');
  assertTrue(!isPerfectDay(dayPartial, categories), 'perfect day false when one category is unmet');
  assertTrue(!isPerfectDay({}, categories), 'perfect day false on an empty/untouched day');
}

// ---- progress for category ----
{
  const category = { id: 'cat1', goalType: 'count', goalValue: 4 };
  const day = { categoryProgress: { cat1: { count: 2, minutes: 10, goalMet: false } } };
  const prog = progressForCategory(day, category);
  assertEqual(prog.pct, 0.5, 'progress percent computed from count goal');
  assertEqual(prog.goalMet, false, 'goalMet passed through from stored progress');
}

// ---- formatting ----
assertEqual(formatDuration(65), '1:05', 'formatDuration mm:ss under an hour');
assertEqual(formatDuration(3661), '1:01:01', 'formatDuration h:mm:ss over an hour');
assertEqual(formatMinutesShort(45), '45m', 'formatMinutesShort under an hour');
assertEqual(formatMinutesShort(125), '2h 5m', 'formatMinutesShort over an hour with remainder');
assertEqual(formatMinutesShort(120), '2h', 'formatMinutesShort exact hour with no remainder');

// ---- worklog timeline helpers ----
{
  const start = new Date(2026, 5, 17, 9, 15).toISOString();
  const active = normalizedWorklogEntry({ id: 'log1', categoryId: 'leet', startedAt: start, status: 'active' }, new Date(2026, 5, 17, 9, 45));
  assertEqual(active.durationSec, 1800, 'active worklog entries use now as their temporary end time');
  assertEqual(active.date, '2026-06-17', 'normalized worklog entries derive a local date when needed');
}

{
  const entries = [
    {
      id: 'a',
      categoryId: 'leet',
      intent: 'Graph problems',
      note: '',
      startedAt: new Date(2026, 5, 17, 9, 15).toISOString(),
      endedAt: new Date(2026, 5, 17, 10, 0).toISOString(),
      status: 'completed',
    },
    {
      id: 'b',
      categoryId: 'jobs',
      intent: 'Applications',
      note: 'Sent two',
      startedAt: new Date(2026, 5, 18, 11, 0).toISOString(),
      endedAt: new Date(2026, 5, 18, 11, 30).toISOString(),
      status: 'completed',
    },
  ];
  const dayEntries = worklogEntriesForDate(entries, '2026-06-17', new Date(2026, 5, 17, 12, 0));
  assertEqual(dayEntries.map((e) => e.id), ['a'], 'worklogEntriesForDate returns only entries overlapping the selected day');
  const searched = filterWorklogEntries(dayEntries, { search: 'graph', fromHour: 9, toHour: 11 });
  assertEqual(searched.map((e) => e.id), ['a'], 'filterWorklogEntries searches intent and respects hour range');
  const overlapping = filterWorklogEntries(
    [
      {
        id: 'early',
        date: '2026-06-17',
        categoryId: 'leet',
        startedAt: new Date(2026, 5, 17, 8, 30).toISOString(),
        endedAt: new Date(2026, 5, 17, 9, 15).toISOString(),
      },
    ],
    { fromHour: 9, toHour: 10, dateKey: '2026-06-17' }
  );
  assertEqual(overlapping.map((e) => e.id), ['early'], 'filterWorklogEntries includes sessions that overlap a selected time range');
  const timeline = buildHourlyTimeline(dayEntries, '2026-06-17', new Date(2026, 5, 17, 12, 0));
  assertEqual(timeline[9].entries.length, 1, 'buildHourlyTimeline places an entry in its starting hour');
  assertEqual(timeline[9].totalMinutes, 45, 'buildHourlyTimeline totals minutes inside each hour');
  const gaps = worklogIdleGaps(
    [
      ...dayEntries,
      {
        id: 'later',
        startedAt: new Date(2026, 5, 17, 11, 0).toISOString(),
        endedAt: new Date(2026, 5, 17, 11, 30).toISOString(),
      },
    ],
    '2026-06-17'
  );
  assertEqual(gaps.map((gap) => gap.durationMinutes), [60], 'worklogIdleGaps reports meaningful gaps between tracked blocks');
  const overlaps = overlappingWorklogEntries(dayEntries, new Date(2026, 5, 17, 9, 30), new Date(2026, 5, 17, 10, 30));
  assertEqual(overlaps.map((entry) => entry.id), ['a'], 'overlappingWorklogEntries detects intersecting work blocks');
  const insights = worklogInsights([
    { id: 'auto', type: 'session', status: 'completed', startedAt: new Date(2026, 5, 17, 9, 0).toISOString(), durationSec: 3600 },
    { id: 'manual', type: 'manual', status: 'completed', startedAt: new Date(2026, 5, 17, 9, 30).toISOString(), durationSec: 1800 },
  ], '2026-06-17', 7, new Date(2026, 5, 17, 12, 0));
  assertEqual(insights.totalMinutes, 90, 'worklogInsights includes automatic and manual tracked time');
  assertEqual(insights.manualMinutes, 30, 'worklogInsights separates manually entered time');
  assertEqual(insights.bestHour, 9, 'worklogInsights identifies the strongest session start hour');
}

// ---- month matrix ----
{
  const rows = monthMatrix(2026, 5); // June 2026 (0-indexed month)
  const flat = rows.flat();
  assertEqual(flat.filter((c) => c !== null).length, 30, 'June month matrix contains exactly 30 real days');
  assertTrue(rows.every((r) => r.length === 7), 'every week row has 7 cells');
}

// ---- flexible daily missions ----
{
  const categories = [
    { id: 'leet', goalType: 'count', goalValue: 2, baselineGoalValue: 1, focusGoalValue: 4, archived: false },
    { id: 'jobs', goalType: 'count', goalValue: 3, baselineGoalValue: 1, focusGoalValue: 8, archived: false },
  ];
  const leetcodeHeavy = { id: 'leetcode_heavy', focusCategoryIds: ['leet'] };
  const leetTarget = targetForCategory(categories[0], leetcodeHeavy);
  const jobsTarget = targetForCategory(categories[1], leetcodeHeavy);
  assertEqual(leetTarget, { categoryId: 'leet', role: 'focus', goalType: 'count', goalValue: 4 }, 'focus day uses focus target for selected category');
  assertEqual(jobsTarget, { categoryId: 'jobs', role: 'baseline', goalType: 'count', goalValue: 1 }, 'focus day keeps other categories at baseline');
}

{
  const category = { id: 'sys', goalType: 'minutes', goalValue: 45, baselineGoalValue: 15, focusGoalValue: 90, archived: false };
  const target = targetForCategory(category, { id: 'system_heavy', focusCategoryIds: ['sys'] });
  const progress = progressForTarget({ categoryProgress: { sys: { minutes: 45, count: 0 } } }, category, target);
  assertEqual(progress.goalMet, false, 'focus target can be stricter than old static goal');
  assertEqual(progress.pct, 0.5, 'target progress percent uses the resolved daily target');
}

{
  const categories = [
    { id: 'leet', goalType: 'count', goalValue: 2, baselineGoalValue: 1, focusGoalValue: 4, archived: false },
    { id: 'oss', goalType: 'minutes', goalValue: 30, baselineGoalValue: 10, focusGoalValue: 60, archived: false },
    { id: 'old', goalType: 'count', goalValue: 1, archived: true },
  ];
  const day = { categoryProgress: { leet: { count: 4 }, oss: { minutes: 10 }, old: { count: 0 } } };
  const missions = buildDailyMissions(day, categories, { id: 'leetcode_heavy', focusCategoryIds: ['leet'] });
  assertEqual(missions.length, 2, 'daily missions ignore archived categories');
  const status = dailyMissionStatus(day, categories, { id: 'leetcode_heavy', focusCategoryIds: ['leet'] });
  assertTrue(status.baselineMet, 'baseline categories can be complete while focus category is separate');
  assertTrue(status.focusMet, 'focus category completion is tracked separately');
  assertTrue(status.complete, 'daily mission is complete when all resolved targets are met');
}

{
  const categories = [
    { id: 'leet', goalType: 'count', goalValue: 2, archived: false },
  ];
  const target = targetForCategory(categories[0], { id: 'legacy_focus', focusCategoryIds: ['leet'] });
  assertEqual(target.goalValue, 2, 'legacy categories fall back to existing goal value');
}
// ---- weekly review logic ----
{
  assertEqual(rangeEndingOn('2026-06-07', 3), ['2026-06-05', '2026-06-06', '2026-06-07'], 'rangeEndingOn returns ordered local date keys');
}

{
  const categories = [
    { id: 'leet', goalType: 'count', goalValue: 2, baselineGoalValue: 1, focusGoalValue: 4, archived: false },
    { id: 'oss', goalType: 'minutes', goalValue: 30, baselineGoalValue: 10, focusGoalValue: 60, archived: false },
  ];
  const dayModes = [
    { id: 'balanced', focusCategoryIds: [] },
    { id: 'leetcode_heavy', focusCategoryIds: ['leet'] },
  ];
  const data = {
    dailyPlanning: { defaultModeId: 'balanced' },
    days: {
      '2026-06-05': {
        coinsEarned: 10,
        categoryProgress: {
          leet: { count: 1, minutes: 20, sessions: [{ id: 's1' }] },
          oss: { count: 0, minutes: 10, sessions: [{ id: 's2' }] },
        },
      },
      '2026-06-06': {
        plan: { modeId: 'leetcode_heavy' },
        coinsEarned: 20,
        categoryProgress: {
          leet: { count: 4, minutes: 80, sessions: [{ id: 's3' }] },
          oss: { count: 0, minutes: 5, sessions: [] },
        },
      },
    },
  };
  const review = reviewForRange(data, categories, dayModes, '2026-06-07', 3);
  assertEqual(review.baselineCompleteDays, 1, 'weekly review counts days where baselines are complete');
  assertEqual(review.missionCompleteDays, 1, 'weekly review counts fully complete daily missions');
  assertEqual(review.totalSessions, 3, 'weekly review totals sessions across active categories');
  assertEqual(review.totalCoins, 30, 'weekly review totals coins across the range');
  assertEqual(review.weakestCategoryId, 'oss', 'weekly review identifies the weakest category by completion ratio');
}
// ---- default flexible goal data ----
{
  const data = createDefaultData();
  const leet = data.categories.find((c) => c.id === 'cat_leetcode');
  assertEqual(leet.baselineGoalValue, 1, 'default LeetCode baseline is lower than the old static goal');
  assertEqual(leet.focusGoalValue, 4, 'default LeetCode focus target supports heavy days');
  assertTrue(Array.isArray(data.dailyPlanning.dayModes), 'default data includes configurable day modes');
  assertTrue(data.dailyPlanning.dayModes.some((m) => m.id === 'leetcode_heavy'), 'default day modes include LeetCode heavy');
  assertEqual(data.dailyPlanning.defaultModeId, 'balanced', 'balanced is the default day mode');
}
// ---- focus clock / background-safe timing ----
{
  const store = new Store();
  store._scheduleSave = () => {};
  store.logSession({ categoryId: 'cat_leetcode', seconds: 60, count: 1, completed: true });
  const progress = store.data.days[todayKey()].categoryProgress.cat_leetcode;
  assertEqual(progress.goalMet, true, 'session progress uses the selected day mode target');
  assertEqual(store.data.streaks.cat_leetcode.current, 1, 'category streak uses the selected day mode target');
}

{
  const store = new Store();
  store._scheduleSave = () => {};
  const startKey = addDays(todayKey(), -1);
  const [year, month, day] = startKey.split('-').map(Number);
  const startedAt = new Date(year, month - 1, day, 23, 55).toISOString();
  store.logSession({ categoryId: 'cat_leetcode', seconds: 600, count: 1, completed: true, startedAt });
  assertTrue(!!store.data.days[startKey], 'cross-midnight sessions credit the local day they started');
}

{
  const store = new Store();
  store._scheduleSave = () => {};
  const partial = store.importData({ profile: { displayName: 'Imported student' }, categories: [] });
  assertEqual(partial.ok, true, 'partial older backups receive current safe defaults');
  assertEqual(store.data.settings.remindersEnabled, true, 'backup migration restores missing settings');
  assertEqual(store.importData({ profile: {}, categories: {} }).ok, false, 'malformed category data is rejected without throwing');
}

{
  const store = new Store();
  store._scheduleSave = () => {};
  const entry = store.beginSessionLog({
    categoryId: 'cat_leetcode',
    intent: 'Recovery test',
    timer: { mode: 'stopwatch', workSec: 0, breakSec: 0, state: { elapsedMs: 0 } },
  });
  store.checkpointSessionLog(entry.id, { elapsedMs: 5000, running: false }, 3);
  assertEqual(store.data.worklog[0].timer.state.elapsedMs, 5000, 'active session checkpoints are persisted in the worklog');
  assertEqual(store.data.worklog[0].count, 3, 'active session checkpoints preserve the session count');
}

{
  const store = new Store();
  store._scheduleSave = () => {};
  store.data.worklog.push({
    id: 'recover-log',
    status: 'active',
    categoryId: 'cat_leetcode',
    startedAt: new Date(Date.now() - 5000).toISOString(),
    intent: 'Resume this task',
    timer: {
      mode: 'stopwatch',
      workSec: 0,
      breakSec: 0,
      state: { phase: 'work', remainingMs: 0, elapsedMs: 0, accumulatedWorkMs: 0, running: true, lastTickMs: Date.now() - 5000 },
    },
  });
  restoreActiveSession(store);
  assertEqual(getActiveCategoryId(), 'cat_leetcode', 'startup recovery restores the single-session lock');
  assertTrue(getActiveSessionInfo().elapsedSec >= 5, 'startup recovery advances persisted focused time');
}

{
  const store = new Store();
  store._scheduleSave = () => {};
  store.data.worklog.push({ id: 'earned-session', type: 'session', status: 'completed' });
  assertEqual(store.deleteWorklogEntry('earned-session').ok, false, 'reward-bearing session logs cannot be deleted independently');
  assertEqual(store.updateWorklogEntry('earned-session', {}).ok, false, 'reward-bearing session logs cannot be edited independently');
}

{
  const store = new Store();
  store._scheduleSave = () => {};
  const first = { categoryId: 'cat_leetcode', startedAt: '2026-06-17T13:00:00.000Z', endedAt: '2026-06-17T14:00:00.000Z' };
  store.addManualWorklogEntry(first);
  const blocked = store.addManualWorklogEntry({ ...first, startedAt: '2026-06-17T13:30:00.000Z', endedAt: '2026-06-17T14:30:00.000Z' });
  assertEqual(blocked.conflict, true, 'manual entries report accidental time overlaps');
  const allowed = store.addManualWorklogEntry({ ...first, allowOverlap: true });
  assertEqual(allowed.ok, true, 'manual entries allow an explicitly confirmed overlap');
}

{
  const originalWindow = globalThis.window;
  const originalConsoleError = console.error;
  globalThis.window = { api: { saveData: async () => ({ ok: false, error: 'Disk full' }) } };
  console.error = () => {};
  const store = new Store();
  await store._saveNow();
  assertEqual(store.saveState, { status: 'error', error: 'Disk full' }, 'failed IPC saves remain visible in Store state');
  console.error = originalConsoleError;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

{
  let now = 1_000;
  const clock = new FocusClock({ mode: 'stopwatch', now: () => now });
  now += 5_000;
  clock.advance();
  assertEqual(clock.snapshot().elapsedSec, 5, 'stopwatch catches up from wall-clock elapsed time');
  assertEqual(clock.snapshot().accumulatedWorkSec, 5, 'stopwatch logs wall-clock work seconds');
}

{
  let now = 1_000;
  const clock = new FocusClock({ mode: 'countdown', workSec: 10, now: () => now });
  now += 25_000;
  const events = clock.advance();
  assertEqual(clock.snapshot().remainingSec, 0, 'countdown clamps to zero after a delayed background tick');
  assertEqual(clock.snapshot().accumulatedWorkSec, 10, 'countdown logs only the configured work duration');
  assertEqual(events, ['countdown-complete'], 'countdown emits completion once when delayed past zero');
}

{
  let now = 1_000;
  const clock = new FocusClock({ mode: 'pomodoro', workSec: 5, breakSec: 3, now: () => now });
  now += 6_000;
  const events = clock.advance();
  const snap = clock.snapshot();
  assertEqual(events, ['work-complete'], 'pomodoro rolls from work to break across a delayed tick');
  assertEqual(snap.phase, 'break', 'pomodoro enters break phase after work completes');
  assertEqual(snap.remainingSec, 2, 'pomodoro carries leftover delayed time into the break phase');
  assertEqual(snap.accumulatedWorkSec, 5, 'pomodoro logs only work-phase seconds during break rollover');
}

{
  let now = 1_000;
  const clock = new FocusClock({ mode: 'pomodoro', workSec: 5, breakSec: 3, now: () => now });
  now += 17_000;
  const events = clock.advance();
  const snap = clock.snapshot();
  assertEqual(events, ['work-complete', 'break-complete', 'work-complete', 'break-complete'], 'pomodoro catches up across multiple delayed phases');
  assertEqual(snap.phase, 'work', 'pomodoro lands in the correct phase after multi-cycle catch-up');
  assertEqual(snap.remainingSec, 4, 'pomodoro preserves leftover time after multi-cycle catch-up');
  assertEqual(snap.accumulatedWorkSec, 11, 'pomodoro accumulates only work phases across multi-cycle catch-up');
}

{
  let now = 1_000;
  const clock = new FocusClock({ mode: 'stopwatch', now: () => now });
  now += 2_000;
  clock.advance();
  clock.setRunning(false);
  now += 20_000;
  clock.advance();
  assertEqual(clock.snapshot().accumulatedWorkSec, 2, 'paused stopwatch does not accumulate background time');
  clock.setRunning(true);
  now += 3_000;
  clock.advance();
  assertEqual(clock.snapshot().accumulatedWorkSec, 5, 'resumed stopwatch continues from laptop time');
}

{
  let now = 1_000;
  const original = new FocusClock({ mode: 'stopwatch', now: () => now });
  now += 4_000;
  original.advance();
  const restored = new FocusClock({ mode: 'stopwatch', now: () => now, state: original.exportState() });
  now += 3_000;
  restored.advance();
  assertEqual(restored.snapshot().accumulatedWorkSec, 7, 'restored clocks continue from persisted wall time');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
