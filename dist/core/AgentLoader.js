"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentLoader = void 0;
const tiers_1 = require("../config/tiers");
// Dynamic agent loader - only loads agents that are in the current tier
class AgentLoader {
    agents = new Map();
    tier;
    registry;
    constructor(tier = 'starter') {
        this.tier = tier;
        this.registry = new Map(Object.entries(tiers_1.AGENT_REGISTRY));
    }
    async loadAgents() {
        const config = (0, tiers_1.getTierConfig)(this.tier);
        for (const agentId of config.agents) {
            await this.loadAgent(agentId);
        }
        console.log(`[AgentLoader] Loaded ${this.agents.size} agents for tier: ${this.tier}`);
        console.log(`[AgentLoader] Agents: ${Array.from(this.agents.keys()).join(', ')}`);
    }
    async loadAgent(agentId) {
        if (this.agents.has(agentId))
            return;
        const metadata = tiers_1.AGENT_REGISTRY[agentId];
        if (!metadata) {
            console.warn(`[AgentLoader] Unknown agent: ${agentId}`);
            return;
        }
        // Load dependencies first
        for (const depId of metadata.dependencies) {
            if (!this.agents.has(depId)) {
                await this.loadAgent(depId);
            }
        }
        // Dynamically import the agent
        try {
            const fileName = this.getAgentFileName(agentId);
            const className = this.getAgentClassName(agentId);
            const module = await import(`../src/agents/${fileName}.js`);
            const AgentClass = module[className];
            if (AgentClass) {
                this.agents.set(agentId, new AgentClass());
                console.log(`[AgentLoader] Loaded agent: ${agentId}`);
            }
            else {
                console.error(`[AgentLoader] Agent class ${className} not found in module: ${fileName}`);
            }
        }
        catch (error) {
            console.error(`[AgentLoader] Failed to load agent ${agentId}:`, error);
        }
    }
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    hasAgent(agentId) {
        return this.agents.has(agentId);
    }
    getLoadedAgents() {
        return Array.from(this.agents.keys());
    }
    getAgentFileName(agentId) {
        // Map agent IDs to file names
        const fileMap = {
            intake: 'IntakeAgent',
            scheduling: 'SchedulingAgent',
            dispatch: 'DispatchAgent',
            followup: 'FollowUpAgent',
            reviews: 'ReviewRequestAgent',
            knowledge: 'KnowledgeBaseAgent',
            leadgen: 'LeadGenerationAgent',
        };
        return fileMap[agentId] || agentId;
    }
    getAgentClassName(agentId) {
        // Map agent IDs to class names
        const classMap = {
            intake: 'IntakeAgent',
            scheduling: 'SchedulingAgent',
            dispatch: 'DispatchAgent',
            followup: 'FollowUpAgent',
            reviews: 'ReviewRequestAgent',
            knowledge: 'KnowledgeBaseAgent',
            leadgen: 'LeadGenerationAgent',
        };
        return classMap[agentId] || agentId;
    }
    getLoadedAgentIds() {
        return Array.from(this.agents.keys());
    }
}
exports.AgentLoader = AgentLoader;
//# sourceMappingURL=AgentLoader.js.map