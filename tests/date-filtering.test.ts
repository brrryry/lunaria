import { describe, it, expect } from 'vitest';

export type DateFilterOption = 'all' | '7d' | '30d' | 'quarter' | 'year' | 'custom';

export function computeDateRange(
  filter: DateFilterOption,
  customStart?: string,
  customEnd?: string,
  refDate: Date = new Date('2026-09-03T12:00:00Z'),
) {
  const toYMD = (d: Date) => d.toISOString().split('T')[0];

  switch (filter) {
    case '7d': {
      const start = new Date(refDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: toYMD(start), end: toYMD(refDate) };
    }
    case '30d': {
      const start = new Date(refDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: toYMD(start), end: toYMD(refDate) };
    }
    case 'quarter': {
      const start = new Date(refDate.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { start: toYMD(start), end: toYMD(refDate) };
    }
    case 'year': {
      const start = new Date(refDate.getTime() - 365 * 24 * 60 * 60 * 1000);
      return { start: toYMD(start), end: toYMD(refDate) };
    }
    case 'custom': {
      return {
        start: customStart || null,
        end: customEnd || null,
      };
    }
    case 'all':
    default:
      return { start: null, end: null };
  }
}

export function filterTransactionsByDate(
  transactions: { id: string; date: string; amount: number }[],
  range: { start: string | null; end: string | null },
) {
  return transactions.filter((tx) => {
    if (range.start && tx.date < range.start) return false;
    if (range.end && tx.date > range.end) return false;
    return true;
  });
}

describe('Date Range Filtering Engine', () => {
  const refDate = new Date('2026-09-03T12:00:00Z');

  const testTransactions = [
    { id: 'tx-today', date: '2026-09-03', amount: 15 },
    { id: 'tx-3d-ago', date: '2026-08-31', amount: 45 },
    { id: 'tx-10d-ago', date: '2026-08-24', amount: 120 },
    { id: 'tx-45d-ago', date: '2026-07-20', amount: 80 },
    { id: 'tx-120d-ago', date: '2026-05-05', amount: 200 },
    { id: 'tx-2yr-ago', date: '2024-09-01', amount: 500 },
  ];

  it('All Time includes all transactions without date boundaries', () => {
    const range = computeDateRange('all', undefined, undefined, refDate);
    expect(range.start).toBeNull();
    expect(range.end).toBeNull();

    const filtered = filterTransactionsByDate(testTransactions, range);
    expect(filtered.length).toBe(6);
  });

  it('Last 7 Days only includes transactions within 7 days', () => {
    const range = computeDateRange('7d', undefined, undefined, refDate);
    expect(range.start).toBe('2026-08-27');
    expect(range.end).toBe('2026-09-03');

    const filtered = filterTransactionsByDate(testTransactions, range);
    expect(filtered.map((t) => t.id)).toEqual(['tx-today', 'tx-3d-ago']);
  });

  it('Last Month (30d) includes transactions within 30 days', () => {
    const range = computeDateRange('30d', undefined, undefined, refDate);
    expect(range.start).toBe('2026-08-04');
    expect(range.end).toBe('2026-09-03');

    const filtered = filterTransactionsByDate(testTransactions, range);
    expect(filtered.map((t) => t.id)).toEqual([
      'tx-today',
      'tx-3d-ago',
      'tx-10d-ago',
    ]);
  });

  it('Last Quarter (90d) includes transactions within 90 days', () => {
    const range = computeDateRange('quarter', undefined, undefined, refDate);
    const filtered = filterTransactionsByDate(testTransactions, range);
    expect(filtered.map((t) => t.id)).toEqual([
      'tx-today',
      'tx-3d-ago',
      'tx-10d-ago',
      'tx-45d-ago',
    ]);
  });

  it('Last Year (365d) excludes transactions older than 1 year', () => {
    const range = computeDateRange('year', undefined, undefined, refDate);
    const filtered = filterTransactionsByDate(testTransactions, range);
    expect(filtered.find((t) => t.id === 'tx-2yr-ago')).toBeUndefined();
    expect(filtered.length).toBe(5);
  });

  it('Custom date range respects precise user start and end dates', () => {
    const range = computeDateRange('custom', '2026-07-01', '2026-08-30', refDate);
    const filtered = filterTransactionsByDate(testTransactions, range);
    expect(filtered.map((t) => t.id)).toEqual(['tx-10d-ago', 'tx-45d-ago']);
  });
});
