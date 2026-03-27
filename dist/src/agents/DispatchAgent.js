"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchAgent = void 0;
// Dispatch Agent
// Assigns technicians to scheduled appointments using round-robin
const database_js_1 = require("../database.js");
const sms_js_1 = require("../sms.js");
class DispatchAgent {
    id = 'dispatch';
    name = 'Dispatch Agent';
    dispatchData = null;
    lastAssignedIndex = 0;
    async initialize(context) {
        this.dispatchData = {
            customer_id: context.customer_id,
            job_id: context.job_id,
            appointment_id: context.appointment_id,
            customer_name: context.name || context.customer_name,
            customer_phone: context.phone || context.customer_phone,
            address: context.address,
            service_type: context.service_type,
            scheduled_date: context.scheduled_date || context.appointment?.date,
            scheduled_time: context.scheduled_time || context.appointment?.time,
        };
    }
    async handleMessage(message, context) {
        // If we have dispatch data, try to assign a technician
        if (this.dispatchData) {
            return await this.assignTechnician();
        }
        // Otherwise, this is a general dispatch inquiry
        return {
            response: "I'll check on your technician assignment. One moment please.",
            isComplete: false,
        };
    }
    async assignTechnician() {
        if (!this.dispatchData) {
            return {
                response: "I'm sorry, I don't have the appointment details. Please contact our office.",
                isComplete: false,
            };
        }
        try {
            // Get all active technicians
            const technicians = await this.getActiveTechnicians();
            if (technicians.length === 0) {
                return {
                    response: "We're currently scheduling technicians for your appointment. You'll receive a confirmation shortly with your technician's details.",
                    isComplete: false,
                };
            }
            // Use round-robin to select next technician
            const technician = this.selectTechnicianRoundRobin(technicians);
            // Assign technician to appointment
            await this.updateAppointmentWithTechnician(technician.id);
            // Update job status to 'dispatched'
            await (0, database_js_1.updateJobStatus)(this.dispatchData.job_id, 'dispatched');
            // Send notification to customer
            await this.notifyCustomer(technician);
            const date = new Date(this.dispatchData.scheduled_date);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
            return {
                response: `Great news! We've assigned ${technician.name} to your ${this.dispatchData.service_type} appointment on ${dayName} at ${this.dispatchData.scheduled_time}. They'll arrive at ${this.dispatchData.address} within the scheduled window.`,
                isComplete: true,
                data: {
                    technician_id: technician.id,
                    technician_name: technician.name,
                    technician_phone: technician.phone,
                    appointment_id: this.dispatchData.appointment_id,
                    status: 'dispatched',
                },
            };
        }
        catch (error) {
            console.error('[DispatchAgent] Error assigning technician:', error);
            return {
                response: "Your appointment is confirmed. We're assigning a technician and will send you their details shortly.",
                isComplete: false,
            };
        }
    }
    async getActiveTechnicians() {
        const rows = await (0, database_js_1.dbAll)(`SELECT id, name, phone, email, specialties, is_active 
       FROM technicians 
       WHERE is_active = 1 
       ORDER BY id ASC`);
        return rows;
    }
    selectTechnicianRoundRobin(technicians) {
        // Simple round-robin: use last assigned index to pick next
        const index = this.lastAssignedIndex % technicians.length;
        this.lastAssignedIndex = (index + 1) % technicians.length;
        return technicians[index];
    }
    async updateAppointmentWithTechnician(technicianId) {
        if (!this.dispatchData)
            return;
        await (0, database_js_1.dbRun)(`UPDATE appointments 
       SET technician_id = ?, status = 'dispatched', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`, [technicianId, this.dispatchData.appointment_id]);
        console.log(`[DispatchAgent] Assigned technician ${technicianId} to appointment ${this.dispatchData.appointment_id}`);
    }
    async notifyCustomer(technician) {
        if (!this.dispatchData)
            return;
        const sms = (0, sms_js_1.getSMSProvider)();
        const date = new Date(this.dispatchData.scheduled_date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        const message = `Hi ${this.dispatchData.customer_name}, your ${this.dispatchData.service_type} appointment on ${dayName} at ${this.dispatchData.scheduled_time} has been assigned to ${technician.name}. They'll arrive at ${this.dispatchData.address} within your scheduled window. Thanks!`;
        try {
            await sms.sendSMS(this.dispatchData.customer_phone, message);
            console.log(`[DispatchAgent] Sent technician assignment notification to ${this.dispatchData.customer_phone}`);
        }
        catch (error) {
            console.error('[DispatchAgent] Failed to send notification:', error);
        }
    }
    // Get state for persistence
    getState() {
        return {
            dispatchData: this.dispatchData,
            lastAssignedIndex: this.lastAssignedIndex,
        };
    }
    // Restore state from persistence
    setState(state) {
        if (state.dispatchData) {
            this.dispatchData = state.dispatchData;
        }
        if (typeof state.lastAssignedIndex === 'number') {
            this.lastAssignedIndex = state.lastAssignedIndex;
        }
    }
}
exports.DispatchAgent = DispatchAgent;
exports.default = DispatchAgent;
//# sourceMappingURL=DispatchAgent.js.map