'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanQrCode, Search, CheckCircle, X, Loader2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseOrderNumberFromScan } from '@/lib/parseOrderScan';
import { PAYMENT_METHOD_LABELS, formatMoney } from '@/lib/receipt';
import { resolveCustomerDisplayName } from '@/lib/customerName';
import { orderBalanceDue } from '@/lib/orderEdit';
import { playQrScanSuccessSound, playOrderConfirmedSound } from '@/lib/uiSounds';
import CounterPaymentForm, {
  counterPaymentValid,
  toApiPaymentMethod,
  type CounterPaymentMethod,
} from '@/components/admin/CounterPaymentForm';
import type { PaymentMethod } from '@/types';

type AdminOrder = {
  id: string;
  orderNumber: string;
  orderMode: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  total: number;
  prepaidAmount?: number;
  balanceDue?: number;
  guestName?: string | null;
  guestPhone?: string | null;
  user?: { name?: string | null; phone?: string | null } | null;
  store?: { name: string };
  items?: { productName: string; quantity: number; totalPrice: number }[];
};

type Props = {
  adminFetch: (endpoint: string, options?: RequestInit) => Promise<{ data?: AdminOrder; message?: string; success?: boolean }>;
  onComplete?: () => void;
};

export default function AdminTakeawayScanner({ adminFetch, onComplete }: Props) {
  const [scanning, setScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<AdminOrder | null>(null);
  const [confirmAnimating, setConfirmAnimating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastCompleted, setLastCompleted] = useState<AdminOrder | null>(null);
  const [counterPaymentMethod, setCounterPaymentMethod] = useState<CounterPaymentMethod>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const lastScanRef = useRef('');
  const cameraActiveRef = useRef(false);

  const loadOrder = useCallback(
    async (raw: string, fromScan = false) => {
      const orderNumber = parseOrderNumberFromScan(raw);
      if (!orderNumber) {
        toast.error('Could not read order number from scan');
        return;
      }
      if (lastScanRef.current === orderNumber && pendingOrder?.orderNumber === orderNumber) {
        return;
      }
      lastScanRef.current = orderNumber;
      setLastCompleted(null);

      setLoading(true);
      try {
        const res = await adminFetch(`/orders/${encodeURIComponent(orderNumber)}`);
        const data = res.data;
        if (!data) throw new Error(res.message || 'Order not found');

        if (fromScan) playQrScanSuccessSound();

        if (data.orderMode !== 'TAKEAWAY') {
          toast.error('This order is delivery — use status update instead');
          setPendingOrder(null);
          return;
        }

        if (data.status === 'DELIVERED' || data.status === 'CANCELLED') {
          toast.error(data.status === 'CANCELLED' ? 'Order was cancelled' : 'Order already picked up');
          setPendingOrder(null);
          return;
        }

        setPendingOrder(data);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load order';
        toast.error(msg);
        setPendingOrder(null);
      } finally {
        setLoading(false);
      }
    },
    [adminFetch, pendingOrder?.orderNumber]
  );

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

  useEffect(() => {
    const shouldRun = scanning && !pendingOrder && !actionLoading;
    if (!shouldRun) {
      void stopCamera();
      return;
    }

    let cancelled = false;

    async function startCamera() {
      await stopCamera();
      if (cancelled) return;

      const { Html5Qrcode } = await import('html5-qrcode');
      if (cancelled || !document.getElementById('admin-qr-reader')) return;

      const scanner = new Html5Qrcode('admin-qr-reader', { verbose: false });
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
            void loadOrder(decoded, true);
          },
          () => {}
        );
        if (!cancelled) {
          cameraActiveRef.current = true;
          setCameraReady(true);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Could not open camera';
          toast.error(msg.includes('NotAllowed') ? 'Camera permission denied' : 'Could not open back camera');
          setScanning(false);
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      void stopCamera();
    };
  }, [scanning, pendingOrder, actionLoading, loadOrder, stopCamera]);

  useEffect(() => {
    if (!scanning) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [scanning]);

  function dismissPending() {
    setPendingOrder(null);
    lastScanRef.current = '';
    setCounterPaymentMethod('CASH');
    setCashReceived('');
  }

  useEffect(() => {
    if (pendingOrder) {
      setCounterPaymentMethod('CASH');
      setCashReceived('');
    }
  }, [pendingOrder?.id]);

  async function confirmAndCompletePickup() {
    if (!pendingOrder || actionLoading) return;

    const collectPayment = pendingOrder.paymentStatus !== 'PAID';
    const balanceDue = orderBalanceDue({
      paymentStatus: pendingOrder.paymentStatus,
      total: pendingOrder.total,
      prepaidAmount: pendingOrder.prepaidAmount ?? 0,
      balanceDue: pendingOrder.balanceDue,
    });
    const collectBalance = !collectPayment && balanceDue > 0;
    const amountDue = collectPayment ? pendingOrder.total : balanceDue;
    const needsCounterPayment = amountDue > 0;

    if (needsCounterPayment && !counterPaymentValid(counterPaymentMethod, cashReceived, amountDue)) {
      toast.error('Enter a valid cash amount or select card payment');
      return;
    }

    setActionLoading(true);
    playOrderConfirmedSound();
    setConfirmAnimating(true);

    try {
      const body: Record<string, unknown> = { collectPayment, collectBalance };
      if (needsCounterPayment) {
        body.paymentMethod = toApiPaymentMethod(counterPaymentMethod);
        if (counterPaymentMethod === 'CASH') {
          body.cashReceivedAmount = Math.round(parseFloat(cashReceived) || 0);
        }
      }

      const res = await adminFetch(`/orders/${pendingOrder.id}/complete-takeaway`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error(res.message || 'Failed');

      await new Promise((r) => setTimeout(r, 700));

      setLastCompleted({
        ...pendingOrder,
        status: 'DELIVERED',
        paymentStatus: 'PAID',
      });
      setPendingOrder(null);
      lastScanRef.current = '';

      toast.success(
        collectPayment
          ? `#${pendingOrder.orderNumber} picked up · marked paid`
          : collectBalance
            ? `#${pendingOrder.orderNumber} picked up · collected ${formatMoney(balanceDue)}`
            : `#${pendingOrder.orderNumber} picked up · already paid online`
      );
      onComplete?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not complete pickup');
    } finally {
      setActionLoading(false);
      setConfirmAnimating(false);
    }
  }

  const pendingPaid = pendingOrder?.paymentStatus === 'PAID';
  const pendingBalanceDue = pendingOrder
    ? orderBalanceDue({
        paymentStatus: pendingOrder.paymentStatus,
        total: pendingOrder.total,
        prepaidAmount: pendingOrder.prepaidAmount ?? 0,
        balanceDue: pendingOrder.balanceDue,
      })
    : 0;
  const pendingAmountDue = pendingOrder
    ? pendingPaid
      ? pendingBalanceDue
      : pendingOrder.total
    : 0;
  const pendingNeedsCounterPayment = Boolean(pendingOrder && pendingAmountDue > 0);
  const pendingCounterPaymentReady = !pendingNeedsCounterPayment
    || counterPaymentValid(counterPaymentMethod, cashReceived, pendingAmountDue);

  function paymentMethodLabel(method: string) {
    return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;
  }

  return (
    <div className="admin-takeaway-scanner card p-4 sm:p-5 mb-6 relative overflow-hidden">
      <AnimatePresence>
        {confirmAnimating && (
          <motion.div
            key="confirm-burst"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-green-500/15 backdrop-blur-[2px] pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 1.2, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              className="flex flex-col items-center gap-2"
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 0.5, repeat: 1 }}
                className="w-16 h-16 rounded-full bg-green-500/30 border-2 border-green-400 flex items-center justify-center"
              >
                <CheckCircle size={36} className="text-green-400" />
              </motion.div>
              <p className="text-green-400 font-bold text-sm flex items-center gap-1">
                <Sparkles size={14} /> Pickup complete · Paid
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-4">
        <h2 className="text-lg font-bold text-fg flex items-center gap-2">
          <ScanQrCode size={20} className="text-brand" />
          Takeaway counter
        </h2>
        <p className="text-muted text-xs mt-1">
          Tap scan to open back camera, or enter order # below
        </p>
      </div>

      {!scanning ? (
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="btn-primary w-full py-3.5 mb-4 text-sm font-semibold flex items-center justify-center gap-2"
        >
          <ScanQrCode size={18} />
          Scan QR — back camera
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setScanning(false)}
          className="btn-outline w-full py-3 mb-4 text-sm font-semibold flex items-center justify-center gap-2 border-brand text-brand"
        >
          <X size={16} />
          Close camera
        </button>
      )}

      <AnimatePresence>
        {scanning && (
          <motion.div
            key="qr-fullscreen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="admin-qr-scanner-fullscreen"
          >
            <div id="admin-qr-reader" className="admin-qr-scanner-fullscreen__reader" />

            <div className="admin-qr-scanner-fullscreen__overlay" aria-hidden>
              <p className="admin-qr-scanner-fullscreen__hint">Point at customer QR code</p>
            </div>

            <button
              type="button"
              onClick={() => setScanning(false)}
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

      <form
        className="flex gap-2 mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          void loadOrder(manualInput, false);
        }}
      >
        <div className="input-icon-wrap flex-1">
          <Search size={14} className="input-icon" aria-hidden />
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Order # e.g. BC250605-1234"
            className="input-field w-full"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary px-4 py-2.5 text-sm shrink-0">
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Find'}
        </button>
      </form>

      {lastCompleted && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-green-400 font-semibold text-sm flex items-center gap-1.5">
                <CheckCircle size={16} /> Pickup complete
              </p>
              <p className="font-mono font-bold text-fg text-sm mt-1">#{lastCompleted.orderNumber}</p>
              <p className="text-muted text-xs mt-0.5">
                LKR {lastCompleted.total?.toLocaleString()} · ✓ Paid
              </p>
            </div>
            <button type="button" onClick={() => setLastCompleted(null)} className="text-muted hover:text-fg p-1" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {pendingOrder && (
          <motion.div
            key="pending-backdrop"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={dismissPending}
          >
            <motion.div
              key="pending-panel"
              role="alertdialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="card w-full max-w-md p-0 overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-brand/10 border-b border-navy-border px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-brand/20 flex items-center justify-center">
                    <ScanQrCode size={22} className="text-brand" />
                  </div>
                  <div>
                    <h3 className="font-bold text-fg">Confirm pickup</h3>
                    <p className="text-muted text-xs mt-0.5">Completes order and marks paid in one step</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono font-bold text-fg text-lg">#{pendingOrder.orderNumber}</p>
                    <p className="text-muted text-xs mt-1">
                      {pendingOrder.store?.name || 'Store'}
                      {(() => {
                        const customer = resolveCustomerDisplayName({
                          guestName: pendingOrder.guestName,
                          userName: pendingOrder.user?.name,
                          phone: pendingOrder.guestPhone ?? pendingOrder.user?.phone,
                          fallback: '',
                        });
                        return customer ? ` · ${customer}` : '';
                      })()}
                      {(pendingOrder.guestPhone ?? pendingOrder.user?.phone)
                        ? ` · ${pendingOrder.guestPhone ?? pendingOrder.user?.phone}`
                        : ''}
                    </p>
                  </div>
                  <span className="text-brand font-bold text-lg shrink-0">
                    LKR {pendingOrder.total?.toLocaleString()}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-lg bg-navy-card text-fg font-semibold">{pendingOrder.status}</span>
                  <span
                    className={`px-2.5 py-1 rounded-lg font-semibold ${
                      pendingPaid ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/30' : 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/30'
                    }`}
                  >
                    {pendingPaid
                      ? pendingBalanceDue > 0
                        ? `Collect ${formatMoney(pendingBalanceDue)} at counter`
                        : '✓ Paid online'
                      : 'Cash — will mark paid'}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-navy-light text-muted">
                    {paymentMethodLabel(pendingOrder.paymentMethod)}
                  </span>
                </div>

                {pendingOrder.items && pendingOrder.items.length > 0 && (
                  <ul className="text-xs text-muted space-y-1.5 max-h-36 overflow-y-auto border-t border-navy-border pt-3">
                    {pendingOrder.items.map((item, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="text-fg">{item.productName} ×{item.quantity}</span>
                        <span>LKR {item.totalPrice?.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {pendingNeedsCounterPayment && (
                  <div className="rounded-xl border border-navy-border bg-navy-light/30 p-3">
                    <CounterPaymentForm
                      amountDue={pendingAmountDue}
                      paymentMethod={counterPaymentMethod}
                      cashReceived={cashReceived}
                      onPaymentMethodChange={setCounterPaymentMethod}
                      onCashReceivedChange={setCashReceived}
                      compact
                    />
                  </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
                  <button type="button" onClick={dismissPending} disabled={actionLoading} className="btn-outline flex-1 py-3 text-sm font-semibold">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading || !pendingCounterPaymentReady}
                    onClick={() => void confirmAndCompletePickup()}
                    className="btn-primary flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                    {!pendingPaid
                      ? 'Confirm pickup & paid'
                      : pendingBalanceDue > 0
                        ? `Confirm pickup & collect ${formatMoney(pendingBalanceDue)}`
                        : 'Confirm pickup'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
