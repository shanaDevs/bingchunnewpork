'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ORDER_SCHEDULE_PRESETS,
  clampScheduledAt,
  detectScheduleMode,
  formatScheduledTime,
  formatTimeInputValue,
  getDefaultScheduleTimeValue,
  getScheduleTimeBounds,
  MIN_CUSTOM_SCHEDULE_LEAD_MINUTES,
  isPresetMinutesAvailable,
  isScheduledAtInPast,
  scheduledAtFromPresetMinutes,
  scheduledAtFromTimeValue,
  SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
  timeValueFromScheduledAt,
  type OrderSchedulePresetMinutes,
  type SchedulePickerMode,
} from '@/lib/orderSchedule';

interface Props {
  value: string | null;
  onChange: (iso: string | null) => void;
  scheduleMode: SchedulePickerMode | null;
  onScheduleModeChange: (mode: SchedulePickerMode | null) => void;
  orderMode: 'DELIVERY' | 'TAKEAWAY';
  openTime: string;
  closeTime: string;
  pickupCutoffMinutes?: number;
}

function tabClass(active: boolean, disabled = false) {
  return `schedule-picker__tab rounded-lg border px-2 sm:px-3 h-[38px] sm:h-[42px] inline-flex items-center justify-center text-xs sm:text-sm font-semibold transition-all w-full sm:w-auto ${
    disabled
      ? 'opacity-40 cursor-not-allowed border-navy-border text-muted bg-navy-light/20'
      : active
        ? 'border-brand bg-brand-subtle text-brand'
        : 'border-navy-border text-fg hover:border-brand/60 bg-navy-light/30 cursor-pointer'
  }`;
}

export default function OrderSchedulePicker({
  value,
  onChange,
  scheduleMode,
  onScheduleModeChange,
  openTime,
  closeTime,
  pickupCutoffMinutes = SCHEDULE_LOCK_MINUTES_BEFORE_CLOSE,
}: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const bounds = useMemo(
    () => getScheduleTimeBounds(openTime, closeTime, now, pickupCutoffMinutes),
    [openTime, closeTime, now, pickupCutoffMinutes],
  );

  const timeInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<SchedulePickerMode>(() =>
    scheduleMode ?? detectScheduleMode(value, openTime, closeTime, now),
  );
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    if (scheduleMode) setMode(scheduleMode);
  }, [scheduleMode]);

  const timeValue = useMemo(() => {
    if (!value) return getDefaultScheduleTimeValue(openTime, closeTime, now, pickupCutoffMinutes);
    if (isScheduledAtInPast(value, openTime, closeTime, now, scheduleMode ?? mode, pickupCutoffMinutes)) {
      return formatTimeInputValue(bounds.minTime);
    }
    const scheduled = new Date(value);
    if (scheduled.getTime() > bounds.maxTime.getTime()) {
      return formatTimeInputValue(bounds.maxTime);
    }
    return timeValueFromScheduledAt(value);
  }, [value, openTime, closeTime, now, bounds.minTime, bounds.maxTime, scheduleMode, mode, pickupCutoffMinutes]);

  useEffect(() => {
    if (bounds.locked || !bounds.canSchedule) {
      if (value) onChange(null);
      return;
    }

    if (value && isScheduledAtInPast(value, openTime, closeTime, now, scheduleMode ?? mode, pickupCutoffMinutes)) {
      const clamped = clampScheduledAt(value, openTime, closeTime, now, scheduleMode ?? mode, pickupCutoffMinutes);
      if (clamped !== value) {
        onChange(clamped);
        const isCustom = (scheduleMode ?? mode) === 'custom';
        toast.error(
          isCustom
            ? `Pickup time updated — choose at least ${MIN_CUSTOM_SCHEDULE_LEAD_MINUTES} minutes from now`
            : 'Pickup time updated to the next available slot',
          { id: 'schedule-time-clamped' },
        );
      }
      return;
    }

    if (value) {
      const detected = detectScheduleMode(value, openTime, closeTime, now);
      setMode(scheduleMode ?? detected);
    }
  }, [
    bounds.locked,
    bounds.canSchedule,
    value,
    onChange,
    openTime,
    closeTime,
    now,
    scheduleMode,
    mode,
    pickupCutoffMinutes,
  ]);

  useEffect(() => {
    if (!customOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setCustomOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [customOpen]);

  useEffect(() => {
    if (!customOpen) return;
    timeInputRef.current?.focus({ preventScroll: true });
  }, [customOpen]);

  function selectPreset(minutes: OrderSchedulePresetMinutes) {
    const iso = scheduledAtFromPresetMinutes(minutes, openTime, closeTime, now, pickupCutoffMinutes);
    if (!iso) return;
    setMode(minutes);
    onScheduleModeChange(minutes);
    setCustomOpen(false);
    onChange(iso);
  }

  function selectCustomTime(timeValueInput: string) {
    const freshNow = new Date();
    let iso = scheduledAtFromTimeValue(timeValueInput, openTime, closeTime, freshNow, pickupCutoffMinutes);
    if (!iso) {
      toast.error(
        `Please choose a time at least ${MIN_CUSTOM_SCHEDULE_LEAD_MINUTES} minutes from now`,
        { id: 'schedule-invalid-time' },
      );
      iso = scheduledAtFromTimeValue(
        formatTimeInputValue(bounds.minTime),
        openTime,
        closeTime,
        freshNow,
        pickupCutoffMinutes,
      );
      if (!iso) return;
    }
    setMode('custom');
    onScheduleModeChange('custom');
    onChange(iso);
  }

  function toggleCustomPicker() {
    setMode('custom');
    onScheduleModeChange('custom');
    const next = !customOpen;
    if (next) {
      const defaultIso = scheduledAtFromTimeValue(
        getDefaultScheduleTimeValue(openTime, closeTime, now, pickupCutoffMinutes),
        openTime,
        closeTime,
        now,
        pickupCutoffMinutes,
      );
      if (
        defaultIso &&
        (!value || isScheduledAtInPast(value, openTime, closeTime, now, 'custom', pickupCutoffMinutes))
      ) {
        onChange(defaultIso);
      }
    }
    setCustomOpen(next);
  }

  if (bounds.locked) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-amber-400 flex items-center gap-1.5">
          <Lock size={14} className="shrink-0" aria-hidden />
          Scheduling closed — last pickup slot was {pickupCutoffMinutes} min before close.
        </p>
        <p className="text-sm font-semibold text-fg">Selected time: ASAP</p>
      </div>
    );
  }

  if (!bounds.canSchedule) {
    return <p className="text-xs text-muted">No slots left today.</p>;
  }

  const selectedLabel = value
    ? formatScheduledTime(new Date(value))
    : 'Select a time';

  return (
    <div ref={pickerRef} className="schedule-picker space-y-3">
      <div className="schedule-picker__tabs grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {ORDER_SCHEDULE_PRESETS.map((preset) => {
          const available = isPresetMinutesAvailable(preset.minutes, openTime, closeTime, now, pickupCutoffMinutes);
          const active = mode === preset.minutes;
          return (
            <button
              key={preset.minutes}
              type="button"
              disabled={!available}
              onClick={() => selectPreset(preset.minutes)}
              className={tabClass(active, !available)}
              aria-pressed={active}
            >
              {preset.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={toggleCustomPicker}
          className={tabClass(mode === 'custom' || customOpen)}
          aria-label="Schedule a custom time"
          aria-expanded={customOpen}
          aria-controls="schedule-custom-panel"
        >
          <span className="whitespace-nowrap">Schedule</span>
        </button>
      </div>

      {customOpen && (
        <div
          id="schedule-custom-panel"
          className="schedule-picker__panel w-full rounded-xl border border-navy-border bg-navy-light/40 p-3"
          role="region"
          aria-label="Select custom time"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">
            Select time
          </p>
          <p className="text-xs text-muted mb-3">
            From {formatTimeInputValue(bounds.minTime)} · custom times need {MIN_CUSTOM_SCHEDULE_LEAD_MINUTES}+ min
          </p>
          <input
            ref={timeInputRef}
            type="time"
            value={timeValue}
            min={formatTimeInputValue(bounds.minTime)}
            max={formatTimeInputValue(bounds.maxTime)}
            step={300}
            onChange={(e) => selectCustomTime(e.target.value)}
            className="input-field w-full !py-2.5 !px-3 h-11 text-base sm:text-sm"
          />
        </div>
      )}

      <p className="text-sm text-fg">
        <span className="text-muted">Selected time: </span>
        <span className="font-semibold tabular-nums">{selectedLabel}</span>
      </p>
    </div>
  );
}
