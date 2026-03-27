#!/usr/bin/env tsx
"use strict";
/**
 * Persistent cron scheduler using node-cron
 * Runs continuously and executes time-based actions every hour
 *
 * Usage:
 *   tsx cron-scheduler.ts
 *
 * Or with PM2:
 *   pm2 start cron-scheduler.ts --interpreter tsx
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const cron = __importStar(require("node-cron"));
const database_1 = require("./database");
// Load configuration from environment
function loadConfig() {
    const tier = process.env.SERVICE_TIER || 'starter';
    return {
        tier,
        businessId: process.env.BUSINESS_ID || 'default',
        businessName: process.env.BUSINESS_NAME || 'Service Business',
        features: {
            autoDispatch: tier !== 'starter',
            reviewRequests: tier !== 'starter',
            followUpReminders: tier !== 'starter',
        },
    };
}
async function processFollowUps(db) {
    console.log('[Scheduler] Processing follow-ups');
    const now = new Date();
    // 1. Send appointment reminders (24h before)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const appointments24h = await db.all(`
    SELECT a.*, c.name as customer_name, c.phone, j.service_type, j.id as job_id, c.id as customer_id
    FROM appointments a
    JOIN jobs j ON a.job_id = j.id
    JOIN customers c ON j.customer_id = c.id
    WHERE a.scheduled_date = ?
      AND a.status IN ('pending', 'confirmed')
      AND (a.reminder_sent_24h IS NULL OR a.reminder_sent_24h = 0)
  `, [tomorrowStr]);
    for (const appt of appointments24h) {
        console.log(`[FollowUp] Sending 24h reminder to ${appt.customer_name} (${appt.phone})`);
        await (0, database_1.saveMessage)({
            customer_id: appt.customer_id,
            job_id: appt.job_id,
            channel: 'sms',
            direction: 'outbound',
            message_text: `Hi ${appt.customer_name}, this is a reminder that your ${appt.service_type} appointment is scheduled for tomorrow at ${appt.scheduled_time}. Reply CONFIRM to confirm or RESCHEDULE if you need to change it.`,
            agent_name: 'followup',
        });
        await db.run(`UPDATE appointments SET reminder_sent_24h = 1 WHERE id = ?`, [appt.id]);
    }
    // 2. Send appointment reminders (1h before)
    const currentHour = now.getHours();
    const appointments1h = await db.all(`
    SELECT a.*, c.name as customer_name, c.phone, j.service_type, j.id as job_id, c.id as customer_id
    FROM appointments a
    JOIN jobs j ON a.job_id = j.id
    JOIN customers c ON j.customer_id = c.id
    WHERE a.scheduled_date = date('now')
      AND CAST(substr(a.scheduled_time, 1, 2) AS INTEGER) = ?
      AND a.status IN ('pending', 'confirmed')
      AND (a.reminder_sent_1h IS NULL OR a.reminder_sent_1h = 0)
  `, [currentHour + 1]);
    for (const appt of appointments1h) {
        console.log(`[FollowUp] Sending 1h reminder to ${appt.customer_name} (${appt.phone})`);
        await (0, database_1.saveMessage)({
            customer_id: appt.customer_id,
            job_id: appt.job_id,
            channel: 'sms',
            direction: 'outbound',
            message_text: `Hi ${appt.customer_name}, your ${appt.service_type} appointment is in 1 hour. Our technician is on the way!`,
            agent_name: 'followup',
        });
        await db.run(`UPDATE appointments SET reminder_sent_1h = 1 WHERE id = ?`, [appt.id]);
    }
    // 3. Handle missed appointments (no-show follow up)
    const pastAppointments = await db.all(`
    SELECT a.*, c.name as customer_name, c.phone, j.service_type, j.id as job_id, c.id as customer_id
    FROM appointments a
    JOIN jobs j ON a.job_id = j.id
    JOIN customers c ON j.customer_id = c.id
    WHERE a.scheduled_date < date('now')
      AND a.status = 'confirmed'
      AND (a.no_show_follow_up_sent IS NULL OR a.no_show_follow_up_sent = 0)
  `);
    for (const appt of pastAppointments) {
        const apptDateTime = new Date(`${appt.scheduled_date}T${appt.scheduled_time}`);
        const hoursSinceAppt = (now.getTime() - apptDateTime.getTime()) / (1000 * 60 * 60);
        if (hoursSinceAppt > 2) {
            console.log(`[FollowUp] Sending no-show follow-up to ${appt.customer_name} (${appt.phone})`);
            await (0, database_1.saveMessage)({
                customer_id: appt.customer_id,
                job_id: appt.job_id,
                channel: 'sms',
                direction: 'outbound',
                message_text: `Hi ${appt.customer_name}, we missed you for your ${appt.service_type} appointment today. Would you like to reschedule? Reply YES to reschedule or call us at (555) 123-4567.`,
                agent_name: 'followup',
            });
            await db.run(`UPDATE appointments SET no_show_follow_up_sent = 1, status = 'no_show' WHERE id = ?`, [appt.id]);
        }
    }
    console.log(`[Scheduler] Follow-ups complete: ${appointments24h.length} 24h, ${appointments1h.length} 1h, ${pastAppointments.length} no-show`);
}
async function processReviewRequests(db) {
    console.log('[Scheduler] Processing review requests');
    const jobsForReview = await db.all(`
    SELECT j.*, c.name as customer_name, c.phone, c.id as customer_id
    FROM jobs j
    JOIN customers c ON j.customer_id = c.id
    JOIN appointments a ON a.job_id = j.id
    WHERE j.status = 'completed'
      AND a.completed_at IS NOT NULL
      AND datetime(a.completed_at) <= datetime('now', '-1 day')
      AND datetime(a.completed_at) > datetime('now', '-3 days')
      AND (j.review_requested IS NULL OR j.review_requested = 0)
  `);
    for (const job of jobsForReview) {
        console.log(`[Review] Sending review request to ${job.customer_name} (${job.phone})`);
        await (0, database_1.saveMessage)({
            customer_id: job.customer_id,
            job_id: job.id,
            channel: 'sms',
            direction: 'outbound',
            message_text: `Hi ${job.customer_name}, thank you for choosing us for your ${job.service_type} service! We'd love to hear about your experience. Please leave us a review: https://g.page/r/YOUR_BUSINESS/review`,
            agent_name: 'reviews',
        });
        await db.run(`UPDATE jobs SET review_requested = 1 WHERE id = ?`, [job.id]);
    }
    console.log(`[Scheduler] Review requests complete: ${jobsForReview.length} sent`);
}
async function processTimeBasedActions() {
    console.log('[Scheduler] Running time-based actions');
    const config = loadConfig();
    const db = await (0, database_1.getDb)();
    if (config.features.followUpReminders) {
        await processFollowUps(db);
    }
    else {
        console.log('[Scheduler] Follow-up reminders disabled for tier:', config.tier);
    }
    if (config.features.reviewRequests) {
        await processReviewRequests(db);
    }
    else {
        console.log('[Scheduler] Review requests disabled for tier:', config.tier);
    }
}
async function startScheduler() {
    console.log('[Scheduler] Starting cron scheduler...');
    const config = loadConfig();
    console.log(`[Scheduler] Tier: ${config.tier}`);
    // Schedule time-based actions to run every hour
    // Cron format: minute hour day month day-of-week
    // '0 * * * *' = At minute 0 of every hour
    cron.schedule('0 * * * *', async () => {
        const startTime = new Date();
        console.log(`[Scheduler] Running time-based actions at ${startTime.toISOString()}`);
        try {
            await processTimeBasedActions();
            const duration = Date.now() - startTime.getTime();
            console.log(`[Scheduler] Completed in ${duration}ms`);
        }
        catch (error) {
            console.error('[Scheduler] Error running time-based actions:', error);
        }
    });
    console.log('[Scheduler] Cron job scheduled to run every hour at minute 0');
    console.log('[Scheduler] Press Ctrl+C to stop');
    // Also run immediately on startup
    console.log('[Scheduler] Running initial check...');
    await processTimeBasedActions();
    console.log('[Scheduler] Initial check complete');
}
// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Scheduler] Shutting down gracefully...');
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log('\n[Scheduler] Shutting down gracefully...');
    process.exit(0);
});
// Start the scheduler
startScheduler().catch((error) => {
    console.error('[Scheduler] Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=cron-scheduler.js.map