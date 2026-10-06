import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { Resend } from 'resend';
import { DATABASE_TOKEN } from '../database/database.module.js';
import { PushService } from './push.service.js';
import {
  LunariaDb,
  notificationPreferences,
  notifications,
  accounts,
  transactions,
  categoryBudgets,
  plaidItems,
  users,
} from '@lunaria/db';

export interface UpdatePreferencesDto {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  emailAddress?: string;

  accountDisconnected?: boolean;
  accountDisconnectedEmail?: boolean;
  accountDisconnectedPush?: boolean;

  depositAlert?: boolean;
  depositAlertEmail?: boolean;
  depositAlertPush?: boolean;
  depositMinAmount?: number | string;

  expenseAlert?: boolean;
  expenseAlertEmail?: boolean;
  expenseAlertPush?: boolean;
  expenseMinAmount?: number | string;

  txNeedReview?: boolean;
  txNeedReviewEmail?: boolean;
  txNeedReviewPush?: boolean;

  receiptImportError?: boolean;
  receiptImportErrorEmail?: boolean;
  receiptImportErrorPush?: boolean;

  receiptImported?: boolean;
  receiptImportedEmail?: boolean;
  receiptImportedPush?: boolean;

  receiptMatched?: boolean;
  receiptMatchedEmail?: boolean;
  receiptMatchedPush?: boolean;

  dailyTopMovers?: boolean;
  dailyTopMoversEmail?: boolean;
  dailyTopMoversPush?: boolean;

  budgetExceeded?: boolean;
  budgetExceededEmail?: boolean;
  budgetExceededPush?: boolean;
}

export interface DispatchNotificationDto {
  type:
    | 'account_disconnected'
    | 'deposit_alert'
    | 'expense_alert'
    | 'tx_review'
    | 'receipt_imported'
    | 'receipt_matched'
    | 'receipt_error'
    | 'daily_movers'
    | 'budget_exceeded'
    | 'system';
  title: string;
  message: string;
  amount?: number;
  metadata?: Record<string, any>;
}

export function isCurrentTransactionDate(dateStr?: string | null, maxAgeDays = 2): boolean {
  if (!dateStr) return false;
  try {
    const txDate = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(txDate.getTime())) return false;

    const now = new Date();
    const nowDateStr = now.toISOString().split('T')[0];
    const nowDate = new Date(nowDateStr + 'T00:00:00Z');

    // Difference in days: today - txDate
    const diffDays = Math.floor(
      (nowDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Current means not older than maxAgeDays (default 2 days) and not > 1 day in the future
    return diffDays >= -1 && diffDays <= maxAgeDays;
  } catch {
    return false;
  }
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private resendClient: Resend | null = null;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: LunariaDb,
    private readonly configService: ConfigService,
    private readonly pushService: PushService,
  ) {
    const resendKey = this.configService.get<string>('RESEND_API_KEY');
    if (resendKey && resendKey !== 're_your_api_key_here') {
      this.resendClient = new Resend(resendKey);
      this.logger.log('Resend client initialized for transactional email delivery.');
    }
  }

  async getPreferences(userId: string) {
    const [existing] = await this.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (existing) {
      return existing;
    }

    // Auto-initialize default Monarch-style preferences with per-category email & push enabled
    const [created] = await this.db
      .insert(notificationPreferences)
      .values({
        userId,
        emailEnabled: true,
        pushEnabled: true,
        inAppEnabled: true,

        accountDisconnected: true,
        accountDisconnectedEmail: true,
        accountDisconnectedPush: true,

        depositAlert: true,
        depositAlertEmail: true,
        depositAlertPush: true,
        depositMinAmount: '500.00',

        expenseAlert: true,
        expenseAlertEmail: true,
        expenseAlertPush: true,
        expenseMinAmount: '500.00',

        txNeedReview: true,
        txNeedReviewEmail: true,
        txNeedReviewPush: true,

        receiptImportError: true,
        receiptImportErrorEmail: true,
        receiptImportErrorPush: true,

        receiptImported: true,
        receiptImportedEmail: true,
        receiptImportedPush: true,

        receiptMatched: true,
        receiptMatchedEmail: true,
        receiptMatchedPush: true,

        dailyTopMovers: true,
        dailyTopMoversEmail: true,
        dailyTopMoversPush: true,

        budgetExceeded: true,
        budgetExceededEmail: true,
        budgetExceededPush: true,
      })
      .returning();

    return created;
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    await this.getPreferences(userId); // ensure row exists

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (dto.emailEnabled !== undefined) updateData.emailEnabled = dto.emailEnabled;
    if (dto.pushEnabled !== undefined) updateData.pushEnabled = dto.pushEnabled;
    if (dto.inAppEnabled !== undefined) updateData.inAppEnabled = dto.inAppEnabled;
    if (dto.emailAddress !== undefined) updateData.emailAddress = dto.emailAddress;

    if (dto.accountDisconnected !== undefined) updateData.accountDisconnected = dto.accountDisconnected;
    if (dto.accountDisconnectedEmail !== undefined) updateData.accountDisconnectedEmail = dto.accountDisconnectedEmail;
    if (dto.accountDisconnectedPush !== undefined) updateData.accountDisconnectedPush = dto.accountDisconnectedPush;

    if (dto.depositAlert !== undefined) updateData.depositAlert = dto.depositAlert;
    if (dto.depositAlertEmail !== undefined) updateData.depositAlertEmail = dto.depositAlertEmail;
    if (dto.depositAlertPush !== undefined) updateData.depositAlertPush = dto.depositAlertPush;
    if (dto.depositMinAmount !== undefined) updateData.depositMinAmount = String(dto.depositMinAmount);

    if (dto.expenseAlert !== undefined) updateData.expenseAlert = dto.expenseAlert;
    if (dto.expenseAlertEmail !== undefined) updateData.expenseAlertEmail = dto.expenseAlertEmail;
    if (dto.expenseAlertPush !== undefined) updateData.expenseAlertPush = dto.expenseAlertPush;
    if (dto.expenseMinAmount !== undefined) updateData.expenseMinAmount = String(dto.expenseMinAmount);

    if (dto.txNeedReview !== undefined) updateData.txNeedReview = dto.txNeedReview;
    if (dto.txNeedReviewEmail !== undefined) updateData.txNeedReviewEmail = dto.txNeedReviewEmail;
    if (dto.txNeedReviewPush !== undefined) updateData.txNeedReviewPush = dto.txNeedReviewPush;

    if (dto.receiptImportError !== undefined) updateData.receiptImportError = dto.receiptImportError;
    if (dto.receiptImportErrorEmail !== undefined) updateData.receiptImportErrorEmail = dto.receiptImportErrorEmail;
    if (dto.receiptImportErrorPush !== undefined) updateData.receiptImportErrorPush = dto.receiptImportErrorPush;

    if (dto.receiptImported !== undefined) updateData.receiptImported = dto.receiptImported;
    if (dto.receiptImportedEmail !== undefined) updateData.receiptImportedEmail = dto.receiptImportedEmail;
    if (dto.receiptImportedPush !== undefined) updateData.receiptImportedPush = dto.receiptImportedPush;

    if (dto.receiptMatched !== undefined) updateData.receiptMatched = dto.receiptMatched;
    if (dto.receiptMatchedEmail !== undefined) updateData.receiptMatchedEmail = dto.receiptMatchedEmail;
    if (dto.receiptMatchedPush !== undefined) updateData.receiptMatchedPush = dto.receiptMatchedPush;

    if (dto.dailyTopMovers !== undefined) updateData.dailyTopMovers = dto.dailyTopMovers;
    if (dto.dailyTopMoversEmail !== undefined) updateData.dailyTopMoversEmail = dto.dailyTopMoversEmail;
    if (dto.dailyTopMoversPush !== undefined) updateData.dailyTopMoversPush = dto.dailyTopMoversPush;

    if (dto.budgetExceeded !== undefined) updateData.budgetExceeded = dto.budgetExceeded;
    if (dto.budgetExceededEmail !== undefined) updateData.budgetExceededEmail = dto.budgetExceededEmail;
    if (dto.budgetExceededPush !== undefined) updateData.budgetExceededPush = dto.budgetExceededPush;

    const [updated] = await this.db
      .update(notificationPreferences)
      .set(updateData)
      .where(eq(notificationPreferences.userId, userId))
      .returning();

    return updated;
  }

  async getNotifications(userId: string) {
    // Generate live alerts if needed first
    await this.evaluateLiveAlerts(userId);

    const items = await this.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isDismissed, false),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    const unreadCount = items.filter((item) => !item.isRead).length;

    return {
      items,
      count: items.length,
      unreadCount,
    };
  }

  async markAsRead(userId: string, id: string) {
    const [updated] = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.id, id)))
      .returning();

    return updated || { success: true };
  }

  async markAllAsRead(userId: string) {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isDismissed, false),
        ),
      );

    return { success: true };
  }

  async dismissNotification(userId: string, id: string) {
    const [dismissed] = await this.db
      .update(notifications)
      .set({ isDismissed: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.id, id)))
      .returning();

    return dismissed || { success: true };
  }

  async clearAllNotifications(userId: string) {
    await this.db
      .update(notifications)
      .set({ isDismissed: true })
      .where(eq(notifications.userId, userId));

    return { success: true };
  }

  async dispatchNotification(userId: string, payload: DispatchNotificationDto) {
    const prefs = await this.getPreferences(userId);

    // Verify preference toggles for category AND channels (email & push)
    let isCategoryEnabled = true;
    let allowEmail = prefs.emailEnabled;
    let allowPush = prefs.pushEnabled;

    switch (payload.type) {
      case 'account_disconnected':
        isCategoryEnabled = prefs.accountDisconnected;
        allowEmail = allowEmail && prefs.accountDisconnectedEmail;
        allowPush = allowPush && prefs.accountDisconnectedPush;
        break;
      case 'deposit_alert':
        isCategoryEnabled =
          prefs.depositAlert &&
          (payload.amount === undefined ||
            payload.amount >= Number(prefs.depositMinAmount));
        allowEmail = allowEmail && prefs.depositAlertEmail;
        allowPush = allowPush && prefs.depositAlertPush;
        break;
      case 'expense_alert':
        isCategoryEnabled =
          prefs.expenseAlert &&
          (payload.amount === undefined ||
            payload.amount >= Number(prefs.expenseMinAmount));
        allowEmail = allowEmail && prefs.expenseAlertEmail;
        allowPush = allowPush && prefs.expenseAlertPush;
        break;
      case 'tx_review':
        isCategoryEnabled = prefs.txNeedReview;
        allowEmail = allowEmail && prefs.txNeedReviewEmail;
        allowPush = allowPush && prefs.txNeedReviewPush;
        break;
      case 'receipt_imported':
        isCategoryEnabled = prefs.receiptImported;
        allowEmail = allowEmail && prefs.receiptImportedEmail;
        allowPush = allowPush && prefs.receiptImportedPush;
        break;
      case 'receipt_matched':
        isCategoryEnabled = prefs.receiptMatched;
        allowEmail = allowEmail && prefs.receiptMatchedEmail;
        allowPush = allowPush && prefs.receiptMatchedPush;
        break;
      case 'receipt_error':
        isCategoryEnabled = prefs.receiptImportError;
        allowEmail = allowEmail && prefs.receiptImportErrorEmail;
        allowPush = allowPush && prefs.receiptImportErrorPush;
        break;
      case 'daily_movers':
        isCategoryEnabled = prefs.dailyTopMovers;
        allowEmail = allowEmail && prefs.dailyTopMoversEmail;
        allowPush = allowPush && prefs.dailyTopMoversPush;
        break;
      case 'budget_exceeded':
        isCategoryEnabled = prefs.budgetExceeded;
        allowEmail = allowEmail && prefs.budgetExceededEmail;
        allowPush = allowPush && prefs.budgetExceededPush;
        break;
      default:
        isCategoryEnabled = true;
    }

    if (!isCategoryEnabled || (!allowEmail && !allowPush && !prefs.inAppEnabled)) {
      this.logger.debug(
        `Notification suppressed by user preferences (${payload.type}, amount: ${payload.amount}, email: ${allowEmail}, push: ${allowPush})`,
      );
      return null;
    }

    let created = null;

    // 1. In-App notification
    if (prefs.inAppEnabled) {
      [created] = await this.db
        .insert(notifications)
        .values({
          userId,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          metadata: payload.metadata || {},
          isRead: false,
          isDismissed: false,
          channel: 'in_app',
        })
        .returning();
    }

    // 2. Email notification dispatch (strictly respecting per-category email toggle)
    if (allowEmail) {
      let recipient = prefs.emailAddress;
      if (!recipient) {
        const [userRecord] = await this.db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        recipient = userRecord?.email || null;
      }

      const resendKey = this.configService.get<string>('RESEND_API_KEY');

      const fromEmail =
        this.configService.get<string>('RESEND_FROM_EMAIL') ||
        'onboarding@resend.dev';

      const appUrl = (
        this.configService.get<string>('FRONTEND_URL') ||
        this.configService.get<string>('APP_URL') ||
        'http://localhost:3000'
      ).replace(/\/+$/, '');

      if (recipient && resendKey && resendKey !== 're_your_api_key_here') {
        try {
          const resend = this.resendClient || new Resend(resendKey);
          const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: recipient,
            subject: payload.title,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background-color: #0d1117; color: #e6edf3; border-radius: 12px; border: 1px solid #30363d;">
                <div style="margin-bottom: 20px;">
                  <span style="font-size: 18px; font-weight: 800; color: #818cf8; letter-spacing: -0.5px;">LUNARIA</span>
                </div>
                <h2 style="font-size: 18px; font-weight: 700; color: #ffffff; margin: 0 0 12px 0;">${payload.title}</h2>
                <p style="font-size: 14px; color: #8b949e; line-height: 1.6; margin: 0 0 20px 0;">${payload.message}</p>
                <div style="padding-top: 16px; border-top: 1px solid #21262d; font-size: 11px; color: #8b949e; line-height: 1.5;">
                  <p style="margin: 0 0 6px 0;">You received this automated notification because you opted in to alerts on Lunaria.</p>
                  <p style="margin: 0;">To update your alert preferences or unsubscribe, visit your <a href="${appUrl}" style="color: #818cf8; text-decoration: underline;">Lunaria Settings</a>. View our <a href="${appUrl}/privacy" style="color: #818cf8; text-decoration: underline;">Privacy Policy</a>.</p>
                </div>
              </div>
            `,
          });

          if (error) {
            this.logger.error(`Resend email delivery error: ${error.message}`);
          } else {
            this.logger.log(
              `[Resend Email Sent] ID: ${data?.id} | To: ${recipient} | Subject: "${payload.title}"`,
            );
          }
        } catch (err) {
          this.logger.error('Failed to send email via Resend:', err);
        }
      } else {
        this.logger.log(
          `[Email Notification Dispatched] To: ${recipient || 'Default Email'} | Subject: "${payload.title}" | Body: "${payload.message}" ${!resendKey || resendKey === 're_your_api_key_here' ? '(Provide RESEND_API_KEY in .env for inbox delivery)' : ''}`,
        );
      }
    }

    // 3. Push notification dispatch (strictly respecting per-category push toggle)
    if (allowPush) {
      this.logger.log(
        `[Push Notification Dispatched] Title: "${payload.title}" | Body: "${payload.message}"`,
      );
      try {
        await this.pushService.sendPushToUser(userId, {
          title: payload.title,
          message: payload.message,
          metadata: payload.metadata,
        });
      } catch (pushErr) {
        this.logger.error('Failed delivering push notification:', pushErr);
      }
    }

    return created;
  }

  /**
   * Evaluates if any budgeted category is exceeded for the active month.
   * ANTI-SPAM RULE: Emits at most ONE notification per category per calendar month.
   * Subsequent transactions in the same month will not trigger spam alerts.
   */
  async checkBudgetExceededAlerts(userId: string, activeMonth?: string) {
    try {
      const month =
        activeMonth && /^\d{4}-\d{2}$/.test(activeMonth)
          ? activeMonth
          : new Date().toISOString().substring(0, 7);

      const prefs = await this.getPreferences(userId);
      if (!prefs.budgetExceeded) return;

      // 1. Get saved expense budgets for this month
      const savedBudgets = await this.db
        .select()
        .from(categoryBudgets)
        .where(
          and(
            eq(categoryBudgets.userId, userId),
            eq(categoryBudgets.month, month),
            eq(categoryBudgets.type, 'expense'),
          ),
        );

      if (!savedBudgets.length) return;

      // 2. Fetch month's expense transactions
      const startDate = `${month}-01`;
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

      const monthTransactions = await this.db
        .select({
          amount: transactions.amount,
          category: transactions.category,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(
          and(
            eq(transactions.userId, userId),
            eq(accounts.isHidden, false),
            gte(transactions.date, startDate),
            lte(transactions.date, endDate),
          ),
        );

      const actualSpentMap = new Map<string, number>();
      for (const tx of monthTransactions) {
        const amt = Number(tx.amount) || 0;
        if (amt > 0 && tx.category) {
          const catKey = tx.category.toLowerCase();
          actualSpentMap.set(catKey, (actualSpentMap.get(catKey) || 0) + amt);
        }
      }

      // 3. Check each budgeted category
      for (const budget of savedBudgets) {
        const budgeted = Number(budget.budgetedAmount) || 0;
        if (budgeted <= 0) continue;

        const actual = actualSpentMap.get(budget.category.toLowerCase()) || 0;
        if (actual > budgeted) {
          // ANTI-SPAM RULE: Construct unique per-category per-month deduplication key
          // Strictly prevents multiple alerts when everyday transactions continue in this category
          const budgetKey = `budget-exceeded-${month}-${budget.category.toLowerCase()}`;

          const [alreadyNotified] = await this.db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, userId),
                sql`${notifications.metadata}->>'budgetKey' = ${budgetKey}`,
              ),
            )
            .limit(1);

          if (!alreadyNotified) {
            await this.dispatchNotification(userId, {
              type: 'budget_exceeded',
              title: 'Budget Exceeded',
              message: `You exceeded your ${month} budget for ${budget.category}: $${actual.toFixed(2)} spent of $${budgeted.toFixed(2)} limit.`,
              amount: actual,
              metadata: {
                budgetKey,
                category: budget.category,
                month,
                budgeted,
                actual,
              },
            });
            this.logger.log(
              `Dispatched anti-spammed budget exceeded alert for ${budget.category} ($${actual} / $${budgeted})`,
            );
          }
        }
      }
    } catch (err) {
      this.logger.error('Error checking budget exceeded alerts:', err);
    }
  }

  async handleNewTransaction(
    userId: string,
    tx: {
      plaidTransactionId?: string;
      id?: string;
      amount: number | string;
      name: string;
      merchantName?: string | null;
      date: string;
    },
  ) {
    // Strictly reject historical or invalid transaction dates
    if (!tx || !tx.date || !isCurrentTransactionDate(tx.date, 2)) {
      this.logger.debug(
        `Skipping alert for non-current/historical transaction (${tx?.name}, date: ${tx?.date})`,
      );
      return null;
    }

    const numAmount = Number(tx.amount);
    if (isNaN(numAmount)) return null;

    const prefs = await this.getPreferences(userId);
    const txKeyIdentifier =
      tx.plaidTransactionId || tx.id || `${tx.date}-${tx.amount}-${tx.name}`;

    // 1. Check deposit alert (in Plaid/accounting, negative amount is an inflow/credit)
    if (numAmount < 0 && prefs.depositAlert) {
      const minDeposit = Number(prefs.depositMinAmount) || 500;
      const absAmount = Math.abs(numAmount);
      if (absAmount >= minDeposit) {
        const metaKey = `deposit-alert-${txKeyIdentifier}`;
        const [exists] = await this.db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              sql`${notifications.metadata}->>'txKey' = ${metaKey}`,
            ),
          )
          .limit(1);

        if (!exists) {
          return this.dispatchNotification(userId, {
            type: 'deposit_alert',
            title: 'Deposit Alert',
            message: `A deposit of $${absAmount.toFixed(2)} synced from ${tx.merchantName || tx.name}.`,
            amount: absAmount,
            metadata: { txKey: metaKey, txId: txKeyIdentifier, date: tx.date },
          });
        }
      }
    }

    // 2. Check expense alert (in Plaid, positive amount is an outflow/debit)
    if (numAmount > 0 && prefs.expenseAlert) {
      const minExpense = Number(prefs.expenseMinAmount) || 500;
      if (numAmount >= minExpense) {
        const metaKey = `expense-alert-${txKeyIdentifier}`;
        const [exists] = await this.db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              sql`${notifications.metadata}->>'txKey' = ${metaKey}`,
            ),
          )
          .limit(1);

        if (!exists) {
          return this.dispatchNotification(userId, {
            type: 'expense_alert',
            title: 'Expense Alert',
            message: `An expense of $${numAmount.toFixed(2)} synced at ${tx.merchantName || tx.name}.`,
            amount: numAmount,
            metadata: { txKey: metaKey, txId: txKeyIdentifier, date: tx.date },
          });
        }
      }
    }

    return null;
  }

  async evaluateLiveAlerts(userId: string) {
    try {
      const prefs = await this.getPreferences(userId);

      // Check disconnected Plaid items
      if (prefs.accountDisconnected) {
        const disconnected = await this.db
          .select()
          .from(plaidItems)
          .where(
            and(
              eq(plaidItems.userId, userId),
              eq(plaidItems.status, 'disconnected'),
            ),
          );

        for (const item of disconnected) {
          const metaKey = `plaid-item-disconnected-${item.id}`;
          const [exists] = await this.db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, userId),
                sql`${notifications.metadata}->>'itemKey' = ${metaKey}`,
              ),
            );

          if (!exists) {
            await this.dispatchNotification(userId, {
              type: 'account_disconnected',
              title: 'Account Disconnected',
              message: `Your financial institution connection (${item.institutionName || 'Bank'}) requires re-authentication.`,
              metadata: { itemKey: metaKey, itemId: item.id },
            });
          }
        }
      }
    } catch (err) {
      this.logger.error('Error evaluating live alerts:', err);
    }
  }
}
