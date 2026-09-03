import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  Search,
  Filter,
  Download,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Car,
  User,
  Phone,
  Send,
  RefreshCw,
  Copy,
  Check,
  X,
  Edit2,
  DollarSign,
  TrendingUp,
  Percent,
  Receipt,
  Layers,
  ArrowUpDown
} from 'lucide-react';
import {
  fetchDevicePayments,
  fetchDevicePaymentsSummary,
  updateDevicePayment,
  getDevicePaymentsExportUrl
} from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function DevicePaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL'); // 'ALL' | 'PAID' | 'PARTIAL' | 'PENDING'
  const [selectedPaymentMode, setSelectedPaymentMode] = useState('');
  const [datePreset, setDatePreset] = useState('THIS_MONTH');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Record Payment Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [sendWhatsAppOnSave, setSendWhatsAppOnSave] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Copy UTR state
  const [copiedUtr, setCopiedUtr] = useState('');

  useEffect(() => {
    applyDatePreset('THIS_MONTH');
  }, []);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === 'TODAY') {
      const todayStr = now.toISOString().split('T')[0];
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      setStartDate(firstDay);
      setEndDate(lastDay);
    } else if (preset === 'LAST_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      setStartDate(firstDay);
      setEndDate(lastDay);
    } else if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        search,
        payment_status: selectedStatus,
        payment_mode: selectedPaymentMode,
        startDate,
        endDate
      };

      const [listRes, sumRes] = await Promise.all([
        fetchDevicePayments(params),
        fetchDevicePaymentsSummary({ startDate, endDate })
      ]);

      setPayments(listRes.data || []);
      setSummary(sumRes.summary || null);
    } catch (err) {
      setError(err.message || 'Failed to load device payments data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedStatus, selectedPaymentMode, startDate, endDate]);

  const handleOpenPaymentModal = (item) => {
    setActiveItem(item);
    // If not paid yet, default to full sale price, otherwise current amount paid
    const defaultPaid = item.amount_paid > 0 ? item.amount_paid : item.sale_price;
    setAmountPaid(defaultPaid || '');
    setPaymentMode(item.payment_mode || 'UPI');
    setPaymentDate(item.payment_date || new Date().toISOString().split('T')[0]);
    setUtrNumber(item.utr_number || '');
    setPaymentRemarks(item.payment_remarks || '');
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    setFormError('');

    const numPaid = parseFloat(amountPaid);
    if (isNaN(numPaid) || numPaid < 0) {
      setFormError('Please enter a valid non-negative amount');
      return;
    }

    try {
      setSubmitting(true);
      await updateDevicePayment(activeItem.id, {
        amount_paid: numPaid,
        payment_mode: paymentMode,
        payment_date: paymentDate,
        utr_number: utrNumber,
        payment_remarks: paymentRemarks
      });

      setSuccessMsg(`Payment recorded for vehicle ${activeItem.vehicle_number}`);
      setModalOpen(false);

      // Auto Send WhatsApp if enabled
      if (sendWhatsAppOnSave && activeItem.customer_contact) {
        handleSendWhatsAppReceipt({
          ...activeItem,
          amount_paid: numPaid,
          payment_mode: paymentMode,
          utr_number: utrNumber
        });
      }

      loadData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setFormError(err.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendWhatsAppReceipt = (item) => {
    if (!item.customer_contact) {
      alert('No customer contact number available for WhatsApp.');
      return;
    }

    let phone = item.customer_contact.replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;

    const billed = Number(item.sale_price || 0);
    const paid = Number(item.amount_paid || 0);
    const balance = Math.max(0, billed - paid);

    const message = `*PAYMENT ACKNOWLEDGEMENT — FUELTRACKS TECHNOLOGIES* 🚗✨\n\n` +
      `Dear *${item.customer_name || 'Customer'}*,\n\n` +
      `We have received your payment for GPS device installation:\n\n` +
      `📌 *Vehicle Number:* ${item.vehicle_number}\n` +
      `🔢 *IMEI Number:* ${item.imei_number}\n` +
      `💰 *Total Billed:* ₹${billed.toLocaleString('en-IN')}\n` +
      `✅ *Amount Received:* ₹${paid.toLocaleString('en-IN')}\n` +
      `💳 *Payment Mode:* ${item.payment_mode || 'UPI'}\n` +
      (item.utr_number ? `🧾 *UTR / Ref:* ${item.utr_number}\n` : '') +
      `⏳ *Balance Due:* ₹${balance.toLocaleString('en-IN')}\n` +
      `📅 *Payment Date:* ${item.payment_date || new Date().toISOString().split('T')[0]}\n\n` +
      `Thank you for choosing *FuelTracks Technologies* for your fleet telematics needs! 🚀\n` +
      `_For support, contact: +91 99999 99999_`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleCopyUtr = (utr) => {
    if (!utr) return;
    navigator.clipboard.writeText(utr);
    setCopiedUtr(utr);
    setTimeout(() => setCopiedUtr(''), 2000);
  };

  const exportUrl = getDevicePaymentsExportUrl({
    search,
    payment_status: selectedStatus,
    payment_mode: selectedPaymentMode,
    startDate,
    endDate
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-sm">
              <Receipt className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Device Payments & Collections
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time ledger of payments received for installed devices with UTR tracking and WhatsApp receipts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshing(true); loadData(); }}
            className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all shadow-2xs"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <a
            href={exportUrl}
            download
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 hover:text-emerald-600 transition-all shadow-2xs"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export Payments Sheet</span>
          </a>
        </div>
      </div>

      {/* Success / Error Alerts */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 Telemetry KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Collected */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payments Collected</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-700">
              ₹{(summary?.total_collected || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
              {summary?.collection_rate_pct || 0}% of ₹{(summary?.total_billed || 0).toLocaleString('en-IN')} Billed
            </div>
          </div>
        </div>

        {/* Pending Receivables */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Receivables</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-rose-600">
              ₹{(summary?.pending_balance || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {summary?.pending_count || 0} unpaid / partial vehicles
            </div>
          </div>
        </div>

        {/* Collected Today */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Collected Today</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-blue-700">
              ₹{(summary?.today_collected || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-blue-600 font-medium mt-0.5">
              Fresh daily collections
            </div>
          </div>
        </div>

        {/* Realization Status Count */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Units Status</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Car className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-emerald-700 text-base">{summary?.paid_count || 0}</span>
              <p className="text-[10px] text-slate-400">Fully Paid</p>
            </div>
            <div>
              <span className="font-bold text-amber-600 text-base">{summary?.partial_count || 0}</span>
              <p className="text-[10px] text-slate-400">Partial</p>
            </div>
            <div>
              <span className="font-bold text-rose-600 text-base">{summary?.pending_count || 0}</span>
              <p className="text-[10px] text-slate-400">Pending</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Vehicle No, Customer, Phone, IMEI, or UTR..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Date Presets */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => applyDatePreset('TODAY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                datePreset === 'TODAY'
                  ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => applyDatePreset('THIS_MONTH')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                datePreset === 'THIS_MONTH'
                  ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => applyDatePreset('LAST_MONTH')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                datePreset === 'LAST_MONTH'
                  ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Last Month
            </button>
            <button
              onClick={() => applyDatePreset('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                datePreset === 'ALL'
                  ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
          </div>

          {/* Payment Mode Selector */}
          <select
            value={selectedPaymentMode}
            onChange={(e) => setSelectedPaymentMode(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">All Payment Modes</option>
            <option value="UPI">UPI</option>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CHEQUE">Cheque</option>
          </select>
        </div>

        {/* Status Pill Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[11px] font-semibold text-slate-400 uppercase mr-1">Status:</span>
          <button
            onClick={() => setSelectedStatus('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              selectedStatus === 'ALL'
                ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Installations ({payments.length})
          </button>
          <button
            onClick={() => setSelectedStatus('PAID')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
              selectedStatus === 'PAID'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            Fully Paid ({summary?.paid_count || 0})
          </button>
          <button
            onClick={() => setSelectedStatus('PARTIAL')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
              selectedStatus === 'PARTIAL'
                ? 'bg-amber-600 text-white border-amber-600 shadow-2xs font-semibold'
                : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
            }`}
          >
            Partial Payment ({summary?.partial_count || 0})
          </button>
          <button
            onClick={() => setSelectedStatus('PENDING')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
              selectedStatus === 'PENDING'
                ? 'bg-rose-600 text-white border-rose-600 shadow-2xs font-semibold'
                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
            }`}
          >
            Unpaid / Pending ({summary?.pending_count || 0})
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Vehicle No</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Device IMEI</th>
                <th className="py-3 px-4">Billed (₹)</th>
                <th className="py-3 px-4">Paid (₹)</th>
                <th className="py-3 px-4">Balance (₹)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Payment Details</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="10" className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
                    <span>Loading device payment records...</span>
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
                    <p className="font-medium text-slate-600">No payment records found</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try adjusting your filters or search keywords.</p>
                  </td>
                </tr>
              ) : (
                payments.map((item) => {
                  const billed = Number(item.sale_price || 0);
                  const paid = Number(item.amount_paid || 0);
                  const balance = Number(item.balance_amount || 0);

                  const isPaid = item.calculated_status === 'PAID';
                  const isPartial = item.calculated_status === 'PARTIAL';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Vehicle Number */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {item.vehicle_number}
                        </span>
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{item.customer_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{item.customer_contact}</div>
                      </td>

                      {/* IMEI & Model */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono text-slate-700 font-medium">{item.imei_number}</div>
                        <div className="text-[10px] text-slate-400">{item.device_type_name || 'GPS Unit'}</div>
                      </td>

                      {/* Billed Amount */}
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-600">
                        ₹{billed.toLocaleString('en-IN')}
                      </td>

                      {/* Amount Paid */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-emerald-700 text-sm">
                          ₹{paid.toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Balance Due */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {balance > 0 ? (
                          <span className="font-bold text-rose-600">
                            ₹{balance.toLocaleString('en-IN')}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-semibold text-[11px] flex items-center gap-1">
                            <Check className="w-3 h-3" /> Nil
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          isPaid
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isPartial
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'PENDING'}
                        </span>
                      </td>

                      {/* Payment Details / UTR */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">
                            {item.payment_mode || 'UPI'}
                          </span>
                          {item.utr_number ? (
                            <button
                              onClick={() => handleCopyUtr(item.utr_number)}
                              title="Click to copy UTR"
                              className="group flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-[10px] font-mono transition-all"
                            >
                              <span>{item.utr_number}</span>
                              {copiedUtr === item.utr_number ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 text-blue-400 group-hover:text-blue-600" />
                              )}
                            </button>
                          ) : (
                            <span className="text-slate-300 text-[11px]">-</span>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        {item.payment_date || item.installation_date}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Record / Update Payment Button */}
                          <button
                            onClick={() => handleOpenPaymentModal(item)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition-all shadow-2xs"
                            title="Record / Update Payment"
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>{paid > 0 ? 'Update' : 'Collect'}</span>
                          </button>

                          {/* WhatsApp Receipt Button */}
                          {item.customer_contact && (
                            <button
                              onClick={() => handleSendWhatsAppReceipt(item)}
                              className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-all shadow-2xs"
                              title="Send WhatsApp Receipt"
                            >
                              <Send className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {modalOpen && activeItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-scaleUp">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Record Device Payment</h3>
                  <p className="text-[11px] text-slate-400">Update payment collection status & UTR</p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Vehicle & Customer Info Banner */}
            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between font-semibold">
                <span className="text-slate-500">Vehicle Number:</span>
                <span className="font-mono text-slate-900 font-bold">{activeItem.vehicle_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="text-slate-800 font-medium">{activeItem.customer_name} ({activeItem.customer_contact})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">IMEI:</span>
                <span className="font-mono text-slate-600">{activeItem.imei_number}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                <span className="text-slate-700">Billed Sale Price:</span>
                <span className="text-slate-900">₹{Number(activeItem.sale_price || 0).toLocaleString('en-IN')}</span>
              </div>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitPayment} className="space-y-4 mt-4 text-xs">
              {/* Amount Paid & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Amount Received (₹) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="0.00"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Payment Mode */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Payment Mode *</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer (IMPS / NEFT)</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>

              {/* UTR / Transaction ID */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  UPI UTR / Transaction Reference No. <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 423987123456 or Bank Ref ID"
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Payment Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Paid in full via GPay..."
                  value={paymentRemarks}
                  onChange={(e) => setPaymentRemarks(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* WhatsApp Auto Send Toggle */}
              {activeItem.customer_contact && (
                <div className="flex items-center gap-2 p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <input
                    type="checkbox"
                    id="waToggle"
                    checked={sendWhatsAppOnSave}
                    onChange={(e) => setSendWhatsAppOnSave(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <label htmlFor="waToggle" className="text-emerald-900 font-medium cursor-pointer">
                    Send WhatsApp payment receipt to customer upon save
                  </label>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm"
                >
                  {submitting ? 'Saving...' : 'Save & Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
