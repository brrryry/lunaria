import { pgTable, uuid, text, boolean, numeric, timestamp, jsonb, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),

  // Delivery channels
  emailEnabled: boolean('email_enabled').default(true).notNull(),
  pushEnabled: boolean('push_enabled').default(true).notNull(),
  inAppEnabled: boolean('in_app_enabled').default(true).notNull(),
  emailAddress: text('email_address'),

  // Account Alerts
  accountDisconnected: boolean('account_disconnected').default(true).notNull(),
  accountDisconnectedEmail: boolean('account_disconnected_email').default(true).notNull(),
  accountDisconnectedPush: boolean('account_disconnected_push').default(true).notNull(),

  // Transaction Alerts
  depositAlert: boolean('deposit_alert').default(true).notNull(),
  depositAlertEmail: boolean('deposit_alert_email').default(true).notNull(),
  depositAlertPush: boolean('deposit_alert_push').default(true).notNull(),
  depositMinAmount: numeric('deposit_min_amount', { precision: 12, scale: 2 })
    .default('500.00')
    .notNull(),

  expenseAlert: boolean('expense_alert').default(true).notNull(),
  expenseAlertEmail: boolean('expense_alert_email').default(true).notNull(),
  expenseAlertPush: boolean('expense_alert_push').default(true).notNull(),
  expenseMinAmount: numeric('expense_min_amount', { precision: 12, scale: 2 })
    .default('500.00')
    .notNull(),

  txNeedReview: boolean('tx_need_review').default(true).notNull(),
  txNeedReviewEmail: boolean('tx_need_review_email').default(true).notNull(),
  txNeedReviewPush: boolean('tx_need_review_push').default(true).notNull(),

  // Receipts
  receiptImportError: boolean('receipt_import_error').default(true).notNull(),
  receiptImportErrorEmail: boolean('receipt_import_error_email').default(true).notNull(),
  receiptImportErrorPush: boolean('receipt_import_error_push').default(true).notNull(),

  receiptImported: boolean('receipt_imported').default(true).notNull(),
  receiptImportedEmail: boolean('receipt_imported_email').default(true).notNull(),
  receiptImportedPush: boolean('receipt_imported_push').default(true).notNull(),

  receiptMatched: boolean('receipt_matched').default(true).notNull(),
  receiptMatchedEmail: boolean('receipt_matched_email').default(true).notNull(),
  receiptMatchedPush: boolean('receipt_matched_push').default(true).notNull(),

  // Investments
  dailyTopMovers: boolean('daily_top_movers').default(true).notNull(),
  dailyTopMoversEmail: boolean('daily_top_movers_email').default(true).notNull(),
  dailyTopMoversPush: boolean('daily_top_movers_push').default(true).notNull(),

  // Budget
  budgetExceeded: boolean('budget_exceeded').default(true).notNull(),
  budgetExceededEmail: boolean('budget_exceeded_email').default(true).notNull(),
  budgetExceededPush: boolean('budget_exceeded_push').default(true).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  type: varchar('type', { length: 64 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  isRead: boolean('is_read').default(false).notNull(),
  isDismissed: boolean('is_dismissed').default(false).notNull(),
  channel: varchar('channel', { length: 32 }).default('in_app').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  platform: varchar('platform', { length: 32 }).notNull(), // 'web' | 'expo' | 'ios' | 'android'
  token: text('token').notNull(),
  endpoint: text('endpoint'),
  p256dh: text('p256dh'),
  auth: text('auth'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type NotificationPreferenceRow = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferenceRow = typeof notificationPreferences.$inferInsert;
export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;

