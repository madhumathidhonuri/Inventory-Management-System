import React from 'react';
import { X, Printer, Send, ShieldCheck, CheckCircle2, QrCode, Building, Car, Phone, Calendar, CreditCard, Sparkles } from 'lucide-react';
import { buildFitmentReceiptWhatsAppMessage } from '../utils/whatsapp';

export default function FitmentReceiptModal({ isOpen, onClose, deviceData }) {
  if (!isOpen || !deviceData) return null;

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
    sim_number,
    simno1,
    simno2,
    chasis_number,
    engine_number,
    additional_attributes = {}
  } = deviceData;

  const vehNo = vehicle_number && vehicle_number !== '-' ? vehicle_number : additional_attributes['VEHICLE NUMBER'] || additional_attributes['Vehicle Number'] || 'N/A';
  const custName = customer_name && customer_name !== '-' ? customer_name : additional_attributes['CUSTOMER NAME'] || additional_attributes['CERTIFICATE ISSUED TO'] || 'Valued Customer';
  const custPhone = customer_phone && customer_phone !== '-' ? customer_phone : additional_attributes['CUSTOMER PHONE NUMBER'] || additional_attributes['Primary Mobile'] || '';
  const certDate = certificate_date || additional_attributes['CERTIFICATE ISSUED DATE'] || additional_attributes['INSTALLATION DATE'] || new Date().toISOString().split('T')[0];
  const modelName = device_type_name || additional_attributes['DEVICE NAME'] || 'AIS-140 GPS VLTD';
  const branchStock = stock_place || stockPlace || additional_attributes['STOCK PLACE'] || additional_attributes['Stock Place'] || 'Main Depot';
  
  const rawCost = cost || additional_attributes['TOTAL COST'] || additional_attributes['COST'] || 5000;
  const formattedCost = `₹${Number(rawCost).toLocaleString('en-IN')}`;
  
  const isPaid = (payment_status === 'RECEIVED' || String(additional_attributes['AMOUNT RECEIVED'] || '').toUpperCase().includes('REC'));
  const payStatusLabel = isPaid ? 'PAID & RECEIVED' : 'PAYMENT PENDING';
  const payModeLabel = payment_mode || additional_attributes['AMOUNT RECEIVED BY'] || (isPaid ? 'UPI / Online' : 'Pending');

  const sims = [sim_number, simno1, additional_attributes['simno1'], additional_attributes['Sim 1'], simno2, additional_attributes['simno2']]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(' / ') || 'Active eSIM';

  const receiptNo = `FT-RCP-${String(imei_number).slice(-6)}-${new Date().getFullYear()}`;

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    const { url } = buildFitmentReceiptWhatsAppMessage({
      phone: custPhone,
      customerName: custName,
      vehicleNumber: vehNo,
      imei: imei_number,
      model: modelName,
      certificateDate: certDate,
      totalCost: formattedCost,
      paymentStatus: payStatusLabel
    });
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      
      {/* Print stylesheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-fitment-receipt, #printable-fitment-receipt * {
            visibility: visible;
          }
          #printable-fitment-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20px;
            box-shadow: none;
            border: none;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* Top Modal Controls (Hidden in Print) */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between no-print border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center text-white">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Fitment Certificate & Payment Receipt</h3>
              <p className="text-[11px] text-slate-400">Official customer invoice and AIS-140 certificate slip</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleWhatsAppShare}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Share Receipt on WhatsApp"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Print Receipt or Save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Canvas */}
        <div className="p-6 sm:p-8 overflow-y-auto bg-slate-50/50" id="printable-fitment-receipt">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
            
            {/* Header / Brand Details */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-900 text-white font-bold flex items-center justify-center text-xs font-mono">
                    FT
                  </div>
                  <span className="text-xl font-black tracking-tight text-slate-900">
                    FuelTracks <span className="text-indigo-600 text-xs font-bold uppercase tracking-widest px-1.5 py-0.5 bg-indigo-50 rounded border border-indigo-200">IMS</span>
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-slate-600">FuelTracks Technologies Pvt. Ltd.</p>
                <p className="text-[10px] text-slate-400">Govt. Authorized AIS-140 Certified VLTD Partner</p>
                <p className="text-[10px] text-slate-400">Email: support@fueltracks.in | Web: www.fueltracks.in</p>
              </div>

              <div className="text-right space-y-1">
                <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-900 text-white font-mono uppercase tracking-wider">
                  Fitment & Payment Slip
                </span>
                <div className="text-xs font-mono font-bold text-slate-800">{receiptNo}</div>
                <div className="text-[10px] text-slate-500 font-mono">Date: {certDate}</div>
              </div>
            </div>

            {/* Customer & Vehicle Grid */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Customer Details</span>
                <div className="text-sm font-bold text-slate-900">{custName}</div>
                {custPhone && <div className="text-xs font-mono text-slate-600 flex items-center gap-1">📞 {custPhone}</div>}
                <div className="text-xs text-slate-500">Stock / Branch: {branchStock}</div>
              </div>

              <div className="space-y-1 text-right sm:text-left">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Vehicle Details</span>
                <div className="text-base font-black font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md inline-block">
                  {vehNo}
                </div>
                {chasis_number && <div className="text-[11px] font-mono text-slate-500">Chassis: {chasis_number}</div>}
                {engine_number && <div className="text-[11px] font-mono text-slate-500">Engine: {engine_number}</div>}
              </div>
            </div>

            {/* Hardware & Fitment Specs Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Item / Hardware Description</th>
                    <th className="p-2.5">IMEI / Hardware Identity</th>
                    <th className="p-2.5">Fitment Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-800">
                      <div>{modelName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">SIM: {sims}</div>
                    </td>
                    <td className="p-2.5 font-mono text-slate-700">
                      <div>{imei_number}</div>
                      {additional_attributes.vltdsno && (
                        <div className="text-[10px] text-indigo-600">VLTD: {additional_attributes.vltdsno}</div>
                      )}
                    </td>
                    <td className="p-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        INSTALLED & TESTED
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Commercial Billing Summary */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-900 text-white rounded-xl gap-4">
              <div className="space-y-0.5 text-center sm:text-left">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Amount Billed</span>
                <div className="text-2xl font-black font-mono text-white">{formattedCost}</div>
                <div className="text-[11px] text-slate-300">Payment Mode: <span className="font-semibold text-white">{payModeLabel}</span></div>
              </div>

              <div className="text-center sm:text-right">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                  isPaid
                    ? 'bg-emerald-500 text-white'
                    : 'bg-amber-500 text-slate-950'
                }`}>
                  {isPaid ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                  {payStatusLabel}
                </span>
                <p className="text-[10px] text-slate-400 mt-1">Includes 1-Year VAHAN Certificate & GPS Live Feed</p>
              </div>
            </div>

            {/* Compliance & Signature Footer */}
            <div className="pt-4 border-t border-slate-200 flex items-end justify-between text-xs text-slate-500">
              <div className="space-y-1 max-w-xs text-[10px] text-slate-400">
                <p className="font-bold text-slate-600">Government Compliance Notice:</p>
                <p>This device complies with Ministry of Road Transport & Highways (MoRTH) AIS-140 mandate with SOS emergency support.</p>
              </div>

              <div className="text-center space-y-2">
                <div className="w-32 h-10 border-b border-dashed border-slate-400" />
                <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Authorized Signatory / Seal
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
