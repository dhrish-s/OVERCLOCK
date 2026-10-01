'use strict';

function reminderIntervalMs(value, fallbackMinutes) {
  return Math.max(1, Number(value) || fallbackMinutes) * 60000;
}

function nextReminderDelay(settings, lastWaterAt, lastWalkAt, now = Date.now()) {
  if (!settings || settings.enabled === false) return null;
  const waterDueAt = lastWaterAt + reminderIntervalMs(settings.waterMinutes, 60);
  const walkDueAt = lastWalkAt + reminderIntervalMs(settings.walkMinutes, 90);
  return Math.max(1000, Math.min(waterDueAt, walkDueAt) - now);
}

module.exports = { nextReminderDelay, reminderIntervalMs };
