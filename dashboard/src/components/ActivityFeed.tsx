import type { Activity } from '../types';
import { 
  MessageSquare, 
  Calendar, 
  Users, 
  Target,
  ArrowRight
} from 'lucide-react';

interface ActivityFeedProps {
  activities: Activity[];
}

const activityIcons = {
  conversation: MessageSquare,
  appointment: Calendar,
  technician: Users,
  lead: Target,
};

const activityColors = {
  conversation: 'text-blue-400 bg-blue-400/10',
  appointment: 'text-green-400 bg-green-400/10',
  technician: 'text-purple-400 bg-purple-400/10',
  lead: 'text-amber-400 bg-amber-400/10',
};

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-[#1a1d24] border border-[#2e3440] rounded-xl overflow-hidden">
      <div className="p-6 border-b border-[#2e3440]">
        <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
      </div>
      <div className="divide-y divide-[#2e3440]">
        {activities.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No recent activity
          </div>
        ) : (
          activities.map((activity) => {
            const Icon = activityIcons[activity.type];
            return (
              <div 
                key={activity.id} 
                className="p-4 flex items-center gap-4 hover:bg-[#252a33] transition-colors"
              >
                <div className={`p-2 rounded-lg ${activityColors[activity.type]}`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300">{activity.description}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatTime(activity.timestamp)}</p>
                </div>
                <ArrowRight size={16} className="text-gray-600" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
