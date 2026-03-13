import { getDb, saveMessage, updateJobStatus } from '../database';

interface ReviewRequestData {
  job_id: number;
  customer_id: number;
  name: string;
  phone: string;
  email?: string;
  service_type: string;
  technician_name?: string;
  completion_date: string;
  satisfaction_confirmed?: boolean;
  review_request_count: number;
  review_link?: string;
}

export class ReviewRequestAgent {
  private maxRequests: number = 2;
  private requestDelayHours: number = 3; // Initial request 3 hours after completion
  private followUpDelayHours: number = 24; // Follow-up after 24 hours if no response

  async checkJobsForReviewRequest(): Promise<ReviewRequestData[]> {
    const db = await getDb();

    // Find completed jobs that haven't received review requests yet
    const jobs = await db.all(`
      SELECT 
        j.id as job_id,
        j.customer_id,
        c.name,
        c.phone,
        c.email,
        j.service_type,
        t.name as technician_name,
        a.completed_at as completion_date,
        j.review_request_count,
        j.review_link
      FROM jobs j
      JOIN customers c ON j.customer_id = c.id
      JOIN appointments a ON j.id = a.job_id
      LEFT JOIN technicians t ON a.technician_id = t.id
      WHERE j.status = 'completed'
        AND (j.review_request_count IS NULL OR j.review_request_count < ?)
        AND (j.last_review_request IS NULL OR 
             datetime(j.last_review_request) < datetime('now', '-24 hours'))
        AND datetime(a.completed_at) < datetime('now', '-3 hours')
    `, this.maxRequests);

    return jobs.map((job: any) => ({
      ...job,
      review_request_count: job.review_request_count || 0
    }));
  }

  async sendSatisfactionCheck(data: ReviewRequestData): Promise<{
    message: string;
    sent: boolean;
    nextStep: 'await_response' | 'send_review_request';
  }> {
    // If satisfaction already confirmed, skip to review request
    if (data.satisfaction_confirmed) {
      return {
        message: '',
        sent: false,
        nextStep: 'send_review_request'
      };
    }

    const message = this.generateSatisfactionCheck(data);

    await saveMessage({
      customer_id: data.customer_id,
      job_id: data.job_id,
      channel: 'sms',
      direction: 'outbound',
      message_text: message,
      agent_name: 'Review Request Agent'
    });

    // Update job to track satisfaction check sent
    await this.updateJobReviewStatus(data.job_id, 'satisfaction_check_sent');

    return {
      message,
      sent: true,
      nextStep: 'await_response'
    };
  }

  async handleSatisfactionResponse(
    data: ReviewRequestData, 
    response: string
  ): Promise<{
    action: 'send_review_request' | 'escalate' | 'no_action';
    message?: string;
    handoffTo?: string;
  }> {
    const lowerResponse = response.toLowerCase();

    // Positive indicators
    const positiveIndicators = [
      'yes', 'great', 'good', 'perfect', 'excellent', 'amazing', 'awesome',
      'working', 'fixed', 'satisfied', 'happy', 'thanks', 'thank you',
      'everything is good', 'all good', 'no issues', 'no problems'
    ];

    // Negative indicators
    const negativeIndicators = [
      'no', 'not working', 'still broken', 'problem', 'issue', 'disappointed',
      'terrible', 'bad', 'worst', 'unhappy', 'not satisfied', 'regret',
      'doesn\'t work', 'not fixed', 'same problem', 'worse'
    ];

    // Check for negative feedback first (priority)
    if (negativeIndicators.some(ind => lowerResponse.includes(ind))) {
      return {
        action: 'escalate',
        message: "I'm sorry to hear that your experience wasn't perfect. Let me connect you with our support team so we can make this right.",
        handoffTo: 'Customer Support Agent'
      };
    }

    // Check for positive feedback
    if (positiveIndicators.some(ind => lowerResponse.includes(ind))) {
      // Mark satisfaction as confirmed
      await this.confirmSatisfaction(data.job_id);
      
      return {
        action: 'send_review_request'
      };
    }

    // Unclear response - ask for clarification
    return {
      action: 'no_action',
      message: 'Glad to hear from you. Just to confirm - is everything working properly after the service?'
    };
  }

  async sendReviewRequest(data: ReviewRequestData): Promise<{
    message: string;
    sent: boolean;
    platform?: string;
  }> {
    // Don't exceed max requests
    if (data.review_request_count >= this.maxRequests) {
      return { message: '', sent: false };
    }

    const message = this.generateReviewRequest(data);

    await saveMessage({
      customer_id: data.customer_id,
      job_id: data.job_id,
      channel: 'sms',
      direction: 'outbound',
      message_text: message,
      agent_name: 'Review Request Agent'
    });

    // Update request count
    await this.incrementReviewRequestCount(data.job_id);

    return {
      message,
      sent: true,
      platform: 'Google' // Default platform
    };
  }

  async sendReviewReminder(data: ReviewRequestData): Promise<{
    message: string;
    sent: boolean;
  }> {
    // Only send one reminder
    if (data.review_request_count >= 2) {
      return { message: '', sent: false };
    }

    const message = this.generateReminder(data);

    await saveMessage({
      customer_id: data.customer_id,
      job_id: data.job_id,
      channel: 'sms',
      direction: 'outbound',
      message_text: message,
      agent_name: 'Review Request Agent'
    });

    await this.incrementReviewRequestCount(data.job_id);

    return { message, sent: true };
  }

  async recordReviewReceived(jobId: number, platform: string): Promise<void> {
    const db = await getDb();
    
    await db.run(`
      UPDATE jobs SET 
        review_received = 1,
        review_platform = ?,
        review_date = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [platform, jobId]);
  }

  private generateSatisfactionCheck(data: ReviewRequestData): string {
    const firstName = data.name.split(' ')[0];
    
    return `Hi ${firstName}! Just checking in to make sure everything is working properly after your recent ${data.service_type} service. Let us know if you have any questions!`;
  }

  private generateReviewRequest(data: ReviewRequestData): string {
    const firstName = data.name.split(' ')[0];
    
    let message = `Hi ${firstName}, thanks again for choosing us for your ${data.service_type} service. If you were happy with the work, we'd really appreciate a quick review. It helps other customers find us.`;
    
    if (data.review_link) {
      message += ` You can leave a review here: ${data.review_link}`;
    }

    return message;
  }

  private generateReminder(data: ReviewRequestData): string {
    const firstName = data.name.split(' ')[0];
    
    return `Hi ${firstName}, just a friendly reminder - if you have a moment, we'd really appreciate a quick review of your recent ${data.service_type} service. Thanks again!`;
  }

  private async updateJobReviewStatus(jobId: number, status: string): Promise<void> {
    const db = await getDb();
    
    await db.run(`
      UPDATE jobs SET 
        review_status = ?,
        last_review_request = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, jobId]);
  }

  private async confirmSatisfaction(jobId: number): Promise<void> {
    const db = await getDb();
    
    await db.run(`
      UPDATE jobs SET 
        satisfaction_confirmed = 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [jobId]);
  }

  private async incrementReviewRequestCount(jobId: number): Promise<void> {
    const db = await getDb();
    
    await db.run(`
      UPDATE jobs SET 
        review_request_count = COALESCE(review_request_count, 0) + 1,
        last_review_request = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [jobId]);
  }

  getStructuredOutput(data: ReviewRequestData, status: string, platform?: string): any {
    const base = {
      name: data.name,
      phone: data.phone,
      service_type: data.service_type,
      review_request_status: status
    };

    if (platform) {
      return { ...base, review_platform: platform };
    }

    if (status === 'escalated') {
      return { ...base, handoff_agent: 'Customer Support Agent' };
    }

    return base;
  }
}

export default ReviewRequestAgent;
