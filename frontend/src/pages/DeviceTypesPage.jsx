import React, { useState, useEffect } from 'react';
import { Settings, Plus, CheckCircle, Code, Tag, RefreshCw, FileSpreadsheet, Download, Edit3, Trash2, Check, X, ShieldAlert, DollarSign, AlertTriangle, Boxes, AlertCircle } from 'lucide-react';
import { fetchDeviceTypes, createDeviceType, updateDeviceType, deleteDeviceType } from '../services/api';
import { downloadStyledTemplate } from '../utils/excelExport';
import DevicePricingModal from '../components/DevicePricingModal';
import { useAuth } from '../context/AuthContext';
import * as xlsx from 'xlsx';

export default function DeviceTypesPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  
  // Delete Modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Create Modal state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('GPS Tracker');
  const [customFieldsJson, setCustomFieldsJson] = useState('{\n  "voltage": "9-36V"\n}');
  const [templateCols, setTemplateCols] = useState(['IMEI Number', 'SIM Number', 'Price', 'Vendor', 'Warranty Months', 'Invoice No']);
  const [newColInput, setNewColInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit Format Modal State
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [formatEditingCols, setFormatEditingCols] = useState([]);
  const [formatNewCol, setFormatNewCol] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchDeviceTypes();
      if (res.success) setTypes(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (cat) => {
    setCategory(cat);
    if (cat === 'Fuel Sensor') {
      setTemplateCols(['IMEI / Serial Number', 'SIM Number', 'Rod Length (mm)', 'Calibration Code', 'Price', 'Vendor', 'Invoice No']);
    } else if (cat === 'OBD Device') {
      setTemplateCols(['IMEI Number', 'SIM Number', 'Protocol', 'Price', 'Vendor', 'Invoice No']);
    } else if (cat === 'Accessory') {
      setTemplateCols(['Serial Number', 'Model Code', 'Price', 'Vendor', 'Remarks']);
    } else {
      setTemplateCols(['IMEI Number', 'SIM Number', 'Price', 'Vendor', 'Warranty Months', 'Invoice No']);
    }
  };

  const handleAddTemplateCol = () => {
    if (!newColInput.trim()) return;
    const col = newColInput.trim();
    if (!templateCols.includes(col)) {
      setTemplateCols([...templateCols, col]);
    }
    setNewColInput('');
  };

  const handleRemoveTemplateCol = (colToRemove) => {
    setTemplateCols(templateCols.filter(c => c !== colToRemove));
  };

  const handleCreateType = async (e) => {
    e.preventDefault();
    if (!name || !category) return;
    
    let parsedFields = {};
    try {
      parsedFields = JSON.parse(customFieldsJson);
    } catch (e) {
      alert('Invalid JSON in custom fields attributes');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createDeviceType({
        name,
        category,
        custom_fields: parsedFields,
        template_columns: templateCols
      });
      if (res.success) {
        setShowModal(false);
        setName('');
        setSaveSuccessMsg(`Device Model "${name}" created successfully.`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Format Modal for existing Device Type
  const openFormatModal = (deviceType) => {
    setEditingType(deviceType);
    setFormatEditingCols([...(deviceType.template_columns || [])]);
    setFormatNewCol('');
    setShowFormatModal(true);
  };

  const handleAddFormatCol = () => {
    if (!formatNewCol.trim()) return;
    const col = formatNewCol.trim();
    if (!formatEditingCols.includes(col)) {
      setFormatEditingCols([...formatEditingCols, col]);
    }
    setFormatNewCol('');
  };

  const handleRemoveFormatCol = (colToRemove) => {
    if (formatEditingCols.length <= 1) {
      alert('At least 1 primary identifier column is required in the Excel format');
      return;
    }
    setFormatEditingCols(formatEditingCols.filter(c => c !== colToRemove));
  };

  const handleSaveFormat = async () => {
    if (!editingType) return;
    setSubmitting(true);
    try {
      const res = await updateDeviceType(editingType.id, {
        template_columns: formatEditingCols
      });
      if (res.success) {
        setSaveSuccessMsg(`Excel format updated for ${editingType.name}`);
        setTimeout(() => setSaveSuccessMsg(''), 3000);
        setShowFormatModal(false);
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Open Delete Confirmation Modal
  const openDeleteModal = (deviceType) => {
    setTypeToDelete(deviceType);
    setDeleteError('');
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!typeToDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await deleteDeviceType(typeToDelete.id, true);
      if (res.success) {
        setSaveSuccessMsg(res.message || `Device Type "${typeToDelete.name}" deleted successfully.`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
        setShowDeleteModal(false);
        setTypeToDelete(null);
        loadData();
      }
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete device type');
    } finally {
      setDeleting(false);
    }
  };

  const downloadPreviewTemplate = async (deviceType) => {
    const cols = deviceType.template_columns || ['IMEI Number', 'SIM Number', 'Price', 'Vendor'];
    await downloadStyledTemplate(
      `${deviceType.name.replace(/\s+/g, '_')}_Upload_Format.xlsx`,
      deviceType.name,
      cols,
      '1E3A8A' // Royal Navy Blue Header
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" /> Device Types & Excel Upload Formats
          </h2>
          <p className="text-xs text-slate-500">Super Admin catalog: Configure unique Excel sheet columns, rates & schemas for each Device Model</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowPricingModal(true)}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <DollarSign className="w-4 h-4 text-emerald-600" /> Device Rates & Margins
          </button>
          <button
            onClick={() => {
              handleCategoryChange('GPS Tracker');
              setShowModal(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" /> Add Device Type
          </button>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" /> {saveSuccessMsg}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <span>Loading device types catalog...</span>
        </div>
      ) : types.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3 shadow-2xs">
          <Tag className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No Device Types Configured</p>
          <p className="text-xs text-slate-400">Click &quot;Add Device Type&quot; above to add a device model and configure its Excel upload format.</p>
        </div>
      ) : (
        /* Grid of Device Types */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {types.map((t) => (
            <div key={t.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4 hover:border-slate-300 transition-all flex flex-col justify-between group">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Tag className="w-4 h-4 text-blue-600" /> {t.name}
                    </h3>
                    {/* Live inventory badge */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        <Boxes className="w-3 h-3 text-slate-500" />
                        {t.device_count || 0} Total Units ({t.in_stock_count || 0} in Warehouse)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      {t.category}
                    </span>
                    {isSuperAdmin && (
                      <button
                        onClick={() => openDeleteModal(t)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-all"
                        title={`Delete ${t.name} from catalog`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Excel Format Configuration Section */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Excel Sheet Upload Format ({t.template_columns?.length || 0} Columns)
                    </span>
                    <button
                      onClick={() => openFormatModal(t)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
                    >
                      <Edit3 className="w-3 h-3" /> Edit Format
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(t.template_columns || []).map((col, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold rounded-md shadow-2xs flex items-center gap-1"
                      >
                        <span className="text-[10px] text-slate-400 font-mono">#{idx + 1}</span> {col}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => downloadPreviewTemplate(t)}
                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                  title="Download this device's sample Excel format"
                >
                  <Download className="w-3.5 h-3.5" /> Download Sample .xlsx
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openFormatModal(t)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors"
                  >
                    Configure Columns
                  </button>
                  {isSuperAdmin && (
                    <button
                      onClick={() => openDeleteModal(t)}
                      className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                      title={`Delete ${t.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" /> Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Confirm Delete Device Type & Stock */}
      {showDeleteModal && typeToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Delete Device Type</h3>
                  <p className="text-xs text-slate-500">Super Admin Catalog Action</p>
                </div>
              </div>
              <button
                onClick={() => !deleting && setShowDeleteModal(false)}
                disabled={deleting}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p>
                Are you sure you want to permanently delete <strong className="text-slate-900 font-bold">{typeToDelete.name}</strong> ({typeToDelete.category})?
              </p>

              {typeToDelete.device_count > 0 ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-amber-900">
                  <div className="flex items-center gap-2 font-bold text-xs text-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Active Stock Warning: {typeToDelete.device_count} Units Found</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-800/90">
                    Deleting this model will completely purge and remove all <strong className="font-bold">{typeToDelete.device_count} device records</strong> ({typeToDelete.in_stock_count || 0} in warehouse stock, {typeToDelete.installed_count || 0} installed), purchase batches, and rate configurations from the database.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-[11px]">
                  This device type has <span className="font-semibold text-slate-800">0 devices attached</span> in stock. It will be cleanly removed from the catalog.
                </div>
              )}

              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Deleting & Purging...' : typeToDelete.device_count > 0 ? 'Delete Type & Purge Stock' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Excel Format for Existing Device Type */}
      {showFormatModal && editingType && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Set Excel Format for {editingType.name}
                </h3>
                <p className="text-xs text-slate-500">Configure which columns the admin team must fill and upload for this device</p>
              </div>
              <button onClick={() => setShowFormatModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Configured Columns List */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Configured Excel Columns ({formatEditingCols.length})</label>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 max-h-56 overflow-y-auto">
                {formatEditingCols.map((col, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 shadow-2xs">
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-mono flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                      {col}
                      {idx === 0 && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-bold">Primary ID / IMEI</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFormatCol(col)}
                      className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                      title="Remove column"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Add New Column */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">+ Add Column Header</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Warranty End Date, SIM Operator, ICCID, Calibration Code..."
                  value={formatNewCol}
                  onChange={(e) => setFormatNewCol(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFormatCol(); } }}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:bg-white focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={handleAddFormatCol}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Quick Suggestion Chips */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Quick Suggestions:</span>
              <div className="flex flex-wrap gap-1.5">
                {['SIM Number', 'Vendor Name', 'Purchase Price', 'Warranty Months', 'Rod Length (mm)', 'Calibration Code', 'Protocol', 'ICCID', 'Invoice No'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      if (!formatEditingCols.includes(preset)) {
                        setFormatEditingCols([...formatEditingCols, preset]);
                      }
                    }}
                    disabled={formatEditingCols.includes(preset)}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40 disabled:hover:bg-slate-100 disabled:hover:text-slate-600 text-slate-600 text-[10px] font-semibold rounded-md border border-slate-200 transition-colors"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowFormatModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveFormat}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> {submitting ? 'Saving...' : 'Save Excel Format'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add New Device Type */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" /> Add New Device Type & Excel Template
            </h3>

            <form onSubmit={handleCreateType} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Device Model / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Volty 4G OBD Tracker"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:bg-white focus:border-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-medium"
                >
                  <option value="GPS Tracker">GPS Tracker</option>
                  <option value="Fuel Sensor">Fuel Sensor</option>
                  <option value="OBD Device">OBD Device</option>
                  <option value="Accessory">Accessory</option>
                </select>
              </div>

              {/* Excel Format Builder */}
              <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel Sheet Upload Columns ({templateCols.length})
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {templateCols.map((c, i) => (
                    <span key={i} className="px-2 py-1 bg-white border border-slate-200 text-slate-800 text-[11px] font-semibold rounded-lg flex items-center gap-1 shadow-2xs">
                      {c}
                      <button type="button" onClick={() => handleRemoveTemplateCol(c)} className="text-slate-400 hover:text-red-600">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Add custom column..."
                    value={newColInput}
                    onChange={(e) => setNewColInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTemplateCol(); } }}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddTemplateCol}
                    className="px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg"
                  >
                    + Add
                  </button>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 text-xs rounded-xl font-medium">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs">
                  {submitting ? 'Saving...' : 'Create Device Type & Format'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Device Pricing / Rate Master Modal */}
      <DevicePricingModal
        isOpen={showPricingModal}
        onClose={() => setShowPricingModal(false)}
      />

    </div>
  );
}
