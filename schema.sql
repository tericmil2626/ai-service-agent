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
    review_requested INTEGER DEFAULT 0,
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
    reminder_sent_24h INTEGER DEFAULT 0,
    reminder_sent_1h INTEGER DEFAULT 0,
    no_show_follow_up_sent INTEGER DEFAULT 0,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id),
    UNIQUE(scheduled_date, scheduled_time)
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Conversation state table (for persisting agent state across requests)
CREATE TABLE IF NOT EXISTS conversation_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    job_id INTEGER,
    current_agent TEXT,
    status TEXT DEFAULT 'new',
    context TEXT, -- JSON state data
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (job_id) REFERENCES jobs(id),
    UNIQUE(customer_id)
);

-- Business configuration table (for tier/settings)
CREATE TABLE IF NOT EXISTS business_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id TEXT NOT NULL UNIQUE,
    tier TEXT DEFAULT 'starter',
    config TEXT, -- JSON configuration
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Third-party integrations table (Google Calendar, etc.)
CREATE TABLE IF NOT EXISTS business_integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id TEXT NOT NULL,
    provider TEXT NOT NULL, -- google_calendar, outlook, etc.
    config TEXT NOT NULL, -- JSON with tokens, settings
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(business_id, provider)
);

-- Missed calls table (for tracking and text-back)
CREATE TABLE IF NOT EXISTS missed_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    business_phone TEXT NOT NULL,
    call_sid TEXT,
    call_status TEXT, -- no-answer, busy, failed, completed
    text_back_sent INTEGER DEFAULT 0,
    text_back_message TEXT,
    text_back_sent_at DATETIME,
    converted_to_lead INTEGER DEFAULT 0,
    job_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Voice call logs table
CREATE TABLE IF NOT EXISTS call_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_sid TEXT NOT NULL UNIQUE,
    customer_phone TEXT NOT NULL,
    business_phone TEXT NOT NULL,
    direction TEXT DEFAULT 'inbound' CHECK(direction IN ('inbound', 'outbound')),
    status TEXT DEFAULT 'in-progress',  -- in-progress, completed, no-answer, busy, failed, canceled
    duration_seconds INTEGER,
    transcript TEXT,                    -- JSON array of { role, text, timestamp } turns
    recording_url TEXT,
    job_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_conversations_job ON conversations(job_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_conversation_states_customer ON conversation_states(customer_id);
CREATE INDEX IF NOT EXISTS idx_integrations_business ON business_integrations(business_id);
CREATE INDEX IF NOT EXISTS idx_missed_calls_phone ON missed_calls(customer_phone);
CREATE INDEX IF NOT EXISTS idx_missed_calls_created ON missed_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_call_logs_phone ON call_logs(customer_phone);
CREATE INDEX IF NOT EXISTS idx_call_logs_created ON call_logs(created_at);
