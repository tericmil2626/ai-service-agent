"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const dotenvResult = dotenv_1.default.config();
console.log('[API] Dotenv config result:', dotenvResult.error ? 'Error: ' + dotenvResult.error.message : 'Success');
console.log('[API] SIGNALWIRE_PHONE_NUMBER:', process.env.SIGNALWIRE_PHONE_NUMBER);
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const formbody_1 = __importDefault(require("@fastify/formbody"));
const orchestrator_v2_1 = require("./orchestrator-v2");
const database_1 = require("./database");
const missed_call_handler_1 = require("./missed-call-handler");
const voice_agent_1 = require("./voice-agent");
const elevenlabs_tts_js_1 = require("./elevenlabs-tts.js");
// Load configuration from environment or database
async function loadConfig() {
    const tier = process.env.SERVICE_TIER || 'starter';
    return {
        tier,
        businessId: process.env.BUSINESS_ID || 'default',
        businessName: process.env.BUSINESS_NAME || 'Service Business',
        businessConfig: {
            hours: {
                start: '08:00',
                end: '17:00',
                days: [1, 2, 3, 4, 5, 6],
            },
            timezone: process.env.TIMEZONE || 'America/Chicago',
            services: ['plumbing', 'electrical', 'hvac', 'appliance'],
        },
        features: {
            autoDispatch: tier !== 'starter',
            reviewRequests: tier !== 'starter',
            followUpReminders: tier !== 'starter',
        },
    };
}
async function startServer() {
    const app = (0, fastify_1.default)({ logger: true });
    const config = await loadConfig();
    console.log('[API] Starting with tier: ' + config.tier);
    const orchestrator = new orchestrator_v2_1.ServiceBusinessOrchestrator(config);
    await orchestrator.initialize();
    // Initialize database (creates tables if they don't exist)
    await (0, database_1.initDatabase)();
    // Log SMS provider config at startup
    const hasTwilioAtStartup = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
    const hasSWAtStartup = !!(process.env.SIGNALWIRE_PROJECT_ID && process.env.SIGNALWIRE_TOKEN && process.env.SIGNALWIRE_PHONE_NUMBER);
    if (hasTwilioAtStartup) {
        console.log('[API] SMS provider: Twilio (TWILIO_PHONE_NUMBER=' + process.env.TWILIO_PHONE_NUMBER + ')');
    }
    else if (hasSWAtStartup) {
        console.log('[API] SMS provider: SignalWire (SIGNALWIRE_PHONE_NUMBER=' + process.env.SIGNALWIRE_PHONE_NUMBER + ')');
    }
    else {
        console.error('[API] WARNING: No SMS provider configured! Missed call text-backs will not work.');
        console.error('[API]   TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? 'set' : 'MISSING');
        console.error('[API]   TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? 'set' : 'MISSING');
        console.error('[API]   TWILIO_PHONE_NUMBER:', process.env.TWILIO_PHONE_NUMBER || 'MISSING');
        console.error('[API]   SIGNALWIRE_PROJECT_ID:', process.env.SIGNALWIRE_PROJECT_ID ? 'set' : 'MISSING');
        console.error('[API]   SIGNALWIRE_TOKEN:', process.env.SIGNALWIRE_TOKEN ? 'set' : 'MISSING');
        console.error('[API]   SIGNALWIRE_PHONE_NUMBER:', process.env.SIGNALWIRE_PHONE_NUMBER || 'MISSING');
    }
    // Initialize missed call handler
    const missedCallHandler = new missed_call_handler_1.MissedCallHandler(config.businessName);
    // Initialize voice agent
    const voiceAgent = new voice_agent_1.VoiceAgent(orchestrator);
    await app.register(cors_1.default, {
        origin: true,
        credentials: true
    });
    await app.register(formbody_1.default);
    // Utility to add delay between SMS messages (prevents carrier filtering)
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const lastSMSTime = new Map();
    const MIN_SMS_INTERVAL = 3000; // Minimum 3 seconds between SMS to same number
    // SMS webhook
    app.post('/webhook/sms', async (request, reply) => {
        const rawBody = request.body;
        console.log('[SMS Webhook] Raw body:', JSON.stringify(rawBody));
        let { From, Body, MessageSid } = rawBody;
        // Trim whitespace and ensure + prefix for consistent processing
        const originalFrom = From;
        From = From?.trim();
        if (From && !From.startsWith('+'))
            From = '+' + From;
        console.log('[SMS Webhook] Original From: ' + originalFrom + ', Processed From: ' + From + ', Body: ' + Body);
        try {
            // First, check if this is a reply to a missed call text-back
            console.log('[SMS Webhook] Checking for text-back reply...');
            const textBackResult = await missedCallHandler.handleTextBackReply(From, Body, orchestrator);
            console.log('[SMS Webhook] Text-back check result:', textBackResult.success, textBackResult.error || '');
            if (textBackResult.success) {
                // It was a text-back reply, send SMS via API
                console.log('[SMS Webhook] Text-back reply processed, sending SMS...');
                // Add delay if we've sent to this number recently (prevents carrier filtering)
                const now = Date.now();
                const lastSent = lastSMSTime.get(From) || 0;
                const timeSinceLast = now - lastSent;
                if (timeSinceLast < MIN_SMS_INTERVAL) {
                    const waitTime = MIN_SMS_INTERVAL - timeSinceLast;
                    console.log(`[SMS Webhook] Waiting ${waitTime}ms before sending to prevent carrier filtering...`);
                    await delay(waitTime);
                }
                const { sendSMS } = await import('./signalwire-fetch.js');
                const smsResult = await sendSMS(From, textBackResult.response || 'Thanks for your message!');
                lastSMSTime.set(From, Date.now());
                if (smsResult.success) {
                    console.log('[SMS Webhook] Text-back SMS sent successfully:', smsResult.messageId);
                }
                else {
                    console.error('[SMS Webhook] Failed to send text-back SMS:', smsResult.error);
                }
                reply.type('text/xml');
                return '<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>';
            }
            // Regular SMS flow
            console.log('[SMS Webhook] Processing as regular SMS...');
            const result = await orchestrator.processMessage({
                customerPhone: From,
                message: Body,
                channel: 'sms',
                timestamp: new Date(),
                sessionId: MessageSid
            });
            console.log('[SMS Webhook] Orchestrator response:', result.response.substring(0, 50) + '...');
            // Send SMS response via SignalWire API (more reliable than TwiML for SMS)
            // Add delay if we've sent to this number recently (prevents carrier filtering)
            const now2 = Date.now();
            const lastSent2 = lastSMSTime.get(From) || 0;
            const timeSinceLast2 = now2 - lastSent2;
            if (timeSinceLast2 < MIN_SMS_INTERVAL) {
                const waitTime2 = MIN_SMS_INTERVAL - timeSinceLast2;
                console.log(`[SMS Webhook] Waiting ${waitTime2}ms before sending to prevent carrier filtering...`);
                await delay(waitTime2);
            }
            const { sendSMS } = await import('./signalwire-fetch.js');
            const smsResult = await sendSMS(From, result.response || 'Thanks for your message!');
            lastSMSTime.set(From, Date.now());
            if (smsResult.success) {
                console.log('[SMS Webhook] SMS sent successfully:', smsResult.messageId);
            }
            else {
                console.error('[SMS Webhook] Failed to send SMS:', smsResult.error);
            }
            // Return empty TwiML (we already sent the SMS)
            reply.type('text/xml');
            return '<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>';
        }
        catch (error) {
            console.error('SMS webhook error:', error);
            reply.type('text/xml');
            return '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Message>Thanks for your message! We will get back to you shortly.</Message>\n</Response>';
        }
    });
    // SMS delivery status callback from SignalWire
    app.post('/webhook/sms-status', async (request, reply) => {
        const { MessageSid, MessageStatus, To, ErrorCode, ErrorMessage } = request.body;
        if (ErrorCode) {
            console.error(`[SMS Status] ${MessageSid} to ${To}: ${MessageStatus} — error ${ErrorCode}: ${ErrorMessage}`);
        }
        else {
            console.log(`[SMS Status] ${MessageSid} to ${To}: ${MessageStatus}`);
        }
        return '';
    });
    // Voice webhook - handles incoming calls with AI agent
    app.post('/webhook/voice', async (request, reply) => {
        let { From, To, CallSid } = request.body;
        From = From?.trim();
        To = To?.trim();
        if (From && !From.startsWith('+'))
            From = '+' + From;
        if (To && !To.startsWith('+'))
            To = '+' + To;
        console.log('[Voice Webhook] Incoming call from ' + From + ' to ' + To + ' (SID: ' + CallSid + ')');
        const voiceAiEnabled = process.env.VOICE_AI_ENABLED === 'true';
        const businessForwardNumber = process.env.BUSINESS_FORWARD_NUMBER;
        const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || '';
        if (voiceAiEnabled) {
            // AI voice agent handles the call - returns LaML XML
            try {
                const laml = await voiceAgent.handleIncomingCall({ callSid: CallSid, from: From, to: To });
                reply.type('text/xml');
                return laml;
            }
            catch (error) {
                console.error('[Voice Webhook] VoiceAgent error:', error);
                reply.type('text/xml');
                return '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>Thank you for calling. We\'re experiencing technical difficulties. Please try again shortly.</Say>\n  <Hangup/>\n</Response>';
            }
        }
        else if (businessForwardNumber && webhookBaseUrl) {
            // Forward to business number with status callback
            reply.type('text/xml');
            return '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Dial action="' + webhookBaseUrl + '/webhook/call-status" method="POST" timeout="20">\n    ' + businessForwardNumber + '\n  </Dial>\n</Response>';
        }
        else {
            // No AI and no forwarding number - text back on missed call
            missedCallHandler.handleCallStatus({
                from: From,
                to: To,
                callSid: CallSid,
                callStatus: 'no-answer',
                direction: 'inbound',
            }).catch(err => console.error('[Voice Webhook] Failed to send text-back:', err));
            reply.type('text/xml');
            return '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>We\'re sorry, no one is available to take your call right now. You\'ll receive a text message shortly to schedule service.</Say>\n  <Hangup/>\n</Response>';
        }
    });
    // Voice gather webhook - processes speech input from caller
    app.post('/webhook/voice/gather', async (request, reply) => {
        let { From, To, CallSid, SpeechResult, Confidence } = request.body;
        From = From?.trim();
        To = To?.trim();
        if (From && !From.startsWith('+'))
            From = '+' + From;
        if (To && !To.startsWith('+'))
            To = '+' + To;
        console.log('[Voice Gather] CallSid: ' + CallSid + ', Speech: "' + (SpeechResult || '') + '"');
        try {
            const laml = await voiceAgent.handleSpeechInput({
                callSid: CallSid,
                speechResult: SpeechResult || '',
                from: From,
                confidence: Confidence,
            });
            reply.type('text/xml');
            return laml;
        }
        catch (error) {
            console.error('[Voice Gather] Error:', error);
            reply.type('text/xml');
            return '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>I\'m sorry, something went wrong. Please call back and we\'ll be happy to help. Goodbye!</Say>\n  <Hangup/>\n</Response>';
        }
    });
    // Voice status webhook - call completed/ended
    app.post('/webhook/voice/status', async (request, reply) => {
        let { From, To, CallSid, CallStatus, CallDuration, RecordingUrl } = request.body;
        From = From?.trim();
        To = To?.trim();
        if (From && !From.startsWith('+'))
            From = '+' + From;
        if (To && !To.startsWith('+'))
            To = '+' + To;
        console.log('[Voice Status] ' + CallSid + ' -> ' + CallStatus + ' (' + CallDuration + 's)');
        await voiceAgent.handleCallStatus({
            callSid: CallSid,
            callStatus: CallStatus,
            callDuration: CallDuration,
            from: From,
            to: To,
            recordingUrl: RecordingUrl,
        });
        // Check if this was a short call (potential hangup before completing intake)
        const duration = parseInt(CallDuration, 10) || 0;
        if (duration > 0 && duration < 60) {
            console.log(`[Voice Status] Short call detected (${duration}s), checking if intake was completed...`);
            // Check if customer has a recent job (completed intake)
            const db = await (0, database_1.getDb)();
            const customer = await db.get(`SELECT c.id, c.name FROM customers c WHERE c.phone = ?`, [From]);
            if (customer) {
                const recentJob = await db.get(`SELECT j.id, j.created_at FROM jobs j 
           WHERE j.customer_id = ? AND j.created_at > datetime('now', '-5 minutes')
           ORDER BY j.created_at DESC LIMIT 1`, [customer.id]);
                if (!recentJob) {
                    console.log(`[Voice Status] No recent job for customer ${customer.id}, triggering missed call SMS`);
                    // Trigger missed call SMS
                    await missedCallHandler.handleCallStatus({
                        from: From,
                        to: To,
                        callSid: CallSid,
                        callStatus: 'no-answer',
                        direction: 'inbound',
                    });
                }
                else {
                    console.log(`[Voice Status] Recent job found (id=${recentJob.id}), intake was completed`);
                }
            }
            else {
                console.log(`[Voice Status] No customer found for ${From}, triggering missed call SMS`);
                // No customer record = definitely didn't complete intake
                await missedCallHandler.handleCallStatus({
                    from: From,
                    to: To,
                    callSid: CallSid,
                    callStatus: 'no-answer',
                    direction: 'inbound',
                });
            }
        }
        return { received: true };
    });
    // Call status webhook - triggers text-back on missed calls (forwarded calls AND voice AI calls)
    app.post('/webhook/call-status', async (request, reply) => {
        let { From, To, CallSid, CallStatus, DialCallStatus, Direction, CallDuration } = request.body;
        // Ensure phone numbers have + prefix for E.164 format and trim whitespace
        From = From?.trim();
        To = To?.trim();
        if (From && !From.startsWith('+'))
            From = '+' + From;
        if (To && !To.startsWith('+'))
            To = '+' + To;
        // DialCallStatus is set when this fires as a Dial action callback (forwarded calls)
        // Use DialCallStatus when present, otherwise fall back to CallStatus
        const effectiveStatus = (DialCallStatus || CallStatus);
        console.log('[Call Status] CallStatus=' + CallStatus + ' DialCallStatus=' + DialCallStatus + ' effective=' + effectiveStatus + ' duration=' + CallDuration + 's from ' + From + ' to ' + To);
        console.log('[Call Status] Full payload:', JSON.stringify(request.body));
        // Only handle inbound calls
        if (Direction !== 'inbound') {
            return { handled: false, reason: 'Not an inbound call' };
        }
        // Check if this is a voice AI call that ended quickly (potential hangup before intake completed)
        // This happens when the voice AI answers but the caller hangs up before completing intake
        const duration = parseInt(CallDuration, 10) || 0;
        if (effectiveStatus === 'completed' && duration > 0 && duration < 60) {
            console.log(`[Call Status] Short voice AI call detected (${duration}s), checking if intake was completed...`);
            // Check if customer has a recent job (completed intake)
            const db = await (0, database_1.getDb)();
            const customer = await db.get(`SELECT c.id, c.name FROM customers c WHERE c.phone = ?`, [From]);
            let shouldSendTextBack = false;
            if (customer) {
                const recentJob = await db.get(`SELECT j.id, j.created_at FROM jobs j 
           WHERE j.customer_id = ? AND j.created_at > datetime('now', '-5 minutes')
           ORDER BY j.created_at DESC LIMIT 1`, [customer.id]);
                if (!recentJob) {
                    console.log(`[Call Status] No recent job for customer ${customer.id}, will trigger missed call SMS`);
                    shouldSendTextBack = true;
                }
                else {
                    console.log(`[Call Status] Recent job found (id=${recentJob.id}), intake was completed`);
                }
            }
            else {
                console.log(`[Call Status] No customer found for ${From}, will trigger missed call SMS`);
                shouldSendTextBack = true;
            }
            if (shouldSendTextBack) {
                // Trigger missed call SMS by faking a 'no-answer' status
                const result = await missedCallHandler.handleCallStatus({
                    from: From,
                    to: To,
                    callSid: CallSid,
                    callStatus: 'no-answer',
                    direction: Direction,
                });
                return { ...result, voiceAiHangup: true };
            }
        }
        // Handle forwarded call statuses (original behavior)
        try {
            const result = await missedCallHandler.handleCallStatus({
                from: From,
                to: To,
                callSid: CallSid,
                callStatus: effectiveStatus,
                direction: Direction,
            });
            return result;
        }
        catch (error) {
            console.error('Call status webhook error:', error);
            return { handled: false, error: 'Failed to process call status' };
        }
    });
    // Test SMS endpoint - verifies provider config and can send a real message
    app.post('/api/test-sms', async (request, reply) => {
        const { to, message } = request.body;
        if (!to) {
            reply.code(400);
            return { error: 'Missing required field: to' };
        }
        const testMessage = message || `[Test] SMS delivery check from ${config.businessName} — ${new Date().toISOString()}`;
        // Log which provider will be used
        const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
        const hasSignalWire = !!(process.env.SIGNALWIRE_PROJECT_ID && process.env.SIGNALWIRE_TOKEN && process.env.SIGNALWIRE_PHONE_NUMBER);
        const provider = hasTwilio ? 'twilio' : hasSignalWire ? 'signalwire' : 'none';
        console.log(`[Test SMS] provider=${provider} to=${to} message="${testMessage}"`);
        console.log(`[Test SMS] Env: TWILIO_ACCOUNT_SID=${!!process.env.TWILIO_ACCOUNT_SID} TWILIO_AUTH_TOKEN=${!!process.env.TWILIO_AUTH_TOKEN} TWILIO_PHONE_NUMBER=${process.env.TWILIO_PHONE_NUMBER || 'MISSING'}`);
        console.log(`[Test SMS] Env: SIGNALWIRE_PROJECT_ID=${!!process.env.SIGNALWIRE_PROJECT_ID} SIGNALWIRE_TOKEN=${!!process.env.SIGNALWIRE_TOKEN} SIGNALWIRE_PHONE_NUMBER=${process.env.SIGNALWIRE_PHONE_NUMBER || 'MISSING'}`);
        if (provider === 'none') {
            reply.code(503);
            return { success: false, error: 'No SMS provider configured', provider, env: { hasTwilio, hasSignalWire } };
        }
        const { sendSMS } = await import('./signalwire-fetch.js');
        const sendFn = hasTwilio
            ? (await import('./twilio.js')).sendSMS
            : sendSMS;
        const result = await sendFn(to, testMessage);
        console.log(`[Test SMS] Result:`, result);
        return { ...result, provider, to, message: testMessage };
    });
    // Get missed call stats
    app.get('/api/missed-calls/stats', async (request) => {
        const { days } = request.query;
        const stats = await missedCallHandler.getStats(parseInt(days) || 30);
        return stats;
    });
    // List recent missed calls
    app.get('/api/missed-calls', async (request) => {
        const { days, limit } = request.query;
        const db = await (0, database_1.getDb)();
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
    // List call logs
    app.get('/api/call-logs', async (request) => {
        const { days, limit } = request.query;
        const db = await (0, database_1.getDb)();
        const calls = await db.all(`
      SELECT
        cl.*,
        c.name as customer_name,
        j.service_type,
        j.status as job_status
      FROM call_logs cl
      LEFT JOIN customers c ON cl.customer_phone = c.phone
      LEFT JOIN jobs j ON cl.job_id = j.id
      WHERE cl.created_at > datetime('now', '-${parseInt(days) || 7} days')
      ORDER BY cl.created_at DESC
      LIMIT ${parseInt(limit) || 50}
    `);
        return { call_logs: calls };
    });
    // Get a single call log with transcript
    app.get('/api/call-logs/:callSid', async (request, reply) => {
        const { callSid } = request.params;
        const db = await (0, database_1.getDb)();
        const call = await db.get(`
      SELECT cl.*, c.name as customer_name
      FROM call_logs cl
      LEFT JOIN customers c ON cl.customer_phone = c.phone
      WHERE cl.call_sid = ?
    `, callSid);
        if (!call) {
            reply.code(404);
            return { error: 'Call not found' };
        }
        if (call.transcript) {
            try {
                call.transcript = JSON.parse(call.transcript);
            }
            catch (_) { }
        }
        return { call };
    });
    // Active call count (for dashboard indicator)
    app.get('/api/call-logs/active', async () => {
        return { active_calls: voiceAgent.getActiveCallCount() };
    });
    // Chat webhook
    app.post('/webhook/chat', async (request, reply) => {
        const { message, sessionId, customerInfo } = request.body;
        console.log('[Chat Webhook] Session ' + sessionId + ': ' + message);
        try {
            const result = await orchestrator.processMessage({
                customerPhone: customerInfo?.phone || sessionId,
                message: message,
                channel: 'web',
                timestamp: new Date(),
                sessionId: sessionId,
                metadata: customerInfo
            });
            return { success: true, response: result.response, sessionId: sessionId };
        }
        catch (error) {
            console.error('Chat webhook error:', error);
            return { success: false, error: 'Failed to process message', response: "I'm sorry, I'm having trouble right now. Please try again or call us.", sessionId };
        }
    });
    // API Routes
    app.get('/api/conversations', async () => {
        const db = await (0, database_1.getDb)();
        const conversations = await db.all(`
      SELECT j.id as job_id, c.phone as customer_phone, c.name as customer_name, j.status, j.service_type, j.created_at, j.updated_at, COUNT(conv.id) as message_count
      FROM jobs j 
      JOIN customers c ON j.customer_id = c.id
      LEFT JOIN conversations conv ON j.id = conv.job_id 
      GROUP BY j.id ORDER BY j.updated_at DESC
    `);
        return { conversations };
    });
    app.get('/api/conversations/:jobId', async (request) => {
        const { jobId } = request.params;
        const db = await (0, database_1.getDb)();
        const job = await db.get('SELECT j.*, c.name as customer_name, c.phone as customer_phone FROM jobs j JOIN customers c ON j.customer_id = c.id WHERE j.id = ?', jobId);
        if (!job)
            return { error: 'Conversation not found' };
        const messages = await db.all('SELECT * FROM conversations WHERE job_id = ? ORDER BY created_at ASC', jobId);
        return { job, messages };
    });
    app.get('/api/leads', async () => {
        const db = await (0, database_1.getDb)();
        const leads = await db.all(`
      SELECT j.*, c.name as customer_name, c.phone as customer_phone, COUNT(conv.id) as message_count FROM jobs j 
      JOIN customers c ON j.customer_id = c.id
      LEFT JOIN conversations conv ON j.id = conv.job_id 
      WHERE j.status IN ('new', 'quoted', 'scheduled') 
      GROUP BY j.id ORDER BY j.created_at DESC
    `);
        return { leads };
    });
    app.put('/api/leads/:id', async (request) => {
        const { id } = request.params;
        const { status, notes } = request.body;
        const db = await (0, database_1.getDb)();
        await db.run('UPDATE jobs SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, notes, id]);
        const updated = await db.get('SELECT * FROM jobs WHERE id = ?', id);
        return { lead: updated };
    });
    app.get('/api/appointments', async () => {
        const db = await (0, database_1.getDb)();
        const appointments = await db.all(`
      SELECT a.*, j.customer_name, j.customer_phone, j.service_type, j.address, t.name as technician_name
      FROM appointments a JOIN jobs j ON a.job_id = j.id 
      LEFT JOIN technicians t ON a.technician_id = t.id 
      ORDER BY a.scheduled_date, a.scheduled_time
    `);
        return { appointments };
    });
    app.post('/api/appointments', async (request) => {
        const { jobId, date, time, technicianId, notes } = request.body;
        const db = await (0, database_1.getDb)();
        const result = await db.run(`
      INSERT INTO appointments (job_id, scheduled_date, scheduled_time, technician_id, status, notes)
      VALUES (?, ?, ?, ?, 'scheduled', ?)
    `, [jobId, date, time, technicianId, notes]);
        await db.run("UPDATE jobs SET status = 'scheduled' WHERE id = ?", jobId);
        const appointment = await db.get('SELECT * FROM appointments WHERE id = ?', result.lastID);
        return { appointment };
    });
    app.put('/api/appointments/:id', async (request) => {
        const { id } = request.params;
        const { status, technicianId, notes } = request.body;
        const db = await (0, database_1.getDb)();
        await db.run(`
      UPDATE appointments SET status = ?, technician_id = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [status, technicianId, notes, id]);
        const updated = await db.get('SELECT * FROM appointments WHERE id = ?', id);
        return { appointment: updated };
    });
    app.get('/api/technicians', async () => {
        const db = await (0, database_1.getDb)();
        const technicians = await db.all(`
      SELECT t.*, COUNT(DISTINCT a.id) as active_jobs, AVG(r.rating) as avg_rating
      FROM technicians t LEFT JOIN appointments a ON t.id = a.technician_id AND a.status = 'scheduled'
      LEFT JOIN reviews r ON t.id = r.technician_id WHERE t.is_active = true GROUP BY t.id
    `);
        return { technicians };
    });
    app.post('/api/technicians', async (request, reply) => {
        const { name, phone, email, skills, serviceArea } = request.body;
        if (!name || !phone) {
            reply.code(400);
            return { error: 'Name and phone are required' };
        }
        const db = await (0, database_1.getDb)();
        const result = await db.run(`
      INSERT INTO technicians (name, phone, email, skills, service_area, is_active) VALUES (?, ?, ?, ?, ?, true)
    `, [name, phone, email, JSON.stringify(skills || []), serviceArea]);
        const newTechnician = await db.get('SELECT t.*, 0 as active_jobs FROM technicians t WHERE t.id = ?', result.lastID);
        reply.code(201);
        return { technician: newTechnician };
    });
    app.put('/api/technicians/:id', async (request, reply) => {
        const { id } = request.params;
        const { name, phone, email, skills, serviceArea, isActive } = request.body;
        const db = await (0, database_1.getDb)();
        const existing = await db.get('SELECT id FROM technicians WHERE id = ?', id);
        if (!existing) {
            reply.code(404);
            return { error: 'Technician not found' };
        }
        await db.run(`
      UPDATE technicians SET name = ?, phone = ?, email = ?, skills = ?, service_area = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [name, phone, email, JSON.stringify(skills || []), serviceArea, isActive, id]);
        const updated = await db.get(`
      SELECT t.*, COUNT(DISTINCT a.id) as active_jobs FROM technicians t 
      LEFT JOIN appointments a ON t.id = a.technician_id AND a.status = 'scheduled' WHERE t.id = ? GROUP BY t.id
    `, id);
        return { technician: updated };
    });
    app.delete('/api/technicians/:id', async (request, reply) => {
        const { id } = request.params;
        const db = await (0, database_1.getDb)();
        const existing = await db.get('SELECT id FROM technicians WHERE id = ?', id);
        if (!existing) {
            reply.code(404);
            return { error: 'Technician not found' };
        }
        await db.run('UPDATE technicians SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = ?', id);
        reply.code(204);
        return;
    });
    app.get('/api/analytics', async () => {
        const db = await (0, database_1.getDb)();
        const [totalJobs, newLeads, scheduledJobs, completedJobs, avgRating] = await Promise.all([
            db.get('SELECT COUNT(*) as count FROM jobs'),
            db.get("SELECT COUNT(*) as count FROM jobs WHERE status = 'new'"),
            db.get("SELECT COUNT(*) as count FROM appointments WHERE status = 'scheduled'"),
            db.get("SELECT COUNT(*) as count FROM jobs WHERE status = 'completed'"),
            db.get('SELECT AVG(rating) as avg FROM reviews')
        ]);
        const jobsByService = await db.all('SELECT service_type, COUNT(*) as count FROM jobs GROUP BY service_type');
        const recentActivity = await db.all(`
      SELECT 'message' as type, conv.created_at as timestamp, c.name as customer_name, conv.message_text as description
      FROM conversations conv 
      JOIN jobs j ON conv.job_id = j.id 
      JOIN customers c ON j.customer_id = c.id
      ORDER BY conv.created_at DESC LIMIT 10
    `);
        return {
            summary: { totalJobs: totalJobs?.count || 0, newLeads: newLeads?.count || 0, scheduledJobs: scheduledJobs?.count || 0, completedJobs: completedJobs?.count || 0, avgRating: avgRating?.avg || 0 },
            jobsByService, recentActivity
        };
    });
    // Cron endpoint for follow-up reminders
    app.post('/cron/process-followups', async () => {
        console.log('[Cron] Running follow-up checks at ' + new Date().toISOString());
        try {
            await orchestrator.processTimeBasedActions();
            return { success: true, message: 'Follow-up checks completed' };
        }
        catch (error) {
            console.error('[Cron] Error processing follow-ups:', error);
            return { success: false, error: 'Failed to process follow-ups' };
        }
    });
    // Serve audio files for ElevenLabs TTS
    app.get('/audio/:filename', async (request, reply) => {
        const { filename } = request.params;
        const filePath = (0, elevenlabs_tts_js_1.getAudioFilePath)(filename);
        if (!filePath) {
            reply.code(404);
            return { error: 'Audio file not found' };
        }
        try {
            const fs = await import('fs');
            const audioBuffer = fs.readFileSync(filePath);
            reply.type('audio/mpeg');
            return audioBuffer;
        }
        catch (error) {
            console.error('[Audio] Failed to serve file:', error);
            reply.code(500);
            return { error: 'Failed to serve audio' };
        }
    });
    // Get voice configuration status
    app.get('/api/tts-config', async () => {
        return {
            elevenlabs: voiceAgent.isElevenLabsEnabled(),
            voice: process.env.VOICE_TTS_VOICE || 'Polly.Amy',
            format: 'LaML XML with ElevenLabs audio files',
        };
    });
    app.get('/health', async () => {
        return { status: 'ok', timestamp: new Date().toISOString(), tier: config.tier };
    });
    const port = parseInt(process.env.PORT || '3002');
    const host = process.env.HOST || '0.0.0.0';
    try {
        await app.listen({ port, host });
        console.log('[API] Server running on http://localhost:' + port);
        console.log('[API] Tier: ' + config.tier);
    }
    catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=api-v2.js.map