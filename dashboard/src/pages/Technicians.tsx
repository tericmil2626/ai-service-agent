import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Modal } from '../components/Modal';
import { useFetch } from '../hooks/useFetch';
import { api } from '../services/api';
import type { Technician } from '../types';
import { 
  Users, 
  Phone, 
  Plus,
  Edit2,
  Calendar,
  Power,
  Search,
  Check,
  X
} from 'lucide-react';

export function Technicians() {
  const { data: technicians, loading, error, refetch } = useFetch(api.getTechnicians);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    specialties: '',
    status: 'active' as 'active' | 'inactive',
  });

  const filteredTechnicians = technicians?.filter(tech =>
    tech.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tech.phone.includes(searchQuery) ||
    tech.specialties.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      ...formData,
      specialties: formData.specialties.split(',').map(s => s.trim()).filter(Boolean),
    };

    try {
      if (editingTech) {
        await api.updateTechnician(editingTech.id, data);
      } else {
        await api.createTechnician(data);
      }
      setShowAddModal(false);
      setEditingTech(null);
      setFormData({ name: '', phone: '', specialties: '', status: 'active' });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save technician');
    }
  };

  const handleEdit = (tech: Technician) => {
    setEditingTech(tech);
    setFormData({
      name: tech.name,
      phone: tech.phone,
      specialties: tech.specialties.join(', '),
      status: tech.status,
    });
    setShowAddModal(true);
  };

  const handleToggleStatus = async (tech: Technician) => {
    try {
      await api.updateTechnician(tech.id, {
        status: tech.status === 'active' ? 'inactive' : 'active',
      });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Technicians</h1>
            <p className="text-gray-400 mt-1">Manage your service technicians</p>
          </div>
          <button
            onClick={() => {
              setEditingTech(null);
              setFormData({ name: '', phone: '', specialties: '', status: 'active' });
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg transition-colors"
          >
            <Plus size={18} />
            Add Technician
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            placeholder="Search technicians..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-96 pl-10 pr-4 py-2 bg-[#1a1d24] border border-[#2e3440] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg">
            <p>Error loading technicians: {error}</p>
            <button onClick={refetch} className="mt-2 text-sm underline hover:text-red-300">
              Try again
            </button>
          </div>
        )}

        {/* Technicians Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading technicians...</div>
        ) : filteredTechnicians?.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users size={48} className="mx-auto mb-4 opacity-50" />
            <p>No technicians found</p>
          </div>
        ) : (
          <div className="bg-[#1a1d24] border border-[#2e3440] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2e3440]">
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Name</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Phone</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Specialties</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Status</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2e3440]">
                  {filteredTechnicians?.map((tech) => (
                    <tr key={tech.id} className="hover:bg-[#252a33] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{tech.name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-gray-400">
                          <Phone size={14} />
                          {tech.phone}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {tech.specialties.map((specialty, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-[#252a33] text-gray-300 text-xs rounded-full border border-[#2e3440]"
                            >
                              {specialty}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            tech.status === 'active'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-gray-500/20 text-gray-400'
                          }`}
                        >
                          {tech.status === 'active' ? (
                            <Check size={12} />
                          ) : (
                            <X size={12} />
                          )}
                          {tech.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleStatus(tech)}
                            className={`p-2 rounded-lg transition-colors ${
                              tech.status === 'active'
                                ? 'text-green-400 hover:bg-green-500/10'
                                : 'text-gray-400 hover:bg-gray-500/10'
                            }`}
                            title={tech.status === 'active' ? 'Deactivate' : 'Activate'}
                          >
                            <Power size={16} />
                          </button>
                          <button
                            onClick={() => handleEdit(tech)}
                            className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="p-2 text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                            title="View Schedule"
                          >
                            <Calendar size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingTech(null);
        }}
        title={editingTech ? 'Edit Technician' : 'Add New Technician'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 bg-[#252a33] border border-[#2e3440] rounded-lg text-white focus:outline-none focus:border-amber-500/50"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Phone</label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-4 py-2 bg-[#252a33] border border-[#2e3440] rounded-lg text-white focus:outline-none focus:border-amber-500/50"
              placeholder="+1 (555) 123-4567"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Specialties (comma-separated)
            </label>
            <input
              type="text"
              value={formData.specialties}
              onChange={(e) => setFormData({ ...formData, specialties: e.target.value })}
              className="w-full px-4 py-2 bg-[#252a33] border border-[#2e3440] rounded-lg text-white focus:outline-none focus:border-amber-500/50"
              placeholder="Electrical, Plumbing, HVAC"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
              className="w-full px-4 py-2 bg-[#252a33] border border-[#2e3440] rounded-lg text-white focus:outline-none focus:border-amber-500/50"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="flex-1 px-4 py-2 bg-[#252a33] hover:bg-[#2e3440] text-white rounded-lg transition-colors border border-[#2e3440]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg transition-colors"
            >
              {editingTech ? 'Save Changes' : 'Add Technician'}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
