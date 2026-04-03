"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCalendarService = void 0;
exports.getCalendarService = getCalendarService;
// Google Calendar integration for Dispatch Agent
// Creates calendar events when technicians are assigned
const googleapis_1 = require("googleapis");
const google_auth_library_1 = require("google-auth-library");
const fs_1 = require("fs");
const path_1 = require("path");
// Path to OAuth credentials
const CREDENTIALS_PATH = (0, path_1.join)(process.cwd(), 'data', 'client_secret.json');
const TOKEN_PATH = (0, path_1.join)(process.cwd(), 'data', 'gcal_token.json');
class GoogleCalendarService {
    auth = null;
    calendar = null;
    initialized = false;
    /**
     * Initialize Google Calendar API
     */
    async initialize() {
        try {
            // Check for credentials
            if (!(0, fs_1.existsSync)(CREDENTIALS_PATH)) {
                console.error('[GCal] Credentials not found at:', CREDENTIALS_PATH);
                console.error('[GCal] Please place your client_secret.json in the data/ directory');
                return false;
            }
            // Load credentials
            const credentials = JSON.parse((0, fs_1.readFileSync)(CREDENTIALS_PATH, 'utf8'));
            const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
            // Create OAuth client
            this.auth = new google_auth_library_1.OAuth2Client(client_id, client_secret, redirect_uris[0]);
            // Load existing token if available
            if ((0, fs_1.existsSync)(TOKEN_PATH)) {
                const token = JSON.parse((0, fs_1.readFileSync)(TOKEN_PATH, 'utf8'));
                this.auth.setCredentials(token);
                console.log('[GCal] Loaded existing token');
            }
            else {
                console.log('[GCal] No token found. Authentication required.');
                console.log('[GCal] Visit:', this.getAuthUrl());
                return false;
            }
            // Create Calendar API client
            this.calendar = googleapis_1.google.calendar({ version: 'v3', auth: this.auth });
            this.initialized = true;
            console.log('[GCal] Initialized successfully');
            return true;
        }
        catch (error) {
            console.error('[GCal] Initialization failed:', error);
            return false;
        }
    }
    /**
     * Get OAuth authorization URL
     */
    getAuthUrl() {
        if (!this.auth) {
            throw new Error('OAuth client not initialized');
        }
        const scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
        ];
        return this.auth.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent',
        });
    }
    /**
     * Exchange authorization code for tokens
     */
    async exchangeCode(code) {
        if (!this.auth) {
            throw new Error('OAuth client not initialized');
        }
        try {
            const { tokens } = await this.auth.getToken(code);
            this.auth.setCredentials(tokens);
            // Save token
            const fs = await import('fs');
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
            console.log('[GCal] Token saved');
            return true;
        }
        catch (error) {
            console.error('[GCal] Token exchange failed:', error);
            return false;
        }
    }
    /**
     * Create a calendar event for a technician appointment
     */
    async createAppointmentEvent(event) {
        if (!this.initialized || !this.calendar) {
            console.error('[GCal] Service not initialized');
            return null;
        }
        try {
            const calendarEvent = {
                summary: event.summary,
                description: event.description,
                location: event.location,
                start: {
                    dateTime: event.startTime.toISOString(),
                    timeZone: 'America/Chicago',
                },
                end: {
                    dateTime: event.endTime.toISOString(),
                    timeZone: 'America/Chicago',
                },
                attendees: event.attendees?.map(email => ({ email })),
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 60 },
                        { method: 'popup', minutes: 30 },
                    ],
                },
            };
            const response = await this.calendar.events.insert({
                calendarId: 'primary',
                requestBody: calendarEvent,
                sendUpdates: 'all', // Send invites to attendees
            });
            console.log('[GCal] Event created:', response.data.htmlLink);
            return response.data.id || null;
        }
        catch (error) {
            console.error('[GCal] Failed to create event:', error);
            return null;
        }
    }
    /**
     * Update an existing calendar event
     */
    async updateEvent(eventId, event) {
        if (!this.initialized || !this.calendar) {
            console.error('[GCal] Service not initialized');
            return false;
        }
        try {
            const updateBody = {};
            if (event.summary)
                updateBody.summary = event.summary;
            if (event.description)
                updateBody.description = event.description;
            if (event.location)
                updateBody.location = event.location;
            if (event.startTime) {
                updateBody.start = {
                    dateTime: event.startTime.toISOString(),
                    timeZone: 'America/Chicago',
                };
            }
            if (event.endTime) {
                updateBody.end = {
                    dateTime: event.endTime.toISOString(),
                    timeZone: 'America/Chicago',
                };
            }
            await this.calendar.events.patch({
                calendarId: 'primary',
                eventId,
                requestBody: updateBody,
                sendUpdates: 'all',
            });
            console.log('[GCal] Event updated:', eventId);
            return true;
        }
        catch (error) {
            console.error('[GCal] Failed to update event:', error);
            return false;
        }
    }
    /**
     * Delete a calendar event
     */
    async deleteEvent(eventId) {
        if (!this.initialized || !this.calendar) {
            console.error('[GCal] Service not initialized');
            return false;
        }
        try {
            await this.calendar.events.delete({
                calendarId: 'primary',
                eventId,
                sendUpdates: 'all',
            });
            console.log('[GCal] Event deleted:', eventId);
            return true;
        }
        catch (error) {
            console.error('[GCal] Failed to delete event:', error);
            return false;
        }
    }
    /**
     * Check if service is initialized
     */
    isInitialized() {
        return this.initialized;
    }
}
exports.GoogleCalendarService = GoogleCalendarService;
// Singleton instance
let calendarService = null;
function getCalendarService() {
    if (!calendarService) {
        calendarService = new GoogleCalendarService();
    }
    return calendarService;
}
//# sourceMappingURL=calendar.js.map