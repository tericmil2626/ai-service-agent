import { getDb } from '../database';
import { ConversationState } from '../types/agents';

// State manager for persisting conversation state across requests
export class ConversationStateManager {
  async getState(customerPhone: string): Promise<ConversationState | null> {
    const db = await getDb();

    const customer = await db.get('SELECT * FROM customers WHERE phone = ?', customerPhone);
    if (!customer) return null;

    const stateRecord = await db.get(
      `SELECT * FROM conversation_states
       WHERE customer_id = ?
       ORDER BY updated_at DESC LIMIT 1`,
      customer.id
    );

    if (stateRecord) {
      return {
        customerId: customer.id,
        jobId: stateRecord.job_id ?? undefined,
        currentAgent: stateRecord.current_agent ?? undefined,
        status: stateRecord.status,
        context: JSON.parse(stateRecord.context || '{}'),
        lastMessageAt: new Date(stateRecord.updated_at),
      };
    }

    // No stored state — derive from most recent active job
    const job = await db.get(
      `SELECT * FROM jobs
       WHERE customer_id = ?
       AND status NOT IN ('completed', 'cancelled', 'closed')
       ORDER BY created_at DESC LIMIT 1`,
      customer.id
    );

    const derivedStatus = job ? this.mapJobStatus(job.status) : 'new';
    console.log(`[StateManager] No state record. Job status: ${job?.status}, derived status: ${derivedStatus}`);
    return {
      customerId: customer.id,
      jobId: job?.id,
      status: derivedStatus,
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

    await db.run('BEGIN');
    try {
      await db.run('DELETE FROM conversation_states WHERE customer_id = ?', customer.id);
      await db.run(
        `INSERT INTO conversation_states (customer_id, job_id, current_agent, status, context, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          customer.id,
          state.jobId ?? null,
          state.currentAgent ?? null,
          state.status || 'new',
          JSON.stringify(state.context || {}),
        ]
      );
      await db.run('COMMIT');
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  }

  async clearState(customerPhone: string): Promise<void> {
    const db = await getDb();
    const customer = await db.get('SELECT id FROM customers WHERE phone = ?', customerPhone);
    if (!customer) return;

    await db.run('BEGIN');
    try {
      await db.run('DELETE FROM conversation_states WHERE customer_id = ?', customer.id);
      await db.run(
        `INSERT INTO conversation_states (customer_id, status, current_agent, context, updated_at)
         VALUES (?, 'new', NULL, '{}', CURRENT_TIMESTAMP)`,
        [customer.id]
      );
      await db.run('COMMIT');
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
    console.log(`[StateManager] Cleared state for customer ${customer.id}`);
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
