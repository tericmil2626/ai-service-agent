require('dotenv').config();

const Fastify = require('fastify');
const app = Fastify({ logger: true });

const PORT = process.env.PORT || 3002;

// Health check
app.get('/health', async () => {
  return { status: 'ok' };
});

// SMS webhook - minimal version
app.post('/webhook/sms', async (request, reply) => {
  try {
    const { From, Body } = request.body;
    console.log(`SMS from ${From}: ${Body}`);
    
    reply.type('text/xml');
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Received: ${Body}</Message></Response>`;
  } catch (error) {
    console.error('Error:', error);
    reply.type('text/xml');
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Error occurred</Message></Response>`;
  }
});

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server running on port ${PORT}`);
});
