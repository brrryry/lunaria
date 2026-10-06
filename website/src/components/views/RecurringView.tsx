'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCw,
  Repeat,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Search,
  Filter,
  EyeOff,
  RotateCcw,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Info,
  CreditCard,
  Building2,
  Clock,
  Trash2,
} from 'lucide-react';
import {
  RecurringStreamItem,
  RecurringTransactionsResponse,
  RecurringFrequency,
} from '@lunaria/types';

interface RecurringViewProps {
  transactions?: any[];
  accounts?: any[];
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Bi-Weekly',
  SEMI_MONTHLY: 'Semi-Monthly',
  MONTHLY: 'Monthly',
  ANNUALLY: 'Annually',
  UNKNOWN: 'Irregular',
};

export const RecurringView: React.FC<RecurringViewProps> = () => {
  const [data, setData] = useState<RecurringTransactionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'outflows' | 'inflows' | 'dismissed'>('outflows');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFrequency, setSelectedFrequency] = useState<string>('ALL');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info'; streamId?: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

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

  const fetchRecurring = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);
      const res = await fetch(`${API_BASE}/plaid/recurring`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const json: RecurringTransactionsResponse = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch recurring transactions', err);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchRecurring();
  }, [fetchRecurring]);

  // Dismiss recurring stream
  const handleDismiss = async (stream: RecurringStreamItem) => {
    // Optimistic UI update
    setData((prev) => {
      if (!prev) return prev;
      const filteredOutflows = prev.outflows.filter((s) => s.id !== stream.id);
      const filteredInflows = prev.inflows.filter((s) => s.id !== stream.id);
      const updatedDismissed = [
        ...prev.dismissed.filter((s) => s.id !== stream.id),
        { ...stream, isDismissed: true },
      ];

      return {
        ...prev,
        outflows: filteredOutflows,
        inflows: filteredInflows,
        dismissed: updatedDismissed,
      };
    });

    setToastMessage({
      text: `Removed "${stream.merchantName || stream.description}" from recurring streams.`,
      type: 'info',
      streamId: stream.id,
    });

    try {
      await fetch(`${API_BASE}/plaid/recurring/dismiss`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          streamId: stream.id,
          merchantName: stream.merchantName || stream.description,
        }),
      });
    } catch (err) {
      console.error('Failed to dismiss recurring stream', err);
      // Re-fetch to rollback if needed
      fetchRecurring(false);
    }
  };

  // Restore dismissed recurring stream
  const handleRestore = async (stream: RecurringStreamItem) => {
    // Optimistic UI update
    setData((prev) => {
      if (!prev) return prev;
      const updatedDismissed = prev.dismissed.filter((s) => s.id !== stream.id);
      const restoredItem = { ...stream, isDismissed: false };
      const isExpense = stream.averageAmount >= 0; // heuristic or Plaid

      return {
        ...prev,
        outflows: isExpense ? [...prev.outflows, restoredItem] : prev.outflows,
        inflows: !isExpense ? [...prev.inflows, restoredItem] : prev.inflows,
        dismissed: updatedDismissed,
      };
    });

    setToastMessage({
      text: `Restored "${stream.merchantName || stream.description}" to recurring transactions.`,
      type: 'success',
    });

    try {
      await fetch(`${API_BASE}/plaid/recurring/restore`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          streamId: stream.id,
        }),
      });
      // Refresh summary
      fetchRecurring(false);
    } catch (err) {
      console.error('Failed to restore recurring stream', err);
      fetchRecurring(false);
    }
  };

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Current list based on active tab
  const currentStreams = useMemo(() => {
    if (!data) return [];
    if (activeTab === 'outflows') return data.outflows;
    if (activeTab === 'inflows') return data.inflows;
    return data.dismissed;
  }, [data, activeTab]);

  // Filtered list
  const filteredStreams = useMemo(() => {
    return currentStreams.filter((item) => {
      // Search
      const searchMatch =
        !searchQuery ||
        (item.merchantName &&
          item.merchantName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.description &&
          item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.category &&
          item.category.toLowerCase().includes(searchQuery.toLowerCase()));

      // Frequency
      const freqMatch =
        selectedFrequency === 'ALL' || item.frequency === selectedFrequency;

      return searchMatch && freqMatch;
    });
  }, [currentStreams, searchQuery, selectedFrequency]);

  // Compute monthly equivalent for display
  const getMonthlyAmount = (item: RecurringStreamItem) => {
    switch (item.frequency) {
      case 'WEEKLY':
        return item.lastAmount * (52 / 12);
      case 'BIWEEKLY':
        return item.lastAmount * (26 / 12);
      case 'SEMI_MONTHLY':
        return item.lastAmount * 2;
      case 'MONTHLY':
        return item.lastAmount;
      case 'ANNUALLY':
        return item.lastAmount / 12;
      default:
        return item.lastAmount;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 w-full max-w-full overflow-x-hidden min-w-0">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/90 text-white shadow-2xl border border-slate-700/80 backdrop-blur-md animate-in slide-in-from-top-3">
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-indigo-400 shrink-0" />
          )}
          <span className="text-xs font-medium">{toastMessage.text}</span>
        </div>
      )}

      {/* Header with Title & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Repeat className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
            <span>Recurring Transactions</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Detect and manage active subscriptions, recurring bills, and regular income streams.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsSyncing(true);
              fetchRecurring(true);
            }}
            disabled={isSyncing}
            className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
            title="Refresh recurring transactions"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-500' : ''}`} />
            <span>{isSyncing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Monthly Subscriptions & Outflow */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Monthly Bills & Subscriptions
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2">
            ${(data?.summary?.totalMonthlyOutflow || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {data?.summary?.activeSubscriptionsCount || 0} active recurring outflows
          </p>
        </div>

        {/* Expected Recurring Inflow */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Expected Monthly Inflow
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">
            ${(data?.summary?.totalMonthlyInflow || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {data?.summary?.activeInflowStreamsCount || 0} regular income streams
          </p>
        </div>

        {/* Net Recurring Balance */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Net Monthly Recurring
            </span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                (data?.summary?.netMonthlyBurn || 0) >= 0
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}
            >
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-2xl font-extrabold mt-2 ${
              (data?.summary?.netMonthlyBurn || 0) >= 0
                ? 'text-indigo-600 dark:text-indigo-300'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {(data?.summary?.netMonthlyBurn || 0) >= 0 ? '+' : '-'}$
            {Math.abs(data?.summary?.netMonthlyBurn || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {(data?.summary?.netMonthlyBurn || 0) >= 0
              ? 'Net recurring surplus'
              : 'Net recurring deficit'}
          </p>
        </div>

        {/* Total Streams Count */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Total Tracked Streams
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-300 mt-2">
            {(data?.outflows?.length || 0) + (data?.inflows?.length || 0)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {data?.dismissed?.length || 0} removed from recurring
          </p>
        </div>
      </div>

      {/* Main Container: Tabs, Search & Stream List */}
      <div className="glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        {/* Navigation Tabs + Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          {/* Tabs */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('outflows')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'outflows'
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>Subscriptions & Bills</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 ml-1">
                {data?.outflows?.length || 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('inflows')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'inflows'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Recurring Income</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 ml-1">
                {data?.inflows?.length || 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('dismissed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'dismissed'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>Removed</span>
              {data?.dismissed && data.dismissed.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/30 ml-1">
                  {data.dismissed.length}
                </span>
              )}
            </button>
          </div>

          {/* Search & Frequency Filter */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[180px] sm:min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search merchant, category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Frequency Selector */}
            <select
              value={selectedFrequency}
              onChange={(e) => setSelectedFrequency(e.target.value)}
              aria-label="Filter by frequency"
              className="px-2.5 py-1.5 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Frequencies</option>
              <option value="MONTHLY">Monthly</option>
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Bi-Weekly</option>
              <option value="ANNUALLY">Annually</option>
            </select>
          </div>
        </div>

        {/* Loading Skeleton */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
            <span className="text-xs font-medium text-slate-500">
              Scanning recurring transactions and cadence patterns...
            </span>
          </div>
        ) : filteredStreams.length === 0 ? (
          /* Empty State */
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center mb-3">
              <Repeat className="w-6 h-6 text-slate-400" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {activeTab === 'dismissed'
                ? 'No removed recurring streams'
                : 'No recurring transactions found'}
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              {activeTab === 'dismissed'
                ? 'Transactions you remove from the recurring tab will appear here so you can restore them anytime.'
                : searchQuery || selectedFrequency !== 'ALL'
                ? 'No streams match your search filters.'
                : 'Connect your bank accounts or record regular transactions to see subscriptions and cadence streams detected automatically.'}
            </p>
          </div>
        ) : (
          /* Stream List */
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredStreams.map((stream) => {
              const monthlyEquivalent = getMonthlyAmount(stream);
              const isDifferentFromMonthly =
                stream.frequency !== 'MONTHLY' && stream.lastAmount > 0;

              return (
                <div
                  key={stream.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group hover:bg-slate-50/50 dark:hover:bg-slate-900/40 px-2 rounded-xl transition-all"
                >
                  {/* Left: Avatar, Title, Account, Category */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/15 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-extrabold text-sm flex items-center justify-center shrink-0 uppercase shadow-sm">
                      {(stream.merchantName || stream.description || 'M')
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {stream.merchantName || stream.description}
                        </span>

                        {/* Frequency Badge */}
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 shrink-0">
                          {FREQUENCY_LABELS[stream.frequency] || stream.frequency}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${
                            stream.isActive
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/80'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {stream.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      {/* Subtitle: Account, Category, Last Charged */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                        {stream.accountName && (
                          <span className="flex items-center gap-1">
                            <CreditCard className="w-3 h-3 text-slate-400" />
                            <span>{stream.accountName}</span>
                          </span>
                        )}
                        {stream.category && (
                          <>
                            <span>•</span>
                            <span>{stream.category}</span>
                          </>
                        )}
                        {stream.lastDate && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>Last: {stream.lastDate}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Amount & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-13 sm:pl-0">
                    <div className="text-right">
                      <div className="text-base font-extrabold text-slate-900 dark:text-white">
                        ${stream.lastAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        <span className="text-[10px] font-semibold text-slate-400 ml-1">
                          /{FREQUENCY_LABELS[stream.frequency]?.toLowerCase() || 'mo'}
                        </span>
                      </div>
                      {isDifferentFromMonthly && (
                        <div className="text-[10px] text-slate-500 font-medium">
                          ~${monthlyEquivalent.toFixed(2)}/mo
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    {activeTab === 'dismissed' ? (
                      <button
                        type="button"
                        onClick={() => handleRestore(stream)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Restore to recurring list"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDismiss(stream)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all flex items-center gap-1.5 cursor-pointer opacity-80 group-hover:opacity-100"
                        title="Remove from recurring transactions if you do not think this is recurring"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Not Recurring</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
