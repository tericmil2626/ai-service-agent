export interface DispatchData {
    appointment_id: number;
    job_id: number;
    customer_id: number;
    customer_name: string;
    customer_phone: string;
    address: string;
    service_type: string;
    problem_description?: string;
    urgency?: string;
    scheduled_date: string;
    scheduled_time: string;
    assigned_technician_id?: number;
    status: 'pending_assignment' | 'assigning' | 'assigned' | 'notified' | 'confirmed' | 'dispatched' | 'completed';
}
export interface Technician {
    id: number;
    name: string;
    phone: string;
    email?: string;
    specialties: string[];
    is_active: boolean;
}
export interface DispatchResult {
    response: string;
    assigned?: boolean;
    technician?: Technician;
    notificationSent?: boolean;
    handoffTo?: string;
}
export declare class DispatchAgent {
    private data;
    private availableTechnicians;
    private initialized;
    /**
     * Initialize the dispatch agent with appointment data from scheduling
     */
    initialize(data: DispatchData): Promise<void>;
    /**
     * Main message handler for orchestrator integration
     */
    handleMessage(message: string, context: any): Promise<{
        response: string;
        isComplete: boolean;
        handoffTo?: string;
        data?: any;
    }>;
    /**
     * Receive appointment from Scheduling Agent and begin dispatch process
     */
    receiveFromScheduling(appointmentData: DispatchData): Promise<DispatchResult>;
    /**
     * Find and assign the best technician for the job
     */
    assignTechnician(): Promise<DispatchResult>;
    /**
     * Find technicians by specialty
     */
    private findTechniciansBySpecialty;
    /**
     * Rank technicians by suitability (workload, skill match, etc.)
     */
    private rankTechnicians;
    /**
     * Assign technician to appointment in database and create calendar event
     */
    private assignTechnicianToAppointment;
    /**
     * Update appointment status
     */
    private updateAppointmentStatus;
    /**
     * Generate notification message for technician
     */
    private generateTechnicianNotification;
    /**
     * Handle technician's response to assignment
     */
    handleTechnicianResponse(response: string): Promise<DispatchResult>;
    /**
     * Mark appointment as dispatched (technician is on the way)
     */
    markAsDispatched(): Promise<DispatchResult>;
    /**
     * Get current assignment status
     */
    getStatus(): {
        data: DispatchData | null;
        technicians: Technician[];
        initialized: boolean;
    };
    getState(): {
        data: DispatchData | null;
        availableTechnicians: Technician[];
        initialized: boolean;
    };
    setState(state: {
        data: DispatchData | null;
        availableTechnicians: Technician[];
        initialized: boolean;
    }): void;
}
export declare function createTechnician(data: {
    name: string;
    phone: string;
    email?: string;
    specialties: string[];
}): Promise<number>;
export declare function getTechnicianById(id: number): Promise<Technician | null>;
export declare function getAllTechnicians(): Promise<Technician[]>;
//# sourceMappingURL=DispatchAgent.d.ts.map