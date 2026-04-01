export interface IntakeData {
    customer_id?: number;
    job_id?: number;
    name?: string;
    phone?: string;
    address?: string;
    service_type?: string;
    problem_description?: string;
    urgency?: 'high' | 'medium' | 'low';
    preferred_day?: string;
    preferred_time?: string;
    status: 'greeting' | 'collecting_problem' | 'collecting_name' | 'collecting_address' | 'collecting_timing' | 'qualified' | 'disqualified';
}
export interface IntakeResult {
    response: string;
    isComplete: boolean;
    handoffTo?: string;
    data?: Record<string, any>;
}
export declare class IntakeAgent {
    private data;
    private conversationHistory;
    private messageCount;
    private channel;
    constructor(channel?: string);
    private getConversationalResponse;
    private detectServiceType;
    handleMessage(message: string, context: any): Promise<IntakeResult>;
    private parseTiming;
    private hasAllRequired;
    private persistToDatabase;
    private saveToDatabase;
    private finalizeIntake;
    private getStructuredOutput;
}
//# sourceMappingURL=IntakeAgent.d.ts.map