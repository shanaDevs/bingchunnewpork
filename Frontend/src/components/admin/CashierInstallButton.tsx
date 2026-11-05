'use client';

import { useEffect, useState } from 'react';
import { MonitorDown } from 'lucide-react';
import toast from 'react-hot-toast';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const MANIFEST_HREF = '/cashier-manifest.json';
const SW_URL = '/cashier-sw.js';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: window-controls-overlay)').matches
    || nav.standalone === true
  );
}

function useCashierInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (link) {
      link.href = MANIFEST_HREF;
    } else {
      const created = document.createElement('link');
      created.rel = 'manifest';
      created.href = MANIFEST_HREF;
      document.head.appendChild(created);
    }

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register(SW_URL, { scope: '/' }).catch(() => {
        /* The install button still explains the browser menu if registration fails. */
      });
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      toast.success('Cashier installed. Open it from your desktop or Start menu.');
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) {
      toast('In Chrome or Edge, open the browser menu and choose Install Bing Chun Cashier.', {
        icon: '🖥️',
      });
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === 'accepted') setInstalled(true);
  }

  return { installed, install };
}

export function useShowCashierInstall(pathname: string): boolean {
  const [posSurface, setPosSurface] = useState(false);

  useEffect(() => {
    setPosSurface(document.documentElement.dataset.webSurface === 'pos');
  }, []);

  return posSurface || pathname === '/admin/pos' || pathname.startsWith('/admin/pos/');
}

export default function CashierInstallButton({
  variant = 'header',
}: {
  variant?: 'header' | 'block';
}) {
  const { installed, install } = useCashierInstall();

  if (installed) return null;

  const className = variant === 'block'
    ? 'btn-outline mt-3 flex w-full items-center justify-center gap-2 py-3'
    : 'inline-flex items-center gap-1.5 rounded-xl border border-navy-border px-3 py-2 text-xs font-medium text-fg transition-colors hover:border-brand hover:bg-brand-subtle';

  return (
    <button
      type="button"
      onClick={() => void install()}
      className={className}
      title="Install the cashier as a desktop app"
    >
      <MonitorDown size={variant === 'block' ? 18 : 16} />
      Install app
    </button>
  );
}
