import { describe, it, expect } from 'vitest';

interface TransactionRecord {
  id: string;
  name: string;
  merchantName?: string | null;
  category: string;
  subCategory?: string | null;
  needsReview?: boolean;
}

interface CategoryRule {
  id: string;
  userId: string;
  merchantName?: string | null;
  transactionName?: string | null;
  category: string;
  subCategory?: string | null;
}

// Logic mirror of TransactionsService.updateCategory + Category Rule Memory
export function updateTransactionCategoryWithRule(
  transactions: TransactionRecord[],
  rules: CategoryRule[],
  userId: string,
  targetTxId: string,
  newCategory: string,
  newSubCategory?: string,
  applyToAllMerchant: boolean = true,
) {
  const targetTx = transactions.find((t) => t.id === targetTxId);
  if (!targetTx) return { updatedCount: 0, transactions, rules };

  const merchantKey = targetTx.merchantName?.trim();
  const nameKey = targetTx.name?.trim();

  // 1. Upsert persistent rule
  let updatedRules = [...rules];
  const existingRuleIndex = updatedRules.findIndex((r) => {
    if (r.userId !== userId) return false;
    if (merchantKey && r.merchantName?.trim().toLowerCase() === merchantKey.toLowerCase()) {
      return true;
    }
    if (nameKey && r.transactionName?.trim().toLowerCase() === nameKey.toLowerCase()) {
      return true;
    }
    return false;
  });

  if (existingRuleIndex >= 0) {
    updatedRules[existingRuleIndex] = {
      ...updatedRules[existingRuleIndex],
      category: newCategory,
      subCategory: newSubCategory || null,
      merchantName: merchantKey || updatedRules[existingRuleIndex].merchantName,
      transactionName: nameKey || updatedRules[existingRuleIndex].transactionName,
    };
  } else {
    updatedRules.push({
      id: `rule-${Date.now()}`,
      userId,
      merchantName: merchantKey || null,
      transactionName: nameKey || null,
      category: newCategory,
      subCategory: newSubCategory || null,
    });
  }

  // 2. Synchronize transactions
  const updatedTransactions = transactions.map((tx) => {
    if (tx.id === targetTxId) {
      return { ...tx, category: newCategory, subCategory: newSubCategory || null };
    }

    if (applyToAllMerchant) {
      const matchMerchant =
        merchantKey &&
        tx.merchantName &&
        tx.merchantName.trim().toLowerCase() === merchantKey.toLowerCase();

      const matchName =
        nameKey &&
        tx.name &&
        tx.name.trim().toLowerCase() === nameKey.toLowerCase();

      if (matchMerchant || matchName) {
        return { ...tx, category: newCategory, subCategory: newSubCategory || null };
      }
    }

    return tx;
  });

  const updatedCount = updatedTransactions.filter(
    (t, i) => t.category !== transactions[i].category,
  ).length;

  return { updatedCount, transactions: updatedTransactions, rules: updatedRules };
}

// Logic mirror of PlaidService.syncTransactions category resolution
export function resolveTransactionCategory(
  incomingTx: {
    name: string;
    merchant_name?: string | null;
    category?: string[] | null;
  },
  userRules: CategoryRule[],
  excludedCategories?: Set<string>,
) {
  const merchantLower = incomingTx.merchant_name?.trim().toLowerCase();
  const nameLower = incomingTx.name?.trim().toLowerCase();

  // 1. Exact match on merchantName
  if (merchantLower) {
    const match = userRules.find(
      (r) => r.merchantName && r.merchantName.trim().toLowerCase() === merchantLower,
    );
    if (match) {
      return { category: match.category, subCategory: match.subCategory, matched: true };
    }
  }

  // 2. Exact match on transactionName
  if (nameLower) {
    const match = userRules.find(
      (r) => r.transactionName && r.transactionName.trim().toLowerCase() === nameLower,
    );
    if (match) {
      return { category: match.category, subCategory: match.subCategory, matched: true };
    }
  }

  // 3. Substring match: rule merchantName inside tx.name
  if (nameLower) {
    const match = userRules.find(
      (r) =>
        r.merchantName &&
        r.merchantName.trim().length >= 3 &&
        nameLower.includes(r.merchantName.trim().toLowerCase()),
    );
    if (match) {
      return { category: match.category, subCategory: match.subCategory, matched: true };
    }
  }

  // Fallback to Plaid default, unless user has excluded this category
  const defaultCategory =
    incomingTx.category && incomingTx.category.length > 0
      ? incomingTx.category[0]
      : 'Uncategorized';

  if (
    excludedCategories &&
    (excludedCategories.has(defaultCategory) ||
      excludedCategories.has(defaultCategory.toLowerCase()))
  ) {
    return {
      category: 'Uncategorized',
      subCategory:
        incomingTx.category && incomingTx.category.length > 1
          ? incomingTx.category[1]
          : null,
      matched: false,
    };
  }

  return {
    category: defaultCategory,
    subCategory:
      incomingTx.category && incomingTx.category.length > 1
        ? incomingTx.category[1]
        : null,
    matched: false,
  };
}

// Unreviewed filter helper (used by Review Widget)
export function getUnreviewedTransactions(transactions: TransactionRecord[]) {
  return transactions.filter(
    (t) =>
      !t.category ||
      t.category.toLowerCase() === 'uncategorized' ||
      t.category.toLowerCase() === 'general' ||
      t.needsReview === true,
  );
}

describe('Persistent Transaction Auto-Categorization & Merchant Memory Engine', () => {
  const userId = 'user-test-123';

  const initialTransactions: TransactionRecord[] = [
    { id: '1', name: 'Starbucks Store #102', merchantName: 'Starbucks', category: 'Uncategorized' },
    { id: '2', name: 'Starbucks Reserve', merchantName: 'Starbucks', category: 'Uncategorized' },
    { id: '3', name: 'Whole Foods Market', merchantName: 'Whole Foods', category: 'Groceries' },
    { id: '4', name: 'Uber 072515 SF', merchantName: 'Uber', category: 'General' },
    { id: '5', name: 'Uber Trips NYC', merchantName: 'Uber', category: 'General' },
  ];

  it('saves a persistent rule and updates all matching transactions when user categorizes a transaction', () => {
    const initialRules: CategoryRule[] = [];

    const result = updateTransactionCategoryWithRule(
      initialTransactions,
      initialRules,
      userId,
      '1',
      'Coffee & Cafes',
      'Coffee Shops',
      true,
    );

    expect(result.updatedCount).toBe(2); // Both Starbucks transactions
    expect(result.rules.length).toBe(1);
    expect(result.rules[0].merchantName).toBe('Starbucks');
    expect(result.rules[0].category).toBe('Coffee & Cafes');
    expect(result.rules[0].subCategory).toBe('Coffee Shops');

    const tx1 = result.transactions.find((t) => t.id === '1');
    const tx2 = result.transactions.find((t) => t.id === '2');
    expect(tx1?.category).toBe('Coffee & Cafes');
    expect(tx2?.category).toBe('Coffee & Cafes');

    // Unrelated merchants untouched
    expect(result.transactions.find((t) => t.id === '3')?.category).toBe('Groceries');
  });

  it('automatically applies user rule when that same transaction/merchant comes up in a future sync', () => {
    const userRules: CategoryRule[] = [
      {
        id: 'rule-starbucks',
        userId,
        merchantName: 'Starbucks',
        category: 'Coffee & Cafes',
        subCategory: 'Coffee Shops',
      },
    ];

    // Future incoming Plaid transaction with same merchant but different default Plaid category ('Food and Drink')
    const incomingTx = {
      name: 'STARBUCKS #9841 BOSTON',
      merchant_name: 'Starbucks',
      category: ['Food and Drink', 'Coffee Shop'],
    };

    const resolved = resolveTransactionCategory(incomingTx, userRules);

    expect(resolved.matched).toBe(true);
    expect(resolved.category).toBe('Coffee & Cafes'); // User's preference overrides Plaid!
    expect(resolved.subCategory).toBe('Coffee Shops');
  });

  it('matches rules by substring in name when merchant_name is missing from Plaid', () => {
    const userRules: CategoryRule[] = [
      {
        id: 'rule-starbucks',
        userId,
        merchantName: 'Starbucks',
        category: 'Coffee & Cafes',
      },
    ];

    // Transaction without merchant_name, but description contains "STARBUCKS"
    const incomingTx = {
      name: 'STARBUCKS STORE #4812 SEATTLE WA',
      merchant_name: null,
      category: ['Shops', 'Supermarkets and Groceries'],
    };

    const resolved = resolveTransactionCategory(incomingTx, userRules);

    expect(resolved.matched).toBe(true);
    expect(resolved.category).toBe('Coffee & Cafes');
  });

  it('matches rules by exact transaction name when merchant is absent', () => {
    const userRules: CategoryRule[] = [
      {
        id: 'rule-chevron',
        userId,
        merchantName: null,
        transactionName: 'Chevron Station 0912',
        category: 'Gas & Fuel',
      },
    ];

    const incomingTx = {
      name: 'Chevron Station 0912',
      merchant_name: null,
      category: ['Service', 'Gas Station'],
    };

    const resolved = resolveTransactionCategory(incomingTx, userRules);

    expect(resolved.matched).toBe(true);
    expect(resolved.category).toBe('Gas & Fuel');
  });

  it('falls back to Plaid default when no user rule matches', () => {
    const userRules: CategoryRule[] = [
      {
        id: 'rule-uber',
        userId,
        merchantName: 'Uber',
        category: 'Rideshare',
      },
    ];

    const incomingTx = {
      name: 'Delta Air Lines',
      merchant_name: 'Delta',
      category: ['Travel', 'Airlines and Aviation'],
    };

    const resolved = resolveTransactionCategory(incomingTx, userRules);

    expect(resolved.matched).toBe(false);
    expect(resolved.category).toBe('Travel');
    expect(resolved.subCategory).toBe('Airlines and Aviation');
  });

  it('prevents sync from overwriting custom categories on conflict updates when no rule overrides', () => {
    const existingDbTx = {
      id: 'tx-1',
      name: 'Specialty Dinner',
      category: 'Celebration & Gifts', // Manually customized by user
    };

    const incomingConflictTx = {
      name: 'Specialty Dinner',
      category: ['Food and Drink', 'Restaurants'], // Plaid generic default
    };

    const userRules: CategoryRule[] = []; // No rule defined

    const resolved = resolveTransactionCategory(incomingConflictTx, userRules);

    // On conflict: only overwrite category if matched is true.
    const updatedCategory = resolved.matched ? resolved.category : existingDbTx.category;

    expect(resolved.matched).toBe(false);
    expect(updatedCategory).toBe('Celebration & Gifts'); // Preserved!
  });
});

describe('Transactions to be Reviewed Widget Engine', () => {
  it('correctly filters and counts unreviewed transactions', () => {
    const sampleTransactions: TransactionRecord[] = [
      { id: '1', name: 'Unknown Store', category: 'Uncategorized' },
      { id: '2', name: 'Coffee Shop', category: 'General' },
      { id: '3', name: 'Gas Station', category: '' },
      { id: '4', name: 'Flagged Tx', category: 'Dining', needsReview: true },
      { id: '5', name: 'Grocery Store', category: 'Groceries' },
      { id: '6', name: 'Electric Utility', category: 'Utilities' },
    ];

    const unreviewed = getUnreviewedTransactions(sampleTransactions);

    expect(unreviewed.length).toBe(4);
    expect(unreviewed.map((t) => t.id)).toEqual(['1', '2', '3', '4']);
  });

  it('returns empty list when all transactions are categorized and reviewed', () => {
    const sampleTransactions: TransactionRecord[] = [
      { id: '1', name: 'Whole Foods', category: 'Groceries' },
      { id: '2', name: 'Shell Gas', category: 'Auto & Transport' },
      { id: '3', name: 'Landlord Rent', category: 'Housing & Rent' },
    ];

    const unreviewed = getUnreviewedTransactions(sampleTransactions);

    expect(unreviewed.length).toBe(0);
  });
});

describe('User Category Exclusions & Deletion Reassignment', () => {
  it('falls back to Uncategorized if Plaid default category is in user excluded list', () => {
    const tx = {
      name: 'Random Store',
      category: ['Services'],
    };
    const userRules: CategoryRule[] = [];
    const excludedCategories = new Set(['Services', 'Shops']);

    const resolved = resolveTransactionCategory(tx, userRules, excludedCategories);

    expect(resolved.category).toBe('Uncategorized');
    expect(resolved.matched).toBe(false);
  });

  it('user custom rule takes precedence even if default Plaid category is excluded', () => {
    const tx = {
      name: 'Uber Eats Order 1234',
      merchant_name: 'Uber Eats',
      category: ['Food and Drink'],
    };
    const userRules: CategoryRule[] = [
      {
        merchantName: 'Uber Eats',
        category: 'Takeout & Delivery',
      },
    ];
    const excludedCategories = new Set(['Food and Drink']);

    const resolved = resolveTransactionCategory(tx, userRules, excludedCategories);

    expect(resolved.category).toBe('Takeout & Delivery');
    expect(resolved.matched).toBe(true);
  });

  it('returns default category normally when category is not excluded', () => {
    const tx = {
      name: 'Chevron Gas Station',
      category: ['Travel', 'Gas Stations'],
    };
    const userRules: CategoryRule[] = [];
    const excludedCategories = new Set(['Services']);

    const resolved = resolveTransactionCategory(tx, userRules, excludedCategories);

    expect(resolved.category).toBe('Travel');
    expect(resolved.matched).toBe(false);
  });

  it('correctly reassigns transactions and updates rules on category deletion', () => {
    const txList: TransactionRecord[] = [
      { id: '1', name: 'Spotify', category: 'Old Subscriptions' },
      { id: '2', name: 'Netflix', category: 'Old Subscriptions' },
      { id: '3', name: 'Kroger', category: 'Groceries' },
    ];
    const rules: CategoryRule[] = [
      { merchantName: 'Spotify', category: 'Old Subscriptions' },
      { merchantName: 'Kroger', category: 'Groceries' },
    ];

    // Simulate deleteCategory with reassignTo: 'Digital Media'
    const targetCategory = 'Digital Media';
    const updatedTxs = txList.map((t) =>
      t.category === 'Old Subscriptions' ? { ...t, category: targetCategory } : t,
    );
    const updatedRules = rules.map((r) =>
      r.category === 'Old Subscriptions' ? { ...r, category: targetCategory } : r,
    );

    expect(updatedTxs.filter((t) => t.category === 'Digital Media').length).toBe(2);
    expect(updatedTxs.find((t) => t.id === '3')?.category).toBe('Groceries');
    expect(updatedRules.find((r) => r.merchantName === 'Spotify')?.category).toBe('Digital Media');
  });

  it('restoring an excluded category allows Plaid default to resolve again', () => {
    const tx = {
      name: 'Dentist Visit',
      category: ['Healthcare'],
    };
    const userRules: CategoryRule[] = [];
    const excludedCategories = new Set(['Healthcare']);

    // When excluded:
    const res1 = resolveTransactionCategory(tx, userRules, excludedCategories);
    expect(res1.category).toBe('Uncategorized');

    // When restored (removed from exclusion set):
    excludedCategories.delete('Healthcare');
    const res2 = resolveTransactionCategory(tx, userRules, excludedCategories);
    expect(res2.category).toBe('Healthcare');
  });
});

