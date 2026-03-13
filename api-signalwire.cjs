const http = require('http');
const PORT = process.env.PORT || 3002;

console.log('STARTING SERVER on port', PORT);

const server = http.createServer((req, res) => {
  console.log('Request received:', req.url, req.method);
  
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
  } else if (req.url === '/webhook/sms' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      console.log('SMS body:', body);
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Test response</Message></Response>');
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port', PORT);
});

// Keep alive
setInterval(() => {
  console.log('Server is still running on port', PORT);
}, 10000);

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
