# Google Calendar Integration Setup

The Dispatch Agent can automatically create calendar events when technicians are assigned to appointments.

## Prerequisites

1. Google Cloud Project with Calendar API enabled
2. OAuth 2.0 credentials (client_secret.json)
3. Gmail account for the business

## Setup Steps

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable the **Google Calendar API**:
   - APIs & Services → Library
   - Search "Google Calendar API"
   - Click Enable

### 2. Create OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Select **Desktop app** as application type
4. Name it "Service Business Calendar"
5. Download the JSON file

### 3. Configure the App

1. Rename the downloaded file to `client_secret.json`
2. Place it in: `/home/theodorosai26/.openclaw/workspace/service-business/data/client_secret.json`

### 4. Authenticate

Start the server and visit the auth URL:

```bash
cd /home/theodorosai26/.openclaw/workspace/service-business
npm run build
npm start
```

Then in another terminal:
```bash
curl http://localhost:3002/api/calendar/auth
```

This returns an auth URL. Open it in your browser, sign in with your Gmail account, and authorize the app.

### 5. Complete Authentication

After authorizing, you'll get a code. Exchange it:

```bash
curl -X POST http://localhost:3002/api/calendar/auth/callback \
  -H "Content-Type: application/json" \
  -d '{"code": "YOUR_AUTH_CODE_HERE"}'
```

### 6. Verify

```bash
curl http://localhost:3002/api/calendar/status
```

Should return: `{"initialized": true, "message": "Connected"}`

## How It Works

When the Dispatch Agent assigns a technician:

1. Creates a calendar event in your primary calendar
2. Event title: `{SERVICE_TYPE} Service - {Customer Name}`
3. Includes: address, issue description, customer phone
4. Sends invite to technician's email (if available)
5. Sets reminders: 1 hour (email), 30 minutes (popup)
6. Stores event ID in database for future updates

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/calendar/auth` | GET | Get OAuth URL |
| `/api/calendar/auth/callback` | POST | Exchange code for token |
| `/api/calendar/status` | GET | Check connection status |

## Troubleshooting

**"Credentials not found"**
- Make sure `client_secret.json` is in the `data/` directory
- Check file permissions

**"Token expired"**
- Re-run the auth flow
- Tokens are stored in `data/gcal_token.json`

**"Calendar event not created"**
- Check `/api/calendar/status` to verify connection
- Check server logs for errors
- Assignment still works even if calendar fails

## Security Notes

- Keep `client_secret.json` and `gcal_token.json` private
- Don't commit them to git
- Use a dedicated service account if possible
- The token file contains sensitive OAuth credentials
