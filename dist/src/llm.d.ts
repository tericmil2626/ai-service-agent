import { z } from 'zod';
interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
/**
 * Generate a conversational response using LLM with structured output
 */
export declare function generateResponse<T extends z.ZodType>(messages: LLMMessage[], schema: T, options?: {
    temperature?: number;
    maxTokens?: number;
}): Promise<z.infer<T>>;
/**
 * Simple text generation without structured output
 */
export declare function generateText(messages: LLMMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
}): Promise<string>;
/**
 * Extract entities from customer message
 */
export declare function extractEntities(message: string, existingData?: Record<string, any>): Promise<{
    phone: string | null;
    name: string | null;
    address: string | null;
    preferred_time: string | null;
    service_type: "unknown" | "plumbing" | "electrical" | "hvac" | "appliance" | "other";
    problem_description: string | null;
    urgency: "medium" | "unknown" | "high" | "low";
    is_disqualified: boolean;
    disqualify_reason: string | null;
    missing_info: any[];
    sentiment: "urgent" | "neutral" | "frustrated" | "happy";
    is_confirmation: boolean;
}>;
/**
 * Generate natural conversational response
 */
export declare function generateConversationalResponse(conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
}>, extractedData: Record<string, any>, missingInfo: string[], isUrgent: boolean): Promise<string>;
/**
 * Generate scheduling response with available slots
 */
export declare function generateSchedulingResponse(customerData: Record<string, any>, availableSlots: Array<{
    date: string;
    time: string;
}>, isReschedule?: boolean): Promise<string>;
/**
 * Parse customer's time selection from natural language
 */
export declare function parseTimeSelection(customerMessage: string, availableSlots: Array<{
    date: string;
    time: string;
}>): Promise<{
    date: string;
    time: string;
} | null>;
export {};
//# sourceMappingURL=llm.d.ts.map