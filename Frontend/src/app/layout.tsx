import type { Metadata, Viewport } from 'next';
import { Poppins, Geist } from 'next/font/google';
import './globals.css';
import Providers from '@/components/ui/Providers';
import AppShell from '@/components/layout/AppShell';
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics';
import JsonLd from '@/components/seo/JsonLd';
import { foodEstablishmentSchema, organizationSchema } from '@/components/seo/schemas';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_KEYWORDS,
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_URL,
} from '@/lib/seo';
import { cn } from '@/lib/utils';
import { heroIntroBootScript } from '@/components/home-redesign/sections/hero/heroIntroBoot';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-poppins',
});

const THEME_INIT_SCRIPT = `(function(){try{var stored=localStorage.getItem('bc-theme');var theme='light';if(stored){var parsed=JSON.parse(stored);if(parsed&&parsed.state&&(parsed.state.theme==='dark'||parsed.state.theme==='light')){theme=parsed.state.theme;}}var root=document.documentElement;root.setAttribute('data-theme',theme);root.style.colorScheme=theme;if(theme==='dark'){root.classList.add('dark');}else{root.classList.remove('dark');}var meta=document.querySelector('meta[name="theme-color"]');if(meta){meta.setAttribute('content',theme==='dark'?'#080b18':'#dde3ed');}}catch(e){document.documentElement.setAttribute('data-theme','light');document.documentElement.style.colorScheme='light';}})();`;

const HTTPS_UPGRADE_SCRIPT = `(function(){try{var l=window.location;if(l.protocol!=='http:'||l.port)return;var h=l.hostname;if(h==='localhost'||h.endsWith('.local')||h.endsWith('.localhost')||/^[0-9.]+$/.test(h)||h.indexOf(':')!==-1)return;l.replace('https://'+l.host+l.pathname+l.search+l.hash);}catch(e){}})();`;

const gscVerification = process.env.NEXT_PUBLIC_GSC_VERIFICATION?.trim();
const webSurface = (process.env.WEB_SURFACE || 'shop').trim().toLowerCase();
const isPosWeb = webSurface === 'pos';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Premium Bubble Tea & Ice Cream`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: DEFAULT_KEYWORDS,
  applicationName: isPosWeb ? 'Bing Chun Cashier' : SITE_NAME,
  ...(isPosWeb
    ? {
        appleWebApp: {
          capable: true,
          title: 'Bing Chun Cashier',
          statusBarStyle: 'default' as const,
        },
      }
    : {}),
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'food',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_LK',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Premium Bubble Tea & Ice Cream`,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 512,
        height: 512,
        alt: `${SITE_NAME} logo`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | Premium Bubble Tea & Ice Cream`,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  ...(gscVerification
    ? {
        verification: {
          google: gscVerification,
        },
      }
    : {}),
  manifest: isPosWeb ? '/cashier-manifest.json' : '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#dde3ed',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      data-web-surface={isPosWeb ? 'pos' : webSurface === 'admin' ? 'admin' : 'shop'}
      className={cn('font-sans', geist.variable, poppins.variable)}
      suppressHydrationWarning
    >
      <head>
        <script
          // Secure admin auth cookies are dropped on plain http, so public hosts must load over https.
          dangerouslySetInnerHTML={{ __html: HTTPS_UPGRADE_SCRIPT }}
        />
        <script
          // Runs before paint so stored light/dark preference applies without a dark flash.
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <script
          // Home page only: hides the hero's animated pieces before paint so its entrance never flashes.
          dangerouslySetInnerHTML={{ __html: heroIntroBootScript }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning>
        <JsonLd data={[organizationSchema(), foodEstablishmentSchema()]} />
        <GoogleAnalytics />
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
