import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Download,
  Calendar,
  Building2,
  Car,
  Boxes,
  Truck,
  DollarSign,
  Search,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  Filter
} from 'lucide-react';
import { fetchDealersMatrix } from '../services/api';
import { exportAllDealersMatrixExcel } from '../utils/excelExport';

export default function DealersMatrixReportModal({ isOpen, onClose }) {
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const yesterdayStr = useMemo(() => new Date(Date.now() - 86400000).toISOString().split('T')[0], []);
  const firstOfMonthStr = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  }, []);

  const [rangeMode, setRangeMode] = useState('this_month'); // 'today' | 'yesterday' | 'this_month' | 'last_month' | 'all' | 'custom'
  const [startDate, setStartDate] = useState(firstOfMonthStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadMatrix();
    }
  }, [isOpen, rangeMode, startDate, endDate]);

  const loadMatrix = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { range: rangeMode };
      if (rangeMode === 'custom') {
        params.start_date = startDate;
        params.end_date = endDate;
      }
      const res = await fetchDealersMatrix(params);
      if (res.success) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to load dealers report');
      }
    } catch (err) {
      setError(err.message || 'Failed to load dealers report');
    } finally {
      setLoading(false);
    }
  };

  const handleRangeChange = (mode) => {
    setRangeMode(mode);
    const now = new Date();
    if (mode === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (mode === 'yesterday') {
      setStartDate(yesterdayStr);
      setEndDate(yesterdayStr);
    } else if (mode === 'this_month') {
      setStartDate(firstOfMonthStr);
      setEndDate(todayStr);
    } else if (mode === 'last_month') {
      const firstPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const lastPrev = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      setStartDate(firstPrev);
      setEndDate(lastPrev);
    } else if (mode === 'all') {
      setStartDate('2020-01-01');
      setEndDate('2099-12-31');
    }
  };

  const periodLabel = useMemo(() => {
    if (rangeMode === 'today') return `Today (${todayStr})`;
    if (rangeMode === 'yesterday') return `Yesterday (${yesterdayStr})`;
    if (rangeMode === 'this_month') return `This Month (${startDate} to ${endDate})`;
    if (rangeMode === 'last_month') return `Last Month (${startDate} to ${endDate})`;
    if (rangeMode === 'all') return 'All Time (Lifetime)';
    return `Custom Range (${startDate} to ${endDate})`;
  }, [rangeMode, startDate, endDate, todayStr, yesterdayStr]);

  const dealers = data?.dealers || [];
  const summary = data?.summary || {};
  const allRecords = data?.all_installed_records || [];

  const filteredDealers = useMemo(() => {
    if (!searchQuery.trim()) return dealers;
    const q = searchQuery.toLowerCase().trim();
    return dealers.filter(d => 
      d.dealer_name.toLowerCase().includes(q) ||
      (d.region && d.region.toLowerCase().includes(q)) ||
      (d.phone && d.phone.toLowerCase().includes(q))
    );
  }, [dealers, searchQuery]);

  const handleExportExcel = async () => {
    if (!dealers.length && !allRecords.length) {
      alert('No dealer data available to export for the selected period.');
      return;
    }
    setExporting(true);
    try {
      await exportAllDealersMatrixExcel({
        periodLabel,
        summary,
        dealers: filteredDealers,
        allRecords
      });
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-start justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Dealers Installation & Stock Matrix
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Custom Date Range
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Track how many installations each dealer completed, stock conversion rate, and revenue collection.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={exporting || loading}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exporting ? 'Generating Excel...' : 'Download All Dealers Excel (.xlsx)'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Date Filter Bar & Controls */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Presets */}
            <div className="flex flex-wrap items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'this_month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
                { id: 'all', label: 'All Time' },
                { id: 'custom', label: 'Custom Range' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleRangeChange(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    rangeMode === tab.id
                      ? 'bg-amber-600 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search dealer, region, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Custom Date Pickers */}
          {rangeMode === 'custom' && (
            <div className="flex flex-wrap items-center gap-3 p-2.5 bg-white rounded-xl border border-amber-200 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Calendar className="w-4 h-4 text-amber-600" />
                <span>Installation Period From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span>To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>

              <button
                onClick={loadMatrix}
                className="px-3 py-1 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors ml-auto flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Apply Range
              </button>
            </div>
          )}

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold mb-1">
                <span>Total Installed in Period</span>
                <Car className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-emerald-700">
                {summary.total_installed_in_period || 0} <span className="text-xs font-normal text-slate-500">Units</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Lifetime: {summary.total_installed_all_time || 0} units
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold mb-1">
                <span>Total Dispatched Stock</span>
                <Truck className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl font-bold text-slate-900">
                {summary.total_assigned_stock || 0} <span className="text-xs font-normal text-slate-500">Units</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Across {dealers.length} Dealer Partners
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold mb-1">
                <span>Currently In Dealer Stock</span>
                <Boxes className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-xl font-bold text-amber-700">
                {summary.total_in_stock || 0} <span className="text-xs font-normal text-slate-500">Units</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Holding stock available for fitting
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold mb-1">
                <span>Period Sales Revenue</span>
                <DollarSign className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-lg font-bold text-purple-700">
                ₹{(summary.total_revenue_in_period || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                Paid: ₹{(summary.total_paid_in_period || 0).toLocaleString('en-IN')} | Due: ₹{(summary.total_pending_in_period || 0).toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>

        {/* Dealers Table Matrix */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-600" />
              <span>Calculating dealer installation metrics for {periodLabel}...</span>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-600 text-xs bg-red-50 rounded-xl border border-red-200">
              {error}
            </div>
          ) : filteredDealers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200">
              No dealer installations or stock found for the selected criteria.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider sticky top-0">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Dealer Partner</th>
                    <th className="p-3">Region / Location</th>
                    <th className="p-3 text-center">Dispatched</th>
                    <th className="p-3 text-center bg-emerald-50 text-emerald-800">Installed in Period</th>
                    <th className="p-3 text-center">Lifetime Installed</th>
                    <th className="p-3 text-center">In Dealer Stock</th>
                    <th className="p-3 text-center">Period Rate</th>
                    <th className="p-3 text-right">Period Revenue</th>
                    <th className="p-3 text-center">Collection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredDealers.map((d, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{d.dealer_name}</span>
                        </div>
                        {d.phone && d.phone !== '-' && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{d.phone}</div>
                        )}
                      </td>
                      <td className="p-3 text-slate-600">{d.region || 'Regional Hub'}</td>
                      <td className="p-3 text-center font-mono font-semibold text-slate-800">{d.total_assigned}</td>
                      <td className="p-3 text-center font-mono font-bold bg-emerald-50/70 text-emerald-700">
                        {d.installed_in_period}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600">{d.installed_all_time}</td>
                      <td className="p-3 text-center font-mono font-semibold text-amber-700">{d.in_stock}</td>
                      <td className="p-3 text-center font-mono text-[11px]">
                        <span className={`px-2 py-0.5 rounded-full font-bold ${
                          d.period_install_rate > 50 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {d.period_install_rate}%
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        ₹{(d.revenue_in_period || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-center font-mono text-[10px]">
                        <span className="text-emerald-700 font-bold">₹{(d.paid_in_period || 0).toLocaleString('en-IN')}</span>
                        {d.pending_in_period > 0 && (
                          <span className="text-amber-700 block font-semibold">Due: ₹{d.pending_in_period.toLocaleString('en-IN')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Showing {filteredDealers.length} of {dealers.length} dealers | {periodLabel}</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exporting || loading}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? 'Exporting...' : 'Export Excel'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
