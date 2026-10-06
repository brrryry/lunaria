import { doublePrecision, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { accounts } from './accounts';

export const investmentTransactions = pgTable(
  'investment_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
    plaidInvestmentTransactionId: text('plaid_investment_transaction_id').unique(),
    securityId: text('security_id'),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    name: text('name').notNull(),
    quantity: doublePrecision('quantity').default(0).notNull(),
    price: doublePrecision('price').default(0).notNull(),
    amount: doublePrecision('amount').default(0).notNull(),
    fees: doublePrecision('fees').default(0),
    type: text('type').notNull(),
    subtype: text('subtype'),
    currency: text('currency').default('USD').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_invest_tx_user').on(table.userId),
    index('idx_invest_tx_account').on(table.accountId),
    index('idx_invest_tx_date').on(table.userId, table.date),
    uniqueIndex('idx_invest_tx_plaid_id').on(table.plaidInvestmentTransactionId),
  ],
);

export type InvestmentTransactionRow = typeof investmentTransactions.$inferSelect;
export type NewInvestmentTransactionRow = typeof investmentTransactions.$inferInsert;
