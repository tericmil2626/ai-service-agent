import { findOrCreateCustomer, createJob, saveMessage } from './database';

interface ReceptionistContext {
  customerId?: number;
  jobId?: number;
  channel: string;
  collectedData: {
    name?: string;
    phone?: string;
    address?: string;
    serviceType?: string;
    description?: string;
    urgency?: string;
    preferredTime?: string;
  };
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export class ReceptionistAgent {
  private context: ReceptionistContext;

  constructor(channel: string = 'sms') {
    this.context = {
      channel,
      collectedData: {},
      conversationHistory: []
    };
  }

  async handleMessage(message: string, phoneNumber?: string): Promise<{
    response: string;
    shouldHandoff: boolean;
    handoffTo?: string;
    data?: any;
  }> {
    // Add to conversation history
    this.context.conversationHistory.push({ role: 'user', content: message });

    // Try to extract information from message
    await this.extractInformation(message, phoneNumber);

    // Determine response based on what we know
    const response = await this.generateResponse();

    // Save to database if we have a customer
    if (this.context.customerId) {
      await saveMessage({
        customer_id: this.context.customerId,
        job_id: this.context.jobId,
        channel: this.context.channel,
        direction: 'inbound',
        message_text: message,
        agent_name: 'Receptionist Agent'
      });

      await saveMessage({
        customer_id: this.context.customerId,
        job_id: this.context.jobId,
        channel: this.context.channel,
        direction: 'outbound',
        message_text: response.response,
        agent_name: 'Receptionist Agent'
      });
    }

    return response;
  }

  private async extractInformation(message: string, phoneNumber?: string): Promise<void> {
    const lowerMsg = message.toLowerCase();
    
    // Extract name (simple patterns)
    const namePatterns = [
      /(?:i am|i'm|this is|name is)\s+([a-z]+(?:\s+[a-z]+)?)/i,
      /([a-z]+\s+[a-z]+)(?:\s+at\s+\d+)/i  // "John Smith at 123..."
    ];
    
    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match && !this.context.collectedData.name) {
        this.context.collectedData.name = match[1].trim();
      }
    }

    // Extract address
    const addressPatterns = [
      /(\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|circle|cir|trail|trl|highway|hwy))/i,
      /(\d+\s+n\.?\s*[\w\s]+)/i,  // "123 N. Main"
      /(\d+\s+north\s+[\w\s]+)/i
    ];
    
    for (const pattern of addressPatterns) {
      const match = message.match(pattern);
      if (match && !this.context.collectedData.address) {
        this.context.collectedData.address = match[1].trim();
      }
    }

    // Extract phone if provided separately
    if (phoneNumber && !this.context.collectedData.phone) {
      this.context.collectedData.phone = phoneNumber;
    }

    // Extract service type
    const serviceKeywords: Record<string, string[]> = {
      'plumbing': ['plumbing', 'plumber', 'leak', 'pipe', 'drain', 'clog', 'toilet', 'sink', 'faucet', 'water heater', 'sewer'],
      'hvac': ['ac', 'air conditioning', 'heating', 'furnace', 'hvac', 'thermostat', 'cooling', 'heat pump'],
      'electrical': ['electrical', 'electrician', 'wiring', 'outlet', 'breaker', 'light', 'power', 'electric'],
      'appliance': ['appliance', 'refrigerator', 'fridge', 'dishwasher', 'washer', 'dryer', 'oven', 'stove']
    };

    for (const [service, keywords] of Object.entries(serviceKeywords)) {
      if (keywords.some(kw => lowerMsg.includes(kw))) {
        this.context.collectedData.serviceType = service;
        break;
      }
    }

    // Extract description (everything after service mention)
    if (this.context.collectedData.serviceType && !this.context.collectedData.description) {
      this.context.collectedData.description = message.slice(0, 200); // First 200 chars
    }

    // Check urgency
    const urgentKeywords = ['emergency', 'urgent', 'flooding', 'burst', 'leaking', 'no heat', 'no ac', 'broken', 'not working'];
    const routineKeywords = ['maintenance', 'check up', 'tune up', 'routine', 'inspection', 'service'];
    
    if (urgentKeywords.some(kw => lowerMsg.includes(kw))) {
      this.context.collectedData.urgency = 'high';
    } else if (routineKeywords.some(kw => lowerMsg.includes(kw))) {
      this.context.collectedData.urgency = 'low';
    } else {
      this.context.collectedData.urgency = 'medium';
    }

    // Extract preferred time
    const timePatterns = [
      /(tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /(morning|afternoon|evening)/i,
      /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i
    ];
    
    for (const pattern of timePatterns) {
      const match = message.match(pattern);
      if (match && !this.context.collectedData.preferredTime) {
        this.context.collectedData.preferredTime = match[1].toLowerCase();
      }
    }

    // If we have enough info, create/update customer and job in database
    await this.persistToDatabase();
  }

  private async persistToDatabase(): Promise<void> {
    // Need at least name and phone to create customer
    if (!this.context.collectedData.name || !this.context.collectedData.phone) {
      return;
    }

    // Create or find customer
    if (!this.context.customerId) {
      const customer = await findOrCreateCustomer({
        name: this.context.collectedData.name,
        phone: this.context.collectedData.phone,
        address: this.context.collectedData.address || 'TBD'
      });
      this.context.customerId = customer.id;
    }

    // Create job if we have service type
    if (this.context.collectedData.serviceType && !this.context.jobId) {
      const jobId = await createJob({
        customer_id: this.context.customerId,
        service_type: this.context.collectedData.serviceType,
        description: this.context.collectedData.description,
        urgency: this.context.collectedData.urgency || 'medium',
        source: this.context.channel
      });
      this.context.jobId = jobId as number;
    }
  }

  private async generateResponse(): Promise<{
    response: string;
    shouldHandoff: boolean;
    handoffTo?: string;
    data?: any;
  }> {
    const data = this.context.collectedData;

    // Check if we have everything needed
    const hasName = !!data.name;
    const hasPhone = !!data.phone;
    const hasAddress = !!data.address;
    const hasServiceType = !!data.serviceType;
    const hasPreferredTime = !!data.preferredTime;

    // Determine what's missing
    const missing: string[] = [];
    if (!hasName) missing.push('name');
    if (!hasPhone) missing.push('phone number');
    if (!hasAddress) missing.push('address');
    if (!hasServiceType) missing.push('what type of service');
    if (!hasPreferredTime) missing.push('when you prefer');

    // Generate response based on state
    if (missing.length === 0) {
      // We have everything! Hand off to scheduling
      return {
        response: `Perfect! I have everything I need. Let me check availability and get this scheduled for you.`,
        shouldHandoff: true,
        handoffTo: 'Scheduling Agent',
        data: {
          customer_id: this.context.customerId,
          job_id: this.context.jobId,
          ...data
        }
      };
    }

    // Generate conversational response based on what we have
    let response = '';

    if (!hasName) {
      response = "Hi! Thanks for reaching out. I'm happy to help. Can I start with your name?";
    } else if (!hasPhone) {
      response = `Thanks ${data.name}! What's the best phone number to reach you at?`;
    } else if (!hasAddress) {
      response = `Got it. And what's the address where you need service?`;
    } else if (!hasServiceType) {
      response = `Thanks! Can you tell me a bit about what you need help with? Is this plumbing, electrical, HVAC, or something else?`;
    } else if (!hasPreferredTime) {
      response = `Great. When would work best for you? Any preference for day or time?`;
    } else {
      response = `Thanks for that info. Just to confirm - I have you at ${data.address} for ${data.serviceType} service. Is that right?`;
    }

    return {
      response,
      shouldHandoff: false
    };
  }

  // Get current state for debugging
  getState(): ReceptionistContext {
    return this.context;
  }
}

export default ReceptionistAgent;
