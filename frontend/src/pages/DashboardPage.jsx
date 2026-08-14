import React, { useState, useEffect, useMemo } from 'react';
import { Boxes, Truck, Wrench, ShieldAlert, Activity, Search, RefreshCw, ArrowUpRight, Edit3, Clock, CheckCircle2, AlertCircle, Trash2, AlertTriangle } from 'lucide-react';
import { fetchStats, fetchPurchaseBatches, deletePurchaseBatch } from '../services/api';

export default function DashboardPage({ onOpenTraceDrawer, onNavigateTab }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);
  const [batchFilter, setBatchFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [deletingBatchRecord, setDeletingBatchRecord] = useState(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  // Fetch batches list once on mount
  useEffect(() => {
    refreshBatches();
  }, []);

  const refreshBatches = () => {
    fetchPurchaseBatches().then(res => {
      if (res.success) setBatches(res.data);
    }).catch(err => console.error(err));
  };

  const selectedBatchObj = useMemo(() => {
    if (!batchFilter) return null;
    return batches.find(b => b.id.toString() === batchFilter.toString()) || null;
  }, [batchFilter, batches]);

  // Reload stats when filter values change
  useEffect(() => {
    loadData();
  }, [batchFilter, locationFilter]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (batchFilter) params.purchase_batch_id = batchFilter;
      if (locationFilter) params.stock_place = locationFilter;
      const res = await fetchStats(params);
      if (res.success) {
        setStats(res.data);
      } else {
        setError(res.error || 'Failed to fetch data');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!deletingBatchRecord) return;
    setDeletingLoading(true);
    try {
      const res = await deletePurchaseBatch(deletingBatchRecord.id);
      if (res.success) {
        setDeletingBatchRecord(null);
        setBatchFilter('');
        refreshBatches();
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500 text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        Loading executive dashboard stats...
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-6 text-center text-red-700 bg-red-50 border border-red-200 rounded-2xl flex flex-col items-center gap-3 max-w-md mx-auto my-12 shadow-sm">
        <p className="text-sm font-semibold">Failed to load dashboard data: {error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin-hover" /> Retry Connection
        </button>
      </div>
    );
  }

  const { statusCounts, typeCounts, recentActivity = [], placeCounts, totals } = stats;

  const getEventBadge = (eventType) => {
    switch (eventType) {
      case 'STATUS_CHANGED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">UPDATED / EDITED</span>;
      case 'DISPATCHED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">DISPATCHED</span>;
      case 'INSTALLED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">INSTALLED</span>;
      case 'RETURNED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">RETURNED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">{eventType}</span>;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 p-6 rounded-2xl text-white shadow-md">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Executive Stock & Operations Overview</h2>
          <p className="text-xs text-blue-100 mt-1">Live operational statistics filtered by upload list and location</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto">
          {/* List Selection Filter */}
          <div className="flex items-center gap-1.5">
            <select
              value={batchFilter}
              onChange={(e) => {
                setBatchFilter(e.target.value);
                setLocationFilter('');
              }}
              className="bg-white/10 hover:bg-white/20 border border-white/25 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none font-semibold max-w-[220px] truncate"
              style={{ colorScheme: 'dark' }}
            >
              <option value="" className="text-slate-800">All Upload Lists</option>
              {batches.map(b => (
                <option key={b.id} value={b.id} className="text-slate-800">
                  {b.notes ? `${b.notes} (${b.source_file})` : b.source_file}
                </option>
              ))}
            </select>

            {selectedBatchObj && (
              <button
                type="button"
                onClick={() => setDeletingBatchRecord(selectedBatchObj)}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer shrink-0 animate-fadeIn"
                title={`Delete list "${selectedBatchObj.source_file || selectedBatchObj.notes}" and its devices`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Delete List</span>
              </button>
            )}
          </div>

          {/* Location / Stock Place Filter */}
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="bg-white/10 hover:bg-white/20 border border-white/25 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none font-semibold max-w-[180px] truncate"
            style={{ colorScheme: 'dark' }}
          >
            <option value="" className="text-slate-800">All Locations</option>
            {placeCounts && placeCounts.map(p => (
              <option key={p.name} value={p.name} className="text-slate-800">
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={loadData}
            className="px-3.5 py-2 bg-white/15 hover:bg-white/25 text-white border border-white/20 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Data
          </button>
        </div>
      </div>

      {/* Delete Upload List Confirmation Modal in Dashboard */}
      {deletingBatchRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-scaleIn text-slate-900">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Upload List</h3>
                <p className="text-xs text-slate-500">Permanently delete this list and all its devices</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">List / File:</span>
                <span className="font-bold text-slate-900 font-mono">{deletingBatchRecord.source_file || 'Upload Batch'}</span>
              </div>
              {deletingBatchRecord.notes && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Notes / Label:</span>
                  <span className="font-semibold text-slate-800">{deletingBatchRecord.notes}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Vendor:</span>
                <span className="font-medium text-slate-700">{deletingBatchRecord.vendor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Device Type:</span>
                <span className="font-medium text-slate-700">{deletingBatchRecord.device_type_name}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500 font-medium">Total Imported:</span>
                <span className="font-bold text-blue-700 font-mono">{deletingBatchRecord.total_devices_count || 0} devices</span>
              </div>
            </div>

            <p className="text-xs text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Warning: This will permanently delete all devices in this list and their history. This action cannot be undone.</span>
            </p>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setDeletingBatchRecord(null)}
                disabled={deletingLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBatch}
                disabled={deletingLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                {deletingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Yes, Delete List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div onClick={() => onNavigateTab('inventory')} className="glass-panel p-4 rounded-2xl border-l-4 border-l-blue-600 hover:shadow-md transition-all cursor-pointer group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Devices</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 font-mono">{totals.devices}</span>
            <span className="text-[11px] text-blue-600 ml-2 font-semibold">All Types</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1 group-hover:text-blue-600 font-medium">
            View stock inventory <ArrowUpRight className="w-3 h-3" />
          </div>
        </div>

        <div onClick={() => onNavigateTab('inventory')} className="glass-panel p-4 rounded-2xl border-l-4 border-l-amber-500 hover:shadow-md transition-all cursor-pointer group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">With Dealers</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 font-mono">{statusCounts.WITH_DEALER}</span>
            <span className="text-[11px] text-amber-600 ml-2 font-semibold">Active Holding</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1 group-hover:text-amber-600 font-medium">
            View dealer stock <ArrowUpRight className="w-3 h-3" />
          </div>
        </div>

        <div onClick={() => onNavigateTab('installations')} className="glass-panel p-4 rounded-2xl border-l-4 border-l-emerald-600 hover:shadow-md transition-all cursor-pointer group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Installed Vehicles</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Wrench className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 font-mono">{statusCounts.INSTALLED}</span>
            <span className="text-[11px] text-emerald-600 ml-2 font-semibold">Active Fleet</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1 group-hover:text-emerald-600 font-medium">
            View installations <ArrowUpRight className="w-3 h-3" />
          </div>
        </div>

        <div onClick={() => onNavigateTab('inventory')} className="glass-panel p-4 rounded-2xl border-l-4 border-l-red-500 hover:shadow-md transition-all cursor-pointer group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Faulty / RMA</span>
            <div className="p-2 rounded-xl bg-red-50 text-red-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 font-mono">{statusCounts.FAULTY}</span>
            <span className="text-[11px] text-red-600 ml-2 font-semibold">Action Needed</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1 group-hover:text-red-600 font-medium">
            View faulty items <ArrowUpRight className="w-3 h-3" />
          </div>
        </div>

      </div>

      {/* Dynamic Stock Places Location Counts */}
      {placeCounts && placeCounts.length > 0 && (
        <div className="glass-panel p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Boxes className="w-4 h-4 text-indigo-600" /> Devices by Stock Place / Location
            </h3>
            <span className="text-xs text-slate-400">Excel Column Grouping</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[300px] overflow-y-auto pr-1">
            {placeCounts.map((place, idx) => {
              const percentage = totals.devices > 0 ? ((place.value / totals.devices) * 100).toFixed(0) : 0;
              return (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2 flex flex-col justify-between hover:bg-slate-100/60 transition-colors shadow-2xs">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-tight truncate max-w-[120px]" title={place.name}>
                      {place.name}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-mono">
                      {place.value}
                    </span>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-1 rounded-full animate-width-fill" 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500 font-medium">
                      <span>Share</span>
                      <span>{percentage}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recently Updated & Edited Records Feed */}
      <div className="glass-panel p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-blue-600" /> Recently Updated & Edited Records
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Live audit log of all device modifications, field edits, and status changes</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg font-mono self-start sm:self-auto">
            {recentActivity.length} {recentActivity.length === 1 ? 'Record' : 'Records'}
          </span>
        </div>

        {recentActivity.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
            <div className="p-3 bg-slate-100 rounded-full mb-3 text-slate-400">
              <Clock className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No edited or updated records yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              When any inventory record is edited, updated, dispatched, or installed, it will automatically appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto pr-1">
            {recentActivity.map((act) => (
              <div key={act.id} className="py-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 rounded-xl transition-colors">
                <div className="flex items-start sm:items-center gap-3">
                  <button
                    onClick={() => onOpenTraceDrawer(act.imei_number)}
                    className="font-mono text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline bg-blue-50/60 px-2 py-1 rounded-md"
                    title="Click to view lifecycle audit trace"
                  >
                    {act.imei_number}
                  </button>
                  
                  {getEventBadge(act.event_type)}

                  {act.device_type_name && (
                    <span className="text-[10px] font-medium text-slate-500 hidden md:inline">
                      {act.device_type_name}
                    </span>
                  )}
                </div>

                {/* Remarks / Details */}
                <div className="flex-1 sm:px-4 text-xs text-slate-600">
                  <span className="font-medium text-slate-800">
                    {act.remarks || `${act.from_holder || ''} → ${act.to_holder || ''}`}
                  </span>
                  {act.to_holder && act.to_holder !== act.from_holder && (
                    <span className="text-[11px] text-slate-400 block sm:inline sm:ml-2">
                      ({act.to_holder})
                    </span>
                  )}
                </div>

                {/* Performed By & Date */}
                <div className="flex items-center justify-between sm:justify-end gap-3 text-slate-500 text-[11px] shrink-0">
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-medium">
                    By: {act.performed_by || 'User'}
                  </span>
                  <span className="font-mono text-slate-400">{act.event_date}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
