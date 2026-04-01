"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSMS = sendSMS;
exports.makeCall = makeCall;
exports.validateTwilioRequest = validateTwilioRequest;
// Twilio SDK integration
const twilio_1 = __importDefault(require("twilio"));
// NOTE: env vars are read inside each function to ensure dotenv has loaded first.
// Top-level reads happen before dotenv.config() due to import hoisting.
function getTwilioClient() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && authToken) {
        return (0, twilio_1.default)(accountSid, authToken);
    }
    return null;
}
async function sendSMS(to, message) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    console.log(`[Twilio] sendSMS called — accountSid=${accountSid ? 'set' : 'MISSING'} authToken=${authToken ? 'set' : 'MISSING'} from=${fromNumber || 'MISSING'} to=${to}`);
    if (!accountSid || !authToken) {
        return { success: false, error: 'Twilio credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN) not configured' };
    }
    if (!fromNumber) {
        return { success: false, error: 'TWILIO_PHONE_NUMBER not configured' };
    }
    try {
        const client = (0, twilio_1.default)(accountSid, authToken);
        const result = await client.messages.create({
            body: message,
            from: fromNumber,
            to: to
        });
        console.log(`[Twilio] SMS sent to ${to}: sid=${result.sid} status=${result.status}`);
        return {
            success: true,
            messageId: result.sid
        };
    }
    catch (error) {
        console.error(`[Twilio] SMS error to ${to}:`, error.message, error.code ? `(code ${error.code})` : '');
        return {
            success: false,
            error: error.message
        };
    }
}
async function makeCall(to, twimlUrl) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !fromNumber) {
        return { success: false, error: 'Twilio credentials not fully configured' };
    }
    try {
        const client = (0, twilio_1.default)(accountSid, authToken);
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
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const storedAuthToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && storedAuthToken) {
        return twilio_1.default.validateRequest(authToken, signature, url, params);
    }
    console.log('[MOCK] Twilio request validation (always returns true)');
    return true;
}
//# sourceMappingURL=twilio.js.map