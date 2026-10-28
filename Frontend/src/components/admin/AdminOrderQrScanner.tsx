'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseOrderNumberFromScan } from '@/lib/parseOrderScan';
import { playQrScanSuccessSound } from '@/lib/uiSounds';

type Props = {
  open: boolean;
  onClose: () => void;
  onScan: (orderNumber: string) => void;
};

const READER_ID = 'admin-toolbar-qr-reader';

export default function AdminOrderQrScanner({ open, onClose, onScan }: Props) {
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const cameraActiveRef = useRef(false);
  const lastScanRef = useRef('');
  const [cameraReady, setCameraReady] = useState(false);

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner || !cameraActiveRef.current) return;
    cameraActiveRef.current = false;
    setCameraReady(false);
    try {
      await scanner.stop();
    } catch {
      /* already stopped */
    }
    try {
      scanner.clear();
    } catch {
      /* ignore */
    }
    scannerRef.current = null;
  }, []);

  const handleDecode = useCallback(
    (raw: string) => {
      const orderNumber = parseOrderNumberFromScan(raw);
      if (!orderNumber) {
        toast.error('Could not read order number from scan');
        return;
      }
      if (lastScanRef.current === orderNumber) return;
      lastScanRef.current = orderNumber;
      playQrScanSuccessSound();
      onScan(orderNumber);
      onClose();
    },
    [onClose, onScan],
  );

  useEffect(() => {
    if (!open) {
      lastScanRef.current = '';
      void stopCamera();
      return;
    }

    let cancelled = false;

    async function startCamera() {
      await stopCamera();
      if (cancelled) return;

      const { Html5Qrcode } = await import('html5-qrcode');
      if (cancelled || !document.getElementById(READER_ID)) return;

      const scanner = new Html5Qrcode(READER_ID, { verbose: false });
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: (viewfinderWidth, viewfinderHeight) => ({
              width: viewfinderWidth,
              height: viewfinderHeight,
            }),
          },
          (decoded) => {
            handleDecode(decoded);
          },
          () => {},
        );
        if (!cancelled) {
          cameraActiveRef.current = true;
          setCameraReady(true);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Could not open camera';
          toast.error(msg.includes('NotAllowed') ? 'Camera permission denied' : 'Could not open back camera');
          onClose();
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      void stopCamera();
    };
  }, [open, handleDecode, onClose, stopCamera]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="toolbar-qr-scanner"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="admin-qr-scanner-fullscreen"
        >
          <div id={READER_ID} className="admin-qr-scanner-fullscreen__reader" />

          <div className="admin-qr-scanner-fullscreen__overlay" aria-hidden>
            <p className="admin-qr-scanner-fullscreen__hint">Point at order QR code</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="admin-qr-scanner-fullscreen__close"
            aria-label="Close scanner"
          >
            <X size={22} />
          </button>

          {!cameraReady && (
            <div className="admin-qr-scanner-fullscreen__loading">
              <Loader2 size={28} className="animate-spin text-white" />
              <p className="text-white/80 text-sm mt-3">Opening back camera…</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
