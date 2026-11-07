'use client';

import Image from 'next/image';

export type TopCustomer = {
  rank: number;
  name: string;
  phone?: string;
  orders: number;
  revenue: number;
};

export type TopRider = {
  rank: number;
  driverId: string;
  name: string;
  completedJobs: number;
  deliveredOrders: number;
};

type Props = {
  customers: TopCustomer[];
  riders: TopRider[];
};

const AVATAR_PALETTES = [
  { bg: 'bg-sky-100 dark:bg-sky-500/15', text: 'text-sky-700 dark:text-sky-300' },
  { bg: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-orange-100 dark:bg-orange-500/15', text: 'text-orange-700 dark:text-orange-300' },
  { bg: 'bg-blue-100 dark:bg-brand/15', text: 'text-blue-700 dark:text-brand-light' },
  { bg: 'bg-rose-100 dark:bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300' },
  { bg: 'bg-teal-100 dark:bg-teal-500/15', text: 'text-teal-700 dark:text-teal-300' },
  { bg: 'bg-indigo-100 dark:bg-indigo-500/15', text: 'text-indigo-700 dark:text-indigo-300' },
] as const;

const PODIUM_RANK: Record<number, { badge: string }> = {
  1: { badge: 'bg-amber-400 text-amber-950' },
  2: { badge: 'bg-slate-300 text-slate-900' },
  3: { badge: 'bg-orange-300 text-orange-950' },
};


function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function avatarPalette(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function PersonAvatar({ name, seed, size = 'md' }: { name: string; seed: string; size?: 'sm' | 'md' }) {
  const palette = avatarPalette(seed);
  const dim = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center overflow-hidden rounded-xl ${palette.bg} ${palette.text}`}
      aria-hidden
    >
      <span className="text-xs font-semibold tracking-tight">{initials(name)}</span>
    </div>
  );
}

function ProgressBar({
  value,
  max,
  fillClassName,
}: {
  value: number;
  max: number;
  fillClassName: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-light">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${fillClassName}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function TopCustomerPodiumRow({
  customer,
  maxRevenue,
}: {
  customer: TopCustomer;
  maxRevenue: number;
}) {
  const podium = PODIUM_RANK[customer.rank] ?? PODIUM_RANK[3];
  const pct = maxRevenue > 0 ? Math.min(100, (customer.revenue / maxRevenue) * 100) : 0;
  const rowKey = `${customer.rank}-${customer.phone ?? customer.name}`;

  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${podium.badge}`}
      >
        {customer.rank}
      </span>
      <PersonAvatar name={customer.name} seed={rowKey} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-fg" title={customer.name}>
          {customer.name}
        </p>
        <p className="text-[11px] text-muted">
          {customer.orders} order{customer.orders !== 1 ? 's' : ''}
          {customer.phone ? ` · ${customer.phone}` : ''}
        </p>
        <div className="admin-customers-spotlight__bar mt-1.5 h-1.5 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-sky-400"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function TopCustomersSection({ customers }: { customers: TopCustomer[] }) {
  const top3 = customers.slice(0, 3);
  const maxTopRevenue = Math.max(...top3.map((c) => c.revenue), 1);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-navy-border px-5 py-3">
        <h2 className="text-sm font-semibold text-fg">Top Customers</h2>
      </div>

      <div className="admin-customers-spotlight relative flex min-h-0 flex-1 flex-col overflow-x-hidden">
        <div className="admin-customers-spotlight__art pointer-events-none absolute inset-y-0 right-0 z-[0] flex w-[46%] items-center justify-center pr-1 sm:w-[42%] sm:pr-2">
          <Image
            src="/admin/boba-removebg-preview.png"
            alt=""
            width={280}
            height={280}
            className="admin-customers-spotlight__image h-auto w-auto max-h-[min(11rem,90%)] max-w-[9.5rem] object-contain object-center sm:max-h-[min(12rem,90%)] sm:max-w-[10.5rem]"
          />
        </div>

        <div className="relative z-[1] shrink-0">
          <div className="flex flex-col gap-3.5 px-5 py-4 pb-5 pr-[46%] sm:pr-[42%]">
            {top3.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">No customer orders in this period</p>
            ) : (
              top3.map((customer) => (
                <TopCustomerPodiumRow
                  key={`${customer.rank}-${customer.phone ?? customer.name}`}
                  customer={customer}
                  maxRevenue={maxTopRevenue}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TopRiderPodiumRow({
  rider,
  maxOrders,
}: {
  rider: TopRider;
  maxOrders: number;
}) {
  const podium = PODIUM_RANK[rider.rank] ?? PODIUM_RANK[3];
  const pct = maxOrders > 0 ? Math.min(100, (rider.deliveredOrders / maxOrders) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${podium.badge}`}
      >
        {rider.rank}
      </span>
      <PersonAvatar name={rider.name} seed={rider.driverId} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-fg" title={rider.name}>
          {rider.name}
        </p>
        <p className="text-[11px] text-muted">
          {rider.deliveredOrders} order{rider.deliveredOrders !== 1 ? 's' : ''} ·{' '}
          {rider.completedJobs} job{rider.completedJobs !== 1 ? 's' : ''}
        </p>
        <div className="admin-riders-spotlight__bar mt-1.5 h-1.5 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function TopRidersSection({ riders }: { riders: TopRider[] }) {
  const top3 = riders.slice(0, 3);
  const rest = riders.slice(3);
  const maxTopOrders = Math.max(...top3.map((r) => r.deliveredOrders), 1);

  return (
    <section className="flex shrink-0 flex-col">
      <div className="border-b border-navy-border px-5 py-3">
        <h2 className="text-sm font-semibold text-fg">Top Riders</h2>
      </div>

      <div className="admin-riders-spotlight relative overflow-visible border-b border-navy-border">
        <div className="relative z-[1] flex flex-col gap-3.5 px-5 py-4 pb-5 pr-[46%] sm:pr-[42%]">
          {top3.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">No completed deliveries in this period</p>
          ) : (
            top3.map((rider) => (
              <TopRiderPodiumRow key={rider.driverId} rider={rider} maxOrders={maxTopOrders} />
            ))
          )}
        </div>

        <div className="admin-riders-spotlight__art pointer-events-none absolute inset-y-0 right-0 z-[0] flex w-[46%] items-end justify-end pr-1 sm:w-[42%] sm:pr-2">
          <Image
            src="/admin/rider-hero.png"
            alt=""
            width={280}
            height={280}
            className="admin-riders-spotlight__image h-auto w-full max-h-[10.5rem] max-w-[10rem] object-contain object-bottom sm:max-h-[11.5rem] sm:max-w-[11rem]"
          />
        </div>
      </div>

      {rest.length > 0 && (
        <RidersLeaderboard riders={rest} emptyLabel="" />
      )}
    </section>
  );
}

function RidersLeaderboard({
  riders,
  emptyLabel,
}: {
  riders: TopRider[];
  emptyLabel: string;
}) {
  const maxBar = Math.max(...riders.map((r) => r.deliveredOrders), 1);

  if (riders.length === 0) {
    if (!emptyLabel) return null;
    return (
      <p className="flex flex-1 items-center justify-center px-5 py-6 text-center text-xs text-muted">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="min-h-0 flex-1 divide-y divide-navy-border/50 overflow-y-auto">
      {riders.map((r) => (
        <li key={r.driverId}>
          <div className="flex items-start gap-3 px-5 py-3.5">
            <PersonAvatar name={r.name} seed={r.driverId} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-fg" title={r.name}>
                    <span className="mr-1.5 text-[11px] font-semibold text-muted">#{r.rank}</span>
                    {r.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {r.completedJobs} completed job{r.completedJobs !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {r.deliveredOrders} orders
                </span>
              </div>
              <ProgressBar
                value={r.deliveredOrders}
                max={maxBar}
                fillClassName="bg-gradient-to-r from-emerald-500 to-emerald-300"
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function TopCustomersRiders({ customers, riders }: Props) {
  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <TopCustomersSection customers={customers} />

      <div className="border-t border-navy-border" />

      <TopRidersSection riders={riders} />
    </div>
  );
}
