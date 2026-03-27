require('dotenv').config();
const http = require('http');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'conversations.db');
let db;

async function initDb() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  
  await db.exec(`CREATE TABLE IF NOT EXISTS conversations (
    phone TEXT PRIMARY KEY, step TEXT DEFAULT 'greeting', data TEXT DEFAULT '{}',
    last_message TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  
  await db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, direction TEXT,
    message TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  
  await db.exec(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT,
    email TEXT, address TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  
  await db.exec(`CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, service_type TEXT,
    description TEXT, urgency TEXT, status TEXT DEFAULT 'new',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  
  await db.exec(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, scheduled_date TEXT,
    scheduled_time TEXT, status TEXT DEFAULT 'scheduled',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  
  console.log('Database initialized');
}

async function getConversation(phone) {
  const row = await db.get('SELECT * FROM conversations WHERE phone = ?', phone);
  return row ? { step: row.step, data: JSON.parse(row.data || '{}') } : { step: 'greeting', data: {} };
}

async function saveConversation(phone, step, data) {
  await db.run('INSERT OR REPLACE INTO conversations (phone, step, data, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
    [phone, step, JSON.stringify(data)]);
}

async function saveMessage(phone, direction, message) {
  await db.run('INSERT INTO messages (phone, direction, message) VALUES (?, ?, ?)',
    [phone, direction, message]);
}

// FIXED: Check for existing job before creating new one
async function createAppointment(phone, name, address, serviceType, urgency, date, time) {
  try {
    let customer = await db.get('SELECT id FROM customers WHERE phone = ?', phone);
    let customerId;
    
    if (!customer) {
      const result = await db.run(
        'INSERT INTO customers (phone, name, address) VALUES (?, ?, ?)',
        [phone, name, address]
      );
      customerId = result.lastID;
    } else {
      customerId = customer.id;
    }
    
    // Check for existing active job
    let existingJob = await db.get(
      'SELECT id FROM jobs WHERE customer_id = ? AND status NOT IN ("completed", "cancelled", "closed") ORDER BY created_at DESC LIMIT 1',
      customerId
    );
    
    let jobId;
    if (existingJob) {
      jobId = existingJob.id;
      // Update existing job status
      await db.run('UPDATE jobs SET status = ? WHERE id = ?', ['scheduled', jobId]);
      console.log(`Using existing job ${jobId} for customer ${customerId}`);
    } else {
      const jobResult = await db.run(
        'INSERT INTO jobs (customer_id, service_type, description, status, urgency) VALUES (?, ?, ?, ?, ?)',
        [customerId, serviceType || 'General', 'Service requested via SMS', 'scheduled', urgency || 'medium']
      );
      jobId = jobResult.lastID;
      console.log(`Created new job ${jobId} for customer ${customerId}`);
    }
    
    await db.run(
      'INSERT INTO appointments (job_id, scheduled_date, scheduled_time, status) VALUES (?, ?, ?, ?)',
      [jobId, date, time, 'scheduled']
    );
    
    console.log(`Appointment created: ${name} on ${date} at ${time}`);
    return true;
  } catch (error) {
    console.error('Failed to create appointment:', error);
    return false;
  }
}

const server = http.createServer((req, res) => {
  console.log('Request:', req.method, req.url);
  
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"status":"ok"}');
  }
  
  if (req.url === '/api/stats') {
    (async () => {
      try {
        const activeConversations = await db.get('SELECT COUNT(*) as count FROM jobs WHERE status IN ("new", "contacted", "awaiting_response", "qualified")');
        // FIXED: Count distinct customers, not all jobs
        const leadsToday = await db.get('SELECT COUNT(DISTINCT customer_id) as count FROM jobs WHERE date(created_at) = date("now")');
        const appointmentsToday = await db.get('SELECT COUNT(*) as count FROM appointments WHERE scheduled_date = date("now")');
        const completedJobs = await db.get('SELECT COUNT(*) as count FROM jobs WHERE status = "completed" AND date(updated_at) = date("now")');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          active_conversations: activeConversations?.count || 0,
          leads_today: leadsToday?.count || 0,
          appointments_today: appointmentsToday?.count || 0,
          completed_today: completedJobs?.count || 0,
          response_time: '< 2s'
        }));
      } catch (error) {
        console.error('Stats error:', error);
        res.writeHead(500);
        res.end('Error');
      }
    })();
    return;
  }
  
  if (req.url === '/webhook/sms' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const params = new URLSearchParams(body);
        const From = params.get('From')?.trim() || '';
        const Body = params.get('Body') || '';
        const lowerBody = Body.toLowerCase();
        
        console.log(`SMS from ${From}: ${Body}`);
        await saveMessage(From, 'inbound', Body);
        
        const conv = await getConversation(From);
        let response = '';
        let newStep = conv.step;
        let newData = { ...conv.data };

        if (lowerBody === 'reset') {
          response = 'Conversation reset. How can I help you today?';
          newStep = 'greeting';
          newData = {};
        }
        else if (conv.step === 'greeting') {
          response = 'I can help with that! Can I start with your name?';
          newStep = 'ask_name';
        }
        else if (conv.step === 'ask_name') {
          newData.name = Body;
          response = `Thanks ${Body}! What is the address where you need service?`;
          newStep = 'ask_address';
        }
        else if (conv.step === 'ask_address') {
          newData.address = Body;
          response = 'Got it. Is this urgent or can it wait for a scheduled appointment?';
          newStep = 'ask_urgency';
        }
        else if (conv.step === 'ask_urgency') {
          if (lowerBody.includes('not') || lowerBody.includes('wait')) {
            response = 'Great. We have openings tomorrow at 10am or 2pm. Which works better?';
            newStep = 'scheduling';
          } else {
            response = 'I will prioritize this as urgent. A technician will call you within 15 minutes.';
            newStep = 'completed';
          }
        }
        else if (conv.step === 'scheduling') {
          let appointmentTime = '';
          let appointmentDate = '';
          
          if (lowerBody.includes('10') || lowerBody.includes('morning')) {
            appointmentTime = '10:00';
            response = 'Perfect! You are scheduled for tomorrow at 10am. A technician will arrive between 10-11am.';
          } else if (lowerBody.includes('2') || lowerBody.includes('afternoon')) {
            appointmentTime = '14:00';
            response = 'Perfect! You are scheduled for tomorrow at 2pm. A technician will arrive between 2-3pm.';
          } else {
            response = 'I can do 10am or 2pm tomorrow. Which works better for you?';
          }
          
          if (appointmentTime) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            appointmentDate = tomorrow.toISOString().split('T')[0];
            
            await createAppointment(
              From, newData.name, newData.address,
              newData.serviceType || 'General Service',
              newData.urgent ? 'high' : 'medium',
              appointmentDate, appointmentTime
            );
            
            newStep = 'completed';
          }
        }
        else {
          response = 'How can I help you today?';
          newStep = 'greeting';
        }

        await saveConversation(From, newStep, newData);
        await saveMessage(From, 'outbound', response);
        
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(`<?xml version="1.0"?><Response><Message>${response}</Message></Response>`);
      } catch (error) {
        console.error('Error:', error);
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end('<?xml version="1.0"?><Response><Message>Sorry, there was an error.</Message></Response>');
      }
    });
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

initDb().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('Server running on port', PORT);
  });
});
