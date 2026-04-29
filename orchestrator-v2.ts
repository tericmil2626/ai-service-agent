import { updateJobStatus, saveMessage, getDb } from './database';
import { AgentLoader } from './core/AgentLoader';
import { ConversationStateManager } from './core/StateManager';
import {
  OrchestratorConfig,
  MessageContext,
  AgentResponse,
  ConversationState
} from './types/agents';
import { getTierConfig, isAgentAvailable, isFeatureAvailable } from './config/tiers';
import { sendSMS as sendTwilioSMS } from './twilio';
import { sendSMS as sendSignalWireSMS } from './signalwire-fetch';
import { createAppointmentEvent } from './google-calendar';

interface OrchestratorResponse {
  response: string;
  handoffTo?: string;
  data?: any;
  sendViaSMS?: boolean;
}

interface SMSProvider {
  sendSMS: (to: string, message: string) => Promise<{ success: boolean; messageId?: string; error?: string }>;
}

function getSMSProvider(): SMSProvider | null {
  // Check which provider is configured
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    console.log('[SMS] Using Twilio provider');
    return { sendSMS: sendTwilioSMS };
  }
  if (process.env.SIGNALWIRE_PROJECT_ID && process.env.SIGNALWIRE_TOKEN && process.env.SIGNALWIRE_PHONE_NUMBER) {
    console.log('[SMS] Using SignalWire provider');
    return { sendSMS: sendSignalWireSMS };
  }
  console.warn('[SMS] No SMS provider configured');
  return null;
}

export class ServiceBusinessOrchestrator {
  private config: OrchestratorConfig;
  private agentLoader: AgentLoader;
  private stateManager: ConversationStateManager;
  private smsProvider: SMSProvider | null;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.agentLoader = new AgentLoader(config.tier);
    this.stateManager = new ConversationStateManager();
    this.smsProvider = getSMSProvider();
  }

  /**
   * Send an SMS response to a customer
   */
  async sendSMSResponse(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.smsProvider) {
      console.error('[SMS] Cannot send SMS - no provider configured');
      return { success: false, error: 'No SMS provider configured' };
    }

    console.log(`[SMS] Sending to ${to}: ${message.substring(0, 50)}...`);
    const result = await this.smsProvider.sendSMS(to, message);

    if (result.success) {
      console.log(`[SMS] Sent successfully: ${result.messageId}`);
    } else {
      console.error(`[SMS] Failed to send: ${result.error}`);
    }

    return result;
  }

  async initialize(): Promise<void> {
    await this.agentLoader.loadAgents();
    console.log(`[Orchestrator] Initialized for tier: ${this.config.tier}`);
    console.log(`[Orchestrator] Loaded agents: ${this.agentLoader.getLoadedAgentIds().join(', ')}`);
  }

  async processMessage(context: MessageContext): Promise<OrchestratorResponse> {
    return this._processMessageInternal(context);
  }

  // Alias for API compatibility
  async processIncomingMessage(data: {
    customer_phone: string;
    message: string;
    channel: 'sms' | 'email' | 'web' | 'phone';
    timestamp: string;
  }): Promise<{ response: string; handoffTo?: string }> {
    const result = await this._processMessageInternal({
      customerPhone: data.customer_phone,
      message: data.message,
      channel: data.channel,
      timestamp: new Date(data.timestamp),
    });
    return { response: result.response, handoffTo: result.handoffTo };
  }

  private async _processMessageInternal(context: MessageContext): Promise<OrchestratorResponse> {
    const { customerPhone, message, channel } = context;

    // Get or create conversation state
    let state = await this.stateManager.getState(customerPhone);

    if (!state) {
      // New customer - start fresh
      state = {
        customerId: 0,
        status: 'new',
        context: {},
        lastMessageAt: new Date(),
      };
    }

    console.log(`[Orchestrator] Processing message from ${customerPhone}, status: ${state.status}, agent: ${state.currentAgent || 'none'}`);

    // Route to appropriate agent based on state
    let response: AgentResponse;

    try {
      console.log(`[Orchestrator] Routing based on status: ${state.status}`);
      switch (state.status) {
        case 'new':
        case 'intake':
          console.log(`[Orchestrator] Routing to handleIntake`);
          response = await this.handleIntake(message, context, state);
          break;

        case 'scheduling':
          console.log(`[Orchestrator] Routing to handleScheduling`);
          response = await this.handleScheduling(message, context, state);
          break;

        case 'dispatch':
          console.log(`[Orchestrator] Routing to handleDispatch`);
          response = await this.handleDispatch(message, context, state);
          break;

        case 'followup':
          console.log(`[Orchestrator] Routing to handleFollowUp`);
          response = await this.handleFollowUp(message, context, state);
          break;

        default:
          // Unknown state, restart intake
          console.log(`[Orchestrator] Unknown state ${state.status}, routing to handleIntake`);
          response = await this.handleIntake(message, context, state);
      }
    } catch (error) {
      console.error('[Orchestrator] Error processing message:', error);
      response = {
        response: "I'm sorry, I'm having trouble processing your message. Please try again or call our office.",
        isComplete: false
      };
    }

    await this.updateStateFromResponse(customerPhone, state, response);

    return {
      response: response.response,
      handoffTo: response.handoffTo,
      data: response.data,
      sendViaSMS: channel === 'sms', // Flag to indicate SMS response needed
    };
  }

  private async handleIntake(
    message: string,
    context: MessageContext,
    state: ConversationState
  ): Promise<AgentResponse> {
    console.log(`[Orchestrator] handleIntake called, looking for intake agent...`);
    const intakeAgent = this.agentLoader.getAgent('intake');
    console.log(`[Orchestrator] intakeAgent found:`, !!intakeAgent);

    if (!intakeAgent) {
      console.error(`[Orchestrator] Intake agent not found! Loaded agents:`, this.agentLoader.getLoadedAgentIds());
      return {
        response: "I'm sorry, our intake system is currently unavailable. Please call our office directly.",
        isComplete: false,
      };
    }

    // Restore agent state if available
    if (state.context.intakeState && intakeAgent.setState) {
      intakeAgent.setState(state.context.intakeState);
    }

    const response = await intakeAgent.handleMessage(message, context);

    // Save agent state
    if (intakeAgent.getState) {
      state.context.intakeState = intakeAgent.getState();
    }

    // Check if intake is complete and we should hand off
    if (response.isComplete && response.handoffTo?.includes('Scheduling')) {
      // Check if scheduling is available in this tier
      if (!isAgentAvailable('scheduling', this.config.tier)) {
        return {
          response: `${response.response}\n\nThank you for your interest! Scheduling is available in our Growth plan. Please call us to upgrade or schedule directly: (555) 123-4567`,
          isComplete: true,
          data: { tierUpgradeRequired: true },
        };
      }

      // Transition to scheduling — store intake data for scheduling agent to consume on first call
      state.status = 'scheduling';
      state.currentAgent = 'scheduling';
      state.context.schedulingData = { ...response.data, business_id: this.config.businessId };
      state.context.schedulingState = undefined; // ensure fresh start for scheduling agent
      console.log('[Orchestrator] Handoff to scheduling. schedulingData set:', JSON.stringify(state.context.schedulingData));
    }

    return response;
  }

  private async handleScheduling(
    message: string,
    context: MessageContext,
    state: ConversationState
  ): Promise<AgentResponse> {
    const schedulingAgent = this.agentLoader.getAgent('scheduling');

    if (!schedulingAgent) {
      return {
        response: "I'm sorry, our scheduling system is currently unavailable. Please call our office to book an appointment.",
        isComplete: false,
      };
    }

    console.log('[Orchestrator] handleScheduling. schedulingState exists:', !!state.context.schedulingState);
    if (state.context.schedulingState && schedulingAgent.setState) {
      // Resuming existing session — restore saved state only, do not re-initialize
      schedulingAgent.setState(state.context.schedulingState);
    } else if (state.context.schedulingData && schedulingAgent.initialize) {
      // Fresh session — initialize with intake data
      console.log('[Orchestrator] Initializing scheduling agent with schedulingData');
      await schedulingAgent.initialize(state.context.schedulingData);
    } else {
      console.log('[Orchestrator] No schedulingData to initialize with');
    }

    const response = await schedulingAgent.handleMessage(message, context);

    // Save agent state
    if (schedulingAgent.getState) {
      state.context.schedulingState = schedulingAgent.getState();
    }

    // Check if scheduling is complete
    if (response.isComplete && response.data?.appointment) {
      state.status = 'dispatch';
      state.currentAgent = 'dispatch';

      // Sync to Google Calendar
      const schedulingData = state.context.schedulingData || {};
      try {
        const calendarEventId = await createAppointmentEvent(
          this.config.businessId,
          {
            customerName: schedulingData.name || 'Unknown',
            customerPhone: schedulingData.phone || context.customerPhone,
            serviceType: schedulingData.service_type || 'Service',
            description: schedulingData.problem_description,
            date: response.data.appointment.date,
            time: response.data.appointment.time,
            address: schedulingData.address,
          }
        );
        if (calendarEventId) {
          console.log('[Orchestrator] Appointment synced to calendar:', calendarEventId);
        } else {
          console.log('[Orchestrator] Calendar sync skipped (no credentials)');
        }
      } catch (err) {
        console.error('[Orchestrator] Calendar sync failed:', err);
        // Don't fail the booking if calendar sync fails
      }

      // Initialize dispatch agent with proper data structure
      const dispatchAgent = this.agentLoader.getAgent('dispatch');
      if (dispatchAgent && response.data?.appointment) {
        const dispatchData = {
          job_id: schedulingData.job_id,
          customer_id: schedulingData.customer_id,
          name: schedulingData.name,
          phone: schedulingData.phone || context.customerPhone,
          address: schedulingData.address,
          service_type: schedulingData.service_type,
          appointment_id: response.data.appointment.id,
          scheduled_date: response.data.appointment.date,
          scheduled_time: response.data.appointment.time,
          urgency: schedulingData.urgency,
        };
        console.log('[Orchestrator] Creating dispatch data:', JSON.stringify(dispatchData));
        if (dispatchAgent.initialize) {
          await dispatchAgent.initialize(dispatchData);
        }
        // Save dispatch data to state for persistence
        state.context.dispatchData = dispatchData;
      }
    }

    return response;
  }

  private async handleDispatch(
    message: string,
    context: MessageContext,
    state: ConversationState
  ): Promise<AgentResponse> {
    // Check if dispatch is available in this tier
    if (!isAgentAvailable('dispatch', this.config.tier)) {
      return {
        response: "Your appointment has been scheduled! A technician will be assigned soon. You'll receive a confirmation with their details.",
        isComplete: true,
      };
    }

    const dispatchAgent = this.agentLoader.getAgent('dispatch');
    if (!dispatchAgent) {
      return {
        response: "Your appointment is confirmed. We'll assign a technician shortly.",
        isComplete: true,
      };
    }

    console.log('[Orchestrator] handleDispatch. dispatchState exists:', !!state.context.dispatchState);
    if (state.context.dispatchState && dispatchAgent.setState) {
      // Resuming existing session — restore saved state only, do not re-initialize
      dispatchAgent.setState(state.context.dispatchState);
    } else if (state.context.dispatchData && dispatchAgent.initialize) {
      // Fresh session — initialize with appointment data
      console.log('[Orchestrator] Initializing dispatch agent with dispatchData');
      await dispatchAgent.initialize(state.context.dispatchData);
    } else {
      console.log('[Orchestrator] No dispatchData to initialize with');
    }

    const response = await dispatchAgent.handleMessage(message, context);

    // Save agent state
    if (dispatchAgent.getState) {
      state.context.dispatchState = dispatchAgent.getState();
    }

    if (response.isComplete) {
      state.status = 'followup';
      state.currentAgent = 'followup';
    }

    return response;
  }

  private async handleFollowUp(
    message: string,
    context: MessageContext,
    state: ConversationState
  ): Promise<AgentResponse> {
    // Check if follow-up is available in this tier
    if (!isAgentAvailable('followup', this.config.tier)) {
      return {
        response: "Thank you for your message. Is there anything else I can help you with?",
        isComplete: false,
      };
    }

    const followUpAgent = this.agentLoader.getAgent('followup');
    if (!followUpAgent) {
      return {
        response: "Thank you for your message. Our team will follow up with you soon.",
        isComplete: false,
      };
    }

    return await followUpAgent.handleMessage(message, context);
  }

  private async updateStateFromResponse(
    customerPhone: string,
    state: ConversationState,
    response: AgentResponse
  ): Promise<void> {
    state.lastMessageAt = new Date();
    await this.stateManager.saveState(customerPhone, state);
  }

  // Time-based actions (called by cron)
  async processTimeBasedActions(): Promise<void> {
    console.log('[Orchestrator] Running time-based actions');

    // Check if follow-up is available
    if (isAgentAvailable('followup', this.config.tier) && this.config.features.followUpReminders) {
      await this.processFollowUps();
    }

    // Check if reviews are available
    if (isAgentAvailable('reviews', this.config.tier)) {
      await this.processReviewRequests();
    }
  }

  private async processFollowUps(): Promise<void> {
    const followUpAgent = this.agentLoader.getAgent('followup');
    if (!followUpAgent) return;

    console.log('[Orchestrator] Processing follow-ups');

    const db = await getDb();
    const now = new Date();

    // 1. Send appointment reminders (24h before)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const appointments24h = await db.all(`
      SELECT a.*, c.id as customer_id, c.name as customer_name, c.phone, j.service_type
      FROM appointments a
      JOIN jobs j ON a.job_id = j.id
      JOIN customers c ON j.customer_id = c.id
      WHERE a.scheduled_date = ?
        AND a.status IN ('pending', 'confirmed')
        AND (a.reminder_sent_24h IS NULL OR a.reminder_sent_24h = 0)
    `, [tomorrowStr]);

    for (const appt of appointments24h) {
      console.log(`[FollowUp] Sending 24h reminder to ${appt.customer_name} (${appt.phone})`);

      const reminderMessage = `Hi ${appt.customer_name}, this is a reminder that your ${appt.service_type} appointment is scheduled for tomorrow at ${appt.scheduled_time}. Reply CONFIRM to confirm or RESCHEDULE if you need to change it.`;

      // Send SMS via configured provider
      await this.sendSMSResponse(appt.phone, reminderMessage);

      // Save reminder message to conversations
      await saveMessage({
        customer_id: appt.customer_id,
        job_id: appt.job_id,
        channel: 'sms',
        direction: 'outbound',
        message_text: reminderMessage,
        agent_name: 'followup',
      });

      // Mark reminder as sent
      await db.run(`
        UPDATE appointments SET reminder_sent_24h = 1 WHERE id = ?
      `, [appt.id]);
    }

    // 2. Send appointment reminders (1h before)
    const currentHour = now.getHours();
    const appointments1h = await db.all(`
      SELECT a.*, c.id as customer_id, c.name as customer_name, c.phone, j.service_type
      FROM appointments a
      JOIN jobs j ON a.job_id = j.id
      JOIN customers c ON j.customer_id = c.id
      WHERE a.scheduled_date = date('now')
        AND CAST(substr(a.scheduled_time, 1, 2) AS INTEGER) = ?
        AND a.status IN ('pending', 'confirmed')
        AND (a.reminder_sent_1h IS NULL OR a.reminder_sent_1h = 0)
    `, [currentHour + 1]);

    for (const appt of appointments1h) {
      console.log(`[FollowUp] Sending 1h reminder to ${appt.customer_name} (${appt.phone})`);

      const reminderMessage = `Hi ${appt.customer_name}, your ${appt.service_type} appointment is in 1 hour. Our technician is on the way!`;

      // Send SMS via configured provider
      await this.sendSMSResponse(appt.phone, reminderMessage);

      await saveMessage({
        customer_id: appt.customer_id,
        job_id: appt.job_id,
        channel: 'sms',
        direction: 'outbound',
        message_text: reminderMessage,
        agent_name: 'followup',
      });

      await db.run(`
        UPDATE appointments SET reminder_sent_1h = 1 WHERE id = ?
      `, [appt.id]);
    }

    // 3. Handle missed appointments (no-show follow up)
    const pastAppointments = await db.all(`
      SELECT a.*, c.id as customer_id, c.name as customer_name, c.phone, j.service_type
      FROM appointments a
      JOIN jobs j ON a.job_id = j.id
      JOIN customers c ON j.customer_id = c.id
      WHERE a.scheduled_date < date('now')
        AND a.status = 'confirmed'
        AND (a.no_show_follow_up_sent IS NULL OR a.no_show_follow_up_sent = 0)
    `);

    for (const appt of pastAppointments) {
      const apptDateTime = new Date(`${appt.scheduled_date}T${appt.scheduled_time}`);
      const hoursSinceAppt = (now.getTime() - apptDateTime.getTime()) / (1000 * 60 * 60);

      // If appointment was more than 2 hours ago and status is still confirmed
      if (hoursSinceAppt > 2) {
        console.log(`[FollowUp] Sending no-show follow-up to ${appt.customer_name} (${appt.phone})`);

        const noShowMessage = `Hi ${appt.customer_name}, we missed you for your ${appt.service_type} appointment today. Would you like to reschedule? Reply YES to reschedule or call us at (555) 123-4567.`;

        // Send SMS via configured provider
        await this.sendSMSResponse(appt.phone, noShowMessage);

        await saveMessage({
          customer_id: appt.customer_id,
          job_id: appt.job_id,
          channel: 'sms',
          direction: 'outbound',
          message_text: noShowMessage,
          agent_name: 'followup',
        });

        // Update appointment status to no_show
        await db.run(`
          UPDATE appointments SET no_show_follow_up_sent = 1, status = 'no_show' WHERE id = ?
        `, [appt.id]);
      }
    }

    console.log(`[Orchestrator] Follow-ups complete: ${appointments24h.length} 24h reminders, ${appointments1h.length} 1h reminders, ${pastAppointments.length} no-show checks`);
  }

  private async processReviewRequests(): Promise<void> {
    const reviewAgent = this.agentLoader.getAgent('reviews');
    if (!reviewAgent) return;

    console.log('[Orchestrator] Processing review requests');

    const db = await getDb();

    // Find jobs completed 24h ago that haven't had review requests sent
    const jobsForReview = await db.all(`
      SELECT j.*, c.name as customer_name, c.phone, a.scheduled_date, a.completed_at
      FROM jobs j
      JOIN customers c ON j.customer_id = c.id
      JOIN appointments a ON a.job_id = j.id
      WHERE j.status = 'completed'
        AND a.completed_at IS NOT NULL
        AND datetime(a.completed_at) <= datetime('now', '-1 day')
        AND datetime(a.completed_at) > datetime('now', '-3 days')
        AND (j.review_requested IS NULL OR j.review_requested = 0)
    `);

    for (const job of jobsForReview) {
      console.log(`[Review] Sending review request to ${job.customer_name} (${job.phone})`);

      const reviewMessage = `Hi ${job.customer_name}, thank you for choosing us for your ${job.service_type} service! We'd love to hear about your experience. Please leave us a review: https://g.page/r/YOUR_BUSINESS/review`;

      // Send SMS via configured provider
      await this.sendSMSResponse(job.phone, reviewMessage);

      await saveMessage({
        customer_id: job.customer_id,
        job_id: job.id,
        channel: 'sms',
        direction: 'outbound',
        message_text: reviewMessage,
        agent_name: 'reviews',
      });

      // Mark review as requested
      await db.run(`
        UPDATE jobs SET review_requested = 1 WHERE id = ?
      `, [job.id]);
    }

    console.log(`[Orchestrator] Review requests complete: ${jobsForReview.length} sent`);
  }

  // Get current status for dashboard
  getStatus(): { tier: string; agents: string[]; features: string[] } {
    const tierConfig = getTierConfig(this.config.tier);

    return {
      tier: this.config.tier,
      agents: this.agentLoader.getLoadedAgentIds(),
      features: Object.entries(tierConfig.features)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name),
    };
  }
}

export default ServiceBusinessOrchestrator;
