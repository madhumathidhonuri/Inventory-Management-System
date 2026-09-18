import React, { useState, useEffect } from 'react';
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
  Filter
} from 'lucide-react';
import { fetchPendingPaymentAlerts, updateQuickPayment } from '../services/api';
import PaymentQrModal from './PaymentQrModal';

export default function PendingPaymentNotificationModal({
  isOpen,
  onClose,
  onOpenTraceDrawer,
  onNavigateToInstallations,
  onNavigateToPendingPayments
}) {
  const [loading, setLoading] = useState(true);
  const [alertsData, setAlertsData] = useState(null);
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'YESTERDAY' | 'TODAY' | 'OVERDUE'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQrItem, setSelectedQrItem] = useState(null);
  const [markingPaidId, setMarkingPaidId] = useState(null);
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
        payment_remarks: 'Collected via Notification Bell'
      });
      if (res.success) {
        setSuccessMsg(`✅ Marked ${item.vehicle_number} as Paid!`);
        setTimeout(() => setSuccessMsg(''), 3000);
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

  if (!isOpen) return null;

  const summary = alertsData?.summary || {};
  const allItems = alertsData?.data || [];

  const filteredItems = allItems.filter(item => {
    if (activeTab === 'YESTERDAY' && item.bucket !== 'YESTERDAY') return false;
    if (activeTab === 'TODAY' && item.bucket !== 'TODAY') return false;
    if (activeTab === 'OVERDUE' && item.bucket !== 'RECENT_DUE' && item.bucket !== 'CRITICAL_OVERDUE') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const v = (item.vehicle_number || '').toLowerCase();
      const c = (item.customer_name || '').toLowerCase();
      const p = (item.customer_contact || '').toLowerCase();
      const imei = (item.imei_number || '').toLowerCase();
      return v.includes(q) || c.includes(q) || p.includes(q) || imei.includes(q);
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="p-4 sm:p-5 bg-linear-to-r from-amber-500/10 via-red-500/5 to-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-amber-500 text-white shadow-xs animate-bounce">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Pending Payment Alerts</span>
                {summary.total_pending_count > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-red-100 text-red-800 border border-red-200">
                    {summary.total_pending_count} Vehicles Due
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                Total Uncollected Dues: <strong className="font-mono text-red-600 font-bold">₹{(summary.total_pending_amount || 0).toLocaleString('en-IN')}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadAlerts}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
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
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-emerald-800 text-xs font-bold flex items-center justify-between animate-in fade-in-50">
            <span>{successMsg}</span>
          </div>
        )}

        {/* Top KPI Filters */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 grid grid-cols-4 gap-2 text-center shrink-0">
          
          {/* Tab: All */}
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`p-2 rounded-xl border text-xs transition-all cursor-pointer ${
              activeTab === 'ALL'
                ? 'bg-white border-slate-800 text-slate-900 font-bold shadow-xs'
                : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
            }`}
          >
            <div className="text-[10px] uppercase font-bold text-slate-400">All Due</div>
            <div className="text-sm font-bold font-mono text-slate-900">{summary.total_pending_count || 0}</div>
            <div className="text-[9px] text-slate-500">₹{(summary.total_pending_amount || 0).toLocaleString('en-IN')}</div>
          </button>

          {/* Tab: Yesterday (Special Highlight) */}
          <button
            type="button"
            onClick={() => setActiveTab('YESTERDAY')}
            className={`p-2 rounded-xl border text-xs transition-all cursor-pointer relative ${
              activeTab === 'YESTERDAY'
                ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold shadow-xs'
                : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-amber-50/50'
            }`}
          >
            {(summary.yesterday_pending_count || 0) > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
            )}
            <div className="text-[10px] uppercase font-bold text-amber-700">Yesterday</div>
            <div className="text-sm font-bold font-mono text-amber-900">{summary.yesterday_pending_count || 0}</div>
            <div className="text-[9px] text-amber-700 font-semibold">1 Day Due</div>
          </button>

          {/* Tab: Today */}
          <button
            type="button"
            onClick={() => setActiveTab('TODAY')}
            className={`p-2 rounded-xl border text-xs transition-all cursor-pointer ${
              activeTab === 'TODAY'
                ? 'bg-blue-50 border-blue-500 text-blue-950 font-bold shadow-xs'
                : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-blue-50/50'
            }`}
          >
            <div className="text-[10px] uppercase font-bold text-blue-700">Today</div>
            <div className="text-sm font-bold font-mono text-blue-900">{summary.today_pending_count || 0}</div>
            <div className="text-[9px] text-blue-600">Fitted Today</div>
          </button>

          {/* Tab: Older Overdue */}
          <button
            type="button"
            onClick={() => setActiveTab('OVERDUE')}
            className={`p-2 rounded-xl border text-xs transition-all cursor-pointer ${
              activeTab === 'OVERDUE'
                ? 'bg-red-50 border-red-500 text-red-950 font-bold shadow-xs'
                : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-red-50/50'
            }`}
          >
            <div className="text-[10px] uppercase font-bold text-red-700">Older Due</div>
            <div className="text-sm font-bold font-mono text-red-900">{summary.older_pending_count || 0}</div>
            <div className="text-[9px] text-red-600">&gt;2 Days Overdue</div>
          </button>

        </div>

        {/* Search Input Filter */}
        <div className="p-3 border-b border-slate-100 bg-white shrink-0">
          <input
            type="text"
            placeholder="Search vehicle number, customer name, phone, IMEI..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white"
          />
        </div>

        {/* List of Vehicles */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
              <span>Scanning pending installations...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="font-bold text-slate-700 text-sm">No Pending Payments Found!</p>
              <p className="text-slate-400">All vehicle installations in this category are fully paid & cleared.</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isYesterday = item.bucket === 'YESTERDAY';
              const isToday = item.bucket === 'TODAY';
              const isCritical = item.bucket === 'CRITICAL_OVERDUE';

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border transition-all shadow-2xs space-y-2.5 ${
                    isYesterday
                      ? 'bg-amber-50/50 border-amber-300 hover:border-amber-400'
                      : isCritical
                      ? 'bg-red-50/40 border-red-300 hover:border-red-400'
                      : isToday
                      ? 'bg-blue-50/40 border-blue-200 hover:border-blue-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Top Row: Vehicle Number + Amount + Aging Badge */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white font-mono font-bold text-xs shadow-2xs flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-amber-400" />
                        <span>{item.vehicle_number}</span>
                      </span>

                      {/* Aging Badge */}
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${
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

                    <div className="text-right">
                      <span className="text-sm font-black font-mono text-red-600">
                        ₹{(parseFloat(item.sale_price) || 0).toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-slate-400 block">Balance Due</span>
                    </div>
                  </div>

                  {/* Customer Info & Fitment Date */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 bg-white/80 p-2.5 rounded-xl border border-slate-100">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 truncate">
                        👤 {item.customer_name || 'Customer'}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3 text-emerald-600" />
                        <span>{item.customer_contact || 'No Phone'}</span>
                      </div>
                    </div>

                    <div className="space-y-0.5 sm:text-right">
                      <div className="text-[11px] text-slate-500">
                        Fitted on: <strong className="font-mono text-slate-800">{item.installation_date}</strong>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        IMEI: <span className="font-mono text-slate-600 select-all">{item.imei_number}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100">
                    
                    {/* Left helper info */}
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <span>Model: {item.device_type_name || 'GPS'}</span>
                    </div>

                    {/* Right Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      
                      {/* WhatsApp Reminder */}
                      <button
                        type="button"
                        onClick={() => handleSendWhatsApp(item)}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                        title="Open WhatsApp with pre-filled payment reminder"
                      >
                        <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>WhatsApp</span>
                      </button>

                      {/* Collect via UPI QR */}
                      <button
                        type="button"
                        onClick={() => setSelectedQrItem(item)}
                        className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
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
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
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

                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onNavigateToPendingPayments) onNavigateToPendingPayments();
              else if (onNavigateToInstallations) onNavigateToInstallations();
            }}
            className="text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span>Open Full Pending Payments Hub</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

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
