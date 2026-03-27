import { OrchestratorConfig, MessageContext } from './types/agents';
interface OrchestratorResponse {
    response: string;
    handoffTo?: string;
    data?: any;
    sendViaSMS?: boolean;
}
export declare class ServiceBusinessOrchestrator {
    private config;
    private agentLoader;
    private stateManager;
    private smsProvider;
    constructor(config: OrchestratorConfig);
    /**
     * Send an SMS response to a customer
     */
    sendSMSResponse(to: string, message: string): Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    initialize(): Promise<void>;
    processMessage(context: MessageContext): Promise<OrchestratorResponse>;
    processIncomingMessage(data: {
        customer_phone: string;
        message: string;
        channel: 'sms' | 'email' | 'web' | 'phone';
        timestamp: string;
    }): Promise<{
        response: string;
        handoffTo?: string;
    }>;
    private _processMessageInternal;
    private handleIntake;
    private handleScheduling;
    private handleDispatch;
    private handleFollowUp;
    private updateStateFromResponse;
    processTimeBasedActions(): Promise<void>;
    private processFollowUps;
    private processReviewRequests;
    getStatus(): {
        tier: string;
        agents: string[];
        features: string[];
    };
}
export default ServiceBusinessOrchestrator;
//# sourceMappingURL=orchestrator-v2.d.ts.map