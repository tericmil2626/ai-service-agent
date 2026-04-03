// Google Calendar integration for Dispatch Agent
// Creates calendar events when technicians are assigned
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Path to OAuth credentials - use absolute path
const CREDENTIALS_PATH = '/root/service-business/data/client_secret.json';
const TOKEN_PATH = '/root/service-business/data/gcal_token.json';

export interface CalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  attendees?: string[]; // Email addresses
}

export class GoogleCalendarService {
  private auth: OAuth2Client | null = null;
  private calendar: calendar_v3.Calendar | null = null;
  private initialized: boolean = false;

  /**
   * Initialize Google Calendar API
   */
  async initialize(): Promise<boolean> {
    try {
      // Check for credentials
      if (!existsSync(CREDENTIALS_PATH)) {
        console.error('[GCal] Credentials not found at:', CREDENTIALS_PATH);
        console.error('[GCal] Please place your client_secret.json in the data/ directory');
        return false;
      }

      // Load credentials
      const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
      const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

      // Create OAuth client
      this.auth = new OAuth2Client(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      // Load existing token if available
      if (existsSync(TOKEN_PATH)) {
        const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));
        this.auth.setCredentials(token);
        console.log('[GCal] Loaded existing token');
      } else {
        console.log('[GCal] No token found. Authentication required.');
        console.log('[GCal] Visit:', this.getAuthUrl());
        return false;
      }

      // Create Calendar API client
      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
      this.initialized = true;
      
      console.log('[GCal] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[GCal] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthUrl(): string {
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
  async exchangeCode(code: string): Promise<boolean> {
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
    } catch (error) {
      console.error('[GCal] Token exchange failed:', error);
      return false;
    }
  }

  /**
   * Create a calendar event for a technician appointment
   */
  async createAppointmentEvent(event: CalendarEvent): Promise<string | null> {
    if (!this.initialized || !this.calendar) {
      console.error('[GCal] Service not initialized');
      return null;
    }

    try {
      const calendarEvent: calendar_v3.Schema$Event = {
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
    } catch (error) {
      console.error('[GCal] Failed to create event:', error);
      return null;
    }
  }

  /**
   * Update an existing calendar event
   */
  async updateEvent(eventId: string, event: Partial<CalendarEvent>): Promise<boolean> {
    if (!this.initialized || !this.calendar) {
      console.error('[GCal] Service not initialized');
      return false;
    }

    try {
      const updateBody: calendar_v3.Schema$Event = {};
      
      if (event.summary) updateBody.summary = event.summary;
      if (event.description) updateBody.description = event.description;
      if (event.location) updateBody.location = event.location;
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
    } catch (error) {
      console.error('[GCal] Failed to update event:', error);
      return false;
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(eventId: string): Promise<boolean> {
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
    } catch (error) {
      console.error('[GCal] Failed to delete event:', error);
      return false;
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
let calendarService: GoogleCalendarService | null = null;

export function getCalendarService(): GoogleCalendarService {
  if (!calendarService) {
    calendarService = new GoogleCalendarService();
  }
  return calendarService;
}
