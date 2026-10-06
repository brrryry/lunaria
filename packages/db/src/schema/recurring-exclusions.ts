import { index, pgTable, text, timestamp, uuid, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userRecurringExclusions = pgTable(
  'user_recurring_exclusions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    streamId: text('stream_id').notNull(),
    merchantName: text('merchant_name'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_user_recurring_exclusions_user').on(table.userId),
    unique('uq_user_recurring_exclusions_user_stream').on(table.userId, table.streamId),
  ],
);

export type UserRecurringExclusionRow =
  typeof userRecurringExclusions.$inferSelect;
export type NewUserRecurringExclusionRow =
  typeof userRecurringExclusions.$inferInsert;
