"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/components/home-redesign/lib/cn";

/** How long the tick shows after copying. */
const COPIED_MS = 1500;

/**
 * Small icon button that copies a coupon code to the clipboard, swapping to a tick for a moment
 * as confirmation (also announced to screen readers). If the clipboard is unavailable (e.g. an
 * insecure origin) it does nothing; the code itself stays select-all as a fallback.
 */
export function CopyCodeButton({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard blocked or unsupported: leave the icon as is.
    }
  };

  const Icon = copied ? Check : Copy;

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy code ${code}`}
        title={copied ? "Copied!" : "Copy code"}
        className={cn(
          "grid size-8 cursor-pointer place-items-center rounded-[0.5rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
          className,
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? `Code ${code} copied` : ""}
      </span>
    </>
  );
}
