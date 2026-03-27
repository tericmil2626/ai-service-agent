import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Calendar,
  CalendarDays,
  Target,
  Phone,
  Menu,
  X
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/conversations', icon: MessageSquare, label: 'Conversations' },
  { path: '/voice-calls', icon: Phone, label: 'Voice Calls' },
  { path: '/technicians', icon: Users, label: 'Technicians' },
  { path: '/appointments', icon: Calendar, label: 'Appointments' },
  { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { path: '/leads', icon: Target, label: 'Leads' },
];

export function Sidebar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[#1a1d24] rounded-lg border border-[#2e3440] text-gray-400 hover:text-white"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40 w-64 bg-[#1a1d24] border-r border-[#2e3440]
        transform transition-transform duration-200 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6">
          <h1 className="text-xl font-bold text-amber-500 flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            Service Admin
          </h1>
        </div>

        <nav className="px-4 pb-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors
                  ${isActive 
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30' 
                    : 'text-gray-400 hover:text-white hover:bg-[#252a33]'
                  }
                `}
              >
                <Icon size={18} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#2e3440]">
          <div className="text-xs text-gray-500">
            <p>API: localhost:3002</p>
            <p className="mt-1">Dashboard v1.0</p>
          </div>
        </div>
      </aside>
    </>
  );
}
