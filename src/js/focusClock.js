// focusClock.js - pure focus-session clock state.
// Uses laptop wall-clock deltas instead of trusting setInterval cadence, so
// hidden/background renderer throttling cannot make logged work time drift.

function clampMs(ms) {
  return Math.max(0, Math.round(Number(ms) || 0));
}

function msToSec(ms) {
  return Math.round(ms / 1000);
}

export class FocusClock {
  constructor({ mode, workSec = 0, breakSec = 0, now = () => Date.now(), state = null }) {
    this.mode = mode;
    this.workMs = clampMs(workSec * 1000);
    this.breakMs = clampMs(breakSec * 1000);
    this.now = now;
    this.phase = 'work';
    this.remainingMs = mode === 'countdown' || mode === 'pomodoro' ? this.workMs : 0;
    this.elapsedMs = 0;
    this.accumulatedWorkMs = 0;
    this.running = true;
    this.lastTickMs = this.now();
    if (state) {
      this.phase = state.phase === 'break' ? 'break' : 'work';
      this.remainingMs = clampMs(state.remainingMs);
      this.elapsedMs = clampMs(state.elapsedMs);
      this.accumulatedWorkMs = clampMs(state.accumulatedWorkMs);
      this.running = state.running !== false;
      this.lastTickMs = clampMs(state.lastTickMs || this.lastTickMs);
    }
  }

  exportState() {
    return {
      phase: this.phase,
      remainingMs: this.remainingMs,
      elapsedMs: this.elapsedMs,
      accumulatedWorkMs: this.accumulatedWorkMs,
      running: this.running,
      lastTickMs: this.lastTickMs,
    };
  }

  snapshot() {
    return {
      mode: this.mode,
      phase: this.phase,
      running: this.running,
      elapsedSec: msToSec(this.elapsedMs),
      remainingSec: msToSec(this.remainingMs),
      accumulatedWorkSec: msToSec(this.accumulatedWorkMs),
    };
  }

  advance(nowMs = this.now()) {
    const targetMs = clampMs(nowMs);
    const deltaMs = Math.max(0, targetMs - this.lastTickMs);
    this.lastTickMs = targetMs;
    if (!this.running || deltaMs === 0) return [];

    if (this.mode === 'stopwatch') {
      this.elapsedMs += deltaMs;
      this.accumulatedWorkMs += deltaMs;
      return [];
    }

    if (this.mode === 'countdown') {
      const consumed = Math.min(deltaMs, this.remainingMs);
      this.remainingMs -= consumed;
      this.accumulatedWorkMs += consumed;
      if (this.remainingMs === 0) {
        this.running = false;
        return ['countdown-complete'];
      }
      return [];
    }

    return this.advancePomodoro(deltaMs);
  }

  advancePomodoro(deltaMs) {
    const events = [];
    let remainingDelta = deltaMs;

    while (remainingDelta > 0 && this.running) {
      const phaseBudget = this.phase === 'work' ? this.workMs : this.breakMs;
      const phaseRemaining = this.remainingMs || phaseBudget || 1000;
      const consumed = Math.min(remainingDelta, phaseRemaining);

      if (this.phase === 'work') this.accumulatedWorkMs += consumed;
      this.remainingMs = Math.max(0, phaseRemaining - consumed);
      remainingDelta -= consumed;

      if (this.remainingMs > 0) break;

      if (this.phase === 'work') {
        events.push('work-complete');
        this.phase = 'break';
        this.remainingMs = this.breakMs || 1000;
      } else {
        events.push('break-complete');
        this.phase = 'work';
        this.remainingMs = this.workMs || 1000;
      }
    }

    return events;
  }

  setRunning(nextRunning, nowMs = this.now()) {
    this.advance(nowMs);
    this.running = !!nextRunning;
    this.lastTickMs = clampMs(nowMs);
  }

  toggle(nowMs = this.now()) {
    this.setRunning(!this.running, nowMs);
  }

  reset(nowMs = this.now()) {
    this.phase = 'work';
    this.remainingMs = this.mode === 'countdown' || this.mode === 'pomodoro' ? this.workMs : 0;
    this.elapsedMs = 0;
    this.accumulatedWorkMs = 0;
    this.lastTickMs = clampMs(nowMs);
  }
}
