import { useState } from 'react';
import { Layout } from '../components/Layout';
import { useFetch } from '../hooks/useFetch';
import { api } from '../services/api';
import type { Lead } from '../types';
import { 
  Target, 
  Phone, 
  Wrench,
  Check,
  X,
  Calendar,
  Search,
  Filter
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Leads() {
  const { data: leads, loading, error, refetch } = useFetch(api.getLeads);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const navigate = useNavigate();

  const filteredLeads = leads?.filter(lead => {
    const matchesSearch = 
      lead.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.customerPhone.includes(searchQuery) ||
      lead.serviceType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleConvertToAppointment = async (lead: Lead) => {
    try {
      // Update lead status
      await api.updateLead(lead.id, { status: 'qualified' });
      alert(`Lead ${lead.customerName} converted to appointment!`);
      refetch();
      navigate('/appointments');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to convert lead');
    }
  };

  const handleDisqualify = async (leadId: string) => {
    if (!confirm('Are you sure you want to disqualify this lead?')) return;
    
    try {
      await api.updateLead(leadId, { status: 'disqualified' });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to disqualify lead');
    }
  };

  const statusColors: Record<string, string> = {
    new: 'bg-blue-500/20 text-blue-400',
    qualified: 'bg-green-500/20 text-green-400',
    disqualified: 'bg-red-500/20 text-red-400',
  };

  const statusLabels: Record<string, string> = {
    new: 'New',
    qualified: 'Qualified',
    disqualified: 'Disqualified',
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Leads</h1>
            <p className="text-gray-400 mt-1">Manage and convert potential customers</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#1a1d24] border border-[#2e3440] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-[#1a1d24] border border-[#2e3440] rounded-lg text-white focus:outline-none focus:border-amber-500/50"
            >
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="qualified">Qualified</option>
              <option value="disqualified">Disqualified</option>
            </select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg">
            <p>Error loading leads: {error}</p>
            <button onClick={refetch} className="mt-2 text-sm underline hover:text-red-300">
              Try again
            </button>
          </div>
        )}

        {/* Leads Grid */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading leads...</div>
        ) : filteredLeads?.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Target size={48} className="mx-auto mb-4 opacity-50" />
            <p>No leads found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLeads?.map((lead) => (
              <div
                key={lead.id}
                className="bg-[#1a1d24] border border-[#2e3440] rounded-xl p-6 hover:border-amber-500/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-white">{lead.customerName}</h3>
                    <div className="flex items-center gap-2 text-gray-500 text-sm mt-1">
                      <Phone size={14} />
                      {lead.customerPhone}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[lead.status]}`}>
                    {statusLabels[lead.status]}
                  </span>
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Wrench size={16} />
                    <span>{lead.serviceType}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Source: {lead.source}
                  </div>
                  <div className="text-xs text-gray-500">
                    Added: {new Date(lead.createdAt).toLocaleDateString()}
                  </div>
                </div>

                {lead.status === 'new' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConvertToAppointment(lead)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors text-sm font-medium"
                    >
                      <Calendar size={16} />
                      Convert
                    </button>
                    <button
                      onClick={() => handleDisqualify(lead.id)}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {lead.status === 'qualified' && (
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <Check size={16} />
                    Converted to appointment
                  </div>
                )}

                {lead.status === 'disqualified' && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <X size={16} />
                    Disqualified
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
