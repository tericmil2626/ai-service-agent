"use strict";
// SignalWire REST API integration using fetch
// Bypasses the SDK to avoid timeout issues
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSMS = sendSMS;
exports.makeCall = makeCall;
// Per-recipient send queue to avoid carrier rate limiting (1 msg/sec per destination)
const SMS_SEND_DELAY_MS = 1200; // slightly over 1s to be safe
const lastSentAt = new Map();
const sendQueues = new Map();
function rateLimitedSend(to, fn) {
    const prev = sendQueues.get(to) || Promise.resolve();
    const next = prev.then(async () => {
        const now = Date.now();
        const last = lastSentAt.get(to) || 0;
        const wait = SMS_SEND_DELAY_MS - (now - last);
        if (wait > 0) {
            console.log(`[SignalWire Fetch] Rate limiting: waiting ${wait}ms before sending to ${to}`);
            await new Promise(res => setTimeout(res, wait));
        }
        await fn();
        lastSentAt.set(to, Date.now());
    });
    sendQueues.set(to, next.catch(() => { })); // swallow to keep queue alive
    return next;
}
async function sendSMS(to, message) {
    // Read env vars inside function to ensure they're loaded after dotenv
    const projectId = process.env.SIGNALWIRE_PROJECT_ID;
    const token = process.env.SIGNALWIRE_TOKEN;
    const fromNumber = process.env.SIGNALWIRE_PHONE_NUMBER;
    const spaceUrl = process.env.SIGNALWIRE_SPACE || 'theodorosai26.signalwire.com';
    console.log(`[SignalWire Fetch] sendSMS called with to=${to}, from=${fromNumber}`);
    if (!fromNumber || !projectId || !token) {
        console.error('[SignalWire Fetch] Missing credentials');
        return { success: false, error: 'SignalWire credentials not configured' };
    }
    let result = { success: false };
    await rateLimitedSend(to, async () => {
        try {
            const auth = Buffer.from(`${projectId}:${token}`).toString('base64');
            const url = `https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/Messages.json`;
            console.log(`[SignalWire Fetch] POST ${url}`);
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    From: fromNumber,
                    To: to,
                    Body: message,
                    ...(process.env.WEBHOOK_BASE_URL ? { StatusCallback: `${process.env.WEBHOOK_BASE_URL}/webhook/sms-status` } : {}),
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[SignalWire Fetch] HTTP error:', response.status, errorText);
                result = { success: false, error: `HTTP ${response.status}: ${errorText}` };
                return;
            }
            const data = await response.json();
            if (data.error_code) {
                console.error(`[SignalWire Fetch] API accepted message but returned error — sid=${data.sid} status=${data.status} error_code=${data.error_code} error_message=${data.error_message}`);
                result = { success: false, error: `SignalWire error ${data.error_code}: ${data.error_message}` };
                return;
            }
            // Warn on non-queued/non-sent statuses (e.g. 'failed', 'undelivered')
            const goodStatuses = ['queued', 'sending', 'sent', 'delivered', 'accepted'];
            if (!goodStatuses.includes(data.status)) {
                console.warn(`[SignalWire Fetch] Unexpected message status: ${data.status} for sid=${data.sid} to=${to}`);
            }
            console.log(`[SignalWire Fetch] SMS queued to ${to}: sid=${data.sid} status=${data.status}`);
            result = { success: true, messageId: data.sid };
        }
        catch (error) {
            console.error('[SignalWire Fetch] Error:', error.message);
            result = { success: false, error: error.message };
        }
    });
    return result;
}
async function makeCall(to, twimlUrl) {
    // Read env vars inside function to ensure they're loaded after dotenv
    const projectId = process.env.SIGNALWIRE_PROJECT_ID;
    const token = process.env.SIGNALWIRE_TOKEN;
    const fromNumber = process.env.SIGNALWIRE_PHONE_NUMBER;
    const spaceUrl = process.env.SIGNALWIRE_SPACE || 'theodorosai26.signalwire.com';
    if (!fromNumber || !projectId || !token) {
        return { success: false, error: 'SignalWire credentials not configured' };
    }
    try {
        const auth = Buffer.from(`${projectId}:${token}`).toString('base64');
        const url = `https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/Calls.json`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                From: fromNumber,
                To: to,
                Url: twimlUrl,
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `HTTP ${response.status}: ${errorText}` };
        }
        const result = await response.json();
        console.log(`[SignalWire Fetch] Call initiated to ${to}`);
        return {
            success: true,
            callId: result.sid,
        };
    }
    catch (error) {
        console.error('[SignalWire Fetch] Call error:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}
//# sourceMappingURL=signalwire-fetch.js.map