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
  ArrowUpRight
} from 'lucide-react';
import { fetchDailyInstallationLog } from '../services/api';
import { exportInstallationsToExcel } from '../utils/excelExport';
import DailyInstallationUploadModal from '../components/DailyInstallationUploadModal';
import PaymentQrModal from '../components/PaymentQrModal';
import { buildCustomerCredentialsWhatsAppMessage, buildPaymentQrWhatsAppMessage } from '../utils/whatsapp';

export default function DailyReportsPage({ onOpenTraceDrawer }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [availableDates, setAvailableDates] = useState([]);
  const [dateSummary, setDateSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL'); // ALL, RECEIVED, PENDING
  const [exporting, setExporting] = useState(false);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Payment QR modal state
  const [paymentQrData, setPaymentQrData] = useState(null);
  const [isPaymentQrOpen, setIsPaymentQrOpen] = useState(false);

  useEffect(() => {
    loadDailyLog(selectedDate);
  }, [selectedDate]);

  const loadDailyLog = async (date) => {
    setLoading(true);
    try {
      const res = await fetchDailyInstallationLog({ date: date || '' });
      if (res.success) {
        setAvailableDates(res.available_dates || []);
        setDateSummary(res.date_summary || null);
        setRecords(res.records || []);
        if (res.active_date && res.active_date !== selectedDate) {
          setSelectedDate(res.active_date);
        }
      }
    } catch (err) {
      console.error('Failed to load daily log:', err);
    } finally {
      setLoading(false);
    }
  };

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const yesterdayStr = useMemo(() => new Date(Date.now() - 86400000).toISOString().split('T')[0], []);

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
          <button
            onClick={handleExportDateExcel}
            disabled={exporting || filteredRecords.length === 0}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Download Excel sheet for selected date"
          >
            {exporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
            <span>📥 Export Date Excel ({filteredRecords.length})</span>
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>📊 Upload Daily Report (Excel)</span>
          </button>
        </div>
      </div>

      {/* Date Navigation & Selector Ribbon */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Quick Date Pills & Custom Date Picker */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" /> Select Date:
          </span>

          <button
            onClick={() => setSelectedDate(todayStr)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              selectedDate === todayStr
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Today
          </button>

          <button
            onClick={() => setSelectedDate(yesterdayStr)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              selectedDate === yesterdayStr
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Yesterday
          </button>

          {/* Quick Recent Dates Horizontal List */}
          {availableDates.slice(0, 5).map(d => (
            <button
              key={d.date}
              onClick={() => setSelectedDate(d.date)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer hidden sm:inline-flex items-center gap-1.5 ${
                selectedDate === d.date
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{d.display_date}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                selectedDate === d.date ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {d.total_count}
              </span>
            </button>
          ))}
        </div>

        {/* Custom Date Input */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-emerald-500 cursor-pointer font-mono"
            />
          </div>

          <button
            onClick={() => loadDailyLog(selectedDate)}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors cursor-pointer"
            title="Refresh current date"
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
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'TG MINING'
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
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'AP MINING'
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
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'VLTD'
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
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'GENERAL'
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
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  categoryFilter === cat
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
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  paymentFilter === p.id
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
                  <th className="py-3 px-3.5 w-12 text-center">#</th>
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

                  let badgeClass = 'bg-blue-100 text-blue-800 border-blue-200';
                  if (cat.includes('TG MINING')) badgeClass = 'bg-amber-100 text-amber-900 border-amber-300';
                  else if (cat.includes('AP MINING')) badgeClass = 'bg-purple-100 text-purple-900 border-purple-300';
                  else if (cat.includes('GENERAL')) badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';

                  return (
                    <tr key={inst.id || idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3.5 text-center text-slate-400 font-mono text-[11px]">
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

                      {/* Customer Info (blank if not provided) */}
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

                      {/* Customer Actions */}
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
                            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Open UPI Payment QR"
                          >
                            <QrCode className="w-4 h-4" />
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

      {/* Daily Installation Upload Modal */}
      <DailyInstallationUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadSuccess={() => {
          loadDailyLog(selectedDate);
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
