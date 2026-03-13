"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSMS = sendSMS;
exports.makeCall = makeCall;
exports.validateTwilioRequest = validateTwilioRequest;
const twilio_1 = __importDefault(require("twilio"));
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const client = (0, twilio_1.default)(accountSid, authToken);
async function sendSMS(to, message) {
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
    return twilio_1.default.validateRequest(authToken, signature, url, params);
}
