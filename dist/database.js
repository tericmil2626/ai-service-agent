"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
    const fs = await Promise.resolve().then(() => __importStar(require('fs')));
    const schema = fs.readFileSync(path_1.default.join(process.cwd(), 'schema.sql'), 'utf-8');
    // Split by semicolon and execute each statement
    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
        await database.exec(statement);
    }
    console.log('Database initialized successfully');
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
    const result = await db.run(`INSERT INTO appointments (job_id, scheduled_date, scheduled_time, technician_id, notes)
     VALUES (?, ?, ?, ?, ?)`, [data.job_id, data.scheduled_date || null, data.scheduled_time || null, data.technician_id || null, data.notes || null]);
    return result.lastID;
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
