import { describe, it, expect } from 'vitest';

export interface Holding {
  securityId: string;
  tickerSymbol: string;
  quantity: number;
  institutionPrice: number;
  institutionValue: number;
  costBasis: number | null;
}

export interface InvestmentTx {
  securityId: string | null;
  date: string;
  type: 'buy' | 'sell' | 'cash' | 'transfer';
  subtype: string | null;
  quantity: number;
  price: number;
  amount: number;
}

/**
 * Reconstructs shares held on a historical date by stepping backward from known current holdings
 */
export function calculateHistoricalShares(
  currentShares: number,
  targetDate: string,
  transactionsForSecurity: InvestmentTx[],
): number {
  let shares = currentShares;
  for (const tx of transactionsForSecurity) {
    // If transaction occurred AFTER targetDate, reverse its effect to find past balance
    if (tx.date > targetDate) {
      if (tx.type === 'buy') {
        shares -= tx.quantity;
      } else if (tx.type === 'sell') {
        shares += Math.abs(tx.quantity);
      }
    }
  }
  return Math.max(0, Math.round(shares * 1000) / 1000);
}

/**
 * Separates new capital contributions (DCA / stock purchases) from pure market capital gains
 */
export function calculatePerformanceWithContributions(
  startingValue: number,
  currentValue: number,
  transactionsInTimeframe: InvestmentTx[],
) {
  const totalChange = Math.round((currentValue - startingValue) * 100) / 100;
  const totalChangePercent = startingValue > 0 ? Math.round((totalChange / startingValue) * 1000) / 10 : 0;

  let netStockPurchases = 0;
  let netDeposits = 0;

  for (const tx of transactionsInTimeframe) {
    if (tx.type === 'buy') {
      netStockPurchases += tx.amount;
    } else if (tx.type === 'cash' && (tx.subtype === 'deposit' || tx.subtype === 'contribution')) {
      netDeposits += Math.abs(tx.amount);
    }
  }

  const netContributed = Math.round((netStockPurchases > 0 ? netStockPurchases : netDeposits) * 100) / 100;
  const marketGain = Math.round((totalChange - netContributed) * 100) / 100;
  const marketGainPercent = startingValue > 0 ? Math.round((marketGain / startingValue) * 1000) / 10 : 0;

  return {
    totalChange,
    totalChangePercent,
    netContributed,
    marketGain,
    marketGainPercent,
  };
}

describe('Investment Transactions & Dynamic Historical Portfolio Reconstruction', () => {
  const sampleHoldings: Holding[] = [
    {
      securityId: 'sec-fxaix',
      tickerSymbol: 'FXAIX',
      quantity: 56.792,
      institutionPrice: 269.64,
      institutionValue: 15313.39,
      costBasis: 11641.22,
    },
    {
      securityId: 'sec-fzrox',
      tickerSymbol: 'FZROX',
      quantity: 168.55,
      institutionPrice: 27.04,
      institutionValue: 4557.59,
      costBasis: 3284.55,
    },
  ];

  // Recurring monthly buys of FXAIX (e.g. $85/mo ~ 0.316 shares)
  const sampleFXAIXBuys: InvestmentTx[] = [
    { securityId: 'sec-fxaix', date: '2026-08-04', type: 'buy', subtype: 'buy', quantity: 0.316, price: 268.96, amount: 85.00 },
    { securityId: 'sec-fxaix', date: '2026-07-06', type: 'buy', subtype: 'buy', quantity: 0.318, price: 267.30, amount: 85.00 },
    { securityId: 'sec-fxaix', date: '2026-06-04', type: 'buy', subtype: 'buy', quantity: 0.334, price: 254.50, amount: 85.00 },
    { securityId: 'sec-fxaix', date: '2026-05-04', type: 'buy', subtype: 'buy', quantity: 0.342, price: 248.50, amount: 85.00 },
  ];

  it('reconstructs historical share count backward from current holding', () => {
    // Today (after Aug 4): 56.792 shares
    expect(calculateHistoricalShares(56.792, '2026-08-05', sampleFXAIXBuys)).toBe(56.792);

    // Before Aug 4 buy: 56.792 - 0.316 = 56.476
    expect(calculateHistoricalShares(56.792, '2026-08-01', sampleFXAIXBuys)).toBe(56.476);

    // Before July 6 buy: 56.476 - 0.318 = 56.158
    expect(calculateHistoricalShares(56.792, '2026-07-01', sampleFXAIXBuys)).toBe(56.158);

    // Before all 4 monthly buys: 56.792 - (0.316 + 0.318 + 0.334 + 0.342) = 55.482
    expect(calculateHistoricalShares(56.792, '2026-05-01', sampleFXAIXBuys)).toBe(55.482);
  });

  it('accurately isolates net contributions from pure market returns', () => {
    const startingValue = 15000.00;
    const currentValue = 21542.46; // +$6,542.46 total growth

    // Suppose in this 1-year period, user made regular monthly purchases totaling $4,977.59
    const yearTransactions: InvestmentTx[] = [
      { securityId: 'sec-fxaix', date: '2026-08-04', type: 'buy', subtype: 'buy', quantity: 0.316, price: 268.96, amount: 85.00 },
      { securityId: 'sec-fxaix', date: '2026-07-06', type: 'buy', subtype: 'buy', quantity: 0.318, price: 267.30, amount: 85.00 },
      { securityId: 'sec-fxaix', date: '2025-07-15', type: 'buy', subtype: 'buy', quantity: 15.00, price: 230.00, amount: 3450.00 },
      { securityId: 'sec-fzrox', date: '2026-03-10', type: 'buy', subtype: 'buy', quantity: 55.00, price: 24.68, amount: 1357.59 },
    ];

    const perf = calculatePerformanceWithContributions(startingValue, currentValue, yearTransactions);

    // Total change: 21542.46 - 15000.00 = +6542.46 (+43.6%)
    expect(perf.totalChange).toBe(6542.46);
    expect(perf.totalChangePercent).toBe(43.6);

    // Total new capital bought: 85 + 85 + 3450 + 1357.59 = 4977.59
    expect(perf.netContributed).toBe(4977.59);

    // Pure market capital gain: 6542.46 - 4977.59 = +1564.87 (+10.4% pure market return on starting capital)
    expect(perf.marketGain).toBe(1564.87);
    expect(perf.marketGainPercent).toBe(10.4);
  });
});
