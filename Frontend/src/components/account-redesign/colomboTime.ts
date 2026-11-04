"use client";

import { useEffect, useState } from "react";

/** Sri Lankan clock helpers for the account pages: Sri Lanka is UTC+5:30 all year, whatever the visitor's own time zone. */

const COLOMBO_OFFSET_MINUTES = 330;

const colomboClock = (date: Date) => new Date(date.getTime() + COLOMBO_OFFSET_MINUTES * 60_000);

/** The minute of the day in Sri Lanka (0–1439). */
export const colomboMinute = (date: Date) => {
  const local = colomboClock(date);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};

/** The day of the week in Sri Lanka, 0 = Sunday. */
export const colomboDay = (date: Date) => colomboClock(date).getUTCDay();

/** A minute of the day as a moment, for formatting as a time ("9:00 AM") with TIME_FORMAT. */
export const atMinute = (minute: number) => new Date(Date.UTC(2026, 0, 1, Math.floor(minute / 60), minute % 60) - COLOMBO_OFFSET_MINUTES * 60_000);

/** "3:00 PM", in Sri Lanka's time. */
export const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Colombo" };

/** The part of the day in Sri Lanka: morning 5–12, afternoon 12–5, evening 5–9, night 9–5. */
export type DayPart = "morning" | "afternoon" | "evening" | "night";
export function dayPartAt(date: Date): DayPart {
  const hour = Math.floor(colomboMinute(date) / 60);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/** The time now, updated every `everyMs`. */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** "Good evening, Amaya": the greeting for the time of day, with the first name. */
export const GREETINGS: Record<DayPart, (name: string) => string> = {
  morning: (name) => `Good morning, ${name}`,
  afternoon: (name) => `Good afternoon, ${name}`,
  evening: (name) => `Good evening, ${name}`,
  night: (name) => `Still up, ${name}?`,
};

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
