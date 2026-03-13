-- Service Business Database Schema
-- SQLite database for AI receptionist system

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT NOT NULL,
    city TEXT,
    state TEXT,
    zip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Jobs/Service Requests table
CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    service_type TEXT NOT NULL, -- plumbing, electrical, HVAC, etc.
    description TEXT,
    urgency TEXT CHECK(urgency IN ('low', 'medium', 'high', 'emergency')),
    status TEXT DEFAULT 'new' CHECK(status IN ('new', 'qualified', 'scheduled', 'in_progress', 'completed', 'cancelled')),
    source TEXT, -- website, sms, phone, social_media
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    scheduled_date DATE,
    scheduled_time TIME,
    duration_minutes INTEGER DEFAULT 60,
    technician_id INTEGER,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'dispatched', 'arrived', 'completed', 'cancelled', 'no_show')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Conversations table (message history)
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    customer_id INTEGER NOT NULL,
    channel TEXT NOT NULL, -- sms, web_chat, phone, etc.
    direction TEXT CHECK(direction IN ('inbound', 'outbound')),
    message_text TEXT,
    agent_name TEXT, -- which AI agent sent/received this
    metadata TEXT, -- JSON for extra data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Technicians table
CREATE TABLE IF NOT EXISTS technicians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    specialties TEXT, -- JSON array: ["plumbing", "HVAC"]
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_conversations_job ON conversations(job_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(scheduled_date);
