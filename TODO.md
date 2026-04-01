# TODO - Service Business Agent Features

## High Priority (Core Business)

- [ ] **Payment Processing** — Stripe integration for collecting deposits/payments
  - Store payment methods securely
  - Process deposits at booking
  - Final payment after job completion
  - Refund handling

- [ ] **Review Request Automation** — Auto-send review requests after job completion
  - Trigger 24-48 hours after job marked complete
  - SMS with review link (Google, Yelp, etc.)
  - Follow-up if no review left
  - Track review conversion rate

- [ ] **Email Notifications** — Send confirmations, reminders, receipts via email
  - Booking confirmation email
  - Appointment reminder (24h before)
  - Receipt after payment
  - Job completion summary

- [ ] **Technician Mobile App** — Simple app for techs to see jobs, update status, upload photos
  - Daily schedule view
  - Job details (customer info, service type, address)
  - Status updates (en route, arrived, in progress, complete)
  - Photo upload before/after
  - Customer signature capture

- [ ] **Google Calendar Sync** — Two-way sync for appointments
  - Push appointments to Google Calendar
  - Block time when appointments booked
  - Handle conflicts

## Medium Priority (Growth)

- [ ] **Quote/Estimate Builder** — AI generates professional quotes based on service type
  - Pricing database by service
  - Generate PDF estimates
  - Customer approval via SMS/email
  - Convert estimate to job

- [ ] **Follow-up Sequences** — Automated SMS/email follow-ups
  - Estimate follow-up (if not approved)
  - No-show rebooking
  - Seasonal maintenance reminders
  - Win-back campaigns for old customers

- [ ] **Lead Scoring** — Prioritize hot leads vs. tire kickers
  - Score based on urgency, service type, location
  - Flag high-value leads for immediate attention
  - Auto-escalate to human if score is high

- [ ] **Reporting Dashboard** — Revenue, conversion rates, agent performance
  - Monthly revenue by service type
  - Lead-to-booking conversion rate
  - Agent response times
  - Customer satisfaction scores

- [ ] **Multi-location Support** — For businesses with multiple offices/territories
  - Location-based routing
  - Separate calendars per location
  - Location-specific pricing

## Nice to Have

- [ ] **AI Voice Cloning** — Use business owner's voice instead of generic Rachel
- [ ] **Video Messaging** — Techs can send video updates to customers
- [ ] **Inventory Integration** — Track parts, auto-order when low
- [ ] **Referral Program** — Track and reward customer referrals
- [ ] **Social Media Posting** — Auto-post completed jobs (with permission)

## Technical Debt & Infrastructure

- [ ] **Redis/Cache Layer** — Speed up state management
- [ ] **Proper CI/CD** — GitHub Actions for automated builds
- [ ] **Monitoring/Alerts** — Sentry, uptime monitoring
- [ ] **Backup Strategy** — Automated DB backups
- [ ] **Rate Limiting** — Prevent abuse
- [ ] **Upgrade to 2GB RAM** — Fix build issues on DigitalOcean

## Bug Fixes & Polish

- [ ] **Voice Flow Refinement** — Smoother conversation flow
- [ ] **State Reset** — Clear old conversations properly
- [ ] **SMS Delivery Confirmation** — Verify texts are actually sent
- [ ] **Error Handling** — Better recovery from API failures
- [ ] **Logging** — More detailed logs for debugging

---

*Created: 2026-03-28*
*Last Updated: 2026-03-28*
