"use strict";
// Tier configuration for service business agents
// Each tier defines which agents are available and their limits
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_REGISTRY = exports.TIERS = void 0;
exports.getTierConfig = getTierConfig;
exports.isAgentAvailable = isAgentAvailable;
exports.isFeatureAvailable = isFeatureAvailable;
exports.getAvailableAgents = getAvailableAgents;
exports.checkLimit = checkLimit;
exports.TIERS = {
    starter: {
        name: 'Starter',
        agents: ['intake', 'scheduling'],
        limits: {
            maxConversations: 100,
            maxTechnicians: 2,
            maxAppointmentsPerDay: 10,
        },
        features: {
            sms: true,
            email: false,
            phone: false,
            webChat: true,
            reviews: false,
            knowledgeBase: false,
            leadGeneration: false,
            api: false,
            customBranding: false,
            analytics: false,
        },
        pricing: {
            monthly: 99,
        },
    },
    growth: {
        name: 'Growth',
        agents: ['intake', 'scheduling', 'dispatch', 'followup'],
        limits: {
            maxConversations: 500,
            maxTechnicians: 10,
            maxAppointmentsPerDay: 50,
        },
        features: {
            sms: true,
            email: true,
            phone: true,
            webChat: true,
            reviews: true,
            knowledgeBase: false,
            leadGeneration: false,
            api: false,
            customBranding: false,
            analytics: true,
        },
        pricing: {
            monthly: 199,
        },
    },
    professional: {
        name: 'Professional',
        agents: ['intake', 'scheduling', 'dispatch', 'followup', 'reviews', 'knowledge'],
        limits: {
            maxConversations: 2000,
            maxTechnicians: 25,
            maxAppointmentsPerDay: 200,
        },
        features: {
            sms: true,
            email: true,
            phone: true,
            webChat: true,
            reviews: true,
            knowledgeBase: true,
            leadGeneration: false,
            api: true,
            customBranding: true,
            analytics: true,
        },
        pricing: {
            monthly: 399,
        },
    },
    enterprise: {
        name: 'Enterprise',
        agents: ['intake', 'scheduling', 'dispatch', 'followup', 'reviews', 'knowledge', 'leadgen'],
        limits: {
            maxConversations: -1, // unlimited
            maxTechnicians: -1,
            maxAppointmentsPerDay: -1,
        },
        features: {
            sms: true,
            email: true,
            phone: true,
            webChat: true,
            reviews: true,
            knowledgeBase: true,
            leadGeneration: true,
            api: true,
            customBranding: true,
            analytics: true,
        },
        pricing: {
            monthly: 799,
        },
    },
};
exports.AGENT_REGISTRY = {
    intake: {
        id: 'intake',
        name: 'Intake Agent',
        description: 'Handles first contact and collects customer information',
        requiredTier: ['starter', 'growth', 'professional', 'enterprise'],
        dependencies: [],
    },
    scheduling: {
        id: 'scheduling',
        name: 'Scheduling Agent',
        description: 'Books appointments and manages calendar',
        requiredTier: ['starter', 'growth', 'professional', 'enterprise'],
        dependencies: ['intake'],
    },
    dispatch: {
        id: 'dispatch',
        name: 'Dispatch Agent',
        description: 'Assigns technicians to jobs',
        requiredTier: ['growth', 'professional', 'enterprise'],
        dependencies: ['scheduling'],
    },
    followup: {
        id: 'followup',
        name: 'Follow-Up Agent',
        description: 'Sends reminders and handles missed appointments',
        requiredTier: ['growth', 'professional', 'enterprise'],
        dependencies: ['scheduling'],
    },
    reviews: {
        id: 'reviews',
        name: 'Review Request Agent',
        description: 'Collects customer feedback and review requests',
        requiredTier: ['growth', 'professional', 'enterprise'],
        dependencies: ['dispatch'],
    },
    knowledge: {
        id: 'knowledge',
        name: 'Knowledge Base Agent',
        description: 'Answers FAQs using company knowledge base',
        requiredTier: ['professional', 'enterprise'],
        dependencies: [],
    },
    leadgen: {
        id: 'leadgen',
        name: 'Lead Generation Agent',
        description: 'Proactively reaches out to potential customers',
        requiredTier: ['enterprise'],
        dependencies: ['intake'],
    },
};
// Helper functions
function getTierConfig(tier) {
    return exports.TIERS[tier] || exports.TIERS.starter;
}
function isAgentAvailable(agentId, tier) {
    const config = getTierConfig(tier);
    return config.agents.includes(agentId);
}
function isFeatureAvailable(feature, tier) {
    const config = getTierConfig(tier);
    return config.features[feature];
}
function getAvailableAgents(tier) {
    return getTierConfig(tier).agents;
}
function checkLimit(limitType, current, tier) {
    const config = getTierConfig(tier);
    const limit = config.limits[limitType];
    return limit === -1 || current < limit;
}
//# sourceMappingURL=tiers.js.map