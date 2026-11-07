'use client';

import Image from 'next/image';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import type { Order } from '@/types';
import { getStatusLabel } from '@/lib/orderStatus';
import {
  customerLabel,
  customerPhone,
  formatMoney,
  formatReceiptDate,
  PAYMENT_METHOD_LABELS,
  getPaymentStatusLabel,
} from '@/lib/receipt';
import { getOrderTrackUrl } from '@/lib/orderLinks';
import ProductImage from '@/components/ui/ProductImage';

type Props = {
  order: Order;
  className?: string;
  /** Admin receipt modal: token instead of QR, hide order/payment status */
  adminView?: boolean;
};

export default function OrderReceipt({ order, className = '', adminView = false }: Props) {
  const isDelivery = order.orderMode === 'DELIVERY';
  const name = customerLabel(order);
  const phone = customerPhone(order);

  return (
    <article
      className={`order-receipt${adminView ? ' order-receipt--admin' : ''} ${className}`.trim()}
      id="order-receipt"
    >
      <header className="order-receipt__header">
        <div className="order-receipt__brand">
          <div className="order-receipt__logo relative shrink-0" style={{ width: 40, height: 40 }}>
            <Image
              src="/brand/logo.avif"
              alt="Bing Chun"
              fill
              sizes="40px"
              className="object-contain"
            />
          </div>
          <div>
            <p className="order-receipt__brand-name">Bing Chun</p>
            <p className="order-receipt__brand-tag">Bubble Tea · Sri Lanka</p>
          </div>
        </div>
        <div
          className={`order-receipt__qr-wrap${adminView ? ' order-receipt__qr-wrap--token' : ''}`}
          title={adminView ? 'Pickup token' : 'Scan to view order'}
        >
          {adminView ? (
            <div className="order-receipt__token-badge" aria-label="Pickup token">
              <p className="order-receipt__token-label">Token</p>
              <p className="order-receipt__token-number">
                {order.queuePosition != null ? order.queuePosition : '—'}
              </p>
            </div>
          ) : (
            <>
              <QRCode value={getOrderTrackUrl(order.orderNumber)} size={56} level="M" />
              <p className="order-receipt__qr-hint">Scan to track</p>
            </>
          )}
        </div>
      </header>

      <div className="order-receipt__summary">
        <div>
          <p className="order-receipt__label">Receipt</p>
          <p className="order-receipt__number">#{order.orderNumber}</p>
          <p className="order-receipt__date">{formatReceiptDate(order.createdAt)}</p>
        </div>
        <div className="order-receipt__meta-inline">
          <span>{isDelivery ? 'Delivery' : 'Takeaway'}</span>
          {!adminView && (
            <>
              <span>{getStatusLabel(order.status, order.orderMode)}</span>
              <span>{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}</span>
              <span>{getPaymentStatusLabel(order)}</span>
            </>
          )}
          {adminView && (
            <span>{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}</span>
          )}
        </div>
      </div>

      <div className="order-receipt__details">
        <p>
          <strong>Store:</strong> {order.store.name} — {order.store.addressLine}
        </p>
        {name && (
          <p>
            <strong>Customer:</strong> {name}
            {phone ? ` · ${phone}` : ''}
          </p>
        )}
        {!name && phone && (
          <p>
            <strong>Phone:</strong> {phone}
          </p>
        )}
        {isDelivery && order.address && (
          <p>
            <strong>Deliver to:</strong> {order.address.addressLine}
            {order.address.city ? `, ${order.address.city}` : ''}
          </p>
        )}
        {!isDelivery && order.pickupTime && (
          <p>
            <strong>Pickup:</strong> {order.pickupTime}
          </p>
        )}
      </div>

      <table className="order-receipt__table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td>
                <div className="order-receipt__item-cell">
                  <ProductImage
                    name={item.productName}
                    imageUrl={item.product?.imageUrl}
                    contain
                    className="order-receipt__item-image"
                  />
                  <div className="order-receipt__item-text">
                    <span className="order-receipt__item-name">{item.productName}</span>
                    {item.toppings?.length > 0 && (
                      <span className="order-receipt__item-meta">
                        + {item.toppings.map((t) => t.toppingName).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </td>
              <td>{item.quantity}</td>
              <td>{formatMoney(item.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="order-receipt__totals">
        <div className="order-receipt__total-row">
          <span>Subtotal</span>
          <span>{formatMoney(order.subtotal)}</span>
        </div>
        {order.deliveryFee > 0 && (
          <div className="order-receipt__total-row">
            <span>Delivery</span>
            <span>{formatMoney(order.deliveryFee)}</span>
          </div>
        )}
        {(order.convenientFee ?? 0) > 0 && (
          <div className="order-receipt__total-row">
            <span>Convenience fee</span>
            <span>{formatMoney(order.convenientFee)}</span>
          </div>
        )}
        {order.discount > 0 && (
          <div className="order-receipt__total-row order-receipt__total-row--discount">
            <span>Promo{order.promoCode ? ` (${order.promoCode})` : ''}</span>
            <span>−{formatMoney(order.discount)}</span>
          </div>
        )}
        {order.loyaltyDiscount > 0 && (
          <div className="order-receipt__total-row order-receipt__total-row--discount">
            <span>Loyalty</span>
            <span>−{formatMoney(order.loyaltyDiscount)}</span>
          </div>
        )}
        <div className="order-receipt__total-row order-receipt__total-row--grand">
          <span>Total</span>
          <span>{formatMoney(order.total)}</span>
        </div>
        {adminView &&
          order.paymentMethod === 'CASH_AT_COUNTER' &&
          order.cashReceivedAmount != null && (
            <>
              <div className="order-receipt__total-row">
                <span>Cash received</span>
                <span>{formatMoney(order.cashReceivedAmount)}</span>
              </div>
              <div className="order-receipt__total-row order-receipt__total-row--change">
                <span>Change</span>
                <span>{formatMoney(order.changeGivenAmount ?? 0)}</span>
              </div>
            </>
          )}
      </div>

      <footer className="order-receipt__footer">
        <p>Thank you for choosing Bing Chun! 🧋 · bingchun.lk</p>
      </footer>
    </article>
  );
}
