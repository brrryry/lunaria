'use client';

import React, { useMemo, useState } from 'react';
import { TrendingUp, ArrowLeftRight } from 'lucide-react';
import {
  isTransferOrCreditCardPayment,
  resolveIncomeDisplayCategory,
} from '@/lib/transactions';
import { CashFlowPieChart } from './CashFlowPieChart';
import { CASH_FLOW_TIMEFRAMES, CashFlowTimeframeKey } from './CashFlowWidget';

interface IncomeBreakdownWidgetProps {
  transactions?: any[];
  timeframeLabel?: string;
  excludeTransfers?: boolean;
  defaultTimeframe?: CashFlowTimeframeKey;
}

const INCOME_PALETTE = [
  '#10b981', // Emerald
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#38bdf8', // Sky
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#84cc16', // Lime
  '#a855f7', // Purple
];

export const IncomeBreakdownWidget: React.FC<IncomeBreakdownWidgetProps> = ({
  transactions = [],
  timeframeLabel,
  excludeTransfers = true,
  defaultTimeframe = '1M',
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<CashFlowTimeframeKey>(
    defaultTimeframe || '1M',
  );

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

  const { items, totalIncome } = useMemo(() => {
    if (!activeTransactions || activeTransactions.length === 0) {
      return { items: [], totalIncome: 0 };
    }

    // Map: category -> { total: number, explanation?: string, sources: Map<string, { count: number; received: number }> }
    const catMap = new Map<
      string,
      {
        total: number;
        explanation?: string;
        sources: Map<string, { count: number; received: number }>;
      }
    >();

    transactions.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      // In Plaid convention, negative amounts are inflows / credits
      if (amt < 0) {
        const isTransferOrPayment = isTransferOrCreditCardPayment(tx);
        if (excludeTransfers && isTransferOrPayment) {
          return;
        }

        const value = Math.abs(amt);
        const { category: resolvedCat, explanation } = resolveIncomeDisplayCategory(tx);
        const sourceName = (tx.merchantName || tx.name || 'Source').trim();

        if (!catMap.has(resolvedCat)) {
          catMap.set(resolvedCat, {
            total: 0,
            explanation,
            sources: new Map(),
          });
        }

        const entry = catMap.get(resolvedCat)!;
        entry.total += value;
        if (explanation && !entry.explanation) {
          entry.explanation = explanation;
        }

        if (!entry.sources.has(sourceName)) {
          entry.sources.set(sourceName, { count: 0, received: 0 });
        }
        const s = entry.sources.get(sourceName)!;
        s.count += 1;
        s.received += value;
      }
    });

    const total = Array.from(catMap.values()).reduce((sum, c) => sum + c.total, 0);

    const entries = Array.from(catMap.entries())
      .map(([name, data], idx) => {
        const topSources = Array.from(data.sources.entries())
          .map(([sName, sData]) => ({
            name: sName,
            count: sData.count,
            value: sData.received,
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

        const percentage = total > 0 ? Math.round((data.total / total) * 100) : 0;

        return {
          id: name,
          label: name,
          value: data.total,
          percentage,
          explanation: data.explanation,
          color: INCOME_PALETTE[idx % INCOME_PALETTE.length],
          subItems: topSources,
        };
      })
      .sort((a, b) => b.value - a.value);

    return { items: entries, totalIncome: total };
  }, [activeTransactions, excludeTransfers]);

  const timeframeSelector = !timeframeLabel ? (
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
  ) : null;

  return (
    <CashFlowPieChart
      title="Income by Source"
      icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
      items={items}
      totalValue={totalIncome}
      timeframeLabel={timeframeLabel}
      timeframeSelector={timeframeSelector}
      emptyMessage="No income or deposit transactions recorded in this period"
      accentColor="text-emerald-400"
    />
  );
};
