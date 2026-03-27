export declare function sendSMS(to: string, message: string): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}>;
export declare function makeCall(to: string, twimlUrl: string): Promise<{
    success: boolean;
    callId?: string;
    error?: string;
}>;
//# sourceMappingURL=signalwire-fetch.d.ts.map