"use strict";
// Standardized Service Agent Interface
// All agents must implement this interface for the orchestrator to work correctly
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseServiceAgent = void 0;
// Base class that all agents should extend
class BaseServiceAgent {
    async initialize(data) {
        // Override in subclass if needed
    }
    getState() {
        return {};
    }
    setState(state) {
        // Override in subclass if needed
    }
}
exports.BaseServiceAgent = BaseServiceAgent;
//# sourceMappingURL=ServiceAgent.js.map