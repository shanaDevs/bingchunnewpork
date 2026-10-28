import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/schemaPatch', () => ({
  addColumnIfMissing: vi.fn(async () => undefined),
  columnUdtName: vi.fn(async () => 'text'),
  execSql: vi.fn(async () => 0),
  tableHasColumn: vi.fn(async () => true),
}));

vi.mock('../../src/lib/moneyDecimalSchema', () => ({
  ensureAdminMoneyDecimalColumns: vi.fn(async () => undefined),
}));

describe('ensureWithdrawalSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function load() {
    const { ensureWithdrawalSchema } = await import('../../src/lib/withdrawalSchema');
    const { addColumnIfMissing, columnUdtName, execSql, tableHasColumn } = await import(
      '../../src/lib/schemaPatch'
    );
    const { ensureAdminMoneyDecimalColumns } = await import('../../src/lib/moneyDecimalSchema');

    vi.mocked(tableHasColumn).mockResolvedValue(true);
    vi.mocked(columnUdtName).mockImplementation(async (_table, column) => {
      if (column === 'proofUrl') return 'text';
      if (column === 'breakdown') return 'jsonb';
      return 'numeric';
    });

    return {
      ensureWithdrawalSchema,
      addColumnIfMissing,
      columnUdtName,
      execSql,
      ensureAdminMoneyDecimalColumns,
    };
  }

  it('adds invoiceData and stores breakdown as jsonb', async () => {
    const { ensureWithdrawalSchema, addColumnIfMissing } = await load();

    await ensureWithdrawalSchema();

    expect(addColumnIfMissing).toHaveBeenCalledWith('store_withdrawals', 'invoiceData', 'JSONB NULL');
    expect(addColumnIfMissing).toHaveBeenCalledWith('store_withdrawals', 'breakdown', 'JSONB NULL');
  });

  it('skips the proofUrl alter when the column is already text', async () => {
    const { ensureWithdrawalSchema, execSql } = await load();

    await ensureWithdrawalSchema();

    expect(execSql).not.toHaveBeenCalled();
  });

  it('widens proofUrl when the column is still varchar', async () => {
    const { ensureWithdrawalSchema, columnUdtName, execSql } = await load();
    vi.mocked(columnUdtName).mockImplementation(async (_table, column) => {
      if (column === 'proofUrl') return 'varchar';
      if (column === 'breakdown') return 'jsonb';
      return 'numeric';
    });

    await ensureWithdrawalSchema();

    expect(execSql).toHaveBeenCalledWith(
      'ALTER TABLE "store_withdrawals" ALTER COLUMN "proofUrl" TYPE TEXT USING "proofUrl"::TEXT',
    );
  });

  it('runs the decimal column patch once when wallet loads overlap', async () => {
    const { ensureWithdrawalSchema, ensureAdminMoneyDecimalColumns } = await load();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(ensureAdminMoneyDecimalColumns).mockImplementation(() => gate);

    const pending = Promise.all([ensureWithdrawalSchema(), ensureWithdrawalSchema()]);
    await vi.waitFor(() => {
      expect(ensureAdminMoneyDecimalColumns).toHaveBeenCalledTimes(1);
    });

    release();
    await pending;
    expect(ensureAdminMoneyDecimalColumns).toHaveBeenCalledTimes(1);
  });
});
