# Service Business AI Agent - Docker Deployment

## Quick Start

### 1. Build and Run with Docker

```bash
# Build the image
docker build -t service-business-voice .

# Run with environment variables
docker run -d \
  -p 3002:3002 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  --name service-business \
  service-business-voice
```

### 2. Run with Docker Compose (Recommended)

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### 3. Environment Variables

Create a `.env` file with:

```env
# Required
OPENAI_API_KEY=sk-your-key
SIGNALWIRE_PROJECT_ID=your-project-id
SIGNALWIRE_TOKEN=your-token
SIGNALWIRE_PHONE_NUMBER=+1234567890
SIGNALWIRE_SPACE=your-space.signalwire.com

# Voice AI
VOICE_AI_ENABLED=true
VOICE_TTS_VOICE=Polly.Joanna
WEBHOOK_BASE_URL=https://your-domain.com

# Service
SERVICE_TIER=starter
BUSINESS_NAME="Your Service Business"
```

### 4. Deploy to Cloud

#### Render.com
1. Push code to GitHub
2. Connect repo to Render
3. Select "Docker" environment
4. Set environment variables in Render dashboard
5. Deploy

#### Railway.app
1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Init: `railway init`
4. Deploy: `railway up`
5. Set env vars: `railway variables set KEY=value`

#### Fly.io
1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Launch: `fly launch`
3. Deploy: `fly deploy`

### 5. Update SignalWire Webhooks

Once deployed, update your SignalWire phone number:
- **Voice Webhook**: `https://your-domain.com/webhook/voice`
- **SMS Webhook**: `https://your-domain.com/webhook/sms`

## Testing

```bash
# Test locally
curl http://localhost:3002/health

# Test voice webhook
curl -X POST http://localhost:3002/webhook/voice \
  -d "From=+15551234567&To=+1234567890&CallSid=test123"
```

## Troubleshooting

**Container won't start:**
```bash
# Check logs
docker logs service-business

# Check env vars
docker exec service-business env | grep SIGNALWIRE
```

**Database issues:**
```bash
# Data persists in ./data directory
# To reset: rm -rf data/*.db
```

**Port already in use:**
```bash
# Change port mapping in docker-compose.yml
ports:
  - "3003:3002"  # Host:Container
```
