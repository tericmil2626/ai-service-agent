"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthUrl = getAuthUrl;
exports.handleAuthCallback = handleAuthCallback;
exports.createAppointmentEvent = createAppointmentEvent;
exports.updateAppointmentEvent = updateAppointmentEvent;
exports.deleteAppointmentEvent = deleteAppointmentEvent;
exports.listUpcomingEvents = listUpcomingEvents;
exports.isTimeSlotAvailable = isTimeSlotAvailable;
const googleapis_1 = require("googleapis");
const google_auth_library_1 = require("google-auth-library");
const database_1 = require("./database");
// OAuth2 client setup
const oauth2Client = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3002/auth/google/callback');
/**
 * Get authorization URL for Google OAuth
 */
function getAuthUrl(businessId) {
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
async function handleAuthCallback(code, businessId) {
    try {
        const { tokens } = await oauth2Client.getToken(code);
        if (!tokens.access_token || !tokens.refresh_token) {
            throw new Error('Missing tokens from Google');
        }
        // Save to database
        const db = await (0, database_1.getDb)();
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
    }
    catch (error) {
        console.error('Google auth callback error:', error);
        return false;
    }
}
/**
 * Get stored credentials for a business
 */
async function getBusinessCredentials(businessId) {
    const db = await (0, database_1.getDb)();
    const row = await db.get('SELECT config FROM business_integrations WHERE business_id = ? AND provider = ?', [businessId, 'google_calendar']);
    if (!row)
        return null;
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
async function ensureValidToken(credentials) {
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
        const db = await (0, database_1.getDb)();
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
async function createAppointmentEvent(businessId, appointment) {
    try {
        const credentials = await getBusinessCredentials(businessId);
        if (!credentials) {
            console.error('[Google Calendar] No credentials found for business:', businessId);
            return null;
        }
        const auth = await ensureValidToken(credentials);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
        // Parse date and time
        const [year, month, day] = appointment.date.split('-').map(Number);
        const [hours, minutes] = appointment.time.split(':').map(Number);
        const startDateTime = new Date(year, month - 1, day, hours, minutes);
        const endDateTime = new Date(startDateTime.getTime() + (appointment.durationMinutes || 60) * 60000);
        const event = {
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
    }
    catch (error) {
        console.error('[Google Calendar] Failed to create event:', error);
        return null;
    }
}
/**
 * Update an existing calendar event
 */
async function updateAppointmentEvent(businessId, eventId, updates) {
    try {
        const credentials = await getBusinessCredentials(businessId);
        if (!credentials)
            return false;
        const auth = await ensureValidToken(credentials);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
        const event = {};
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
    }
    catch (error) {
        console.error('[Google Calendar] Failed to update event:', error);
        return false;
    }
}
/**
 * Delete a calendar event
 */
async function deleteAppointmentEvent(businessId, eventId) {
    try {
        const credentials = await getBusinessCredentials(businessId);
        if (!credentials)
            return false;
        const auth = await ensureValidToken(credentials);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
        await calendar.events.delete({
            calendarId: credentials.calendarId,
            eventId: eventId
        });
        return true;
    }
    catch (error) {
        console.error('[Google Calendar] Failed to delete event:', error);
        return false;
    }
}
/**
 * List upcoming events
 */
async function listUpcomingEvents(businessId, maxResults = 10) {
    try {
        const credentials = await getBusinessCredentials(businessId);
        if (!credentials)
            return [];
        const auth = await ensureValidToken(credentials);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
        const response = await calendar.events.list({
            calendarId: credentials.calendarId,
            timeMin: new Date().toISOString(),
            maxResults: maxResults,
            singleEvents: true,
            orderBy: 'startTime'
        });
        return response.data.items || [];
    }
    catch (error) {
        console.error('[Google Calendar] Failed to list events:', error);
        return [];
    }
}
/**
 * Check if a time slot is available
 */
async function isTimeSlotAvailable(businessId, date, time, durationMinutes = 60) {
    try {
        const credentials = await getBusinessCredentials(businessId);
        if (!credentials) {
            // If no calendar connected, assume available
            return true;
        }
        const auth = await ensureValidToken(credentials);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
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
    }
    catch (error) {
        console.error('[Google Calendar] Failed to check availability:', error);
        return true; // Assume available on error
    }
}
//# sourceMappingURL=google-calendar.js.map