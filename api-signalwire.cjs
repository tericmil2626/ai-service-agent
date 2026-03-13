const http = require('http');
const PORT = process.env.PORT || 3002;

console.log('STARTING SERVER on port', PORT);

const server = http.createServer((req, res) => {
  console.log('Request:', req.method, req.url);
  
  // Health check - must respond immediately
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"status":"ok"}');
  }
  
  // SMS webhook
  if (req.url === '/webhook/sms' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      console.log('SMS:', body);
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end('<?xml version="1.0"?><Response><Message>Hi</Message></Response>');
    });
    return;
  }
  
  // Default
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port', PORT);
});

setInterval(() => {
  console.log('Alive on port', PORT);
}, 10000);
