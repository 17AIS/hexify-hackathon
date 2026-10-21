import { pgTable, serial, text, timestamp, integer, real, boolean, jsonb, index } from 'drizzle-orm/pg-core'

// One row per finished test. `clientId` is an anonymous id kept in the
// browser's localStorage, so each browser sees only its own history.
// The headline numbers get columns for comparing; `report` is the full
// engine results() object so an old test can be reopened as it was.
export const tests = pgTable(
  'tests',
  {
    id: serial().primaryKey(),
    clientId: text('client_id').notNull(),
    duration: integer().notNull(),
    practice: boolean().notNull().default(false),
    scaled: real().notNull(),
    net: real().notNull(),
    raw: real().notNull(),
    accuracy: real().notNull(),
    consistency: real().notNull(),
    startLevel: integer('start_level').notNull(),
    finalLevel: integer('final_level').notNull(),
    peakLevel: integer('peak_level').notNull(),
    report: jsonb().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tests_client_created_idx').on(t.clientId, t.createdAt)],
)
