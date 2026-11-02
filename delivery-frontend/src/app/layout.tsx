import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import DeliveryProviders from '@/components/ui/DeliveryProviders';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Bing Chun Delivery',
  description: 'Delivery operations console',
};

function runtimeAdminApiBase(): string {
  const adminWeb = (process.env.ADMIN_WEB_URL || process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
  if (!adminWeb || !/^https?:\/\//i.test(adminWeb)) return '';
  return `${adminWeb}/api`;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const adminApiBase = runtimeAdminApiBase();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {adminApiBase ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__BC_ADMIN_API_BASE__=${JSON.stringify(adminApiBase)};`,
            }}
          />
        ) : null}
      </head>
      <body className={`${geist.variable} font-sans antialiased`}>
        <DeliveryProviders>{children}</DeliveryProviders>
      </body>
    </html>
  );
}
