// SignalWire SDK integration
import { RestClient } from '@signalwire/compatibility-api';

const projectId = process.env.SIGNALWIRE_PROJECT_ID;
const token = process.env.SIGNALWIRE_TOKEN;
const fromNumber = process.env.SIGNALWIRE_PHONE_NUMBER;
const spaceUrl = process.env.SIGNALWIRE_SPACE || 'theodorosai26.signalwire.com';

// Create SignalWire client
const client = projectId && token 
  ? new RestClient(projectId, token, { signalwireSpaceUrl: spaceUrl })
  : null;

export async function sendSMS(to: string, message: string): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  console.log(`[SignalWire] sendSMS called with to=${to}, from=${fromNumber}`);
  
  if (!fromNumber) {
    console.error('[SignalWire] SIGNALWIRE_PHONE_NUMBER not configured');
    return { success: false, error: 'SIGNALWIRE_PHONE_NUMBER not configured' };
  }

  if (!client) {
    console.error('[SignalWire] Client not initialized');
    return { success: false, error: 'SignalWire client not initialized - check SIGNALWIRE_PROJECT_ID and SIGNALWIRE_TOKEN' };
  }

  try {
    console.log(`[SignalWire] Calling messages.create...`);
    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: to
    });

    console.log(`[SignalWire] SMS sent to ${to}: ${message.substring(0, 50)}...`);
    return {
      success: true,
      messageId: result.sid
    };
  } catch (error: any) {
    console.error('[SignalWire] SMS error:', error.message || error);
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
  if (!fromNumber) {
    return { success: false, error: 'SIGNALWIRE_PHONE_NUMBER not configured' };
  }

  if (!client) {
    return { success: false, error: 'SignalWire client not initialized' };
  }

  try {
    const call = await client.calls.create({
      url: url,
      to: to,
      from: fromNumber
    });

    console.log(`[SignalWire] Call initiated to ${to}`);
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
