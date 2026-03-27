# AI Service Business Multi-Agent System

LLM-powered multi-agent system for home service businesses (HVAC, plumbing, electrical).

## What's New in v2.0

🤖 **LLM-Powered Agents**
- **Intake Agent**: Uses OpenAI GPT-4o-mini for natural conversation, entity extraction, and lead qualification
- **Scheduling Agent**: AI-generated responses with natural language time parsing
- Structured output with Zod schemas for reliable data extraction

## Architecture

```
Customer SMS/Chat → Intake Agent (LLM) → Scheduling Agent (LLM) → Database + Notifications
                         ↓
              (Future: Dispatch, Follow-up, Review agents)
```

## Agents

### Intake Agent
- Handles first contact through qualification
- Extracts: name, phone, address, service type, problem description, urgency
- Uses LLM for natural conversation flow
- Hands off to Scheduling Agent when qualified

### Scheduling Agent
- Presents available appointment slots
- Parses natural language time selections ("tomorrow at 10", "the first one", etc.)
- Books appointments in SQLite database
- Handles rescheduling and cancellations

## Setup

### 1. Environment Variables

Create `.env` file:

```bash
# Required: OpenAI API Key
OPENAI_API_KEY=sk-...

# Optional: Model selection (defaults to gpt-4o-mini)
LLM_MODEL=gpt-4o-mini

# Optional: Twilio for SMS (future)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
```

### 2. Install & Build

```bash
npm install
npm run build
```

### 3. Run

```bash
# Development with hot reload
npm run dev

# Production
npm start
```

Server runs on http://localhost:3002

## API Endpoints

### Webhooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook/sms` | POST | Twilio SMS webhook |
| `/webhook/chat` | POST | Website chat webhook |
| `/webhook/sms/schedule` | POST | Handle time selection from SMS |
| `/webhook/chat/schedule` | POST | Handle time selection from chat |

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/conversations` | GET | List active conversations |
| `/api/conversations/:jobId` | GET | Get conversation history |
| `/api/leads` | GET | List leads |
| `/api/leads/:id` | PUT | Update lead status |
| `/api/appointments` | GET/POST | List/create appointments |
| `/api/appointments/:id` | PUT | Update appointment |
| `/api/technicians` | GET | List technicians |
| `/api/agents/status` | GET | Get agent statuses |
| `/api/stats` | GET | Dashboard stats |
| `/health` | GET | Health check |

## Testing

```bash
# Test LLM agents
npx tsx test-llm.ts
```

## Project Structure

```
service-business/
├── src/
│   ├── api.ts                 # Fastify server & routes
│   ├── llm.ts                 # LLM integration (OpenAI)
│   ├── database.ts            # SQLite database layer
│   └── agents/
│       ├── IntakeAgent.ts     # LLM-powered intake
│       └── SchedulingAgent.ts # LLM-powered scheduling
├── dist/                      # Compiled JavaScript
├── data/                      # SQLite database
├── package.json
└── tsconfig.json
```

## Dashboard Integration

The service business system pairs with `service-business-dashboard` (Next.js app on port 3001) for a visual interface to:
- View conversations
- Manage leads
- Schedule appointments
- Monitor agent status

## Future Agents

- **Dispatch Agent**: Assign technicians based on location/specialty
- **Follow-Up Agent**: Appointment reminders, missed appointment recovery
- **Review Request Agent**: Post-job satisfaction checks and review requests
- **Knowledge Base Agent**: FAQ answering with RAG

## License

MIT
