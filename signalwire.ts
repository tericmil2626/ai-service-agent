const { RestClient } = require('@signalwire/node');

const projectId = process.env.SIGNALWIRE_PROJECT_ID;
const token = process.env.SIGNALWIRE_TOKEN;
const fromNumber = process.env.SIGNALWIRE_PHONE_NUMBER;

const client = new RestClient(projectId, token, { signalwireSpaceUrl: 'theodorosai26.signalwire.com' });

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
    console.error('SignalWire SMS error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function makeCall(to: string, url: string): Promise<{
  success: boolean;
  callId?: string;
  error?: string;
}> {
  try {
    const call = await client.calls.create({
      url: url,
      to: to,
      from: fromNumber
    });

    return {
      success: true,
      callId: call.sid
    };
  } catch (error: any) {
    console.error('SignalWire call error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
