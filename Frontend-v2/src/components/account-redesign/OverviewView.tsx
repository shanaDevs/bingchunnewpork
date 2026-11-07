"use client";

import { UserX } from "lucide-react";
import { PhoneAccountMenu, PhoneLiveOrders, PhoneLogOut } from "./AccountHome";
import { useSignedInAccount } from "./AccountShell";
import { dayPartAt, useNow } from "./colomboTime";
import { MoodPicker } from "./overview/MoodPicker";
import { RewardsSummary } from "./overview/RewardsSummary";
import { TodayHero } from "./overview/TodayHero";
import { TodayOffers } from "./overview/TodayOffers";

/**
 * The account Overview, "Today at Bing Chun": the greeting in a scene for the time of day in Sri Lanka, with today's
 * pick (the Daily Special, else the top product for the hour's mood); a summary of the customer's rewards beside
 * today's offers; then the mood picker's suggestions. All of it is live from the backend: it follows the clock
 * (checked every 30 seconds) while it's open, and the menu and offers are checked again every minute
 * (overview/liveData).
 * On phones it is the account's home (AccountHome): the greeting and the points sit in the hero (AccountHero), then
 * the orders under way, the list of the other pages, where the mood picker opens in a sheet, and Log Out. The
 * "Today" sections stay off phones.
 * A soft-deleted account sees only the notice (and Log Out): it can sign in again with its number to recover the
 * account or start a new one.
 */
export function OverviewView() {
  const { deleted } = useSignedInAccount();
  const now = useNow();
  const part = dayPartAt(now);

  if (deleted) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <DeletedAccountNotice />
        <PhoneLogOut />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:gap-12">
      <PhoneLiveOrders />
      <PhoneAccountMenu />
      <PhoneLogOut />
      <TodayHero part={part} />
      <div data-motion-group className="grid grid-cols-[minmax(0,1fr)] gap-5 max-md:hidden sm:gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <RewardsSummary />
        <TodayOffers now={now} />
      </div>
      <MoodPicker part={part} className="max-md:hidden" />
    </div>
  );
}

/** The old page's deleted-account banner, in the new look. */
function DeletedAccountNotice() {
  return (
    <section role="alert" className="flex items-start gap-4 rounded-[1.5rem] bg-amber-50 p-5 ring-1 ring-amber-200 sm:p-6">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700">
        <UserX className="size-5" aria-hidden="true" />
      </span>
      <div>
        <h2 className="font-display-condensed text-2xl leading-none text-amber-950 uppercase">Account deleted</h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-900">
          This profile was deleted. Sign in again with your mobile number and choose to recover your account or create a new one.
        </p>
      </div>
    </section>
  );
}
