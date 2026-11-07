'use client';
import { getApiBaseUrl } from '@/lib/apiBase';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense } from 'react';
import { motion } from 'framer-motion';

function MockPaymentContent() {
  const params = useSearchParams();
  const router = useRouter();
  const orderId = params.get('orderId');
  const orderNumber = params.get('orderNumber');
  const paymentId = params.get('paymentId');
  const amount = params.get('amount');
  const returnUrl = params.get('returnUrl');
  const [processing, setProcessing] = useState(false);

  async function pay(success: boolean) {
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 1500));

    // Notify backend
    try {
      await fetch(`${getApiBaseUrl()}/orders/payment-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderNumber || orderId,
          payment_id: paymentId,
          payhere_amount: amount,
          payhere_currency: 'LKR',
          status_code: success ? '2' : '-1',
          md5sig: 'mock_sig',
        }),
      });
    } catch {}

    if (returnUrl) {
      const base = decodeURIComponent(returnUrl);
      const join = base.includes('?') ? '&' : '?';
      const orderRef = orderNumber || orderId || '';
      const statusCode = success ? '2' : '-1';
      router.push(
        `${base}${join}order_id=${encodeURIComponent(orderRef)}&payment_id=${encodeURIComponent(paymentId || '')}&payhere_amount=${encodeURIComponent(amount || '0')}&payhere_currency=LKR&status_code=${statusCode}&md5sig=mock_sig`,
      );
    } else {
      router.push('/');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card p-8 max-w-sm w-full text-center"
      >
        <div className="text-5xl mb-5">💳</div>
        <h2 className="text-xl font-bold text-white mb-1">Mock Payment</h2>
        <p className="text-muted text-sm mb-2">Order #{orderId?.slice(0, 8)}</p>
        <div className="bg-navy-light rounded-xl p-4 mb-6">
          <p className="text-muted text-xs mb-1">Amount to Pay</p>
          <p className="text-3xl font-bold text-brand">LKR {parseInt(amount || '0').toLocaleString()}</p>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-6">
          <p className="text-yellow-400 text-xs font-medium">🧪 Test Environment</p>
          <p className="text-muted text-xs mt-1">This is a mock payment page. No real money will be charged.</p>
        </div>

        <div className="space-y-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => pay(true)}
            disabled={processing}
            className="btn-primary w-full py-3.5"
          >
            {processing ? 'Processing...' : '✅ Pay Now (Success)'}
          </motion.button>
          <button
            onClick={() => pay(false)}
            disabled={processing}
            className="w-full py-3 rounded-xl border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 transition-colors"
          >
            ❌ Simulate Failed Payment
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function MockPaymentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-muted">Loading...</p></div>}>
      <MockPaymentContent />
    </Suspense>
  );
}
