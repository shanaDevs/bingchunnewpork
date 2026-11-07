import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, Phone, Clock, MessageCircle, MapPin } from 'lucide-react';
import { absoluteUrl, BUSINESS_EMAIL, BUSINESS_PHONE, BUSINESS_PHONE_DISPLAY } from '@/lib/seo';
import { STORE_HOURS_LABEL } from '@/lib/storeHours';

export const metadata: Metadata = {
  title: 'Help & Support',
  description:
    'Get help with Bing Chun orders, delivery, account, and promotions. Contact our Sri Lanka support team by phone or email.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Help & Support | Bing Chun Sri Lanka',
    description: 'Contact Bing Chun for order help, delivery, and account support.',
    url: absoluteUrl('/contact'),
  },
};

const TOPICS = [
  {
    title: 'Orders & tracking',
    body: 'Use My Orders or your track link from SMS to follow preparation, pickup, and delivery.',
  },
  {
    title: 'Payments & refunds',
    body: 'Online payments are confirmed after PayHere settles. Refund questions can be raised with support using your order number.',
  },
  {
    title: 'Offers & rewards',
    body: 'Welcome discounts, free gifts, and Spin & Win require a signed-in account and an eligible branch/cart.',
  },
  {
    title: 'Stores & hours',
    body: `Browse branch locations on the Stores page. Typical hours: ${STORE_HOURS_LABEL}.`,
  },
] as const;

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm font-medium text-brand">Help & Support</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
        We&apos;re here to help
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
        Reach the Bing Chun team for order issues, delivery questions, or account help.
        Include your order number when you contact us so we can assist faster.
      </p>

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <a
          href={`tel:${BUSINESS_PHONE}`}
          className="flex items-start gap-3 rounded-2xl border border-navy-border bg-navy-light/40 px-4 py-4 transition-colors hover:border-brand/40"
        >
          <Phone className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
          <span>
            <span className="block text-sm font-semibold text-fg">Call inquiries</span>
            <span className="mt-1 block text-sm text-muted">{BUSINESS_PHONE_DISPLAY}</span>
          </span>
        </a>
        <a
          href="tel:+94715118888"
          className="flex items-start gap-3 rounded-2xl border border-navy-border bg-navy-light/40 px-4 py-4 transition-colors hover:border-brand/40"
        >
          <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
          <span>
            <span className="block text-sm font-semibold text-fg">Franchise</span>
            <span className="mt-1 block text-sm text-muted">071 511 8888</span>
          </span>
        </a>
        <a
          href={`mailto:${BUSINESS_EMAIL}`}
          className="flex items-start gap-3 rounded-2xl border border-navy-border bg-navy-light/40 px-4 py-4 transition-colors hover:border-brand/40"
        >
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
          <span>
            <span className="block text-sm font-semibold text-fg">Email</span>
            <span className="mt-1 block text-sm text-muted">{BUSINESS_EMAIL}</span>
          </span>
        </a>
        <div className="flex items-start gap-3 rounded-2xl border border-navy-border bg-navy-light/40 px-4 py-4">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
          <span>
            <span className="block text-sm font-semibold text-fg">Hours</span>
            <span className="mt-1 block text-sm text-muted">Daily: {STORE_HOURS_LABEL}</span>
          </span>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-fg">Common topics</h2>
        <ul className="mt-4 space-y-3">
          {TOPICS.map((topic) => (
            <li key={topic.title} className="rounded-xl border border-navy-border/80 px-4 py-3">
              <p className="text-sm font-semibold text-fg">{topic.title}</p>
              <p className="mt-1 text-sm text-muted">{topic.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/stores"
          className="inline-flex items-center gap-2 rounded-xl border border-navy-border px-4 py-2.5 text-sm font-medium text-fg hover:bg-navy-light"
        >
          <MapPin size={16} aria-hidden />
          Find a store
        </Link>
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          My orders
        </Link>
      </div>
    </main>
  );
}
