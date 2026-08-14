import React, { useState } from 'react';
import { Search, Barcode, Shield, User, Smartphone, RefreshCw, ChevronDown } from 'lucide-react';
import { useAuth, ROLES } from '../context/AuthContext';

export default function Header({ onOpenScanner, onOpenTraceDrawer }) {
  const { user, roleInfo, setRole, isMobileMode, setIsMobileMode } = useAuth();
  const [quickImeiSearch, setQuickImeiSearch] = useState('');
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (quickImeiSearch.trim()) {
      onOpenTraceDrawer(quickImeiSearch.trim());
      setQuickImeiSearch('');
    }
  };

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 px-4 py-2.5 flex items-center justify-between shadow-xs">
      
      {/* Brand & App Title */}
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-0.5 shadow-md shadow-blue-500/20">
          <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center text-blue-600 font-black text-lg">
            FT
          </div>
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-900 tracking-wide flex items-center gap-2">
            FuelTracks <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">IMS</span>
          </h1>
          <p className="text-[11px] text-slate-500 hidden sm:block">Inventory & Traceability Platform</p>
        </div>
      </div>

      {/* Quick Search IMEI Bar */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Quick search IMEI... (e.g. 864920050019115)"
            value={quickImeiSearch}
            onChange={(e) => setQuickImeiSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-20 py-1.5 text-xs text-slate-800 placeholder-slate-400 font-mono focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all"
          />
          <button
            type="submit"
            className="absolute right-1 top-1 bottom-1 px-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium rounded-lg transition-colors"
          >
            Trace
          </button>
        </form>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-2">
        
        {/* Scanner Modal Trigger */}
        <button
          onClick={onOpenScanner}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
        >
          <Barcode className="w-4 h-4" />
          <span className="hidden sm:inline">Bulk Scan</span>
        </button>

        {/* Toggle Mobile App Mode */}
        <button
          onClick={() => setIsMobileMode(!isMobileMode)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
            isMobileMode
              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span className="hidden lg:inline">{isMobileMode ? 'Exit Field Mode' : 'Field App Mode'}</span>
        </button>

        {/* Role Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowRoleDropdown(!showRoleDropdown)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-2 bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 transition-all`}
          >
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-semibold">{roleInfo.label}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showRoleDropdown && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in-50 duration-150">
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
                Switch Active User Role
              </div>
              {Object.values(ROLES).map(r => (
                <button
                  key={r.key}
                  onClick={() => {
                    setRole(r.key);
                    setShowRoleDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    user.role === r.key ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{r.label}</span>
                  {user.role === r.key && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
