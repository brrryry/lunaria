import { describe, it, expect, vi } from 'vitest';
import {
  filterPendingDuplicates,
  isNameOrMerchantSimilar,
  normalizeTransactionString,
  reconcilePendingTransactionsInDb,
} from '../backend/src/transactions/transactions.service';
import { deduplicateTransactionsList } from '../website/src/lib/transactions';

describe('Transaction Deduplication & Unique IDs', () => {
  describe('normalizeTransactionString & isNameOrMerchantSimilar', () => {
    it('normalizes punctuation, special characters, and extra spaces', () => {
      expect(normalizeTransactionString('  STARBUCKS #1023! ')).toBe('starbucks 1023');
      expect(normalizeTransactionString('Amazon.com*2A3B4C')).toBe('amazon com 2a3b4c');
      expect(normalizeTransactionString(null)).toBe('');
    });

    it('identifies exact and cross matches between names and merchants', () => {
      expect(isNameOrMerchantSimilar('Starbucks Store', 'Starbucks', 'Starbucks Store', 'Starbucks')).toBe(true);
      expect(isNameOrMerchantSimilar('WHOLE FOODS #1234', undefined, 'WHOLE FOODS MARKET', 'Whole Foods')).toBe(true);
      expect(isNameOrMerchantSimilar('TARGET T-1029', undefined, 'TARGET', 'Target')).toBe(true);
      expect(isNameOrMerchantSimilar('Uber Trip', 'Uber', 'Lyft Ride', 'Lyft')).toBe(false);
    });
  });

  describe('filterPendingDuplicates (Backend In-Memory Filter)', () => {
    it('filters out pending duplicate when posted counterpart matches exact amount and account within 7 days', () => {
      const items = [
        {
          id: 'tx-pending-1',
          accountId: 'acc-1',
          amount: 45.5,
          date: '2026-11-01',
          name: 'Trader Joe\x27s Store #45',
          merchantName: 'Trader Joe\x27s',
          pending: true,
        },
        {
          id: 'tx-posted-1',
          accountId: 'acc-1',
          amount: 45.5,
          date: '2026-11-03',
          name: 'Trader Joe\x27s',
          merchantName: 'Trader Joe\x27s',
          pending: false,
        },
      ];

      const clean = filterPendingDuplicates(items);
      expect(clean).toHaveLength(1);
      expect(clean[0].id).toBe('tx-posted-1');
      expect(clean[0].pending).toBe(false);
    });

    it('filters out pending duplicate when posted transaction includes restaurant tip adjustment', () => {
      const items = [
        {
          id: 'tx-pending-rest',
          accountId: 'acc-1',
          amount: 50.0,
          date: '2026-11-01',
          name: 'Joe\x27s Pizza',
          merchantName: 'Joe\x27s Pizza',
          pending: true,
        },
        {
          id: 'tx-posted-rest',
          accountId: 'acc-1',
          amount: 60.0, // $10 tip added upon settlement
          date: '2026-11-03',
          name: 'Joe\x27s Pizza NYC',
          merchantName: 'Joe\x27s Pizza',
          pending: false,
        },
      ];

      const clean = filterPendingDuplicates(items);
      expect(clean).toHaveLength(1);
      expect(clean[0].id).toBe('tx-posted-rest');
    });

    it('preserves genuine separate posted transactions with identical amounts on the same day', () => {
      const items = [
        {
          id: 'tx-coffee-1',
          accountId: 'acc-1',
          amount: 5.25,
          date: '2026-11-02',
          name: 'Blue Bottle Coffee',
          merchantName: 'Blue Bottle Coffee',
          pending: false,
        },
        {
          id: 'tx-coffee-2',
          accountId: 'acc-1',
          amount: 5.25,
          date: '2026-11-02',
          name: 'Blue Bottle Coffee',
          merchantName: 'Blue Bottle Coffee',
          pending: false,
        },
      ];

      const clean = filterPendingDuplicates(items);
      expect(clean).toHaveLength(2);
    });

    it('preserves pending transactions that have not yet posted', () => {
      const items = [
        {
          id: 'tx-pending-recent',
          accountId: 'acc-1',
          amount: 88.0,
          date: '2026-11-04',
          name: 'Apple Store',
          merchantName: 'Apple',
          pending: true,
        },
        {
          id: 'tx-posted-other',
          accountId: 'acc-1',
          amount: 25.0,
          date: '2026-11-04',
          name: 'Chipotle',
          merchantName: 'Chipotle',
          pending: false,
        },
      ];

      const clean = filterPendingDuplicates(items);
      expect(clean).toHaveLength(2);
      expect(clean.some((i) => i.id === 'tx-pending-recent')).toBe(true);
    });
  });

  describe('reconcilePendingTransactionsInDb', () => {
    it('deletes duplicate pending transaction matching posted transaction and returns count', async () => {
      const mockPending = [
        {
          id: 'pending-uuid-1',
          accountId: 'acc-1',
          plaidTransactionId: 'plaid-p-1',
          amount: 32.14,
          date: '2026-11-01',
          name: 'Shell Gas Station',
          merchantName: 'Shell',
          notes: 'Important fuel note',
          tags: ['tax-deductible'],
        },
      ];

      const mockPosted = [
        {
          id: 'posted-uuid-1',
          accountId: 'acc-1',
          plaidTransactionId: 'plaid-t-1',
          amount: 32.14,
          date: '2026-11-02',
          name: 'Shell Oil',
          merchantName: 'Shell',
          notes: null,
          tags: null,
        },
      ];

      const deletedIds: string[] = [];
      const updatedValues: any[] = [];

      const mockDb: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi
              .fn()
              .mockResolvedValueOnce(mockPending)
              .mockResolvedValueOnce(mockPosted),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockImplementation((val) => {
            updatedValues.push(val);
            return {
              where: vi.fn().mockResolvedValue([]),
            };
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation((cond) => {
            deletedIds.push('pending-uuid-1');
            return Promise.resolve([]);
          }),
        }),
      };

      const result = await reconcilePendingTransactionsInDb(mockDb, 'user-123');
      expect(result.deletedPendingCount).toBe(1);
      expect(deletedIds).toContain('pending-uuid-1');
      // Verify notes & tags carry-over
      expect(updatedValues.length).toBeGreaterThan(0);
      expect(updatedValues[0].notes).toBe('Important fuel note');
      expect(updatedValues[0].tags).toEqual(['tax-deductible']);
    });

    it('prunes stale pending transactions older than 21 days even if no posted match', async () => {
      const mockPending = [
        {
          id: 'stale-pending-uuid',
          accountId: 'acc-1',
          plaidTransactionId: 'plaid-stale-1',
          amount: 15.0,
          date: '2026-09-01', // well older than 21 days
          name: 'Expired Authorization Hold',
          merchantName: null,
          notes: null,
          tags: null,
        },
      ];

      const mockDb: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi
              .fn()
              .mockResolvedValueOnce(mockPending)
              .mockResolvedValueOnce([]), // no posted transactions
          }),
        }),
        update: vi.fn(),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      };

      const result = await reconcilePendingTransactionsInDb(mockDb, 'user-123');
      expect(result.deletedPendingCount).toBe(1);
    });
  });

  describe('deduplicateTransactionsList (Frontend)', () => {
    it('enforces strict ID uniqueness and removes superseded pending transactions', () => {
      const items = [
        // Duplicate row with exact same id
        {
          id: 'duplicate-id-1',
          plaidTransactionId: 'plaid-1',
          amount: 20,
          date: '2026-11-01',
          name: 'Grocery',
          pending: false,
        },
        {
          id: 'duplicate-id-1',
          plaidTransactionId: 'plaid-1',
          amount: 20,
          date: '2026-11-01',
          name: 'Grocery',
          pending: false,
        },
        // Pending and posted pair
        {
          id: 'pending-tx-2',
          plaidTransactionId: 'plaid-p-2',
          amount: 12.5,
          date: '2026-11-01',
          name: 'Bakery',
          pending: true,
        },
        {
          id: 'posted-tx-2',
          plaidTransactionId: 'plaid-t-2',
          amount: 12.5,
          date: '2026-11-02',
          name: 'Bakery',
          pending: false,
        },
      ];

      const result = deduplicateTransactionsList(items);
      // 1 from duplicate-id-1, 1 from posted-tx-2 (pending-tx-2 removed)
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['duplicate-id-1', 'posted-tx-2']);
    });
  });
});

