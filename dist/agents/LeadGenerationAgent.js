"use strict";
// Lead Generation Agent - Proactive lead discovery
// Monitors various sources for service need signals
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadGenerationAgent = void 0;
class LeadGenerationAgent {
    constructor() {
        this.serviceKeywords = {
            'plumbing': ['plumber', 'plumbing', 'leak', 'pipe', 'drain', 'clog', 'toilet', 'sink', 'faucet', 'water heater', 'sewer', 'burst pipe', 'flooding'],
            'electrical': ['electrician', 'electrical', 'wiring', 'outlet', 'breaker', 'panel', 'light', 'power', 'spark', 'outage'],
            'hvac': ['ac', 'air conditioning', 'heating', 'furnace', 'hvac', 'thermostat', 'cooling', 'heat pump', 'refrigerant', 'compressor'],
            'appliance': ['appliance', 'refrigerator', 'fridge', 'dishwasher', 'washer', 'dryer', 'oven', 'stove', 'garbage disposal'],
            'roofing': ['roof', 'roofing', 'leak', 'shingles', 'storm damage', 'gutter'],
            'general': ['handyman', 'maintenance', 'repair', 'fix', 'broken']
        };
        this.urgencyPatterns = {
            'high': [
                /\b(asap|urgent|emergency|immediately|right now|today|burst|flooding|no heat|no ac)\b/i,
                /\b(need|looking for)\s+(?:a\s+)?(?:plumber|electrician|hvac|contractor)\s+(?:asap|now|today|urgently)\b/i
            ],
            'medium': [
                /\b(looking for|recommend|suggest|need|want)\s+(?:a\s+)?(?:good|reliable|local)\b/i,
                /\b(anyone know|any recommendations|who can)\b/i
            ],
            'low': [
                /\b(how much|what does|cost|price|usually|typically)\b/i,
                /\b(thinking about|considering|researching|wondering)\b/i
            ]
        };
    }
    async analyzeSource(rawLead) {
        const text = rawLead.raw_text.toLowerCase();
        // Check if this contains service signals
        const serviceCategory = this.detectServiceCategory(text);
        if (!serviceCategory) {
            return null; // Not a service lead
        }
        // Extract contact info
        const contactInfo = this.extractContactInfo(rawLead.raw_text);
        // Extract location
        const location = this.extractLocation(text) || this.inferLocation(rawLead.metadata);
        // Determine priority
        const priority = this.assessPriority(text);
        // Extract problem description
        const problemDescription = this.extractProblemDescription(text, serviceCategory);
        // Calculate confidence
        const confidenceScore = this.calculateConfidence(serviceCategory, contactInfo, location, problemDescription);
        // Skip low-confidence leads
        if (confidenceScore < 30) {
            return null;
        }
        return {
            lead_name: contactInfo.name,
            contact_phone: contactInfo.phone,
            contact_email: contactInfo.email,
            location: location,
            service_category: serviceCategory,
            problem_description: problemDescription,
            lead_source: rawLead.source,
            priority: priority,
            confidence_score: confidenceScore,
            extracted_at: new Date().toISOString()
        };
    }
    async processBatch(rawLeads) {
        const enriched = [];
        let rejected = 0;
        for (const raw of rawLeads) {
            const lead = await this.analyzeSource(raw);
            if (lead) {
                enriched.push(lead);
            }
            else {
                rejected++;
            }
        }
        // Sort by priority
        return {
            highPriority: enriched.filter(l => l.priority === 'high'),
            mediumPriority: enriched.filter(l => l.priority === 'medium'),
            lowPriority: enriched.filter(l => l.priority === 'low'),
            rejected
        };
    }
    detectServiceCategory(text) {
        const scores = {};
        for (const [category, keywords] of Object.entries(this.serviceKeywords)) {
            scores[category] = keywords.filter(kw => text.includes(kw)).length;
        }
        // Find category with highest score
        const bestCategory = Object.entries(scores)
            .sort((a, b) => b[1] - a[1])
            .find(([_, score]) => score > 0);
        return bestCategory ? bestCategory[0] : null;
    }
    extractContactInfo(text) {
        const result = {};
        // Extract phone
        const phoneMatch = text.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
        if (phoneMatch) {
            result.phone = phoneMatch[1];
        }
        // Extract email
        const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
        if (emailMatch) {
            result.email = emailMatch[1];
        }
        // Extract name (common patterns)
        const namePatterns = [
            /(?:this is|i'm|i am|my name is)\s+([a-z]+(?:\s+[a-z]+){0,2})/i,
            /^([a-z]+\s+[a-z]+)(?:\s+here)?/i
        ];
        for (const pattern of namePatterns) {
            const match = text.match(pattern);
            if (match) {
                result.name = match[1].trim();
                break;
            }
        }
        return result;
    }
    extractLocation(text) {
        // Look for city/state patterns
        const locationPatterns = [
            /(?:in|near|around)\s+([a-z\s]+(?:,\s*[a-z]{2})?)/i,
            /([a-z\s]+,\s*(?:tx|texas|ca|california|fl|florida|ny|new york|az|arizona))/i
        ];
        for (const pattern of locationPatterns) {
            const match = text.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        return undefined;
    }
    inferLocation(metadata) {
        // Could use IP geolocation, profile location, etc.
        if (metadata?.location) {
            return metadata.location;
        }
        if (metadata?.city && metadata?.state) {
            return `${metadata.city}, ${metadata.state}`;
        }
        return undefined;
    }
    assessPriority(text) {
        // Check high priority patterns first
        if (this.urgencyPatterns.high.some(p => p.test(text))) {
            return 'high';
        }
        // Then medium
        if (this.urgencyPatterns.medium.some(p => p.test(text))) {
            return 'medium';
        }
        // Default to low
        return 'low';
    }
    extractProblemDescription(text, serviceCategory) {
        // Look for sentences containing service keywords
        const sentences = text.split(/[.!?]+/);
        for (const sentence of sentences) {
            const lower = sentence.toLowerCase();
            const keywords = this.serviceKeywords[serviceCategory] || [];
            if (keywords.some(kw => lower.includes(kw))) {
                return sentence.trim().slice(0, 200);
            }
        }
        // Fallback: first substantial sentence
        return sentences[0]?.trim().slice(0, 200) || 'Service needed';
    }
    calculateConfidence(serviceCategory, contactInfo, location, problemDescription) {
        let score = 0;
        // Service category detected: +30
        if (serviceCategory)
            score += 30;
        // Has contact info: +20 each
        if (contactInfo.phone)
            score += 20;
        if (contactInfo.email)
            score += 20;
        if (contactInfo.name)
            score += 10;
        // Has location: +15
        if (location)
            score += 15;
        // Has problem description: +10
        if (problemDescription && problemDescription.length > 10)
            score += 10;
        return Math.min(score, 100);
    }
    // Handoff recommendations
    getHandoffRecommendation(lead) {
        switch (lead.priority) {
            case 'high':
                return {
                    agent: 'Intake Agent (Priority)',
                    urgency: 'immediate',
                    action: 'Immediate outreach within 15 minutes'
                };
            case 'medium':
                return {
                    agent: 'Follow-Up Agent',
                    urgency: 'same_day',
                    action: 'Add to daily outreach campaign'
                };
            case 'low':
                return {
                    agent: 'CRM Storage',
                    urgency: 'batch',
                    action: 'Store for future marketing campaign'
                };
        }
    }
    // Generate structured output
    getStructuredOutput(leads) {
        return {
            leads: leads.map(lead => ({
                lead_name: lead.lead_name || 'Unknown',
                contact_phone: lead.contact_phone || '',
                contact_email: lead.contact_email || '',
                location: lead.location || 'Unknown',
                service_category: lead.service_category,
                problem_description: lead.problem_description,
                lead_source: lead.lead_source,
                priority: lead.priority,
                confidence_score: lead.confidence_score
            }))
        };
    }
}
exports.LeadGenerationAgent = LeadGenerationAgent;
exports.default = LeadGenerationAgent;
