import { ServiceBusinessOrchestrator } from './orchestrator-v2';
export declare class VoiceAgent {
    private orchestrator;
    private webhookBaseUrl;
    private useElevenLabs;
    private fallbackVoice;
    constructor(orchestrator: ServiceBusinessOrchestrator);
    /**
     * Handle an incoming call. Returns LaML XML that greets the caller
     * and opens a speech Gather loop.
     */
    handleIncomingCall(params: {
        callSid: string;
        from: string;
        to: string;
    }): Promise<string>;
    /**
     * Handle gathered speech/DTMF input from caller. Processes through the
     * orchestrator and returns LaML with the AI response + next Gather.
     */
    handleSpeechInput(params: {
        callSid: string;
        speechResult: string;
        from: string;
        confidence?: string;
        digits?: string;
    }): Promise<string>;
    /**
     * Handle call status updates (call ended). Finalises the call log.
     */
    handleCallStatus(params: {
        callSid: string;
        callStatus: string;
        callDuration?: string;
        from: string;
        to: string;
        recordingUrl?: string;
    }): Promise<void>;
    private buildGatherLaML;
    private buildGatherLaMLWithAudio;
    private buildHumanOfferLaML;
    private buildOperatorTransferLaML;
    private buildHangupLaML;
    private escapeXml;
    private detectFarewellInResponse;
    private persistTranscript;
    getActiveCallCount(): number;
    /**
     * Check if ElevenLabs is enabled
     */
    isElevenLabsEnabled(): boolean;
}
//# sourceMappingURL=voice-agent.d.ts.map