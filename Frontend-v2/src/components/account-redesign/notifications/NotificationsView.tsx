"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Mail, MessageSquareText, Plus, Smartphone, type LucideIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { cn } from "@/components/home-redesign/lib/cn";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types";
import { accountPhone, useSignedInAccount } from "../AccountShell";
import { focusRing, smallButton } from "../accountUi";

type PrefKey = "notifyPush" | "notifySms" | "notifyEmail";

const NAMES: Record<PrefKey, string> = {
  notifyPush: "Push notifications",
  notifySms: "SMS notifications",
  notifyEmail: "Email notifications",
};

/**
 * How the customer hears about their orders: push, SMS (to the account's number) and email (to the profile's email),
 * each a card with its switch, saved on the account straight away (PUT /auth/me with notifyPush / notifySms /
 * notifyEmail, as the old page did). The switch moves at once and goes back if saving fails. SMS and email can't be
 * on without a number or an email: "Add your number" / "Add email" open the details pop-up. On phones the three are
 * rows of one card, like a phone's own settings list.
 */
export function NotificationsView() {
  const { user, editDetails } = useSignedInAccount();
  const updateUser = useAuthStore((s) => s.updateUser);
  const queryClient = useQueryClient();
  /** The switch being saved, so it can't be pressed again meanwhile. */
  const [saving, setSaving] = useState<PrefKey | null>(null);
  const phone = accountPhone(user);

  const save = async (key: PrefKey, on: boolean) => {
    const before = user[key];
    setSaving(key);
    updateUser({ [key]: on });
    try {
      const updated = await api.put<User>("/auth/me", { [key]: on }, true);
      updateUser(updated);
      queryClient.setQueryData(["me"], updated);
      toast.success(`${NAMES[key]} turned ${on ? "on" : "off"}.`);
    } catch (err) {
      updateUser({ [key]: before });
      toast.error(err instanceof Error ? err.message : "Couldn't save that. Please try again.");
    } finally {
      setSaving(null);
    }
  };

  // Missing values count as on, as the backend's default.
  const pushOn = user.notifyPush ?? true;
  const smsOn = Boolean(phone) && (user.notifySms ?? true);
  const emailOn = Boolean(user.email) && (user.notifyEmail ?? true);

  return (
    // Compact rows, no wider than they need to be on big screens; on phones, one card.
    <ul className="grid max-w-3xl gap-3 max-md:gap-0 max-md:divide-y max-md:divide-brand-100 max-md:overflow-hidden max-md:rounded-2xl max-md:bg-white max-md:shadow-[0_16px_40px_-30px_rgb(15_33_71/0.5)] max-md:ring-1 max-md:ring-brand-100">
      <ChannelCard
        icon={Smartphone}
        title={NAMES.notifyPush}
        text="Order updates and pickup alerts on your device"
        on={pushOn}
        busy={saving === "notifyPush"}
        onChange={(on) => void save("notifyPush", on)}
        status={<Status tone={pushOn ? "ok" : "muted"}>{pushOn ? "On. We'll alert you as your orders move along." : "Off. We won't send you alerts about your orders."}</Status>}
      />
      <ChannelCard
        icon={MessageSquareText}
        title={NAMES.notifySms}
        text="Text messages for order status changes"
        on={smsOn}
        disabled={!phone}
        busy={saving === "notifySms"}
        onChange={(on) => void save("notifySms", on)}
        status={
          phone ? (
            <Status tone={smsOn ? "ok" : "muted"}>{smsOn ? `Sent to ${phone}` : "Off. We won't text you about your orders."}</Status>
          ) : (
            <>
              <Status tone="muted">Add a mobile number to get these.</Status>
              <AddButton onClick={editDetails}>Add your number</AddButton>
            </>
          )
        }
      />
      <ChannelCard
        icon={Mail}
        title={NAMES.notifyEmail}
        text="Receipts and order updates by email"
        on={emailOn}
        disabled={!user.email}
        busy={saving === "notifyEmail"}
        onChange={(on) => void save("notifyEmail", on)}
        status={
          user.email ? (
            <Status tone={emailOn ? "ok" : "muted"}>{emailOn ? `Sent to ${user.email}` : "Off. We won't email you about your orders."}</Status>
          ) : (
            <>
              <Status tone="muted">Add an email address to get these.</Status>
              <AddButton onClick={editDetails}>Add email</AddButton>
            </>
          )
        }
      />
    </ul>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn(smallButton, "-my-2 bg-brand-50/70")}>
      <Plus className="size-3.5" aria-hidden="true" />
      {children}
    </button>
  );
}

/** One way of being notified: its icon on a soft tile, the name and what it's for, the switch, and a status line under it. */
function ChannelCard({
  icon: Icon,
  title,
  text,
  on,
  disabled,
  busy,
  onChange,
  status,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  on: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (on: boolean) => void;
  status: ReactNode;
}) {
  const id = useId();
  return (
    <li className="flex items-start gap-3.5 rounded-2xl bg-white px-4 py-3.5 shadow-[0_16px_40px_-30px_rgb(15_33_71/0.5)] ring-1 ring-brand-100 max-md:rounded-none max-md:shadow-none max-md:ring-0 sm:items-center sm:px-5">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl transition-colors", on ? "bg-brand-600 text-snow" : "bg-brand-50 text-brand-600")}>
        <Icon className="size-4.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 id={`${id}-title`} className="text-[0.9375rem] leading-snug font-semibold text-brand-950">
          {title}
        </h3>
        <p id={`${id}-text`} className="text-[0.8125rem] text-slate-600">
          {text}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">{status}</div>
      </div>
      <Switch on={on} disabled={disabled} busy={busy} onChange={onChange} labelledBy={`${id}-title`} describedBy={`${id}-text`} />
    </li>
  );
}

/** A short line under a channel: green when it reaches the customer, else grey. */
function Status({ tone, children }: { tone: "ok" | "muted"; children: ReactNode }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-xs font-medium wrap-anywhere", tone === "ok" ? "text-emerald-700" : "text-slate-500")}>
      {tone === "ok" && <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />}
      {children}
    </p>
  );
}

/** An on/off switch: a brand-blue track with a white knob that slides across when on. Busy while its change is being saved. */
function Switch({
  on,
  disabled,
  busy,
  onChange,
  labelledBy,
  describedBy,
}: {
  on: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (on: boolean) => void;
  labelledBy: string;
  describedBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-wait aria-busy:opacity-80",
        on ? "bg-brand-600" : "bg-slate-300",
        focusRing,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("inline-block size-4.5 rounded-full bg-white shadow-md transition-transform duration-200", on ? "translate-x-5.5" : "translate-x-0.75")}
      />
    </button>
  );
}
