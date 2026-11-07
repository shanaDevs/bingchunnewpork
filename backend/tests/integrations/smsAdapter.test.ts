import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/config', () => ({
  config: {
    frontendUrl: 'https://bingchunsrilanka.lk',
    sms: {
      provider: 'mock',
      apiKey: '',
      senderId: 'BingChun',
      smslenz: {
        baseUrl: 'https://smslenz.lk',
        userId: '12',
        apiKey: 'test-api-key',
        senderId: 'DARTCODES',
        connectionTimeoutMs: 5_000,
        readTimeoutMs: 5_000,
      },
    },
  },
}));

import {
  orderSmsPhone,
  sendOtp,
  sendOrderConfirmationSms,
  sendOrderReceiptSms,
  sendOrderStatusSms,
  smsAdapter,
  SmsLenzSmsAdapter,
  toSmsLenzContact,
} from '../../src/integrations/smsAdapter';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

const testCreds = {
  baseUrl: 'https://smslenz.lk',
  userId: '12',
  apiKey: 'test-api-key',
  senderId: 'DARTCODES',
  connectionTimeoutMs: 5_000,
  readTimeoutMs: 5_000,
};

describe('toSmsLenzContact', () => {
  it('converts local 07 numbers to +94', () => {
    expect(toSmsLenzContact('0771234567')).toBe('+94771234567');
  });

  it('accepts already-international numbers', () => {
    expect(toSmsLenzContact('+94771234567')).toBe('+94771234567');
    expect(toSmsLenzContact('94771234567')).toBe('+94771234567');
  });

  it('accepts 9-digit numbers starting with 7', () => {
    expect(toSmsLenzContact('771234567')).toBe('+94771234567');
  });

  it('returns null for invalid numbers', () => {
    expect(toSmsLenzContact('123')).toBeNull();
    expect(toSmsLenzContact('')).toBeNull();
  });
});

describe('orderSmsPhone', () => {
  it('prefers guest phone then account phone', () => {
    expect(orderSmsPhone({ guestPhone: '0771111111', user: { phone: '0772222222' } })).toBe('0771111111');
    expect(orderSmsPhone({ guestPhone: null, user: { phone: '0772222222' } })).toBe('0772222222');
    expect(orderSmsPhone({ guestPhone: '  ', user: {} })).toBeNull();
  });
});

describe('sendOtp', () => {
  beforeEach(() => {
    vi.spyOn(smsAdapter, 'send').mockResolvedValue(undefined);
  });

  it('sends only the verification text without an Android app hash', async () => {
    await sendOtp('0771234567', '946905', 'VhVuEOUt1nY');
    expect(smsAdapter.send).toHaveBeenCalledWith({
      to: '0771234567',
      message: 'Your Bing Chun verification code is: 946905. Valid for 10 minutes.',
    });
  });
});

describe('order SMS helpers', () => {
  beforeEach(() => {
    vi.spyOn(smsAdapter, 'send').mockResolvedValue(undefined);
  });

  it('sends a confirmation with total and track link', async () => {
    await sendOrderConfirmationSms('0771234567', 'BC260722-9001', 35, 1150);
    expect(smsAdapter.send).toHaveBeenCalledWith({
      to: '0771234567',
      message: expect.stringContaining('order #BC260722-9001 confirmed'),
    });
    expect(vi.mocked(smsAdapter.send).mock.calls[0][0].message).toContain('Total LKR 1,150');
    expect(vi.mocked(smsAdapter.send).mock.calls[0][0].message).toContain(
      'https://bingchunsrilanka.lk/track/BC260722-9001',
    );
  });

  it('sends a payment receipt SMS', async () => {
    await sendOrderReceiptSms('0771234567', 'BC260722-9001', 1500, 20);
    expect(smsAdapter.send).toHaveBeenCalledWith({
      to: '0771234567',
      message: expect.stringContaining('payment received for order #BC260722-9001'),
    });
  });

  it('sends takeaway pickup-ready SMS only (delivery start uses sendDeliveryStartedSms)', async () => {
    await sendOrderStatusSms('0771234567', 'BC1', 'READY', 'TAKEAWAY');
    await sendOrderStatusSms('0771234567', 'BC1', 'READY', 'DELIVERY');
    await sendOrderStatusSms('0771234567', 'BC1', 'OUT_FOR_DELIVERY');
    await sendOrderStatusSms('0771234567', 'BC1', 'PREPARING');

    expect(smsAdapter.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(smsAdapter.send).mock.calls[0][0].message).toContain('ready for pickup');
  });

  it('sends delivered SMS for delivery orders after customer verification', async () => {
    await sendOrderStatusSms('0771234567', 'BC1', 'DELIVERED', 'DELIVERY');

    expect(smsAdapter.send).toHaveBeenCalledTimes(1);
    expect(smsAdapter.send).toHaveBeenCalledWith({
      to: '0771234567',
      message: expect.stringContaining('has been delivered'),
    });
    expect(vi.mocked(smsAdapter.send).mock.calls[0][0].message).toContain('/track/BC1');
  });

  it('sends pickup-complete SMS for takeaway delivered orders', async () => {
    await sendOrderStatusSms('0771234567', 'BC1', 'DELIVERED', 'TAKEAWAY');

    expect(smsAdapter.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(smsAdapter.send).mock.calls[0][0].message).toContain('pickup complete');
    expect(vi.mocked(smsAdapter.send).mock.calls[0][0].message).toContain('/track/BC1');
  });
});

describe('SmsLenzSmsAdapter', () => {
  it('posts JSON to /api/send-sms with an E.164 contact', async () => {
    const httpFetch = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { campaign_id: 42 } }),
    );
    const adapter = new SmsLenzSmsAdapter(httpFetch, testCreds);

    await adapter.send({ to: '0771234567', message: 'Hello from Bing Chun' });

    expect(httpFetch).toHaveBeenCalledWith(
      'https://smslenz.lk/api/send-sms',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      }),
    );
    const body = JSON.parse((httpFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      user_id: '12',
      api_key: 'test-api-key',
      sender_id: 'DARTCODES',
      contact: '+94771234567',
      message: 'Hello from Bing Chun',
    });
  });

  it('throws when SMSlenz reports failure', async () => {
    const adapter = new SmsLenzSmsAdapter(
      vi.fn().mockResolvedValue(jsonResponse({ success: false, message: 'insufficient credits' }, true, 200)),
      testCreds,
    );

    await expect(adapter.send({ to: '0771234567', message: 'Hi' })).rejects.toThrow('insufficient credits');
  });

  it('throws for an invalid recipient', async () => {
    const adapter = new SmsLenzSmsAdapter(vi.fn());
    await expect(adapter.send({ to: 'abc', message: 'Hi' })).rejects.toThrow('Invalid SMS recipient');
  });
});
