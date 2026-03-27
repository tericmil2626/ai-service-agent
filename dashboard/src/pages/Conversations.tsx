import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Modal } from '../components/Modal';
import { useFetch } from '../hooks/useFetch';
import { api } from '../services/api';
import type { Conversation } from '../types';
import { 
  MessageSquare, 
  Phone, 
  Clock,
  Filter,
  Search
} from 'lucide-react';

const statusLabels: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-500/20 text-blue-400' },
  scheduling: { label: 'Scheduling', color: 'bg-amber-500/20 text-amber-400' },
  dispatch: { label: 'Dispatch', color: 'bg-purple-500/20 text-purple-400' },
  followup: { label: 'Follow-up', color: 'bg-green-500/20 text-green-400' },
  completed: { label: 'Completed', color: 'bg-gray-500/20 text-gray-400' },
};

export function Conversations() {
  const { data: conversations, loading, error, refetch } = useFetch(api.getConversations);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = conversations?.filter(conv => {
    const matchesStatus = statusFilter === 'all' || conv.status === statusFilter;
    const matchesSearch = 
      conv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.customerPhone.includes(searchQuery) ||
      conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Conversations</h1>
            <p className="text-gray-400 mt-1">Manage customer conversations and messages</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search conversations..."
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
              <option value="scheduling">Scheduling</option>
              <option value="dispatch">Dispatch</option>
              <option value="followup">Follow-up</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg">
            <p>Error loading conversations: {error}</p>
            <button onClick={refetch} className="mt-2 text-sm underline hover:text-red-300">
              Try again
            </button>
          </div>
        )}

        {/* Conversations List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading conversations...</div>
        ) : filteredConversations?.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
            <p>No conversations found</p>
          </div>
        ) : (
          <div className="bg-[#1a1d24] border border-[#2e3440] rounded-xl overflow-hidden">
            <div className="divide-y divide-[#2e3440]">
              {filteredConversations?.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className="p-4 hover:bg-[#252a33] transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-white truncate">{conv.customerName}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusLabels[conv.status]?.color || 'bg-gray-500/20 text-gray-400'}`}>
                          {statusLabels[conv.status]?.label || conv.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                        <Phone size={14} />
                        <span>{conv.customerPhone}</span>
                      </div>
                      <p className="text-sm text-gray-400 truncate">{conv.lastMessage}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock size={12} />
                        <span>{new Date(conv.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Conversation Detail Modal */}
      <Modal
        isOpen={!!selectedConversation}
        onClose={() => setSelectedConversation(null)}
        title="Conversation"
      >
        {selectedConversation && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-[#2e3440]">
              <div>
                <h3 className="font-semibold text-white">{selectedConversation.customerName}</h3>
                <p className="text-sm text-gray-500">{selectedConversation.customerPhone}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusLabels[selectedConversation.status]?.color}`}>
                {statusLabels[selectedConversation.status]?.label}
              </span>
            </div>

            {/* Messages */}
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {selectedConversation.messages?.length ? (
                selectedConversation.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'customer' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        msg.sender === 'customer'
                          ? 'bg-[#252a33] text-gray-300'
                          : 'bg-amber-500/20 text-amber-100 border border-amber-500/30'
                      }`}
                    >
                      <p className="text-sm">{msg.content}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatTime(msg.timestamp)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No messages in this conversation</p>
                </div>
              )}
            </div>

            {/* Last message info */}
            <div className="pt-4 border-t border-[#2e3440]">
              <p className="text-sm text-gray-500">
                Last message: {formatTime(selectedConversation.updatedAt)}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
