import { describe, it, expect } from 'vitest';

interface AccountEntity {
  id: string;
  name: string;
  institutionName: string;
  type: 'depository' | 'credit' | 'investment';
  currentBalance: number;
  isHidden: boolean;
}

export function groupAccountsByInstitution(accounts: AccountEntity[]) {
  return accounts.reduce((acc, a) => {
    const inst = a.institutionName || 'Other';
    if (!acc[inst]) acc[inst] = [];
    acc[inst].push(a);
    return acc;
  }, {} as Record<string, AccountEntity[]>);
}

export function toggleAccountTracking(
  accounts: AccountEntity[],
  accountId: string,
) {
  return accounts.map((a) =>
    a.id === accountId ? { ...a, isHidden: !a.isHidden } : a,
  );
}

describe('Account Selection & Institution Tracking', () => {
  const sampleAccounts: AccountEntity[] = [
    { id: '1', name: 'Total Checking', institutionName: 'Chase', type: 'depository', currentBalance: 4000, isHidden: false },
    { id: '2', name: 'Freedom Unlimited', institutionName: 'Chase', type: 'credit', currentBalance: 1200, isHidden: false },
    { id: '3', name: 'Advantage Savings', institutionName: 'Bank of America', type: 'depository', currentBalance: 25000, isHidden: false },
    { id: '4', name: 'Brokerage', institutionName: 'Fidelity', type: 'investment', currentBalance: 60000, isHidden: false },
  ];

  it('groups accounts under their respective financial institutions', () => {
    const grouped = groupAccountsByInstitution(sampleAccounts);

    expect(Object.keys(grouped)).toEqual(['Chase', 'Bank of America', 'Fidelity']);
    expect(grouped['Chase'].length).toBe(2);
    expect(grouped['Bank of America'].length).toBe(1);
    expect(grouped['Fidelity'].length).toBe(1);
  });

  it('toggles an account between tracked and untracked', () => {
    // Untrack the Chase Freedom credit card
    const updated = toggleAccountTracking(sampleAccounts, '2');
    const card = updated.find((a) => a.id === '2');
    expect(card?.isHidden).toBe(true);

    // Toggle back to tracked
    const toggledBack = toggleAccountTracking(updated, '2');
    expect(toggledBack.find((a) => a.id === '2')?.isHidden).toBe(false);
  });

  it('excluding an account changes the tracked net worth accordingly', () => {
    const initialTrackedTotal = sampleAccounts
      .filter((a) => !a.isHidden)
      .reduce((sum, a) => sum + (a.type === 'credit' ? -a.currentBalance : a.currentBalance), 0);

    // 4000 - 1200 + 25000 + 60000 = 87800
    expect(initialTrackedTotal).toBe(87800);

    // Untrack Bank of America savings ($25,000)
    const afterUntracking = toggleAccountTracking(sampleAccounts, '3');
    const newNetWorth = afterUntracking
      .filter((a) => !a.isHidden)
      .reduce((sum, a) => sum + (a.type === 'credit' ? -a.currentBalance : a.currentBalance), 0);

    // 87800 - 25000 = 62800
    expect(newNetWorth).toBe(62800);
  });
});

export function calculateHoldingGain(institutionValue: number, costBasis: number | null) {
  if (costBasis == null) return { gainAmount: null, gainPercent: null };
  const gainAmount = Math.round((institutionValue - costBasis) * 100) / 100;
  const gainPercent = costBasis > 0 ? Math.round(((institutionValue - costBasis) / costBasis) * 1000) / 10 : 0;
  return { gainAmount, gainPercent };
}

export function aggregateHoldingsPerformance(
  holdings: Array<{ institutionValue: number; costBasis: number | null }>,
) {
  let totalCostBasis = 0;
  let totalHoldingsValue = 0;

  for (const h of holdings) {
    if (h.costBasis != null && h.costBasis > 0) {
      totalCostBasis += h.costBasis;
      totalHoldingsValue += h.institutionValue;
    }
  }

  const totalUnrealizedGain =
    totalCostBasis > 0
      ? Math.round((totalHoldingsValue - totalCostBasis) * 100) / 100
      : 0;
  const totalUnrealizedGainPercent =
    totalCostBasis > 0
      ? Math.round(((totalHoldingsValue - totalCostBasis) / totalCostBasis) * 1000) / 10
      : 0;

  return {
    totalCostBasis: Math.round(totalCostBasis * 100) / 100,
    totalHoldingsValue: Math.round(totalHoldingsValue * 100) / 100,
    totalUnrealizedGain,
    totalUnrealizedGainPercent,
  };
}

describe('Investment Holdings & Portfolio Capital Returns', () => {
  const sampleFidelityHoldings = [
    { ticker: 'FXAIX', institutionValue: 15313.39, costBasis: 11641.22 },
    { ticker: 'FZROX', institutionValue: 4557.59, costBasis: 3284.55 },
    { ticker: 'FZILX', institutionValue: 1623.31, costBasis: 1121.60 },
    { ticker: 'SPAXX', institutionValue: 48.17, costBasis: null },
  ];

  it('accurately calculates individual holding unrealized gain and percentage', () => {
    const fxaix = calculateHoldingGain(sampleFidelityHoldings[0].institutionValue, sampleFidelityHoldings[0].costBasis);
    expect(fxaix.gainAmount).toBe(3672.17);
    expect(fxaix.gainPercent).toBe(31.5);

    const fzrox = calculateHoldingGain(sampleFidelityHoldings[1].institutionValue, sampleFidelityHoldings[1].costBasis);
    expect(fzrox.gainAmount).toBe(1273.04);
    expect(fzrox.gainPercent).toBe(38.8);

    const fzilx = calculateHoldingGain(sampleFidelityHoldings[2].institutionValue, sampleFidelityHoldings[2].costBasis);
    expect(fzilx.gainAmount).toBe(501.71);
    expect(fzilx.gainPercent).toBe(44.7);

    // Cash core holding with null cost basis
    const spaxx = calculateHoldingGain(sampleFidelityHoldings[3].institutionValue, sampleFidelityHoldings[3].costBasis);
    expect(spaxx.gainAmount).toBeNull();
    expect(spaxx.gainPercent).toBeNull();
  });

  it('aggregates portfolio total cost basis and true unrealized capital return', () => {
    const perf = aggregateHoldingsPerformance(sampleFidelityHoldings);

    // Total cost basis: 11641.22 + 3284.55 + 1121.60 = 16047.37
    expect(perf.totalCostBasis).toBe(16047.37);

    // Total value of holdings with cost basis: 15313.39 + 4557.59 + 1623.31 = 21494.29
    expect(perf.totalHoldingsValue).toBe(21494.29);

    // Gain: 21494.29 - 16047.37 = +5446.92
    expect(perf.totalUnrealizedGain).toBe(5446.92);

    // Return %: (5446.92 / 16047.37) * 100 = 33.9%
    expect(perf.totalUnrealizedGainPercent).toBe(33.9);
  });
});
