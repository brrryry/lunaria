'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Target,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Copy,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  RotateCcw,
  Loader2,
  DollarSign,
  Calendar,
} from 'lucide-react';
import { MonthlyBudgetSummary, CategoryBudgetEntry } from '@lunaria/types';

interface BudgetViewProps {
  transactions?: any[];
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const BudgetView: React.FC<BudgetViewProps> = () => {
  // Current active month in YYYY-MM format
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().substring(0, 7);
  });

  const [budgetData, setBudgetData] = useState<MonthlyBudgetSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState<boolean>(false);

  // New category modal/input state
  const [isAddingCategory, setIsAddingCategory] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatType, setNewCatType] = useState<'income' | 'expense'>('expense');
  const [newCatAmount, setNewCatAmount] = useState<string>('');
  const [adjustFutureMonths, setAdjustFutureMonths] = useState<boolean>(true);


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

  // Human readable month name
  const formattedMonth = useMemo(() => {
    const [year, month] = selectedMonth.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  // Navigate months
  const handlePrevMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) - 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) + 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
    setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  const handleCurrentMonth = () => {
    setSelectedMonth(new Date().toISOString().substring(0, 7));
  };

  // Fetch monthly budget from backend
  const fetchMonthlyBudget = useCallback(async (month: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE}/budget?month=${month}`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data: MonthlyBudgetSummary = await res.json();
        setBudgetData(data);
      }
    } catch (err) {
      console.error('Failed to load monthly budget:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonthlyBudget(selectedMonth);
  }, [selectedMonth, fetchMonthlyBudget]);

  // Save budget changes to backend
  const saveBudgetEntries = async (
    entriesToSave: Array<{
      category: string;
      type: 'income' | 'expense';
      budgetedAmount: number;
    }>,
    adjustFuture: boolean = true,
  ) => {
    try {
      setIsSaving(true);
      setSaveStatus('Saving...');
      const res = await fetch(`${API_BASE}/budget`, {
        method: 'PUT',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          month: selectedMonth,
          entries: entriesToSave,
          adjustFuture,
        }),
      });

      if (res.ok) {
        const updated: MonthlyBudgetSummary = await res.json();
        setBudgetData(updated);
        setSaveStatus(adjustFuture ? 'Saved & adjusted future sheets' : 'Saved');
        setTimeout(() => setSaveStatus(null), 2500);
      }
    } catch (err) {
      console.error('Failed to save budget:', err);
      setSaveStatus('Error saving');
    } finally {
      setIsSaving(false);
    }
  };


  // Local optimistic update for instant feedback
  const handleBudgetChange = (
    categoryName: string,
    type: 'income' | 'expense',
    rawVal: string,
  ) => {
    const numVal = Math.max(0, parseFloat(rawVal) || 0);

    setBudgetData((prev) => {
      if (!prev) return prev;

      const listKey = type === 'income' ? 'incomeCategories' : 'expenseCategories';
      const updatedList = prev[listKey].map((entry) => {
        if (entry.category === categoryName) {
          const remaining =
            type === 'income' ? entry.actual - numVal : numVal - entry.actual;
          const percentSpent =
            numVal > 0 ? Math.round((entry.actual / numVal) * 100) : 0;
          return {
            ...entry,
            budgeted: numVal,
            remaining,
            percentSpent,
          };
        }
        return entry;
      });

      const totalBudgetedIncome = (
        type === 'income' ? updatedList : prev.incomeCategories
      ).reduce((sum, c) => sum + c.budgeted, 0);

      const totalBudgetedExpenses = (
        type === 'expense' ? updatedList : prev.expenseCategories
      ).reduce((sum, c) => sum + c.budgeted, 0);

      const leftToBudget = totalBudgetedIncome - totalBudgetedExpenses;

      return {
        ...prev,
        [listKey]: updatedList,
        totalBudgetedIncome,
        totalBudgetedExpenses,
        leftToBudget,
      };
    });
  };

  // On blur, persist to backend
  const handleBlurSave = (
    categoryName: string,
    type: 'income' | 'expense',
    value: number,
  ) => {
    saveBudgetEntries([
      {
        category: categoryName,
        type,
        budgetedAmount: value,
      },
    ]);
  };

  // Copy budget from previous month
  const handleCopyPrevious = async () => {
    try {
      setIsCopying(true);
      const res = await fetch(`${API_BASE}/budget/copy-previous`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ month: selectedMonth }),
      });
      if (res.ok) {
        const data = await res.json();
        setBudgetData(data);
        setSaveStatus('Copied from previous month');
        setTimeout(() => setSaveStatus(null), 2500);
      }
    } catch (err) {
      console.error('Failed to copy previous budget:', err);
    } finally {
      setIsCopying(false);
    }
  };

  // Add new category target
  const handleAddCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const amount = Math.max(0, parseFloat(newCatAmount) || 0);
    saveBudgetEntries(
      [
        {
          category: newCatName.trim(),
          type: newCatType,
          budgetedAmount: amount,
        },
      ],
      adjustFutureMonths,
    );

    setNewCatName('');
    setNewCatAmount('');
    setIsAddingCategory(false);
  };


  const leftToBudget = budgetData?.leftToBudget ?? 0;
  const isZeroBalanced = leftToBudget === 0 && (budgetData?.totalBudgetedIncome || 0) > 0;
  const isOverAllocated = leftToBudget < 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header & Month Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Target className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
            <span>Monthly Budget</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Zero-based envelope budgeting: assign every dollar of planned income to expenses
          </p>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-1 sm:p-1.5 rounded-2xl shadow-sm self-start sm:self-auto">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 px-2 sm:px-3 text-xs font-bold text-slate-900 dark:text-white w-36 sm:w-44 justify-center shrink-0">
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 animate-spin shrink-0" />
            ) : (
              <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
            )}
            <span className="truncate">{formattedMonth}</span>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleCurrentMonth}
            className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-500/10 px-2.5 py-1 rounded-xl transition-all border border-purple-500/20 ml-0.5 sm:ml-1 cursor-pointer"
          >
            Today
          </button>
        </div>
      </div>


      {/* Hero: Zero-Based "Left to Budget" Allocation Banner */}
      <div
        className={`glass-panel rounded-2xl p-4 sm:p-6 border transition-all relative overflow-hidden ${
          isOverAllocated
            ? 'border-rose-500/30 bg-gradient-to-r from-rose-500/10 dark:from-rose-950/20 via-white/80 dark:via-slate-900/60 to-white/80 dark:to-slate-900/60'
            : isZeroBalanced
            ? 'border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 dark:from-indigo-950/20 via-white/80 dark:via-slate-900/60 to-white/80 dark:to-slate-900/60'
            : 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 dark:from-emerald-950/20 via-white/80 dark:via-slate-900/60 to-white/80 dark:to-slate-900/60'
        }`}
      >
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-1">
              {isOverAllocated ? (
                <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Overallocated Budget
                </span>
              ) : isZeroBalanced ? (
                <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> All Dollars Assigned
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Ready to Allocate
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-3">
              <div
                className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${
                  isOverAllocated
                    ? 'text-rose-600 dark:text-rose-400'
                    : isZeroBalanced
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {leftToBudget < 0 ? '-' : '+'}$
                {Math.abs(leftToBudget).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Left to Budget
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 max-w-lg leading-relaxed">
              {isOverAllocated
                ? `You have allocated $${Math.abs(leftToBudget).toFixed(
                    2,
                  )} more than your expected income. Reduce expenses or increase planned income to balance.`
                : isZeroBalanced
                ? 'Every dollar of expected income has a job! Your budget is fully zero-balanced.'
                : `You have $${leftToBudget.toFixed(
                    2,
                  )} in unassigned income remaining. Allocate it to savings, investments, or discretionary categories.`}
            </p>
          </div>

          {/* Key Totals Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 w-full lg:w-auto">
            <div className="bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-3 sm:p-3.5 rounded-xl text-left sm:text-right w-full sm:w-40 shrink-0 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-500 block truncate">
                Expected Income
              </span>
              <span className="text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                $
                {(budgetData?.totalBudgetedIncome || 0).toLocaleString(
                  undefined,
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}
              </span>
            </div>

            <div className="bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-3 sm:p-3.5 rounded-xl text-left sm:text-right w-full sm:w-40 shrink-0 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-500 block truncate">
                Budgeted Expenses
              </span>
              <span className="text-base sm:text-lg font-extrabold text-slate-800 dark:text-slate-200">
                $
                {(budgetData?.totalBudgetedExpenses || 0).toLocaleString(
                  undefined,
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}
              </span>
            </div>

            <div className="bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-3 sm:p-3.5 rounded-xl text-left sm:text-right w-full sm:w-40 shrink-0 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-500 block truncate">
                Actual Spent
              </span>
              <span className="text-base sm:text-lg font-extrabold text-rose-600 dark:text-rose-400">
                $
                {(budgetData?.totalActualExpenses || 0).toLocaleString(
                  undefined,
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-200 dark:border-slate-800/80 mt-5 pt-4 gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={handleCopyPrevious}
              disabled={isCopying}
              className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60 transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              {isCopying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              )}
              <span>Copy Last Month</span>
            </button>

            <button
              onClick={() => setIsAddingCategory(true)}
              className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60 transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Add Category</span>
            </button>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            {saveStatus && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-pulse">
                ✓ {saveStatus}
              </span>
            )}
            <span className="text-[11px] text-slate-500">
              Auto-saves on edit
            </span>
          </div>
        </div>
      </div>

      {/* Add Custom Category Target Modal */}
      {isAddingCategory && (
        <div className="glass-panel rounded-2xl p-5 border border-indigo-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <span>Add Category Target for {formattedMonth}</span>
            </h3>
            <button
              onClick={() => setIsAddingCategory(false)}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <form
            onSubmit={handleAddCategorySubmit}
            className="grid grid-cols-1 md:grid-cols-4 gap-3"
          >
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block mb-1">
                Category Name
              </label>
              <input
                type="text"
                placeholder="e.g. Travel, Gym, Coffee"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block mb-1">
                Type
              </label>
              <select
                value={newCatType}
                onChange={(e) =>
                  setNewCatType(e.target.value as 'income' | 'expense')
                }
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block mb-1">
                Budgeted Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={newCatAmount}
                onChange={(e) => setNewCatAmount(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                Save Category
              </button>
            </div>

            <div className="md:col-span-4 flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800/60">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={adjustFutureMonths}
                  onChange={(e) => setAdjustFutureMonths(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-purple-600 focus:ring-purple-500 focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">
                  Adjust future budget sheets
                </span>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  (automatically applies this category and target to all upcoming months)
                </span>
              </label>
            </div>
          </form>
        </div>
      )}


      {/* Loading Skeleton */}
      {isLoading && !budgetData ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Loading {formattedMonth} budget targets...</p>
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity duration-150 ${isLoading ? 'opacity-80' : 'opacity-100'}`}>
          {/* SECTION 1: INCOME TARGETS */}
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Income Streams</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Expected salary, investments, and cash inflows
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-slate-500 block">Total Income Expected</span>
                <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                  ${(budgetData?.totalBudgetedIncome || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Desktop Income Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs table-fixed">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase text-[10px]">
                    <th className="pb-3 pl-2 w-1/3">Category</th>
                    <th className="pb-3 text-right w-1/5">Budgeted Target</th>
                    <th className="pb-3 text-right w-1/5">Actual Received</th>
                    <th className="pb-3 text-right w-1/5">Difference</th>
                    <th className="pb-3 text-right pr-2 w-28">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                  {(budgetData?.incomeCategories || []).map((cat) => {
                    const diff = cat.actual - cat.budgeted;
                    const isMet = cat.actual >= cat.budgeted && cat.budgeted > 0;

                    return (
                      <tr key={cat.category} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="py-3 pl-2 font-semibold text-slate-900 dark:text-white">
                          {cat.category}
                        </td>
                        <td className="py-3 text-right">
                          <div className="inline-flex items-center relative">
                            <span className="text-slate-400 dark:text-slate-500 absolute left-2.5">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={cat.budgeted === 0 ? '' : cat.budgeted}
                              placeholder="0.00"
                              onChange={(e) =>
                                handleBudgetChange(cat.category, 'income', e.target.value)
                              }
                              onBlur={(e) =>
                                handleBlurSave(
                                  cat.category,
                                  'income',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="w-28 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 rounded-lg py-1.5 pl-6 pr-2 text-right text-xs font-mono text-slate-900 dark:text-white focus:outline-none transition-colors"
                            />
                          </div>
                        </td>
                        <td className="py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          ${cat.actual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 text-right font-mono">
                          <span
                            className={
                              diff >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
                            }
                          >
                            {diff >= 0 ? '+' : ''}${diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="py-3 text-right pr-2">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              isMet
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : cat.actual > 0
                                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/50'
                            }`}
                          >
                            {isMet ? 'Target Met' : cat.actual > 0 ? 'In Progress' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Income Cards */}
            <div className="md:hidden space-y-2.5">
              {(budgetData?.incomeCategories || []).map((cat) => {
                const diff = cat.actual - cat.budgeted;
                const isMet = cat.actual >= cat.budgeted && cat.budgeted > 0;
                return (
                  <div key={cat.category} className="p-3 bg-white/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white text-xs">{cat.category}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        isMet
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : cat.actual > 0
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/50'
                      }`}>
                        {isMet ? 'Target Met' : cat.actual > 0 ? 'In Progress' : 'Pending'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/50">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">Target</span>
                        <div className="inline-flex items-center relative mt-0.5">
                          <span className="text-slate-400 dark:text-slate-500 absolute left-2 text-xs">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={cat.budgeted === 0 ? '' : cat.budgeted}
                            placeholder="0.00"
                            onChange={(e) => handleBudgetChange(cat.category, 'income', e.target.value)}
                            onBlur={(e) => handleBlurSave(cat.category, 'income', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 rounded-lg py-1 pl-5 pr-2 text-right text-xs font-mono text-slate-900 dark:text-white focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">Received</span>
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                          ${cat.actual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: EXPENSE TARGETS */}
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Monthly Expense Envelopes</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Allocated spending limits, actual debits, and remaining allowances
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-slate-500 block">Total Budgeted Spend</span>
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                  ${(budgetData?.totalBudgetedExpenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Desktop Expenses Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs table-fixed">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase text-[10px]">
                    <th className="pb-3 pl-2 w-1/3">Category</th>
                    <th className="pb-3 text-right w-1/6">Budgeted</th>
                    <th className="pb-3 text-right w-1/6">Actual Spent</th>
                    <th className="pb-3 text-right w-1/6">Remaining</th>
                    <th className="pb-3 text-center w-36">Pacing</th>
                    <th className="pb-3 text-right pr-2 w-28">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                  {(budgetData?.expenseCategories || []).map((cat) => {
                    const remaining = cat.remaining;
                    const isOver = remaining < 0;
                    const isNearLimit = !isOver && cat.percentSpent >= 80;

                    // Progress bar color
                    const progressColor = isOver
                      ? 'bg-rose-500'
                      : isNearLimit
                      ? 'bg-amber-500 dark:bg-amber-400'
                      : 'bg-emerald-500 dark:bg-emerald-400';

                    return (
                      <tr key={cat.category} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="py-3.5 pl-2">
                          <span className="font-semibold text-slate-900 dark:text-white block">
                            {cat.category}
                          </span>
                        </td>
                        <td className="py-3.5 text-right">
                          <div className="inline-flex items-center relative">
                            <span className="text-slate-400 dark:text-slate-500 absolute left-2.5">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={cat.budgeted === 0 ? '' : cat.budgeted}
                              placeholder="0.00"
                              onChange={(e) =>
                                handleBudgetChange(cat.category, 'expense', e.target.value)
                              }
                              onBlur={(e) =>
                                handleBlurSave(
                                  cat.category,
                                  'expense',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="w-28 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 rounded-lg py-1.5 pl-6 pr-2 text-right text-xs font-mono text-slate-900 dark:text-white focus:outline-none transition-colors"
                            />
                          </div>
                        </td>
                        <td className="py-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                          ${cat.actual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 text-right font-mono">
                          <span
                            className={`font-bold ${
                              isOver
                                ? 'text-rose-600 dark:text-rose-400'
                                : remaining > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {isOver ? '-' : '+'}$
                            {Math.abs(remaining).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </td>
                        <td className="py-3.5 text-center px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
                                style={{
                                  width: `${Math.min(100, cat.percentSpent)}%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 min-w-[32px]">
                              {cat.percentSpent}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 text-right pr-2">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              isOver
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                : isNearLimit
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                : cat.budgeted > 0
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/50'
                            }`}
                          >
                            {isOver
                              ? 'Over Budget'
                              : isNearLimit
                              ? 'Near Limit'
                              : cat.budgeted > 0
                              ? 'On Track'
                              : 'Unbudgeted'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Expenses Cards */}
            <div className="md:hidden space-y-2.5">
              {(budgetData?.expenseCategories || []).map((cat) => {
                const remaining = cat.remaining;
                const isOver = remaining < 0;
                const isNearLimit = !isOver && cat.percentSpent >= 80;
                const progressColor = isOver
                  ? 'bg-rose-500'
                  : isNearLimit
                  ? 'bg-amber-500 dark:bg-amber-400'
                  : 'bg-emerald-500 dark:bg-emerald-400';

                return (
                  <div key={cat.category} className="p-3 bg-white/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white text-xs">{cat.category}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        isOver
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                          : isNearLimit
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                          : cat.budgeted > 0
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/50'
                      }`}>
                        {isOver ? 'Over Budget' : isNearLimit ? 'Near Limit' : cat.budgeted > 0 ? 'On Track' : 'Unbudgeted'}
                      </span>
                    </div>

                    {/* Progress Pacing Bar */}
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                        <span>${cat.actual.toFixed(2)} of ${cat.budgeted.toFixed(2)}</span>
                        <span className="font-mono font-semibold">{cat.percentSpent}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
                          style={{ width: `${Math.min(100, cat.percentSpent)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/50">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">Budget Envelope</span>
                        <div className="inline-flex items-center relative mt-0.5">
                          <span className="text-slate-400 dark:text-slate-500 absolute left-2 text-xs">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={cat.budgeted === 0 ? '' : cat.budgeted}
                            placeholder="0.00"
                            onChange={(e) => handleBudgetChange(cat.category, 'expense', e.target.value)}
                            onBlur={(e) => handleBlurSave(cat.category, 'expense', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 rounded-lg py-1 pl-5 pr-2 text-right text-xs font-mono text-slate-900 dark:text-white focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">Remaining</span>
                        <div className={`text-xs font-bold font-mono mt-1 ${isOver ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {isOver ? '-' : '+'}${Math.abs(remaining).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
