# AI Agent Bugs to Fix

A running list of bugs, issues, and improvements needed for the service business AI agent system.

---

## Active Issues

### 1. SMS Messages Undelivered (SignalWire Free Trial)
**Status:** 🔴 Blocking

---

## Historical Bugs (Fixed)

### 2. Missing `processIncomingMessage()` Method
**Status:** ✅ Fixed (2026-03-22)
**Issue:** API was calling `processIncomingMessage()` but the method didn't exist in orchestrator
**Fix:** Added method alias in `orchestrator-v2.ts`

### 3. Orchestrator Not Initialized
**Status:** ✅ Fixed (2026-03-22)
**Issue:** Agents weren't loading because `orchestrator.initialize()` was skipped in API startup
**Fix:** Added `await orchestrator.initialize()` in `api.ts`

### 4. CORS Blocking Widget Requests
**Status:** ✅ Fixed (2026-03-22)
**Issue:** Widget couldn't connect to API due to CORS restrictions
**Fix:** Changed CORS config to `origin: true` to allow requests from any origin

### 5. Missing `businessId` in Orchestrator Config
**Status:** ✅ Fixed (2026-03-22)
**Issue:** `businessId` was undefined, causing Google Calendar sync to fail
**Fix:** Added `businessId` to orchestrator configuration

### 6. Moonshot API JSON Mode Failure
**Status:** ✅ Fixed (2026-03-16)
**Issue:** Moonshot (Kimi K2.5) doesn't support JSON mode properly - returns reasoning in `reasoning_content` instead of structured JSON
**Fix:** Switched to OpenAI provider

### 7. A2P 10DLC Registration Required (Twilio)
**Status:** ✅ Worked Around (2026-03-16)
**Issue:** US phone numbers require A2P 10DLC registration to send SMS (Error 30034)
**Workaround:** Switched to SignalWire instead of Twilio

### 8. Reminder System SQL Error
**Status:** ✅ Fixed (2026-03-22)
**Issue:** `SQLITE_CONSTRAINT: NOT NULL constraint failed: conversations.customer_id` when saving reminder messages
**Fix:** Added `c.id as customer_id` to SQL queries in `processFollowUps()`

### 9. AgentLoader Path Incorrect
**Status:** ✅ Fixed (2026-03-25)
**Issue:** AgentLoader looking in `../agents/` but agents are in `../src/agents/`
**Fix:** Updated path in `core/AgentLoader.ts`

### 10. State Persistence Bug
**Status:** ✅ Fixed (2026-03-25)
**Issue:** Text-back reply was clearing state every time, not just first reply
**Fix:** Added `converted_to_lead` flag check in `missed-call-handler.ts`

---

## Previously Listed (Now Fixed)

### 1. SMS Messages Undelivered (SignalWire Free Trial)
**Status:** 🔴 Blocking
**Date:** 2026-03-25
**Issue:** SMS responses from the AI agent show status "undelivered" in SignalWire logs. The first text-back (missed call message) delivers successfully, but subsequent conversation responses fail.
**Evidence:** 
```json
{
  "sid": "b33f3595-62c3-4b5d-a7ef-5016de1afd88",
  "status": "undelivered",
  "body": "[SignalWire Free Trial] Got it - My ac is blowing hot air . What's your name?"
}
```
**Suspected Cause:** SignalWire adds "[SignalWire Free Trial]" prefix to messages, which may exceed character limits or trigger spam filters on subsequent messages.
**Workaround:** None currently. User cannot receive AI responses.
**Fix Needed:** 
- Upgrade SignalWire account to paid tier, OR
- Switch to different SMS provider (Twilio, etc.), OR
- Investigate if message length/compression can help

---

### 2. Intake Agent - Problem Detection Too Strict (FIXED)
**Status:** ✅ Fixed
**Date:** 2026-03-25
**Issue:** Intake agent wasn't extracting problem description from first reply, requiring multiple back-and-forth messages.
**Fix Applied:** Added keyword-based detection (AC, heat, plumbing, leak, etc.) to extract service type and use full message as problem description.

---

### 3. LLM Schema Validation Errors (FIXED)
**Status:** ✅ Fixed  
**Date:** 2026-03-25
**Issue:** TypeScript compilation failing due to unbalanced braces, unclosed template literals, and unicode characters.
**Root Cause:** Line 483 had mismatched quote - template literal opened with `` ` `` but closed with `"`
**Fix Applied:** Claude Code identified and fixed the syntax error.

---

### 4. Scheduling Agent - Day Preference Ignored (FIXED)
**Status:** ✅ Fixed
**Date:** 2026-03-25
**Issue:** When user asked for "Friday afternoon", system offered Thursday slots and booked Thursday anyway.
**Fix Applied:** Reordered logic to check for day preference BEFORE time-of-day preference.

---

### 5. Time Format - 24-Hour Instead of 12-Hour (FIXED)
**Status:** ✅ Fixed
**Date:** 2026-03-25
**Issue:** System showed "14:00" instead of "2:00 PM"
**Fix Applied:** Added `formatTime12Hour()` helper and updated all time displays.

---

## Improvements Needed

### 1. Conversation State Management
**Priority:** Medium
**Issue:** Old conversation state persists and can interfere with new conversations. Currently using manual `clear-state.js` script.
**Improvement:** Auto-expire conversation state after 24 hours or provide user-facing "start over" command.

### 2. Better Error Handling for SMS Failures
**Priority:** High
**Issue:** When SMS fails (undelivered), system doesn't know or retry.
**Improvement:** Check delivery status webhook, log failures, alert admin, potentially fallback to different channel.

### 3. Intake Flow - Too Many Questions
**Priority:** Medium
**Issue:** 4-5 back-and-forth messages feels slow.
**Improvement:** Consider batching questions or using more concise prompts.

### 4. Calendar Sync Error Handling
**Priority:** Low
**Issue:** If Google Calendar sync fails, appointment is still booked in DB but not on calendar.
**Improvement:** Retry logic, alert if sync fails, queue for later sync.

---

## Testing Checklist for Next Session

- [ ] Verify SMS delivery with upgraded SignalWire account
- [ ] Test complete flow: missed call → text-back → intake → scheduling → calendar
- [ ] Test day preference (Friday vs Thursday)
- [ ] Test time-of-day preference (morning/afternoon/evening)
- [ ] Test double-booking prevention
- [ ] Test 12-hour time format display
- [ ] Test conversation state reset

---

## 🎯 MVP FEATURE SET (Minimum Viable Product)

### Must-Have for Launch
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | **Working SMS** | ⚠️ | Fix SignalWire or switch to Twilio |
| 2 | **Voice AI (Inbound Calls)** | ❌ | Answer calls, have conversation, book appointment |
| 3 | **Intake Agent** | ✅ | Working — collects problem/name/address/timing |
| 4 | **Scheduling Agent** | ✅ | Working — shows slots, books appointments |
| 5 | **Google Calendar Sync** | ✅ | Working — appointments sync to calendar |
| 6 | **Email Confirmations** | ❌ | Send booking confirmation + reminder emails |
| 7 | **Simple Admin Dashboard** | ❌ | View conversations, appointments, basic stats |
| 8 | **Stripe Billing** | ❌ | Charge monthly subscription |

### Voice AI Details (Critical Gap)
**Current State:** Can forward calls, send text-back, but NO actual voice conversation
**What We Need:**
- Answer incoming call with AI voice
- Natural conversation (like SMS but voice)
- Extract same info (problem, name, address, timing)
- Book appointment during call
- Handle "let me check my calendar" pauses
- Transfer to human if needed

**Tech Options:**
- OpenAI Realtime API (WebRTC)
- Vapi.ai
- Bland.ai
- Retell.ai

---

## 🎯 RECOMMENDED PRIORITY ORDER

**Week 1:**
1. Fix SMS (Twilio or paid SignalWire)
2. Build Voice AI integration (Vapi or Bland)

**Week 2-3:**
3. Email notifications
4. Simple admin dashboard
5. Stripe integration

**Week 4:**
6. Polish, test, demo videos
7. Launch landing page

---

## Notes

- SignalWire Project ID: `9ea331fc-49ce-4c42-90ee-6ee34db9251f`
- Phone Number: `+1 (405) 369-4926`
- Ngrok URL: `https://indefeasibly-ventriloquial-jutta.ngrok-free.dev`
- Server Port: 3002

