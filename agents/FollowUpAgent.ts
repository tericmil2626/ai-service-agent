import { getDb, saveMessage, updateJobStatus } from '../database';

interface FollowUpLead {
  lead_id: number;
  customer_id: number;
  name: string;
  phone: string;
  email?: string;
  service_type: string;
  description?: string;
  last_contact_date: string;
  follow_up_stage: 'initial' | 'second' | 'final' | 'reminder';
  lead_status: 'new' | 'contacted' | 'awaiting_response' | 'ready_to_schedule' | 'closed';
}

interface FollowUpSchedule {
  initial: number; // days after first contact
  second: number;
  final: number;
}

export class FollowUpAgent {
  private schedule: FollowUpSchedule = {
    initial: 1,
    second: 3,
    final: 7
  };

  async checkLeadsNeedingFollowUp(): Promise<FollowUpLead[]> {
    const db = await getDb();
    
    // Find leads that need follow-up based on timing
    const leads = await db.all(`
      SELECT 
        j.id as lead_id,
        j.customer_id,
        c.name,
        c.phone,
        c.email,
        j.service_type,
        j.description,
        MAX(conv.created_at) as last_contact_date,
        j.status as lead_status
      FROM jobs j
      JOIN customers c ON j.customer_id = c.id
      LEFT JOIN conversations conv ON j.id = conv.job_id
      WHERE j.status IN ('new', 'contacted', 'awaiting_response')
        AND j.source != 'follow_up_agent'
      GROUP BY j.id
      HAVING last_contact_date IS NULL 
         OR datetime(last_contact_date) < datetime('now', '-1 days')
    `);

    return leads.map((lead: any) => ({
      ...lead,
      follow_up_stage: this.determineStage(lead.last_contact_date, lead.lead_status)
    }));
  }

  async processFollowUp(lead: FollowUpLead): Promise<{
    message: string;
    channel: string;
    shouldSend: boolean;
    handoffTo?: string;
    updatedLead: any;
  }> {
    // Check if it's time for follow-up
    if (!this.isTimeForFollowUp(lead)) {
      return {
        message: '',
        channel: '',
        shouldSend: false,
        updatedLead: lead
      };
    }

    // Generate appropriate message
    const message = this.generateMessage(lead);
    
    // Determine next stage
    const nextStage = this.getNextStage(lead.follow_up_stage);
    
    // Update lead in database
    await this.updateLeadStatus(lead.lead_id, nextStage);
    
    // Save message to conversation history
    await saveMessage({
      customer_id: lead.customer_id,
      job_id: lead.lead_id,
      channel: 'sms',
      direction: 'outbound',
      message_text: message,
      agent_name: 'Follow-Up Agent'
    });

    return {
      message,
      channel: 'sms',
      shouldSend: true,
      updatedLead: {
        ...lead,
        follow_up_stage: nextStage,
        last_contact_date: new Date().toISOString()
      }
    };
  }

  async handleResponse(leadId: number, response: string): Promise<{
    action: 'schedule' | 'close' | 'continue' | 'escalate';
    reply?: string;
    handoffTo?: string;
  }> {
    const lowerResponse = response.toLowerCase();

    // Positive responses - ready to schedule
    const positiveIndicators = [
      'yes', 'sure', 'ok', 'okay', 'let\'s do it', 'schedule', 'book',
      'when can you', 'what times', 'available', 'sounds good'
    ];

    // Negative responses - close lead
    const negativeIndicators = [
      'no', 'not interested', 'found someone', 'already fixed',
      'don\'t need', 'changed my mind', 'too expensive', 'cancel'
    ];

    // Check for positive intent
    if (positiveIndicators.some(ind => lowerResponse.includes(ind))) {
      await updateJobStatus(leadId, 'ready_to_schedule');
      
      return {
        action: 'schedule',
        reply: 'Great! Let me connect you with our scheduling team to find a time that works for you.',
        handoffTo: 'Scheduling Agent'
      };
    }

    // Check for negative intent
    if (negativeIndicators.some(ind => lowerResponse.includes(ind))) {
      await updateJobStatus(leadId, 'closed');
      
      return {
        action: 'close',
        reply: 'No problem at all. Thanks for considering us, and feel free to reach out if you need anything in the future.'
      };
    }

    // Questions or unclear - continue conversation
    if (lowerResponse.includes('?') || lowerResponse.length < 10) {
      return {
        action: 'continue',
        reply: 'I\'m happy to help. What questions do you have about the service?'
      };
    }

    // Default - escalate to human
    return {
      action: 'escalate',
      reply: 'Let me have someone from our team give you a call to discuss this further.',
      handoffTo: 'Human Agent'
    };
  }

  async sendAppointmentReminder(appointmentId: number): Promise<{
    message: string;
    sent: boolean;
  }> {
    const db = await getDb();
    
    const appointment = await db.get(`
      SELECT 
        a.*,
        c.name,
        c.phone,
        j.service_type
      FROM appointments a
      JOIN jobs j ON a.job_id = j.id
      JOIN customers c ON j.customer_id = c.id
      WHERE a.id = ?
    `, appointmentId);

    if (!appointment) {
      return { message: '', sent: false };
    }

    const date = new Date(appointment.scheduled_date);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const timeStr = appointment.scheduled_time;

    const message = `Hi ${appointment.name}, just a reminder that your ${appointment.service_type} appointment is scheduled for ${dayName} at ${timeStr}. Please let us know if you need to make any changes.`;

    await saveMessage({
      customer_id: appointment.customer_id,
      job_id: appointment.job_id,
      channel: 'sms',
      direction: 'outbound',
      message_text: message,
      agent_name: 'Follow-Up Agent'
    });

    return { message, sent: true };
  }

  async handleMissedAppointment(appointmentId: number): Promise<{
    message: string;
    sent: boolean;
  }> {
    const db = await getDb();
    
    const appointment = await db.get(`
      SELECT 
        a.*,
        c.name,
        c.phone,
        j.service_type
      FROM appointments a
      JOIN jobs j ON a.job_id = j.id
      JOIN customers c ON j.customer_id = c.id
      WHERE a.id = ?
    `, appointmentId);

    if (!appointment) {
      return { message: '', sent: false };
    }

    const message = `Hi ${appointment.name}, we noticed we missed you for your scheduled ${appointment.service_type} service today. Would you like to reschedule for another time?`;

    // Update appointment status
    await db.run(
      'UPDATE appointments SET status = ? WHERE id = ?',
      ['no_show', appointmentId]
    );

    await saveMessage({
      customer_id: appointment.customer_id,
      job_id: appointment.job_id,
      channel: 'sms',
      direction: 'outbound',
      message_text: message,
      agent_name: 'Follow-Up Agent'
    });

    return { message, sent: true };
  }

  async sendPostServiceFollowUp(jobId: number): Promise<{
    message: string;
    sent: boolean;
  }> {
    const db = await getDb();
    
    const job = await db.get(`
      SELECT j.*, c.name, c.phone
      FROM jobs j
      JOIN customers c ON j.customer_id = c.id
      WHERE j.id = ?
    `, jobId);

    if (!job) {
      return { message: '', sent: false };
    }

    const message = `Hi ${job.name}, thanks again for choosing us for your ${job.service_type} service. If you need anything else in the future, we're always happy to help!`;

    await saveMessage({
      customer_id: job.customer_id,
      job_id: jobId,
      channel: 'sms',
      direction: 'outbound',
      message_text: message,
      agent_name: 'Follow-Up Agent'
    });

    return { message, sent: true };
  }

  private determineStage(lastContactDate: string | null, status: string): string {
    if (!lastContactDate) return 'initial';
    
    const daysSince = Math.floor(
      (Date.now() - new Date(lastContactDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince >= this.schedule.final) return 'final';
    if (daysSince >= this.schedule.second) return 'second';
    if (daysSince >= this.schedule.initial) return 'initial';
    
    return 'initial';
  }

  private isTimeForFollowUp(lead: FollowUpLead): boolean {
    if (!lead.last_contact_date) return true;

    const daysSince = Math.floor(
      (Date.now() - new Date(lead.last_contact_date).getTime()) / (1000 * 60 * 60 * 24)
    );

    switch (lead.follow_up_stage) {
      case 'initial':
        return daysSince >= this.schedule.initial;
      case 'second':
        return daysSince >= this.schedule.second;
      case 'final':
        return daysSince >= this.schedule.final;
      default:
        return false;
    }
  }

  private generateMessage(lead: FollowUpLead): string {
    const name = lead.name.split(' ')[0]; // First name only

    switch (lead.follow_up_stage) {
      case 'initial':
        return `Hi ${name}! Just checking in to see if you still need help with your ${lead.service_type} issue. We'd be happy to get you scheduled.`;
      
      case 'second':
        return `Hi ${name}, just wanted to follow up regarding your ${lead.service_type} service request. We still have openings this week if you'd like to book.`;
      
      case 'final':
        return `Hi ${name}, last quick check-in. Let us know if you'd still like help with this ${lead.service_type} issue. We're happy to schedule whenever you're ready.`;
      
      default:
        return `Hi ${name}, following up on your ${lead.service_type} service request. How can we help?`;
    }
  }

  private getNextStage(currentStage: string): string {
    const stages = ['initial', 'second', 'final'];
    const currentIndex = stages.indexOf(currentStage);
    
    if (currentIndex < stages.length - 1) {
      return stages[currentIndex + 1];
    }
    
    return 'final'; // Stay at final stage
  }

  private async updateLeadStatus(leadId: number, stage: string): Promise<void> {
    const db = await getDb();
    
    await db.run(
      `UPDATE jobs SET 
        status = ?, 
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?`,
      ['awaiting_response', leadId]
    );
  }

  getStructuredOutput(lead: FollowUpLead, action: string): any {
    const base = {
      name: lead.name,
      phone: lead.phone,
      service_type: lead.service_type,
      follow_up_stage: lead.follow_up_stage,
      lead_status: lead.lead_status
    };

    if (action === 'schedule') {
      return {
        ...base,
        lead_status: 'ready_to_schedule',
        handoff_agent: 'Scheduling Agent'
      };
    }

    if (action === 'close') {
      return {
        ...base,
        lead_status: 'closed'
      };
    }

    return base;
  }
}

export default FollowUpAgent;
