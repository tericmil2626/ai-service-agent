import { Database } from 'sqlite';
export declare function getDb(): Promise<Database>;
export declare function initDatabase(): Promise<void>;
export declare function createCustomer(data: {
    name: string;
    phone: string;
    email?: string;
    address: string;
    city?: string;
    state?: string;
    zip?: string;
}): Promise<number | undefined>;
export declare function findCustomerByPhone(phone: string): Promise<any>;
export declare function findOrCreateCustomer(data: {
    name: string;
    phone: string;
    address: string;
}): Promise<any>;
export declare function getCustomerById(id: number): Promise<any>;
export declare function createJob(data: {
    customer_id: number;
    service_type: string;
    description?: string;
    urgency?: string;
    source?: string;
}): Promise<number>;
export declare function getJobById(id: number): Promise<any>;
export declare function updateJobStatus(id: number, status: string): Promise<void>;
export declare function saveMessage(data: {
    customer_id: number;
    job_id?: number;
    channel: string;
    direction: 'inbound' | 'outbound';
    message_text: string;
    agent_name?: string;
    metadata?: object;
}): Promise<void>;
export declare function getConversationHistory(customerId: number, limit?: number): Promise<any[]>;
export declare function createAppointment(data: {
    job_id: number;
    scheduled_date?: string;
    scheduled_time?: string;
    technician_id?: number;
    notes?: string;
}): Promise<number | null>;
export declare function getAppointmentsByDate(date: string): Promise<any[]>;
export declare function createMissedCall(data: {
    customer_phone: string;
    business_phone: string;
    call_sid?: string;
    call_status: string;
}): Promise<number>;
export declare function getMissedCallById(id: number): Promise<any>;
export declare function updateMissedCallTextBack(id: number, message: string, jobId?: number): Promise<void>;
export declare function getRecentMissedCalls(phone: string, minutes?: number): Promise<any[]>;
export declare function getRecentTextBacks(phone: string, minutes?: number): Promise<any[]>;
export declare function createCallLog(data: {
    call_sid: string;
    customer_phone: string;
    business_phone: string;
    direction?: string;
}): Promise<number>;
export declare function updateCallLog(callSid: string, data: {
    status?: string;
    duration_seconds?: number;
    transcript?: string;
    recording_url?: string;
    job_id?: number;
}): Promise<void>;
export declare function getCallLogs(options?: {
    limit?: number;
    days?: number;
}): Promise<any[]>;
export declare function getCallLogBySid(callSid: string): Promise<any>;
//# sourceMappingURL=database.d.ts.map