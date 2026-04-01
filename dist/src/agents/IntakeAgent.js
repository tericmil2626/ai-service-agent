"use strict";
// LLM-Powered Intake Agent - Streamlined Version
// Handles first contact through qualification using AI for natural conversation
// Questions asked in order: problem → name → address → preferred day/urgency → schedule
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntakeAgent = void 0;
const database_js_1 = require("../database.js");
const llm_js_1 = require("../llm.js");
class IntakeAgent {
    data;
    conversationHistory;
    messageCount;
    channel;
    constructor(channel = 'sms') {
        this.data = { status: 'greeting' };
        this.conversationHistory = [];
        this.messageCount = 0;
        this.channel = channel;
    }
    // Helper to add conversational warmth and vary fillers
    getConversationalResponse(type) {
        const acknowledgements = ['Got it!', 'Got it —', 'Absolutely!', 'Sure thing!', 'Of course!'];
        const thanks = ['Thanks!', 'Thanks for that!', 'Thank you!', 'Appreciate it!', 'Great, thanks!'];
        const positives = ['Perfect!', 'Wonderful!', 'Excellent!', 'Great!', 'Sounds good!'];
        const pool = type === 'acknowledgement' ? acknowledgements
            : type === 'thanks' ? thanks
                : positives;
        return pool[Math.floor(Math.random() * pool.length)];
    }
    // Helper to detect service type from keywords
    detectServiceType(message) {
        const lower = message.toLowerCase();
        if (lower.includes('ac') || lower.includes('air') || lower.includes('heat') || lower.includes('hvac') || lower.includes('furnace') || lower.includes('cool')) {
            return 'hvac';
        }
        else if (lower.includes('plumb') || lower.includes('leak') || lower.includes('pipe') || lower.includes('drain') || lower.includes('toilet') || lower.includes('sink') || lower.includes('water')) {
            return 'plumbing';
        }
        else if (lower.includes('electr') || lower.includes('light') || lower.includes('outlet') || lower.includes('breaker') || lower.includes('wiring') || lower.includes('power')) {
            return 'electrical';
        }
        else if (lower.includes('appliance') || lower.includes('washer') || lower.includes('dryer') || lower.includes('dishwasher') || lower.includes('refrigerator')) {
            return 'appliance';
        }
        return null;
    }
    async handleMessage(message, context) {
        const phoneNumber = typeof context === 'string' ? context : context.customerPhone;
        this.messageCount++;
        this.conversationHistory.push({ role: 'user', content: message });
        // FIRST MESSAGE: Try to extract problem immediately (text-back reply)
        if (this.data.status === 'greeting') {
            const detectedService = this.detectServiceType(message);
            if (detectedService) {
                // We detected a service type from keywords - use the whole message as problem
                this.data.service_type = detectedService;
                this.data.problem_description = message;
                this.data.status = 'collecting_name';
                await this.persistToDatabase();
                const serviceName = detectedService === 'hvac' ? 'an AC/heating issue' :
                    detectedService === 'plumbing' ? 'a plumbing problem' :
                        detectedService === 'electrical' ? 'an electrical issue' :
                            'that service need';
                const response = `${this.getConversationalResponse('acknowledgement')} ${serviceName}. What's your name?`;
                await this.saveToDatabase(message, response);
                return { response, isComplete: false };
            }
            // No service detected - ask for clarification
            this.data.status = 'collecting_problem';
            const response = "What type of service do you need help with? (AC, plumbing, electrical, etc.)";
            await this.saveToDatabase(message, response);
            return { response, isComplete: false };
        }
        // Extract basic info from message for subsequent messages
        const extraction = await (0, llm_js_1.extractEntities)(message, {
            name: this.data.name,
            phone: this.data.phone,
            address: this.data.address,
            service_type: this.data.service_type,
            problem_description: this.data.problem_description,
        });
        console.log('[Intake] Status:', this.data.status, '| Extraction:', JSON.stringify(extraction));
        // Update data with extracted info
        if (extraction.name && !this.data.name)
            this.data.name = extraction.name;
        if (extraction.phone && !this.data.phone)
            this.data.phone = extraction.phone;
        if (extraction.address && !this.data.address)
            this.data.address = extraction.address;
        if (extraction.service_type && extraction.service_type !== 'unknown' && !this.data.service_type) {
            this.data.service_type = extraction.service_type;
        }
        if (extraction.problem_description && !this.data.problem_description) {
            this.data.problem_description = extraction.problem_description;
        }
        if (extraction.urgency && extraction.urgency !== 'unknown') {
            this.data.urgency = extraction.urgency;
        }
        if (extraction.preferred_time && !this.data.preferred_time) {
            this.data.preferred_time = extraction.preferred_time;
        }
        // Ensure phone is set from the incoming number
        if (!this.data.phone && phoneNumber) {
            this.data.phone = phoneNumber;
        }
        // State machine for question order
        let response;
        switch (this.data.status) {
            case 'collecting_problem':
                // Try keyword detection again if LLM failed
                if (!this.data.service_type) {
                    const detectedService = this.detectServiceType(message);
                    if (detectedService)
                        this.data.service_type = detectedService;
                }
                if (!this.data.problem_description && this.data.service_type) {
                    this.data.problem_description = message;
                }
                if (this.data.problem_description && this.data.service_type) {
                    this.data.status = 'collecting_name';
                    response = `${this.getConversationalResponse('acknowledgement')} ${this.data.problem_description}. What's your name?`;
                }
                else {
                    response = "What type of service do you need help with? (AC, plumbing, electrical, etc.)";
                }
                break;
            case 'collecting_name':
                if (this.data.name) {
                    this.data.status = 'collecting_address';
                    response = `${this.getConversationalResponse('thanks')} ${this.data.name}! What's the address where you need service?`;
                }
                else {
                    response = "What's your name?";
                }
                break;
            case 'collecting_address':
                if (this.data.address) {
                    this.data.status = 'collecting_timing';
                    response = `${this.getConversationalResponse('positive')} When would you prefer service? (For example: today, tomorrow, Friday, or ASAP if it's urgent)`;
                }
                else {
                    response = "What's the service address?";
                }
                break;
            case 'collecting_timing':
                // Parse timing preference
                const timing = this.parseTiming(message);
                if (timing.day)
                    this.data.preferred_day = timing.day;
                if (timing.urgency)
                    this.data.urgency = timing.urgency;
                // If urgency is set but no specific day, treat as ASAP
                if (this.data.urgency === 'high' && !this.data.preferred_day) {
                    this.data.preferred_day = 'ASAP';
                }
                // Check if we have everything
                if (this.hasAllRequired()) {
                    await this.persistToDatabase();
                    await this.finalizeIntake();
                    const urgencyAck = this.data.urgency === 'high'
                        ? `I understand this is urgent — `
                        : `Great! `;
                    response = `${urgencyAck}I have everything I need. Let me get you scheduled.`;
                    await this.saveToDatabase(message, response);
                    return {
                        response,
                        isComplete: true,
                        handoffTo: this.data.urgency === 'high' ? 'Scheduling Agent (Priority)' : 'Scheduling Agent',
                        data: this.getStructuredOutput(),
                    };
                }
                else {
                    response = "When would you prefer service? You can say today, tomorrow, a specific day, or ASAP if it's urgent.";
                }
                break;
            default:
                response = "I'm sorry, I didn't catch that. Could you tell me what service you need?";
        }
        await this.persistToDatabase();
        await this.saveToDatabase(message, response);
        this.conversationHistory.push({ role: 'assistant', content: response });
        return {
            response,
            isComplete: false,
        };
    }
    parseTiming(message) {
        const lower = message.toLowerCase();
        const result = {};
        // Parse day
        if (lower.includes('today'))
            result.day = 'today';
        else if (lower.includes('tomorrow'))
            result.day = 'tomorrow';
        else if (lower.includes('monday'))
            result.day = 'monday';
        else if (lower.includes('tuesday'))
            result.day = 'tuesday';
        else if (lower.includes('wednesday'))
            result.day = 'wednesday';
        else if (lower.includes('thursday'))
            result.day = 'thursday';
        else if (lower.includes('friday'))
            result.day = 'friday';
        else if (lower.includes('saturday'))
            result.day = 'saturday';
        else if (lower.includes('sunday'))
            result.day = 'sunday';
        // Parse urgency
        if (lower.includes('urgent') || lower.includes('emergency') || lower.includes('asap') || lower.includes('right away')) {
            result.urgency = 'high';
        }
        else if (lower.includes('soon') || lower.includes('this week')) {
            result.urgency = 'medium';
        }
        else {
            result.urgency = 'low';
        }
        return result;
    }
    hasAllRequired() {
        return !!(this.data.name &&
            this.data.phone &&
            this.data.address &&
            this.data.service_type &&
            this.data.problem_description &&
            (this.data.preferred_day || this.data.urgency));
    }
    async persistToDatabase() {
        if (!this.data.name || !this.data.phone)
            return;
        if (!this.data.customer_id) {
            const customer = await (0, database_js_1.findOrCreateCustomer)({
                name: this.data.name,
                phone: this.data.phone,
                address: this.data.address || 'TBD',
            });
            this.data.customer_id = customer.id;
        }
        if (this.data.service_type && !this.data.job_id) {
            const jobId = await (0, database_js_1.createJob)({
                customer_id: this.data.customer_id,
                service_type: this.data.service_type,
                description: this.data.problem_description || 'Details to be collected',
                urgency: this.data.urgency || 'medium',
                source: this.channel,
            });
            this.data.job_id = jobId;
        }
    }
    async saveToDatabase(inbound, outbound) {
        if (!this.data.customer_id)
            return;
        await (0, database_js_1.saveMessage)({
            customer_id: this.data.customer_id,
            job_id: this.data.job_id,
            channel: this.channel,
            direction: 'inbound',
            message_text: inbound,
            agent_name: 'Intake Agent',
        });
        await (0, database_js_1.saveMessage)({
            customer_id: this.data.customer_id,
            job_id: this.data.job_id,
            channel: this.channel,
            direction: 'outbound',
            message_text: outbound,
            agent_name: 'Intake Agent',
        });
    }
    async finalizeIntake() {
        if (this.data.job_id) {
            await (0, database_js_1.updateJobStatus)(this.data.job_id, 'qualified');
        }
        this.data.status = 'qualified';
    }
    getStructuredOutput() {
        return {
            customer_id: this.data.customer_id,
            job_id: this.data.job_id,
            name: this.data.name,
            phone: this.data.phone,
            address: this.data.address,
            service_type: this.data.service_type,
            problem_description: this.data.problem_description,
            urgency: this.data.urgency,
            preferred_day: this.data.preferred_day,
            preferred_time: this.data.preferred_time,
            lead_status: 'qualified',
        };
    }
}
exports.IntakeAgent = IntakeAgent;
//# sourceMappingURL=IntakeAgent.js.map