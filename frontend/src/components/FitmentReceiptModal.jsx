import React, { useState } from 'react';
import { X, Send, CheckCircle2, Car, Phone, Calendar, CreditCard, Copy, Check, ShieldCheck } from 'lucide-react';
import { buildPaymentReceivedWhatsAppMessage } from '../utils/whatsapp';

export default function FitmentReceiptModal({ isOpen, onClose, deviceData }) {
  if (!isOpen || !deviceData) return null;

  const [copied, setCopied] = useState(false);

  const {
    imei_number,
    vehicle_number,
    customer_name,
    customer_phone,
    device_type_name,
    certificate_date,
    cost,
    payment_status,
    payment_mode,
    stock_place,
    stockPlace,
    additional_attributes = {}
  } = deviceData;

  const vehNo = vehicle_number && vehicle_number !== '-' ? vehicle_number : additional_attributes['VEHICLE NUMBER'] || additional_attributes['Vehicle Number'] || 'N/A';
  const custName = customer_name && customer_name !== '-' ? customer_name : additional_attributes['CUSTOMER NAME'] || additional_attributes['CERTIFICATE ISSUED TO'] || 'Valued Customer';
  const custPhone = customer_phone && customer_phone !== '-' ? customer_phone : additional_attributes['CUSTOMER PHONE NUMBER'] || additional_attributes['Primary Mobile'] || '';
  const payDate = certificate_date || additional_attributes['PAYMENT RECEIVED DATE'] || additional_attributes['CERTIFICATE ISSUED DATE'] || new Date().toLocaleDateString('en-IN');
  const modelName = device_type_name || additional_attributes['DEVICE NAME'] || 'AIS-140 GPS';
  
  const rawCost = cost || additional_attributes['TOTAL COST'] || additional_attributes['COST'] || additional_attributes['AMOUNT RECEIVED'] || 5000;
  const numCost = parseFloat(String(rawCost).replace(/[^0-9.]/g, '')) || 5000;
  const formattedCost = `₹${numCost.toLocaleString('en-IN')}`;
  
  const payModeLabel = payment_mode || additional_attributes['AMOUNT RECEIVED BY'] || 'UPI / Bank Transfer';

  const { message, url } = buildPaymentReceivedWhatsAppMessage({
    phone: custPhone,
    customerName: custName,
    vehicleNumber: vehNo,
    amount: numCost,
    imei: imei_number,
    paymentMode: payModeLabel,
    paymentDate: payDate
  });

  const handleWhatsAppSend = () => {
    window.open(url, '_blank');
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl space-y-0">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Payment Received Confirmation</h3>
              <p className="text-xs text-emerald-100">Send instant payment acknowledgement to customer</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          
          {/* Main Amount Card */}
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-1">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Amount Received</span>
            <div className="text-3xl font-black font-mono text-emerald-900">{formattedCost}</div>
            <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" /> Payment Verified & Active
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
              <div className="text-slate-400 font-medium text-[10px]">Customer Name</div>
              <div className="font-bold text-slate-900 truncate">{custName}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
              <div className="text-slate-400 font-medium text-[10px]">Mobile Number</div>
              <div className="font-mono font-bold text-slate-900">{custPhone || 'Not set'}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
              <div className="text-slate-400 font-medium text-[10px]">Vehicle Number</div>
              <div className="font-mono font-bold text-blue-700 uppercase">{vehNo}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
              <div className="text-slate-400 font-medium text-[10px]">Device Model / IMEI</div>
              <div className="font-mono font-semibold text-slate-800 truncate" title={imei_number}>
                {imei_number || modelName}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
              <div className="text-slate-400 font-medium text-[10px]">Payment Date</div>
              <div className="font-semibold text-slate-800">{payDate}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
              <div className="text-slate-400 font-medium text-[10px]">Payment Mode</div>
              <div className="font-semibold text-slate-800">{payModeLabel}</div>
            </div>
          </div>

          {/* WhatsApp Message Preview Box */}
          <div className="p-3.5 bg-slate-900 rounded-2xl text-slate-200 text-xs font-mono whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed border border-slate-800 shadow-inner">
            {message}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
            <button
              onClick={handleWhatsAppSend}
              className="w-full sm:flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Send Payment Received on WhatsApp</span>
            </button>

            <button
              onClick={handleCopyText}
              className="w-full sm:w-auto py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
