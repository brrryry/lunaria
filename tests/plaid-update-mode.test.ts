import { describe, it, expect, vi } from 'vitest';

interface MockPlaidItem {
  id: string;
  userId: string;
  itemId: string;
  accessTokenEncrypted: string;
  institutionId: string;
  institutionName: string;
  status: 'active' | 'error' | 'pending_expiration';
  updatedAt: Date;
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundException';
  }
}

/**
 * Pure logic test harness mirroring PlaidService update mode functionality
 */
export class PlaidUpdateModeService {
  constructor(
    private items: MockPlaidItem[],
    private mockPlaidClient: {
      linkTokenCreate: (req: any) => Promise<{ data: { link_token: string } }>;
    },
    private decryptToken: (enc: string) => string,
  ) {}

  async createUpdateLinkToken(userId: string, itemId: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        itemId,
      );

    const item = this.items.find((i) => {
      const idMatch = isUuid
        ? i.id === itemId || i.itemId === itemId
        : i.itemId === itemId;
      return idMatch && i.userId === userId;
    });

    if (!item) {
      throw new NotFoundError(`Plaid item ${itemId} not found`);
    }

    const decryptedAccessToken = this.decryptToken(item.accessTokenEncrypted);

    // CRITICAL: Plaid rules for Update Mode:
    // 1. Must include access_token
    // 2. Must NOT include products
    // 3. Sets update: { account_selection_enabled: true }
    const request: any = {
      user: { client_user_id: userId },
      client_name: 'Lunaria',
      country_codes: ['US'],
      language: 'en',
      access_token: decryptedAccessToken,
      update: {
        account_selection_enabled: true,
      },
    };

    const res = await this.mockPlaidClient.linkTokenCreate(request);

    return {
      linkToken: res.data.link_token,
      userId,
      itemId: item.id,
      institutionName: item.institutionName,
      requestPayload: request,
    };
  }

  async resolveUpdateModeSuccess(userId: string, itemId: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        itemId,
      );

    const item = this.items.find((i) => {
      const idMatch = isUuid
        ? i.id === itemId || i.itemId === itemId
        : i.itemId === itemId;
      return idMatch && i.userId === userId;
    });

    if (!item) {
      throw new NotFoundError(`Plaid item ${itemId} not found`);
    }

    // Mark active in database without changing itemId or creating new records
    item.status = 'active';
    item.updatedAt = new Date();

    return {
      success: true,
      itemId: item.id,
      institutionName: item.institutionName,
      status: item.status,
    };
  }
}

describe('Plaid Link Update Mode', () => {
  const initialItems: MockPlaidItem[] = [
    {
      id: 'a0000000-0000-0000-0000-000000000001',
      userId: 'user-abc',
      itemId: 'plaid-item-chase-999',
      accessTokenEncrypted: 'enc_token_chase',
      institutionId: 'ins_3',
      institutionName: 'Chase Bank',
      status: 'error', // Broken connection e.g. ITEM_LOGIN_REQUIRED
      updatedAt: new Date('2026-01-01'),
    },
  ];

  it('creates an update mode link token without products and with access_token', async () => {
    const mockPlaid = {
      linkTokenCreate: vi.fn().mockResolvedValue({
        data: { link_token: 'link-sandbox-update-1234' },
      }),
    };

    const service = new PlaidUpdateModeService(
      [...initialItems],
      mockPlaid,
      (t) => `decrypted_${t}`,
    );

    const result = await service.createUpdateLinkToken(
      'user-abc',
      'a0000000-0000-0000-0000-000000000001',
    );

    expect(result.linkToken).toBe('link-sandbox-update-1234');
    expect(result.institutionName).toBe('Chase Bank');

    // Verify Plaid Link API contract
    expect(mockPlaid.linkTokenCreate).toHaveBeenCalledTimes(1);
    const sentRequest = mockPlaid.linkTokenCreate.mock.calls[0][0];

    // 1. Must include the existing Item access token
    expect(sentRequest.access_token).toBe('decrypted_enc_token_chase');

    // 2. Must NOT include products parameter (Plaid throws an error if products is sent in update mode)
    expect(sentRequest.products).toBeUndefined();

    // 3. Must enable account selection in update mode
    expect(sentRequest.update).toEqual({ account_selection_enabled: true });
    expect(sentRequest.user.client_user_id).toBe('user-abc');
  });

  it('resolves update mode success and restores active status without creating a duplicate item', async () => {
    const mockPlaid = {
      linkTokenCreate: vi.fn(),
    };
    const items = [...initialItems.map((i) => ({ ...i }))];
    const initialItemCount = items.length;

    const service = new PlaidUpdateModeService(
      items,
      mockPlaid,
      (t) => `decrypted_${t}`,
    );

    const res = await service.resolveUpdateModeSuccess(
      'user-abc',
      'a0000000-0000-0000-0000-000000000001',
    );

    expect(res.success).toBe(true);
    expect(res.status).toBe('active');

    // Guarantees:
    // 1. Item count remains exactly 1 (no duplicate items added to user plan)
    expect(items.length).toBe(initialItemCount);

    // 2. itemId and accessTokenEncrypted remain untouched
    expect(items[0].itemId).toBe('plaid-item-chase-999');
    expect(items[0].accessTokenEncrypted).toBe('enc_token_chase');

    // 3. Status is now restored to 'active'
    expect(items[0].status).toBe('active');
  });

  it('supports lookup via Plaid item_id text as well as internal UUID', async () => {
    const mockPlaid = {
      linkTokenCreate: vi.fn().mockResolvedValue({
        data: { link_token: 'link-sandbox-update-by-itemid' },
      }),
    };

    const service = new PlaidUpdateModeService(
      [...initialItems],
      mockPlaid,
      (t) => `decrypted_${t}`,
    );

    const result = await service.createUpdateLinkToken(
      'user-abc',
      'plaid-item-chase-999',
    );

    expect(result.linkToken).toBe('link-sandbox-update-by-itemid');
  });

  it('rejects update mode request if item belongs to a different user', async () => {
    const mockPlaid = {
      linkTokenCreate: vi.fn(),
    };

    const service = new PlaidUpdateModeService(
      [...initialItems],
      mockPlaid,
      (t) => `decrypted_${t}`,
    );

    await expect(
      service.createUpdateLinkToken('different-user', 'plaid-item-chase-999'),
    ).rejects.toThrowError(NotFoundError);
  });
});
