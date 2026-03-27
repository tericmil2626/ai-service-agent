export interface ServiceAgent {
    id: string;
    name: string;
    initialize?(data: any): Promise<void>;
    handleMessage(message: string, context: MessageContext): Promise<AgentResponse>;
    getState?(): Record<string, any>;
    setState?(state: Record<string, any>): void;
}
export interface MessageContext {
    customerPhone: string;
    channel: 'sms' | 'email' | 'web' | 'phone';
    timestamp: Date;
    sessionId?: string;
}
export interface AgentResponse {
    response: string;
    isComplete?: boolean;
    handoffTo?: string;
    data?: any;
}
export declare abstract class BaseServiceAgent implements ServiceAgent {
    abstract id: string;
    abstract name: string;
    initialize?(data: any): Promise<void>;
    abstract handleMessage(message: string, context: MessageContext): Promise<AgentResponse>;
    getState?(): Record<string, any>;
    setState?(state: Record<string, any>): void;
}
//# sourceMappingURL=ServiceAgent.d.ts.map