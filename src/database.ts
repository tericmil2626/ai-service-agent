import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'service-business.db');

let db: sqlite3.Database | null = null;

export async function getDb(): Promise<sqlite3.Database> {
  if (!db) {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new sqlite3.Database(DB_PATH);

    // Enable foreign keys
    await runAsync(db, 'PRAGMA foreign_keys = ON');

    // Initialize schema
    await initSchema(db);
  }
  return db;
}

// Promise wrappers for sqlite3
function runAsync(db: sqlite3.Database, sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(db: sqlite3.Database, sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(db: sqlite3.Database, sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Export wrapper functions for convenience
export async function dbRun(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  const db = await getDb();
  return runAsync(db, sql, params);
}

export async function dbGet(sql: string, params: any[] = []): Promise<any> {
  const db = await getDb();
  return getAsync(db, sql, params);
}

export async function dbAll(sql: string, params: any[] = []): Promise<any[]> {
  const db = await getDb();
  return allAsync(db, sql, params);
}

function execAsync(db: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function initSchema(database: sqlite3.Database): Promise<void> {
  await execAsync(database, `
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      service_type TEXT NOT NULL,
      description TEXT,
      urgency TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'new',
      source TEXT,
      review_request_count INTEGER DEFAULT 0,
      review_link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      technician_id INTEGER,
      notes TEXT,
      status TEXT DEFAULT 'confirmed',
      reminder_sent INTEGER DEFAULT 0,
      calendar_event_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      specialties TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      job_id INTEGER,
      channel TEXT DEFAULT 'sms',
      direction TEXT NOT NULL,
      message_text TEXT NOT NULL,
      agent_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_conversations_job ON conversations(job_id);
  `);
}

// Customer operations
export interface CustomerData {
  name: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
}

export async function createCustomer(data: CustomerData): Promise<number> {
  const db = await getDb();
  const result = await runAsync(
    db,
    `INSERT INTO customers (name, phone, email, address, city, state, zip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.name, data.phone, data.email || null, data.address, data.city || null, data.state || null, data.zip || null]
  );
  return result.lastID;
}

export async function findCustomerByPhone(phone: string): Promise<any> {
  const db = await getDb();
  return getAsync(db, 'SELECT * FROM customers WHERE phone = ?', [phone]);
}

export async function findOrCreateCustomer(data: CustomerData): Promise<any> {
  let customer = await findCustomerByPhone(data.phone);
  if (!customer) {
    const id = await createCustomer(data);
    customer = await getCustomerById(id);
  }
  return customer;
}

export async function getCustomerById(id: number): Promise<any> {
  const db = await getDb();
  return getAsync(db, 'SELECT * FROM customers WHERE id = ?', [id]);
}

// Job operations
export interface JobData {
  customer_id: number;
  service_type: string;
  description?: string;
  urgency?: string;
  source?: string;
}

export async function createJob(data: JobData): Promise<number> {
  const db = await getDb();
  const result = await runAsync(
    db,
    `INSERT INTO jobs (customer_id, service_type, description, urgency, source)
     VALUES (?, ?, ?, ?, ?)`,
    [data.customer_id, data.service_type, data.description || null, data.urgency || 'medium', data.source || 'sms']
  );
  return result.lastID;
}

export async function getJobById(id: number): Promise<any> {
  const db = await getDb();
  return getAsync(db, 'SELECT * FROM jobs WHERE id = ?', [id]);
}

export async function updateJobStatus(jobId: number, status: string): Promise<void> {
  const db = await getDb();
  await runAsync(
    db,
    'UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, jobId]
  );
}

// Conversation operations
export interface MessageData {
  customer_id: number;
  job_id?: number;
  channel: string;
  direction: 'inbound' | 'outbound';
  message_text: string;
  agent_name?: string;
}

export async function saveMessage(data: MessageData): Promise<void> {
  const db = await getDb();
  await runAsync(
    db,
    `INSERT INTO conversations (customer_id, job_id, channel, direction, message_text, agent_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.customer_id, data.job_id || null, data.channel, data.direction, data.message_text, data.agent_name || null]
  );
}

export async function getConversationHistory(jobId: number): Promise<any[]> {
  const db = await getDb();
  return allAsync(db, 'SELECT * FROM conversations WHERE job_id = ? ORDER BY created_at ASC', [jobId]);
}

// Appointment operations
export interface AppointmentData {
  job_id: number;
  scheduled_date: string;
  scheduled_time: string;
  technician_id?: number;
  notes?: string;
}

export async function createAppointment(data: AppointmentData): Promise<number> {
  const db = await getDb();
  const result = await runAsync(
    db,
    `INSERT INTO appointments (job_id, scheduled_date, scheduled_time, technician_id, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [data.job_id, data.scheduled_date, data.scheduled_time, data.technician_id || null, data.notes || null]
  );
  return result.lastID;
}

export async function getAppointmentsByDate(date: string): Promise<any[]> {
  const db = await getDb();
  return allAsync(
    db,
    `SELECT a.*, c.name as customer_name, c.address, j.service_type
     FROM appointments a
     JOIN jobs j ON a.job_id = j.id
     JOIN customers c ON j.customer_id = c.id
     WHERE a.scheduled_date = ? AND a.status IN ('confirmed', 'pending')
     ORDER BY a.scheduled_time`,
    [date]
  );
}
