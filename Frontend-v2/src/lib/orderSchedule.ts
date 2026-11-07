import { formatTime } from '@/lib/datetime';

/** @deprecated use per-store pickupCutoffMinutes from DB */
export const SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE = 50;
export const MIN_PRESET_LEAD_MINUTES = 15;
export const MIN_CUSTOM_SCHEDULE_LEAD_MINUTES = 45;
/** @deprecated use MIN_CUSTOM_SCHEDULE_LEAD_MINUTES */
export const MIN_SCHEDULE_LEAD_MINUTES = MIN_CUSTOM_SCHEDULE_LEAD_MINUTES;
export const TIME_INPUT_STEP_MINUTES = 5;

export const ORDER_SCHEDULE_PRESETS = [
  { minutes: 15 as const, label: '15 min', description: 'Ready in about 15 minutes' },
  { minutes: 30 as const, label: '30 min', description: 'Schedule for 30 minutes' },
  { minutes: 45 as const, label: '45 min', description: 'Schedule for 45 minutes' },
];

export type OrderSchedulePresetMinutes = (typeof ORDER_SCHEDULE_PRESETS)[number]['minutes'];

export type SchedulePickerMode = OrderSchedulePresetMinutes | 'custom';

export function isPresetScheduleMode(
  mode: SchedulePickerMode | null | undefined,
): mode is OrderSchedulePresetMinutes {
  return mode === 15 || mode === 30 || mode === 45;
}

function resolveIsPreset(
  scheduleMode: SchedulePickerMode | null | undefined,
  iso: string,
  openTime: string,
  closeTime: string,
  now = new Date(),
): boolean {
  if (scheduleMode === 'custom') return false;
  if (isPresetScheduleMode(scheduleMode)) return true;
  return matchesPresetSlot(iso, openTime, closeTime, now);
}

export function parseTimeOnDate(time: string, baseDate: Date): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(baseDate);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function formatTimeInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatScheduledTime(date: Date): string {
  return formatTime(date);
}

export function formatScheduledLabel(iso: string | null | undefined): string {
  if (!iso) return 'As soon as ready';
  return formatScheduledTime(new Date(iso));
}

export function roundUpToMinutes(date: Date, stepMinutes: number): Date {
  const stepMs = stepMinutes * 60_000;
  return new Date(Math.ceil(date.getTime() / stepMs) * stepMs);
}

export function getStoreCloseToday(closeTime: string, now = new Date()): Date {
  return parseTimeOnDate(closeTime, now);
}

/** Scheduling is locked within pickupCutoffMinutes of the effective closing time. */
export function isSchedulingLocked(
  closeTime: string,
  now = new Date(),
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
): boolean {
  const close = getStoreCloseToday(closeTime, now);
  const lockAt = new Date(close.getTime() - pickupCutoffMinutes * 60_000);
  return now.getTime() >= lockAt.getTime();
}

function minTimeFromLead(
  openTime: string,
  leadMinutes: number,
  now = new Date(),
): Date {
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

export function getScheduleTimeBounds(
  openTime: string,
  closeTime: string,
  now = new Date(),
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
) {
  const open = parseTimeOnDate(openTime, now);
  const close = getStoreCloseToday(closeTime, now);
  const presetMinTime = minTimeFromLead(openTime, MIN_PRESET_LEAD_MINUTES, now);
  const minTime = minTimeFromLead(openTime, MIN_CUSTOM_SCHEDULE_LEAD_MINUTES, now);
  const maxTime = new Date(close.getTime() - pickupCutoffMinutes * 60_000);
  const locked = isSchedulingLocked(closeTime, now, pickupCutoffMinutes);
  const canSchedule =
    !locked && presetMinTime.getTime() < maxTime.getTime() && now.getTime() < maxTime.getTime();

  return { open, close, presetMinTime, minTime, maxTime, locked, canSchedule };
}

function matchesPresetSlot(
  iso: string,
  openTime: string,
  closeTime: string,
  now = new Date(),
): boolean {
  for (const preset of ORDER_SCHEDULE_PRESETS) {
    const expected = scheduledAtFromPresetMinutes(preset.minutes, openTime, closeTime, now);
    if (expected && Math.abs(new Date(expected).getTime() - new Date(iso).getTime()) < 60_000) {
      return true;
    }
  }
  return false;
}

/** True when the scheduled ISO time is before now or before the allowed lead window. */
export function isScheduledAtInPast(
  iso: string | null | undefined,
  openTime: string,
  closeTime: string,
  now = new Date(),
  scheduleMode?: SchedulePickerMode | null,
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
): boolean {
  if (!iso) return false;
  const { minTime, locked } = getScheduleTimeBounds(openTime, closeTime, now, pickupCutoffMinutes);
  if (locked) return false;
  const scheduled = new Date(iso);
  if (Number.isNaN(scheduled.getTime())) return true;

  if (scheduled.getTime() < now.getTime()) return true;

  const isPreset = resolveIsPreset(scheduleMode, iso, openTime, closeTime, now);
  if (isPreset) return false;

  return scheduled.getTime() < minTime.getTime();
}

export function validateScheduledAt(
  scheduledAt: string | null | undefined,
  openTime: string,
  closeTime: string,
  now = new Date(),
  scheduleMode?: SchedulePickerMode | null,
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
  const isPreset = resolveIsPreset(scheduleMode, scheduledAt, openTime, closeTime, now);

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

export function clampScheduledAt(
  iso: string | null | undefined,
  openTime: string,
  closeTime: string,
  now = new Date(),
  scheduleMode?: SchedulePickerMode | null,
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
): string | null {
  if (!iso) return null;
  const { minTime, maxTime, locked, canSchedule } = getScheduleTimeBounds(
    openTime,
    closeTime,
    now,
    pickupCutoffMinutes,
  );
  if (locked || !canSchedule) return null;

  const scheduled = new Date(iso);
  if (Number.isNaN(scheduled.getTime())) return null;

  const isPreset = resolveIsPreset(scheduleMode, iso, openTime, closeTime, now);

  if (scheduled.getTime() < now.getTime()) {
    if (isPreset && isPresetScheduleMode(scheduleMode)) {
      const refreshed = scheduledAtFromPresetMinutes(scheduleMode, openTime, closeTime, now);
      if (refreshed) return refreshed;
    }
    return isPreset
      ? scheduledAtFromPresetMinutes(MIN_PRESET_LEAD_MINUTES, openTime, closeTime, now)
      : minTime.toISOString();
  }

  if (!isPreset && scheduled.getTime() < minTime.getTime()) {
    return minTime.toISOString();
  }
  if (scheduled.getTime() > maxTime.getTime()) {
    return maxTime.toISOString();
  }
  return iso;
}

export function scheduledAtFromTimeValue(
  timeValue: string,
  openTime: string,
  closeTime: string,
  now = new Date(),
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
): string | null {
  if (!timeValue) return null;

  const { minTime, maxTime, locked } = getScheduleTimeBounds(openTime, closeTime, now, pickupCutoffMinutes);
  if (locked) return null;

  const scheduled = parseTimeOnDate(timeValue, now);

  if (scheduled.getTime() <= now.getTime()) {
    return null;
  }
  if (scheduled.getTime() < minTime.getTime()) {
    return null;
  }
  if (scheduled.getTime() > maxTime.getTime()) {
    return null;
  }

  return scheduled.toISOString();
}

export function timeValueFromScheduledAt(iso: string | null | undefined): string {
  if (!iso) return '';
  return formatTimeInputValue(new Date(iso));
}

export function getDefaultScheduleTimeValue(
  openTime: string,
  closeTime: string,
  now = new Date(),
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
): string {
  const { minTime, canSchedule } = getScheduleTimeBounds(openTime, closeTime, now, pickupCutoffMinutes);
  if (!canSchedule) return '';
  return formatTimeInputValue(minTime);
}

export function scheduledAtFromPresetMinutes(
  minutes: OrderSchedulePresetMinutes,
  openTime: string,
  closeTime: string,
  now = new Date(),
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
): string | null {
  const { presetMinTime, maxTime, locked, canSchedule } = getScheduleTimeBounds(
    openTime,
    closeTime,
    now,
    pickupCutoffMinutes,
  );
  if (locked || !canSchedule) return null;
  if (minutes < MIN_PRESET_LEAD_MINUTES) return null;

  const target = roundUpToMinutes(
    new Date(now.getTime() + minutes * 60_000),
    TIME_INPUT_STEP_MINUTES,
  );

  if (target.getTime() < presetMinTime.getTime() || target.getTime() > maxTime.getTime()) {
    return null;
  }

  return target.toISOString();
}

export function isPresetMinutesAvailable(
  minutes: OrderSchedulePresetMinutes,
  openTime: string,
  closeTime: string,
  now = new Date(),
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
): boolean {
  return scheduledAtFromPresetMinutes(minutes, openTime, closeTime, now, pickupCutoffMinutes) != null;
}

export function detectScheduleMode(
  iso: string | null | undefined,
  openTime: string,
  closeTime: string,
  now = new Date(),
): SchedulePickerMode {
  if (!iso) return 15;

  for (const preset of ORDER_SCHEDULE_PRESETS) {
    const expected = scheduledAtFromPresetMinutes(preset.minutes, openTime, closeTime, now);
    if (expected && Math.abs(new Date(expected).getTime() - new Date(iso).getTime()) < 60_000) {
      return preset.minutes;
    }
  }

  return 'custom';
}

export function schedulePickupTimeLabel(iso: string | null | undefined): string {
  if (!iso) return 'As soon as ready';

  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (diff >= 12 && diff <= 18) return 'In 15 minutes';
  if (diff >= 27 && diff <= 33) return 'In 30 minutes';
  if (diff >= 42 && diff <= 48) return 'In 45 minutes';

  return formatScheduledTime(new Date(iso));
}

/** True when customer chose a future pickup/delivery slot (not ASAP-only window). */
export function hasActiveSchedule(
  scheduledAt: string | null | undefined,
  schedulingLocked: boolean,
): boolean {
  return !schedulingLocked && Boolean(scheduledAt);
}

/** Custom time picker only — preset tabs (15/30/45) may pay at counter. */
export function isCustomScheduledAt(
  scheduledAt: string | null | undefined,
  openTime: string,
  closeTime: string,
  schedulingLocked: boolean,
  now = new Date(),
  scheduleMode?: SchedulePickerMode | null,
): boolean {
  if (!hasActiveSchedule(scheduledAt, schedulingLocked)) return false;
  if (scheduleMode === 'custom') return true;
  if (isPresetScheduleMode(scheduleMode)) return false;
  return detectScheduleMode(scheduledAt, openTime, closeTime, now) === 'custom';
}
