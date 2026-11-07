'use client';

import { useRef } from 'react';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { getOrderTrackUrl } from '@/lib/orderLinks';
import { downloadPickupQrCardPng } from '@/lib/downloadQrCode';

const QR_LOGO = '/brand/mascot-hover.png';

type Props = {
  orderNumber: string;
  tokenNumber?: number | null;
};

export default function OrderQrCard({ orderNumber, tokenNumber }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  async function handleDownload() {
    const svg = wrapRef.current?.querySelector('svg');
    if (!svg) {
      toast.error('QR code not ready');
      return;
    }
    try {
      await downloadPickupQrCardPng(svg, {
        filename: `bingchun-pickup-${orderNumber}.png`,
        orderNumber,
        tokenNumber,
      });
      toast.success('QR code downloaded');
    } catch {
      toast.error('Could not download QR code');
    }
  }

  return (
    <div className="card p-6 text-center h-full flex flex-col">
      <h3 className="font-semibold text-white mb-4">Show at Counter</h3>

      {tokenNumber != null && (
        <p className="text-brand font-bold text-lg mb-3">Token #{tokenNumber}</p>
      )}

      <div className="flex-1 flex flex-col items-center justify-center">
        <div
          ref={wrapRef}
          className="inline-block p-4 rounded-xl relative"
          style={{ background: '#fff' }}
        >
          <QRCode
            value={getOrderTrackUrl(orderNumber)}
            size={180}
            level="H"
            imageSettings={{
              src: QR_LOGO,
              height: 44,
              width: 44,
              excavate: true,
            }}
          />
        </div>

        <p className="text-white font-mono text-base sm:text-lg font-bold mt-4 tracking-wide">
          {orderNumber}
        </p>
      </div>

      <p className="text-muted text-sm mt-3">Scan to open order details — no login needed</p>
      <p className="text-muted text-xs mt-1">Or show this screen when collecting your order</p>

      <button
        type="button"
        onClick={() => void handleDownload()}
        className="btn-outline mt-4 px-5 py-2.5 text-sm inline-flex items-center gap-2 mx-auto"
      >
        <Download size={16} />
        Download QR code
      </button>
    </div>
  );
}
