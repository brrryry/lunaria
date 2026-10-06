const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../../../.env');

// Parse .env if variables not set
const envVars = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    envVars[key.trim()] = rest.join('=').trim().replace(/(^['"]|['"]$)/g, '');
  }
}

const dbUrl =
  process.env.DATABASE_URL ||
  envVars.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/lunaria';

const sql = postgres(dbUrl);

async function seed() {
  console.log('\n========================================================');
  console.log('🌱 LUNARIA: Seeding Demo User & Realistic Financial Data');
  console.log('========================================================\n');

  // 1. Get or Create Demo User
  let [demoUser] = await sql`
    SELECT id, email, full_name FROM users WHERE email = 'demo@lunaria.finance' LIMIT 1;
  `;

  if (!demoUser) {
    [demoUser] = await sql`
      INSERT INTO users (email, full_name, currency, auth_provider)
      VALUES ('demo@lunaria.finance', 'Alex Mercer', 'USD', 'local')
      RETURNING id, email, full_name;
    `;
    console.log(`   ✓ Created demo user: ${demoUser.email} (${demoUser.id})`);
  } else {
    console.log(`   ✓ Found existing demo user: ${demoUser.email} (${demoUser.id})`);
  }

  const userId = demoUser.id;

  // 2. Clean previous demo data for clean idempotent seed
  await sql`DELETE FROM transactions WHERE user_id = ${userId};`;
  await sql`DELETE FROM security_holdings WHERE user_id = ${userId};`;
  await sql`DELETE FROM accounts WHERE user_id = ${userId};`;
  await sql`DELETE FROM plaid_items WHERE user_id = ${userId};`;

  // 3. Seed Plaid Connections
  const [chaseItem] = await sql`
    INSERT INTO plaid_items (user_id, item_id, access_token_encrypted, institution_id, institution_name)
    VALUES (${userId}, 'item_demo_chase', 'mock_token_chase', 'ins_3', 'Chase Bank')
    RETURNING id;
  `;

  const [marcusItem] = await sql`
    INSERT INTO plaid_items (user_id, item_id, access_token_encrypted, institution_id, institution_name)
    VALUES (${userId}, 'item_demo_marcus', 'mock_token_marcus', 'ins_129467', 'Marcus by Goldman Sachs')
    RETURNING id;
  `;

  const [fidelityItem] = await sql`
    INSERT INTO plaid_items (user_id, item_id, access_token_encrypted, institution_id, institution_name)
    VALUES (${userId}, 'item_demo_fidelity', 'mock_token_fidelity', 'ins_14', 'Fidelity Investments')
    RETURNING id;
  `;

  console.log('   ✓ Seeded 3 financial institutions (Chase, Marcus, Fidelity)');

  // 4. Seed Accounts
  const [checkingAcc] = await sql`
    INSERT INTO accounts (user_id, plaid_item_id, plaid_account_id, name, official_name, type, subtype, current_balance, available_balance, iso_currency_code, institution_name, is_hidden)
    VALUES (${userId}, ${chaseItem.id}, 'acc_chase_chk', 'Sapphire Checking', 'Chase Sapphire Banking', 'depository', 'checking', 8420.50, 8420.50, 'USD', 'Chase Bank', false)
    RETURNING id;
  `;

  const [cardAcc] = await sql`
    INSERT INTO accounts (user_id, plaid_item_id, plaid_account_id, name, official_name, type, subtype, current_balance, available_balance, iso_currency_code, institution_name, is_hidden)
    VALUES (${userId}, ${chaseItem.id}, 'acc_chase_crd', 'Freedom Unlimited', 'Chase Freedom Unlimited Visa Signature', 'credit', 'credit card', 1240.80, null, 'USD', 'Chase Bank', false)
    RETURNING id;
  `;

  const [savingsAcc] = await sql`
    INSERT INTO accounts (user_id, plaid_item_id, plaid_account_id, name, official_name, type, subtype, current_balance, available_balance, iso_currency_code, institution_name, is_hidden)
    VALUES (${userId}, ${marcusItem.id}, 'acc_marcus_sav', 'Online High Yield Savings', 'Marcus High-Yield Savings Account', 'depository', 'savings', 45000.00, 45000.00, 'USD', 'Marcus by Goldman Sachs', false)
    RETURNING id;
  `;

  const [brokerageAcc] = await sql`
    INSERT INTO accounts (user_id, plaid_item_id, plaid_account_id, name, official_name, type, subtype, current_balance, available_balance, iso_currency_code, institution_name, is_hidden)
    VALUES (${userId}, ${fidelityItem.id}, 'acc_fidelity_brk', 'Individual Taxable Brokerage', 'Fidelity Individual Investment Account', 'investment', 'brokerage', 128450.00, 128450.00, 'USD', 'Fidelity Investments', false)
    RETURNING id;
  `;

  console.log('   ✓ Seeded 4 accounts (Net Worth: $180,629.70)');

  // 5. Seed Stock Holdings
  await sql`
    INSERT INTO security_holdings (user_id, account_id, security_id, ticker_symbol, name, quantity, cost_basis, institution_price, institution_value, currency)
    VALUES
      (${userId}, ${brokerageAcc.id}, 'sec_voo', 'VOO', 'Vanguard S&P 500 ETF', 120, 480.00, 512.30, 61476.00, 'USD'),
      (${userId}, ${brokerageAcc.id}, 'sec_aapl', 'AAPL', 'Apple Inc.', 150, 195.50, 228.50, 34275.00, 'USD'),
      (${userId}, ${brokerageAcc.id}, 'sec_msft', 'MSFT', 'Microsoft Corporation', 45, 410.20, 442.10, 19894.50, 'USD'),
      (${userId}, ${brokerageAcc.id}, 'sec_nvda', 'NVDA', 'NVIDIA Corporation', 110, 95.00, 116.40, 12804.00, 'USD');
  `;
  console.log('   ✓ Seeded 4 investment holdings (VOO, AAPL, MSFT, NVDA)');

  // 6. Seed Realistic Transactions (Last 30 Days)
  const now = new Date('2026-09-03');
  const d = (daysAgo) => {
    const target = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return target.toISOString().split('T')[0];
  };

  const transactionsData = [
    // Income
    { accId: checkingAcc.id, name: 'Apex Technologies Direct Dep', merchant: 'Apex Technologies', amount: -4850.00, category: 'Income', sub: 'Salary', date: d(3) },
    { accId: checkingAcc.id, name: 'Apex Technologies Direct Dep', merchant: 'Apex Technologies', amount: -4850.00, category: 'Income', sub: 'Salary', date: d(17) },
    { accId: savingsAcc.id, name: 'Interest Payment - Marcus', merchant: 'Marcus', amount: -168.75, category: 'Income', sub: 'Interest', date: d(2) },

    // Living Expenses
    { accId: checkingAcc.id, name: 'Skyline Properties Rent', merchant: 'Skyline Properties', amount: 2400.00, category: 'Living Expenses', sub: 'Rent', date: d(2) },
    { accId: checkingAcc.id, name: 'Con Edison Electric & Gas', merchant: 'Con Edison', amount: 112.40, category: 'Living Expenses', sub: 'Utilities', date: d(12) },

    // Food & Lifestyle
    { accId: cardAcc.id, name: 'Whole Foods Market', merchant: 'Whole Foods', amount: 164.20, category: 'Food & Lifestyle', sub: 'Groceries', date: d(1) },
    { accId: cardAcc.id, name: 'Trader Joe\'s Store #541', merchant: 'Trader Joe\'s', amount: 84.50, category: 'Food & Lifestyle', sub: 'Groceries', date: d(6) },
    { accId: cardAcc.id, name: 'Nobu Restaurant NYC', merchant: 'Nobu', amount: 185.00, category: 'Food & Lifestyle', sub: 'Dining', date: d(5) },
    { accId: cardAcc.id, name: 'Blue Bottle Coffee', merchant: 'Blue Bottle Coffee', amount: 9.25, category: 'Food & Lifestyle', sub: 'Coffee', date: d(4) },
    { accId: cardAcc.id, name: 'Sweetgreen Salad', merchant: 'Sweetgreen', amount: 17.50, category: 'Food & Lifestyle', sub: 'Dining', date: d(8) },

    // Discretionary & Transport
    { accId: cardAcc.id, name: 'Uber Technologies', merchant: 'Uber', amount: 34.20, category: 'Discretionary', sub: 'Rideshare', date: d(3) },
    { accId: cardAcc.id, name: 'Apple.com Store Online', merchant: 'Apple', amount: 129.00, category: 'Discretionary', sub: 'Electronics', date: d(14) },
    { accId: cardAcc.id, name: 'Netflix Monthly Premium', merchant: 'Netflix', amount: 22.99, category: 'Discretionary', sub: 'Streaming', date: d(9) },
    { accId: cardAcc.id, name: 'Spotify Premium Subscription', merchant: 'Spotify', amount: 11.99, category: 'Discretionary', sub: 'Streaming', date: d(15) },
    { accId: cardAcc.id, name: 'Equinox Fitness Club', merchant: 'Equinox', amount: 280.00, category: 'Living Expenses', sub: 'Fitness', date: d(18) },

    // Financial & Investments
    { accId: checkingAcc.id, name: 'Vanguard Automatic Transfer', merchant: 'Vanguard', amount: 1000.00, category: 'Financial', sub: 'Investments', date: d(10) },
  ];

  for (let i = 0; i < transactionsData.length; i++) {
    const tx = transactionsData[i];
    await sql`
      INSERT INTO transactions (
        user_id, account_id, plaid_transaction_id, name, merchant_name,
        amount, iso_currency_code, date, category, sub_category, pending
      ) VALUES (
        ${userId}, ${tx.accId}, ${'tx_demo_' + i}, ${tx.name}, ${tx.merchant},
        ${tx.amount}, 'USD', ${tx.date}, ${tx.category}, ${tx.sub}, false
      );
    `;
  }

  console.log(`   ✓ Seeded ${transactionsData.length} categorized transactions spanning past 30 days`);

  console.log('\n========================================================');
  console.log('✅ COMPLETE: Demo user environment is populated & ready.');
  console.log('========================================================\n');

  await sql.end();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('\n❌ Failed to seed database:', err);
  await sql.end();
  process.exit(1);
});
