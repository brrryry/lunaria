'use client';

import React, { useMemo, useState } from 'react';
import { PieChart, TrendingUp, ArrowLeftRight } from 'lucide-react';
import {
  isTransferOrCreditCardPayment,
  resolveIncomeDisplayCategory,
} from '@/lib/transactions';
import { CashFlowPieChart } from './CashFlowPieChart';
import { CASH_FLOW_TIMEFRAMES, CashFlowTimeframeKey } from './CashFlowWidget';

const EXPENSE_PALETTE = [
  '#6366f1', // Indigo
  '#38bdf8', // Sky
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#a855f7', // Purple
  '#14b8a6', // Teal
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
];

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

/**
 * Normalizes vague aggregator categories (like Plaid's generic "Services")
 * into clear, actionable categories based on subCategory and merchant clues.
 */
export function resolveDisplayCategory(tx: {
  category?: string | null;
  subCategory?: string | null;
  name?: string | null;
  merchantName?: string | null;
}): { category: string; explanation?: string } {
  const rawCat = (tx.category || '').trim();
  const rawSub = (tx.subCategory || '').trim();
  const merchant = (tx.merchantName || tx.name || '').trim().toLowerCase();

  // If category is generic "Services" or "Service" or "GENERAL_SERVICES"
  if (/^(services?|general_services?)$/i.test(rawCat)) {
    if (rawSub && !/^(services?|general_services?|other)$/i.test(rawSub)) {
      if (/streaming|subscription/i.test(rawSub)) {
        return { category: 'Subscriptions & Streaming', explanation: 'Recurring media and streaming entertainment' };
      }
      if (/telecommunication|cable|internet|phone|cellular/i.test(rawSub)) {
        return { category: 'Utilities & Telecom', explanation: 'Mobile, internet, and communication bills' };
      }
      if (/automotive|car|repair/i.test(rawSub)) {
        return { category: 'Auto & Transport', explanation: 'Vehicle service, parking, and transit' };
      }
      if (/personal care|beauty|fitness|gym|hair/i.test(rawSub)) {
        return { category: 'Personal Care & Fitness', explanation: 'Gyms, grooming, salons, and wellness' };
      }
      if (/software|cloud|hosting|tech|developer/i.test(rawSub)) {
        return { category: 'Software & Tech Services', explanation: 'Developer tools, cloud hosting, and productivity apps' };
      }
      if (/financial|accounting|legal|tax/i.test(rawSub)) {
        return { category: 'Financial & Professional', explanation: 'Advisors, legal, and financial services' };
      }
      if (/home|cleaning|maintenance|laundry/i.test(rawSub)) {
        return { category: 'Home & Maintenance', explanation: 'House cleaning, yard care, and maintenance' };
      }
      const titleCaseSub = rawSub.charAt(0).toUpperCase() + rawSub.slice(1);
      return { category: `${titleCaseSub} Services`, explanation: `Services categorized under ${rawSub}` };
    }

    // Infer from merchant if subCategory is empty
    if (/netflix|spotify|hulu|disney|apple\.com\/bill|google \*|prime|hbo|youtube|patreon|crunchyroll/i.test(merchant)) {
      return { category: 'Subscriptions & Streaming', explanation: 'Recurring media, streaming, and app subscriptions' };
    }
    if (/openai|chatgpt|anthropic|github|aws|digitalocean|heroku|adobe|dropbox|slack|notion|vercel/i.test(merchant)) {
      return { category: 'Software & Tech Services', explanation: 'Developer tools, cloud hosting, and digital services' };
    }
    if (/verizon|at&t|t-mobile|comcast|xfinity|spectrum|coned|electric|water|gas|utility/i.test(merchant)) {
      return { category: 'Utilities & Telecom', explanation: 'Internet, mobile, and utility providers' };
    }

    return {
      category: 'Subscriptions & Services',
      explanation: 'SaaS, digital subscriptions, utility bills, and personal services',
    };
  }

  // Normalizations for other Plaid codes
  if (/^general_merchandise$/i.test(rawCat)) return { category: 'General Shopping' };
  if (/^food_and_drink$/i.test(rawCat)) return { category: 'Food & Dining' };
  if (/^transportation$/i.test(rawCat)) return { category: 'Transportation' };
  if (/^rent_and_utilities$/i.test(rawCat)) return { category: 'Housing & Utilities' };
  if (/^loan_payments$/i.test(rawCat)) return { category: 'Loan Payments' };

  return { category: rawCat || 'General' };
}

interface SpendingBreakdownWidgetProps {
  transactions?: any[];
  timeframeLabel?: string;
  excludeTransfers?: boolean;
  defaultTimeframe?: CashFlowTimeframeKey;
  allowTypeToggle?: boolean;
}

export const SpendingBreakdownWidget: React.FC<SpendingBreakdownWidgetProps> = ({
  transactions = [],
  timeframeLabel,
  excludeTransfers: propExcludeTransfers,
  defaultTimeframe = '1M',
  allowTypeToggle = true,
}) => {
  const [internalExcludeTransfers, setInternalExcludeTransfers] = useState(true);
  const excludeTransfers =
    propExcludeTransfers !== undefined ? propExcludeTransfers : internalExcludeTransfers;

  const [selectedTimeframe, setSelectedTimeframe] = useState<CashFlowTimeframeKey>(
    defaultTimeframe || '1M',
  );
  const [flowType, setFlowType] = useState<'expenses' | 'income'>('expenses');

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

  const { items, totalAmount } = useMemo(() => {
    if (!activeTransactions || activeTransactions.length === 0) {
      return { items: [], totalAmount: 0 };
    }

    if (flowType === 'expenses') {
      const catMap = new Map<
        string,
        {
          total: number;
          explanation?: string;
          merchants: Map<string, { count: number; spent: number }>;
        }
      >();

      activeTransactions.forEach((tx) => {
        const amt = Number(tx.amount) || 0;
        if (amt > 0) {
          const isTransferOrPayment = isTransferOrCreditCardPayment(tx);
          if (excludeTransfers && isTransferOrPayment) {
            return;
          }

          const { category: resolvedCat, explanation } = resolveDisplayCategory(tx);
          const merchantName = (tx.merchantName || tx.name || 'Merchant').trim();

          if (!catMap.has(resolvedCat)) {
            catMap.set(resolvedCat, {
              total: 0,
              explanation,
              merchants: new Map(),
            });
          }

          const entry = catMap.get(resolvedCat)!;
          entry.total += amt;
          if (explanation && !entry.explanation) {
            entry.explanation = explanation;
          }

          if (!entry.merchants.has(merchantName)) {
            entry.merchants.set(merchantName, { count: 0, spent: 0 });
          }
          const m = entry.merchants.get(merchantName)!;
          m.count += 1;
          m.spent += amt;
        }
      });

      const total = Array.from(catMap.values()).reduce((sum, c) => sum + c.total, 0);

      const entries = Array.from(catMap.entries())
        .map(([name, data], idx) => {
          const topMerchants = Array.from(data.merchants.entries())
            .map(([mName, mData]) => ({
              name: mName,
              count: mData.count,
              value: mData.spent,
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
            color: EXPENSE_PALETTE[idx % EXPENSE_PALETTE.length],
            subItems: topMerchants,
          };
        })
        .sort((a, b) => b.value - a.value);

      return { items: entries, totalAmount: total };
    } else {
      // Income calculations
      const catMap = new Map<
        string,
        {
          total: number;
          explanation?: string;
          sources: Map<string, { count: number; received: number }>;
        }
      >();

      activeTransactions.forEach((tx) => {
        const amt = Number(tx.amount) || 0;
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

      return { items: entries, totalAmount: total };
    }
  }, [activeTransactions, excludeTransfers, flowType]);

  const titleControl = allowTypeToggle ? (
    <div className="flex items-center bg-slate-200/80 dark:bg-slate-900/90 p-0.5 rounded-lg border border-slate-300/80 dark:border-slate-800 gap-0.5 shrink-0">
      <button
        type="button"
        onClick={() => setFlowType('expenses')}
        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
          flowType === 'expenses'
            ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
        }`}
      >
        Expenses
      </button>
      <button
        type="button"
        onClick={() => setFlowType('income')}
        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
          flowType === 'income'
            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
        }`}
      >
        Income
      </button>
    </div>
  ) : null;

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

  const secondaryAction = (
    <button
      type="button"
      onClick={() => setInternalExcludeTransfers(!excludeTransfers)}
      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
        excludeTransfers
          ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
      }`}
      title={
        excludeTransfers
          ? 'Excluding internal transfers & card payments to calculate true living expenditures'
          : 'Showing all cash outflows including transfers and credit card payments'
      }
    >
      <ArrowLeftRight className="w-3 h-3" />
      <span>{excludeTransfers ? 'True Spending' : 'All Outflows'}</span>
    </button>
  );

  return (
    <CashFlowPieChart
      title={flowType === 'expenses' ? 'Expenses' : 'Income'}
      icon={
        flowType === 'expenses' ? (
          <PieChart className="w-4 h-4 text-rose-400" />
        ) : (
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        )
      }
      items={items}
      totalValue={totalAmount}
      timeframeLabel={timeframeLabel}
      timeframeSelector={timeframeSelector}
      titleControl={titleControl}
      emptyMessage={
        flowType === 'expenses'
          ? 'No expense transactions recorded in this period'
          : 'No income or deposit transactions recorded in this period'
      }
      accentColor={flowType === 'expenses' ? 'text-rose-400' : 'text-emerald-400'}
      secondaryAction={propExcludeTransfers === undefined ? secondaryAction : undefined}
    />
  );
};

