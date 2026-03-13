# Local Testing with ngrok

## Quick Start

```bash
# 1. Start the API server
cd service-business
npx tsx api.ts

# 2. In another terminal, start ngrok
cd service-business
./scripts/setup-ngrok.sh

# Or manually:
ngrok http 3002
```

## What ngrok Does

ngrok creates a public HTTPS URL that tunnels to your local server (port 3002).

Example output:
```
Forwarding: https://abc123-def.ngrok.io -> http://localhost:3002
```

## Twilio Webhook Setup

1. Copy the HTTPS URL from ngrok (e.g., `https://abc123-def.ngrok.io`)

2. In Twilio Console:
   - Go to **Phone Numbers** > **Manage** > **Active numbers**
   - Click your phone number
   - Under **Messaging**:
     - Set "A message comes in" webhook to: `https://abc123-def.ngrok.io/webhook/sms`
     - Method: POST
   - Under **Voice** (optional):
     - Set webhook to: `https://abc123-def.ngrok.io/webhook/voice`

3. Save changes

## Testing

Send an SMS to your Twilio number:
- "My AC is not working" → Should trigger Intake Agent
- "What are your hours?" → Should trigger Knowledge Base Agent

## View Requests

ngrok provides a web interface at http://localhost:4040 where you can:
- See all incoming requests
- Replay webhooks
- Inspect headers and body

## Troubleshooting

- **ngrok URL changes on restart**: Update Twilio webhook URL each time (or use ngrok paid plan for static domain)
- **Connection refused**: Make sure API server is running on port 3002
- **Webhook errors**: Check ngrok inspector at http://localhost:4040

## Free vs Paid ngrok

**Free:**
- Random URL changes every restart
- 40 connections/minute limit
- Good for testing

**Paid ($5/month):**
- Static subdomain (e.g., `yourname.ngrok.io`)
- Higher limits
- Recommended for demos
