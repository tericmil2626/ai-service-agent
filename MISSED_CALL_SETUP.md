# Missed Call Text-Back Setup

The missed call text-back feature automatically detects when a customer calls and no one answers, then immediately sends an SMS offering to schedule service via text.

## How It Works

```
Customer calls your business number
        ↓
   No answer (20 sec timeout)
        ↓
System detects missed call
        ↓
SMS sent immediately:
"Sorry we missed your call! This is [Business]. 
Need service? Just reply with what you need help 
with and your address. We'll get you scheduled!"
        ↓
Customer replies → Intake Agent → Schedule
```

## Setup

### 1. Environment Variables

Add to your `.env` file:

```bash
# Your business name (used in text-back message)
BUSINESS_NAME="ABC Plumbing"

# Phone number to forward calls to (optional)
# If set, calls will ring this number first
# If not set, calls go straight to text-back
BUSINESS_FORWARD_NUMBER=+15551234567

# Webhook base URL (for TwiML callbacks)
WEBHOOK_BASE_URL=https://your-domain.com

# SMS Provider (Twilio OR SignalWire)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+15551234567

# OR
SIGNALWIRE_PROJECT_ID=your_project
SIGNALWIRE_TOKEN=your_token
SIGNALWIRE_PHONE_NUMBER=+15551234567
SIGNALWIRE_SPACE=your-space.signalwire.com
```

### 2. Configure Phone Number Webhook

#### Twilio Setup
1. Go to [Twilio Console](https://console.twilio.com)
2. Select your phone number
3. Under **Voice & Fax**:
   - **A call comes in**: Webhook
   - **URL**: `https://your-domain.com/webhook/voice`
   - **HTTP Method**: POST
4. Under **Call Status Changes**:
   - **Status callback URL**: `https://your-domain.com/webhook/call-status`
   - **HTTP Method**: POST

#### SignalWire Setup
1. Go to SignalWire Dashboard
2. Edit your phone number
3. Set **Inbound Call Handler** to:
   - **Webhook**: `https://your-domain.com/webhook/voice`
   - **Method**: POST
4. Enable **Call Status Callbacks** to:
   - **Webhook**: `https://your-domain.com/webhook/call-status`

### 3. Test the Flow

1. Call your business number from a different phone
2. Let it ring 20 seconds (or hang up)
3. You should receive an SMS within 5 seconds
4. Reply to the SMS with a service request
5. The AI should engage and schedule an appointment

## API Endpoints

### GET /api/missed-calls
List recent missed calls with conversion tracking.

Query params:
- `days` - Number of days to look back (default: 7)
- `limit` - Max results (default: 50)

Response:
```json
{
  "missed_calls": [
    {
      "id": 1,
      "customer_phone": "+15551234567",
      "call_status": "no-answer",
      "text_back_sent": 1,
      "text_back_sent_at": "2025-03-24T20:15:00Z",
      "converted_to_lead": 1,
      "customer_name": "John Smith",
      "service_type": "plumbing",
      "job_status": "scheduled"
    }
  ]
}
```

### GET /api/missed-calls/stats
Get conversion statistics.

Query params:
- `days` - Number of days to look back (default: 30)

Response:
```json
{
  "totalMissedCalls": 45,
  "textBacksSent": 45,
  "conversions": 12,
  "conversionRate": 27
}
```

## Customizing the Message

Edit `missed-call-handler.ts` to customize the text-back message:

```typescript
const DEFAULT_TEXT_BACK_MESSAGE = (businessName: string) => 
  `Your custom message here for ${businessName}`;
```

Or pass a custom message when initializing:

```typescript
const handler = new MissedCallHandler(
  "ABC Plumbing",
  "Sorry we missed you! Reply with your address and what needs fixing."
);
```

## How It Integrates

The missed call handler works seamlessly with the existing agent system:

1. **Missed call detected** → SMS sent via SignalWire/Twilio
2. **Customer replies** → SMS webhook receives the message
3. **Text-back reply detected** → Routed to Intake Agent
4. **Intake Agent** → Collects name, address, service type
5. **Scheduling Agent** → Books appointment
6. **Conversion tracked** → Missed call record updated with job_id

## Spam Prevention

The system prevents duplicate text-backs:
- Only 1 text-back per phone number per 5-minute window
- Recent missed calls checked before sending
- Prevents annoying customers who call multiple times

## Troubleshooting

### Text-back not sending
- Check SMS provider credentials in `.env`
- Verify webhook URLs are publicly accessible (use ngrok for local testing)
- Check server logs for `[MissedCall]` entries

### Call not detected as missed
- Verify call status webhook is configured
- Check that `Direction` is `inbound` in webhook payload
- Ensure timeout is set correctly (20 seconds recommended)

### Customer reply not working
- Check SMS webhook is configured at `/webhook/sms`
- Verify the reply is within 1 hour of the text-back
- Check orchestrator is processing the message

## Business Impact

Typical results for home service businesses:
- **30-40%** of calls are missed during busy periods
- **20-30%** of text-backs convert to booked appointments
- Average job value: **$300-800**
- ROI: **10-20x** the monthly service cost

Example: A plumber missing 10 calls/week
- 10 missed calls × 25% conversion = 2.5 jobs/week
- 2.5 jobs × $500 average = $1,250/week recovered
- $5,000/month in recovered revenue
