// LLM-Powered Scheduling Agent
// Handles appointment booking with natural language understanding
import { getDb, dbGet, dbAll, dbRun, updateJobStatus, createAppointment } from '../database.js';
import { generateSchedulingResponse, parseTimeSelection } from '../llm.js';

export interface SchedulingData {
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

export interface SchedulingResult {
  response: string;
  confirmed?: boolean;
  appointment?: {
    id: number;
    date: string;
    time: string;
    service_type: string;
    address: string;
  };
  slots?: Array<{ date: string; time: string }>;
}

export class SchedulingAgent {
  private data: SchedulingData | null = null;
  private proposedSlots: Array<{ date: string; time: string }> = [];
  private awaitingConfirmation: boolean = false;
  private initialized: boolean = false;

  /**
   * Initialize the scheduling agent with customer data from intake
   */
  async initialize(data: SchedulingData): Promise<void> {
    this.data = data;
    this.initialized = true;
    this.awaitingConfirmation = false;
    // Don't generate slots yet - wait for first handleMessage call
  }

  /**
   * Main message handler for orchestrator integration
   * Routes to appropriate method based on conversation state
   */
  async handleMessage(message: string, context: any): Promise<{ response: string; isComplete: boolean; handoffTo?: string; data?: any }> {
    // If not initialized yet, we can't proceed
    if (!this.initialized || !this.data) {
      return {
        response: "I'm sorry, I don't have your service details. Let me connect you back to our receptionist.",
        isComplete: false,
      };
    }

    // If we haven't proposed slots yet, this is the first interaction
    if (this.proposedSlots.length === 0) {
      const result = await this.receiveFromReceptionist(this.data);
      return {
        response: result.response,
        isComplete: false,
        data: { slots: result.slots },
      };
    }

    // If we're awaiting confirmation, treat this as a time selection
    if (this.awaitingConfirmation) {
      const result = await this.handleTimeSelection(message);
      return {
        response: result.response,
        isComplete: result.confirmed || false,
        data: result.appointment ? { appointment: result.appointment } : undefined,
      };
    }

    // Otherwise, treat as time selection
    const result = await this.handleTimeSelection(message);
    
    if (result.confirmed) {
      return {
        response: result.response,
        isComplete: true,
        handoffTo: 'Dispatch Agent',
        data: { appointment: result.appointment },
      };
    } else {
      // Couldn't parse the selection, still need a time
      return {
        response: result.response,
        isComplete: false,
      };
    }
  }

  async receiveFromReceptionist(data: SchedulingData): Promise<SchedulingResult> {
    this.data = data;

    // Get available slots based on urgency
    this.proposedSlots = await this.getAvailableSlots(data.urgency || 'medium');

    // Generate natural language response with LLM
    const response = await generateSchedulingResponse(data, this.proposedSlots);

    return {
      response,
      slots: this.proposedSlots,
    };
  }

  async handleTimeSelection(selection: string): Promise<SchedulingResult> {
    if (!this.data) {
      return {
        response: "I'm sorry, I don't have your service details. Let me connect you back to our receptionist.",
        confirmed: false,
      };
    }

    // Use LLM to parse the time selection
    let selectedSlot = await parseTimeSelection(selection, this.proposedSlots);

    // If no specific slot selected, check if customer is asking for a specific day FIRST
    if (!selectedSlot) {
      const requestedDay = this.parseDayPreference(selection);
      if (requestedDay) {
        // Try to get slots for the requested day
        const daySlots = await this.getSlotsForDay(requestedDay);
        if (daySlots.length > 0) {
          // Check for time-of-day preference within the requested day
          const timePreference = this.parseTimeOfDay(selection);
          if (timePreference) {
            selectedSlot = this.findSlotByTimePreferenceInList(daySlots, timePreference);
          }
          
          if (!selectedSlot) {
            // No specific time preference or no matching slot, offer all day slots
            this.proposedSlots = daySlots;
            const response = await generateSchedulingResponse(this.data!, this.proposedSlots);
            return {
              response: `I found some slots for ${requestedDay}:\n\n${response}`,
              confirmed: false,
            };
          }
        } else {
          // Requested day not available, offer alternatives
          const timePreference = this.parseTimeOfDay(selection);
          let response = `I don't have availability on ${requestedDay}. `;
          if (timePreference) {
            response += `I do have ${timePreference} slots on other days. `;
            // Try to find a matching time on available days
            const matchingSlot = this.findSlotByTimePreference(timePreference);
            if (matchingSlot) {
              const date = new Date(matchingSlot.date);
              const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
              const time12Hour = this.formatTime12Hour(matchingSlot.time);
              response += `Would ${dayName} at ${time12Hour} work instead?`;
              return { response, confirmed: false };
            }
          }
          response += `Here are the next available times:\n\n${this.formatSlots()}`;
          return { response, confirmed: false };
        }
      }
    }

    // If still no slot, check for time-of-day preference on current slots
    if (!selectedSlot) {
      const timePreference = this.parseTimeOfDay(selection);
      if (timePreference) {
        selectedSlot = this.findSlotByTimePreference(timePreference);
      }
    }

    // If still no slot, ask for clarification
    if (!selectedSlot) {
      return {
        response: "I didn't catch that. Could you please choose one of the times I mentioned, or let me know a specific day and time that works?",
        confirmed: false,
      };
    }

    // Create the appointment
    const appointmentId = await this.bookAppointment(selectedSlot);

    if (!appointmentId) {
      return {
        response: "I'm sorry, that time slot is no longer available. Let me check for other options.",
        confirmed: false,
      };
    }

    // Update job status
    await updateJobStatus(this.data.job_id, 'scheduled');

    // Format confirmation
    const date = new Date(selectedSlot.date);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const time12Hour = this.formatTime12Hour(selectedSlot.time);

    return {
      response: `Perfect! I've scheduled your ${this.data.service_type} appointment for ${dayName} at ${time12Hour} at ${this.data.address}. A technician will arrive within the scheduled window. We'll send a reminder before the appointment.`,
      confirmed: true,
      appointment: {
        id: appointmentId,
        date: selectedSlot.date,
        time: selectedSlot.time,
        service_type: this.data.service_type,
        address: this.data.address,
      },
    };
  }

  async handleRescheduleRequest(currentAppointmentId: number, newPreference: string): Promise<SchedulingResult> {
    // Get current appointment
    const current = await dbGet(
      `SELECT a.*, j.service_type, c.name, c.address
       FROM appointments a
       JOIN jobs j ON a.job_id = j.id
       JOIN customers c ON j.customer_id = c.id
       WHERE a.id = ?`,
      [currentAppointmentId]
    );

    if (!current) {
      return {
        response: "I couldn't find that appointment. Could you provide your phone number so I can look it up?",
      };
    }

    // Get new available slots
    this.proposedSlots = await this.getAvailableSlots('medium');

    // Store current data for context
    this.data = {
      customer_id: (current as any).customer_id,
      job_id: (current as any).job_id,
      name: (current as any).name,
      phone: (current as any).phone,
      address: (current as any).address,
      service_type: (current as any).service_type,
    };

    const response = await generateSchedulingResponse(
      this.data,
      this.proposedSlots,
      true // isReschedule
    );

    return {
      response,
      slots: this.proposedSlots,
    };
  }

  async confirmReschedule(appointmentId: number, newSlot: { date: string; time: string }): Promise<SchedulingResult> {
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
      const time12Hour = this.formatTime12Hour(newSlot.time);

      return {
        response: `Great! Your appointment has been rescheduled to ${dayName} at ${time12Hour}.`,
        confirmed: true,
      };
    } catch (error) {
      console.error('Reschedule error:', error);
      return {
        response: "I'm sorry, I couldn't reschedule that appointment. Please call our office for assistance.",
        confirmed: false,
      };
    }
  }

  async handleCancellation(appointmentId: number): Promise<SchedulingResult> {
    try {
      await dbRun(
        `UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [appointmentId]
      );

      // Also update job status
      const appointment = await dbGet('SELECT job_id FROM appointments WHERE id = ?', [appointmentId]);
      if (appointment) {
        await updateJobStatus((appointment as any).job_id, 'cancelled');
      }

      return {
        response: "Your appointment has been canceled. Let us know if you'd like to reschedule in the future.",
        confirmed: true,
      };
    } catch (error) {
      console.error('Cancellation error:', error);
      return {
        response: "I'm sorry, I couldn't cancel that appointment. Please call our office.",
        confirmed: false,
      };
    }
  }

  private async getAvailableSlots(urgency: string): Promise<Array<{ date: string; time: string }>> {
    const slots: Array<{ date: string; time: string }> = [];

    // Business hours: 8 AM - 5 PM
    const businessHours = ['08:00', '10:00', '12:00', '14:00', '16:00'];

    // Start from tomorrow
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);

    // How many days to check based on urgency
    const daysToCheck = urgency === 'high' || urgency === 'emergency' ? 2 : 5;

    for (let day = 0; day < daysToCheck; day++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() + day);
      const dateStr = checkDate.toISOString().split('T')[0];

      // Check which slots are already booked
      const bookedSlots = await dbAll(
        `SELECT scheduled_time FROM appointments
         WHERE scheduled_date = ? AND status IN ('confirmed', 'pending')`,
        [dateStr]
      );

      const bookedTimes = new Set(bookedSlots.map((b: any) => b.scheduled_time));

      // Add available slots
      for (const hour of businessHours) {
        if (!bookedTimes.has(hour)) {
          slots.push({
            date: dateStr,
            time: hour,
          });

          if (slots.length >= (urgency === 'high' ? 3 : 6)) {
            return slots;
          }
        }
      }
    }

    return slots;
  }

  private async bookAppointment(slot: { date: string; time: string }): Promise<number | null> {
    if (!this.data) return null;

    try {
      const appointmentId = await createAppointment({
        job_id: this.data.job_id,
        scheduled_date: slot.date,
        scheduled_time: slot.time,
        notes: `Service: ${this.data.service_type}. ${this.data.problem_description || ''}`,
      });

      return appointmentId;
    } catch (error) {
      console.error('Failed to book appointment:', error);
      return null;
    }
  }

  // Helper method to parse time-of-day preference
  private parseTimeOfDay(message: string): 'morning' | 'afternoon' | 'evening' | null {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('morning') || lowerMsg.includes('am')) return 'morning';
    if (lowerMsg.includes('afternoon') || lowerMsg.includes('pm')) return 'afternoon';
    if (lowerMsg.includes('evening')) return 'evening';
    return null;
  }

  // Helper method to find a slot matching time-of-day preference
  private findSlotByTimePreference(preference: 'morning' | 'afternoon' | 'evening'): { date: string; time: string } | null {
    return this.findSlotByTimePreferenceInList(this.proposedSlots, preference);
  }

  // Helper method to find a slot matching time-of-day preference from a specific list
  private findSlotByTimePreferenceInList(slots: Array<{ date: string; time: string }>, preference: 'morning' | 'afternoon' | 'evening'): { date: string; time: string } | null {
    const timeRanges = {
      morning: ['08:00', '10:00'],
      afternoon: ['12:00', '14:00'],
      evening: ['16:00']
    };
    
    const preferredTimes = timeRanges[preference];
    
    // Find a slot that matches the preferred time range
    for (const preferredTime of preferredTimes) {
      const match = slots.find(slot => slot.time === preferredTime);
      if (match) return match;
    }
    
    // If no exact match, return the first available slot from the list
    return slots[0] || null;
  }

  // Helper method to parse day preference from customer message
  private parseDayPreference(message: string): string | null {
    const lowerMsg = message.toLowerCase();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    for (const day of days) {
      if (lowerMsg.includes(day)) {
        return day.charAt(0).toUpperCase() + day.slice(1);
      }
    }
    
    // Check for relative days
    if (lowerMsg.includes('tomorrow')) return 'Tomorrow';
    if (lowerMsg.includes('today')) return 'Today';
    if (lowerMsg.includes('next week')) return 'Next week';
    
    return null;
  }

  // Helper method to get slots for a specific day
  private async getSlotsForDay(dayName: string): Promise<Array<{ date: string; time: string }>> {
    const targetDate = new Date();
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    // Handle relative days
    if (dayName === 'Tomorrow') {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (dayName === 'Today') {
      // Use today
    } else if (daysOfWeek.includes(dayName.toLowerCase())) {
      // Find the next occurrence of that day
      const targetDayIndex = daysOfWeek.indexOf(dayName.toLowerCase());
      const currentDayIndex = targetDate.getDay();
      let daysUntil = targetDayIndex - currentDayIndex;
      if (daysUntil <= 0) daysUntil += 7; // Next week if day has passed
      targetDate.setDate(targetDate.getDate() + daysUntil);
    } else {
      return [];
    }
    
    const dateStr = targetDate.toISOString().split('T')[0];
    
    // Check which slots are already booked
    const bookedSlots = await dbAll(
      `SELECT scheduled_time FROM appointments
       WHERE scheduled_date = ? AND status IN ('confirmed', 'pending')`,
      [dateStr]
    );
    
    const bookedTimes = new Set(bookedSlots.map((b: any) => b.scheduled_time));
    const businessHours = ['08:00', '10:00', '12:00', '14:00', '16:00'];
    
    return businessHours
      .filter(hour => !bookedTimes.has(hour))
      .map(time => ({ date: dateStr, time }));
  }

  // Helper method to format current slots for display
  private formatSlots(): string {
    return this.proposedSlots.map((slot, i) => {
      const date = new Date(slot.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      return `${i + 1}. ${dayName} at ${this.formatTime12Hour(slot.time)}`;
    }).join('\n');
  }

  // Helper method to convert 24-hour time to 12-hour format
  private formatTime12Hour(time24: string): string {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  // State persistence methods for orchestrator
  getState(): { data: SchedulingData | null; proposedSlots: Array<{ date: string; time: string }>; awaitingConfirmation: boolean } {
    return {
      data: this.data,
      proposedSlots: this.proposedSlots,
      awaitingConfirmation: this.awaitingConfirmation,
    };
  }

  setState(state: { data: SchedulingData | null; proposedSlots: Array<{ date: string; time: string }>; awaitingConfirmation: boolean }): void {
    this.data = state.data;
    this.proposedSlots = state.proposedSlots;
    this.awaitingConfirmation = state.awaitingConfirmation;
  }
}
