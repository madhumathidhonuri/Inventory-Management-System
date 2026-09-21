import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  X,
  AlertTriangle,
  Clock,
  Car,
  Phone,
  DollarSign,
  CheckCircle2,
  Share2,
  QrCode,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Calendar,
  ChevronRight,
  Filter,
  User,
  Wrench,
  CalendarDays
} from 'lucide-react';
import { fetchPendingPaymentAlerts, updateQuickPayment } from '../services/api';
import PaymentQrModal from './PaymentQrModal';
import MarkPaymentModal from './MarkPaymentModal';

export default function PendingPaymentNotificationModal({
  isOpen,
  onClose,
  onOpenTraceDrawer,
  onNavigateToInstallations,
  onNavigateToPendingPayments
}) {
  const [loading, setLoading] = useState(true);
  const [alertsData, setAlertsData] = useState(null);
  const [selectedDateFilter, setSelectedDateFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQrItem, setSelectedQrItem] = useState(null);
  const [selectedPayItem, setSelectedPayItem] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadAlerts();
    }
  }, [isOpen]);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetchPendingPaymentAlerts();
      if (res.success) {
        setAlertsData(res);
      }
    } catch (err) {
      console.warn('Failed to load pending payment alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenMarkPaid = (item) => {
    setSelectedPayItem(item);
  };

  const handlePaymentSuccess = (item, paymentMode, amount) => {
    setSuccessMsg(`✅ Marked ${item.vehicle_number} as Paid via ${paymentMode} (₹${(amount || 0).toLocaleString('en-IN')})!`);
    setTimeout(() => setSuccessMsg(''), 3500);
    loadAlerts();
  };

  const handleSendWhatsApp = (item) => {
    const rawPhone = (item.customer_contact || item.customer_phone || '').replace(/[^0-9]/g, '');
    const cleanPhone = rawPhone.startsWith('91') ? rawPhone : `91${rawPhone}`;
    const text = encodeURIComponent(item.reminder_message || `Payment reminder for vehicle ${item.vehicle_number}`);
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
  };

  if (!isOpen) return null;

  const summary = alertsData?.summary || {};
  const allItems = alertsData?.data || [];
  const dateReminders = alertsData?.date_reminders || [];
  const dateGroups = alertsData?.date_groups || [];

  const filteredItems = allItems.filter(item => {
    if (selectedDateFilter !== 'ALL' && item.installation_date !== selectedDateFilter && item.display_date !== selectedDateFilter) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const v = (item.vehicle_number || '').toLowerCase();
      const c = (item.customer_name || '').toLowerCase();
      const p = (item.customer_contact || '').toLowerCase();
      const imei = (item.imei_number || '').toLowerCase();
      const tech = (item.installed_by || '').toLowerCase();
      return v.includes(q) || c.includes(q) || p.includes(q) || imei.includes(q) || tech.includes(q);
    }
    return true;
  });

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white border border-slate-200/90 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[88vh] my-auto relative">

        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-slate-50 border-b border-slate-200/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-200">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Pending Payment Reminders
                </h2>
                {summary.total_pending_count > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-red-100 text-red-700 border border-red-200">
                    {summary.total_pending_count} Vehicles Due
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Total Uncollected Balance: <strong className="font-mono text-red-600 font-bold">₹{(summary.total_pending_amount || 0).toLocaleString('en-IN')}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadAlerts}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Refresh Alerts"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success Banner */}
        {successMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 text-emerald-800 text-xs font-bold flex items-center justify-between animate-in fade-in-50">
            <span>{successMsg}</span>
          </div>
        )}

        {/* Date-Wise Reminder Banners Carousel / List */}
        {dateReminders.length > 0 && (
          <div className="px-6 py-3 bg-amber-50/50 border-b border-amber-200/60 shrink-0 space-y-2">
            <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Daily Installation Reminders:</span>
            </div>
            
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedDateFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedDateFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                All Dates ({summary.total_pending_count || 0})
              </button>

              {dateReminders.slice(0, 8).map(rem => (
                <button
                  key={rem.date}
                  type="button"
                  onClick={() => setSelectedDateFilter(selectedDateFilter === rem.date ? 'ALL' : rem.date)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedDateFilter === rem.date
                      ? 'bg-red-600 text-white shadow-sm shadow-red-200 ring-2 ring-red-400/30'
                      : 'bg-white text-red-700 hover:bg-red-50 border border-red-200'
                  }`}
                  title={rem.reminder_text}
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  <span>{rem.reminder_text}</span>
                  <span className="font-mono text-[10px] opacity-80">(₹{rem.pending_amount.toLocaleString('en-IN')})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 font-medium">
            Showing <strong className="text-slate-900 font-bold">{filteredItems.length}</strong> pending vehicle(s)
            {selectedDateFilter !== 'ALL' && (
              <span className="ml-1 text-amber-700 font-semibold">
                for date {selectedDateFilter}
              </span>
            )}
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search vehicle, customer, IMEI, tech..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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

        {/* List of Notification Alert Cards */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center gap-2.5">
              <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
              <span className="font-medium">Scanning pending installations...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400 space-y-2.5">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="font-bold text-slate-800 text-sm">No Pending Payment Notifications</p>
              <p className="text-slate-400 max-w-sm mx-auto">
                All vehicle installations matching this filter are cleared and accounted for.
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl border border-slate-200/90 bg-white hover:border-amber-300 hover:shadow-xs transition-all space-y-3"
                >
                  {/* Top Bar: Vehicle Badge + Installation Date + Balance Due */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-mono font-bold text-xs shadow-2xs flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-amber-400" />
                        <span>{item.vehicle_number}</span>
                      </span>

                      {/* Installation Date Badge */}
                      <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-amber-600" />
                        <span>Installed on {item.display_date || item.installation_date}</span>
                      </span>

                      {item.days_overdue > 0 && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                          {item.days_overdue} {item.days_overdue === 1 ? 'day' : 'days'} ago
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col sm:items-end gap-0.5 sm:text-right">
                      <div className="flex items-center gap-1.5 sm:justify-end">
                        <span className="text-[11px] text-slate-400 font-medium">Balance Due:</span>
                        <span className="text-base font-black font-mono text-red-600">
                          ₹{(parseFloat(item.sale_price) || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      {item.is_partial && item.amount_paid > 0 && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          ₹{item.amount_paid.toLocaleString('en-IN')} paid of ₹{(item.total_sale_price || 0).toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 6 Core Info Grid: Customer, Phone, IMEI, Tech */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                    
                    {/* Customer Name */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Customer Name</p>
                      <p className="font-bold text-slate-900 flex items-center gap-1 truncate">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{item.customer_name || 'Customer'}</span>
                      </p>
                    </div>

                    {/* Phone Number */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Phone Number</p>
                      <p className="text-[11px] text-slate-600 font-mono font-medium flex items-center gap-1">
                        <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>{item.customer_contact || 'No Phone'}</span>
                      </p>
                    </div>

                    {/* IMEI Number */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">IMEI Number</p>
                      <p className="font-mono text-indigo-600 font-semibold text-[11px]">
                        <button
                          type="button"
                          onClick={() => { if (onOpenTraceDrawer) onOpenTraceDrawer(item.imei_number); }}
                          className="hover:underline"
                          title="Trace IMEI Lifecycle"
                        >
                          {item.imei_number}
                        </button>
                      </p>
                    </div>

                    {/* Technician */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Technician</p>
                      <p className="text-[11px] text-slate-700 font-medium flex items-center gap-1 truncate">
                        <Wrench className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{item.installed_by || 'Technician'}</span>
                      </p>
                    </div>

                  </div>

                  {/* Bottom Action Buttons Row */}
                  <div className="flex items-center justify-end flex-wrap gap-2 pt-2 border-t border-slate-100">
                    
                    {/* WhatsApp Reminder */}
                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(item)}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Open WhatsApp with pre-filled payment reminder"
                    >
                      <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>WhatsApp Reminder</span>
                    </button>

                    {/* Collect via UPI QR */}
                    <button
                      type="button"
                      onClick={() => setSelectedQrItem(item)}
                      className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Generate instant UPI Payment QR"
                    >
                      <QrCode className="w-3.5 h-3.5 text-purple-600" />
                      <span>UPI QR</span>
                    </button>

                    {/* Mark Paid (Cash, UPI, Bank Transfer) */}
                    <button
                      type="button"
                      onClick={() => handleOpenMarkPaid(item)}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer hover:shadow-sm"
                      title="Mark payment as RECEIVED (Cash, UPI, Bank Transfer)"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mark Paid</span>
                    </button>

                  </div>

                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onNavigateToPendingPayments) onNavigateToPendingPayments();
              else if (onNavigateToInstallations) onNavigateToInstallations();
            }}
            className="text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span>Open Full Pending Payments Hub</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

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

    </div>,
    document.body
  );
}

