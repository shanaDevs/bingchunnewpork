'use client';

import Script from 'next/script';

/**
 * Loads Google Analytics 4 when NEXT_PUBLIC_GA_ID is set (e.g. G-XXXXXXXXXX).
 * Leave the env var empty until you create a GA4 property — see docs/34_SEO_Guide.md.
 */
export default function GoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID?.trim();
  if (!gaId) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
