import { saveMessage } from '../database';

interface KnowledgeBaseEntry {
  category: string;
  question: string;
  answer: string;
  keywords: string[];
}

interface CustomerQuery {
  customer_id: number;
  message: string;
  channel: string;
}

export class KnowledgeBaseAgent {
  private knowledgeBase: KnowledgeBaseEntry[] = [
    {
      category: 'services',
      question: 'What services do you offer?',
      answer: 'We offer plumbing, electrical, HVAC, and appliance repair services. We also handle installations and maintenance.',
      keywords: ['services', 'offer', 'do you do', 'what do you']
    },
    {
      category: 'service_area',
      question: 'What areas do you service?',
      answer: 'We provide service throughout the greater metropolitan area and surrounding suburbs. I can check specific availability for your location.',
      keywords: ['area', 'location', 'service', 'cover', 'where', 'city']
    },
    {
      category: 'hours',
      question: 'What are your business hours?',
      answer: 'Our office is open Monday through Friday 8 AM to 5 PM. We also offer emergency services outside regular hours.',
      keywords: ['hours', 'open', 'time', 'when', 'available', 'business hours']
    },
    {
      category: 'emergency',
      question: 'Do you offer emergency services?',
      answer: 'Yes, we offer 24/7 emergency services for urgent issues like burst pipes, electrical hazards, and HVAC failures.',
      keywords: ['emergency', 'urgent', 'after hours', 'weekend', 'night', '24/7']
    },
    {
      category: 'pricing',
      question: 'How much do your services cost?',
      answer: 'Pricing varies by service type and complexity. We provide free estimates after inspection. Most standard repairs fall within a typical range.',
      keywords: ['cost', 'price', 'how much', 'charge', 'estimate', 'quote', 'pricing']
    },
    {
      category: 'plumbing',
      question: 'Do you repair water heaters?',
      answer: 'Yes, we service both traditional and tankless water heaters. We can repair leaks, heating elements, and thermostat issues.',
      keywords: ['water heater', 'tankless', 'hot water', 'heater repair']
    },
    {
      category: 'plumbing',
      question: 'Do you handle drain cleaning?',
      answer: 'Yes, we provide professional drain cleaning services for clogged sinks, showers, and main sewer lines.',
      keywords: ['drain', 'clog', 'clogged', 'sewer', 'pipe cleaning']
    },
    {
      category: 'hvac',
      question: 'Do you repair AC units?',
      answer: 'Yes, we repair all types of air conditioning systems including central AC, ductless mini-splits, and heat pumps.',
      keywords: ['ac', 'air conditioning', 'cooling', 'hvac repair']
    },
    {
      category: 'hvac',
      question: 'Do you service furnaces?',
      answer: 'Yes, we repair and service gas and electric furnaces, including heating element replacement and thermostat issues.',
      keywords: ['furnace', 'heating', 'heat', 'winter']
    },
    {
      category: 'electrical',
      question: 'Do you repair electrical outlets?',
      answer: 'Yes, we repair and replace outlets, switches, and can troubleshoot electrical issues throughout your home.',
      keywords: ['outlet', 'electrical', 'wiring', 'switch', 'power']
    },
    {
      category: 'warranty',
      question: 'Do you offer warranties?',
      answer: 'Yes, we stand behind our work with a satisfaction guarantee. Specific warranties vary by service type.',
      keywords: ['warranty', 'guarantee', 'warranties', 'guaranteed']
    },
    {
      category: 'scheduling',
      question: 'How do I schedule service?',
      answer: 'You can schedule by calling, texting, or using our online booking. I can help you schedule right now if you\'d like.',
      keywords: ['schedule', 'book', 'appointment', 'how to schedule', 'set up']
    },
    {
      category: 'process',
      question: 'What happens during a service call?',
      answer: 'Our technician will diagnose the issue, explain the problem, and provide an estimate before starting any work.',
      keywords: ['process', 'what happens', 'service call', 'visit', 'appointment']
    },
    {
      category: 'maintenance',
      question: 'Do you offer maintenance plans?',
      answer: 'Yes, we offer annual maintenance plans for HVAC systems and plumbing to help prevent costly repairs.',
      keywords: ['maintenance', 'plan', 'annual', 'preventive', 'tune up']
    }
  ];

  async handleQuery(query: CustomerQuery): Promise<{
    response: string;
    handoffTo?: string;
    handoffReason?: string;
    confidence: number;
  }> {
    // Save incoming message
    await saveMessage({
      customer_id: query.customer_id,
      channel: query.channel,
      direction: 'inbound',
      message_text: query.message,
      agent_name: 'Knowledge Base Agent'
    });

    // Check for handoff triggers first
    const handoffCheck = this.checkForHandoffTriggers(query.message);
    if (handoffCheck.shouldHandoff) {
      return {
        response: handoffCheck.response || '',
        handoffTo: handoffCheck.agent,
        handoffReason: handoffCheck.reason,
        confidence: 1.0
      };
    }

    // Search knowledge base
    const match = this.findBestMatch(query.message);

    if (match.confidence > 0.6) {
      const response = this.generateResponse(match.entry, match.confidence);
      
      // Save outgoing message
      await saveMessage({
        customer_id: query.customer_id,
        channel: query.channel,
        direction: 'outbound',
        message_text: response,
        agent_name: 'Knowledge Base Agent'
      });

      return {
        response,
        confidence: match.confidence
      };
    }

    // Low confidence - provide generic helpful response
    const fallbackResponse = this.generateFallbackResponse(query.message);
    
    await saveMessage({
      customer_id: query.customer_id,
      channel: query.channel,
      direction: 'outbound',
      message_text: fallbackResponse,
      agent_name: 'Knowledge Base Agent'
    });

    return {
      response: fallbackResponse,
      confidence: match.confidence
    };
  }

  private checkForHandoffTriggers(message: string): {
    shouldHandoff: boolean;
    agent?: string;
    reason?: string;
    response?: string;
  } {
    const lowerMsg = message.toLowerCase();

    // Scheduling intent
    const schedulingTriggers = [
      'schedule', 'book', 'appointment', 'when can you come',
      'set up a time', 'need someone to come', 'send a technician'
    ];
    if (schedulingTriggers.some(t => lowerMsg.includes(t))) {
      return {
        shouldHandoff: true,
        agent: 'Scheduling Agent',
        reason: 'Customer wants to schedule service',
        response: 'I\'d be happy to help you schedule. Let me connect you with our scheduling team.'
      };
    }

    // Service request / problem description
    const problemTriggers = [
      'leaking', 'broken', 'not working', 'issue', 'problem',
      'need repair', 'fix', 'stopped working', 'broke'
    ];
    if (problemTriggers.some(t => lowerMsg.includes(t))) {
      return {
        shouldHandoff: true,
        agent: 'Intake Agent',
        reason: 'Customer describes a service problem',
        response: 'I understand you have a repair issue. Let me get some details so we can help you.'
      };
    }

    // Quote/estimate request
    const estimateTriggers = [
      'quote', 'estimate', 'how much to', 'price for', 'cost to'
    ];
    if (estimateTriggers.some(t => lowerMsg.includes(t))) {
      return {
        shouldHandoff: true,
        agent: 'Estimate Agent',
        reason: 'Customer requests a quote',
        response: 'I can help you get an estimate. Let me connect you with our estimating team.'
      };
    }

    // Complaint about completed work
    const complaintTriggers = [
      'not fixed', 'still broken', 'problem with the work',
      'unhappy', 'complaint', 'didn\'t work', 'worse than before'
    ];
    if (complaintTriggers.some(t => lowerMsg.includes(t))) {
      return {
        shouldHandoff: true,
        agent: 'Customer Support Agent',
        reason: 'Customer reports issue with completed work',
        response: 'I\'m sorry to hear there\'s an issue. Let me connect you with our support team to make this right.'
      };
    }

    return { shouldHandoff: false };
  }

  private findBestMatch(message: string): {
    entry: KnowledgeBaseEntry;
    confidence: number;
  } | null {
    const lowerMsg = message.toLowerCase();
    let bestMatch: { entry: KnowledgeBaseEntry; confidence: number } | null = null;

    for (const entry of this.knowledgeBase) {
      let score = 0;
      
      // Check keyword matches
      for (const keyword of entry.keywords) {
        if (lowerMsg.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      // Check question similarity
      const questionWords = entry.question.toLowerCase().split(' ');
      const messageWords = lowerMsg.split(' ');
      const commonWords = questionWords.filter(w => messageWords.includes(w));
      score += commonWords.length * 0.5;

      // Normalize score
      const confidence = score / (entry.keywords.length + questionWords.length * 0.5);

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { entry, confidence };
      }
    }

    return bestMatch;
  }

  private generateResponse(entry: KnowledgeBaseEntry, confidence: number): string {
    let response = entry.answer;

    // Add scheduling offer for high-confidence matches
    if (confidence > 0.8 && entry.category !== 'hours' && entry.category !== 'emergency') {
      response += ' Would you like me to help schedule a service call?';
    }

    return response;
  }

  private generateFallbackResponse(message: string): string {
    const responses = [
      'I want to make sure I give you the right information. Could you tell me more about what you\'re looking for?',
      'I\'d be happy to help with that. Could you provide a bit more detail so I can assist you better?',
      'That\'s a great question. Let me get you to someone who can provide the most accurate information.'
    ];

    // Check if it seems like a question
    if (message.includes('?')) {
      return responses[0];
    }

    return responses[1];
  }

  // Add new knowledge base entry
  addKnowledgeEntry(entry: KnowledgeBaseEntry): void {
    this.knowledgeBase.push(entry);
  }

  // Get all entries for a category
  getEntriesByCategory(category: string): KnowledgeBaseEntry[] {
    return this.knowledgeBase.filter(e => e.category === category);
  }

  getStructuredOutput(intent: string, handoffAgent?: string, reason?: string): any {
    if (handoffAgent) {
      return {
        intent,
        handoff_agent: handoffAgent,
        reason: reason || 'Customer request'
      };
    }

    return {
      intent: 'information_provided',
      handoff_agent: null
    };
  }
}

export default KnowledgeBaseAgent;
