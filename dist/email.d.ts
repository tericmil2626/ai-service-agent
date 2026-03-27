export declare function sendJobNotification(jobData: {
    customerName: string;
    customerPhone: string;
    address: string;
    serviceType: string;
    urgency: boolean;
    notes?: string;
}): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function sendDailySummary(stats: {
    newJobs: number;
    completedJobs: number;
    urgentJobs: number;
}): Promise<void>;
//# sourceMappingURL=email.d.ts.map