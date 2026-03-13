// TODO: Replace SQLite with Google Calendar API for production deployment
// Current: Appointments stored in local SQLite database
// Future: Sync to Google Calendar for real scheduling and technician access

import { getDb, createAppointment, updateJobStatus } from '../database';

interface SchedulingData {
  customer_id: number;
  job_id: number;
  name: string;
  phone: string;
  address: string;
  service_type: string;
  problem_description?: string;
  urgency?: string;
  preferred_time?: string;
}

interface TimeSlot {
  date: string;
  time: string;
  available: boolean;
}

export class SchedulingAgent {
  private data: SchedulingData | null = null;
  private proposedSlots: TimeSlot[] = [];

  async receiveFromReceptionist(data: SchedulingData): Promise<{
    response: string;
    slots?: TimeSlot[];
  }> {
    this.data = data;

    // Check urgency and respond accordingly
    if (data.urgency === 'high' || data.urgency === 'emergency') {
      return {
        response: "That sounds urgent. I'm checking the earliest technician availability now."
      };
    }

    // Get available slots
    this.proposedSlots = await this.getAvailableSlots(data.urgency || 'medium');

    // Format response with slots
    const slotText = this.proposedSlots.map((slot, i) => {
      const date = new Date(slot.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      return `${i + 1}. ${dayName} at ${slot.time}`;
    }).join(', ');

    return {
      response: `Thanks for the details. We have openings ${slotText}. Which works better for you?`,
      slots: this.proposedSlots
    };
  }

  async handleTimeSelection(selection: string): Promise<{
    response: string;
    confirmed: boolean;
    appointment?: any;
  }> {
    if (!this.data) {
      return {
        response: "I'm sorry, I don't have your service details. Let me connect you back to our receptionist.",
        confirmed: false
      };
    }

    // Parse selection (could be "tomorrow at 10am", "option 1", "10 AM", etc.)
    const selectedSlot = this.parseTimeSelection(selection);

    if (!selectedSlot) {
      return {
        response: "I didn't catch that. Could you please choose one of the times I mentioned, or let me know a specific day and time that works?",
        confirmed: false
      };
    }

    // Create the appointment
    const appointmentId = await this.bookAppointment(selectedSlot);

    if (!appointmentId) {
      return {
        response: "I'm sorry, that time slot is no longer available. Let me check for other options.",
        confirmed: false
      };
    }

    // Update job status
    await updateJobStatus(this.data.job_id, 'scheduled');

    // Format confirmation
    const date = new Date(selectedSlot.date);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return {
      response: `Perfect! I've scheduled your ${this.data.service_type} appointment for ${dayName} at ${selectedSlot.time} at ${this.data.address}. A technician will arrive within the scheduled window. We'll send a reminder before the appointment.`,
      confirmed: true,
      appointment: {
        id: appointmentId,
        date: selectedSlot.date,
        time: selectedSlot.time,
        service_type: this.data.service_type,
        address: this.data.address
      }
    };
  }

  async handleRescheduleRequest(currentAppointmentId: number, newPreference?: string): Promise<{
    response: string;
    slots?: TimeSlot[];
  }> {
    const db = await getDb();
    
    // Get current appointment
    const current = await db.get(
      `SELECT a.*, j.service_type, c.name, c.address 
       FROM appointments a
       JOIN jobs j ON a.job_id = j.id
       JOIN customers c ON j.customer_id = c.id
       WHERE a.id = ?`,
      currentAppointmentId
    );

    if (!current) {
      return {
        response: "I couldn't find that appointment. Could you provide your phone number so I can look it up?"
      };
    }

    // Get new available slots
    this.proposedSlots = await this.getAvailableSlots('medium');

    const slotText = this.proposedSlots.slice(0, 3).map((slot, i) => {
      const date = new Date(slot.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      return `${dayName} at ${slot.time}`;
    }).join(' or ');

    return {
      response: `No problem. I can move your ${current.service_type} appointment. I have ${slotText} available. Which works for you?`,
      slots: this.proposedSlots
    };
  }

  async confirmReschedule(appointmentId: number, newSlot: TimeSlot): Promise<{
    response: string;
    success: boolean;
  }> {
    const db = await getDb();
    
    try {
      await db.run(
        `UPDATE appointments 
         SET scheduled_date = ?, scheduled_time = ?, status = 'rescheduled', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [newSlot.date, newSlot.time, appointmentId]
      );

      const date = new Date(newSlot.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

      return {
        response: `Great! Your appointment has been rescheduled to ${dayName} at ${newSlot.time}.`,
        success: true
      };
    } catch (error) {
      return {
        response: "I'm sorry, I couldn't reschedule that appointment. Please call our office for assistance.",
        success: false
      };
    }
  }

  async handleCancellation(appointmentId: number): Promise<{
    response: string;
    success: boolean;
  }> {
    const db = await getDb();
    
    try {
      await db.run(
        `UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        appointmentId
      );

      // Also update job status
      const appointment = await db.get('SELECT job_id FROM appointments WHERE id = ?', appointmentId);
      if (appointment) {
        await updateJobStatus(appointment.job_id, 'cancelled');
      }

      return {
        response: "Your appointment has been canceled. Let us know if you'd like to reschedule in the future.",
        success: true
      };
    } catch (error) {
      return {
        response: "I'm sorry, I couldn't cancel that appointment. Please call our office.",
        success: false
      };
    }
  }

  private async getAvailableSlots(urgency: string): Promise<TimeSlot[]> {
    const db = await getDb();
    const slots: TimeSlot[] = [];
    
    // Business hours: 8 AM - 5 PM
    const businessHours = ['08:00', '10:00', '12:00', '14:00', '16:00'];
    
    // Start from tomorrow
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    
    // How many days to check based on urgency
    const daysToCheck = urgency === 'high' || urgency === 'emergency' ? 2 : 5;
    const slotsPerDay = urgency === 'high' ? 1 : 2;

    for (let day = 0; day < daysToCheck; day++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() + day);
      const dateStr = checkDate.toISOString().split('T')[0];

      // Check which slots are already booked
      const bookedSlots = await db.all(
        `SELECT scheduled_time FROM appointments 
         WHERE scheduled_date = ? AND status IN ('confirmed', 'pending')`,
        dateStr
      );
      
      const bookedTimes = new Set(bookedSlots.map((b: any) => b.scheduled_time));

      // Add available slots
      for (const hour of businessHours) {
        if (!bookedTimes.has(hour)) {
          slots.push({
            date: dateStr,
            time: hour,
            available: true
          });
          
          if (slots.length >= (urgency === 'high' ? 2 : 6)) {
            return slots;
          }
        }
      }
    }

    return slots;
  }

  private parseTimeSelection(selection: string): TimeSlot | null {
    const lower = selection.toLowerCase();
    
    // Check if they selected by number ("option 1", "the first one", "1")
    const numberMatch = lower.match(/(?:option\s*)?(\d)|first|second|third/);
    if (numberMatch) {
      let index: number;
      if (lower.includes('first') || lower.includes('1')) index = 0;
      else if (lower.includes('second') || lower.includes('2')) index = 1;
      else if (lower.includes('third') || lower.includes('3')) index = 2;
      else index = parseInt(numberMatch[1]) - 1;
      
      if (this.proposedSlots[index]) {
        return this.proposedSlots[index];
      }
    }

    // Check for specific time mentions
    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch && this.proposedSlots.length > 0) {
      // Find closest matching slot
      const hour = parseInt(timeMatch[1]);
      const ampm = timeMatch[3];
      const targetHour = ampm === 'pm' && hour !== 12 ? hour + 12 : hour;
      
      const matchingSlot = this.proposedSlots.find(s => {
        const slotHour = parseInt(s.time.split(':')[0]);
        return Math.abs(slotHour - targetHour) <= 1;
      });
      
      if (matchingSlot) return matchingSlot;
    }

    // Check for "tomorrow", "today", specific days
    const dayKeywords: Record<string, number> = {
      'today': 0,
      'tomorrow': 1,
      'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5
    };
    
    for (const [keyword, offset] of Object.entries(dayKeywords)) {
      if (lower.includes(keyword)) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + offset);
        const dateStr = targetDate.toISOString().split('T')[0];
        
        const matchingSlot = this.proposedSlots.find(s => s.date === dateStr);
        if (matchingSlot) return matchingSlot;
      }
    }

    return null;
  }

  private async bookAppointment(slot: TimeSlot): Promise<number | null> {
    if (!this.data) return null;

    try {
      const appointmentId = await createAppointment({
        job_id: this.data.job_id,
        scheduled_date: slot.date,
        scheduled_time: slot.time,
        notes: `Service: ${this.data.service_type}. ${this.data.problem_description || ''}`
      });

      return appointmentId as number;
    } catch (error) {
      console.error('Failed to book appointment:', error);
      return null;
    }
  }

  // Get structured output for handoff
  getStructuredOutput(): any {
    if (!this.data) return null;
    
    return {
      name: this.data.name,
      phone: this.data.phone,
      address: this.data.address,
      service_type: this.data.service_type,
      appointment_time: this.proposedSlots[0] ? `${this.proposedSlots[0].date} ${this.proposedSlots[0].time}` : null,
      technician_assigned: 'TBD',
      status: 'confirmed'
    };
  }
}

export default SchedulingAgent;
