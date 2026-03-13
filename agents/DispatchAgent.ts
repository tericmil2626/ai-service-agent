import { getDb, updateJobStatus } from '../database';

interface JobData {
  job_id: number;
  customer_id: number;
  name: string;
  phone: string;
  address: string;
  service_type: string;
  problem_description?: string;
  appointment_time: string;
  urgency?: string;
}

interface Technician {
  id: number;
  name: string;
  phone?: string;
  specialties: string[];
  is_active: boolean;
  current_location?: string;
}

interface Assignment {
  technician_id: number;
  technician_name: string;
  estimated_arrival: string;
  dispatch_status: 'assigned' | 'reassigned' | 'delayed' | 'emergency';
  notes?: string;
}

export class DispatchAgent {
  private jobData: JobData | null = null;
  private assignedTechnician: Technician | null = null;

  async receiveScheduledJob(jobData: JobData): Promise<{
    response: string;
    assignment?: Assignment;
    customerNotification?: string;
  }> {
    this.jobData = jobData;

    // Find qualified technicians
    const technicians = await this.getQualifiedTechnicians(jobData.service_type);

    if (technicians.length === 0) {
      return {
        response: "No qualified technicians available for this service type.",
        assignment: {
          technician_id: 0,
          technician_name: 'TBD',
          estimated_arrival: jobData.appointment_time,
          dispatch_status: 'delayed',
          notes: 'Awaiting technician availability'
        }
      };
    }

    // Select best technician
    this.assignedTechnician = await this.selectBestTechnician(technicians, jobData);

    if (!this.assignedTechnician) {
      return {
        response: "Unable to assign technician at this time.",
        assignment: {
          technician_id: 0,
          technician_name: 'TBD',
          estimated_arrival: jobData.appointment_time,
          dispatch_status: 'delayed',
          notes: 'No available technicians'
        }
      };
    }

    // Create assignment
    const assignment: Assignment = {
      technician_id: this.assignedTechnician.id,
      technician_name: this.assignedTechnician.name,
      estimated_arrival: jobData.appointment_time,
      dispatch_status: jobData.urgency === 'high' ? 'emergency' : 'assigned'
    };

    // Update job in database
    await this.assignTechnicianToJob(jobData.job_id, this.assignedTechnician.id);

    // Generate notifications
    const customerNotification = this.generateCustomerNotification(assignment);

    return {
      response: `Technician ${this.assignedTechnician.name} assigned to ${jobData.service_type} job at ${jobData.address}.`,
      assignment,
      customerNotification
    };
  }

  async handleTechnicianDelay(jobId: number, delayMinutes: number): Promise<{
    response: string;
    customerNotification: string;
  }> {
    const db = await getDb();
    
    // Get job and current assignment
    const job = await db.get(
      `SELECT a.*, j.service_type, c.name as customer_name, c.phone, c.address, t.name as technician_name
       FROM appointments a
       JOIN jobs j ON a.job_id = j.id
       JOIN customers c ON j.customer_id = c.id
       JOIN technicians t ON a.technician_id = t.id
       WHERE a.job_id = ? AND a.status IN ('confirmed', 'dispatched')`,
      jobId
    );

    if (!job) {
      return {
        response: "Job not found or not currently assigned.",
        customerNotification: ""
      };
    }

    // Calculate new ETA
    const originalTime = new Date(`${job.scheduled_date}T${job.scheduled_time}`);
    const newTime = new Date(originalTime.getTime() + delayMinutes * 60000);
    const newTimeStr = newTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    // Update appointment status
    await db.run(
      `UPDATE appointments SET status = 'delayed', notes = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?`,
      [`Delayed by ${delayMinutes} minutes`, jobId]
    );

    const customerNotification = `Our technician ${job.technician_name} is finishing a previous job and may arrive about ${delayMinutes} minutes later than expected, around ${newTimeStr}. Thank you for your patience.`;

    return {
      response: `Delay communicated. Customer notified of new ETA: ${newTimeStr}`,
      customerNotification
    };
  }

  async handleTechnicianReassignment(jobId: number, reason: string): Promise<{
    response: string;
    assignment?: Assignment;
    customerNotification: string;
  }> {
    const db = await getDb();

    // Get job details
    const job = await db.get(
      `SELECT j.*, c.name, c.phone, c.address, a.scheduled_date, a.scheduled_time
       FROM jobs j
       JOIN customers c ON j.customer_id = c.id
       JOIN appointments a ON j.id = a.job_id
       WHERE j.id = ?`,
      jobId
    );

    if (!job) {
      return {
        response: "Job not found.",
        customerNotification: ""
      };
    }

    // Find alternative technician
    const technicians = await this.getQualifiedTechnicians(job.service_type);
    const currentTechId = await db.get('SELECT technician_id FROM appointments WHERE job_id = ?', jobId);
    
    const availableTechs = technicians.filter(t => t.id !== currentTechId?.technician_id);

    if (availableTechs.length === 0) {
      return {
        response: "No alternative technicians available.",
        customerNotification: "We're experiencing scheduling delays. We'll contact you shortly with an updated arrival time."
      };
    }

    // Select new technician
    const newTech = availableTechs[0]; // Simple: take first available

    // Update assignment
    await db.run(
      `UPDATE appointments SET technician_id = ?, status = 'rescheduled', updated_at = CURRENT_TIMESTAMP WHERE job_id = ?`,
      [newTech.id, jobId]
    );

    const assignment: Assignment = {
      technician_id: newTech.id,
      technician_name: newTech.name,
      estimated_arrival: `${job.scheduled_date} ${job.scheduled_time}`,
      dispatch_status: 'reassigned',
      notes: `Reassigned due to: ${reason}`
    };

    const customerNotification = `We've assigned a new technician, ${newTech.name}, to your ${job.service_type} appointment. They'll arrive at the scheduled time.`;

    return {
      response: `Technician reassigned to ${newTech.name}.`,
      assignment,
      customerNotification
    };
  }

  async notifyTechnicianEnRoute(jobId: number): Promise<{
    response: string;
    customerNotification: string;
  }> {
    const db = await getDb();

    const job = await db.get(
      `SELECT j.*, c.name as customer_name, c.address, c.phone, t.name as technician_name, a.scheduled_time
       FROM jobs j
       JOIN customers c ON j.customer_id = c.id
       JOIN appointments a ON j.id = a.job_id
       JOIN technicians t ON a.technician_id = t.id
       WHERE j.id = ?`,
      jobId
    );

    if (!job) {
      return {
        response: "Job not found.",
        customerNotification: ""
      };
    }

    // Update status
    await db.run(
      `UPDATE appointments SET status = 'dispatched', updated_at = CURRENT_TIMESTAMP WHERE job_id = ?`,
      jobId
    );

    const eta = this.calculateETA(job.scheduled_time);
    const customerNotification = `Your technician ${job.technician_name} is on the way and should arrive around ${eta}.`;

    return {
      response: `Technician ${job.technician_name} marked as en route to ${job.address}.`,
      customerNotification
    };
  }

  async getTechnicianSchedule(technicianId: number, date: string): Promise<any[]> {
    const db = await getDb();
    return db.all(
      `SELECT a.*, j.service_type, c.name as customer_name, c.address
       FROM appointments a
       JOIN jobs j ON a.job_id = j.id
       JOIN customers c ON j.customer_id = c.id
       WHERE a.technician_id = ? AND a.scheduled_date = ? AND a.status != 'cancelled'
       ORDER BY a.scheduled_time`,
      [technicianId, date]
    );
  }

  private async getQualifiedTechnicians(serviceType: string): Promise<Technician[]> {
    const db = await getDb();
    
    // Map service types to skills
    const skillMap: Record<string, string[]> = {
      'plumbing': ['plumbing'],
      'electrical': ['electrical'],
      'hvac': ['hvac'],
      'appliance': ['appliance'],
      'maintenance': ['plumbing', 'electrical', 'hvac', 'general']
    };

    const requiredSkills = skillMap[serviceType] || [serviceType];

    // Get all active technicians
    const technicians = await db.all(
      'SELECT * FROM technicians WHERE is_active = 1'
    );

    // Filter by skills (skills stored as JSON array in specialties field)
    return technicians.filter((tech: any) => {
      const skills = JSON.parse(tech.specialties || '[]');
      return requiredSkills.some(skill => skills.includes(skill));
    });
  }

  private async selectBestTechnician(technicians: Technician[], job: JobData): Promise<Technician | null> {
    if (technicians.length === 0) return null;
    if (technicians.length === 1) return technicians[0];

    const db = await getDb();
    const jobDate = job.appointment_time.split(' ')[0];

    // Get workload for each technician on that day
    const techWorkloads = await Promise.all(
      technicians.map(async (tech) => {
        const count = await db.get(
          'SELECT COUNT(*) as count FROM appointments WHERE technician_id = ? AND scheduled_date = ? AND status IN ("confirmed", "pending")',
          [tech.id, jobDate]
        );
        return { tech, workload: count?.count || 0 };
      })
    );

    // Sort by workload (least busy first), then pick first
    techWorkloads.sort((a, b) => a.workload - b.workload);
    
    return techWorkloads[0].tech;
  }

  private async assignTechnicianToJob(jobId: number, technicianId: number): Promise<void> {
    const db = await getDb();
    
    // Update appointment with technician
    await db.run(
      `UPDATE appointments SET technician_id = ?, status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE job_id = ?`,
      [technicianId, jobId]
    );

    // Update job status
    await updateJobStatus(jobId, 'scheduled');
  }

  private generateCustomerNotification(assignment: Assignment): string {
    if (!this.jobData) return '';

    const date = new Date(this.jobData.appointment_time);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    if (assignment.dispatch_status === 'emergency') {
      return `We've assigned ${assignment.technician_name} as your emergency technician and they're prioritizing your call. Expected arrival: ${dayName} at ${timeStr}.`;
    }

    return `Your technician ${assignment.technician_name} is scheduled to arrive ${dayName} at ${timeStr}. We'll notify you when they're on the way.`;
  }

  private calculateETA(scheduledTime: string): string {
    // Simple ETA calculation - in real system would use GPS/traffic
    const now = new Date();
    const eta = new Date(now.getTime() + 30 * 60000); // 30 minutes from now
    return eta.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  getStructuredOutput(): any {
    if (!this.jobData || !this.assignedTechnician) return null;

    return {
      job_id: this.jobData.job_id,
      technician_assigned: this.assignedTechnician.name,
      technician_id: `TECH_${this.assignedTechnician.id.toString().padStart(2, '0')}`,
      appointment_time: this.jobData.appointment_time,
      estimated_arrival: this.jobData.appointment_time,
      dispatch_status: this.jobData.urgency === 'high' ? 'emergency' : 'assigned'
    };
  }
}

export default DispatchAgent;
