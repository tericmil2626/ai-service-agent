export interface SchedulingData {
    customer_id: number;
    job_id: number;
    name: string;
    phone: string;
    address: string;
    service_type: string;
    problem_description?: string;
    urgency?: string;
    preferred_time?: string;
}
export interface SchedulingResult {
    response: string;
    confirmed?: boolean;
    appointment?: {
        id: number;
        date: string;
        time: string;
        service_type: string;
        address: string;
    };
    slots?: Array<{
        date: string;
        time: string;
    }>;
}
export declare class SchedulingAgent {
    private data;
    private proposedSlots;
    private awaitingConfirmation;
    private initialized;
    /**
     * Initialize the scheduling agent with customer data from intake
     */
    initialize(data: SchedulingData): Promise<void>;
    /**
     * Main message handler for orchestrator integration
     * Routes to appropriate method based on conversation state
     */
    handleMessage(message: string, context: any): Promise<{
        response: string;
        isComplete: boolean;
        handoffTo?: string;
        data?: any;
    }>;
    receiveFromReceptionist(data: SchedulingData): Promise<SchedulingResult>;
    handleTimeSelection(selection: string): Promise<SchedulingResult>;
    handleRescheduleRequest(currentAppointmentId: number, newPreference: string): Promise<SchedulingResult>;
    confirmReschedule(appointmentId: number, newSlot: {
        date: string;
        time: string;
    }): Promise<SchedulingResult>;
    handleCancellation(appointmentId: number): Promise<SchedulingResult>;
    private getAvailableSlots;
    private bookAppointment;
    private parseTimeOfDay;
    private findSlotByTimePreference;
    private findSlotByTimePreferenceInList;
    private parseDayPreference;
    private getSlotsForDay;
    private formatSlots;
    private formatTime12Hour;
    getState(): {
        data: SchedulingData | null;
        proposedSlots: Array<{
            date: string;
            time: string;
        }>;
        awaitingConfirmation: boolean;
    };
    setState(state: {
        data: SchedulingData | null;
        proposedSlots: Array<{
            date: string;
            time: string;
        }>;
        awaitingConfirmation: boolean;
    }): void;
}
//# sourceMappingURL=SchedulingAgent.d.ts.map