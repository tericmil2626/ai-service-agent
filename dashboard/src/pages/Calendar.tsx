import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Modal } from '../components/Modal';
import { useFetch } from '../hooks/useFetch';
import { api } from '../services/api';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, DateSelectArg, EventDropArg } from '@fullcalendar/core';
import { Calendar as CalendarIcon, Clock, MapPin, Phone, User, Filter } from 'lucide-react';

interface AppointmentEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  extendedProps: {
    customerName: string;
    customerPhone: string;
    serviceType: string;
    status: string;
    address?: string;
    notes?: string;
    technicianId?: string;
    technicianName?: string;
  };
  backgroundColor: string;
  borderColor: string;
}

const statusColors: Record<string, { bg: string; border: string }> = {
  scheduled: { bg: '#3b82f6', border: '#2563eb' },
  in_progress: { bg: '#f59e0b', border: '#d97706' },
  completed: { bg: '#10b981', border: '#059669' },
  cancelled: { bg: '#ef4444', border: '#dc2626' },
};

const statusLabels: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Generate distinct colors for technicians
const technicianColors = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#10b981', // green
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
];

export function Calendar() {
  const { data: appointments, loading, error, refetch } = useFetch(api.getAppointments);
  const { data: technicians } = useFetch(api.getTechnicians);
  const { data: customers } = useFetch(api.getConversations);
  const calendarRef = useRef<FullCalendar>(null);
  
  const [viewMode, setViewMode] = useState<'timeGridWeek' | 'timeGridDay'>('timeGridWeek');
  const [selectedEvent, setSelectedEvent] = useState<AppointmentEvent | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [visibleTechnicians, setVisibleTechnicians] = useState<Set<string>>(new Set());
  const [colorBy, setColorBy] = useState<'status' | 'technician'>('status');

  // Change calendar view when viewMode changes
  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.changeView(viewMode);
    }
  }, [viewMode]);

  // Initialize visible technicians when data loads
  const initializeVisibleTechnicians = useCallback(() => {
    if (technicians && visibleTechnicians.size === 0) {
      setVisibleTechnicians(new Set(technicians.map(t => t.id)));
    }
  }, [technicians, visibleTechnicians.size]);

  initializeVisibleTechnicians();

  // Get technician color
  const getTechnicianColor = useCallback((technicianId?: string) => {
    if (!technicianId) return '#6b7280';
    const index = technicians?.findIndex(t => t.id === technicianId) ?? 0;
    return technicianColors[index % technicianColors.length];
  }, [technicians]);

  // Convert appointments to FullCalendar events
  const events: AppointmentEvent[] = useMemo(() => {
    if (!appointments) return [];
    
    return appointments
      .filter(apt => visibleTechnicians.size === 0 || !apt.technicianId || visibleTechnicians.has(apt.technicianId))
      .map(apt => {
        const [hours, minutes] = apt.time.split(':').map(Number);
        const startDate = new Date(apt.date);
        startDate.setHours(hours, minutes);
        
        // Default 1 hour duration
        const endDate = new Date(startDate);
        endDate.setHours(endDate.getHours() + 1);

        const color = colorBy === 'status' 
          ? statusColors[apt.status] || { bg: '#6b7280', border: '#4b5563' }
          : { bg: getTechnicianColor(apt.technicianId), border: getTechnicianColor(apt.technicianId) };

        return {
          id: apt.id,
          title: `${apt.customerName} - ${apt.serviceType}`,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          extendedProps: {
            customerName: apt.customerName,
            customerPhone: apt.customerPhone,
            serviceType: apt.serviceType,
            status: apt.status,
            address: apt.address,
            technicianId: apt.technicianId,
            technicianName: apt.technicianName,
          },
          backgroundColor: color.bg,
          borderColor: color.border,
        };
      });
  }, [appointments, visibleTechnicians, colorBy, getTechnicianColor]);

  // Handle event click
  const handleEventClick = useCallback((clickInfo: EventClickArg) => {
    setSelectedEvent(clickInfo.event as unknown as AppointmentEvent);
  }, []);

  // Handle date select (create new appointment)
  const handleDateSelect = useCallback((selectInfo: DateSelectArg) => {
    setSelectedDateRange({ start: selectInfo.start, end: selectInfo.end });
    setIsCreateModalOpen(true);
  }, []);

  // Handle event drop (reschedule)
  const handleEventDrop = useCallback(async (dropInfo: EventDropArg) => {
    const event = dropInfo.event;
    const newDate = event.start;
    
    if (!newDate) return;

    try {
      const hours = newDate.getHours().toString().padStart(2, '0');
      const minutes = newDate.getMinutes().toString().padStart(2, '0');
      const time = `${hours}:${minutes}`;
      const date = newDate.toISOString().split('T')[0];

      await api.updateAppointment(event.id, { date, time });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reschedule appointment');
      dropInfo.revert();
    }
  }, [refetch]);

  // Toggle technician visibility
  const toggleTechnician = useCallback((techId: string) => {
    setVisibleTechnicians(prev => {
      const newSet = new Set(prev);
      if (newSet.has(techId)) {
        newSet.delete(techId);
      } else {
        newSet.add(techId);
      }
      return newSet;
    });
  }, []);

  // Show all technicians
  const showAllTechnicians = useCallback(() => {
    if (technicians) {
      setVisibleTechnicians(new Set(technicians.map(t => t.id)));
    }
  }, [technicians]);

  // Hide all technicians
  const hideAllTechnicians = useCallback(() => {
    setVisibleTechnicians(new Set());
  }, []);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <CalendarIcon className="text-amber-500" size={28} />
              Calendar
            </h1>
            <p className="text-gray-400 mt-1">Schedule and manage appointments</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('timeGridWeek')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'timeGridWeek'
                  ? 'bg-amber-500 text-black'
                  : 'bg-[#252a33] text-gray-400 hover:text-white'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode('timeGridDay')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'timeGridDay'
                  ? 'bg-amber-500 text-black'
                  : 'bg-[#252a33] text-gray-400 hover:text-white'
              }`}
            >
              Day
            </button>
          </div>
        </div>

        {/* Color By Toggle */}
        <div className="flex items-center gap-4 bg-[#1a1d24] border border-[#2e3440] rounded-lg p-3">
          <span className="text-gray-400 text-sm flex items-center gap-2">
            <Filter size={16} />
            Color by:
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setColorBy('status')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                colorBy === 'status'
                  ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Status
            </button>
            <button
              onClick={() => setColorBy('technician')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                colorBy === 'technician'
                  ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Technician
            </button>
          </div>
        </div>

        {/* Legend */}
        {colorBy === 'status' ? (
          <div className="flex flex-wrap gap-4">
            {Object.entries(statusColors).map(([status, colors]) => (
              <div key={status} className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded" 
                  style={{ backgroundColor: colors.bg }}
                />
                <span className="text-sm text-gray-400">{statusLabels[status]}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {technicians?.map((tech, index) => (
              <div key={tech.id} className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded" 
                  style={{ backgroundColor: technicianColors[index % technicianColors.length] }}
                />
                <span className="text-sm text-gray-400">{tech.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Technician Filter */}
        {technicians && technicians.length > 0 && (
          <div className="bg-[#1a1d24] border border-[#2e3440] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <User size={16} />
                Filter by Technician
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={showAllTechnicians}
                  className="text-xs text-amber-500 hover:text-amber-400"
                >
                  All
                </button>
                <span className="text-gray-600">|</span>
                <button
                  onClick={hideAllTechnicians}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  None
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {technicians.map(tech => (
                <label 
                  key={tech.id} 
                  className="flex items-center gap-2 cursor-pointer hover:bg-[#252a33] px-2 py-1 rounded transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={visibleTechnicians.has(tech.id)}
                    onChange={() => toggleTechnician(tech.id)}
                    className="w-4 h-4 rounded border-gray-600 text-amber-500 focus:ring-amber-500/50 bg-[#252a33]"
                  />
                  <span className="text-sm text-gray-300">{tech.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg">
            <p>Error loading appointments: {error}</p>
            <button onClick={refetch} className="mt-2 text-sm underline hover:text-red-300">
              Try again
            </button>
          </div>
        )}

        {/* Calendar */}
        <div className="bg-[#1a1d24] border border-[#2e3440] rounded-xl p-4">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading calendar...</div>
          ) : (
            <div className="calendar-dark">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView={viewMode}
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: ''
                }}
                events={events}
                editable={true}
                selectable={true}
                selectMirror={true}
                dayMaxEvents={true}
                weekends={true}
                eventClick={handleEventClick}
                select={handleDateSelect}
                eventDrop={handleEventDrop}
                height="auto"
                slotMinTime="06:00:00"
                slotMaxTime="20:00:00"
                allDaySlot={false}
                slotDuration="00:30:00"
                snapDuration="00:15:00"
              />
            </div>
          )}
        </div>

        {/* Event Detail Modal */}
        <Modal
          isOpen={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
          title="Appointment Details"
        >
          {selectedEvent && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div 
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: selectedEvent.backgroundColor }}
                />
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  selectedEvent.extendedProps.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                  selectedEvent.extendedProps.status === 'in_progress' ? 'bg-amber-500/20 text-amber-400' :
                  selectedEvent.extendedProps.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {statusLabels[selectedEvent.extendedProps.status]}
                </span>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Customer</label>
                <div className="flex items-center gap-2 text-white mt-1">
                  <User size={16} className="text-gray-500" />
                  {selectedEvent.extendedProps.customerName}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Phone</label>
                <div className="flex items-center gap-2 text-white mt-1">
                  <Phone size={16} className="text-gray-500" />
                  {selectedEvent.extendedProps.customerPhone}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Service Type</label>
                <div className="text-white mt-1">{selectedEvent.extendedProps.serviceType}</div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Time</label>
                <div className="flex items-center gap-2 text-white mt-1">
                  <Clock size={16} className="text-gray-500" />
                  {new Date(selectedEvent.start).toLocaleString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
              </div>

              {selectedEvent.extendedProps.technicianName && (
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide">Technician</label>
                  <div className="text-white mt-1">{selectedEvent.extendedProps.technicianName}</div>
                </div>
              )}

              {selectedEvent.extendedProps.address && (
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide">Address</label>
                  <div className="flex items-start gap-2 text-white mt-1">
                    <MapPin size={16} className="text-gray-500 mt-0.5" />
                    {selectedEvent.extendedProps.address}
                  </div>
                </div>
              )}

              {selectedEvent.extendedProps.notes && (
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide">Notes</label>
                  <div className="text-gray-300 mt-1 bg-[#252a33] p-3 rounded-lg">
                    {selectedEvent.extendedProps.notes}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>

        {/* Create Appointment Modal */}
        <CreateAppointmentModal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            setSelectedDateRange(null);
          }}
          startDate={selectedDateRange?.start}
          customers={customers || []}
          technicians={technicians || []}
          onCreated={refetch}
        />
      </div>

      {/* Calendar Dark Theme Styles */}
      <style>{`
        .calendar-dark .fc {
          --fc-border-color: #2e3440;
          --fc-page-bg-color: transparent;
          --fc-neutral-bg-color: #1a1d24;
          --fc-neutral-text-color: #9ca3af;
          --fc-theme-standard-border-color: #2e3440;
        }
        
        .calendar-dark .fc-theme-standard td,
        .calendar-dark .fc-theme-standard th {
          border-color: #2e3440;
        }
        
        .calendar-dark .fc-col-header-cell {
          background-color: #252a33;
          color: #e5e7eb;
          padding: 12px 4px;
          font-weight: 500;
        }
        
        .calendar-dark .fc-timegrid-slot {
          height: 48px;
        }
        
        .calendar-dark .fc-timegrid-slot-label {
          color: #6b7280;
          font-size: 0.75rem;
        }
        
        .calendar-dark .fc-event {
          border-radius: 6px;
          border: none;
          padding: 4px 8px;
          font-size: 0.875rem;
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.1s;
        }
        
        .calendar-dark .fc-event:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .calendar-dark .fc-event-title {
          font-weight: 500;
          color: white;
        }
        
        .calendar-dark .fc-event-time {
          font-size: 0.75rem;
          opacity: 0.9;
          color: white;
        }
        
        .calendar-dark .fc-button-primary {
          background-color: #252a33;
          border-color: #2e3440;
          color: #e5e7eb;
          text-transform: capitalize;
          font-weight: 500;
          padding: 8px 16px;
        }
        
        .calendar-dark .fc-button-primary:hover {
          background-color: #374151;
          border-color: #4b5563;
        }
        
        .calendar-dark .fc-button-primary:not(:disabled).fc-button-active,
        .calendar-dark .fc-button-primary:not(:disabled):active {
          background-color: #f59e0b;
          border-color: #f59e0b;
          color: #000;
        }
        
        .calendar-dark .fc-button-primary:disabled {
          opacity: 0.5;
        }
        
        .calendar-dark .fc-toolbar-title {
          color: #e5e7eb;
          font-size: 1.25rem;
          font-weight: 600;
        }
        
        .calendar-dark .fc-timegrid-now-indicator-line {
          border-color: #f59e0b;
        }
        
        .calendar-dark .fc-timegrid-now-indicator-arrow {
          color: #f59e0b;
        }
        
        .calendar-dark .fc-highlight {
          background-color: rgba(245, 158, 11, 0.2);
        }
        
        .calendar-dark .fc-day-today {
          background-color: rgba(245, 158, 11, 0.05) !important;
        }
        
        .calendar-dark .fc-day-today .fc-col-header-cell-cushion {
          color: #f59e0b;
        }
      `}</style>
    </Layout>
  );
}

// Create Appointment Modal Component
interface CreateAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  startDate?: Date;
  customers: Array<{ id: string; customerName: string; customerPhone: string }>;
  technicians: Array<{ id: string; name: string }>;
  onCreated: () => void;
}

function CreateAppointmentModal({ isOpen, onClose, startDate, customers, technicians, onCreated }: CreateAppointmentModalProps) {
  const [customerId, setCustomerId] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set initial date/time from selection
  useState(() => {
    if (startDate) {
      setDate(startDate.toISOString().split('T')[0]);
      const hours = startDate.getHours().toString().padStart(2, '0');
      const minutes = startDate.getMinutes().toString().padStart(2, '0');
      setTime(`${hours}:${minutes}`);
    }
  });

  // Update when modal opens
  if (isOpen && !date && startDate) {
    setDate(startDate.toISOString().split('T')[0]);
    const hours = startDate.getHours().toString().padStart(2, '0');
    const minutes = startDate.getMinutes().toString().padStart(2, '0');
    setTime(`${hours}:${minutes}`);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !serviceType || !date || !time) return;

    const selectedCustomer = customers.find(c => c.id === customerId);
    if (!selectedCustomer) return;

    setIsSubmitting(true);
    try {
      await api.createAppointment({
        customerName: selectedCustomer.customerName,
        customerPhone: selectedCustomer.customerPhone,
        serviceType,
        date,
        time,
        technicianId: technicianId || undefined,
        status: 'scheduled',
      });
      onCreated();
      onClose();
      // Reset form
      setCustomerId('');
      setServiceType('');
      setTechnicianId('');
      setNotes('');
      setDate('');
      setTime('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const serviceTypes = [
    'Christmas Light Installation',
    'Christmas Light Removal',
    'Repair/Maintenance',
    'Consultation',
    'Other',
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Appointment">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Customer *
          </label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
            className="w-full px-4 py-2 bg-[#252a33] border border-[#2e3440] rounded-lg text-white focus:outline-none focus:border-amber-500/50"
          >
            <option value="">Select a customer</option>
            {customers.map(customer => (
              <option key={customer.id} value={customer.id}>
                {customer.customerName} ({customer.customerPhone})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Date *
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-4 py-2 bg-[#252a33] border border-[#2e3440] rounded-lg text-white focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Time *
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              className="w-full px-4 py-2 bg-[#252a33] border border-[#2e3440] rounded-lg text-white focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Service Type *
          </label>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            required
            className="w-full px-4 py-2 bg-[#252a33] border border-[#2e3440] rounded-lg text-white focus:outline-none focus:border-amber-500/50"
          >
            <option value="">Select service type</option>
            {serviceTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Technician
          </label>
          <select
            value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
            className="w-full px-4 py-2 bg-[#252a33] border border-[#2e3440] rounded-lg text-white focus:outline-none focus:border-amber-500/50"
          >
            <option value="">Unassigned</option>
            {technicians.map(tech => (
              <option key={tech.id} value={tech.id}>{tech.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add any special instructions or notes..."
            className="w-full px-4 py-2 bg-[#252a33] border border-[#2e3440] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-[#252a33] text-gray-400 rounded-lg hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !customerId || !serviceType || !date || !time}
            className="flex-1 px-4 py-2 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Creating...' : 'Create Appointment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
