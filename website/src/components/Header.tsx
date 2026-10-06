'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bell,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  CheckCheck,
  Landmark,
  TrendingUp,
  AlertCircle,
  ArrowDownRight,
  Sparkles,
  ExternalLink,
  X,
  Trash2,
  Settings,
  Menu,
  Sun,
  Moon,
} from 'lucide-react';
import { User } from '@lunaria/types';
import { useTheme } from '@/context/ThemeContext';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface HeaderProps {
  activeTab?: string;
  onOpenPlaid?: () => void;
  user: User | null;
  onSignOut?: () => void;
  accounts?: any[];
  transactions?: any[];
  onSelectTab?: (tab: string) => void;
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab = 'dashboard',
  onOpenPlaid,
  user,
  onSignOut,
  accounts = [],
  transactions = [],
  onSelectTab,
  onToggleMobileMenu,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dbNotifications, setDbNotifications] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme, toggleTheme } = useTheme();

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

  const [readIds, setReadIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('lunaria_read_notifications');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('lunaria_dismissed_notifications');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const fetchDbNotifications = async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setDbNotifications(data.items || []);
      }
    } catch (err) {
      console.warn('Could not fetch stored notifications:', err);
    }
  };

  useEffect(() => {
    fetchDbNotifications();
  }, [notificationsOpen]);

  // Dynamic notifications generated from live user accounts and transactions
  const notifications = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      message: string;
      time: string;
      type: 'sync' | 'expense' | 'income' | 'summary' | 'info' | string;
      tab?: string;
      action?: () => void;
      isDb?: boolean;
    }> = [];

    // Include backend stored notifications
    for (const dbItem of dbNotifications) {
      items.push({
        id: dbItem.id,
        title: dbItem.title,
        message: dbItem.message,
        time: new Date(dbItem.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        type: dbItem.type,
        isDb: true,
      });
    }

    // 1. Account sync status
    if (accounts.length > 0) {
      const activeCount = accounts.filter((a) => !a.isHidden).length;
      items.push({
        id: 'acc-sync-live',
        title: 'Bank Accounts Synced',
        message: `${activeCount} accounts active and synced with live Plaid balance feeds.`,
        time: 'Today',
        type: 'sync',
        tab: 'accounts',
      });
    } else {
      items.push({
        id: 'welcome-connect',
        title: 'Connect Your Bank',
        message: 'Link your accounts with Plaid to unlock live net worth and automated tracking.',
        time: 'Action Required',
        type: 'info',
        action: onOpenPlaid,
      });
    }

    // 2. Income notification (recent negative amount in Plaid)
    const incomeTx = transactions.find((t) => Number(t.amount) < 0);
    if (incomeTx) {
      items.push({
        id: `income-${incomeTx.id}`,
        title: 'Income Received',
        message: `+$${Math.abs(Number(incomeTx.amount)).toFixed(2)} from ${
          incomeTx.merchantName || incomeTx.name
        }`,
        time: incomeTx.date || 'Recent',
        type: 'income',
        tab: 'transactions',
      });
    }

    // 3. Significant/large expense notification
    const largeExpense = transactions
      .filter((t) => Number(t.amount) > 100)
      .sort((a, b) => Number(b.amount) - Number(a.amount))[0];
    if (largeExpense) {
      items.push({
        id: `expense-${largeExpense.id}`,
        title: 'Large Expense Tracked',
        message: `$${Number(largeExpense.amount).toFixed(2)} at ${
          largeExpense.merchantName || largeExpense.name
        }`,
        time: largeExpense.date || 'Recent',
        type: 'expense',
        tab: 'transactions',
      });
    }

    // 4. Net worth & portfolio trajectory
    if (accounts.length > 0) {
      items.push({
        id: 'nw-recalculated',
        title: 'Financial Summary Ready',
        message: 'Historical net worth curves and portfolio snapshots are up to date.',
        time: 'Today',
        type: 'summary',
        tab: 'dashboard',
      });
    }

    return items;
  }, [dbNotifications, accounts, transactions, onOpenPlaid]);

  // Filter out any dismissed notifications
  const activeNotifications = useMemo(() => {
    return notifications.filter((n) => !dismissedIds.includes(n.id));
  }, [notifications, dismissedIds]);

  const unreadCount = activeNotifications.filter((n) => !readIds.includes(n.id)).length;

  const markAsRead = async (id: string) => {
    setReadIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      if (typeof window !== 'undefined') {
        localStorage.setItem('lunaria_read_notifications', JSON.stringify(next));
      }
      return next;
    });

    try {
      await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: getHeaders(),
        credentials: 'include',
      });
    } catch {
      // ignore
    }
  };

  const markAllAsRead = async () => {
    const allIds = activeNotifications.map((n) => n.id);
    setReadIds((prev) => {
      const combined = Array.from(new Set([...prev, ...allIds]));
      if (typeof window !== 'undefined') {
        localStorage.setItem('lunaria_read_notifications', JSON.stringify(combined));
      }
      return combined;
    });

    try {
      await fetch(`${API_BASE}/notifications/mark-all-read`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
      });
    } catch {
      // ignore
    }
  };

  const dismissNotification = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    setDismissedIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      if (typeof window !== 'undefined') {
        localStorage.setItem('lunaria_dismissed_notifications', JSON.stringify(next));
      }
      return next;
    });

    try {
      await fetch(`${API_BASE}/notifications/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
        credentials: 'include',
      });
    } catch {
      // ignore
    }
  };

  const clearAllNotifications = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const allIds = notifications.map((n) => n.id);
    setDismissedIds((prev) => {
      const combined = Array.from(new Set([...prev, ...allIds]));
      if (typeof window !== 'undefined') {
        localStorage.setItem('lunaria_dismissed_notifications', JSON.stringify(combined));
      }
      return combined;
    });

    try {
      await fetch(`${API_BASE}/notifications`, {
        method: 'DELETE',
        headers: getHeaders(),
        credentials: 'include',
      });
    } catch {
      // ignore
    }
  };

  const handleNotificationClick = (item: (typeof notifications)[0]) => {
    markAsRead(item.id);
    setNotificationsOpen(false);
    if (item.action) {
      item.action();
    } else if (item.tab && onSelectTab) {
      onSelectTab(item.tab);
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(e.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name?: string) => {
    if (!name) return 'LU';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const renderNotificationIcon = (type: string) => {
    switch (type) {
      case 'sync':
        return (
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20 flex-shrink-0">
            <Landmark className="w-4 h-4" />
          </div>
        );
      case 'income':
        return (
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 flex-shrink-0">
            <ArrowDownRight className="w-4 h-4" />
          </div>
        );
      case 'expense':
        return (
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 flex-shrink-0">
            <AlertCircle className="w-4 h-4" />
          </div>
        );
      case 'summary':
        return (
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 flex-shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20 flex-shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
        );
    }
  };

  const tabTitles: Record<string, string> = {
    dashboard: 'Dashboard',
    transactions: 'Transactions',
    investments: 'Investments & Portfolio',
    budget: 'Monthly Budget',
    cashflow: 'Cash Flow Analytics',
    accounts: 'Connected Accounts',
    settings: 'Settings',
  };

  return (
    <header className="h-16 shrink-0 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-[#0a0d14]/90 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between z-20 transition-colors duration-150">
      {/* Left side: Section Title, Mobile Menu Button & Mobile Logo */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-1.5 -ml-1 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-slate-200 dark:border-slate-800/80 transition-colors shrink-0"
            aria-label="Open menu drawer"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <div className="md:hidden w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center p-1 shrink-0">
            <img src="/logo.png" alt="Lunaria" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate max-w-[140px] sm:max-w-none">
            {tabTitles[activeTab] || 'Dashboard'}
          </h2>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer relative focus:outline-none"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 hover:rotate-45" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-500 transition-transform duration-300 hover:-rotate-12" />
          )}
        </button>

        {/* Notifications Button & Dropdown */}
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              setDropdownOpen(false);
            }}
            aria-label="Notifications"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-slate-200 dark:border-slate-800 transition-colors relative focus:outline-none"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="min-w-[17px] h-[17px] px-1 rounded-full bg-indigo-500 text-[10px] font-bold text-white absolute -top-1 -right-1 flex items-center justify-center ring-2 ring-white dark:ring-[#0a0d14]">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {notificationsOpen && (
            <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-auto sm:mt-2 sm:w-96 max-w-sm bg-white dark:bg-[#0e121b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Notifications</span>
                  {unreadCount > 0 ? (
                    <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-semibold">
                      {unreadCount} new
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500">All caught up</span>
                  )}
                </div>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/40">
                {activeNotifications.length === 0 ? (
                  <div className="py-8 px-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-2">
                      <Bell className="w-5 h-5 opacity-40" />
                    </div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">No notifications</div>
                    <p className="text-[11px] text-slate-500 mt-0.5">You're all caught up!</p>
                  </div>
                ) : (
                  activeNotifications.map((item) => {
                    const isUnread = !readIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`w-full p-3.5 flex items-start gap-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 group relative ${
                          isUnread ? 'bg-indigo-50/60 dark:bg-indigo-950/20' : ''
                        }`}
                      >
                        <div
                          className="flex-1 flex items-start gap-3 min-w-0 cursor-pointer"
                          onClick={() => handleNotificationClick(item)}
                        >
                          {renderNotificationIcon(item.type)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span
                                className={`text-xs truncate ${
                                  isUnread
                                    ? 'font-bold text-slate-900 dark:text-white'
                                    : 'font-medium text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {item.title}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                                {item.time}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                              {item.message}
                            </p>
                          </div>
                        </div>

                        {/* Actions: Unread dot & Remove button */}
                        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          )}
                          <button
                            type="button"
                            onClick={(e) => dismissNotification(item.id, e)}
                            title="Remove notification"
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/80 dark:bg-slate-950/30 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                  {activeNotifications.length} alert{activeNotifications.length === 1 ? '' : 's'}
                </span>
                {activeNotifications.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllNotifications}
                    className="text-[11px] text-slate-500 hover:text-rose-500 font-medium flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear all
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar with Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => {
              setDropdownOpen(!dropdownOpen);
              setNotificationsOpen(false);
            }}
            className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white border border-slate-300 dark:border-slate-700 shadow-sm transition-transform active:scale-95 focus:outline-none ring-2 ring-transparent focus:ring-purple-500/50"
          >
            {user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={user.fullName || 'User'}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{getInitials(user?.fullName)}</span>
            )}
          </button>

          {/* User Profile Dropdown Menu */}
          {dropdownOpen && (
            <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-auto sm:mt-2 sm:w-64 max-w-xs bg-white dark:bg-[#0e121b] border border-slate-200 dark:border-slate-800 rounded-2xl p-2 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800/80 mb-1">
                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {user?.fullName || 'User'}
                </p>
                {user?.email && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {user.email}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    <ShieldCheck className="w-3 h-3" />
                    {user?.authProvider === 'google' ? 'Google Account' : 'Authenticated'}
                  </span>
                </div>
              </div>

              <div className="p-1 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onSelectTab) onSelectTab('settings');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-xl transition-colors text-left"
                >
                  <Settings className="w-4 h-4 text-purple-500" />
                  <span>Settings</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onSignOut) onSignOut();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
