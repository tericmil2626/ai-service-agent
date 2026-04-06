// Follow-Up Agent
// Handles appointment reminders, missed appointments, and post-job follow-ups
import { getDb, dbGet, dbAll, dbRun } from '../database.js';
import { getSMSProvider } from '../sms.js';

export interface FollowUpTask {
  id: number;
  appointment_id: number;
  job_id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  technician_name?: string;
  scheduled_date: string;
  scheduled_time: string;
  service_type: string;
  status: 'scheduled' | 'reminder_sent' | 'confirmed' | 'missed' | 'completed' | 'follow_up_sent';
  reminder_sent_24h: boolean;
  reminder_sent_2h: boolean;
  follow_up_sent: boolean;
}

export class FollowUpAgent {
  private sms = getSMSProvider();

  /**
   * Check for appointments needing reminders and send them
   * Should be called by a cron job every hour
   */
  async processReminders(): Promise<{ remindersSent: number; followUpsSent: number }> {
    const now = new Date();
    const results = { remindersSent: 0, followUpsSent: 0 };

    // Get appointments in next 24-25 hours that haven't had 24h reminder
    const appointments24h = await this.getAppointmentsNeeding24hReminder();
    for (const appt of appointments24h) {
      await this.send24HourReminder(appt);
      results.remindersSent++;
    }

    // Get appointments in next 1-2 hours that haven't had 2h reminder
    const appointments2h = await this.getAppointmentsNeeding2hReminder();
    for (const appt of appointments2h) {
      await this.send2HourReminder(appt);
      results.remindersSent++;
    }

    // Get missed appointments from today
    const missedAppointments = await this.getMissedAppointments();
    for (const appt of missedAppointments) {
      await this.handleMissedAppointment(appt);
    }

    // Get completed appointments from today needing follow-up
    const completedAppointments = await this.getCompletedAppointmentsNeedingFollowUp();
    for (const appt of completedAppointments) {
      await this.sendPostJobFollowUp(appt);
      results.followUpsSent++;
    }

    return results;
  }

  /**
   * Get appointments scheduled in 24-25 hours that need reminder
   */
  private async getAppointmentsNeeding24hReminder(): Promise<FollowUpTask[]> {
    return await dbAll(`
      SELECT 
        a.id as appointment_id,
        a.job_id,
        a.scheduled_date,
        a.scheduled_time,
        a.reminder_sent_24h,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        j.service_type,
        t.name as technician_name
      FROM appointments a
      JOIN jobs j ON a.job_id = j.id
      JOIN customers c ON j.customer_id = c.id
      LEFT JOIN technicians t ON a.technician_id = t.id
      WHERE a.scheduled_date = date('now', '+1 day')
      AND a.status IN ('confirmed', 'assigned')
      AND (a.reminder_sent_24h = 0 OR a.reminder_sent_24h IS NULL)
      ORDER BY a.scheduled_time
    `);
  }

  /**
   * Get appointments scheduled in 1-2 hours that need reminder
   */
  private async getAppointmentsNeeding2hReminder(): Promise<FollowUpTask[]> {
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const oneHourFromNow = new Date(now.getTime() + 1 * 60 * 60 * 1000);
    
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM
    const twoHoursTime = twoHoursFromNow.toTimeString().slice(0, 5);
    const oneHourTime = oneHourFromNow.toTimeString().slice(0, 5);

    return await dbAll(`
      SELECT 
        a.id as appointment_id,
        a.job_id,
        a.scheduled_date,
        a.scheduled_time,
        a.reminder_sent_2h,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        j.service_type,
        t.name as technician_name
      FROM appointments a
      JOIN jobs j ON a.job_id = j.id
      JOIN customers c ON j.customer_id = c.id
      LEFT JOIN technicians t ON a.technician_id = t.id
      WHERE a.scheduled_date = date('now')
      AND a.scheduled_time BETWEEN ? AND ?
      AND a.status IN ('confirmed', 'assigned')
      AND (a.reminder_sent_2h = 0 OR a.reminder_sent_2h IS NULL)
      ORDER BY a.scheduled_time
    `, [currentTime, twoHoursTime]);
  }

  /**
   * Get missed appointments from today
   */
  private async getMissedAppointments(): Promise<FollowUpTask[]> {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);

    return await dbAll(`
      SELECT 
        a.id as appointment_id,
        a.job_id,
        a.scheduled_date,
        a.scheduled_time,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        j.service_type
      FROM appointments a
      JOIN jobs j ON a.job_id = j.id
      JOIN customers c ON j.customer_id = c.id
      WHERE a.scheduled_date = date('now')
      AND a.scheduled_time < ?
      AND a.status IN ('confirmed', 'assigned')
      AND (a.missed_handled = 0 OR a.missed_handled IS NULL)
      ORDER BY a.scheduled_time
    `, [currentTime]);
  }

  /**
   * Get completed appointments from today needing follow-up
   */
  private async getCompletedAppointmentsNeedingFollowUp(): Promise<FollowUpTask[]> {
    return await dbAll(`
      SELECT 
        a.id as appointment_id,
        a.job_id,
        a.scheduled_date,
        a.scheduled_time,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        j.service_type,
        t.name as technician_name
      FROM appointments a
      JOIN jobs j ON a.job_id = j.id
      JOIN customers c ON j.customer_id = c.id
      LEFT JOIN technicians t ON a.technician_id = t.id
      WHERE a.status = 'completed'
      AND date(a.updated_at) = date('now')
      AND (a.follow_up_sent = 0 OR a.follow_up_sent IS NULL)
      ORDER BY a.updated_at DESC
      LIMIT 10
    `);
  }

  /**
   * Send 24-hour reminder
   */
  private async send24HourReminder(appt: FollowUpTask): Promise<void> {
    const formatTime12Hour = (time24: string): string => {
      const [hours, minutes] = time24.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const hours12 = hours % 12 || 12;
      return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
    };

    const time12Hour = formatTime12Hour(appt.scheduled_time);
    const techInfo = appt.technician_name ? ` Technician: ${appt.technician_name}` : '';

    const message = `Hi ${appt.customer_name}, this is a reminder of your ${appt.service_type} appointment tomorrow at ${time12Hour}.${techInfo}

Please reply YES to confirm or call us if you need to reschedule.`;

    await this.sms.sendSMS(appt.customer_phone, message);
    
    // Mark reminder as sent
    await dbRun(
      'UPDATE appointments SET reminder_sent_24h = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [appt.appointment_id]
    );

    console.log(`[FollowUpAgent] 24h reminder sent to ${appt.customer_name} (${appt.customer_phone})`);
  }

  /**
   * Send 2-hour reminder
   */
  private async send2HourReminder(appt: FollowUpTask): Promise<void> {
    const formatTime12Hour = (time24: string): string => {
      const [hours, minutes] = time24.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const hours12 = hours % 12 || 12;
      return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
    };

    const time12Hour = formatTime12Hour(appt.scheduled_time);
    const techInfo = appt.technician_name ? ` Your technician ${appt.technician_name} is on the way.` : '';

    const message = `Hi ${appt.customer_name}, your ${appt.service_type} appointment is in 2 hours at ${time12Hour}.${techInfo}

See you soon!`;

    await this.sms.sendSMS(appt.customer_phone, message);
    
    // Mark reminder as sent
    await dbRun(
      'UPDATE appointments SET reminder_sent_2h = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [appt.appointment_id]
    );

    console.log(`[FollowUpAgent] 2h reminder sent to ${appt.customer_name} (${appt.customer_phone})`);
  }

  /**
   * Handle missed appointment
   */
  private async handleMissedAppointment(appt: FollowUpTask): Promise<void> {
    const message = `Hi ${appt.customer_name}, we missed you for your ${appt.service_type} appointment today. 

Would you like to reschedule? Reply with:
- YES to reschedule
- CALL to have us call you
- CANCEL to cancel`;

    await this.sms.sendSMS(appt.customer_phone, message);
    
    // Update appointment status
    await dbRun(
      "UPDATE appointments SET status = 'missed', missed_handled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [appt.appointment_id]
    );

    // Update job status
    await dbRun(
      "UPDATE jobs SET status = 'missed_appointment' WHERE id = ?",
      [appt.job_id]
    );

    console.log(`[FollowUpAgent] Missed appointment handled for ${appt.customer_name}`);
  }

  /**
   * Send post-job follow-up
   */
  private async sendPostJobFollowUp(appt: FollowUpTask): Promise<void> {
    const message = `Hi ${appt.customer_name}, thank you for choosing us for your ${appt.service_type} service today!

How did we do? Reply with:
- 5 for Excellent
- 4 for Good  
- 3 for Okay
- 2 for Poor
- 1 for Very Poor

Your feedback helps us improve!`;

    await this.sms.sendSMS(appt.customer_phone, message);
    
    // Mark follow-up as sent
    await dbRun(
      'UPDATE appointments SET follow_up_sent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [appt.appointment_id]
    );

    console.log(`[FollowUpAgent] Post-job follow-up sent to ${appt.customer_name}`);
  }

  /**
   * Handle customer response to follow-up
   */
  async handleResponse(phone: string, message: string, appointmentId?: number): Promise<string> {
    const lowerMsg = message.toLowerCase().trim();

    // Handle confirmation responses
    if (lowerMsg.includes('yes') || lowerMsg === 'y') {
      if (appointmentId) {
        await dbRun(
          "UPDATE appointments SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [appointmentId]
        );
        return 'Thank you for confirming! We look forward to seeing you.';
      }
      return 'Thank you! Our team will contact you shortly to reschedule.';
    }

    // Handle reschedule request
    if (lowerMsg.includes('reschedule') || lowerMsg.includes('call')) {
      return 'We will call you shortly to reschedule. Thank you for letting us know!';
    }

    // Handle cancellation
    if (lowerMsg.includes('cancel')) {
      if (appointmentId) {
        await dbRun(
          "UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [appointmentId]
        );
        await dbRun(
          "UPDATE jobs SET status = 'cancelled' WHERE id = (SELECT job_id FROM appointments WHERE id = ?)",
          [appointmentId]
        );
      }
      return 'Your appointment has been cancelled. Call us anytime if you need service in the future.';
    }

    // Handle rating responses (1-5)
    const rating = parseInt(lowerMsg);
    if (rating >= 1 && rating <= 5) {
      // Store rating in database
      await dbRun(
        'INSERT INTO feedback (appointment_id, rating, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [appointmentId, rating]
      );
      
      if (rating >= 4) {
        return 'Thank you for the great rating! We appreciate your business. Please consider leaving us a review on Google: [review link]';
      } else {
        return 'Thank you for your feedback. We strive to improve and will use this to better serve you in the future.';
      }
    }

    return 'Thank you for your response. Our team will follow up with you shortly.';
  }

  /**
   * Get follow-up statistics
   */
  async getStats(): Promise<{
    reminders24hSent: number;
    reminders2hSent: number;
    missedHandled: number;
    followUpsSent: number;
  }> {
    const stats24h = await dbGet('SELECT COUNT(*) as count FROM appointments WHERE reminder_sent_24h = 1');
    const stats2h = await dbGet('SELECT COUNT(*) as count FROM appointments WHERE reminder_sent_2h = 1');
    const statsMissed = await dbGet('SELECT COUNT(*) as count FROM appointments WHERE missed_handled = 1');
    const statsFollowUp = await dbGet('SELECT COUNT(*) as count FROM appointments WHERE follow_up_sent = 1');

    return {
      reminders24hSent: (stats24h as any)?.count || 0,
      reminders2hSent: (stats2h as any)?.count || 0,
      missedHandled: (statsMissed as any)?.count || 0,
      followUpsSent: (statsFollowUp as any)?.count || 0,
    };
  }
}

// Database helper for feedback table
export async function createFeedbackTable(): Promise<void> {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id)
    )
  `);
}
