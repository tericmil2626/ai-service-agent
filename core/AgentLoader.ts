import { getDb } from '../database';
import { AgentConstructor } from '../types/agents';
import { getTierConfig, isAgentAvailable, AGENT_REGISTRY, AgentMetadata } from '../config/tiers';

// Dynamic agent loader - only loads agents that are in the current tier
export class AgentLoader {
  private agents: Map<string, any> = new Map();
  private tier: string;
  private registry: Map<string, AgentMetadata>;

  constructor(tier: string = 'starter') {
    this.tier = tier;
    this.registry = new Map(Object.entries(AGENT_REGISTRY));
  }

  async loadAgents(): Promise<void> {
    const config = getTierConfig(this.tier);
    
    for (const agentId of config.agents) {
      await this.loadAgent(agentId);
    }

    console.log(`[AgentLoader] Loaded ${this.agents.size} agents for tier: ${this.tier}`);
    console.log(`[AgentLoader] Agents: ${Array.from(this.agents.keys()).join(', ')}`);
  }

  private async loadAgent(agentId: string): Promise<void> {
    if (this.agents.has(agentId)) return;

    const metadata = AGENT_REGISTRY[agentId];
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
      } else {
        console.error(`[AgentLoader] Agent class ${className} not found in module: ${fileName}`);
      }
    } catch (error) {
      console.error(`[AgentLoader] Failed to load agent ${agentId}:`, error);
    }
  }

  getAgent(agentId: string): any | undefined {
    return this.agents.get(agentId);
  }

  hasAgent(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  getLoadedAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  private getAgentFileName(agentId: string): string {
    // Map agent IDs to file names
    const fileMap: Record<string, string> = {
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

  private getAgentClassName(agentId: string): string {
    // Map agent IDs to class names
    const classMap: Record<string, string> = {
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

  getLoadedAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }
}
