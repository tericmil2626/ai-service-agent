const nodemailer = require('nodemailer');

// Email configuration - using environment variables or defaults
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'owner@example.com';

let transporter = null;

// Only create transporter if credentials are provided
if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

async function sendJobNotification(jobData) {
  console.log('Attempting to send email...');
  console.log('Transporter exists:', !!transporter);
  console.log('SMTP_USER:', SMTP_USER);
  console.log('BUSINESS_EMAIL:', BUSINESS_EMAIL);
  
  if (!transporter) {
    console.log('Email not configured. Skipping notification.');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const subject = jobData.urgency 
      ? `🚨 URGENT: New ${jobData.serviceType} Job` 
      : `New ${jobData.serviceType} Job`;

    const html = `
      <h2>${jobData.urgency ? '🚨 URGENT JOB' : 'New Job'}</h2>
      <p><strong>Customer:</strong> ${jobData.customerName}</p>
      <p><strong>Phone:</strong> ${jobData.customerPhone}</p>
      <p><strong>Address:</strong> ${jobData.address}</p>
      <p><strong>Service:</strong> ${jobData.serviceType}</p>
      <p><strong>Urgency:</strong> ${jobData.urgency ? 'URGENT - Dispatch Immediately' : 'Standard'}</p>
      ${jobData.notes ? `<p><strong>Notes:</strong> ${jobData.notes}</p>` : ''}
      <hr>
      <p>View in dashboard: http://localhost:3001</p>
    `;

    const info = await transporter.sendMail({
      from: `"AI Receptionist" <${SMTP_USER}>`,
      to: BUSINESS_EMAIL,
      subject,
      html
    });

    console.log('Email sent:', info.messageId);
    return { success: true };
  } catch (error) {
    console.error('Email error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendJobNotification };
