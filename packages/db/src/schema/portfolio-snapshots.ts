import { doublePrecision, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { accounts } from './accounts';

export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    balance: doublePrecision('balance').notNull(),
    source: text('source').default('plaid').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_portfolio_snapshots_acc_date').on(table.accountId, table.date),
    index('idx_portfolio_snapshots_user_date').on(table.userId, table.date),
  ]
);

export type PortfolioSnapshotRow = typeof portfolioSnapshots.$inferSelect;
export type NewPortfolioSnapshotRow = typeof portfolioSnapshots.$inferInsert;
