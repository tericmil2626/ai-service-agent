console.log('STARTING SERVER...');

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3002;

console.log('PORT:', PORT);

app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  console.log('HEALTH CHECK');
  res.json({ status: 'ok' });
});

app.post('/webhook/sms', (req, res) => {
  console.log('SMS RECEIVED:', req.body);
  const { From, Body } = req.body;
  
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Received: ${Body}</Message></Response>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
