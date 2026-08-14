import React from 'react';
import { LayoutDashboard, Boxes, FileSpreadsheet, Truck, Wrench, Users, Settings, FileText, UserCheck, Smartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ activeTab, setActiveTab }) {
  const { user } = useAuth();

  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_MANAGER', 'INSTALLER', 'DEALER'] },
    { id: 'inventory', label: 'Stock Inventory', icon: Boxes, roles: ['SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_MANAGER', 'DEALER'] },
    { id: 'upload', label: 'Excel Bulk Upload', icon: FileSpreadsheet, roles: ['SUPER_ADMIN', 'WAREHOUSE_MANAGER'] },
    { id: 'installations', label: 'Installations Hub', icon: Wrench, roles: ['SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_MANAGER', 'INSTALLER'] },
    { id: 'customers', label: 'Customer CRM', icon: Users, roles: ['SUPER_ADMIN', 'SALES_MANAGER', 'INSTALLER'] },
    { id: 'types', label: 'Device Catalog', icon: Settings, roles: ['SUPER_ADMIN', 'WAREHOUSE_MANAGER'] },
    { id: 'reports', label: 'Reports & Exports', icon: FileText, roles: ['SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_MANAGER'] },
    { id: 'users', label: 'User Roles', icon: UserCheck, roles: ['SUPER_ADMIN'] },
    { id: 'mobile', label: 'Field Mobile Scanner', icon: Smartphone, roles: ['SUPER_ADMIN', 'INSTALLER', 'WAREHOUSE_MANAGER'] }
  ];

  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(user.role));

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between hidden md:flex min-h-[calc(100vh-57px)]">
      
      <div className="p-3 space-y-1">
        <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Main Modules
        </div>

        {visibleItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium flex items-center space-x-3 transition-all ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer Info Box */}
      <div className="p-4 border border-slate-200 m-3 rounded-xl bg-slate-50 text-xs space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-slate-500 font-medium">System Status</span>
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live DB
          </span>
        </div>
        <p className="text-[11px] text-slate-400">FuelTracks IMS v2.4 (SQLite WAL)</p>
      </div>

    </aside>
  );
}
