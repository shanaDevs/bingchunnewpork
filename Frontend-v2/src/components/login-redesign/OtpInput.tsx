"use client";

import { useState, type Ref } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { OTP_LENGTH } from "./useOtpCode";

type OtpInputProps = {
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  /** The digits typed so far. */
  code: string;
  /** Called with the digits only, at most OTP_LENGTH of them. */
  onChange: (digits: string) => void;
  /** Marks the boxes as wrong (rose) and shakes them. */
  invalid?: boolean;
  /** Change it on each failed try, so the boxes shake again even when the message is the same. */
  shakeKey?: number;
  disabled?: boolean;
  describedBy?: string;
};

/**
 * A one-time code, drawn as six boxes. It is one field: the transparent input lies over the boxes and takes
 * the typing, so pasting a whole code works, and phones can offer the code from an incoming SMS
 * (autocomplete="one-time-code"). Label it with a <label htmlFor={id}>.
 */
export function OtpInput({ id, inputRef, code, onChange, invalid = false, shakeKey = 0, disabled = false, describedBy }: OtpInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      {/* Keyed by failed tries, so each one shakes the boxes again (the input itself keeps focus). */}
      <div key={shakeKey} aria-hidden="true" className={cn("grid grid-cols-6 gap-2 sm:gap-2.5", invalid && "animate-shake")}>
        {Array.from({ length: OTP_LENGTH }, (_, index) => (
          <span
            key={index}
            className={cn(
              "font-numeric grid h-13 place-items-center low:h-12 rounded-[0.875rem] bg-slate-50/70 text-xl font-extrabold text-brand-950 ring-1 ring-slate-200 transition-[box-shadow,background-color] ring-inset",
              invalid ? "bg-rose-50/50 ring-rose-300" : code[index] && "bg-white ring-brand-300",
              // The box being typed into, while the field has focus.
              focused &&
                !disabled &&
                index === Math.min(code.length, OTP_LENGTH - 1) &&
                "bg-white shadow-[0_0_0_4px_rgb(48_121_234/0.14)] ring-brand-500",
            )}
          >
            {code[index] ?? ""}
          </span>
        ))}
      </div>
      <input
        ref={inputRef}
        id={id}
        value={code}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={OTP_LENGTH}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 size-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
      />
    </div>
  );
}
