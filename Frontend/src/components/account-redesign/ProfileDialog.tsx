"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, CircleCheck, LoaderCircle, ShieldCheck, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import toast from "react-hot-toast";
import { cn } from "@/components/home-redesign/lib/cn";
import { authErrorMessage, displayPhone, groupLocalDigits, phoneFromLocalDigits, toLocalDigits } from "@/components/login-redesign/loginHelpers";
import { OtpInput } from "@/components/login-redesign/OtpInput";
import { useOtpCode } from "@/components/login-redesign/useOtpCode";
import { api, ApiError } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types";
import { ErrorText, fieldLabel, focusRing, OptionalTag, primaryButton, secondaryButton, smallButton, TitleHighlight, textField } from "./accountUi";

/** The backend accepts names of 2 to 100 characters (PUT /auth/me). */
const NAME_MAX_LENGTH = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "details" | "number" | "code" | "delete";

/**
 * Editing the customer's details, opened from the member card's or hero's Edit button: a native modal <dialog>
 * (the page behind is inert, focus stays inside, Escape or a click outside closes it), a sheet up from the bottom
 * on phones. Four steps in the one pop-up:
 * 1. Details: name and optional email, saved together with PUT /auth/me (Save Changes), and the mobile number,
 *    verified, with Change (Add, for an account that has none yet). Delete account at the foot.
 * 2. Number: the new number, after a +94 chip as on the sign-in page. POST /auth/phone/link/request texts it a code
 *    (the backend refuses a number another account has).
 * 3. Code: the code, as on the sign-in page; POST /auth/phone/link/verify moves the account to the new number, and the
 *    pop-up goes back to the details, keeping anything typed there, and says so under the number (a toast would sit
 *    behind the pop-up).
 * 4. Delete: the old page's warning, then DELETE /auth/me, then `onDeleted` (AccountShell signs the customer out and
 *    goes to the homepage). The account is soft-deleted: signing in again with the number offers to recover it.
 */
export function ProfileDialog({ user, onClose, onDeleted }: { user: User; onClose: () => void; onDeleted: () => void }) {
  const id = useId();
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? "");
  /** The number step's field, and the number the code was sent to. */
  const [digits, setDigits] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [numberChanged, setNumberChanged] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const unmounting = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    unmounting.current = false;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      unmounting.current = true;
      dialog.close();
      document.documentElement.style.removeProperty("overflow");
    };
  }, []);

  const title: ReactNode =
    step === "details" ? (
      <>
        Your <TitleHighlight>details</TitleHighlight>
      </>
    ) : step === "number" ? (
      user.phone ? "Change your number" : "Add your number"
    ) : step === "code" ? (
      "Enter your code"
    ) : (
      "Delete account?"
    );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A close the browser forces (e.g. repeated Escape) still leaves the pop-up; skip the one from unmounting.
      onClose={(event) => {
        if (!unmounting.current && !event.currentTarget.open) onClose();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // Only a press and release both outside the panel; a text selection dragged out of it doesn't close.
        if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
      }}
      // Phones and small tablets: a sheet up from the bottom edge; wider: a centred card.
      // bg-transparent! beats .home-redesign's own white background (unlayered CSS), so the dimmed backdrop shows.
      className="home-redesign m-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden bg-transparent! p-0 backdrop:bg-brand-950/55 backdrop:backdrop-blur-[3px] open:flex md:items-center md:p-4"
    >
      <div className="relative flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-clip rounded-t-[1.75rem] bg-white text-slate-900 shadow-2xl shadow-brand-950/30 transition-[opacity,translate,scale] duration-300 ease-out starting:translate-y-4 starting:scale-[0.98] starting:opacity-0 md:max-h-[calc(100dvh-2rem)] md:max-w-md md:rounded-3xl">
        <header className="shrink-0 px-6 pt-6 pr-18">
          <h2
            id={`${id}-title`}
            className="font-display text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.01em] text-black uppercase [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.15em]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn("absolute top-5 right-5 grid size-10 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100", focusRing)}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        {/* On the sheet, the buttons stay clear of the iPhone home indicator. */}
        <div className="min-h-0 overflow-y-auto px-6 pt-4 pb-6 max-md:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {step === "details" ? (
            <DetailsStep
              user={user}
              numberChanged={numberChanged}
              name={name}
              onNameChange={setName}
              email={email}
              onEmailChange={setEmail}
              onChangeNumber={() => setStep("number")}
              onDelete={() => setStep("delete")}
              onClose={onClose}
            />
          ) : step === "number" ? (
            <NumberStep
              user={user}
              digits={digits}
              onDigitsChange={setDigits}
              onSent={(phone) => {
                setNewPhone(phone);
                setStep("code");
              }}
              onBack={() => setStep("details")}
            />
          ) : step === "code" ? (
            <CodeStep
              phone={newPhone}
              onVerified={() => {
                setNumberChanged(true);
                setDigits("");
                setStep("details");
              }}
              onBack={() => setStep("number")}
            />
          ) : (
            <DeleteStep onBack={() => setStep("details")} onDeleted={onDeleted} />
          )}
        </div>
      </div>
    </dialog>
  );
}

/** 1. Name and optional email, saved together; the verified mobile number below them, with Change. */
function DetailsStep({
  user,
  numberChanged,
  name,
  onNameChange,
  email,
  onEmailChange,
  onChangeNumber,
  onDelete,
  onClose,
}: {
  user: User;
  /** The number was just changed in this pop-up. */
  numberChanged: boolean;
  name: string;
  onNameChange: (name: string) => void;
  email: string;
  onEmailChange: (email: string) => void;
  onChangeNumber: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  const [errors, setErrors] = useState<Partial<Record<"name" | "email" | "form", string>>>({});
  const [saving, setSaving] = useState(false);
  const trimmedEmail = email.trim().toLowerCase();
  const changed = name.trim() !== user.name || trimmedEmail !== (user.email ?? "").toLowerCase();

  useEffect(() => document.getElementById(`${id}-name`)?.focus(), [id]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const next = {
      ...(name.trim().length < 2 && { name: "Enter your name (at least 2 letters)." }),
      ...(trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail) && { email: "Enter a valid email, e.g. nimali@example.com." }),
    };
    setErrors(next);
    const firstInvalid = (["name", "email"] as const).find((field) => next[field]);
    if (firstInvalid) {
      document.getElementById(`${id}-${firstInvalid}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const updated = await api.put<User>(
        "/auth/me",
        { name: name.trim(), email: trimmedEmail ? trimmedEmail : null },
        true,
      );
      updateUser(updated);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Your details are saved.");
      onClose();
    } catch (err) {
      setSaving(false);
      setErrors({ form: authErrorMessage(err, "We couldn't save your details. Please try again.") });
    }
  };

  /** Props shared by each field: its id, and its error wired up for screen readers. */
  const fieldProps = (field: "name" | "email") => ({
    id: `${id}-${field}`,
    disabled: saving,
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `${id}-${field}-error` : undefined,
    className: textField(Boolean(errors[field])),
  });

  return (
    <form noValidate onSubmit={save}>
      <div className="grid gap-4">
        <div>
          <label htmlFor={`${id}-name`} className={fieldLabel}>
            Name
          </label>
          <input {...fieldProps("name")} type="text" autoComplete="name" maxLength={NAME_MAX_LENGTH} value={name} onChange={(event) => onNameChange(event.target.value)} />
          {errors.name && <ErrorText id={`${id}-name-error`}>{errors.name}</ErrorText>}
        </div>

        <div>
          <label htmlFor={`${id}-email`} className={fieldLabel}>
            Email <OptionalTag />
          </label>
          <input
            {...fieldProps("email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
          />
          {errors.email && <ErrorText id={`${id}-email-error`}>{errors.email}</ErrorText>}
        </div>

        <div className="rounded-2xl bg-brand-50/60 p-4 ring-1 ring-brand-100 ring-inset">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.9375rem] font-semibold text-slate-700">Mobile number</p>
              <p className="mt-1 flex flex-wrap items-center gap-2">
                {user.phone ? (
                  <>
                    <span className="font-numeric text-base font-bold whitespace-nowrap text-brand-950">{displayPhone(user.phone)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 ring-inset">
                      <BadgeCheck className="size-3.5" aria-hidden="true" />
                      Verified
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-slate-500">Not added yet</span>
                )}
              </p>
            </div>
            <button type="button" onClick={onChangeNumber} className={cn(smallButton, "shrink-0 bg-white ring-1 ring-brand-200 ring-inset")}>
              {user.phone ? "Change" : "Add"}
            </button>
          </div>
          {numberChanged ? (
            <p role="status" className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
              Your number is now {displayPhone(user.phone)}.
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">{user.phone ? "You log in with this number." : "Add your number for your orders and deliveries."}</p>
          )}
        </div>
      </div>

      <div aria-live="polite">{errors.form && <ErrorText>{errors.form}</ErrorText>}</div>

      <Actions>
        <button type="button" onClick={onClose} className={secondaryButton}>
          Cancel
        </button>
        <button type="submit" disabled={!changed || saving} className={cn(primaryButton, "flex-1")}>
          {saving ? "Saving…" : "Save Changes"}
          {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
        </button>
      </Actions>

      {!user.isDeleted && (
        <p className="mt-5 border-t border-slate-100 pt-4 text-center">
          <button type="button" onClick={onDelete} className={cn("inline-flex items-center gap-1.5 rounded text-[0.8125rem] font-semibold text-rose-600 hover:underline", focusRing)}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete my account
          </button>
        </p>
      )}
    </form>
  );
}

/** 2. The new number, checked (a valid Sri Lankan number, not the current one) before the backend texts it a code. */
function NumberStep({
  user,
  digits,
  onDigitsChange,
  onSent,
  onBack,
}: {
  user: User;
  digits: string;
  onDigitsChange: (digits: string) => void;
  onSent: (phone: string) => void;
  onBack: () => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** Counts failed tries, so the field shakes again even when the problem is the same. */
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);

  // As the step appears, and after each failed try (the shake remounts the field).
  useEffect(() => inputRef.current?.focus(), [attempt]);

  const fail = (message: string) => {
    setProblem(message);
    setAttempt((count) => count + 1);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const phone = phoneFromLocalDigits(digits);
    if (!phone) return fail("Enter a valid Sri Lankan mobile number, e.g. 77 123 4567.");
    if (user.phone && normalizePhone(user.phone) === phone) return fail("That's already your number.");
    setSending(true);
    try {
      await api.post("/auth/phone/link/request", { phone }, true);
      onSent(phone);
    } catch (err) {
      setSending(false);
      fail(err instanceof ApiError && err.status === 409 ? "This number already has its own Bing Chun account." : authErrorMessage(err, "We couldn't send a code. Please try again."));
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <p className="text-sm text-slate-600">We&apos;ll send a code to your new number to check it&apos;s yours. Your orders, points and addresses stay with your account.</p>

      <label htmlFor={`${id}-phone`} className={cn(fieldLabel, "mt-4")}>
        New mobile number
      </label>
      <div
        key={attempt}
        className={cn(
          "mt-1.5 flex h-12 items-stretch overflow-hidden rounded-[0.875rem] ring-1 transition-[box-shadow,background-color] ring-inset focus-within:bg-white",
          problem
            ? cn(attempt > 0 && "animate-shake", "bg-rose-50/50 ring-rose-300 focus-within:shadow-[0_0_0_4px_rgb(244_63_94/0.12)] focus-within:ring-rose-400")
            : "bg-slate-50/70 ring-slate-200 hover:ring-slate-300 focus-within:shadow-[0_0_0_4px_rgb(48_121_234/0.14)] focus-within:ring-brand-500",
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
            setProblem(null);
          }}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={16}
          disabled={sending}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-error` : undefined}
          className="font-numeric min-w-0 flex-1 bg-transparent px-3 text-base font-semibold tracking-wide text-brand-950 outline-none disabled:text-slate-500"
        />
      </div>
      <div aria-live="polite">{problem && <ErrorText id={`${id}-error`}>{problem}</ErrorText>}</div>

      <Actions>
        <BackButton onClick={onBack} />
        <button type="submit" disabled={sending} className={cn(primaryButton, "flex-1 disabled:cursor-wait")}>
          {sending ? "Sending…" : "Send Code"}
          {sending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
        </button>
      </Actions>
    </form>
  );
}

/** 3. The code texted to the new number, as on the sign-in page: the sixth digit verifies straight away. */
function CodeStep({ phone, onVerified, onBack }: { phone: string; onVerified: () => void; onBack: () => void }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  const { code, change, submit: verifyCode, resend, problem, attempt, verifying, resending, resent, resendIn } = useOtpCode({
    verify: async (value) => {
      const updated = await api.post<User>("/auth/phone/link/verify", { phone, code: value }, true);
      updateUser(updated);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      onVerified();
    },
    resend: () => api.post("/auth/phone/link/request", { phone }, true).then(() => undefined),
    inputRef,
  });

  useEffect(() => inputRef.current?.focus(), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void verifyCode();
  };

  return (
    <form onSubmit={submit} noValidate aria-describedby={`${id}-sent`}>
      <p id={`${id}-sent`} className="text-sm text-slate-600">
        We sent a 6-digit code to <strong className="font-semibold whitespace-nowrap text-brand-950">{displayPhone(phone)}</strong>.
      </p>

      <label htmlFor={`${id}-code`} className="sr-only">
        6-digit verification code
      </label>
      <div className="mt-4">
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

      <p className="mt-1 text-[0.8125rem] text-slate-500">
        {resendIn ? (
          `Resend code in ${resendIn}`
        ) : (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resending || verifying}
            className={cn("rounded font-semibold text-brand-700 underline-offset-2 hover:underline disabled:text-slate-400", focusRing)}
          >
            {resending ? "Sending…" : "Resend code"}
          </button>
        )}
      </p>

      <Actions>
        <BackButton onClick={onBack} />
        <button type="submit" disabled={verifying} className={cn(primaryButton, "flex-1 disabled:cursor-wait")}>
          {verifying ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
          {verifying ? "Verifying…" : "Verify"}
        </button>
      </Actions>
    </form>
  );
}

/** 4. Deleting the account (DELETE /auth/me), after the old page's warning. */
function DeleteStep({ onBack, onDeleted }: { onBack: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete("/auth/me", true);
      // The account is signed out and sent home (AccountShell), which says so.
      onDeleted();
    } catch (err) {
      setDeleting(false);
      setError(authErrorMessage(err, "We couldn't delete your account. Please try again."));
    }
  };

  return (
    <div>
      <p className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-sm leading-relaxed text-rose-900 ring-1 ring-rose-200 ring-inset">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden="true" />
        <span>Your account will be deleted. You can still sign in later to see your profile, and recover the account or start a new one.</span>
      </p>
      <div aria-live="polite">{error && <ErrorText>{error}</ErrorText>}</div>
      <Actions>
        <BackButton onClick={onBack} label="Keep account" />
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-snow shadow-lg shadow-rose-600/25 transition-colors hover:bg-rose-700 disabled:cursor-wait disabled:bg-rose-400",
            focusRing,
          )}
        >
          {deleting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
          Delete account
        </button>
      </Actions>
    </div>
  );
}

/** Each step's buttons: the way back (or Cancel) and the main action, which takes the rest of the row. */
function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex items-center gap-3">{children}</div>;
}

function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className={secondaryButton}>
      {label === "Back" && <ArrowLeft className="size-4" aria-hidden="true" />}
      {label}
    </button>
  );
}
