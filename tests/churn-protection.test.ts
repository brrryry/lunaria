import { describe, it, expect, vi } from 'vitest';

export interface UnlinkRecord {
  id: string;
  userId: string;
  institutionId: string;
  institutionName: string;
  unlinkedAt: Date;
}

export class ChurnLimitExceededError extends Error {
  public readonly code = 'INSTITUTION_CHURN_LIMIT_EXCEEDED';
  public readonly institutionName?: string;
  public readonly unlinkCount: number;
  public readonly retryAfterHours: number;

  constructor(payload: {
    message: string;
    institutionName?: string;
    unlinkCount: number;
    retryAfterHours: number;
  }) {
    super(payload.message);
    this.name = 'ForbiddenException';
    this.institutionName = payload.institutionName;
    this.unlinkCount = payload.unlinkCount;
    this.retryAfterHours = payload.retryAfterHours;
  }
}

/**
 * Pure logic test harness mirroring PlaidService.checkChurnLimit
 */
export function checkChurnLimitLogic(
  unlinks: UnlinkRecord[],
  userId: string,
  metadata: {
    institutionId?: string;
    institutionName?: string;
  },
  now: Date = new Date(),
) {
  const incomingInstId = (metadata.institutionId || '').trim().toLowerCase();
  const incomingInstName = (metadata.institutionName || '').trim().toLowerCase();

  if (!incomingInstId && !incomingInstName) {
    return;
  }

  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const recentUnlinks = unlinks.filter(
    (u) => u.userId === userId && u.unlinkedAt >= twentyFourHoursAgo,
  );

  const matchingUnlinks = recentUnlinks.filter((u) => {
    const uId = (u.institutionId || '').trim().toLowerCase();
    const uName = (u.institutionName || '').trim().toLowerCase();
    const idMatch = Boolean(
      incomingInstId &&
        uId &&
        incomingInstId !== 'unknown' &&
        incomingInstId !== 'bank' &&
        incomingInstId === uId,
    );
    const nameMatch = Boolean(
      incomingInstName &&
        uName &&
        (incomingInstName === uName ||
          incomingInstName.includes(uName) ||
          uName.includes(incomingInstName)),
    );
    return idMatch || nameMatch;
  });

  if (matchingUnlinks.length >= 3) {
    throw new ChurnLimitExceededError({
      message: `You have removed and re-added ${metadata.institutionName || 'this bank'} 3 times in the last 24 hours. To protect against excessive connection charges, re-connecting this bank is temporarily paused. Please wait 24 hours before trying again.`,
      institutionName: metadata.institutionName,
      unlinkCount: matchingUnlinks.length,
      retryAfterHours: 24,
    });
  }
}

describe('24-Hour Institution Churn Rate Limiting', () => {
  const now = new Date('2026-09-08T12:00:00Z');

  it('allows linking when bank has 0, 1, or 2 unlinks in the past 24 hours', () => {
    const unlinks: UnlinkRecord[] = [
      {
        id: 'u-1',
        userId: 'user-1',
        institutionId: 'ins_3',
        institutionName: 'Chase',
        unlinkedAt: new Date('2026-09-08T08:00:00Z'), // 4h ago
      },
      {
        id: 'u-2',
        userId: 'user-1',
        institutionId: 'ins_3',
        institutionName: 'Chase',
        unlinkedAt: new Date('2026-09-08T10:00:00Z'), // 2h ago
      },
    ];

    expect(() => {
      checkChurnLimitLogic(
        unlinks,
        'user-1',
        { institutionId: 'ins_3', institutionName: 'Chase' },
        now,
      );
    }).not.toThrow();
  });

  it('throws ForbiddenException when bank was unlinked 3 times within 24 hours', () => {
    const unlinks: UnlinkRecord[] = [
      {
        id: 'u-1',
        userId: 'user-1',
        institutionId: 'ins_3',
        institutionName: 'Chase',
        unlinkedAt: new Date('2026-09-08T02:00:00Z'), // 10h ago
      },
      {
        id: 'u-2',
        userId: 'user-1',
        institutionId: 'ins_3',
        institutionName: 'Chase',
        unlinkedAt: new Date('2026-09-08T06:00:00Z'), // 6h ago
      },
      {
        id: 'u-3',
        userId: 'user-1',
        institutionId: 'ins_3',
        institutionName: 'Chase',
        unlinkedAt: new Date('2026-09-08T11:00:00Z'), // 1h ago
      },
    ];

    expect(() => {
      checkChurnLimitLogic(
        unlinks,
        'user-1',
        { institutionId: 'ins_3', institutionName: 'Chase' },
        now,
      );
    }).toThrowError(ChurnLimitExceededError);
  });

  it('aborts token exchange workflow and prevents Plaid item creation on churn block', async () => {
    const unlinks: UnlinkRecord[] = [
      {
        id: 'u-1',
        userId: 'user-1',
        institutionId: 'ins_3',
        institutionName: 'Chase',
        unlinkedAt: new Date('2026-09-08T02:00:00Z'),
      },
      {
        id: 'u-2',
        userId: 'user-1',
        institutionId: 'ins_3',
        institutionName: 'Chase',
        unlinkedAt: new Date('2026-09-08T06:00:00Z'),
      },
      {
        id: 'u-3',
        userId: 'user-1',
        institutionId: 'ins_3',
        institutionName: 'Chase',
        unlinkedAt: new Date('2026-09-08T11:00:00Z'),
      },
    ];

    const mockExchangePlaidToken = vi.fn();

    async function exchangeTokenWorkflow() {
      // Step 1: Check churn limit
      checkChurnLimitLogic(
        unlinks,
        'user-1',
        { institutionId: 'ins_3', institutionName: 'Chase' },
        now,
      );

      // Step 2: Call Plaid (MUST NOT BE CALLED)
      return await mockExchangePlaidToken();
    }

    await expect(exchangeTokenWorkflow()).rejects.toThrowError(
      ChurnLimitExceededError,
    );
    expect(mockExchangePlaidToken).not.toHaveBeenCalled();
  });

  it('does NOT count unlinks of a different institution toward the 3-limit', () => {
    const unlinks: UnlinkRecord[] = [
      {
        id: 'u-1',
        userId: 'user-1',
        institutionId: 'ins_1',
        institutionName: 'Bank of America',
        unlinkedAt: new Date('2026-09-08T02:00:00Z'),
      },
      {
        id: 'u-2',
        userId: 'user-1',
        institutionId: 'ins_1',
        institutionName: 'Bank of America',
        unlinkedAt: new Date('2026-09-08T06:00:00Z'),
      },
      {
        id: 'u-3',
        userId: 'user-1',
        institutionId: 'ins_1',
        institutionName: 'Bank of America',
        unlinkedAt: new Date('2026-09-08T10:00:00Z'),
      },
    ];

    // User unlinked Bank of America 3 times, but is linking Chase. Chase must NOT be blocked.
    expect(() => {
      checkChurnLimitLogic(
        unlinks,
        'user-1',
        { institutionId: 'ins_3', institutionName: 'Chase' },
        now,
      );
    }).not.toThrow();
  });

  it('ignores unlinks older than 24 hours', () => {
    const unlinks: UnlinkRecord[] = [
      {
        id: 'u-1',
        userId: 'user-1',
        institutionId: 'ins_3',
        institutionName: 'Chase',
        unlinkedAt: new Date('2026-09-06T12:00:00Z'), // 48h ago
      },
      {
        id: 'u-2',
        userId: 'user-1',
        institutionId: 'ins_3',
        institutionName: 'Chase',
        unlinkedAt: new Date('2026-09-07T10:00:00Z'), // 26h ago
      },
      {
        id: 'u-3',
        userId: 'user-1',
        institutionId: 'ins_3',
        institutionName: 'Chase',
        unlinkedAt: new Date('2026-09-08T11:00:00Z'), // 1h ago (only 1 within 24h)
      },
    ];

    expect(() => {
      checkChurnLimitLogic(
        unlinks,
        'user-1',
        { institutionId: 'ins_3', institutionName: 'Chase' },
        now,
      );
    }).not.toThrow();
  });
});
