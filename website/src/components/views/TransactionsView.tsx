'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  Landmark,
  Calendar,
  Tag,
  ReceiptText,
  ChevronDown,
  Clock,
  RotateCcw,
  ArrowLeftRight,
} from 'lucide-react';
import { isTransferOrCreditCardPayment } from '@/lib/transactions';
import { CategoryPickerModal } from '../CategoryPickerModal';
import { TransactionsReviewWidget } from '../TransactionsReviewWidget';
import type { Category } from '@lunaria/types';

interface TransactionsViewProps {
  transactions: any[];
  accounts: any[];
  onTransactionsUpdated?: () => void;
}

type DateFilterOption = 'all' | '7d' | '30d' | 'quarter' | 'year' | 'custom';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions = [],
  accounts = [],
  onTransactionsUpdated,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [selectedTxForCategory, setSelectedTxForCategory] = useState<any | null>(null);
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);

  const getHeaders = () => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('lunaria_token')
        : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  // Fetch available categories from backend
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/categories`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setCategoriesList(data || []);
      }
    } catch (err) {
      console.warn('Could not fetch categories from backend:', err);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Compute date range boundaries based on selected option
  const dateRange = useMemo(() => {
    const now = new Date();
    const toYMD = (d: Date) => d.toISOString().split('T')[0];

    switch (dateFilter) {
      case '7d': {
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { start: toYMD(start), end: toYMD(now), label: 'Last 7 Days' };
      }
      case '30d': {
        const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { start: toYMD(start), end: toYMD(now), label: 'Last Month' };
      }
      case 'quarter': {
        const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        return { start: toYMD(start), end: toYMD(now), label: 'Last Quarter' };
      }
      case 'year': {
        const start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        return { start: toYMD(start), end: toYMD(now), label: 'Last Year' };
      }
      case 'custom': {
        return {
          start: customStartDate || null,
          end: customEndDate || null,
          label:
            customStartDate && customEndDate
              ? `${customStartDate} to ${customEndDate}`
              : 'Custom Range',
        };
      }
      case 'all':
      default:
        return { start: null, end: null, label: 'All Time' };
    }
  }, [dateFilter, customStartDate, customEndDate]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    categoriesList.forEach((c) => set.add(c.name));
    return Array.from(set);
  }, [transactions, categoriesList]);

  const unreviewedTransactions = useMemo(() => {
    return transactions.filter(
      (t) =>
        !t.category ||
        t.category.toLowerCase() === 'uncategorized' ||
        t.category.toLowerCase() === 'general',
    );
  }, [transactions]);

  // Filter transactions by search, category, account, date range, and review status
  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const nameMatch =
        (tx.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.merchantName || '').toLowerCase().includes(searchTerm.toLowerCase());

      const catMatch =
        selectedCategory === 'all' || tx.category === selectedCategory;

      const accMatch =
        selectedAccount === 'all' ||
        tx.accountId === selectedAccount ||
        tx.account === selectedAccount;

      const dateMatch =
        (!dateRange.start || (tx.date && tx.date >= dateRange.start)) &&
        (!dateRange.end || (tx.date && tx.date <= dateRange.end));

      const reviewMatch =
        !needsReviewOnly ||
        !tx.category ||
        tx.category.toLowerCase() === 'uncategorized' ||
        tx.category.toLowerCase() === 'general';

      return nameMatch && catMatch && accMatch && dateMatch && reviewMatch;
    });
  }, [
    transactions,
    searchTerm,
    selectedCategory,
    selectedAccount,
    dateRange,
    needsReviewOnly,
  ]);

  const totalSpent = filtered
    .filter((t) => Number(t.amount) > 0)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalIncome = filtered
    .filter((t) => Number(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

  const handleSelectCategory = async (
    newCategory: string,
    applyToAllMerchant: boolean,
  ) => {
    if (!selectedTxForCategory) return;

    try {
      const res = await fetch(
        `${API_BASE}/transactions/${selectedTxForCategory.id}/category`,
        {
          method: 'PATCH',
          headers: getHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            category: newCategory,
            applyToAllMerchant,
          }),
        },
      );

      if (res.ok && onTransactionsUpdated) {
        onTransactionsUpdated();
      }
    } catch (err) {
      console.error('Failed to update category:', err);
    }
  };

  const handleCreateCategory = async (
    name: string,
    group: string,
    color: string,
  ): Promise<Category | null> => {
    try {
      const res = await fetch(`${API_BASE}/categories`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ name, group, color }),
      });

      if (res.ok) {
        const created: Category = await res.json();
        setCategoriesList((prev) => [...prev, created]);
        return created;
      }
    } catch (err) {
      console.error('Failed to create category:', err);
    }
    return null;
  };

  const isFiltered =
    searchTerm !== '' ||
    selectedCategory !== 'all' ||
    selectedAccount !== 'all' ||
    dateFilter !== 'all';

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedAccount('all');
    setDateFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setNeedsReviewOnly(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 max-w-full overflow-x-hidden">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <ReceiptText className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
            <span>Transactions</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>
              Showing {filtered.length} of {transactions.length} synced transactions
            </span>
            {dateFilter !== 'all' && (
              <>
                <span>•</span>
                <span className="text-indigo-600 dark:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 font-medium">
                  {dateRange.label}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Quick totals for filtered period */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3 w-full sm:w-auto min-w-0">
          <div className="px-3 py-2 rounded-xl bg-slate-100/80 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs min-w-0">
            <span className="text-slate-500 block text-[10px] font-semibold uppercase truncate">
              Outflow ({dateRange.label})
            </span>
            <span className="font-bold text-slate-900 dark:text-slate-200 truncate block">${totalSpent.toFixed(2)}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-slate-100/80 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs min-w-0">
            <span className="text-slate-500 block text-[10px] font-semibold uppercase truncate">
              Inflow ({dateRange.label})
            </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 truncate block">+${totalIncome.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Transactions to Review Widget */}
      <TransactionsReviewWidget
        unreviewedTransactions={unreviewedTransactions}
        onSelectTransactionToCategorize={(tx) => setSelectedTxForCategory(tx)}
        isFilterActive={needsReviewOnly}
        onToggleReviewFilter={() => setNeedsReviewOnly((prev) => !prev)}
      />

      {/* Filter Toolbar */}
      <div className="glass-panel rounded-2xl p-3 sm:p-4 space-y-3 min-w-0 max-w-full overflow-hidden">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search merchant, store, or description..."
              className="w-full bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all shadow-sm"
            />
          </div>

          {/* Filter Dropdowns Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center min-w-0 w-full lg:w-auto">
            {/* Date Range Preset Filter */}
            <div className="flex items-center justify-between gap-1.5 px-3 py-2 bg-white dark:bg-[#0f1422] hover:bg-slate-50 dark:hover:bg-[#13192b] border border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl text-xs text-slate-800 dark:text-slate-200 min-w-0 shadow-sm transition-all group">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Clock className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as DateFilterOption)}
                  className="bg-transparent focus:outline-none text-slate-800 dark:text-slate-100 font-medium cursor-pointer text-xs w-full min-w-0 truncate pr-1"
                >
                  <option value="all" className="bg-white dark:bg-[#0f1422] text-slate-900 dark:text-slate-100 py-1.5">All Time</option>
                  <option value="7d" className="bg-white dark:bg-[#0f1422] text-slate-900 dark:text-slate-100 py-1.5">Last 7 Days</option>
                  <option value="30d" className="bg-white dark:bg-[#0f1422] text-slate-900 dark:text-slate-100 py-1.5">Last Month</option>
                  <option value="quarter" className="bg-white dark:bg-[#0f1422] text-slate-900 dark:text-slate-100 py-1.5">Last Quarter</option>
                  <option value="year" className="bg-white dark:bg-[#0f1422] text-slate-900 dark:text-slate-100 py-1.5">Last Year</option>
                  <option value="custom" className="bg-white dark:bg-[#0f1422] text-slate-900 dark:text-slate-100 py-1.5">Custom Range</option>
                </select>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 pointer-events-none group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors" />
            </div>

            {/* Category Filter */}
            <div className="flex items-center justify-between gap-1.5 px-3 py-2 bg-white dark:bg-[#0f1422] hover:bg-slate-50 dark:hover:bg-[#13192b] border border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl text-xs text-slate-800 dark:text-slate-200 min-w-0 shadow-sm transition-all group">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-transparent focus:outline-none text-slate-800 dark:text-slate-100 font-medium cursor-pointer text-xs w-full min-w-0 truncate pr-1"
                >
                  <option value="all" className="bg-white dark:bg-[#0f1422] text-slate-900 dark:text-slate-100 py-1.5">All Categories ({categories.length})</option>
                  {categories.map((c) => (
                    <option key={c} value={c} className="bg-white dark:bg-[#0f1422] text-slate-900 dark:text-slate-100 py-1.5">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 pointer-events-none group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors" />
            </div>

            {/* Account Filter */}
            {accounts.length > 0 ? (
              <div className="flex items-center justify-between gap-1.5 px-3 py-2 bg-white dark:bg-[#0f1422] hover:bg-slate-50 dark:hover:bg-[#13192b] border border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl text-xs text-slate-800 dark:text-slate-200 min-w-0 shadow-sm transition-all group">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="bg-transparent focus:outline-none text-slate-900 dark:text-slate-100 font-medium cursor-pointer text-xs w-full min-w-0 truncate pr-1"
                  >
                    <option value="all" className="bg-white dark:bg-[#0f1422] text-slate-900 dark:text-slate-100 py-1.5">All Accounts ({accounts.length})</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id} className="bg-white dark:bg-[#0f1422] text-slate-900 dark:text-slate-100 py-1.5">
                        {a.name} ({a.mask ? `••• ${a.mask}` : a.institutionName})
                      </option>
                    ))}
                  </select>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 pointer-events-none group-hover:text-slate-200 transition-colors" />
              </div>
            ) : null}
          </div>

          {/* Reset Filter Button */}
          {isFiltered && (
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-[#0f1422] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 transition-all shadow-sm self-start sm:self-auto shrink-0 cursor-pointer"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Custom Date Pickers (Shown only when Custom Date Range is selected) */}
        {dateFilter === 'custom' && (
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-3 text-xs animate-in fade-in duration-150 min-w-0">
            <span className="text-slate-400 font-medium">Custom Range:</span>
            <div className="flex items-center gap-2 min-w-0">
              <label className="text-slate-500 text-[11px] shrink-0">From:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs max-w-[140px]"
              />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <label className="text-slate-500 text-[11px] shrink-0">To:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs max-w-[140px]"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                type="button"
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className="text-[11px] text-slate-400 hover:text-white underline shrink-0"
              >
                Clear Dates
              </button>
            )}
          </div>
        )}
      </div>

      {/* Transactions Table / List */}
      <div className="glass-panel rounded-2xl overflow-hidden min-w-0 max-w-full">
        <div className="divide-y divide-slate-200/80 dark:divide-slate-800/60">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs space-y-2">
              <ReceiptText className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto" />
              <div className="font-semibold text-slate-600 dark:text-slate-400">No transactions to display</div>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                {transactions.length === 0
                  ? 'Connect a bank account to pull your transactions.'
                  : isFiltered
                  ? 'No transactions match the selected date range or filter criteria.'
                  : 'No transactions found.'}
              </p>
              {isFiltered && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600/25 border border-indigo-500/30 text-xs font-semibold transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All Filters</span>
                </button>
              )}
            </div>
          ) : (
            filtered.map((tx) => {
              const rawAmount = Number(tx.amount) || 0;
              const isTransfer = isTransferOrCreditCardPayment(tx);
              const isIncome = rawAmount < 0 && !isTransfer;
              const displayAmount = Math.abs(rawAmount).toFixed(2);

              return (
                <div
                  key={tx.id || tx.plaidTransactionId}
                  className="flex items-center justify-between p-3 sm:p-4 hover:bg-slate-100/60 dark:hover:bg-slate-800/30 transition-colors gap-2 min-w-0"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <div className="w-8 sm:w-10 h-8 sm:h-10 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                      {isTransfer ? (
                        <ArrowLeftRight className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                      ) : isIncome ? (
                        <Landmark className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Landmark className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate max-w-full">
                        {tx.name || tx.merchantName}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-0.5 text-xs text-slate-500 min-w-0">
                        {/* Interactive Category Badge */}
                        <button
                          type="button"
                          onClick={() => setSelectedTxForCategory(tx)}
                          className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-medium bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700/60 hover:border-indigo-500/50 transition-all cursor-pointer group truncate max-w-[110px] sm:max-w-none shrink-0"
                          title="Click to edit category"
                        >
                          <Tag className="w-2.5 sm:w-3 h-2.5 sm:h-3 text-indigo-500 dark:text-indigo-400 group-hover:scale-110 transition-transform shrink-0" />
                          <span className="truncate">{tx.category || 'Uncategorized'}</span>
                          <ChevronDown className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 shrink-0" />
                        </button>
                        <span className="hidden sm:inline">•</span>
                        <span className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-500 shrink-0">
                          <Calendar className="w-3 h-3 text-slate-400 dark:text-slate-600 shrink-0" />
                          {tx.date}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-2">
                    {isTransfer ? (
                      <div className="flex flex-col items-end">
                        <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {rawAmount < 0 ? '+' : '-'}${displayAmount}
                        </span>
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 px-1.5 py-0.5 rounded font-medium mt-0.5">
                          Transfer
                        </span>
                      </div>
                    ) : (
                      <div
                        className={`text-xs sm:text-sm font-bold ${
                          isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-200'
                        }`}
                      >
                        {isIncome ? '+' : '-'}${displayAmount}
                      </div>
                    )}
                    {tx.pending && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium mt-0.5 inline-block">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Category Picker Modal */}
      <CategoryPickerModal
        isOpen={Boolean(selectedTxForCategory)}
        onClose={() => setSelectedTxForCategory(null)}
        transaction={selectedTxForCategory}
        categories={categoriesList}
        onSelectCategory={handleSelectCategory}
        onCreateCategory={handleCreateCategory}
      />
    </div>
  );
};
