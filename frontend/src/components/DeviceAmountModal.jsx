import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  X,
  Car,
  User,
  MapPin,
  Send,
  Check
} from 'lucide-react';
import { updateDevicePayment } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function DeviceAmountModal({ isOpen, onClose, device, onSuccess }) {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('RECEIVED');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (device && isOpen) {
      setAmount(device.device_amount || device.purchase_price || '');
      setPaymentStatus(device.payment_status === 'RECEIVED' ? 'RECEIVED' : 'PENDING');
      setPaymentMode(device.payment_mode || 'UPI');
      setUtrNumber(device.utr_number || '');
      setPaymentDate(device.payment_date || new Date().toISOString().split('T')[0]);
      setPaymentRemarks(device.payment_remarks || '');
      setFormError('');
    }
  }, [device, isOpen]);

  if (!isOpen || !device) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const numAmt = parseFloat(amount);
    if (isNaN(numAmt) || numAmt < 0) {
      setFormError('Please enter a valid non-negative amount');
      return;
    }

    try {
      setSubmitting(true);
      await updateDevicePayment(device.id, {
        device_amount: numAmt,
        payment_status: paymentStatus,
        payment_mode: paymentStatus === 'RECEIVED' ? paymentMode : '',
        utr_number: utrNumber,
        payment_date: paymentDate,
        payment_remarks: paymentRemarks,
        performed_by: user?.name || 'Staff'
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to update device amount & payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Enter / Edit Device Amount</h3>
              <p className="text-[11px] text-slate-400">Update stock inventory price & payment receipt</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Device Info Dossier */}
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500 font-semibold">IMEI Number:</span>
            <span className="font-mono text-slate-900 font-bold">{device.imei_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Model:</span>
            <span className="text-slate-800 font-medium">{device.device_type_name || 'GPS Tracker'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Stock Place / Dealer:</span>
            <span className="text-blue-700 font-medium">{device.stock_place || device.current_holder_name || 'Warehouse'}</span>
          </div>
          {device.vehicle_number && (
            <div className="flex justify-between">
              <span className="text-slate-500">Vehicle:</span>
              <span className="font-mono text-slate-900 font-bold">{device.vehicle_number}</span>
            </div>
          )}
          {device.customer_name && (
            <div className="flex justify-between">
              <span className="text-slate-500">Customer:</span>
              <span className="text-slate-800">{device.customer_name}</span>
            </div>
          )}
        </div>

        {formError && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-xs">
          {/* Amount & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Device Amount / Price (₹) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">Payment Status *</label>
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPaymentStatus('RECEIVED')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    paymentStatus === 'RECEIVED'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  RECEIVED
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus('PENDING')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    paymentStatus === 'PENDING'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  PENDING
                </button>
              </div>
            </div>
          </div>

          {/* If Received: Payment Mode, UTR & Date */}
          {paymentStatus === 'RECEIVED' && (
            <div className="space-y-3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer (IMPS / NEFT)</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  UPI UTR / Reference No. <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 423987123456 or Bank Ref ID"
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>
          )}

          {/* Remarks */}
          <div>
            <label className="block text-slate-600 font-semibold mb-1">Remarks / Purpose</label>
            <input
              type="text"
              placeholder="e.g. Received full amount via PhonePe..."
              value={paymentRemarks}
              onChange={(e) => setPaymentRemarks(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm"
            >
              {submitting ? 'Saving...' : 'Save to Inventory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
