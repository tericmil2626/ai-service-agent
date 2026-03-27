import { calendar_v3 } from 'googleapis';
export interface CalendarEvent {
    summary: string;
    description?: string;
    start: Date;
    end: Date;
    location?: string;
    attendees?: string[];
}
export interface BusinessCalendarConfig {
    businessId: string;
    calendarId: string;
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
}
/**
 * Get authorization URL for Google OAuth
 */
export declare function getAuthUrl(businessId: string): string;
/**
 * Exchange authorization code for tokens
 */
export declare function handleAuthCallback(code: string, businessId: string): Promise<boolean>;
/**
 * Create a calendar event for an appointment
 */
export declare function createAppointmentEvent(businessId: string, appointment: {
    customerName: string;
    customerPhone: string;
    serviceType: string;
    description?: string;
    date: string;
    time: string;
    durationMinutes?: number;
    address?: string;
    technicianName?: string;
}): Promise<string | null>;
/**
 * Update an existing calendar event
 */
export declare function updateAppointmentEvent(businessId: string, eventId: string, updates: Partial<{
    date: string;
    time: string;
    durationMinutes: number;
    status: 'scheduled' | 'completed' | 'cancelled';
}>): Promise<boolean>;
/**
 * Delete a calendar event
 */
export declare function deleteAppointmentEvent(businessId: string, eventId: string): Promise<boolean>;
/**
 * List upcoming events
 */
export declare function listUpcomingEvents(businessId: string, maxResults?: number): Promise<calendar_v3.Schema$Event[]>;
/**
 * Check if a time slot is available
 */
export declare function isTimeSlotAvailable(businessId: string, date: string, time: string, durationMinutes?: number): Promise<boolean>;
//# sourceMappingURL=google-calendar.d.ts.map