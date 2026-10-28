export const SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE = 50;
export const MIN_PRESET_LEAD_MINUTES = 15;
export const MIN_CUSTOM_SCHEDULE_LEAD_MINUTES = 45;
export const MIN_SCHEDULE_LEAD_MINUTES = MIN_CUSTOM_SCHEDULE_LEAD_MINUTES;
export const TIME_INPUT_STEP_MINUTES = 5;

const PRESET_MINUTES = [15, 30, 45] as const;

export type ScheduleMode = (typeof PRESET_MINUTES)[number] | 'custom';

function isPresetScheduleMode(mode: ScheduleMode | null | undefined): mode is (typeof PRESET_MINUTES)[number] {
  return mode === 15 || mode === 30 || mode === 45;
}

function resolveIsPreset(
  scheduleMode: ScheduleMode | null | undefined,
  selected: Date,
  openTime: string,
  closeTime: string,
  now = new Date(),
): boolean {
  if (scheduleMode === 'custom') return false;
  if (isPresetScheduleMode(scheduleMode)) return true;
  return matchesPresetSlot(selected, openTime, closeTime, now);
}

function parseTimeOnDate(time: string, baseDate: Date): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(baseDate);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function getStoreCloseToday(closeTime: string, now = new Date()): Date {
  return parseTimeOnDate(closeTime, now);
}

function roundUpToMinutes(date: Date, stepMinutes: number): Date {
  const stepMs = stepMinutes * 60_000;
  return new Date(Math.ceil(date.getTime() / stepMs) * stepMs);
}

function isSchedulingLocked(
  closeTime: string,
  now = new Date(),
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
): boolean {
  const close = getStoreCloseToday(closeTime, now);
  const lockAt = new Date(close.getTime() - pickupCutoffMinutes * 60_000);
  return now.getTime() >= lockAt.getTime();
}

function minTimeFromLead(openTime: string, leadMinutes: number, now = new Date()): Date {
  const open = parseTimeOnDate(openTime, now);
  const minFromLead = roundUpToMinutes(
    new Date(now.getTime() + leadMinutes * 60_000),
    TIME_INPUT_STEP_MINUTES,
  );
  return roundUpToMinutes(
    new Date(Math.max(minFromLead.getTime(), open.getTime())),
    TIME_INPUT_STEP_MINUTES,
  );
}

function getScheduleTimeBounds(
  openTime: string,
  closeTime: string,
  now = new Date(),
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
) {
  const close = getStoreCloseToday(closeTime, now);
  const presetMinTime = minTimeFromLead(openTime, MIN_PRESET_LEAD_MINUTES, now);
  const minTime = minTimeFromLead(openTime, MIN_CUSTOM_SCHEDULE_LEAD_MINUTES, now);
  const maxTime = new Date(close.getTime() - pickupCutoffMinutes * 60_000);
  const locked = isSchedulingLocked(closeTime, now, pickupCutoffMinutes);
  const canSchedule =
    !locked && presetMinTime.getTime() < maxTime.getTime() && now.getTime() < maxTime.getTime();
  return { close, presetMinTime, minTime, maxTime, locked, canSchedule };
}

function scheduledAtFromPresetMinutes(
  minutes: number,
  openTime: string,
  closeTime: string,
  now = new Date(),
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
): Date | null {
  const { presetMinTime, maxTime, locked, canSchedule } = getScheduleTimeBounds(
    openTime,
    closeTime,
    now,
    pickupCutoffMinutes,
  );
  if (locked || !canSchedule) return null;
  if (minutes < MIN_PRESET_LEAD_MINUTES) return null;

  const target = roundUpToMinutes(new Date(now.getTime() + minutes * 60_000), TIME_INPUT_STEP_MINUTES);
  if (target.getTime() < presetMinTime.getTime() || target.getTime() > maxTime.getTime()) return null;

  return target;
}

function matchesPresetSlot(
  selected: Date,
  openTime: string,
  closeTime: string,
  now = new Date(),
): boolean {
  for (const minutes of PRESET_MINUTES) {
    const expected = scheduledAtFromPresetMinutes(minutes, openTime, closeTime, now);
    if (expected && Math.abs(expected.getTime() - selected.getTime()) < 60_000) {
      return true;
    }
  }
  return false;
}

export function isCustomScheduledAt(
  scheduledAt: string | undefined | null,
  openTime: string,
  closeTime: string,
  now = new Date(),
  scheduleMode?: ScheduleMode | null,
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
): boolean {
  if (!scheduledAt || isSchedulingLocked(closeTime, now, pickupCutoffMinutes)) return false;

  const selected = new Date(scheduledAt);
  if (Number.isNaN(selected.getTime())) return false;

  if (scheduleMode === 'custom') return true;
  if (isPresetScheduleMode(scheduleMode)) return false;

  return !matchesPresetSlot(selected, openTime, closeTime, now);
}

export function validateScheduledAt(
  scheduledAt: string | undefined | null,
  openTime: string,
  closeTime: string,
  now = new Date(),
  scheduleMode?: ScheduleMode | null,
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
): { ok: true; date: Date | null } | { ok: false; error: string } {
  if (!scheduledAt) {
    if (isSchedulingLocked(closeTime, now, pickupCutoffMinutes)) {
      return { ok: true, date: null };
    }
    return { ok: false, error: 'Please select a pickup time' };
  }

  if (isSchedulingLocked(closeTime, now, pickupCutoffMinutes)) {
    return {
      ok: false,
      error: `Scheduled orders are unavailable within ${pickupCutoffMinutes} minutes of closing`,
    };
  }

  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'Invalid scheduled time' };
  }

  if (date.getTime() < now.getTime()) {
    return { ok: false, error: 'Selected time is in the past. Please choose a future time.' };
  }

  const { minTime, maxTime } = getScheduleTimeBounds(openTime, closeTime, now, pickupCutoffMinutes);
  const isPreset = resolveIsPreset(scheduleMode, date, openTime, closeTime, now);

  if (!isPreset && date.getTime() < minTime.getTime()) {
    return {
      ok: false,
      error: `Please choose a time at least ${MIN_CUSTOM_SCHEDULE_LEAD_MINUTES} minutes from now`,
    };
  }

  if (date.getTime() > maxTime.getTime()) {
    return { ok: false, error: 'Selected time is after the last available pickup slot' };
  }

  return { ok: true, date };
}
