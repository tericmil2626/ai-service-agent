"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceBusinessOrchestrator = void 0;
const database_1 = require("./database");
const IntakeAgent_1 = require("./agents/IntakeAgent");
const SchedulingAgent_1 = require("./agents/SchedulingAgent");
const DispatchAgent_1 = require("./agents/DispatchAgent");
const FollowUpAgent_1 = require("./agents/FollowUpAgent");
const ReviewRequestAgent_1 = require("./agents/ReviewRequestAgent");
const KnowledgeBaseAgent_1 = require("./agents/KnowledgeBaseAgent");
class ServiceBusinessOrchestrator {
    constructor() {
        this.intakeAgent = new IntakeAgent_1.IntakeAgent();
        this.schedulingAgent = new SchedulingAgent_1.SchedulingAgent();
        this.dispatchAgent = new DispatchAgent_1.DispatchAgent();
        this.followUpAgent = new FollowUpAgent_1.FollowUpAgent();
        this.reviewAgent = new ReviewRequestAgent_1.ReviewRequestAgent();
        this.knowledgeBaseAgent = new KnowledgeBaseAgent_1.KnowledgeBaseAgent();
    }
    async processIncomingMessage(incoming) {
        // Step 1: Check if this is a follow-up response
        const existingCustomer = await this.findCustomerByPhone(incoming.customer_phone);
        if (existingCustomer) {
            const activeJob = await this.getActiveJob(existingCustomer.id);
            if (activeJob) {
                // Route to appropriate agent based on job status
                return await this.routeToActiveAgent(activeJob, incoming);
            }
        }
        // Step 2: New conversation - use Intake Agent
        const intakeResult = await this.intakeAgent.handleMessage(incoming.message, incoming.customer_phone);
        if (intakeResult.isComplete && intakeResult.handoffTo) {
            // Intake complete - hand off to Scheduling
            if (intakeResult.handoffTo.includes('Scheduling')) {
                const schedulingResult = await this.schedulingAgent.receiveFromReceptionist(intakeResult.data);
                return {
                    response: schedulingResult.response,
                    handoffTo: 'Scheduling Agent',
                    data: schedulingResult
                };
            }
        }
        return {
            response: intakeResult.response,
            handoffTo: intakeResult.handoffTo
        };
    }
    async processTimeBasedActions() {
        // Run every 15 minutes via cron
        // 1. Check for leads needing follow-up
        const leadsNeedingFollowUp = await this.followUpAgent.checkLeadsNeedingFollowUp();
        for (const lead of leadsNeedingFollowUp) {
            const result = await this.followUpAgent.processFollowUp(lead);
            if (result.shouldSend) {
                console.log(`[Follow-Up] Sending to ${lead.name}: ${result.message}`);
                // TODO: Actually send SMS via Twilio
            }
        }
        // 2. Check for review requests
        const jobsForReview = await this.reviewAgent.checkJobsForReviewRequest();
        for (const job of jobsForReview) {
            const result = await this.reviewAgent.sendSatisfactionCheck(job);
            if (result.sent) {
                console.log(`[Review] Satisfaction check to ${job.name}`);
                // TODO: Send SMS
            }
        }
        // 3. Check for appointment reminders (24 hours before)
        await this.sendAppointmentReminders();
        // 4. Check for unassigned jobs and dispatch
        await this.dispatchUnassignedJobs();
    }
    async handleAgentResponse(jobId, agentType, customerResponse) {
        const db = await (0, database_1.getDb)();
        const job = await db.get('SELECT * FROM jobs WHERE id = ?', jobId);
        if (!job) {
            return { response: 'Sorry, I could not find your service request.' };
        }
        switch (agentType) {
            case 'scheduling':
                const schedulingResult = await this.schedulingAgent.handleTimeSelection(customerResponse);
                if (schedulingResult.confirmed) {
                    // Job scheduled - assign technician
                    const dispatchResult = await this.dispatchAgent.receiveScheduledJob({
                        job_id: jobId,
                        customer_id: job.customer_id,
                        name: job.customer_name,
                        phone: job.customer_phone,
                        address: job.address,
                        service_type: job.service_type,
                        problem_description: job.description,
                        appointment_time: schedulingResult.appointment?.date + ' ' + schedulingResult.appointment?.time,
                        urgency: job.urgency
                    });
                    return {
                        response: schedulingResult.response + ' ' + dispatchResult.customerNotification,
                        handoffTo: 'Dispatch Agent'
                    };
                }
                return {
                    response: schedulingResult.response,
                    handoffTo: 'Scheduling Agent'
                };
            case 'followup':
                const followUpResult = await this.followUpAgent.handleResponse(jobId, customerResponse);
                if (followUpResult.action === 'schedule') {
                    // Customer wants to schedule - hand to scheduling
                    return {
                        response: followUpResult.reply,
                        handoffTo: 'Scheduling Agent'
                    };
                }
                return {
                    response: followUpResult.reply || 'Thank you for your response.'
                };
            case 'review':
                const jobData = await this.getJobDataForReview(jobId);
                const reviewResult = await this.reviewAgent.handleSatisfactionResponse(jobData, customerResponse);
                if (reviewResult.action === 'send_review_request') {
                    const requestResult = await this.reviewAgent.sendReviewRequest(jobData);
                    return {
                        response: requestResult.message
                    };
                }
                return {
                    response: reviewResult.message || 'Thank you for your feedback.',
                    handoffTo: reviewResult.handoffTo
                };
            default:
                return {
                    response: 'Thank you for your message. How can I help you today?'
                };
        }
    }
    async handleKnowledgeQuery(customerId, message, channel) {
        const result = await this.knowledgeBaseAgent.handleQuery({
            customer_id: customerId,
            message,
            channel
        });
        if (result.handoffTo) {
            return {
                response: result.response,
                handoffTo: result.handoffTo,
                data: { intent: result.handoffReason }
            };
        }
        return {
            response: result.response,
            handoffTo: result.confidence < 0.5 ? 'Human Agent' : undefined
        };
    }
    // Helper methods
    async findCustomerByPhone(phone) {
        const db = await (0, database_1.getDb)();
        return db.get('SELECT * FROM customers WHERE phone = ?', phone);
    }
    async getActiveJob(customerId) {
        const db = await (0, database_1.getDb)();
        return db.get('SELECT * FROM jobs WHERE customer_id = ? AND status NOT IN ("completed", "cancelled", "closed") ORDER BY created_at DESC LIMIT 1', customerId);
    }
    async routeToActiveAgent(job, incoming) {
        // Route based on job status and last agent
        switch (job.status) {
            case 'awaiting_response':
                // Check if this is follow-up related
                if (job.source === 'follow_up') {
                    return this.handleAgentResponse(job.id, 'followup', incoming.message);
                }
                // Continue with intake
                return this.processIncomingMessage(incoming);
            case 'scheduled':
                // Customer might be asking about appointment
                return {
                    response: 'Your appointment is confirmed. You can check details in your confirmation message. Need to reschedule?',
                    handoffTo: 'Scheduling Agent'
                };
            case 'qualified':
                // Ready for scheduling
                const schedulingResult = await this.schedulingAgent.receiveFromReceptionist({
                    customer_id: job.customer_id,
                    job_id: job.id,
                    name: job.customer_name,
                    phone: job.customer_phone,
                    address: job.address,
                    service_type: job.service_type,
                    problem_description: job.description,
                    urgency: job.urgency,
                    preferred_time: ''
                });
                return {
                    response: schedulingResult.response,
                    handoffTo: 'Scheduling Agent'
                };
            default:
                return this.processIncomingMessage(incoming);
        }
    }
    async sendAppointmentReminders() {
        const db = await (0, database_1.getDb)();
        // Find appointments in 24 hours
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = tomorrow.toISOString().split('T')[0];
        const appointments = await db.all('SELECT * FROM appointments WHERE scheduled_date = ? AND status = "confirmed" AND reminder_sent = 0', dateStr);
        for (const appt of appointments) {
            const result = await this.followUpAgent.sendAppointmentReminder(appt.id);
            if (result.sent) {
                await db.run('UPDATE appointments SET reminder_sent = 1 WHERE id = ?', appt.id);
                console.log(`[Reminder] Sent to appointment ${appt.id}`);
            }
        }
    }
    async dispatchUnassignedJobs() {
        const db = await (0, database_1.getDb)();
        const unassignedJobs = await db.all('SELECT * FROM appointments WHERE status = "confirmed" AND technician_id IS NULL');
        for (const job of unassignedJobs) {
            const dispatchResult = await this.dispatchAgent.receiveScheduledJob({
                job_id: job.job_id,
                customer_id: job.customer_id,
                name: job.customer_name,
                phone: job.customer_phone,
                address: job.address,
                service_type: job.service_type,
                problem_description: job.description,
                appointment_time: job.scheduled_date + ' ' + job.scheduled_time,
                urgency: job.urgency
            });
            console.log(`[Dispatch] Assigned ${dispatchResult.assignment?.technician_name} to job ${job.job_id}`);
        }
    }
    async getJobDataForReview(jobId) {
        const db = await (0, database_1.getDb)();
        return db.get(`
      SELECT 
        j.id as job_id,
        j.customer_id,
        c.name,
        c.phone,
        c.email,
        j.service_type,
        j.description,
        j.review_request_count,
        j.review_link
      FROM jobs j
      JOIN customers c ON j.customer_id = c.id
      WHERE j.id = ?
    `, jobId);
    }
    // Public API for external triggers
    async markJobComplete(jobId) {
        await (0, database_1.updateJobStatus)(jobId, 'completed');
        // Trigger review request flow
        const jobData = await this.getJobDataForReview(jobId);
        const result = await this.reviewAgent.sendSatisfactionCheck(jobData);
        if (result.sent) {
            console.log(`[Review] Satisfaction check initiated for job ${jobId}`);
        }
    }
    async handleMissedAppointment(appointmentId) {
        const result = await this.followUpAgent.handleMissedAppointment(appointmentId);
        if (result.sent) {
            console.log(`[Missed] Follow-up sent for appointment ${appointmentId}`);
        }
    }
}
exports.ServiceBusinessOrchestrator = ServiceBusinessOrchestrator;
exports.default = ServiceBusinessOrchestrator;
