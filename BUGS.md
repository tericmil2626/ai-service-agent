# Bug/Issue Log - Service Business Voice Agent

## 2026-03-28 - ElevenLabs Integration Issues

### Issue 1: SignalWire SWML + ElevenLabs = Rickroll
**Status:** Workaround implemented

**Problem:**
When using SWML with `elevenlabs.rachel` voice, SignalWire plays a demo voice that says "thanks for trying our documentation, enjoy" followed by "Never Gonna Give You Up" (Rickroll).

**Root Cause:**
SignalWire's native ElevenLabs integration requires the ElevenLabs API key to be configured in the SignalWire dashboard. Without it, SignalWire falls back to a demo voice that Rickrolls the caller.

**Attempted Solutions:**
1. ✅ Tried SWML with `voice: "elevenlabs.rachel"` — Result: Rickroll
2. ❌ Searched SignalWire dashboard for ElevenLabs API key configuration — Result: Could not find location
3. ❌ Searched SignalWire docs — Result: No clear documentation on where to add API key

**Current Workaround:**
Switched to **direct ElevenLabs API approach**:
- Generate audio via ElevenLabs API in our code
- Save MP3 files to server
- Serve audio files via `/audio/:filename` endpoint
- Use LaML `<Play>` to stream audio to caller
- Fallback to Amazon Polly if ElevenLabs fails

**Trade-offs:**
- ✅ Actually works (no Rickroll)
- ❌ Added latency (~0.5-1s per response) due to HTTP call + file generation
- ❌ More complex code
- ❌ File cleanup needed

**Next Steps:**
Contact SignalWire support to ask:
1. Where to add ElevenLabs API key in dashboard?
2. Is native ElevenLabs integration available for all accounts?
3. Can they enable it or provide documentation?

If SignalWire enables native integration, we can switch back to SWML for cleaner code and lower latency.

---

### Issue 2: Server Memory Constraints
**Status:** Ongoing

**Problem:**
DigitalOcean droplet (1GB RAM) cannot compile TypeScript (`npm run build`). Process OOMs with "JavaScript heap out of memory" error.

**Workaround:**
Build locally, rsync compiled `dist/` folder to server.

**Long-term Fix:**
Consider upgrading to 2GB RAM droplet ($6/month) or using GitHub Actions for CI/CD builds.

---

### Issue 3: Voice Call Flow - Intake Loop on Timing
**Status:** Partially Fixed

**Problem:**
When caller says "ASAP" or "it's urgent" instead of a specific day, the intake agent gets stuck in a loop asking "When would you prefer service?" repeatedly.

**Root Cause:**
The `hasAllRequired()` method required `preferred_day` to be set, but urgent requests only set `urgency` without a specific day.

**Fix Applied:**
Modified `hasAllRequired()` to accept either `preferred_day` OR `urgency`:
```typescript
private hasAllRequired(): boolean {
  return !!(
    this.data.name &&
    this.data.phone &&
    this.data.address &&
    this.data.service_type &&
    this.data.problem_description &&
    (this.data.preferred_day || this.data.urgency)  // Fixed: accepts either
  );
}
```

**Still Needs Work:**
The overall call flow needs refinement:
- Transitions between intake → scheduling feel abrupt
- Scheduling agent needs better error handling when data is missing
- Call ending/hangup logic needs review
- Need to test full end-to-end flow multiple times

---

### Issue 4: SMS Text-Back Not Working
**Status:** Fixed (2026-03-31)

**Problem:**
Missed call text-back SMS not being sent. Database showed `text_back_sent = 1` but no SMS received.

**Root Causes Found:**

1. **`twilio.ts` read env vars at module load time (top-level)**
   TypeScript `import` statements are hoisted before `dotenv.config()` runs, so `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` were always `undefined` in `twilio.ts`. This caused the mock client to be used (silently succeeds without sending), and `fromNumber` check returned `{success:false}` before calling the real API.

2. **`MissedCallHandler` cached the SMS provider in the constructor**
   If the constructor ran before dotenv loaded (or env vars changed), the cached provider was wrong/null for the lifetime of the process.

3. **No retry logic** — a single transient failure would permanently skip the text-back.

4. **SignalWire accepted message with error_code but code treated it as success**
   A non-null `error_code` in the response body was logged but still returned `{success:true}`.

**Fixes Applied:**
- `twilio.ts`: Moved all env var reads inside each function (no more module-level reads)
- `missed-call-handler.ts`: Removed cached `smsProvider`; call `getSMSProvider()` fresh on every send. Added 3-attempt retry with 2s/4s/6s backoff
- `signalwire-fetch.ts`: Return `{success:false}` when response contains `error_code`, warn on unexpected statuses
- `api-v2.ts`: Added startup log showing which SMS provider is active (or error if none). Added `POST /api/test-sms` endpoint for production verification

**Verification:**
```bash
# Test SMS from production server
curl -X POST http://45.55.60.22:3002/api/test-sms \
  -H 'Content-Type: application/json' \
  -d '{"to":"+1YOURNUMBER"}'
```

---

### Issue 5: Voice Call Flow - General Issues
**Status:** Ongoing - Needs Refinement

**Problem:**
The overall voice call flow still has issues:
- Agent responses feel robotic/awkward
- Timing between questions feels off
- Call handoffs between agents are clunky
- Call ending doesn't feel natural
- Speech recognition sometimes misses caller input
- Need better handling of "um", "uh", pauses

**Areas to Improve:**
1. **Greeting:** Should feel warmer, less scripted
2. **Question flow:** Smoother transitions between questions
3. **Error recovery:** Better handling when caller says something unexpected
4. **Confirmation:** Clearer confirmation of appointment details
5. **Closing:** More natural goodbye

**Next Steps:**
- Record and review multiple test calls
- Adjust prompt wording for more natural conversation
- Add more context to prompts so AI knows where it is in the flow
- Consider adding "filler" responses ("Let me check that...", "Got it...")

---

## Configuration Reference

### Current Working Setup (Direct ElevenLabs API)
```bash
# .env settings
VOICE_AI_ENABLED=true
VOICE_TTS_VOICE=Polly.Amy  # Fallback voice
ELEVENLABS_API_KEY=sk_edff8230876c61965e3ef0c306630b6e1acf36e4cf56e178
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # Rachel
ELEVENLABS_MODEL=eleven_multilingual_v2
USE_ELEVENLABS_TTS=true
AUDIO_CACHE_DIR=/opt/service-business/audio-cache
```

### Files Modified
- `voice-agent.ts` — Added ElevenLabs TTS integration with fallback
- `elevenlabs-tts.ts` — ElevenLabs API client
- `api-v2.ts` — Added `/audio/:filename` endpoint for serving audio files

---

### Issue 6: Claude Code (ACP) Integration Not Working
**Status:** Configuration Issue - Needs Setup

**Problem:**
Claude Code spawning via ACP runtime fails with "acpx exited with code 1".

**What Was Tried:**
1. ✅ Enabled ACPX plugin: `openclaw plugins enable acpx`
2. ✅ Installed Claude Code CLI: `npm install -g @anthropics/claude-code` (v2.1.81)
3. ✅ ACPX binary is at: `~/.npm-global/lib/node_modules/openclaw/dist/extensions/acpx/node_modules/.bin/acpx`
4. ✅ ACPX runtime backend registers successfully in logs
5. ❌ Agent spawning fails - `agents_list` only shows "main", not "claude-code"

**Root Cause:**
The ACPX plugin is enabled and finding the binary, but the agent spawning mechanism isn't properly configured. The `agentId: "claude-code"` isn't recognized in the allowlist.

**Possible Fixes:**
- Check if agents need explicit registration in OpenClaw config
- Verify acpx spawn command syntax matches what OpenClaw expects
- Check if PATH needs to include claude-code binary for acpx to find it
- May need to configure `plugins.acpx.agents` or similar

**Workaround:**
Continue working without Claude Code delegation - handle tasks directly.

---

### Issue 7: Vector Memory Database Setup - pgvector Extension
**Status:** Fixed - Documentation for future reference

**Problem:**
Setting up PostgreSQL vector extension for AI memory system failed with:
- `relation "memories" does not exist` - table not created
- `type "vector" does not exist` - pgvector extension not enabled
- `FATAL: role "theodorosai26" does not exist` - database user missing
- `connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed` - peer authentication failed

**Root Cause:**
Multiple setup steps were required but not documented in order.

**Fix Applied:**
```bash
# 1. Install PostgreSQL and Python driver
sudo apt install -y postgresql postgresql-contrib python3-psycopg2

# 2. Create database user matching system user
sudo -u postgres psql -c "CREATE USER theodorosai26 WITH SUPERUSER;"
sudo -u postgres psql -c "ALTER USER theodorosai26 WITH PASSWORD 'password';"

# 3. Create database and enable vector extension
sudo -u postgres psql -c "CREATE DATABASE openclaw_memory;"
sudo -u postgres psql -d openclaw_memory -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 4. Create memories table
sudo -u postgres psql -d openclaw_memory -c "CREATE TABLE IF NOT EXISTS memories (id SERIAL PRIMARY KEY, text TEXT NOT NULL, label TEXT, category TEXT, source TEXT, embedding vector(768), metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());"
sudo -u postgres psql -d openclaw_memory -c "CREATE INDEX IF NOT EXISTS memories_embedding_idx ON memories USING ivfflat (embedding vector_cosine_ops);"

# 5. Grant permissions
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE openclaw_memory TO theodorosai26;"
sudo -u postgres psql -d openclaw_memory -c "GRANT ALL ON SCHEMA public TO theodorosai26;"
```

**Note:** Scripts updated to use `DB = "dbname=openclaw_memory user=theodorosai26"` connection string.

---

*Last updated: 2026-03-30*
