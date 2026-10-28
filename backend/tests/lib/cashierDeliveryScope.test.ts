import { describe, expect, it } from 'vitest';
import {
  assertCashierCanViewJob,
  resolveCashierListDateFilters,
} from '../../src/lib/cashierDeliveryScope';
import { todayDateString } from '../../src/lib/datetime';
import { AppError } from '../../src/middleware/errorHandler';

describe('resolveCashierListDateFilters', () => {
  const incoming = {
    dateFrom: new Date('2025-01-01'),
    dateTo: new Date('2025-01-31'),
    scheduledAtFrom: new Date('2025-02-01'),
    scheduledAtTo: new Date('2025-02-28'),
  };

  it('passes through filters for non-cashier roles', () => {
    expect(resolveCashierListDateFilters('SYSTEM_ADMIN', 'COMPLETED', {}, incoming)).toEqual(
      incoming,
    );
    expect(resolveCashierListDateFilters('STORE_MANAGER', undefined, {}, incoming)).toEqual(
      incoming,
    );
  });

  it('forces today scheduledAt bounds for cashier active list', () => {
    const result = resolveCashierListDateFilters('CASHIER', undefined, {}, incoming);
    const today = todayDateString();

    expect(result.dateFrom).toBeUndefined();
    expect(result.dateTo).toBeUndefined();
    expect(result.scheduledAtFrom).toEqual(new Date(today));
    expect(result.scheduledAtTo?.getHours()).toBe(23);
    expect(result.liveStatusFilter).toBeUndefined();
  });

  it('forces today completedAt bounds for cashier completed list', () => {
    const result = resolveCashierListDateFilters('CASHIER', 'COMPLETED', {}, incoming);
    const today = todayDateString();

    expect(result.dateFrom).toEqual(new Date(today));
    expect(result.dateTo?.getHours()).toBe(23);
    expect(result.scheduledAtFrom).toBeUndefined();
    expect(result.scheduledAtTo).toBeUndefined();
    expect(result.liveStatusFilter).toBeUndefined();
  });

  it('uses live status filter for cashier liveScope queries', () => {
    const result = resolveCashierListDateFilters('CASHIER', undefined, { liveScope: '1' }, incoming);

    expect(result.liveStatusFilter).toEqual({ in: ['IN_PROGRESS', 'RETURNING'] });
    expect(result.dateFrom).toBeUndefined();
    expect(result.scheduledAtFrom).toBeUndefined();
  });
});

describe('assertCashierCanViewJob', () => {
  const today = todayDateString();
  const todayDate = new Date(`${today}T12:00:00.000Z`);
  const yesterdayDate = new Date(`${today}T12:00:00.000Z`);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);

  it('allows admins to view any job', () => {
    expect(() =>
      assertCashierCanViewJob('SYSTEM_ADMIN', {
        status: 'COMPLETED',
        scheduledAt: yesterdayDate,
        completedAt: yesterdayDate,
      }),
    ).not.toThrow();
  });

  it('allows cashier to view today scheduled active job', () => {
    expect(() =>
      assertCashierCanViewJob('CASHIER', {
        status: 'IN_PROGRESS',
        scheduledAt: todayDate,
        completedAt: null,
      }),
    ).not.toThrow();
  });

  it('blocks cashier from viewing job scheduled on another day', () => {
    expect(() =>
      assertCashierCanViewJob('CASHIER', {
        status: 'IN_PROGRESS',
        scheduledAt: yesterdayDate,
        completedAt: null,
      }),
    ).toThrow(AppError);
  });

  it('allows cashier to view job completed today', () => {
    expect(() =>
      assertCashierCanViewJob('CASHIER', {
        status: 'COMPLETED',
        scheduledAt: yesterdayDate,
        completedAt: todayDate,
      }),
    ).not.toThrow();
  });

  it('blocks cashier from viewing job completed on another day', () => {
    expect(() =>
      assertCashierCanViewJob('CASHIER', {
        status: 'COMPLETED',
        scheduledAt: yesterdayDate,
        completedAt: yesterdayDate,
      }),
    ).toThrow(AppError);
  });
});
