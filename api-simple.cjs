const Fastify = require('fastify');
const cors = require('@fastify/cors');

const app = Fastify({ 
  logger: true,
  bodyLimit: 1048576 // 1MB
});

async function startServer() {
  // CORS for dashboard
  await app.register(cors, {
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true
  });

  // Add content type parser for form data
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

  // Twilio SMS webhook
  app.post('/webhook/sms', async (request, reply) => {
    const { From, Body } = request.body;
    console.log(`[SMS] ${From}: ${Body}`);
    
    reply.type('text/xml');
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Hi! We received your message.</Message>
</Response>`;
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Stats
  app.get('/api/stats', async () => {
    return {
      active_conversations: 3,
      leads_today: 12,
      appointments_today: 8,
      completed_today: 5,
      response_time: '< 2s'
    };
  });

  // Agents
  app.get('/api/agents/status', async () => {
    return {
      agents: [
        { id: 'master', name: 'Master Orchestrator', status: 'active', load: 12 },
        { id: 'intake', name: 'Intake Agent', status: 'active', load: 45 },
        { id: 'scheduling', name: 'Scheduling Agent', status: 'active', load: 23 },
        { id: 'dispatch', name: 'Dispatch Agent', status: 'active', load: 8 },
        { id: 'followup', name: 'Follow-Up Agent', status: 'active', load: 15 },
        { id: 'review', name: 'Review Request Agent', status: 'standby', load: 0 },
        { id: 'knowledge', name: 'Knowledge Base Agent', status: 'active', load: 5 }
      ]
    };
  });

  // Conversations
  app.get('/api/conversations', async () => {
    return {
      conversations: [
        {
          id: '1',
          customer_name: 'Sarah Mitchell',
          phone: '555-123-4567',
          service_type: 'HVAC',
          job_status: 'new',
          last_message: 'My AC stopped working this morning',
          last_message_time: '2 min ago',
          unread_count: 1
        },
        {
          id: '2',
          customer_name: 'John Davis',
          phone: '555-987-6543',
          service_type: 'Plumbing',
          job_status: 'scheduled',
          last_message: 'Tomorrow at 2pm works perfect',
          last_message_time: '5 min ago',
          unread_count: 0
        }
      ]
    };
  });

  // Leads
  app.get('/api/leads', async () => {
    return {
      leads: [
        {
          id: '1',
          name: 'Sarah Mitchell',
          phone: '555-123-4567',
          service_type: 'HVAC',
          description: 'AC not cooling',
          urgency: 'high',
          status: 'new',
          source: 'SMS',
          created_at: '10 min ago'
        },
        {
          id: '2',
          name: 'John Davis',
          phone: '555-987-6543',
          service_type: 'Plumbing',
          description: 'Kitchen sink leak',
          urgency: 'medium',
          status: 'contacted',
          source: 'Web',
          created_at: '1 hour ago'
        }
      ]
    };
  });

  try {
    await app.listen({ port: 3002, host: '0.0.0.0' });
    console.log('🚀 Service Business API running on http://localhost:3002');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

startServer();
