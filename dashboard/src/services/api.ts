import type { Conversation, Technician, Appointment, Lead, Stats, CallLog } from '../types';

const API_URL = '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

export const api = {
  // Stats
  getStats: () => fetchApi<Stats>('/stats'),
  
  // Conversations
  getConversations: () => fetchApi<Conversation[]>('/conversations'),
  getConversation: (id: string) => fetchApi<Conversation>(`/conversations/${id}`),
  
  // Technicians
  getTechnicians: () => fetchApi<Technician[]>('/technicians'),
  createTechnician: (data: Omit<Technician, 'id' | 'createdAt'>) => 
    fetchApi<Technician>('/technicians', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTechnician: (id: string, data: Partial<Technician>) =>
    fetchApi<Technician>(`/technicians/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  // Appointments
  getAppointments: () => fetchApi<Appointment[]>('/appointments'),
  createAppointment: (data: Omit<Appointment, 'id'>) =>
    fetchApi<Appointment>('/appointments', {
      method: 'POST',
      body: JSON.stringify({ ...data, business_id: 'default' }),
    }),
  updateAppointment: (id: string, data: Partial<Appointment>) =>
    fetchApi<Appointment>(`/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  // Leads
  getLeads: () => fetchApi<Lead[]>('/leads'),
  updateLead: (id: string, data: Partial<Lead>) =>
    fetchApi<Lead>(`/leads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Voice call logs
  getCallLogs: (days = 7, limit = 50) =>
    fetchApi<{ call_logs: CallLog[] }>(`/call-logs?days=${days}&limit=${limit}`),
  getCallLog: (callSid: string) =>
    fetchApi<{ call: CallLog }>(`/call-logs/${encodeURIComponent(callSid)}`),
  getActiveCallCount: () =>
    fetchApi<{ active_calls: number }>('/call-logs/active'),
};
