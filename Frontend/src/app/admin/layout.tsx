'use client';
import { adminApiFetch } from '@/lib/adminApi';
import { getApiBaseUrl } from '@/lib/apiBase';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Package, ShoppingBag, Store, Tag, Users, BarChart2,
  LogOut, Menu, X, Boxes, Settings, Truck, UserCircle2, Wallet, UserCog, Monitor,
  ChevronsLeft, ChevronsRight, History, TrendingUp, CreditCard,
  ShieldAlert, Dices, MessageCircle, DoorClosed, DoorOpen, Undo2, Gift, CircleDollarSign,
  UserCheck, Radio, Printer,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AdminNotificationBell from '@/components/admin/AdminNotificationBell';
import EodStockResetPrompt, { type EodPromptVariant } from '@/components/admin/stock/EodStockResetPrompt';
import { AdminNotificationProvider } from '@/contexts/AdminNotificationProvider';
import CashierInstallButton, { useShowCashierInstall } from '@/components/admin/CashierInstallButton';
import ThemeToggle from '@/components/ui/ThemeToggle';
import BrandLogo from '@/components/ui/BrandLogo';
import {
  adminHomeHref,
  adminRoleLabel,
  isBranchAdmin,
  isCashier,
  isDeliveryAdmin,
  isPickupOnlyBranchAdmin,
  isSuperAdmin,
  getAdminSession,
  isBranchScoped,
  type AdminSession,
} from '@/lib/adminAuth';
import { hasMenuReadAccess } from '@/lib/adminPermissions';
import { deliveryFrontendHref, isExternalHref } from '@/lib/deliveryFrontendUrl';
import { adminAuthHeaders, clearAdminAuth, installAdminFetch, refreshAdminAuth } from '@/lib/adminSession';
import { useAdminSessionGuard } from '@/hooks/useAdminSessionGuard';
import { formatDate, getColomboDayOfWeek } from '@/lib/datetime';
import { confirmDialog } from '@/store/confirmStore';

const SIDEBAR_COLLAPSED_KEY = 'bc_admin_sidebar_collapsed';
installAdminFetch();

function adminFetchAppSettings() {
  return adminApiFetch('/settings/app');
}

type BranchOperatingStatus = { branchClosedAt: string | null };

function adminBranchFetch(endpoint: string, options?: RequestInit) {
  return adminApiFetch<BranchOperatingStatus>(endpoint, options);
}

const CASHIER_NAV_HREFS = new Set(['/admin', '/admin/orders', '/admin/printer']);

const DELIVERY_MENU_KEYS = new Set(['DELIVERY', 'LIVE_DRIVERS', 'DELIVERY_PAYMENT', 'DELIVERY_WALLET']);

function isDeliveryNavItem(item: { href: string; menuKey?: string }) {
  return DELIVERY_MENU_KEYS.has(item.menuKey ?? '');
}

/** Wallet still opens the standalone delivery portal. Ops and live drivers stay here. */
function isDeliveryWalletPath(pathname: string) {
  return pathname === '/admin/delivery-wallet' || pathname.startsWith('/admin/delivery-wallet/');
}

function isInAppDeliveryPath(pathname: string) {
  return (
    pathname === '/admin/delivery' ||
    pathname.startsWith('/admin/delivery/') ||
    pathname === '/admin/drivers' ||
    pathname.startsWith('/admin/drivers/')
  );
}

function isDeliveryAdminPath(pathname: string) {
  return (
    isDeliveryWalletPath(pathname) ||
    isInAppDeliveryPath(pathname) ||
    pathname === '/admin/delivery-payment' ||
    pathname.startsWith('/admin/delivery-payment/')
  );
}

function isPathUnder(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Routes kept in ALL_NAV for super-only access; non-super users are bounced. */
const NON_SUPER_BLOCKED_PREFIXES = ['/admin/whatsapp-messages', '/admin/loyalty'] as const;

const ALL_NAV: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  superOnly: boolean;
  branchOnly?: boolean;
  hidden?: boolean;
  menuKey?: string;
  external?: boolean;
}> = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, superOnly: false, menuKey: 'DASHBOARD' },
    { href: '/admin/all-orders', label: 'All Orders', icon: ShoppingBag, superOnly: true },
    { href: '/admin/orders', label: 'Orders', icon: ShoppingBag, superOnly: false, menuKey: 'ORDERS' },
    { href: '/admin/refunds', label: 'Refunds', icon: Undo2, superOnly: false, menuKey: 'ORDERS' },
    { href: '/admin/whatsapp-messages', label: 'WhatsApp Messages', icon: MessageCircle, superOnly: true },
    { href: '/admin/pos', label: 'POS', icon: Monitor, superOnly: false, hidden: true, menuKey: 'POS' },
    { href: '/admin/delivery', label: 'Delivery', icon: Truck, superOnly: false, menuKey: 'DELIVERY' },
    { href: '/admin/delivery/live', label: 'Live Drivers', icon: Radio, superOnly: false, menuKey: 'LIVE_DRIVERS' },
    { href: '/admin/stock', label: 'Branch Stock', icon: Boxes, superOnly: false, menuKey: 'STOCK' },
    { href: '/admin/sales', label: 'Sales', icon: TrendingUp, superOnly: false, branchOnly: true, menuKey: 'SALES' },
    { href: '/admin/brand-sales', label: 'Sales', icon: TrendingUp, superOnly: true },
    { href: '/admin/delivery-payment', label: 'Delivery Payment', icon: CreditCard, superOnly: false, branchOnly: true, hidden: true, menuKey: 'DELIVERY_PAYMENT' },
    { href: '/admin/wallet', label: 'Wallet', icon: Wallet, superOnly: false, menuKey: 'WALLET' },
    // Settlement lives under Wallet → Platform Payments; keep for route/permission matching only.
    { href: '/admin/payment-history', label: 'Settlement Payouts', icon: History, superOnly: false, hidden: true, menuKey: 'PAYMENT_HISTORY' },
    { href: '/admin/jason', label: 'JASON', icon: CircleDollarSign, superOnly: true },
    { href: '/admin/menu', label: 'Menu', icon: Package, superOnly: true, menuKey: 'MENU' },
    { href: '/admin/stores', label: 'Stores', icon: Store, superOnly: true, menuKey: 'STORES' },
    { href: '/admin/branch-managers', label: 'Branch Access', icon: UserCog, superOnly: true, menuKey: 'BRANCH_MANAGERS' },
    { href: '/admin/cashiers', label: 'Cashiers', icon: UserCircle2, superOnly: false, branchOnly: true, menuKey: 'CASHIERS' },
    { href: '/admin/promos', label: 'Promotions', icon: Tag, superOnly: false, menuKey: 'PROMOS' },
    { href: '/admin/loyalty', label: 'New Customer Journey', icon: Gift, superOnly: true },
    { href: '/admin/spin', label: 'Spin Wheel', icon: Dices, superOnly: true, menuKey: 'SPIN' },
    { href: '/admin/customers', label: 'Customers', icon: UserCheck, superOnly: true },
    { href: '/admin/users', label: 'Users', icon: Users, superOnly: true, menuKey: 'USERS' },
    { href: '/admin/reports', label: 'Reports', icon: BarChart2, superOnly: true, menuKey: 'REPORTS' },
    { href: '/admin/branch-reports', label: 'Reports', icon: BarChart2, superOnly: false, branchOnly: true, menuKey: 'REPORTS' },
    { href: '/admin/printer', label: 'Printer', icon: Printer, superOnly: false, menuKey: 'ORDERS' },
    { href: '/admin/settings', label: 'Settings', icon: Settings, superOnly: false, menuKey: 'SETTINGS' },
  ];

function matchingNavItem(pathname: string, tab: string | null, walletTabsUser: boolean) {
  // Platform Payments tab still uses PAYMENT_HISTORY permission / page title.
  if (walletTabsUser && pathname === '/admin/wallet' && tab === 'platform') {
    return ALL_NAV.find((n) => n.menuKey === 'PAYMENT_HISTORY');
  }
  const matches = ALL_NAV.filter(
    (n) => pathname === n.href || (n.href !== '/admin' && pathname.startsWith(n.href)),
  );
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0];
}

function pageTitle(pathname: string, tab: string | null, walletTabsUser: boolean): string {
  return matchingNavItem(pathname, tab, walletTabsUser)?.label ?? 'Admin';
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-navy text-muted">
          Loading admin…
        </div>
      }
    >
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </Suspense>
  );
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const walletTab = searchParams.get('tab');
  const [adminUser, setAdminUser] = useState<AdminSession | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isLoginPage = pathname === '/admin/login';
  const showCashierInstall = useShowCashierInstall(pathname);
  const [permissions, setPermissions] = useState<Record<string, { canRead: boolean }>>({});
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [eodPrompt, setEodPrompt] = useState<EodPromptVariant | null>(null);
  const [branchOperatingBusy, setBranchOperatingBusy] = useState(false);
  const queryClient = useQueryClient();

  const branchAdmin = isBranchAdmin(adminUser);

  const { data: branchOperatingStatus } = useQuery({
    queryKey: ['admin-branch-operating-status'],
    queryFn: () => adminBranchFetch('/admin/branch-operating-status'),
    enabled: Boolean(adminUser && branchAdmin && adminUser.storeId && !isLoginPage),
    staleTime: 30_000,
  });

  const branchIsClosed = Boolean(branchOperatingStatus?.branchClosedAt);

  const { data: appSettings } = useQuery({
    queryKey: ['admin-app-settings'],
    queryFn: adminFetchAppSettings,
    enabled: Boolean(adminUser && branchAdmin && !isLoginPage),
    staleTime: 60_000,
  });

  useAdminSessionGuard(!isLoginPage);

  useEffect(() => {
    if (isLoginPage) {
      setLoadingPermissions(false);
      return;
    }
    const admin = getAdminSession();
    if (!admin) {
      setLoadingPermissions(false);
      return;
    }
    if (isSuperAdmin(admin)) {
      setLoadingPermissions(false);
      return;
    }

    fetch(`${getApiBaseUrl()}/admin/me/permissions`, {
      headers: adminAuthHeaders(),
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((res) => {
        const list = res.data ?? res;
        if (Array.isArray(list)) {
          const map: Record<string, { canRead: boolean }> = {};
          list.forEach((p: any) => {
            map[p.menu] = { canRead: p.canRead };
          });
          setPermissions(map);
        }
        setLoadingPermissions(false);
      })
      .catch(() => {
        setLoadingPermissions(false);
      });
  }, [isLoginPage]);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored === '1') setSidebarCollapsed(true);
  }, []);

  // Backfill deliveryEnabled when missing from local session (legacy login or null from API).
  useEffect(() => {
    if (isLoginPage) return;
    const admin = getAdminSession();
    if (!admin || !isBranchScoped(admin)) return;
    if (admin.deliveryEnabled != null) return;
    void refreshAdminAuth()
      .then((next) => setAdminUser(next))
      .catch(() => {
        /* keep existing session until next login */
      });
  }, [isLoginPage]);

  useEffect(() => {
    const admin = getAdminSession();
    if (!admin && !isLoginPage) { router.replace('/admin/login'); return; }
    if (!admin && isLoginPage) return;
    if (admin) {
      setAdminUser((prev) => {
        if (
          prev &&
          prev.id === admin.id &&
          prev.role === admin.role &&
          prev.storeId === admin.storeId &&
          prev.name === admin.name &&
          prev.deliveryEnabled === admin.deliveryEnabled
        ) {
          return prev;
        }
        return admin;
      });
      if (isLoginPage) return;

      if (isPickupOnlyBranchAdmin(admin) && isDeliveryAdminPath(pathname)) {
        router.replace('/admin/orders');
        return;
      }

      if (isDeliveryWalletPath(pathname)) {
        const deliveryTarget = deliveryFrontendHref(pathname);
        if (deliveryTarget) {
          window.location.assign(deliveryTarget);
          return;
        }
        router.replace('/admin');
        return;
      }

      if (isDeliveryAdmin(admin) && pathname === '/admin') {
        router.replace('/admin/delivery');
        return;
      }

      if (isPathUnder(pathname, '/admin/platform-earnings')) {
        router.replace('/admin/wallet?tab=platform');
        return;
      }

      if (isSuperAdmin(admin)) {
        if (pathname === '/admin/orders' || pathname.startsWith('/admin/orders/')) {
          router.replace('/admin/all-orders');
        } else if (pathname === '/admin/sales' || pathname.startsWith('/admin/sales/')) {
          router.replace('/admin/brand-sales');
        } else if (pathname === '/admin/branch-reports' || pathname.startsWith('/admin/branch-reports/')) {
          router.replace('/admin/reports');
        }
        return;
      }

      if (pathname === '/admin/all-orders' || pathname.startsWith('/admin/all-orders/')) {
        router.replace('/admin/orders');
        return;
      }

      if (NON_SUPER_BLOCKED_PREFIXES.some((base) => isPathUnder(pathname, base))) {
        router.replace('/admin/orders');
        return;
      }

      if (isBranchAdmin(admin) && (pathname === '/admin/reports' || pathname.startsWith('/admin/reports/'))) {
        router.replace('/admin/branch-reports');
        return;
      }

      // Cashiers have a default nav set; additional pages require explicit menuKey permissions.
      if (isCashier(admin)) {
        if (pathname === '/admin/refunds' || pathname.startsWith('/admin/refunds/')) {
          router.replace('/admin/orders');
          return;
        }
        const isBaseAllowed =
          pathname === '/admin' ||
          pathname === '/admin/orders' ||
          pathname.startsWith('/admin/orders/');
        if (!isBaseAllowed) {
          if (loadingPermissions) return;
          const activeItem = matchingNavItem(pathname, walletTab, isBranchAdmin(admin));
          const hasPermission = activeItem?.menuKey && hasMenuReadAccess(permissions, activeItem.menuKey);
          if (!hasPermission && pathname !== '/admin') {
            router.replace('/admin');
          }
        }
        return;
      }

      if (!loadingPermissions) {
        const activeItem = matchingNavItem(pathname, walletTab, isBranchAdmin(admin));
        if (activeItem && activeItem.menuKey) {
          const hasAccess = hasMenuReadAccess(permissions, activeItem.menuKey);
          if (!hasAccess) {
            const firstAllowed = ALL_NAV.find(
              (n) =>
                !n.hidden &&
                n.menuKey &&
                hasMenuReadAccess(permissions, n.menuKey) &&
                !(isPickupOnlyBranchAdmin(admin) && isDeliveryNavItem(n)),
            );
            if (firstAllowed) {
              router.replace(firstAllowed.href);
            } else if (pathname !== '/admin') {
              router.replace('/admin');
            }
          }
        }
      }
    }
  }, [pathname, router, isLoginPage, loadingPermissions, permissions, walletTab]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [sidebarOpen]);

  if (isLoginPage) return <>{children}</>;

  const superAdmin = isSuperAdmin(adminUser);
  if (loadingPermissions && !superAdmin) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  const branchAdminUser = isBranchAdmin(adminUser);
  const superAdminUser = isSuperAdmin(adminUser);
  const walletTabsUser = branchAdminUser || superAdminUser;

  const navItems = ALL_NAV.filter((item) => {
    if (item.hidden) return false;
    if (isPickupOnlyBranchAdmin(adminUser) && isDeliveryNavItem(item)) return false;
    if (isCashier(adminUser)) {
      if (item.href === '/admin/refunds') return false;
      if (CASHIER_NAV_HREFS.has(item.href)) return true;
      if (item.menuKey) return hasMenuReadAccess(permissions, item.menuKey);
      return false;
    }
    if (superAdmin && item.href === '/admin/orders') return false;
    if (superAdmin && item.href === '/admin/sales') return false;
    if (superAdmin && item.href === '/admin/delivery-payment') return false;
    if (!superAdmin && item.href === '/admin/all-orders') return false;
    if (!superAdmin && item.superOnly) return false;
    if (superAdmin && item.href === '/admin/branch-reports') return false;
    if (superAdmin) return true;
    if (item.branchOnly && !isBranchAdmin(adminUser)) return false;
    if (item.menuKey) return hasMenuReadAccess(permissions, item.menuKey);
    return !item.superOnly;
  });
  const panelTitle = isCashier(adminUser)
    ? 'Cashier Panel'
    : isBranchAdmin(adminUser)
      ? 'Branch Panel'
      : 'Admin Panel';
  const currentPage = pageTitle(pathname, walletTab, walletTabsUser);
  const branchLabel = adminUser?.storeName?.replace('Bing Chun - ', '');

  function logout() {
    clearAdminAuth();
    setAdminUser(null);
    router.push('/admin/login');
  }

  function toggleSidebarCollapse() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }

  async function persistBranchClose() {
    setBranchOperatingBusy(true);
    try {
      await adminBranchFetch('/admin/branch/close', { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['admin-branch-operating-status'] });
      toast.success('Branch closed — online ordering is paused');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not close branch');
    } finally {
      setBranchOperatingBusy(false);
    }
  }

  async function confirmBranchClose() {
    const confirmed = await confirmDialog({
      title: 'Close branch for today?',
      message: 'Customers will not be able to place online orders until you open the branch again.',
      confirmLabel: 'Close branch',
    });
    if (confirmed) {
      await persistBranchClose();
    }
  }

  async function handleOpenBranch() {
    const confirmed = await confirmDialog({
      title: 'Open branch?',
      message: 'Customers will be able to place online orders again (during your configured ordering hours).',
      confirmLabel: 'Open branch',
    });
    if (!confirmed) return;
    setBranchOperatingBusy(true);
    try {
      await adminBranchFetch('/admin/branch/open', { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['admin-branch-operating-status'] });
      toast.success('Branch is open for online orders');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open branch');
    } finally {
      setBranchOperatingBusy(false);
    }
  }

  async function handleCloseBranch() {
    if (branchIsClosed) {
      await handleOpenBranch();
      return;
    }
    const weeklyResetDay =
      typeof appSettings?.weeklyResetDay === 'number' ? appSettings.weeklyResetDay : null;
    const today = getColomboDayOfWeek();

    if (weeklyResetDay == null) {
      await confirmBranchClose();
      return;
    }

    if (today === weeklyResetDay) {
      setEodPrompt('due');
      return;
    }

    if ((today + 1) % 7 === weeklyResetDay) {
      setEodPrompt('reminder');
      return;
    }

    await confirmBranchClose();
  }

  async function handleEodDismiss() {
    setEodPrompt(null);
    await persistBranchClose();
  }

  const Sidebar = ({ collapsed = false, mobile = false }: { collapsed?: boolean; mobile?: boolean }) => (
    <div className="flex h-full flex-col">
      <div
        className={`admin-sidebar__head flex items-center border-b border-white/10 ${collapsed ? 'justify-center px-2 py-4' : 'justify-between gap-2 p-4'
          }`}
      >
        <Link
          href={adminHomeHref(adminUser)}
          className={`flex min-w-0 items-center ${collapsed ? 'justify-center' : 'gap-2'}`}
          onClick={() => setSidebarOpen(false)}
          title="Bing Chun Admin"
        >
          <BrandLogo size={collapsed ? 32 : 36} showText={!collapsed} className="admin-sidebar__brand" />
        </Link>
        {mobile && (
          <button
            type="button"
            className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav className={`flex-1 space-y-1 overflow-y-auto ${collapsed ? 'px-2 py-3' : 'p-3'}`}>
        {navItems.map((item) => {
          const href = item.href;
          const external = item.external || isExternalHref(href);
          // Wallet stays active for all wallet tabs (system / payouts due / platform).
          const isActive = external
            ? false
            : item.href === '/admin/wallet' && pathname === '/admin/wallet'
              ? true
              : matchingNavItem(pathname, walletTab, walletTabsUser)?.href === item.href;
          const className = `admin-nav-link flex items-center text-sm font-medium transition-all ${collapsed ? 'justify-center rounded-xl px-0 py-2.5' : 'gap-3 rounded-xl px-3 py-2.5'
            } ${isActive
              ? 'admin-nav-link--active font-semibold'
              : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`;
          const label = (
            <>
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span className="admin-nav-link__label truncate">{item.label}</span>}
            </>
          );
          if (external) {
            return (
              <a
                key={item.href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                title={collapsed ? item.label : undefined}
                className={className}
              >
                {label}
              </a>
            );
          }
          return (
            <Link
              key={item.href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              title={collapsed ? item.label : undefined}
              className={className}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className={`space-y-1 border-t border-white/10 ${collapsed ? 'p-2' : 'p-3'}`}>
        {!mobile && (
          <button
            type="button"
            onClick={toggleSidebarCollapse}
            className={`admin-sidebar__toggle admin-sidebar__action flex w-full items-center text-sm transition-all hover:bg-white/10 ${collapsed ? 'justify-center rounded-xl px-0 py-2.5' : 'gap-3 rounded-xl px-3 py-2.5'
              }`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
        <button
          type="button"
          onClick={logout}
          title="Sign out"
          className={`admin-sidebar__action admin-sidebar__action--signout flex w-full items-center text-sm transition-all hover:bg-red-500/20 ${collapsed ? 'justify-center rounded-xl px-0 py-2.5' : 'gap-3 rounded-xl px-3 py-2.5'
            }`}
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  const cashierUser = isCashier(adminUser);

  const activeItem = matchingNavItem(pathname, walletTab, walletTabsUser);

  const cashierPageAllowed =
    cashierUser &&
    (pathname === '/admin' ||
      pathname === '/admin/orders' ||
      pathname.startsWith('/admin/orders/') ||
      (activeItem?.menuKey && hasMenuReadAccess(permissions, activeItem.menuKey)));

  const hasAnyPermission =
    superAdmin || cashierUser || loadingPermissions || Object.values(permissions).some((p) => p.canRead);

  const hasAccessToCurrentPage =
    superAdmin ||
    cashierPageAllowed ||
    loadingPermissions ||
    !activeItem ||
    !activeItem.menuKey ||
    !!hasMenuReadAccess(permissions, activeItem.menuKey);

  return (
    <AdminNotificationProvider adminUser={adminUser}>
    <div
      className={`admin-panel flex min-h-screen bg-navy ${sidebarCollapsed ? 'admin-panel--sidebar-collapsed' : ''
        }`}
    >
      <aside
        className={`admin-sidebar admin-sidebar--desktop hidden lg:flex flex-col fixed z-40 ${sidebarCollapsed ? 'admin-sidebar--collapsed' : ''
          }`}
      >
        <Sidebar collapsed={sidebarCollapsed} />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="admin-sidebar absolute bottom-3 left-3 top-3 z-10 w-64 max-w-[85vw] shadow-2xl">
            <Sidebar mobile />
          </aside>
        </div>
      )}

      <div className="admin-content flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="admin-header sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-navy-border bg-navy-light px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-navy-border text-fg transition-colors hover:border-brand hover:bg-brand-subtle lg:hidden"
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
          >
            <Menu size={20} />
          </button>

          <button
            type="button"
            onClick={toggleSidebarCollapse}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-navy-border text-fg transition-colors hover:border-brand hover:bg-brand-subtle lg:flex"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{currentPage}</p>
            <p className="truncate text-xs text-muted">
              {panelTitle}
              {branchLabel ? ` · ${branchLabel}` : ''}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {showCashierInstall && <CashierInstallButton />}
            {branchAdmin && adminUser?.storeId && (
              <button
                type="button"
                onClick={() => void handleCloseBranch()}
                disabled={branchOperatingBusy}
                className="hidden items-center gap-1.5 rounded-xl border border-navy-border px-3 py-2 text-xs font-medium text-fg transition-colors hover:border-brand hover:bg-brand-subtle disabled:opacity-60 sm:inline-flex"
                title={branchIsClosed ? 'Open branch for online orders' : 'Close branch for online orders'}
              >
                {branchIsClosed ? <DoorOpen size={16} /> : <DoorClosed size={16} />}
                {branchIsClosed ? 'Open Branch' : 'Close Branch'}
              </button>
            )}
            {pathname === '/admin/orders' && (
              <p className="hidden whitespace-nowrap text-xs font-semibold text-fg sm:block sm:text-sm">
                {formatDate(new Date(), { day: 'numeric' })}
              </p>
            )}
            <ThemeToggle />
            <AdminNotificationBell adminUser={adminUser} />
            {adminUser && (
              <div className="ml-1 hidden items-center gap-3 border-l border-navy-border pl-2 sm:flex">
                <div className="min-w-0 text-right">
                  <p className="max-w-[140px] truncate text-xs font-medium text-fg">{adminUser.name}</p>
                  <p className="truncate text-[11px] text-muted">{adminRoleLabel(adminUser.role)}</p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-red-400/10 hover:text-red-400"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="admin-main min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6">
          {!hasAnyPermission ? (
            <div className="card p-8 max-w-lg mx-auto text-center border-amber-500/20 bg-amber-500/5 mt-12">
              <ShieldAlert size={48} className="mx-auto text-amber-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Access Restricted</h3>
              <p className="text-muted text-sm mb-6 leading-relaxed">
                You do not have any permissions assigned to continue in this panel. Please contact your system administrator to assign the appropriate access privileges.
              </p>
              <button onClick={logout} className="btn-primary px-6 py-2 rounded-lg font-medium shadow-lg shadow-brand/20">
                Sign Out
              </button>
            </div>
          ) : isDeliveryWalletPath(pathname) || (isDeliveryAdmin(adminUser) && pathname === '/admin') ? (
            <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
              Redirecting…
            </div>
          ) : !hasAccessToCurrentPage ? (
            <div className="h-full flex items-center justify-center min-h-[400px]">
              <div className="w-8 h-8 rounded-full border-4 border-brand border-t-transparent animate-spin" />
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {eodPrompt && adminUser?.storeId && (
        <EodStockResetPrompt
          variant={eodPrompt}
          storeId={adminUser.storeId}
          onDismiss={handleEodDismiss}
        />
      )}
    </div>
    </AdminNotificationProvider>
  );
}
