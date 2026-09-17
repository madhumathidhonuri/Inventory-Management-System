import React, { useState, useEffect, useMemo } from 'react';
import {
  Wrench,
  Search,
  Plus,
  Barcode,
  CheckCircle2,
  RefreshCw,
  UserCheck,
  Car,
  Key,
  DollarSign,
  FileText,
  Copy,
  ExternalLink,
  Layers,
  X,
  AlertCircle,
  QrCode,
  CreditCard,
  Send,
  FileSpreadsheet,
  Calendar,
  Download,
  ShieldCheck,
  HardHat,
  Truck
} from 'lucide-react';
import { recordInstallation, recordBulkInstallations, fetchInstallations, lookupCustomerByPhone, getCustomerDirectoryExportUrl } from '../services/api';
import { buildCustomerCredentialsWhatsAppMessage, buildPaymentQrWhatsAppMessage, buildPaymentReceivedWhatsAppMessage } from '../utils/whatsapp';
import { exportInstallationsToExcel } from '../utils/excelExport';
import PaymentQrModal from '../components/PaymentQrModal';
import { useAuth } from '../context/AuthContext';

export default function InstallationPage({ onOpenScannerWithCallback, onOpenTraceDrawer }) {
  const { user } = useAuth();
  const isDealer = user?.role === 'DEALER';

  const [installations, setInstallations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);

  // Payment QR Modal State
  const [paymentQrData, setPaymentQrData] = useState(null);
  const [isPaymentQrOpen, setIsPaymentQrOpen] = useState(false);
  const [postInstallQrPrompt, setPostInstallQrPrompt] = useState(null);
  const [autoSendWhatsAppPayment, setAutoSendWhatsAppPayment] = useState(true);

  // Single Action Form State
  const [showModal, setShowModal] = useState(false);
  const [imei, setImei] = useState('');
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('Commercial / Heavy');
  const [aadharNumber, setAadharNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [chasisNumber, setChasisNumber] = useState('');
  const [engineNumber, setEngineNumber] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('RECEIVED');
  const [softwareUserId, setSoftwareUserId] = useState('');
  const [softwarePassword, setSoftwarePassword] = useState('');
  const [installedBy, setInstalledBy] = useState('');
  const [installationDate, setInstallationDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [location, setLocation] = useState('');
  const [remarks, setRemarks] = useState('');
  const [category, setCategory] = useState('VLTD'); // 'VLTD' | 'TG MINING' | 'AP MINING' | 'GENERAL' | 'CUSTOM'
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Bulk WhatsApp Installs State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // Customer Auto Match Lookup Status
  const [custLookup, setCustLookup] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState('');

  useEffect(() => {
    loadData();
  }, [search]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchInstallations({ search });
      if (res.success) setInstallations(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Live Category Counts Calculation
  const categoryCounts = useMemo(() => {
    const counts = {
      'ALL': installations.length,
      'VLTD': 0,
      'TG MINING': 0,
      'AP MINING': 0,
      'GENERAL': 0,
    };
    installations.forEach(inst => {
      let devAttrs = {};
      try {
        devAttrs = typeof inst.device_additional_attributes === 'string'
          ? JSON.parse(inst.device_additional_attributes || '{}')
          : (inst.device_additional_attributes || {});
      } catch {}
      const cat = (devAttrs['CATEGORY'] || devAttrs['DEVICE CATEGORY'] || inst.vehicle_type || 'VLTD').toUpperCase();
      if (cat.includes('TG MINING') || (cat.includes('TG') && cat.includes('MINING'))) {
        counts['TG MINING']++;
      } else if (cat.includes('AP MINING') || (cat.includes('AP') && cat.includes('MINING'))) {
        counts['AP MINING']++;
      } else if (cat.includes('VLTD')) {
        counts['VLTD']++;
      } else if (cat.includes('GENERAL')) {
        counts['GENERAL']++;
      }
    });
    return counts;
  }, [installations]);

  // Filtered Installations List
  const filteredInstallations = useMemo(() => {
    return installations.filter(inst => {
      if (categoryFilter !== 'ALL') {
        let devAttrs = {};
        try {
          devAttrs = typeof inst.device_additional_attributes === 'string'
            ? JSON.parse(inst.device_additional_attributes || '{}')
            : (inst.device_additional_attributes || {});
        } catch {}
        const cat = (devAttrs['CATEGORY'] || devAttrs['DEVICE CATEGORY'] || inst.vehicle_type || '').toUpperCase();
        if (!cat.includes(categoryFilter)) return false;
      }

      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const vNum = (inst.vehicle_number || '').toLowerCase();
        const cName = (inst.customer_name || '').toLowerCase();
        const cPhone = (inst.customer_phone || inst.customer_contact || '').toLowerCase();
        const imei = (inst.imei_number || '').toLowerCase();
        const tech = (inst.installed_by || '').toLowerCase();
        const loc = (inst.installation_location || '').toLowerCase();
        const chasis = (inst.chasis_number || '').toLowerCase();
        
        return vNum.includes(q) || cName.includes(q) || cPhone.includes(q) || imei.includes(q) || tech.includes(q) || loc.includes(q) || chasis.includes(q);
      }

      return true;
    });
  }, [installations, categoryFilter, search]);

  // Category Excel Export Handler
  const handleExportCategoryExcel = async () => {
    try {
      setExportingExcel(true);
      const safeCat = categoryFilter === 'ALL' ? 'All_Projects' : categoryFilter.replace(/\s+/g, '_');
      const filename = `${safeCat}_Installations_${new Date().toISOString().split('T')[0]}`;
      const sheetName = categoryFilter === 'ALL' ? 'All Installations' : `${categoryFilter} Installs`;
      await exportInstallationsToExcel(filename, sheetName, filteredInstallations, categoryFilter);
    } catch (err) {
      console.error('Failed to export Excel:', err);
      alert('Failed to generate Excel sheet: ' + err.message);
    } finally {
      setExportingExcel(false);
    }
  };

  const handlePhoneChange = async (val) => {
    setPhone(val);
    if (val.trim().length >= 10) {
      try {
        const res = await lookupCustomerByPhone(val.trim());
        if (res.success && res.found) {
          setCustLookup(res.data);
          if (!customerName) setCustomerName(res.data.name || '');
          if (!customerEmail) setCustomerEmail(res.data.email || '');
          if (!customerAddress) setCustomerAddress(res.data.address || '');
          if (!aadharNumber) setAadharNumber(res.data.aadhar_number || '');
          if (!panNumber) setPanNumber(res.data.pan_number || '');
          if (!softwareUserId) setSoftwareUserId(res.data.software_user_id || '');
          if (!softwarePassword) setSoftwarePassword(res.data.software_password || '');
        } else {
          setCustLookup(null);
        }
      } catch (e) {}
    } else {
      setCustLookup(null);
    }
  };

  const handleScanImei = () => {
    onOpenScannerWithCallback((scannedList) => {
      if (scannedList.length > 0) {
        setImei(scannedList[0]);
        setShowModal(true);
      }
    });
  };

  const handleSubmitInstallation = async (e) => {
    e.preventDefault();
    if (!imei.trim() || !phone.trim() || !customerName.trim() || !vehicleNumber.trim()) {
      alert('IMEI, Phone, Customer Name, and Vehicle Number are required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await recordInstallation({
        imei_number: imei.trim(),
        customer_phone: phone.trim(),
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_address: customerAddress.trim(),
        vehicle_number: vehicleNumber.trim().toUpperCase(),
        vehicle_type: vehicleType,
        category: category === 'CUSTOM' ? (customCategoryInput.trim() || 'CUSTOM') : category,
        aadhar_number: aadharNumber.trim(),
        pan_number: panNumber.trim().toUpperCase(),
        chasis_number: chasisNumber.trim().toUpperCase(),
        engine_number: engineNumber.trim().toUpperCase(),
        sale_price: salePrice ? parseFloat(salePrice) : 0,
        payment_status: paymentStatus,
        software_user_id: softwareUserId.trim(),
        software_password: softwarePassword.trim(),
        installed_by: installedBy.trim() || (user?.username || 'Field Tech'),
        installation_location: location.trim(),
        installation_date: installationDate,
        remarks: remarks.trim()
      });

      if (res.success) {
        setSuccessToast(`✅ Installation recorded for ${vehicleNumber.toUpperCase()} (${customerName})!`);
        
        if (salePrice && parseFloat(salePrice) > 0) {
          setPostInstallQrPrompt({
            customerName: customerName.trim(),
            customerPhone: phone.trim(),
            vehicleNumber: vehicleNumber.trim().toUpperCase(),
            amount: parseFloat(salePrice),
            imei: imei.trim(),
            technicianName: installedBy.trim() || user?.username
          });
        }

        setShowModal(false);
        resetForm();
        loadData();
      } else {
        alert(res.error || 'Failed to record installation');
      }
    } catch (err) {
      alert(err.message || 'Error submitting installation');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setImei('');
    setPhone('');
    setCustomerName('');
    setCustomerEmail('');
    setCustomerAddress('');
    setVehicleNumber('');
    setVehicleType('Commercial / Heavy');
    setAadharNumber('');
    setPanNumber('');
    setChasisNumber('');
    setEngineNumber('');
    setSalePrice('');
    setPaymentStatus('RECEIVED');
    setSoftwareUserId('');
    setSoftwarePassword('');
    setInstalledBy('');
    setLocation('');
    setRemarks('');
    setCategory('VLTD');
    setCustomCategoryInput('');
    setCustLookup(null);
  };

  // Parse and Submit Bulk WhatsApp Text Batch
  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (!bulkText.trim()) return;

    setBulkSubmitting(true);
    setBulkResult(null);
    try {
      const res = await recordBulkInstallations({
        raw_text: bulkText,
        default_category: category === 'CUSTOM' ? (customCategoryInput.trim() || 'CUSTOM') : category,
        default_price: salePrice ? parseFloat(salePrice) : 0,
        installed_by: installedBy.trim() || user?.username
      });
      if (res.success) {
        setBulkResult(res);
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Bulk processing failed');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard!`);
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Fast Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-emerald-600" /> Vehicle Installation Hub & CRM
          </h1>
          <p className="text-xs text-slate-500">
            Log GPS tracker deployments, project categorization, KYC credentials, and instant Excel reports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isDealer && (
            <a
              href={getCustomerDirectoryExportUrl()}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download full Customer details with Aadhar, PAN, Chassis, Engine in Excel Sheet (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
              <span>📥 Export KYC Excel</span>
            </a>
          )}

          <button
            onClick={() => { setShowBulkModal(true); setBulkResult(null); }}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-slate-600" /> Paste WhatsApp Batch
          </button>

          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> + New Installation Entry
          </button>
        </div>
      </div>

      {/* Quick Category Summary Cards (Instant Answer for 'How many installed in TG Mining?') */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Installed */}
        <div
          onClick={() => setCategoryFilter('ALL')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'ALL'
              ? 'bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-slate-400'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">All Installed</span>
            <Car className={`w-4 h-4 ${categoryFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`} />
          </div>
          <div className="text-2xl font-black mt-1 font-mono">{categoryCounts['ALL']}</div>
          <div className="text-[10px] opacity-75 mt-0.5">Total Deployments</div>
        </div>

        {/* TG MINING */}
        <div
          onClick={() => setCategoryFilter('TG MINING')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'TG MINING'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-400'
              : 'bg-amber-50/70 text-amber-900 border-amber-200 hover:border-amber-300 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider">TG MINING</span>
            <HardHat className={`w-4 h-4 ${categoryFilter === 'TG MINING' ? 'text-amber-200' : 'text-amber-600'}`} />
          </div>
          <div className="text-2xl font-black mt-1 font-mono">{categoryCounts['TG MINING']}</div>
          <div className="text-[10px] opacity-80 mt-0.5">Telangana Mining</div>
        </div>

        {/* AP MINING */}
        <div
          onClick={() => setCategoryFilter('AP MINING')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'AP MINING'
              ? 'bg-purple-600 text-white border-purple-600 shadow-sm ring-2 ring-purple-400'
              : 'bg-purple-50/70 text-purple-900 border-purple-200 hover:border-purple-300 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider">AP MINING</span>
            <HardHat className={`w-4 h-4 ${categoryFilter === 'AP MINING' ? 'text-purple-200' : 'text-purple-600'}`} />
          </div>
          <div className="text-2xl font-black mt-1 font-mono">{categoryCounts['AP MINING']}</div>
          <div className="text-[10px] opacity-80 mt-0.5">Andhra Mining</div>
        </div>

        {/* VLTD */}
        <div
          onClick={() => setCategoryFilter('VLTD')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'VLTD'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-400'
              : 'bg-blue-50/70 text-blue-900 border-blue-200 hover:border-blue-300 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider">VLTD / AIS-140</span>
            <ShieldCheck className={`w-4 h-4 ${categoryFilter === 'VLTD' ? 'text-blue-200' : 'text-blue-600'}`} />
          </div>
          <div className="text-2xl font-black mt-1 font-mono">{categoryCounts['VLTD']}</div>
          <div className="text-[10px] opacity-80 mt-0.5">Govt Certifications</div>
        </div>

        {/* GENERAL */}
        <div
          onClick={() => setCategoryFilter('GENERAL')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'GENERAL'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-400'
              : 'bg-emerald-50/70 text-emerald-900 border-emerald-200 hover:border-emerald-300 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider">GENERAL</span>
            <Truck className={`w-4 h-4 ${categoryFilter === 'GENERAL' ? 'text-emerald-200' : 'text-emerald-600'}`} />
          </div>
          <div className="text-2xl font-black mt-1 font-mono">{categoryCounts['GENERAL']}</div>
          <div className="text-[10px] opacity-80 mt-0.5">Commercial & Private</div>
        </div>
      </div>

      {/* Success Notification Banner with 1-Click Payment QR Option */}
      {successToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-bold text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {postInstallQrPrompt && (
              <button
                onClick={() => {
                  setPaymentQrData(postInstallQrPrompt);
                  setIsPaymentQrOpen(true);
                }}
                className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Send Payment QR to Customer</span>
              </button>
            )}
            <button onClick={() => { setSuccessToast(''); setPostInstallQrPrompt(null); }} className="text-emerald-700 hover:text-emerald-900 font-normal ml-1">✕</button>
          </div>
        </div>
      )}

      {/* Filter Bar with Category Selector Pills & Download Excel Button */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Filter Category:</span>
          {[
            { id: 'ALL', label: 'All Projects', countKey: 'ALL', active: 'bg-slate-900 text-white' },
            { id: 'TG MINING', label: 'TG MINING', countKey: 'TG MINING', active: 'bg-amber-600 text-white' },
            { id: 'AP MINING', label: 'AP MINING', countKey: 'AP MINING', active: 'bg-purple-600 text-white' },
            { id: 'VLTD', label: 'VLTD', countKey: 'VLTD', active: 'bg-blue-600 text-white' },
            { id: 'GENERAL', label: 'GENERAL', countKey: 'GENERAL', active: 'bg-emerald-600 text-white' }
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setCategoryFilter(p.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === p.id ? p.active : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{p.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                categoryFilter === p.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {categoryCounts[p.countKey] || 0}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 1-Click Category Excel Download Button */}
          <button
            onClick={handleExportCategoryExcel}
            disabled={exportingExcel || filteredInstallations.length === 0}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs transition-all cursor-pointer ${
              categoryFilter === 'TG MINING'
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : categoryFilter === 'AP MINING'
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : categoryFilter === 'VLTD'
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : categoryFilter === 'GENERAL'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-emerald-700 hover:bg-emerald-800 text-white'
            } disabled:opacity-50`}
            title={`Download ${categoryFilter} Installation records in Excel (.xlsx)`}
          >
            {exportingExcel ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            <span>
              {exportingExcel
                ? 'Generating Excel...'
                : `📥 Download ${categoryFilter === 'ALL' ? 'All' : categoryFilter} Excel (${filteredInstallations.length})`}
            </span>
          </button>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Vehicle, Customer, IMEI..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Installations Data Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" /> Loading installation records...
          </div>
        ) : filteredInstallations.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No {categoryFilter === 'ALL' ? '' : `${categoryFilter} `}installation records found. Click <strong>+ New Installation Entry</strong> to log a vehicle install.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                <tr>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5 font-mono">Vehicle Number</th>
                  <th className="p-3.5 font-mono">Device IMEI</th>
                  <th className="p-3.5">Customer & Phone</th>

                  <th className="p-3.5 bg-indigo-50/50 text-indigo-900 border-l border-r border-indigo-100">GPS Software Login</th>
                  <th className="p-3.5">Technician / City</th>
                  <th className="p-3.5">Price & Payment</th>
                  <th className="p-3.5 text-right sticky right-0 bg-slate-50 border-l border-slate-200">Customer Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInstallations.map((inst) => {
                  const payStatus = (inst.payment_status || 'RECEIVED').toUpperCase();
                  const isPaid = payStatus.includes('REC') || payStatus.includes('PAID');

                  let devAttrs = {};
                  try {
                    devAttrs = typeof inst.device_additional_attributes === 'string' ? JSON.parse(inst.device_additional_attributes || '{}') : (inst.device_additional_attributes || {});
                  } catch {}
                  const itemCat = (devAttrs['CATEGORY'] || devAttrs['DEVICE CATEGORY'] || inst.vehicle_type || 'VLTD').toUpperCase();
                  let badgeClass = 'bg-blue-100 text-blue-800 border-blue-300';
                  if (itemCat.includes('TG MINING')) badgeClass = 'bg-amber-100 text-amber-900 border-amber-300';
                  else if (itemCat.includes('AP MINING')) badgeClass = 'bg-purple-100 text-purple-900 border-purple-300';
                  else if (itemCat.includes('GENERAL')) badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';

                  return (
                    <tr key={inst.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3.5 text-slate-600 font-mono">{inst.installation_date}</td>
                      
                      {/* Project Category */}
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${badgeClass}`}>
                          {itemCat}
                        </span>
                      </td>

                      {/* Vehicle Number */}
                      <td className="p-3.5 font-mono text-amber-700 font-bold">
                        <div className="flex items-center gap-1.5">
                          <Car className="w-3.5 h-3.5 text-amber-600" />
                          <span>{inst.vehicle_number}</span>
                        </div>
                      </td>


                      {/* IMEI Number */}
                      <td className="p-3.5 font-mono text-blue-600 font-bold">
                        <button
                          onClick={() => onOpenTraceDrawer(inst.imei_number)}
                          className="hover:underline font-bold"
                          title="Click to trace lifecycle"
                        >
                          {inst.imei_number}
                        </button>
                      </td>

                      {/* Customer Info */}
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900">{inst.customer_name}</div>
                        <div className="text-[11px] font-mono text-slate-500">{inst.customer_contact}</div>
                      </td>

                      {/* GPS Software Login Credentials */}
                      <td className="p-3.5 bg-indigo-50/30 border-l border-r border-indigo-100/60 font-mono">
                        {inst.software_user_id ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 text-indigo-900 font-bold text-[11px]">
                              <span>ID: {inst.software_user_id}</span>
                              <button
                                onClick={() => copyToClipboard(inst.software_user_id, 'User ID')}
                                className="p-0.5 hover:bg-indigo-100 rounded text-indigo-600 cursor-pointer"
                                title="Copy User ID"
                              >
                                <Copy className="w-2.5 h-2.5" />
                              </button>
                            </div>
                            {inst.software_password && (
                              <div className="text-[10px] text-indigo-700">
                                Pass: <span className="bg-indigo-100/80 px-1 py-0.2 rounded font-semibold">{inst.software_password}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">- Not Set -</span>
                        )}
                      </td>

                      {/* Installer & Location */}
                      <td className="p-3.5 text-slate-600">
                        <div>{inst.installed_by || 'Technician'}</div>
                        <div className="text-[10px] text-slate-400">{inst.installation_location || 'Field Site'}</div>
                      </td>

                      {/* Price & Payment */}
                      <td className="p-3.5">
                        <div className="font-mono font-bold text-slate-900">₹{inst.sale_price || 0}</div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isPaid
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {inst.payment_status || 'RECEIVED'}
                        </span>
                      </td>

                      {/* 1-Click WhatsApp Payment & Login Actions */}
                      <td className="p-3.5 text-right sticky right-0 bg-slate-50 border-l border-slate-200">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1-Click Option 1: WhatsApp Payment Received Acknowledgement OR Payment Request */}
                          {isPaid ? (
                            (() => {
                              const waRec = buildPaymentReceivedWhatsAppMessage({
                                phone: inst.customer_contact,
                                customerName: inst.customer_name,
                                vehicleNumber: inst.vehicle_number,
                                imei: inst.imei_number,
                                amount: inst.sale_price || 0,
                                paymentDate: inst.installation_date
                              });
                              return (
                                <a
                                  href={waRec.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`Send Payment Received Acknowledgement to ${inst.customer_contact || 'Customer'}`}
                                  className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[11px] font-bold inline-flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Paid (WA)</span>
                                </a>
                              );
                            })()
                          ) : (
                            (() => {
                              const waPay = buildPaymentQrWhatsAppMessage({
                                phone: inst.customer_contact,
                                customerName: inst.customer_name,
                                vehicleNumber: inst.vehicle_number,
                                imei: inst.imei_number,
                                amount: inst.sale_price || 0,
                                stockPlace: inst.installation_location || 'FuelTracks Central'
                              });
                              return (
                                <a
                                  href={waPay.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`Send 1-Click WhatsApp Payment Request (UPI) to ${inst.customer_contact || 'Customer'}`}
                                  className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[11px] font-bold inline-flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>Pay (WA)</span>
                                </a>
                              );
                            })()
                          )}

                          {/* 1-Click WhatsApp GPS Credentials */}
                          {(() => {
                            const wa = buildCustomerCredentialsWhatsAppMessage({
                              phone: inst.customer_contact,
                              customerName: inst.customer_name,
                              userId: inst.software_user_id,
                              password: inst.software_password,
                              vehicleNumber: inst.vehicle_number
                            });
                            return (
                              <a
                                href={wa.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Send official Volty Track credentials to ${inst.customer_contact || 'Customer'}`}
                                className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold inline-flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                              >
                                <span>💬</span> Login
                              </a>
                            );
                          })()}

                          {/* QR Code Modal Trigger */}
                          <button
                            onClick={() => {
                              setPaymentQrData({
                                imei: inst.imei_number,
                                vehicleNumber: inst.vehicle_number,
                                customerName: inst.customer_name,
                                customerPhone: inst.customer_contact,
                                salePrice: inst.sale_price,
                                paymentStatus: inst.payment_status,
                                stockPlace: inst.installation_location || 'FuelTracks Central'
                              });
                              setIsPaymentQrOpen(true);
                            }}
                            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-300 hover:text-emerald-200 rounded-xl text-[11px] font-bold inline-flex items-center shadow-2xs transition-colors cursor-pointer border border-slate-700"
                            title="Generate & View UPI Payment QR Code"
                          >
                            <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick WhatsApp Single Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-emerald-600" /> Record WhatsApp Installation & Link Customer
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitInstallation} className="space-y-4">
              
              {/* Device IMEI & Vehicle Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-800">Device IMEI Number *</label>
                    <button type="button" onClick={handleScanImei} className="text-[11px] text-blue-600 font-bold flex items-center gap-1 hover:underline cursor-pointer">
                      <Barcode className="w-3.5 h-3.5" /> Scan Gun / Camera
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 864920050019101"
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Automatically found in Vamosys/Volty/TrackNow master sheets.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Installed Vehicle Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AP-21-TZ-8829"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono uppercase font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Vehicle plate attached to customer fleet.</p>
                </div>
              </div>

              {/* Project / Installation Category Selector */}
              <div className="space-y-2 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-purple-50/70 p-3.5 rounded-2xl border border-blue-200/80">
                <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-blue-600" /> Category / Project *
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">Choose project or type custom</span>
                </label>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'VLTD', label: 'VLTD (AIS-140)', activeColor: 'bg-blue-600 text-white border-blue-600 shadow-xs', normalColor: 'bg-white border-blue-200 text-blue-800 hover:border-blue-400' },
                    { id: 'TG MINING', label: 'TG MINING', activeColor: 'bg-amber-600 text-white border-amber-600 shadow-xs', normalColor: 'bg-white border-amber-200 text-amber-800 hover:border-amber-400' },
                    { id: 'AP MINING', label: 'AP MINING', activeColor: 'bg-purple-600 text-white border-purple-600 shadow-xs', normalColor: 'bg-white border-purple-200 text-purple-800 hover:border-purple-400' },
                    { id: 'GENERAL', label: 'GENERAL', activeColor: 'bg-emerald-600 text-white border-emerald-600 shadow-xs', normalColor: 'bg-white border-emerald-200 text-emerald-800 hover:border-emerald-400' }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                        category === cat.id ? cat.activeColor : cat.normalColor
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setCategory('CUSTOM')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      category === 'CUSTOM' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    + Custom Category
                  </button>
                  {category === 'CUSTOM' && (
                    <input
                      type="text"
                      placeholder="Type custom category (e.g. SCHOOL BUS, EXCAVATOR, GOVT)"
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value.toUpperCase())}
                      className="flex-1 bg-white border border-indigo-300 rounded-xl p-1.5 text-xs text-slate-900 font-bold uppercase focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  )}
                </div>

                {/* Inline TG MINING Date & Installed By Selection */}
                {(category === 'TG MINING' || (category === 'CUSTOM' && customCategoryInput.includes('MINING'))) && (
                  <div className="space-y-2 p-3 bg-amber-100/90 border border-amber-300 rounded-xl mt-2 animate-fade-in">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-amber-800" />
                        <span className="text-xs font-bold text-amber-950">Installation Date:</span>
                      </div>
                      <input
                        type="date"
                        value={installationDate}
                        onChange={(e) => setInstallationDate(e.target.value)}
                        className="bg-white border border-amber-400 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 shadow-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-200/80">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-amber-800" />
                        <span className="text-xs font-bold text-amber-950">Technician:</span>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. Technician Name"
                        value={installedBy}
                        onChange={(e) => setInstalledBy(e.target.value)}
                        className="bg-white border border-amber-400 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 shadow-xs focus:outline-none focus:ring-1 focus:ring-amber-500 flex-1 max-w-[200px]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Info Section */}
              <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">

                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-indigo-600" /> Customer Information
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Customer Phone Number *</label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9876543210 (Auto checks existing)"
                      value={phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Customer / Fleet Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Transport / Suresh"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Customer Auto-Match Banner */}
                {custLookup && (
                  <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 font-medium flex items-center gap-2 animate-in fade-in-50">
                    <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Matched existing customer profile with <strong>{custLookup.existing_vehicles?.length || 0}</strong> existing vehicle(s)! Added to their fleet account.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Customer Email ID (Optional)</label>
                    <input
                      type="email"
                      placeholder="e.g. contact@rameshtrans.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Installation Date *</label>
                    <input
                      type="date"
                      required
                      value={installationDate}
                      onChange={(e) => setInstallationDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* KYC & Vehicle Technical Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Aadhar Number (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 1234 5678 9012"
                      value={aadharNumber}
                      onChange={(e) => setAadharNumber(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">PAN Number (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. ABCDE1234F"
                      value={panNumber}
                      onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono uppercase focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Chassis Number (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. MA3EWBIS2001928"
                      value={chasisNumber}
                      onChange={(e) => setChasisNumber(e.target.value.toUpperCase())}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono uppercase focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Engine Number (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. E483CD99281"
                      value={engineNumber}
                      onChange={(e) => setEngineNumber(e.target.value.toUpperCase())}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono uppercase focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Admin GPS Software Login Credentials */}
              <div className="space-y-3 bg-indigo-50/50 p-3.5 rounded-2xl border border-indigo-200/80">
                <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-indigo-600" /> GPS Software Login Credentials (Created by Admin)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-indigo-900 mb-1">Software User ID / Login</label>
                    <input
                      type="text"
                      placeholder="e.g. ramesh_fleet"
                      value={softwareUserId}
                      onChange={(e) => setSoftwareUserId(e.target.value)}
                      className="w-full bg-white border border-indigo-200 rounded-xl p-2.5 text-xs font-mono text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-indigo-900 mb-1">Software Password</label>
                    <input
                      type="text"
                      placeholder="e.g. Pass@1234"
                      value={softwarePassword}
                      onChange={(e) => setSoftwarePassword(e.target.value)}
                      className="w-full bg-white border border-indigo-200 rounded-xl p-2.5 text-xs font-mono text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-indigo-700">Stored safely so you can re-share or check customer credentials anytime.</p>
              </div>

              {/* Sales Pricing & Payment Collection */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sale Price (INR)</label>
                  <input
                    type="number"
                    placeholder="e.g. 6500"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Payment Status</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-900 font-bold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="RECEIVED">RECEIVED (Paid)</option>
                    <option value="NOT RECEIVED">NOT RECEIVED (Pending)</option>
                    <option value="PARTIAL">PARTIAL PAYMENT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Technician / Installer</label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh (Technician)"
                    value={installedBy}
                    onChange={(e) => setInstalledBy(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* 1-Click WhatsApp Auto-Dispatch Option (Option 1) */}
              <div className="p-3 bg-emerald-50/90 border border-emerald-300 rounded-2xl flex items-center justify-between gap-3 shadow-2xs">
                <label className="flex items-center gap-2.5 text-xs text-emerald-950 font-bold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoSendWhatsAppPayment}
                    onChange={(e) => setAutoSendWhatsAppPayment(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                  />
                  <span>💬 Automatically open WhatsApp with 1-Click UPI Payment Link on Save</span>
                </label>
                <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-extrabold uppercase tracking-wider hidden sm:inline">
                  Recommended
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!imei.trim() || !vehicleNumber.trim()) {
                      alert('Please enter at least IMEI and Vehicle Number to preview Payment QR.');
                      return;
                    }
                    setPaymentQrData({
                      imei: imei.trim(),
                      vehicleNumber: vehicleNumber.trim().toUpperCase(),
                      customerName: customerName.trim() || 'Valued Customer',
                      customerPhone: phone.trim(),
                      salePrice: salePrice ? parseFloat(salePrice) : 6500,
                      paymentStatus: paymentStatus,
                      stockPlace: location.trim() || 'FuelTracks Central'
                    });
                    setIsPaymentQrOpen(true);
                  }}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-emerald-300 hover:text-emerald-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700 shadow-2xs"
                  title="Preview & Send UPI Payment QR Code"
                >
                  <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Preview Payment QR</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Save & Update Master Stock
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Bulk WhatsApp Installs Paste Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <Layers className="w-5 h-5 text-indigo-600" />
                <span>Bulk WhatsApp Installs Processor</span>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            {bulkResult ? (
              <div className="space-y-4 animate-in zoom-in-95">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-1">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <div className="text-sm font-bold text-emerald-900">{bulkResult.message}</div>
                  <p className="text-xs text-emerald-700">Master stock inventory and CRM records have been updated automatically.</p>
                </div>

                {bulkResult.processed?.length > 0 && (
                  <div className="max-h-40 overflow-y-auto bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-mono space-y-1">
                    {bulkResult.processed.map((p, i) => (
                      <div key={i} className="flex justify-between text-slate-700">
                        <span>{p.vehicle} ({p.imei})</span>
                        <span className="font-bold text-emerald-700">{p.customer}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={() => setShowBulkModal(false)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
                  >
                    Done & View Inventory
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleBulkSubmit} className="space-y-4">
                <p className="text-xs text-slate-600">
                  Paste the daily installation updates received from technicians on WhatsApp. Each line will be parsed and linked automatically:
                </p>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600 font-mono">
                  <div className="font-bold text-slate-700 mb-1">Format per line (Comma or Tab separated):</div>
                  <code>IMEI, VehicleNumber, CustomerName, Phone, [SoftwareLogin], [Password], [Price]</code>
                  <div className="mt-1 text-slate-400">Example: 864920050019101, AP21TZ8829, Ramesh Trans, 9876543210, ramesh_gps, pass123, 6500</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Technician / Installer Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Pradeep (Technician)"
                      value={installedBy}
                      onChange={(e) => setInstalledBy(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Default Unit Price (INR)</label>
                    <input
                      type="number"
                      placeholder="e.g. 5000"
                      value={salePrice}
                      onChange={(e) => setSalePrice(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <textarea
                    rows={6}
                    required
                    placeholder="864920050019101, AP21TZ8829, Ramesh Trans, 9876543210, ramesh_gps, pass123, 6500&#10;864920050019102, KA01MJ9900, Suresh Logistics, 9123456789, suresh_gps, pass456, 7500..."
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowBulkModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bulkSubmitting || !bulkText.trim()}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    {bulkSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                    Process All Batch Installs
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* Payment QR Code Modal */}
      <PaymentQrModal
        isOpen={isPaymentQrOpen}
        onClose={() => setIsPaymentQrOpen(false)}
        paymentData={paymentQrData}
        onPaymentUpdated={() => loadData()}
      />

    </div>
  );
}
