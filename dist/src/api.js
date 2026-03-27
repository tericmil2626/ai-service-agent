"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const IntakeAgent_js_1 = require("./agents/IntakeAgent.js");
const SchedulingAgent_js_1 = require("./agents/SchedulingAgent.js");
const database_js_1 = require("./database.js");
const sms_js_1 = require("./sms.js");
dotenv_1.default.config();
const app = (0, fastify_1.default)({
    logger: true,
    // Add form body parser for SignalWire/Twilio webhooks
    bodyLimit: 1048576 // 1MB
});
const sms = (0, sms_js_1.getSMSProvider)();
// Register form body parser for webhook endpoints
app.register(import('@fastify/formbody'));
// Store agent instances per conversation (in production, use Redis)
const agentSessions = new Map();
async function startServer() {
    // CORS for dashboard
    await app.register(cors_1.default, {
        origin: ['http://localhost:3001', 'http://localhost:3000'],
        credentials: true,
    });
    // ========== WEBHOOK ENDPOINTS (External Services) ==========
    // Twilio/SMS webhook
    app.post('/webhook/sms', async (request, reply) => {
        const { From, Body, MessageSid } = request.body;
        console.log(`[SMS] ${From}: ${Body}`);
        try {
            // Get or create agent session
            let session = agentSessions.get(From);
            if (!session) {
                session = { intake: new IntakeAgent_js_1.IntakeAgent('sms') };
                agentSessions.set(From, session);
            }
            // Process through intake agent
            const result = await session.intake.handleMessage(Body, From);
            // If intake is complete and needs scheduling, create scheduling agent
            if (result.isComplete && result.handoffTo?.includes('Scheduling')) {
                if (!session.scheduling) {
                    session.scheduling = new SchedulingAgent_js_1.SchedulingAgent();
                }
                const schedulingResult = await session.scheduling.receiveFromReceptionist(result.data);
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
        }
        catch (error) {
            console.error('SMS webhook error:', error);
            reply.type('text/xml');
            return sms.sendTwiMLResponse("Sorry, we're experiencing technical difficulties. Please call our office.");
        }
    });
    // Handle time selection from SMS
    app.post('/webhook/sms/schedule', async (request, reply) => {
        const { From, Body } = request.body;
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
        const { customer_phone, message, session_id } = request.body;
        console.log(`[Chat] ${customer_phone}: ${message}`);
        try {
            // Get or create agent session
            const sessionKey = session_id || customer_phone;
            let session = agentSessions.get(sessionKey);
            if (!session) {
                session = { intake: new IntakeAgent_js_1.IntakeAgent('web') };
                agentSessions.set(sessionKey, session);
            }
            // Process through intake agent
            const result = await session.intake.handleMessage(message, customer_phone);
            // If intake is complete and needs scheduling
            if (result.isComplete && result.handoffTo?.includes('Scheduling')) {
                if (!session.scheduling) {
                    session.scheduling = new SchedulingAgent_js_1.SchedulingAgent();
                }
                const schedulingResult = await session.scheduling.receiveFromReceptionist(result.data);
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
        }
        catch (error) {
            console.error('Chat webhook error:', error);
            return {
                success: false,
                error: 'Failed to process message',
            };
        }
    });
    // Handle time selection from chat
    app.post('/webhook/chat/schedule', async (request, reply) => {
        const { customer_phone, selection, session_id } = request.body;
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
        const conversations = await (0, database_js_1.dbAll)(`
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
        const messages = await (0, database_js_1.dbAll)(`
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
        const leads = await (0, database_js_1.dbAll)(`
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
        await (0, database_js_1.dbRun)('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
        return { success: true, message: 'Lead updated' };
    });
    // ========== APPOINTMENTS API ==========
    // Get all appointments
    app.get('/api/appointments', async () => {
        const appointments = await (0, database_js_1.dbAll)(`
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
        const result = await (0, database_js_1.dbRun)(`
      INSERT INTO appointments (job_id, scheduled_date, scheduled_time, technician_id, notes, status)
      VALUES (?, ?, ?, ?, ?, 'confirmed')
    `, [job_id, date, time, technician_id, notes]);
        // Update job status
        await (0, database_js_1.dbRun)('UPDATE jobs SET status = ? WHERE id = ?', ['scheduled', job_id]);
        return {
            success: true,
            appointment_id: result.lastID,
            message: 'Appointment scheduled',
        };
    });
    // Update appointment
    app.put('/api/appointments/:id', async (request) => {
        const { id } = request.params;
        const { status, technician_id, notes } = request.body;
        const updates = [];
        const values = [];
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
        await (0, database_js_1.dbRun)(`UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`, values);
        return { success: true, message: 'Appointment updated' };
    });
    // ========== TECHNICIANS API ==========
    // Get all technicians
    app.get('/api/technicians', async () => {
        const technicians = await (0, database_js_1.dbAll)(`
      SELECT 
        t.*,
        (SELECT COUNT(*) FROM appointments WHERE technician_id = t.id AND scheduled_date = date('now') AND status IN ('confirmed', 'dispatched')) as today_jobs
      FROM technicians t
      WHERE t.is_active = 1
    `);
        return { technicians };
    });
    // ========== AGENTS API ==========
    // Get agent statuses
    app.get('/api/agents/status', async () => {
        return {
            agents: [
                { id: 'intake', name: 'Intake Agent', status: 'active', load: Math.floor(Math.random() * 50), llm: true },
                { id: 'scheduling', name: 'Scheduling Agent', status: 'active', load: Math.floor(Math.random() * 30), llm: true },
                { id: 'dispatch', name: 'Dispatch Agent', status: 'standby', load: 0, llm: false },
                { id: 'followup', name: 'Follow-Up Agent', status: 'standby', load: 0, llm: false },
                { id: 'review', name: 'Review Request Agent', status: 'standby', load: 0, llm: false },
            ],
        };
    });
    // ========== STATS API ==========
    // Get dashboard stats
    app.get('/api/stats', async () => {
        const [activeConversations, leadsToday, appointmentsToday, completedJobs,] = await Promise.all([
            (0, database_js_1.dbGet)('SELECT COUNT(*) as count FROM jobs WHERE status IN ("new", "contacted", "awaiting_response", "qualified")'),
            (0, database_js_1.dbGet)('SELECT COUNT(DISTINCT customer_id) as count FROM jobs WHERE date(created_at) = date("now")'),
            (0, database_js_1.dbGet)('SELECT COUNT(*) as count FROM appointments WHERE scheduled_date = date("now")'),
            (0, database_js_1.dbGet)('SELECT COUNT(*) as count FROM jobs WHERE status = "completed" AND date(updated_at) = date("now")'),
        ]);
        return {
            active_conversations: activeConversations?.count || 0,
            leads_today: leadsToday?.count || 0,
            appointments_today: appointmentsToday?.count || 0,
            completed_today: completedJobs?.count || 0,
            response_time: '< 2s',
            llm_enabled: true,
        };
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
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=api.js.map