import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Wrench,
  TrendingUp,
  Award,
  Calendar,
  Search,
  RefreshCw,
  Eye,
  X,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  Car,
  Truck,
  MapPin,
  DollarSign,
  Briefcase,
  ChevronRight,
  Sparkles,
  Phone,
  Clock,
  ShieldAlert,
  ExternalLink
} from 'lucide-react';
import {
  fetchStaffPerformanceSummary,
  fetchTechnicianPerformance,
  fetchSalesPerformance,
  fetchStaffDrilldown
} from '../services/api';
import {
  exportTechnicianInstallationsToExcel,
  exportAllTechniciansSummaryToExcel
} from '../utils/excelExport';
import { useAuth } from '../context/AuthContext';

export default function StaffPerformancePage({ onOpenTraceDrawer }) {
  const { user } = useAuth();

  // Active Tab: 'technicians' | 'sales' | 'managers'
  const [activeTab, setActiveTab] = useState('technicians');

  // Technician Payout Configuration Rate (INR per fitment) - empty by default
  const [payoutRate, setPayoutRate] = useState('');

  // Date Filter State
  const [datePreset, setDatePreset] = useState('this_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Data States
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const [salesReps, setSalesReps] = useState([]);
  const [managers, setManagers] = useState([]);

  // Drilldown Modal State
  const [drilldownModalOpen, setDrilldownModalOpen] = useState(false);
  const [drilldownData, setDrilldownData] = useState(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownSearch, setDrilldownSearch] = useState('');
  const [activeDrilldownTab, setActiveDrilldownTab] = useState('installs'); // 'installs' | 'stock' | 'expenses'

  // Handle Date Presets
  const applyPreset = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];

    if (preset === 'today') {
      const d = formatDate(today);
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const d = formatDate(y);
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'this_week') {
      const curr = new Date(today);
      const first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1);
      const monday = new Date(curr.setDate(first));
      setStartDate(formatDate(monday));
      setEndDate(formatDate(today));
    } else if (preset === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(formatDate(firstDay));
      setEndDate(formatDate(today));
    } else if (preset === 'last_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      setStartDate(formatDate(firstDay));
      setEndDate(formatDate(lastDay));
    } else if (preset === 'all_time') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Initial load with 'this_month'
  useEffect(() => {
    applyPreset('this_month');
  }, []);

  // Fetch performance data whenever dates or payoutRate changes
  // Fetch performance data whenever dates or payoutRate changes
  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      params.payoutRate = (payoutRate !== '' && payoutRate !== null && !isNaN(Number(payoutRate))) ? Number(payoutRate) : 0;

      const [sumRes, techRes, salesRes] = await Promise.all([
        fetchStaffPerformanceSummary(params),
        fetchTechnicianPerformance(params),
        fetchSalesPerformance(params)
      ]);

      setSummary(sumRes.summary || null);
      setTechnicians(techRes.technicians || []);
      setSalesReps(salesRes.sales_reps || []);
      setManagers(salesRes.managers || []);
    } catch (err) {
      console.error('Failed to load staff performance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate, payoutRate]);

  // Open Drilldown Modal
  const handleOpenDrilldown = async (type, name) => {
    setDrilldownLoading(true);
    setDrilldownModalOpen(true);
    setDrilldownSearch('');
    setActiveDrilldownTab('installs');
    try {
      const effectiveRate = (payoutRate !== '' && payoutRate !== null && !isNaN(Number(payoutRate))) ? Number(payoutRate) : 0;
      const params = { type, name, payoutRate: effectiveRate };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await fetchStaffDrilldown(params);
      setDrilldownData(res);
    } catch (err) {
      console.error('Failed to fetch drilldown:', err);
    } finally {
      setDrilldownLoading(false);
    }
  };

  // Filtered Technicians
  const filteredTechnicians = useMemo(() => {
    if (!searchQuery.trim()) return technicians;
    const q = searchQuery.toLowerCase();
    return technicians.filter(t => 
      t.technician_name.toLowerCase().includes(q) ||
      t.primary_location.toLowerCase().includes(q)
    );
  }, [technicians, searchQuery]);

  // Filtered Sales Reps
  const filteredSalesReps = useMemo(() => {
    if (!searchQuery.trim()) return salesReps;
    const q = searchQuery.toLowerCase();
    return salesReps.filter(s => 
      s.sales_person.toLowerCase().includes(q) ||
      s.sales_manager.toLowerCase().includes(q)
    );
  }, [salesReps, searchQuery]);

  // Filtered Drilldown Records
  const filteredDrilldownInstallations = useMemo(() => {
    if (!drilldownData?.installations) return [];
    if (!drilldownSearch.trim()) return drilldownData.installations;
    const q = drilldownSearch.toLowerCase();
    return drilldownData.installations.filter(i => 
      (i.vehicle_number && i.vehicle_number.toLowerCase().includes(q)) ||
      (i.imei_number && i.imei_number.toLowerCase().includes(q)) ||
      (i.customer_name && i.customer_name.toLowerCase().includes(q)) ||
      (i.installation_location && i.installation_location.toLowerCase().includes(q))
    );
  }, [drilldownData, drilldownSearch]);

  // Export states
  const [exportingTechName, setExportingTechName] = useState('');
  const [exportingAllTech, setExportingAllTech] = useState(false);

  // Export a Single Technician's Complete Installations to Excel (.xlsx)
  const handleExportSingleTechnicianExcel = async (technicianName) => {
    try {
      setExportingTechName(technicianName);
      const effectiveRate = (payoutRate !== '' && payoutRate !== null && !isNaN(Number(payoutRate))) ? Number(payoutRate) : 0;
      const params = {
        type: 'technician',
        name: technicianName,
        payoutRate: effectiveRate
      };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await fetchStaffDrilldown(params);
      const dateRangeStr = startDate && endDate ? `${startDate} to ${endDate}` : 'All Time';

      await exportTechnicianInstallationsToExcel(technicianName, res.installations || [], {
        payoutRate: effectiveRate,
        dateRange: dateRangeStr,
        expenses: res.expenses || [],
        floatingStock: res.floating_stock || [],
        payoutSummary: res.payout_summary
      });
    } catch (err) {
      console.error('Failed to export technician installations:', err);
      alert('Failed to download technician Excel report: ' + err.message);
    } finally {
      setExportingTechName('');
    }
  };

  // Export Current Drilldown to Excel (.xlsx)
  const handleExportCurrentDrilldownExcel = async () => {
    if (!drilldownData) return;
    try {
      const dateRangeStr = startDate && endDate ? `${startDate} to ${endDate}` : 'All Time';
      await exportTechnicianInstallationsToExcel(drilldownData.staff_name, drilldownData.installations || [], {
        payoutRate,
        dateRange: dateRangeStr,
        expenses: drilldownData.expenses || [],
        floatingStock: drilldownData.floating_stock || [],
        payoutSummary: drilldownData.payout_summary
      });
    } catch (err) {
      console.error('Failed to export drilldown to Excel:', err);
      alert('Failed to generate Excel report: ' + err.message);
    }
  };

  // Export All Technicians Summary to Excel (.xlsx)
  const handleExportAllTechniciansExcel = async () => {
    try {
      setExportingAllTech(true);
      const dateRangeStr = startDate && endDate ? `${startDate} to ${endDate}` : 'All Time';
      await exportAllTechniciansSummaryToExcel(technicians, {
        dateRange: dateRangeStr,
        payoutRate
      });
    } catch (err) {
      console.error('Failed to export all technicians summary:', err);
      alert('Failed to generate Technicians Summary Excel: ' + err.message);
    } finally {
      setExportingAllTech(false);
    }
  };

  // Export Drilldown to CSV
  const exportDrilldownCsv = () => {
    if (!filteredDrilldownInstallations.length) return;
    const headers = ['Date', 'IMEI', 'Vehicle No', 'Vehicle Type', 'Customer Name', 'Customer Contact', 'Location', 'Sale Price', 'Installed By', 'Sales Person', 'Sales Manager', 'Remarks'];
    const rows = filteredDrilldownInstallations.map(i => [
      `"${i.installation_date || ''}"`,
      `"${i.imei_number || ''}"`,
      `"${i.vehicle_number || ''}"`,
      `"${i.vehicle_type || ''}"`,
      `"${(i.customer_name || '').replace(/"/g, '""')}"`,
      `"${i.customer_contact || ''}"`,
      `"${(i.installation_location || '').replace(/"/g, '""')}"`,
      i.sale_price || 0,
      `"${i.installed_by || ''}"`,
      `"${i.sales_person || ''}"`,
      `"${i.sales_manager || ''}"`,
      `"${(i.remarks || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${drilldownData.staff_name}_installations_${startDate || 'all'}_to_${endDate || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">

      {/* Top Header & Date Filter Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  Staff & Field Performance Hub
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                    Super Admin
                  </span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live installation counts, technician activity, and sales volume logs
                </p>
              </div>
            </div>
          </div>

          {/* Date Filter Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'this_week', label: 'This Week' },
                { id: 'this_month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
                { id: 'all_time', label: 'All Time' },
                { id: 'custom', label: 'Custom' }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    datePreset === p.id
                      ? 'bg-white text-indigo-700 font-bold shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers */}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs px-2 py-1 rounded bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs px-2 py-1 rounded bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}

            <button
              onClick={loadData}
              title="Refresh Data"
              className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Fitments */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group hover:border-indigo-300 transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Fitments Done</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {summary?.total_installations?.toLocaleString() || 0}
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Across {summary?.total_technicians || 0} technicians
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
              <Wrench className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Top Technician */}
        <div 
          onClick={() => {
            if (summary?.top_technician?.name && summary?.top_technician?.name !== 'None') {
              handleOpenDrilldown('technician', summary.top_technician.name);
            }
          }}
          className={`bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group transition ${
            summary?.top_technician?.name && summary?.top_technician?.name !== 'None'
              ? 'cursor-pointer hover:border-amber-400 hover:shadow-md'
              : ''
          }`}
          title={summary?.top_technician?.name && summary?.top_technician?.name !== 'None' ? `Click to view all installations by ${summary.top_technician.name}` : undefined}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-amber-500" /> Top Fitter / Tech
              </p>
              <h3 className="text-xl font-bold text-slate-900 mt-1 truncate max-w-[170px] group-hover:text-amber-700 transition" title={summary?.top_technician?.name || 'None'}>
                {summary?.top_technician?.name || 'None'}
              </h3>
              <p className="text-[11px] font-semibold text-amber-600 mt-1 flex items-center gap-1">
                {summary?.top_technician?.count ? `${summary.top_technician.count} installations completed` : 'No installations'}
                {summary?.top_technician?.name && summary?.top_technician?.name !== 'None' && (
                  <ExternalLink className="w-3 h-3 text-amber-500 opacity-60 group-hover:opacity-100 transition" />
                )}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center group-hover:bg-amber-100 transition">
              <Sparkles className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Top Sales Person */}
        <div 
          onClick={() => {
            if (summary?.top_sales_person?.name && summary?.top_sales_person?.name !== 'None') {
              handleOpenDrilldown('sales_person', summary.top_sales_person.name);
            }
          }}
          className={`bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group transition ${
            summary?.top_sales_person?.name && summary?.top_sales_person?.name !== 'None'
              ? 'cursor-pointer hover:border-emerald-400 hover:shadow-md'
              : ''
          }`}
          title={summary?.top_sales_person?.name && summary?.top_sales_person?.name !== 'None' ? `Click to view sales by ${summary.top_sales_person.name}` : undefined}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Top Sales Executive
              </p>
              <h3 className="text-xl font-bold text-slate-900 mt-1 truncate max-w-[170px] group-hover:text-emerald-700 transition" title={summary?.top_sales_person?.name || 'None'}>
                {summary?.top_sales_person?.name || 'None'}
              </h3>
              <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
                {summary?.top_sales_person?.count ? `${summary.top_sales_person.count} units sold` : 'No sales recorded'}
                {summary?.top_sales_person?.name && summary?.top_sales_person?.name !== 'None' && (
                  <ExternalLink className="w-3 h-3 text-emerald-500 opacity-60 group-hover:opacity-100 transition" />
                )}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 transition">
              <Briefcase className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Total Commercial Volume */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group hover:border-blue-300 transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Sales Volume</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                ₹{Number(summary?.total_revenue || 0).toLocaleString('en-IN')}
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Across {summary?.total_sales_persons || 0} sales reps
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>

      </div>

      {/* Main Content Area: Tabs & Tables */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        
        {/* Tab Navigation & Search Bar */}
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-50/50">
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('technicians')}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'technicians'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>Technicians & Fitters</span>
              <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
                activeTab === 'technicians' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {technicians.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('sales')}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'sales'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>Sales Executives & Persons</span>
              <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
                activeTab === 'sales' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {salesReps.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('managers')}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'managers'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-100'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Sales Managers Overview</span>
              <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
                activeTab === 'managers' ? 'bg-purple-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {managers.length}
              </span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab === 'technicians' ? 'technician or area' : 'sales person or manager'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

        </div>

        {/* Tab 1: Technicians Table */}
        {activeTab === 'technicians' && (
          <div>
            {/* Technician Payout Incentive Controls Bar */}
            <div className="p-3.5 bg-indigo-50/60 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-indigo-600" />
                  Fitment Incentive Rate:
                </span>
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-indigo-200 shadow-2xs">
                  <span className="text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    placeholder="0"
                    value={payoutRate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPayoutRate(v === '' ? '' : Math.max(0, parseInt(v) || 0));
                    }}
                    className="w-16 font-bold text-indigo-900 focus:outline-none placeholder:text-slate-300"
                  />
                  <span className="text-[10px] text-slate-400 font-medium">/ install</span>
                </div>
                <span className="text-[11px] text-indigo-700 hidden sm:inline">
                  (Optional: Enter rate to calculate gross fitment earnings)
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportAllTechniciansExcel}
                  disabled={exportingAllTech || filteredTechnicians.length === 0}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs transition shadow-2xs disabled:opacity-50 cursor-pointer"
                  title="Download complete performance summary & leaderboard of all technicians as Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>{exportingAllTech ? 'Generating Excel...' : 'Export All Technicians Excel'}</span>
                </button>
                <div className="text-[11px] text-slate-600 hidden md:block">
                  Total Techs: <strong className="text-slate-900">{filteredTechnicians.length}</strong>
                </div>
                <div className="text-[11px] text-indigo-900 font-bold bg-indigo-100/80 px-2.5 py-1 rounded-lg">
                  Net Payable: ₹{filteredTechnicians.reduce((sum, t) => sum + (t.net_payout_due || 0), 0).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4 w-12 text-center">#</th>
                    <th className="py-3.5 px-4">Technician / Fitter</th>
                    <th className="py-3.5 px-4 text-center">Fitments Done</th>
                    <th className="py-3.5 px-4 text-right">Fitment Payout</th>
                    <th className="py-3.5 px-4 text-right">Travel / Fuel</th>
                    <th className="py-3.5 px-4 text-right">Net Due</th>
                    <th className="py-3.5 px-4 text-center">Stock In-Hand</th>
                    <th className="py-3.5 px-4">Primary Location</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTechnicians.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400">
                        <Wrench className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                        No technician installations found for this period.
                      </td>
                    </tr>
                  ) : (
                    filteredTechnicians.map((tech, idx) => (
                      <tr key={tech.technician_name} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 text-center font-bold text-slate-400">
                          {idx === 0 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-bold text-xs">
                              🥇
                            </span>
                          ) : idx === 1 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-xs">
                              🥈
                            </span>
                          ) : idx === 2 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-800 font-bold text-xs">
                              🥉
                            </span>
                          ) : (
                            idx + 1
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          <button
                            type="button"
                            onClick={() => handleOpenDrilldown('technician', tech.technician_name)}
                            className="flex items-center space-x-2.5 text-left group cursor-pointer hover:opacity-95 transition focus:outline-none"
                            title={`Click to view all installations by ${tech.technician_name}`}
                          >
                            <div className="w-8 h-8 rounded-full bg-indigo-100 group-hover:bg-indigo-600 text-indigo-700 group-hover:text-white font-bold text-xs flex items-center justify-center transition-colors shrink-0">
                              {tech.technician_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 group-hover:text-indigo-600 group-hover:underline transition-colors flex items-center gap-1">
                                <span>{tech.technician_name}</span>
                                <ExternalLink className="w-3 h-3 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </p>
                              <p className="text-[10px] text-slate-400 font-normal">
                                {tech.unique_customers || 1} clients • {tech.first_install_date ? `${tech.first_install_date} to ${tech.last_install_date}` : 'Active'}
                              </p>
                            </div>
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenDrilldown('technician', tech.technician_name)}
                            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 border border-indigo-200 transition cursor-pointer"
                            title={`View all ${tech.total_installations} installations`}
                          >
                            {tech.total_installations} fitments
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                          ₹{Number(tech.fitment_payout !== undefined ? tech.fitment_payout : (tech.total_installations * (parseFloat(payoutRate) || 0))).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3.5 px-4 text-right text-slate-600">
                          {tech.travel_expenses ? `₹${Number(tech.travel_expenses).toLocaleString('en-IN')}` : '₹0'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-mono font-bold text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ₹{Number(tech.net_payout_due !== undefined ? tech.net_payout_due : ((tech.total_installations * (parseFloat(payoutRate) || 0)) + (tech.travel_expenses || 0) - (tech.payouts_settled || 0))).toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            tech.floating_stock_count > 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {tech.floating_stock_count || 0} in-hand
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {tech.primary_location}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => handleExportSingleTechnicianExcel(tech.technician_name)}
                              disabled={exportingTechName === tech.technician_name}
                              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold text-xs transition cursor-pointer shadow-2xs disabled:opacity-50"
                              title={`Download complete Excel sheet (.xlsx) of all ${tech.total_installations} installations done by ${tech.technician_name}`}
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="hidden sm:inline">
                                {exportingTechName === tech.technician_name ? 'Exporting...' : 'Export Excel'}
                              </span>
                            </button>
                            <button
                              onClick={() => handleOpenDrilldown('technician', tech.technician_name)}
                              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition cursor-pointer shadow-2xs"
                              title={`View all ${tech.total_installations} installations by ${tech.technician_name}`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Fitments</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Sales Team Table */}
        {activeTab === 'sales' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4 w-12 text-center">#</th>
                  <th className="py-3.5 px-4">Sales Executive</th>
                  <th className="py-3.5 px-4">Reporting Sales Manager</th>
                  <th className="py-3.5 px-4 text-center">Units Sold</th>
                  <th className="py-3.5 px-4 text-right">Total Revenue</th>
                  <th className="py-3.5 px-4">Activity Range</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSalesReps.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-slate-400">
                      <Briefcase className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      No sales records found for this period.
                    </td>
                  </tr>
                ) : (
                  filteredSalesReps.map((rep, idx) => (
                    <tr key={`${rep.sales_person}_${rep.sales_manager}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-center font-bold text-slate-400">
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <button
                          type="button"
                          onClick={() => handleOpenDrilldown('sales_person', rep.sales_person)}
                          className="flex items-center space-x-2.5 text-left group cursor-pointer hover:opacity-95 transition focus:outline-none"
                          title={`Click to view sales portfolio for ${rep.sales_person}`}
                        >
                          <div className="w-8 h-8 rounded-full bg-emerald-100 group-hover:bg-emerald-600 text-emerald-700 group-hover:text-white font-bold text-xs flex items-center justify-center transition-colors shrink-0">
                            {rep.sales_person.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 group-hover:text-emerald-700 group-hover:underline transition-colors flex items-center gap-1">
                              <span>{rep.sales_person}</span>
                              <ExternalLink className="w-3 h-3 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </p>
                            <p className="text-[10px] text-slate-400 font-normal">{rep.unique_customers} distinct clients</p>
                          </div>
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100">
                          {rep.sales_manager}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenDrilldown('sales_person', rep.sales_person)}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 border border-emerald-200 transition cursor-pointer"
                          title={`View all ${rep.total_sales} sales records`}
                        >
                          {rep.total_sales} units
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        ₹{Number(rep.total_revenue || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {rep.first_sale_date ? `${rep.first_sale_date} to ${rep.last_sale_date}` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenDrilldown('sales_person', rep.sales_person)}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-xs transition cursor-pointer shadow-2xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Sales</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Sales Managers Overview */}
        {activeTab === 'managers' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4 w-12 text-center">#</th>
                  <th className="py-3.5 px-4">Sales Manager</th>
                  <th className="py-3.5 px-4">Team Members</th>
                  <th className="py-3.5 px-4 text-center">Total Team Units</th>
                  <th className="py-3.5 px-4 text-right">Total Team Revenue</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {managers.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-400">
                      <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      No sales manager groups found.
                    </td>
                  </tr>
                ) : (
                  managers.map((mgr, idx) => (
                    <tr key={mgr.manager_name} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <button
                          type="button"
                          onClick={() => handleOpenDrilldown('sales_manager', mgr.manager_name)}
                          className="flex items-center space-x-2.5 text-left group cursor-pointer hover:opacity-95 transition focus:outline-none"
                          title={`Click to view team installations for ${mgr.manager_name}`}
                        >
                          <div className="w-8 h-8 rounded-full bg-purple-100 group-hover:bg-purple-600 text-purple-700 group-hover:text-white font-bold text-xs flex items-center justify-center transition-colors shrink-0">
                            {mgr.manager_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 group-hover:text-purple-700 group-hover:underline transition-colors flex items-center gap-1">
                              <span>{mgr.manager_name}</span>
                              <ExternalLink className="w-3 h-3 text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </p>
                            <p className="text-[10px] text-slate-400 font-normal">{mgr.team_members_count} team members</p>
                          </div>
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-sm">
                          {mgr.members.map(m => (
                            <span key={m} className="px-2 py-0.5 rounded-md text-[10px] bg-slate-100 text-slate-700">
                              {m}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          {mgr.total_team_sales} units
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        ₹{Number(mgr.total_team_revenue || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenDrilldown('sales_manager', mgr.manager_name)}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold text-xs transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Team Jobs</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Drill-down Detail Modal */}
      {drilldownModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  {drilldownData?.staff_type === 'technician' ? <Wrench className="w-5 h-5" /> : <Briefcase className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Job Log: {drilldownData?.staff_name || 'Loading...'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {drilldownData?.staff_type === 'technician' ? 'Technician Fitments History' : 'Sales Person Portfolio'} 
                    {startDate && endDate ? ` (${startDate} to ${endDate})` : ' (All Time)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleExportCurrentDrilldownExcel}
                  disabled={!filteredDrilldownInstallations.length}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50 cursor-pointer"
                  title={`Download complete Excel sheet (.xlsx) of all ${filteredDrilldownInstallations.length} installations done by ${drilldownData?.staff_name}`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Download Excel ({filteredDrilldownInstallations.length})</span>
                </button>

                <button
                  onClick={exportDrilldownCsv}
                  disabled={!filteredDrilldownInstallations.length}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm transition disabled:opacity-50 cursor-pointer"
                  title="Export records to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>CSV</span>
                </button>

                <button
                  onClick={() => {
                    setDrilldownModalOpen(false);
                    setDrilldownData(null);
                  }}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Subheader & Sub-tabs */}
            <div className="px-6 py-3 border-b border-slate-100 bg-white flex flex-col gap-3">
              {drilldownData?.staff_type === 'technician' && drilldownData?.payout_summary && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Fitments Completed</span>
                    <span className="text-base font-black text-indigo-900">{drilldownData.payout_summary.total_installations}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Gross Fitment Payout</span>
                    <span className="text-base font-bold text-slate-900">₹{Number(drilldownData.payout_summary.fitment_payout).toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Travel / Fuel Claimed</span>
                    <span className="text-base font-bold text-slate-900">₹{Number(drilldownData.payout_summary.travel_expenses).toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Settled Advances</span>
                    <span className="text-base font-bold text-rose-600">₹{Number(drilldownData.payout_summary.payouts_settled).toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block">Net Balance Payable</span>
                    <span className="text-base font-black text-emerald-700">₹{Number(drilldownData.payout_summary.net_payout_due).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                {drilldownData?.staff_type === 'technician' ? (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setActiveDrilldownTab('installs')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        activeDrilldownTab === 'installs'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      🚗 Completed Fitments ({drilldownData?.installations?.length || 0})
                    </button>
                    <button
                      onClick={() => setActiveDrilldownTab('stock')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        activeDrilldownTab === 'stock'
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      📦 In-Hand Stock ({drilldownData?.floating_stock?.length || 0})
                    </button>
                    <button
                      onClick={() => setActiveDrilldownTab('expenses')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        activeDrilldownTab === 'expenses'
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      💸 Expenses & Advances ({drilldownData?.expenses?.length || 0})
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-semibold text-slate-700">
                      Total Records: <strong className="text-indigo-600">{filteredDrilldownInstallations.length}</strong>
                    </span>
                  </div>
                )}

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter by vehicle, customer, or IMEI..."
                    value={drilldownSearch}
                    onChange={(e) => setDrilldownSearch(e.target.value)}
                    className="w-full text-xs pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="p-6 overflow-y-auto flex-1">
              {drilldownLoading ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
                  <p className="text-xs">Loading detailed records...</p>
                </div>
              ) : activeDrilldownTab === 'stock' ? (
                /* Tab: Stock In-Hand */
                !drilldownData?.floating_stock?.length ? (
                  <div className="py-16 text-center text-slate-400">
                    <p className="text-xs">No devices currently in-hand with technician.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-amber-50/80 text-amber-900 font-bold uppercase tracking-wider text-[10px] border-b border-amber-200">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">IMEI Number</th>
                          <th className="py-2.5 px-3">SIM Number</th>
                          <th className="py-2.5 px-3">Current Status</th>
                          <th className="py-2.5 px-3">Holder / Custody</th>
                          <th className="py-2.5 px-3">Last Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {drilldownData.floating_stock.map((d, i) => (
                          <tr key={d.id || i} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 text-slate-400">{i + 1}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-600">
                              <button
                                onClick={() => { if (onOpenTraceDrawer) onOpenTraceDrawer(d.imei_number); }}
                                className="hover:underline"
                              >
                                {d.imei_number}
                              </button>
                            </td>
                            <td className="py-2.5 px-3 font-mono">{d.sim_number || '—'}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                {d.current_status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-800">{d.current_holder_name || drilldownData.staff_name}</td>
                            <td className="py-2.5 px-3 text-slate-400">{d.updated_at ? String(d.updated_at).split(' ')[0] : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : activeDrilldownTab === 'expenses' ? (
                /* Tab: Expenses & Advances */
                !drilldownData?.expenses?.length ? (
                  <div className="py-16 text-center text-slate-400">
                    <p className="text-xs">No expense or advance claims logged for this technician.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-purple-50/80 text-purple-900 font-bold uppercase tracking-wider text-[10px] border-b border-purple-200">
                        <tr>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3 text-right">Amount</th>
                          <th className="py-2.5 px-3">Payment Mode</th>
                          <th className="py-2.5 px-3">Paid To / Incurred By</th>
                          <th className="py-2.5 px-3">UTR / Ref</th>
                          <th className="py-2.5 px-3">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {drilldownData.expenses.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-mono text-slate-500">{e.expense_date}</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                e.category === 'TECHNICIAN_TRAVEL' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {e.category}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                              ₹{Number(e.amount || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="py-2.5 px-3 font-semibold">{e.payment_mode}</td>
                            <td className="py-2.5 px-3 text-slate-700">{e.incurred_by || e.paid_to}</td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">{e.utr_number || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-500">{e.remarks || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : filteredDrilldownInstallations.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <p className="text-xs">No installation logs found matching criteria.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Vehicle Number</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">IMEI Number</th>
                        <th className="py-2.5 px-3">Customer</th>
                        <th className="py-2.5 px-3">Location</th>
                        <th className="py-2.5 px-3">Installed By</th>
                        <th className="py-2.5 px-3">Sales Rep</th>
                        <th className="py-2.5 px-3 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDrilldownInstallations.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-slate-500 whitespace-nowrap">
                            {item.installation_date || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {item.vehicle_number}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {item.vehicle_type || 'Vehicle'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">
                            <button
                              onClick={() => {
                                if (onOpenTraceDrawer) onOpenTraceDrawer(item.imei_number);
                              }}
                              className="text-indigo-600 hover:underline font-bold"
                              title="Trace Device Lifecycle"
                            >
                              {item.imei_number}
                            </button>
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="font-semibold text-slate-800">{item.customer_name}</p>
                            <p className="text-[10px] text-slate-400">{item.customer_contact}</p>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {item.installation_location || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 font-medium">
                            {item.installed_by || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {item.sales_person || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {item.sale_price ? `₹${Number(item.sale_price).toLocaleString('en-IN')}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => {
                  setDrilldownModalOpen(false);
                  setDrilldownData(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 font-semibold text-xs transition"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
