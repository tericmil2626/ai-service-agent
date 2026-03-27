"use strict";
// Twilio SDK integration
// Install with: npm install twilio
// Then uncomment the import below
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSMS = sendSMS;
exports.makeCall = makeCall;
exports.validateTwilioRequest = validateTwilioRequest;
// import twilio from 'twilio';
// Mock implementation for when twilio is not installed
const mockClient = {
    messages: {
        create: async ({ body, from, to }) => {
            console.log(`[MOCK Twilio SMS] To: ${to}, From: ${from}, Message: ${body}`);
            return { sid: `mock-${Date.now()}` };
        }
    },
    calls: {
        create: async ({ url, to, from }) => {
            console.log(`[MOCK Twilio Call] To: ${to}, From: ${from}, URL: ${url}`);
            return { sid: `mock-call-${Date.now()}` };
        }
    }
};
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
// Use mock client if twilio isn't installed
const client = mockClient;
async function sendSMS(to, message) {
    if (!fromNumber) {
        return { success: false, error: 'TWILIO_PHONE_NUMBER not configured' };
    }
    try {
        const result = await client.messages.create({
            body: message,
            from: fromNumber,
            to: to
        });
        return {
            success: true,
            messageId: result.sid
        };
    }
    catch (error) {
        console.error('Twilio SMS error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}
async function makeCall(to, twimlUrl) {
    if (!fromNumber) {
        return { success: false, error: 'TWILIO_PHONE_NUMBER not configured' };
    }
    try {
        const call = await client.calls.create({
            url: twimlUrl,
            to: to,
            from: fromNumber
        });
        return {
            success: true,
            callId: call.sid
        };
    }
    catch (error) {
        console.error('Twilio call error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}
function validateTwilioRequest(authToken, signature, url, params) {
    // Mock validation - always returns true
    // When twilio is installed, use: return twilio.validateRequest(authToken, signature, url, params);
    console.log('[MOCK] Twilio request validation (always returns true)');
    return true;
}
//# sourceMappingURL=twilio.js.map