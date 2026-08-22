import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Printer,
  Share2,
  X,
  CheckCircle2,
  Building,
  User,
  Phone,
  MapPin,
  Calendar,
  Layers,
  Truck,
  ShieldCheck,
  Check,
  Copy
} from 'lucide-react';
import { fetchDispatchChallan, acknowledgeDispatch } from '../services/api';

export default function DeliveryChallanModal({ dispatchId, isOpen, onClose, onAcknowledgeSuccess }) {
  const [challan, setChallan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    if (isOpen && dispatchId) {
      loadChallan();
    }
  }, [isOpen, dispatchId]);

  const loadChallan = async () => {
    setLoading(true);
    try {
      const res = await fetchDispatchChallan(dispatchId);
      if (res.success) {
        setChallan(res.data);
      }
    } catch (err) {
      console.error('Failed to load challan:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    if (!challan) return;
    const phone = (challan.dealer_contact || '').replace(/[^0-9]/g, '');
    const msg = `*📦 FUELTRACKS DELIVERY CHALLAN & STOCK HANDOVER*\n\n` +
      `*Challan No:* ${challan.challan_number}\n` +
      `*Date:* ${new Date(challan.dispatch_date).toLocaleDateString('en-IN')}\n` +
      `*Recipient:* ${challan.dealer_name} (${challan.location})\n` +
      `*Total Units Dispatched:* *${challan.items?.length || challan.device_count} AIS-140 GPS Devices*\n` +
      `*Dispatched By:* ${challan.dispatched_by}\n\n` +
      `📋 *IMEI Serial Checklist (First 5 of ${challan.items?.length || 0}):*\n` +
      (challan.items || []).slice(0, 5).map((it, idx) => `${idx + 1}. IMEI: \`${it.imei_number}\``).join('\n') +
      (challan.items?.length > 5 ? `\n...and ${challan.items.length - 5} more devices.` : '') +
      `\n\n*FuelTracks Technologies Pvt. Ltd.* | Certified Hardware Dispatch`;

    const url = `https://wa.me/${phone ? (phone.startsWith('91') ? phone : '91' + phone) : ''}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const handleAcknowledge = async () => {
    if (!challan) return;
    setAcknowledging(true);
    try {
      const res = await acknowledgeDispatch(challan.dispatch_id, { acknowledged_by: challan.dealer_name });
      if (res.success) {
        await loadChallan();
        if (onAcknowledgeSuccess) onAcknowledgeSuccess();
      }
    } catch (err) {
      alert('Failed to acknowledge: ' + err.message);
    } finally {
      setAcknowledging(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs overflow-y-auto animate-in fade-in-50">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden my-auto">
        
        {/* Header Action Bar */}
        <div className="flex items-center justify-between p-4 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold">Digital Delivery Challan (DCN)</h3>
            {challan?.challan_number && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-400/40">
                {challan.challan_number}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShareWhatsApp}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">WhatsApp Challan</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Challan Document Body */}
        <div className="p-6 overflow-y-auto space-y-6 print:p-0 print:m-0" ref={printRef}>
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <span>Generating Delivery Challan document...</span>
            </div>
          ) : !challan ? (
            <div className="p-12 text-center text-slate-400">
              Challan details could not be loaded.
            </div>
          ) : (
            <div className="space-y-6 border border-slate-200 rounded-2xl p-6 bg-white shadow-2xs">
              
              {/* Company & Challan Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-slate-900 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm">
                      FT
                    </div>
                    <div>
                      <h1 className="text-base font-black text-slate-900 tracking-tight">FUELTRACKS TECHNOLOGIES PVT. LTD.</h1>
                      <p className="text-[10px] text-slate-500 font-medium">AIS-140 GPS & Fleet Telematics Solutions</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2">
                    Central Warehouse Hub • Andhra Pradesh & Telangana<br />
                    Email: support@fueltracks.in • Phone: +91 98480 11223
                  </p>
                </div>

                <div className="text-right sm:self-auto self-start">
                  <span className="inline-block px-3 py-1 bg-slate-900 text-white text-[11px] font-black uppercase rounded-lg tracking-wider mb-2">
                    DELIVERY CHALLAN
                  </span>
                  <div className="text-xs space-y-0.5">
                    <p><strong className="text-slate-700">DCN No:</strong> <span className="font-mono font-bold text-slate-900">{challan.challan_number}</span></p>
                    <p><strong className="text-slate-700">Dispatch Date:</strong> <span className="font-mono text-slate-800">{new Date(challan.dispatch_date).toLocaleDateString('en-IN')}</span></p>
                    <p><strong className="text-slate-700">Transport:</strong> <span className="text-slate-800">{challan.transport_details}</span></p>
                  </div>
                </div>
              </div>

              {/* Sender & Consignee Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <h4 className="font-bold text-slate-500 uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-indigo-600" /> Dispatched By (Consignor)
                  </h4>
                  <p className="font-bold text-slate-900">FuelTracks Central Operations</p>
                  <p className="text-slate-600">Officer: {challan.dispatched_by}</p>
                  <p className="text-slate-600">Location: Central Warehouse</p>
                </div>

                <div>
                  <h4 className="font-bold text-slate-500 uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-emerald-600" /> Received By (Consignee / Dealer)
                  </h4>
                  <p className="font-bold text-slate-900">{challan.dealer_name}</p>
                  <p className="text-slate-600">Phone: {challan.dealer_contact || 'N/A'}</p>
                  <p className="text-slate-600">Region / Destination: {challan.location}</p>
                </div>
              </div>

              {/* Items List Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" /> Dispatched Hardware Serial Checklist ({challan.items?.length || 0} Units)
                  </h4>
                  <span className="text-[10px] font-bold text-slate-500">
                    Category: AIS-140 GPS Trackers
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5 border-b border-r border-slate-200 w-12 text-center">#</th>
                        <th className="p-2.5 border-b border-r border-slate-200">Device Model</th>
                        <th className="p-2.5 border-b border-slate-200 font-mono">IMEI Number (Serial)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {(challan.items || []).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-800 border-r border-slate-100">{item.device_type_name || 'AIS-140 GPS'}</td>
                          <td className="p-2.5 font-mono font-bold text-indigo-950">{item.imei_number}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Handover Conditions & Dual Signature Blocks */}
              <div className="pt-4 border-t border-slate-200 space-y-4">
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-[10px] text-amber-900 leading-relaxed">
                  <strong>Terms of Custody:</strong> The serial numbers listed above have been verified and transferred into the custody of <strong>{challan.dealer_name}</strong>. Stock status is updated to <em>WITH_DEALER</em>. Any damage or discrepancy must be reported within 24 hours.
                </div>

                <div className="grid grid-cols-2 gap-8 pt-6">
                  <div className="border-t border-slate-300 pt-2 text-center">
                    <p className="text-xs font-bold text-slate-800">{challan.dispatched_by}</p>
                    <p className="text-[10px] text-slate-500">Authorized Dispatcher (FuelTracks)</p>
                  </div>

                  <div className="border-t border-slate-300 pt-2 text-center">
                    <p className="text-xs font-bold text-slate-800">{challan.dealer_name}</p>
                    <p className="text-[10px] text-slate-500">
                      {challan.accepted_at ? `Digitally Acknowledged on ${new Date(challan.accepted_at).toLocaleDateString('en-IN')}` : 'Receiver Signature & Stamp'}
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {challan?.accepted_at ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Stock Accepted by Dealer
              </span>
            ) : (
              <span>Pending dealer digital acceptance</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!challan?.accepted_at && (
              <button
                onClick={handleAcknowledge}
                disabled={acknowledging}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{acknowledging ? 'Confirming...' : 'Mark Accepted by Dealer'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
