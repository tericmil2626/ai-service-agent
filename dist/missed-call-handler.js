"use strict";
// Missed Call Text-Back Handler
// Detects missed calls and sends immediate SMS follow-up
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissedCallHandler = void 0;
const database_js_1 = require("./database.js");
const twilio_js_1 = require("./twilio.js");
const signalwire_fetch_js_1 = require("./signalwire-fetch.js");
function getSMSProvider() {
    // Check which provider is configured
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
        console.log('[MissedCall] Using Twilio provider');
        return { sendSMS: twilio_js_1.sendSMS };
    }
    if (process.env.SIGNALWIRE_PROJECT_ID && process.env.SIGNALWIRE_TOKEN && process.env.SIGNALWIRE_PHONE_NUMBER) {
        console.log('[MissedCall] Using SignalWire provider');
        return { sendSMS: signalwire_fetch_js_1.sendSMS };
    }
    console.warn('[MissedCall] No SMS provider configured');
    return null;
}
// Default text-back message template
const DEFAULT_TEXT_BACK_MESSAGE = (businessName) => `Sorry we missed your call! This is ${businessName}. ` +
    `What can we help you with today?`;
class MissedCallHandler {
    businessName;
    textBackMessage;
    constructor(businessName, customMessage) {
        this.businessName = businessName || process.env.BUSINESS_NAME || 'our service team';
        this.textBackMessage = customMessage || DEFAULT_TEXT_BACK_MESSAGE(this.businessName);
    }
    /** Re-check provider each call so env var changes and dotenv timing aren't an issue */
    getProvider() {
        const provider = getSMSProvider();
        if (!provider) {
            console.error('[MissedCall] No SMS provider available. Env vars present:', `TWILIO_ACCOUNT_SID=${!!process.env.TWILIO_ACCOUNT_SID}`, `TWILIO_AUTH_TOKEN=${!!process.env.TWILIO_AUTH_TOKEN}`, `TWILIO_PHONE_NUMBER=${!!process.env.TWILIO_PHONE_NUMBER}`, `SIGNALWIRE_PROJECT_ID=${!!process.env.SIGNALWIRE_PROJECT_ID}`, `SIGNALWIRE_TOKEN=${!!process.env.SIGNALWIRE_TOKEN}`, `SIGNALWIRE_PHONE_NUMBER=${!!process.env.SIGNALWIRE_PHONE_NUMBER}`);
        }
        return provider;
    }
    /**
     * Process a call status webhook from Twilio/SignalWire
     * Triggers text-back if call was missed
     */
    async handleCallStatus(data) {
        let { from, to, callSid, callStatus } = data;
        // Ensure phone numbers have + prefix for E.164 format and trim whitespace
        from = from?.trim();
        to = to?.trim();
        if (from && !from.startsWith('+'))
            from = '+' + from;
        if (to && !to.startsWith('+'))
            to = '+' + to;
        console.log(`[MissedCall] Call status: ${callStatus} from ${from} to ${to}`);
        // Only handle missed calls (not completed calls)
        const missedStatuses = ['no-answer', 'busy', 'failed', 'canceled'];
        if (!missedStatuses.includes(callStatus)) {
            console.log(`[MissedCall] Call status ${callStatus} - not a missed call, ignoring`);
            return { handled: false, textBackSent: false };
        }
        // Record the missed call
        const missedCallId = await (0, database_js_1.createMissedCall)({
            customer_phone: from,
            business_phone: to,
            call_sid: callSid,
            call_status: callStatus,
        });
        console.log(`[MissedCall] Recorded missed call ID: ${missedCallId}`);
        // Send text-back immediately
        const result = await this.sendTextBack(from, missedCallId);
        return {
            handled: true,
            textBackSent: result.success,
            message: result.message,
            error: result.error,
        };
    }
    /**
     * Send the text-back SMS to a missed caller, with retry on failure
     */
    async sendTextBack(to, missedCallId) {
        const provider = this.getProvider();
        if (!provider) {
            const error = 'No SMS provider configured - cannot send text-back';
            console.error(`[MissedCall] ${error}`);
            return { success: false, error };
        }
        const message = this.textBackMessage;
        console.log(`[MissedCall] Sending text-back to ${to}: "${message}"`);
        const MAX_ATTEMPTS = 3;
        let lastError;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            if (attempt > 1) {
                const backoffMs = attempt * 2000;
                console.log(`[MissedCall] Retry attempt ${attempt}/${MAX_ATTEMPTS} in ${backoffMs}ms...`);
                await new Promise(res => setTimeout(res, backoffMs));
            }
            console.log(`[MissedCall] Attempting to send SMS to ${to} (attempt ${attempt}/${MAX_ATTEMPTS})`);
            let result;
            try {
                result = await provider.sendSMS(to, message);
            }
            catch (err) {
                lastError = err?.message || String(err);
                console.error(`[MissedCall] Text-back attempt ${attempt}/${MAX_ATTEMPTS} threw an exception for ${to}:`, err);
                continue;
            }
            if (result.success) {
                console.log(`[MissedCall] Text-back sent successfully on attempt ${attempt}: messageId=${result.messageId}`);
                await (0, database_js_1.updateMissedCallTextBack)(missedCallId, message);
                return { success: true, message };
            }
            lastError = result.error;
            console.error(`[MissedCall] Text-back attempt ${attempt}/${MAX_ATTEMPTS} failed for ${to}: ${result.error}`);
        }
        console.error(`[MissedCall] All ${MAX_ATTEMPTS} send attempts failed for ${to}. Last error: ${lastError}`);
        return { success: false, error: lastError };
    }
    /**
     * Handle a reply from a customer who received a text-back
     * This creates a lead/job and starts the intake conversation
     */
    async handleTextBackReply(customerPhone, message, orchestrator) {
        // Ensure phone number has + prefix
        if (customerPhone && !customerPhone.startsWith('+'))
            customerPhone = '+' + customerPhone;
        console.log(`[MissedCall] Handling text-back reply from ${customerPhone}: ${message}`);
        // Check if this is a reply to a recent missed call text-back
        const { getRecentTextBacks } = await import('./database.js');
        console.log(`[MissedCall] Looking for text-backs for ${customerPhone}...`);
        const recentTextBacks = await getRecentTextBacks(customerPhone, 60); // 1 hour window
        console.log(`[MissedCall] Found ${recentTextBacks.length} recent text-backs`);
        if (recentTextBacks.length === 0) {
            // Not a reply to a text-back, treat as normal SMS
            console.log(`[MissedCall] No recent text-back for ${customerPhone}, treating as normal SMS`);
            return { success: false, error: 'Not a text-back reply' };
        }
        // Check if the MOST RECENT text-back was already replied to (converted_to_lead = 1)
        // Only look at the newest one (index 0, ordered DESC) — don't let old replied text-backs
        // block processing of a new missed call reply from the same number.
        const mostRecentTextBack = recentTextBacks[0];
        if (mostRecentTextBack.converted_to_lead === 1) {
            console.log(`[MissedCall] Most recent text-back for ${customerPhone} already has reply, treating as normal SMS`);
            return { success: false, error: 'Text-back already replied' };
        }
        // Clear any old conversation state so intake starts fresh (only for first reply)
        const { ConversationStateManager } = await import('./core/StateManager.js');
        const stateManager = new ConversationStateManager();
        await stateManager.clearState(customerPhone);
        console.log(`[MissedCall] First text-back reply from ${customerPhone}, cleared old state`);
        // Process through the orchestrator as a new lead
        try {
            // Support both method signatures (processMessage for api-v2, processIncomingMessage for api.ts)
            const processFn = orchestrator.processMessage || orchestrator.processIncomingMessage;
            const result = await processFn.call(orchestrator, {
                customerPhone: customerPhone,
                customer_phone: customerPhone,
                message: message,
                channel: 'sms',
                timestamp: new Date(),
                sessionId: `missed-call-reply-${Date.now()}`
            });
            // Mark the missed call as converted to lead immediately
            // This ensures subsequent messages don't clear state again
            const missedCall = mostRecentTextBack;
            const { getDb } = await import('./database.js');
            const db = await getDb();
            // Mark as converted immediately (job_id can be updated later)
            await db.run(`UPDATE missed_calls SET converted_to_lead = 1 WHERE id = ?`, [missedCall.id]);
            console.log(`[MissedCall] Marked missed call ${missedCall.id} as converted_to_lead=1`);
            // Try to get job ID and update if available
            const customer = await (0, database_js_1.findCustomerByPhone)(customerPhone);
            if (customer) {
                const job = await db.get('SELECT id FROM jobs WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1', [customer.id]);
                if (job) {
                    await (0, database_js_1.updateMissedCallTextBack)(missedCall.id, missedCall.text_back_message || this.textBackMessage, job.id);
                }
            }
            console.log(`[MissedCall] Text-back reply processed, response: ${result.response.substring(0, 50)}...`);
            return {
                success: true,
                response: result.response,
            };
        }
        catch (error) {
            console.error(`[MissedCall] Error processing text-back reply:`, error);
            return { success: false, error: error.message };
        }
    }
    /**
     * Get stats on missed calls and conversions
     */
    async getStats(days = 30) {
        const { getDb } = await import('./database.js');
        const db = await getDb();
        const stats = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN text_back_sent = 1 THEN 1 ELSE 0 END) as text_backs,
        SUM(CASE WHEN converted_to_lead = 1 THEN 1 ELSE 0 END) as conversions
      FROM missed_calls
      WHERE created_at > datetime('now', '-${days} days')
    `);
        const total = stats?.total || 0;
        const conversions = stats?.conversions || 0;
        return {
            totalMissedCalls: total,
            textBacksSent: stats?.text_backs || 0,
            conversions: conversions,
            conversionRate: total > 0 ? Math.round((conversions / total) * 100) : 0,
        };
    }
}
exports.MissedCallHandler = MissedCallHandler;
exports.default = MissedCallHandler;
//# sourceMappingURL=missed-call-handler.js.map