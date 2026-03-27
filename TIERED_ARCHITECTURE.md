# Service Business System v3.0 - Tiered Architecture

## Overview
Refactored the service business multi-agent system to support tiered pricing models. The system is now fully modular, allowing customers to subscribe to different service levels (Starter, Growth, Professional, Enterprise).

## Architecture Changes

### 1. Tier Configuration (`config/tiers.ts`)
- **4 predefined tiers**: Starter, Growth, Professional, Enterprise
- **Per-tier limits**: Max conversations, technicians, appointments
- **Feature flags**: SMS, email, phone, web chat, reviews, knowledge base, API access
- **Agent availability**: Each tier specifies which agents are active

### 2. Dynamic Agent Loading (`core/AgentLoader.ts`)
- Only loads agents specified in the current tier
- Dependency resolution (e.g., dispatch requires scheduling)
- Lazy loading with dynamic imports
- Graceful degradation if agent unavailable

### 3. State Management (`core/StateManager.ts`)
- Persists conversation state to database
- Rehydrates agent state on each request
- Enables stateless HTTP API while maintaining conversation context
- New `conversation_states` table for persistence

### 4. Refactored Orchestrator (`orchestrator-v2.ts`)
- Config-driven routing based on tier
- Checks tier availability before routing to agents
- Returns upgrade prompts for tier-restricted features
- Clean separation of concerns per agent

## Tier Breakdown

### Starter ($99/mo)
**Agents:** Intake, Scheduling
**Limits:** 100 conversations, 2 technicians, 10 appointments/day
**Features:** SMS, Web Chat
**Best for:** Solo operators, just starting out

### Growth ($199/mo)
**Agents:** Intake, Scheduling, Dispatch, Follow-Up
**Limits:** 500 conversations, 10 technicians, 50 appointments/day
**Features:** +Email, Phone, Reviews, Analytics
**Best for:** Growing businesses with multiple techs

### Professional ($399/mo)
**Agents:** +Reviews, Knowledge Base
**Limits:** 2000 conversations, 25 technicians, 200 appointments/day
**Features:** +API, Custom Branding
**Best for:** Established businesses wanting automation

### Enterprise ($799/mo)
**Agents:** +Lead Generation (all 7 agents)
**Limits:** Unlimited
**Features:** Everything + priority support
**Best for:** Multi-location, high-volume operations

## Database Schema Updates

### New Tables
- `conversation_states`: Persist agent state across requests
- `business_config`: Per-business tier and configuration

### Updated Tables
- `jobs`: Added status tracking for orchestrator routing
- `appointments`: Linked to tier limits

## API Changes

### New Endpoints
- `GET /api/tier`: Get current tier configuration
- `GET /api/agents/status`: List active agents and features

### Updated Endpoints
- `POST /webhook/chat`: Uses new orchestrator with state management
- `POST /webhook/sms`: Tier-aware response handling

## Environment Configuration

```bash
# Tier selection
SERVICE_TIER=starter|growth|professional|enterprise

# Business configuration
BUSINESS_ID=your-business-id
BUSINESS_NAME="Your Business Name"
TIMEZONE=America/Chicago

# Feature flags (auto-set based on tier)
AUTO_DISPATCH=true|false
REVIEW_REQUESTS=true|false
FOLLOW_UP_REMINDERS=true|false
```

## Usage Examples

### Run Different Tiers
```bash
# Development
npm run dev          # Starter tier
npm run dev:pro      # Professional tier

# Production
SERVICE_TIER=growth npm start
```

### Check Tier Status
```bash
curl http://localhost:3002/api/tier
```

Response:
```json
{
  "tier": "growth",
  "agents": ["intake", "scheduling", "dispatch", "followup"],
  "features": ["sms", "email", "phone", "webChat", "reviews", "analytics"]
}
```

### Test Conversation Flow
```bash
curl -X POST http://localhost:3002/webhook/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customer_phone": "+15551234567",
    "message": "Hi, I need plumbing help",
    "session_id": "test-001"
  }'
```

## Benefits for Your Business

1. **Easy Upsells**: Customers can upgrade tiers instantly
2. **Clear Value Props**: Each tier has distinct features
3. **Reduced Churn**: Starter customers can grow into higher tiers
4. **Custom Enterprise Deals**: Unlimited tier for negotiations
5. **Add-on Sales**: Individual agents or features à la carte

## Next Steps

1. **Test the full conversation flow** end-to-end
2. **Build tier upgrade UI** in the dashboard
3. **Add payment integration** (Stripe) for tier management
4. **Create tier comparison page** for marketing
5. **Add usage tracking** for limit enforcement

## Files Created/Modified

### New Files
- `config/tiers.ts` - Tier definitions
- `core/AgentLoader.ts` - Dynamic agent loading
- `core/StateManager.ts` - Conversation state persistence
- `orchestrator-v2.ts` - Refactored orchestrator
- `api-v2.ts` - Updated API server
- `types/agents.ts` - TypeScript definitions

### Modified Files
- `schema.sql` - Added conversation_states and business_config tables
- `package.json` - Updated scripts and version

## Migration from v2.0

The old orchestrator and API are preserved for backward compatibility:
- `orchestrator.ts` → `orchestrator-v2.ts`
- `api.ts` → `api-v2.ts`

To migrate:
1. Run database migration: `npm run db:init`
2. Update environment variables
3. Switch to new API: `npm start` (uses api-v2.ts)
4. Test thoroughly before deprecating old version
