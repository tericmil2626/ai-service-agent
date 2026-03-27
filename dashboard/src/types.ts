export interface Conversation {
  id: string;
  customerName: string;
  customerPhone: string;
  lastMessage: string;
  status: 'new' | 'scheduling' | 'dispatch' | 'followup' | 'completed';
  updatedAt: string;
  messages?: Message[];
}

export interface Message {
  id: string;
  content: string;
  sender: 'customer' | 'business';
  timestamp: string;
}

export interface Technician {
  id: string;
  name: string;
  phone: string;
  specialties: string[];
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Appointment {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceType: string;
  date: string;
  time: string;
  technicianId?: string;
  technicianName?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  address?: string;
}

export interface Lead {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceType: string;
  status: 'new' | 'qualified' | 'disqualified';
  source: string;
  createdAt: string;
}

export interface Stats {
  activeConversations: number;
  todayAppointments: number;
  unassignedJobs: number;
  totalTechnicians: number;
  recentActivity: Activity[];
}

export interface Activity {
  id: string;
  type: 'conversation' | 'appointment' | 'technician' | 'lead';
  description: string;
  timestamp: string;
}

export interface CallLog {
  id: number;
  call_sid: string;
  customer_phone: string;
  customer_name?: string;
  business_phone: string;
  direction: 'inbound' | 'outbound';
  status: string;
  duration_seconds?: number;
  transcript?: any;
  recording_url?: string;
  job_id?: number;
  service_type?: string;
  created_at: string;
  updated_at: string;
}
