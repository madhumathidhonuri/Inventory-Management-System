import React, { useState, useEffect } from 'react';
import { Wrench, Search, Plus, Barcode, CheckCircle, RefreshCw, UserCheck, ShieldCheck, Car } from 'lucide-react';
import { recordInstallation, fetchInstallations, lookupCustomerByPhone } from '../services/api';

export default function InstallationPage({ onOpenScannerWithCallback, onOpenTraceDrawer }) {
  const [installations, setInstallations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Single Action Form State
  const [showModal, setShowModal] = useState(false);
  const [imei, setImei] = useState('864920050019101');
  const [phone, setPhone] = useState('9123456789');
  const [customerName, setCustomerName] = useState('Sharma Logistics Ltd');
  const [customerAddress, setCustomerAddress] = useState('Peenya Industrial Hub');
  const [vehicleNumber, setVehicleNumber] = useState('KA-01-MJ-8829');
  const [vehicleType, setVehicleType] = useState('Heavy Truck (12 Wheeler)');
  const [salePrice, setSalePrice] = useState('7500');
  const [installedBy, setInstalledBy] = useState('Rajesh Technician');
  const [salesManager, setSalesManager] = useState('Vikram Sales Mgr');
  const [salesPerson, setSalesPerson] = useState('Rajesh Technician');
  const [location, setLocation] = useState('Peenya Truck Terminal');
  const [warrantyEnd, setWarrantyEnd] = useState('2027-08-15');
  const [remarks, setRemarks] = useState('GPS Tracker installed behind dashboard');

  // Customer Auto Match Lookup Status
  const [custLookup, setCustLookup] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (val.length >= 10) {
      try {
        const res = await lookupCustomerByPhone(val);
        if (res.success && res.found) {
          setCustLookup(res.data);
          setCustomerName(res.data.name);
          setCustomerAddress(res.data.address || '');
        } else {
          setCustLookup(null);
        }
      } catch (e) {}
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
    if (!imei || !phone || !customerName || !vehicleNumber) {
      alert('IMEI, Phone, Customer Name, and Vehicle Number are required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await recordInstallation({
        imei_number: imei,
        customer_phone: phone,
        customer_name: customerName,
        customer_address: customerAddress,
        vehicle_number: vehicleNumber,
        vehicle_type: vehicleType,
        sale_price: salePrice,
        installed_by: installedBy,
        sales_manager: salesManager,
        sales_person: salesPerson,
        installation_location: location,
        warranty_end_date: warrantyEnd,
        remarks
      });

      if (res.success) {
        setShowModal(false);
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-emerald-600" /> Installation Hub & Field Entry
          </h2>
          <p className="text-xs text-slate-500">Single-entry workflow: records vehicle installation, auto-links CRM customer record, updates device status to INSTALLED</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs flex items-center gap-1.5 self-start md:self-auto transition-colors"
        >
          <Plus className="w-4 h-4" /> Quick Installation Entry
        </button>
      </div>

      {/* Filter Bar */}
      <div className="glass-panel p-4 rounded-2xl flex items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Vehicle #, Customer, Phone, IMEI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>
        <span className="text-xs text-slate-500 font-medium hidden sm:inline">{installations.length} Active Installations</span>
      </div>

      {/* Installations Data Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" /> Loading installation records...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3.5 font-bold">Date</th>
                  <th className="p-3.5 font-bold font-mono">Vehicle Number</th>
                  <th className="p-3.5 font-bold font-mono">IMEI Number</th>
                  <th className="p-3.5 font-bold">Customer Name</th>
                  <th className="p-3.5 font-bold">Customer Phone</th>
                  <th className="p-3.5 font-bold">Installer</th>
                  <th className="p-3.5 font-bold text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {installations.map((inst) => (
                  <tr key={inst.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 text-slate-600">{inst.installation_date}</td>
                    <td className="p-3.5 font-mono text-amber-700 font-bold flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5 text-amber-600" />
                      {inst.vehicle_number}
                    </td>
                    <td className="p-3.5 font-mono text-blue-600 font-bold">
                      <button onClick={() => onOpenTraceDrawer(inst.imei_number)} className="hover:underline">
                        {inst.imei_number}
                      </button>
                    </td>
                    <td className="p-3.5 text-slate-900 font-bold">{inst.customer_name}</td>
                    <td className="p-3.5 font-mono text-slate-600">{inst.customer_contact}</td>
                    <td className="p-3.5 text-slate-500">{inst.installed_by}</td>
                    <td className="p-3.5 text-right font-mono text-emerald-700 font-bold">₹{inst.sale_price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Single Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3">
              <Wrench className="w-5 h-5 text-emerald-600" /> Record New Device Installation (Single Entry)
            </h3>

            <form onSubmit={handleSubmitInstallation} className="space-y-4">
              
              {/* Device & Phone Lookup Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">Device IMEI</label>
                    <button type="button" onClick={handleScanImei} className="text-[11px] text-blue-600 font-semibold flex items-center gap-1">
                      <Barcode className="w-3 h-3" /> Scan
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Customer Phone Number</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter phone to auto-lookup..."
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Customer Match Notification Banner */}
              {custLookup && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>Existing customer found! Attached to customer record ({custLookup.existing_vehicles.length} previous vehicles).</span>
                </div>
              )}

              {/* Customer & Vehicle Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle Number</label>
                  <input
                    type="text"
                    required
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono uppercase font-bold"
                  />
                </div>
              </div>

              {/* Price, Installer, Warranty */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sale Price (INR)</label>
                  <input
                    type="number"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Installed By</label>
                  <input
                    type="text"
                    value={installedBy}
                    onChange={(e) => setInstalledBy(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Warranty End Date</label>
                  <input
                    type="date"
                    value={warrantyEnd}
                    onChange={(e) => setWarrantyEnd(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-medium rounded-xl">Cancel</button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
                >
                  {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Confirm & Save Record'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
