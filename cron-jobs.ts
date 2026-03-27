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

import { getDb, saveMessage } from './database';

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

async function processFollowUps(db: any): Promise<void> {
  console.log('[Cron] Processing follow-ups');

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
    
    // Save reminder message to conversations
    await saveMessage({
      customer_id: appt.customer_id,
      job_id: appt.job_id,
      channel: 'sms',
      direction: 'outbound',
      message_text: `Hi ${appt.customer_name}, this is a reminder that your ${appt.service_type} appointment is scheduled for tomorrow at ${appt.scheduled_time}. Reply CONFIRM to confirm or RESCHEDULE if you need to change it.`,
      agent_name: 'followup',
    });

    // Mark reminder as sent
    await db.run(`
      UPDATE appointments SET reminder_sent_24h = 1 WHERE id = ?
    `, [appt.id]);
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
    
    await saveMessage({
      customer_id: appt.customer_id,
      job_id: appt.job_id,
      channel: 'sms',
      direction: 'outbound',
      message_text: `Hi ${appt.customer_name}, your ${appt.service_type} appointment is in 1 hour. Our technician is on the way!`,
      agent_name: 'followup',
    });

    await db.run(`
      UPDATE appointments SET reminder_sent_1h = 1 WHERE id = ?
    `, [appt.id]);
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

    // If appointment was more than 2 hours ago and status is still confirmed
    if (hoursSinceAppt > 2) {
      console.log(`[FollowUp] Sending no-show follow-up to ${appt.customer_name} (${appt.phone})`);
      
      await saveMessage({
        customer_id: appt.customer_id,
        job_id: appt.job_id,
        channel: 'sms',
        direction: 'outbound',
        message_text: `Hi ${appt.customer_name}, we missed you for your ${appt.service_type} appointment today. Would you like to reschedule? Reply YES to reschedule or call us at (555) 123-4567.`,
        agent_name: 'followup',
      });

      // Update appointment status to no_show
      await db.run(`
        UPDATE appointments SET no_show_follow_up_sent = 1, status = 'no_show' WHERE id = ?
      `, [appt.id]);
    }
  }

  console.log(`[Cron] Follow-ups complete: ${appointments24h.length} 24h reminders, ${appointments1h.length} 1h reminders, ${pastAppointments.length} no-show checks`);
}

async function processReviewRequests(db: any): Promise<void> {
  console.log('[Cron] Processing review requests');

  // Find jobs completed 24h ago that haven't had review requests sent
  const jobsForReview = await db.all(`
    SELECT j.*, c.name as customer_name, c.phone, a.scheduled_date, a.completed_at
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
    
    await saveMessage({
      customer_id: job.customer_id,
      job_id: job.id,
      channel: 'sms',
      direction: 'outbound',
      message_text: `Hi ${job.customer_name}, thank you for choosing us for your ${job.service_type} service! We'd love to hear about your experience. Please leave us a review: https://g.page/r/YOUR_BUSINESS/review`,
      agent_name: 'reviews',
    });

    // Mark review as requested
    await db.run(`
      UPDATE jobs SET review_requested = 1 WHERE id = ?
    `, [job.id]);
  }

  console.log(`[Cron] Review requests complete: ${jobsForReview.length} sent`);
}

async function processTimeBasedActions(): Promise<void> {
  console.log('[Cron] Running time-based actions');
  
  const config = loadConfig();
  const db = await getDb();

  // Check if follow-up is available
  if (config.features.followUpReminders) {
    await processFollowUps(db);
  } else {
    console.log('[Cron] Follow-up reminders disabled for tier:', config.tier);
  }

  // Check if reviews are available
  if (config.features.reviewRequests) {
    await processReviewRequests(db);
  } else {
    console.log('[Cron] Review requests disabled for tier:', config.tier);
  }
}

async function runCronJobs() {
  const startTime = new Date();
  console.log(`[Cron] Starting time-based actions at ${startTime.toISOString()}`);

  try {
    // Run time-based actions
    await processTimeBasedActions();

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    console.log(`[Cron] Completed in ${duration}ms at ${endTime.toISOString()}`);
    
    process.exit(0);
  } catch (error) {
    console.error('[Cron] Error running cron jobs:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runCronJobs();
}

export { runCronJobs, processTimeBasedActions };
