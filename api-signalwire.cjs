const express = require('express');
const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhook/sms', (req, res) => {
  const { From, Body } = req.body;
  console.log(`SMS from ${From}: ${Body}`);
  
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Received: ${Body}</Message></Response>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
