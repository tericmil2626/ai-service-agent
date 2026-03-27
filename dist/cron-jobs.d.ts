#!/usr/bin/env tsx
/**
 * Cron job for time-based actions in the service business system
 * Runs every hour to:
 * - Send appointment reminders (24h before, 1h before)
 * - Handle missed appointments (follow up if no-show)
 * - Request reviews (24h after job completion)
 *
 * Usage:
 *   tsx cron-jobs.ts
 *
 * To run every hour with system cron:
 *   0 * * * * cd /path/to/service-business && tsx cron-jobs.ts >> logs/cron.log 2>&1
 */
declare function processTimeBasedActions(): Promise<void>;
declare function runCronJobs(): Promise<void>;
export { runCronJobs, processTimeBasedActions };
//# sourceMappingURL=cron-jobs.d.ts.map