import { useState } from 'react';
import { Layout } from '../components/Layout';
import { useFetch } from '../hooks/useFetch';
import { api } from '../services/api';

import { 
  Calendar, 
  Clock, 
  MapPin,
  Search
} from 'lucide-react';

export function Appointments() {
  const { data: appointments, loading, error, refetch } = useFetch(api.getAppointments);
  const { data: technicians } = useFetch(api.getTechnicians);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  const filteredAppointments = appointments?.filter(apt => {
    const matchesSearch = 
      apt.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      apt.serviceType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || apt.status === statusFilter;
    const matchesDate = !dateFilter || apt.date === dateFilter;
    return matchesSearch && matchesStatus && matchesDate;
  });

  const handleAssignTechnician = async (appointmentId: string, technicianId: string) => {
    try {
      await api.updateAppointment(appointmentId, { technicianId });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to assign technician');
    }
  };

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-500/20 text-blue-400',
    in_progress: 'bg-amber-500/20 text-amber-400',
    completed: 'bg-green-500/20 text-green-400',
    cancelled: 'bg-red-500/20 text-red-400',
  };

  const statusLabels: Record<string, string> = {
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Appointments</h1>
            <p className="text-gray-400 mt-1">Manage service appointments and assignments</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-amber-500 text-black'
                  : 'bg-[#252a33] text-gray-400 hover:text-white'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'calendar'
                  ? 'bg-amber-500 text-black'
                  : 'bg-[#252a33] text-gray-400 hover:text-white'
              }`}
            >
              Calendar
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search appointments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#1a1d24] border border-[#2e3440] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-[#1a1d24] border border-[#2e3440] rounded-lg text-white focus:outline-none focus:border-amber-500/50"
            >
              <option value="all">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-4 py-2 bg-[#1a1d24] border border-[#2e3440] rounded-lg text-white focus:outline-none focus:border-amber-500/50"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="px-3 py-2 text-gray-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg">
            <p>Error loading appointments: {error}</p>
            <button onClick={refetch} className="mt-2 text-sm underline hover:text-red-300">
              Try again
            </button>
          </div>
        )}

        {/* Appointments List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading appointments...</div>
        ) : filteredAppointments?.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Calendar size={48} className="mx-auto mb-4 opacity-50" />
            <p>No appointments found</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="bg-[#1a1d24] border border-[#2e3440] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2e3440]">
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Date & Time</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Customer</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Service</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Status</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Technician</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2e3440]">
                  {filteredAppointments?.map((apt) => (
                    <tr key={apt.id} className="hover:bg-[#252a33] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-white">
                          <Calendar size={16} className="text-gray-500" />
                          {new Date(apt.date).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-2 text-gray-400 text-sm mt-1">
                          <Clock size={14} />
                          {apt.time}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{apt.customerName}</div>
                        {apt.address && (
                          <div className="flex items-center gap-1 text-gray-500 text-sm mt-1">
                            <MapPin size={12} />
                            {apt.address}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-gray-300">{apt.serviceType}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[apt.status]}`}>
                          {statusLabels[apt.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={apt.technicianId || ''}
                          onChange={(e) => handleAssignTechnician(apt.id, e.target.value)}
                          className="px-3 py-1.5 bg-[#252a33] border border-[#2e3440] rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50"
                        >
                          <option value="">Unassigned</option>
                          {technicians?.map((tech) => (
                            <option key={tech.id} value={tech.id}>
                              {tech.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Calendar View */
          <div className="bg-[#1a1d24] border border-[#2e3440] rounded-xl p-6">
            <div className="text-center text-gray-500 py-12">
              <Calendar size={48} className="mx-auto mb-4 opacity-50" />
              <p>Calendar view coming soon</p>
              <p className="text-sm mt-2">Use list view for now</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
