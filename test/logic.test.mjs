import {
  dateKey,
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
  monthMatrix,
  targetForCategory,
  progressForTarget,
  buildDailyMissions,
  dailyMissionStatus,
} from '../src/js/logic.js';
import { FocusClock } from '../src/js/focusClock.js';
import { createDefaultData } from '../src/js/state.js';

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
