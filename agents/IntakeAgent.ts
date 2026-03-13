// Intake Agent - Merged from Receptionist + Lead Qualification
// Handles first contact through qualification, then hands off to Scheduling

import { findOrCreateCustomer, createJob, saveMessage, updateJobStatus } from '../database';

interface IntakeData {
  customer_id?: number;
  job_id?: number;
  name?: string;
  phone?: string;
  address?: string;
  service_type?: string;
  problem_description?: string;
  urgency?: 'low' | 'medium' | 'high';
  preferred_time?: string;
  complexity?: 'simple' | 'complex';
  status?: 'greeting' | 'collecting' | 'probing' | 'qualified' | 'disqualified';
}

export class IntakeAgent {
  private data: IntakeData = { status: 'greeting', complexity: 'simple' };
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private channel: string;
  private messageCount: number = 0;

  constructor(channel: string = 'sms') {
    this.channel = channel;
  }

  async handleMessage(message: string, phoneNumber?: string): Promise<{
    response: string;
    handoffTo?: string;
    data?: any;
    isComplete: boolean;
  }> {
    this.messageCount++;
    this.conversationHistory.push({ role: 'user', content: message });

    // Extract information from message
    await this.extractInformation(message, phoneNumber);

    // Check for disqualification
    if (await this.checkDisqualified(message)) {
      this.data.status = 'disqualified';
      await this.saveToDatabase(message, "I understand. We may not be the right fit. Feel free to reach out if you need home services in the future.");
      
      return {
        response: "I understand. We may not be the right fit. Feel free to reach out if you need home services in the future.",
        isComplete: true,
        data: { lead_status: 'not_qualified', reason: 'outside scope' }
      };
    }

    // Determine complexity and update status
    this.assessComplexity();
    
    // Generate response
    const response = this.generateResponse();
    
    // Save to database
    await this.saveToDatabase(message, response.response);

    // Check if ready to handoff
    if (this.isReadyForHandoff()) {
      await this.finalizeIntake();
      
      return {
        response: response.response,
        handoffTo: this.data.urgency === 'high' ? 'Scheduling Agent (Priority)' : 'Scheduling Agent',
        data: this.getStructuredOutput(),
        isComplete: true
      };
    }

    return {
      response: response.response,
      isComplete: false
    };
  }

  private async extractInformation(message: string, phoneNumber?: string): Promise<void> {
    const lowerMsg = message.toLowerCase();

    // Extract name
    const namePatterns = [
      /(?:i am|i'm|this is|name is|my name is)\s+([a-z]+(?:\s+[a-z]+){0,2})/i,
      /^([a-z]+\s+[a-z]+)(?:\s+here|\s+at)/i
    ];
    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match && !this.data.name) {
        this.data.name = match[1].trim();
        this.data.status = 'collecting';
      }
    }

    // Extract phone
    if (phoneNumber && !this.data.phone) {
      this.data.phone = phoneNumber;
    }
    const phoneMatch = message.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
    if (phoneMatch && !this.data.phone) {
      this.data.phone = phoneMatch[1];
    }

    // Extract address
    const addressPatterns = [
      /(\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd|way|court|ct))/i,
      /(?:at|located at)\s+(\d+\s+[^,.]+)/i,
      /address\s+(?:is\s+)?([^,.]+)/i
    ];
    for (const pattern of addressPatterns) {
      const match = message.match(pattern);
      if (match && !this.data.address) {
        this.data.address = match[1].trim();
      }
    }

    // Extract service type
    const serviceKeywords: Record<string, string[]> = {
      'plumbing': ['plumbing', 'plumber', 'leak', 'pipe', 'drain', 'clog', 'toilet', 'sink', 'faucet', 'water heater', 'sewer', 'backup', 'burst'],
      'electrical': ['electrical', 'electrician', 'wiring', 'outlet', 'breaker', 'panel', 'light', 'power', 'electric', 'spark', 'outage'],
      'hvac': ['ac', 'air conditioning', 'heating', 'furnace', 'hvac', 'thermostat', 'cooling', 'heat pump', 'refrigerant'],
      'appliance': ['appliance', 'refrigerator', 'fridge', 'dishwasher', 'washer', 'dryer', 'oven', 'stove']
    };

    for (const [service, keywords] of Object.entries(serviceKeywords)) {
      if (keywords.some(kw => lowerMsg.includes(kw))) {
        this.data.service_type = service;
        break;
      }
    }

    // Extract problem description
    if (!this.data.problem_description) {
      const problemPatterns = [
        /(?:problem|issue|wrong|broken|not working|leaking|clogged|won't|cant|can't)\s+([^,.]+)/i,
        /(?:need|want)\s+(?:to|a|some)\s+([^,.]{10,100})/i
      ];
      for (const pattern of problemPatterns) {
        const match = message.match(pattern);
        if (match) {
          this.data.problem_description = match[1].trim().slice(0, 200);
          break;
        }
      }
    }

    // Assess urgency
    const emergencyKeywords = ['burst', 'flooding', 'flood', 'water everywhere', 'electrical spark', 'burning smell', 'gas smell', 'sewage', 'no heat', 'freezing'];
    const urgentKeywords = ['leaking', 'leak', 'not working', 'broken', 'clogged', 'backing up'];
    const routineKeywords = ['maintenance', 'tune up', 'check up', 'inspection', 'routine'];

    if (emergencyKeywords.some(kw => lowerMsg.includes(kw))) {
      this.data.urgency = 'high';
    } else if (urgentKeywords.some(kw => lowerMsg.includes(kw))) {
      this.data.urgency = 'medium';
    } else if (routineKeywords.some(kw => lowerMsg.includes(kw))) {
      this.data.urgency = 'low';
    }

    // Extract preferred time
    const timePatterns = [
      /(as soon as possible|asap|today|tomorrow|this week|next week)/i,
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /(morning|afternoon|evening)/i
    ];
    for (const pattern of timePatterns) {
      const match = message.match(pattern);
      if (match && !this.data.preferred_time) {
        this.data.preferred_time = match[1].toLowerCase();
      }
    }

    // Persist to database
    await this.persistToDatabase();
  }

  private assessComplexity(): void {
    // Mark as complex if multiple issues mentioned or needs detailed assessment
    const msg = this.conversationHistory.map(h => h.content).join(' ').toLowerCase();
    
    const complexIndicators = [
      'and also', 'another issue', 'multiple', 'several problems',
      'not sure', 'don\'t know', 'weird', 'strange noise', 'intermittent'
    ];
    
    if (complexIndicators.some(ind => msg.includes(ind))) {
      this.data.complexity = 'complex';
      this.data.status = 'probing';
    }
  }

  private async checkDisqualified(message: string): Promise<boolean> {
    const lowerMsg = message.toLowerCase();
    
    const disqualifyingPatterns = [
      /(seo|marketing|website|advertising|credit card|loan|insurance|solar panels)/i,
      /(wrong number|don't need|not interested|stop texting)/i
    ];
    
    if (lowerMsg.includes('different state') || lowerMsg.includes('not in your area')) {
      return true;
    }

    return disqualifyingPatterns.some(pattern => pattern.test(message));
  }

  private generateResponse(): { response: string } {
    const d = this.data;

    // Emergency path - fast track
    if (d.urgency === 'high') {
      if (!d.name || !d.address) {
        return { response: "That sounds urgent. I want to get a technician to you quickly. Can I get your name and the service address?" };
      }
      if (this.hasMinimumInfo()) {
        return { response: "Thanks for the details. I'm flagging this as urgent and will get you scheduled as soon as possible." };
      }
    }

    // First message - greeting
    if (this.messageCount === 1 && !d.name) {
      return { response: "Hi! Thanks for reaching out. I'm happy to help. Can I start with your name?" };
    }

    // Standard collection flow
    if (!d.name) {
      return { response: "Hi! I'm happy to help. Can I get your name first?" };
    }
    if (!d.phone) {
      return { response: `Thanks ${d.name}. What's the best phone number to reach you at?` };
    }
    if (!d.address) {
      return { response: "Got it. What's the address where you need service?" };
    }
    if (!d.service_type) {
      return { response: "Thanks! Is this a plumbing, electrical, HVAC, or appliance issue?" };
    }
    if (!d.problem_description || d.problem_description.length < 15) {
      return { response: "Can you tell me a bit more about what's happening?" };
    }
    
    // Complex jobs need more probing
    if (d.complexity === 'complex' && d.status === 'probing') {
      d.status = 'collecting';
      return { response: "I want to make sure we send the right technician. Can you describe the issue in a bit more detail?" };
    }

    if (!d.urgency) {
      return { response: "Is this something that needs immediate attention, or can it wait for a scheduled appointment?" };
    }
    if (!d.preferred_time) {
      return { response: "Do you have a preferred day or time for a technician to come out?" };
    }

    // All set
    return { response: "Perfect! I have everything I need. Let me check availability and get this scheduled for you." };
  }

  private hasMinimumInfo(): boolean {
    return !!(this.data.name && this.data.phone && this.data.address && this.data.service_type);
  }

  private isReadyForHandoff(): boolean {
    // Emergency: minimum info + urgency
    if (this.data.urgency === 'high' && this.hasMinimumInfo()) {
      return true;
    }
    
    // Standard: all required fields
    const required = [
      this.data.name, 
      this.data.phone, 
      this.data.address, 
      this.data.service_type,
      this.data.problem_description,
      this.data.urgency,
      this.data.preferred_time
    ];
    return required.every(field => field && field.length > 0);
  }

  private async persistToDatabase(): Promise<void> {
    if (!this.data.name || !this.data.phone) return;

    if (!this.data.customer_id) {
      const customer = await findOrCreateCustomer({
        name: this.data.name,
        phone: this.data.phone,
        address: this.data.address || 'TBD'
      });
      this.data.customer_id = customer.id;
    }

    if (this.data.service_type && !this.data.job_id) {
      const jobId = await createJob({
        customer_id: this.data.customer_id,
        service_type: this.data.service_type,
        description: this.data.problem_description,
        urgency: this.data.urgency || 'medium',
        source: this.channel
      });
      this.data.job_id = jobId as number;
    }
  }

  private async saveToDatabase(inbound: string, outbound: string): Promise<void> {
    if (!this.data.customer_id) return;

    await saveMessage({
      customer_id: this.data.customer_id,
      job_id: this.data.job_id,
      channel: this.channel,
      direction: 'inbound',
      message_text: inbound,
      agent_name: 'Intake Agent'
    });

    await saveMessage({
      customer_id: this.data.customer_id,
      job_id: this.data.job_id,
      channel: this.channel,
      direction: 'outbound',
      message_text: outbound,
      agent_name: 'Intake Agent'
    });
  }

  private async finalizeIntake(): Promise<void> {
    if (this.data.job_id) {
      await updateJobStatus(this.data.job_id, 'qualified');
    }
    this.data.status = 'qualified';
  }

  private getStructuredOutput(): any {
    return {
      customer_id: this.data.customer_id,
      job_id: this.data.job_id,
      name: this.data.name,
      phone: this.data.phone,
      address: this.data.address,
      service_type: this.data.service_type,
      problem_description: this.data.problem_description,
      urgency: this.data.urgency,
      preferred_time: this.data.preferred_time,
      complexity: this.data.complexity,
      lead_status: 'qualified'
    };
  }
}

export default IntakeAgent;
