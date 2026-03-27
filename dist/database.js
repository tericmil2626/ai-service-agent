"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.initDatabase = initDatabase;
exports.createCustomer = createCustomer;
exports.findCustomerByPhone = findCustomerByPhone;
exports.findOrCreateCustomer = findOrCreateCustomer;
exports.getCustomerById = getCustomerById;
exports.createJob = createJob;
exports.getJobById = getJobById;
exports.updateJobStatus = updateJobStatus;
exports.saveMessage = saveMessage;
exports.getConversationHistory = getConversationHistory;
exports.createAppointment = createAppointment;
exports.getAppointmentsByDate = getAppointmentsByDate;
exports.createMissedCall = createMissedCall;
exports.getMissedCallById = getMissedCallById;
exports.updateMissedCallTextBack = updateMissedCallTextBack;
exports.getRecentMissedCalls = getRecentMissedCalls;
exports.getRecentTextBacks = getRecentTextBacks;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLogs = getCallLogs;
exports.getCallLogBySid = getCallLogBySid;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const path_1 = __importDefault(require("path"));
const DB_PATH = path_1.default.join(process.cwd(), 'data', 'service-business.db');
let db = null;
async function getDb() {
    if (!db) {
        db = await (0, sqlite_1.open)({
            filename: DB_PATH,
            driver: sqlite3_1.default.Database
        });
        // Enable foreign keys
        await db.run('PRAGMA foreign_keys = ON');
    }
    return db;
}
async function initDatabase() {
    const database = await getDb();
    // Read and execute schema
    const fs = await import('fs');
    const schema = fs.readFileSync(path_1.default.join(process.cwd(), 'schema.sql'), 'utf-8');
    // Split by semicolon and execute each statement
    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
        try {
            await database.exec(statement);
        }
        catch (error) {
            // Ignore "already exists" errors for indexes and tables
            if (!error.message?.includes('already exists')) {
                console.warn('Schema statement warning:', error.message);
            }
        }
    }
    // Migration: Add unique constraint if it doesn't exist (SQLite doesn't support ALTER TABLE ADD CONSTRAINT)
    // We need to recreate the table with the constraint
    await addUniqueConstraintIfMissing(database);
    console.log('Database initialized successfully');
}
async function addUniqueConstraintIfMissing(db) {
    try {
        // Check if the unique constraint already exists by trying to insert a duplicate
        // A simpler check: see if we can create a unique index
        await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique_slot ON appointments(scheduled_date, scheduled_time)`);
        console.log('[DB] Unique constraint index added/verified for appointments');
    }
    catch (error) {
        console.warn('[DB] Could not add unique constraint:', error.message);
    }
}
// Customer operations
async function createCustomer(data) {
    const db = await getDb();
    const result = await db.run(`INSERT INTO customers (name, phone, email, address, city, state, zip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [data.name, data.phone, data.email || null, data.address, data.city || null, data.state || null, data.zip || null]);
    return result.lastID;
}
async function findCustomerByPhone(phone) {
    const db = await getDb();
    return db.get('SELECT * FROM customers WHERE phone = ?', phone);
}
async function findOrCreateCustomer(data) {
    // Try to find existing customer by phone
    let customer = await findCustomerByPhone(data.phone);
    if (!customer) {
        // Create new customer
        const id = await createCustomer(data);
        customer = await getCustomerById(id);
    }
    return customer;
}
async function getCustomerById(id) {
    const db = await getDb();
    return db.get('SELECT * FROM customers WHERE id = ?', id);
}
// Job operations
async function createJob(data) {
    const db = await getDb();
    const result = await db.run(`INSERT INTO jobs (customer_id, service_type, description, urgency, source)
     VALUES (?, ?, ?, ?, ?)`, [data.customer_id, data.service_type, data.description || null, data.urgency || 'medium', data.source || 'unknown']);
    return result.lastID;
}
async function getJobById(id) {
    const db = await getDb();
    return db.get('SELECT * FROM jobs WHERE id = ?', id);
}
async function updateJobStatus(id, status) {
    const db = await getDb();
    await db.run('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
}
// Conversation operations
async function saveMessage(data) {
    const db = await getDb();
    await db.run(`INSERT INTO conversations (customer_id, job_id, channel, direction, message_text, agent_name, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        data.customer_id,
        data.job_id || null,
        data.channel,
        data.direction,
        data.message_text,
        data.agent_name || null,
        data.metadata ? JSON.stringify(data.metadata) : null
    ]);
}
async function getConversationHistory(customerId, limit = 50) {
    const db = await getDb();
    return db.all(`SELECT * FROM conversations 
     WHERE customer_id = ? 
     ORDER BY created_at DESC 
     LIMIT ?`, [customerId, limit]);
}
// Appointment operations
async function createAppointment(data) {
    const db = await getDb();
    try {
        const result = await db.run(`INSERT INTO appointments (job_id, scheduled_date, scheduled_time, technician_id, notes)
       VALUES (?, ?, ?, ?, ?)`, [data.job_id, data.scheduled_date || null, data.scheduled_time || null, data.technician_id || null, data.notes || null]);
        return result.lastID || null;
    }
    catch (error) {
        // Check if it's a unique constraint violation (slot already booked)
        if (error.message?.includes('UNIQUE constraint failed') || error.message?.includes('idx_appointments_unique_slot')) {
            console.log('[DB] Slot already booked:', data.scheduled_date, data.scheduled_time);
            return null;
        }
        throw error;
    }
}
async function getAppointmentsByDate(date) {
    const db = await getDb();
    return db.all(`SELECT a.*, c.name as customer_name, c.address, c.phone, j.service_type, j.description
     FROM appointments a
     JOIN jobs j ON a.job_id = j.id
     JOIN customers c ON j.customer_id = c.id
     WHERE a.scheduled_date = ?
     ORDER BY a.scheduled_time`, [date]);
}
// Missed call operations
async function createMissedCall(data) {
    const db = await getDb();
    const result = await db.run(`INSERT INTO missed_calls (customer_phone, business_phone, call_sid, call_status)
     VALUES (?, ?, ?, ?)`, [data.customer_phone, data.business_phone, data.call_sid || null, data.call_status]);
    return result.lastID;
}
async function getMissedCallById(id) {
    const db = await getDb();
    return db.get('SELECT * FROM missed_calls WHERE id = ?', id);
}
async function updateMissedCallTextBack(id, message, jobId) {
    const db = await getDb();
    await db.run(`UPDATE missed_calls 
     SET text_back_sent = 1, text_back_message = ?, text_back_sent_at = CURRENT_TIMESTAMP, converted_to_lead = ?, job_id = ?
     WHERE id = ?`, [message, jobId ? 1 : 0, jobId || null, id]);
}
async function getRecentMissedCalls(phone, minutes = 30) {
    const db = await getDb();
    return db.all(`SELECT * FROM missed_calls 
     WHERE customer_phone = ? 
       AND created_at > datetime('now', '-${minutes} minutes')
     ORDER BY created_at DESC`, [phone]);
}
async function getRecentTextBacks(phone, minutes = 5) {
    const db = await getDb();
    return db.all(`SELECT * FROM missed_calls
     WHERE customer_phone = ?
       AND created_at > datetime('now', '-${minutes} minutes')
       AND text_back_sent = 1
     ORDER BY created_at DESC`, [phone]);
}
// Call log operations
async function createCallLog(data) {
    const db = await getDb();
    const result = await db.run(`INSERT OR IGNORE INTO call_logs (call_sid, customer_phone, business_phone, direction, status, transcript)
     VALUES (?, ?, ?, ?, 'in-progress', '[]')`, [data.call_sid, data.customer_phone, data.business_phone, data.direction || 'inbound']);
    return result.lastID;
}
async function updateCallLog(callSid, data) {
    const db = await getDb();
    const fields = [];
    const values = [];
    if (data.status !== undefined) {
        fields.push('status = ?');
        values.push(data.status);
    }
    if (data.duration_seconds !== undefined) {
        fields.push('duration_seconds = ?');
        values.push(data.duration_seconds);
    }
    if (data.transcript !== undefined) {
        fields.push('transcript = ?');
        values.push(data.transcript);
    }
    if (data.recording_url !== undefined) {
        fields.push('recording_url = ?');
        values.push(data.recording_url);
    }
    if (data.job_id !== undefined) {
        fields.push('job_id = ?');
        values.push(data.job_id);
    }
    if (fields.length === 0)
        return;
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(callSid);
    await db.run(`UPDATE call_logs SET ${fields.join(', ')} WHERE call_sid = ?`, values);
}
async function getCallLogs(options = {}) {
    const db = await getDb();
    const limit = options.limit || 50;
    const days = options.days || 30;
    return db.all(`SELECT cl.*, c.name as customer_name
     FROM call_logs cl
     LEFT JOIN customers c ON cl.customer_phone = c.phone
     WHERE cl.created_at > datetime('now', '-${days} days')
     ORDER BY cl.created_at DESC
     LIMIT ?`, [limit]);
}
async function getCallLogBySid(callSid) {
    const db = await getDb();
    return db.get('SELECT * FROM call_logs WHERE call_sid = ?', callSid);
}
//# sourceMappingURL=database.js.map