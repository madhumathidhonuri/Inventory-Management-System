import React, { useState, useEffect } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { recordInstallation, recordBulkInstallations, fetchInstallations, lookupCustomerByPhone } from '../services/api';

export default function InstallationPage({ onOpenScannerWithCallback, onOpenTraceDrawer }) {
  const [installations, setInstallations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Single Action Form State
  const [showModal, setShowModal] = useState(false);
  const [imei, setImei] = useState('');
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('Commercial / Heavy');
  const [salePrice, setSalePrice] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('RECEIVED');
  const [softwareUserId, setSoftwareUserId] = useState('');
  const [softwarePassword, setSoftwarePassword] = useState('');
  const [installedBy, setInstalledBy] = useState('Technician');
  const [installationDate, setInstallationDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [location, setLocation] = useState('');
  const [remarks, setRemarks] = useState('');

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
        sale_price: salePrice ? parseFloat(salePrice) : 0,
        payment_status: paymentStatus,
        software_user_id: softwareUserId.trim(),
        software_password: softwarePassword.trim(),
        installed_by: installedBy.trim() || 'Technician',
        installation_date: installationDate,
        installation_location: location.trim(),
        remarks: remarks.trim()
      });

      if (res.success) {
        setSuccessToast(`✅ Successfully linked vehicle ${vehicleNumber.trim().toUpperCase()} with IMEI ${imei.trim()}! Master stock updated to INSTALLED.`);
        setShowModal(false);
        // Reset form
        setImei('');
        setPhone('');
        setCustomerName('');
        setCustomerEmail('');
        setCustomerAddress('');
        setVehicleNumber('');
        setSalePrice('');
        setSoftwareUserId('');
        setSoftwarePassword('');
        setCustLookup(null);
        loadData();
        setTimeout(() => setSuccessToast(''), 6000);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Parse and Submit Bulk WhatsApp Text Batch
  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (!bulkText.trim()) return;

    // Parse lines: comma, tab, or pipe separated
    // Expected flexible columns: IMEI, Vehicle, Customer, Phone, LoginID, Password, Price
    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsedList = [];

    for (const line of lines) {
      const parts = line.split(/[,\t|]+/).map(p => p.trim());
      if (parts.length >= 3) {
        parsedList.push({
          imei: parts[0],
          vehicle: parts[1],
          name: parts[2] || 'Customer',
          phone: parts[3] || '9999999999',
          software_user_id: parts[4] || '',
          software_password: parts[5] || '',
          sale_price: parts[6] ? parseFloat(parts[6]) : 0,
          payment_status: 'RECEIVED'
        });
      }
    }

    if (parsedList.length === 0) {
      alert('Could not parse valid lines. Please format each line as: IMEI, VehicleNumber, CustomerName, Phone, [LoginID], [Password], [Price]');
      return;
    }

    setBulkSubmitting(true);
    try {
      const res = await recordBulkInstallations({ installations: parsedList });
      if (res.success) {
        setBulkResult(res);
        loadData();
      }
    } catch (err) {
      alert('Bulk processing failed: ' + err.message);
    } finally {
      setBulkSubmitting(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard!`);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-emerald-600" /> Vehicle Installations & WhatsApp Entry Hub
          </h2>
          <p className="text-xs text-slate-500">
            Enter WhatsApp technician updates here: auto-updates Vamosys/Volty/TrackNow master stock to <strong>INSTALLED</strong> and creates CRM accounts.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
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

      {/* Success Notification Banner */}
      {successToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-bold text-emerald-900 flex items-center justify-between gap-3 shadow-xs animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast('')} className="text-emerald-700 hover:text-emerald-900 font-normal">✕</button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="glass-panel p-4 rounded-2xl flex items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Vehicle #, Customer, Phone, IMEI, Software Login..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>
        <span className="text-xs text-slate-500 font-bold hidden sm:inline">{installations.length} Active Installations</span>
      </div>

      {/* Installations Data Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" /> Loading installation records...
          </div>
        ) : installations.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No installation records found. Click <strong>+ New Installation Entry</strong> to log a vehicle install.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                <tr>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5 font-mono">Vehicle Number</th>
                  <th className="p-3.5 font-mono">Device IMEI</th>
                  <th className="p-3.5">Customer & Phone</th>
                  <th className="p-3.5 bg-indigo-50/50 text-indigo-900 border-l border-r border-indigo-100">GPS Software Login</th>
                  <th className="p-3.5">Technician / City</th>
                  <th className="p-3.5">Price & Payment</th>
                  <th className="p-3.5 text-right sticky right-0 bg-slate-50 border-l border-slate-200">WhatsApp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {installations.map((inst) => {
                  const payStatus = (inst.payment_status || 'RECEIVED').toUpperCase();
                  const isPaid = payStatus.includes('REC') || payStatus.includes('PAID');

                  return (
                    <tr key={inst.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3.5 text-slate-600 font-mono">{inst.installation_date}</td>
                      
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

                      {/* 1-Click WhatsApp Trigger */}
                      <td className="p-3.5 text-right sticky right-0 bg-slate-50 border-l border-slate-200">
                        <a
                          href={`https://api.whatsapp.com/send?phone=${String(inst.customer_contact).replace(/[^0-9]/g, '')}&text=${encodeURIComponent(
                            `Hello ${inst.customer_name},\n\nYour GPS device (${inst.device_type_name || 'GPS Tracker'}) has been installed successfully in vehicle *${inst.vehicle_number}*.\n\n📱 *Device IMEI*: ${inst.imei_number}\n📅 *Installation Date*: ${inst.installation_date}\n\n🔐 *GPS Software Login Credentials*:\n- *Username / ID*: ${inst.software_user_id || 'Your registered phone'}\n- *Password*: ${inst.software_password || 'Provided separately'}\n\nThank you for choosing FuelTracks! For 24/7 support, contact us.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Send installation details & software login to customer via WhatsApp"
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold inline-flex items-center gap-1 shadow-2xs transition-colors"
                        >
                          <span>💬</span> Send Login
                        </a>
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

              {/* Submit Buttons */}
              <div className="flex gap-2 justify-end pt-2">
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

    </div>
  );
}
