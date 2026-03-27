// Twilio SDK integration
// Install with: npm install twilio
// Then uncomment the import below

// import twilio from 'twilio';

// Mock implementation for when twilio is not installed
const mockClient = {
  messages: {
    create: async ({ body, from, to }: { body: string; from: string; to: string }) => {
      console.log(`[MOCK Twilio SMS] To: ${to}, From: ${from}, Message: ${body}`);
      return { sid: `mock-${Date.now()}` };
    }
  },
  calls: {
    create: async ({ url, to, from }: { url: string; to: string; from: string }) => {
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

export async function sendSMS(to: string, message: string): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
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
  } catch (error: any) {
    console.error('Twilio SMS error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function makeCall(to: string, twimlUrl: string): Promise<{
  success: boolean;
  callId?: string;
  error?: string;
}> {
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
  } catch (error: any) {
    console.error('Twilio call error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export function validateTwilioRequest(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, any>
): boolean {
  // Mock validation - always returns true
  // When twilio is installed, use: return twilio.validateRequest(authToken, signature, url, params);
  console.log('[MOCK] Twilio request validation (always returns true)');
  return true;
}
