"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationStateManager = void 0;
const database_1 = require("../database");
// State manager for persisting conversation state across requests
class ConversationStateManager {
    async getState(customerPhone) {
        const db = await (0, database_1.getDb)();
        // Get customer
        const customer = await db.get('SELECT * FROM customers WHERE phone = ?', customerPhone);
        if (!customer)
            return null;
        // Get active job
        const job = await db.get(`SELECT * FROM jobs 
       WHERE customer_id = ? 
       AND status NOT IN ('completed', 'cancelled', 'closed') 
       ORDER BY created_at DESC LIMIT 1`, customer.id);
        // Get last conversation state if stored
        const stateRecord = await db.get(`SELECT * FROM conversation_states 
       WHERE customer_id = ? 
       ORDER BY updated_at DESC LIMIT 1`, customer.id);
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
    async saveState(customerPhone, state) {
        const db = await (0, database_1.getDb)();
        // Try to find existing customer
        let customer = await db.get('SELECT id FROM customers WHERE phone = ?', customerPhone);
        // If no customer exists yet, create a temporary one with just the phone number
        if (!customer) {
            const result = await db.run('INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)', ['Pending', customerPhone, 'TBD']);
            customer = { id: result.lastID };
            state.customerId = customer.id;
        }
        // Delete existing state first (SQLite compatibility)
        await db.run('DELETE FROM conversation_states WHERE customer_id = ?', customer.id);
        // Insert new state
        await db.run(`INSERT INTO conversation_states (customer_id, job_id, current_agent, status, context, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [
            customer.id,
            state.jobId || null,
            state.currentAgent || null,
            state.status || 'new',
            JSON.stringify(state.context || {}),
        ]);
    }
    async clearState(customerPhone) {
        const db = await (0, database_1.getDb)();
        const customer = await db.get('SELECT id FROM customers WHERE phone = ?', customerPhone);
        if (!customer)
            return;
        // Delete old state
        await db.run('DELETE FROM conversation_states WHERE customer_id = ?', customer.id);
        // Insert fresh state with 'new' status to override job-derived status
        await db.run(`INSERT INTO conversation_states (customer_id, status, current_agent, context, updated_at)
       VALUES (?, 'new', NULL, '{}', CURRENT_TIMESTAMP)`, [customer.id]);
        console.log(`[StateManager] Cleared state and inserted fresh 'new' status for customer ${customer.id}`);
    }
    mapJobStatus(jobStatus) {
        const statusMap = {
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
exports.ConversationStateManager = ConversationStateManager;
//# sourceMappingURL=StateManager.js.map