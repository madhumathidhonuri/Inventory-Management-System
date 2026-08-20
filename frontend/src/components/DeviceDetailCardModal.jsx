import React, { useState, useEffect } from 'react';
import { 
  X, Copy, Check, QrCode, Cpu, Radio, Truck, User, Phone, 
  MapPin, Calendar, CreditCard, ShieldCheck, Wrench, Clock, 
  ArrowRight, FileSpreadsheet, Printer, ExternalLink, Sparkles
} from 'lucide-react';
import { fetchDeviceByImei } from '../services/api';
import { buildCustomerCredentialsWhatsAppMessage, formatDisplayCellValue } from '../utils/whatsapp';

export default function DeviceDetailCardModal({ isOpen, onClose, imei }) {
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && imei) {
      loadDevice(imei);
    } else {
      setDevice(null);
      setError(null);
    }
  }, [isOpen, imei]);

  const loadDevice = async (imeiToLoad) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDeviceByImei(imeiToLoad);
      if (res.success && res.data) {
        setDevice(res.data);
      } else {
        setError(res.error || 'Device information not found');
      }
    } catch (err) {
      setError(err.message || 'Failed to load device details');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const attrs = device?.additional_attributes || {};
  const history = device?.journey_history || [];

  // Model detection
  const modelUpper = String(device?.device_type_name || '').toUpperCase();
  const isVolty = modelUpper.includes('VOLTY');
  const isVamo = modelUpper.includes('VAMO');
  const isTracknow = modelUpper.includes('TRACKNOW');

  // Universal field matchers
  const getAttr = (...possibleNames) => {
    for (const name of possibleNames) {
      if (attrs[name] !== undefined && attrs[name] !== null && String(attrs[name]).trim() !== '') {
        return String(attrs[name]).trim();
      }
    }
    const cleanNames = possibleNames.map(n => n.toLowerCase().replace(/[^a-z0-9]/g, ''));
    for (const [k, v] of Object.entries(attrs)) {
      const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanNames.includes(cleanK) && v !== undefined && v !== null && String(v).trim() !== '') {
        return String(v).trim();
      }
    }
    return '-';
  };

  // Helper to extract known standard fields using getAttr
  const vehNo = getAttr('VEHICLE NUMBER', 'Vehicle Number', 'VEHICLE NO', 'Vehicle No', 'REG NO', 'Reg No', 'vehicle_number', 'Vehicle');
  const custName = getAttr('CUSTOMER NAME', 'Customer Name', 'CERTIFICATE ISSUED TO', 'Certificate Issued To', 'Customer', 'customer_name', 'Client');
  const custPhone = getAttr('CUSTOMER PHONE NUMBER', 'Customer Phone Number', 'Primary Mobile', 'PRIMARY MOBILE', 'Phone Number', 'Phone', 'Mobile', 'Contact', 'phone_number');
  const stockPlace = attrs['STOCK PLACE'] || attrs['Stock Place'] || (device?.current_holder_name && !device?.current_holder_name.toLowerCase().includes('warehouse') ? device.current_holder_name : '-');
  const stockDate = getAttr('STOCK PLACE DATE', 'Stock Place Date', 'CERTIFICATE ISSUED DATE', 'Certificate Issued Date', 'INSTALLATION DATE', 'Installation Date', 'DATE', 'Date');
  const amountRec = getAttr('AMOUNT RECEIVED', 'Amount Received', 'Payment Status', 'PAYMENT STATUS', 'Payment');
  const certNo = getAttr('CERTIFICATE NUMBER', 'Certificate Number', 'Cert No', 'CERT NO');
  const rtoLoc = getAttr('RTO LOCATION', 'RTO Location', 'RTO', 'Location', 'City', 'Region');

  // Model-specific hardware fields
  const serialNo = getAttr('SERIAL NUMBER', 'Serial Number', 'SERIAL NO', 'Serial No', 'SL NO', 'Sl No', 'SL.NO', 'S.NO', 'S.No', 'Serial', 'SERIAL', 'Serial_No') !== '-' 
    ? getAttr('SERIAL NUMBER', 'Serial Number', 'SERIAL NO', 'Serial No', 'SL NO', 'Sl No', 'SL.NO', 'S.NO', 'S.No', 'Serial', 'SERIAL', 'Serial_No') 
    : (device?.serial_number || '-');

  const iccidNo = getAttr('ICCID', 'ICCID NUMBER', 'ICCID Number', 'Sim ICCID', 'SIM ICCID', 'Iccid', 'ICCID_NUMBER', 'SIM NUMBER', 'Sim Number') !== '-'
    ? getAttr('ICCID', 'ICCID NUMBER', 'ICCID Number', 'Sim ICCID', 'SIM ICCID', 'Iccid', 'ICCID_NUMBER', 'SIM NUMBER', 'Sim Number')
    : (device?.sim_number || '-');

  const vltdSno = getAttr('VLTDSNO', 'VLTD SNO', 'VLTD_SNO', 'VLTD Serial Number', 'VLTD Serial No', 'VLTD S.No', 'VLTD SNO.', 'VLTD');
  const uid = getAttr('UID', 'Uid', 'Unit ID', 'UNIT ID', 'Unit Id', 'UID NUMBER', 'UID NO', 'Uid No');
  const vahanId = getAttr('VAHAN ID', 'Vahan ID', 'VAHAN_ID', 'Vahan Id', 'VAHAN', 'Vahan', 'VAHAN NO', 'Vahan No');
  const sim1 = getAttr('simno1', 'sim no 1', 'sim_no_1', 'SIM1', 'SIM 1', 'SIM_1', 'Sim 1', 'Primary SIM', 'SIM 1 Number', 'SIM1 NUMBER', 'SIM1 NO', 'Sim1', 'SIM NO 1');
  const sim2 = getAttr('simn02', 'simno2', 'sim no 2', 'sim_no_2', 'SIM2', 'SIM 2', 'SIM_2', 'Sim 2', 'Secondary SIM', 'SIM 2 Number', 'SIM2 NUMBER', 'SIM2 NO', 'Sim2', 'SIM NO 2');

  // Exclude already surfaced fields from generic extra attributes grid
  const standardKeys = new Set([
    'STOCK PLACE', 'Stock Place', 'STOCK PLACE DATE', 'Stock Place Date',
    'Vehicle Number', 'VEHICLE NO', 'vehicle_number', 'Vehicle No', 'VEHICLE NUMBER',
    'Customer Name', 'CUSTOMER NAME', 'customer_name', 'Customer', 'CERTIFICATE ISSUED TO', 'Certificate Issued To',
    'Primary Mobile', 'PRIMARY MOBILE', 'phone_number', 'Phone', 'Mobile', 'CUSTOMER PHONE NUMBER', 'Customer Phone Number',
    'Amount Received', 'AMOUNT RECEIVED', 'Payment Status', 'PAYMENT STATUS',
    'CERTIFICATE NUMBER', 'Certificate Number', 'Cert No', 'CERT NO',
    'RTO Location', 'RTO LOCATION', 'Location',
    'SERIAL NUMBER', 'Serial Number', 'SERIAL NO', 'Serial No', 'SL NO', 'Sl No', 'SL.NO', 'S.NO', 'S.No', 'Serial', 'SERIAL', 'SERIAL_NUMBER',
    'ICCID', 'ICCID NUMBER', 'ICCID Number', 'Sim ICCID', 'SIM ICCID', 'Iccid', 'ICCID_NUMBER', 'SIM NUMBER', 'Sim Number',
    'VLTDSNO', 'VLTD SNO', 'VLTD_SNO', 'VLTD Serial Number', 'VLTD Serial No', 'VLTD S.No', 'VLTD SNO.', 'VLTD', 'vltdsno',
    'UID', 'Uid', 'Unit ID', 'UNIT ID', 'Unit Id', 'UID NUMBER', 'UID NO', 'Uid No',
    'VAHAN ID', 'Vahan ID', 'VAHAN_ID', 'Vahan Id', 'VAHAN', 'Vahan', 'VAHAN NO', 'Vahan No',
    'SIM1', 'SIM 1', 'SIM_1', 'Sim 1', 'Primary SIM', 'SIM 1 Number', 'SIM1 NUMBER', 'SIM1 NO', 'Sim1', 'simno1', 'sim no 1',
    'SIM2', 'SIM 2', 'SIM_2', 'Sim 2', 'Secondary SIM', 'SIM 2 Number', 'SIM2 NUMBER', 'SIM2 NO', 'Sim2', 'simn02', 'simno2', 'sim no 2',
    'PURCHASED FROM', 'Purchased From', 'PURCHASE FROM', 'Purchase From', 'PURCHASED_FROM',
    'VENDOR', 'Vendor', 'Vendor Name', 'VENDOR NAME', 'Vendor_Name',
    'PURCHASE PRICE', 'Purchase Price', 'Purchase Date', 'PURCHASE DATE',
    'PURCHASED BY', 'Purchased By', 'Source File', 'SOURCE FILE'
  ]);

  const extraAttributeEntries = Object.entries(attrs).filter(([k]) => !standardKeys.has(k));

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'INSTALLED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'WITH_DEALER':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'IN_WAREHOUSE':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'FAULTY':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header Bar */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">Device Specification Card</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  Passport
                </span>
              </div>
              <p className="text-xs text-slate-400">Complete Telematics Hardware & Lifecycle Record</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs flex items-center gap-1.5"
              title="Print Device Passport Card"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 bg-slate-50/50">
          {loading ? (
            <div className="py-20 text-center text-xs text-slate-500 space-y-2">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="font-medium">Fetching complete device details...</p>
            </div>
          ) : error ? (
            <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-2">
              <p className="text-sm font-bold text-red-800">{error}</p>
              <p className="text-xs text-red-600">Please verify the IMEI number and try again.</p>
            </div>
          ) : device ? (
            <>
              {/* PRIMARY HERO CARD */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-blue-50/60 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <QrCode className="w-3.5 h-3.5 text-blue-600" /> Device IMEI Number
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl sm:text-2xl font-mono font-bold text-slate-900 tracking-wider">
                        {device.imei_number}
                      </span>
                      <button
                        onClick={() => handleCopy(device.imei_number)}
                        className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                          copied
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                        }`}
                        title="Copy IMEI to Clipboard"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span className="text-[10px]">{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {device.current_status && device.current_status !== 'IN_WAREHOUSE' && (
                      <span className={`px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider border shadow-2xs ${getStatusBadgeStyle(device.current_status)}`}>
                        {device.current_status.replace('_', ' ')}
                      </span>
                    )}
                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-slate-900 text-white shadow-2xs">
                      {device.device_type_name}
                    </span>
                  </div>
                </div>

                {/* Model-Specific Hardware Specs Sub-bar */}
                {isVolty ? (
                  /* 1. VOLTY: Serial No & ICCID Number */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/70 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 block text-[11px] font-bold uppercase tracking-wider">Serial No</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">{serialNo}</span>
                      </div>
                      {serialNo !== '-' && (
                        <button
                          onClick={() => handleCopy(serialNo)}
                          className="text-slate-400 hover:text-slate-700 p-1 rounded-md cursor-pointer"
                          title="Copy Serial Number"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center justify-between">
                      <div>
                        <span className="text-blue-500 block text-[11px] font-bold uppercase tracking-wider">ICCID Number</span>
                        <span className="font-mono font-bold text-blue-900 text-sm">{iccidNo}</span>
                      </div>
                      {iccidNo !== '-' && (
                        <button
                          onClick={() => handleCopy(iccidNo)}
                          className="text-blue-400 hover:text-blue-700 p-1 rounded-md cursor-pointer"
                          title="Copy ICCID Number"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : isVamo ? (
                  /* 2. VAMO / VAMOSYS: VLTDSNO, SIM1, SIM2 */
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
                    <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 flex items-center justify-between">
                      <div>
                        <span className="text-purple-600 block text-[11px] font-bold uppercase tracking-wider">VLTDSNO</span>
                        <span className="font-mono font-bold text-purple-950 text-sm">{vltdSno}</span>
                      </div>
                      {vltdSno !== '-' && (
                        <button
                          onClick={() => handleCopy(vltdSno)}
                          className="text-purple-400 hover:text-purple-700 p-1 rounded-md cursor-pointer"
                          title="Copy VLTDSNO"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 flex items-center justify-between">
                      <div>
                        <span className="text-emerald-600 block text-[11px] font-bold uppercase tracking-wider">SIM 1</span>
                        <span className="font-mono font-bold text-emerald-950 text-sm">{sim1}</span>
                      </div>
                      {sim1 !== '-' && (
                        <button
                          onClick={() => handleCopy(sim1)}
                          className="text-emerald-400 hover:text-emerald-700 p-1 rounded-md cursor-pointer"
                          title="Copy SIM 1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-100 flex items-center justify-between">
                      <div>
                        <span className="text-teal-600 block text-[11px] font-bold uppercase tracking-wider">SIM 2</span>
                        <span className="font-mono font-bold text-teal-950 text-sm">{sim2}</span>
                      </div>
                      {sim2 !== '-' && (
                        <button
                          onClick={() => handleCopy(sim2)}
                          className="text-teal-400 hover:text-teal-700 p-1 rounded-md cursor-pointer"
                          title="Copy SIM 2"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : isTracknow ? (
                  /* 3. TRACKNOW: ICCID, UID, VAHAN ID, SIM1, SIM2 */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 mt-4 pt-4 border-t border-slate-100 text-xs">
                    <div className="p-2.5 bg-blue-50/50 rounded-xl border border-blue-100">
                      <span className="text-blue-500 block text-[10px] font-bold uppercase tracking-wider">ICCID</span>
                      <span className="font-mono font-bold text-blue-900 text-xs truncate block" title={iccidNo}>{iccidNo}</span>
                    </div>
                    <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-100">
                      <span className="text-amber-600 block text-[10px] font-bold uppercase tracking-wider">UID</span>
                      <span className="font-mono font-bold text-amber-950 text-xs truncate block" title={uid}>{uid}</span>
                    </div>
                    <div className="p-2.5 bg-indigo-50/60 rounded-xl border border-indigo-100">
                      <span className="text-indigo-600 block text-[10px] font-bold uppercase tracking-wider">Vahan ID</span>
                      <span className="font-mono font-bold text-indigo-950 text-xs truncate block" title={vahanId}>{vahanId}</span>
                    </div>
                    <div className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-100">
                      <span className="text-emerald-600 block text-[10px] font-bold uppercase tracking-wider">SIM 1</span>
                      <span className="font-mono font-bold text-emerald-950 text-xs truncate block" title={sim1}>{sim1}</span>
                    </div>
                    <div className="p-2.5 bg-teal-50/60 rounded-xl border border-teal-100">
                      <span className="text-teal-600 block text-[10px] font-bold uppercase tracking-wider">SIM 2</span>
                      <span className="font-mono font-bold text-teal-950 text-xs truncate block" title={sim2}>{sim2}</span>
                    </div>
                  </div>
                ) : (
                  /* 4. DEFAULT / OTHER MODELS: Dynamic Smart Grid */
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
                    {serialNo !== '-' && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-400 block text-[10px] font-bold uppercase">Serial No</span>
                        <span className="font-mono font-bold text-slate-800 text-xs">{serialNo}</span>
                      </div>
                    )}
                    {iccidNo !== '-' && (
                      <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <span className="text-blue-500 block text-[10px] font-bold uppercase">ICCID</span>
                        <span className="font-mono font-bold text-blue-900 text-xs">{iccidNo}</span>
                      </div>
                    )}
                    {vltdSno !== '-' && (
                      <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                        <span className="text-purple-600 block text-[10px] font-bold uppercase">VLTDSNO</span>
                        <span className="font-mono font-bold text-purple-950 text-xs">{vltdSno}</span>
                      </div>
                    )}
                    {uid !== '-' && (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                        <span className="text-amber-600 block text-[10px] font-bold uppercase">UID</span>
                        <span className="font-mono font-bold text-amber-950 text-xs">{uid}</span>
                      </div>
                    )}
                    {vahanId !== '-' && (
                      <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                        <span className="text-indigo-600 block text-[10px] font-bold uppercase">Vahan ID</span>
                        <span className="font-mono font-bold text-indigo-950 text-xs">{vahanId}</span>
                      </div>
                    )}
                    {sim1 !== '-' && (
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                        <span className="text-emerald-600 block text-[10px] font-bold uppercase">SIM 1</span>
                        <span className="font-mono font-bold text-emerald-950 text-xs">{sim1}</span>
                      </div>
                    )}
                    {sim2 !== '-' && (
                      <div className="p-3 bg-teal-50 rounded-xl border border-teal-100">
                        <span className="text-teal-600 block text-[10px] font-bold uppercase">SIM 2</span>
                        <span className="font-mono font-bold text-teal-950 text-xs">{sim2}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* TWO COLUMN CARDS: Stock Place & Vehicle/Customer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. STOCK LOCATION & DEALER CARD */}
                <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 border-b border-slate-100 pb-2.5">
                    <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                      <Truck className="w-4 h-4" />
                    </div>
                    <span>Stock Allocation & Holding</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <span className="text-slate-500">Current Stock Place:</span>
                      <span className="font-bold text-indigo-700 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                        {stockPlace}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <span className="text-slate-500">Stock Place Date:</span>
                      <span className="font-medium text-slate-800 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {stockDate}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <span className="text-slate-500">Holding Type:</span>
                      <span className="font-semibold text-slate-800">
                        {device.current_holder_type || 'DEALER'}
                      </span>
                    </div>

                    {rtoLoc !== '-' && (
                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-500">RTO Jurisdiction:</span>
                        <span className="font-bold text-slate-800">{rtoLoc}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. VEHICLE & CUSTOMER INSTALLATION CARD */}
                <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 border-b border-slate-100 pb-2.5">
                    <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <span>Vehicle & Installation Details</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <span className="text-slate-500">Vehicle Number:</span>
                      <span className={`font-mono font-bold px-2 py-0.5 rounded-md ${
                        vehNo !== '-' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'text-slate-400'
                      }`}>
                        {vehNo}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <span className="text-slate-500">Customer Name:</span>
                      <span className="font-bold text-slate-900 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {custName}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <span className="text-slate-500">Primary Mobile:</span>
                      <span className="font-mono text-emerald-800 font-semibold flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-emerald-600" />
                        {custPhone}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-500">Payment Status:</span>
                      <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                        amountRec.toUpperCase().includes('REC') || amountRec.toUpperCase().includes('PAID')
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : amountRec !== '-'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'text-slate-400'
                      }`}>
                        {amountRec}
                      </span>
                    </div>

                    {/* WhatsApp Credentials Direct Action */}
                    {custPhone && custPhone !== '-' && (
                      <div className="pt-2 border-t border-slate-100">
                        {(() => {
                          const wa = buildCustomerCredentialsWhatsAppMessage({
                            phone: custPhone,
                            customerName: custName,
                            userId: attrs['Software User ID'] || attrs['USER ID'] || attrs['User ID'] || '',
                            password: attrs['Software Password'] || attrs['PASSWORD'] || attrs['Password'] || '123456',
                            vehicleNumber: vehNo
                          });
                          return (
                            <a
                              href={wa.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                              title={`Send official Volty Track credentials to ${custPhone}`}
                            >
                              <span>💬</span> Send Login Credentials to Customer (WhatsApp)
                            </a>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* 3. DYNAMIC EXCEL ATTRIBUTES CARD */}
              {extraAttributeEntries.length > 0 && (
                <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                      Excel Spreadsheet Technical Attributes ({extraAttributeEntries.length} Columns)
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">Uploaded Column Preservation</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    {extraAttributeEntries.map(([colName, colVal]) => (
                      <div key={colName} className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate" title={colName}>
                          {colName}
                        </span>
                        <span className="font-semibold text-slate-800 font-mono text-[11px] block truncate" title={String(colVal)}>
                          {colVal !== undefined && colVal !== null && String(colVal).trim() !== '' ? formatDisplayCellValue(colName, colVal) : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. CHRONOLOGICAL AUDIT & MOVEMENT TIMELINE */}
              <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-600" />
                    Lifecycle Movement & Traceability History ({history.length} Events)
                  </span>
                  <span className="text-[11px] text-slate-400">Chronological Trail</span>
                </div>

                {history.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">No movement history logged yet.</p>
                ) : (
                  <div className="relative border-l-2 border-slate-200 ml-3 space-y-4 pt-1">
                    {history.map((evt, idx) => (
                      <div key={idx} className="relative pl-5 text-xs space-y-1">
                        <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-2 border-blue-600" />
                        
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-xs">{evt.event_type}</span>
                          <span className="text-[11px] text-slate-400 font-mono">{evt.event_date}</span>
                        </div>

                        {evt.from_holder && evt.to_holder && (
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium text-[11px]">
                            <span className="text-slate-500">{evt.from_holder}</span>
                            <ArrowRight className="w-3 h-3 text-blue-600 shrink-0" />
                            <span className="text-emerald-700 font-bold">{evt.to_holder}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Operator: <strong className="text-slate-600">{evt.performed_by || 'System'}</strong></span>
                          {evt.remarks && <span className="italic text-slate-500 truncate max-w-[200px]" title={evt.remarks}>{evt.remarks}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex justify-between items-center text-xs">
          <span className="text-slate-400">FuelTracks Telematics Identity Card</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
          >
            Close Card
          </button>
        </div>

      </div>
    </div>
  );
}
