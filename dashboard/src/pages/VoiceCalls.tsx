import { useState } from 'react';
import { Layout } from '../components/Layout';
import { useFetch } from '../hooks/useFetch';
import { api } from '../services/api';
import type { CallLog } from '../types';
import {
  Phone,
  PhoneIncoming,
  PhoneOff,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  Mic,
} from 'lucide-react';

const statusConfig: Record<string, { label: string; color: string; icon: typeof Phone }> = {
  completed:    { label: 'Completed',  color: 'bg-green-500/20 text-green-400',  icon: Phone },
  'in-progress':{ label: 'Live',       color: 'bg-amber-500/20 text-amber-400',  icon: PhoneIncoming },
  'no-answer':  { label: 'No Answer',  color: 'bg-red-500/20 text-red-400',      icon: PhoneOff },
  busy:         { label: 'Busy',       color: 'bg-orange-500/20 text-orange-400',icon: PhoneOff },
  failed:       { label: 'Failed',     color: 'bg-red-500/20 text-red-400',      icon: PhoneOff },
  canceled:     { label: 'Canceled',   color: 'bg-gray-500/20 text-gray-400',    icon: PhoneOff },
};

function formatDuration(seconds?: number): string {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface TranscriptTurn {
  role: 'caller' | 'agent';
  text: string;
  timestamp: string;
}

function TranscriptViewer({ transcript }: { transcript: TranscriptTurn[] | string | null }) {
  let turns: TranscriptTurn[] = [];
  if (typeof transcript === 'string') {
    try { turns = JSON.parse(transcript); } catch (_) { turns = []; }
  } else if (Array.isArray(transcript)) {
    turns = transcript;
  }

  if (turns.length === 0) {
    return <p className="text-sm text-gray-500 italic">No transcript available.</p>;
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {turns.map((turn, i) => (
        <div
          key={i}
          className={`flex ${turn.role === 'caller' ? 'justify-start' : 'justify-end'}`}
        >
          <div
            className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
              turn.role === 'caller'
                ? 'bg-[#252a33] text-gray-300'
                : 'bg-amber-500/20 text-amber-100 border border-amber-500/30'
            }`}
          >
            <p className="font-medium text-xs mb-1 opacity-70">
              {turn.role === 'caller' ? 'Caller' : 'AI Agent'}
            </p>
            <p>{turn.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CallRow({ call }: { call: CallLog }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[call.status] || statusConfig.completed;
  const StatusIcon = cfg.icon;

  return (
    <div className="border-b border-[#2e3440] last:border-b-0">
      <div
        className="p-4 hover:bg-[#252a33] transition-colors cursor-pointer flex items-start gap-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="mt-1 text-gray-500">
          <PhoneIncoming size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <span className="font-semibold text-white">{call.customer_name || call.customer_phone}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
              <StatusIcon size={10} className="inline mr-1" />
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1">
              <Phone size={12} />
              {call.customer_phone}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {formatDuration(call.duration_seconds)}
            </span>
            {call.transcript && (
              <span className="flex items-center gap-1">
                <Mic size={12} />
                Transcript available
              </span>
            )}
            <span>{new Date(call.created_at).toLocaleString()}</span>
          </div>
        </div>
        <div className="text-gray-500 mt-1">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pl-12 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-1">Call SID</p>
              <p className="text-gray-300 font-mono text-xs break-all">{call.call_sid}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Direction</p>
              <p className="text-gray-300 capitalize">{call.direction}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Business Number</p>
              <p className="text-gray-300">{call.business_phone}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Duration</p>
              <p className="text-gray-300">{formatDuration(call.duration_seconds)}</p>
            </div>
          </div>

          {call.recording_url && (
            <div>
              <p className="text-gray-500 text-xs mb-2">Recording</p>
              <audio controls className="w-full h-8" src={call.recording_url} />
            </div>
          )}

          <div>
            <p className="text-gray-500 text-xs mb-2">Conversation Transcript</p>
            <TranscriptViewer transcript={call.transcript} />
          </div>
        </div>
      )}
    </div>
  );
}

export function VoiceCalls() {
  const { data, loading, error, refetch } = useFetch(() => api.getCallLogs());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [daysFilter, setDaysFilter] = useState('7');

  const callLogs: CallLog[] = (data as any)?.call_logs || [];

  const filtered = callLogs.filter(call => {
    const matchesStatus = statusFilter === 'all' || call.status === statusFilter;
    const matchesSearch =
      (call.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.customer_phone.includes(searchQuery) ||
      call.call_sid.includes(searchQuery);
    return matchesStatus && matchesSearch;
  });

  const activeLive = callLogs.filter(c => c.status === 'in-progress').length;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Phone size={24} className="text-amber-500" />
              Voice Calls
            </h1>
            <p className="text-gray-400 mt-1">AI-handled inbound call history and transcripts</p>
          </div>
          <div className="flex items-center gap-3">
            {activeLive > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm animate-pulse">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                {activeLive} live call{activeLive > 1 ? 's' : ''}
              </div>
            )}
            <button
              onClick={refetch}
              className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg text-sm hover:bg-amber-500/20 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="text"
              placeholder="Search by name, phone, or call SID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#1a1d24] border border-[#2e3440] rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[#1a1d24] border border-[#2e3440] rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="in-progress">In Progress</option>
            <option value="no-answer">No Answer</option>
            <option value="busy">Busy</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={daysFilter}
            onChange={e => setDaysFilter(e.target.value)}
            className="px-3 py-2 bg-[#1a1d24] border border-[#2e3440] rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50"
          >
            <option value="1">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>

        {/* Stats row */}
        {!loading && callLogs.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Calls', value: callLogs.length },
              { label: 'Completed', value: callLogs.filter(c => c.status === 'completed').length },
              { label: 'No Answer', value: callLogs.filter(c => c.status === 'no-answer').length },
              {
                label: 'Avg Duration',
                value: (() => {
                  const completed = callLogs.filter(c => c.duration_seconds);
                  if (!completed.length) return '--';
                  const avg = completed.reduce((s, c) => s + (c.duration_seconds || 0), 0) / completed.length;
                  return formatDuration(Math.round(avg));
                })(),
              },
            ].map(stat => (
              <div key={stat.label} className="bg-[#1a1d24] border border-[#2e3440] rounded-xl p-4">
                <p className="text-gray-500 text-xs mb-1">{stat.label}</p>
                <p className="text-xl font-bold text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg">
            <p>Error loading call logs: {error}</p>
            <button onClick={refetch} className="mt-2 text-sm underline hover:text-red-300">Try again</button>
          </div>
        )}

        {/* Call list */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading call logs...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Phone size={48} className="mx-auto mb-4 opacity-30" />
            <p>No call logs found</p>
            {callLogs.length === 0 && (
              <p className="text-xs mt-2">
                Set <code className="bg-[#1a1d24] px-1 rounded">VOICE_AI_ENABLED=true</code> to start handling calls with AI
              </p>
            )}
          </div>
        ) : (
          <div className="bg-[#1a1d24] border border-[#2e3440] rounded-xl overflow-hidden">
            {filtered.map(call => (
              <CallRow key={call.call_sid} call={call} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
