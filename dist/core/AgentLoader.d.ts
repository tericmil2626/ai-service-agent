export declare class AgentLoader {
    private agents;
    private tier;
    private registry;
    constructor(tier?: string);
    loadAgents(): Promise<void>;
    private loadAgent;
    getAgent(agentId: string): any | undefined;
    hasAgent(agentId: string): boolean;
    getLoadedAgents(): string[];
    private getAgentFileName;
    private getAgentClassName;
    getLoadedAgentIds(): string[];
}
//# sourceMappingURL=AgentLoader.d.ts.map