// TODO: This agent overlaps with Receptionist Agent — consider merging or clarifying separation
// Receptionist: First contact, greetings, general inquiries
// Lead Qualification: Deeper probing for complex/multi-service jobs

import { findOrCreateCustomer, createJob, saveMessage, updateJobStatus } from '../database';

interface LeadData {
  customer_id?: number;
  job_id?: number;
  name?: string;
  phone?: string;
  address?: string;
  service_type?: string;
  problem_description?: string;
  urgency?: 'low' | 'medium' | 'high';
  preferred_time?: string;
  lead_status?: 'qualified' | 'not_qualified' | 'in_progress';
}

export class LeadQualificationAgent {
  private data: LeadData = { lead_status: 'in_progress' };
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private channel: string;

  constructor(channel: string = 'sms') {
    this.channel = channel;
  }

  async handleMessage(message: string, phoneNumber?: string): Promise<{
    response: string;
    handoffTo?: string;
    data?: any;
    isComplete: boolean;
  }> {
    // Add to history
    this.conversationHistory.push({ role: 'user', content: message });

    // Extract information
    await this.extractInformation(message, phoneNumber);

    // Check if disqualified
    if (await this.checkDisqualified(message)) {
      return {
        response: "I understand. It sounds like we may not be the right fit for what you need. If you have any home service questions in the future, feel free to reach out.",
        isComplete: true,
        data: { lead_status: 'not_qualified', reason: 'outside scope' }
      };
    }

    // Generate response based on what we know
    const response = this.generateResponse();

    // Save to database
    await this.persistConversation(message, response.response);

    // Check if we have enough to qualify
    if (this.isQualified()) {
      await this.finalizeLead();
      
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
      }
    }

    // Extract phone
    if (phoneNumber && !this.data.phone) {
      this.data.phone = phoneNumber;
    }
    const phonePattern = /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/;
    const phoneMatch = message.match(phonePattern);
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

    // Extract service type (more detailed than Receptionist)
    const serviceKeywords: Record<string, string[]> = {
      'plumbing': ['plumbing', 'plumber', 'leak', 'pipe', 'drain', 'clog', 'toilet', 'sink', 'faucet', 'water heater', 'sewer', 'backup', 'burst'],
      'electrical': ['electrical', 'electrician', 'wiring', 'outlet', 'breaker', 'panel', 'light', 'power', 'electric', 'spark', 'outage'],
      'hvac': ['ac', 'air conditioning', 'heating', 'furnace', 'hvac', 'thermostat', 'cooling', 'heat pump', 'refrigerant', 'compressor'],
      'appliance': ['appliance', 'refrigerator', 'fridge', 'dishwasher', 'washer', 'dryer', 'oven', 'stove', 'microwave', 'garbage disposal']
    };

    for (const [service, keywords] of Object.entries(serviceKeywords)) {
      if (keywords.some(kw => lowerMsg.includes(kw))) {
        this.data.service_type = service;
        break;
      }
    }

    // Extract problem description (more detailed analysis)
    if (!this.data.problem_description && this.data.service_type) {
      // Look for problem indicators
      const problemPatterns = [
        /(?:problem|issue|wrong|broken|not working|leaking|clogged|won't|cant|can't)\s+([^,.]+)/i,
        /([^,.]{10,100})(?:\.|,|$)/  // First substantial sentence
      ];
      for (const pattern of problemPatterns) {
        const match = message.match(pattern);
        if (match) {
          this.data.problem_description = match[1].trim().slice(0, 200);
          break;
        }
      }
    }

    // Assess urgency (more nuanced than Receptionist)
    const emergencyKeywords = ['burst', 'flooding', 'flood', 'water everywhere', 'electrical spark', 'burning smell', 'gas smell', 'sewage', 'no heat', 'freezing'];
    const urgentKeywords = ['leaking', 'leak', 'not working', 'broken', 'clogged', 'backing up', 'no hot water'];
    const routineKeywords = ['maintenance', 'tune up', 'check up', 'inspection', 'routine', 'annual', 'yearly'];

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
      /(morning|afternoon|evening)/i,
      /(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i
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

  private async checkDisqualified(message: string): Promise<boolean> {
    const lowerMsg = message.toLowerCase();
    
    // Check for obvious spam or unrelated requests
    const disqualifyingPatterns = [
      /(seo|marketing|website|advertising|credit card|loan|insurance|solar panels)/i,
      /(wrong number|don't need|not interested|stop texting)/i
    ];
    
    // Check if outside service area (would need config)
    // For now, just check if they mention being far away
    if (lowerMsg.includes('different state') || lowerMsg.includes('not in your area')) {
      return true;
    }

    return disqualifyingPatterns.some(pattern => pattern.test(message));
  }

  private generateResponse(): { response: string } {
    const d = this.data;

    // Check what's missing and prioritize
    const missing: string[] = [];
    if (!d.name) missing.push('name');
    if (!d.phone) missing.push('phone');
    if (!d.address) missing.push('address');
    if (!d.service_type) missing.push('service type');
    if (!d.problem_description) missing.push('problem details');
    if (!d.urgency) missing.push('urgency');
    if (!d.preferred_time) missing.push('preferred time');

    // Emergency path
    if (d.urgency === 'high') {
      if (!d.name || !d.address) {
        return {
          response: "That sounds urgent. I want to get a technician to you quickly. Can I get your name and the service address?"
        };
      }
      if (missing.length <= 2) {
        return {
          response: "Thanks for the details. I'm flagging this as urgent and will get you scheduled as soon as possible."
        };
      }
    }

    // Standard qualification flow
    if (!d.name) {
      return { response: "I can help with that. Can I start with your name?" };
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
    if (!d.problem_description || d.problem_description.length < 20) {
      return { response: "Can you tell me a bit more about what's happening?" };
    }
    if (!d.urgency) {
      return { response: "Is this something that needs immediate attention, or can it wait for a scheduled appointment?" };
    }
    if (!d.preferred_time) {
      return { response: "Do you have a preferred day or time for a technician to come out?" };
    }

    // All info collected
    return {
      response: "Perfect! I have everything I need. Let me get this scheduled for you right away."
    };
  }

  private isQualified(): boolean {
    const d = this.data;
    // Must have: name, phone, address, service_type, problem_description, urgency
    const required = [d.name, d.phone, d.address, d.service_type, d.problem_description, d.urgency];
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

  private async persistConversation(inbound: string, outbound: string): Promise<void> {
    if (!this.data.customer_id) return;

    await saveMessage({
      customer_id: this.data.customer_id,
      job_id: this.data.job_id,
      channel: this.channel,
      direction: 'inbound',
      message_text: inbound,
      agent_name: 'Lead Qualification Agent'
    });

    await saveMessage({
      customer_id: this.data.customer_id,
      job_id: this.data.job_id,
      channel: this.channel,
      direction: 'outbound',
      message_text: outbound,
      agent_name: 'Lead Qualification Agent'
    });
  }

  private async finalizeLead(): Promise<void> {
    if (this.data.job_id) {
      await updateJobStatus(this.data.job_id, 'qualified');
    }
    this.data.lead_status = 'qualified';
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
      lead_status: 'qualified'
    };
  }
}

export default LeadQualificationAgent;
