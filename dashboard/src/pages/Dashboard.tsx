import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { StatCard } from '../components/StatCard';
import { ActivityFeed } from '../components/ActivityFeed';
import { Modal } from '../components/Modal';
import { useFetch } from '../hooks/useFetch';
import { api } from '../services/api';
import {
  MessageSquare,
  Calendar,
  Users,
  Wrench,
  Plus,
  Clock,
  ArrowRight,
  Target,
  Link2,
  CheckCircle2
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function Dashboard() {
  const { data: stats, loading: _statsLoading, error: statsError, refetch } = useFetch(api.getStats);
  const [showTechModal, setShowTechModal] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);

  useEffect(() => {
    // Check calendar connection status
    fetch('/api/calendar/status?business_id=default')
      .then(res => res.json())
      .then(data => setCalendarConnected(data.connected))
      .catch(() => setCalendarConnected(false));
  }, []);

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-400 mt-1">Welcome back! Here's what's happening today.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowTechModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg transition-colors"
            >
              <Plus size={18} />
              Add Technician
            </button>
            <Link
              to="/appointments"
              className="flex items-center gap-2 px-4 py-2 bg-[#252a33] hover:bg-[#2e3440] text-white rounded-lg transition-colors border border-[#2e3440]"
            >
              <Clock size={18} />
              View Schedule
            </Link>
          </div>
        </div>

        {/* Error State */}
        {statsError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg">
            <p>Error loading dashboard: {statsError}</p>
            <button 
              onClick={refetch}
              className="mt-2 text-sm underline hover:text-red-300"
            >
              Try again
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Active Conversations"
            value={stats?.activeConversations ?? 0}
            icon={MessageSquare}
            color="blue"
          />
          <StatCard
            title="Today's Appointments"
            value={stats?.todayAppointments ?? 0}
            icon={Calendar}
            color="green"
          />
          <StatCard
            title="Unassigned Jobs"
            value={stats?.unassignedJobs ?? 0}
            icon={Wrench}
            color="amber"
          />
          <StatCard
            title="Total Technicians"
            value={stats?.totalTechnicians ?? 0}
            icon={Users}
            color="purple"
          />
        </div>

        {/* Activity Feed */}
        <ActivityFeed activities={stats?.recentActivity ?? []} />

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/conversations"
            className="bg-[#1a1d24] border border-[#2e3440] rounded-xl p-6 hover:border-amber-500/30 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <MessageSquare className="text-blue-400" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-amber-500 transition-colors">
                    View Conversations
                  </h3>
                  <p className="text-sm text-gray-400">Check customer messages</p>
                </div>
              </div>
              <ArrowRight className="text-gray-600 group-hover:text-amber-500 transition-colors" size={20} />
            </div>
          </Link>

          <Link
            to="/leads"
            className="bg-[#1a1d24] border border-[#2e3440] rounded-xl p-6 hover:border-amber-500/30 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-500/10 rounded-lg">
                  <Target className="text-amber-400" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-amber-500 transition-colors">
                    Manage Leads
                  </h3>
                  <p className="text-sm text-gray-400">Convert leads to appointments</p>
                </div>
              </div>
              <ArrowRight className="text-gray-600 group-hover:text-amber-500 transition-colors" size={20} />
            </div>
          </Link>

          {calendarConnected ? (
            <div className="bg-[#1a1d24] border border-green-500/30 rounded-xl p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <CheckCircle2 className="text-green-400" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Calendar Connected</h3>
                  <p className="text-sm text-gray-400">Appointments sync to Google Calendar</p>
                </div>
              </div>
            </div>
          ) : (
            <a
              href="http://localhost:3002/auth/google?business_id=default"
              className="bg-[#1a1d24] border border-[#2e3440] rounded-xl p-6 hover:border-amber-500/30 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-500/10 rounded-lg">
                    <Link2 className="text-purple-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white group-hover:text-amber-500 transition-colors">
                      Connect Calendar
                    </h3>
                    <p className="text-sm text-gray-400">Sync with Google Calendar</p>
                  </div>
                </div>
                <ArrowRight className="text-gray-600 group-hover:text-amber-500 transition-colors" size={20} />
              </div>
            </a>
          )}
        </div>
      </div>

      {/* Add Technician Modal */}
      <Modal
        isOpen={showTechModal}
        onClose={() => setShowTechModal(false)}
        title="Add New Technician"
      >
        <p className="text-gray-400">
          Use the Technicians page to add a new technician to your team.
        </p>
        <div className="mt-6 flex justify-end">
          <Link
            to="/technicians"
            onClick={() => setShowTechModal(false)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg"
          >
            Go to Technicians
          </Link>
        </div>
      </Modal>
    </Layout>
  );
}
