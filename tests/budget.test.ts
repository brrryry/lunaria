import { describe, it, expect } from 'vitest';

export interface CategoryBudgetTestItem {
  category: string;
  type: 'income' | 'expense';
  budgeted: number;
  actual: number;
}

export function calculateLeftToBudget(
  incomeCategories: CategoryBudgetTestItem[],
  expenseCategories: CategoryBudgetTestItem[],
) {
  const totalBudgetedIncome = incomeCategories.reduce(
    (sum, c) => sum + c.budgeted,
    0,
  );
  const totalBudgetedExpenses = expenseCategories.reduce(
    (sum, c) => sum + c.budgeted,
    0,
  );
  return {
    totalBudgetedIncome: Math.round(totalBudgetedIncome * 100) / 100,
    totalBudgetedExpenses: Math.round(totalBudgetedExpenses * 100) / 100,
    leftToBudget:
      Math.round((totalBudgetedIncome - totalBudgetedExpenses) * 100) / 100,
  };
}

export function calculateCategoryMetrics(item: CategoryBudgetTestItem) {
  if (item.type === 'expense') {
    const remaining = item.budgeted - item.actual;
    const percentSpent =
      item.budgeted > 0 ? Math.round((item.actual / item.budgeted) * 100) : 0;
    const isOver = remaining < 0;
    const isNearLimit = !isOver && percentSpent >= 80;

    let status = 'On Track';
    if (isOver) status = 'Over Budget';
    else if (isNearLimit) status = 'Near Limit';
    else if (item.budgeted === 0) status = 'Unbudgeted';

    return {
      remaining: Math.round(remaining * 100) / 100,
      percentSpent,
      status,
      isOver,
    };
  } else {
    // Income
    const difference = item.actual - item.budgeted;
    const isMet = item.actual >= item.budgeted && item.budgeted > 0;

    return {
      difference: Math.round(difference * 100) / 100,
      isMet,
      status: isMet ? 'Target Met' : item.actual > 0 ? 'In Progress' : 'Pending',
    };
  }
}

export function getMonthDateRange(month: string) {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);

  const startDate = `${month}-01`;
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  return { startDate, endDate };
}

export function getPreviousMonth(month: string): string {
  const [yearStr, monthStr] = month.split('-');
  let year = parseInt(yearStr, 10);
  let m = parseInt(monthStr, 10) - 1;
  if (m === 0) {
    m = 12;
    year -= 1;
  }
  return `${year}-${String(m).padStart(2, '0')}`;
}

export function getNextMonths(month: string, count: number = 24): string[] {

  const result: string[] = [];
  const [yearStr, monthStr] = month.split('-');
  let year = parseInt(yearStr, 10);
  let m = parseInt(monthStr, 10);

  for (let i = 0; i < count; i++) {
    m += 1;
    if (m > 12) {
      m = 1;
      year += 1;
    }
    result.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return result;
}

describe('Monthly Category Budgeting Engine', () => {

  describe('Zero-Based Budget Allocation ("Left to Budget")', () => {
    it('accurately calculates unallocated dollars when income exceeds expenses', () => {
      const income: CategoryBudgetTestItem[] = [
        { category: 'Salary', type: 'income', budgeted: 6000, actual: 6000 },
        { category: 'Freelance', type: 'income', budgeted: 1500, actual: 1200 },
      ];
      const expenses: CategoryBudgetTestItem[] = [
        { category: 'Living Expenses', type: 'expense', budgeted: 2500, actual: 2400 },
        { category: 'Food & Lifestyle', type: 'expense', budgeted: 800, actual: 650 },
        { category: 'Discretionary', type: 'expense', budgeted: 500, actual: 400 },
      ];

      const res = calculateLeftToBudget(income, expenses);
      expect(res.totalBudgetedIncome).toBe(7500);
      expect(res.totalBudgetedExpenses).toBe(3800);
      expect(res.leftToBudget).toBe(3700); // 7500 - 3800
    });

    it('identifies perfect zero-based budget when every dollar is assigned', () => {
      const income: CategoryBudgetTestItem[] = [
        { category: 'Salary', type: 'income', budgeted: 5000, actual: 5000 },
      ];
      const expenses: CategoryBudgetTestItem[] = [
        { category: 'Rent', type: 'expense', budgeted: 2500, actual: 2500 },
        { category: 'Groceries', type: 'expense', budgeted: 800, actual: 750 },
        { category: 'Investments', type: 'expense', budgeted: 1700, actual: 1700 },
      ];

      const res = calculateLeftToBudget(income, expenses);
      expect(res.leftToBudget).toBe(0);
    });

    it('detects overallocated budgets when planned expenses exceed expected income', () => {
      const income: CategoryBudgetTestItem[] = [
        { category: 'Salary', type: 'income', budgeted: 4000, actual: 4000 },
      ];
      const expenses: CategoryBudgetTestItem[] = [
        { category: 'Rent', type: 'expense', budgeted: 2500, actual: 2500 },
        { category: 'Travel', type: 'expense', budgeted: 2000, actual: 1800 },
      ];

      const res = calculateLeftToBudget(income, expenses);
      expect(res.leftToBudget).toBe(-500);
    });
  });

  describe('Expense Categories (Budgeted vs Actual vs Remaining)', () => {
    it('calculates positive remaining balance and On Track status when under budget', () => {
      const item: CategoryBudgetTestItem = {
        category: 'Food & Lifestyle',
        type: 'expense',
        budgeted: 800,
        actual: 400,
      };
      const metrics = calculateCategoryMetrics(item);
      expect(metrics.remaining).toBe(400); // $400 left to spend
      expect(metrics.percentSpent).toBe(50);
      expect(metrics.status).toBe('On Track');
      expect(metrics.isOver).toBe(false);
    });

    it('flags Near Limit status when spending hits or exceeds 80% of budget', () => {
      const item: CategoryBudgetTestItem = {
        category: 'Discretionary',
        type: 'expense',
        budgeted: 500,
        actual: 430,
      };
      const metrics = calculateCategoryMetrics(item);
      expect(metrics.remaining).toBe(70);
      expect(metrics.percentSpent).toBe(86);
      expect(metrics.status).toBe('Near Limit');
      expect(metrics.isOver).toBe(false);
    });

    it('detects Over Budget status with negative remaining balance when actual exceeds budget', () => {
      const item: CategoryBudgetTestItem = {
        category: 'Dining Out',
        type: 'expense',
        budgeted: 300,
        actual: 420,
      };
      const metrics = calculateCategoryMetrics(item);
      expect(metrics.remaining).toBe(-120);
      expect(metrics.percentSpent).toBe(140);
      expect(metrics.status).toBe('Over Budget');
      expect(metrics.isOver).toBe(true);
    });
  });

  describe('Month Calendar Range & Previous Month Navigation', () => {
    it('determines accurate start and end dates for 30-day, 31-day, and leap-year months', () => {
      expect(getMonthDateRange('2026-09')).toEqual({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });
      expect(getMonthDateRange('2026-08')).toEqual({
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      });
      // Leap year February (2024 has 29 days)
      expect(getMonthDateRange('2024-02')).toEqual({
        startDate: '2024-02-01',
        endDate: '2024-02-29',
      });
    });

    it('correctly calculates previous month across regular and year-boundary months', () => {
      expect(getPreviousMonth('2026-09')).toBe('2026-08');
      expect(getPreviousMonth('2026-01')).toBe('2025-12');
    });
  });

  describe('Non-Expense Cash Flow Filtering (Transfers & Card Payments Exclusion)', () => {
    interface Tx {
      amount: number;
      category: string;
    }

    function aggregateConsumerSpending(transactions: Tx[], excludeTransfers: boolean = true) {
      const map = new Map<string, number>();
      let excludedTotal = 0;

      for (const tx of transactions) {
        if (tx.amount > 0) {
          const cat = tx.category || 'General';
          const catLower = cat.toLowerCase();
          const isTransferOrPayment = catLower === 'transfer' || catLower === 'payment';

          if (isTransferOrPayment) {
            excludedTotal += tx.amount;
          }

          if (!excludeTransfers || !isTransferOrPayment) {
            map.set(cat, (map.get(cat) || 0) + tx.amount);
          }
        }
      }

      const totalSpent = Array.from(map.values()).reduce((sum, v) => sum + v, 0);
      return { totalSpent: Math.round(totalSpent * 100) / 100, excludedTotal: Math.round(excludedTotal * 100) / 100, map };
    }

    it('excludes Payment (credit card bills) and Transfer (inter-account) by default to prevent double counting', () => {
      const sampleTxs: Tx[] = [
        { amount: 3718.14, category: 'Payment' },
        { amount: 1597.13, category: 'Service' },
        { amount: 1412.17, category: 'Transfer' },
        { amount: 547.31, category: 'Food and Drink' },
        { amount: 450.08, category: 'Travel' },
        { amount: 226.71, category: 'Recreation' },
        { amount: 192.58, category: 'Shops' },
      ];

      // Exclude transfers (default)
      const clean = aggregateConsumerSpending(sampleTxs, true);
      expect(clean.totalSpent).toBe(3013.81); // Exactly the true lifestyle spending!
      expect(clean.excludedTotal).toBe(5130.31); // Payment + Transfer
      expect(clean.map.has('Payment')).toBe(false);
      expect(clean.map.has('Transfer')).toBe(false);

      // Raw cash outflows (when toggle is off)
      const raw = aggregateConsumerSpending(sampleTxs, false);
      expect(raw.totalSpent).toBe(8144.12);
      expect(raw.map.has('Payment')).toBe(true);
      expect(raw.map.has('Transfer')).toBe(true);
    });
  });

  describe('Future Budget Sheets Adjustment & Carry-Forward Engine', () => {
    it('correctly generates consecutive future months for future sheets propagation', () => {
      const future = getNextMonths('2026-09', 4);
      expect(future).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);

      const full24 = getNextMonths('2026-09', 24);
      expect(full24.length).toBe(24);
      expect(full24[0]).toBe('2026-10');
      expect(full24[23]).toBe('2028-09');
    });

    it('propagates added category across future months maintaining budgeted targets', () => {
      interface BudgetRecord {
        month: string;
        category: string;
        type: 'income' | 'expense';
        budgetedAmount: number;
      }

      const db: BudgetRecord[] = [
        { month: '2026-09', category: 'Living Expenses', type: 'expense', budgetedAmount: 2500 },
        { month: '2026-10', category: 'Living Expenses', type: 'expense', budgetedAmount: 2500 },
      ];

      function simulateAddCategory(
        month: string,
        category: string,
        type: 'income' | 'expense',
        budgetedAmount: number,
        adjustFuture: boolean = true,
      ) {
        // 1. Insert into current month
        db.push({ month, category, type, budgetedAmount });

        // 2. Adjust future sheets if enabled
        if (adjustFuture) {
          const futureMonths = getNextMonths(month, 3);
          for (const fm of futureMonths) {
            const existing = db.find(
              (r) => r.month === fm && r.category === category && r.type === type,
            );
            if (!existing) {
              db.push({ month: fm, category, type, budgetedAmount });
            } else {
              existing.budgetedAmount = budgetedAmount;
            }
          }
        }
      }

      // Add "Gym" in 2026-09 with adjustFuture: true
      simulateAddCategory('2026-09', 'Gym', 'expense', 120, true);

      // Verify "Gym" was created in 2026-09
      expect(db.find((r) => r.month === '2026-09' && r.category === 'Gym')?.budgetedAmount).toBe(120);

      // Verify future sheets (2026-10, 2026-11, 2026-12) automatically have "Gym" with $120
      expect(db.find((r) => r.month === '2026-10' && r.category === 'Gym')?.budgetedAmount).toBe(120);
      expect(db.find((r) => r.month === '2026-11' && r.category === 'Gym')?.budgetedAmount).toBe(120);
      expect(db.find((r) => r.month === '2026-12' && r.category === 'Gym')?.budgetedAmount).toBe(120);
    });

    it('carries forward prior user categories into future months when activeMonth has no explicit record', () => {
      interface BudgetRecord {
        month: string;
        category: string;
        type: 'income' | 'expense';
        budgetedAmount: number;
      }

      const userBudgets: BudgetRecord[] = [
        { month: '2026-09', category: 'Car Insurance', type: 'expense', budgetedAmount: 180 },
        { month: '2026-09', category: 'Salary', type: 'income', budgetedAmount: 5500 },
      ];

      function resolveCategoriesForMonth(activeMonth: string, records: BudgetRecord[]) {
        const savedForMonth = records.filter((r) => r.month === activeMonth);
        const priorRecords = records
          .filter((r) => r.month <= activeMonth)
          .sort((a, b) => b.month.localeCompare(a.month));

        const budgetMap = new Map<string, number>();
        for (const s of savedForMonth) {
          budgetMap.set(`${s.type}:${s.category.toLowerCase()}`, s.budgetedAmount);
        }

        // Inherit from prior months if missing
        for (const p of priorRecords) {
          const key = `${p.type}:${p.category.toLowerCase()}`;
          if (!budgetMap.has(key)) {
            budgetMap.set(key, p.budgetedAmount);
          }
        }

        return budgetMap;
      }

      // Querying future month 2027-03 that has no direct records
      const resolvedMap = resolveCategoriesForMonth('2027-03', userBudgets);

      expect(resolvedMap.has('expense:car insurance')).toBe(true);
      expect(resolvedMap.get('expense:car insurance')).toBe(180);
      expect(resolvedMap.has('income:salary')).toBe(true);
      expect(resolvedMap.get('income:salary')).toBe(5500);
    });
  });
});

