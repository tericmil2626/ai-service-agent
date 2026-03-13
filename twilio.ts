import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

export async function sendSMS(to: string, message: string): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
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
  return twilio.validateRequest(authToken, signature, url, params);
}
