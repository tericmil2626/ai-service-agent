"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchAgent = void 0;
exports.createTechnician = createTechnician;
exports.getTechnicianById = getTechnicianById;
exports.getAllTechnicians = getAllTechnicians;
// LLM-Powered Dispatch Agent
// Assigns technicians to scheduled appointments based on specialty, availability, and location
const database_js_1 = require("../database.js");
const calendar_js_1 = require("../calendar.js");
class DispatchAgent {
    data = null;
    availableTechnicians = [];
    initialized = false;
    /**
     * Initialize the dispatch agent with appointment data from scheduling
     */
    async initialize(data) {
        this.data = data;
        this.initialized = true;
        console.log('[DispatchAgent] Initialized with appointment:', data.appointment_id);
    }
    /**
     * Main message handler for orchestrator integration
     */
    async handleMessage(message, context) {
        console.log('[DispatchAgent] handleMessage called:', {
            initialized: this.initialized,
            hasData: !!this.data,
            status: this.data?.status
        });
        if (!this.initialized || !this.data) {
            return {
                response: "I'm sorry, I don't have the appointment details. Let me connect you back to scheduling.",
                isComplete: false,
            };
        }
        // If pending assignment, find and assign technician
        if (this.data.status === 'pending_assignment') {
            const result = await this.assignTechnician();
            return {
                response: result.response,
                isComplete: result.assigned || false,
                handoffTo: result.assigned ? 'Follow-Up Agent' : undefined,
                data: result.technician ? { technician: result.technician, appointment: this.data } : undefined,
            };
        }
        // Handle technician response (accept/decline)
        if (this.data.status === 'assigned') {
            const result = await this.handleTechnicianResponse(message);
            return {
                response: result.response,
                isComplete: result.assigned || false,
                handoffTo: result.assigned ? 'Follow-Up Agent' : undefined,
                data: { appointment: this.data, technician: result.technician },
            };
        }
        return {
            response: "I'm processing your dispatch request. Please wait a moment.",
            isComplete: false,
        };
    }
    /**
     * Receive appointment from Scheduling Agent and begin dispatch process
     */
    async receiveFromScheduling(appointmentData) {
        this.data = { ...appointmentData, status: 'pending_assignment' };
        this.initialized = true;
        // Update appointment status in database
        await this.updateAppointmentStatus('pending_assignment');
        // Find available technicians
        return await this.assignTechnician();
    }
    /**
     * Find and assign the best technician for the job
     */
    async assignTechnician() {
        if (!this.data) {
            return { response: "Error: No appointment data available.", assigned: false };
        }
        // Get technicians matching the service type
        this.availableTechnicians = await this.findTechniciansBySpecialty(this.data.service_type);
        if (this.availableTechnicians.length === 0) {
            // No matching technicians - flag for manual dispatch
            await this.updateAppointmentStatus('needs_manual_dispatch');
            await (0, database_js_1.updateJobStatus)(this.data.job_id, 'pending_dispatch');
            return {
                response: `No technicians available for ${this.data.service_type} service. This appointment requires manual dispatch.`,
                assigned: false,
            };
        }
        // Score and rank technicians
        const rankedTechs = await this.rankTechnicians(this.availableTechnicians);
        const selectedTech = rankedTechs[0];
        // Assign technician to appointment (with calendar event)
        await this.assignTechnicianToAppointment(selectedTech.id, selectedTech);
        // Update status
        this.data.assigned_technician_id = selectedTech.id;
        this.data.status = 'assigned';
        await this.updateAppointmentStatus('assigned');
        await (0, database_js_1.updateJobStatus)(this.data.job_id, 'dispatched');
        // Generate notification message
        const notificationMessage = await this.generateTechnicianNotification(selectedTech);
        return {
            response: `Assigned ${selectedTech.name} to ${this.data.service_type} appointment on ${this.data.scheduled_date} at ${this.data.scheduled_time}. Notification sent.`,
            assigned: true,
            technician: selectedTech,
            notificationSent: true,
        };
    }
    /**
     * Find technicians by specialty
     */
    async findTechniciansBySpecialty(serviceType) {
        const db = await (0, database_js_1.getDb)();
        // Get all active technicians
        const rows = await (0, database_js_1.dbAll)(`SELECT id, name, phone, email, specialties, is_active 
       FROM technicians 
       WHERE is_active = 1`);
        // Parse specialties and filter by service type
        return rows
            .map((row) => ({
            id: row.id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            specialties: JSON.parse(row.specialties || '[]'),
            is_active: row.is_active === 1,
        }))
            .filter((tech) => tech.specialties.some(s => s.toLowerCase().includes(serviceType.toLowerCase()) ||
            serviceType.toLowerCase().includes(s.toLowerCase())));
    }
    /**
     * Rank technicians by suitability (workload, skill match, etc.)
     */
    async rankTechnicians(technicians) {
        if (!this.data)
            return technicians;
        const db = await (0, database_js_1.getDb)();
        const date = this.data.scheduled_date;
        // Get workload for each technician on the scheduled date
        const workloads = await (0, database_js_1.dbAll)(`SELECT technician_id, COUNT(*) as job_count 
       FROM appointments 
       WHERE scheduled_date = ? 
       AND technician_id IS NOT NULL 
       AND status IN ('confirmed', 'assigned', 'dispatched')
       GROUP BY technician_id`, [date]);
        const workloadMap = new Map(workloads.map((w) => [w.technician_id, w.job_count]));
        // Score each technician
        const scored = technicians.map(tech => {
            const workload = workloadMap.get(tech.id) || 0;
            const specialtyMatch = tech.specialties.filter(s => this.data.service_type.toLowerCase().includes(s.toLowerCase())).length;
            // Score: lower workload is better, more specialty matches is better
            const score = (100 - workload * 10) + specialtyMatch * 20;
            return { tech, score };
        });
        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);
        return scored.map(s => s.tech);
    }
    /**
     * Assign technician to appointment in database and create calendar event
     */
    async assignTechnicianToAppointment(technicianId, technician) {
        if (!this.data)
            return;
        // Update database
        await (0, database_js_1.dbRun)(`UPDATE appointments 
       SET technician_id = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`, [technicianId, this.data.appointment_id]);
        // Create Google Calendar event
        try {
            const calendarService = (0, calendar_js_1.getCalendarService)();
            // Only create calendar event if service is initialized
            if (calendarService.isInitialized()) {
                const startTime = new Date(`${this.data.scheduled_date}T${this.data.scheduled_time}`);
                const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2 hour appointment
                const event = {
                    summary: `${this.data.service_type.toUpperCase()} Service - ${this.data.customer_name}`,
                    description: `Service: ${this.data.service_type}\nIssue: ${this.data.problem_description || 'N/A'}\nUrgency: ${this.data.urgency || 'normal'}\nCustomer Phone: ${this.data.customer_phone}`,
                    location: this.data.address,
                    startTime,
                    endTime,
                    attendees: technician.email ? [technician.email] : undefined,
                };
                const eventId = await calendarService.createAppointmentEvent(event);
                if (eventId) {
                    // Store calendar event ID in database
                    await (0, database_js_1.dbRun)(`UPDATE appointments SET calendar_event_id = ? WHERE id = ?`, [eventId, this.data.appointment_id]);
                    console.log('[DispatchAgent] Calendar event created:', eventId);
                }
            }
            else {
                console.log('[DispatchAgent] Calendar service not initialized, skipping calendar event');
            }
        }
        catch (error) {
            console.error('[DispatchAgent] Failed to create calendar event:', error);
            // Don't fail the assignment if calendar fails
        }
    }
    /**
     * Update appointment status
     */
    async updateAppointmentStatus(status) {
        if (!this.data)
            return;
        await (0, database_js_1.dbRun)(`UPDATE appointments 
       SET status = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`, [status, this.data.appointment_id]);
    }
    /**
     * Generate notification message for technician
     */
    async generateTechnicianNotification(technician) {
        if (!this.data)
            return '';
        const formatTime12Hour = (time24) => {
            const [hours, minutes] = time24.split(':').map(Number);
            const period = hours >= 12 ? 'PM' : 'AM';
            const hours12 = hours % 12 || 12;
            return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
        };
        const date = new Date(this.data.scheduled_date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        const time12Hour = formatTime12Hour(this.data.scheduled_time);
        const urgencyFlag = this.data.urgency === 'high' ? 'URGENT: ' : '';
        return `${urgencyFlag}New ${this.data.service_type} job assigned:

Customer: ${this.data.customer_name}
Address: ${this.data.address}
Date: ${dayName}
Time: ${time12Hour}
Issue: ${this.data.problem_description || 'See work order for details'}

Reply YES to confirm or NO to decline.`;
    }
    /**
     * Handle technician's response to assignment
     */
    async handleTechnicianResponse(response) {
        if (!this.data) {
            return { response: "Error: No appointment data available.", assigned: false };
        }
        const lowerResponse = response.toLowerCase().trim();
        // Check for acceptance
        if (lowerResponse.includes('yes') || lowerResponse.includes('confirm') || lowerResponse.includes('accept')) {
            this.data.status = 'confirmed';
            await this.updateAppointmentStatus('confirmed');
            return {
                response: `Technician confirmed. Appointment is now locked in.`,
                assigned: true,
            };
        }
        // Check for decline
        if (lowerResponse.includes('no') || lowerResponse.includes('decline') || lowerResponse.includes('reject') || lowerResponse.includes('unavailable')) {
            // Reassign to next available technician
            const currentTechIndex = this.availableTechnicians.findIndex(t => t.id === this.data.assigned_technician_id);
            const nextTech = this.availableTechnicians[currentTechIndex + 1];
            if (nextTech) {
                await this.assignTechnicianToAppointment(nextTech.id);
                this.data.assigned_technician_id = nextTech.id;
                this.data.status = 'assigned';
                await this.updateAppointmentStatus('assigned');
                const notification = await this.generateTechnicianNotification(nextTech);
                return {
                    response: `Previous technician declined. Reassigned to ${nextTech.name}.`,
                    assigned: true,
                    technician: nextTech,
                };
            }
            else {
                // No more technicians available
                await this.updateAppointmentStatus('needs_manual_dispatch');
                await (0, database_js_1.updateJobStatus)(this.data.job_id, 'pending_dispatch');
                return {
                    response: `All available technicians declined. Appointment requires manual dispatch.`,
                    assigned: false,
                };
            }
        }
        // Unclear response
        return {
            response: "Please reply YES to confirm or NO to decline this assignment.",
            assigned: false,
        };
    }
    /**
     * Mark appointment as dispatched (technician is on the way)
     */
    async markAsDispatched() {
        if (!this.data) {
            return { response: "Error: No appointment data available.", assigned: false };
        }
        this.data.status = 'dispatched';
        await this.updateAppointmentStatus('dispatched');
        await (0, database_js_1.updateJobStatus)(this.data.job_id, 'in_progress');
        return {
            response: `Technician dispatched to ${this.data.address}.`,
            assigned: true,
        };
    }
    /**
     * Get current assignment status
     */
    getStatus() {
        return {
            data: this.data,
            technicians: this.availableTechnicians,
            initialized: this.initialized,
        };
    }
    // State persistence methods for orchestrator
    getState() {
        return {
            data: this.data,
            availableTechnicians: this.availableTechnicians,
            initialized: this.initialized,
        };
    }
    setState(state) {
        this.data = state.data;
        this.availableTechnicians = state.availableTechnicians;
        this.initialized = state.initialized;
    }
}
exports.DispatchAgent = DispatchAgent;
// Database helper functions for technicians
async function createTechnician(data) {
    const result = await (0, database_js_1.dbRun)(`INSERT INTO technicians (name, phone, email, specialties, is_active)
     VALUES (?, ?, ?, ?, 1)`, [data.name, data.phone, data.email || null, JSON.stringify(data.specialties)]);
    return result.lastID;
}
async function getTechnicianById(id) {
    const row = await (0, database_js_1.dbGet)(`SELECT id, name, phone, email, specialties, is_active FROM technicians WHERE id = ?`, [id]);
    if (!row)
        return null;
    return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        specialties: JSON.parse(row.specialties || '[]'),
        is_active: row.is_active === 1,
    };
}
async function getAllTechnicians() {
    const rows = await (0, database_js_1.dbAll)(`SELECT id, name, phone, email, specialties, is_active FROM technicians WHERE is_active = 1`);
    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        specialties: JSON.parse(row.specialties || '[]'),
        is_active: row.is_active === 1,
    }));
}
//# sourceMappingURL=DispatchAgent.js.map