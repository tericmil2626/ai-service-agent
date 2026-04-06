// Review Request Agent
// Automatically requests Google reviews from satisfied customers after job completion
import { getDb, dbGet, dbAll, dbRun } from '../database.js';
import { getSMSProvider } from '../sms.js';

export interface ReviewRequestData {
  appointment_id: number;
  job_id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  service_type: string;
  technician_name?: string;
  completed_date: string;
  rating?: number;
  review_submitted: boolean;
  request_count: number;
}

export class ReviewRequestAgent {
  private sms = getSMSProvider();
  
  // Configuration
  private readonly MAX_REQUESTS = 2; // Max 2 review requests per job
  private readonly FIRST_REQUEST_DELAY_HOURS = 2; // First request 2 hours after completion
  private readonly SECOND_REQUEST_DELAY_HOURS = 48; // Second request 48 hours later if no response
  private readonly GOOGLE_REVIEW_LINK = process.env.GOOGLE_REVIEW_LINK || 'https://g.page/r/YOUR_BUSINESS/review';

  /**
   * Process review requests
   * Should be called by a cron job every hour
   */
  async processReviewRequests(): Promise<{
    requestsSent: number;
    reviewsReceived: number;
    remindersSent: number;
  }> {
    const results = { requestsSent: 0, reviewsReceived: 0, remindersSent: 0 };

    // Get completed jobs needing first review request
    const firstRequests = await this.getJobsNeedingFirstRequest();
    for (const job of firstRequests) {
      await this.sendFirstReviewRequest(job);
      results.requestsSent++;
    }

    // Get jobs needing second review request (reminder)
    const secondRequests = await this.getJobsNeedingSecondRequest();
    for (const job of secondRequests) {
      await this.sendSecondReviewRequest(job);
      results.remindersSent++;
    }

    // Process any new review responses
    const newReviews = await this.processReviewResponses();
    results.reviewsReceived = newReviews;

    return results;
  }

  /**
   * Get completed jobs that need first review request (2+ hours after completion)
   */
  private async getJobsNeedingFirstRequest(): Promise<ReviewRequestData[]> {
    return await dbAll(`
      SELECT 
        a.id as appointment_id,
        a.job_id,
        a.completed_date,
        a.review_request_count,
        a.review_submitted,
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
      AND (a.review_request_count = 0 OR a.review_request_count IS NULL)
      AND a.completed_date IS NOT NULL
      AND datetime(a.completed_date) <= datetime('now', '-2 hours')
      AND (a.review_submitted = 0 OR a.review_submitted IS NULL)
      ORDER BY a.completed_date DESC
      LIMIT 50
    `);
  }

  /**
   * Get jobs that need second review request (reminder after 48 hours)
   */
  private async getJobsNeedingSecondRequest(): Promise<ReviewRequestData[]> {
    return await dbAll(`
      SELECT 
        a.id as appointment_id,
        a.job_id,
        a.completed_date,
        a.review_request_count,
        a.last_review_request_date,
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
      AND a.review_request_count = 1
      AND a.last_review_request_date IS NOT NULL
      AND datetime(a.last_review_request_date) <= datetime('now', '-48 hours')
      AND (a.review_submitted = 0 OR a.review_submitted IS NULL)
      ORDER BY a.last_review_request_date ASC
      LIMIT 20
    `);
  }

  /**
   * Send first review request
   */
  private async sendFirstReviewRequest(job: ReviewRequestData): Promise<void> {
    const message = `Hi ${job.customer_name}, thank you for choosing us for your ${job.service_type} service! 

If you were satisfied with our work, would you mind leaving us a quick review? It helps other homeowners find us and only takes 30 seconds.

${this.GOOGLE_REVIEW_LINK}

Thank you!
- The Team`;

    await this.sms.sendSMS(job.customer_phone, message);
    
    // Update appointment record
    await dbRun(`
      UPDATE appointments 
      SET review_request_count = 1,
          last_review_request_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [job.appointment_id]);

    console.log(`[ReviewRequestAgent] First request sent to ${job.customer_name} (${job.customer_phone})`);
  }

  /**
   * Send second review request (gentle reminder)
   */
  private async sendSecondReviewRequest(job: ReviewRequestData): Promise<void> {
    const message = `Hi ${job.customer_name}, just a quick reminder - if you have a moment, we'd really appreciate a review of our ${job.service_type} service. No pressure if you're busy!

${this.GOOGLE_REVIEW_LINK}

Thanks for your business!`;

    await this.sms.sendSMS(job.customer_phone, message);
    
    // Update appointment record
    await dbRun(`
      UPDATE appointments 
      SET review_request_count = 2,
          last_review_request_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [job.appointment_id]);

    console.log(`[ReviewRequestAgent] Second request (reminder) sent to ${job.customer_name}`);
  }

  /**
   * Handle customer response to review request
   */
  async handleResponse(phone: string, message: string, appointmentId?: number): Promise<string> {
    const lowerMsg = message.toLowerCase().trim();

    // Check if they left a review (they clicked the link or mention it)
    if (lowerMsg.includes('done') || lowerMsg.includes('left') || lowerMsg.includes('reviewed') || lowerMsg.includes('posted')) {
      if (appointmentId) {
        await dbRun(`
          UPDATE appointments 
          SET review_submitted = 1,
              review_response_date = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [appointmentId]);
      }
      return 'Thank you so much! We really appreciate you taking the time. Have a great day!';
    }

    // Check if they don't want to leave a review
    if (lowerMsg.includes('no') || lowerMsg.includes('skip') || lowerMsg.includes('pass') || lowerMsg.includes('not')) {
      if (appointmentId) {
        await dbRun(`
          UPDATE appointments 
          SET review_submitted = 1, -- Mark as complete so we don't ask again
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [appointmentId]);
      }
      return 'No problem at all! Thanks for your business, and we hope to serve you again in the future.';
    }

    // Check for rating (1-5 stars)
    const rating = this.extractRating(lowerMsg);
    if (rating) {
      if (appointmentId) {
        await dbRun(`
          UPDATE appointments 
          SET rating = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [rating, appointmentId]);
      }
      
      if (rating >= 4) {
        return `Thanks for the ${rating}-star rating! We'd love it if you could post that review on Google too: ${this.GOOGLE_REVIEW_LINK}`;
      } else {
        return 'Thank you for your feedback. We strive to improve and will use this to better serve you in the future.';
      }
    }

    return 'Thanks for your response! If you have a moment, we\'d really appreciate a review here: ' + this.GOOGLE_REVIEW_LINK;
  }

  /**
   * Extract rating from message (1-5)
   */
  private extractRating(message: string): number | null {
    // Look for patterns like "5 stars", "5/5", "rated 4", just "5", etc.
    const patterns = [
      /(\d)\s*stars?/i,
      /(\d)\s*\/\s*5/i,
      /rated\s*(\d)/i,
      /\b([1-5])\b/,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        const rating = parseInt(match[1]);
        if (rating >= 1 && rating <= 5) {
          return rating;
        }
      }
    }

    return null;
  }

  /**
   * Process any pending review responses
   * This would integrate with Google My Business API in production
   */
  private async processReviewResponses(): Promise<number> {
    // In production, this would check Google My Business API for new reviews
    // For now, we rely on customer SMS responses
    
    // Count reviews marked as submitted
    const result = await dbGet(`
      SELECT COUNT(*) as count 
      FROM appointments 
      WHERE review_submitted = 1 
      AND review_response_date >= datetime('now', '-1 hour')
    `);

    return (result as any)?.count || 0;
  }

  /**
   * Get review statistics
   */
  async getStats(): Promise<{
    totalRequestsSent: number;
    totalReviewsReceived: number;
    conversionRate: number;
    averageRating: number;
  }> {
    const stats = await dbGet(`
      SELECT 
        SUM(review_request_count) as total_requests,
        SUM(CASE WHEN review_submitted = 1 THEN 1 ELSE 0 END) as total_reviews,
        AVG(rating) as avg_rating
      FROM appointments
      WHERE status = 'completed'
    `);

    const totalRequests = (stats as any)?.total_requests || 0;
    const totalReviews = (stats as any)?.total_reviews || 0;
    const avgRating = (stats as any)?.avg_rating || 0;

    return {
      totalRequestsSent: totalRequests,
      totalReviewsReceived: totalReviews,
      conversionRate: totalRequests > 0 ? (totalReviews / totalRequests) * 100 : 0,
      averageRating: Math.round(avgRating * 10) / 10,
    };
  }

  /**
   * Manually trigger review request for a specific appointment
   */
  async sendManualRequest(appointmentId: number): Promise<boolean> {
    const appointment = await dbGet(`
      SELECT 
        a.id as appointment_id,
        a.job_id,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        j.service_type,
        t.name as technician_name
      FROM appointments a
      JOIN jobs j ON a.job_id = j.id
      JOIN customers c ON j.customer_id = c.id
      LEFT JOIN technicians t ON a.technician_id = t.id
      WHERE a.id = ?
      AND a.status = 'completed'
    `, [appointmentId]);

    if (!appointment) {
      console.log(`[ReviewRequestAgent] Appointment ${appointmentId} not found or not completed`);
      return false;
    }

    await this.sendFirstReviewRequest(appointment as ReviewRequestData);
    return true;
  }
}

// Database migration helper
export async function addReviewColumns(): Promise<void> {
  // Add completed_date column (needed to track when jobs are done)
  await dbRun(`
    ALTER TABLE appointments ADD COLUMN completed_date DATETIME
  `).catch(() => {}); // Column may already exist
  
  // Add review tracking columns
  await dbRun(`
    ALTER TABLE appointments ADD COLUMN review_request_count INTEGER DEFAULT 0
  `).catch(() => {});
  
  await dbRun(`
    ALTER TABLE appointments ADD COLUMN last_review_request_date DATETIME
  `).catch(() => {});
  
  await dbRun(`
    ALTER TABLE appointments ADD COLUMN review_submitted INTEGER DEFAULT 0
  `).catch(() => {});
  
  await dbRun(`
    ALTER TABLE appointments ADD COLUMN review_response_date DATETIME
  `).catch(() => {});
  
  await dbRun(`
    ALTER TABLE appointments ADD COLUMN rating INTEGER
  `).catch(() => {});
}
