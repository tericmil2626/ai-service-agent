import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color?: 'amber' | 'blue' | 'green' | 'purple';
}

const colorClasses = {
  amber: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  blue: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  green: 'bg-green-500/10 text-green-500 border-green-500/30',
  purple: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
};

export function StatCard({ title, value, icon: Icon, trend, trendUp, color = 'amber' }: StatCardProps) {
  return (
    <div className="bg-[#1a1d24] border border-[#2e3440] rounded-xl p-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-white">{value}</h3>
          {trend && (
            <p className={`text-sm mt-2 ${trendUp ? 'text-green-400' : 'text-red-400'}`}>
              {trendUp ? '↑' : '↓'} {trend}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
}
