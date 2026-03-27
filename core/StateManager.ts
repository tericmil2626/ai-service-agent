import { getDb } from '../database';
import { ConversationState } from '../types/agents';

// State manager for persisting conversation state across requests
export class ConversationStateManager {
  async getState(customerPhone: string): Promise<ConversationState | null> {
    const db = await getDb();
    
    // Get customer
    const customer = await db.get('SELECT * FROM customers WHERE phone = ?', customerPhone);
    if (!customer) return null;

    // Get active job
    const job = await db.get(
      `SELECT * FROM jobs 
       WHERE customer_id = ? 
       AND status NOT IN ('completed', 'cancelled', 'closed') 
       ORDER BY created_at DESC LIMIT 1`,
      customer.id
    );

    // Get last conversation state if stored
    const stateRecord = await db.get(
      `SELECT * FROM conversation_states 
       WHERE customer_id = ? 
       ORDER BY updated_at DESC LIMIT 1`,
      customer.id
    );

    if (stateRecord) {
      return {
        customerId: customer.id,
        jobId: job?.id,
        currentAgent: stateRecord.current_agent,
        status: stateRecord.status,
        context: JSON.parse(stateRecord.context || '{}'),
        lastMessageAt: new Date(stateRecord.updated_at),
      };
    }

    // No stored state, return basic state
    return {
      customerId: customer.id,
      jobId: job?.id,
      status: job ? this.mapJobStatus(job.status) : 'new',
      context: {},
      lastMessageAt: job ? new Date(job.updated_at) : new Date(),
    };
  }

  async saveState(customerPhone: string, state: Partial<ConversationState>): Promise<void> {
    const db = await getDb();
    
    // Try to find existing customer
    let customer = await db.get('SELECT id FROM customers WHERE phone = ?', customerPhone);
    
    // If no customer exists yet, create a temporary one with just the phone number
    if (!customer) {
      const result = await db.run(
        'INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)',
        ['Pending', customerPhone, 'TBD']
      );
      customer = { id: result.lastID };
      state.customerId = customer.id;
    }

    // Delete existing state first (SQLite compatibility)
    await db.run('DELETE FROM conversation_states WHERE customer_id = ?', customer.id);

    // Insert new state
    await db.run(
      `INSERT INTO conversation_states (customer_id, job_id, current_agent, status, context, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        customer.id,
        state.jobId || null,
        state.currentAgent || null,
        state.status || 'new',
        JSON.stringify(state.context || {}),
      ]
    );
  }

  async clearState(customerPhone: string): Promise<void> {
    const db = await getDb();
    const customer = await db.get('SELECT id FROM customers WHERE phone = ?', customerPhone);
    if (!customer) return;

    await db.run('DELETE FROM conversation_states WHERE customer_id = ?', customer.id);
  }

  private mapJobStatus(jobStatus: string): ConversationState['status'] {
    const statusMap: Record<string, ConversationState['status']> = {
      new: 'new',
      qualified: 'intake',
      scheduled: 'scheduling',
      dispatched: 'dispatch',
      in_progress: 'dispatch',
      awaiting_followup: 'followup',
      completed: 'completed',
      cancelled: 'completed',
    };
    return statusMap[jobStatus] || 'new';
  }
}
