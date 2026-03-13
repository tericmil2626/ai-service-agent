require('dotenv').config();

const Fastify = require('fastify');
const cors = require('@fastify/cors');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const { sendJobNotification } = require('./email.cjs');

const app = Fastify({ 
  logger: true,
  bodyLimit: 1048576
});

// SignalWire credentials
const SIGNALWIRE_PROJECT_ID = process.env.SIGNALWIRE_PROJECT_ID;
const SIGNALWIRE_TOKEN = process.env.SIGNALWIRE_TOKEN;
const SIGNALWIRE_NUMBER = process.env.SIGNALWIRE_PHONE_NUMBER;
const SIGNALWIRE_SPACE = process.env.SIGNALWIRE_SPACE || 'theodorosai26.signalwire.com';

// Database setup
const DB_PATH = path.join(__dirname, 'data', 'conversations.db');
let db;

async function initDb() {
  const fs = require('fs');
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      phone TEXT PRIMARY KEY,
      step TEXT DEFAULT 'greeting',
      data TEXT DEFAULT '{}',
      last_message TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT,
      direction TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create customers table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create jobs table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      service_type TEXT,
      description TEXT,
      urgency TEXT,
      status TEXT DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create appointments table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      scheduled_date TEXT,
      scheduled_time TEXT,
      status TEXT DEFAULT 'scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log('SQLite database initialized');
}

async function getConversation(phone) {
  const row = await db.get('SELECT * FROM conversations WHERE phone = ?', phone);
  if (row) {
    return {
      step: row.step,
      data: JSON.parse(row.data || '{}'),
      lastMessage: row.last_message
    };
  }
  return { step: 'greeting', data: {}, lastMessage: null };
}

async function saveConversation(phone, step, data, lastMessage) {
  await db.run(
    `INSERT OR REPLACE INTO conversations (phone, step, data, last_message, updated_at) 
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [phone, step, JSON.stringify(data), lastMessage]
  );
}

async function saveMessage(phone, direction, message) {
  await db.run(
    'INSERT INTO messages (phone, direction, message) VALUES (?, ?, ?)',
    [phone, direction, message]
  );
}

// Check if message indicates a service issue
function isServiceRequest(body) {
  const keywords = ['leak', 'broken', 'not working', 'not cooling', 'not heating', 'problem', 'issue', 
                    'ac', 'cooling', 'heating', 'hvac', 'air conditioner', 'furnace', 'sink', 'toilet', 
                    'pipe', 'water', 'drain', 'clogged', 'flood', 'burst'];
  return keywords.some(kw => body.toLowerCase().includes(kw));
}

// Check if message indicates urgency
function isUrgentRequest(body) {
  const urgentKeywords = ['flood', 'pouring', 'emergency', 'asap', 'urgent', 'now', 'immediately', 
                          'burst', 'fire', 'sparking', 'water everywhere', 'pipe burst'];
  return urgentKeywords.some(kw => body.toLowerCase().includes(kw));
}

// Check if user said "not urgent"
function isNotUrgent(body) {
  const lower = body.toLowerCase();
  return lower.includes('not urgent') || lower.includes('not an emergency') || 
         lower.includes('can wait') || lower.includes('not asap') ||
         (lower.includes('not') && lower.includes('urgent'));
}

async function startServer() {
  await initDb();
  
  await app.register(cors, {
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true
  });

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
    try {
      const parsed = new URLSearchParams(body);
      const result = {};
      for (const [key, value] of parsed) {
        result[key] = value;
      }
      done(null, result);
    } catch (e) {
      done(e);
    }
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Main SMS webhook
  app.post('/webhook/sms', async (request, reply) => {
    const { From: rawFrom, Body, To } = request.body;
    const From = rawFrom.trim();
    
    console.log(`[SMS] From: ${From}, Body: "${Body}", Step: ${(await getConversation(From)).step}`);
    
    await saveMessage(From, 'inbound', Body);
    
    const conv = await getConversation(From);
    const lowerBody = Body.toLowerCase();
    let response = '';
    let newStep = conv.step;
    let newData = { ...conv.data };

    // RESET command
    if (lowerBody === 'reset' || lowerBody === 'start over') {
      response = `Conversation reset. How can I help you today?`;
      newStep = 'greeting';
      newData = {};
    }
    // GREETING - First contact
    else if (conv.step === 'greeting') {
      if (isUrgentRequest(Body)) {
        response = `🚨 That sounds urgent! I'm flagging this as an emergency. Can I get your name and address so I can dispatch a technician immediately?`;
        newStep = 'urgent_info';
        newData.urgent = true;
      } else if (isServiceRequest(Body)) {
        response = `I can help with that! Can I start with your name?`;
        newStep = 'ask_name';
        newData.serviceType = 'General Service';
      } else {
        response = `Hi! I'm your AI receptionist. I can help schedule service, answer questions, or connect you with a technician. What do you need help with?`;
      }
    }
    // ASK_NAME - Get customer's name
    else if (conv.step === 'ask_name') {
      newData.name = Body;
      response = `Thanks ${Body}! What's the address where you need service?`;
      newStep = 'ask_address';
    }
    // URGENT_INFO - Get name for urgent request
    else if (conv.step === 'urgent_info') {
      newData.name = Body;
      response = `Thanks ${Body}! What's the address? I'll get someone out ASAP.`;
      newStep = 'urgent_address';
    }
    // ASK_ADDRESS - Get address for normal request
    else if (conv.step === 'ask_address') {
      newData.address = Body;
      response = `Got it. Is this urgent or can it wait for a scheduled appointment?`;
      newStep = 'ask_urgency';
    }
    // URGENT_ADDRESS - Get address for urgent request
    else if (conv.step === 'urgent_address') {
      newData.address = Body;
      response = `Got it. A technician is being dispatched now. They'll call you within 10 minutes. Emergency fee applies.`;
      newStep = 'dispatched';
      // Send email for urgent job
      sendJobNotification({
        customerName: newData.name,
        customerPhone: From,
        address: Body,
        serviceType: 'Emergency Repair',
        urgency: true,
        notes: 'Customer reported urgent issue via SMS'
      }).catch(err => console.error('Failed to send email:', err));
    }
    // ASK_URGENCY - Determine if urgent or can schedule
    else if (conv.step === 'ask_urgency') {
      if (isNotUrgent(Body)) {
        response = `Great. We have openings tomorrow at 10am or 2pm. Which works better?`;
        newStep = 'scheduling';
      } else if (isUrgentRequest(Body) || lowerBody.includes('soon') || lowerBody.includes('quick')) {
        response = `I'll prioritize this as urgent. A technician will call you within 15 minutes.`;
        newStep = 'urgent_scheduled';
        newData.urgent = true;
        sendJobNotification({
          customerName: newData.name,
          customerPhone: From,
          address: newData.address,
          serviceType: 'Urgent Repair',
          urgency: true,
          notes: 'Customer indicated urgency via SMS'
        }).catch(err => console.error('Failed to send email:', err));
      } else {
        response = `Great. We have openings tomorrow at 10am or 2pm. Which works better?`;
        newStep = 'scheduling';
      }
    }
    // SCHEDULING - Pick a time
    else if (conv.step === 'scheduling') {
      let appointmentTime = '';
      let appointmentDate = '';
      
      if (lowerBody.includes('10') || lowerBody.includes('morning')) {
        appointmentTime = '10:00';
        response = `Perfect! You're scheduled for tomorrow at 10am. A technician will arrive between 10-11am. You'll get a confirmation call 30 minutes before arrival.`;
      } else if (lowerBody.includes('2') || lowerBody.includes('afternoon')) {
        appointmentTime = '14:00';
        response = `Perfect! You're scheduled for tomorrow at 2pm. A technician will arrive between 2-3pm. You'll get a confirmation call 30 minutes before arrival.`;
      } else {
        response = `I can do 10am or 2pm tomorrow. Which works better for you?`;
      }
      
      if (appointmentTime) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        appointmentDate = tomorrow.toISOString().split('T')[0];
        
        try {
          // Create customer
          let customer = await db.get('SELECT id FROM customers WHERE phone = ?', From);
          let customerId;
          
          if (!customer) {
            const result = await db.run(
              'INSERT INTO customers (phone, name, address) VALUES (?, ?, ?)',
              [From, newData.name || 'Unknown', newData.address || 'TBD']
            );
            customerId = result.lastID;
          } else {
            customerId = customer.id;
          }
          
          // Create job
          const jobResult = await db.run(
            'INSERT INTO jobs (customer_id, service_type, description, status, urgency) VALUES (?, ?, ?, ?, ?)',
            [customerId, newData.serviceType || 'General', 'Service requested via SMS', 'scheduled', newData.urgent ? 'high' : 'medium']
          );
          
          // Create appointment
          await db.run(
            'INSERT INTO appointments (job_id, scheduled_date, scheduled_time, status) VALUES (?, ?, ?, ?)',
            [jobResult.lastID, appointmentDate, appointmentTime, 'scheduled']
          );
          
          // Send email
          await sendJobNotification({
            customerName: newData.name || 'Customer',
            customerPhone: From,
            address: newData.address || 'TBD',
            serviceType: newData.serviceType || 'General Service',
            urgency: newData.urgent || false,
            notes: `Scheduled for ${appointmentDate} at ${appointmentTime}. Customer confirmed via SMS.`
          }).catch(err => console.error('[Scheduling] Email error:', err.message));
          
          console.log(`[Scheduling] Appointment created for ${newData.name} on ${appointmentDate} at ${appointmentTime}`);
          
        } catch (error) {
          console.error('[Scheduling] Failed to create appointment:', error);
          response += `\n\n(Note: There was an issue saving to our calendar, but your appointment is confirmed. We'll follow up shortly.)`;
        }
        
        newStep = 'completed';
      }
    }
    // COMPLETED - Conversation done
    else if (conv.step === 'completed' || conv.step === 'dispatched' || conv.step === 'urgent_scheduled') {
      if (lowerBody.includes('thank') || lowerBody === 'ok' || lowerBody === 'great') {
        response = `You're welcome! Is there anything else I can help you with today?`;
      } else {
        response = `Hi! I'm your AI receptionist. I can help schedule service, answer questions, or connect you with a technician. What do you need help with?`;
        newStep = 'greeting';
        newData = {};
      }
    }
    // Fallback
    else {
      response = `I'm not sure I understood. Can you tell me more about what you need?`;
    }

    // Save state
    await saveConversation(From, newStep, newData, Body);
    await saveMessage(From, 'outbound', response);
    
    console.log(`[SMS] Response: "${response.substring(0, 50)}...", New Step: ${newStep}`);
    
    reply.type('text/xml');
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${response}</Message></Response>`;
  });

  // Send SMS endpoint
  app.post('/api/send-sms', async (request, reply) => {
    const { to, message } = request.body;
    
    try {
      const response = await fetch(`https://${SIGNALWIRE_SPACE}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_TOKEN}`).toString('base64')
        },
        body: new URLSearchParams({
          From: SIGNALWIRE_NUMBER,
          To: to,
          Body: message
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to send SMS:', error);
        return reply.status(500).send({ error: 'Failed to send SMS' });
      }
      
      const data = await response.json();
      return { success: true, messageSid: data.sid };
    } catch (error) {
      console.error('Error sending SMS:', error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // Get stats for dashboard
  app.get('/api/stats', async () => {
    const convCount = await db.get('SELECT COUNT(*) as count FROM conversations');
    const msgCount = await db.get('SELECT COUNT(*) as count FROM messages WHERE direction = "inbound" AND created_at > datetime("now", "-1 day")');
    
    return {
      active_conversations: convCount?.count || 0,
      leads_today: msgCount?.count || 0,
      appointments_today: 0,
      completed_today: 0,
      response_time: '< 2s'
    };
  });

  // Get conversations for dashboard
  app.get('/api/conversations', async () => {
    const rows = await db.all(`
      SELECT 
        c.phone,
        c.step,
        c.last_message,
        c.updated_at,
        json_extract(c.data, '$.name') as name,
        json_extract(c.data, '$.urgent') as urgent
      FROM conversations c
      ORDER BY c.updated_at DESC
    `);
    
    return {
      conversations: rows.map(r => ({
        id: r.phone,
        customer_name: r.name || 'Unknown',
        phone: r.phone,
        service_type: r.step,
        job_status: r.step,
        last_message: r.last_message,
        last_message_time: r.updated_at,
        unread_count: 0
      }))
    };
  });

  try {
    await app.listen({ port: process.env.PORT || 3002, host: '0.0.0.0' });
    console.log('🚀 Service Business API running on http://localhost:3002');
    console.log(`📱 SignalWire number: ${SIGNALWIRE_NUMBER}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

startServer();
