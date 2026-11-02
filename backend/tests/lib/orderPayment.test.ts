import { describe, expect, it } from 'vitest';
import type { PaymentMethod } from '@prisma/client';
import {
  adminAddItemsDeniedMessage,
  adminEditOrderDeniedMessage,
  adminOrderEditMode,
  appliesConvenienceFee,
  canAdminAddOrderItems,
  canAdminEditOrder,
  convenienceFeeRateForOrder,
  initialPaymentStatus,
  isOnlinePaymentMethod,
  isWalletCreditPaymentMethod,
  WALLET_CREDIT_METHODS,
  orderBalanceDue,
  paymentStatusOnOrderStatus,
  fulfillmentQueuePaymentWhere,
  promoAnalysisOrderPaymentWhere,
} from '../../src/lib/orderPayment';

const defaultSettings = { allowAddItemsPaidOnline: true, allowEditCashUnpaid: true };

describe('isOnlinePaymentMethod', () => {
  it.each<PaymentMethod>(['PAYHERE', 'CARD'])('returns true for %s', (method) => {
    expect(isOnlinePaymentMethod(method)).toBe(true);
  });

  it.each<PaymentMethod>(['CASH_AT_COUNTER', 'CASH_ON_DELIVERY', 'LOYALTY_POINTS'])(
    'returns false for %s',
    (method) => {
      expect(isOnlinePaymentMethod(method)).toBe(false);
    },
  );
});

describe('isWalletCreditPaymentMethod', () => {
  it.each(WALLET_CREDIT_METHODS)('returns true for %s', (method) => {
    expect(isWalletCreditPaymentMethod(method)).toBe(true);
  });

  it.each<PaymentMethod>(['CASH_AT_COUNTER', 'CASH_ON_DELIVERY'])(
    'returns false for %s',
    (method) => {
      expect(isWalletCreditPaymentMethod(method)).toBe(false);
    },
  );
});

describe('convenienceFeeRateForOrder', () => {
  it('returns pickup and delivery rates separately', () => {
    const rates = { pickup: 0.06, delivery: 0.075 };
    expect(convenienceFeeRateForOrder('TAKEAWAY', rates)).toBe(0.06);
    expect(convenienceFeeRateForOrder('DELIVERY', rates)).toBe(0.075);
    expect(convenienceFeeRateForOrder('OTHER', rates)).toBe(0);
  });
});

describe('appliesConvenienceFee', () => {
  it('applies to delivery/pickup online payments and pickup cash at counter', () => {
    expect(appliesConvenienceFee('DELIVERY', 'PAYHERE')).toBe(true);
    expect(appliesConvenienceFee('DELIVERY', 'CARD')).toBe(true);
    expect(appliesConvenienceFee('TAKEAWAY', 'PAYHERE')).toBe(true);
    expect(appliesConvenienceFee('TAKEAWAY', 'CARD')).toBe(true);
    expect(appliesConvenienceFee('TAKEAWAY', 'CASH_AT_COUNTER')).toBe(true);
    expect(appliesConvenienceFee('DELIVERY', 'CASH_ON_DELIVERY')).toBe(false);
    expect(appliesConvenienceFee('DELIVERY', 'CASH_AT_COUNTER')).toBe(false);
    expect(appliesConvenienceFee('TAKEAWAY', 'LOYALTY_POINTS')).toBe(false);
  });
});

describe('initialPaymentStatus', () => {
  it('marks loyalty points as paid immediately', () => {
    expect(initialPaymentStatus('LOYALTY_POINTS')).toBe('PAID');
  });

  it('marks other methods as pending', () => {
    expect(initialPaymentStatus('CASH_AT_COUNTER')).toBe('PENDING');
    expect(initialPaymentStatus('PAYHERE')).toBe('PENDING');
  });
});

describe('fulfillmentQueuePaymentWhere', () => {
  it('requires paid delivery orders for the delivery jobs queue', () => {
    expect(fulfillmentQueuePaymentWhere('delivery')).toEqual({ paymentStatus: 'PAID' });
  });

  it('hides unpaid PayHere pickup orders but keeps cash-at-counter unpaid', () => {
    expect(fulfillmentQueuePaymentWhere('pickup')).toEqual({
      OR: [{ paymentStatus: 'PAID' }, { paymentMethod: 'CASH_AT_COUNTER' }],
    });
  });
});

describe('promoAnalysisOrderPaymentWhere', () => {
  const where = promoAnalysisOrderPaymentWhere();

  function matches(order: { paymentStatus: string; paymentMethod: PaymentMethod }) {
    const clauses = where.OR as Array<{ paymentStatus?: string; paymentMethod?: PaymentMethod }>;
    return clauses.some(
      (clause) =>
        (clause.paymentStatus && clause.paymentStatus === order.paymentStatus) ||
        (clause.paymentMethod && clause.paymentMethod === order.paymentMethod),
    );
  }

  it('matches paid delivery and pickup orders', () => {
    expect(
      matches({ paymentStatus: 'PAID', paymentMethod: 'CASH_ON_DELIVERY' }),
    ).toBe(true);
    expect(matches({ paymentStatus: 'PAID', paymentMethod: 'CASH_AT_COUNTER' })).toBe(true);
    expect(matches({ paymentStatus: 'PAID', paymentMethod: 'PAYHERE' })).toBe(true);
  });

  it('includes unpaid cash-at-counter pickup orders', () => {
    expect(matches({ paymentStatus: 'PENDING', paymentMethod: 'CASH_AT_COUNTER' })).toBe(true);
  });

  it('excludes unpaid online checkout orders', () => {
    expect(matches({ paymentStatus: 'PENDING', paymentMethod: 'PAYHERE' })).toBe(false);
    expect(matches({ paymentStatus: 'PENDING', paymentMethod: 'CARD' })).toBe(false);
  });
});

describe('paymentStatusOnOrderStatus', () => {
  it('returns undefined when already paid', () => {
    expect(
      paymentStatusOnOrderStatus(
        { paymentMethod: 'CASH_ON_DELIVERY', paymentStatus: 'PAID', orderMode: 'DELIVERY' },
        'DELIVERED',
      ),
    ).toBeUndefined();
  });

  it('marks cash orders paid on delivery', () => {
    expect(
      paymentStatusOnOrderStatus(
        { paymentMethod: 'CASH_ON_DELIVERY', paymentStatus: 'PENDING', orderMode: 'DELIVERY' },
        'DELIVERED',
      ),
    ).toBe('PAID');

    expect(
      paymentStatusOnOrderStatus(
        { paymentMethod: 'CASH_AT_COUNTER', paymentStatus: 'PENDING', orderMode: 'TAKEAWAY' },
        'DELIVERED',
      ),
    ).toBe('PAID');
  });

  it('returns undefined for non-delivery transitions', () => {
    expect(
      paymentStatusOnOrderStatus(
        { paymentMethod: 'PAYHERE', paymentStatus: 'PENDING', orderMode: 'DELIVERY' },
        'DELIVERED',
      ),
    ).toBeUndefined();
  });
});

describe('orderBalanceDue', () => {
  it('returns zero when payment is not complete', () => {
    expect(orderBalanceDue({ paymentStatus: 'PENDING', total: 1000, prepaidAmount: 0 })).toBe(0);
  });

  it('returns remaining balance after prepaid amount', () => {
    expect(orderBalanceDue({ paymentStatus: 'PAID', total: 1500, prepaidAmount: 500 })).toBe(1000);
    expect(orderBalanceDue({ paymentStatus: 'PAID', total: 500, prepaidAmount: 800 })).toBe(0);
  });
});

describe('canAdminEditOrder', () => {
  const editableOrder = {
    orderMode: 'TAKEAWAY',
    paymentMethod: 'CASH_AT_COUNTER' as PaymentMethod,
    paymentStatus: 'PENDING',
    status: 'PREPARING',
  };

  it('allows full edit for unpaid cash takeaway orders', () => {
    expect(canAdminEditOrder(editableOrder, defaultSettings)).toBe(true);
  });

  it('denies when settings disable cash unpaid edits', () => {
    expect(
      canAdminEditOrder(editableOrder, { ...defaultSettings, allowEditCashUnpaid: false }),
    ).toBe(false);
  });

  it('denies delivery, paid, or terminal orders', () => {
    expect(canAdminEditOrder({ ...editableOrder, orderMode: 'DELIVERY' }, defaultSettings)).toBe(
      false,
    );
    expect(canAdminEditOrder({ ...editableOrder, paymentStatus: 'PAID' }, defaultSettings)).toBe(
      false,
    );
    expect(canAdminEditOrder({ ...editableOrder, status: 'DELIVERED' }, defaultSettings)).toBe(
      false,
    );
  });
});

describe('canAdminAddOrderItems', () => {
  const paidTakeaway = {
    orderMode: 'TAKEAWAY',
    paymentMethod: 'CASH_AT_COUNTER' as PaymentMethod,
    paymentStatus: 'PAID',
    status: 'PREPARING',
  };

  it('allows adding items to paid takeaway orders', () => {
    expect(canAdminAddOrderItems(paidTakeaway, defaultSettings)).toBe(true);
  });

  it('gates paid online orders behind settings', () => {
    const onlinePaid = { ...paidTakeaway, paymentMethod: 'PAYHERE' as PaymentMethod };
    expect(canAdminAddOrderItems(onlinePaid, defaultSettings)).toBe(true);
    expect(
      canAdminAddOrderItems(onlinePaid, { ...defaultSettings, allowAddItemsPaidOnline: false }),
    ).toBe(false);
  });

  it('denies unpaid or non-takeaway orders', () => {
    expect(
      canAdminAddOrderItems({ ...paidTakeaway, paymentStatus: 'PENDING' }, defaultSettings),
    ).toBe(false);
    expect(canAdminAddOrderItems({ ...paidTakeaway, orderMode: 'DELIVERY' }, defaultSettings)).toBe(
      false,
    );
  });
});

describe('adminOrderEditMode', () => {
  it('returns full for unpaid cash takeaway', () => {
    expect(
      adminOrderEditMode(
        {
          orderMode: 'TAKEAWAY',
          paymentMethod: 'CASH_AT_COUNTER',
          paymentStatus: 'PENDING',
          status: 'PREPARING',
        },
        defaultSettings,
      ),
    ).toBe('full');
  });

  it('returns add_only for paid takeaway', () => {
    expect(
      adminOrderEditMode(
        {
          orderMode: 'TAKEAWAY',
          paymentMethod: 'CASH_AT_COUNTER',
          paymentStatus: 'PAID',
          status: 'PREPARING',
        },
        defaultSettings,
      ),
    ).toBe('add_only');
  });

  it('returns null when neither mode applies', () => {
    expect(
      adminOrderEditMode(
        {
          orderMode: 'DELIVERY',
          paymentMethod: 'PAYHERE',
          paymentStatus: 'PENDING',
          status: 'PREPARING',
        },
        defaultSettings,
      ),
    ).toBeNull();
  });
});

describe('adminEditOrderDeniedMessage', () => {
  it('suggests add-items mode when that is allowed', () => {
    expect(
      adminEditOrderDeniedMessage(
        {
          orderMode: 'TAKEAWAY',
          paymentMethod: 'CASH_AT_COUNTER',
          paymentStatus: 'PAID',
          status: 'PREPARING',
        },
        defaultSettings,
      ),
    ).toBe('Use add-items mode for paid pickup orders');
  });

  it('explains delivery-only restriction', () => {
    expect(
      adminEditOrderDeniedMessage(
        {
          orderMode: 'DELIVERY',
          paymentMethod: 'PAYHERE',
          paymentStatus: 'PENDING',
          status: 'PREPARING',
        },
        defaultSettings,
      ),
    ).toBe('Only pickup orders can be edited');
  });
});

describe('adminAddItemsDeniedMessage', () => {
  it('suggests full edit for unpaid cash orders', () => {
    expect(
      adminAddItemsDeniedMessage(
        {
          orderMode: 'TAKEAWAY',
          paymentMethod: 'CASH_AT_COUNTER',
          paymentStatus: 'PENDING',
          status: 'PREPARING',
        },
        defaultSettings,
      ),
    ).toBe('Use full edit mode for unpaid cash orders');
  });
});
