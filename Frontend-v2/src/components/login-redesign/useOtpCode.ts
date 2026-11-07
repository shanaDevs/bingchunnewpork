"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { authErrorMessage } from "./loginHelpers";

/** The backend's codes are six digits. */
export const OTP_LENGTH = 6;

/** How long Resend stays locked after a code is sent (the backend's codes last 10 minutes). */
const RESEND_MS = 30_000;

const INCOMPLETE = "Enter all 6 digits of the code.";

/**
 * Entering the one-time code just sent by SMS. Typing the sixth digit verifies straight away (`verify`, the
 * backend call); a failed try clears the field, counts the try (`attempt`, for the shake), shows why
 * (`problem`) and puts the cursor back in the field. Resend unlocks 30 seconds after the last code was sent
 * and calls `resend`. `inputRef` is the OtpInput's field. The code was sent just before this mounts.
 */
export function useOtpCode({
  verify: verifyCode,
  resend: resendCode,
  inputRef,
}: {
  verify: (code: string) => Promise<void>;
  resend: () => Promise<void>;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  /** Counts failed tries, so the error shakes again even when the message is the same. */
  const [attempt, setAttempt] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef(false);

  // Back into the field after each failed try. In an effect, as the field is still disabled (verifying) until
  // the failed try has rendered, and a disabled field can't take focus.
  useEffect(() => {
    if (attempt) inputRef.current?.focus();
  }, [attempt, inputRef]);

  // The resend countdown ticks once a second until it reaches zero.
  const waitMs = Math.max(0, sentAt + RESEND_MS - now);
  useEffect(() => {
    if (waitMs === 0) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [waitMs]);

  const fail = (message: string) => {
    setAttempt((count) => count + 1);
    setProblem(message);
    setCode("");
  };

  const verify = async (value: string) => {
    if (busy.current) return;
    if (value.length < OTP_LENGTH) return fail(INCOMPLETE);
    busy.current = true;
    setVerifying(true);
    setProblem(null);
    try {
      // On success the sign-in moves on to its next step, so this stays "verifying" until it does.
      await verifyCode(value);
    } catch (err) {
      setVerifying(false);
      fail(authErrorMessage(err, "We couldn't check that code. Please try again."));
    } finally {
      busy.current = false;
    }
  };

  /** For OtpInput's onChange. */
  const change = (digits: string) => {
    setCode(digits);
    setProblem(null);
    setResent(false);
    if (digits.length === OTP_LENGTH) void verify(digits);
  };

  const resend = async () => {
    if (waitMs > 0 || resending || busy.current) return;
    setResending(true);
    setProblem(null);
    try {
      await resendCode();
      setSentAt(Date.now());
      setNow(Date.now());
      setCode("");
      setResent(true);
    } catch (err) {
      setProblem(authErrorMessage(err, "We couldn't send a new code. Please try again."));
    } finally {
      setResending(false);
      inputRef.current?.focus();
    }
  };

  return {
    code,
    change,
    /** Checks what has been typed (the form's submit). */
    submit: () => verify(code),
    resend,
    problem,
    attempt,
    verifying,
    resending,
    resent,
    /** Until Resend unlocks, as "0:27"; null once it has. */
    resendIn: waitMs > 0 ? `0:${String(Math.ceil(waitMs / 1000)).padStart(2, "0")}` : null,
  };
}
