import React, { useState, useEffect, useMemo } from 'react';
import { Boxes, Search, Filter, RefreshCw, Eye, Edit3, ShieldAlert, CheckCircle2, Truck, Plus, Edit2, Trash2, X, Save, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchDevices,
  fetchDeviceTypes,
  updateDeviceStatus,
  updateDevice,
  deleteDevice,
  deletePurchaseBatch,
  bulkDeleteDevices,
  addDeviceColumn,
  renameDeviceColumn,
  deleteDeviceColumn,
  fetchPurchaseBatches
} from '../services/api';

export default function InventoryPage({ onOpenTraceDrawer }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || true;

  const [devices, setDevices] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');

  // Delete Batch / List State
  const [deletingBatchRecord, setDeletingBatchRecord] = useState(null);

  // Status Change Modal State
  const [statusEditingDevice, setStatusEditingDevice] = useState(null);
  const [newStatus, setNewStatus] = useState('FAULTY');
  const [remarks, setRemarks] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Full Row Editing Modal State
  const [editingRowDevice, setEditingRowDevice] = useState(null);
  const [rowFormData, setRowFormData] = useState({
    imei_number: '',
    sim_number: '',
    purchase_price: '',
    additional_attributes: {}
  });
  const [savingRow, setSavingRow] = useState(false);

  // Deletion States (Super Admin)
  const [deletingDeviceRecord, setDeletingDeviceRecord] = useState(null);
  const [isClearListModalOpen, setIsClearListModalOpen] = useState(false);
  const [clearScope, setClearScope] = useState('ALL');
  const [selectedBatchToClear, setSelectedBatchToClear] = useState('');
  const [clearConfirmInput, setClearConfirmInput] = useState('');
  const [deletingLoading, setDeletingLoading] = useState(false);

  // Column Schema Management Modals State
  const [isAddColModalOpen, setIsAddColModalOpen] = useState(false);
  const [newColName, setNewColName] = useState('');

  const [renamingCol, setRenamingCol] = useState(null);
  const [newHeaderName, setNewHeaderName] = useState('');

  const [deletingCol, setDeletingCol] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadData();
    refreshDeviceTypes();
  }, [statusFilter, typeFilter, batchFilter]);

  const refreshDeviceTypes = () => {
    fetchDeviceTypes().then(res => {
      if (res.success) setDeviceTypes(res.data);
    });
    fetchPurchaseBatches().then(res => {
      if (res.success) setBatches(res.data);
    }).catch(err => console.error(err));
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.device_type_id = typeFilter;
      if (batchFilter) params.purchase_batch_id = batchFilter;
      if (search) params.search = search;

      const res = await fetchDevices(params);
      if (res.success) {
        setDevices(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Determine dynamic custom column headers
  const customColumns = useMemo(() => {
    const keysSet = new Set();

    if (typeFilter) {
      const targetDt = deviceTypes.find(dt => dt.id.toString() === typeFilter.toString());
      if (targetDt && targetDt.custom_fields) {
        const fields = Array.isArray(targetDt.custom_fields)
          ? targetDt.custom_fields
          : Object.keys(targetDt.custom_fields);
        fields.forEach(f => {
          if (f && f !== 'original_row') keysSet.add(f);
        });
      }
    }

    devices.forEach(dev => {
      if (dev.additional_attributes && typeof dev.additional_attributes === 'object') {
        Object.keys(dev.additional_attributes).forEach(k => {
          if (k && k !== 'original_row') keysSet.add(k);
        });
      }
    });

    return Array.from(keysSet);
  }, [typeFilter, deviceTypes, devices]);

  const activeDeviceTypeId = useMemo(() => {
    if (typeFilter) return parseInt(typeFilter);
    if (deviceTypes.length > 0) return deviceTypes[0].id;
    return null;
  }, [typeFilter, deviceTypes]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadData();
  };

  const handleStatusUpdate = async () => {
    if (!statusEditingDevice) return;
    setUpdatingStatus(true);
    try {
      const res = await updateDeviceStatus(statusEditingDevice.id, {
        status: newStatus,
        remarks,
        performed_by: 'Warehouse Admin'
      });
      if (res.success) {
        setStatusEditingDevice(null);
        setRemarks('');
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openEditRowModal = (dev) => {
    setEditingRowDevice(dev);
    setRowFormData({
      imei_number: dev.imei_number || '',
      sim_number: dev.sim_number || '',
      purchase_price: dev.purchase_price !== null && dev.purchase_price !== undefined ? dev.purchase_price.toString() : '',
      additional_attributes: dev.additional_attributes ? { ...dev.additional_attributes } : {}
    });
  };

  const handleRowSave = async () => {
    if (!editingRowDevice) return;
    setSavingRow(true);
    try {
      const payload = {
        imei_number: rowFormData.imei_number,
        sim_number: rowFormData.sim_number,
        purchase_price: rowFormData.purchase_price ? parseFloat(rowFormData.purchase_price) : null,
        additional_attributes: rowFormData.additional_attributes
      };

      const res = await updateDevice(editingRowDevice.id, payload);
      if (res.success) {
        setEditingRowDevice(null);
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingRow(false);
    }
  };

  const selectedBatchObj = useMemo(() => {
    if (!batchFilter) return null;
    return batches.find(b => b.id.toString() === batchFilter.toString()) || null;
  }, [batchFilter, batches]);

  const handleDeleteBatch = async () => {
    if (!deletingBatchRecord) return;
    setDeletingLoading(true);
    try {
      const res = await deletePurchaseBatch(deletingBatchRecord.id);
      if (res.success) {
        setDeletingBatchRecord(null);
        if (batchFilter === deletingBatchRecord.id.toString()) {
          setBatchFilter('');
        }
        refreshDeviceTypes();
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingLoading(false);
    }
  };

  const handleDeleteSingleRecord = async () => {
    if (!deletingDeviceRecord) return;
    setDeletingLoading(true);
    try {
      const res = await deleteDevice(deletingDeviceRecord.id);
      if (res.success) {
        setDeletingDeviceRecord(null);
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingLoading(false);
    }
  };

  const handleClearStockList = async () => {
    if (clearConfirmInput.trim().toUpperCase() !== 'DELETE') {
      alert('Please type "DELETE" to confirm');
      return;
    }
    setDeletingLoading(true);
    try {
      const payload = {};
      if (clearScope === 'BATCH' && selectedBatchToClear) {
        payload.purchase_batch_id = parseInt(selectedBatchToClear);
      } else if (clearScope === 'FILTERED' && typeFilter) {
        payload.device_type_id = parseInt(typeFilter);
      } else {
        payload.clear_all = true;
      }

      const res = await bulkDeleteDevices(payload);
      if (res.success) {
        setIsClearListModalOpen(false);
        setClearConfirmInput('');
        if (clearScope === 'BATCH' && batchFilter === selectedBatchToClear) {
          setBatchFilter('');
        }
        refreshDeviceTypes();
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingLoading(false);
    }
  };

  const handleAddColumn = async () => {
    if (!newColName.trim()) return;
    if (!activeDeviceTypeId) {
      alert('Please select or register a Device Type first');
      return;
    }
    setActionLoading(true);
    try {
      await addDeviceColumn(activeDeviceTypeId, newColName.trim());
      setNewColName('');
      setIsAddColModalOpen(false);
      refreshDeviceTypes();
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenameColumn = async () => {
    if (!renamingCol || !newHeaderName.trim()) return;
    setActionLoading(true);
    try {
      const typeId = typeFilter ? parseInt(typeFilter) : 'all';
      await renameDeviceColumn(typeId, renamingCol, newHeaderName.trim());
      setRenamingCol(null);
      setNewHeaderName('');
      refreshDeviceTypes();
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteColumn = async () => {
    if (!deletingCol) return;
    setActionLoading(true);
    try {
      const typeId = typeFilter ? parseInt(typeFilter) : 'all';
      await deleteDeviceColumn(typeId, deletingCol);
      setDeletingCol(null);
      refreshDeviceTypes();
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const map = {
      IN_WAREHOUSE: 'badge-warehouse',
      WITH_DEALER: 'badge-dealer',
      INSTALLED: 'badge-installed',
      FAULTY: 'badge-faulty',
      RETURNED: 'badge-returned'
    };
    return map[status] || 'badge-warehouse';
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Main Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-blue-600" /> Dynamic Stock Inventory Grid
          </h2>
          <p className="text-xs text-slate-500">Live view of all IMEI stock with complete Excel column preservation & dynamic schema editing</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsAddColModalOpen(true)}
            className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl border border-blue-200 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <Plus className="w-4 h-4 text-blue-600" /> Add Custom Column
          </button>
          
          {isSuperAdmin && (
            <button
              onClick={() => { setClearScope(typeFilter ? 'FILTERED' : 'ALL'); setIsClearListModalOpen(true); }}
              className="px-3.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-xl border border-red-200 flex items-center gap-1.5 transition-colors shadow-2xs"
              title="Delete Complete List / Wipe Stock"
            >
              <Trash2 className="w-4 h-4 text-red-600" /> Clear / Delete Stock List
            </button>
          )}

          <button
            onClick={loadData}
            className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-600" /> Refresh Stock
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row gap-3 items-center justify-between">
        
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search IMEI, SIM, Custom Fields..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 font-mono focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </form>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="">All Statuses</option>
            <option value="IN_WAREHOUSE">In Warehouse</option>
            <option value="WITH_DEALER">With Dealer</option>
            <option value="INSTALLED">Installed</option>
            <option value="FAULTY">Faulty / RMA</option>
            <option value="RETURNED">Returned</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="">All Device Types</option>
            {deviceTypes.map(dt => (
              <option key={dt.id} value={dt.id}>{dt.name}</option>
            ))}
          </select>

          {/* Upload Lists Selector with dynamic Delete Button */}
          <div className="flex items-center gap-1.5">
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className={`bg-slate-50 border rounded-xl px-3 py-2 text-xs focus:outline-none max-w-[200px] truncate transition-colors ${
                batchFilter
                  ? 'border-blue-400 bg-blue-50/40 text-blue-900 font-bold'
                  : 'border-slate-200 text-slate-700 font-medium'
              }`}
            >
              <option value="">All Upload Lists</option>
              {batches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.notes ? `${b.notes} (${b.source_file})` : b.source_file}
                </option>
              ))}
            </select>

            {selectedBatchObj && isSuperAdmin && (
              <button
                type="button"
                onClick={() => setDeletingBatchRecord(selectedBatchObj)}
                className="px-2.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0 animate-fadeIn"
                title={`Delete list "${selectedBatchObj.source_file || selectedBatchObj.notes}" and its devices`}
              >
                <Trash2 className="w-3.5 h-3.5 text-white" />
                <span className="hidden sm:inline">Delete List</span>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Devices Dynamic Spreadsheet Grid Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" /> Loading stock inventory spreadsheet...
          </div>
        ) : devices.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No inventory devices found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-3.5 font-bold font-mono">Device IMEI</th>
                  <th className="p-3.5 font-bold">Device Type</th>

                  {/* Excel Sheet Columns */}
                  {customColumns.map((col) => (
                    <th key={col} className="p-3.5 font-bold border-l border-slate-200/80 bg-blue-50/40 text-blue-900 group">
                      <div className="flex items-center justify-between gap-2">
                        <span>{col}</span>
                        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setRenamingCol(col); setNewHeaderName(col); }}
                            title="Edit Column Header"
                            className="p-1 hover:bg-blue-100 text-blue-700 rounded"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setDeletingCol(col)}
                            title="Delete Column"
                            className="p-1 hover:bg-red-100 text-red-600 rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}

                  <th className="p-3.5 font-bold text-right sticky right-0 bg-slate-50 border-l border-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((dev) => (
                  <tr key={dev.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono text-blue-600 font-bold">
                      <button
                        onClick={() => onOpenTraceDrawer(dev.imei_number)}
                        className="hover:underline font-bold"
                      >
                        {dev.imei_number}
                      </button>
                    </td>
                    <td className="p-3.5 text-slate-800 font-medium">{dev.device_type_name}</td>

                    {/* Dynamic Custom Attributes Cells */}
                    {customColumns.map((col) => (
                      <td key={col} className="p-3.5 border-l border-slate-200/60 font-mono text-slate-700 bg-slate-50/30">
                        {dev.additional_attributes && dev.additional_attributes[col] !== undefined && dev.additional_attributes[col] !== null
                          ? String(dev.additional_attributes[col])
                          : '-'}
                      </td>
                    ))}

                    <td className="p-3.5 text-right space-x-1.5 sticky right-0 bg-white border-l border-slate-200">
                      <button
                        onClick={() => openEditRowModal(dev)}
                        title="Edit Row & Attributes"
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      
                      <button
                        onClick={() => { setStatusEditingDevice(dev); setNewStatus(dev.current_status); }}
                        title="Adjust Stock Status"
                        className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                      >
                        <ShieldAlert className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onOpenTraceDrawer(dev.imei_number)}
                        title="Trace Full Journey"
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Super Admin Single Record Delete Button */}
                      {isSuperAdmin && (
                        <button
                          onClick={() => setDeletingDeviceRecord(dev)}
                          title="Delete Record (Super Admin)"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Single Record Delete Modal */}
      {deletingDeviceRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" /> Delete Particular Record
              </h3>
              <button onClick={() => setDeletingDeviceRecord(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to permanently delete this device record from inventory stock?
            </p>

            <div className="p-3 bg-red-50/50 rounded-xl border border-red-100 space-y-1 text-xs font-mono">
              <div><span className="text-slate-500">IMEI:</span> <strong className="text-red-700">{deletingDeviceRecord.imei_number}</strong></div>
              <div><span className="text-slate-500">Device Type:</span> <strong className="text-slate-800">{deletingDeviceRecord.device_type_name}</strong></div>
              <div><span className="text-slate-500">Status:</span> <strong className="text-slate-800">{deletingDeviceRecord.current_status}</strong></div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setDeletingDeviceRecord(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSingleRecord}
                disabled={deletingLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                {deletingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Confirm Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Clear Complete Stock List Modal */}
      {isClearListModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" /> Wipe / Delete Stock Inventory
              </h3>
              <button onClick={() => setIsClearListModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Select Scope to Clear</label>
              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                  <input
                    type="radio"
                    name="clearScope"
                    value="ALL"
                    checked={clearScope === 'ALL'}
                    onChange={() => setClearScope('ALL')}
                  />
                  <span><strong>Complete Inventory List</strong> (Clear all devices across all types)</span>
                </label>

                {batches.length > 0 && (
                  <label className="flex flex-col gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="clearScope"
                        value="BATCH"
                        checked={clearScope === 'BATCH'}
                        onChange={() => {
                          setClearScope('BATCH');
                          if (!selectedBatchToClear && batches.length > 0) setSelectedBatchToClear(batches[0].id.toString());
                        }}
                      />
                      <span><strong>Specific Upload List</strong> (Delete selected file import)</span>
                    </div>
                    {clearScope === 'BATCH' && (
                      <select
                        value={selectedBatchToClear || batchFilter || (batches[0]?.id.toString() || '')}
                        onChange={(e) => setSelectedBatchToClear(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium text-slate-800 ml-5 max-w-[90%]"
                      >
                        {batches.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.notes ? `${b.notes} (${b.source_file})` : b.source_file}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                )}

                {typeFilter && (
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="clearScope"
                      value="FILTERED"
                      checked={clearScope === 'FILTERED'}
                      onChange={() => setClearScope('FILTERED')}
                    />
                    <span><strong>Selected Device Type Only</strong> (Clear stock for currently filtered device type)</span>
                  </label>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Type "DELETE" to Confirm</label>
              <input
                type="text"
                placeholder="Type DELETE..."
                value={clearConfirmInput}
                onChange={(e) => setClearConfirmInput(e.target.value)}
                className="w-full bg-slate-50 border border-red-300 rounded-xl p-2.5 font-mono text-xs text-red-700 font-bold focus:outline-none focus:bg-white"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => { setIsClearListModalOpen(false); setClearConfirmInput(''); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleClearStockList}
                disabled={deletingLoading || clearConfirmInput.trim().toUpperCase() !== 'DELETE'}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                {deletingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Execute Stock Wipe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Upload List Confirmation Modal */}
      {deletingBatchRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-scaleIn">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Upload List</h3>
                <p className="text-xs text-slate-500">Permanently delete this list and all its devices</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">List / File:</span>
                <span className="font-bold text-slate-900 font-mono">{deletingBatchRecord.source_file || 'Upload Batch'}</span>
              </div>
              {deletingBatchRecord.notes && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Notes / Label:</span>
                  <span className="font-semibold text-slate-800">{deletingBatchRecord.notes}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Vendor:</span>
                <span className="font-medium text-slate-700">{deletingBatchRecord.vendor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Device Type:</span>
                <span className="font-medium text-slate-700">{deletingBatchRecord.device_type_name}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500 font-medium">Import Count:</span>
                <span className="font-bold text-blue-700 font-mono">{deletingBatchRecord.total_devices_count || 0} devices</span>
              </div>
            </div>

            <p className="text-xs text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Warning: This will permanently delete all devices in this list along with their transaction history. This action cannot be undone.</span>
            </p>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setDeletingBatchRecord(null)}
                disabled={deletingLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBatch}
                disabled={deletingLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                {deletingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Yes, Delete List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Device Status Modal */}
      {statusEditingDevice && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-600" /> Adjust Device Status
              </h3>
              <button onClick={() => setStatusEditingDevice(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              IMEI: <strong className="text-blue-600 font-mono">{statusEditingDevice.imei_number}</strong>
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">New Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="IN_WAREHOUSE">IN_WAREHOUSE (Central Warehouse)</option>
                <option value="WITH_DEALER">WITH_DEALER</option>
                <option value="FAULTY">FAULTY (Mark Damaged/Faulty)</option>
                <option value="RMA">RMA (Return to Manufacturer)</option>
                <option value="RETURNED">RETURNED</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reason / Remarks</label>
              <textarea
                rows={3}
                placeholder="Enter reason for status change..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setStatusEditingDevice(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusUpdate}
                disabled={updatingStatus}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                {updatingStatus ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Save & Log Audit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Row & Attribute Editing Modal */}
      {editingRowDevice && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" /> Edit Device Row & Custom Attributes
              </h3>
              <button onClick={() => setEditingRowDevice(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">IMEI Number</label>
                <input
                  type="text"
                  value={rowFormData.imei_number}
                  onChange={(e) => setRowFormData({ ...rowFormData, imei_number: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono text-slate-900 font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">SIM Number</label>
                <input
                  type="text"
                  value={rowFormData.sim_number}
                  onChange={(e) => setRowFormData({ ...rowFormData, sim_number: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Purchase Price (₹)</label>
                <input
                  type="number"
                  value={rowFormData.purchase_price}
                  onChange={(e) => setRowFormData({ ...rowFormData, purchase_price: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Dynamic Custom Attributes Inputs */}
            {customColumns.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <h4 className="text-xs font-bold text-slate-800">Dynamic Excel Custom Fields</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {customColumns.map((col) => (
                    <div key={col}>
                      <label className="block font-medium text-slate-600 mb-1">{col}</label>
                      <input
                        type="text"
                        value={rowFormData.additional_attributes[col] || ''}
                        onChange={(e) => setRowFormData({
                          ...rowFormData,
                          additional_attributes: {
                            ...rowFormData.additional_attributes,
                            [col]: e.target.value
                          }
                        })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditingRowDevice(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleRowSave}
                disabled={savingRow}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                {savingRow ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Column Modal */}
      {isAddColModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" /> Add Custom Field / Column
            </h3>
            <p className="text-xs text-slate-500">
              Enter header name to add a dynamic column to the inventory table schema.
            </p>

            <input
              type="text"
              placeholder="Column Name (e.g., Sensor Length, Calibration)..."
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-500"
            />

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsAddColModalOpen(false)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleAddColumn}
                disabled={actionLoading || !newColName.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl"
              >
                Add Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Column Modal */}
      {renamingCol && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-blue-600" /> Edit Column Name
            </h3>
            <p className="text-xs text-slate-500">
              Renaming column <strong className="text-blue-600 font-mono">{renamingCol}</strong> across all device records.
            </p>

            <input
              type="text"
              value={newHeaderName}
              onChange={(e) => setNewHeaderName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-500"
            />

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRenamingCol(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameColumn}
                disabled={actionLoading || !newHeaderName.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl"
              >
                Update Column Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Column Confirmation Modal */}
      {deletingCol && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" /> Delete Column
            </h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete column <strong className="text-slate-900 font-mono">{deletingCol}</strong>? This will remove this field from inventory display and devices.
            </p>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeletingCol(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteColumn}
                disabled={actionLoading}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl"
              >
                Delete Column
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
