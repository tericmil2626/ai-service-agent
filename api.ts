import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { ServiceBusinessOrchestrator } from './orchestrator-v2';
import { getDb } from './database';
import { getAuthUrl, handleAuthCallback, createAppointmentEvent, isTimeSlotAvailable } from './google-calendar';
import { MissedCallHandler } from './missed-call-handler';

async function startServer() {
  const app = Fastify({
    logger: true
  });

  const tier = process.env.SERVICE_TIER || 'starter';
  const businessId = process.env.BUSINESS_ID || 'default';
  const businessName = process.env.BUSINESS_NAME || 'Service Business';
  
  const orchestrator = new ServiceBusinessOrchestrator({
    tier: tier as any,
    businessId,
    businessName,
    businessConfig: {
      hours: { start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5, 6] },
      timezone: process.env.TIMEZONE || 'America/Chicago',
      services: ['plumbing', 'electrical', 'hvac', 'appliance']
    },
    features: {
      autoDispatch: tier !== 'starter',
      reviewRequests: tier !== 'starter',
      followUpReminders: tier !== 'starter'
    }
  });
  await orchestrator.initialize();

  // Initialize missed call handler
  const missedCallHandler = new MissedCallHandler(businessName);

  // CORS for dashboard and widget - allow all origins for webhooks
  await app.register(cors, {
    origin: true,
    credentials: true
  });

  // Form body parser for SMS webhooks
  await app.register(formbody);

// ========== WIDGET DEMO ==========

// Serve widget demo page
app.get('/widget/demo', async (request, reply) => {
  const fs = await import('fs');
  const path = await import('path');
  const html = fs.readFileSync(path.join(process.cwd(), 'widget', 'demo.html'), 'utf-8');
  reply.type('text/html').send(html);
});

// Serve widget JS
app.get('/widget/chat-widget.js', async (request, reply) => {
  const fs = await import('fs');
  const path = await import('path');
  const js = fs.readFileSync(path.join(process.cwd(), 'widget', 'chat-widget.js'), 'utf-8');
  reply.type('application/javascript').send(js);
});

// ========== WEBHOOK ENDPOINTS (External Services) ==========

// Twilio SMS webhook
app.post('/webhook/sms', async (request, reply) => {
  const { From, Body, MessageSid } = request.body as any;
  
  console.log(`[SMS] ${From}: ${Body}`);
  
  try {
    // First, check if this is a reply to a missed call text-back
    const textBackResult = await missedCallHandler.handleTextBackReply(From, Body, orchestrator);
    
    if (textBackResult.success) {
      // It was a text-back reply, return the response
      reply.type('text/xml');
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${textBackResult.response}</Message>
</Response>`;
    }
    
    // Regular SMS flow
    const result = await orchestrator.processIncomingMessage({
      customer_phone: From,
      message: Body,
      channel: 'sms',
      timestamp: new Date().toISOString()
    });

    // Return TwiML response
    reply.type('text/xml');
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${result.response}</Message>
</Response>`;
  } catch (error) {
    console.error('SMS webhook error:', error);
    reply.type('text/xml');
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, we're experiencing technical difficulties. Please call our office.</Message>
</Response>`;
  }
});

// ========== MISSED CALL WEBHOOKS ==========

// TwiML for incoming calls - routes to voicemail or AI voice agent
app.post('/webhook/voice', async (request, reply) => {
  const { From, To, CallSid } = request.body as any;
  
  console.log(`[Voice] Incoming call from ${From} to ${To}`);
  
  // Return TwiML to dial the business number with status callback
  // This allows us to detect if the call is missed
  const businessPhone = process.env.BUSINESS_FORWARD_NUMBER || process.env.SIGNALWIRE_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER;
  
  if (businessPhone) {
    reply.type('text/xml');
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial action="${process.env.WEBHOOK_BASE_URL || 'https://your-domain.com'}/webhook/call-status" method="POST" timeout="20">
    ${businessPhone}
  </Dial>
</Response>`;
  } else {
    // No forwarding number configured - treat as missed immediately and text back
    await missedCallHandler.handleCallStatus({
      from: From,
      to: To,
      callSid: CallSid,
      callStatus: 'no-answer',
      direction: 'inbound',
    });
    
    reply.type('text/xml');
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, no one is available to take your call right now. You'll receive a text message shortly to schedule service.</Say>
  <Hangup/>
</Response>`;
  }
});

// Twilio/SignalWire call status webhook - triggers text-back on missed calls
app.post('/webhook/call-status', async (request, reply) => {
  const { From, To, CallSid, CallStatus, Direction } = request.body as any;
  
  console.log(`[Call Status] ${CallStatus} from ${From} to ${To}`);
  
  // Only handle inbound calls that were missed
  if (Direction !== 'inbound') {
    return { handled: false, reason: 'Not an inbound call' };
  }
  
  try {
    const result = await missedCallHandler.handleCallStatus({
      from: From,
      to: To,
      callSid: CallSid,
      callStatus: CallStatus,
      direction: Direction,
    });
    
    return result;
  } catch (error) {
    console.error('Call status webhook error:', error);
    return { handled: false, error: 'Failed to process call status' };
  }
});

// Get missed call stats
app.get('/api/missed-calls/stats', async (request) => {
  const { days } = request.query as any;
  const stats = await missedCallHandler.getStats(parseInt(days) || 30);
  return stats;
});

// List recent missed calls
app.get('/api/missed-calls', async (request) => {
  const { days, limit } = request.query as any;
  const db = await getDb();
  
  const calls = await db.all(`
    SELECT 
      mc.*,
      c.name as customer_name,
      j.service_type,
      j.status as job_status
    FROM missed_calls mc
    LEFT JOIN customers c ON mc.customer_phone = c.phone
    LEFT JOIN jobs j ON mc.job_id = j.id
    WHERE mc.created_at > datetime('now', '-${parseInt(days) || 7} days')
    ORDER BY mc.created_at DESC
    LIMIT ${parseInt(limit) || 50}
  `);
  
  return { missed_calls: calls };
});

// Website chat webhook
app.post('/webhook/chat', async (request, reply) => {
  const { customer_phone, message, session_id } = request.body as any;
  
  console.log(`[Chat] ${customer_phone}: ${message}`);
  
  try {
    const result = await orchestrator.processIncomingMessage({
      customer_phone,
      message,
      channel: 'web',
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      response: result.response,
      handoffTo: result.handoffTo
    };
  } catch (error) {
    console.error('Chat webhook error:', error);
    return {
      success: false,
      error: 'Failed to process message'
    };
  }
});

// ========== CONVERSATIONS API ==========

// Get all conversations
app.get('/api/conversations', async () => {
  const db = await getDb();
  const conversations = await db.all(`
    SELECT 
      c.id,
      c.name as customer_name,
      c.phone,
      j.service_type,
      j.status as job_status,
      MAX(conv.created_at) as last_message_time,
      (SELECT message_text FROM conversations WHERE job_id = j.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM conversations WHERE job_id = j.id AND direction = 'inbound' AND created_at > datetime('now', '-1 day')) as unread_count
    FROM customers c
    JOIN jobs j ON c.id = j.customer_id
    LEFT JOIN conversations conv ON j.id = conv.job_id
    WHERE j.status NOT IN ('completed', 'cancelled', 'closed')
    GROUP BY c.id
    ORDER BY last_message_time DESC
  `);
  
  return { conversations };
});

// Get conversation history
app.get('/api/conversations/:jobId', async (request) => {
  const { jobId } = request.params as any;
  const db = await getDb();
  
  const messages = await db.all(`
    SELECT 
      conv.*,
      c.name as customer_name
    FROM conversations conv
    JOIN customers c ON conv.customer_id = c.id
    WHERE conv.job_id = ?
    ORDER BY conv.created_at ASC
  `, jobId);
  
  return { messages };
});

// ========== LEADS API ==========

// Get all leads
app.get('/api/leads', async () => {
  const db = await getDb();
  const leads = await db.all(`
    SELECT 
      j.id,
      c.name,
      c.phone,
      c.email,
      j.service_type,
      j.description,
      j.urgency,
      j.status,
      j.source,
      j.created_at,
      MAX(conv.created_at) as last_contact
    FROM jobs j
    JOIN customers c ON j.customer_id = c.id
    LEFT JOIN conversations conv ON j.id = conv.job_id
    WHERE j.status IN ('new', 'contacted', 'awaiting_response', 'qualified')
    GROUP BY j.id
    ORDER BY 
      CASE j.urgency 
        WHEN 'high' THEN 1 
        WHEN 'medium' THEN 2 
        ELSE 3 
      END,
      j.created_at DESC
  `);
  
  return { leads };
});

// Update lead status
app.put('/api/leads/:id', async (request) => {
  const { id } = request.params as any;
  const { status, assigned_to } = request.body as any;
  
  const db = await getDb();
  await db.run(
    'UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, id]
  );
  
  return { success: true, message: 'Lead updated' };
});

// ========== APPOINTMENTS API ==========

// Get all appointments
app.get('/api/appointments', async () => {
  const db = await getDb();
  const appointments = await db.all(`
    SELECT 
      a.id,
      a.scheduled_date,
      a.scheduled_time,
      a.status,
      a.notes,
      c.name as customer_name,
      c.phone,
      c.address,
      j.service_type,
      j.description,
      t.name as technician_name,
      t.phone as technician_phone
    FROM appointments a
    JOIN jobs j ON a.job_id = j.id
    JOIN customers c ON j.customer_id = c.id
    LEFT JOIN technicians t ON a.technician_id = t.id
    WHERE a.scheduled_date >= date('now')
    ORDER BY a.scheduled_date, a.scheduled_time
  `);
  
  return { appointments };
});

// Create appointment
app.post('/api/appointments', async (request) => {
  const { job_id, date, time, technician_id, notes, business_id = 'default' } = request.body as any;

  const db = await getDb();

  // Get customer and job details for calendar event
  const jobDetails = await db.get(`
    SELECT c.name as customer_name, c.phone, c.address, j.service_type, j.description
    FROM jobs j
    JOIN customers c ON j.customer_id = c.id
    WHERE j.id = ?
  `, job_id);

  const technician = technician_id ? await db.get('SELECT name FROM technicians WHERE id = ?', technician_id) : null;

  const result = await db.run(`
    INSERT INTO appointments (job_id, scheduled_date, scheduled_time, technician_id, notes, status)
    VALUES (?, ?, ?, ?, ?, 'confirmed')
  `, [job_id, date, time, technician_id, notes]);

  // Update job status
  await db.run('UPDATE jobs SET status = ? WHERE id = ?', ['scheduled', job_id]);

  // Sync to Google Calendar
  let calendarEventId = null;
  try {
    calendarEventId = await createAppointmentEvent(business_id, {
      customerName: jobDetails.customer_name,
      customerPhone: jobDetails.phone,
      serviceType: jobDetails.service_type,
      description: jobDetails.description,
      date,
      time,
      address: jobDetails.address,
      technicianName: technician?.name
    });
  } catch (err) {
    console.error('[Calendar] Failed to sync appointment:', err);
    // Don't fail the appointment creation if calendar sync fails
  }

  return {
    success: true,
    appointment_id: result.lastID,
    calendar_event_id: calendarEventId,
    message: 'Appointment scheduled' + (calendarEventId ? ' and synced to calendar' : '')
  };
});

// Update appointment
app.put('/api/appointments/:id', async (request) => {
  const { id } = request.params as any;
  const { status, technician_id, notes } = request.body as any;
  
  const db = await getDb();
  
  let updates: string[] = [];
  let values: any[] = [];
  
  if (status) {
    updates.push('status = ?');
    values.push(status);
  }
  if (technician_id) {
    updates.push('technician_id = ?');
    values.push(technician_id);
  }
  if (notes) {
    updates.push('notes = ?');
    values.push(notes);
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  await db.run(
    `UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`,
    values
  );
  
  return { success: true, message: 'Appointment updated' };
});

// ========== TECHNICIANS API ==========

// Get all technicians
app.get('/api/technicians', async () => {
  const db = await getDb();
  const technicians = await db.all(`
    SELECT 
      t.*,
      (SELECT COUNT(*) FROM appointments WHERE technician_id = t.id AND scheduled_date = date('now') AND status IN ('confirmed', 'dispatched')) as today_jobs
    FROM technicians t
    WHERE t.is_active = 1
  `);
  
  return { technicians };
});

// Get technician schedule
app.get('/api/technicians/:id/schedule', async (request) => {
  const { id } = request.params as any;
  const { date } = request.query as any;
  
  const db = await getDb();
  const schedule = await db.all(`
    SELECT 
      a.*,
      c.name as customer_name,
      c.address,
      j.service_type
    FROM appointments a
    JOIN jobs j ON a.job_id = j.id
    JOIN customers c ON j.customer_id = c.id
    WHERE a.technician_id = ? AND a.scheduled_date = ?
    ORDER BY a.scheduled_time
  `, [id, date || new Date().toISOString().split('T')[0]]);
  
  return { schedule };
});

// ========== AGENTS API ==========

// Get agent statuses
app.get('/api/agents/status', async () => {
  // This would connect to actual agent monitoring
  // For now, return mock data
  return {
    agents: [
      { id: 'master', name: 'Master Orchestrator', status: 'active', load: 12 },
      { id: 'intake', name: 'Intake Agent', status: 'active', load: 45 },
      { id: 'scheduling', name: 'Scheduling Agent', status: 'active', load: 23 },
      { id: 'dispatch', name: 'Dispatch Agent', status: 'active', load: 8 },
      { id: 'followup', name: 'Follow-Up Agent', status: 'active', load: 15 },
      { id: 'review', name: 'Review Request Agent', status: 'standby', load: 0 },
      { id: 'knowledge', name: 'Knowledge Base Agent', status: 'active', load: 5 }
    ]
  };
});

// Toggle agent
app.post('/api/agents/:id/toggle', async (request) => {
  const { id } = request.params as any;
  const { enabled } = request.body as any;
  
  // This would toggle the actual agent
  console.log(`[Agent] ${id} ${enabled ? 'enabled' : 'disabled'}`);
  
  return { success: true, agent_id: id, status: enabled ? 'active' : 'paused' };
});

// ========== STATS API ==========

// Get dashboard stats
app.get('/api/stats', async () => {
  const db = await getDb();
  
  const [
    activeConversations,
    todayAppointments,
    unassignedJobs,
    totalTechnicians,
    recentActivity
  ] = await Promise.all([
    db.get('SELECT COUNT(*) as count FROM jobs WHERE status IN ("new", "contacted", "awaiting_response", "qualified")'),
    db.get('SELECT COUNT(*) as count FROM appointments WHERE scheduled_date = date("now")'),
    db.get('SELECT COUNT(*) as count FROM jobs WHERE status = "scheduled" AND id NOT IN (SELECT job_id FROM appointments WHERE technician_id IS NOT NULL)'),
    db.get('SELECT COUNT(*) as count FROM technicians WHERE is_active = 1'),
    db.all(`
      SELECT 
        'conversation' as type,
        c.message_text as description,
        c.created_at as timestamp,
        cust.name as customer_name
      FROM conversations c
      JOIN customers cust ON c.customer_id = cust.id
      ORDER BY c.created_at DESC
      LIMIT 10
    `)
  ]);
  
  return {
    activeConversations: activeConversations?.count || 0,
    todayAppointments: todayAppointments?.count || 0,
    unassignedJobs: unassignedJobs?.count || 0,
    totalTechnicians: totalTechnicians?.count || 0,
    recentActivity: recentActivity.map((a: any) => ({
      id: Math.random().toString(36).substring(7),
      type: a.type,
      description: `${a.customer_name}: ${a.description?.substring(0, 50) || 'New message'}...`,
      timestamp: a.timestamp
    }))
  };
});

// ========== CRON ENDPOINTS (Called by scheduler) ==========

// Trigger time-based actions
app.post('/cron/process-followups', async () => {
  console.log('[Cron] Running follow-up checks...');
  await orchestrator.processTimeBasedActions();
  return { success: true };
});

// Mark job complete (trigger review flow)
app.post('/api/jobs/:id/complete', async (request) => {
  const { id } = request.params as any;

  await orchestrator.markJobComplete(parseInt(id));

  return { success: true, message: 'Job marked complete, review flow initiated' };
});

// ========== GOOGLE CALENDAR INTEGRATION ==========

// Initiate Google OAuth flow
app.get('/auth/google', async (request, reply) => {
  const { business_id } = request.query as any;
  if (!business_id) {
    return reply.status(400).send({ error: 'business_id required' });
  }

  const authUrl = getAuthUrl(business_id);
  reply.redirect(authUrl);
});

// Google OAuth callback
app.get('/auth/google/callback', async (request, reply) => {
  const { code, state, error } = request.query as any;

  if (error) {
    return reply.status(400).send({ error: 'Google authorization failed', details: error });
  }

  if (!code || !state) {
    return reply.status(400).send({ error: 'Missing authorization code or state' });
  }

  const success = await handleAuthCallback(code, state);

  if (success) {
    reply.type('text/html').send(`
      <html>
        <body style="font-family: system-ui; text-align: center; padding: 50px;">
          <h1 style="color: #10b981;">✅ Calendar Connected!</h1>
          <p>Your Google Calendar has been successfully connected.</p>
          <p>You can close this window and return to the dashboard.</p>
        </body>
      </html>
    `);
  } else {
    reply.status(500).send({ error: 'Failed to connect calendar' });
  }
});

// Check calendar connection status
app.get('/api/calendar/status', async (request) => {
  const { business_id } = request.query as any;
  if (!business_id) {
    return { connected: false, error: 'business_id required' };
  }

  const db = await getDb();
  const integration = await db.get(
    'SELECT * FROM business_integrations WHERE business_id = ? AND provider = ?',
    [business_id, 'google_calendar']
  );

  return {
    connected: !!integration,
    connectedAt: integration?.created_at
  };
});

// Check time slot availability
app.get('/api/calendar/availability', async (request) => {
  const { business_id, date, time } = request.query as any;

  if (!business_id || !date || !time) {
    return { error: 'business_id, date, and time required' };
  }

  const available = await isTimeSlotAvailable(business_id, date, time);
  return { available, date, time };
});

// List upcoming calendar events
app.get('/api/calendar/events', async (request) => {
  const { business_id, limit } = request.query as any;

  if (!business_id) {
    return { error: 'business_id required' };
  }

  const { listUpcomingEvents } = await import('./google-calendar.js');
  const events = await listUpcomingEvents(business_id, parseInt(limit) || 10);

  return {
    events: events.map(e => ({
      id: e.id,
      summary: e.summary,
      start: e.start,
      end: e.end,
      location: e.location,
      description: e.description
    }))
  };
});

// Health check
app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Start server
  try {
    await app.listen({ port: 3002, host: '0.0.0.0' });
    console.log('🚀 Service Business API running on http://localhost:3002');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

startServer();
