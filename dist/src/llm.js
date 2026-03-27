"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateResponse = generateResponse;
exports.generateText = generateText;
exports.extractEntities = extractEntities;
exports.generateConversationalResponse = generateConversationalResponse;
exports.generateSchedulingResponse = generateSchedulingResponse;
exports.parseTimeSelection = parseTimeSelection;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
// Load env vars immediately
dotenv_1.default.config();
// LLM Provider Configuration
function getProvider() { return process.env.LLM_PROVIDER || 'mock'; }
function getModel() { return process.env.LLM_MODEL || 'gpt-4o-mini'; }
function getApiKey() {
    const provider = getProvider();
    if (provider === 'moonshot') {
        return process.env.MOONSHOT_API_KEY || '';
    }
    if (provider === 'gemini') {
        return process.env.GEMINI_API_KEY || '';
    }
    return process.env.OPENAI_API_KEY || '';
}
// Mock LLM for testing without API keys
async function mockLLMResponse(messages) {
    const lastMessage = messages[messages.length - 1]?.content || '';
    const lowerMsg = lastMessage.toLowerCase();
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    // Check if this is a scheduling response request (has slots in context)
    // The system prompt for scheduling starts with "You are a scheduling assistant"
    const isSchedulingRequest = messages.some(m => m.role === 'system' && m.content.includes('scheduling assistant'));
    if (isSchedulingRequest) {
        console.log('[MOCK LLM] Detected scheduling request');
        return JSON.stringify({
            response: "Thanks for the details! I have availability tomorrow at 10:00 AM, 2:00 PM, or Thursday at 9:00 AM. Which works best for you?",
            slot_references: [0, 1, 2]
        });
    }
    // Check if this is time selection parsing
    const isTimeParsing = messages.some(m => m.role === 'system' && (m.content.includes('Parse the customer') || m.content.includes('selected slot')));
    if (isTimeParsing) {
        return JSON.stringify({
            selected_slot_index: 0,
            confidence: 0.95,
            clarification_needed: false
        });
    }
    // Check if this is entity extraction (has schema description)
    const isEntityExtraction = systemMsg.includes('schema') || systemMsg.includes('JSON');
    if (isEntityExtraction) {
        // Entity extraction response
        if (lowerMsg.includes('ac') || lowerMsg.includes('air') || lowerMsg.includes('hvac') || lowerMsg.includes('95 degrees')) {
            return JSON.stringify({
                name: null,
                phone: null,
                address: null,
                service_type: 'hvac',
                problem_description: 'AC not working, house is 95 degrees',
                urgency: 'high',
                preferred_time: null,
                is_disqualified: false,
                disqualify_reason: null,
                missing_info: ['name', 'phone', 'address', 'preferred_time'],
                sentiment: 'urgent'
            });
        }
        if (lowerMsg.includes('john') || lowerMsg.includes('smith')) {
            return JSON.stringify({
                name: 'John Smith',
                phone: null,
                address: null,
                service_type: 'hvac',
                problem_description: 'AC not working, house is 95 degrees',
                urgency: 'high',
                preferred_time: null,
                is_disqualified: false,
                disqualify_reason: null,
                missing_info: ['phone', 'address', 'preferred_time'],
                sentiment: 'urgent'
            });
        }
        if (lowerMsg.includes('main street') || lowerMsg.includes('springfield')) {
            return JSON.stringify({
                name: 'John Smith',
                phone: null,
                address: '123 Main Street, Springfield, IL',
                service_type: 'hvac',
                problem_description: 'AC not working, house is 95 degrees',
                urgency: 'high',
                preferred_time: null,
                is_disqualified: false,
                disqualify_reason: null,
                missing_info: ['phone', 'preferred_time'],
                sentiment: 'urgent'
            });
        }
        if (lowerMsg.includes('555') || lowerMsg.match(/\d{3}[-.]?\d{3}[-.]?\d{4}/)) {
            return JSON.stringify({
                name: 'John Smith',
                phone: '555-123-4567',
                address: '123 Main Street, Springfield, IL',
                service_type: 'hvac',
                problem_description: 'AC not working, house is 95 degrees',
                urgency: 'high',
                preferred_time: null,
                is_disqualified: false,
                disqualify_reason: null,
                missing_info: ['preferred_time'],
                sentiment: 'urgent'
            });
        }
        if (lowerMsg.includes('asap') || lowerMsg.includes('today') || lowerMsg.includes('tomorrow')) {
            return JSON.stringify({
                name: 'John Smith',
                phone: '555-123-4567',
                address: '123 Main Street, Springfield, IL',
                service_type: 'hvac',
                problem_description: 'AC not working, house is 95 degrees',
                urgency: 'high',
                preferred_time: 'asap',
                is_disqualified: false,
                disqualify_reason: null,
                missing_info: [],
                sentiment: 'urgent'
            });
        }
        // Default extraction response
        return JSON.stringify({
            name: null,
            phone: null,
            address: null,
            service_type: 'unknown',
            problem_description: null,
            urgency: 'medium',
            preferred_time: null,
            is_disqualified: false,
            disqualify_reason: null,
            missing_info: ['name', 'phone', 'address', 'service_type', 'problem_description'],
            sentiment: 'neutral'
        });
    }
    // Conversational response (not JSON)
    if (lowerMsg.includes('95 degrees') || lowerMsg.includes('ac is broken')) {
        return "That sounds really uncomfortable! I understand this is urgent with the heat. I'm here to help get your AC fixed quickly. Can I start with your name?";
    }
    if (lowerMsg.includes('john smith')) {
        return "Thanks John! What's the best phone number to reach you at?";
    }
    if (lowerMsg.includes('main street') || lowerMsg.includes('springfield')) {
        return "Got it. What's the best phone number to reach you at?";
    }
    if (lowerMsg.match(/\d{3}[-.]?\d{3}[-.]?\d{4}/)) {
        return "Perfect! I have everything I need. Let me check availability and get this scheduled for you as soon as possible.";
    }
    if (lowerMsg.includes('asap') || lowerMsg.includes('unbearable')) {
        return "I completely understand - 95 degrees is dangerous. I'm flagging this as urgent and will get you scheduled as soon as possible.";
    }
    // Default conversational response
    return "I understand. Can you tell me a bit more about what's happening?";
}
// Base URL for Moonshot API
const MOONSHOT_BASE_URL = 'https://api.moonshot.ai/v1';
/**
 * Call the LLM API (Moonshot or OpenAI compatible)
 */
async function callLLM(messages, options = {}) {
    const provider = getProvider();
    const model = getModel();
    const apiKey = getApiKey();
    // Use mock provider for testing
    if (provider === 'mock') {
        console.log('[LLM] Using MOCK provider (set LLM_PROVIDER=openai, gemini, or moonshot for real LLM)');
        const content = await mockLLMResponse(messages);
        return { content, usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } };
    }
    // Handle Gemini separately (different API format)
    if (provider === 'gemini') {
        return callGemini(messages, options);
    }
    // Determine base URL based on provider
    let baseUrl;
    if (provider === 'moonshot') {
        baseUrl = 'https://api.moonshot.ai/v1';
    }
    else {
        baseUrl = 'https://api.openai.com/v1';
    }
    console.log(`[LLM] Using provider: ${provider}, model: ${model}`);
    console.log(`[LLM] API Key (first 20 chars): ${apiKey.substring(0, 20)}...`);
    console.log(`[LLM] Base URL: ${baseUrl}`);
    // Moonshot Kimi models only accept temperature = 1
    const temperature = provider === 'moonshot' ? 1 : (options.temperature ?? 0.7);
    const body = {
        model: model,
        messages,
        temperature: temperature,
        max_tokens: options.maxTokens ?? 500,
    };
    // Only add response_format for OpenAI, not Moonshot (Kimi doesn't support it well)
    if (provider !== 'moonshot' && options.responseFormat) {
        body.response_format = options.responseFormat;
    }
    // For Moonshot, add a user message asking for JSON format
    if (provider === 'moonshot' && options.responseFormat?.type === 'json_object') {
        body.messages = [...messages, { role: 'user', content: 'Please respond with valid JSON only, no markdown, no explanation.' }];
    }
    else if (provider === 'moonshot' && !options.responseFormat) {
        // For text generation, add instruction to output directly
        body.messages = [...messages, { role: 'user', content: 'Respond directly with your message. Do not include reasoning or explanations.' }];
    }
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`LLM API error: ${response.status} ${error}`);
    }
    const data = await response.json();
    console.log('[LLM] Response:', JSON.stringify(data, null, 2).substring(0, 500));
    const message = data.choices[0]?.message;
    let content = message?.content || '';
    // For Moonshot Kimi models, content may be empty and reasoning contains the thought process
    // Try to extract JSON from content first, then from reasoning_content if needed
    if (!content && message?.reasoning_content) {
        // Look for JSON object in the reasoning content
        const reasoning = message.reasoning_content;
        // Find the first { and last } to extract the JSON object
        const startIdx = reasoning.indexOf('{');
        const endIdx = reasoning.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            content = reasoning.substring(startIdx, endIdx + 1);
        }
    }
    return {
        content: content,
        usage: data.usage,
    };
}
// Gemini-specific API call
async function callGemini(messages, options = {}) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    const model = process.env.LLM_MODEL || 'gemini-1.5-flash';
    console.log(`[LLM] Using provider: gemini, model: ${model}`);
    // Convert messages to Gemini format
    const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));
    // Add JSON instruction if needed
    if (options.responseFormat?.type === 'json_object') {
        contents.push({
            role: 'user',
            parts: [{ text: 'Please respond with valid JSON only, no markdown, no explanation.' }]
        });
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents,
            generationConfig: {
                temperature: options.temperature ?? 0.7,
                maxOutputTokens: options.maxTokens ?? 500,
            }
        }),
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${error}`);
    }
    const data = await response.json();
    console.log('[LLM] Gemini Response:', JSON.stringify(data, null, 2).substring(0, 500));
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
        content,
        usage: {
            prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
            completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
            total_tokens: data.usageMetadata?.totalTokenCount || 0,
        }
    };
}
/**
 * Generate a conversational response using LLM with structured output
 */
async function generateResponse(messages, schema, options = {}) {
    // Add schema instruction to system message
    const schemaDescription = JSON.stringify(schema.description || 'Return valid JSON');
    const messagesWithSchema = messages.map((m, i) => i === 0 && m.role === 'system'
        ? { ...m, content: `${m.content}\n\nYou must respond with valid JSON matching this schema:\n${schemaDescription}` }
        : m);
    const response = await callLLM(messagesWithSchema, {
        ...options,
        responseFormat: { type: 'json_object' },
    });
    if (!response.content) {
        throw new Error('No content in LLM response');
    }
    // Parse and validate the response
    const parsed = JSON.parse(response.content);
    return schema.parse(parsed);
}
/**
 * Simple text generation without structured output
 */
async function generateText(messages, options = {}) {
    const response = await callLLM(messages, {
        ...options,
        maxTokens: options.maxTokens ?? 300,
    });
    return response.content;
}
/**
 * Extract entities from customer message
 */
async function extractEntities(message, existingData = {}) {
    const schema = zod_1.z.object({
        name: zod_1.z.union([zod_1.z.string(), zod_1.z.null()]).transform(val => typeof val === 'string' ? val : null).nullable().default(null).describe('Customer name if mentioned'),
        phone: zod_1.z.union([zod_1.z.string(), zod_1.z.null()]).transform(val => typeof val === 'string' ? val : null).nullable().default(null).describe('Phone number if mentioned'),
        address: zod_1.z.union([zod_1.z.string(), zod_1.z.object({}).passthrough(), zod_1.z.null()])
            .transform(val => {
            if (val === null)
                return null;
            if (typeof val === 'string')
                return val;
            // If it's an object, try to extract address fields or convert to string
            if (typeof val === 'object') {
                const parts = [];
                if (val.street)
                    parts.push(val.street);
                if (val.city)
                    parts.push(val.city);
                if (val.state)
                    parts.push(val.state);
                if (val.zip)
                    parts.push(val.zip);
                if (parts.length > 0)
                    return parts.join(', ');
                // Fallback: stringify the object
                return JSON.stringify(val);
            }
            return null;
        })
            .nullable()
            .default(null)
            .describe('Service address if mentioned'),
        service_type: zod_1.z.union([zod_1.z.enum(['plumbing', 'electrical', 'hvac', 'appliance', 'other', 'unknown']), zod_1.z.null()])
            .transform(val => val === null ? 'unknown' : val)
            .default('unknown')
            .describe('Type of service needed'),
        problem_description: zod_1.z.union([zod_1.z.string(), zod_1.z.null()]).transform(val => typeof val === 'string' ? val : null).nullable().default(null).describe('Description of the problem'),
        urgency: zod_1.z.union([zod_1.z.enum(['high', 'medium', 'low', 'unknown']), zod_1.z.null()])
            .transform(val => val === null ? 'unknown' : val)
            .default('unknown')
            .describe('Urgency level based on problem description'),
        preferred_time: zod_1.z.string().nullable().default(null).describe('When customer wants service (e.g., today, tomorrow, morning)'),
        is_disqualified: zod_1.z.boolean().default(false).describe('True if this is spam, wrong number, or outside service area'),
        disqualify_reason: zod_1.z.string().nullable().default(null).describe('Why this lead is disqualified'),
        missing_info: zod_1.z.union([zod_1.z.array(zod_1.z.string()), zod_1.z.record(zod_1.z.any())]).transform(val => {
            if (Array.isArray(val))
                return val;
            // Handle object format: {name: true} means name is missing
            // or {name: null} means name is missing
            return Object.entries(val).filter(([_, v]) => v === true || v === null || v === '' || v === undefined).map(([k]) => k);
        }).default([]).describe('List of required info still needed (name, phone, address, service_type, problem_description)'),
        sentiment: zod_1.z.union([zod_1.z.enum(['urgent', 'frustrated', 'neutral', 'happy']), zod_1.z.null()])
            .transform(val => val === null ? 'neutral' : val)
            .default('neutral')
            .describe('Customer sentiment'),
        // New field to track if this is a confirmation/agreement response
        is_confirmation: zod_1.z.boolean().default(false).describe('True if customer is saying yes, ok, sure, confirming, or agreeing to proceed'),
    });
    const systemPrompt = `You are an AI assistant for a home service business (plumbing, electrical, HVAC).
Extract information from the customer's message. Be thorough but concise.

Existing information already collected:
${JSON.stringify(existingData, null, 2)}

CRITICAL RULES:
- Only extract what's actually in the message, don't guess
- For service_type, categorize into: plumbing, electrical, hvac, appliance, or other
- Urgency: high = emergency (burst pipe, no heat in winter, electrical spark), medium = needs attention soon (leak, not working), low = routine/maintenance. Default to 'medium' if unclear.
- is_disqualified = ONLY true for: spam, marketing solicitations, wrong numbers, out-of-area requests, or if customer explicitly says they don't want service
- NEVER disqualify for: "yes", "ok", "sure", "sounds good", "let's do it", "I'm in", "confirmed", "absolutely", "definitely" - these are confirmations, not disqualifications
- is_confirmation = true when customer agrees or confirms: "yes", "ok", "sure", "sounds good", "let's do it", "confirmed", "absolutely", "definitely", "I'm in", "great", "perfect"
- missing_info MUST list fields that are NULL in existingData AND were NOT provided in the current message. Example: if name is null and customer didn't say their name, include "name" in missing_info.
- If customer gives partial info (like just a first name), extract it - don't require full name
- Phone numbers can be given in any format - extract the digits
- Addresses can be partial (street name, city, etc.) - extract what they give
- IMPORTANT: If customer describes a problem (AC not working, leak, etc.), ALWAYS extract it as problem_description
- NEVER return empty missing_info array unless ALL fields (name, phone, address, service_type, problem_description) are filled`;
    // Add examples for better extraction
    const examples = `
Examples of problem descriptions to extract:
- "My AC is blowing hot air" -> problem_description: "AC is blowing hot air"
- "I have a leak under my sink" -> problem_description: "Leak under sink"
- "No heat in my house" -> problem_description: "No heat in house"
- "Toilet is clogged" -> problem_description: "Toilet clogged"
- "Lights are flickering" -> problem_description: "Lights flickering"
`;
    return generateResponse([
        { role: 'system', content: systemPrompt + examples },
        { role: 'user', content: message },
    ], schema, { temperature: 0.3 });
}
/**
 * Generate natural conversational response
 */
async function generateConversationalResponse(conversationHistory, extractedData, missingInfo, isUrgent) {
    const systemPrompt = `You are a friendly, professional AI receptionist for a home service business.
Your job is to collect information from customers. DO NOT say you will schedule the appointment - just collect the info.

Guidelines:
- Be warm and conversational, not robotic
- Ask for ALL missing information in ONE message (not one at a time)
- If urgent (burst pipe, no heat, electrical issue), acknowledge the urgency and reassure them
- Keep responses concise (2-3 sentences max)
- Don't repeat information they've already provided
- NEVER say "I'll schedule you" or "You're all set" - just collect information
- When all info is collected, say "Let me get you scheduled" not "You are scheduled"

Service types: plumbing, electrical, HVAC, appliance repair
Business hours: Monday-Friday 8am-6pm, Saturday 9am-4pm
Emergency service available 24/7 for urgent issues`;
    const context = `
Information collected so far:
${JSON.stringify(extractedData, null, 2)}

Still need: ${missingInfo.join(', ')}
${isUrgent ? '\nThis is an URGENT request - prioritize speed and reassurance.' : ''}`;
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: context },
        ...conversationHistory.map(h => ({ role: h.role, content: h.content })),
    ];
    return generateText(messages, { temperature: 0.8, maxTokens: 150 });
}
/**
 * Generate scheduling response with available slots
 */
async function generateSchedulingResponse(customerData, availableSlots, isReschedule = false) {
    const schema = zod_1.z.object({
        response: zod_1.z.union([zod_1.z.string(), zod_1.z.object({ message: zod_1.z.string() }).transform(obj => obj.message)])
            .describe('Natural language response presenting the options'),
        slot_references: zod_1.z.union([zod_1.z.array(zod_1.z.number()), zod_1.z.array(zod_1.z.string()), zod_1.z.null(), zod_1.z.undefined()])
            .transform(val => {
            if (!val)
                return [];
            if (Array.isArray(val)) {
                return val.map(v => typeof v === 'string' ? parseInt(v, 10) : v).filter(n => !isNaN(n));
            }
            return [];
        })
            .default([])
            .describe('Indices of slots mentioned (0-based)'),
    });
    // Helper to format time to 12-hour
    const formatTime12Hour = (time24) => {
        const [hours, minutes] = time24.split(':').map(Number);
        const period = hours >= 12 ? 'PM' : 'AM';
        const hours12 = hours % 12 || 12;
        return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
    };
    const slotText = availableSlots.map((slot, i) => {
        const date = new Date(slot.date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        return `${i + 1}. ${dayName} at ${formatTime12Hour(slot.time)}`;
    }).join('\n');
    const systemPrompt = `You are a scheduling assistant for a home service business.
${isReschedule ? 'The customer wants to reschedule their appointment.' : 'Present the available appointment slots in a friendly, natural way.'}

Guidelines:
- Present 2-3 options clearly
- Ask which works best for them
- Mention the service type (${customerData.service_type}) naturally
- Keep it conversational, not robotic
- If urgent, emphasize the earliest available time`;
    const context = `
Customer: ${customerData.name}
Service: ${customerData.service_type}
Urgency: ${customerData.urgency}

Available slots:
${slotText}`;
    const result = await generateResponse([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: context },
    ], schema, { temperature: 0.7 });
    return result.response;
}
/**
 * Parse customer's time selection from natural language
 */
async function parseTimeSelection(customerMessage, availableSlots) {
    const schema = zod_1.z.object({
        selected_slot_index: zod_1.z.union([zod_1.z.number(), zod_1.z.null(), zod_1.z.undefined()])
            .transform(val => val === undefined ? null : val)
            .describe('Index of selected slot (0-based), or null if unclear'),
        selected_slot: zod_1.z.union([zod_1.z.number(), zod_1.z.null(), zod_1.z.undefined()])
            .transform(val => val === undefined ? null : val)
            .describe('Alternative field for slot index'),
        confidence: zod_1.z.union([zod_1.z.number(), zod_1.z.undefined()]).default(0.5).describe('Confidence level 0-1'),
        clarification_needed: zod_1.z.union([zod_1.z.boolean(), zod_1.z.undefined()]).default(false).describe('True if we need to ask for clarification'),
    }).transform(obj => ({
        ...obj,
        selected_slot_index: obj.selected_slot_index ?? obj.selected_slot ?? null
    }));
    const slotText = availableSlots.map((slot, i) => {
        const date = new Date(slot.date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        return `[${i}] ${dayName} at ${slot.time}`;
    }).join('\n');
    const systemPrompt = `Parse the customer's time selection from their message.
Available slots are provided with indices. Determine which slot they selected.`;
    const result = await generateResponse([
        { role: 'system', content: systemPrompt },
        { role: 'system', content: `Available slots:\n${slotText}` },
        { role: 'user', content: customerMessage },
    ], schema, { temperature: 0.3 });
    if (result.selected_slot_index !== null && result.selected_slot_index < availableSlots.length) {
        return availableSlots[result.selected_slot_index];
    }
    return null;
}
//# sourceMappingURL=llm.js.map