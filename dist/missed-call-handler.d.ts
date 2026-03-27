interface MissedCallData {
    from: string;
    to: string;
    callSid: string;
    callStatus: 'no-answer' | 'busy' | 'failed' | 'canceled';
    direction?: 'inbound' | 'outbound';
}
export declare class MissedCallHandler {
    private smsProvider;
    private businessName;
    private textBackMessage;
    constructor(businessName?: string, customMessage?: string);
    /**
     * Process a call status webhook from Twilio/SignalWire
     * Triggers text-back if call was missed
     */
    handleCallStatus(data: MissedCallData): Promise<{
        handled: boolean;
        textBackSent: boolean;
        message?: string;
        error?: string;
    }>;
    /**
     * Send the text-back SMS to a missed caller
     */
    private sendTextBack;
    /**
     * Handle a reply from a customer who received a text-back
     * This creates a lead/job and starts the intake conversation
     */
    handleTextBackReply(customerPhone: string, message: string, orchestrator: any): Promise<{
        success: boolean;
        response?: string;
        error?: string;
    }>;
    /**
     * Get stats on missed calls and conversions
     */
    getStats(days?: number): Promise<{
        totalMissedCalls: number;
        textBacksSent: number;
        conversions: number;
        conversionRate: number;
    }>;
}
export default MissedCallHandler;
//# sourceMappingURL=missed-call-handler.d.ts.map