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
  ChevronDown,
  Filter,
  User,
  Wrench,
  Layers,
  CalendarDays
} from 'lucide-react';
import { fetchPendingPaymentAlerts, updateQuickPayment } from '../services/api';
import PaymentQrModal from '../components/PaymentQrModal';
import MarkPaymentModal from '../components/MarkPaymentModal';
import * as XLSX from 'xlsx';

export default function PendingPaymentsPage({ onOpenTraceDrawer }) {
  const [loading, setLoading] = useState(true);
  const [alertsData, setAlertsData] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQrItem, setSelectedQrItem] = useState(null);
  const [selectedPayItem, setSelectedPayItem] = useState(null);
  const [successToast, setSuccessToast] = useState('');
  const [expandedDates, setExpandedDates] = useState({}); // track collapse/expand per date

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetchPendingPaymentAlerts();
      if (res.success) {
        setAlertsData(res);
        // Default to current month if available and month not explicitly set
        if (res.summary?.current_month && selectedMonth === 'ALL') {
          // Check if current month exists in available months
          const hasCurrentMonth = (res.available_months || []).some(m => m.month === res.summary.current_month);
          if (hasCurrentMonth) {
            setSelectedMonth(res.summary.current_month);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load pending payments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenMarkPaid = (item) => {
    setSelectedPayItem(item);
  };

  const handlePaymentSuccess = (item, paymentMode, amount) => {
    setSuccessToast(`✅ Successfully marked ${item.vehicle_number} as Paid via ${paymentMode} (₹${(amount || 0).toLocaleString('en-IN')})!`);
    setTimeout(() => setSuccessToast(''), 4000);
    loadAlerts();
  };

  const handleSendWhatsApp = (item) => {
    const rawPhone = (item.customer_contact || item.customer_phone || '').replace(/[^0-9]/g, '');
    const cleanPhone = rawPhone.startsWith('91') ? rawPhone : `91${rawPhone}`;
    const text = encodeURIComponent(item.reminder_message || `Payment reminder for vehicle ${item.vehicle_number}`);
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
  };

  const summary = alertsData?.summary || {};
  const allItems = alertsData?.data || [];
  const availableMonths = alertsData?.available_months || [];
  const rawDateGroups = alertsData?.date_groups || [];

  // Filter items based on selected month & search query
  const filteredDateGroups = useMemo(() => {
    return rawDateGroups
      .filter(g => {
        if (selectedMonth !== 'ALL' && g.month !== selectedMonth) return false;
        return true;
      })
      .map(g => {
        const matchingItems = (g.items || []).filter(item => {
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          const v = (item.vehicle_number || '').toLowerCase();
          const c = (item.customer_name || '').toLowerCase();
          const p = (item.customer_contact || '').toLowerCase();
          const imei = (item.imei_number || '').toLowerCase();
          const tech = (item.installed_by || '').toLowerCase();
          return v.includes(q) || c.includes(q) || p.includes(q) || imei.includes(q) || tech.includes(q);
        });

        return {
          ...g,
          filteredItems: matchingItems
        };
      })
      .filter(g => g.filteredItems.length > 0);
  }, [rawDateGroups, selectedMonth, searchQuery]);

  // Compute stats for current selected month view
  const currentViewStats = useMemo(() => {
    let totalInstalled = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let totalPendingAmt = 0;

    filteredDateGroups.forEach(g => {
      totalInstalled += g.total_installed;
      totalPaid += g.paid_count;
      totalPending += g.filteredItems.length;
      g.filteredItems.forEach(it => {
        totalPendingAmt += parseFloat(it.sale_price) || 0;
      });
    });

    return { totalInstalled, totalPaid, totalPending, totalPendingAmt };
  }, [filteredDateGroups]);

  const toggleExpand = (dateKey) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateKey]: prev[dateKey] === false ? true : false
    }));
  };

  const handleExportExcel = () => {
    const flatItems = [];
    filteredDateGroups.forEach(g => {
      g.filteredItems.forEach(item => flatItems.push(item));
    });

    if (flatItems.length === 0) return;

    const dataToExport = flatItems.map((item, idx) => ({
      'S.No': idx + 1,
      'Installation Date': item.display_date || item.installation_date || '',
      'Vehicle Number': item.vehicle_number || '',
      'Customer Name': item.customer_name || '',
      'Phone Number': item.customer_contact || '',
      'IMEI Number': item.imei_number || '',
      'Technician': item.installed_by || '',
      'Amount Due (₹)': parseFloat(item.sale_price) || 0,
      'Days Overdue': item.days_overdue || 0,
      'Location': item.installation_location || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pending Payments');
    XLSX.writeFile(wb, `Pending_Payments_${selectedMonth}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-amber-600" />
              <span>Pending Payments Ledger</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200">
              Date-Wise Tracking
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Track daily installations vs uncollected payments month-by-month and send instant WhatsApp reminders
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportExcel}
            disabled={currentViewStats.totalPending === 0}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel ({currentViewStats.totalPending})</span>
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

      {/* Success Notification */}
      {successToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in-50">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Month Selector & Filter Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Month Selector Pills */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Month:</span>
            </span>

            {/* Current Month & All Month buttons */}
            <button
              type="button"
              onClick={() => setSelectedMonth('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedMonth === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Records ({summary.total_pending_count || 0})
            </button>

            {availableMonths.map(m => (
              <button
                key={m.month}
                type="button"
                onClick={() => setSelectedMonth(m.month)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  selectedMonth === m.month
                    ? 'bg-amber-600 text-white shadow-sm shadow-amber-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{m.month_label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  selectedMonth === m.month ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {m.pending_count} Due
                </span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search vehicle, customer, phone, IMEI, tech..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

        </div>

        {/* Selected Month Summary Ribbon */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-slate-600">
            <span>
              Total Installed: <strong className="text-slate-900 font-bold">{currentViewStats.totalInstalled}</strong>
            </span>
            <span>
              Paid: <strong className="text-emerald-700 font-bold">{currentViewStats.totalPaid}</strong>
            </span>
            <span>
              Pending: <strong className="text-red-600 font-bold">{currentViewStats.totalPending}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1 text-slate-700">
            <span className="text-slate-400">Total Unpaid for View:</span>
            <span className="font-mono font-black text-sm text-red-600">
              ₹{currentViewStats.totalPendingAmt.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Date-Wise Grouped Pending Payments List */}
      <div className="space-y-5">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-xs text-slate-400 flex flex-col items-center gap-2 shadow-2xs">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
            <span className="font-medium text-slate-600">Loading date-wise pending payments...</span>
          </div>
        ) : filteredDateGroups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-xs text-slate-400 space-y-2.5 shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="font-bold text-slate-800 text-base">No Pending Payments for Selected Period</p>
            <p className="text-slate-400 max-w-md mx-auto">
              All vehicle fitments in this date range have payments received and cleared.
            </p>
          </div>
        ) : (
          filteredDateGroups.map((group) => {
            const isCollapsed = expandedDates[group.date] === false;
            const datePendingTotal = group.filteredItems.reduce((acc, it) => acc + (parseFloat(it.sale_price) || 0), 0);

            return (
              <div
                key={group.date}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all"
              >
                {/* Date Group Header Card */}
                <div
                  onClick={() => toggleExpand(group.date)}
                  className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-amber-500 text-slate-950 font-bold flex items-center justify-center">
                      <CalendarDays className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-sm tracking-tight text-white font-mono">
                          Installed on {group.display_date}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                          {group.filteredItems.length} Pending
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        {group.total_installed} Total Installed &bull; {group.paid_count} Paid &bull; <strong className="text-amber-400">{group.filteredItems.length} Unpaid</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-auto">
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Date Pending Amount</div>
                      <div className="text-sm font-black font-mono text-amber-400">
                        ₹{datePendingTotal.toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div className="p-1 rounded-lg bg-white/10 text-white">
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Table with the exact 6 required columns */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="p-3.5 font-bold text-slate-600">Installation Date</th>
                          <th className="p-3.5 font-bold text-slate-600">Vehicle Number</th>
                          <th className="p-3.5 font-bold text-slate-600">Customer Name</th>
                          <th className="p-3.5 font-bold text-slate-600">Phone Number</th>
                          <th className="p-3.5 font-bold text-slate-600">IMEI Number</th>
                          <th className="p-3.5 font-bold text-slate-600">Technician</th>
                          <th className="p-3.5 font-bold text-slate-600">Amount Due</th>
                          <th className="p-3.5 font-bold text-slate-600 text-right">Quick Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.filteredItems.map((item) => (
                          <tr
                            key={item.id}
                            className="hover:bg-amber-50/20 transition-colors"
                          >
                            {/* 1. Installation Date */}
                            <td className="p-3.5 whitespace-nowrap">
                              <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded-lg">
                                {item.display_date || item.installation_date}
                              </span>
                            </td>

                            {/* 2. Vehicle Number */}
                            <td className="p-3.5 whitespace-nowrap">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono font-bold text-xs shadow-2xs inline-flex items-center gap-1.5">
                                <Car className="w-3.5 h-3.5 text-amber-400" />
                                <span>{item.vehicle_number}</span>
                              </span>
                            </td>

                            {/* 3. Customer Name */}
                            <td className="p-3.5">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{item.customer_name || 'Customer'}</span>
                              </div>
                            </td>

                            {/* 4. Phone Number */}
                            <td className="p-3.5 whitespace-nowrap">
                              <div className="text-slate-700 font-mono font-medium flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>{item.customer_contact || 'No Phone'}</span>
                              </div>
                            </td>

                            {/* 5. IMEI Number */}
                            <td className="p-3.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => { if (onOpenTraceDrawer) onOpenTraceDrawer(item.imei_number); }}
                                className="font-mono text-indigo-600 hover:text-indigo-800 font-semibold hover:underline"
                                title="Click to trace device lifecycle"
                              >
                                {item.imei_number}
                              </button>
                            </td>

                            {/* 6. Technician */}
                            <td className="p-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                                <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{item.installed_by || 'Technician'}</span>
                              </div>
                            </td>

                            {/* Amount Due */}
                            <td className="p-3.5 whitespace-nowrap">
                              <div className="font-mono font-black text-red-600 text-sm">
                                ₹{(parseFloat(item.sale_price) || 0).toLocaleString('en-IN')}
                              </div>
                              {item.is_partial && item.amount_paid > 0 ? (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-block mt-0.5">
                                  ₹{item.amount_paid.toLocaleString('en-IN')} paid of ₹{(item.total_sale_price || 0).toLocaleString('en-IN')}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">Full Payment Pending</span>
                              )}
                            </td>

                            {/* Quick Actions (WhatsApp, QR, Mark Paid) */}
                            <td className="p-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                
                                {/* WhatsApp Reminder */}
                                <button
                                  type="button"
                                  onClick={() => handleSendWhatsApp(item)}
                                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                                  title="Send WhatsApp Payment Reminder"
                                >
                                  <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>WhatsApp</span>
                                </button>

                                {/* UPI QR */}
                                <button
                                  type="button"
                                  onClick={() => setSelectedQrItem(item)}
                                  className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                                  title="Generate UPI QR"
                                >
                                  <QrCode className="w-3.5 h-3.5 text-purple-600" />
                                  <span>UPI QR</span>
                                </button>

                                {/* Mark Paid (with Cash / UPI / Bank selector) */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenMarkPaid(item)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer hover:shadow-sm"
                                  title="Mark Payment as Received (Cash, UPI, Bank Transfer)"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Mark Paid</span>
                                </button>

                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Record Payment Modal with Mode Selection (Cash, UPI, Bank Transfer, Cheque) */}
      {selectedPayItem && (
        <MarkPaymentModal
          isOpen={true}
          item={selectedPayItem}
          onClose={() => setSelectedPayItem(null)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

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
