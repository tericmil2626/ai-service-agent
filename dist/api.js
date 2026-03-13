"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const orchestrator_1 = require("./orchestrator");
const database_1 = require("./database");
async function startServer() {
    const app = (0, fastify_1.default)({
        logger: true
    });
    const orchestrator = new orchestrator_1.ServiceBusinessOrchestrator();
    // CORS for dashboard
    await app.register(cors_1.default, {
        origin: ['http://localhost:3001', 'http://localhost:3000'],
        credentials: true
    });
    // ========== WEBHOOK ENDPOINTS (External Services) ==========
    // Twilio SMS webhook
    app.post('/webhook/sms', async (request, reply) => {
        const { From, Body, MessageSid } = request.body;
        console.log(`[SMS] ${From}: ${Body}`);
        try {
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
        }
        catch (error) {
            console.error('SMS webhook error:', error);
            reply.type('text/xml');
            return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, we're experiencing technical difficulties. Please call our office.</Message>
</Response>`;
        }
    });
    // Website chat webhook
    app.post('/webhook/chat', async (request, reply) => {
        const { customer_phone, message, session_id } = request.body;
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
        }
        catch (error) {
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
        const db = await (0, database_1.getDb)();
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
        const { jobId } = request.params;
        const db = await (0, database_1.getDb)();
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
        const db = await (0, database_1.getDb)();
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
        const { id } = request.params;
        const { status, assigned_to } = request.body;
        const db = await (0, database_1.getDb)();
        await db.run('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
        return { success: true, message: 'Lead updated' };
    });
    // ========== APPOINTMENTS API ==========
    // Get all appointments
    app.get('/api/appointments', async () => {
        const db = await (0, database_1.getDb)();
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
        const { job_id, date, time, technician_id, notes } = request.body;
        const db = await (0, database_1.getDb)();
        const result = await db.run(`
    INSERT INTO appointments (job_id, scheduled_date, scheduled_time, technician_id, notes, status)
    VALUES (?, ?, ?, ?, ?, 'confirmed')
  `, [job_id, date, time, technician_id, notes]);
        // Update job status
        await db.run('UPDATE jobs SET status = ? WHERE id = ?', ['scheduled', job_id]);
        return {
            success: true,
            appointment_id: result.lastID,
            message: 'Appointment scheduled'
        };
    });
    // Update appointment
    app.put('/api/appointments/:id', async (request) => {
        const { id } = request.params;
        const { status, technician_id, notes } = request.body;
        const db = await (0, database_1.getDb)();
        let updates = [];
        let values = [];
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
        await db.run(`UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`, values);
        return { success: true, message: 'Appointment updated' };
    });
    // ========== TECHNICIANS API ==========
    // Get all technicians
    app.get('/api/technicians', async () => {
        const db = await (0, database_1.getDb)();
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
        const { id } = request.params;
        const { date } = request.query;
        const db = await (0, database_1.getDb)();
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
        const { id } = request.params;
        const { enabled } = request.body;
        // This would toggle the actual agent
        console.log(`[Agent] ${id} ${enabled ? 'enabled' : 'disabled'}`);
        return { success: true, agent_id: id, status: enabled ? 'active' : 'paused' };
    });
    // ========== STATS API ==========
    // Get dashboard stats
    app.get('/api/stats', async () => {
        const db = await (0, database_1.getDb)();
        const [activeConversations, leadsToday, appointmentsToday, completedJobs] = await Promise.all([
            db.get('SELECT COUNT(*) as count FROM jobs WHERE status IN ("new", "contacted", "awaiting_response", "qualified")'),
            db.get('SELECT COUNT(*) as count FROM jobs WHERE date(created_at) = date("now")'),
            db.get('SELECT COUNT(*) as count FROM appointments WHERE scheduled_date = date("now")'),
            db.get('SELECT COUNT(*) as count FROM jobs WHERE status = "completed" AND date(updated_at) = date("now")')
        ]);
        return {
            active_conversations: activeConversations?.count || 0,
            leads_today: leadsToday?.count || 0,
            appointments_today: appointmentsToday?.count || 0,
            completed_today: completedJobs?.count || 0,
            response_time: '< 2s'
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
        const { id } = request.params;
        await orchestrator.markJobComplete(parseInt(id));
        return { success: true, message: 'Job marked complete, review flow initiated' };
    });
    // Health check
    app.get('/health', async () => {
        return { status: 'ok', timestamp: new Date().toISOString() };
    });
    // Start server
    try {
        await app.listen({ port: 3002, host: '0.0.0.0' });
        console.log('🚀 Service Business API running on http://localhost:3002');
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
}
startServer();
