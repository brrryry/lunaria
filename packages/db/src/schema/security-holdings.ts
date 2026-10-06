import { doublePrecision, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { accounts } from './accounts';

export const securityHoldings = pgTable(
  'security_holdings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
    securityId: text('security_id').notNull(),
    tickerSymbol: text('ticker_symbol').notNull(),
    name: text('name').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    costBasis: doublePrecision('cost_basis'),
    institutionPrice: doublePrecision('institution_price').notNull(),
    institutionValue: doublePrecision('institution_value').notNull(),
    currency: text('currency').default('USD').notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_security_holdings_user').on(table.userId),
    index('idx_security_holdings_account').on(table.accountId),
    uniqueIndex('idx_security_holdings_acc_sec').on(table.accountId, table.securityId),
  ],
);

export type SecurityHoldingRow = typeof securityHoldings.$inferSelect;
export type NewSecurityHoldingRow = typeof securityHoldings.$inferInsert;
