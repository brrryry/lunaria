'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  Calendar,
  BarChart3,
  TrendingUp,
} from 'lucide-react';
import { isTransferOrCreditCardPayment } from '@/lib/transactions';

export type AggregationPeriod = 'monthly' | 'quarterly' | 'yearly';

export const CASH_FLOW_TIMEFRAMES = [
  { key: '1M', label: '1M', fullLabel: 'Past Month', days: 30 },
  { key: '3M', label: '3M', fullLabel: 'Past 3M', days: 90 },
  { key: '6M', label: '6M', fullLabel: 'Past 6M', days: 180 },
  { key: '1Y', label: '1Y', fullLabel: 'Past 1Y', days: 365 },
  { key: 'ALL', label: 'ALL', fullLabel: 'All Time', days: null },
] as const;

export type CashFlowTimeframeKey = (typeof CASH_FLOW_TIMEFRAMES)[number]['key'];

interface CashFlowWidgetProps {
  transactions?: any[];
  title?: string;
  timeframeLabel?: string;
  excludeTransfers?: boolean;
  defaultAggregation?: AggregationPeriod;
  defaultTimeframe?: CashFlowTimeframeKey;
}

export const CashFlowWidget: React.FC<CashFlowWidgetProps> = ({
  transactions = [],
  title = 'Cash Flow',
  timeframeLabel,
  excludeTransfers = true,
  defaultAggregation = 'monthly',
  defaultTimeframe = '1M',
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<CashFlowTimeframeKey>(
    defaultTimeframe || '1M',
  );
  const [aggregation, setAggregation] = useState<AggregationPeriod>(defaultAggregation);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const activeTimeframeObj = useMemo(
    () =>
      CASH_FLOW_TIMEFRAMES.find((t) => t.key === selectedTimeframe) ||
      CASH_FLOW_TIMEFRAMES[0],
    [selectedTimeframe],
  );

  // Filter transactions by selected timeframe unless external caller specifically provided timeframeLabel
  const activeTransactions = useMemo(() => {
    if (timeframeLabel) {
      return transactions;
    }
    if (selectedTimeframe === 'ALL' || !activeTimeframeObj.days) {
      return transactions;
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - activeTimeframeObj.days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return transactions.filter((tx) => (tx.date || '') >= cutoffStr);
  }, [transactions, selectedTimeframe, activeTimeframeObj, timeframeLabel]);

  const hasTransactions = activeTransactions && activeTransactions.length > 0;

  // Aggregate global totals & period buckets
  const {
    income,
    expenses,
    netCashFlow,
    isPositive,
    savingsRate,
    periodBuckets,
  } = useMemo(() => {
    let inc = 0;
    let exp = 0;

    // Bucket map: key -> { income: number, expenses: number, label: string, fullLabel: string, sortKey: string }
    const bucketMap = new Map<
      string,
      {
        income: number;
        expenses: number;
        label: string;
        fullLabel: string;
        sortKey: string;
      }
    >();

    activeTransactions.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      const isTransferOrPayment = isTransferOrCreditCardPayment(tx);

      if (excludeTransfers && isTransferOrPayment) {
        return;
      }

      const dateStr = tx.date || '';
      if (!dateStr || dateStr.length < 4) return;

      const year = dateStr.substring(0, 4);
      const monthStr = dateStr.length >= 7 ? dateStr.substring(5, 7) : '01';
      const monthNum = parseInt(monthStr, 10);

      let key = '';
      let label = '';
      let fullLabel = '';
      let sortKey = '';

      if (aggregation === 'monthly') {
        key = `${year}-${monthStr}`;
        sortKey = key;
        const dateObj = new Date(parseInt(year, 10), monthNum - 1, 1);
        label = dateObj.toLocaleDateString(undefined, { month: 'short' });
        const shortYear = year.slice(-2);
        label = `${label} '${shortYear}`;
        fullLabel = dateObj.toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        });
      } else if (aggregation === 'quarterly') {
        const quarter = Math.ceil(monthNum / 3);
        key = `${year}-Q${quarter}`;
        sortKey = `${year}-${quarter}`;
        const shortYear = year.slice(-2);
        label = `Q${quarter} '${shortYear}`;
        fullLabel = `Q${quarter} ${year}`;
      } else {
        // Yearly
        key = year;
        sortKey = year;
        label = year;
        fullLabel = `Year ${year}`;
      }

      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          income: 0,
          expenses: 0,
          label,
          fullLabel,
          sortKey,
        });
      }

      const b = bucketMap.get(key)!;

      if (amt < 0) {
        const val = Math.abs(amt);
        inc += val;
        b.income += val;
      } else if (amt > 0) {
        exp += amt;
        b.expenses += amt;
      }
    });

    const net = inc - exp;
    const rate = inc > 0 ? Math.max(0, Math.round((net / inc) * 100)) : 0;

    // Sort buckets chronologically
    const sorted = Array.from(bucketMap.entries())
      .sort((a, b) => a[1].sortKey.localeCompare(b[1].sortKey))
      .map(([key, data]) => ({
        key,
        ...data,
        net: data.income - data.expenses,
      }));

    // Limit visible bars appropriately (e.g. 12 months, 8 quarters, 6 years)
    const maxSlices =
      aggregation === 'monthly' ? 12 : aggregation === 'quarterly' ? 8 : 6;
    const visibleBuckets = sorted.slice(-maxSlices);

    return {
      income: inc,
      expenses: exp,
      netCashFlow: net,
      isPositive: net >= 0,
      savingsRate: rate,
      periodBuckets: visibleBuckets,
    };
  }, [activeTransactions, excludeTransfers, aggregation]);

  const maxBucketValue = useMemo(() => {
    let max = 100;
    periodBuckets.forEach((b) => {
      if (b.income > max) max = b.income;
      if (b.expenses > max) max = b.expenses;
    });
    return max;
  }, [periodBuckets]);

  const totalFlow = income + expenses;
  const incomePercent = totalFlow > 0 ? Math.round((income / totalFlow) * 100) : 50;
  const expensePercent = totalFlow > 0 ? 100 - incomePercent : 50;

  const hoveredBucket =
    hoveredIndex !== null && periodBuckets[hoveredIndex]
      ? periodBuckets[hoveredIndex]
      : null;

  return (
    <div className="glass-panel glass-panel-hover rounded-2xl p-4 sm:p-5 flex flex-col h-full min-w-0">
      {/* 1. Header */}
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 gap-2 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0 truncate font-bold text-slate-900 dark:text-white">
            <Scale className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
            <span className="truncate">{title}</span>
          </span>
          {timeframeLabel ? (
            <span
              className={`text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${
                hasTransactions
                  ? 'text-indigo-600 dark:text-indigo-300 bg-indigo-500/10 border-indigo-500/20'
                  : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60'
              }`}
            >
              {timeframeLabel}
            </span>
          ) : (
            <div className="flex items-center bg-slate-200/80 dark:bg-slate-900/90 p-0.5 rounded-lg border border-slate-300/80 dark:border-slate-800 gap-0.5 shrink-0">
              {CASH_FLOW_TIMEFRAMES.map((tf) => (
                <button
                  key={tf.key}
                  type="button"
                  onClick={() => setSelectedTimeframe(tf.key)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    selectedTimeframe === tf.key
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-300/40 dark:hover:bg-slate-800/40'
                  }`}
                  title={tf.fullLabel}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 2. Big Net Cash Flow Value */}
        <div
          className={`text-2xl sm:text-3xl font-extrabold tracking-tight mb-1 ${
            isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {isPositive ? '+' : '-'}${Math.abs(Math.floor(netCashFlow)).toLocaleString()}
          <span className="opacity-80 text-lg sm:text-xl font-medium">
            .{Math.abs(Math.round((netCashFlow % 1) * 100)).toString().padStart(2, '0')}
          </span>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          {hasTransactions ? (
            <>
              Savings rate: <span className="text-slate-800 dark:text-slate-300 font-semibold">{savingsRate}%</span>{' '}
              • {activeTransactions.length} transactions ({timeframeLabel || activeTimeframeObj.fullLabel})
              {excludeTransfers && ' (transfers excluded)'}
            </>
          ) : (
            'Connect bank account to calculate cash flow'
          )}
        </div>
      </div>

      {/* 3. Middle Section: Inflow vs Outflow Ratio & Dynamic Histogram */}
      <div className="flex-1 flex flex-col justify-between space-y-3.5 my-3 py-3 border-y border-slate-200/80 dark:border-slate-800/60">
        {/* Proportional Cash Flow Health Bar */}
        <div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Inflow {incomePercent}%</span>
            </span>
            <span className="text-slate-400 dark:text-slate-500 text-[10px]">Ratio: {incomePercent}:{expensePercent}</span>
            <span className="flex items-center gap-1.5">
              <span>Outflow {expensePercent}%</span>
              <span className="w-2 h-2 rounded-full bg-rose-500" />
            </span>
          </div>

          <div className="h-2 w-full bg-slate-200 dark:bg-slate-800/80 rounded-full overflow-hidden flex p-0.5 gap-0.5">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${incomePercent}%` }}
              title={`Inflow: $${income.toFixed(2)} (${incomePercent}%)`}
            />
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-full transition-all duration-500"
              style={{ width: `${expensePercent}%` }}
              title={`Outflow: $${expenses.toFixed(2)} (${expensePercent}%)`}
            />
          </div>
        </div>

        {/* Histogram Chart Section with Monthly / Quarterly / Yearly Controls */}
        <div className="pt-1">
          {/* Histogram Controls Bar */}
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-300">
                Cash Flow Histogram
              </span>
            </div>

            {/* Aggregation Toggle Pills: Monthly | Quarterly | Yearly */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-900/90 border border-slate-300/80 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAggregation('monthly')}
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                  aggregation === 'monthly'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-300/40 dark:hover:bg-slate-800/50'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setAggregation('quarterly')}
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                  aggregation === 'quarterly'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-300/40 dark:hover:bg-slate-800/50'
                }`}
              >
                Quarterly
              </button>
              <button
                type="button"
                onClick={() => setAggregation('yearly')}
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                  aggregation === 'yearly'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-300/40 dark:hover:bg-slate-800/50'
                }`}
              >
                Yearly
              </button>
            </div>
          </div>

          {/* Histogram Chart Canvas & Tooltip Container */}
          <div className="relative">
            {periodBuckets.length > 0 ? (
              <div className="flex items-end justify-between gap-1.5 sm:gap-2 h-24 pt-2 px-1">
                {periodBuckets.map((bucket, idx) => {
                  const incHeight = Math.max(
                    bucket.income > 0 ? 6 : 0,
                    Math.round((bucket.income / maxBucketValue) * 72),
                  );
                  const expHeight = Math.max(
                    bucket.expenses > 0 ? 6 : 0,
                    Math.round((bucket.expenses / maxBucketValue) * 72),
                  );
                  const isHovered = hoveredIndex === idx;

                  return (
                    <div
                      key={bucket.key}
                      className="flex-1 flex flex-col items-center gap-1 group relative cursor-pointer"
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      {/* Dual bars: Emerald Income + Rose Outflow */}
                      <div className="flex items-end justify-center gap-0.5 sm:gap-1 w-full h-18">
                        {/* Income Bar */}
                        <div
                          className={`w-2 sm:w-2.5 max-w-[12px] bg-emerald-500/80 rounded-t-sm transition-all duration-200 ${
                            isHovered
                              ? 'bg-emerald-400 shadow-sm shadow-emerald-500/50 scale-y-105 origin-bottom'
                              : 'group-hover:bg-emerald-400'
                          }`}
                          style={{ height: `${incHeight}px` }}
                        />
                        {/* Expense Bar */}
                        <div
                          className={`w-2 sm:w-2.5 max-w-[12px] bg-rose-500/80 rounded-t-sm transition-all duration-200 ${
                            isHovered
                              ? 'bg-rose-400 shadow-sm shadow-rose-500/50 scale-y-105 origin-bottom'
                              : 'group-hover:bg-rose-400'
                          }`}
                          style={{ height: `${expHeight}px` }}
                        />
                      </div>

                      {/* Period Label */}
                      <span
                        className={`text-[9px] sm:text-[10px] font-medium truncate max-w-full text-center transition-colors ${
                          isHovered ? 'text-indigo-300 font-bold' : 'text-slate-500 group-hover:text-slate-300'
                        }`}
                      >
                        {bucket.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-24 flex items-center justify-center text-xs text-slate-500">
                No histogram data available for this range
              </div>
            )}

            {/* Hover Tooltip Card */}
            {hoveredBucket && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 bg-slate-900/95 border border-slate-700/80 px-3 py-1.5 rounded-xl shadow-2xl backdrop-blur-sm pointer-events-none flex items-center gap-3 whitespace-nowrap animate-in fade-in duration-150">
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                    {hoveredBucket.fullLabel}
                  </span>
                  <div className="flex items-center gap-2.5 mt-0.5 text-[11px] font-bold">
                    <span className="text-emerald-400">
                      +${hoveredBucket.income.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-slate-600">/</span>
                    <span className="text-rose-400">
                      -${hoveredBucket.expenses.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-slate-600">|</span>
                    <span
                      className={
                        hoveredBucket.net >= 0 ? 'text-indigo-300' : 'text-rose-400'
                      }
                    >
                      {hoveredBucket.net >= 0 ? 'Net +' : 'Net -'}$
                      {Math.abs(hoveredBucket.net).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Histogram Legend */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium mt-1 px-1">
            <span className="italic text-[9px] text-slate-500">
              Hover bars for details
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-sm bg-emerald-400" /> Income
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2 h-2 rounded-sm bg-rose-400" /> Expenses
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Balanced 3-Column Summary Footer */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="p-2 rounded-xl bg-slate-100/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/60 flex flex-col justify-center">
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">Income</div>
          <div className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 truncate">
            ${income.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        </div>

        <div className="p-2 rounded-xl bg-slate-100/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/60 flex flex-col justify-center">
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">Outflows</div>
          <div className="text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-400 truncate">
            ${expenses.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        </div>

        <div className="p-2 rounded-xl bg-slate-100/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/60 flex flex-col justify-center">
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">Net Surplus</div>
          <div className={`text-xs sm:text-sm font-bold truncate ${isPositive ? 'text-indigo-600 dark:text-indigo-300' : 'text-rose-600 dark:text-rose-400'}`}>
            {isPositive ? '+' : '-'}${Math.abs(netCashFlow).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>
    </div>
  );
};

