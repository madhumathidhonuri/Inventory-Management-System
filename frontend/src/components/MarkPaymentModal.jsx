import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  CheckCircle2,
  DollarSign,
  Smartphone,
  Banknote,
  Building2,
  CreditCard,
  FileText,
  Car,
  User,
  Phone,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { updateQuickPayment } from '../services/api';

export default function MarkPaymentModal({
  isOpen,
  onClose,
  item,
  onPaymentSuccess
}) {
  if (!isOpen || !item) return null;

  const totalCost = parseFloat(item.total_sale_price || item.total_cost || item.cost || item.sale_price || 0);
  const previouslyPaid = parseFloat(item.amount_paid || 0);
  const currentPendingDue = parseFloat(item.sale_price || item.pending_amount || (totalCost - previouslyPaid) || 0);

  const [amount, setAmount] = useState(currentPendingDue > 0 ? currentPendingDue : totalCost);
  const [paymentMode, setPaymentMode] = useState('UPI'); // 'UPI' | 'CASH' | 'BANK_TRANSFER' | 'CHEQUE'
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Calculate remaining balance dynamically
  const remainingDue = Math.max(0, currentPendingDue - (parseFloat(amount) || 0));
  const isPartial = remainingDue > 0 && (parseFloat(amount) || 0) < currentPendingDue;
  const isFull = (parseFloat(amount) || 0) >= currentPendingDue;

  const paymentModes = [
    { id: 'UPI', label: 'UPI / GPay / PhonePe', icon: Smartphone, color: 'text-purple-600 bg-purple-50 border-purple-200' },
    { id: 'CASH', label: 'Cash', icon: Banknote, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { id: 'BANK_TRANSFER', label: 'Bank Transfer / IMPS', icon: Building2, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { id: 'CHEQUE', label: 'Cheque / DD', icon: CreditCard, color: 'text-amber-600 bg-amber-50 border-amber-200' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const amtNum = parseFloat(amount) || 0;
    if (amtNum <= 0) {
      setErrorMsg('Please enter a valid amount received');
      setLoading(false);
      return;
    }

    try {
      const res = await updateQuickPayment({
        id: item.device_id || item.id,
        payment_status: isFull ? 'RECEIVED' : 'PARTIAL',
        payment_mode: paymentMode,
        amount_received: previouslyPaid + amtNum,
        payment_remarks: remarks || `Payment of ₹${amtNum.toLocaleString('en-IN')} received via ${paymentMode}${isPartial ? ` (Partial, Balance Due: ₹${remainingDue.toLocaleString('en-IN')})` : ''}`
      });

      if (res.success) {
        if (onPaymentSuccess) {
          onPaymentSuccess(item, paymentMode, amtNum);
        }
        onClose();
      } else {
        setErrorMsg(res.error || 'Failed to record payment');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error recording payment');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in-50 duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col my-auto relative">
        
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 text-white flex items-center justify-center backdrop-blur-xs shadow-inner">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Record Payment Received</h2>
              <p className="text-xs text-emerald-100">Full or Partial payment collection entry</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Vehicle & Customer Summary Card */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="px-3 py-1 rounded-xl bg-slate-900 text-white font-mono font-bold text-xs shadow-2xs flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-amber-400" />
                <span>{item.vehicle_number}</span>
              </span>

              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                Fitment: {item.display_date || item.installation_date || 'N/A'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1 pt-1 border-t border-slate-200/60">
              <div className="text-slate-700 font-medium flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>{item.customer_name || 'Customer'}</span>
              </div>
              <div className="text-slate-500 font-mono flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{item.customer_contact || 'No Phone'}</span>
              </div>
            </div>

            {/* Total Cost & Previous Paid Breakdown */}
            <div className="pt-2 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500 block font-bold uppercase">Total Bill / Cost</span>
                <span className="text-sm font-mono font-black text-slate-900">₹{totalCost.toLocaleString('en-IN')}</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500 block font-bold uppercase">Pending Before This</span>
                <span className="text-sm font-mono font-black text-red-600">₹{currentPendingDue.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Amount Received Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Amount Received (₹)
              </label>
              <span className="text-[11px] font-bold text-slate-500">
                Type received amount for partial/full
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-base">₹</span>
              <input
                type="number"
                min="1"
                max={currentPendingDue || totalCost || undefined}
                step="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-4 py-2.5 text-base font-mono font-black text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                placeholder="Enter amount received"
              />
            </div>

            {/* Live Partial vs Full Settlement Badge */}
            {isPartial ? (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center justify-between animate-fade-in">
                <span>⚠️ Partial Payment: ₹{(parseFloat(amount) || 0).toLocaleString('en-IN')} received</span>
                <span className="px-2 py-0.5 rounded bg-amber-200/70 text-amber-950 font-mono">
                  Remaining Due: ₹{remainingDue.toLocaleString('en-IN')}
                </span>
              </div>
            ) : isFull ? (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between animate-fade-in">
                <span>✅ Full Payment: Complete ₹{currentPendingDue.toLocaleString('en-IN')} received</span>
                <span className="px-2 py-0.5 rounded bg-emerald-200/70 text-emerald-950 font-mono">
                  Remaining Due: ₹0
                </span>
              </div>
            ) : null}
          </div>

          {/* Payment Mode Selector (Cash, UPI, Bank Transfer, Cheque) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Payment Form / Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              {paymentModes.map((mode) => {
                const IconComponent = mode.icon;
                const isSelected = paymentMode === mode.id;

                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setPaymentMode(mode.id)}
                    className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-emerald-500/30'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className={`p-1.5 rounded-xl shrink-0 ${isSelected ? 'bg-white/20 text-white' : mode.color}`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {mode.label}
                      </div>
                      <div className={`text-[10px] ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                        {mode.id === 'CASH' ? 'Physical cash' : mode.id === 'UPI' ? 'Instant digital' : mode.id === 'BANK_TRANSFER' ? 'Direct NEFT/RTGS' : 'Bank instrument'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Remarks */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Transaction Remarks / Reference (Optional)
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. UTR / Cash collected by tech / Notes"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-bold">
              {errorMsg}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (parseFloat(amount) || 0) <= 0}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-emerald-200 transition-all cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Confirm Payment (₹{(parseFloat(amount) || 0).toLocaleString('en-IN')})</span>
            </button>
          </div>

        </form>

      </div>
    </div>,
    document.body
  );
}
