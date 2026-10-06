import { describe, it, expect } from 'vitest';

interface MockNotificationPreferences {
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  accountDisconnected: boolean;
  depositAlert: boolean;
  depositMinAmount: number;
  expenseAlert: boolean;
  expenseMinAmount: number;
  txNeedReview: boolean;
  receiptImportError: boolean;
  receiptImported: boolean;
  receiptMatched: boolean;
  dailyTopMovers: boolean;
  budgetExceeded: boolean;
}

const defaultPreferences: MockNotificationPreferences = {
  emailEnabled: true,
  pushEnabled: true,
  inAppEnabled: true,
  accountDisconnected: true,
  depositAlert: true,
  depositMinAmount: 500,
  expenseAlert: true,
  expenseMinAmount: 500,
  txNeedReview: true,
  receiptImportError: true,
  receiptImported: true,
  receiptMatched: true,
  dailyTopMovers: true,
  budgetExceeded: true,
};

function shouldDispatchNotification(
  prefs: MockNotificationPreferences,
  notification: {
    type: string;
    amount?: number;
  },
): { allowed: boolean; channels: string[] } {
  let allowed = false;

  switch (notification.type) {
    case 'deposit_alert':
      allowed =
        prefs.depositAlert &&
        (notification.amount === undefined ||
          notification.amount >= prefs.depositMinAmount);
      break;
    case 'expense_alert':
      allowed =
        prefs.expenseAlert &&
        (notification.amount === undefined ||
          notification.amount >= prefs.expenseMinAmount);
      break;
    case 'account_disconnected':
      allowed = prefs.accountDisconnected;
      break;
    case 'budget_exceeded':
      allowed = prefs.budgetExceeded;
      break;
    case 'daily_movers':
      allowed = prefs.dailyTopMovers;
      break;
    case 'tx_review':
      allowed = prefs.txNeedReview;
      break;
    case 'receipt_imported':
      allowed = prefs.receiptImported;
      break;
    case 'receipt_error':
      allowed = prefs.receiptImportError;
      break;
    case 'receipt_matched':
      allowed = prefs.receiptMatched;
      break;
    default:
      allowed = true;
  }

  if (!allowed) {
    return { allowed: false, channels: [] };
  }

  const channels: string[] = [];
  if (prefs.inAppEnabled) channels.push('in_app');
  if (prefs.emailEnabled) channels.push('email');
  if (prefs.pushEnabled) channels.push('push');

  return { allowed: true, channels };
}

describe('Monarch-Style Notifications Engine', () => {
  describe('Default Preference Initialization', () => {
    it('initializes with Monarch defaults including $500 transaction thresholds', () => {
      expect(defaultPreferences.depositMinAmount).toBe(500);
      expect(defaultPreferences.expenseMinAmount).toBe(500);
      expect(defaultPreferences.accountDisconnected).toBe(true);
      expect(defaultPreferences.budgetExceeded).toBe(true);
      expect(defaultPreferences.dailyTopMovers).toBe(true);
      expect(defaultPreferences.receiptImported).toBe(true);
    });
  });

  describe('Deposit Alert Thresholds', () => {
    it('allows deposits equal to or above the configured minimum threshold ($500)', () => {
      const res500 = shouldDispatchNotification(defaultPreferences, {
        type: 'deposit_alert',
        amount: 500,
      });
      expect(res500.allowed).toBe(true);
      expect(res500.channels).toContain('email');
      expect(res500.channels).toContain('push');
      expect(res500.channels).toContain('in_app');

      const res1200 = shouldDispatchNotification(defaultPreferences, {
        type: 'deposit_alert',
        amount: 1200,
      });
      expect(res1200.allowed).toBe(true);
    });

    it('suppresses deposits below the configured minimum threshold', () => {
      const res499 = shouldDispatchNotification(defaultPreferences, {
        type: 'deposit_alert',
        amount: 499.99,
      });
      expect(res499.allowed).toBe(false);
      expect(res499.channels).toHaveLength(0);

      const res50 = shouldDispatchNotification(defaultPreferences, {
        type: 'deposit_alert',
        amount: 50,
      });
      expect(res50.allowed).toBe(false);
    });
  });

  describe('Expense Alert Thresholds', () => {
    it('allows expenses equal to or above the configured minimum threshold ($500)', () => {
      const res = shouldDispatchNotification(defaultPreferences, {
        type: 'expense_alert',
        amount: 650,
      });
      expect(res.allowed).toBe(true);
      expect(res.channels).toContain('in_app');
    });

    it('suppresses expenses below the configured minimum threshold', () => {
      const res = shouldDispatchNotification(defaultPreferences, {
        type: 'expense_alert',
        amount: 42.5,
      });
      expect(res.allowed).toBe(false);
    });

    it('respects customized user threshold (e.g. $1000)', () => {
      const customPrefs = { ...defaultPreferences, expenseMinAmount: 1000 };

      const res750 = shouldDispatchNotification(customPrefs, {
        type: 'expense_alert',
        amount: 750,
      });
      expect(res750.allowed).toBe(false);

      const res1200 = shouldDispatchNotification(customPrefs, {
        type: 'expense_alert',
        amount: 1200,
      });
      expect(res1200.allowed).toBe(true);
    });
  });

  describe('Category Toggles & Delivery Channels', () => {
    it('suppresses alert when category toggle is disabled', () => {
      const disabledDisconnect = {
        ...defaultPreferences,
        accountDisconnected: false,
      };
      const res = shouldDispatchNotification(disabledDisconnect, {
        type: 'account_disconnected',
      });
      expect(res.allowed).toBe(false);
    });

    it('routes only to enabled delivery channels', () => {
      const emailOnly = {
        ...defaultPreferences,
        emailEnabled: true,
        pushEnabled: false,
        inAppEnabled: false,
      };

      const res = shouldDispatchNotification(emailOnly, {
        type: 'budget_exceeded',
      });
      expect(res.allowed).toBe(true);
      expect(res.channels).toEqual(['email']);
    });
  });

  describe('Notification Removal & Dismissal', () => {
    it('removes individual notifications without affecting remaining alerts', () => {
      const active = [
        { id: '1', title: 'Alert 1' },
        { id: '2', title: 'Alert 2' },
        { id: '3', title: 'Alert 3' },
      ];

      const dismissedIds = ['2'];
      const filtered = active.filter((n) => !dismissedIds.includes(n.id));

      expect(filtered).toHaveLength(2);
      expect(filtered.map((n) => n.id)).toEqual(['1', '3']);
    });

    it('clears all notifications when Clear All is triggered', () => {
      const active = [
        { id: '1', title: 'Alert 1' },
        { id: '2', title: 'Alert 2' },
      ];

      const allIds = active.map((n) => n.id);
      const dismissedIds = allIds;
      const filtered = active.filter((n) => !dismissedIds.includes(n.id));

      expect(filtered).toHaveLength(0);
    });
  });

  describe('Current vs Historical Transaction Filtering', () => {
    function isCurrentTransactionDate(dateStr?: string | null, maxAgeDays = 2): boolean {
      if (!dateStr) return false;
      try {
        const txDate = new Date(dateStr + 'T00:00:00Z');
        if (isNaN(txDate.getTime())) return false;

        const now = new Date();
        const nowDateStr = now.toISOString().split('T')[0];
        const nowDate = new Date(nowDateStr + 'T00:00:00Z');

        const diffDays = Math.floor(
          (nowDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        return diffDays >= -1 && diffDays <= maxAgeDays;
      } catch {
        return false;
      }
    }

    it('identifies today and yesterday as current transactions', () => {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      expect(isCurrentTransactionDate(today)).toBe(true);
      expect(isCurrentTransactionDate(yesterday)).toBe(true);
      expect(isCurrentTransactionDate(twoDaysAgo)).toBe(true);
    });

    it('strictly rejects historical transactions older than threshold', () => {
      expect(isCurrentTransactionDate('2026-07-03')).toBe(false);
      expect(isCurrentTransactionDate('2026-08-06')).toBe(false);
      expect(isCurrentTransactionDate('2024-01-15')).toBe(false);
      expect(isCurrentTransactionDate(null)).toBe(false);
      expect(isCurrentTransactionDate(undefined)).toBe(false);
      expect(isCurrentTransactionDate('')).toBe(false);
    });

    it('dispatches notifications strictly for current transactions above threshold, never historical', () => {
      const today = new Date().toISOString().split('T')[0];
      const txs = [
        { date: '2026-07-03', amount: -1054.03, name: 'INTERNET PAYMENT' },
        { date: '2026-08-06', amount: 815.1, name: 'ELAN DES:WEB PYMT' },
        { date: today, amount: -1200.0, name: 'Direct Deposit' },
        { date: today, amount: 650.0, name: 'Apple Store' },
      ];

      const dispatched = txs.filter((tx) => {
        if (!isCurrentTransactionDate(tx.date)) return false;
        const absAmt = Math.abs(tx.amount);
        return absAmt >= 500;
      });

      expect(dispatched).toHaveLength(2);
      expect(dispatched[0].name).toBe('Direct Deposit');
      expect(dispatched[1].name).toBe('Apple Store');
    });
  });

  describe('Per-Category Email and Push Notifications Toggling', () => {
    interface GranularCategoryPreferences {
      emailEnabled: boolean;
      pushEnabled: boolean;
      inAppEnabled: boolean;

      depositAlert: boolean;
      depositAlertEmail: boolean;
      depositAlertPush: boolean;

      expenseAlert: boolean;
      expenseAlertEmail: boolean;
      expenseAlertPush: boolean;

      budgetExceeded: boolean;
      budgetExceededEmail: boolean;
      budgetExceededPush: boolean;
    }

    function routeChannels(
      prefs: GranularCategoryPreferences,
      type: 'deposit_alert' | 'expense_alert' | 'budget_exceeded',
    ): { email: boolean; push: boolean; inApp: boolean } {
      let emailAllowed = false;
      let pushAllowed = false;

      if (type === 'deposit_alert' && prefs.depositAlert) {
        emailAllowed = prefs.emailEnabled && prefs.depositAlertEmail;
        pushAllowed = prefs.pushEnabled && prefs.depositAlertPush;
      } else if (type === 'expense_alert' && prefs.expenseAlert) {
        emailAllowed = prefs.emailEnabled && prefs.expenseAlertEmail;
        pushAllowed = prefs.pushEnabled && prefs.expenseAlertPush;
      } else if (type === 'budget_exceeded' && prefs.budgetExceeded) {
        emailAllowed = prefs.emailEnabled && prefs.budgetExceededEmail;
        pushAllowed = prefs.pushEnabled && prefs.budgetExceededPush;
      }

      return {
        email: emailAllowed,
        push: pushAllowed,
        inApp: prefs.inAppEnabled,
      };
    }

    const basePrefs: GranularCategoryPreferences = {
      emailEnabled: true,
      pushEnabled: true,
      inAppEnabled: true,

      depositAlert: true,
      depositAlertEmail: true,
      depositAlertPush: false, // email only

      expenseAlert: true,
      expenseAlertEmail: false,
      expenseAlertPush: true, // push only

      budgetExceeded: true,
      budgetExceededEmail: true,
      budgetExceededPush: true, // both
    };

    it('routes deposit alerts to email only when push is toggled off for deposit alert', () => {
      const routing = routeChannels(basePrefs, 'deposit_alert');
      expect(routing.email).toBe(true);
      expect(routing.push).toBe(false);
      expect(routing.inApp).toBe(true);
    });

    it('routes expense alerts to push only when email is toggled off for expense alert', () => {
      const routing = routeChannels(basePrefs, 'expense_alert');
      expect(routing.email).toBe(false);
      expect(routing.push).toBe(true);
      expect(routing.inApp).toBe(true);
    });

    it('routes budget exceeded alerts to both email and push when both are toggled on', () => {
      const routing = routeChannels(basePrefs, 'budget_exceeded');
      expect(routing.email).toBe(true);
      expect(routing.push).toBe(true);
    });

    it('respects master email switch if global email is disabled', () => {
      const disabledGlobal = { ...basePrefs, emailEnabled: false };
      const routing = routeChannels(disabledGlobal, 'deposit_alert');
      expect(routing.email).toBe(false);
    });
  });

  describe('Budget Exceeded Anti-Spam Protection', () => {
    class MockBudgetExceededNotifier {
      private notificationStore = new Set<string>();
      public dispatchedAlerts: Array<{ category: string; month: string }> = [];

      evaluateTransaction(category: string, month: string, spent: number, budgeted: number) {
        if (spent <= budgeted) return false;

        const budgetKey = `budget-exceeded-${month}-${category.toLowerCase()}`;
        if (this.notificationStore.has(budgetKey)) {
          // Anti-spam rule: Suppress repeated alert in the same month!
          return false;
        }

        this.notificationStore.add(budgetKey);
        this.dispatchedAlerts.push({ category, month });
        return true;
      }
    }

    it('dispatches an alert the first time a budget is exceeded in a month', () => {
      const notifier = new MockBudgetExceededNotifier();
      const res = notifier.evaluateTransaction('Dining Out', '2026-09', 520, 500);
      expect(res).toBe(true);
      expect(notifier.dispatchedAlerts).toHaveLength(1);
    });

    it('suppresses alerts on subsequent transactions in the same category and month (zero spam)', () => {
      const notifier = new MockBudgetExceededNotifier();
      // First transaction: breaks budget ($520 / $500)
      notifier.evaluateTransaction('Dining Out', '2026-09', 520, 500);

      // Everyday follow-up transactions in the same month ($535, $560, $610)
      const res2 = notifier.evaluateTransaction('Dining Out', '2026-09', 535, 500);
      const res3 = notifier.evaluateTransaction('Dining Out', '2026-09', 560, 500);
      const res4 = notifier.evaluateTransaction('Dining Out', '2026-09', 610, 500);

      expect(res2).toBe(false);
      expect(res3).toBe(false);
      expect(res4).toBe(false);
      // Still only 1 alert dispatched!
      expect(notifier.dispatchedAlerts).toHaveLength(1);
    });

    it('allows a new alert for a different category or in the next month', () => {
      const notifier = new MockBudgetExceededNotifier();
      notifier.evaluateTransaction('Dining Out', '2026-09', 520, 500);

      // Different category in same month -> allowed
      const resGroceries = notifier.evaluateTransaction('Groceries', '2026-09', 620, 600);
      expect(resGroceries).toBe(true);

      // Same category in next month (2026-10) -> allowed
      const resNextMonth = notifier.evaluateTransaction('Dining Out', '2026-10', 510, 500);
      expect(resNextMonth).toBe(true);

      expect(notifier.dispatchedAlerts).toHaveLength(3);
    });
  });
});


