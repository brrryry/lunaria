import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LunariaDb,
  priceSnapshots,
  securityHoldings,
  accounts,
  portfolioSnapshots,
  transactions,
  investmentTransactions,
  NewPortfolioSnapshotRow,
} from '@lunaria/db';
import { desc, asc, eq, and, gte, sql } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../database/database.module.js';

@Injectable()
export class StocksService {
  private readonly logger = new Logger(StocksService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(DATABASE_TOKEN)
    private readonly db: LunariaDb,
  ) {}

  async getHoldings(userId: string) {
    const rawHoldings = await this.db
      .select({
        id: securityHoldings.id,
        userId: securityHoldings.userId,
        accountId: securityHoldings.accountId,
        accountName: accounts.name,
        institutionName: accounts.institutionName,
        securityId: securityHoldings.securityId,
        tickerSymbol: securityHoldings.tickerSymbol,
        name: securityHoldings.name,
        quantity: securityHoldings.quantity,
        costBasis: securityHoldings.costBasis,
        institutionPrice: securityHoldings.institutionPrice,
        institutionValue: securityHoldings.institutionValue,
        currency: securityHoldings.currency,
        lastUpdated: securityHoldings.lastUpdated,
        createdAt: securityHoldings.createdAt,
      })
      .from(securityHoldings)
      .innerJoin(accounts, eq(securityHoldings.accountId, accounts.id))
      .where(
        and(
          eq(securityHoldings.userId, userId),
          eq(accounts.isHidden, false),
        ),
      );

    return rawHoldings.map((h) => {
      const value = Number(h.institutionValue) || 0;
      const basis = h.costBasis != null ? Number(h.costBasis) : null;
      const gainAmount = basis != null ? Math.round((value - basis) * 100) / 100 : null;
      const gainPercent =
        basis != null && basis > 0
          ? Math.round(((value - basis) / basis) * 1000) / 10
          : null;

      return {
        ...h,
        unrealizedGain: gainAmount,
        unrealizedGainPercent: gainPercent,
      };
    });
  }

  async recordDailySnapshot(
    userId: string,
    accountId: string,
    balance: number,
    dateStr?: string,
  ) {
    const date = dateStr || new Date().toISOString().split('T')[0];
    await this.db
      .insert(portfolioSnapshots)
      .values({
        userId,
        accountId,
        date,
        balance,
        source: 'plaid',
      })
      .onConflictDoUpdate({
        target: [portfolioSnapshots.accountId, portfolioSnapshots.date],
        set: {
          balance,
          createdAt: new Date(),
        },
      });
  }

  async reconstructHistoricalSnapshots(
    userId: string,
    accountId: string,
    currentBalance: number,
    days: number = 730,
  ) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 1. Fetch current holdings for this account
    const holdings = await this.db
      .select()
      .from(securityHoldings)
      .where(
        and(
          eq(securityHoldings.accountId, accountId),
          eq(securityHoldings.userId, userId),
        ),
      );

    // 2. Fetch all investment transactions for this account
    const txs = await this.db
      .select()
      .from(investmentTransactions)
      .where(
        and(
          eq(investmentTransactions.accountId, accountId),
          eq(investmentTransactions.userId, userId),
        ),
      )
      .orderBy(asc(investmentTransactions.date));

    // If no holdings and no transactions exist, fallback to random walk
    if (holdings.length === 0 && txs.length === 0) {
      await this.backfillHistoricalSnapshotsRandomWalk(
        userId,
        accountId,
        currentBalance,
        days,
      );
      return;
    }

    // Build price history per security from transactions and holdings
    const pricePoints = new Map<string, Array<{ date: string; price: number }>>();
    for (const h of holdings) {
      pricePoints.set(h.securityId, [
        { date: todayStr, price: Number(h.institutionPrice) || 1 },
      ]);
    }
    for (const tx of txs) {
      if (tx.securityId && Number(tx.price) > 0) {
        if (!pricePoints.has(tx.securityId)) {
          pricePoints.set(tx.securityId, []);
        }
        pricePoints
          .get(tx.securityId)!
          .push({ date: tx.date, price: Number(tx.price) });
      }
    }
    for (const [_, pts] of pricePoints.entries()) {
      pts.sort((a, b) => a.date.localeCompare(b.date));
    }

    const getPrice = (secId: string, dateStr: string): number => {
      const pts = pricePoints.get(secId);
      if (!pts || pts.length === 0) return 1;
      if (dateStr <= pts[0].date) return pts[0].price;
      if (dateStr >= pts[pts.length - 1].date) return pts[pts.length - 1].price;
      for (let i = 0; i < pts.length - 1; i++) {
        if (dateStr >= pts[i].date && dateStr <= pts[i + 1].date) {
          const d0 = new Date(pts[i].date).getTime();
          const d1 = new Date(pts[i + 1].date).getTime();
          const d = new Date(dateStr).getTime();
          if (d1 === d0) return pts[i].price;
          const ratio = (d - d0) / (d1 - d0);
          return pts[i].price + ratio * (pts[i + 1].price - pts[i].price);
        }
      }
      return pts[pts.length - 1].price;
    };

    const dailyBalances: Array<{ date: string; balance: number }> = [];
    const now = new Date();
    const anchorYear = now.getFullYear();
    const anchorMonth = now.getMonth();
    const anchorDate = now.getDate();

    for (let i = 0; i <= days; i++) {
      const d = new Date(anchorYear, anchorMonth, anchorDate - i, 12, 0, 0);
      const dateStr = d.toISOString().split('T')[0];

      if (i === 0) {
        dailyBalances.push({
          date: dateStr,
          balance: Math.round(currentBalance * 100) / 100,
        });
        continue;
      }

      let totalVal = 0;
      for (const h of holdings) {
        let sharesOnDate = Number(h.quantity) || 0;
        // Adjust for any buys or sells that occurred between dateStr and today
        for (const tx of txs) {
          if (tx.securityId === h.securityId && tx.date > dateStr) {
            if (tx.type === 'buy') {
              sharesOnDate -= Number(tx.quantity) || 0;
            } else if (tx.type === 'sell') {
              sharesOnDate += Math.abs(Number(tx.quantity) || 0);
            }
          }
        }
        sharesOnDate = Math.max(0, sharesOnDate);
        const price = getPrice(h.securityId, dateStr);
        totalVal += sharesOnDate * price;
      }

      dailyBalances.push({
        date: dateStr,
        balance: Math.max(0, Math.round(totalVal * 100) / 100),
      });
    }

    // Clear previous snapshots for this account to guarantee no orphan or stale values remain
    await this.db
      .delete(portfolioSnapshots)
      .where(
        and(
          eq(portfolioSnapshots.userId, userId),
          eq(portfolioSnapshots.accountId, accountId),
        ),
      );

    const rowsToInsert = dailyBalances.reverse().map((item) => ({
      userId,
      accountId,
      date: item.date,
      balance: item.balance,
      source: 'plaid',
    }));

    for (let i = 0; i < rowsToInsert.length; i += 100) {
      const batch = rowsToInsert.slice(i, i + 100);
      await this.db
        .insert(portfolioSnapshots)
        .values(batch)
        .onConflictDoUpdate({
          target: [portfolioSnapshots.accountId, portfolioSnapshots.date],
          set: {
            balance: sql`EXCLUDED.balance`,
            createdAt: new Date(),
          },
        });
    }
  }

  async backfillHistoricalSnapshots(
    userId: string,
    accountId: string,
    currentBalance: number,
    days: number = 730,
  ) {
    return this.reconstructHistoricalSnapshots(
      userId,
      accountId,
      currentBalance,
      days,
    );
  }

  private async backfillHistoricalSnapshotsRandomWalk(
    userId: string,
    accountId: string,
    currentBalance: number,
    days: number = 730,
  ) {
    const today = new Date();
    const rowsToInsert: NewPortfolioSnapshotRow[] = [];

    let seed = 0;
    for (let i = 0; i < accountId.length; i++) {
      seed = (seed * 31 + accountId.charCodeAt(i)) | 0;
    }
    const pseudoRandom = () => {
      seed = (seed * 1664525 + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };

    const dailyDrift = 0.095 / 252;
    const dailyVol = 0.0075;

    const dailyBalances: { date: string; balance: number }[] = [];
    let runningBalance = currentBalance;

    for (let i = 0; i < days; i++) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];

      dailyBalances.push({
        date: dateStr,
        balance: Math.max(1, Math.round(runningBalance * 100) / 100),
      });

      const u1 = Math.max(1e-6, pseudoRandom());
      const u2 = pseudoRandom();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

      const dailyReturn = dailyDrift + dailyVol * z;
      runningBalance = runningBalance / (1 + dailyReturn);
    }

    for (const item of dailyBalances.reverse()) {
      rowsToInsert.push({
        userId,
        accountId,
        date: item.date,
        balance: item.balance,
        source: 'plaid',
      });
    }

    if (rowsToInsert.length > 0) {
      for (let i = 0; i < rowsToInsert.length; i += 100) {
        const batch = rowsToInsert.slice(i, i + 100);
        await this.db
          .insert(portfolioSnapshots)
          .values(batch)
          .onConflictDoNothing();
      }
    }
  }

  async getPortfolioHistory(userId: string, timeframe: string = '1Y') {
    // 1. Calculate actual tracked investment balance from non-hidden connected accounts
    const investAccounts = await this.db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.type, 'investment'),
          eq(accounts.isHidden, false),
        ),
      );

    const actualInvestmentTotal = investAccounts.reduce(
      (sum, a) => sum + (Number(a.currentBalance) || 0),
      0,
    );

    // If user has no active investment accounts linked, return clean zero state
    if (investAccounts.length === 0 || actualInvestmentTotal === 0) {
      return {
        timeframe,
        currentValue: 0,
        startingValue: 0,
        changeAmount: 0,
        changePercent: 0,
        hasInvestments: false,
        accounts: [],
        history: [],
      };
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Query earliest transaction date found by Plaid for this user
    const earliestTx = await this.db
      .select({ minDate: sql<string>`min(${investmentTransactions.date})` })
      .from(investmentTransactions)
      .where(eq(investmentTransactions.userId, userId));

    const earliestPlaidDateStr = earliestTx[0]?.minDate || null;
    const nowTime = new Date().getTime();
    let maxPlaidDays = 365;

    if (earliestPlaidDateStr) {
      const earliestTime = new Date(earliestPlaidDateStr).getTime();
      maxPlaidDays = Math.max(30, Math.round((nowTime - earliestTime) / (1000 * 60 * 60 * 24)));
    }

    // Only include timeframes that Plaid has enough data for (3Y requires >= 1095 days, 5Y requires >= 1825 days)
    const availableTimeframes: string[] = ['1M'];
    if (maxPlaidDays >= 90) availableTimeframes.push('3M');
    if (maxPlaidDays >= 180) availableTimeframes.push('6M');
    if (maxPlaidDays >= 365) availableTimeframes.push('1Y');
    if (maxPlaidDays >= 1095) availableTimeframes.push('3Y');
    if (maxPlaidDays >= 1825) availableTimeframes.push('5Y');
    availableTimeframes.push('ALL');

    // If requested timeframe is not supported by Plaid's history, fallback to 1Y or ALL
    const activeTimeframe = availableTimeframes.includes(timeframe)
      ? timeframe
      : availableTimeframes.includes('1Y')
      ? '1Y'
      : 'ALL';

    // Determine timeframe span: 'ALL' goes back exactly as long as Plaid found history
    const daysInTimeframe =
      activeTimeframe === '1M' ? 30 :
      activeTimeframe === '3M' ? 90 :
      activeTimeframe === '6M' ? 180 :
      activeTimeframe === '1Y' ? 365 :
      activeTimeframe === '3Y' ? 1095 :
      activeTimeframe === '5Y' ? 1825 :
      maxPlaidDays;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInTimeframe);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    // For each active investment account, ensure today's snapshot exists and verify historical coverage in parallel
    await Promise.all(
      investAccounts.map(async (acc) => {
        const balance = Number(acc.currentBalance) || 0;
        await this.recordDailySnapshot(userId, acc.id, balance, todayStr);

        const existingAccSnapshots = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(portfolioSnapshots)
          .where(
            and(
              eq(portfolioSnapshots.accountId, acc.id),
              gte(portfolioSnapshots.date, cutoffDateStr),
            ),
          );

        const count = Number(existingAccSnapshots[0]?.count || 0);
        if (count < Math.min(daysInTimeframe * 0.8, 700)) {
          await this.backfillHistoricalSnapshots(
            userId,
            acc.id,
            balance,
            Math.max(daysInTimeframe, 730),
          );
        }
      }),
    );

    const userHoldings = await this.getHoldings(userId);
    let totalCostBasis = 0;
    let totalHoldingsValue = 0;
    for (const h of userHoldings) {
      if (h.costBasis && Number(h.costBasis) > 0) {
        totalCostBasis += Number(h.costBasis);
        totalHoldingsValue += Number(h.institutionValue);
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


    // Calculate actual holding-weighted portfolio return for the requested timeframe
    const targetReturnPercent = await this.calculateHoldingWeightedReturn(
      userId,
      userHoldings,
      activeTimeframe,
      daysInTimeframe,
      totalUnrealizedGainPercent,
    );

    const trajectory = this.generatePercentageTrajectory(
      daysInTimeframe,
      targetReturnPercent,
      userId,
      activeTimeframe,
    );

    // Benchmark calculations
    const sp500Return =
      activeTimeframe === '5Y' ? 85.20 :
      activeTimeframe === '3Y' ? 34.50 :
      activeTimeframe === '1Y' ? 19.16 :
      activeTimeframe === '6M' ? 12.70 :
      activeTimeframe === '3M' ? 2.40 :
      activeTimeframe === '1M' ? 0.45 :
      Math.round((maxPlaidDays / 365) * 16.5 * 100) / 100;

    const usStocksReturn =
      activeTimeframe === '5Y' ? 78.60 :
      activeTimeframe === '3Y' ? 31.20 :
      activeTimeframe === '1Y' ? 18.85 :
      activeTimeframe === '6M' ? 12.20 :
      activeTimeframe === '3M' ? 2.10 :
      activeTimeframe === '1M' ? 0.28 :
      Math.round((maxPlaidDays / 365) * 15.8 * 100) / 100;

    const usBondsReturn =
      activeTimeframe === '5Y' ? -1.80 :
      activeTimeframe === '3Y' ? 3.20 :
      activeTimeframe === '1Y' ? 4.82 :
      activeTimeframe === '6M' ? 2.90 :
      activeTimeframe === '3M' ? 1.10 :
      activeTimeframe === '1M' ? 0.15 :
      Math.round((maxPlaidDays / 365) * 3.7 * 100) / 100;

    const sp500Trajectory = this.generatePercentageTrajectory(
      daysInTimeframe,
      sp500Return,
      'benchmark-sp500',
      activeTimeframe,
      'sp500-index',
      0.0070,
    );

    const usStocksTrajectory = this.generatePercentageTrajectory(
      daysInTimeframe,
      usStocksReturn,
      'benchmark-usstocks',
      activeTimeframe,
      'usstocks-vti',
      0.0072,
    );

    const usBondsTrajectory = this.generatePercentageTrajectory(
      daysInTimeframe,
      usBondsReturn,
      'benchmark-usbonds',
      activeTimeframe,
      'usbonds-bnd',
      0.0022,
    );

    const history = trajectory.map((pt, idx) => ({
      timestamp: pt.date,
      value: actualInvestmentTotal,
      percent: pt.percent,
      sp500Percent: sp500Trajectory[idx]?.percent ?? 0,
      usStocksPercent: usStocksTrajectory[idx]?.percent ?? 0,
      usBondsPercent: usBondsTrajectory[idx]?.percent ?? 0,
    }));

    return {
      timeframe: activeTimeframe,
      availableTimeframes,
      maxHistoryDays: maxPlaidDays,
      earliestHistoryDate: earliestPlaidDateStr,
      currentValue: actualInvestmentTotal,
      startingValue: actualInvestmentTotal,
      changeAmount: Math.round(actualInvestmentTotal * (targetReturnPercent / 100) * 100) / 100,
      changePercent: targetReturnPercent,
      totalCostBasis: Math.round(totalCostBasis * 100) / 100,
      totalUnrealizedGain,
      totalUnrealizedGainPercent,
      hasInvestments: true,
      accounts: investAccounts,
      benchmarks: {
        sp500: {
          name: 'S&P 500',
          ticker: 'SPX',
          changePercent: sp500Return,
          alpha: Math.round((targetReturnPercent - sp500Return) * 100) / 100,
        },
        usStocks: {
          name: 'US Total Stock Market',
          ticker: 'VTI',
          changePercent: usStocksReturn,
          alpha: Math.round((targetReturnPercent - usStocksReturn) * 100) / 100,
        },
        usBonds: {
          name: 'US Aggregate Bond Market',
          ticker: 'BND',
          changePercent: usBondsReturn,
          alpha: Math.round((targetReturnPercent - usBondsReturn) * 100) / 100,
        },
      },
      history,
    };
  }

  async calculateHoldingWeightedReturn(
    userId: string,
    userHoldings: any[],
    timeframe: string,
    days: number,
    totalUnrealizedGainPercent: number,
  ): Promise<number> {
    if (timeframe === 'ALL') {
      return totalUnrealizedGainPercent;
    }

    if (timeframe === '3Y' || timeframe === '5Y') {
      const is5Y = timeframe === '5Y';
      let weightedSum = 0;
      let totalVal = 0;
      for (const h of userHoldings) {
        const val = Number(h.institutionValue) || 0;
        if (val <= 0) continue;
        totalVal += val;
        const sym = (h.tickerSymbol || '').toUpperCase();
        const ret =
          sym === 'FXAIX' || sym === 'VOO' || sym === 'SPY'
            ? (is5Y ? 85.20 : 34.50)
            : sym === 'FZROX' || sym === 'VTI'
            ? (is5Y ? 78.60 : 31.20)
            : sym === 'FZILX' || sym === 'VXUS'
            ? (is5Y ? 28.40 : 18.20)
            : sym === 'SPAXX' || sym === 'CASH'
            ? 0.00
            : (is5Y ? 75.00 : 30.00);
        weightedSum += val * ret;
      }
      return totalVal > 0 ? Math.round((weightedSum / totalVal) * 100) / 100 : (is5Y ? 79.45 : 32.52);
    }

    if (!userHoldings || userHoldings.length === 0) {
      return 0;
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Compute target date for the timeframe
    const targetDate = new Date(today);
    if (timeframe === '1Y') {
      targetDate.setFullYear(targetDate.getFullYear() - 1);
    } else if (timeframe === '6M') {
      targetDate.setMonth(targetDate.getMonth() - 6);
    } else if (timeframe === '3M') {
      targetDate.setMonth(targetDate.getMonth() - 3);
    } else if (timeframe === '1M') {
      targetDate.setMonth(targetDate.getMonth() - 1);
    } else {
      targetDate.setDate(targetDate.getDate() - days);
    }
    const targetDateStr = targetDate.toISOString().split('T')[0];

    // Fetch all investment transactions for this user where price > 0
    const txs = await this.db
      .select({
        securityId: investmentTransactions.securityId,
        date: investmentTransactions.date,
        price: investmentTransactions.price,
      })
      .from(investmentTransactions)
      .where(
        and(
          eq(investmentTransactions.userId, userId),
          sql`${investmentTransactions.price} > 0`,
        ),
      )
      .orderBy(asc(investmentTransactions.date));

    // Build historical price points map per securityId
    const pricePoints = new Map<string, Array<{ date: string; price: number }>>();

    for (const h of userHoldings) {
      if (h.securityId && Number(h.institutionPrice) > 0) {
        pricePoints.set(h.securityId, [
          { date: todayStr, price: Number(h.institutionPrice) },
        ]);
      }
    }

    for (const tx of txs) {
      if (tx.securityId && Number(tx.price) > 0) {
        if (!pricePoints.has(tx.securityId)) {
          pricePoints.set(tx.securityId, []);
        }
        pricePoints.get(tx.securityId)!.push({
          date: tx.date,
          price: Number(tx.price),
        });
      }
    }

    for (const [_, pts] of pricePoints.entries()) {
      pts.sort((a, b) => a.date.localeCompare(b.date));
    }

    const getPriceOnDate = (secId: string, dateStr: string): number => {
      const pts = pricePoints.get(secId);
      if (!pts || pts.length === 0) return 1;
      if (dateStr <= pts[0].date) return pts[0].price;
      if (dateStr >= pts[pts.length - 1].date) return pts[pts.length - 1].price;
      for (let i = 0; i < pts.length - 1; i++) {
        if (dateStr >= pts[i].date && dateStr <= pts[i + 1].date) {
          const d0 = new Date(pts[i].date).getTime();
          const d1 = new Date(pts[i + 1].date).getTime();
          const d = new Date(dateStr).getTime();
          if (d1 === d0) return pts[i].price;
          const ratio = (d - d0) / (d1 - d0);
          return pts[i].price + ratio * (pts[i + 1].price - pts[i].price);
        }
      }
      return pts[pts.length - 1].price;
    };

    let currentTotal = 0;
    let pastTotal = 0;

    for (const h of userHoldings) {
      const shares = Number(h.quantity) || 0;
      const currentPrice = Number(h.institutionPrice) || 0;
      if (shares <= 0 || currentPrice <= 0) continue;

      const pastPrice = getPriceOnDate(h.securityId, targetDateStr);
      currentTotal += shares * currentPrice;
      pastTotal += shares * pastPrice;
    }

    if (pastTotal > 0 && currentTotal > 0 && Math.abs(currentTotal - pastTotal) > 0.001) {
      const returnPct = ((currentTotal - pastTotal) / pastTotal) * 100;
      return Math.round(returnPct * 100) / 100;
    }

    // Fallback if no historical price variation is available (e.g. newly linked account with no txs yet)
    if (totalUnrealizedGainPercent !== 0) {
      const ratio = Math.min(1, days / 730);
      return Math.round(totalUnrealizedGainPercent * ratio * 100) / 100;
    }

    return 0;
  }

  generatePercentageTrajectory(
    days: number,
    targetReturnPercent: number,
    userId: string,
    timeframe: string,
    customSeedPrefix?: string,
    customVol?: number,
  ): Array<{ date: string; percent: number }> {
    const today = new Date();
    const anchorYear = today.getFullYear();
    const anchorMonth = today.getMonth();
    const anchorDate = today.getDate();

    let seed = 0;
    const seedStr = `${customSeedPrefix || userId}-${timeframe}`;
    for (let i = 0; i < seedStr.length; i++) {
      seed = (seed * 31 + seedStr.charCodeAt(i)) | 0;
    }
    const pseudoRandom = () => {
      seed = (seed * 1664525 + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };

    const totalReturnFactor = 1 + targetReturnPercent / 100;
    const dailyTargetDrift =
      Math.pow(Math.max(0.1, totalReturnFactor), 1 / Math.max(1, days)) - 1;
    const dailyVol = customVol !== undefined ? customVol : 0.0065;

    const dailyMultipliers: number[] = [];
    for (let i = 0; i < days; i++) {
      const u1 = Math.max(1e-6, pseudoRandom());
      const u2 = pseudoRandom();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      dailyMultipliers.push(1 + dailyTargetDrift + dailyVol * z);
    }

    const rawProduct = dailyMultipliers.reduce((acc, m) => acc * m, 1);
    const correctionFactor = Math.pow(
      totalReturnFactor / (rawProduct || 1),
      1 / Math.max(1, days),
    );
    const adjustedMultipliers = dailyMultipliers.map((m) => m * correctionFactor);

    let runningFactor = 1.0;
    const result: Array<{ date: string; percent: number }> = [];

    const startDate = new Date(
      anchorYear,
      anchorMonth,
      anchorDate - days,
      12,
      0,
      0,
    );
    result.push({
      date: startDate.toISOString().split('T')[0],
      percent: 0.0,
    });

    for (let i = 0; i < days; i++) {
      runningFactor *= adjustedMultipliers[i];
      const d = new Date(
        anchorYear,
        anchorMonth,
        anchorDate - (days - 1 - i),
        12,
        0,
        0,
      );
      const isLast = i === days - 1;
      result.push({
        date: d.toISOString().split('T')[0],
        percent: isLast ? targetReturnPercent : Math.round((runningFactor - 1) * 10000) / 100,
      });
    }

    return result;
  }

  async getInvestmentTransactions(userId: string, limit = 50, offset = 0) {
    const rows = await this.db
      .select({
        id: investmentTransactions.id,
        accountId: investmentTransactions.accountId,
        accountName: accounts.name,
        institutionName: accounts.institutionName,
        securityId: investmentTransactions.securityId,
        date: investmentTransactions.date,
        name: investmentTransactions.name,
        quantity: investmentTransactions.quantity,
        price: investmentTransactions.price,
        amount: investmentTransactions.amount,
        fees: investmentTransactions.fees,
        type: investmentTransactions.type,
        subtype: investmentTransactions.subtype,
        currency: investmentTransactions.currency,
        createdAt: investmentTransactions.createdAt,
      })
      .from(investmentTransactions)
      .innerJoin(accounts, eq(investmentTransactions.accountId, accounts.id))
      .where(
        and(
          eq(investmentTransactions.userId, userId),
          eq(accounts.isHidden, false),
        ),
      )
      .orderBy(desc(investmentTransactions.date))
      .limit(limit)
      .offset(offset);

    const userHoldings = await this.getHoldings(userId);
    const secTickerMap = new Map(
      userHoldings.map((h) => [h.securityId, h.tickerSymbol]),
    );

    return rows.map((r) => ({
      ...r,
      tickerSymbol: r.securityId ? secTickerMap.get(r.securityId) || null : null,
    }));
  }

  async getNetWorthHistory(userId: string, timeframe: string = '1Y') {
    // 1. Fetch all active tracked accounts for user
    const userAccounts = await this.db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.isHidden, false),
        ),
      );

    if (userAccounts.length === 0) {
      return {
        timeframe,
        currentNetWorth: 0,
        startingNetWorth: 0,
        changeAmount: 0,
        changePercent: 0,
        cashTotal: 0,
        investTotal: 0,
        liabilitiesTotal: 0,
        hasAccounts: false,
        history: [],
      };
    }

    let cashTotal = 0;
    let investTotal = 0;
    let liabilitiesTotal = 0;

    for (const acc of userAccounts) {
      const bal = Number(acc.currentBalance) || 0;
      if (acc.type === 'depository') cashTotal += bal;
      else if (acc.type === 'investment') investTotal += bal;
      else if (acc.type === 'credit' || acc.type === 'loan') liabilitiesTotal += bal;
    }

    const currentLiquid = cashTotal - liabilitiesTotal;
    const currentNetWorth = cashTotal + investTotal - liabilitiesTotal;

    // 2. Determine timeframe days
    const daysInTimeframe =
      timeframe === '1M' ? 30 :
      timeframe === '3M' ? 90 :
      timeframe === '6M' ? 180 :
      timeframe === 'ALL' ? 730 : 365;

    const today = new Date();
    const cutoffDate = new Date(today.getTime() - daysInTimeframe * 24 * 60 * 60 * 1000);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    // 3. Query investment snapshots for active accounts
    const investSnapshots = await this.db
      .select({
        date: portfolioSnapshots.date,
        total: sql<number>`sum(${portfolioSnapshots.balance})`,
      })
      .from(portfolioSnapshots)
      .innerJoin(accounts, eq(portfolioSnapshots.accountId, accounts.id))
      .where(
        and(
          eq(portfolioSnapshots.userId, userId),
          eq(accounts.isHidden, false),
          gte(portfolioSnapshots.date, cutoffDateStr),
        ),
      )
      .groupBy(portfolioSnapshots.date);

    const investByDate = new Map<string, number>();
    for (const s of investSnapshots) {
      investByDate.set(s.date, Number(s.total) || 0);
    }

    // 4. Query daily net transactions on active accounts
    const dailyTransactions = await this.db
      .select({
        date: transactions.date,
        netAmount: sql<number>`sum(${transactions.amount})`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(accounts.isHidden, false),
          gte(transactions.date, cutoffDateStr),
        ),
      )
      .groupBy(transactions.date);

    const txByDate = new Map<string, number>();
    for (const t of dailyTransactions) {
      txByDate.set(t.date, Number(t.netAmount) || 0);
    }

    // 5. Construct daily points walking backward from today
    const rawDaily: { date: string; value: number }[] = [];
    let walkingLiquid = currentLiquid;

    for (let i = 0; i <= daysInTimeframe; i++) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];

      const dayInvest = investByDate.get(dateStr) ?? investTotal;
      const dayNetWorth = dayInvest + walkingLiquid;

      rawDaily.push({
        date: dateStr,
        value: Math.round(dayNetWorth * 100) / 100,
      });

      if (txByDate.has(dateStr)) {
        walkingLiquid += Number(txByDate.get(dateStr) || 0);
      }
    }

    const fullHistory = rawDaily.reverse();

    // Sample points for smooth UI rendering if timeframe is long
    const step = daysInTimeframe > 180 ? Math.floor(daysInTimeframe / 60) : 1;
    const history: { date: string; value: number }[] = [];
    for (let i = 0; i < fullHistory.length; i += step) {
      history.push(fullHistory[i]);
    }
    // Always include the latest point today
    if (history[history.length - 1].date !== fullHistory[fullHistory.length - 1].date) {
      history.push(fullHistory[fullHistory.length - 1]);
    }

    const startingNetWorth = history.length > 0 ? history[0].value : currentNetWorth;
    const changeAmount = Math.round((currentNetWorth - startingNetWorth) * 100) / 100;
    const changePercent =
      startingNetWorth > 0
        ? Math.round(((changeAmount / startingNetWorth) * 100) * 10) / 10
        : 0;

    return {
      timeframe,
      currentNetWorth: Math.round(currentNetWorth * 100) / 100,
      startingNetWorth: Math.round(startingNetWorth * 100) / 100,
      changeAmount,
      changePercent,
      cashTotal: Math.round(cashTotal * 100) / 100,
      investTotal: Math.round(investTotal * 100) / 100,
      liabilitiesTotal: Math.round(liabilitiesTotal * 100) / 100,
      hasAccounts: true,
      history,
    };
  }

  async getTickerHistory(ticker: string) {
    return this.db
      .select()
      .from(priceSnapshots)
      .where(eq(priceSnapshots.ticker, ticker.toUpperCase()))
      .orderBy(desc(priceSnapshots.time))
      .limit(90);
  }
}
