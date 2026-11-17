"use client";

import { Check, ChevronDown, ChevronRight, Clock, Copy, CreditCard, Gift, Handshake, Mail, Phone, ReceiptText, Store, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { contactInfo } from "@/components/home-redesign/config/site";
import { cn } from "@/components/home-redesign/lib/cn";
import { STORE_CLOSE_HOUR, STORE_HOURS_LABEL, STORE_OPEN_HOUR } from "@/lib/storeHours";
import { useMyOrders } from "../accountData";
import { focusRing, smallButton } from "../accountUi";
import { colomboMinute, useNow } from "../colomboTime";

/**
 * Help & Support, in the account: a cream-and-blue welcome ("We're here to help", what to contact the team about,
 * and a tip to have the order number ready, with the latest one from My Orders ready to copy) beside the mascot;
 * the ways to reach the team (call inquiries, franchise, email: each opens the phone or mail app; and the opening
 * hours, saying whether it's open now in Sri Lanka), from the same contact details as the footer; then the common
 * topics (the public /contact page's) as an accordion, the first one open, each linking to the page that answers
 * it. On phones the ways to reach the team are a 2 x 2 grid of smaller tiles, so all four are in view at once.
 */
export function HelpView() {
  return (
    <div className="grid gap-6 sm:gap-8">
      <Welcome />
      <ContactSection />
      <TopicsSection />
    </div>
  );
}

function Welcome() {
  const { data: orders } = useMyOrders();
  const latest = orders?.[0]?.orderNumber;

  return (
    <section
      aria-labelledby="help-heading"
      className="relative isolate overflow-hidden rounded-[1.5rem] bg-linear-to-br from-cream-50 via-white to-brand-50 p-5 ring-1 ring-brand-100 sm:rounded-[2rem] sm:p-7"
    >
      {/* Decorative: soft bubbles behind the mascot. */}
      <span aria-hidden="true" className="absolute -right-10 -bottom-16 -z-10 size-64 rounded-full bg-brand-100/60" />
      <span aria-hidden="true" className="absolute top-6 right-48 -z-10 size-4 rounded-full bg-sun-300 max-sm:hidden" />
      <div className="flex items-center gap-5">
        <div className="min-w-0 flex-1">
          <h2 id="help-heading" className="font-display-condensed text-3xl leading-none text-brand-950 uppercase sm:text-4xl">
            We&apos;re here to help
          </h2>
          <p className="mt-2.5 max-w-2xl text-sm text-slate-600 sm:text-base">
            Reach the Bing Chun team for order issues, delivery questions, or account help. Include your order number when you contact us so we can assist faster.
          </p>
          <OrderNumberTip orderNumber={latest} />
        </div>
        <Image src="/images/mascots/welcome.png" alt="" data-pop width={500} height={500} sizes="160px" className="hidden size-36 shrink-0 object-contain sm:block lg:size-40" />
      </div>
    </section>
  );
}

/** "Have your order number ready.", with the latest one and Copy, when there is one. */
function OrderNumberTip({ orderNumber }: { orderNumber?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!orderNumber) return;
    try {
      await navigator.clipboard.writeText(orderNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // No clipboard (e.g. a plain-http page): the number is on screen to copy by hand.
    }
  };

  return (
    <div className="mt-4 inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-white/85 py-2 pr-2 pl-3.5 text-sm ring-1 ring-brand-100 ring-inset">
      <span className="font-semibold text-brand-950">Have your order number ready.</span>
      {orderNumber && (
        <span className="flex flex-wrap items-center gap-1.5 text-slate-600">
          <span className="whitespace-nowrap">Your latest:</span>
          <span className="font-numeric font-bold tracking-wide whitespace-nowrap text-brand-950">{orderNumber}</span>
          <button type="button" onClick={() => void copy()} className={cn(smallButton, "-my-1.5 bg-brand-50")} aria-live="polite">
            {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </span>
      )}
    </div>
  );
}

function ContactSection() {
  const minute = colomboMinute(useNow());
  const open = minute >= STORE_OPEN_HOUR * 60 && minute < STORE_CLOSE_HOUR * 60;
  const franchise = contactInfo.franchise[0];

  return (
    <section aria-labelledby="contact-heading">
      <SectionHeading id="contact-heading">Contact us</SectionHeading>
      <ul data-stagger className="mt-4 grid gap-3 max-md:grid-cols-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <ContactTile icon={Phone} tile="bg-brand-600 text-snow" label="Call inquiries" value={contactInfo.inquiries.label} href={contactInfo.inquiries.href} action="Call now" />
        <ContactTile icon={Handshake} tile="bg-sun-300 text-brand-950" label="Franchise" value={franchise.label} href={franchise.href} action="Call now" />
        <ContactTile
          icon={Mail}
          tile="bg-brand-100 text-brand-700"
          label="Email"
          value={<EmailValue email={contactInfo.email} />}
          href={`mailto:${contactInfo.email}`}
          action="Send an email"
        />
        <ContactTile
          icon={Clock}
          tile="bg-cream-200 text-brand-800"
          label="Hours"
          value={`Daily: ${STORE_HOURS_LABEL}`}
          badge={
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset",
                open ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200",
              )}
            >
              <span aria-hidden="true" className={cn("size-1.5 rounded-full", open ? "bg-emerald-500" : "bg-slate-400")} />
              {open ? "Open now" : "Closed now"}
            </span>
          }
        />
      </ul>
    </section>
  );
}

/**
 * One way to reach the team: its icon on a coloured tile, what it's for, the number or address, and what tapping
 * does ("Call now", "Send an email"); the whole tile is the link. Without a link (hours), a badge instead.
 */
function ContactTile({
  icon: Icon,
  tile,
  label,
  value,
  href,
  action,
  badge,
}: {
  icon: LucideIcon;
  tile: string;
  label: string;
  value: ReactNode;
  href?: string;
  action?: string;
  badge?: ReactNode;
}) {
  const body = (
    <>
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl max-md:size-10 max-md:rounded-xl", tile)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="mt-4 block text-[0.6875rem] font-semibold tracking-[0.1em] text-slate-500 uppercase max-md:mt-3">{label}</span>
      <span className="font-numeric mt-0.5 block text-base font-bold wrap-break-word text-brand-950 max-md:text-[0.8125rem] max-md:leading-snug">{value}</span>
      <span className="mt-auto pt-3">
        {action ? (
          <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 max-md:text-[0.8125rem]">
            {action}
            <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        ) : (
          badge
        )}
      </span>
    </>
  );
  const frame = "flex h-full flex-col rounded-2xl bg-white p-4 shadow-[0_16px_40px_-30px_rgb(15_33_71/0.5)] ring-1 ring-brand-100 max-md:p-3.5 sm:p-5";
  return (
    <li>
      {href ? (
        <a
          href={href}
          className={cn(frame, "group transition-[box-shadow,translate,scale] hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-26px_rgb(15_33_71/0.5)] active:scale-[0.97]", focusRing)}
        >
          {body}
        </a>
      ) : (
        <div className={frame}>{body}</div>
      )}
    </li>
  );
}

/** The email address, free to break after the @ on a phone's narrow tile. */
function EmailValue({ email }: { email: string }) {
  const at = email.indexOf("@") + 1;
  return (
    <>
      {email.slice(0, at)}
      <wbr />
      {email.slice(at)}
    </>
  );
}

/** The common questions, as on the public /contact page, each with the page that answers it where there is one. */
const TOPICS: { id: string; icon: LucideIcon; title: string; text: string; link?: { href: string; label: string } }[] = [
  {
    id: "orders",
    icon: ReceiptText,
    title: "Orders & tracking",
    text: "Use My Orders or your track link from SMS to follow preparation, pickup, and delivery.",
    link: { href: "/account/orders", label: "Go to My Orders" },
  },
  {
    id: "payments",
    icon: CreditCard,
    title: "Payments & refunds",
    text: "Online payments are confirmed after PayHere settles. Refund questions can be raised with support using your order number.",
  },
  {
    id: "offers",
    icon: Gift,
    title: "Offers & rewards",
    text: "Welcome discounts, free gifts, and Spin & Win require a signed-in account and an eligible branch/cart.",
    link: { href: "/account/rewards", label: "See My Rewards" },
  },
  {
    id: "stores",
    icon: Store,
    title: "Stores & hours",
    text: `Browse branch locations on the Stores page. Typical hours: ${STORE_HOURS_LABEL}.`,
    link: { href: "/stores", label: "Find a store" },
  },
];

/** The common questions (native <details>), the first one open to start with; sharing a `name`, opening one closes the one that was open. */
function TopicsSection() {
  return (
    <section aria-labelledby="topics-heading">
      <SectionHeading id="topics-heading">Common topics</SectionHeading>
      <div data-stagger className="mt-4 divide-y divide-brand-100 overflow-hidden rounded-2xl bg-white shadow-[0_16px_40px_-30px_rgb(15_33_71/0.5)] ring-1 ring-brand-100">
        {TOPICS.map((topic, index) => (
          <details key={topic.id} name="help-topics" open={index === 0} className="smooth-details group/topic">
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-brand-50/50 sm:px-5 [&::-webkit-details-marker]:hidden",
                focusRing,
                "focus-visible:-outline-offset-2",
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-open/topic:bg-brand-600 group-open/topic:text-snow">
                <topic.icon className="size-4.5" aria-hidden="true" />
              </span>
              <span className="flex-1 text-[0.9375rem] font-semibold text-brand-950">{topic.title}</span>
              <ChevronDown className="size-5 shrink-0 text-brand-600 transition-transform group-open/topic:rotate-180" aria-hidden="true" />
            </summary>
            <div className="pr-4 pb-4 pl-[4.375rem] sm:pr-5 sm:pl-[4.625rem]">
              <p className="text-sm text-slate-600">{topic.text}</p>
              {topic.link && (
                <Link href={topic.link.href} className={cn("mt-2 inline-flex items-center gap-0.5 rounded text-sm font-semibold text-brand-700 hover:underline", focusRing)}>
                  {topic.link.label}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="font-display-condensed text-2xl leading-none text-brand-950 uppercase sm:text-3xl">
      {children}
    </h2>
  );
}
