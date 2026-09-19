import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  AlertTriangle,
  Clock,
  Car,
  Phone,
  CheckCircle2,
  Share2,
  QrCode,
  RefreshCw,
  Search,
  FileSpreadsheet,
  Calendar,
  ExternalLink,
  ChevronRight,
  Filter,
  User,
  MapPin,
  Tag
} from 'lucide-react';
import { fetchPendingPaymentAlerts, updateQuickPayment } from '../services/api';
import PaymentQrModal from '../components/PaymentQrModal';
import * as XLSX from 'xlsx';

export default function PendingPaymentsPage({ onOpenTraceDrawer }) {
  const [loading, setLoading] = useState(true);
  const [alertsData, setAlertsData] = useState(null);
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'YESTERDAY' | 'TODAY' | 'OVERDUE'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQrItem, setSelectedQrItem] = useState(null);
  const [markingPaidId, setMarkingPaidId] = useState(null);
  const [successToast, setSuccessToast] = useState('');

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetchPendingPaymentAlerts();
      if (res.success) {
        setAlertsData(res);
      }
    } catch (err) {
      console.warn('Failed to load pending payments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async (item) => {
    if (!window.confirm(`Mark vehicle ${item.vehicle_number} (₹${item.sale_price}) as Payment RECEIVED?`)) {
      return;
    }
    setMarkingPaidId(item.id);
    try {
      const res = await updateQuickPayment({
        id: item.device_id,
        payment_status: 'RECEIVED',
        amount_paid: item.sale_price,
        payment_remarks: 'Collected via Pending Payments Hub'
      });
      if (res.success) {
        setSuccessToast(`✅ Successfully marked ${item.vehicle_number} as Paid!`);
        setTimeout(() => setSuccessToast(''), 4000);
        loadAlerts();
      }
    } catch (err) {
      alert('Failed to update payment: ' + err.message);
    } finally {
      setMarkingPaidId(null);
    }
  };

  const handleSendWhatsApp = (item) => {
    const rawPhone = (item.customer_contact || item.customer_phone || '').replace(/[^0-9]/g, '');
    const cleanPhone = rawPhone.startsWith('91') ? rawPhone : `91${rawPhone}`;
    const text = encodeURIComponent(item.reminder_message || `Payment reminder for vehicle ${item.vehicle_number}`);
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
  };

  const summary = alertsData?.summary || {};
  const allItems = alertsData?.data || [];

  const filteredItems = useMemo(() => {
    return allItems.filter(item => {
      if (activeTab === 'YESTERDAY' && item.bucket !== 'YESTERDAY') return false;
      if (activeTab === 'TODAY' && item.bucket !== 'TODAY') return false;
      if (activeTab === 'OVERDUE' && item.bucket !== 'RECENT_DUE' && item.bucket !== 'CRITICAL_OVERDUE') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const v = (item.vehicle_number || '').toLowerCase();
        const c = (item.customer_name || '').toLowerCase();
        const p = (item.customer_contact || '').toLowerCase();
        const imei = (item.imei_number || '').toLowerCase();
        const tech = (item.installed_by || '').toLowerCase();
        const loc = (item.installation_location || '').toLowerCase();
        return v.includes(q) || c.includes(q) || p.includes(q) || imei.includes(q) || tech.includes(q) || loc.includes(q);
      }
      return true;
    });
  }, [allItems, activeTab, searchQuery]);

  const handleExportExcel = () => {
    if (filteredItems.length === 0) return;
    const dataToExport = filteredItems.map((item, idx) => ({
      'S.No': idx + 1,
      'Vehicle Number': item.vehicle_number || '',
      'Customer Name': item.customer_name || '',
      'Phone Number': item.customer_contact || '',
      'Amount Due (₹)': parseFloat(item.sale_price) || 0,
      'Installation Date': item.installation_date || '',
      'Aging / Status': item.aging_label || '',
      'Days Overdue': item.days_overdue || 0,
      'IMEI Number': item.imei_number || '',
      'Model': item.device_type_name || '',
      'Installed By': item.installed_by || '',
      'Location': item.installation_location || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pending Payments');
    XLSX.writeFile(wb, `Pending_Payments_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-600" />
            <span>Pending Payments & Collection Hub</span>
            {summary.total_pending_count > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-red-100 text-red-800 border border-red-200">
                {summary.total_pending_count} Vehicles Due
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500">
            Track daily uncollected fitments, send WhatsApp payment reminders, and record collections
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportExcel}
            disabled={filteredItems.length === 0}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Pending Excel ({filteredItems.length})</span>
          </button>

          <button
            onClick={loadAlerts}
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Success Toast */}
      {successToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in-50">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Due */}
        <div
          onClick={() => setActiveTab('ALL')}
          className={`p-4.5 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
            activeTab === 'ALL'
              ? 'bg-white border-slate-900 ring-2 ring-slate-900/10'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Total Unpaid Balance</span>
            <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-red-600">
            ₹{(summary.total_pending_amount || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-semibold">
            {summary.total_pending_count || 0} Total Vehicles
          </div>
        </div>

        {/* Yesterday Due (Special Attention) */}
        <div
          onClick={() => setActiveTab('YESTERDAY')}
          className={`p-4.5 rounded-2xl border transition-all cursor-pointer shadow-2xs relative ${
            activeTab === 'YESTERDAY'
              ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-500/20'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          {(summary.yesterday_pending_count || 0) > 0 && (
            <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-red-600 text-white animate-pulse">
              1 Day Due
            </span>
          )}
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Fitted Yesterday</span>
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-900">
            ₹{(summary.yesterday_pending_amount || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-amber-800 mt-1 font-semibold">
            {summary.yesterday_pending_count || 0} Vehicles Fitted Yesterday
          </div>
        </div>

        {/* Today Due */}
        <div
          onClick={() => setActiveTab('TODAY')}
          className={`p-4.5 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
            activeTab === 'TODAY'
              ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20'
              : 'bg-white border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Fitted Today</span>
            <div className="p-2 rounded-xl bg-blue-100 text-blue-800">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-blue-900">
            ₹{(summary.today_pending_amount || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-blue-700 mt-1 font-semibold">
            {summary.today_pending_count || 0} Vehicles Fitted Today
          </div>
        </div>

        {/* Older Overdue */}
        <div
          onClick={() => setActiveTab('OVERDUE')}
          className={`p-4.5 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
            activeTab === 'OVERDUE'
              ? 'bg-red-50/80 border-red-500 ring-2 ring-red-500/20'
              : 'bg-white border-slate-200 hover:border-red-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-800">Older Overdue</span>
            <div className="p-2 rounded-xl bg-red-100 text-red-800">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-red-700">
            ₹{(summary.older_pending_amount || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-red-700 mt-1 font-semibold">
            {summary.older_pending_count || 0} Vehicles &gt;2 Days Due
          </div>
        </div>

      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        
        {/* Tab Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: `All Pending (${summary.total_pending_count || 0})` },
            { id: 'YESTERDAY', label: `Fitted Yesterday (${summary.yesterday_pending_count || 0})` },
            { id: 'TODAY', label: `Fitted Today (${summary.today_pending_count || 0})` },
            { id: 'OVERDUE', label: `Overdue >2 Days (${summary.older_pending_count || 0})` }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search vehicle, customer, phone, IMEI..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Main Vehicles Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
            <span>Loading pending payments ledger...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-400 space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <p className="font-bold text-slate-800 text-base">No Pending Payments Found!</p>
            <p className="text-slate-400">All vehicles in this category have cleared payments.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-3.5 font-bold">Vehicle & Status</th>
                  <th className="p-3.5 font-bold">Customer Details</th>
                  <th className="p-3.5 font-bold">Fitment Date & Aging</th>
                  <th className="p-3.5 font-bold">Amount Due</th>
                  <th className="p-3.5 font-bold">Location & Tech</th>
                  <th className="p-3.5 font-bold text-right">Quick Collection Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const isYesterday = item.bucket === 'YESTERDAY';
                  const isToday = item.bucket === 'TODAY';
                  const isCritical = item.bucket === 'CRITICAL_OVERDUE';

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isYesterday ? 'bg-amber-50/30' : isCritical ? 'bg-red-50/20' : ''
                      }`}
                    >
                      {/* Vehicle Number & IMEI */}
                      <td className="p-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-white font-mono font-bold text-xs shadow-2xs">
                              {item.vehicle_number}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            IMEI: <span className="text-slate-600 select-all">{item.imei_number}</span>
                          </div>
                        </div>
                      </td>

                      {/* Customer Info */}
                      <td className="p-3.5">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900 flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>{item.customer_name || 'Customer'}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>{item.customer_contact || 'No Phone'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Date & Aging */}
                      <td className="p-3.5">
                        <div className="space-y-1">
                          <div className="text-xs font-mono font-semibold text-slate-800">
                            {item.installation_date}
                          </div>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${
                            isYesterday
                              ? 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold animate-pulse'
                              : isToday
                              ? 'bg-blue-100 text-blue-900 border-blue-200'
                              : isCritical
                              ? 'bg-red-100 text-red-900 border-red-300'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            <Clock className="w-3 h-3" />
                            <span>{item.aging_label || `${item.days_overdue} days due`}</span>
                          </span>
                        </div>
                      </td>

                      {/* Amount Due */}
                      <td className="p-3.5">
                        <div className="font-mono font-black text-sm text-red-600">
                          ₹{(parseFloat(item.sale_price) || 0).toLocaleString('en-IN')}
                        </div>
                        <span className="text-[10px] text-slate-400">Payment Pending</span>
                      </td>

                      {/* Location & Tech */}
                      <td className="p-3.5">
                        <div className="space-y-0.5 text-slate-600 text-[11px]">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{item.installation_location || 'Vijayawada'}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Tech: {item.installed_by || 'Technician'}
                          </div>
                        </div>
                      </td>

                      {/* Collection Actions */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          
                          {/* WhatsApp Reminder */}
                          <button
                            type="button"
                            onClick={() => handleSendWhatsApp(item)}
                            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                            title="Open WhatsApp with pre-filled payment reminder"
                          >
                            <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>WhatsApp</span>
                          </button>

                          {/* UPI QR */}
                          <button
                            type="button"
                            onClick={() => setSelectedQrItem(item)}
                            className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                            title="Generate instant UPI Payment QR"
                          >
                            <QrCode className="w-3.5 h-3.5 text-purple-600" />
                            <span>UPI QR</span>
                          </button>

                          {/* 1-Click Mark as Paid */}
                          <button
                            type="button"
                            disabled={markingPaidId === item.id}
                            onClick={() => handleMarkPaid(item)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                            title="Mark payment as RECEIVED"
                          >
                            {markingPaidId === item.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            <span>Mark Paid</span>
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

      {/* Payment QR Modal Popup */}
      {selectedQrItem && (
        <PaymentQrModal
          isOpen={true}
          onClose={() => {
            setSelectedQrItem(null);
            loadAlerts();
          }}
          device={{
            ...selectedQrItem,
            additional_attributes: {
              'VEHICLE NUMBER': selectedQrItem.vehicle_number,
              'CUSTOMER NAME': selectedQrItem.customer_name,
              'CUSTOMER PHONE NUMBER': selectedQrItem.customer_contact,
              'COST': selectedQrItem.sale_price,
              'TOTAL COST': selectedQrItem.sale_price
            }
          }}
          onPaymentUpdated={() => {
            setSelectedQrItem(null);
            loadAlerts();
          }}
        />
      )}

    </div>
  );
}
