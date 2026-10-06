'use client';

import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Tag,
  ArrowRight,
  Filter,
  Sparkles,
} from 'lucide-react';

interface TransactionsReviewWidgetProps {
  unreviewedTransactions: any[];
  onSelectTransactionToCategorize: (tx: any) => void;
  isFilterActive: boolean;
  onToggleReviewFilter: () => void;
}

export const TransactionsReviewWidget: React.FC<TransactionsReviewWidgetProps> = ({
  unreviewedTransactions = [],
  onSelectTransactionToCategorize,
  isFilterActive,
  onToggleReviewFilter,
}) => {
  const count = unreviewedTransactions.length;

  const totalAmount = unreviewedTransactions
    .filter((tx) => Number(tx.amount) > 0)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

  if (count === 0) {
    return (
      <div className="p-4 rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/20 border border-emerald-500/30 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-4 transition-all shadow-xs dark:shadow-none">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 dark:bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
              <span>All caught up!</span>
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </h4>
            <p className="text-xs text-emerald-700/90 dark:text-emerald-400/80 font-medium">
              All transactions have been categorized. Your budgets and analytics are fully synchronized.
            </p>
          </div>
        </div>
        <div className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-500/15 dark:bg-emerald-500/10 border border-emerald-500/30 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 shrink-0">
          0 Pending Review
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-50 to-white dark:from-amber-950/30 dark:via-slate-900/90 dark:to-slate-900/90 border border-amber-500/30 shadow-md dark:shadow-lg dark:shadow-amber-950/10 space-y-4 min-w-0 max-w-full overflow-hidden transition-colors duration-150">
      {/* Widget Header */}
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
          <div className="w-9 sm:w-10 h-9 sm:h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Transactions to Review
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                {count} {count === 1 ? 'item' : 'items'}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2 sm:line-clamp-none">
              Assign categories to these transactions to train automatic merchant rules and update budgets.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
              Total to Review
            </span>
            <span className="text-sm font-extrabold text-amber-600 dark:text-amber-300">
              ${totalAmount.toFixed(2)}
            </span>
          </div>

          <button
            onClick={onToggleReviewFilter}
            className={`px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              isFilterActive
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold'
                : 'bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-800 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:border-amber-500 shadow-xs'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{isFilterActive ? 'Showing To Review' : 'Filter Table'}</span>
          </button>
        </div>
      </div>

      {/* Quick Action Preview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1 min-w-0">
        {unreviewedTransactions.slice(0, 3).map((tx) => {
          const merchant = tx.merchantName || tx.name || 'Unknown Merchant';
          const amount = Number(tx.amount) || 0;

          return (
            <div
              key={tx.id}
              onClick={() => onSelectTransactionToCategorize(tx)}
              className="p-3 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 hover:bg-amber-50/40 dark:hover:bg-slate-850 cursor-pointer transition-all flex items-center justify-between gap-3 group min-w-0 shadow-xs dark:shadow-none"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors">
                    {merchant}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                  <span>{tx.date}</span>
                  <span>•</span>
                  <span className="text-amber-600 dark:text-amber-400/90 font-medium">Uncategorized</span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-200">
                  ${Math.abs(amount).toFixed(2)}
                </div>
                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                  <Tag className="w-3 h-3" />
                  <span>Assign</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
