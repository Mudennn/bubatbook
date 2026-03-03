import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Car, CalendarDays, Users, ArrowLeft, DollarSign, Receipt, Building2, Shield, FileCheck, Eye, Users2, BookOpen } from 'lucide-react';
import FleetSelector from './FleetSelector';
import ViewAsSelector from './ViewAsSelector';
import { useFleet } from '../hooks/useFleet';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/cars', label: 'Cars', icon: Car },
  { to: '/admin/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/sales', label: 'Sales', icon: DollarSign },
  { to: '/admin/expenses', label: 'Expenses', icon: Receipt },
  { to: '/admin/fleet', label: 'Fleet Settings', icon: Building2 },
  { to: '/admin/fleet/members', label: 'Members', icon: Users2 },
  { to: '/admin/manual', label: 'User Manual', icon: BookOpen },
];

// Governance nav items — only visible to Super Group admins
const governanceItems = [
  { to: '/admin/groups', label: 'Groups', icon: Shield },
  { to: '/admin/change-requests', label: 'Change Requests', icon: FileCheck },
];

export default function AdminLayout({ children, title }) {
  const location = useLocation();
  const { isSuperGroup } = useFleet();
  const { isSuperAdmin, realIsSuperAdmin } = useAuth();
  const [showViewAs, setShowViewAs] = useState(false);

  const allItems = isSuperAdmin && isSuperGroup
    ? [...navItems, ...governanceItems]
    : [...navItems, { to: '/admin/change-requests', label: 'My Requests', icon: FileCheck }];

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back to site */}
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to site
        </Link>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <aside className="lg:w-56 shrink-0">
            <div className="glass-card !p-3 lg:sticky lg:top-24">
              <div className="px-1 py-2 mb-2">
                <FleetSelector />
              </div>
              <nav className="space-y-1">
                {allItems.map(({ to, label, icon: Icon }) => {
                  const active = location.pathname === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        active
                          ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </Link>
                  );
                })}
              </nav>

              {/* Governance separator for super group */}
              {isSuperAdmin && isSuperGroup && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="px-3 text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">Governance</p>
                </div>
              )}

              {/* View As — only for REAL super admin (not viewAs-overridden) */}
              {realIsSuperAdmin && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <button
                    onClick={() => setShowViewAs(true)}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-amber-400 hover:bg-amber-500/10 transition-all"
                  >
                    <Eye className="w-4 h-4" />
                    View As...
                  </button>
                </div>
              )}
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {title && <h1 className="section-title mb-6">{title}</h1>}
            {children}
          </main>
        </div>
      </div>

      {/* View As Modal */}
      <ViewAsSelector isOpen={showViewAs} onClose={() => setShowViewAs(false)} />
    </div>
  );
}
