// Enhanced LLM Module with Token Budgeting
// Integrates claw-code patterns for cost control and monitoring

import { z } from 'zod';
import dotenv from 'dotenv';

// Load env vars immediately
dotenv.config();

// ============================================================================
// Token Usage Tracking (claw-code pattern)
// ============================================================================

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface LLMCallResult {
  content: string;
  usage: TokenUsage;
  model: string;
  finishReason?: string;
}

// ============================================================================
// Token Budget Manager (claw-code pattern)
// ============================================================================

export class TokenBudgetManager {
  private maxBudget: number;
  private currentUsage: TokenUsage;
  private callHistory: Array<{ timestamp: number; usage: TokenUsage; operation: string }>;

  constructor(maxBudgetTokens: number = 50000) {
    this.maxBudget = maxBudgetTokens;
    this.currentUsage = { input: 0, output: 0, total: 0 };
    this.callHistory = [];
  }

  recordCall(operation: string, usage: TokenUsage): TokenUsage {
    this.currentUsage.input += usage.input;
    this.currentUsage.output += usage.output;
    this.currentUsage.total += usage.total;
    
    this.callHistory.push({
      timestamp: Date.now(),
      usage: { ...usage },
      operation,
    });

    // Keep only last 100 calls
    if (this.callHistory.length > 100) {
      this.callHistory = this.callHistory.slice(-100);
    }

    return { ...this.currentUsage };
  }

  isOverBudget(): boolean {
    return this.currentUsage.total >= this.maxBudget;
  }

  getRemainingBudget(): number {
    return Math.max(0, this.maxBudget - this.currentUsage.total);
  }

  getUsage(): TokenUsage {
    return { ...this.currentUsage };
  }

  getBudgetPercentUsed(): number {
    return (this.currentUsage.total / this.maxBudget) * 100;
  }

  getCallHistory(): Array<{ timestamp: number; usage: TokenUsage; operation: string }> {
    return [...this.callHistory];
  }

  getStats(): {
    usage: TokenUsage;
    budgetPercentUsed: number;
    remainingBudget: number;
    isOverBudget: boolean;
    callCount: number;
  } {
    return {
      usage: this.getUsage(),
      budgetPercentUsed: this.getBudgetPercentUsed(),
      remainingBudget: this.getRemainingBudget(),
      isOverBudget: this.isOverBudget(),
      callCount: this.callHistory.length,
    };
  }
}

// Global budget manager for the service
const globalBudgetManager = new TokenBudgetManager(
  parseInt(process.env.LLM_TOKEN_BUDGET || '50000')
);

// ============================================================================
// LLM Provider Configuration
// ============================================================================

function getProvider() { return process.env.LLM_PROVIDER || 'openai'; }
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

// ============================================================================
// Enhanced LLM Functions with Token Tracking
// ============================================================================

export async function generateTextWithTracking(
  prompt: string,
  operation: string = 'generate',
  options?: {
    system?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<LLMCallResult> {
  // Check budget before calling
  if (globalBudgetManager.isOverBudget()) {
    throw new Error(`Token budget exceeded: ${globalBudgetManager.getUsage().total}/${globalBudgetManager.getRemainingBudget() + globalBudgetManager.getUsage().total}`);
  }

  const provider = getProvider();
  const model = getModel();
  
  let result: LLMCallResult;

  try {
    switch (provider) {
      case 'openai':
        result = await callOpenAI(prompt, model, options);
        break;
      case 'moonshot':
        result = await callMoonshot(prompt, model, options);
        break;
      case 'gemini':
        result = await callGemini(prompt, model, options);
        break;
      default:
        result = await callMock(prompt, options);
    }

    // Record usage
    globalBudgetManager.recordCall(operation, result.usage);
    
    // Log if approaching budget
    const percentUsed = globalBudgetManager.getBudgetPercentUsed();
    if (percentUsed > 80) {
      console.warn(`[LLM Budget] ${percentUsed.toFixed(1)}% used (${globalBudgetManager.getUsage().total}/${globalBudgetManager.getRemainingBudget() + globalBudgetManager.getUsage().total} tokens)`);
    }

    return result;
  } catch (error) {
    console.error(`[LLM] Error in ${operation}:`, error);
    throw error;
  }
}

// ============================================================================
// Provider Implementations
// ============================================================================

async function callOpenAI(
  prompt: string,
  model: string,
  options?: { system?: string; temperature?: number; maxTokens?: number }
): Promise<LLMCallResult> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const messages = [];
  if (options?.system) {
    messages.push({ role: 'system', content: options.system });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  
  return {
    content: data.choices[0]?.message?.content || '',
    usage: {
      input: data.usage?.prompt_tokens || 0,
      output: data.usage?.completion_tokens || 0,
      total: data.usage?.total_tokens || 0,
    },
    model: data.model,
    finishReason: data.choices[0]?.finish_reason,
  };
}

async function callMoonshot(
  prompt: string,
  model: string,
  options?: { system?: string; temperature?: number; maxTokens?: number }
): Promise<LLMCallResult> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error('Moonshot API key not configured');
  }

  const messages = [];
  if (options?.system) {
    messages.push({ role: 'system', content: options.system });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Moonshot API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  
  return {
    content: data.choices[0]?.message?.content || '',
    usage: {
      input: data.usage?.prompt_tokens || 0,
      output: data.usage?.completion_tokens || 0,
      total: data.usage?.total_tokens || 0,
    },
    model: data.model,
    finishReason: data.choices[0]?.finish_reason,
  };
}

async function callGemini(
  prompt: string,
  model: string,
  options?: { system?: string; temperature?: number; maxTokens?: number }
): Promise<LLMCallResult> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  // Estimate tokens for Gemini (they don't return usage)
  const estimatedInput = Math.ceil(prompt.length / 4);
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 1000,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const estimatedOutput = Math.ceil(content.length / 4);
  
  return {
    content,
    usage: {
      input: estimatedInput,
      output: estimatedOutput,
      total: estimatedInput + estimatedOutput,
    },
    model,
  };
}

async function callMock(
  prompt: string,
  options?: { system?: string; temperature?: number; maxTokens?: number }
): Promise<LLMCallResult> {
  // Mock response for testing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const estimatedInput = Math.ceil(prompt.length / 4);
  const mockResponse = "This is a mock response for testing purposes.";
  const estimatedOutput = Math.ceil(mockResponse.length / 4);
  
  return {
    content: mockResponse,
    usage: {
      input: estimatedInput,
      output: estimatedOutput,
      total: estimatedInput + estimatedOutput,
    },
    model: 'mock',
  };
}

// ============================================================================
// Budget Management API
// ============================================================================

export function getBudgetManager(): TokenBudgetManager {
  return globalBudgetManager;
}

export function getLLMStats(): ReturnType<TokenBudgetManager['getStats']> {
  return globalBudgetManager.getStats();
}

export function resetLLMBudget(newBudget?: number): void {
  globalBudgetManager['currentUsage'] = { input: 0, output: 0, total: 0 };
  globalBudgetManager['callHistory'] = [];
  if (newBudget) {
    globalBudgetManager['maxBudget'] = newBudget;
  }
}

// ============================================================================
// Backwards Compatibility
// ============================================================================

// Keep the old generateText for compatibility
export async function generateText(
  messages: any[],
  options?: { temperature?: number; maxTokens?: number; responseFormat?: any }
): Promise<string> {
  const lastMessage = messages.find(m => m.role === 'user')?.content || '';
  const systemMessage = messages.find(m => m.role === 'system')?.content;
  
  const result = await generateTextWithTracking(
    lastMessage,
    'generateText',
    {
      system: systemMessage,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    }
  );
  
  return result.content;
}

// Keep the old generateObject for compatibility
export async function generateObject<T>(
  messages: any[],
  schema: z.ZodSchema<T>,
  options?: { temperature?: number; maxTokens?: number }
): Promise<T> {
  const lastMessage = messages.find(m => m.role === 'user')?.content || '';
  const systemMessage = messages.find(m => m.role === 'system')?.content;
  
  const result = await generateTextWithTracking(
    lastMessage,
    'generateObject',
    {
      system: systemMessage,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    }
  );
  
  try {
    const parsed = JSON.parse(result.content);
    return schema.parse(parsed);
  } catch (error) {
    console.error('[LLM] Failed to parse structured output:', error);
    throw error;
  }
}
