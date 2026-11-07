import { describe, expect, it } from 'vitest';
import {
  formatOrderCancellationReason,
  parseReasonFromCancelNote,
  resolveOrderRejectReason,
} from './orderCancel';

describe('resolveOrderRejectReason', () => {
  it('shows the customer-selected refund reason instead of Customer Requested Cancellation', () => {
    expect(
      resolveOrderRejectReason({
        status: 'CANCELLED',
        cancelReason: 'CUSTOMER_REQUEST',
        cancelledBy: 'customer',
        cancellationNote: 'Cancelled by customer. Full refund of all paid amount',
        paymentStatus: 'PAID',
        refundCancellationReason: 'CHANGED_MIND',
      }),
    ).toBe('Changed my mind');
  });

  it('shows Other custom text from the refund', () => {
    expect(
      resolveOrderRejectReason({
        status: 'CANCELLED',
        cancelReason: 'CUSTOMER_REQUEST',
        cancelledBy: 'customer',
        refundCancellationReason: 'OTHER',
        refundCustomReasonText: 'Ordered from the wrong branch',
      }),
    ).toBe('Ordered from the wrong branch');
  });

  it('prefers a tagged Reason in the cancel note', () => {
    expect(
      resolveOrderRejectReason({
        status: 'CANCELLED',
        cancelReason: 'CUSTOMER_REQUEST',
        cancelledBy: 'customer',
        cancellationNote: 'Cancelled by customer. Full refund of all paid amount | Reason: Taking too long',
      }),
    ).toBe('Taking too long');
  });

  it('shows a staff reject note instead of the generic category', () => {
    expect(
      resolveOrderRejectReason({
        status: 'CANCELLED',
        cancelReason: 'OUT_OF_STOCK',
        cancelledBy: 'nugegoda branch cashier',
        cancellationNote: 'Branch reject — out of stock',
      }),
    ).toBe('Branch reject — out of stock');
  });

  it('falls back to the admin cancel category when nothing more specific exists', () => {
    expect(
      resolveOrderRejectReason({
        status: 'CANCELLED',
        cancelReason: 'CUSTOMER_REQUEST',
        cancelledBy: 'nugegoda branch cashier',
      }),
    ).toBe('Customer Requested Cancellation');
  });
});

describe('parseReasonFromCancelNote', () => {
  it('ignores auto-generated customer refund notes', () => {
    expect(
      parseReasonFromCancelNote('Cancelled by customer. Partial refund: 80% of sales total'),
    ).toBeNull();
  });
});

describe('formatOrderCancellationReason', () => {
  it('returns null for non-cancelled orders', () => {
    expect(
      formatOrderCancellationReason({
        status: 'RECEIVED',
        cancelReason: 'CUSTOMER_REQUEST',
      }),
    ).toBeNull();
  });
});
