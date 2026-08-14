import React, { useState, useEffect } from 'react';
import { X, Search, CheckCircle, Truck, Wrench, ShieldAlert, Clock, ArrowRight, User, MapPin, Tag } from 'lucide-react';
import { fetchDeviceByImei } from '../services/api';

export default function ImeiJourneyDrawer({ isOpen, onClose, initialImei = '' }) {
  const [searchImei, setSearchImei] = useState(initialImei);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deviceData, setDeviceData] = useState(null);

  useEffect(() => {
    if (initialImei) {
      setSearchImei(initialImei);
      handleSearch(initialImei);
    }
  }, [initialImei]);

  const handleSearch = async (imeiToSearch) => {
    const target = (imeiToSearch || searchImei).trim();
    if (!target) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetchDeviceByImei(target);
      if (res.success) {
        setDeviceData(res.data);
      } else {
        setError(res.error || 'Device not found');
        setDeviceData(null);
      }
    } catch (err) {
      setError(err.message);
      setDeviceData(null);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const getStatusBadge = (status) => {
    const map = {
      IN_WAREHOUSE: 'badge-warehouse',
      WITH_DEALER: 'badge-dealer',
      INSTALLED: 'badge-installed',
      FAULTY: 'badge-faulty',
      RETURNED: 'badge-returned'
    };
    return map[status] || 'badge-warehouse';
  };

  const getEventIcon = (type) => {
    switch (type) {
      case 'PURCHASED': return <Tag className="w-4 h-4 text-blue-600" />;
      case 'DISPATCHED': return <Truck className="w-4 h-4 text-amber-600" />;
      case 'INSTALLED': return <Wrench className="w-4 h-4 text-emerald-600" />;
      case 'RETURNED': return <Clock className="w-4 h-4 text-purple-600" />;
      default: return <CheckCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-xl bg-white border-l border-slate-200 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Device Traceability Journey</h2>
              <p className="text-xs text-slate-500">Full audit log for individual IMEI</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-200 bg-white">
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Enter 15-digit IMEI (e.g. 864920050019115)"
                value={searchImei}
                onChange={(e) => setSearchImei(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white font-mono"
              />
            </div>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
              {loading ? 'Searching...' : 'Trace'}
            </button>
          </form>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {deviceData && (
            <>
              {/* Summary Card */}
              <div className="glass-panel rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-base font-bold text-blue-700 tracking-wider">
                    {deviceData.device.imei_number}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadge(deviceData.device.current_status)}`}>
                    {deviceData.device.current_status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 block">Device Type</span>
                    <span className="text-slate-800 font-medium">{deviceData.device.device_type_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">SIM Number</span>
                    <span className="text-slate-800 font-mono">{deviceData.device.sim_number || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Current Holder</span>
                    <span className="text-emerald-700 font-semibold">{deviceData.device.current_holder_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Vendor</span>
                    <span className="text-slate-800 font-medium">{deviceData.device.vendor_name}</span>
                  </div>
                </div>
              </div>

              {/* Linked Installation Details if Installed */}
              {deviceData.installation && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Wrench className="w-4 h-4" /> Active Vehicle Installation
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                    <div><span className="text-slate-500">Customer:</span> <strong className="text-slate-900">{deviceData.installation.customer_name}</strong></div>
                    <div><span className="text-slate-500">Phone:</span> <span className="font-mono text-emerald-800 font-medium">{deviceData.installation.customer_phone}</span></div>
                    <div><span className="text-slate-500">Vehicle:</span> <strong className="text-amber-700 font-mono">{deviceData.installation.vehicle_number}</strong> ({deviceData.installation.vehicle_type})</div>
                    <div><span className="text-slate-500">Installed Date:</span> {deviceData.installation.installation_date}</div>
                    <div><span className="text-slate-500">Installer:</span> {deviceData.installation.installed_by}</div>
                    <div><span className="text-slate-500">Warranty End:</span> {deviceData.installation.warranty_end_date || 'N/A'}</div>
                  </div>
                </div>
              )}

              {/* Chronological Audit Timeline */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" /> Chronological Traceability Timeline ({deviceData.history.length} events)
                </h3>

                <div className="relative border-l-2 border-slate-200 ml-3 space-y-6">
                  {deviceData.history.map((evt, idx) => (
                    <div key={idx} className="relative pl-6">
                      <div className="absolute -left-[17px] top-0 p-1.5 rounded-full bg-white border border-slate-300 shadow-xs">
                        {getEventIcon(evt.event_type)}
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="font-bold text-slate-900 text-sm">{evt.event_type}</span>
                          <span className="text-[11px] text-slate-500">{evt.event_date}</span>
                        </div>

                        {evt.from_holder && evt.to_holder && (
                          <div className="flex items-center gap-1.5 text-slate-700 py-1 font-medium">
                            <span className="text-slate-500">{evt.from_holder}</span>
                            <ArrowRight className="w-3 h-3 text-blue-600 flex-shrink-0" />
                            <span className="text-emerald-700 font-bold">{evt.to_holder}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-slate-500 pt-1 border-t border-slate-200/60">
                          <span className="flex items-center gap-1"><User className="w-3 h-3 text-slate-400" /> By: {evt.performed_by}</span>
                          {evt.remarks && <span className="italic text-slate-600">{evt.remarks}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {!deviceData && !loading && !error && (
            <div className="text-center py-12 text-slate-400 text-xs">
              <Search className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              Enter an IMEI number above to trace its entire journey from purchase to installation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
