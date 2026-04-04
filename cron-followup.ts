#!/usr/bin/env node
// Cron job script for Follow-Up Agent
// Run this every hour to process reminders

import { FollowUpAgent, createFeedbackTable } from './src/agents/FollowUpAgent.js';

async function runFollowUp() {
  console.log('[' + new Date().toISOString() + '] Starting Follow-Up Agent...');
  
  try {
    // Ensure feedback table exists
    await createFeedbackTable();
    
    const followUpAgent = new FollowUpAgent();
    const results = await followUpAgent.processReminders();
    
    console.log('[' + new Date().toISOString() + '] Follow-Up Agent completed:');
    console.log('  - Reminders sent:', results.remindersSent);
    console.log('  - Follow-ups sent:', results.followUpsSent);
    
    process.exit(0);
  } catch (error) {
    console.error('[' + new Date().toISOString() + '] Follow-Up Agent failed:', error);
    process.exit(1);
  }
}

runFollowUp();
