import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getDb } from './database';

// OAuth2 client setup
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3002/auth/google/callback'
);

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
export function getAuthUrl(businessId: string): string {
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: businessId
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function handleAuthCallback(code: string, businessId: string): Promise<boolean> {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Missing tokens from Google');
    }

    // Save to database
    const db = await getDb();
    await db.run(`
      INSERT INTO business_integrations (business_id, provider, config, created_at, updated_at)
      VALUES (?, 'google_calendar', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(business_id, provider) DO UPDATE SET
        config = excluded.config,
        updated_at = CURRENT_TIMESTAMP
    `, [
      businessId,
      JSON.stringify({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date
      })
    ]);

    return true;
  } catch (error) {
    console.error('Google auth callback error:', error);
    return false;
  }
}

/**
 * Get stored credentials for a business
 */
async function getBusinessCredentials(businessId: string): Promise<BusinessCalendarConfig | null> {
  const db = await getDb();
  const row = await db.get(
    'SELECT config FROM business_integrations WHERE business_id = ? AND provider = ?',
    [businessId, 'google_calendar']
  );

  if (!row) return null;

  const config = JSON.parse(row.config);
  return {
    businessId,
    calendarId: 'primary',
    ...config
  };
}

/**
 * Refresh access token if needed
 */
async function ensureValidToken(credentials: BusinessCalendarConfig): Promise<OAuth2Client> {
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
    expiry_date: credentials.expiryDate
  });

  // Check if token needs refresh
  if (credentials.expiryDate && Date.now() >= credentials.expiryDate - 60000) {
    console.log('[Google Calendar] Refreshing access token...');
    const { credentials: newTokens } = await oauth2Client.refreshAccessToken();
    
    // Update stored credentials
    const db = await getDb();
    await db.run(`
      UPDATE business_integrations 
      SET config = ?, updated_at = CURRENT_TIMESTAMP
      WHERE business_id = ? AND provider = ?
    `, [
      JSON.stringify({
        accessToken: newTokens.access_token,
        refreshToken: credentials.refreshToken,
        expiryDate: newTokens.expiry_date
      }),
      credentials.businessId,
      'google_calendar'
    ]);

    oauth2Client.setCredentials(newTokens);
  }

  return oauth2Client;
}

/**
 * Create a calendar event for an appointment
 */
export async function createAppointmentEvent(
  businessId: string,
  appointment: {
    customerName: string;
    customerPhone: string;
    serviceType: string;
    description?: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM
    durationMinutes?: number;
    address?: string;
    technicianName?: string;
  }
): Promise<string | null> {
  try {
    const credentials = await getBusinessCredentials(businessId);
    if (!credentials) {
      console.error('[Google Calendar] No credentials found for business:', businessId);
      return null;
    }

    const auth = await ensureValidToken(credentials);
    const calendar = google.calendar({ version: 'v3', auth });

    // Parse date and time
    const [year, month, day] = appointment.date.split('-').map(Number);
    const [hours, minutes] = appointment.time.split(':').map(Number);
    
    const startDateTime = new Date(year, month - 1, day, hours, minutes);
    const endDateTime = new Date(startDateTime.getTime() + (appointment.durationMinutes || 60) * 60000);

    const event: calendar_v3.Schema$Event = {
      summary: `${appointment.serviceType} - ${appointment.customerName}`,
      description: `
Service: ${appointment.serviceType}
Customer: ${appointment.customerName}
Phone: ${appointment.customerPhone}
${appointment.description ? `Details: ${appointment.description}` : ''}
${appointment.technicianName ? `Technician: ${appointment.technicianName}` : ''}
      `.trim(),
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/Chicago'
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/Chicago'
      },
      location: appointment.address,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 1440 }, // 24 hours before
          { method: 'sms', minutes: 60 } // 1 hour before
        ]
      }
    };

    const response = await calendar.events.insert({
      calendarId: credentials.calendarId,
      requestBody: event
    });

    console.log('[Google Calendar] Event created:', response.data.id);
    return response.data.id || null;
  } catch (error) {
    console.error('[Google Calendar] Failed to create event:', error);
    return null;
  }
}

/**
 * Update an existing calendar event
 */
export async function updateAppointmentEvent(
  businessId: string,
  eventId: string,
  updates: Partial<{
    date: string;
    time: string;
    durationMinutes: number;
    status: 'scheduled' | 'completed' | 'cancelled';
  }>
): Promise<boolean> {
  try {
    const credentials = await getBusinessCredentials(businessId);
    if (!credentials) return false;

    const auth = await ensureValidToken(credentials);
    const calendar = google.calendar({ version: 'v3', auth });

    const event: calendar_v3.Schema$Event = {};

    if (updates.date && updates.time) {
      const [year, month, day] = updates.date.split('-').map(Number);
      const [hours, minutes] = updates.time.split(':').map(Number);
      
      const startDateTime = new Date(year, month - 1, day, hours, minutes);
      const endDateTime = new Date(startDateTime.getTime() + (updates.durationMinutes || 60) * 60000);

      event.start = { dateTime: startDateTime.toISOString(), timeZone: 'America/Chicago' };
      event.end = { dateTime: endDateTime.toISOString(), timeZone: 'America/Chicago' };
    }

    if (updates.status === 'cancelled') {
      event.status = 'cancelled';
    }

    await calendar.events.patch({
      calendarId: credentials.calendarId,
      eventId: eventId,
      requestBody: event
    });

    return true;
  } catch (error) {
    console.error('[Google Calendar] Failed to update event:', error);
    return false;
  }
}

/**
 * Delete a calendar event
 */
export async function deleteAppointmentEvent(
  businessId: string,
  eventId: string
): Promise<boolean> {
  try {
    const credentials = await getBusinessCredentials(businessId);
    if (!credentials) return false;

    const auth = await ensureValidToken(credentials);
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: credentials.calendarId,
      eventId: eventId
    });

    return true;
  } catch (error) {
    console.error('[Google Calendar] Failed to delete event:', error);
    return false;
  }
}

/**
 * List upcoming events
 */
export async function listUpcomingEvents(
  businessId: string,
  maxResults: number = 10
): Promise<calendar_v3.Schema$Event[]> {
  try {
    const credentials = await getBusinessCredentials(businessId);
    if (!credentials) return [];

    const auth = await ensureValidToken(credentials);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.list({
      calendarId: credentials.calendarId,
      timeMin: new Date().toISOString(),
      maxResults: maxResults,
      singleEvents: true,
      orderBy: 'startTime'
    });

    return response.data.items || [];
  } catch (error) {
    console.error('[Google Calendar] Failed to list events:', error);
    return [];
  }
}

/**
 * Get all busy time blocks for a date range using the freebusy API.
 * Returns an empty array if calendar is not connected (graceful fallback).
 */
export async function getFreeBusyTimes(
  businessId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
): Promise<Array<{ start: Date; end: Date }>> {
  try {
    const credentials = await getBusinessCredentials(businessId);
    if (!credentials) return [];

    const auth = await ensureValidToken(credentials);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: new Date(`${startDate}T00:00:00`).toISOString(),
        timeMax: new Date(`${endDate}T23:59:59`).toISOString(),
        items: [{ id: credentials.calendarId }],
      },
    });

    const busy = response.data.calendars?.[credentials.calendarId]?.busy || [];
    console.log(`[Google Calendar] ${busy.length} busy blocks found between ${startDate} and ${endDate}`);
    return busy.map(b => ({ start: new Date(b.start!), end: new Date(b.end!) }));
  } catch (error) {
    console.error('[Google Calendar] Failed to get free/busy times:', error);
    return [];
  }
}

/**
 * Check if a time slot is available
 */
export async function isTimeSlotAvailable(
  businessId: string,
  date: string,
  time: string,
  durationMinutes: number = 60
): Promise<boolean> {
  try {
    const credentials = await getBusinessCredentials(businessId);
    if (!credentials) {
      // If no calendar connected, assume available
      return true;
    }

    const auth = await ensureValidToken(credentials);
    const calendar = google.calendar({ version: 'v3', auth });

    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    
    const startDateTime = new Date(year, month - 1, day, hours, minutes);
    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000);

    // Check for conflicting events
    const response = await calendar.events.list({
      calendarId: credentials.calendarId,
      timeMin: startDateTime.toISOString(),
      timeMax: endDateTime.toISOString(),
      singleEvents: true
    });

    return (response.data.items || []).length === 0;
  } catch (error) {
    console.error('[Google Calendar] Failed to check availability:', error);
    return true; // Assume available on error
  }
}
