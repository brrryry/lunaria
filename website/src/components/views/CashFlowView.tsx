'use client';

import React, { useState, useMemo } from 'react';
import {
  ArrowLeftRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Layers,
  Info,
  PieChart,
} from 'lucide-react';
import { CashFlowWidget } from '../widgets/CashFlowWidget';
import { SpendingBreakdownWidget } from '../widgets/SpendingBreakdownWidget';
import { isTransferOrCreditCardPayment } from '@/lib/transactions';

interface CashFlowViewProps {
  transactions?: any[];
}

const TIMEFRAMES = [
  { key: '1M', label: 'Past Month', days: 30 },
  { key: '3M', label: 'Past 3M', days: 90 },
  { key: '6M', label: 'Past 6M', days: 180 },
  { key: '1Y', label: 'Past 1Y', days: 365 },
  { key: 'ALL', label: 'All Time', days: null },
] as const;

type TimeframeKey = (typeof TIMEFRAMES)[number]['key'];

export const CashFlowView: React.FC<CashFlowViewProps> = ({
  transactions = [],
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframeKey>('1M');
  const [excludeTransfers, setExcludeTransfers] = useState<boolean>(true);

  const activeTimeframeObj = useMemo(
    () => TIMEFRAMES.find((t) => t.key === selectedTimeframe) || TIMEFRAMES[0],
    [selectedTimeframe],
  );

  // Filter transactions by selected timeframe
  const filteredTransactions = useMemo(() => {
    if (selectedTimeframe === 'ALL' || !activeTimeframeObj.days) {
      return transactions;
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - activeTimeframeObj.days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return transactions.filter((tx) => (tx.date || '') >= cutoffStr);
  }, [transactions, selectedTimeframe, activeTimeframeObj]);

  // Compute income and expenses from filtered transactions
  const { income, spent, netSurplus, savingsRate, excludedTransfersAmount } =
    useMemo(() => {
      let inc = 0;
      let exp = 0;
      let excluded = 0;

      filteredTransactions.forEach((tx) => {
        const amt = Number(tx.amount) || 0;
        const isTransferOrPayment = isTransferOrCreditCardPayment(tx);

        if (excludeTransfers && isTransferOrPayment) {
          excluded += Math.abs(amt);
          return;
        }

        if (amt < 0) {
          inc += Math.abs(amt);
        } else if (amt > 0) {
          exp += amt;
        }
      });

      const surplus = inc - exp;
      const rate = inc > 0 ? Math.max(0, Math.round((surplus / inc) * 100)) : 0;

      return {
        income: inc,
        spent: exp,
        netSurplus: surplus,
        savingsRate: rate,
        excludedTransfersAmount: excluded,
      };
    }, [filteredTransactions, excludeTransfers]);

  // Average monthly spend if timeframe spans multiple months
  const monthsSpan = useMemo(() => {
    if (selectedTimeframe === '1M') return 1;
    if (selectedTimeframe === '3M') return 3;
    if (selectedTimeframe === '6M') return 6;
    if (selectedTimeframe === '1Y') return 12;

    // For ALL: calculate actual distinct months in filtered dataset
    const months = new Set(
      filteredTransactions
        .map((t) => (t.date ? t.date.substring(0, 7) : ''))
        .filter(Boolean),
    );
    return Math.max(1, months.size);
  }, [selectedTimeframe, filteredTransactions]);

  const monthlyAverageSpent = spent / monthsSpan;
  const monthlyAverageEarned = income / monthsSpan;

  return (
    <div className="space-y-6 animate-in fade-in duration-200 w-full max-w-full overflow-x-hidden min-w-0">
      {/* View Header with Timeframe Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <ArrowLeftRight className="w-6 h-6 text-sky-500 dark:text-sky-400" />
            <span>Cash Flow Analytics</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Track real income vs. living expenses, eliminate transfer distortions, and inspect category merchants.
          </p>
        </div>

        {/* Controls: Timeframe Filter + Transfer Filter */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 self-start sm:self-auto min-w-0 max-w-full">
          {/* Timeframe Pills */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-inner max-w-full overflow-x-auto">
            {TIMEFRAMES.map((tf) => {
              const isActive = selectedTimeframe === tf.key;
              return (
                <button
                  key={tf.key}
                  type="button"
                  onClick={() => setSelectedTimeframe(tf.key)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/60'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  {tf.key}
                </button>
              );
            })}
          </div>

          {/* Transfers Toggle */}
          <button
            type="button"
            onClick={() => setExcludeTransfers(!excludeTransfers)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              excludeTransfers
                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/20'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
            title={
              excludeTransfers
                ? 'Credit card payments and checking transfers are excluded to avoid double counting'
                : 'Showing all raw bank movements including card payments'
            }
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{excludeTransfers ? 'True Expenses' : 'All Outflows'}</span>
          </button>
        </div>
      </div>

      {/* Accuracy Helper Notice when transfers are excluded */}
      {excludeTransfers && excludedTransfersAmount > 0 && (
        <div className="px-4 py-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
            <span>
              <strong>Accurate Cash Flow:</strong> Filtered out ${excludedTransfersAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} in credit card bill payments and account transfers to prevent double counting.
            </span>
          </div>
          <span className="text-slate-500 hidden sm:inline">
            Showing {filteredTransactions.length} transactions across {activeTimeframeObj.label}
          </span>
        </div>
      )}

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Earned */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Earned</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">
            ${income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {monthsSpan > 1 ? `~$${monthlyAverageEarned.toFixed(0)}/mo average` : `${activeTimeframeObj.label} deposits & income`}
          </p>
        </div>

        {/* Total Spent */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Spent</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2">
            ${spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {monthsSpan > 1 ? `~$${monthlyAverageSpent.toFixed(0)}/mo average` : `${activeTimeframeObj.label} living expenses`}
          </p>
        </div>

        {/* Net Cash Flow */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Net Cash Flow</span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                netSurplus >= 0
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}
            >
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-2xl font-extrabold mt-2 ${
              netSurplus >= 0 ? 'text-indigo-600 dark:text-indigo-300' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {netSurplus >= 0 ? '+' : '-'}${Math.abs(netSurplus).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {netSurplus >= 0 ? 'Net positive surplus' : 'Net cash deficit'}
          </p>
        </div>

        {/* Savings Rate */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Savings Rate</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-300 mt-2">
            {savingsRate}%
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Portion of earned income retained
          </p>
        </div>
      </div>

      {/* 1. Primary Histogram Chart (Monthly, Quarterly, Yearly) */}
      <div className="w-full">
        <CashFlowWidget
          transactions={filteredTransactions}
          title={`${activeTimeframeObj.label} Cash Flow Dynamics`}
          timeframeLabel={activeTimeframeObj.label}
          excludeTransfers={excludeTransfers}
        />
      </div>

      {/* 2. Breakdown Section: Expenses & Income Distribution Pie Chart */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <span>Cash Flow Distribution</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Interactive breakdown of living expenses and income streams for {activeTimeframeObj.label.toLowerCase()}.
            </p>
          </div>
        </div>

        <div className="w-full">
          <SpendingBreakdownWidget
            transactions={filteredTransactions}
            timeframeLabel={activeTimeframeObj.label}
            excludeTransfers={excludeTransfers}
          />
        </div>
      </div>
    </div>
  );
};

