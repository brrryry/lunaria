'use client';

import React from 'react';
import { Landmark, ArrowRight, ReceiptText, ArrowLeftRight } from 'lucide-react';
import { isTransferOrCreditCardPayment } from '@/lib/transactions';

interface RecentTransactionsWidgetProps {
  transactions?: any[];
  onViewAll?: () => void;
}

export const RecentTransactionsWidget: React.FC<RecentTransactionsWidgetProps> = ({
  transactions = [],
  onViewAll,
}) => {
  const hasLive = transactions && transactions.length > 0;
  const displayItems = hasLive ? transactions.slice(0, 6) : [];

  return (
    <div className="glass-panel glass-panel-hover rounded-2xl p-4 sm:p-6 flex flex-col h-full min-w-0">
      <div className="flex items-start justify-between gap-3 mb-4 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              Recent Transactions
            </h3>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${
                hasLive
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60'
              }`}
            >
              {hasLive ? `${transactions.length} Synced` : 'No Transactions'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
            {hasLive
              ? 'Latest synced charges and deposits'
              : 'Link an account to view recent activity'}
          </p>
        </div>

        <button
          type="button"
          onClick={onViewAll}
          className="shrink-0 flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors cursor-pointer whitespace-nowrap pt-0.5"
        >
          <span>View All</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2 flex-1 max-h-[300px] overflow-y-auto pr-1">
        {!hasLive ? (
          <div className="flex flex-col items-center justify-center text-center py-12 space-y-2 border border-dashed border-slate-200 dark:border-slate-800/80 rounded-xl bg-slate-50/50 dark:bg-slate-950/20">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500">
              <ReceiptText className="w-4 h-4" />
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">No transactions recorded</div>
            <p className="text-[11px] text-slate-500 max-w-[200px]">
              Connect a bank account to pull live transaction feeds.
            </p>
          </div>
        ) : (
          displayItems.map((tx) => {
            const rawAmount = Number(tx.amount) || 0;
            const isTransfer = isTransferOrCreditCardPayment(tx);
            const isIncome = rawAmount < 0 && !isTransfer;
            const displayAmount = Math.abs(rawAmount).toFixed(2);

            return (
              <div
                key={tx.id || tx.plaidTransactionId}
                onClick={onViewAll}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100/70 dark:hover:bg-slate-800/40 border border-transparent hover:border-slate-200 dark:hover:border-slate-800 transition-all cursor-pointer min-w-0 gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                      isTransfer
                        ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                        : isIncome
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60'
                    }`}
                  >
                    {isTransfer ? (
                      <ArrowLeftRight className="w-4 h-4" />
                    ) : (
                      <Landmark className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-200 truncate">
                      {tx.name || tx.merchantName}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5 truncate">
                      <span>{tx.category || 'General'}</span>
                      {tx.account && (
                        <>
                          <span>•</span>
                          <span className="truncate">{tx.account}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right flex-shrink-0 ml-1">
                  <div
                    className={`text-xs font-bold ${
                      isTransfer
                        ? 'text-slate-700 dark:text-slate-300'
                        : isIncome
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-900 dark:text-slate-200'
                    }`}
                  >
                    {isTransfer
                      ? `${rawAmount < 0 ? '+' : '-'}$${displayAmount}`
                      : `${isIncome ? '+' : '-'}$${displayAmount}`}
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center justify-end gap-1">
                    {isTransfer && (
                      <span className="text-[9px] text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1 py-0.2 rounded font-medium">
                        Transfer
                      </span>
                    )}
                    <span>{tx.date}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {hasLive && (
        <div className="pt-3 mt-3 border-t border-slate-200/80 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
          <span>Displaying {displayItems.length} of {transactions.length} records</span>
          <button
            type="button"
            onClick={onViewAll}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>Full ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
