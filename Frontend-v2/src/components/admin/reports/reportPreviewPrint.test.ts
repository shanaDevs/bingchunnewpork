import { describe, expect, it } from 'vitest';
import { buildReportPreviewMetaFields, formatReportPreviewDateLabel } from './reportPreviewPrint';

describe('formatReportPreviewDateLabel', () => {
  it('formats using en-LK long month', () => {
    const label = formatReportPreviewDateLabel(new Date('2026-03-15T12:00:00'));
    expect(label).toContain('2026');
    expect(label).toMatch(/March|මාර්තු/i);
  });
});

describe('buildReportPreviewMetaFields', () => {
  it('builds five meta rows with filter fallback', () => {
    const fields = buildReportPreviewMetaFields({
      scopeLabel: 'Galle',
      dateLabel: '1 Jan 2026',
      reference: 'RPT-1',
      periodLabel: 'Jan 2026',
    });
    expect(fields).toHaveLength(5);
    expect(fields[4]).toEqual({ label: 'Filters', value: '—' });
  });
});
