// Standardized Service Agent Interface
// All agents must implement this interface for the orchestrator to work correctly

export interface ServiceAgent {
  // Unique identifier for the agent
  id: string;
  
  // Human-readable name
  name: string;
  
  // Initialize the agent with context/data from previous agents
  initialize?(data: any): Promise<void>;
  
  // Main entry point - handle an incoming message
  // Returns response and metadata about completion/handoff
  handleMessage(message: string, context: MessageContext): Promise<AgentResponse>;
  
  // Get current state for persistence
  getState?(): Record<string, any>;
  
  // Restore state from persistence
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

// Base class that all agents should extend
export abstract class BaseServiceAgent implements ServiceAgent {
  abstract id: string;
  abstract name: string;
  
  async initialize?(data: any): Promise<void> {
    // Override in subclass if needed
  }
  
  abstract handleMessage(message: string, context: MessageContext): Promise<AgentResponse>;
  
  getState?(): Record<string, any> {
    return {};
  }
  
  setState?(state: Record<string, any>): void {
    // Override in subclass if needed
  }
}
