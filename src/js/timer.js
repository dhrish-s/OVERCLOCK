// timer.js - the one piece of UI that's a true modal overlay rather than a
// view: starting a session expands into a focus card with a live clock,
// then a short "what did you get done" step on End, which is what actually
// calls store.logSession() and feeds the streak/coin/perfect-day machinery
// in state.js. A tiny pub-sub (onSessionEvent) lets the dashboard reflect
// "this category is ACTIVE right now" without timer.js knowing about the
// dashboard.

import { icon } from './icons.js';
import { FocusClock } from './focusClock.js';
import { formatDuration } from './logic.js';
import { showToast } from './notifications.js';
import { burstConfetti, burstLevelUp } from './confetti.js';

const listeners = new Set();
export function onSessionEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(evt) {
  if (evt.type === 'start') {
    activeSessionCategoryId = evt.categoryId;
    activeSessionInfo = evt.session;
  }
  if (evt.type === 'end' || evt.type === 'discard') {
    activeSessionCategoryId = null;
    activeSessionInfo = null;
  }
  for (const fn of listeners) fn(evt);
}

let activeSessionCategoryId = null;
let activeSessionInfo = null;
let activeModalOpen = false;
export function getActiveCategoryId() {
  return activeSessionCategoryId;
}

export function getActiveSessionInfo() {
  if (!activeSessionInfo) return null;
  const timer = activeSessionInfo.timer;
  if (!timer?.state) return { ...activeSessionInfo };
  const preview = new FocusClock({ mode: timer.mode, workSec: timer.workSec, breakSec: timer.breakSec, state: timer.state });
  preview.advance();
  return { ...activeSessionInfo, elapsedSec: preview.snapshot().accumulatedWorkSec };
}

export function restoreActiveSession(store) {
  const activeEntries = store.data.worklog
    .filter((entry) => entry.status === 'active')
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const entry = activeEntries[0];
  if (!entry) return null;
  for (const duplicate of activeEntries.slice(1)) store.discardSessionLog(duplicate.id);

  const category = store.getCategory(entry.categoryId);
  if (!category) {
    store.discardSessionLog(entry.id);
    return null;
  }
  const timer = entry.timer || {
    mode: category.timerMode,
    workSec: category.timerWorkSec,
    breakSec: category.timerBreakSec,
    state: {
      phase: 'work',
      remainingMs: (category.timerWorkSec || 0) * 1000,
      elapsedMs: 0,
      accumulatedWorkMs: 0,
      running: true,
      lastTickMs: new Date(entry.startedAt).getTime(),
    },
  };
  activeSessionCategoryId = category.id;
  activeSessionInfo = { logId: entry.id, categoryId: category.id, categoryName: category.name, startedAt: entry.startedAt, intent: entry.intent || '', timer };
  return getActiveSessionInfo();
}

export function resumeActiveSession(store) {
  if (!activeSessionInfo || activeModalOpen) return;
  const entry = store.data.worklog.find((item) => item.id === activeSessionInfo.logId);
  const category = entry ? store.getCategory(entry.categoryId) : null;
  if (entry && category) openFocusModal(category, store, { resumeLog: entry });
}

let audioCtx = null;
function beep(freq = 880, durationMs = 180) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durationMs / 1000);
    osc.stop(audioCtx.currentTime + durationMs / 1000 + 0.02);
  } catch (err) {
    // Audio is a nice-to-have; never let it break a session.
  }
}

export function openFocusModal(category, store, { resumeLog = null } = {}) {
  if (activeSessionCategoryId && resumeLog?.id !== activeSessionInfo?.logId) {
    const activeCategory = store.getCategory(activeSessionCategoryId);
    showToast({
      kind: 'info',
      title: 'Session already running',
      body: `End ${activeCategory?.name || 'the current session'} before starting another task.`,
      timeout: 5000,
    });
    return;
  }
  if (activeModalOpen) return;
  activeModalOpen = true;

  const soundOn = () => store.data.settings.soundEnabled !== false;
  const playBeep = (freq) => {
    if (soundOn()) beep(freq);
  };

  const overlay = document.createElement('div');
  overlay.className = 'overlay fade-in';
  const modal = document.createElement('div');
  modal.className = 'modal';
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const restoredTimer = resumeLog ? activeSessionInfo?.timer : null;
  const mode = restoredTimer?.mode || category.timerMode;
  const workSec = restoredTimer?.workSec ?? category.timerWorkSec;
  const breakSec = restoredTimer?.breakSec ?? category.timerBreakSec;
  const hasRing = mode === 'countdown' || mode === 'pomodoro';

  let clock = restoredTimer
    ? new FocusClock({ mode, workSec, breakSec, state: restoredTimer.state })
    : null;
  let sessionIntent = resumeLog?.intent || '';
  let count = 0;
  let intervalId = null;
  let unsubscribeDeadline = null;
  let ended = false;
  let noteStepSeconds = 0;
  let sessionLog = resumeLog;

  function totalForPhase() {
    return clock.snapshot().phase === 'work' ? workSec : breakSec;
  }

  function renderIntentStep() {
    modal.innerHTML = `
      <div class="modal-title">Start ${category.name}</div>
      <div class="modal-sub">Name the concrete thing you are about to finish.</div>
      <div class="field">
        <label for="ft-intent">Session intent</label>
        <textarea class="textarea" id="ft-intent" placeholder="e.g. Finish two graph problems, send three tailored applications, draft one README section..."></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn" id="ft-cancel-intent">Cancel</button>
        <button class="btn btn-primary" id="ft-start-intent">Start focus</button>
      </div>
    `;
    modal.querySelector('#ft-cancel-intent').addEventListener('click', () => closeAndDiscard());
    modal.querySelector('#ft-start-intent').addEventListener('click', () => {
      sessionIntent = modal.querySelector('#ft-intent').value.trim();
      clock = new FocusClock({
        mode,
        workSec,
        breakSec,
      });
      sessionLog = store.beginSessionLog({
        categoryId: category.id,
        intent: sessionIntent,
        timer: { mode, workSec, breakSec, state: clock.exportState() },
      });
      emit({
        type: 'start',
        categoryId: category.id,
        session: {
          logId: sessionLog.id,
          categoryId: category.id,
          categoryName: category.name,
          startedAt: sessionLog.startedAt,
          intent: sessionIntent,
          timer: sessionLog.timer,
        },
      });
      renderShell();
      startInterval();
      addClockListeners();
      schedulePhaseDeadline();
    });
    setTimeout(() => modal.querySelector('#ft-intent')?.focus(), 0);
  }

  function renderShell() {
    modal.innerHTML = `
      <div class="row between" style="margin-bottom:4px">
        <div class="modal-title"></div>
        <button class="btn btn-ghost btn-icon" id="ft-close" aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-sub"></div>
      <div class="focus-timer">
        ${
          hasRing
            ? `<div class="focus-ring-wrap">
                <svg class="progress-ring" width="210" height="210" viewBox="0 0 100 100">
                  <circle class="track" cx="50" cy="50" r="44"/>
                  <circle class="fill" id="ft-ring" cx="50" cy="50" r="44" pathLength="100"/>
                </svg>
                <div class="focus-center">
                  <span class="focus-phase-label" id="ft-phase"></span>
                  <span class="big-time mono" id="ft-time"></span>
                </div>
              </div>`
            : `<span class="focus-phase-label" id="ft-phase"></span>
               <span class="big-time mono" id="ft-time"></span>`
        }
        <div class="focus-controls">
          <button class="btn btn-icon" id="ft-toggle" data-tip="Pause / resume">${icon('pause', 16)}</button>
          <button class="btn btn-icon" id="ft-reset" data-tip="Reset clock">${icon('reset', 16)}</button>
          <button class="btn btn-primary" id="ft-end">End session</button>
        </div>
        <div class="focus-count-row">
          <span class="mute" style="font-size:12.5px"></span>
          <div class="stepper">
            <button id="ft-dec">−</button>
            <span class="val mono" id="ft-count">0</span>
            <button id="ft-inc">+</button>
          </div>
        </div>
      </div>
    `;
    modal.querySelector('.modal-title').textContent = category.name;
    modal.querySelector('.modal-sub').textContent =
      mode === 'pomodoro'
        ? 'Pomodoro - work and break cycle automatically until you end the session.'
        : mode === 'countdown'
        ? `Countdown from ${Math.round(workSec / 60)} minutes.`
        : 'Stopwatch - counts up freely.';
    modal.querySelector('.focus-count-row .mute').textContent = category.countLabel;

    modal.querySelector('#ft-close').addEventListener('click', () => closeAndDiscard());
    modal.querySelector('#ft-toggle').addEventListener('click', toggleRunning);
    modal.querySelector('#ft-reset').addEventListener('click', resetClock);
    modal.querySelector('#ft-end').addEventListener('click', goToEndStep);
    modal.querySelector('#ft-inc').addEventListener('click', () => {
      count += 1;
      modal.querySelector('#ft-count').textContent = String(count);
    });
    modal.querySelector('#ft-dec').addEventListener('click', () => {
      count = Math.max(0, count - 1);
      modal.querySelector('#ft-count').textContent = String(count);
    });

    updateDisplay();
  }

  function updateDisplay() {
    if (!clock) return;
    const snap = clock.snapshot();
    const timeEl = modal.querySelector('#ft-time');
    const phaseEl = modal.querySelector('#ft-phase');
    const toggleBtn = modal.querySelector('#ft-toggle');
    if (!timeEl) return;

    if (mode === 'stopwatch') {
      timeEl.textContent = formatDuration(snap.elapsedSec);
      phaseEl.textContent = snap.running ? 'RUNNING' : 'PAUSED';
    } else {
      timeEl.textContent = formatDuration(snap.remainingSec);
      phaseEl.textContent = mode === 'pomodoro' ? (snap.phase === 'work' ? 'FOCUS' : 'BREAK') : 'FOCUS';
      const ring = modal.querySelector('#ft-ring');
      if (ring) {
        const total = totalForPhase() || 1;
        const pct = 1 - snap.remainingSec / total;
        ring.parentElement.style.setProperty('--pct', String(Math.max(0, Math.min(1, pct))));
      }
    }
    if (toggleBtn) toggleBtn.innerHTML = icon(snap.running ? 'pause' : 'play', 16);
  }

  function handleClockEvents(events) {
    if (events.length === 0) return;
    const evt = events[events.length - 1];
    if (evt === 'work-complete') {
      playBeep(660);
      showToast({ kind: 'info', title: 'Break time', body: `Step away for ${Math.round((breakSec || 0) / 60)} minutes.`, timeout: 6000 });
    } else if (evt === 'break-complete') {
      playBeep(880);
      showToast({ kind: 'info', title: 'Back to focus', body: category.name, timeout: 5000 });
    } else if (evt === 'countdown-complete') {
      playBeep(660);
      showToast({ kind: 'info', title: "Time's up", body: `${category.name} countdown finished.`, timeout: 7000 });
    }
    schedulePhaseDeadline();
  }

  function schedulePhaseDeadline() {
    if (!clock || !sessionLog) return;
    const snap = clock.snapshot();
    if (!snap.running || mode === 'stopwatch') {
      window.api.cancelTimerDeadline();
      return;
    }
    const isBreak = snap.phase === 'break';
    window.api.scheduleTimerDeadline({
      sessionId: sessionLog.id,
      delayMs: snap.remainingSec * 1000,
      title: mode === 'countdown' ? "Time's up" : isBreak ? 'Back to focus' : 'Break time',
      body: mode === 'countdown' ? `${category.name} countdown finished.` : isBreak ? category.name : `Step away for ${Math.round((breakSec || 0) / 60)} minutes.`,
    });
  }

  function checkpointClock() {
    if (!clock || !sessionLog) return;
    const state = clock.exportState();
    if (activeSessionInfo?.logId === sessionLog.id) activeSessionInfo.timer.state = state;
    store.checkpointSessionLog(sessionLog.id, state);
  }

  function tick() {
    const events = clock.advance();
    handleClockEvents(events);
    if (events.length) checkpointClock();
    updateDisplay();
    return events;
  }

  function toggleRunning() {
    clock.toggle();
    checkpointClock();
    schedulePhaseDeadline();
    updateDisplay();
  }

  function resetClock() {
    clock.reset();
    checkpointClock();
    schedulePhaseDeadline();
    updateDisplay();
  }

  function startInterval() {
    if (intervalId) return;
    intervalId = setInterval(tick, 1000);
  }

  function stopInterval() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  function syncFromLaptopClock() {
    if (document.hidden) {
      const events = tick();
      if (!events.length) checkpointClock();
      stopInterval();
      return;
    }
    tick();
    startInterval();
  }

  function addClockListeners() {
    document.addEventListener('visibilitychange', syncFromLaptopClock);
    window.addEventListener('focus', syncFromLaptopClock);
    unsubscribeDeadline = window.api.onTimerDeadline((payload) => {
      if (payload.sessionId === sessionLog?.id) syncFromLaptopClock();
    });
  }

  function removeClockListeners() {
    document.removeEventListener('visibilitychange', syncFromLaptopClock);
    window.removeEventListener('focus', syncFromLaptopClock);
    if (unsubscribeDeadline) unsubscribeDeadline();
    unsubscribeDeadline = null;
  }

  function closeAndDiscard() {
    if (ended) return;
    if (!clock) {
      activeModalOpen = false;
      overlay.remove();
      return;
    }
    tick();
    if (clock.snapshot().accumulatedWorkSec > 5 || count > 0 || sessionIntent) {
      const sure = window.confirm('Discard this session? Nothing will be logged.');
      if (!sure) return;
    }
    stopInterval();
    window.api.cancelTimerDeadline();
    removeClockListeners();
    store.discardSessionLog(sessionLog?.id);
    emit({ type: 'discard', categoryId: category.id });
    activeModalOpen = false;
    overlay.remove();
  }

  function goToEndStep() {
    tick();
    clock.setRunning(false);
    noteStepSeconds = clock.snapshot().accumulatedWorkSec;
    stopInterval();
    window.api.cancelTimerDeadline();
    removeClockListeners();
    modal.innerHTML = `
      <div class="modal-title">Wrap up - ${category.name}</div>
      <div class="modal-sub mono"></div>
      <div class="field" style="margin-bottom:12px">
        <label>Intent</label>
        <div class="input mono" style="min-height:36px;white-space:normal" id="ft-intent-summary"></div>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label class="row" style="gap:8px;flex-direction:row;align-items:center"><input type="checkbox" id="ft-completed" checked/> Finished the intended outcome</label>
      </div>
      <div class="field">
        <label for="ft-note">What did you get done? (optional, goes in your work log)</label>
        <textarea class="textarea" id="ft-note" placeholder="e.g. Solved two graph problems, reviewed sliding-window pattern..."></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="ft-back">Back</button>
        <button class="btn btn-primary" id="ft-confirm">Log session</button>
      </div>
    `;
    const summaryParts = [];
    if (noteStepSeconds > 0) summaryParts.push(`${formatDuration(noteStepSeconds)} logged`);
    if (count > 0) summaryParts.push(`${count} ${category.countLabel.toLowerCase()}`);
    modal.querySelector('.modal-sub').textContent = summaryParts.join(' · ') || 'No time or count recorded yet.';
    modal.querySelector('#ft-intent-summary').textContent = sessionIntent || 'No intent written.';

    modal.querySelector('#ft-back').addEventListener('click', () => {
      renderShell();
      clock.setRunning(true);
      checkpointClock();
      startInterval();
      addClockListeners();
      schedulePhaseDeadline();
    });
    modal.querySelector('#ft-confirm').addEventListener('click', () => {
      const note = modal.querySelector('#ft-note').value;
      const completed = modal.querySelector('#ft-completed').checked;
      finishSession(note, completed);
    });
  }

  function finishSession(note, completed) {
    ended = true;
    const result = store.logSession({
      categoryId: category.id,
      seconds: noteStepSeconds,
      count,
      note,
      intent: sessionIntent,
      completed,
      logId: sessionLog?.id,
      startedAt: sessionLog?.startedAt,
    });
    emit({ type: 'end', categoryId: category.id, result });

    modal.innerHTML = `
      <div class="reward-reveal">
        <div class="reveal-icon">${icon('coin', 28)}</div>
        <div class="reveal-label"><span class="coin-tick accent">+${result.coinsEarned} coins</span></div>
        <div class="mute" style="font-size:13px"></div>
        <button class="btn btn-primary btn-block" id="ft-done">Done</button>
      </div>
    `;
    const subText = [];
    if (result.streakNow > 0) subText.push(`${category.name} streak: ${result.streakNow} day${result.streakNow === 1 ? '' : 's'}`);
    if (result.perfectDayJustHit) subText.push('Perfect day! +1 star');
    if (result.leveledUp) subText.push(`Leveled up to ${store.data.profile.level}!`);
    modal.querySelector('.mute').textContent = subText.join(' · ');

    if (result.perfectDayJustHit) burstConfetti(50);
    if (result.leveledUp) burstLevelUp();

    modal.querySelector('#ft-done').addEventListener('click', () => {
      removeClockListeners();
      activeModalOpen = false;
      overlay.remove();
    });
  }

  if (resumeLog) {
    renderShell();
    tick();
    startInterval();
    addClockListeners();
    schedulePhaseDeadline();
  } else {
    renderIntentStep();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeAndDiscard();
  });
}
