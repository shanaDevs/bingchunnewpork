"use client";

import { ArrowLeft, BadgeCheck, CircleAlert, Gift, Info, LoaderCircle, RotateCcw, ShieldCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import type { OtpIntent } from "@/lib/otpIntent";
import { authErrorMessage, displayPhone, groupLocalDigits, phoneFromLocalDigits, toLocalDigits } from "./loginHelpers";
import { useLoginMood } from "./loginMood";
import { OtpInput } from "./OtpInput";
import { useOtpCode } from "./useOtpCode";

/** The backend accepts names of 2 to 100 characters (PUT /auth/me). */
const NAME_MAX_LENGTH = 100;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
const primaryButton = cn(
  "inline-flex h-13 w-full items-center justify-center gap-2 rounded-full bg-linear-to-b low:h-12 from-brand-500 to-brand-600 text-[0.9375rem] font-semibold text-snow shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_10px_20px_-8px_rgb(31_98_214/0.6)] transition-[background-color,box-shadow,translate] hover:-translate-y-px hover:from-brand-600 hover:to-brand-700 hover:shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_14px_24px_-8px_rgb(31_98_214/0.65)] active:translate-y-0 disabled:translate-y-0 disabled:cursor-wait disabled:from-brand-500 disabled:to-brand-500",
  focusRing,
);
const textButton = cn("rounded font-semibold text-brand-700 underline-offset-2 hover:underline disabled:cursor-wait disabled:text-slate-400", focusRing);
const secondaryButton = cn(
  "inline-flex h-12.5 w-full low:h-11 items-center justify-center gap-3 rounded-full bg-white text-[0.9375rem] font-semibold text-slate-700 shadow-[0_1px_2px_rgb(15_33_71/0.06)] ring-1 ring-slate-200 transition-colors ring-inset hover:bg-slate-50 hover:ring-slate-300 disabled:cursor-wait disabled:text-slate-500",
  focusRing,
);
const backButton = cn(
  "-mt-1 mb-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-50 pr-3 pl-2 text-[0.8125rem] font-semibold text-brand-700 transition-colors hover:bg-brand-100",
  focusRing,
);
/** The field label, and the look of a text field (a ring that turns brand blue, with a soft halo, on focus). */
const fieldLabel = "block text-[0.9375rem] font-semibold text-slate-700";
const fieldRing = "ring-1 ring-inset transition-[box-shadow,background-color]";
const fieldValid = "bg-slate-50/70 ring-slate-200 hover:ring-slate-300";
const fieldInvalid = "animate-shake bg-rose-50/50 ring-rose-300";
const textField = cn(
  "mt-1.5 h-13 w-full rounded-[0.875rem] low:h-12 px-4 text-[0.9375rem] font-medium text-brand-950 outline-none placeholder:font-normal placeholder:text-slate-400 disabled:text-slate-500",
  fieldRing,
);
const fieldFocus = "focus:bg-white focus:shadow-[0_0_0_4px_rgb(48_121_234/0.14)] focus:ring-brand-500";
const fieldFocusInvalid = "focus:shadow-[0_0_0_4px_rgb(244_63_94/0.12)] focus:ring-rose-400";
/** A small note inside a step (the referral invite, Google coming soon). */
const noteBox = "flex items-start gap-2 rounded-xl bg-cream-50 px-3 py-2.5 text-left text-xs leading-relaxed text-slate-700 ring-1 ring-cream-200 ring-inset";

/** For a step title's highlighted words: blue on a tilted yellow marker swipe, as in the homepage headings. */
function TitleHighlight({ children }: { children: ReactNode }) {
  return (
    <span className="relative isolate inline-block px-[0.12em] text-brand-700">
      <span aria-hidden="true" className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.5em] -rotate-2 rounded-full bg-sun-300" />
      {children}
    </span>
  );
}

/** Google's "G", in its four colours. */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** The title and subtitle each step opens with, centred. */
function StepHeader({ titleId, title, children }: { titleId: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="text-center">
      {/* Styled like the homepage section headings ("Find Your Next Favourite"). */}
      <h2
        id={titleId}
        className="font-display text-[2.5rem] leading-[1.1] font-semibold tracking-[-0.01em] text-black uppercase [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.15em] sm:text-[2.875rem]"
      >
        {title}
      </h2>
      {children && <div className="mt-1.5 text-sm leading-relaxed text-slate-500 mid:mt-2.5">{children}</div>}
    </div>
  );
}

function ErrorText({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-xs font-medium text-rose-600">
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

/**
 * 1. The mobile number, after a fixed +94 chip. Typing is grouped as 77 123 4567; Send Code checks it's a valid
 * Sri Lankan number (lib/phone's rule) and hands on the app's 07XXXXXXXX form to `onSubmit`, which asks the
 * backend for the SMS (and throws if it can't: the reason shows under the field). The same step serves sign-in
 * and sign-up: the backend makes the account for a new number. Below it, "Continue with Google": FOR NOW ONLY
 * THE DESIGN, as Google sign-in isn't wired up yet; pressing it says so. Ends with the way out for guests:
 * ordering never needs an account.
 */
export function PhoneStep({
  digits,
  onDigitsChange,
  onSubmit,
  autoFocus,
  invited,
}: {
  digits: string;
  onDigitsChange: (digits: string) => void;
  onSubmit: (phone: string) => Promise<void>;
  /** Focus the field as the step appears (coming back to it, not on page load, where it would pop up the keyboard). */
  autoFocus: boolean;
  /** Arrived from a friend's referral link (?ref=). */
  invited: boolean;
}) {
  const mood = useLoginMood();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  /** The number itself is wrong (the field turns rose), not just the request. */
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [googleSoon, setGoogleSoon] = useState(false);

  // As the step appears if asked, and after each failed try (the shake remounts the field).
  useEffect(() => {
    if (autoFocus || attempt) inputRef.current?.focus();
  }, [autoFocus, attempt]);

  const fail = (message: string, field: boolean) => {
    setInvalid(field);
    setError(message);
    setAttempt((count) => count + 1);
    mood("oops");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const phone = phoneFromLocalDigits(digits);
    if (!phone) return fail("Enter a valid Sri Lankan mobile number, e.g. 77 123 4567.", true);
    setSending(true);
    setError(null);
    setGoogleSoon(false);
    mood("cheer");
    try {
      await onSubmit(phone);
    } catch (err) {
      setSending(false);
      fail(authErrorMessage(err, "We couldn't send a code. Please try again."), false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <StepHeader
        titleId={`${id}-title`}
        title={
          <>
            Welcome <TitleHighlight>back</TitleHighlight>
          </>
        }
      >
        {/* Left out on short screens, so the card fits: the field's label says what's needed. */}
        <p className="low:hidden">Pop in your number and your favourites are a tap away. New here? We&apos;ll set you up in seconds.</p>
        {invited && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 ring-inset">
            <Gift className="size-3.5" aria-hidden="true" />
            You&apos;re invited! Join to unlock your referral offers.
          </p>
        )}
      </StepHeader>

      <label htmlFor={`${id}-phone`} className={cn(fieldLabel, "mt-4 mid:mt-7")}>
        Mobile number
      </label>
      <div
        key={attempt}
        className={cn(
          "mt-1.5 flex h-13 items-stretch overflow-hidden rounded-[0.875rem] focus-within:bg-white low:h-12",
          fieldRing,
          invalid
            ? cn(fieldInvalid, "focus-within:shadow-[0_0_0_4px_rgb(244_63_94/0.12)] focus-within:ring-rose-400")
            : cn(fieldValid, "focus-within:shadow-[0_0_0_4px_rgb(48_121_234/0.14)] focus-within:ring-brand-500"),
        )}
      >
        <span className="my-2 flex shrink-0 items-center gap-2 border-r border-slate-200 pr-3 pl-4">
          <span className="sr-only">Sri Lanka, +94</span>
          <span aria-hidden="true" className="font-numeric text-[0.9375rem] font-bold text-brand-800">
            +94
          </span>
        </span>
        <input
          ref={inputRef}
          id={`${id}-phone`}
          value={groupLocalDigits(digits)}
          onChange={(event) => {
            onDigitsChange(toLocalDigits(event.target.value));
            setInvalid(false);
            setError(null);
          }}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={16}
          disabled={sending}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="font-numeric min-w-0 flex-1 bg-transparent px-3 text-base font-semibold tracking-wide text-brand-950 outline-none placeholder:font-medium placeholder:text-slate-400 disabled:text-slate-500"
        />
      </div>
      <div aria-live="polite">
        {error && (
          <div className="mt-1.5">
            <ErrorText id={`${id}-error`}>{error}</ErrorText>
          </div>
        )}
      </div>

      <button type="submit" disabled={sending} className={cn(primaryButton, "mt-4 mid:mt-5")}>
        {sending ? "Sending…" : "Send Code"}
        {sending && <LoaderCircle className="size-4.5 animate-spin" aria-hidden="true" />}
      </button>

      <p aria-hidden="true" className="my-3 flex items-center gap-3 text-[0.6875rem] font-semibold tracking-[0.18em] text-slate-400 uppercase mid:my-5">
        <span className="h-px flex-1 bg-linear-to-r from-transparent to-slate-200" />
        or
        <span className="h-px flex-1 bg-linear-to-l from-transparent to-slate-200" />
      </p>
      {/* PLACEHOLDER: Google sign-in isn't wired to the backend yet (the team will add it), so this only says so. */}
      <button
        type="button"
        onClick={() => setGoogleSoon(true)}
        disabled={sending}
        aria-describedby={googleSoon ? `${id}-google` : undefined}
        className={secondaryButton}
      >
        <GoogleLogo className="size-5" />
        Continue with Google
      </button>
      <div aria-live="polite">
        {googleSoon && (
          <p id={`${id}-google`} className={cn(noteBox, "mt-2")}>
            <Info className="mt-px size-3.5 shrink-0 text-brand-600" aria-hidden="true" />
            <span>Google sign-in is coming soon. For now, sign in with your mobile number.</span>
          </p>
        )}
      </div>

      {/* Guest checkout stays open: an account is never needed to order. */}
      <p className="mt-4 text-center text-[0.8125rem] text-slate-500 mid:mt-6">
        No account needed to order.{" "}
        <Link href="/menu" className={textButton}>
          Continue as a guest
        </Link>
      </p>
    </form>
  );
}

/**
 * 1b. Only when the number belongs to an account that was deleted (the backend answers ACCOUNT_DELETED): recover
 * that account, or start a new one with the same number. Either one sends the code (`onChoose`, which throws if it
 * can't); "Use a different number" goes back.
 */
export function DeletedStep({
  phone,
  onChoose,
  onDifferentNumber,
}: {
  phone: string;
  onChoose: (choice: Exclude<OtpIntent, "login">) => Promise<void>;
  onDifferentNumber: () => void;
}) {
  const mood = useLoginMood();
  const id = useId();
  const [busy, setBusy] = useState<Exclude<OtpIntent, "login"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (choice: Exclude<OtpIntent, "login">) => {
    if (busy) return;
    setBusy(choice);
    setError(null);
    mood("cheer");
    try {
      await onChoose(choice);
    } catch (err) {
      setBusy(null);
      setError(authErrorMessage(err, "We couldn't send a code. Please try again."));
      mood("oops");
    }
  };

  return (
    <div role="group" aria-labelledby={`${id}-title`}>
      <StepHeader
        titleId={`${id}-title`}
        title={
          <>
            Old account <TitleHighlight>found</TitleHighlight>
          </>
        }
      >
        <p>
          <strong className="font-semibold whitespace-nowrap text-brand-950">{displayPhone(phone)}</strong> was linked to a deleted account. Recover
          your old profile and history, or start fresh.
        </p>
      </StepHeader>

      <div className="mt-4 space-y-2.5 mid:mt-6">
        <button type="button" onClick={() => choose("recover")} disabled={!!busy} className={primaryButton}>
          {busy === "recover" ? <LoaderCircle className="size-4.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-4.5" aria-hidden="true" />}
          Recover my account
        </button>
        <button type="button" onClick={() => choose("create_new")} disabled={!!busy} className={secondaryButton}>
          {busy === "create_new" ? <LoaderCircle className="size-4.5 animate-spin" aria-hidden="true" /> : <UserPlus className="size-4.5" aria-hidden="true" />}
          Create a new account
        </button>
      </div>

      <div className="mt-1.5 min-h-4.5" aria-live="polite">
        {error && <ErrorText>{error}</ErrorText>}
      </div>

      <p className="mt-1 text-center text-xs leading-relaxed text-slate-500">A new account keeps your old orders and rewards archived.</p>

      <p className="mt-3 text-center text-[0.8125rem] mid:mt-5">
        <button type="button" onClick={onDifferentNumber} disabled={!!busy} className={textButton}>
          Use a different number
        </button>
      </p>
    </div>
  );
}

/**
 * 2. The 6-digit code the backend sent by SMS. Typing the sixth digit verifies straight away (useOtpCode, with
 * `onVerify` the backend call). Back returns to the number, still filled in; Resend code unlocks after a
 * 30-second countdown and asks for a new SMS (`onResend`).
 */
export function OtpStep({
  phone,
  onVerify,
  onResend,
  onBack,
}: {
  phone: string;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onBack: () => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { code, change, submit: verifyCode, resend, problem, attempt, verifying, resending, resent, resendIn } = useOtpCode({
    verify: onVerify,
    resend: onResend,
    inputRef,
  });
  const mood = useLoginMood();

  useEffect(() => inputRef.current?.focus(), []);

  // Each wrong or incomplete code (attempt counts them).
  useEffect(() => {
    if (attempt) mood("oops");
  }, [attempt, mood]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void verifyCode();
  };

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${id}-title`} aria-describedby={`${id}-sent`}>
      <button type="button" onClick={onBack} className={backButton}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back
      </button>

      <StepHeader titleId={`${id}-title`} title="Enter your code">
        <p id={`${id}-sent`}>
          We sent a 6-digit code to <strong className="font-semibold whitespace-nowrap text-brand-950">{displayPhone(phone)}</strong>.
        </p>
      </StepHeader>

      <label htmlFor={`${id}-code`} className="sr-only">
        6-digit verification code
      </label>
      <div className="mt-4 mid:mt-6">
        <OtpInput
          id={`${id}-code`}
          inputRef={inputRef}
          code={code}
          onChange={change}
          invalid={!!problem}
          shakeKey={attempt}
          disabled={verifying}
          describedBy={problem ? `${id}-problem` : undefined}
        />
      </div>

      <div className="mt-1.5 min-h-4.5" aria-live="polite">
        {problem ? (
          <ErrorText id={`${id}-problem`}>{problem}</ErrorText>
        ) : resent ? (
          <p className="text-xs font-medium text-emerald-600">We&apos;ve sent you a new code.</p>
        ) : null}
      </div>

      <p className="mt-1 text-[0.8125rem] text-slate-500 tall:mt-2">
        {resendIn ? (
          `Resend code in ${resendIn}`
        ) : (
          <button type="button" onClick={() => void resend()} disabled={resending || verifying} className={textButton}>
            {resending ? "Sending…" : "Resend code"}
          </button>
        )}
      </p>

      <button type="submit" disabled={verifying} className={cn(primaryButton, "mt-4 mid:mt-5")}>
        {verifying ? <LoaderCircle className="size-4.5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4.5" aria-hidden="true" />}
        {verifying ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}

/**
 * 3. New accounts only (the backend still has its placeholder name for it): the number is verified and the
 * customer is signed in; this asks what to call them and saves it (`onSubmit`, PUT /auth/me, which throws if it
 * can't). "Use a different number" signs out and starts over.
 */
export function ProfileStep({
  phone,
  onSubmit,
  onDifferentNumber,
}: {
  phone: string;
  onSubmit: (name: string) => Promise<void>;
  onDifferentNumber: () => void;
}) {
  const mood = useLoginMood();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);

  // As the step appears, and after each failed try (the shake remounts the field).
  useEffect(() => inputRef.current?.focus(), [attempt]);

  const fail = (message: string, field: boolean) => {
    setInvalid(field);
    setError(message);
    setAttempt((count) => count + 1);
    mood("oops");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (name.trim().length < 2) return fail("Enter your name (at least 2 letters).", true);
    setSaving(true);
    setError(null);
    try {
      await onSubmit(name.trim());
    } catch (err) {
      setSaving(false);
      fail(authErrorMessage(err, "We couldn't save your name. Please try again."), false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <StepHeader titleId={`${id}-title`} title="Nice to meet you!">
        <p>Your number is verified. What should we call you?</p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 ring-inset">
          <BadgeCheck className="size-3.5" aria-hidden="true" />
          {displayPhone(phone)} verified
        </p>
      </StepHeader>

      <label htmlFor={`${id}-name`} className={cn(fieldLabel, "mt-4 mid:mt-7")}>
        Your name
      </label>
      <input
        key={attempt}
        ref={inputRef}
        id={`${id}-name`}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setInvalid(false);
          setError(null);
        }}
        autoComplete="name"
        autoCapitalize="words"
        maxLength={NAME_MAX_LENGTH}
        placeholder="e.g. Nimali Perera"
        disabled={saving}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(textField, invalid ? cn(fieldInvalid, fieldFocusInvalid) : cn(fieldValid, fieldFocus))}
      />
      <div className="mt-1.5 min-h-4.5" aria-live="polite">
        {error && <ErrorText id={`${id}-error`}>{error}</ErrorText>}
      </div>

      <button type="submit" disabled={saving} className={cn(primaryButton, "mt-4 mid:mt-5")}>
        {saving ? "Saving…" : "Create My Account"}
        {saving && <LoaderCircle className="size-4.5 animate-spin" aria-hidden="true" />}
      </button>

      <p className="mt-4 text-center text-[0.8125rem] mid:mt-6">
        <button type="button" onClick={onDifferentNumber} disabled={saving} className={textButton}>
          Use a different number
        </button>
      </p>
    </form>
  );
}
