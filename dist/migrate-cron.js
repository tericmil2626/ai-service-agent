#!/usr/bin/env tsx
"use strict";
/**
 * Database migration script to add columns needed for cron jobs
 */
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("./database");
async function migrate() {
    console.log('[Migrate] Starting database migration...');
    const db = await (0, database_1.getDb)();
    try {
        // Check if columns exist in appointments table
        const appointmentColumns = await db.all(`PRAGMA table_info(appointments)`);
        const columnNames = appointmentColumns.map((col) => col.name);
        // Add reminder_sent_24h column if not exists
        if (!columnNames.includes('reminder_sent_24h')) {
            console.log('[Migrate] Adding reminder_sent_24h column to appointments');
            await db.run(`ALTER TABLE appointments ADD COLUMN reminder_sent_24h INTEGER DEFAULT 0`);
        }
        // Add reminder_sent_1h column if not exists
        if (!columnNames.includes('reminder_sent_1h')) {
            console.log('[Migrate] Adding reminder_sent_1h column to appointments');
            await db.run(`ALTER TABLE appointments ADD COLUMN reminder_sent_1h INTEGER DEFAULT 0`);
        }
        // Add no_show_follow_up_sent column if not exists
        if (!columnNames.includes('no_show_follow_up_sent')) {
            console.log('[Migrate] Adding no_show_follow_up_sent column to appointments');
            await db.run(`ALTER TABLE appointments ADD COLUMN no_show_follow_up_sent INTEGER DEFAULT 0`);
        }
        // Add completed_at column if not exists
        if (!columnNames.includes('completed_at')) {
            console.log('[Migrate] Adding completed_at column to appointments');
            await db.run(`ALTER TABLE appointments ADD COLUMN completed_at DATETIME`);
        }
        // Check if columns exist in jobs table
        const jobColumns = await db.all(`PRAGMA table_info(jobs)`);
        const jobColumnNames = jobColumns.map((col) => col.name);
        // Add review_requested column if not exists
        if (!jobColumnNames.includes('review_requested')) {
            console.log('[Migrate] Adding review_requested column to jobs');
            await db.run(`ALTER TABLE jobs ADD COLUMN review_requested INTEGER DEFAULT 0`);
        }
        console.log('[Migrate] Migration complete!');
        process.exit(0);
    }
    catch (error) {
        console.error('[Migrate] Migration failed:', error);
        process.exit(1);
    }
}
migrate();
//# sourceMappingURL=migrate-cron.js.map