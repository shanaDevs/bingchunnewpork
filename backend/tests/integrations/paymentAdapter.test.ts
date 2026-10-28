import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/paymentSettings', () => ({
  getPaymentSettings: vi.fn(),
  isValidPayHereCredentials: vi.fn(),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import {
  buildPayHereCheckoutFields,
  generatePayHereHash,
  getPaymentAdapter,
  paymentAdapter,
} from '../../src/integrations/paymentAdapter';
import { getPaymentSettings, isValidPayHereCredentials } from '../../src/lib/paymentSettings';
import { AppError } from '../../src/middleware/errorHandler';

const checkoutInput = {
  merchantId: '1212345',
  merchantSecret: 'sandbox-secret',
  sandbox: true,
  orderNumber: 'BC260722-1234',
  amount: 1250.5,
  customerName: 'Jane Doe',
  customerPhone: '+94 77 123 4567',
  customerEmail: 'jane@example.com',
  returnUrl: 'https://example.com/return',
  cancelUrl: 'https://example.com/cancel',
  notifyUrl: 'https://example.com/notify',
  itemDescription: 'Bingchun order',
  address: '123 Main St',
  city: 'Colombo',
};

const initiateParams = {
  orderId: 'order-uuid-1',
  orderNumber: 'BC260722-1234',
  amount: 1250.5,
  customerName: 'Jane Doe',
  customerPhone: '+94 77 123 4567',
  customerEmail: 'jane@example.com',
  returnUrl: 'https://example.com/return',
  cancelUrl: 'https://example.com/cancel',
  notifyUrl: 'https://example.com/notify',
  itemDescription: 'Bingchun order',
  address: '123 Main St',
  city: 'Colombo',
};

describe('generatePayHereHash', () => {
  it('produces a deterministic uppercase MD5 hash', () => {
    const hash = generatePayHereHash('1212345', 'ORDER-1', 99.5, 'LKR', 'secret');

    const formatted = '99.50';
    const secretHash = crypto.createHash('md5').update('secret').digest('hex').toUpperCase();
    const expected = crypto
      .createHash('md5')
      .update(`1212345ORDER-1${formatted}LKR${secretHash}`)
      .digest('hex')
      .toUpperCase();

    expect(hash).toBe(expected);
  });
});

describe('buildPayHereCheckoutFields', () => {
  it('builds sandbox checkout fields with parsed customer details', () => {
    const result = buildPayHereCheckoutFields(checkoutInput);

    expect(result.sandbox).toBe(true);
    expect(result.action).toBe('https://sandbox.payhere.lk/pay/checkout');
    expect(result.fields).toMatchObject({
      merchant_id: '1212345',
      order_id: 'BC260722-1234',
      currency: 'LKR',
      amount: '1250.50',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '94771234567',
      address: '123 Main St',
      city: 'Colombo',
      country: 'Sri Lanka',
    });
    expect(result.fields.hash).toBe(
      generatePayHereHash(
        checkoutInput.merchantId,
        checkoutInput.orderNumber,
        checkoutInput.amount,
        'LKR',
        checkoutInput.merchantSecret,
      ),
    );
  });

  it('uses defaults for missing optional customer fields', () => {
    const result = buildPayHereCheckoutFields({
      ...checkoutInput,
      sandbox: false,
      customerName: 'Solo',
      customerPhone: '',
      customerEmail: undefined,
      address: undefined,
      city: undefined,
    });

    expect(result.fields.first_name).toBe('Solo');
    expect(result.fields.last_name).toBe('Guest');
    expect(result.fields.email).toBe('customer@bingchun.lk');
    expect(result.fields.phone).toBe('0770000000');
    expect(result.fields.address).toBe('Colombo');
    expect(result.fields.city).toBe('Colombo');
    expect(result.action).toBe('https://www.payhere.lk/pay/checkout');
  });

  it('defaults empty or whitespace-only name to Customer Guest', () => {
    const empty = buildPayHereCheckoutFields({ ...checkoutInput, customerName: '' });
    expect(empty.fields.first_name).toBe('Customer');
    expect(empty.fields.last_name).toBe('Guest');

    const whitespace = buildPayHereCheckoutFields({ ...checkoutInput, customerName: '   ' });
    expect(whitespace.fields.first_name).toBe('Customer');
    expect(whitespace.fields.last_name).toBe('Guest');
  });

  it('falls back phone when non-digit and truncates long digit phones', () => {
    const nonDigit = buildPayHereCheckoutFields({
      ...checkoutInput,
      customerPhone: 'abc-xyz',
    });
    expect(nonDigit.fields.phone).toBe('0770000000');

    const long = buildPayHereCheckoutFields({
      ...checkoutInput,
      customerPhone: '12345678901234567890',
    });
    expect(long.fields.phone).toBe('123456789012345');
    expect(long.fields.phone).toHaveLength(15);
  });

  it('formats invalid amounts via toFixed without throwing', () => {
    const nanResult = buildPayHereCheckoutFields({ ...checkoutInput, amount: Number.NaN });
    expect(nanResult.fields.amount).toBe('NaN');

    const infResult = buildPayHereCheckoutFields({
      ...checkoutInput,
      amount: Number.POSITIVE_INFINITY,
    });
    expect(infResult.fields.amount).toBe('Infinity');
  });
});

describe('getPaymentAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPaymentSettings).mockResolvedValue({
      methods: {} as never,
      payhere: {
        merchantId: '1212345',
        merchantSecret: 'sandbox-secret',
        mode: 'sandbox',
        configured: true,
      },
    });
  });

  it('returns PayHere adapter when credentials are valid', async () => {
    vi.mocked(isValidPayHereCredentials).mockReturnValue(true);

    const adapter = await getPaymentAdapter();

    expect(adapter.verify('pay-1', 'sig')).toBe(true);
  });

  it('throws when PayHere is required but credentials are invalid', async () => {
    vi.mocked(isValidPayHereCredentials).mockReturnValue(false);

    await expect(getPaymentAdapter(true)).rejects.toMatchObject({
      message: expect.stringContaining('Online payment is not configured'),
      statusCode: 400,
    } satisfies Partial<AppError>);
  });

  it('falls back to mock adapter when credentials are invalid', async () => {
    vi.mocked(isValidPayHereCredentials).mockReturnValue(false);

    const adapter = await getPaymentAdapter();
    const result = await adapter.initiate({
      orderId: 'order-1',
      orderNumber: 'BC260722-9999',
      amount: 500,
      customerName: 'Guest',
      customerPhone: '0770000000',
      returnUrl: 'https://example.com/return',
      cancelUrl: 'https://example.com/cancel',
      notifyUrl: 'https://example.com/notify',
      itemDescription: 'Order',
    });

    expect(result.paymentId).toMatch(/^mock_pay_/);
    expect(result.paymentUrl).toContain('mock-payment');
  });

  it('verifies PayHere notify hash via adapter', async () => {
    vi.mocked(isValidPayHereCredentials).mockReturnValue(true);
    const adapter = await getPaymentAdapter();

    const merchantId = '1212345';
    const orderId = 'BC260722-1234';
    const amount = '500.00';
    const currency = 'LKR';
    const statusCode = '2';
    const merchantSecret = 'sandbox-secret';
    const secretHash = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const md5sig = crypto
      .createHash('md5')
      .update(`${merchantId}${orderId}${amount}${currency}${statusCode}${secretHash}`)
      .digest('hex')
      .toUpperCase();

    expect(
      adapter.verifyNotifyHash(
        merchantId,
        orderId,
        amount,
        currency,
        statusCode,
        md5sig,
        merchantSecret,
      ),
    ).toBe(true);
    expect(
      adapter.verifyNotifyHash(
        merchantId,
        orderId,
        amount,
        currency,
        statusCode,
        'bad-signature',
        merchantSecret,
      ),
    ).toBe(false);
  });

  it('initiates a full PayHere sandbox checkout session', async () => {
    vi.mocked(isValidPayHereCredentials).mockReturnValue(true);
    const adapter = await getPaymentAdapter();

    const result = await adapter.initiate(initiateParams);

    expect(result.paymentId).toMatch(/^ph_/);
    expect(result.paymentUrl).toMatch(/^https:\/\/sandbox\.payhere\.lk\/pay\/checkout\?/);
    expect(result.payhere).toMatchObject({
      sandbox: true,
      merchant_id: '1212345',
      return_url: initiateParams.returnUrl,
      cancel_url: initiateParams.cancelUrl,
      notify_url: initiateParams.notifyUrl,
      order_id: initiateParams.orderNumber,
      items: initiateParams.itemDescription,
      amount: '1250.50',
      currency: 'LKR',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '94771234567',
      address: '123 Main St',
      city: 'Colombo',
      country: 'Sri Lanka',
    });
    expect(result.payhere?.hash).toBe(
      generatePayHereHash(
        '1212345',
        initiateParams.orderNumber,
        initiateParams.amount,
        'LKR',
        'sandbox-secret',
      ),
    );

    const url = new URL(result.paymentUrl);
    expect(url.searchParams.get('merchant_id')).toBe('1212345');
    expect(url.searchParams.get('order_id')).toBe(initiateParams.orderNumber);
    expect(url.searchParams.get('amount')).toBe('1250.50');
    expect(url.searchParams.get('hash')).toBe(result.payhere?.hash);
    expect(url.searchParams.get('return_url')).toBe(initiateParams.returnUrl);
    expect(url.searchParams.get('notify_url')).toBe(initiateParams.notifyUrl);
  });

  it('initiates live PayHere checkout when mode is live', async () => {
    vi.mocked(isValidPayHereCredentials).mockReturnValue(true);
    vi.mocked(getPaymentSettings).mockResolvedValue({
      methods: {} as never,
      payhere: {
        merchantId: '1212345',
        merchantSecret: 'live-secret',
        mode: 'live',
        configured: true,
      },
    });

    const adapter = await getPaymentAdapter();
    const result = await adapter.initiate(initiateParams);

    expect(result.payhere?.sandbox).toBe(false);
    expect(result.paymentUrl).toMatch(/^https:\/\/www\.payhere\.lk\/pay\/checkout\?/);
    expect(result.payhere?.hash).toBe(
      generatePayHereHash(
        '1212345',
        initiateParams.orderNumber,
        initiateParams.amount,
        'LKR',
        'live-secret',
      ),
    );
  });

  it('applies initiate defaults for empty name, phone, and missing optionals', async () => {
    vi.mocked(isValidPayHereCredentials).mockReturnValue(true);
    const adapter = await getPaymentAdapter();

    const result = await adapter.initiate({
      ...initiateParams,
      customerName: '',
      customerPhone: '',
      customerEmail: undefined,
      address: undefined,
      city: undefined,
    });

    expect(result.payhere).toMatchObject({
      first_name: 'Customer',
      last_name: 'Guest',
      email: 'customer@bingchun.lk',
      phone: '0770000000',
      address: 'Colombo',
      city: 'Colombo',
    });
  });

  it('PayHere verify stub is truthy only when signature is present', async () => {
    vi.mocked(isValidPayHereCredentials).mockReturnValue(true);
    const adapter = await getPaymentAdapter();

    expect(adapter.verify('ph_1', 'signed')).toBe(true);
    expect(adapter.verify('ph_1', '')).toBe(false);
  });

  it('mock verify stub always returns true', async () => {
    vi.mocked(isValidPayHereCredentials).mockReturnValue(false);
    const adapter = await getPaymentAdapter();

    expect(adapter.verify('mock_1', '')).toBe(true);
    expect(adapter.verify('mock_1', 'anything')).toBe(true);
  });

  it('mock verifyNotifyHash stub always returns true', async () => {
    vi.mocked(isValidPayHereCredentials).mockReturnValue(false);
    const adapter = await getPaymentAdapter();

    expect(
      adapter.verifyNotifyHash('m', 'o', '1.00', 'LKR', '2', 'bad', 'secret'),
    ).toBe(true);
  });

  it('falls back to env PayHere credentials when settings omit them', async () => {
    vi.mocked(isValidPayHereCredentials).mockReturnValue(true);
    vi.stubEnv('PAYHERE_MERCHANT_ID', 'env-merchant');
    vi.stubEnv('PAYHERE_MERCHANT_SECRET', 'env-secret');
    vi.mocked(getPaymentSettings).mockResolvedValue({
      methods: {} as never,
      payhere: {
        merchantId: '',
        merchantSecret: '',
        mode: 'sandbox',
        configured: false,
      },
    });

    try {
      const adapter = await getPaymentAdapter();
      const result = await adapter.initiate(initiateParams);

      expect(result.payhere?.merchant_id).toBe('env-merchant');
      expect(result.payhere?.hash).toBe(
        generatePayHereHash(
          'env-merchant',
          initiateParams.orderNumber,
          initiateParams.amount,
          'LKR',
          'env-secret',
        ),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('propagates getPaymentSettings failures', async () => {
    vi.mocked(getPaymentSettings).mockRejectedValue(new Error('settings unavailable'));

    await expect(getPaymentAdapter()).rejects.toThrow('settings unavailable');
  });
});

describe('paymentAdapter facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPaymentSettings).mockResolvedValue({
      methods: {} as never,
      payhere: {
        merchantId: '1212345',
        merchantSecret: 'sandbox-secret',
        mode: 'sandbox',
        configured: true,
      },
    });
    vi.mocked(isValidPayHereCredentials).mockReturnValue(true);
  });

  it('delegates initiate and verify through the deprecated export', async () => {
    const result = await paymentAdapter.initiate(initiateParams);

    expect(result.paymentId).toMatch(/^ph_/);
    expect(result.payhere?.order_id).toBe(initiateParams.orderNumber);
    expect(paymentAdapter.verify('ph_1', 'sig')).toBe(true);
    expect(paymentAdapter.verify('ph_1', '')).toBe(false);
  });
});
