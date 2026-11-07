import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escapeHtml';

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('leaves plain ledger labels unchanged', () => {
    expect(escapeHtml('BRANCH: Colombo')).toBe('BRANCH: Colombo');
  });
});
