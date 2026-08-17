import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Barcode,
  Shield,
  User,
  Smartphone,
  RefreshCw,
  ChevronDown,
  Car,
  Phone,
  MapPin,
  Boxes,
  X,
  ExternalLink,
  LogOut
} from 'lucide-react';
import { useAuth, ROLES } from '../context/AuthContext';
import { globalSearchDevices } from '../services/api';

export default function Header({ onOpenScanner, onOpenTraceDrawer }) {
  const { user, roleInfo, setRole, logout, isMobileMode, setIsMobileMode } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResultsDropdown, setShowResultsDropdown] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const searchInputRef = useRef(null);
  const searchDropdownRef = useRef(null);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setShowResultsDropdown(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        searchDropdownRef.current &&
        !searchDropdownRef.current.contains(e.target) &&
        !searchInputRef.current?.contains(e.target)
      ) {
        setShowResultsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search query
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setShowResultsDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await globalSearchDevices(searchTerm.trim());
        if (res.success) {
          setSearchResults(res.data || []);
          setShowResultsDropdown(true);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleSelectResult = (item) => {
    onOpenTraceDrawer(item.imei_number);
    setShowResultsDropdown(false);
    setSearchTerm('');
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      onOpenTraceDrawer(searchTerm.trim());
      setShowResultsDropdown(false);
      setSearchTerm('');
    }
  };

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 px-4 py-2.5 flex items-center justify-between shadow-xs">
      
      {/* Brand & App Title */}
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white font-mono font-bold text-base shadow-sm">
          FT
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-900 tracking-wide flex items-center gap-2">
            FuelTracks <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">IMS</span>
          </h1>
          <p className="text-[11px] text-slate-500 hidden sm:block">Inventory & Traceability Platform</p>
        </div>
      </div>

      {/* Global Universal Search Bar (Ctrl + K) */}
      <div className="flex-1 max-w-lg mx-4 hidden md:block relative">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search IMEI, Vehicle (e.g. AP21TZ), Customer, Phone, SIM..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowResultsDropdown(true);
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-24 py-1.5 text-xs text-slate-800 placeholder-slate-400 font-medium focus:outline-none focus:border-slate-800 focus:bg-white transition-all"
          />

          <div className="absolute right-1.5 top-1 bottom-1 flex items-center gap-1">
            {isSearching ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-600 mr-1" />
            ) : searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}

            <button
              type="submit"
              className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold shadow-2xs transition-colors cursor-pointer"
            >
              Trace
            </button>
          </div>
        </form>

        {/* Global Search Results Dropdown */}
        {showResultsDropdown && (
          <div
            ref={searchDropdownRef}
            className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 z-50 max-h-96 overflow-y-auto space-y-1 animate-in fade-in-50 duration-150"
          >
            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 mb-1">
              <span>Matching Records ({searchResults.length})</span>
              <span className="text-[10px] text-slate-400">Click to trace journey</span>
            </div>

            {searchResults.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No matching devices, vehicles, or IMEI numbers found.
              </div>
            ) : (
              searchResults.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelectResult(item)}
                  className="p-2.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-200 flex items-center justify-between group"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 text-xs group-hover:text-purple-700">
                        {item.imei_number}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                        {item.device_type_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      {item.vehicle_number && (
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <Car className="w-3 h-3 text-amber-600" /> {item.vehicle_number}
                        </span>
                      )}
                      {item.customer_name && (
                        <span className="truncate max-w-[150px]">
                          👤 {item.customer_name}
                        </span>
                      )}
                      {item.current_holder_name && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" /> {item.current_holder_name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      item.current_status === 'INSTALLED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.current_status === 'WITH_DEALER'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {item.current_status}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-600 transition-colors" />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-2">
        
        {/* Scanner Modal Trigger */}
        <button
          onClick={onOpenScanner}
          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
        >
          <Barcode className="w-4 h-4" />
          <span className="hidden sm:inline">Bulk Scan</span>
        </button>

        {/* Toggle Mobile App Mode */}
        <button
          onClick={() => setIsMobileMode(!isMobileMode)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
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
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-2 bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 transition-all cursor-pointer`}
          >
            <Shield className="w-3.5 h-3.5 text-purple-600" />
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
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    user.role === r.key ? 'bg-purple-50 text-purple-800 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{r.label}</span>
                  {user.role === r.key && <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
                </button>
              ))}

              <div className="pt-1 mt-1 border-t border-slate-100">
                <button
                  onClick={() => {
                    setShowRoleDropdown(false);
                    logout();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out / Switch Portal</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Direct Logout Icon */}
        <button
          onClick={logout}
          title="Sign Out to Login Portal"
          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer hidden sm:flex"
        >
          <LogOut className="w-4 h-4" />
        </button>

      </div>
    </header>
  );
}
