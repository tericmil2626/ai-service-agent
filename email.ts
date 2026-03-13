const nodemailer = require('nodemailer');

// Email configuration
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'owner@business.com';

const transporter = nodemailer.createTransporter({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

export async function sendJobNotification(jobData: {
  customerName: string;
  customerPhone: string;
  address: string;
  serviceType: string;
  urgency: boolean;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const subject = jobData.urgency 
      ? `🚨 URGENT: New ${jobData.serviceType} Job` 
      : `New ${jobData.serviceType} Job Scheduled`;

    const html = `
      <h2>${jobData.urgency ? '🚨 URGENT JOB' : 'New Job'}</h2>
      <table style="border-collapse: collapse; width: 100%;">
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Customer:</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${jobData.customerName}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone:</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${jobData.customerPhone}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Address:</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${jobData.address}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Service:</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${jobData.serviceType}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Urgency:</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd; color: ${jobData.urgency ? 'red' : 'green'};">
            ${jobData.urgency ? 'URGENT - Dispatch Immediately' : 'Standard'}
          </td>
        </tr>
        ${jobData.notes ? `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Notes:</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${jobData.notes}</td>
        </tr>
        ` : ''}
      </table>
      <p style="margin-top: 20px;">
        <a href="http://localhost:3001" style="padding: 10px 20px; background: #46a758; color: white; text-decoration: none; border-radius: 5px;">
          View in Dashboard
        </a>
      </p>
    `;

    const info = await transporter.sendMail({
      from: `"AI Receptionist" <${SMTP_USER}>`,
      to: BUSINESS_EMAIL,
      subject,
      html
    });

    console.log('Email sent:', info.messageId);
    return { success: true };
  } catch (error: any) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
}

export async function sendDailySummary(stats: {
  newJobs: number;
  completedJobs: number;
  urgentJobs: number;
}): Promise<void> {
  try {
    await transporter.sendMail({
      from: `"AI Receptionist" <${SMTP_USER}>`,
      to: BUSINESS_EMAIL,
      subject: 'Daily Summary - AI Receptionist',
      html: `
        <h2>Daily Activity Summary</h2>
        <ul>
          <li>New Jobs: ${stats.newJobs}</li>
          <li>Completed: ${stats.completedJobs}</li>
          <li>Urgent: ${stats.urgentJobs}</li>
        </ul>
      `
    });
  } catch (error) {
    console.error('Daily summary email error:', error);
  }
}
