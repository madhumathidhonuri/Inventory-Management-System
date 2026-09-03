import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt,
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
  Boxes,
  MapPin,
  Tag
} from 'lucide-react';
import {
  fetchDevicePayments,
  fetchDevicePaymentsSummary,
  getDevicePaymentsExportUrl
} from '../services/api';
import DeviceAmountModal from '../components/DeviceAmountModal';
import { useAuth } from '../context/AuthContext';

export default function DevicePaymentsPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL'); // 'ALL' | 'RECEIVED' | 'PENDING'
  const [selectedPaymentMode, setSelectedPaymentMode] = useState('');
  const [selectedStockPlace, setSelectedStockPlace] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);

  // Copy UTR state
  const [copiedUtr, setCopiedUtr] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        search,
        payment_status: selectedStatus,
        payment_mode: selectedPaymentMode,
        stock_place: selectedStockPlace
      };

      const [listRes, sumRes] = await Promise.all([
        fetchDevicePayments(params),
        fetchDevicePaymentsSummary()
      ]);

      setDevices(listRes.data || []);
      setSummary(sumRes.summary || null);
    } catch (err) {
      setError(err.message || 'Failed to load stock device amounts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedStatus, selectedPaymentMode, selectedStockPlace]);

  const handleOpenEditModal = (device) => {
    setSelectedDevice(device);
    setModalOpen(true);
  };

  const handleCopyUtr = (utr) => {
    if (!utr) return;
    navigator.clipboard.writeText(utr);
    setCopiedUtr(utr);
    setTimeout(() => setCopiedUtr(''), 2000);
  };

  const handleSendWhatsAppReceipt = (item) => {
    if (!item.customer_phone) {
      alert('No customer phone number recorded for this device.');
      return;
    }

    let phone = item.customer_phone.replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;

    const amt = Number(item.device_amount || 0);

    const message = `*PAYMENT ACKNOWLEDGEMENT — FUELTRACKS TECHNOLOGIES* 🚗✨\n\n` +
      `Dear *${item.customer_name || 'Customer'}*,\n\n` +
      `We acknowledge the payment for GPS tracking device:\n\n` +
      `📌 *Device Model:* ${item.device_type_name}\n` +
      `🔢 *IMEI Number:* ${item.imei_number}\n` +
      (item.vehicle_number ? `🚗 *Vehicle Number:* ${item.vehicle_number}\n` : '') +
      `💰 *Amount Paid:* ₹${amt.toLocaleString('en-IN')}\n` +
      `💳 *Payment Mode:* ${item.payment_mode || 'UPI'}\n` +
      (item.utr_number ? `🧾 *UTR / Reference:* ${item.utr_number}\n` : '') +
      `📅 *Date:* ${item.payment_date || new Date().toISOString().split('T')[0]}\n\n` +
      `Thank you for partnering with *FuelTracks Technologies*! 🚀`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const exportUrl = getDevicePaymentsExportUrl({
    search,
    payment_status: selectedStatus,
    payment_mode: selectedPaymentMode,
    stock_place: selectedStockPlace
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
              Device Amounts & Payments (Stock Inventory)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time synchronization with Stock Inventory: View and update device costs, payment statuses, and UTRs.
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
            <span>Export Device Amounts Sheet</span>
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
        {/* Total Stock Amount */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Inventory Value</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              ₹{(summary?.total_stock_amount || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Across {summary?.total_devices || 0} inventory units
            </div>
          </div>
        </div>

        {/* Amount Received */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payments Received</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-700">
              ₹{(summary?.total_received_amount || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
              {summary?.realization_rate_pct || 0}% realized ({summary?.received_count || 0} units paid)
            </div>
          </div>
        </div>

        {/* Amount Pending */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payments Pending</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-rose-600">
              ₹{(summary?.total_pending_amount || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {summary?.pending_count || 0} units unpaid
            </div>
          </div>
        </div>

        {/* Units Realization Status */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Realization Status</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-emerald-700 text-base">{summary?.received_count || 0}</span>
              <p className="text-[10px] text-slate-400">Received</p>
            </div>
            <div>
              <span className="font-bold text-rose-600 text-base">{summary?.pending_count || 0}</span>
              <p className="text-[10px] text-slate-400">Pending</p>
            </div>
            <div>
              <span className="font-bold text-blue-700 text-base">{summary?.total_devices || 0}</span>
              <p className="text-[10px] text-slate-400">Total Units</p>
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
              placeholder="Search by IMEI, Vehicle, Customer, Stock Place, or UTR..."
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

          {/* Payment Mode Selector */}
          <select
            value={selectedPaymentMode}
            onChange={(e) => setSelectedPaymentMode(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">All Payment Modes</option>
            <option value="UPI">UPI</option>
            <option value="CASH">Cash</option>
            <option value="BANK">Bank Transfer</option>
            <option value="CHEQUE">Cheque</option>
          </select>
        </div>

        {/* Status Pill Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[11px] font-semibold text-slate-400 uppercase mr-1">Payment Status:</span>
          <button
            onClick={() => setSelectedStatus('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              selectedStatus === 'ALL'
                ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Stock ({devices.length})
          </button>
          <button
            onClick={() => setSelectedStatus('RECEIVED')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
              selectedStatus === 'RECEIVED'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            Payment Received ({summary?.received_count || 0})
          </button>
          <button
            onClick={() => setSelectedStatus('PENDING')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
              selectedStatus === 'PENDING'
                ? 'bg-rose-600 text-white border-rose-600 shadow-2xs font-semibold'
                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
            }`}
          >
            Payment Pending ({summary?.pending_count || 0})
          </button>
        </div>
      </div>

      {/* Stock Devices Amounts Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">IMEI Number</th>
                <th className="py-3 px-4">Device Model</th>
                <th className="py-3 px-4">Stock Place / Dealer</th>
                <th className="py-3 px-4">Vehicle / Customer</th>
                <th className="py-3 px-4">Device Amount (₹)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Payment Mode</th>
                <th className="py-3 px-4">UTR / Ref No.</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
                    <span>Loading devices from stock inventory...</span>
                  </td>
                </tr>
              ) : devices.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
                    <p className="font-medium text-slate-600">No inventory devices found</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try adjusting your filters or search keywords.</p>
                  </td>
                </tr>
              ) : (
                devices.map((item) => {
                  const amt = Number(item.device_amount || 0);
                  const isReceived = item.payment_status === 'RECEIVED';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* IMEI Number */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {item.imei_number}
                        </span>
                      </td>

                      {/* Device Model */}
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-700">
                        {item.device_type_name}
                      </td>

                      {/* Stock Place */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 text-[11px]">
                          <MapPin className="w-3 h-3 text-blue-500" />
                          <span>{item.stock_place}</span>
                        </span>
                      </td>

                      {/* Vehicle / Customer */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.vehicle_number ? (
                          <div className="font-mono font-bold text-slate-900">{item.vehicle_number}</div>
                        ) : null}
                        <div className="text-[11px] text-slate-500">{item.customer_name || '-'}</div>
                      </td>

                      {/* Device Amount */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-900 text-sm">
                          ₹{amt.toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          isReceived
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {isReceived ? 'RECEIVED' : 'PENDING'}
                        </span>
                      </td>

                      {/* Payment Mode */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.payment_mode ? (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">
                            {item.payment_mode}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* UTR */}
                      <td className="py-3 px-4 whitespace-nowrap">
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
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition-all shadow-2xs"
                            title="Enter / Edit Device Amount & Payment"
                          >
                            <DollarSign className="w-3 h-3" />
                            <span>Enter / Edit</span>
                          </button>

                          {isReceived && item.customer_phone && (
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

      {/* Device Amount Quick Modal */}
      <DeviceAmountModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        device={selectedDevice}
        onSuccess={() => {
          setSuccessMsg('Device amount & payment updated successfully in Stock Inventory');
          loadData();
          setTimeout(() => setSuccessMsg(''), 4000);
        }}
      />
    </div>
  );
}
