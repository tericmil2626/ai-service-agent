import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { IntakeAgent } from './agents/IntakeAgent.js';
import { SchedulingAgent } from './agents/SchedulingAgent.js';
import { DispatchAgent, getAllTechnicians, createTechnician } from './agents/DispatchAgent.js';
import { getDb, dbGet, dbAll, dbRun } from './database.js';
import { getSMSProvider } from './sms.js';
import { getCalendarService } from './calendar.js';
import { VoiceAgent } from './voice-agent.js';
import { ServiceBusinessOrchestrator } from './orchestrator-v2.js';

dotenv.config();

const app = Fastify({ 
  logger: true,
  // Add form body parser for SignalWire/Twilio webhooks
  bodyLimit: 1048576 // 1MB
});
const sms = getSMSProvider();

// Register form body parser for webhook endpoints
app.register(import('@fastify/formbody'));

// Store agent instances per conversation (in production, use Redis)
const agentSessions = new Map<string, { intake: IntakeAgent; scheduling?: SchedulingAgent; dispatch?: DispatchAgent }>();

async function startServer() {
  // CORS for dashboard
  await app.register(cors, {
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true,
  });

  // ========== WEBHOOK ENDPOINTS (External Services) ==========

  // Twilio/SMS webhook
  app.post('/webhook/sms', async (request, reply) => {
    const { From, Body, MessageSid } = request.body as any;

    console.log(`[SMS] ${From}: ${Body}`);

    try {
      // Get or create agent session
      let session = agentSessions.get(From);
      if (!session) {
        session = { intake: new IntakeAgent('sms') };
        agentSessions.set(From, session);
      }

      // If we're already in scheduling mode, handle scheduling
      if (session.scheduling && session.intake.getState().status === 'complete') {
        const result = await session.scheduling.handleTimeSelection(Body);

        // Send confirmation SMS if appointment was booked
        if (result.confirmed && result.appointment) {
          await sms.sendSMS(From, result.response);
        }

        reply.type('text/xml');
        return sms.sendTwiMLResponse(result.response);
      }

      // Process through intake agent
      const result = await session.intake.handleMessage(Body, From);

      // If intake is complete and needs scheduling, create scheduling agent
      if (result.isComplete && result.handoffTo?.includes('Scheduling')) {
        if (!session.scheduling) {
          session.scheduling = new SchedulingAgent();
        }

        const schedulingResult = await session.scheduling.receiveFromReceptionist(result.data as any);
        const fullResponse = `${result.response} ${schedulingResult.response}`;

        // Send SMS response
        await sms.sendSMS(From, fullResponse);

        // Return TwiML response
        reply.type('text/xml');
        return sms.sendTwiMLResponse(fullResponse);
      }

      // Send SMS response
      await sms.sendSMS(From, result.response);

      // Return TwiML response
      reply.type('text/xml');
      return sms.sendTwiMLResponse(result.response);
    } catch (error) {
      console.error('SMS webhook error:', error);
      reply.type('text/xml');
      return sms.sendTwiMLResponse("Sorry, we're experiencing technical difficulties. Please call our office.");
    }
  });

  // Handle time selection from SMS
  app.post('/webhook/sms/schedule', async (request, reply) => {
    const { From, Body } = request.body as any;

    const session = agentSessions.get(From);
    if (!session?.scheduling) {
      reply.type('text/xml');
      return sms.sendTwiMLResponse("I'm sorry, I don't have your appointment details. Please start over.");
    }

    const result = await session.scheduling.handleTimeSelection(Body);

    // Send confirmation SMS if appointment was booked
    if (result.confirmed && result.appointment) {
      await sms.sendSMS(From, result.response);
    }

    reply.type('text/xml');
    return sms.sendTwiMLResponse(result.response);
  });

  // Website chat webhook
  app.post('/webhook/chat', async (request, reply) => {
    const { customer_phone, message, session_id } = request.body as any;

    console.log(`[Chat] ${customer_phone}: ${message}`);

    try {
      // Get or create agent session
      const sessionKey = session_id || customer_phone;
      let session = agentSessions.get(sessionKey);
      if (!session) {
        session = { intake: new IntakeAgent('web') };
        agentSessions.set(sessionKey, session);
      }

      // Process through intake agent
      const result = await session.intake.handleMessage(message, customer_phone);

      // If intake is complete and needs scheduling
      if (result.isComplete && result.handoffTo?.includes('Scheduling')) {
        if (!session.scheduling) {
          session.scheduling = new SchedulingAgent();
        }

        const schedulingResult = await session.scheduling.receiveFromReceptionist(result.data as any);

        return {
          success: true,
          response: `${result.response} ${schedulingResult.response}`,
          handoffTo: 'Scheduling Agent',
          slots: schedulingResult.slots,
        };
      }

      return {
        success: true,
        response: result.response,
        handoffTo: result.handoffTo,
      };
    } catch (error) {
      console.error('Chat webhook error:', error);
      return {
        success: false,
        error: 'Failed to process message',
      };
    }
  });

  // Handle time selection from chat
  app.post('/webhook/chat/schedule', async (request, reply) => {
    const { customer_phone, selection, session_id } = request.body as any;
    const sessionKey = session_id || customer_phone;

    const session = agentSessions.get(sessionKey);
    if (!session?.scheduling) {
      return {
        success: false,
        error: 'No active scheduling session',
      };
    }

    const result = await session.scheduling.handleTimeSelection(selection);

    // Send SMS confirmation if appointment was booked
    if (result.confirmed && result.appointment) {
      await sms.sendSMS(customer_phone, result.response);
    }

    return {
      success: true,
      response: result.response,
      confirmed: result.confirmed,
      appointment: result.appointment,
    };
  });

  // ========== CONVERSATIONS API ==========

  // Get all conversations
  app.get('/api/conversations', async () => {
    const conversations = await dbAll(`
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

    const messages = await dbAll(`
      SELECT 
        conv.*,
        c.name as customer_name
      FROM conversations conv
      JOIN customers c ON conv.customer_id = c.id
      WHERE conv.job_id = ?
      ORDER BY conv.created_at ASC
    `, [jobId]);

    return { messages };
  });

  // ========== LEADS API ==========

  // Get all leads
  app.get('/api/leads', async () => {
    const leads = await dbAll(`
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

    await dbRun(
      'UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    return { success: true, message: 'Lead updated' };
  });

  // ========== APPOINTMENTS API ==========

  // Get all appointments
  app.get('/api/appointments', async () => {
    const appointments = await dbAll(`
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
    const { job_id, date, time, technician_id, notes } = request.body as any;

    const result = await dbRun(`
      INSERT INTO appointments (job_id, scheduled_date, scheduled_time, technician_id, notes, status)
      VALUES (?, ?, ?, ?, ?, 'confirmed')
    `, [job_id, date, time, technician_id, notes]);

    // Update job status
    await dbRun('UPDATE jobs SET status = ? WHERE id = ?', ['scheduled', job_id]);

    return {
      success: true,
      appointment_id: result.lastID,
      message: 'Appointment scheduled',
    };
  });

  // Update appointment
  app.put('/api/appointments/:id', async (request) => {
    const { id } = request.params as any;
    const { status, technician_id, notes } = request.body as any;

    const updates: string[] = [];
    const values: any[] = [];

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

    await dbRun(
      `UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return { success: true, message: 'Appointment updated' };
  });

  // ========== GOOGLE CALENDAR API ==========

  // Get Google Calendar auth URL
  app.get('/api/calendar/auth', async () => {
    const calendarService = getCalendarService();
    await calendarService.initialize();
    const authUrl = calendarService.getAuthUrl();
    return { auth_url: authUrl };
  });

  // Exchange OAuth code for token
  app.post('/api/calendar/auth/callback', async (request) => {
    const { code } = request.body as any;
    const calendarService = getCalendarService();
    await calendarService.initialize();
    const success = await calendarService.exchangeCode(code);
    return { success, message: success ? 'Authentication successful' : 'Authentication failed' };
  });

  // Check calendar status
  app.get('/api/calendar/status', async () => {
    const calendarService = getCalendarService();
    await calendarService.initialize();
    const initialized = calendarService.isInitialized();
    return { initialized, message: initialized ? 'Connected' : 'Not connected' };
  });

  // ========== FOLLOW-UP API ==========

  // Trigger follow-up processing (for cron job)
  app.post('/api/followup/process', async () => {
    const { FollowUpAgent, createFeedbackTable } = await import('./agents/FollowUpAgent.js');
    
    // Ensure feedback table exists
    await createFeedbackTable();
    
    const followUpAgent = new FollowUpAgent();
    const results = await followUpAgent.processReminders();
    
    return {
      success: true,
      remindersSent: results.remindersSent,
      followUpsSent: results.followUpsSent,
    };
  });

  // Get follow-up stats
  app.get('/api/followup/stats', async () => {
    const { FollowUpAgent } = await import('./agents/FollowUpAgent.js');
    const followUpAgent = new FollowUpAgent();
    const stats = await followUpAgent.getStats();
    return { success: true, stats };
  });

  // ========== REVIEW REQUEST API ==========

  // Trigger review request processing (for cron job)
  app.post('/api/reviews/process', async () => {
    const { ReviewRequestAgent, addReviewColumns } = await import('./agents/ReviewRequestAgent.js');
    
    // Ensure columns exist
    await addReviewColumns();
    
    const reviewAgent = new ReviewRequestAgent();
    const results = await reviewAgent.processReviewRequests();
    
    return {
      success: true,
      requestsSent: results.requestsSent,
      reviewsReceived: results.reviewsReceived,
      remindersSent: results.remindersSent,
    };
  });

  // Get review stats
  app.get('/api/reviews/stats', async () => {
    const { ReviewRequestAgent } = await import('./agents/ReviewRequestAgent.js');
    const reviewAgent = new ReviewRequestAgent();
    const stats = await reviewAgent.getStats();
    return { success: true, stats };
  });

  // Manually send review request
  app.post('/api/reviews/send/:appointmentId', async (request) => {
    const { appointmentId } = request.params as any;
    const { ReviewRequestAgent } = await import('./agents/ReviewRequestAgent.js');
    const reviewAgent = new ReviewRequestAgent();
    const success = await reviewAgent.sendManualRequest(parseInt(appointmentId));
    return { success, message: success ? 'Review request sent' : 'Failed to send review request' };
  });

  // ========== LLM STATS API ==========

  // Get LLM token usage stats
  app.get('/api/llm/stats', async () => {
    const { getLLMStats } = await import('./llm-enhanced.js');
    const stats = getLLMStats();
    return { success: true, stats };
  });

  // ========== DISPATCH API ==========

  // Dispatch an appointment to a technician
  app.post('/api/dispatch/:appointmentId', async (request) => {
    const { appointmentId } = request.params as any;

    // Get appointment details
    const appointment = await dbGet(`
      SELECT 
        a.id as appointment_id,
        a.job_id,
        a.scheduled_date,
        a.scheduled_time,
        j.customer_id,
        j.service_type,
        j.description as problem_description,
        j.urgency,
        c.name as customer_name,
        c.phone as customer_phone,
        c.address
      FROM appointments a
      JOIN jobs j ON a.job_id = j.id
      JOIN customers c ON j.customer_id = c.id
      WHERE a.id = ?
    `, [appointmentId]);

    if (!appointment) {
      return { success: false, error: 'Appointment not found' };
    }

    // Create dispatch agent and assign
    const dispatchAgent = new DispatchAgent();
    const result = await dispatchAgent.receiveFromScheduling(appointment as any);

    return {
      success: result.assigned,
      message: result.response,
      technician: result.technician,
    };
  });

  // Get dispatch status for an appointment
  app.get('/api/dispatch/:appointmentId', async (request) => {
    const { appointmentId } = request.params as any;

    const dispatch = await dbGet(`
      SELECT 
        a.id as appointment_id,
        a.status,
        a.scheduled_date,
        a.scheduled_time,
        t.id as technician_id,
        t.name as technician_name,
        t.phone as technician_phone,
        c.name as customer_name,
        c.address,
        j.service_type,
        j.urgency
      FROM appointments a
      JOIN jobs j ON a.job_id = j.id
      JOIN customers c ON j.customer_id = c.id
      LEFT JOIN technicians t ON a.technician_id = t.id
      WHERE a.id = ?
    `, [appointmentId]);

    if (!dispatch) {
      return { success: false, error: 'Appointment not found' };
    }

    return { success: true, dispatch };
  });

  // ========== TECHNICIANS API ==========

  // Get all technicians
  app.get('/api/technicians', async () => {
    const technicians = await dbAll(`
      SELECT 
        t.*,
        (SELECT COUNT(*) FROM appointments WHERE technician_id = t.id AND scheduled_date = date('now') AND status IN ('confirmed', 'dispatched')) as today_jobs
      FROM technicians t
      WHERE t.is_active = 1
    `);

    return { technicians };
  });

  // Create new technician
  app.post('/api/technicians', async (request) => {
    const { name, phone, email, specialties } = request.body as any;

    if (!name || !phone || !specialties || !Array.isArray(specialties)) {
      return { success: false, error: 'Missing required fields: name, phone, specialties (array)' };
    }

    try {
      const id = await createTechnician({ name, phone, email, specialties });
      return { success: true, technician_id: id, message: 'Technician created' };
    } catch (error) {
      console.error('Create technician error:', error);
      return { success: false, error: 'Failed to create technician' };
    }
  });

  // ========== AGENTS API ==========

  // Get agent statuses
  app.get('/api/agents/status', async () => {
    // Count active dispatches
    const pendingDispatches = await dbGet(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE status IN ('pending_assignment', 'assigned') 
      AND scheduled_date >= date('now')
    `);

    return {
      agents: [
        { id: 'intake', name: 'Intake Agent', status: 'active', load: Math.floor(Math.random() * 50), llm: true },
        { id: 'scheduling', name: 'Scheduling Agent', status: 'active', load: Math.floor(Math.random() * 30), llm: true },
        { id: 'dispatch', name: 'Dispatch Agent', status: 'active', load: (pendingDispatches as any)?.count || 0, llm: false },
        { id: 'followup', name: 'Follow-Up Agent', status: 'standby', load: 0, llm: false },
        { id: 'review', name: 'Review Request Agent', status: 'standby', load: 0, llm: false },
      ],
    };
  });

  // ========== STATS API ==========

  // Get dashboard stats
  app.get('/api/stats', async () => {
    const [
      activeConversations,
      leadsToday,
      appointmentsToday,
      completedJobs,
    ] = await Promise.all([
      dbGet('SELECT COUNT(*) as count FROM jobs WHERE status IN ("new", "contacted", "awaiting_response", "qualified")'),
      dbGet('SELECT COUNT(DISTINCT customer_id) as count FROM jobs WHERE date(created_at) = date("now")'),
      dbGet('SELECT COUNT(*) as count FROM appointments WHERE scheduled_date = date("now")'),
      dbGet('SELECT COUNT(*) as count FROM jobs WHERE status = "completed" AND date(updated_at) = date("now")'),
    ]);

    return {
      active_conversations: (activeConversations as any)?.count || 0,
      leads_today: (leadsToday as any)?.count || 0,
      appointments_today: (appointmentsToday as any)?.count || 0,
      completed_today: (completedJobs as any)?.count || 0,
      response_time: '< 2s',
      llm_enabled: true,
    };
  });

  // ========== VOICE WEBHOOK ENDPOINTS ==========
  // Initialize VoiceAgent with orchestrator
  const voiceOrchestrator = new ServiceBusinessOrchestrator();
  const voiceAgent = new VoiceAgent(voiceOrchestrator);

  // Handle incoming voice call
  app.post('/webhook/voice', async (request, reply) => {
    const { CallSid, From, To } = request.body as any;
    const laml = await voiceAgent.handleIncomingCall({ callSid: CallSid, from: From, to: To });
    reply.type('text/xml');
    return laml;
  });

  // Handle speech input from caller
  app.post('/webhook/voice/gather', async (request, reply) => {
    const { CallSid, From, SpeechResult, Confidence } = request.body as any;
    const laml = await voiceAgent.handleSpeechInput({ callSid: CallSid, speechResult: SpeechResult, from: From, confidence: Confidence });
    reply.type('text/xml');
    return laml;
  });

  // Handle call status updates
  app.post('/webhook/voice/status', async (request, reply) => {
    const { CallSid, CallStatus, CallDuration, From, To, RecordingUrl } = request.body as any;
    await voiceAgent.handleCallStatus({ callSid: CallSid, callStatus: CallStatus, callDuration: CallDuration, from: From, to: To, recordingUrl: RecordingUrl });
    reply.type('text/xml');
    return '<?xml version="1.0" encoding="UTF-8"?><Response/>';
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString(), llm: true };
  });

  // Start server
  try {
    await app.listen({ port: 3002, host: '0.0.0.0' });
    console.log('🚀 Service Business API running on http://localhost:3002');
    console.log('🤖 LLM-powered Intake & Scheduling Agents active');
    console.log(`📱 SMS Provider: ${process.env.SMS_PROVIDER || 'mock'}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

startServer();
