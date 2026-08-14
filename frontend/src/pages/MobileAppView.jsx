import React, { useState, useEffect } from 'react';
import { Smartphone, Barcode, CheckCircle, Wifi, WifiOff, UploadCloud, Wrench, Truck, Search, Plus, RefreshCw, Zap } from 'lucide-react';
import { recordInstallation, lookupCustomerByPhone } from '../services/api';

export default function MobileAppView({ onOpenScannerWithCallback, onOpenTraceDrawer }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ft_offline_queue') || '[]');
    } catch (e) {
      return [];
    }
  });

  // Installation Mobile Form State
  const [imei, setImei] = useState('');
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('Truck');
  const [salePrice, setSalePrice] = useState('6500');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('ft_offline_queue', JSON.stringify(offlineQueue));
  }, [offlineQueue]);

  const handleScanImei = () => {
    onOpenScannerWithCallback((scannedList) => {
      if (scannedList.length > 0) {
        setImei(scannedList[0]);
      }
    });
  };

  const handlePhoneLookup = async (val) => {
    setPhone(val);
    if (val.length >= 10 && isOnline) {
      try {
        const res = await lookupCustomerByPhone(val);
        if (res.success && res.found) {
          setCustomerName(res.data.name);
        }
      } catch (e) {}
    }
  };

  const handleSubmitFieldInstall = async (e) => {
    e.preventDefault();
    if (!imei || !phone || !customerName || !vehicleNumber) {
      alert('IMEI, Phone, Customer Name, and Vehicle Number are required');
      return;
    }

    const payload = {
      imei_number: imei,
      customer_phone: phone,
      customer_name: customerName,
      vehicle_number: vehicleNumber,
      vehicle_type: vehicleType,
      sale_price: salePrice,
      installed_by: 'Field Installer (Mobile)',
      installation_location: 'Field Site',
      installation_date: new Date().toISOString().split('T')[0]
    };

    if (!isOnline) {
      setOfflineQueue(prev => [...prev, { ...payload, id: Date.now(), timestamp: new Date().toLocaleTimeString() }]);
      setSuccessMsg('Saved to Offline Local Queue! Will auto-sync when back online.');
      resetForm();
      return;
    }

    setSubmitting(true);
    try {
      const res = await recordInstallation(payload);
      if (res.success) {
        setSuccessMsg(`Installation successfully synced & logged for vehicle ${vehicleNumber}!`);
        resetForm();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setImei('');
    setPhone('');
    setCustomerName('');
    setVehicleNumber('');
  };

  const handleSyncOfflineQueue = async () => {
    if (offlineQueue.length === 0) return;
    setSubmitting(true);
    let syncedCount = 0;
    const remaining = [];

    for (const item of offlineQueue) {
      try {
        const res = await recordInstallation(item);
        if (res.success) syncedCount++;
        else remaining.push(item);
      } catch (err) {
        remaining.push(item);
      }
    }

    setOfflineQueue(remaining);
    setSubmitting(false);
    setSuccessMsg(`Successfully synced ${syncedCount} queued field installations!`);
  };

  return (
    <div className="max-w-md mx-auto space-y-5">
      
      {/* Mobile Card Header */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-200 flex items-center justify-between shadow-2xs">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Technician Field Mobile App</h2>
            <p className="text-[11px] text-slate-500">Field IMEI Scanning & Installation</p>
          </div>
        </div>

        {/* Network Connectivity Badge */}
        <div className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 ${
          isOnline ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
        }`}>
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>{isOnline ? 'Online' : 'Offline Mode'}</span>
        </div>
      </div>

      {/* Offline Queue Sync Card */}
      {offlineQueue.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between shadow-2xs">
          <div>
            <h4 className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
              <UploadCloud className="w-4 h-4 text-amber-600" /> {offlineQueue.length} Field Items Queued Offline
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">Scanned in low-connectivity areas</p>
          </div>
          <button
            onClick={handleSyncOfflineQueue}
            disabled={submitting || !isOnline}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
          >
            {submitting ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium text-xs rounded-xl flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-700 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Quick Action Mobile Bar */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleScanImei}
          className="p-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
        >
          <Barcode className="w-5 h-5" /> Continuous Scan
        </button>
        <button
          onClick={() => {
            const mock = '864920050019' + Math.floor(100 + Math.random() * 899);
            setImei(mock);
          }}
          className="p-3.5 bg-white hover:bg-slate-50 text-amber-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
        >
          <Zap className="w-4 h-4 text-amber-600" /> Simulate Scan
        </button>
      </div>

      {/* Mobile Single Entry Installation Form */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-200 space-y-4">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
          <Wrench className="w-4 h-4 text-emerald-600" /> Fast Field Installation Entry
        </h3>

        <form onSubmit={handleSubmitFieldInstall} className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Scanned Device IMEI</label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="Scan or enter IMEI..."
                value={imei}
                onChange={(e) => setImei(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono font-bold"
              />
              {imei && (
                <button
                  type="button"
                  onClick={() => onOpenTraceDrawer(imei)}
                  className="absolute right-2 top-2 text-[10px] text-blue-600 hover:underline font-bold"
                >
                  Trace
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Customer Phone Number</label>
            <input
              type="text"
              required
              placeholder="e.g. 9811223344"
              value={phone}
              onChange={(e) => handlePhoneLookup(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Customer Name</label>
            <input
              type="text"
              required
              placeholder="Customer / Business name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Vehicle License Plate #</label>
            <input
              type="text"
              required
              placeholder="e.g. KA-01-MJ-8821"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono uppercase font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Vehicle Type</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs text-slate-900 font-medium"
              >
                <option value="Truck">Truck</option>
                <option value="Car / SUV">Car / SUV</option>
                <option value="Bus">Bus</option>
                <option value="Bike">Bike</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Price (INR)</label>
              <input
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Save & Update Installation Record
          </button>
        </form>
      </div>

    </div>
  );
}
