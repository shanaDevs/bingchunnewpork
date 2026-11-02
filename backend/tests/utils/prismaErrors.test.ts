import { describe, expect, it, vi } from 'vitest';
import { getPrismaErrorCode, isPrismaConnectivityError, retryOnceOnDisconnect } from '../../src/utils/prismaErrors';

describe('prismaErrors', () => {
  it('detects connectivity error codes', () => {
    expect(isPrismaConnectivityError({ code: 'P1001' })).toBe(true);
    expect(isPrismaConnectivityError({ code: 'P1017' })).toBe(true);
    expect(isPrismaConnectivityError({ code: 'P2024' })).toBe(true);
    expect(isPrismaConnectivityError({ code: 'P2002' })).toBe(false);
  });

  it('detects a reset socket that has no Prisma error code', () => {
    const reset = new Error(
      'An existing connection was forcibly closed by the remote host. code: 10054 kind: ConnectionReset',
    );
    expect(isPrismaConnectivityError(reset)).toBe(true);
    expect(isPrismaConnectivityError(new Error('unique constraint failed'))).toBe(false);
  });

  it('detects a Postgres socket closed without a Prisma code', () => {
    const closed = new Error('Error in PostgreSQL connection: Error { kind: Closed, cause: None }');
    expect(isPrismaConnectivityError(closed)).toBe(true);
  });

  it('detects PgBouncer Socket not connected (Linux ENOTCONN 107)', () => {
    const err = new Error('Invalid `prisma.store.findMany()` invocation:');
    (err as Error & { cause?: unknown }).cause = {
      message:
        'Error in PostgreSQL connection: Error { kind: Io, cause: Some(Os { code: 107, kind: NotConnected, message: "Socket not connected" }) }',
    };
    expect(isPrismaConnectivityError(err)).toBe(true);
  });

  it('detects a connection reset nested on the error cause', () => {
    const err = new Error('Invalid `prisma.adminUser.create()` invocation:');
    (err as Error & { cause?: unknown }).cause = {
      message:
        'Error in PostgreSQL connection: Error { kind: Io, cause: Some(Os { code: 10054, kind: ConnectionReset, message: "An existing connection was forcibly closed by the remote host." }) }',
    };
    expect(isPrismaConnectivityError(err)).toBe(true);
  });

  it('reads prisma error code from unknown errors', () => {
    expect(getPrismaErrorCode({ code: 'P1001' })).toBe('P1001');
    expect(getPrismaErrorCode(new Error('fail'))).toBeUndefined();
  });

  it('reconnects and retries a dropped database call once', async () => {
    const reconnect = vi.fn(async () => undefined);
    const dropped = Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' });
    const fn = vi.fn()
      .mockRejectedValueOnce(dropped)
      .mockResolvedValueOnce('saved');

    await expect(retryOnceOnDisconnect(fn, reconnect)).resolves.toBe('saved');
    expect(reconnect).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry errors that are not a dropped connection', async () => {
    const reconnect = vi.fn(async () => undefined);
    const fn = vi.fn().mockRejectedValueOnce(new Error('unique constraint failed'));

    await expect(retryOnceOnDisconnect(fn, reconnect)).rejects.toThrow('unique constraint failed');
    expect(reconnect).not.toHaveBeenCalled();
  });
});
