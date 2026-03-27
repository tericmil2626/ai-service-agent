import { ConversationState } from '../types/agents';
export declare class ConversationStateManager {
    getState(customerPhone: string): Promise<ConversationState | null>;
    saveState(customerPhone: string, state: Partial<ConversationState>): Promise<void>;
    clearState(customerPhone: string): Promise<void>;
    private mapJobStatus;
}
//# sourceMappingURL=StateManager.d.ts.map