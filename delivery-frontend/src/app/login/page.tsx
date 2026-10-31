'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { LogOut, LayoutDashboard } from 'lucide-react';
import { api } from '@/lib/api';
import { adminHomeHref, adminRoleLabel, getAdminSession, type AdminSession } from '@/lib/adminAuth';
import {
  clearAdminAuth,
  ensureAdminAccessToken,
  hasAdminCsrfCookie,
  saveAdminAuth,
  saveAdminCsrfToken,
} from '@/lib/adminSession';
import { primeBranchOrderAudio } from '@/lib/uiSounds';
import { getApiBaseOverride } from '@/lib/apiBase';
import toast from 'react-hot-toast';
import ThemeToggle from '@/components/ui/ThemeToggle';
import BrandLogo from '@/components/ui/BrandLogo';
import ApiBaseUrlDialog from '@/components/admin/ApiBaseUrlDialog';

const DEMO_ACCOUNTS = [
  {
    type: 'Super Admin',
    email: 'admin@bingchunsrilanka.lk',
    password: 'Admin@123',
    description: 'Full access — menu, stores, users, reports',
  },
  {
    type: 'Delivery Admin',
    email: 'partner@bingchunsrilanka.lk',
    password: 'Admin@123',
    description:
      'HQ delivery partner — register/edit drivers on Drivers tab (create user with DELIVERY_ADMIN role in Super Admin → Users)',
  },
  {
    type: 'Branch Admin',
    email: 'branch@bingchunsrilanka.lk',
    password: 'Branch@123',
    description: 'Nugegoda branch — orders & dashboard only',
  },
  {
    type: 'Branch Admin',
    email: 'dehiwala@bingchunsrilanka.lk',
    password: 'Branch@123',
    description: 'Dehiwala branch — orders & dashboard only',
  },
  {
    type: 'Cashier',
    email: 'cashier@bingchunsrilanka.lk',
    password: 'Cashier@123',
    description: 'Nugegoda branch — Dashboard, Orders & Delivery Jobs only',
  },
] as const;

const LOGO_TAPS_REQUIRED = 5;
const LOGO_TAP_WINDOW_MS = 2500;

type AdminAuthResult = {
  admin: AdminSession;
  accessExpiresAt?: number;
  csrfToken?: string;
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggedIn, setLoggedIn] = useState<AdminSession | null>(null);
  const [showApiDialog, setShowApiDialog] = useState(false);
  const [hasApiOverride, setHasApiOverride] = useState(false);
  const logoTaps = useRef(0);
  const lastLogoTapAt = useRef(0);

  useEffect(() => {
    setHasApiOverride(Boolean(getApiBaseOverride()));
  }, [showApiDialog]);

  useEffect(() => {
    async function checkSession() {
      const session = getAdminSession();
      if (!session) {
        setCheckingSession(false);
        return;
      }
      const valid = await ensureAdminAccessToken();
      if (valid) {
        setLoggedIn(getAdminSession());
      } else {
        clearAdminAuth();
      }
      setCheckingSession(false);
    }
    void checkSession();
  }, []);

  function handleLogoTap() {
    const now = Date.now();
    if (now - lastLogoTapAt.current > LOGO_TAP_WINDOW_MS) {
      logoTaps.current = 1;
    } else {
      logoTaps.current += 1;
    }
    lastLogoTapAt.current = now;
    if (logoTaps.current >= LOGO_TAPS_REQUIRED) {
      logoTaps.current = 0;
      setShowApiDialog(true);
    }
  }

  function completeLoginSuccess(result: AdminAuthResult | null | undefined) {
    if (!result?.admin?.role) {
      toast.error('Unexpected login response from server');
      return;
    }
    const { admin, accessExpiresAt, csrfToken } = result;
    saveAdminAuth(admin, accessExpiresAt);
    saveAdminCsrfToken(csrfToken);
    if (!hasAdminCsrfCookie()) {
      toast.error('Login incomplete — auth cookies were not set. Try again or check API proxy settings.');
      return;
    }
    const label = adminRoleLabel(admin.role);
    toast.success(`Welcome, ${label}! 🧋`);
    router.push(adminHomeHref(admin));
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    primeBranchOrderAudio();
    setLoading(true);
    try {
      const res = await api.post<AdminAuthResult>('/auth/admin/login', { email, password });

      if (!res.admin) {
        toast.error('Unexpected login response from server');
        return;
      }

      completeLoginSuccess({
        admin: res.admin,
        accessExpiresAt: res.accessExpiresAt,
        csrfToken: res.csrfToken,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);
  }

  function handleLogout() {
    clearAdminAuth();
    setLoggedIn(null);
    toast.success('Signed out');
  }

  if (checkingSession) {
    return (
      <div className="admin-panel min-h-screen flex items-center justify-center p-4 bg-navy">
        <p className="text-muted text-sm">Checking session...</p>
      </div>
    );
  }

  if (loggedIn) {
    return (
      <div className="admin-panel min-h-screen flex items-center justify-center p-4 bg-navy relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-3">
              <BrandLogo size={52} showText={false} />
            </div>
            <h1 className="text-2xl font-bold text-fg">Signed In</h1>
            <p className="text-muted text-sm mt-1">You are already logged in</p>
          </div>

          <div className="p-4 rounded-xl border border-navy-border bg-navy-light/40 mb-6">
            <p className="text-fg font-semibold">{loggedIn.name}</p>
            <p className="text-muted text-sm mt-1">{adminRoleLabel(loggedIn.role)}</p>
            <p className="text-muted text-xs mt-1">{loggedIn.email}</p>
            {loggedIn.storeName && (
              <p className="text-brand text-xs mt-2">{loggedIn.storeName.replace('Bing Chun - ', '')}</p>
            )}
            <p className="text-muted text-xs mt-3">Session auto-expires after 15 minutes of inactivity.</p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => router.push(adminHomeHref(loggedIn))}
              className="btn-primary w-full py-3.5 flex items-center justify-center gap-2"
            >
              <LayoutDashboard size={16} />
              Go to Dashboard
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="btn-outline w-full py-3.5 flex items-center justify-center gap-2"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="admin-panel min-h-screen flex items-center justify-center p-4 bg-navy relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <button
            type="button"
            onClick={handleLogoTap}
            className="text-4xl mb-3 inline-block select-none cursor-default"
            aria-label="Staff"
          >
            🔐
          </button>
          <h1 className="text-2xl font-bold text-fg">Staff Login</h1>
          <p className="text-muted text-sm mt-1">Super Admin & Branch Admin</p>
          {hasApiOverride && (
            <p className="text-xs text-amber-400 mt-2">Custom API URL active</p>
          )}
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            className="input-field"
            type="email"
            placeholder="Staff email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input-field"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3.5"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </motion.button>
        </form>

        <p className="text-center text-xs text-muted mt-4">
          Sessions expire after 15 minutes of inactivity.
        </p>

        <div className="mt-6 space-y-3">
          {process.env.NODE_ENV === 'development' && (
            <>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider text-center">Demo accounts (dev only)</p>
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => fillDemo(account)}
                  className="w-full text-left p-3 rounded-xl border border-navy-border hover:border-brand/50 hover:bg-brand-subtle transition-all"
                >
                  <p className="text-sm font-semibold text-fg">{account.type}</p>
                  <p className="text-xs text-muted mt-0.5">{account.description}</p>
                  <p className="text-xs text-brand mt-1.5 font-mono">{account.email}</p>
                </button>
              ))}
            </>
          )}
        </div>

        <p className="text-center text-sm text-muted mt-6">
          Shop customer?{' '}
          <Link href="https://bing-chun-ui2ow.ondigitalocean.app/account/login" className="text-brand hover:text-brand-light font-medium">
            Sign in on the storefront
          </Link>
        </p>
      </motion.div>

      <ApiBaseUrlDialog
        open={showApiDialog}
        onClose={() => {
          setShowApiDialog(false);
          setHasApiOverride(Boolean(getApiBaseOverride()));
        }}
      />
    </div>
  );
}
