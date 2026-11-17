'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, MapPin, X } from 'lucide-react';

export type DeliveryLocationStop = {
  orderNumber: string;
  addressLine?: string;
  city?: string;
  district?: string;
  lat?: number | null;
  lng?: number | null;
};

function formatLocation(stop: DeliveryLocationStop): string {
  return [stop.addressLine, stop.city, stop.district].filter(Boolean).join(', ');
}

export function hasDeliveryMapLocation(stop: DeliveryLocationStop): boolean {
  return (stop.lat != null && stop.lng != null) || Boolean(formatLocation(stop));
}

function mapEmbedUrl(stop: DeliveryLocationStop): string | null {
  const location = formatLocation(stop);
  if (stop.lat != null && stop.lng != null) {
    return `https://maps.google.com/maps?q=${stop.lat},${stop.lng}&z=16&output=embed`;
  }
  if (location) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(location)}&z=15&output=embed`;
  }
  return null;
}

function mapExternalUrl(stop: DeliveryLocationStop): string | null {
  const location = formatLocation(stop);
  if (stop.lat != null && stop.lng != null) {
    return `https://www.google.com/maps?q=${stop.lat},${stop.lng}`;
  }
  if (location) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  }
  return null;
}

export function deliveryMapExternalUrl(stop: DeliveryLocationStop): string | null {
  return mapExternalUrl(stop);
}

type Props = {
  stop: DeliveryLocationStop | null;
  onClose: () => void;
};

export default function AdminDeliveryLocationModal({ stop, onClose }: Props) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!stop) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [stop, onClose]);

  if (!portalReady) return null;

  const location = stop ? formatLocation(stop) : '';
  const embedUrl = stop ? mapEmbedUrl(stop) : null;
  const externalUrl = stop ? mapExternalUrl(stop) : null;

  return createPortal(
    <AnimatePresence>
      {stop && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1200] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Delivery location map"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', damping: 28, stiffness: 360 }}
            className="fixed left-1/2 top-1/2 z-[1201] w-[min(94vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-navy-border bg-navy-card shadow-2xl overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3 border-b border-navy-border px-5 py-4">
              <div className="flex items-start gap-2 min-w-0">
                <MapPin size={18} className="mt-0.5 shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Delivery location</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-fg truncate">{stop.orderNumber}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-navy-light hover:text-fg"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {embedUrl ? (
              <div className="relative h-56 sm:h-64 bg-navy-light">
                {externalUrl && (
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-navy-border bg-white px-2.5 py-1.5 text-xs font-medium text-fg shadow-sm hover:bg-gray-50"
                  >
                    Open in Maps <ExternalLink size={12} />
                  </a>
                )}
                <iframe
                  title={`Map for ${stop.orderNumber}`}
                  src={embedUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center bg-navy-light px-5 text-center text-sm text-muted">
                Map unavailable — no coordinates or address for this stop.
              </div>
            )}

            <div className="space-y-3 px-5 py-4 text-sm">
              <div>
                <p className="text-xs text-muted">Address</p>
                <p className="text-fg leading-relaxed break-words">{location || 'No address on file'}</p>
              </div>
              {externalUrl && (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline inline-flex w-full items-center justify-center gap-2 py-2.5 text-sm"
                >
                  Open in Google Maps <ExternalLink size={14} />
                </a>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
