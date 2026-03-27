# Cron Jobs for Service Business System

This directory contains cron job scripts for automated time-based actions.

## What the Cron Jobs Do

The cron jobs run every hour to:

1. **Send Appointment Reminders**
   - 24 hours before appointments
   - 1 hour before appointments

2. **Handle Missed Appointments**
   - Detect no-shows (appointments past due by 2+ hours)
   - Send follow-up SMS to reschedule

3. **Request Reviews**
   - Send review requests 24 hours after job completion
   - Only for jobs marked as completed

## Setup

### Option 1: One-time execution (System Cron)

Add to your system crontab:

```bash
# Run every hour at minute 0
0 * * * * cd /path/to/service-business && npm run cron:pro >> logs/cron.log 2>&1
```

Or for starter tier:
```bash
0 * * * * cd /path/to/service-business && npm run cron >> logs/cron.log 2>&1
```

### Option 2: Persistent Scheduler (Node.js process)

Run the scheduler as a background process:

```bash
npm run cron:scheduler
```

Or with PM2:
```bash
pm2 start cron-scheduler.ts --interpreter tsx --name service-business-cron
```

## Database Migration

If you're upgrading from a previous version, run the migration to add required columns:

```bash
npm run db:migrate
```

This adds:
- `reminder_sent_24h` (appointments table)
- `reminder_sent_1h` (appointments table)
- `no_show_follow_up_sent` (appointments table)
- `completed_at` (appointments table)
- `review_requested` (jobs table)

## Environment Variables

- `SERVICE_TIER` - Set to `starter`, `growth`, or `professional` (default: `starter`)
- `TIMEZONE` - Business timezone (default: `America/Chicago`)

## Tier Features

- **Starter**: No automated follow-ups or review requests
- **Growth**: Follow-up reminders enabled
- **Professional**: Follow-up reminders + review requests enabled

## Logs

Cron job output is logged to console. When running via system cron, redirect to a log file:

```bash
0 * * * * cd /path/to/service-business && npm run cron:pro >> /var/log/service-business-cron.log 2>&1
```
