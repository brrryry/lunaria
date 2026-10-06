/**
 * Utility functions for identifying transfers and credit card payments.
 * In double-entry and personal accounting, credit card payments are transfers between accounts
 * (outflow from checking, inflow to credit card) rather than genuine external income or expenses.
 */

export function isTransferOrCreditCardPayment(tx: {
  category?: string | null;
  subCategory?: string | null;
  name?: string | null;
  merchantName?: string | null;
}): boolean {
  if (!tx) return false;

  const cat = (tx.category || '').toLowerCase();
  const sub = (tx.subCategory || '').toLowerCase();
  const name = (tx.name || '').toLowerCase();
  const merchant = (tx.merchantName || '').toLowerCase();

  // 1. Category heuristics
  if (
    cat === 'transfer' ||
    cat === 'payment' ||
    cat.includes('transfer') ||
    cat.includes('credit card') ||
    cat.includes('loan payment') ||
    sub.includes('transfer') ||
    sub.includes('credit card')
  ) {
    return true;
  }

  // 2. Transaction name & merchant name heuristics
  const transferKeywords = [
    'credit card payment',
    'payment thank you',
    'autopay',
    'online payment',
    'epayment',
    'card payment',
    'citi card online payment',
    'chase credit crd',
    'amex epayment',
    'discover e-payment',
    'capital one payment',
    'bank transfer',
    'account transfer',
    'funds transfer',
    'internal transfer',
    'wire transfer',
    'ach transfer',
    'bill pay',
  ];

  for (const kw of transferKeywords) {
    if (name.includes(kw) || merchant.includes(kw)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes income / inflow transactions into clean, human-friendly categories
 * based on Plaid taxonomy, subCategory, and merchant/description clues.
 */
export function resolveIncomeDisplayCategory(tx: {
  category?: string | null;
  subCategory?: string | null;
  name?: string | null;
  merchantName?: string | null;
}): { category: string; explanation?: string } {
  const cat = (tx.category || '').toLowerCase();
  const sub = (tx.subCategory || '').toLowerCase();
  const name = (tx.name || '').toLowerCase();
  const merchant = (tx.merchantName || '').toLowerCase();
  const text = `${cat} ${sub} ${name} ${merchant}`;

  // 1. Payroll / Salary
  if (
    /salary|payroll|direct\s*dep|wages|compensation|stipend|adp|gusto|paychex|workday|rippling|quickbooks\s*pay/i.test(
      text,
    ) ||
    cat === 'income_wages'
  ) {
    return {
      category: 'Salary & Wages',
      explanation: 'Paychecks, employer direct deposits, and wage earnings',
    };
  }

  // 2. Investments & Dividends
  if (
    /dividend|distribution|capital\s*gain|brokerage|fidelity|schwab|vanguard|robinhood|etrade|merrill|yield/i.test(
      text,
    ) ||
    cat === 'income_dividends'
  ) {
    return {
      category: 'Investments & Dividends',
      explanation: 'Stock dividends, fund distributions, and investment returns',
    };
  }

  // 3. Bank Interest
  if (
    /interest\s*(earned|paid|credit)?|apy|savings\s*interest/i.test(text) ||
    cat === 'income_interest_earned'
  ) {
    return {
      category: 'Interest & Yield',
      explanation: 'High-yield savings interest and bank earnings',
    };
  }

  // 4. Tax Refunds / Government
  if (
    /tax\s*ref|irs\s*treas|state\s*tax|social\s*security|unemployment|treasury|stimulus/i.test(
      text,
    ) ||
    cat === 'income_tax_refund' ||
    cat === 'income_unemployment' ||
    cat === 'income_retirement_pension'
  ) {
    return {
      category: 'Tax & Benefits',
      explanation: 'Federal/state tax refunds, benefits, and retirement pensions',
    };
  }

  // 5. Refunds & Reimbursements
  if (
    /refund|return|reimbursement|cashback|cash\s*back|rebate|expensify/i.test(
      text,
    )
  ) {
    return {
      category: 'Refunds & Returns',
      explanation: 'Merchant purchase refunds, cash back, and expense reimbursements',
    };
  }

  // 6. Peer Payments & Gifts
  if (/venmo|zelle|cash\s*app|paypal|gift|reimburse/i.test(text)) {
    return {
      category: 'P2P & Transfers',
      explanation: 'Incoming payments from friends, family, or P2P apps',
    };
  }

  // 7. General Deposits
  if (/deposit|mobile\s*dep|check\s*dep|counter\s*dep/i.test(text)) {
    return {
      category: 'Deposits & Checks',
      explanation: 'Check deposits and incoming teller deposits',
    };
  }

  // Fallback
  if (tx.category && tx.category.trim() && tx.category.toLowerCase() !== 'income') {
    const formatted = tx.category
      .split(/[_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    return {
      category: formatted,
      explanation: 'Categorized incoming transaction',
    };
  }

  return {
    category: 'Other Income',
    explanation: 'Miscellaneous deposits and inflow credits',
  };
}

