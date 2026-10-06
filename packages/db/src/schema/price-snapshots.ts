import { doublePrecision, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const priceSnapshots = pgTable(
  'price_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    time: timestamp('time', { withTimezone: true }).notNull(),
    ticker: text('ticker').notNull(),
    price: doublePrecision('price').notNull(),
    source: text('source').default('polygon').notNull(),
  },
  (table) => [
    index('idx_price_snapshots_ticker_time').on(table.ticker, table.time),
  ]
);

export type PriceSnapshotRow = typeof priceSnapshots.$inferSelect;
export type NewPriceSnapshotRow = typeof priceSnapshots.$inferInsert;
