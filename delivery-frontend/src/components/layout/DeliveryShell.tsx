'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  MapPin,
  Menu,
  Radio,
  ShieldAlert,
  Truck,
  Wallet,
  X,
} from 'lucide-react';
import BrandLogo from '@/components/ui/BrandLogo';
import ThemeToggle from '@/components/ui/ThemeToggle';
import AdminNotificationBell from '@/components/admin/AdminNotificationBell';
import { AdminNotificationProvider } from '@/contexts/AdminNotificationProvider';
import {
  adminAuthHeaders,
  clearAdminAuth,
  hasAdminCsrfCookie,
  installAdminFetch,
  refreshAdminAuth,
} from '@/lib/adminSession';
import toast from 'react-hot-toast';
import {
  adminRoleLabel,
  getAdminSession,
  isDeliveryAdmin,
  isSuperAdmin,
  type AdminSession,
} from '@/lib/adminAuth';
import { getApiBaseUrl, clearSameOriginApiOverrideIfNeeded } from '@/lib/apiBase';
import { hasMenuReadAccess } from '@/lib/adminPermissions';
import { mainAdminHref } from '@/lib/mainAdminUrl';
import { useAdminSessionGuard } from '@/hooks/useAdminSessionGuard';

const SIDEBAR_COLLAPSED_KEY = 'bc_delivery_sidebar_collapsed';

const NAV_ITEMS = [
  { href: '/', label: 'Delivery Ops', icon: Truck, menuKey: 'DELIVERY' },
  { href: '/live', label: 'Live Drivers', icon: Radio, menuKey: 'LIVE_DRIVERS' },
  { href: '/wallet', label: 'Delivery Wallet', icon: Wallet, menuKey: 'DELIVERY_WALLET' },
] as const;

function getPageTitle(pathname: string): string {
  if (pathname.startsWith('/live')) return 'Live Drivers Map';
  if (pathname.startsWith('/wallet')) return 'Delivery Wallet';
  if (pathname.startsWith('/route')) return 'Delivery Route';
  return 'Delivery Operations';
}

export default function DeliveryShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  useAdminSessionGuard();

  const [session, setSession] = useState<AdminSession | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [permissions, setPermissions] = useState<Record<string, { canRead?: boolean }>>({});
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    clearSameOriginApiOverrideIfNeeded();
    installAdminFetch();
    let cancelled = false;
    void refreshAdminAuth()
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch(() => {
        if (!cancelled) setSession(getAdminSession());
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (bootstrapping) return;
    setSession(getAdminSession());
  }, [pathname, bootstrapping]);

  useEffect(() => {
    if (bootstrapping) return;
    const stored = getAdminSession();
    if (!stored) return;
    if (hasAdminCsrfCookie()) return;
    clearAdminAuth();
    setSession(null);
    toast.error('Session cookies are missing. Please sign in again on this site.');
    router.replace('/login');
  }, [bootstrapping, router]);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored === '1') setSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    if (bootstrapping) return;
    if (!session) {
      setLoadingPermissions(false);
      return;
    }
    if (isSuperAdmin(session) || isDeliveryAdmin(session)) {
      setLoadingPermissions(false);
      return;
    }
    let cancelled = false;
    setLoadingPermissions(true);
    fetch(`${getApiBaseUrl()}/admin/me/permissions`, {
      headers: adminAuthHeaders(),
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        const list = res.data ?? res;
        if (Array.isArray(list)) {
          const map: Record<string, { canRead: boolean }> = {};
          list.forEach((p: { menu: string; canRead: boolean }) => {
            map[p.menu] = { canRead: p.canRead };
          });
          setPermissions(map);
        }
      })
      .catch(() => {
        // Fallback gracefully
      })
      .finally(() => {
        if (!cancelled) setLoadingPermissions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.id, bootstrapping]);

  useEffect(() => {
    if (bootstrapping) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (loadingPermissions) return;
    const allowed =
      isSuperAdmin(session) ||
      isDeliveryAdmin(session) ||
      hasMenuReadAccess(permissions, 'DELIVERY') ||
      hasMenuReadAccess(permissions, 'LIVE_DRIVERS') ||
      hasMenuReadAccess(permissions, 'DELIVERY_WALLET');
    if (!allowed) router.replace('/login?denied=1');
  }, [session, permissions, loadingPermissions, router, bootstrapping]);

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

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  };

  const handleLogout = () => {
    clearAdminAuth();
    router.push('/login');
  };

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!session) return false;
    if (isSuperAdmin(session) || isDeliveryAdmin(session)) return true;
    if (item.menuKey === 'LIVE_DRIVERS') {
      return (
        hasMenuReadAccess(permissions, 'LIVE_DRIVERS') ||
        hasMenuReadAccess(permissions, 'DELIVERY')
      );
    }
    return hasMenuReadAccess(permissions, item.menuKey);
  });

  const currentPage = getPageTitle(pathname);
  const branchLabel = session?.storeName
    ? session.storeName.replace('Bing Chun - ', '')
    : isDeliveryAdmin(session) || isSuperAdmin(session)
      ? 'All Branches'
      : '';

  const backToAdmin = session && isSuperAdmin(session) ? mainAdminHref() : null;

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  const Sidebar = ({
    collapsed = false,
    mobile = false,
  }: {
    collapsed?: boolean;
    mobile?: boolean;
  }) => (
    <div className="flex h-full flex-col">
      <div
        className={`admin-sidebar__head flex items-center border-b border-white/10 ${
          collapsed ? 'justify-center px-2 py-4' : 'justify-between gap-2 p-4'
        }`}
      >
        <Link
          href="/"
          className={`flex min-w-0 items-center ${collapsed ? 'justify-center' : 'gap-2'}`}
          onClick={() => setSidebarOpen(false)}
          title="Bing Chun Delivery"
        >
          <BrandLogo
            size={collapsed ? 32 : 36}
            showText={!collapsed}
            src="/brand/rider-logo.png"
            title="Bing Chun Delivery"
            subtitle="Delivery Operations"
            className="admin-sidebar__brand"
          />
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
        {visibleNavItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              title={collapsed ? item.label : undefined}
              className={`admin-nav-link flex items-center text-sm font-medium transition-all ${
                collapsed
                  ? 'justify-center rounded-xl px-0 py-2.5'
                  : 'gap-3 rounded-xl px-3 py-2.5'
              } ${
                isActive
                  ? 'admin-nav-link--active font-semibold'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && (
                <span className="admin-nav-link__label truncate">{item.label}</span>
              )}
            </Link>
          );
        })}

        {pathname.startsWith('/route/') && (
          <div
            className={`admin-nav-link admin-nav-link--active flex items-center text-sm font-semibold transition-all ${
              collapsed
                ? 'justify-center rounded-xl px-0 py-2.5'
                : 'gap-3 rounded-xl px-3 py-2.5'
            }`}
            title={collapsed ? 'Route Tracking' : undefined}
          >
            <MapPin size={18} className="shrink-0" />
            {!collapsed && <span className="admin-nav-link__label truncate">Route Details</span>}
          </div>
        )}
      </nav>

      <div className={`space-y-1 border-t border-white/10 ${collapsed ? 'p-2' : 'p-3'}`}>
        {!mobile && (
          <button
            type="button"
            onClick={toggleSidebarCollapse}
            className={`admin-sidebar__toggle admin-sidebar__action flex w-full items-center text-sm transition-all hover:bg-white/10 ${
              collapsed
                ? 'justify-center rounded-xl px-0 py-2.5'
                : 'gap-3 rounded-xl px-3 py-2.5'
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
          onClick={handleLogout}
          title="Sign out"
          className={`admin-sidebar__action admin-sidebar__action--signout flex w-full items-center text-sm transition-all ${
            collapsed
              ? 'justify-center rounded-xl px-0 py-2.5'
              : 'gap-3 rounded-xl px-3 py-2.5'
          }`}
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <AdminNotificationProvider adminUser={session}>
      <div
        className={`admin-panel flex min-h-screen bg-navy ${
          sidebarCollapsed ? 'admin-panel--sidebar-collapsed' : ''
        }`}
      >
        {/* Desktop Fixed Floating Sidebar */}
        <aside
          className={`admin-sidebar admin-sidebar--desktop hidden lg:flex flex-col fixed z-40 ${
            sidebarCollapsed ? 'admin-sidebar--collapsed' : ''
          }`}
        >
          <Sidebar collapsed={sidebarCollapsed} />
        </aside>

        {/* Mobile Slide-Out Drawer */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-[100] lg:hidden">
            <button
              type="button"
              className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
              aria-label="Close menu"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="admin-sidebar absolute bottom-3 left-3 top-3 z-10 w-64 max-w-[85vw] shadow-2xl">
              <Sidebar mobile />
            </aside>
          </div>
        )}

        {/* Main Content Area */}
        <div className="admin-content flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden">
          {/* Admin Header Bar */}
          <header className="admin-header sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-navy-border bg-navy-light/95 backdrop-blur px-4 lg:px-6">
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
                Delivery Ops
                {branchLabel ? ` · ${branchLabel}` : ''}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {backToAdmin && (
                <a
                  href={backToAdmin}
                  className="inline-flex items-center rounded-lg border border-navy-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-fg"
                >
                  Back to admin
                </a>
              )}
              <ThemeToggle />
              <AdminNotificationBell adminUser={session} />
              {session && (
                <div className="ml-1 hidden items-center gap-3 border-l border-navy-border pl-2 sm:flex">
                  <div className="min-w-0 text-right">
                    <p className="max-w-[140px] truncate text-xs font-medium text-fg">
                      {session.name}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {adminRoleLabel(session.role)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
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

          {/* Page Content */}
          <main className="admin-main min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6">
            {children}
          </main>
        </div>
      </div>
    </AdminNotificationProvider>
  );
}
