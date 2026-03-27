// Type definitions for the service business agent system

export interface AgentConstructor {
  new (...args: any[]): any;
}

export interface AgentMetadata {
  id: string;
  name: string;
  description: string;
  className?: string;
  fileName?: string;
  requiredTier: string[];
  dependencies: string[];
}

export interface AgentRegistry {
  get(agentId: string): AgentMetadata | undefined;
  has(agentId: string): boolean;
  getAll(): AgentMetadata[];
  getForTier(tier: string): AgentMetadata[];
}

export interface ConversationState {
  customerId: number;
  jobId?: number;
  currentAgent?: string;
  status: 'new' | 'intake' | 'scheduling' | 'dispatch' | 'followup' | 'completed';
  context: Record<string, any>;
  lastMessageAt: Date;
}

export interface OrchestratorConfig {
  tier: string;
  businessId: string;
  businessName: string;
  businessConfig: {
    hours: {
      start: string;
      end: string;
      days: number[]; // 0 = Sunday, 6 = Saturday
    };
    timezone: string;
    services: string[];
  };
  features: {
    autoDispatch: boolean;
    reviewRequests: boolean;
    followUpReminders: boolean;
  };
}

export interface MessageContext {
  customerPhone: string;
  message: string;
  channel: 'sms' | 'email' | 'web' | 'phone';
  timestamp: Date;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface AgentResponse {
  response: string;
  handoffTo?: string;
  data?: any;
  isComplete?: boolean;
  actions?: AgentAction[];
}

export interface AgentAction {
  type: 'schedule' | 'dispatch' | 'notify' | 'update_status' | 'send_review';
  payload: any;
}

// Agent interface that all agents must implement
export interface ServiceAgent {
  id: string;
  name: string;
  
  // Initialize the agent with context
  initialize?(context: Record<string, any>): Promise<void>;
  
  // Handle an incoming message
  handleMessage(message: string, context: MessageContext): Promise<AgentResponse>;
  
  // Get the current state (for persistence)
  getState?(): Record<string, any>;
  
  // Restore state (for rehydration)
  setState?(state: Record<string, any>): void;
}
