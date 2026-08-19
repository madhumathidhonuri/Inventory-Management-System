import React, { useState, useEffect } from 'react';
import { Truck, Plus, Search, Barcode, Eye, RotateCcw, RefreshCw, CheckCircle2, Building2, MapPin, UserCheck, Check, Layers, ArrowRight, Printer, Download, Store } from 'lucide-react';
import { fetchDispatches, fetchDispatchById, createDispatch, returnDispatchStock, fetchDealerStockSummary, fetchUsers, fetchDevices } from '../services/api';
import { useAuth } from '../context/AuthContext';
import DealerDetailModal from '../components/DealerDetailModal';

export default function DispatchPage({ onOpenScannerWithCallback, onOpenTraceDrawer }) {
  const { user } = useAuth();
  const isDealer = user?.role === 'DEALER';

  const [dispatches, setDispatches] = useState([]);
  const [dealerSummary, setDealerSummary] = useState([]);
  const [dealersList, setDealersList] = useState([]);
  const [warehouseDevices, setWarehouseDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDealerModal, setSelectedDealerModal] = useState(null);

  // New Dispatch Form State
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedDealerId, setSelectedDealerId] = useState('');
  const [dealerName, setDealerName] = useState('Jaya Surya');
  const [dealerContact, setDealerContact] = useState('9848012345');
  const [location, setLocation] = useState('Kurnool');
  const [dispatchType, setDispatchType] = useState('DEALER');
  const [remarks, setRemarks] = useState('Stock assignment for dealer');
  const [dispatchImeisInput, setDispatchImeisInput] = useState('');
  const [warehouseFilterType, setWarehouseFilterType] = useState('ALL');
  const [showWarehousePicker, setShowWarehousePicker] = useState(false);

  // Detail Modal State
  const [selectedDispatch, setSelectedDispatch] = useState(null);
  
  // Return Modal State
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnImeisInput, setReturnImeisInput] = useState('');
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    loadData();
    loadDealers();
    loadWarehouseDevices();
  }, []);

  const loadWarehouseDevices = async () => {
    try {
      const res = await fetchDevices({ status: 'IN_WAREHOUSE' });
      if (res.success && Array.isArray(res.data)) {
        const warehouseOnly = res.data.filter(d => d.current_status === 'IN_WAREHOUSE' || d.current_status === 'RETURNED');
        setWarehouseDevices(warehouseOnly);
      }
    } catch (e) {
      console.warn('Failed to load warehouse devices:', e);
    }
  };

  const loadDealers = async () => {
    try {
      const res = await fetchUsers();
      if (res.success && Array.isArray(res.data)) {
        const dealers = res.data.filter(u => u.role === 'DEALER');
        setDealersList(dealers);
        if (dealers.length > 0) {
          const d0 = dealers[0];
          setSelectedDealerId(d0.id.toString());
          setDealerName(d0.name);
          setDealerContact(d0.phone || '');
          setLocation(d0.region || 'Regional Hub');
        }
      }
    } catch (e) {
      console.warn('Failed to load dealer users:', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (isDealer && user?.name) {
        params.dealer_name = user.name;
      }
      const [dRes, sRes] = await Promise.all([
        fetchDispatches(params),
        fetchDealerStockSummary()
      ]);
      if (dRes.success) setDispatches(dRes.data);
      if (sRes.success) setDealerSummary(sRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDealerDropdownChange = (dealerId) => {
    setSelectedDealerId(dealerId);
    if (dealerId === '__NEW__') {
      setDealerName('');
      setDealerContact('');
      setLocation('');
      return;
    }
    const found = dealersList.find(d => d.id.toString() === dealerId.toString());
    if (found) {
      setDealerName(found.name);
      setDealerContact(found.phone || '');
      setLocation(found.region || 'Regional Hub');
    }
  };

  const handleOpenScannerForDispatch = () => {
    onOpenScannerWithCallback((scannedList) => {
      setDispatchImeisInput(prev => {
        const existing = prev.split(/[\n, ]+/).filter(Boolean);
        const combined = Array.from(new Set([...existing, ...scannedList]));
        return combined.join('\n');
      });
      setShowNewModal(true);
    });
  };

  const handleCreateDispatch = async () => {
    const parsedImeis = dispatchImeisInput.split(/[\n, ]+/).map(s => s.trim()).filter(Boolean);
    if (!dealerName || !location || parsedImeis.length === 0) {
      alert('Dealer name, location, and at least 1 IMEI are required');
      return;
    }
    setLoading(true);
    try {
      const res = await createDispatch({
        dispatched_by: 'Warehouse Manager',
        dealer_name: dealerName,
        dealer_contact: dealerContact,
        location,
        dispatch_type: dispatchType,
        remarks,
        imeis: parsedImeis
      });
 
      if (res.success) {
        setShowNewModal(false);
        setDispatchImeisInput('');
        loadData();
        loadWarehouseDevices();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessReturn = async () => {
    const list = returnImeisInput.split(/[\n, ]+/).map(s => s.trim()).filter(Boolean);
    if (list.length === 0) return;

    setReturning(true);
    try {
      const res = await returnDispatchStock({
        imeis: list,
        returned_by: 'Warehouse Manager',
        reason: 'Dealer return'
      });
      if (res.success) {
        setShowReturnModal(false);
        setReturnImeisInput('');
        loadData();
        loadWarehouseDevices();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setReturning(false);
    }
  };

  const handleViewDispatch = async (id) => {
    try {
      const res = await fetchDispatchById(id);
      if (res.success) {
        setSelectedDispatch(res.data);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-600" /> Stock Dispatches & Dealer Holding
          </h2>
          <p className="text-xs text-slate-500">Dispatch stock to dealers/installers, track holding levels, and process returns</p>
        </div>

        <div className="flex gap-2 self-start md:self-auto">
          <button
            onClick={() => setShowReturnModal(true)}
            className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Process Stock Return
          </button>

          <button
            onClick={() => setShowNewModal(true)}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Dispatch
          </button>
        </div>
      </div>

      {/* Dealer Stock Summary Matrix Cards */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
          Per-Dealer Active Stock Summary
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {dealerSummary.map((item, idx) => (
            <div
              key={idx}
              onClick={() => setSelectedDealerModal(item.dealer_name)}
              className="glass-panel p-3.5 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 flex items-center justify-between transition-all cursor-pointer shadow-2xs group"
              title={`Click to view stock breakdown, sent units, and installed vehicles for ${item.dealer_name}`}
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-amber-800 transition-colors flex items-center gap-1">
                    <span>{item.dealer_name}</span>
                    <span className="text-[10px] text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">{item.device_type_name}</span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                {item.device_count} Units
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Dispatch History Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Dispatch Records History</h3>
          <span className="text-xs text-slate-500">{dispatches.length} Total Dispatches</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="p-3.5 font-bold">Dispatch #</th>
                <th className="p-3.5 font-bold">Date</th>
                <th className="p-3.5 font-bold">Dealer / Recipient</th>
                <th className="p-3.5 font-bold">Location</th>
                <th className="p-3.5 font-bold text-center">Device Count</th>
                <th className="p-3.5 font-bold">Status</th>
                <th className="p-3.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dispatches.map((disp) => (
                <tr key={disp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3.5 font-mono text-amber-700 font-bold">#DSP-{disp.id}</td>
                  <td className="p-3.5 text-slate-600 font-mono text-[11px]">{disp.dispatch_date}</td>
                  <td className="p-3.5 font-bold text-slate-900">
                    <button
                      onClick={() => setSelectedDealerModal(disp.dealer_name)}
                      className="hover:text-amber-700 hover:underline font-bold text-left cursor-pointer"
                      title={`Click to view dealer dossier for ${disp.dealer_name}`}
                    >
                      {disp.dealer_name}
                    </button>
                  </td>
                  <td className="p-3.5 text-slate-500">{disp.location}</td>
                  <td className="p-3.5 text-center font-mono font-bold text-slate-800">{disp.device_count}</td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      {disp.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => handleViewDispatch(disp.id)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium rounded-lg transition-colors inline-flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-600" /> View IMEIs
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Dispatch Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-600" /> Dispatch Stock to Dealer
            </h3>

            {/* Quick Dealer Account Selection */}
            {dealersList.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select Registered Dealer Account
                </label>
                <select
                  value={selectedDealerId}
                  onChange={(e) => handleDealerDropdownChange(e.target.value)}
                  className="w-full bg-blue-50/60 border border-blue-200 rounded-xl p-2 text-xs text-blue-950 font-semibold focus:outline-none focus:border-blue-500"
                >
                  {dealersList.map(d => (
                    <option key={d.id} value={d.id}>
                      🏪 {d.name} — {d.region || 'Branch'} ({d.phone || d.email})
                    </option>
                  ))}
                  <option value="__NEW__">➕ Type Other / Custom Dealer Manually</option>
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Dealer / Recipient Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jaya Surya"
                  value={dealerName}
                  onChange={(e) => setDealerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Dealer Phone Contact</label>
                <input
                  type="text"
                  placeholder="e.g. 9848012345"
                  value={dealerContact}
                  onChange={(e) => setDealerContact(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-900 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Destination Location / City *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kurnool, Bangalore"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Dispatch Type</label>
                <select
                  value={dispatchType}
                  onChange={(e) => setDispatchType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-900"
                >
                  <option value="DEALER">Dealer / Partner</option>
                  <option value="SALES_PERSON">Sales Executive</option>
                  <option value="OTHER">Branch / Other</option>
                </select>
              </div>
            </div>

            {/* Available Warehouse Stock Quick Helper */}
            {warehouseDevices.length > 0 && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    Available in Central Warehouse ({warehouseDevices.length} units)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowWarehousePicker(!showWarehousePicker)}
                    className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold underline"
                  >
                    {showWarehousePicker ? 'Hide Picker' : 'Quick Pick Units'}
                  </button>
                </div>

                {showWarehousePicker && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {['ALL', 'VAMOSYS', 'VOLTY', 'TRACKNOW'].map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setWarehouseFilterType(cat)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                            warehouseFilterType === cat
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {[5, 10, 20, 50].map(qty => (
                        <button
                          key={qty}
                          type="button"
                          onClick={() => {
                            const filtered = warehouseFilterType === 'ALL'
                              ? warehouseDevices
                              : warehouseDevices.filter(d => (d.device_type_name || '').toUpperCase().includes(warehouseFilterType));
                            const imeisToAdd = filtered.slice(0, qty).map(d => d.imei_number);
                            setDispatchImeisInput(prev => {
                              const existing = prev.split(/[\n, ]+/).filter(Boolean);
                              const combined = Array.from(new Set([...existing, ...imeisToAdd]));
                              return combined.join('\n');
                            });
                          }}
                          className="px-2 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-[10px] font-bold transition-colors"
                        >
                          + Pick {qty} {warehouseFilterType !== 'ALL' ? warehouseFilterType : 'Units'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Scanned IMEIs List Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  Assigned Devices ({dispatchImeisInput.split(/[\n, ]+/).filter(Boolean).length} IMEIs)
                </span>
                <button
                  type="button"
                  onClick={handleOpenScannerForDispatch}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium rounded-lg flex items-center gap-1 shadow-xs"
                >
                  <Barcode className="w-3.5 h-3.5" /> Bulk Camera Scan
                </button>
              </div>
 
              <textarea
                rows={3}
                placeholder="Paste or scan IMEIs (separated by comma or newline)..."
                value={dispatchImeisInput}
                onChange={(e) => setDispatchImeisInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono"
              />
            </div>
 
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => { setShowNewModal(false); setDispatchImeisInput(''); }} className="px-4 py-2 bg-slate-100 text-slate-700 text-xs rounded-xl font-medium">Cancel</button>
              <button
                onClick={handleCreateDispatch}
                disabled={loading || dispatchImeisInput.split(/[\n, ]+/).filter(Boolean).length === 0}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                Confirm Dispatch ({dispatchImeisInput.split(/[\n, ]+/).filter(Boolean).length} Units)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Detail Modal */}
      {selectedDispatch && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Dispatch Voucher #{selectedDispatch.id}</h3>
                <span className="text-[11px] text-slate-500">Official Stock Movement Record</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button onClick={() => setSelectedDispatch(null)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <p>Dealer / Recipient: <strong className="text-slate-900">{selectedDispatch.dealer_name}</strong></p>
              <p>Location: <strong className="text-slate-900">{selectedDispatch.location}</strong></p>
              <p>Contact Phone: <strong className="text-slate-900">{selectedDispatch.dealer_contact || 'N/A'}</strong></p>
              <p>Date: <strong className="text-slate-900">{selectedDispatch.dispatch_date}</strong></p>
            </div>

            <div className="max-h-[220px] overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1 bg-slate-50">
              {selectedDispatch.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 bg-white rounded-lg text-xs border border-slate-200">
                  <span className="font-mono text-blue-600 font-bold">{item.imei_number}</span>
                  <span className="text-slate-600">{item.device_type_name}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 font-semibold">{item.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Return Stock Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-purple-600" /> Return Stock to Warehouse
            </h3>
            <p className="text-xs text-slate-500">Scan or paste IMEIs returned by dealer or customer cancelation</p>

            <textarea
              rows={4}
              placeholder="Paste IMEIs to return (one per line)..."
              value={returnImeisInput}
              onChange={(e) => setReturnImeisInput(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono"
            />

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowReturnModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 text-xs rounded-xl font-medium">Cancel</button>
              <button
                onClick={handleProcessReturn}
                disabled={returning || !returnImeisInput.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl shadow-xs"
              >
                {returning ? 'Processing...' : 'Return Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dealer Stock & Performance Detail Dossier Modal */}
      <DealerDetailModal
        isOpen={Boolean(selectedDealerModal)}
        onClose={() => setSelectedDealerModal(null)}
        dealerName={selectedDealerModal}
        onOpenDeviceCard={onOpenTraceDrawer}
      />

    </div>
  );
}
