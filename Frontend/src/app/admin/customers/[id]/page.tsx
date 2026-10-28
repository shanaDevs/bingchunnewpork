'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  User,
  Phone,
  Mail,
  Calendar,
  Store,
  CreditCard,
  Undo2,
  AlertTriangle,
  Award,
  MapPin,
  Clock,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Ban,
  RotateCcw,
  ShoppingBag,
  History,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  ChevronRight,
  Filter,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBase';
import { isSuperAdmin, getAdminSession } from '@/lib/adminAuth';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { formatMoney } from '@/lib/receipt';
import { formatOrderChannel } from '@/lib/orderChannel';
import OrderChannelBadge from '@/components/admin/OrderChannelBadge';
import AdminOrderDrawer from '@/components/admin/AdminOrderDrawer';
import AdminReceiptModal from '@/components/admin/AdminReceiptModal';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import {
  ADMIN_TABLE_PAGE_SIZE,
  buildAdminMetaPagination,
  paginateClientList,
} from '@/lib/pagination';
import { formatOrderCancellationReason } from '@/lib/orderCancel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/* ------------------------------------------------------------------ */
/*  API Helper                                                         */
/* ------------------------------------------------------------------ */
function adminFetch(endpoint: string, options?: RequestInit) {
    return fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Request failed');
    return d.data ?? d;
  });
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  isInvalidPhone: boolean;
  email: string | null;
  isEmailVerified: boolean;
  createdAt: string;
  status: 'ACTIVE' | 'BANNED' | 'DELETED';
  deletedAt: string | null;
  bannedAt: string | null;
  bannedReason: string | null;
  referredBy: { id: string; name: string; phoneMasked: string } | null;
  referralsCount: number;
  orderBranches: Array<{
    id: string;
    name: string;
    city: string;
    ordersCount: number;
    isFavourite: boolean;
  }>;
  kpis: {
    favouriteBranch: { name: string; city: string; spend: number; orders: number } | null;
    favouriteItem: { productName: string; quantity: number } | null;
    totalSpend: number;
    refundedTotal: number;
    refundedCash: number;
    refundedOnline: number;
    pendingRefundsCount: number;
    pendingRefundsLkr: number;
    cancelledCount: number;
    customerCancelled: number;
    cashierCancelled: number;
    loyaltyPoints: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
    ordersTotalCount: number;
  };
  addresses: Array<{
    id: string;
    label: string;
    addressLine: string;
    city: string;
    district: string;
    isDefault: boolean;
    createdAt: string;
    isLastDeliveryUsed: boolean;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    reason: string;
    createdAt: string;
    admin: { id: string; name: string; email: string };
  }>;
}

interface CustomerOrder {
  id: string;
  orderNumber: string;
  orderMode: string;
  status: string;
  paymentMethod: string;
  paymentGateway: string | null;
  paymentStatus: string;
  total: number;
  channel: string;
  createdAt: string;
  cancelReason?: string | null;
  cancelledBy?: string | null;
  cancellationNote?: string | null;
  store: { id: string; name: string; city: string };
  refund: { id: string; status: string; amount: number } | null;
}

interface LoyaltyItem {
  id: string;
  points: number;
  type: string;
  note: string | null;
  orderId: string | null;
  orderNumber: string | null;
  createdAt: string;
}

export default function CustomerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params?.id as string;
  const queryClient = useQueryClient();

  const [session, setSession] = useState<ReturnType<typeof getAdminSession> | null>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'loyalty' | 'addresses' | 'audit'>('orders');
  const [selectedOrderKey, setSelectedOrderKey] = useState<string | null>(null);
  const [receiptOrderKey, setReceiptOrderKey] = useState<string | null>(null);
  const openOrderReceipt = useCallback((orderNumber: string) => setReceiptOrderKey(orderNumber), []);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Tab pagination
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(ADMIN_TABLE_PAGE_SIZE);
  const [loyaltyPage, setLoyaltyPage] = useState(1);
  const [loyaltyPageSize, setLoyaltyPageSize] = useState(ADMIN_TABLE_PAGE_SIZE);
  const [addressPage, setAddressPage] = useState(1);
  const [addressPageSize, setAddressPageSize] = useState(ADMIN_TABLE_PAGE_SIZE);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(ADMIN_TABLE_PAGE_SIZE);

  const [statusFilter, setStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [cancelledOnly, setCancelledOnly] = useState(false);
  const ordersSectionRef = useRef<HTMLDivElement>(null);

  // Ban Modal
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banCategory, setBanCategory] = useState<'ABUSE' | 'FRAUD' | 'CHARGEBACK' | 'OTHER'>('OTHER');
  const [banReasonText, setBanReasonText] = useState('');

  // Restore Modal
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreReasonText, setRestoreReasonText] = useState('');

  useEffect(() => {
    setSession(getAdminSession());
  }, []);

  const isSuper = session ? isSuperAdmin(session) : false;

  // Query Profile
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    error: profileErr,
    refetch: refetchProfile,
  } = useQuery<CustomerProfile>({
    queryKey: ['admin-customer-profile', customerId],
    queryFn: () => adminFetch(`/admin/customers/${customerId}`),
    enabled: Boolean(customerId && session && isSuper),
  });

  // Query Orders
  const { data: ordersData, isLoading: ordersLoading } = useQuery<{
    data: CustomerOrder[];
    meta: { total: number; page: number; limit: number; pages: number };
  }>({
    queryKey: [
      'admin-customer-orders',
      customerId,
      orderPage,
      orderPageSize,
      statusFilter,
      paymentStatusFilter,
      cancelledOnly,
      storeFilter,
    ],
    queryFn: async () => {
      const q = new URLSearchParams({
        page: orderPage.toString(),
        limit: orderPageSize.toString(),
      });
      if (statusFilter) q.set('status', statusFilter);
      if (paymentStatusFilter) q.set('paymentStatus', paymentStatusFilter);
      if (cancelledOnly) q.set('cancelledOnly', 'true');
      if (storeFilter) q.set('storeId', storeFilter);
      return adminFetch(`/admin/customers/${customerId}/orders?${q.toString()}`);
    },
    enabled: Boolean(customerId && session && isSuper),
  });

  // Query Loyalty History
  const { data: loyaltyData, isLoading: loyaltyLoading } = useQuery<{
    data: LoyaltyItem[];
    meta: { total: number; page: number; limit: number; pages: number };
  }>({
    queryKey: ['admin-customer-loyalty', customerId, loyaltyPage, loyaltyPageSize],
    queryFn: () =>
      adminFetch(
        `/admin/customers/${customerId}/loyalty?page=${loyaltyPage}&limit=${loyaltyPageSize}`,
      ),
    enabled: Boolean(customerId && session && isSuper && activeTab === 'loyalty'),
  });

  const ordersPagination = useMemo(
    () =>
      buildAdminMetaPagination(
        ordersData?.meta?.total ?? 0,
        orderPage,
        orderPageSize,
        ordersData?.meta?.pages,
      ),
    [ordersData?.meta?.total, ordersData?.meta?.pages, orderPage, orderPageSize],
  );

  const loyaltyPagination = useMemo(
    () =>
      buildAdminMetaPagination(
        loyaltyData?.meta?.total ?? 0,
        loyaltyPage,
        loyaltyPageSize,
        loyaltyData?.meta?.pages,
      ),
    [loyaltyData?.meta?.total, loyaltyData?.meta?.pages, loyaltyPage, loyaltyPageSize],
  );

  const addressPagination = useMemo(
    () => paginateClientList(profile?.addresses ?? [], addressPage, addressPageSize),
    [profile?.addresses, addressPage, addressPageSize],
  );

  const auditPagination = useMemo(
    () => paginateClientList(profile?.auditLogs ?? [], auditPage, auditPageSize),
    [profile?.auditLogs, auditPage, auditPageSize],
  );

  useEffect(() => {
    setOrderPage(1);
    setLoyaltyPage(1);
    setAddressPage(1);
    setAuditPage(1);
    setStoreFilter('');
  }, [customerId]);

  useEffect(() => {
    if (orderPage > ordersPagination.totalPages) setOrderPage(ordersPagination.totalPages);
  }, [orderPage, ordersPagination.totalPages]);

  useEffect(() => {
    if (loyaltyPage > loyaltyPagination.totalPages) setLoyaltyPage(loyaltyPagination.totalPages);
  }, [loyaltyPage, loyaltyPagination.totalPages]);

  // Ban Mutation
  const banMutation = useMutation({
    mutationFn: (body: { reason: string; category: string }) =>
      adminFetch(`/admin/customers/${customerId}/ban`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Customer account banned');
      setBanModalOpen(false);
      setBanReasonText('');
      queryClient.invalidateQueries({ queryKey: ['admin-customer-profile', customerId] });
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to ban customer');
    },
  });

  // Restore Mutation
  const restoreMutation = useMutation({
    mutationFn: (body: { reason: string }) =>
      adminFetch(`/admin/customers/${customerId}/restore`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Customer account restored');
      setRestoreModalOpen(false);
      setRestoreReasonText('');
      queryClient.invalidateQueries({ queryKey: ['admin-customer-profile', customerId] });
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to restore customer');
    },
  });

  function handleCopyPhone(phone: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phone);
      setCopiedPhone(true);
      toast.success('Phone copied to clipboard');
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  }

  function scrollToOrders() {
    setActiveTab('orders');
    ordersSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  if (session && !isSuper) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <div className="inline-flex p-4 rounded-full bg-rose-500/10 text-rose-500 mb-4">
          <ShieldAlert size={48} />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Access Restricted</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Super Admin permissions required to access customer profile and fraud controls.
        </p>
      </div>
    );
  }

  if (profileLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="h-40 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <div className="inline-flex p-4 rounded-full bg-rose-500/10 text-rose-500 mb-4">
          <AlertTriangle size={48} />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Customer Not Found</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          {(profileErr as Error)?.message || 'The requested customer profile could not be loaded.'}
        </p>
        <Link
          href="/admin/customers"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium"
        >
          Back to Customers List
        </Link>
      </div>
    );
  }

  const kpis = profile.kpis;
  const isBanned = profile.status === 'BANNED';
  const isDeleted = profile.status === 'DELETED';
  const isActive = profile.status === 'ACTIVE';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Breadcrumb Header */}
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <Link href="/admin/customers" className="hover:text-zinc-900 dark:hover:text-zinc-200">
          Customers
        </Link>
        <ChevronRight size={12} />
        <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
          {profile.name}
        </span>
      </div>

      {/* 1. Profile Header Card */}
      <div className="bg-white dark:bg-zinc-900/90 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 p-6 shadow-sm backdrop-blur-sm relative overflow-hidden">
        {/* Soft background glow based on account status */}
        <div
          className={`absolute -right-16 -top-16 w-64 h-64 rounded-full blur-3xl opacity-15 pointer-events-none ${
            isBanned ? 'bg-rose-500' : isDeleted ? 'bg-zinc-500' : 'bg-emerald-500'
          }`}
        />

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative z-10">
          {/* Identity & Account State */}
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-2xl shadow-md shrink-0">
              {profile.name
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((n) => n[0]?.toUpperCase())
                .join('') || 'U'}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {profile.name}
                </h1>

                {/* Status Badges */}
                {isBanned && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    <Ban size={12} />
                    Banned
                  </span>
                )}
                {isDeleted && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20">
                    Deleted (Soft)
                  </span>
                )}
                {isActive && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 size={12} />
                    Active Account
                  </span>
                )}

                {/* Referrals badge */}
                {profile.referralsCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    ⭐ {profile.referralsCount} {profile.referralsCount === 1 ? 'referral' : 'referrals'}
                  </span>
                )}
              </div>

              {/* Identity Row: Phone & Email */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                {/* Full Unmasked Phone for Super Admin */}
                <div className="flex items-center gap-1 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                  <Phone size={13} className="text-zinc-400" />
                  <span>{profile.phone}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyPhone(profile.phone)}
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                    title="Copy phone"
                  >
                    {copiedPhone ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  </button>
                  {profile.isInvalidPhone && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 ml-1">
                      Guest-style / Invalid phone
                    </span>
                  )}
                </div>

                {/* Email with Verified Badge */}
                <div className="flex items-center gap-1">
                  <Mail size={13} className="text-zinc-400" />
                  <span>{profile.email || '—'}</span>
                  {profile.email && (
                    profile.isEmailVerified ? (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Verified
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-500/10 text-zinc-500 dark:text-zinc-400">
                        Unverified
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Metadata Row: Signup Date & Referrer */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400 pt-1">
                <div className="flex items-center gap-1">
                  <Calendar size={13} className="text-zinc-400" />
                  <span>Signed up: <strong>{formatDateTime(profile.createdAt)}</strong></span>
                </div>

                <div className="flex items-center gap-1">
                  <span>Referred by:</span>
                  {profile.referredBy ? (
                    <Link
                      href={`/admin/customers/${profile.referredBy.id}`}
                      className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline inline-flex items-center gap-0.5"
                    >
                      <span>{profile.referredBy.name} ({profile.referredBy.phoneMasked})</span>
                      <ExternalLink size={10} />
                    </Link>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>

              {/* Ban reason banner if banned */}
              {isBanned && profile.bannedReason && (
                <div className="mt-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-400 flex items-start gap-2">
                  <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Banned by Super Admin:</span> {profile.bannedReason}
                    {profile.bannedAt && (
                      <span className="text-rose-600/70 dark:text-rose-400/70 ml-2">
                        ({formatDateTime(profile.bannedAt)})
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Button Group */}
          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
            {/* View Orders Action */}
            <button
              type="button"
              onClick={scrollToOrders}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all"
            >
              <ShoppingBag size={14} />
              <span>View Orders</span>
            </button>

            {/* Ban Action (Active accounts only) */}
            {isActive && (
              <button
                type="button"
                onClick={() => setBanModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition-all"
              >
                <Ban size={14} />
                <span>Ban Account</span>
              </button>
            )}

            {/* Restore Action (Banned or Deleted accounts only) */}
            {(isBanned || isDeleted) && (
              <button
                type="button"
                onClick={() => setRestoreModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition-all"
              >
                <RotateCcw size={14} />
                <span>Restore Account</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Snapshot KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Lifetime Spend */}
        <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Total Spend (Paid)</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CreditCard size={16} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {formatMoney(kpis.totalSpend)}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Across {kpis.ordersTotalCount} lifetime orders
          </p>
        </div>

        {/* KPI 2: Favourite Branch */}
        <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Favourite Branch</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Store size={16} />
            </div>
          </div>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-2 truncate">
            {kpis.favouriteBranch?.name ?? '—'}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            {kpis.favouriteBranch
              ? `${kpis.favouriteBranch.city} · ${kpis.favouriteBranch.orders} orders`
              : 'No paid orders yet'}
          </p>
        </div>

        {/* KPI 3: Favourite Item */}
        <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Favourite Item</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <ShoppingBag size={16} />
            </div>
          </div>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-2 truncate">
            {kpis.favouriteItem?.productName ?? '—'}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            {kpis.favouriteItem ? `${kpis.favouriteItem.quantity} units ordered` : 'No items ordered yet'}
          </p>
        </div>

        {/* KPI 4: Loyalty Points */}
        <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Loyalty Balance</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Award size={16} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {kpis.loyaltyPoints.toLocaleString()} pts
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Earned: +{kpis.lifetimeEarned} · Redeemed: -{kpis.lifetimeRedeemed}
          </p>
        </div>

        {/* KPI 5: Refunded Total */}
        <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Refunded Total (Complete)</span>
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <Undo2 size={16} />
            </div>
          </div>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {formatMoney(kpis.refundedTotal)}
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-1">
            <span>Online: {formatMoney(kpis.refundedOnline)}</span>
            <span>·</span>
            <span>Cash: {formatMoney(kpis.refundedCash)}</span>
          </div>
        </div>

        {/* KPI 6: Pending Refunds */}
        <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Pending Refunds</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock size={16} />
            </div>
          </div>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {kpis.pendingRefundsCount > 0 ? (
              <span className="text-amber-600 dark:text-amber-400">
                {kpis.pendingRefundsCount} open ({formatMoney(kpis.pendingRefundsLkr)})
              </span>
            ) : (
              '0 open'
            )}
          </p>
          <Link
            href={`/admin/refunds?search=${profile.phone}`}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 mt-1 font-medium"
          >
            <span>Open refund queue</span>
            <ExternalLink size={10} />
          </Link>
        </div>

        {/* KPI 7: Cancelled Orders */}
        <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 p-4 shadow-xs sm:col-span-2">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Cancelled Orders</span>
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <XCircle size={16} />
            </div>
          </div>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {kpis.cancelledCount} lifetime cancellations
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            <strong>{kpis.customerCancelled}</strong> customer-cancelled · <strong>{kpis.cashierCancelled}</strong> cashier/kitchen-cancelled
          </p>
        </div>
      </div>

      {/* 3. Tabbed Details Navigation */}
      <div ref={ordersSectionRef} className="pt-2">
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
          {[
            { id: 'orders', label: 'Order History', count: kpis.ordersTotalCount },
            { id: 'loyalty', label: 'Loyalty Timeline' },
            { id: 'addresses', label: 'Addresses', count: profile.addresses.length },
            { id: 'audit', label: 'HQ Audit Log', count: profile.auditLogs.length },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                  active
                    ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      active
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Orders Tab */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Order Filters */}
          <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 p-3.5 shadow-xs flex flex-wrap items-center gap-3">
            <Filter size={14} className="text-zinc-400 ml-1 shrink-0" />

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setOrderPage(1);
              }}
              className="text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-zinc-800 dark:text-zinc-200"
            >
              <option value="">All Order Statuses</option>
              <option value="RECEIVED">Received</option>
              <option value="PREPARING">Preparing</option>
              <option value="READY">Ready</option>
              <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
              <option value="DELIVERED">Delivered</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={paymentStatusFilter}
              onChange={(e) => {
                setPaymentStatusFilter(e.target.value);
                setOrderPage(1);
              }}
              className="text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-zinc-800 dark:text-zinc-200"
            >
              <option value="">All Payment Statuses</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
            </select>

            <select
              value={storeFilter}
              onChange={(e) => {
                setStoreFilter(e.target.value);
                setOrderPage(1);
              }}
              disabled={!profile.orderBranches?.length}
              className="text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-zinc-800 dark:text-zinc-200 disabled:opacity-50 max-w-[14rem]"
              title="Branches this customer has ordered from"
            >
              <option value="">All branches</option>
              {(profile.orderBranches ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.isFavourite ? '★ ' : ''}
                  {branch.name} ({branch.city}) · {branch.ordersCount}{' '}
                  {branch.ordersCount === 1 ? 'order' : 'orders'}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={cancelledOnly}
                onChange={(e) => {
                  setCancelledOnly(e.target.checked);
                  setOrderPage(1);
                }}
                className="rounded text-emerald-600 focus:ring-emerald-500/20"
              />
              <span>Cancelled only</span>
            </label>
          </div>

          {/* Orders Table */}
          <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-600 dark:text-zinc-400">
                <thead className="bg-zinc-50/80 dark:bg-zinc-800/40 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Order #</th>
                    <th scope="col" className="px-5 py-3.5">Date & Time</th>
                    <th scope="col" className="px-5 py-3.5">Branch</th>
                    <th scope="col" className="px-5 py-3.5">Mode</th>
                    <th scope="col" className="px-5 py-3.5">Channel</th>
                    <th scope="col" className="px-5 py-3.5 text-center">Status</th>
                    <th scope="col" className="px-5 py-3.5 min-w-[10rem]">Cancellation reason</th>
                    <th scope="col" className="px-5 py-3.5 text-center">Payment</th>
                    <th scope="col" className="px-5 py-3.5 text-right">Total (LKR)</th>
                    <th scope="col" className="px-5 py-3.5 text-center">Refund</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                  {ordersLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={10} className="px-5 py-4">
                          <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded-md w-full" />
                        </td>
                      </tr>
                    ))
                  ) : !ordersData?.data?.length ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-12 text-center text-zinc-400">
                        No orders found for this customer.
                      </td>
                    </tr>
                  ) : (
                    ordersData.data.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => setSelectedOrderKey(o.orderNumber)}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors group"
                      >
                        <td className="px-5 py-4 font-mono font-semibold text-xs text-emerald-600 dark:text-emerald-400 group-hover:underline">
                          {o.orderNumber}
                        </td>
                        <td className="px-5 py-4 text-xs whitespace-nowrap">
                          {formatDateTime(o.createdAt)}
                        </td>
                        <td className="px-5 py-4 text-xs whitespace-nowrap font-medium text-zinc-800 dark:text-zinc-200">
                          {o.store.name} ({o.store.city})
                        </td>
                        <td className="px-5 py-4 text-xs whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              o.orderMode === 'DELIVERY'
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {o.orderMode}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs whitespace-nowrap">
                          <OrderChannelBadge channel={o.channel} />
                        </td>
                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              o.status === 'DELIVERED' || o.status === 'READY'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : o.status === 'CANCELLED'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-zinc-600 dark:text-zinc-400 max-w-[14rem]">
                          {(() => {
                            const reason = formatOrderCancellationReason(o);
                            if (!reason) {
                              return <span className="text-zinc-400">—</span>;
                            }
                            return (
                              <span className="line-clamp-2" title={reason}>
                                {reason}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              o.paymentStatus === 'PAID'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {o.paymentStatus}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right text-xs font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          {formatMoney(o.total)}
                        </td>
                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          {o.refund ? (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                o.refund.status === 'COMPLETE'
                                  ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              }`}
                            >
                              Refund: {o.refund.status}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800">
              <AdminTablePagination
                pageSize={orderPageSize}
                onPageSizeChange={(size) => {
                  setOrderPageSize(size);
                  setOrderPage(1);
                }}
                rangeStart={ordersPagination.rangeStart}
                rangeEnd={ordersPagination.rangeEnd}
                totalItems={ordersPagination.totalItems}
                safePage={ordersPagination.safePage}
                totalPages={ordersPagination.totalPages}
                pageList={ordersPagination.pageList}
                onPageChange={setOrderPage}
                itemLabel="orders"
                ariaLabel="Customer order history pagination"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Loyalty History */}
      {activeTab === 'loyalty' && (
        <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 p-5 shadow-xs">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-4">
            Loyalty Earn & Redeem History
          </h2>
          {loyaltyLoading ? (
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
              ))}
            </div>
          ) : !loyaltyData?.data?.length ? (
            <p className="text-sm text-zinc-400 py-8 text-center">No loyalty transactions recorded.</p>
          ) : (
            <div className="space-y-3">
              {loyaltyData.data.map((tx) => {
                const isPositive = tx.points >= 0;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/60 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isPositive
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {tx.type}
                        </span>
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          {tx.note || 'Points transaction'}
                        </span>
                        {tx.orderNumber && (
                          <button
                            type="button"
                            onClick={() => setSelectedOrderKey(tx.orderNumber)}
                            className="text-emerald-600 dark:text-emerald-400 font-mono font-medium hover:underline inline-flex items-center gap-0.5"
                          >
                            <span>#{tx.orderNumber}</span>
                            <ExternalLink size={10} />
                          </button>
                        )}
                      </div>
                      <p className="text-zinc-400">{formatDateTime(tx.createdAt)}</p>
                    </div>

                    <span
                      className={`text-sm font-bold font-mono ${
                        isPositive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isPositive ? `+${tx.points}` : tx.points} pts
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <AdminTablePagination
              pageSize={loyaltyPageSize}
              onPageSizeChange={(size) => {
                setLoyaltyPageSize(size);
                setLoyaltyPage(1);
              }}
              rangeStart={loyaltyPagination.rangeStart}
              rangeEnd={loyaltyPagination.rangeEnd}
              totalItems={loyaltyPagination.totalItems}
              safePage={loyaltyPagination.safePage}
              totalPages={loyaltyPagination.totalPages}
              pageList={loyaltyPagination.pageList}
              onPageChange={setLoyaltyPage}
              itemLabel="transactions"
              ariaLabel="Customer loyalty history pagination"
            />
          </div>
        </div>
      )}

      {/* Tab 3: Saved Addresses */}
      {activeTab === 'addresses' && (
        <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 p-5 shadow-xs">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-4">
            Saved Delivery Addresses (Read-only)
          </h2>
          {!profile.addresses.length ? (
            <p className="text-sm text-zinc-400 py-8 text-center">No addresses saved for this customer.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {addressPagination.slice.map((addr) => (
                <div
                  key={addr.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    addr.isLastDeliveryUsed
                      ? 'border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/10'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <MapPin size={16} className="text-emerald-600 dark:text-emerald-400" />
                      <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                        {addr.label || 'Address'}
                      </span>
                      {addr.isDefault && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                          Default
                        </span>
                      )}
                    </div>

                    {addr.isLastDeliveryUsed && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                        Last Delivery Used
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                    {addr.addressLine}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {addr.city}, {addr.district}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <AdminTablePagination
              pageSize={addressPageSize}
              onPageSizeChange={(size) => {
                setAddressPageSize(size);
                setAddressPage(1);
              }}
              rangeStart={addressPagination.rangeStart}
              rangeEnd={addressPagination.rangeEnd}
              totalItems={addressPagination.totalItems}
              safePage={addressPagination.safePage}
              totalPages={addressPagination.totalPages}
              pageList={addressPagination.pageList}
              onPageChange={setAddressPage}
              itemLabel="addresses"
              ariaLabel="Customer addresses pagination"
            />
          </div>
        </div>
      )}

      {/* Tab 4: HQ Audit Log */}
      {activeTab === 'audit' && (
        <div className="bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 p-5 shadow-xs">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-4">
            Super Admin Action Audit Log
          </h2>
          {!profile.auditLogs.length ? (
            <p className="text-sm text-zinc-400 py-8 text-center">No HQ actions have been logged for this customer.</p>
          ) : (
            <div className="space-y-3">
              {auditPagination.slice.map((log) => (
                <div
                  key={log.id}
                  className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          log.action === 'BAN'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {log.action}
                      </span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        by {log.admin.name} ({log.admin.email})
                      </span>
                    </div>
                    <span className="text-zinc-400">{formatDateTime(log.createdAt)}</span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-300 pl-2 border-l-2 border-zinc-300 dark:border-zinc-600">
                    <strong>Reason:</strong> {log.reason}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <AdminTablePagination
              pageSize={auditPageSize}
              onPageSizeChange={(size) => {
                setAuditPageSize(size);
                setAuditPage(1);
              }}
              rangeStart={auditPagination.rangeStart}
              rangeEnd={auditPagination.rangeEnd}
              totalItems={auditPagination.totalItems}
              safePage={auditPagination.safePage}
              totalPages={auditPagination.totalPages}
              pageList={auditPagination.pageList}
              onPageChange={setAuditPage}
              itemLabel="audit entries"
              ariaLabel="Customer HQ audit log pagination"
            />
          </div>
        </div>
      )}

      {/* Admin Order Drawer Integration */}
      <AdminOrderDrawer
        orderKey={selectedOrderKey}
        onClose={() => setSelectedOrderKey(null)}
        onViewReceipt={openOrderReceipt}
        readOnly
      />
      <AdminReceiptModal orderKey={receiptOrderKey} onClose={() => setReceiptOrderKey(null)} />

      {/* Ban Customer Dialog */}
      <Dialog open={banModalOpen} onOpenChange={setBanModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Ban size={18} />
              <span>Ban Customer Account</span>
            </DialogTitle>
            <DialogDescription>
              Banning immediately blocks login, refresh tokens, and new order placement. Existing pending orders will complete or cancel via normal payment rules.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Reason Category
              </label>
              <select
                value={banCategory}
                onChange={(e) => setBanCategory(e.target.value as any)}
                className="w-full text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2 text-zinc-800 dark:text-zinc-200"
              >
                <option value="ABUSE">Abuse / Harassment</option>
                <option value="FRAUD">Fraud / Fake Orders</option>
                <option value="CHARGEBACK">Chargeback / Payment Dispute</option>
                <option value="OTHER">Other Violation</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Reason Details (Required for Audit)
              </label>
              <textarea
                value={banReasonText}
                onChange={(e) => setBanReasonText(e.target.value)}
                placeholder="Describe why HQ is banning this account..."
                rows={3}
                className="w-full text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2.5 text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-rose-500/20"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setBanModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={banReasonText.trim().length < 2 || banMutation.isPending}
              onClick={() =>
                banMutation.mutate({
                  category: banCategory,
                  reason: banReasonText.trim(),
                })
              }
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 transition-colors"
            >
              {banMutation.isPending ? 'Banning...' : 'Confirm Ban'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Customer Dialog */}
      <Dialog open={restoreModalOpen} onOpenChange={setRestoreModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <RotateCcw size={18} />
              <span>Restore Customer Account</span>
            </DialogTitle>
            <DialogDescription>
              Restoring clears ban and deletion flags so the customer can log in and place orders again. The system will verify that the phone number is not currently used by another active account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Reason for Restoration (Required for Audit)
              </label>
              <textarea
                value={restoreReasonText}
                onChange={(e) => setRestoreReasonText(e.target.value)}
                placeholder="e.g., Customer resolved issue with HQ support, identity verified..."
                rows={3}
                className="w-full text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2.5 text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setRestoreModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={restoreReasonText.trim().length < 2 || restoreMutation.isPending}
              onClick={() =>
                restoreMutation.mutate({
                  reason: restoreReasonText.trim(),
                })
              }
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors"
            >
              {restoreMutation.isPending ? 'Restoring...' : 'Confirm Restore'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
