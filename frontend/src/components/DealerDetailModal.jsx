import React, { useState, useEffect } from 'react';
import { 
  X, Store, MapPin, Phone, Mail, Boxes, Wrench, Clock, CheckCircle2, 
  AlertCircle, ChevronRight, Search, Download, ExternalLink, QrCode, 
  CreditCard, ArrowRight, Truck, RefreshCw, Send, Check, Receipt
} from 'lucide-react';
import { fetchDealerSummary, updateQuickPayment } from '../services/api';
import { buildCustomerCredentialsWhatsAppMessage, buildPaymentDueReminderWhatsAppMessage } from '../utils/whatsapp';
import FitmentReceiptModal from './FitmentReceiptModal';
import ConsolidatedReminderModal from './ConsolidatedReminderModal';

export default function DealerDetailModal({ isOpen, onClose, dealerName, onOpenDeviceCard }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('devices'); // 'devices' | 'models' | 'dispatches'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'WITH_DEALER' | 'INSTALLED'
  const [searchQuery, setSearchQuery] = useState('');
  const [activePaymentMenuId, setActivePaymentMenuId] = useState(null);
  const [selectedReceiptDevice, setSelectedReceiptDevice] = useState(null);
  const [updatingPaymentId, setUpdatingPaymentId] = useState(null);
  const [consolidatedModalData, setConsolidatedModalData] = useState(null);

  useEffect(() => {
    if (isOpen && dealerName) {
      loadSummary(dealerName);
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, dealerName]);

  const loadSummary = async (name) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDealerSummary(name);
      if (res.success) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to load dealer summary');
      }
    } catch (err) {
      setError(err.message || 'Failed to load dealer summary');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const dealer = data?.dealer || {};
  const kpis = data?.kpis || {};
  const models = data?.models || [];
  const devices = data?.devices || [];
  const dispatches = data?.dispatches || [];

  const extractVehicleNo = (d) => {
    if (d.vehicle_number && d.vehicle_number !== '-') return d.vehicle_number;
    const attrs = d.additional_attributes || {};
    return attrs['VEHICLE NUMBER'] || attrs['Vehicle Number'] || attrs['VEHICLE NO'] || attrs['Vehicle No'] || attrs['vehicle_number'] || attrs['REG NO'] || attrs['Reg No'] || '-';
  };

  const extractCustName = (d) => {
    if (d.customer_name && d.customer_name !== '-') return d.customer_name;
    const attrs = d.additional_attributes || {};
    return attrs['CUSTOMER NAME'] || attrs['Customer Name'] || attrs['CERTIFICATE ISSUED TO'] || attrs['Certificate Issued To'] || '-';
  };

  const extractCustPhone = (d) => {
    if (d.customer_phone && d.customer_phone !== '-') return d.customer_phone;
    const attrs = d.additional_attributes || {};
    return attrs['CUSTOMER PHONE NUMBER'] || attrs['Customer Phone Number'] || attrs['Primary Mobile'] || attrs['PRIMARY MOBILE'] || attrs['Phone'] || attrs['phone_number'] || '-';
  };

  const filteredDevices = devices.filter(d => {
    if (statusFilter !== 'ALL' && d.current_status !== statusFilter) return false;
    const veh = extractVehicleNo(d).toLowerCase();
    const cust = extractCustName(d).toLowerCase();
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const imei = (d.imei_number || '').toLowerCase();
      const model = (d.device_type_name || '').toLowerCase();
      return imei.includes(q) || model.includes(q) || veh.includes(q) || cust.includes(q);
    }
    return true;
  });

  const handleExportCsv = () => {
    if (!devices || devices.length === 0) return;
    const headers = ['IMEI Number', 'Model', 'Status', 'Vehicle Number', 'Customer Name', 'Phone', 'Payment Status', 'Amount / Cost', 'Installation Date'];
    const rows = devices.map(d => [
      `"${d.imei_number}"`,
      `"${d.device_type_name || ''}"`,
      `"${d.current_status}"`,
      `"${extractVehicleNo(d)}"`,
      `"${extractCustName(d)}"`,
      `"${extractCustPhone(d)}"`,
      `"${d.payment_status || '-'}"`,
      `"${d.cost ? `₹${d.cost}` : '-'}"`,
      `"${d.installation_date || '-'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${dealer.name || 'Dealer'}_Stock_Summary_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleQuickPayment = async (devId, status, mode = '') => {
    setUpdatingPaymentId(devId);
    try {
      const res = await updateQuickPayment(devId, {
        payment_status: status,
        payment_mode: mode
      });
      if (res.success) {
        await loadSummary(dealerName);
      }
    } catch (err) {
      alert(`Failed to update payment: ${err.message}`);
    } finally {
      setUpdatingPaymentId(null);
      setActivePaymentMenuId(null);
    }
  };

  const handleSendPaymentReminder = (device) => {
    const custPhone = extractCustPhone(device);
    const custName = extractCustName(device);
    const cleanDigits = String(custPhone || '').replace(/[^0-9]/g, '');
    const valid10Phone = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '';
    
    let listToRemind = [device];

    // If device has customer phone number, group ALL other pending devices matching the EXACT SAME PHONE NUMBER
    if (valid10Phone) {
      const samePhonePending = devices.filter(d => {
        const isPaid = String(d.payment_status || '').toUpperCase().includes('REC');
        if (isPaid) return false;
        const dPhone = extractCustPhone(d);
        const dDigits = String(dPhone || '').replace(/[^0-9]/g, '');
        const d10 = dDigits.length >= 10 ? dDigits.slice(-10) : '';
        return d10 === valid10Phone;
      });

      if (samePhonePending.length > 0) {
        listToRemind = samePhonePending;
      }
    }

    setConsolidatedModalData({
      customerName: custName !== 'Fuelview' && custName !== 'Customer' ? custName : (valid10Phone ? `Customer (${valid10Phone})` : 'Customer'),
      phone: valid10Phone || custPhone || '',
      vehicles: listToRemind,
      mode: 'REMINDER',
      stockPlace: dealerName
    });
  };

  const handleWhatsAppDealer = () => {
    if (!dealer.phone || dealer.phone === '-') return;
    const cleanPhone = String(dealer.phone).replace(/[^0-9]/g, '');
    const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = `Hello ${dealer.name},\n\nThis is FuelTracks Admin.\n\nYour Current Stock Summary:\n- Total Dispatched: ${kpis.total_sent || 0} Units\n- In Stock: ${kpis.with_dealer || 0} Units\n- Installed: ${kpis.installed || 0} Units (${kpis.install_rate || 0}% Completion)\n\nThank you!`;
    window.open(`https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">{dealerName}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  Dealer Partner Dossier
                </span>
              </div>
              <p className="text-xs text-slate-400">Stock Dispatches, Vehicle Installations & Commercial Metrics</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={loading || !data}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download Dealer Stock CSV Statement"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Export Statement</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 bg-slate-50/50">
          {loading ? (
            <div className="py-24 text-center text-xs text-slate-500 space-y-2">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="font-medium">Aggregating dealer metrics and inventory...</p>
            </div>
          ) : error ? (
            <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-2">
              <p className="text-sm font-bold text-red-800">{error}</p>
              <button 
                onClick={() => loadSummary(dealerName)}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl"
              >
                Retry
              </button>
            </div>
          ) : data ? (
            <>
              {/* DEALER PROFILE CARD */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">{dealer.name || dealerName}</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      Authorized Dealer
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-indigo-500" /> {dealer.region || 'Regional Hub'}
                    </span>
                    {dealer.phone && dealer.phone !== '-' && (
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="w-3.5 h-3.5 text-emerald-600" /> {dealer.phone}
                      </span>
                    )}
                    {dealer.email && dealer.email !== '-' && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-blue-500" /> {dealer.email}
                      </span>
                    )}
                  </div>
                </div>

                {dealer.phone && dealer.phone !== '-' && (
                  <button
                    onClick={handleWhatsAppDealer}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer shrink-0"
                  >
                    <span>💬</span> WhatsApp Stock Summary
                  </button>
                )}
              </div>

              {/* 4 CORE KPI METRIC CARDS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Total Sent */}
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Boxes className="w-3.5 h-3.5 text-indigo-600" /> Total Sent
                  </span>
                  <div className="text-2xl font-bold font-mono text-slate-900">{kpis.total_sent || 0}</div>
                  <span className="text-[10px] text-slate-500 block">Total dispatched units</span>
                </div>

                {/* 2. In Stock with Dealer */}
                <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-200 shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                    <Store className="w-3.5 h-3.5 text-blue-600" /> In Dealer Stock
                  </span>
                  <div className="text-2xl font-bold font-mono text-blue-900">{kpis.with_dealer || 0}</div>
                  <span className="text-[10px] text-blue-600 block">Available for fitment</span>
                </div>

                {/* 3. Installed in Vehicles */}
                <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200 shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                    <Wrench className="w-3.5 h-3.5 text-emerald-600" /> Installed
                  </span>
                  <div className="text-2xl font-bold font-mono text-emerald-900">{kpis.installed || 0}</div>
                  <span className="text-[10px] text-emerald-700 block">{kpis.install_rate || 0}% Installation Rate</span>
                </div>

                {/* 4. Payment Collection */}
                <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-200 shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-purple-600" /> Collection
                  </span>
                  <div className="text-xl font-bold font-mono text-purple-950">₹{kpis.payment_received_amount ? kpis.payment_received_amount.toLocaleString('en-IN') : 0}</div>
                  <span className="text-[10px] text-purple-700 block">{kpis.payment_received_count || 0} Paid / {kpis.payment_pending_count || 0} Pending</span>
                </div>
              </div>

              {/* MODEL WISE ALLOCATION BREAKDOWN */}
              <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-indigo-600" />
                    Device Stock Breakdown by Model
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">Model Split</span>
                </div>

                {models.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">No model allocations found for this dealer.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {models.map(m => (
                      <div key={m.model} className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-xs">{m.model}</span>
                          <span className="font-mono font-bold text-slate-800 text-xs">{m.total} Units</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>In Stock: <strong className="text-blue-700 font-mono">{m.in_stock}</strong></span>
                          <span>Installed: <strong className="text-emerald-700 font-mono">{m.installed}</strong></span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden flex">
                          <div
                            className="bg-emerald-500 h-1.5"
                            style={{ width: `${m.total > 0 ? (m.installed / m.total) * 100 : 0}%` }}
                            title={`Installed: ${m.installed}`}
                          />
                          <div
                            className="bg-blue-500 h-1.5"
                            style={{ width: `${m.total > 0 ? (m.in_stock / m.total) * 100 : 0}%` }}
                            title={`In Stock: ${m.in_stock}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* TABS: ALLOCATED DEVICES VS DISPATCH HISTORY */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab('devices')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'devices'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Allocated Devices ({devices.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('dispatches')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'dispatches'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Dispatch Vouchers ({dispatches.length})
                    </button>
                  </div>

                  {activeTab === 'devices' && (
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search IMEI, Vehicle, Customer..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-lg text-xs w-48 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="p-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                      >
                        <option value="ALL">All Status</option>
                        <option value="WITH_DEALER">In Dealer Stock</option>
                        <option value="INSTALLED">Installed in Vehicle</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* TAB 1: ALLOCATED DEVICES TABLE */}
                {activeTab === 'devices' && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto max-h-[300px]">
                      {filteredDevices.length === 0 ? (
                        <div className="text-center py-10 text-xs text-slate-400">
                          No matching devices found for this dealer.
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100/90 sticky top-0 z-10 text-slate-700 font-bold border-b border-slate-200">
                            <tr>
                              <th className="p-3">IMEI & Model</th>
                              <th className="p-3">Status</th>
                              <th className="p-3">Vehicle Number</th>
                              <th className="p-3">Customer Details</th>
                              <th className="p-3">Payment</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredDevices.map(d => (
                              <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-3 font-mono">
                                  <button
                                    onClick={() => onOpenDeviceCard && onOpenDeviceCard(d.imei_number)}
                                    className="font-bold text-indigo-700 hover:text-indigo-900 hover:underline flex items-center gap-1 cursor-pointer"
                                    title="View Device Specification Card"
                                  >
                                    <QrCode className="w-3.5 h-3.5 text-slate-400" />
                                    <span>{d.imei_number}</span>
                                  </button>
                                  <div className="text-[10px] text-slate-400">{d.device_type_name}</div>
                                </td>

                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    d.current_status === 'INSTALLED'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {d.current_status.replace('_', ' ')}
                                  </span>
                                </td>

                                <td className="p-3 font-mono font-semibold text-slate-800">
                                  {(() => {
                                    const vNo = extractVehicleNo(d);
                                    return vNo !== '-' ? (
                                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                                        {vNo}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    );
                                  })()}
                                </td>

                                <td className="p-3">
                                  <div className="font-semibold text-slate-900">{extractCustName(d)}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">{extractCustPhone(d)}</div>
                                </td>

                                <td className="p-3 relative">
                                  <div className="flex flex-col gap-1 items-start">
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setActivePaymentMenuId(activePaymentMenuId === d.id ? null : d.id)}
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                                          d.payment_status === 'RECEIVED'
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                            : d.payment_status === 'PENDING'
                                            ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                            : 'bg-slate-100 text-slate-600 border-slate-200'
                                        }`}
                                        title="Click to toggle or record payment mode"
                                      >
                                        {updatingPaymentId === d.id ? (
                                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                        ) : d.payment_status === 'RECEIVED' ? (
                                          <Check className="w-2.5 h-2.5" />
                                        ) : (
                                          <Clock className="w-2.5 h-2.5" />
                                        )}
                                        <span>{d.payment_status}</span>
                                      </button>

                                      {/* WhatsApp payment due reminder for pending units */}
                                      {d.payment_status !== 'RECEIVED' && extractCustPhone(d) !== '-' && (
                                        <button
                                          type="button"
                                          onClick={() => handleSendPaymentReminder(d)}
                                          className="p-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold border border-emerald-200 transition-colors cursor-pointer flex items-center gap-0.5"
                                          title="Send Payment Due Reminder on WhatsApp"
                                        >
                                          <span>💬 Remind</span>
                                        </button>
                                      )}
                                    </div>

                                    {d.cost > 0 && (
                                      <span className="text-[11px] font-mono font-semibold text-slate-700">
                                        ₹{d.cost.toLocaleString('en-IN')}
                                      </span>
                                    )}

                                    {/* Quick Payment Status Popover */}
                                    {activePaymentMenuId === d.id && (
                                      <div className="absolute left-0 top-12 z-30 w-52 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 space-y-1 animate-in fade-in duration-150">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                                          Update Payment Status
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleQuickPayment(d.id, 'RECEIVED', 'PhonePe / GPay')}
                                          className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold text-emerald-800 hover:bg-emerald-50 flex items-center justify-between cursor-pointer"
                                        >
                                          <span>✅ Paid (PhonePe / GPay)</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleQuickPayment(d.id, 'RECEIVED', 'Bank Transfer')}
                                          className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold text-emerald-800 hover:bg-emerald-50 flex items-center justify-between cursor-pointer"
                                        >
                                          <span>🏦 Paid (Bank Transfer)</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleQuickPayment(d.id, 'RECEIVED', 'Cash')}
                                          className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold text-emerald-800 hover:bg-emerald-50 flex items-center justify-between cursor-pointer"
                                        >
                                          <span>💵 Paid (Cash)</span>
                                        </button>
                                        <div className="border-t border-slate-100 my-0.5" />
                                        <button
                                          type="button"
                                          onClick={() => handleQuickPayment(d.id, 'PENDING', '')}
                                          className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold text-amber-800 hover:bg-amber-50 flex items-center justify-between cursor-pointer"
                                        >
                                          <span>⏳ Mark Pending</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>

                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedReceiptDevice({
                                        ...d,
                                        stock_place: dealer.name || dealerName
                                      })}
                                      className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200 transition-colors cursor-pointer flex items-center gap-1"
                                      title="Generate Official Fitment & Payment Receipt"
                                    >
                                      <span>🧾 Receipt</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onOpenDeviceCard && onOpenDeviceCard(d.imei_number)}
                                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                      title="View Device Passport Card"
                                    >
                                      <span>Details</span>
                                      <ChevronRight className="w-3 h-3" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: DISPATCH VOUCHERS TABLE */}
                {activeTab === 'dispatches' && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto max-h-[300px]">
                      {dispatches.length === 0 ? (
                        <div className="text-center py-10 text-xs text-slate-400">
                          No dispatch vouchers found for this dealer.
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100/90 sticky top-0 z-10 text-slate-700 font-bold border-b border-slate-200">
                            <tr>
                              <th className="p-3">Voucher #</th>
                              <th className="p-3">Dispatch Date</th>
                              <th className="p-3">Quantity</th>
                              <th className="p-3">Dispatched By</th>
                              <th className="p-3">Destination</th>
                              <th className="p-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {dispatches.map(dsp => (
                              <tr key={dsp.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-3 font-mono font-bold text-slate-900">#DSP-{dsp.id}</td>
                                <td className="p-3 text-slate-500 font-mono text-[11px]">{dsp.dispatch_date}</td>
                                <td className="p-3 font-mono font-bold text-indigo-700">{dsp.device_count} Units</td>
                                <td className="p-3 font-medium text-slate-700">{dsp.dispatched_by || 'Warehouse'}</td>
                                <td className="p-3 text-slate-600">{dsp.location}</td>
                                <td className="p-3">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    {dsp.status || 'DISPATCHED'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

      </div>

      {/* Official Fitment Slip & Payment Receipt Modal */}
      <FitmentReceiptModal
        isOpen={Boolean(selectedReceiptDevice)}
        onClose={() => setSelectedReceiptDevice(null)}
        deviceData={selectedReceiptDevice}
      />

      {/* Consolidated Multi-Vehicle Payment Reminder & Confirmation Modal */}
      <ConsolidatedReminderModal
        isOpen={Boolean(consolidatedModalData)}
        onClose={() => setConsolidatedModalData(null)}
        initialCustomerName={consolidatedModalData?.customerName || ''}
        initialPhone={consolidatedModalData?.phone || ''}
        initialVehicles={consolidatedModalData?.vehicles || []}
        initialMode={consolidatedModalData?.mode || 'REMINDER'}
        stockPlace={dealerName || 'FuelTracks Central'}
      />
    </div>
  );
}
