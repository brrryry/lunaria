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
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  transactionCount?: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  transactionCount,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const navItems: Array<{
    id: string;
    label: string;
    icon: any;
    badge?: string;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: ReceiptText,
    },
    { id: 'recurring', label: 'Recurring', icon: Repeat },
    { id: 'investments', label: 'Investments', icon: TrendingUp },
    { id: 'budget', label: 'Monthly Budget', icon: Target },
    { id: 'cashflow', label: 'Cash Flow', icon: ArrowLeftRight },
    { id: 'accounts', label: 'Accounts', icon: Landmark },
  ];

  const handleItemClick = (id: string) => {
    setActiveTab(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const content = (
    <div className="flex flex-col h-full p-4">
      {/* Brand & Mobile Close Button */}
      <div className="flex items-center justify-between px-3 py-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shadow-lg shadow-purple-500/10 relative group">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-purple-600/20 via-fuchsia-500/10 to-transparent blur-sm pointer-events-none" />
            <img
              src="/logo.png"
              alt="Lunaria"
              className="w-7 h-7 object-contain relative z-10 transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-slate-900 via-slate-700 to-purple-700 dark:from-white dark:via-slate-200 dark:to-purple-200 bg-clip-text text-transparent">
              Lunaria
            </span>
          </div>
        </div>

        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="space-y-1.5 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-colors duration-150 outline-none select-none ${isActive
                  ? 'bg-purple-600/10 dark:bg-purple-600/15 text-purple-700 dark:text-purple-300 border-purple-500/30 shadow-sm'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${isActive ? 'text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400'
                    }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="px-2 py-0.5 text-[11px] rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Security & Settings Footer */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800/60 space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800">
          <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
          <span className="truncate">KMS Encrypted & Audited</span>
        </div>
        <button
          type="button"
          onClick={() => handleItemClick('settings')}
          className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm border transition-colors duration-150 outline-none select-none ${activeTab === 'settings'
              ? 'bg-purple-600/10 dark:bg-purple-600/15 text-purple-700 dark:text-purple-300 border-purple-500/30 shadow-sm'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
            }`}
        >
          <Settings
            className={`w-4 h-4 ${activeTab === 'settings' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400'
              }`}
          />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex md:w-64 border-r border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-[#0c0f17]/95 flex-col z-20 shrink-0 transition-colors duration-150">
        {content}
      </aside>

      {/* Mobile Off-Canvas Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-[#0c0f17] border-r border-slate-200 dark:border-slate-800 shadow-2xl h-full z-10 animate-in slide-in-from-left duration-200 transition-colors duration-150">
            {content}
          </aside>
        </div>
      )}
    </>
  );
};

