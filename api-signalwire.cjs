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
const SIGNALWIRE_PROJECT_ID = process.env.SIGNALWIRE_PROJECT_ID || '9ea331fc-49ce-4c42-90ee-6ee34db9251f';
const SIGNALWIRE_TOKEN = process.env.SIGNALWIRE_TOKEN || 'PT7a4e648a1d3a887cd49615fe3c957ad4752efc3d487e8630';
const SIGNALWIRE_NUMBER = process.env.SIGNALWIRE_PHONE_NUMBER || '+14053694926';
const SIGNALWIRE_SPACE = 'theodorosai26.signalwire.com';

// Database setup
const DB_PATH = path.join(__dirname, 'data', 'conversations.db');
let db;

async function initDb() {
  // Create data directory if it doesn't exist
  const fs = require('fs');
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  
  // Create conversations table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      phone TEXT PRIMARY KEY,
      step TEXT DEFAULT 'greeting',
      data TEXT DEFAULT '{}',
      last_message TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create messages table for history
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT,
      direction TEXT,
      message TEXT,
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

async function startServer() {
  // Initialize database
  await initDb();
  
  await app.register(cors, {
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true
  });

  // Parse form data
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
    try {
      const parsed = new URLSearchParams(body);
      const result = {};
      for (const [key, value] of parsed) {
        result[key] = value;
      }
      done(null, result);
    } catch (err) {
      done(err);
    }
  });

  // SignalWire SMS webhook
  app.post('/webhook/sms', async (request, reply) => {
    const { From: rawFrom, Body, To } = request.body;
    const From = rawFrom.trim();
    console.log(`[SMS] From: ${From}, Body: ${Body}`);
    
    // Save incoming message
    await saveMessage(From, 'inbound', Body);
    
    // Get conversation state from database
    const conv = await getConversation(From);
    const lowerBody = Body.toLowerCase();
    let response = '';
    
    // Check for RESET command
    if (lowerBody === 'reset' || lowerBody === 'start over') {
      await saveConversation(From, 'greeting', {}, null);
      response = `Conversation reset. How can I help you today?`;
      await saveMessage(From, 'outbound', response);
      reply.type('text/xml');
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${response}</Message></Response>`;
    }
    
    // Check for URGENCY first - ALWAYS check, even mid-conversation
    const urgentKeywords = ['flood', 'pouring', 'emergency', 'asap', 'urgent', 'now', 'immediately', 'burst', 'fire', 'sparking', 'water everywhere', 'pipe burst'];
    const isUrgent = urgentKeywords.some(kw => lowerBody.includes(kw));
    
    // Debug logging
    console.log(`[DEBUG] Step: ${conv.step}, Body: "${lowerBody}", isUrgent: ${isUrgent}`);
    
    // Intent detection with conversation memory
    if (isUrgent) {
      // Urgent issue detected - override any current conversation
      response = `🚨 That sounds urgent! I'm flagging this as an emergency. Can I get your name and address so I can dispatch a technician immediately?`;
      conv.data.urgent = true;
      conv.step = 'urgent_info';
    } else if (lowerBody.includes('leak') || lowerBody.includes('broken') || lowerBody.includes('not working') || lowerBody.includes('problem') || lowerBody.includes('issue') || lowerBody.includes('ac') || lowerBody.includes('cooling') || lowerBody.includes('heating') || lowerBody.includes('hvac') || lowerBody.includes('air conditioner') || lowerBody.includes('furnace')) {
      if (conv.step === 'greeting') {
        response = `I can help with that! Can I start with your name?`;
        conv.step = 'ask_name';
      } else {
        // Already in conversation, continue
        response = continueConversation(conv, Body);
      }
    } else if ((conv.step === 'ask_name' || conv.step === 'urgent_info') && Body.length > 2) {
      console.log(`Processing name/address. Step: ${conv.step}, Urgent: ${conv.data.urgent}`);
      // Try to parse name and address if both provided
      const lines = Body.split(/\n|,|\s+at\s+|\s+address\s+/i).filter(s => s.trim());
      console.log(`Parsed lines:`, lines);
      
      if (lines.length >= 2 && lines[1].match(/\d+/)) {
        // Looks like name and address were both provided
        console.log('Detected combined name + address');
        conv.data.name = lines[0].trim();
        conv.data.address = lines.slice(1).join(', ').trim();
        
        if (conv.data.urgent) {
          response = `Thanks ${conv.data.name}! Got your address. A technician is being dispatched now. They'll call you within 10 minutes. Emergency fee applies.`;
          conv.step = 'dispatched';
          // Send email notification for urgent job
          console.log('Dispatching urgent job - sending email...');
          sendJobNotification({
            customerName: conv.data.name,
            customerPhone: From,
            address: conv.data.address,
            serviceType: 'Emergency Repair',
            urgency: true,
            notes: 'Customer reported urgent issue via SMS'
          }).catch(err => console.error('Failed to send email:', err));
        } else {
          response = `Thanks ${conv.data.name}! Got your address at ${conv.data.address}. Is this urgent or can it wait for a scheduled appointment?`;
          conv.step = 'ask_urgency';
        }
      } else {
        // Only name provided
        conv.data.name = Body;
        if (conv.data.urgent) {
          response = `Thanks ${Body}! What's the address? I'll get someone out ASAP.`;
          conv.step = 'urgent_address';
        } else {
          response = `Thanks ${Body}! What's the address where you need service?`;
          conv.step = 'ask_address';
        }
      }
    } else if ((conv.step === 'ask_address' || conv.step === 'urgent_address') && Body.length > 5) {
      conv.data.address = Body;
      if (conv.data.urgent) {
        response = `Got it. A technician is being dispatched now. They'll call you within 10 minutes. Emergency fee applies.`;
        conv.step = 'dispatched';
        // Send email notification for urgent job
        sendJobNotification({
          customerName: conv.data.name,
          customerPhone: From,
          address: Body,
          serviceType: 'Emergency Repair',
          urgency: true,
          notes: 'Customer reported urgent issue via SMS'
        }).catch(err => console.error('Failed to send email:', err));
      } else {
        response = `Got it. Is this urgent or can it wait for a scheduled appointment?`;
        conv.step = 'ask_urgency';
      }
    } else if (conv.step === 'ask_urgency') {
      // Check for "not urgent" or "not an emergency" first
      const isNotUrgent = lowerBody.includes('not urgent') || lowerBody.includes('not an emergency') || lowerBody.includes('can wait') || lowerBody.includes('not asap');
      
      if (!isNotUrgent && (isUrgent || lowerBody.includes('urgent') || lowerBody.includes('asap') || lowerBody.includes('soon') || lowerBody.includes('quick'))) {
        response = `I'll prioritize this as urgent. A technician will call you within 15 minutes.`;
        conv.step = 'urgent_scheduled';
      } else {
        response = `Great. We have openings tomorrow at 10am or 2pm. Which works better?`;
        conv.step = 'scheduling';
      }
    } else if (lowerBody.includes('hour') || lowerBody.includes('open') || lowerBody.includes('when are you')) {
      response = `We're open Monday-Friday 8am-5pm. We also offer 24/7 emergency service for urgent issues.`;
    } else if (lowerBody.includes('price') || lowerBody.includes('cost') || lowerBody.includes('how much') || lowerBody.includes('estimate')) {
      response = `Pricing varies by job. We offer free estimates after inspection. Emergency service has an additional fee. Standard repairs typically range $150-500.`;
    } else if (lowerBody.includes('service') || lowerBody.includes('what do you do')) {
      response = `We offer plumbing, electrical, HVAC, and appliance repair. We also do installations and maintenance. What type of service do you need?`;
    } else if (lowerBody.includes('cancel') || lowerBody.includes('never mind') || lowerBody.includes('forget it')) {
      response = `No problem! If you need help in the future, just text us. Have a great day!`;
      conv.step = 'greeting';
      conv.data = {};
    } else if (lowerBody.includes('thank') || lowerBody === 'ok' || lowerBody === 'great' || lowerBody === 'sounds good') {
      if (conv.step === 'dispatched' || conv.step === 'urgent_scheduled' || conv.step === 'scheduling') {
        response = `You're welcome! Is there anything else I can help you with today?`;
        conv.step = 'completed';
      } else {
        response = continueConversation(conv, Body);
      }
    } else if (conv.step !== 'greeting') {
      // Continue existing conversation
      response = continueConversation(conv, Body);
    } else {
      response = `Hi! I'm your AI receptionist. I can help schedule service, answer questions, or connect you with a technician. What do you need help with?`;
    }
    
    // Save conversation state
    await saveConversation(From, conv.step, conv.data, Body);
    await saveMessage(From, 'outbound', response);
    
    reply.type('text/xml');
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${response}</Message></Response>`;
  });

  function continueConversation(conv, body) {
    // Handle various steps
    if (conv.step === 'scheduling') {
      if (body.toLowerCase().includes('10') || body.toLowerCase().includes('morning')) {
        return `Perfect! You're scheduled for tomorrow at 10am. A technician will arrive between 10-11am. You'll get a confirmation call 30 minutes before arrival.`;
      } else if (body.toLowerCase().includes('2') || body.toLowerCase().includes('afternoon')) {
        return `Perfect! You're scheduled for tomorrow at 2pm. A technician will arrive between 2-3pm. You'll get a confirmation call 30 minutes before arrival.`;
      } else {
        return `I can do 10am or 2pm tomorrow. Which works better for you?`;
      }
    }
    return `I'm not sure I understood. Can you tell me more about what you need?`;
  }

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
      
      const data = await response.json();
      console.log('SignalWire response:', data);
      
      return { success: true, messageId: data.sid };
    } catch (error) {
      console.error('Send SMS error:', error);
      return { success: false, error: error.message };
    }
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Stats
  app.get('/api/stats', async () => {
    const convCount = await db.get('SELECT COUNT(*) as count FROM conversations');
    const msgCount = await db.get('SELECT COUNT(*) as count FROM messages WHERE direction = "inbound"');
    
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
    await app.listen({ port: 3002, host: '0.0.0.0' });
    console.log('🚀 Service Business API running on http://localhost:3002');
    console.log(`📱 SignalWire number: ${SIGNALWIRE_NUMBER}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

startServer();
