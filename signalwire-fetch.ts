// SignalWire REST API integration using fetch
// Bypasses the SDK to avoid timeout issues

const projectId = process.env.SIGNALWIRE_PROJECT_ID;
const token = process.env.SIGNALWIRE_TOKEN;
const fromNumber = process.env.SIGNALWIRE_PHONE_NUMBER;
const spaceUrl = process.env.SIGNALWIRE_SPACE || 'theodorosai26.signalwire.com';

export async function sendSMS(to: string, message: string): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  console.log(`[SignalWire Fetch] sendSMS called with to=${to}, from=${fromNumber}`);
  
  if (!fromNumber || !projectId || !token) {
    console.error('[SignalWire Fetch] Missing credentials');
    return { success: false, error: 'SignalWire credentials not configured' };
  }

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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SignalWire Fetch] HTTP error:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.json() as { sid: string };
    console.log(`[SignalWire Fetch] SMS sent to ${to}: ${message.substring(0, 50)}...`);
    return {
      success: true,
      messageId: result.sid,
    };
  } catch (error: any) {
    console.error('[SignalWire Fetch] Error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function makeCall(to: string, twimlUrl: string): Promise<{
  success: boolean;
  callId?: string;
  error?: string;
}> {
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

    const result = await response.json() as { sid: string };
    console.log(`[SignalWire Fetch] Call initiated to ${to}`);
    return {
      success: true,
      callId: result.sid,
    };
  } catch (error: any) {
    console.error('[SignalWire Fetch] Call error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}
