import { boolean, date, doublePrecision, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { accounts } from './accounts';

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
    plaidTransactionId: text('plaid_transaction_id').unique(),
    amount: doublePrecision('amount').notNull(),
    isoCurrencyCode: text('iso_currency_code').default('USD').notNull(),
    date: date('date').notNull(),
    datetime: timestamp('datetime', { withTimezone: true }),
    name: text('name').notNull(),
    merchantName: text('merchant_name'),
    category: text('category').default('Uncategorized').notNull(),
    subCategory: text('sub_category'),
    pending: boolean('pending').default(false).notNull(),
    notes: text('notes'),
    tags: jsonb('tags').$type<string[]>().default([]),
    logoUrl: text('logo_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_transactions_user_date').on(table.userId, table.date),
    index('idx_transactions_account_date').on(table.accountId, table.date),
    index('idx_transactions_category').on(table.userId, table.category),
  ]
);

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
