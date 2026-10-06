'use client';

import React from 'react';
import {
  LayoutDashboard,
  ReceiptText,
  Repeat,
  TrendingUp,
  Target,
  ArrowLeftRight,
  Landmark,
} from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  transactionCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  transactionCount,
}) => {
  const tabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    {
      id: 'transactions',
      label: 'Activity',
      icon: ReceiptText,
      badge:
        transactionCount !== undefined && transactionCount > 0
          ? String(transactionCount > 99 ? '99+' : transactionCount)
          : undefined,
    },
    { id: 'recurring', label: 'Recurring', icon: Repeat },
    { id: 'investments', label: 'Invest', icon: TrendingUp },
    { id: 'budget', label: 'Budget', icon: Target },
    { id: 'cashflow', label: 'Cash Flow', icon: ArrowLeftRight },
    { id: 'accounts', label: 'Accounts', icon: Landmark },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0a0d14]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 px-1 py-1 safe-area-pb transition-colors duration-150"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-1.5 sm:px-3 rounded-xl transition-all duration-150 min-w-[48px] sm:min-w-[56px] select-none ${
                isActive
                  ? 'text-purple-600 dark:text-purple-300 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {/* Active Indicator Glow */}
              {isActive && (
                <div className="absolute inset-0 bg-purple-500/10 dark:bg-purple-500/15 rounded-xl -z-10 border border-purple-500/25 shadow-sm shadow-purple-500/10" />
              )}

              <div className="relative">
                <Icon
                  className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${
                    isActive ? 'scale-110 text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                {tab.badge && (
                  <span className="absolute -top-1.5 -right-2 px-1 min-w-[14px] h-[14px] rounded-full bg-indigo-500 text-[8px] sm:text-[9px] font-bold text-white flex items-center justify-center ring-2 ring-white dark:ring-[#0a0d14]">
                    {tab.badge}
                  </span>
                )}
              </div>

              <span className="text-[9px] sm:text-[10px] tracking-tight mt-0.5 truncate max-w-[52px]">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
