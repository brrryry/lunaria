'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { NetWorthWidget } from '@/components/widgets/NetWorthWidget';
import { CashFlowWidget } from '@/components/widgets/CashFlowWidget';
import { InvestmentGraphWidget } from '@/components/widgets/InvestmentGraphWidget';
import { RecentTransactionsWidget } from '@/components/widgets/RecentTransactionsWidget';
import { SpendingBreakdownWidget } from '@/components/widgets/SpendingBreakdownWidget';
import { TransactionsView } from '@/components/views/TransactionsView';
import { InvestmentsView } from '@/components/views/InvestmentsView';
import { BudgetView } from '@/components/views/BudgetView';
import { CashFlowView } from '@/components/views/CashFlowView';
import { RecurringView } from '@/components/views/RecurringView';
import { AccountsView } from '@/components/views/AccountsView';
import { SettingsView } from '@/components/views/SettingsView';
import { LoginView } from '@/components/views/LoginView';
import { PlaidConnectModal } from '@/components/PlaidConnectModal';
import { User } from '@lunaria/types';
import { Loader2 } from 'lucide-react';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const VALID_TABS = [
  'dashboard',
  'transactions',
  'recurring',
  'investments',
  'budget',
  'cashflow',
  'accounts',
  'settings',
] as const;

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (VALID_TABS.includes(hash as any)) {
        return hash;
      }
      const saved = localStorage.getItem('lunaria_active_tab');
      if (saved && VALID_TABS.includes(saved as any)) {
        return saved;
      }
    }
    return 'dashboard';
  });

  const handleSelectTab = useCallback((tab: string) => {
    if (VALID_TABS.includes(tab as any)) {
      setActiveTab(tab);
      if (typeof window !== 'undefined') {
        localStorage.setItem('lunaria_active_tab', tab);
        window.history.replaceState(null, '', `#${tab}`);
      }
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (VALID_TABS.includes(hash as any)) {
        setActiveTab(hash);
        localStorage.setItem('lunaria_active_tab', hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [isPlaidModalOpen, setIsPlaidModalOpen] = useState(false);
  const [updateItem, setUpdateItem] = useState<{
    id: string;
    institutionName: string;
  } | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);

  const handleOpenNewPlaid = useCallback(() => {
    setUpdateItem(null);
    setIsPlaidModalOpen(true);
  }, []);

  const handleReconnectInstitution = useCallback(
    (inst: { id: string; name: string }) => {
      setUpdateItem({ id: inst.id, institutionName: inst.name });
      setIsPlaidModalOpen(true);
    },
    [],
  );


  // Fetch real data from backend
  const fetchDashboardData = useCallback(async () => {
    try {
      // Fetch accounts and transactions in parallel with session credentials
      const [accRes, txRes] = await Promise.all([
        fetch(`${API_BASE}/transactions/accounts`, { credentials: 'include' }),
        fetch(`${API_BASE}/transactions?limit=2000`, { credentials: 'include' }),
      ]);

      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData || []);
        setIsLiveConnected(Boolean(accData && accData.length > 0));
      }

      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData.items || []);
      }
    } catch (err) {
      console.warn('Backend API not yet reachable:', err);
    }
  }, []);

  // Check authentication status on mount via HttpOnly session cookie
  useEffect(() => {
    async function checkAuth() {
      // Clean up legacy localStorage tokens
      if (typeof window !== 'undefined') {
        localStorage.removeItem('lunaria_token');
      }

      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          fetchDashboardData();
        } else {
          setUser(null);
          setAuthToken(null);
        }
      } catch (err) {
        console.warn('Could not verify auth session:', err);
        setUser(null);
      } finally {
        setIsAuthChecking(false);
      }
    }

    checkAuth();
  }, [fetchDashboardData]);

  const handleLoginSuccess = (_token: string, loggedInUser: User) => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('lunaria_token');
    }
    setUser(loggedInUser);
    fetchDashboardData();
  };

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('lunaria_token');
      document.cookie = 'lunaria_token=; path=/; max-age=0; SameSite=Lax';
    }
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch { }
    setUser(null);
    setAuthToken(null);
    setAccounts([]);
    setTransactions([]);
  };

  // 1. Initial Authentication Check Loader
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
        <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center p-2.5 mb-3 shadow-xl shadow-purple-500/10 relative">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-purple-600/20 via-fuchsia-500/15 to-transparent blur-sm pointer-events-none" />
          <img src="/logo.png" alt="Lunaria" className="w-full h-full object-contain relative z-10 animate-pulse" />
        </div>
        <span className="text-xs font-medium tracking-wide text-slate-500 dark:text-slate-400">
          Verifying Lunaria session...
        </span>
      </div>
    );
  }


  // 2. Unauthenticated -> Show Login Screen
  if (!user) {
    return <LoginView onSuccess={handleLoginSuccess} />;
  }

  const userFirstName = user.fullName ? user.fullName.split(' ')[0] : 'Alex';

  // 3. Authenticated -> Render Full Dashboard
  const renderActiveView = () => {
    switch (activeTab) {
      case 'transactions':
        return (
          <TransactionsView
            transactions={transactions}
            accounts={accounts}
            onTransactionsUpdated={() => fetchDashboardData()}
          />
        );
      case 'recurring':
        return (
          <RecurringView
            transactions={transactions}
            accounts={accounts}
          />
        );
      case 'investments':
        return (
          <InvestmentsView
            accounts={accounts}
            onOpenPlaid={handleOpenNewPlaid}
          />
        );
      case 'budget':
        return <BudgetView />;
      case 'cashflow':
        return <CashFlowView transactions={transactions} />;
      case 'accounts':
        return (
          <AccountsView
            accounts={accounts}
            onOpenPlaid={handleOpenNewPlaid}
            onAccountUpdated={() => fetchDashboardData()}
            onReconnectInstitution={handleReconnectInstitution}
          />
        );
      case 'settings':
        return (
          <SettingsView
            onRefreshData={() => fetchDashboardData()}
            transactions={transactions}
          />
        );
      case 'dashboard':
      default:
        return (
          <div className="space-y-6">
            {/* 1. Header & Welcome Strip */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Hi {userFirstName} :3
                </h1>
                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {isLiveConnected
                    ? `${accounts.length} Plaid account${accounts.length === 1 ? '' : 's'
                    } connected & synchronized with PostgreSQL`
                    : 'Plaid live sync ready • Click "Connect Bank" to link institutions'}
                </p>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-white/80 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 shadow-sm self-start sm:self-auto shrink-0 max-w-full">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${isLiveConnected ? 'bg-emerald-400' : 'bg-indigo-400'
                    } animate-pulse`}
                />
                <span className="truncate text-[11px] sm:text-xs">
                  {isLiveConnected
                    ? 'Live Plaid Bank Connection Active'
                    : 'Authenticated • Port 3001'}
                </span>
              </div>
            </div>

            {/* 2. Tier 1 (Hero): Net Worth Overview & Trajectory Curve */}
            <div className="w-full">
              <NetWorthWidget accounts={accounts} />
            </div>

            {/* 3. Tier 2 (Key Vitals): Cash Flow & Spending Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <CashFlowWidget transactions={transactions} defaultTimeframe="1M" />
              <SpendingBreakdownWidget transactions={transactions} defaultTimeframe="1M" />
            </div>

            {/* 4. Tier 3 (Assets & Activity): Investments & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <InvestmentGraphWidget
                accounts={accounts}
                onOpenPlaid={handleOpenNewPlaid}
              />
              <RecentTransactionsWidget
                transactions={transactions}
                onViewAll={() => handleSelectTab('transactions')}
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full min-w-0 bg-[var(--background)] text-[var(--foreground)] overflow-hidden transition-colors duration-150">
      {/* Sidebar Navigation (Desktop persistent + Mobile off-canvas drawer) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleSelectTab}
        transactionCount={transactions.length}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 max-w-full h-full overflow-hidden">
        <Header
          activeTab={activeTab}
          onOpenPlaid={handleOpenNewPlaid}
          user={user}
          onSignOut={handleSignOut}
          accounts={accounts}
          transactions={transactions}
          onSelectTab={handleSelectTab}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        {/* Scrollable View Area with bottom clearance for MobileBottomNav */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 max-w-full">
          <main className="p-3 sm:p-4 md:p-8 max-w-7xl mx-auto w-full min-w-0 pb-24 md:pb-8">
            {renderActiveView()}
          </main>
        </div>
      </div>

      {/* Fixed Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={handleSelectTab}
        transactionCount={transactions.length}
      />

      {/* Modals */}
      <PlaidConnectModal
        isOpen={isPlaidModalOpen}
        onClose={() => {
          setIsPlaidModalOpen(false);
          setUpdateItem(null);
        }}
        onConnected={() => fetchDashboardData()}
        onViewAccounts={() => {
          setIsPlaidModalOpen(false);
          setUpdateItem(null);
          handleSelectTab('accounts');
        }}
        userId={user?.id}
        updateItem={updateItem}
      />
    </div>
  );
}
