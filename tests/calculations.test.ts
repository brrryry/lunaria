import { describe, it, expect } from 'vitest';

interface MockAccount {
  id: string;
  name: string;
  type: 'depository' | 'credit' | 'investment' | 'loan';
  currentBalance: number;
  isHidden: boolean;
}

interface MockTransaction {
  id: string;
  name: string;
  amount: number; // Plaid convention: positive = expense, negative = income
  category?: string;
  date: string;
}

// Logic mirror of NetWorthWidget / mobile calculations
export function calculateNetWorth(accounts: MockAccount[]) {
  const tracked = accounts.filter((a) => !a.isHidden);

  const cash = tracked
    .filter((a) => a.type === 'depository')
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

  const investments = tracked
    .filter((a) => a.type === 'investment')
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

  const liabilities = tracked
    .filter((a) => a.type === 'credit' || a.type === 'loan')
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

  return {
    cash,
    investments,
    liabilities,
    netWorth: cash + investments - liabilities,
    trackedCount: tracked.length,
    hiddenCount: accounts.length - tracked.length,
  };
}

// Logic mirror of CashFlowWidget / mobile calculations
export function calculateCashFlow(transactions: MockTransaction[]) {
  let income = 0;
  let expenses = 0;

  for (const tx of transactions) {
    const amt = Number(tx.amount) || 0;
    if (amt < 0) {
      income += Math.abs(amt);
    } else {
      expenses += amt;
    }
  }

  const netSavings = income - expenses;
  const savingsRate = income > 0 ? Math.round((netSavings / income) * 100) : 0;

  return {
    income: Math.round(income * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    netSavings: Math.round(netSavings * 100) / 100,
    savingsRate,
  };
}

// Logic mirror of SpendingBreakdownWidget
export function calculateSpendingBreakdown(transactions: MockTransaction[]) {
  const categories: Record<string, number> = {};
  let totalSpending = 0;

  for (const tx of transactions) {
    const amt = Number(tx.amount) || 0;
    if (amt > 0) {
      const cat = tx.category || 'Uncategorized';
      categories[cat] = (categories[cat] || 0) + amt;
      totalSpending += amt;
    }
  }

  const breakdown = Object.entries(categories).map(([category, amount]) => ({
    category,
    amount: Math.round(amount * 100) / 100,
    percentage:
      totalSpending > 0 ? Math.round((amount / totalSpending) * 100) : 0,
  }));

  return {
    totalSpending: Math.round(totalSpending * 100) / 100,
    breakdown: breakdown.sort((a, b) => b.amount - a.amount),
  };
}

describe('Financial Math Engine', () => {
  describe('Net Worth Calculation', () => {
    it('returns 0 when accounts array is empty', () => {
      const res = calculateNetWorth([]);
      expect(res.netWorth).toBe(0);
      expect(res.trackedCount).toBe(0);
      expect(res.hiddenCount).toBe(0);
    });

    it('correctly calculates assets minus liabilities', () => {
      const accounts: MockAccount[] = [
        { id: '1', name: 'Checking', type: 'depository', currentBalance: 5000, isHidden: false },
        { id: '2', name: 'Savings', type: 'depository', currentBalance: 20000, isHidden: false },
        { id: '3', name: 'Brokerage', type: 'investment', currentBalance: 75000, isHidden: false },
        { id: '4', name: 'Credit Card', type: 'credit', currentBalance: 3500, isHidden: false },
      ];

      const res = calculateNetWorth(accounts);
      expect(res.cash).toBe(25000);
      expect(res.investments).toBe(75000);
      expect(res.liabilities).toBe(3500);
      expect(res.netWorth).toBe(96500); // 25000 + 75000 - 3500
      expect(res.trackedCount).toBe(4);
      expect(res.hiddenCount).toBe(0);
    });

    it('strictly excludes accounts marked as isHidden: true', () => {
      const accounts: MockAccount[] = [
        { id: '1', name: 'Checking', type: 'depository', currentBalance: 5000, isHidden: false },
        { id: '2', name: 'Child Savings', type: 'depository', currentBalance: 15000, isHidden: true },
        { id: '3', name: 'Brokerage', type: 'investment', currentBalance: 50000, isHidden: false },
        { id: '4', name: 'Business Card', type: 'credit', currentBalance: 12000, isHidden: true },
      ];

      const res = calculateNetWorth(accounts);
      expect(res.cash).toBe(5000); // Excluded child savings
      expect(res.investments).toBe(50000);
      expect(res.liabilities).toBe(0); // Excluded business card
      expect(res.netWorth).toBe(55000);
      expect(res.trackedCount).toBe(2);
      expect(res.hiddenCount).toBe(2);
    });
  });

  describe('Cash Flow Calculation', () => {
    it('correctly separates negative amounts as income and positive amounts as expenses', () => {
      const txs: MockTransaction[] = [
        { id: '1', name: 'Paycheck', amount: -4500, date: '2026-08-15' },
        { id: '2', name: 'Bonus', amount: -1200, date: '2026-08-20' },
        { id: '3', name: 'Rent', amount: 2000, date: '2026-08-01' },
        { id: '4', name: 'Groceries', amount: 350, date: '2026-08-05' },
        { id: '5', name: 'Utilities', amount: 150, date: '2026-08-10' },
      ];

      const res = calculateCashFlow(txs);
      expect(res.income).toBe(5700); // 4500 + 1200
      expect(res.expenses).toBe(2500); // 2000 + 350 + 150
      expect(res.netSavings).toBe(3200);
      expect(res.savingsRate).toBe(56); // 3200 / 5700 = 56.14% -> 56%
    });

    it('handles negative cash flow gracefully', () => {
      const txs: MockTransaction[] = [
        { id: '1', name: 'Freelance', amount: -500, date: '2026-08-01' },
        { id: '2', name: 'Emergency Repair', amount: 1500, date: '2026-08-05' },
      ];

      const res = calculateCashFlow(txs);
      expect(res.income).toBe(500);
      expect(res.expenses).toBe(1500);
      expect(res.netSavings).toBe(-1000);
      expect(res.savingsRate).toBe(-200);
    });
  });

  describe('Spending Breakdown', () => {
    it('groups expenses by category and computes proportional percentages', () => {
      const txs: MockTransaction[] = [
        { id: '1', name: 'Whole Foods', amount: 300, category: 'Groceries', date: '2026-08-01' },
        { id: '2', name: 'Trader Joes', amount: 100, category: 'Groceries', date: '2026-08-05' },
        { id: '3', name: 'Uber', amount: 100, category: 'Transport', date: '2026-08-10' },
        { id: '4', name: 'Netflix', amount: 50, category: 'Entertainment', date: '2026-08-12' },
        { id: '5', name: 'Refund', amount: -50, category: 'Entertainment', date: '2026-08-15' }, // income, should not be in spending
      ];

      const res = calculateSpendingBreakdown(txs);
      expect(res.totalSpending).toBe(550); // 400 + 100 + 50
      expect(res.breakdown[0]).toEqual({
        category: 'Groceries',
        amount: 400,
        percentage: 73, // 400 / 550 = 72.7% -> 73%
      });
      expect(res.breakdown[1]).toEqual({
        category: 'Transport',
        amount: 100,
        percentage: 18, // 100 / 550 = 18.1% -> 18%
      });
      expect(res.breakdown[2]).toEqual({
        category: 'Entertainment',
        amount: 50,
        percentage: 9, // 50 / 550 = 9.09% -> 9%
      });
    });
  });

  describe('Portfolio Historical Recalculation on Account Removal', () => {
    interface AccountSnapshot {
      accountId: string;
      date: string;
      balance: number;
    }

    function aggregatePortfolioHistory(
      snapshots: AccountSnapshot[],
      activeAccounts: { id: string; isHidden: boolean }[],
    ) {
      const activeIds = new Set(
        activeAccounts.filter((a) => !a.isHidden).map((a) => a.id),
      );

      const byDate: Record<string, number> = {};
      for (const s of snapshots) {
        if (activeIds.has(s.accountId)) {
          byDate[s.date] = (byDate[s.date] || 0) + s.balance;
        }
      }

      return Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, total]) => ({ date, total }));
    }

    function generateStraightLineSvg(
      points: { date: string; total: number }[],
      width = 800,
      height = 180,
      padding = 15,
    ) {
      if (points.length < 2) return null;
      const values = points.map((p) => p.total);
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const range = maxVal - minVal || 1;

      const coords = points.map((p, i) => {
        const x = (i / (points.length - 1)) * (width - padding * 2) + padding;
        const y = height - padding - ((p.total - minVal) / range) * (height - padding * 2);
        return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
      });

      const linePath = coords
        .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`)
        .join(' ');

      return { linePath, coords };
    }

    it('recalculates historical curve cleanly when an account is removed without cliff drops', () => {
      // 2 accounts over 3 dates
      const snapshots: AccountSnapshot[] = [
        // Account A: steady growth 10,000 -> 10,500 -> 11,000
        { accountId: 'acc-A', date: '2026-08-01', balance: 10000 },
        { accountId: 'acc-A', date: '2026-08-15', balance: 10500 },
        { accountId: 'acc-A', date: '2026-09-01', balance: 11000 },
        // Account B: 50,000 -> 52,000 -> 55,000
        { accountId: 'acc-B', date: '2026-08-01', balance: 50000 },
        { accountId: 'acc-B', date: '2026-08-15', balance: 52000 },
        { accountId: 'acc-B', date: '2026-09-01', balance: 55000 },
      ];

      const initialAccounts = [
        { id: 'acc-A', isHidden: false },
        { id: 'acc-B', isHidden: false },
      ];

      const combinedHistory = aggregatePortfolioHistory(snapshots, initialAccounts);
      expect(combinedHistory).toEqual([
        { date: '2026-08-01', total: 60000 },
        { date: '2026-08-15', total: 62500 },
        { date: '2026-09-01', total: 66000 },
      ]);

      // When Account B is removed / hidden, history recalculates strictly for Account A
      const accountsAfterRemovingB = [
        { id: 'acc-A', isHidden: false },
        { id: 'acc-B', isHidden: true },
      ];

      const recalculatedHistory = aggregatePortfolioHistory(
        snapshots,
        accountsAfterRemovingB,
      );

      // The historical series retroactively reflects ONLY account A as if account B never existed
      expect(recalculatedHistory).toEqual([
        { date: '2026-08-01', total: 10000 },
        { date: '2026-08-15', total: 10500 },
        { date: '2026-09-01', total: 11000 },
      ]);

      // Growth rate is accurate to Account A (10% gain) instead of an artificial -83% cliff drop
      const startVal = recalculatedHistory[0].total;
      const endVal = recalculatedHistory[recalculatedHistory.length - 1].total;
      const percentChange = ((endVal - startVal) / startVal) * 100;
      expect(percentChange).toBe(10);
    });

    it('retroactively backfills and recalculates historical curve when adding a new account without vertical spikes', () => {
      // Initially, user only has Account A (10,000 -> 10,500 -> 11,000)
      const existingSnapshots: AccountSnapshot[] = [
        { accountId: 'acc-A', date: '2026-08-01', balance: 10000 },
        { accountId: 'acc-A', date: '2026-08-15', balance: 10500 },
        { accountId: 'acc-A', date: '2026-09-01', balance: 11000 },
      ];

      const initialAccounts = [{ id: 'acc-A', isHidden: false }];
      const initialHistory = aggregatePortfolioHistory(existingSnapshots, initialAccounts);
      expect(initialHistory).toEqual([
        { date: '2026-08-01', total: 10000 },
        { date: '2026-08-15', total: 10500 },
        { date: '2026-09-01', total: 11000 },
      ]);

      // User links Account B today (current balance 55,000)
      // The system backfills history retroactively for Account B across all historical dates
      const backfilledSnapshotsForB: AccountSnapshot[] = [
        { accountId: 'acc-B', date: '2026-08-01', balance: 50000 },
        { accountId: 'acc-B', date: '2026-08-15', balance: 52000 },
        { accountId: 'acc-B', date: '2026-09-01', balance: 55000 },
      ];

      const allSnapshots = [...existingSnapshots, ...backfilledSnapshotsForB];
      const updatedAccounts = [
        { id: 'acc-A', isHidden: false },
        { id: 'acc-B', isHidden: false },
      ];

      const newHistory = aggregatePortfolioHistory(allSnapshots, updatedAccounts);

      // The graph is retroactively updated across ALL past dates
      expect(newHistory).toEqual([
        { date: '2026-08-01', total: 60000 },
        { date: '2026-08-15', total: 62500 },
        { date: '2026-09-01', total: 66000 },
      ]);

      // No sudden vertical spike on the addition date:
      // Day 1 to Day 2 growth is (+4.1%), Day 2 to Day 3 growth is (+5.6%)
      const day1ToDay2Growth =
        ((newHistory[1].total - newHistory[0].total) / newHistory[0].total) * 100;
      expect(Math.round(day1ToDay2Growth * 10) / 10).toBe(4.2);

      const totalReturn =
        ((newHistory[2].total - newHistory[0].total) / newHistory[0].total) * 100;
      expect(totalReturn).toBe(10);
    });

    it('generates authentic straight-line (M / L) polyline paths without Bézier curves', () => {
      const history = [
        { date: '2026-08-01', total: 10000 },
        { date: '2026-08-15', total: 10500 },
        { date: '2026-09-01', total: 11000 },
      ];

      const svg = generateStraightLineSvg(history);
      expect(svg).not.toBeNull();
      expect(svg!.linePath.startsWith('M ')).toBe(true);
      expect(svg!.linePath).toContain('L ');
      expect(svg!.linePath).not.toContain('C '); // No Bézier spline control points
      expect(svg!.linePath).not.toContain('S ');
    });
  });

  describe('Historical Net Worth Reconstruction', () => {
    it('accurately reconstructs fluctuating net worth trajectory from daily transactions and investment snapshots', () => {
      const currentLiquid = 4000;
      const investSnapshots: Record<string, number> = {
        '2026-09-01': 19500,
        '2026-09-02': 19800,
        '2026-09-03': 19700,
        '2026-09-04': 20000,
      };

      const txByDate: Record<string, number> = {
        '2026-09-04': 50,
        '2026-09-03': -1000,
        '2026-09-02': 200,
        '2026-09-01': 50,
      };

      const dates = ['2026-09-04', '2026-09-03', '2026-09-02', '2026-09-01'];
      let walkingLiquid = currentLiquid;
      const history: { date: string; value: number }[] = [];

      for (const d of dates) {
        const dayInvest = investSnapshots[d];
        const dayNetWorth = dayInvest + walkingLiquid;
        history.push({ date: d, value: dayNetWorth });
        if (txByDate[d]) {
          walkingLiquid += txByDate[d];
        }
      }

      history.reverse();

      expect(history).toEqual([
        { date: '2026-09-01', value: 22750 },
        { date: '2026-09-02', value: 22850 },
        { date: '2026-09-03', value: 23750 },
        { date: '2026-09-04', value: 24000 },
      ]);

      // Confirm trajectory is authentic non-linear fluctuations, not a straight diagonal line
      const step1 = history[1].value - history[0].value;
      const step2 = history[2].value - history[1].value;
      const step3 = history[3].value - history[2].value;
      expect(step1).toBe(100);
      expect(step2).toBe(900);
      expect(step3).toBe(250);
      expect(step1).not.toBe(step2);
    });
  });

  describe('Credit Utilization Engine', () => {
    interface CreditAccount {
      id: string;
      name: string;
      type: string;
      currentBalance: number;
      availableBalance?: number | null;
      creditLimit?: number | null;
      isHidden: boolean;
    }

    function calculateCardUtilization(acc: CreditAccount) {
      const limit =
        Number(acc.creditLimit) ||
        (acc.availableBalance != null && acc.currentBalance != null
          ? Number(acc.availableBalance) + Number(acc.currentBalance)
          : null);
      const balance = Number(acc.currentBalance) || 0;
      const available =
        acc.availableBalance != null
          ? Number(acc.availableBalance)
          : limit != null
            ? Math.max(0, limit - balance)
            : null;
      const utilization =
        limit != null && limit > 0
          ? Math.min(100, Math.max(0, (balance / limit) * 100))
          : null;

      return { limit, balance, available, utilization };
    }

    function calculateAggregateUtilization(accounts: CreditAccount[]) {
      const tracked = accounts.filter((a) => !a.isHidden && a.type === 'credit');
      const totalBalance = tracked.reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);
      const totalLimit = tracked.reduce((sum, a) => {
        const lim =
          Number(a.creditLimit) ||
          (a.availableBalance != null && a.currentBalance != null
            ? Number(a.availableBalance) + Number(a.currentBalance)
            : 0);
        return sum + lim;
      }, 0);

      const utilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : null;

      let tier: 'Optimal' | 'Good' | 'Elevated' | 'High' | null = null;
      if (utilization != null) {
        if (utilization < 10) tier = 'Optimal';
        else if (utilization < 30) tier = 'Good';
        else if (utilization < 50) tier = 'Elevated';
        else tier = 'High';
      }

      return { totalBalance, totalLimit, utilization, tier };
    }

    it('calculates single card utilization from explicit credit limit', () => {
      const card: CreditAccount = {
        id: '1',
        name: 'Chase Sapphire',
        type: 'credit',
        currentBalance: 1250,
        creditLimit: 10000,
        isHidden: false,
      };

      const res = calculateCardUtilization(card);
      expect(res.limit).toBe(10000);
      expect(res.balance).toBe(1250);
      expect(res.available).toBe(8750);
      expect(res.utilization).toBe(12.5);
    });

    it('computes credit limit fallback from availableBalance + currentBalance', () => {
      const card: CreditAccount = {
        id: '2',
        name: 'Amex Gold',
        type: 'credit',
        currentBalance: 500,
        availableBalance: 4500,
        isHidden: false,
      };

      const res = calculateCardUtilization(card);
      expect(res.limit).toBe(5000);
      expect(res.utilization).toBe(10);
    });

    it('aggregates portfolio revolving utilization and assigns correct tiers', () => {
      const accounts: CreditAccount[] = [
        {
          id: '1',
          name: 'Card A',
          type: 'credit',
          currentBalance: 600,
          creditLimit: 10000,
          isHidden: false,
        },
        {
          id: '2',
          name: 'Card B',
          type: 'credit',
          currentBalance: 1400,
          creditLimit: 10000,
          isHidden: false,
        },
        {
          id: '3',
          name: 'Hidden Card',
          type: 'credit',
          currentBalance: 5000,
          creditLimit: 5000,
          isHidden: true, // Should be ignored
        },
        {
          id: '4',
          name: 'Checking Account',
          type: 'depository',
          currentBalance: 15000,
          isHidden: false, // Non-credit should be ignored
        },
      ];

      const agg = calculateAggregateUtilization(accounts);
      expect(agg.totalBalance).toBe(2000);
      expect(agg.totalLimit).toBe(20000);
      expect(agg.utilization).toBe(10);
      expect(agg.tier).toBe('Good');
    });

    it('handles optimal credit tier below 10%', () => {
      const accounts: CreditAccount[] = [
        {
          id: '1',
          name: 'Card A',
          type: 'credit',
          currentBalance: 450,
          creditLimit: 10000,
          isHidden: false,
        },
      ];

      const agg = calculateAggregateUtilization(accounts);
      expect(agg.utilization).toBe(4.5);
      expect(agg.tier).toBe('Optimal');
    });

    it('handles elevated credit tier above 30%', () => {
      const accounts: CreditAccount[] = [
        {
          id: '1',
          name: 'Card A',
          type: 'credit',
          currentBalance: 3500,
          creditLimit: 10000,
          isHidden: false,
        },
      ];

      const agg = calculateAggregateUtilization(accounts);
      expect(agg.utilization).toBe(35);
      expect(agg.tier).toBe('Elevated');
    });
  });
});


