/** Injected by tools/cashier-desktop Electron preload. */
export type BingchunCashierBridge = {
  isDesktop: true;
  platform: string;
  getVersion: () => Promise<string>;
  getConfig: () => Promise<{
    posUrl: string;
    apiUrl: string;
    printerName: string;
    agentPort: number;
    autoStartAgent: boolean;
  }>;
  setConfig: (partial: Record<string, unknown>) => Promise<unknown>;
  listPrinters: () => Promise<
    Array<{ name: string; displayName: string; isDefault: boolean; status?: number }>
  >;
  printHtml: (
    html: string,
    options?: {
      deviceName?: string;
      silent?: boolean;
      pageSize?: string | { width: number; height: number };
    }
  ) => Promise<{ ok: boolean }>;
  printHtmlPages: (
    pages: string[],
    options?: {
      deviceName?: string;
      silent?: boolean;
      pageSize?: string | { width: number; height: number };
    }
  ) => Promise<{ ok: boolean; printed: number }>;
  printStickers: (
    stickers: Array<Record<string, string>>,
    options?: { deviceName?: string; silent?: boolean }
  ) => Promise<{ ok: boolean; printed: number }>;
  printsDirect?: boolean;
  openSettings: () => Promise<boolean>;
  getAgentStatus: () => Promise<{ ok: boolean; printer?: string; path?: string }>;
  ensureAgent: () => Promise<{ ok: boolean; started?: boolean; error?: string }>;
  reloadPos: () => Promise<boolean>;
  getSavedLogin: () => Promise<{ email: string; password: string; remember: boolean }>;
  saveLogin: (payload: {
    remember: boolean;
    email?: string;
    password?: string;
  }) => Promise<unknown>;
};

declare global {
  interface Window {
    bingchunCashier?: BingchunCashierBridge;
  }
}

export {};
