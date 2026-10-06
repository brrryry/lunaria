import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const institutionUnlinkHistory = pgTable(
  'institution_unlink_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    institutionId: text('institution_id').notNull(),
    institutionName: text('institution_name').notNull(),
    unlinkedAt: timestamp('unlinked_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_unlink_user_inst_time').on(
      table.userId,
      table.institutionId,
      table.unlinkedAt,
    ),
  ],
);

export type InstitutionUnlinkHistoryRow =
  typeof institutionUnlinkHistory.$inferSelect;
export type NewInstitutionUnlinkHistoryRow =
  typeof institutionUnlinkHistory.$inferInsert;
