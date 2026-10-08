import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Download,
  Car,
  HardHat,
  ShieldCheck,
  Truck,
  DollarSign,
  Copy,
  Clock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sliders,
  Send,
  CreditCard,
  QrCode,
  Wrench,
  Layers,
  ArrowUpRight,
  Trash2,
  AlertTriangle,
  CheckSquare,
  Square,
  X,
  ShieldAlert,
  Check
} from 'lucide-react';
import {
  fetchDailyInstallationLog,
  deleteInstallationsByDate,
  clearAllInstallations,
  deleteInstallation,
  bulkDeleteInstallations
} from '../services/api';
import { exportInstallationsToExcel } from '../utils/excelExport';
import DailyInstallationUploadModal from '../components/DailyInstallationUploadModal';
import PaymentQrModal from '../components/PaymentQrModal';
import { buildCustomerCredentialsWhatsAppMessage, buildPaymentQrWhatsAppMessage } from '../utils/whatsapp';

export default function DailyReportsPage({ onOpenTraceDrawer }) {
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);
  const [dateMode, setDateMode] = useState('TODAY'); // 'TODAY' | 'YESTERDAY' | 'SINGLE_DATE' | 'CUSTOM_RANGE'
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [availableDates, setAvailableDates] = useState([]);
  const [dateSummary, setDateSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL'); // ALL, RECEIVED, PENDING
  const [exporting, setExporting] = useState(false);

  // Selection state for multi-delete
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Delete modal states
  const [showDeleteDateModal, setShowDeleteDateModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [deletingItem, setDeletingItem] = useState(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Payment QR modal state
  const [paymentQrData, setPaymentQrData] = useState(null);
  const [isPaymentQrOpen, setIsPaymentQrOpen] = useState(false);

  useEffect(() => {
    if (dateMode === 'CUSTOM_RANGE') {
      loadDailyLog({ startDate, endDate });
    } else {
      loadDailyLog({ date: selectedDate });
    }
    setSelectedIds(new Set());
  }, [dateMode, selectedDate, startDate, endDate]);

  const loadDailyLog = async (params = {}) => {
    setLoading(true);
    try {
      let queryParams = {};
      if (params.startDate && params.endDate) {
        queryParams = { startDate: params.startDate, endDate: params.endDate };
      } else if (params.date) {
        queryParams = { date: params.date };
      } else if (dateMode === 'CUSTOM_RANGE') {
        queryParams = { startDate, endDate };
      } else {
        queryParams = { date: selectedDate };
      }
      const res = await fetchDailyInstallationLog(queryParams);
      if (res.success) {
        setAvailableDates(res.available_dates || []);
        setDateSummary(res.date_summary || null);
        setRecords(res.records || []);
      }
    } catch (err) {
      console.error('Failed to load daily log:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filtered Records for Selected Date
  const filteredRecords = useMemo(() => {
    return records.filter(item => {
      // Category filter
      if (categoryFilter !== 'ALL') {
        const cat = (item.category || item.vehicle_type || '').toUpperCase();
        if (!cat.includes(categoryFilter)) return false;
      }

      // Payment filter
      if (paymentFilter !== 'ALL') {
        const payStatus = (item.payment_status || 'RECEIVED').toUpperCase();
        const isPaid = payStatus.includes('REC') || payStatus.includes('PAID');
        if (paymentFilter === 'RECEIVED' && !isPaid) return false;
        if (paymentFilter === 'PENDING' && isPaid) return false;
      }

      // Search filter
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const vNum = (item.vehicle_number || '').toLowerCase();
        const imei = (item.imei_number || '').toLowerCase();
        const cName = (item.customer_name || '').toLowerCase();
        const phone = (item.customer_contact || '').toLowerCase();
        const tech = (item.installed_by || '').toLowerCase();
        const loc = (item.installation_location || '').toLowerCase();
        return vNum.includes(q) || imei.includes(q) || cName.includes(q) || phone.includes(q) || tech.includes(q) || loc.includes(q);
      }

      return true;
    });
  }, [records, categoryFilter, paymentFilter, search]);

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length && filteredRecords.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map(r => r.id).filter(Boolean)));
    }
  };

  const handleToggleSelectRow = (id) => {
    if (!id) return;
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // 1. Delete Particular Date
  const handleDeleteDateConfirm = async () => {
    setActionLoading(true);
    try {
      const res = await deleteInstallationsByDate(selectedDate);
      setShowDeleteDateModal(false);
      setSelectedIds(new Set());
      setStatusMessage({ type: 'success', text: res.message || `Deleted records for ${selectedDate}` });
      await loadDailyLog(selectedDate);
    } catch (err) {
      alert('Failed to delete date records: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Delete All Records Across All Dates
  const handleDeleteAllConfirm = async () => {
    if (confirmDeleteText.trim().toUpperCase() !== 'DELETE') {
      alert('Please type DELETE in capital letters to confirm.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await clearAllInstallations();
      setShowDeleteAllModal(false);
      setConfirmDeleteText('');
      setSelectedIds(new Set());
      setStatusMessage({ type: 'success', text: res.message || 'All daily installation records cleared successfully.' });
      await loadDailyLog(todayStr);
    } catch (err) {
      alert('Failed to clear all reports: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Delete Single Record
  const handleDeleteSingleConfirm = async () => {
    if (!deletingItem) return;
    setActionLoading(true);
    try {
      await deleteInstallation(deletingItem.id);
      setDeletingItem(null);
      const nextSelected = new Set(selectedIds);
      nextSelected.delete(deletingItem.id);
      setSelectedIds(nextSelected);
      setStatusMessage({ type: 'success', text: `Deleted installation for vehicle ${deletingItem.vehicle_number || deletingItem.imei_number}` });
      await loadDailyLog(selectedDate);
    } catch (err) {
      alert('Failed to delete installation: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Bulk Delete Selected Rows
  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setActionLoading(true);
    try {
      const res = await bulkDeleteInstallations({ ids });
      setShowBulkDeleteModal(false);
      setSelectedIds(new Set());
      setStatusMessage({ type: 'success', text: res.message || `Deleted ${ids.length} selected installations` });
      await loadDailyLog(selectedDate);
    } catch (err) {
      alert('Failed to delete selected records: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Export Selected Date Excel
  const handleExportDateExcel = async () => {
    try {
      setExporting(true);
      const displayDate = dateSummary?.display_date || selectedDate;
      const filename = `Installation_Report_${displayDate.replace(/[^0-9-]/g, '_')}`;
      const sheetName = `${displayDate} Report`;
      await exportInstallationsToExcel(filename, sheetName, filteredRecords, categoryFilter);
    } catch (err) {
      alert('Failed to export Excel: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard!`);
  };

  return (
    <div className="space-y-5">
      {/* Toast Notification Banner */}
      {statusMessage && (
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold animate-fadeIn ${statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
          }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="p-1 hover:bg-black/5 rounded cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header & Main Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" /> Daily Installation Reports & Upload Log
          </h1>
          <p className="text-xs text-slate-500">
            Day-wise ledger of GPS installations, stock entries, and upload analytics
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export Excel Button */}
          <button
            onClick={handleExportDateExcel}
            disabled={exporting || filteredRecords.length === 0}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Download Excel sheet for selected date"
          >
            {exporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
            <span>📥 Export Date Excel ({filteredRecords.length})</span>
          </button>

          {/* Upload Button */}
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>📊 Upload Daily Report (Excel)</span>
          </button>

          {/* Delete Particular Date Button */}
          <button
            onClick={() => setShowDeleteDateModal(true)}
            disabled={records.length === 0}
            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title={`Delete all records for date ${dateSummary?.display_date || selectedDate}`}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Delete Date ({records.length})</span>
          </button>
        </div>
      </div>

      {/* Date Navigation & Selector Ribbon */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Quick Date Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" /> Select Date:
          </span>

          <button
            type="button"
            onClick={() => {
              setDateMode('TODAY');
              setSelectedDate(todayStr);
              setStartDate(todayStr);
              setEndDate(todayStr);
            }}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${dateMode === 'TODAY' || (selectedDate === todayStr && dateMode !== 'CUSTOM_RANGE')
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Today</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDateMode('YESTERDAY');
              setSelectedDate(yesterdayStr);
              setStartDate(yesterdayStr);
              setEndDate(yesterdayStr);
            }}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${dateMode === 'YESTERDAY' || (selectedDate === yesterdayStr && dateMode !== 'CUSTOM_RANGE')
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Yesterday</span>
          </button>

          <button
            type="button"
            onClick={() => setDateMode('CUSTOM_RANGE')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${dateMode === 'CUSTOM_RANGE'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Custom Date Range</span>
          </button>
        </div>

        {/* Date Inputs & Refresh Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {dateMode === 'CUSTOM_RANGE' ? (
            <div className="flex items-center gap-2 bg-slate-50 p-1.5 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold px-1">
                <span className="text-[11px] text-slate-400 uppercase">From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-emerald-500 cursor-pointer font-mono shadow-2xs"
                />
              </div>

              <span className="text-slate-400 font-bold text-xs">→</span>

              <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold px-1">
                <span className="text-[11px] text-slate-400 uppercase">To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-emerald-500 cursor-pointer font-mono shadow-2xs"
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setStartDate(e.target.value);
                  setEndDate(e.target.value);
                  if (e.target.value !== todayStr) {
                    setDateMode('SINGLE_DATE');
                  }
                }}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-emerald-500 cursor-pointer font-mono shadow-2xs"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (dateMode === 'CUSTOM_RANGE') {
                loadDailyLog({ startDate, endDate });
              } else {
                loadDailyLog({ date: selectedDate });
              }
            }}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors cursor-pointer"
            title="Refresh records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Selected Date Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Installed on Date */}
        <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-900 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Installed</span>
            <Car className="w-4 h-4 text-slate-300" />
          </div>
          <div className="text-3xl font-black font-mono mt-1">{dateSummary?.total_count || 0}</div>
          <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
            On {dateSummary?.display_date || selectedDate}
          </div>
        </div>

        {/* TG MINING */}
        <div
          onClick={() => setCategoryFilter(categoryFilter === 'TG MINING' ? 'ALL' : 'TG MINING')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${categoryFilter === 'TG MINING'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-400'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-2xs'
            }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider">TG Mining</span>
            <HardHat className={`w-4 h-4 ${categoryFilter === 'TG MINING' ? 'text-amber-200' : 'text-amber-600'}`} />
          </div>
          <div className="text-2xl font-black font-mono mt-1">{dateSummary?.categories?.['TG MINING'] || 0}</div>
          <div className="text-[10px] opacity-75 mt-0.5">Telangana Mining</div>
        </div>

        {/* AP MINING */}
        <div
          onClick={() => setCategoryFilter(categoryFilter === 'AP MINING' ? 'ALL' : 'AP MINING')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${categoryFilter === 'AP MINING'
              ? 'bg-purple-600 text-white border-purple-600 shadow-sm ring-2 ring-purple-400'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-2xs'
            }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider">AP Mining</span>
            <HardHat className={`w-4 h-4 ${categoryFilter === 'AP MINING' ? 'text-purple-200' : 'text-purple-600'}`} />
          </div>
          <div className="text-2xl font-black font-mono mt-1">{dateSummary?.categories?.['AP MINING'] || 0}</div>
          <div className="text-[10px] opacity-75 mt-0.5">Andhra Mining</div>
        </div>

        {/* VLTD */}
        <div
          onClick={() => setCategoryFilter(categoryFilter === 'VLTD' ? 'ALL' : 'VLTD')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${categoryFilter === 'VLTD'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-400'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-2xs'
            }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider">VLTD / AIS-140</span>
            <ShieldCheck className={`w-4 h-4 ${categoryFilter === 'VLTD' ? 'text-blue-200' : 'text-blue-600'}`} />
          </div>
          <div className="text-2xl font-black font-mono mt-1">{dateSummary?.categories?.['VLTD'] || 0}</div>
          <div className="text-[10px] opacity-75 mt-0.5">Govt Deployments</div>
        </div>

        {/* General / Other */}
        <div
          onClick={() => setCategoryFilter(categoryFilter === 'GENERAL' ? 'ALL' : 'GENERAL')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${categoryFilter === 'GENERAL'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-400'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-2xs'
            }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider">General</span>
            <Truck className={`w-4 h-4 ${categoryFilter === 'GENERAL' ? 'text-emerald-200' : 'text-emerald-600'}`} />
          </div>
          <div className="text-2xl font-black font-mono mt-1">{dateSummary?.categories?.['GENERAL'] || 0}</div>
          <div className="text-[10px] opacity-75 mt-0.5">Commercial & Fleet</div>
        </div>
      </div>

      {/* Filter Toolbar & Search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Category & Payment Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            {['ALL', 'TG MINING', 'AP MINING', 'VLTD', 'GENERAL'].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${categoryFilter === cat
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                {cat === 'ALL' ? 'All' : cat}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'ALL', label: 'All Status' },
              { id: 'RECEIVED', label: 'Paid' },
              { id: 'PENDING', label: 'Pending' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPaymentFilter(p.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${paymentFilter === p.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Field */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search Vehicle, IMEI, Customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 font-mono"
          />
        </div>
      </div>

      {/* Multi-Select Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span className="text-xs font-bold text-amber-900">
              {selectedIds.size} {selectedIds.size === 1 ? 'record' : 'records'} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
            >
              Deselect All
            </button>
            <button
              onClick={() => setShowBulkDeleteModal(true)}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Installations Table for Selected Date */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-16 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
            <span>Loading records for {dateSummary?.display_date || selectedDate}...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="inline-flex p-3 bg-slate-100 text-slate-400 rounded-2xl">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">
              No installation records found for {dateSummary?.display_date || selectedDate}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              You can upload your Excel report for this date using the button below.
            </p>
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" /> Upload Report Now
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredRecords.length > 0 && selectedIds.size === filteredRecords.length}
                      onChange={handleToggleSelectAll}
                      className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      title="Select all"
                    />
                  </th>
                  <th className="py-3 px-3 w-10 text-center">#</th>
                  <th className="py-3 px-3.5">Category</th>
                  <th className="py-3 px-3.5 font-mono">Vehicle Number</th>
                  <th className="py-3 px-3.5 font-mono">Device IMEI</th>
                  <th className="py-3 px-3.5">Customer & Phone</th>
                  <th className="py-3 px-3.5 bg-indigo-50/40 text-indigo-900 border-l border-r border-indigo-100">
                    GPS Login Credentials
                  </th>
                  <th className="py-3 px-3.5">Technician / City</th>
                  <th className="py-3 px-3.5">Payment</th>
                  <th className="py-3 px-3.5 text-right sticky right-0 bg-slate-50 border-l border-slate-200">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((inst, idx) => {
                  const payStatus = (inst.payment_status || 'RECEIVED').toUpperCase();
                  const isPaid = payStatus.includes('REC') || payStatus.includes('PAID');
                  const cat = (inst.category || 'VLTD').toUpperCase();
                  const isSelected = selectedIds.has(inst.id);

                  let badgeClass = 'bg-blue-100 text-blue-800 border-blue-200';
                  if (cat.includes('TG MINING')) badgeClass = 'bg-amber-100 text-amber-900 border-amber-300';
                  else if (cat.includes('AP MINING')) badgeClass = 'bg-purple-100 text-purple-900 border-purple-300';
                  else if (cat.includes('GENERAL')) badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';

                  return (
                    <tr
                      key={inst.id || idx}
                      className={`transition-colors ${isSelected ? 'bg-amber-50/60' : 'hover:bg-slate-50'}`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(inst.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>

                      {/* Index */}
                      <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${badgeClass}`}>
                          {cat}
                        </span>
                      </td>

                      {/* Vehicle Number */}
                      <td className="py-3 px-3.5 font-mono text-amber-700 font-bold">
                        <div className="flex items-center gap-1.5">
                          <Car className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{inst.vehicle_number}</span>
                        </div>
                      </td>

                      {/* Device IMEI */}
                      <td className="py-3 px-3.5 font-mono text-blue-600 font-bold">
                        <button
                          onClick={() => onOpenTraceDrawer && onOpenTraceDrawer(inst.imei_number)}
                          className="hover:underline font-bold"
                          title="Click to view lifecycle trace"
                        >
                          {inst.imei_number}
                        </button>
                      </td>

                      {/* Customer Info */}
                      <td className="py-3 px-3.5">
                        {inst.customer_name && inst.customer_name !== 'Customer' ? (
                          <div className="font-bold text-slate-900">{inst.customer_name}</div>
                        ) : null}
                        {inst.customer_contact && inst.customer_contact !== '9999999999' ? (
                          <div className="text-[11px] font-mono text-slate-500">{inst.customer_contact}</div>
                        ) : null}
                        {(!inst.customer_name || inst.customer_name === 'Customer') &&
                          (!inst.customer_contact || inst.customer_contact === '9999999999') && (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                      </td>

                      {/* Software Credentials */}
                      <td className="py-3 px-3.5 bg-indigo-50/20 border-l border-r border-indigo-100/60 font-mono">
                        {inst.software_user_id ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 text-indigo-900 font-bold text-[11px]">
                              <span>ID: {inst.software_user_id}</span>
                              <button
                                onClick={() => copyToClipboard(inst.software_user_id, 'User ID')}
                                className="p-0.5 hover:bg-indigo-100 rounded text-indigo-600 cursor-pointer"
                                title="Copy User ID"
                              >
                                <Copy className="w-2.5 h-2.5" />
                              </button>
                            </div>
                            {inst.software_password && inst.software_password !== '123456' && (
                              <div className="text-[10px] text-indigo-700">
                                Pass: <span className="bg-indigo-100/80 px-1 py-0.2 rounded font-semibold">{inst.software_password}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">- Not Set -</span>
                        )}
                      </td>

                      {/* Technician & Location */}
                      <td className="py-3 px-3.5 text-slate-600">
                        {inst.installed_by && inst.installed_by !== 'Technician' ? (
                          <div className="font-semibold text-slate-800">{inst.installed_by}</div>
                        ) : null}
                        {inst.installation_location && inst.installation_location !== 'Field Site' && inst.installation_location !== 'Vijayawada' ? (
                          <div className="text-[10px] text-slate-400">{inst.installation_location}</div>
                        ) : null}
                        {(!inst.installed_by || inst.installed_by === 'Technician') &&
                          (!inst.installation_location || inst.installation_location === 'Field Site' || inst.installation_location === 'Vijayawada') && (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                      </td>

                      {/* Payment Status */}
                      <td className="py-3 px-3.5">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                            <AlertCircle className="w-3 h-3 text-red-600" /> Pending
                          </span>
                        )}
                      </td>

                      {/* Customer Actions & Delete */}
                      <td className="py-3 px-3.5 text-right sticky right-0 bg-white border-l border-slate-100">
                        <div className="flex items-center justify-end gap-1.5">
                          {inst.customer_contact && inst.customer_contact !== '9999999999' && (
                            <a
                              href={buildPaymentQrWhatsAppMessage(inst.customer_contact, {
                                customer_name: inst.customer_name,
                                vehicle_number: inst.vehicle_number,
                                imei_number: inst.imei_number,
                                amount: inst.sale_price || 0
                              })}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                            >
                              <Send className="w-3 h-3" />
                              <span>WhatsApp</span>
                            </a>
                          )}
                          <button
                            onClick={() => {
                              setPaymentQrData(inst);
                              setIsPaymentQrOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Open UPI Payment QR"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingItem(inst)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title={`Delete record for ${inst.vehicle_number || inst.imei_number}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Delete Particular Date Confirmation */}
      {showDeleteDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Date Records</h3>
                <p className="text-xs text-slate-500">Date: {dateSummary?.display_date || selectedDate}</p>
              </div>
            </div>

            <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-xl space-y-2 text-xs text-rose-950">
              <p className="font-semibold">
                Are you sure you want to delete all <span className="underline font-black">{records.length} records</span> on {dateSummary?.display_date || selectedDate}?
              </p>
              <p className="text-[11px] text-rose-800/80 leading-relaxed">
                This will remove the installation reports for this date. Linked direct entry devices will be cleared and warehouse stock will be reverted.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteDateModal(false)}
                disabled={actionLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteDateConfirm}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Delete {records.length} Records</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Delete All (Safety Confirmed Wipe) */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-red-200 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete ALL Daily Reports</h3>
                <p className="text-xs text-red-600 font-semibold">Danger: Master Clear Action</p>
              </div>
            </div>

            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2 text-xs text-red-950">
              <p className="font-bold">
                ⚠️ This will permanently delete ALL daily installation reports across ALL dates in the entire database.
              </p>
              <p className="text-[11px] text-red-800 leading-relaxed">
                All daily upload logs and installation entries will be wiped. Inventory stock devices will be reverted to Central Warehouse.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Type <span className="font-mono text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">DELETE</span> below to confirm:
              </label>
              <input
                type="text"
                placeholder="DELETE"
                value={confirmDeleteText}
                onChange={(e) => setConfirmDeleteText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:border-red-500 uppercase"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteAllModal(false);
                  setConfirmDeleteText('');
                }}
                disabled={actionLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAllConfirm}
                disabled={actionLoading || confirmDeleteText.trim().toUpperCase() !== 'DELETE'}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                <span>Clear All Installation Reports</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Delete Single Item Confirmation */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Delete Installation</h3>
                <p className="text-[11px] font-mono text-slate-500">{deletingItem.vehicle_number || deletingItem.imei_number}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Vehicle:</span>
                <span className="font-mono font-bold text-slate-800">{deletingItem.vehicle_number || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">IMEI:</span>
                <span className="font-mono font-bold text-blue-600">{deletingItem.imei_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-800">{deletingItem.customer_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Category:</span>
                <span className="font-bold text-slate-700">{deletingItem.category || 'VLTD'}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                disabled={actionLoading}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSingleConfirm}
                disabled={actionLoading}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Delete Record</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Bulk Delete Selected Rows Confirmation */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Selected Records</h3>
                <p className="text-xs text-slate-500">{selectedIds.size} records selected</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete the <span className="font-bold text-slate-900">{selectedIds.size} selected installation records</span>?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={actionLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteConfirm}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Delete {selectedIds.size} Records</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Daily Installation Upload Modal */}
      <DailyInstallationUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        initialDate={selectedDate}
        onUploadSuccess={(uploadedDate) => {
          if (uploadedDate && dateMode === 'TODAY' && uploadedDate !== selectedDate) {
            setSelectedDate(uploadedDate);
          } else if (dateMode === 'CUSTOM_RANGE') {
            loadDailyLog({ startDate, endDate });
          } else {
            loadDailyLog({ date: selectedDate });
          }
        }}
      />

      {/* Payment QR Modal */}
      <PaymentQrModal
        isOpen={isPaymentQrOpen}
        onClose={() => setIsPaymentQrOpen(false)}
        paymentData={paymentQrData}
        onPaymentUpdated={() => loadDailyLog(selectedDate)}
      />
    </div>
  );
}
