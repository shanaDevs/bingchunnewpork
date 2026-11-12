function ymd(value: string): string {
  return value.slice(0, 10);
}

function formatLongPeriodLabel(from: string, to: string): string {
  const fmt = (value: string, withYear: boolean) => {
    const [year, month, day] = ymd(value).split('-').map(Number);
    return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  };
  const fromStr = ymd(from);
  const toStr = ymd(to);
  const sameYear = fromStr.slice(0, 4) === toStr.slice(0, 4);
  return sameYear ? `${fmt(fromStr, false)} – ${fmt(toStr, false)}` : `${fmt(fromStr, true)} – ${fmt(toStr, true)}`;
}

export function deliveryPayoutStatementDownloadFilename(periodFrom: string, periodTo: string): string {
  const period = formatLongPeriodLabel(periodFrom, periodTo);
  return `Delivery Partner - ${period}.pdf`;
}

export function deliveryPayoutStatementZipEntryPath(
  periodFrom: string,
  periodTo: string,
  existing: Set<string>,
): string {
  const base = deliveryPayoutStatementDownloadFilename(periodFrom, periodTo);
  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }
  let count = 2;
  while (existing.has(base.replace(/\.pdf$/i, ` (${count}).pdf`))) {
    count += 1;
  }
  const deduped = base.replace(/\.pdf$/i, ` (${count}).pdf`);
  existing.add(deduped);
  return deduped;
}
