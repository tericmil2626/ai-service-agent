"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSMSProvider = createSMSProvider;
exports.getSMSProvider = getSMSProvider;
// Twilio SMS Provider
class TwilioProvider {
    accountSid;
    authToken;
    fromNumber;
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
        this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
        if (!this.accountSid || !this.authToken || !this.fromNumber) {
            console.warn('[SMS] Twilio credentials not configured. SMS sending disabled.');
        }
    }
    async sendSMS(to, message) {
        if (!this.accountSid || !this.authToken || !this.fromNumber) {
            console.log(`[SMS MOCK] To: ${to}, Message: ${message}`);
            return true;
        }
        try {
            const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
                },
                body: new URLSearchParams({
                    To: to,
                    From: this.fromNumber,
                    Body: message,
                }),
            });
            if (!response.ok) {
                const error = await response.text();
                console.error('[SMS] Twilio error:', error);
                return false;
            }
            console.log(`[SMS] Sent to ${to}: ${message.substring(0, 50)}...`);
            return true;
        }
        catch (error) {
            console.error('[SMS] Failed to send:', error);
            return false;
        }
    }
    sendTwiMLResponse(message) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${this.escapeXml(message)}</Message>
</Response>`;
    }
    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
// SignalWire SMS Provider
class SignalWireProvider {
    projectId;
    token;
    fromNumber;
    space;
    constructor() {
        this.projectId = process.env.SIGNALWIRE_PROJECT_ID || '';
        this.token = process.env.SIGNALWIRE_TOKEN || '';
        this.fromNumber = process.env.SIGNALWIRE_PHONE_NUMBER || '';
        this.space = process.env.SIGNALWIRE_SPACE || '';
        if (!this.projectId || !this.token || !this.fromNumber) {
            console.warn('[SMS] SignalWire credentials not configured. SMS sending disabled.');
        }
    }
    async sendSMS(to, message) {
        if (!this.projectId || !this.token || !this.fromNumber) {
            console.log(`[SMS MOCK] To: ${to}, Message: ${message}`);
            return true;
        }
        try {
            const spaceUrl = this.space.includes('.') ? this.space : `${this.space}.signalwire.com`;
            const response = await fetch(`https://${spaceUrl}/api/laml/2010-04-01/Accounts/${this.projectId}/Messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${this.projectId}:${this.token}`).toString('base64'),
                },
                body: new URLSearchParams({
                    To: to,
                    From: this.fromNumber,
                    Body: message,
                }),
            });
            if (!response.ok) {
                const error = await response.text();
                console.error('[SMS] SignalWire error:', error);
                return false;
            }
            console.log(`[SMS] Sent to ${to}: ${message.substring(0, 50)}...`);
            return true;
        }
        catch (error) {
            console.error('[SMS] Failed to send:', error);
            return false;
        }
    }
    sendTwiMLResponse(message) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${this.escapeXml(message)}</Message>
</Response>`;
    }
    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
// Mock SMS Provider (for testing without real credentials)
class MockSMSProvider {
    async sendSMS(to, message) {
        console.log(`[SMS MOCK] To: ${to}`);
        console.log(`[SMS MOCK] Message: ${message}`);
        return true;
    }
    sendTwiMLResponse(message) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${message}</Message>
</Response>`;
    }
}
// SMS Provider Factory
function createSMSProvider() {
    const provider = process.env.SMS_PROVIDER || 'mock';
    switch (provider.toLowerCase()) {
        case 'twilio':
            return new TwilioProvider();
        case 'signalwire':
            return new SignalWireProvider();
        case 'mock':
        default:
            console.log('[SMS] Using mock provider (set SMS_PROVIDER=twilio or signalwire for real sending)');
            return new MockSMSProvider();
    }
}
// Singleton instance
let smsProvider = null;
function getSMSProvider() {
    if (!smsProvider) {
        smsProvider = createSMSProvider();
    }
    return smsProvider;
}
//# sourceMappingURL=sms.js.map