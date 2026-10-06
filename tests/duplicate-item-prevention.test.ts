import { describe, it, expect, vi } from 'vitest';

export interface ExistingItem {
  id: string;
  userId: string;
  institutionId: string;
  institutionName: string;
  status: 'active' | 'inactive';
}

export interface ExistingAccount {
  id: string;
  userId: string;
  plaidItemId: string;
  plaidAccountId?: string | null;
  institutionName?: string | null;
  name: string;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
}

export interface IncomingAccountMetadata {
  id?: string;
  name?: string;
  mask?: string;
  type?: string;
  subtype?: string;
}

export interface IncomingMetadata {
  institutionId?: string;
  institutionName?: string;
  accounts?: IncomingAccountMetadata[];
}

export class DuplicateItemError extends Error {
  public readonly code = 'DUPLICATE_ITEM';
  public readonly duplicateAccounts: any[];
  public readonly institutionName?: string;

  constructor(payload: {
    message: string;
    institutionName?: string;
    duplicateAccounts: any[];
  }) {
    super(payload.message);
    this.name = 'ConflictException';
    this.duplicateAccounts = payload.duplicateAccounts;
    this.institutionName = payload.institutionName;
  }
}

/**
 * Pure logic function mirroring PlaidService.checkDuplicateItem
 */
export function checkDuplicateItemLogic(
  existingItems: ExistingItem[],
  existingAccounts: ExistingAccount[],
  metadata: IncomingMetadata,
) {
  const activeItems = existingItems.filter((i) => i.status === 'active');
  if (activeItems.length === 0) {
    return;
  }

  const incomingAccounts = metadata.accounts || [];
  const incomingInstId = (metadata.institutionId || '').trim().toLowerCase();
  const incomingInstName = (metadata.institutionName || '').trim().toLowerCase();

  const itemMap = new Map(activeItems.map((item) => [item.id, item]));

  const duplicateMatches: Array<{
    incomingName: string;
    matchedAccountName: string;
    institutionName: string;
    mask?: string;
    type?: string;
    subtype?: string;
  }> = [];

  for (const inAcc of incomingAccounts) {
    const inId = inAcc.id;
    const inName = (inAcc.name || '').trim().toLowerCase();
    const inMask = (inAcc.mask || '').trim();

    for (const exAcc of existingAccounts) {
      const item = itemMap.get(exAcc.plaidItemId);
      if (!item) continue;

      const exInstId = (item.institutionId || '').trim().toLowerCase();
      const exInstName = (item.institutionName || exAcc.institutionName || '').trim().toLowerCase();

      const isSameInstitution =
        Boolean(incomingInstId && exInstId && incomingInstId !== 'unknown' && incomingInstId === exInstId) ||
        Boolean(incomingInstName && exInstName && incomingInstName === exInstName);

      // Condition 1: Exact Plaid Account ID match
      const isExactPlaidId = Boolean(inId && exAcc.plaidAccountId && inId === exAcc.plaidAccountId);

      // Condition 2: Same institution + same mask + matching name
      const exMask = (exAcc.mask || '').trim();
      const exName = (exAcc.name || '').trim().toLowerCase();
      const isSameMaskAndName =
        isSameInstitution &&
        Boolean(inMask && exMask && inMask === exMask) &&
        Boolean(inName && exName && (inName === exName || inName.includes(exName) || exName.includes(inName)));

      // Condition 3: Same institution + same mask + matching subtype/type
      const isSameMaskAndType =
        isSameInstitution &&
        Boolean(inMask && exMask && inMask === exMask) &&
        Boolean(
          inAcc.type &&
            exAcc.type &&
            inAcc.type === exAcc.type &&
            inAcc.subtype &&
            exAcc.subtype &&
            inAcc.subtype === exAcc.subtype,
        );

      if (isExactPlaidId || isSameMaskAndName || isSameMaskAndType) {
        duplicateMatches.push({
          incomingName: inAcc.name || 'Account',
          matchedAccountName: exAcc.name,
          institutionName: item.institutionName || metadata.institutionName || 'Financial Institution',
          mask: inMask || exMask || undefined,
          type: inAcc.type || exAcc.type || undefined,
          subtype: inAcc.subtype || exAcc.subtype || undefined,
        });
        break;
      }
    }
  }

  // Fallback check: if link provided no individual accounts, check for identical institution_id
  if (incomingAccounts.length === 0 && incomingInstId && incomingInstId !== 'unknown' && incomingInstId !== 'bank') {
    const matchingItem = activeItems.find(
      (item) => (item.institutionId || '').trim().toLowerCase() === incomingInstId,
    );
    if (matchingItem) {
      duplicateMatches.push({
        incomingName: matchingItem.institutionName,
        matchedAccountName: matchingItem.institutionName,
        institutionName: matchingItem.institutionName,
      });
    }
  }

  if (duplicateMatches.length > 0) {
    throw new DuplicateItemError({
      message: `This account is already linked (${duplicateMatches.map((d) => `${d.incomingName} (...${d.mask || ''})`).join(', ')})`,
      institutionName: metadata.institutionName,
      duplicateAccounts: duplicateMatches.map((d) => ({
        name: d.matchedAccountName,
        mask: d.mask,
        type: d.type,
        subtype: d.subtype,
      })),
    });
  }
}

describe('Duplicate Plaid Item Prevention', () => {
  const existingItems: ExistingItem[] = [
    {
      id: 'item-chase-1',
      userId: 'user-123',
      institutionId: 'ins_3',
      institutionName: 'Chase',
      status: 'active',
    },
  ];

  const existingAccounts: ExistingAccount[] = [
    {
      id: 'acc-1',
      userId: 'user-123',
      plaidItemId: 'item-chase-1',
      plaidAccountId: 'plaid-acc-checking-999',
      institutionName: 'Chase',
      name: 'Total Checking',
      mask: '1234',
      type: 'depository',
      subtype: 'checking',
    },
    {
      id: 'acc-2',
      userId: 'user-123',
      plaidItemId: 'item-chase-1',
      plaidAccountId: 'plaid-acc-savings-888',
      institutionName: 'Chase',
      name: 'Premier Savings',
      mask: '5678',
      type: 'depository',
      subtype: 'savings',
    },
  ];

  it('detects duplicate when same institution and exact mask + name are submitted', () => {
    expect(() => {
      checkDuplicateItemLogic(existingItems, existingAccounts, {
        institutionId: 'ins_3',
        institutionName: 'Chase',
        accounts: [
          {
            id: 'new-plaid-id-abc',
            name: 'Total Checking',
            mask: '1234',
            type: 'depository',
            subtype: 'checking',
          },
        ],
      });
    }).toThrowError(DuplicateItemError);
  });

  it('detects duplicate via exact plaidAccountId match even if name was modified', () => {
    expect(() => {
      checkDuplicateItemLogic(existingItems, existingAccounts, {
        institutionId: 'ins_3',
        institutionName: 'Chase',
        accounts: [
          {
            id: 'plaid-acc-checking-999',
            name: 'My Custom Checking Renamed',
            mask: '9999',
            type: 'depository',
            subtype: 'checking',
          },
        ],
      });
    }).toThrowError(DuplicateItemError);
  });

  it('detects duplicate via same institution + mask + type/subtype when name varies slightly', () => {
    expect(() => {
      checkDuplicateItemLogic(existingItems, existingAccounts, {
        institutionId: 'ins_3',
        institutionName: 'Chase',
        accounts: [
          {
            id: 'new-plaid-id-xyz',
            name: 'JPMorgan Chase Checking Account',
            mask: '1234',
            type: 'depository',
            subtype: 'checking',
          },
        ],
      });
    }).toThrowError(DuplicateItemError);
  });

  it('does NOT flag duplicate for different institution sharing the same mask', () => {
    // Bank of America account ending in 1234 should NOT conflict with Chase account ending in 1234
    expect(() => {
      checkDuplicateItemLogic(existingItems, existingAccounts, {
        institutionId: 'ins_1',
        institutionName: 'Bank of America',
        accounts: [
          {
            id: 'new-bofa-id',
            name: 'Advantage Checking',
            mask: '1234',
            type: 'depository',
            subtype: 'checking',
          },
        ],
      });
    }).not.toThrow();
  });

  it('does NOT flag duplicate for a new account at the same institution with a different mask', () => {
    expect(() => {
      checkDuplicateItemLogic(existingItems, existingAccounts, {
        institutionId: 'ins_3',
        institutionName: 'Chase',
        accounts: [
          {
            id: 'new-chase-credit',
            name: 'Freedom Unlimited Credit Card',
            mask: '4321',
            type: 'credit',
            subtype: 'credit card',
          },
        ],
      });
    }).not.toThrow();
  });

  it('aborts exchange flow before calling itemPublicTokenExchange when duplicate is detected', async () => {
    const mockExchangePlaidToken = vi.fn().mockResolvedValue({
      data: { access_token: 'access-sandbox-fake', item_id: 'item-fake' },
    });

    async function exchangeTokenWorkflow(metadata: IncomingMetadata) {
      // Step 1: Duplicate check BEFORE token exchange
      checkDuplicateItemLogic(existingItems, existingAccounts, metadata);

      // Step 2: Exchange public token with Plaid API (MUST NOT BE REACHED ON DUPLICATE)
      return await mockExchangePlaidToken();
    }

    let errorThrown: any = null;
    try {
      await exchangeTokenWorkflow({
        institutionId: 'ins_3',
        institutionName: 'Chase',
        accounts: [
          {
            id: 'temp-id-1',
            name: 'Total Checking',
            mask: '1234',
            type: 'depository',
            subtype: 'checking',
          },
        ],
      });
    } catch (err) {
      errorThrown = err;
    }

    expect(errorThrown).toBeInstanceOf(DuplicateItemError);
    expect(errorThrown.duplicateAccounts).toHaveLength(1);
    expect(errorThrown.duplicateAccounts[0].mask).toBe('1234');
    // Ensure Plaid itemPublicTokenExchange was never called, preventing token creation & billing
    expect(mockExchangePlaidToken).not.toHaveBeenCalled();
  });
});
