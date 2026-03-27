# Service Business Agent Flow

## Customer Journey: Missed Call → Appointment Booked

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CUSTOMER CALLS +1 (405) 369-4926                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  📞 VOICE WEBHOOK                                                           │
│  /webhook/voice                                                             │
│                                                                             │
│  • Forwards call to BUSINESS_FORWARD_NUMBER (+1 310 907 0225)              │
│  • If no answer → triggers missed call handler                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  📱 MISSED CALL HANDLER (MissedCallHandler)                                 │
│                                                                             │
│  • Records missed call in database                                         │
│  • Sends text-back SMS: "Sorry we missed your call! What can we help       │
│    you with today?"                                                        │
│  • Waits for customer reply                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  📩 SMS WEBHOOK                                                             │
│  /webhook/sms                                                               │
│                                                                             │
│  • Checks if reply is to a recent text-back                                │
│  • If YES → clears old state, starts fresh intake                          │
│  • Routes to Orchestrator                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  🎯 ORCHESTRATOR (ServiceBusinessOrchestrator)                              │
│                                                                             │
│  Routes based on conversation state:                                        │
│  • 'new'/'intake' → IntakeAgent                                            │
│  • 'scheduling' → SchedulingAgent                                          │
│  • 'dispatch' → DispatchAgent                                              │
│  • 'followup' → FollowUpAgent                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
┌───────────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ 1️⃣ INTAKE AGENT       │  │ 2️⃣ SCHEDULING    │  │ 3️⃣ DISPATCH      │
│ (IntakeAgent)         │  │    AGENT         │  │    AGENT         │
│                       │  │ (SchedulingAgent)│  │ (DispatchAgent)  │
│ Collects:             │  │                  │  │                  │
│ • Name                │  │ • Gets available │  │ • Assigns tech   │
│ • Phone               │  │   slots from DB  │  │ • Sends dispatch │
│ • Address             │  │ • Presents options│  │   notification   │
│ • Service type        │  │ • Parses time    │  │ • Tracks arrival │
│ • Problem description │  │   selection      │  │                  │
│ • Urgency             │  │ • Books appointment│ │                  │
│                       │  │ • Syncs to Google│  │                  │
│ When complete:        │  │   Calendar       │  │                  │
│ → Hands off to        │  │                  │  │                  │
│   SchedulingAgent     │  │ When complete:   │  │                  │
│                       │  │ → Hands off to   │  │                  │
│                       │  │   DispatchAgent  │  │                  │
└───────────────────────┘  └──────────────────┘  └──────────────────┘
           │                          │                    │
           │                          │                    │
           ▼                          ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  🗄️ DATABASE (SQLite)                                                       │
│                                                                             │
│  Tables:                                                                    │
│  • customers (name, phone, address)                                        │
│  • jobs (service_type, description, status, urgency)                       │
│  • appointments (date, time, status, technician_id)                        │
│  • conversations (message history)                                         │
│  • conversation_states (current agent, status, context)                    │
│  • missed_calls (call tracking, text-back status)                          │
└─────────────────────────────────────────────────────────────────────────────┘
           │                          │                    │
           │                          │                    │
           ▼                          ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  📅 GOOGLE CALENDAR                                                         │
│                                                                             │
│  • Appointment synced when booked                                          │
│  • Event includes: customer name, service type, address, phone             │
└─────────────────────────────────────────────────────────────────────────────┘

## State Transitions

```
┌─────────┐    collect info    ┌─────────────┐    book appt    ┌──────────┐
│  NEW    │ ─────────────────► │  SCHEDULING │ ───────────────► │ DISPATCH │
│ (intake)│   handoff trigger  │             │  handoff trigger │          │
└─────────┘                    └─────────────┘                  └──────────┘
     │                              │                              │
     │                              │                              │
     ▼                              ▼                              ▼
  IntakeAgent                 SchedulingAgent                DispatchAgent
  • extractEntities()         • getAvailableSlots()          • assignTechnician()
  • generateResponse()        • parseTimeSelection()         • notifyCustomer()
  • persistToDatabase()       • bookAppointment()            • trackStatus()
```

## Example Conversation Flow

```
Customer: [Calls, no answer]
System:   "Sorry we missed your call! This is Your Service Business. 
           What can we help you with today?" [SMS]

Customer: "Hi this is Todd, I need HVAC help at 123 Main St, 
           my AC is blowing hot air"
           ↓
           [IntakeAgent] Extracts: name=Todd, service=hvac, 
           address=123 Main St, problem=AC blowing hot air
           ↓
System:   "Thanks Todd! Can you confirm your phone number?"

Customer: "This is my number"
           ↓
           [IntakeAgent] Has all required info → handoff to SchedulingAgent
           State changes: 'intake' → 'scheduling'
           ↓
System:   "I have availability Thursday at 10:00 AM, 12:00 PM, or 2:00 PM. 
           Which works best?"

Customer: "Friday afternoon please"
           ↓
           [SchedulingAgent] Checks Friday slots
           Friday not available → offers Thursday afternoon instead
           ↓
System:   "I don't have availability on Friday. Would Thursday at 2:00 PM 
           work instead?"

Customer: "Yes that works"
           ↓
           [SchedulingAgent] Books appointment
           Creates calendar event
           State changes: 'scheduling' → 'dispatch'
           ↓
System:   "Perfect! I've scheduled your HVAC appointment for Thursday, 
           March 27 at 2:00 PM at 123 Main St. A technician will arrive 
           within the scheduled window. We'll send a reminder before 
           the appointment."
           ↓
           [DispatchAgent] Assigned, waits for day-of appointment
```

## Key Handoff Triggers

| From | To | Trigger |
|------|-----|---------|
| IntakeAgent | SchedulingAgent | `hasAllRequired` = true (name, phone, address, service_type, problem, urgency) |
| SchedulingAgent | DispatchAgent | Appointment booked successfully |
| DispatchAgent | FollowUpAgent | Job marked completed |

## Error Handling

```
If LLM schema validation fails:
  → Return "I'm sorry, I'm having trouble processing your message. 
     Please try again or call our office."

If slot already booked (UNIQUE constraint):
  → Return "I'm sorry, that time slot is no longer available. 
     Let me check for other options."

If scheduling agent not available (tier restriction):
  → Return "Scheduling is available in our Growth plan. 
     Please call us to upgrade or schedule directly."
```
