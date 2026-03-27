import sqlite3 from 'sqlite3';
export declare function getDb(): Promise<sqlite3.Database>;
export declare function dbRun(sql: string, params?: any[]): Promise<{
    lastID: number;
    changes: number;
}>;
export declare function dbGet(sql: string, params?: any[]): Promise<any>;
export declare function dbAll(sql: string, params?: any[]): Promise<any[]>;
export interface CustomerData {
    name: string;
    phone: string;
    email?: string;
    address: string;
    city?: string;
    state?: string;
    zip?: string;
}
export declare function createCustomer(data: CustomerData): Promise<number>;
export declare function findCustomerByPhone(phone: string): Promise<any>;
export declare function findOrCreateCustomer(data: CustomerData): Promise<any>;
export declare function getCustomerById(id: number): Promise<any>;
export interface JobData {
    customer_id: number;
    service_type: string;
    description?: string;
    urgency?: string;
    source?: string;
}
export declare function createJob(data: JobData): Promise<number>;
export declare function getJobById(id: number): Promise<any>;
export declare function updateJobStatus(jobId: number, status: string): Promise<void>;
export interface MessageData {
    customer_id: number;
    job_id?: number;
    channel: string;
    direction: 'inbound' | 'outbound';
    message_text: string;
    agent_name?: string;
}
export declare function saveMessage(data: MessageData): Promise<void>;
export declare function getConversationHistory(jobId: number): Promise<any[]>;
export interface AppointmentData {
    job_id: number;
    scheduled_date: string;
    scheduled_time: string;
    technician_id?: number;
    notes?: string;
}
export declare function createAppointment(data: AppointmentData): Promise<number>;
export declare function getAppointmentsByDate(date: string): Promise<any[]>;
//# sourceMappingURL=database.d.ts.map