export interface CalendarEvent {
    summary: string;
    description?: string;
    location?: string;
    startTime: Date;
    endTime: Date;
    attendees?: string[];
}
export declare class GoogleCalendarService {
    private auth;
    private calendar;
    private initialized;
    /**
     * Initialize Google Calendar API
     */
    initialize(): Promise<boolean>;
    /**
     * Get OAuth authorization URL
     */
    getAuthUrl(): string;
    /**
     * Exchange authorization code for tokens
     */
    exchangeCode(code: string): Promise<boolean>;
    /**
     * Create a calendar event for a technician appointment
     */
    createAppointmentEvent(event: CalendarEvent): Promise<string | null>;
    /**
     * Update an existing calendar event
     */
    updateEvent(eventId: string, event: Partial<CalendarEvent>): Promise<boolean>;
    /**
     * Delete a calendar event
     */
    deleteEvent(eventId: string): Promise<boolean>;
    /**
     * Check if service is initialized
     */
    isInitialized(): boolean;
}
export declare function getCalendarService(): GoogleCalendarService;
//# sourceMappingURL=calendar.d.ts.map