import { describe, expect, it } from 'vitest';
import {
  monthQuerySchema,
  payhereNotifyBodySchema,
  walletReportQuerySchema,
  uuidParamSchema,
} from '../../src/lib/httpSchemas';

describe('httpSchemas', () => {
  it('rejects invalid wallet report dates', () => {
    expect(() => walletReportQuerySchema.parse({ from: 'not-a-date' })).toThrow();
  });

  it('accepts valid month query', () => {
    expect(monthQuerySchema.parse('2026-10')).toBe('2026-10');
  });

  it('rejects month strings that do not match YYYY-MM', () => {
    expect(() => monthQuerySchema.parse('2026/10')).toThrow();
    expect(() => monthQuerySchema.parse('')).toThrow();
  });

  it('rejects invalid invoice id', () => {
    expect(() => uuidParamSchema.parse('not-uuid')).toThrow();
  });

  it('parses payhere notify body with coerced fields', () => {
    const body = payhereNotifyBodySchema.parse({
      order_id: 123,
      status_code: 2,
      md5sig: 'abc',
    });
    expect(body.order_id).toBe(123);
  });
});
