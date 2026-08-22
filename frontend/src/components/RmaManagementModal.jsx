import React, { useState } from 'react';
import {
  Wrench,
  X,
  AlertTriangle,
  Send,
  Building,
  CheckCircle2,
  RefreshCw,
  FileText,
  Layers,
  ArrowRight
} from 'lucide-react';
import { updateRmaStatus } from '../services/api';

export default function RmaManagementModal({ device, isOpen, onClose, onSuccess }) {
  const [rmaStatus, setRmaStatus] = useState(device?.rma_status || 'FAULTY_REPORTED');
  const [vendorName, setVendorName] = useState(device?.rma_vendor_name || device?.vendor_name || 'Vamosys / Volty OEM');
  const [replacementImei, setReplacementImei] = useState(device?.rma_replacement_imei || '');
  const [notes, setNotes] = useState(device?.rma_notes || '');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !device) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await updateRmaStatus(device.id, {
        rma_status: rmaStatus,
        rma_vendor_name: vendorName.trim(),
        rma_replacement_imei: replacementImei.trim(),
        rma_notes: notes.trim(),
        performed_by: 'Super Admin'
      });
      if (res.success) {
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err) {
      alert('Failed to update RMA: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs overflow-y-auto animate-in fade-in-50">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 my-auto animate-in zoom-in-95">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">RMA & Warranty Return Management</h3>
              <p className="text-xs text-slate-500 font-mono">IMEI: {device.imei_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Device Snapshot Banner */}
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs mb-4 grid grid-cols-2 gap-2">
          <div>
            <span className="text-slate-400 block text-[10px]">Model:</span>
            <span className="font-bold text-slate-800">{device.device_type_name || 'AIS-140 GPS'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Current Holder:</span>
            <span className="font-bold text-slate-800">{device.current_holder_name || 'Central Warehouse'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Vendor OEM:</span>
            <span className="font-bold text-slate-800">{device.vendor_name || 'Direct Entry'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Current Stage:</span>
            <span className="font-bold text-amber-700 uppercase font-mono">{device.rma_status || 'NONE'}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* RMA Lifecycle Stage Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">RMA Lifecycle Stage *</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'FAULTY_REPORTED', label: '1. Faulty Reported', desc: 'Tagged faulty by field/dealer' },
                { id: 'RECEIVED_LAB', label: '2. Received at Lab', desc: 'Physical intake for testing' },
                { id: 'SENT_TO_OEM', label: '3. Sent to OEM Vendor', desc: 'Dispatched to Vamosys/Volty' },
                { id: 'REPLACED', label: '4. Replaced / Restocked', desc: 'New unit received & verified' }
              ].map(stage => (
                <button
                  type="button"
                  key={stage.id}
                  onClick={() => setRmaStatus(stage.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    rmaStatus === stage.id
                      ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-bold">{stage.label}</p>
                  <p className={`text-[10px] mt-0.5 ${rmaStatus === stage.id ? 'text-amber-100' : 'text-slate-400'}`}>{stage.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* OEM Vendor Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">OEM Manufacturer / Service Vendor</label>
            <input
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. Vamosys Technologies / Volty OEM"
              className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Replacement Unit IMEI (If Replaced) */}
          {rmaStatus === 'REPLACED' && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-emerald-950">Replacement Device IMEI (New Hardware Serial)</label>
              <input
                type="text"
                value={replacementImei}
                onChange={(e) => setReplacementImei(e.target.value)}
                placeholder="e.g. 868329088499201"
                className="w-full bg-white border border-emerald-300 rounded-xl p-2.5 text-xs font-mono font-bold text-emerald-950 focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-emerald-700">This will link the replacement device to previous fitment history.</p>
            </div>
          )}

          {/* Fault Reason / Diagnostic Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Failure Reason / Technician Diagnostic Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Device not powering ON, Power IC burn mark observed on PCB. Dispatched to vendor under 1-year warranty."
              className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Saving RMA...' : 'Update RMA Stage'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
