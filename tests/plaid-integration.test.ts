import { describe, it, expect, beforeAll } from 'vitest';
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  SandboxItemFireWebhookRequestWebhookCodeEnum,
} from 'plaid';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env manually if not already in process.env
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      const val = rest.join('=').replace(/(^['"]|['"]$)/g, '');
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

describe('Plaid Sandbox API Integration', () => {
  let plaidClient: PlaidApi;
  let hasValidCredentials = false;

  beforeAll(() => {
    loadEnv();

    const clientId = process.env.PLAID_CLIENT_ID;
    const env = process.env.PLAID_ENV || 'sandbox';
    const sandboxSecret =
      process.env.PLAID_SANDBOX_SECRET ||
      (env === 'sandbox' ? process.env.PLAID_SECRET : null) ||
      'eff0528ff204698b518b1cc7968046';

    if (clientId && sandboxSecret && !clientId.includes('your-plaid')) {
      hasValidCredentials = true;
      const configuration = new Configuration({
        basePath: PlaidEnvironments.sandbox,
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': clientId,
            'PLAID-SECRET': sandboxSecret,
          },
        },
      });
      plaidClient = new PlaidApi(configuration);
    }
  });

  it('verifies Plaid credentials and executes complete connect -> sync -> disconnect lifecycle', async () => {
    if (!hasValidCredentials) {
      console.warn('Skipping live Plaid test: PLAID_CLIENT_ID and PLAID_SECRET not configured');
      return;
    }

    // 1. Create Sandbox Public Token (Simulates user selecting First Platypus Bank in Link popup)
    const publicTokenResponse = await plaidClient.sandboxPublicTokenCreate({
      institution_id: 'ins_109508', // First Platypus Bank (Plaid Sandbox Default)
      initial_products: [Products.Transactions],
    });

    expect(publicTokenResponse.status).toBe(200);
    const publicToken = publicTokenResponse.data.public_token;
    expect(publicToken).toBeDefined();
    expect(publicToken.startsWith('public-sandbox-')).toBe(true);

    // 2. Exchange Public Token for Access Token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    expect(exchangeResponse.status).toBe(200);
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;
    expect(accessToken).toBeDefined();
    expect(itemId).toBeDefined();
    expect(accessToken.startsWith('access-sandbox-')).toBe(true);

    // 3. Fetch Real Sandbox Accounts
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    expect(accountsResponse.status).toBe(200);
    const accounts = accountsResponse.data.accounts;
    expect(accounts.length).toBeGreaterThan(0);

    const checkingAccount = accounts.find((a) => a.subtype === 'checking');
    expect(checkingAccount).toBeDefined();
    expect(checkingAccount?.balances.current).toBeDefined();

    // 4. Test Transactions Sync endpoint responsiveness
    const syncResponse = await plaidClient.transactionsSync({
      access_token: accessToken,
    });
    expect(syncResponse.status).toBe(200);
    expect(syncResponse.data.next_cursor).toBeDefined();

    // 5. Delete / Remove Plaid Connection (Clean Up)
    const removeResponse = await plaidClient.itemRemove({
      access_token: accessToken,
    });

    expect(removeResponse.status).toBe(200);
    expect(removeResponse.data.request_id).toBeDefined();

    // 6. Verify item is genuinely removed by attempting to fetch accounts with old token
    await expect(
      plaidClient.accountsGet({ access_token: accessToken }),
    ).rejects.toThrow();
  }, 20000);
});
