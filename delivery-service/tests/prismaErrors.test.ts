import { describe, expect, it } from 'vitest';
import { isPrismaConnectivityError } from '../src/utils/prismaErrors';

describe('isPrismaConnectivityError', () => {
  it('detects a connection reset nested on the error cause', () => {
    const err = new Error('Invalid `prisma.adminUser.create()` invocation:');
    (err as Error & { cause?: unknown }).cause = {
      message:
        'Error in PostgreSQL connection: Error { kind: Io, cause: Some(Os { code: 10054, kind: ConnectionReset, message: "An existing connection was forcibly closed by the remote host." }) }',
    };
    expect(isPrismaConnectivityError(err)).toBe(true);
    expect(isPrismaConnectivityError(new Error('unique constraint failed'))).toBe(false);
  });
});
