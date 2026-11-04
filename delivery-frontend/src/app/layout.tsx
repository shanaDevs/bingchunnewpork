import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import DeliveryProviders from '@/components/ui/DeliveryProviders';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Bing Chun Delivery',
  description: 'Delivery operations console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} font-sans antialiased`}>
        <DeliveryProviders>{children}</DeliveryProviders>
      </body>
    </html>
  );
}
