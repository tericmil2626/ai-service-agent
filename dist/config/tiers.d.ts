export interface TierConfig {
    name: string;
    agents: string[];
    limits: {
        maxConversations: number;
        maxTechnicians: number;
        maxAppointmentsPerDay: number;
    };
    features: {
        sms: boolean;
        email: boolean;
        phone: boolean;
        webChat: boolean;
        reviews: boolean;
        knowledgeBase: boolean;
        leadGeneration: boolean;
        api: boolean;
        customBranding: boolean;
        analytics: boolean;
    };
    pricing?: {
        monthly: number;
        perConversation?: number;
    };
}
export declare const TIERS: Record<string, TierConfig>;
export interface AgentMetadata {
    id: string;
    name: string;
    description: string;
    requiredTier: string[];
    dependencies: string[];
}
export declare const AGENT_REGISTRY: Record<string, AgentMetadata>;
export declare function getTierConfig(tier: string): TierConfig;
export declare function isAgentAvailable(agentId: string, tier: string): boolean;
export declare function isFeatureAvailable(feature: keyof TierConfig['features'], tier: string): boolean;
export declare function getAvailableAgents(tier: string): string[];
export declare function checkLimit(limitType: keyof TierConfig['limits'], current: number, tier: string): boolean;
//# sourceMappingURL=tiers.d.ts.map