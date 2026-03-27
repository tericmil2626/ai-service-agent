import type { ServiceAgent, MessageContext, AgentResponse } from '../../types/agents.js';
export interface DispatchData {
    customer_id: number;
    job_id: number;
    appointment_id: number;
    customer_name: string;
    customer_phone: string;
    address: string;
    service_type: string;
    scheduled_date: string;
    scheduled_time: string;
}
export interface Technician {
    id: number;
    name: string;
    phone: string;
    email?: string;
    specialties?: string;
    is_active: number;
}
export declare class DispatchAgent implements ServiceAgent {
    id: string;
    name: string;
    private dispatchData;
    private lastAssignedIndex;
    initialize(context: Record<string, any>): Promise<void>;
    handleMessage(message: string, context: MessageContext): Promise<AgentResponse>;
    private assignTechnician;
    private getActiveTechnicians;
    private selectTechnicianRoundRobin;
    private updateAppointmentWithTechnician;
    private notifyCustomer;
    getState(): Record<string, any>;
    setState(state: Record<string, any>): void;
}
export default DispatchAgent;
//# sourceMappingURL=DispatchAgent.d.ts.map