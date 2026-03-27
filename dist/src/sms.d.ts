export interface SMSProvider {
    sendSMS(to: string, message: string): Promise<boolean>;
    sendTwiMLResponse(message: string): string;
}
export declare function createSMSProvider(): SMSProvider;
export declare function getSMSProvider(): SMSProvider;
//# sourceMappingURL=sms.d.ts.map