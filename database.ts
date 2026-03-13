import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'service-business.db');

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON');
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  const database = await getDb();
  
  // Read and execute schema
  const fs = await import('fs');
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf-8');
  
  // Split by semicolon and execute each statement
  const statements = schema.split(';').filter(s => s.trim());
  for (const statement of statements) {
    await database.exec(statement);
  }
  
  console.log('Database initialized successfully');
}

// Customer operations
export async function createCustomer(data: {
  name: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
}) {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO customers (name, phone, email, address, city, state, zip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.name, data.phone, data.email || null, data.address, data.city || null, data.state || null, data.zip || null]
  );
  return result.lastID;
}

export async function findCustomerByPhone(phone: string) {
  const db = await getDb();
  return db.get('SELECT * FROM customers WHERE phone = ?', phone);
}

export async function findOrCreateCustomer(data: {
  name: string;
  phone: string;
  address: string;
}) {
  // Try to find existing customer by phone
  let customer = await findCustomerByPhone(data.phone);
  
  if (!customer) {
    // Create new customer
    const id = await createCustomer(data);
    customer = await getCustomerById(id as number);
  }
  
  return customer;
}

export async function getCustomerById(id: number) {
  const db = await getDb();
  return db.get('SELECT * FROM customers WHERE id = ?', id);
}

// Job operations
export async function createJob(data: {
  customer_id: number;
  service_type: string;
  description?: string;
  urgency?: string;
  source?: string;
}) {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO jobs (customer_id, service_type, description, urgency, source)
     VALUES (?, ?, ?, ?, ?)`,
    [data.customer_id, data.service_type, data.description || null, data.urgency || 'medium', data.source || 'unknown']
  );
  return result.lastID;
}

export async function getJobById(id: number) {
  const db = await getDb();
  return db.get('SELECT * FROM jobs WHERE id = ?', id);
}

export async function updateJobStatus(id: number, status: string) {
  const db = await getDb();
  await db.run(
    'UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, id]
  );
}

// Conversation operations
export async function saveMessage(data: {
  customer_id: number;
  job_id?: number;
  channel: string;
  direction: 'inbound' | 'outbound';
  message_text: string;
  agent_name?: string;
  metadata?: object;
}) {
  const db = await getDb();
  await db.run(
    `INSERT INTO conversations (customer_id, job_id, channel, direction, message_text, agent_name, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.customer_id,
      data.job_id || null,
      data.channel,
      data.direction,
      data.message_text,
      data.agent_name || null,
      data.metadata ? JSON.stringify(data.metadata) : null
    ]
  );
}

export async function getConversationHistory(customerId: number, limit: number = 50) {
  const db = await getDb();
  return db.all(
    `SELECT * FROM conversations 
     WHERE customer_id = ? 
     ORDER BY created_at DESC 
     LIMIT ?`,
    [customerId, limit]
  );
}

// Appointment operations
export async function createAppointment(data: {
  job_id: number;
  scheduled_date?: string;
  scheduled_time?: string;
  technician_id?: number;
  notes?: string;
}) {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO appointments (job_id, scheduled_date, scheduled_time, technician_id, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [data.job_id, data.scheduled_date || null, data.scheduled_time || null, data.technician_id || null, data.notes || null]
  );
  return result.lastID;
}

export async function getAppointmentsByDate(date: string) {
  const db = await getDb();
  return db.all(
    `SELECT a.*, c.name as customer_name, c.address, c.phone, j.service_type, j.description
     FROM appointments a
     JOIN jobs j ON a.job_id = j.id
     JOIN customers c ON j.customer_id = c.id
     WHERE a.scheduled_date = ?
     ORDER BY a.scheduled_time`,
    [date]
  );
}
