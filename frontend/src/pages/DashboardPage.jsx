import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Truck,
  Wrench,
  ShieldAlert,
  Activity,
  Search,
  RefreshCw,
  ArrowUpRight,
  Edit3,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  DollarSign,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  Barcode,
  Plus,
  FileSpreadsheet,
  ChevronRight,
  Car,
  Phone,
  Building,
  Download
} from 'lucide-react';
import { fetchStats, fetchPurchaseBatches } from '../services/api';

export default function DashboardPage({ onOpenTraceDrawer, onNavigateTab }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);
  const [batchFilter, setBatchFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  const handleExportRecentActivityCsv = () => {
    if (!stats?.recentActivity || stats.recentActivity.length === 0) {
      alert('No recent operations activity to export.');
      return;
    }

    const headers = [
      'Timestamp',
      'Performed By / Team',
      'Event Type',
      'IMEI Number',
      'Device Type',
      'Vehicle Number',
      'Customer Name',
      'Customer Phone',
      'Stock Place / Holder',
      'Change Details / Diff',
      'Cost',
      'Tax',
      'Payment Status'
    ];

    const csvRows = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')];

    stats.recentActivity.forEach(act => {
      const row = [
        act.event_date || '',
        act.performed_by || 'Admin',
        act.event_type || 'STATUS_CHANGED',
        act.imei_number || '',
        act.device_type_name || '',
        act.vehicle_number || '-',
        act.customer_name || '-',
        act.customer_phone || '-',
        act.stock_place || act.to_holder || '',
        act.remarks || '',
        act.cost || '-',
        act.tax || '-',
        act.payment_status || 'PENDING'
      ];
      csvRows.push(row.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Live_Operations_Activity_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Fetch batches list once on mount
  useEffect(() => {
    fetchPurchaseBatches().then(res => {
      if (res.success) setBatches(res.data);
    }).catch(err => console.error(err));
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500 text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        Loading executive dashboard metrics...
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
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const { statusCounts, financials, typeCounts = [], dealerAllocations = [], upcomingExpiries = [], recentActivity = [], totals } = stats;

  const totalDevices = statusCounts?.TOTAL || totals?.devices || 0;
  const inWarehouse = statusCounts?.IN_WAREHOUSE || 0;
  const withDealer = statusCounts?.WITH_DEALER || 0;
  const installed = statusCounts?.INSTALLED || 0;
  const inStockCount = (inWarehouse + withDealer) || (totalDevices - installed);
  const totalCustomers = totals?.customers || 0;

  const getEventBadge = (eventType) => {
    switch (eventType) {
      case 'INSTALLED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Installed</span>;
      case 'DISPATCHED':
      case 'STOCK_TRANSFERRED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">Dispatched</span>;
      case 'STATUS_CHANGED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Status Change</span>;
      case 'RETURNED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">Returned</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">Updated</span>;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Welcome Header & Quick Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-600" /> Executive Operations Dashboard
          </h2>
          <p className="text-xs text-slate-500">
            Real-time overview of inventory stock, dealer dispatches, vehicle installations, and revenue collection.
          </p>
        </div>

        {/* Quick Manager Action Shortcuts */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigateTab('installations')}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> New Install
          </button>

          <button
            onClick={() => onNavigateTab('reports')}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" /> Export Excel
          </button>
        </div>
      </div>

      {/* 5 Core Inventory KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* 1. Total Master Stock */}
        <div
          onClick={() => onNavigateTab('inventory')}
          className="glass-panel p-4 rounded-2xl hover:border-purple-300 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Master Stock</span>
            <div className="p-1.5 rounded-xl bg-purple-50 text-purple-700 group-hover:bg-purple-700 group-hover:text-white transition-colors">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">{totalDevices}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Entire fleet stock</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-600" />
          </div>
        </div>

        {/* 2. Total In-Stock (Available / Uninstalled) */}
        <div
          onClick={() => onNavigateTab('inventory')}
          className="glass-panel p-4 rounded-2xl hover:border-emerald-300 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total In-Stock</span>
            <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-800 group-hover:bg-emerald-800 group-hover:text-white transition-colors">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">{inStockCount}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Ready for install</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
          </div>
        </div>

        {/* 3. Installed In Vehicles */}
        <div
          onClick={() => onNavigateTab('installations')}
          className="glass-panel p-4 rounded-2xl hover:border-emerald-300 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Installed In Vehicles</span>
            <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-800 group-hover:bg-emerald-800 group-hover:text-white transition-colors">
              <Car className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-850">{installed}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{totalDevices > 0 ? Math.round((installed / totalDevices) * 100) : 0}% deployed</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
          </div>
        </div>

        {/* 4. Dispatched to Dealers */}
        <div
          onClick={() => onNavigateTab('inventory')}
          className="glass-panel p-4 rounded-2xl hover:border-amber-300 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">With Dealers</span>
            <div className="p-1.5 rounded-xl bg-amber-50 text-amber-800 group-hover:bg-amber-800 group-hover:text-white transition-colors">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-900">{withDealer}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Dealer branches</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600" />
          </div>
        </div>

        {/* 5. Unassigned Ready Stock */}
        <div
          onClick={() => onNavigateTab('inventory')}
          className="glass-panel p-4 rounded-2xl hover:border-slate-300 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Unassigned Stock</span>
            <div className="p-1.5 rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-800 group-hover:text-white transition-colors">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">{inWarehouse}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Central stock</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900" />
          </div>
        </div>

      </div>

      {/* Row 2: Financials & Dealer Allocations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Revenue & Payment Status Card */}
        <div className="glass-panel p-5 rounded-2xl space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>Revenue & Payment Status</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Billed Installs</span>
          </div>

          <div className="space-y-3">
            {/* Total Installed Vehicles */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Total Installed Vehicles</div>
              <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                {((financials?.payment_received_count || 0) + (financials?.payment_pending_count || 0)) || installed} <span className="text-xs font-normal text-slate-500">Vehicles</span>
              </div>
            </div>

            {/* Collected (with ₹ Amount) vs Pending (Vehicles Count only) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-emerald-700 uppercase">Payment Received</div>
                  <div className="text-lg font-bold font-mono text-emerald-800 mt-0.5">
                    ₹{(financials?.payment_received_amount || 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-[10px] text-emerald-600 font-medium mt-1">
                  {financials?.payment_received_count || 0} vehicles paid
                </div>
              </div>

              <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-red-950 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-red-700 uppercase">Payment Pending</div>
                  <div className="text-lg font-bold font-mono text-red-800 mt-0.5">
                    {financials?.payment_pending_count || 0} <span className="text-xs font-normal">Vehicles</span>
                  </div>
                </div>
                <div className="text-[10px] text-red-600 font-medium mt-1">
                  Pending payment
                </div>
              </div>
            </div>

            {/* Collection Progress Bar */}
            <div>
              {(() => {
                const totalPaidVehicles = (financials?.payment_received_count || 0) + (financials?.payment_pending_count || 0);
                const rate = totalPaidVehicles > 0
                  ? Math.round(((financials?.payment_received_count || 0) / totalPaidVehicles) * 100)
                  : 0;
                return (
                  <>
                    <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                      <span>Collection Rate</span>
                      <span>{rate}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, rate)}%` }}
                      />
                    </div>
                  </>
                );
              })()}
            </div>

          </div>
        </div>

        {/* Dealer Stock Allocation Matrix */}
        <div className="lg:col-span-2 glass-panel p-5 rounded-2xl space-y-4 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Building className="w-4 h-4 text-indigo-600" />
              <span>Dealer & Branch Stock Allocation Matrix</span>
            </div>
            <button
              onClick={() => onNavigateTab('inventory')}
              className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              View Grid <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[260px] pr-1 space-y-2.5 flex-1">
            {dealerAllocations.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No dealer or branch stock allocations recorded yet.
              </div>
            ) : (
              dealerAllocations.map((d, i) => (
                <div
                  key={i}
                  className="p-3 bg-slate-50 hover:bg-indigo-50/50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-600" />
                      <span>{d.dealer}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-3">
                      <span>Installed: <strong className="text-emerald-700 font-mono">{d.installed}</strong></span>
                      <span>In Stock: <strong className="text-blue-700 font-mono">{d.in_stock}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <span className="font-mono font-bold text-indigo-700 text-sm">{d.total}</span>
                      <div className="text-[10px] text-slate-400">Total Units</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Row 3: Vendor Brand Share & Upcoming Expiries Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Vendor Inventory Share (Vamosys, Volty, TrackNow) */}
        <div className="glass-panel p-5 rounded-2xl space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Boxes className="w-4 h-4 text-blue-600" />
              <span>Vendor Inventory Breakdown (Vamosys / Volty / TrackNow)</span>
            </div>
          </div>

          <div className="space-y-3">
            {typeCounts.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">No vendor device models found.</div>
            ) : (
              typeCounts.map((t) => (
                <div key={t.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <span>{t.device_type}</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-normal bg-slate-200 text-slate-700">{t.category}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-900">{t.total_count} units</span>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-1.5"
                        style={{ width: `${t.total_count > 0 ? (t.installed_count / t.total_count) * 100 : 0}%` }}
                        title={`Installed: ${t.installed_count}`}
                      />
                      <div
                        className="bg-indigo-500 h-1.5"
                        style={{ width: `${t.total_count > 0 ? (t.with_dealer_count / t.total_count) * 100 : 0}%` }}
                        title={`With Dealer: ${t.with_dealer_count}`}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="text-emerald-700">● Installed: {t.installed_count}</span>
                    <span className="text-amber-800">● With Dealer: {t.with_dealer_count}</span>
                    <span className="text-slate-600">● Unassigned: {t.in_warehouse_count}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 30-Day SIM & Warranty Expiry Alert Widget */}
        <div className="glass-panel p-5 rounded-2xl space-y-4 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Upcoming 30-Day SIM & Warranty Expiries</span>
            </div>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              {upcomingExpiries.length} Renewal Alerts
            </span>
          </div>

          <div className="overflow-y-auto max-h-[280px] space-y-2.5 flex-1 pr-1">
            {upcomingExpiries.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                ✅ No vehicles expiring in the next 30 days. All warranty and SIM validities are active.
              </div>
            ) : (
              upcomingExpiries.map((exp) => {
                const isOverdue = exp.days_remaining < 0;
                const isUrgent = exp.days_remaining <= 15 && !isOverdue;

                return (
                  <div
                    key={exp.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                      isOverdue
                        ? 'bg-red-50/70 border-red-200 text-red-900'
                        : isUrgent
                        ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold flex items-center gap-1.5">
                        <Car className={`w-3.5 h-3.5 ${isOverdue ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-slate-600'}`} />
                        <span className="font-mono">{exp.vehicle_number}</span>
                        <span className="text-slate-500 font-normal">({exp.customer_name})</span>
                        <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          isOverdue
                            ? 'bg-red-100 text-red-800'
                            : isUrgent
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {isOverdue ? `Overdue (${Math.abs(exp.days_remaining)}d)` : `${exp.days_remaining} days left`}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        IMEI: <span className="font-mono">{exp.imei_number}</span> • Valid Till: <strong className="font-mono">{exp.warranty_end_date}</strong>
                      </div>
                    </div>

                    <a
                      href={`https://api.whatsapp.com/send?phone=${String(exp.customer_contact || '').replace(/[^0-9]/g, '')}&text=${encodeURIComponent(
                        `Hello ${exp.customer_name},\n\nYour GPS device subscription & certificate for vehicle *${exp.vehicle_number}* (IMEI: ${exp.imei_number}) is due for renewal on *${exp.warranty_end_date}*.\n\nPlease contact FuelTracks support to renew your SIM & certificate validity.\n\nThank you!`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Send WhatsApp renewal reminder to customer"
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 shrink-0 shadow-2xs cursor-pointer"
                    >
                      <span>💬</span> WhatsApp
                    </a>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Row 4: Live Operations Activity Stream with Full Records & CSV Export */}
      <div className="glass-panel p-5 rounded-2xl space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Activity className="w-4 h-4 text-purple-600" />
            <span>Live Operations Activity Feed</span>
            <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
              {recentActivity.length} Recent Edits
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportRecentActivityCsv}
              disabled={recentActivity.length === 0}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              title="Download all live operations activity and team edit records as Excel/CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Activity Log (Excel/CSV)</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[380px] rounded-xl border border-slate-200">
          {recentActivity.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">
              No recent activity logged yet. Operations will appear here live as teams update records.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/90 sticky top-0 z-10 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Performed By</th>
                  <th className="p-3">IMEI & Device</th>
                  <th className="p-3">Vehicle & Customer</th>
                  <th className="p-3">Change Details / Diff</th>
                  <th className="p-3 text-right">Commercials</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {recentActivity.map((act) => {
                  const isSales = /sales/i.test(act.performed_by || '');
                  const isAdmin = /admin|operations|warehouse|tech/i.test(act.performed_by || '');
                  const isOwner = /owner|super/i.test(act.performed_by || '');

                  return (
                    <tr key={act.id} className="hover:bg-slate-50 transition-colors">
                      {/* Timestamp */}
                      <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {act.event_date || 'Just now'}
                      </td>

                      {/* Performed By */}
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                          isSales
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : isAdmin
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : 'bg-purple-100 text-purple-800 border border-purple-200'
                        }`}>
                          {isSales ? '💼' : isAdmin ? '🛠️' : '👑'} {act.performed_by || 'Admin'}
                        </span>
                      </td>

                      {/* IMEI & Device */}
                      <td className="p-3 font-mono">
                        <button
                          onClick={() => onOpenTraceDrawer(act.imei_number)}
                          className="font-bold text-slate-900 hover:text-purple-700 hover:underline"
                        >
                          {act.imei_number}
                        </button>
                        <div className="text-[10px] text-slate-400">{act.device_type_name || 'GPS Tracker'}</div>
                      </td>

                      {/* Vehicle & Customer */}
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{act.vehicle_number || '-'}</div>
                        <div className="text-[11px] text-slate-500">{act.customer_name || '-'}</div>
                      </td>

                      {/* Diff Details */}
                      <td className="p-3 max-w-sm">
                        <div className="p-2 bg-slate-50 rounded-xl border border-slate-200/80 font-mono text-[11px] text-slate-700 space-y-0.5">
                          {act.remarks ? act.remarks.split('; ').map((part, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                              <span>{part}</span>
                            </div>
                          )) : (
                            <span>Record updated</span>
                          )}
                        </div>
                      </td>

                      {/* Commercials */}
                      <td className="p-3 text-right">
                        <div className="font-bold text-slate-900">
                          {act.cost && act.cost !== '-' ? `₹${act.cost}` : '-'}
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          String(act.payment_status).toUpperCase().includes('REC') || String(act.payment_status).toUpperCase().includes('PAID')
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {act.payment_status || 'PENDING'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}
