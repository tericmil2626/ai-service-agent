import { ServiceBusinessOrchestrator } from './orchestrator-v2';
import { getDb } from './database';
import { generateSpeech, isElevenLabsConfigured } from './elevenlabs-tts.js';

interface CallTurn {
  role: 'caller' | 'agent';
  text: string;
  timestamp: string;
}

interface ActiveCall {
  callSid: string;
  customerPhone: string;
  businessPhone: string;
  startedAt: Date;
  turns: CallTurn[];
  callLogId?: number;
  retryCount: number;
}

// In-memory store for active calls (keyed by CallSid)
const activeCalls = new Map<string, ActiveCall>();

export class VoiceAgent {
  private orchestrator: ServiceBusinessOrchestrator;
  private webhookBaseUrl: string;
  private useElevenLabs: boolean;
  private fallbackVoice: string;

  constructor(orchestrator: ServiceBusinessOrchestrator) {
    this.orchestrator = orchestrator;
    this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:3002';
    
    // Check if ElevenLabs is configured and enabled
    this.useElevenLabs = process.env.USE_ELEVENLABS_TTS === 'true' && isElevenLabsConfigured();
    this.fallbackVoice = process.env.VOICE_TTS_VOICE || 'Polly.Amy';
    
    console.log(`[VoiceAgent] Initialized. ElevenLabs: ${this.useElevenLabs ? 'ENABLED' : 'DISABLED (using ' + this.fallbackVoice + ')'}`);
  }

  /**
   * Handle an incoming call. Returns LaML XML that greets the caller
   * and opens a speech Gather loop.
   */
  async handleIncomingCall(params: {
    callSid: string;
    from: string;
    to: string;
  }): Promise<string> {
    const { callSid, from, to } = params;

    const db = await getDb();
    const result = await db.run(
      `INSERT OR IGNORE INTO call_logs (call_sid, customer_phone, business_phone, direction, status, transcript)
       VALUES (?, ?, ?, 'inbound', 'in-progress', '[]')`,
      [callSid, from, to]
    );

    activeCalls.set(callSid, {
      callSid,
      customerPhone: from,
      businessPhone: to,
      startedAt: new Date(),
      turns: [],
      callLogId: result.lastID || undefined,
      retryCount: 0,
    });

    const businessName = process.env.BUSINESS_NAME || 'Service Business';
    const greeting = `Hello! Thank you for calling ${businessName}. I'm your AI assistant and I can help you schedule service, get a quote, or answer questions. How can I help you today?`;

    const call = activeCalls.get(callSid)!;
    call.turns.push({ role: 'agent', text: greeting, timestamp: new Date().toISOString() });
    await this.persistTranscript(callSid, call);

    console.log(`[VoiceAgent] Incoming call ${callSid} from ${from}`);
    
    // Generate audio if using ElevenLabs
    if (this.useElevenLabs) {
      const ttsResult = await generateSpeech(greeting, callSid);
      if (ttsResult.success && ttsResult.audioUrl) {
        return this.buildGatherLaMLWithAudio(ttsResult.audioUrl, callSid);
      }
      console.log('[VoiceAgent] ElevenLabs failed, falling back to Polly');
    }
    
    return this.buildGatherLaML(greeting, callSid);
  }

  /**
   * Handle gathered speech/DTMF input from caller. Processes through the
   * orchestrator and returns LaML with the AI response + next Gather.
   */
  async handleSpeechInput(params: {
    callSid: string;
    speechResult: string;
    from: string;
    confidence?: string;
    digits?: string;
  }): Promise<string> {
    const { callSid, speechResult, from, digits } = params;

    console.log(`[VoiceAgent] handleSpeechInput ${callSid} — speech="${speechResult}" digits="${digits ?? ''}"`);

    // Recover if call lost from memory (e.g. server restart)
    if (!activeCalls.has(callSid)) {
      const db = await getDb();
      const existing = await db.get('SELECT * FROM call_logs WHERE call_sid = ?', callSid);
      activeCalls.set(callSid, {
        callSid,
        customerPhone: from,
        businessPhone: existing?.business_phone || process.env.SIGNALWIRE_PHONE_NUMBER || '',
        startedAt: new Date(),
        turns: existing?.transcript ? JSON.parse(existing.transcript) : [],
        callLogId: existing?.id,
        retryCount: 0,
      });
    }

    const call = activeCalls.get(callSid)!;

    // Caller pressed 0 — transfer to human operator
    if (digits === '0') {
      console.log(`[VoiceAgent] ${callSid} — caller pressed 0, transferring to operator`);
      return this.buildOperatorTransferLaML();
    }

    if (!speechResult?.trim()) {
      call.retryCount += 1;
      console.log(`[VoiceAgent] ${callSid} — no speech detected (retry ${call.retryCount}/2)`);

      if (call.retryCount >= 2) {
        console.log(`[VoiceAgent] ${callSid} — max retries reached, offering human operator`);
        return this.buildHumanOfferLaML(callSid);
      }

      const reprompt = "I'm sorry, I didn't catch that. Could you please say that again?";

      if (this.useElevenLabs) {
        const ttsResult = await generateSpeech(reprompt, callSid);
        if (ttsResult.success && ttsResult.audioUrl) {
          return this.buildGatherLaMLWithAudio(ttsResult.audioUrl, callSid);
        }
      }

      return this.buildGatherLaML(reprompt, callSid);
    }

    // Successful input — reset retry counter
    call.retryCount = 0;

    call.turns.push({
      role: 'caller',
      text: speechResult.trim(),
      timestamp: new Date().toISOString(),
    });

    console.log(`[VoiceAgent] ${callSid} caller said: "${speechResult}"`);

    let agentResponse: string;
    let isComplete = false;

    try {
      const result = await this.orchestrator.processMessage({
        customerPhone: call.customerPhone,
        message: speechResult.trim(),
        channel: 'phone',
        timestamp: new Date(),
        sessionId: callSid,
      });

      agentResponse = result.response;
      isComplete = !!(result.data?.isComplete);
    } catch (error) {
      console.error('[VoiceAgent] Orchestrator error:', error);
      agentResponse = "I'm sorry, I'm having trouble right now. Please hold while I try again, or call back and we'll be happy to help.";
    }

    call.turns.push({
      role: 'agent',
      text: agentResponse,
      timestamp: new Date().toISOString(),
    });

    await this.persistTranscript(callSid, call);

    if (isComplete || this.detectFarewellInResponse(agentResponse)) {
      return this.buildHangupLaML(agentResponse, callSid);
    }

    // Generate audio if using ElevenLabs
    if (this.useElevenLabs) {
      const ttsResult = await generateSpeech(agentResponse, callSid);
      if (ttsResult.success && ttsResult.audioUrl) {
        return this.buildGatherLaMLWithAudio(ttsResult.audioUrl, callSid);
      }
      console.log('[VoiceAgent] ElevenLabs failed, falling back to Polly');
    }

    return this.buildGatherLaML(agentResponse, callSid);
  }

  /**
   * Handle call status updates (call ended). Finalises the call log.
   */
  async handleCallStatus(params: {
    callSid: string;
    callStatus: string;
    callDuration?: string;
    from: string;
    to: string;
    recordingUrl?: string;
  }): Promise<void> {
    const { callSid, callStatus, callDuration, recordingUrl } = params;

    const call = activeCalls.get(callSid);
    const db = await getDb();

    const transcript = call ? JSON.stringify(call.turns) : null;
    const duration = callDuration ? parseInt(callDuration, 10) : null;

    if (call?.callLogId) {
      await db.run(
        `UPDATE call_logs
         SET status = ?, duration_seconds = ?, transcript = ?, recording_url = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [callStatus, duration, transcript, recordingUrl || null, call.callLogId]
      );
    } else {
      await db.run(
        `UPDATE call_logs
         SET status = ?, duration_seconds = ?, recording_url = ?, updated_at = CURRENT_TIMESTAMP
         WHERE call_sid = ?`,
        [callStatus, duration, recordingUrl || null, callSid]
      );
    }

    activeCalls.delete(callSid);
    console.log(`[VoiceAgent] Call ${callSid} ended. Status: ${callStatus}, Duration: ${duration}s`);
  }

  // ---- LaML builders ----

  private buildGatherLaML(message: string, callSid: string): string {
    const gatherUrl = `${this.webhookBaseUrl}/webhook/voice/gather`;
    const safe = this.escapeXml(message);
    const voice = this.fallbackVoice;

    console.log(`[VoiceAgent] buildGatherLaML ${callSid} — Polly voice`);
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" action="${gatherUrl}" method="POST" timeout="10" speechTimeout="2" language="en-US">
    <Say voice="${voice}">${safe}</Say>
  </Gather>
  <Say voice="${voice}">I didn't hear anything. Feel free to call us back anytime. Goodbye!</Say>
  <Hangup/>
</Response>`;
  }

  private buildGatherLaMLWithAudio(audioUrl: string, callSid: string): string {
    const gatherUrl = `${this.webhookBaseUrl}/webhook/voice/gather`;
    const voice = this.fallbackVoice;

    console.log(`[VoiceAgent] buildGatherLaMLWithAudio ${callSid} — ElevenLabs audio`);
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" action="${gatherUrl}" method="POST" timeout="10" speechTimeout="2" language="en-US">
    <Play>${audioUrl}</Play>
  </Gather>
  <Say voice="${voice}">I didn't hear anything. Feel free to call us back anytime. Goodbye!</Say>
  <Hangup/>
</Response>`;
  }

  private buildHumanOfferLaML(callSid: string): string {
    const gatherUrl = `${this.webhookBaseUrl}/webhook/voice/gather`;
    const voice = this.fallbackVoice;

    console.log(`[VoiceAgent] buildHumanOfferLaML ${callSid} — offering operator transfer`);
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" action="${gatherUrl}" method="POST" timeout="10" speechTimeout="2" language="en-US">
    <Say voice="${voice}">I'm having trouble hearing you. Press 0 or say "operator" to speak with a team member, or please try speaking again.</Say>
  </Gather>
  <Say voice="${voice}">We weren't able to connect. Please call us back and we'll be happy to help. Goodbye!</Say>
  <Hangup/>
</Response>`;
  }

  private buildOperatorTransferLaML(): string {
    const operatorNumber = process.env.OPERATOR_PHONE_NUMBER || process.env.BUSINESS_OWNER_PHONE || '';
    const voice = this.fallbackVoice;

    if (operatorNumber) {
      console.log(`[VoiceAgent] Transferring caller to operator at ${operatorNumber}`);
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">Please hold while I connect you to a team member.</Say>
  <Dial>${operatorNumber}</Dial>
</Response>`;
    }

    // No operator number configured — graceful fallback
    console.log('[VoiceAgent] Operator transfer requested but OPERATOR_PHONE_NUMBER not set');
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">I'm sorry, our team members are currently unavailable. Please call us back during business hours and we'll be happy to help. Goodbye!</Say>
  <Hangup/>
</Response>`;
  }

  private buildHangupLaML(message: string, callSid: string): string {
    // If using ElevenLabs, try to generate audio for the final message
    if (this.useElevenLabs) {
      // For hangup, we can't wait for async, so fire-and-forget
      generateSpeech(message, callSid).then(ttsResult => {
        if (ttsResult.success && ttsResult.audioUrl) {
          console.log(`[VoiceAgent] Generated hangup audio: ${ttsResult.audioUrl}`);
        }
      }).catch(err => {
        console.error('[VoiceAgent] Failed to generate hangup audio:', err);
      });
    }

    const safe = this.escapeXml(message);
    const voice = this.fallbackVoice;
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">${safe}</Say>
  <Hangup/>
</Response>`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private detectFarewellInResponse(response: string): boolean {
    const lower = response.toLowerCase();
    const farewellPhrases = ['goodbye', 'have a great day', 'thank you for calling', 'we will see you then', 'see you then'];
    return farewellPhrases.some(p => lower.includes(p));
  }

  private async persistTranscript(callSid: string, call: ActiveCall): Promise<void> {
    try {
      const db = await getDb();
      if (call.callLogId) {
        await db.run(
          `UPDATE call_logs SET transcript = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [JSON.stringify(call.turns), call.callLogId]
        );
      } else {
        await db.run(
          `UPDATE call_logs SET transcript = ?, updated_at = CURRENT_TIMESTAMP WHERE call_sid = ?`,
          [JSON.stringify(call.turns), callSid]
        );
      }
    } catch (err) {
      console.error('[VoiceAgent] Failed to persist transcript:', err);
    }
  }

  getActiveCallCount(): number {
    return activeCalls.size;
  }
  
  /**
   * Check if ElevenLabs is enabled
   */
  isElevenLabsEnabled(): boolean {
    return this.useElevenLabs;
  }
}
