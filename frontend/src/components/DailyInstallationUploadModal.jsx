import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  AlertTriangle,
  Download,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Layers,
  ArrowRight,
  Sliders,
  Check,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { previewDailyInstallationExcel, uploadDailyInstallationExcel } from '../services/api';
import { downloadDailyInstallationTemplate, downloadFailedInstallationsExcel } from '../utils/excelExport';

export default function DailyInstallationUploadModal({ isOpen, onClose, onUploadSuccess }) {
  if (!isOpen) return null;

  const [step, setStep] = useState(1); // 1: Select & Preview, 2: Uploading, 3: Results
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Defaults
  const [defaultCategory, setDefaultCategory] = useState('VLTD');
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [defaultTechnician, setDefaultTechnician] = useState('');

  // Preview data
  const [previewData, setPreviewData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [showMappingDrawer, setShowMappingDrawer] = useState(false);
  const [previewFilter, setPreviewFilter] = useState('ALL'); // ALL, VALID, WARNING, ERROR

  // Upload Result
  const [uploadResult, setUploadResult] = useState(null);
  const [resultFilter, setResultFilter] = useState('FAILED_FIRST'); // FAILED_FIRST, FAILED, SUCCESS, ALL

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setError(null);
      handleParseFile(selected);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      setFile(selected);
      setError(null);
      handleParseFile(selected);
    }
  };

  const handleParseFile = async (selectedFile) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await previewDailyInstallationExcel(formData);
      if (res.success) {
        setPreviewData(res);
        setColumnMapping(res.autoMapping || {});
        // If there are errors or missing columns, open mapping drawer
        if (!res.autoMapping?.imei || !res.autoMapping?.vehicle_number) {
          setShowMappingDrawer(true);
        }
      } else {
        setError(res.error || 'Failed to parse Excel file');
      }
    } catch (err) {
      setError(err.message || 'Error reading Excel file');
    } finally {
      setLoading(false);
    }
  };

  // Dynamically recalculate preview rows if user changes column mapping
  const computedRows = useMemo(() => {
    if (!previewData || !previewData.previewRows) return [];
    
    return previewData.previewRows.map(row => {
      const raw = row.raw || {};
      const imeiKey = columnMapping.imei || Object.keys(raw)[0];
      const vehicleKey = columnMapping.vehicle_number;
      const custKey = columnMapping.customer_name;
      const phoneKey = columnMapping.customer_phone;
      const techKey = columnMapping.installed_by;
      const dateKey = columnMapping.installation_date;

      const imeiVal = String(raw[imeiKey] || '').trim();
      const vehicleVal = String(vehicleKey && raw[vehicleKey] ? raw[vehicleKey] : '').trim().toUpperCase();
      const custVal = String(custKey && raw[custKey] ? raw[custKey] : '').trim();
      const phoneVal = String(phoneKey && raw[phoneKey] ? raw[phoneKey] : '').trim();
      const techVal = String(techKey && raw[techKey] ? raw[techKey] : (defaultTechnician || '')).trim();
      const dateVal = String(dateKey && raw[dateKey] ? raw[dateKey] : row.detected_date || '').trim();

      const issues = [];
      if (!imeiVal) issues.push('Missing IMEI');
      if (!vehicleVal) issues.push('Missing Vehicle No');

      let status = 'VALID';
      if (!imeiVal || !vehicleVal) {
        status = 'ERROR';
      } else if (row.status === 'WARNING' || !phoneVal) {
        status = 'WARNING';
        if (!phoneVal) issues.push('No Phone (will use default)');
      }

      return {
        ...row,
        detected_imei: imeiVal,
        detected_vehicle: vehicleVal,
        detected_customer_name: custVal,
        detected_phone: phoneVal,
        detected_tech: techVal || 'Technician',
        detected_date: dateVal,
        status,
        issues: issues.length > 0 ? issues : (row.issues || [])
      };
    });
  }, [previewData, columnMapping, defaultTechnician]);

  const previewCounts = useMemo(() => {
    const total = computedRows.length;
    const valid = computedRows.filter(r => r.status === 'VALID').length;
    const warning = computedRows.filter(r => r.status === 'WARNING').length;
    const error = computedRows.filter(r => r.status === 'ERROR').length;
    return { total, valid, warning, error, ready: valid + warning };
  }, [computedRows]);

  const filteredPreviewRows = useMemo(() => {
    if (previewFilter === 'VALID') return computedRows.filter(r => r.status === 'VALID');
    if (previewFilter === 'WARNING') return computedRows.filter(r => r.status === 'WARNING');
    if (previewFilter === 'ERROR') return computedRows.filter(r => r.status === 'ERROR');
    return computedRows;
  }, [computedRows, previewFilter]);

  // Handle final upload submission
  const handleConfirmUpload = async () => {
    if (!file) return;
    setLoading(true);
    setStep(2);
    setError(null);

    try {
      const cat = defaultCategory === 'CUSTOM' ? (customCategoryInput.trim() || 'CUSTOM') : defaultCategory;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mapping', JSON.stringify(columnMapping));
      formData.append('default_category', cat);
      if (defaultTechnician.trim()) {
        formData.append('default_technician', defaultTechnician.trim());
      }

      const res = await uploadDailyInstallationExcel(formData);
      if (res.success) {
        setUploadResult(res);
        setStep(3);
        if (onUploadSuccess) onUploadSuccess();
      } else {
        setError(res.error || 'Upload failed');
        setStep(1);
      }
    } catch (err) {
      setError(err.message || 'Processing failed');
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreviewData(null);
    setColumnMapping({});
    setUploadResult(null);
    setError(null);
    setStep(1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in-50 zoom-in-95">
        
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Daily Installation Report Upload
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                  Excel / CSV
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Bulk upload daily deployments, auto-update inventory status, and get instant failure analytics
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div>
                <strong className="font-bold">Error: </strong>
                {error}
              </div>
            </div>
          )}

          {/* STEP 1: SELECT & PREVIEW */}
          {step === 1 && (
            <div className="space-y-5">
              
              {/* Top Configuration & Sample Download */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-bold text-slate-700">Project Category:</span>
                  {['VLTD', 'TG MINING', 'AP MINING', 'GENERAL', 'CUSTOM'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setDefaultCategory(cat)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        defaultCategory === cat
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  {defaultCategory === 'CUSTOM' && (
                    <input
                      type="text"
                      placeholder="Enter Category..."
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value)}
                      className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg outline-hidden focus:border-emerald-500 w-32"
                    />
                  )}
                </div>

                <button
                  onClick={downloadDailyInstallationTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs shrink-0"
                  title="Download clean sample template with all standard columns"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Download Sample Excel</span>
                </button>
              </div>

              {/* Drag and Drop Zone if no file or replace file */}
              {!previewData ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50/50 hover:bg-emerald-50/30 rounded-3xl p-8 sm:p-12 text-center transition-all cursor-pointer group flex flex-col items-center justify-center relative"
                >
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="p-4 bg-emerald-100 text-emerald-700 rounded-2xl mb-3 group-hover:scale-110 transition-transform">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-800">
                    Click to select your Daily Report Excel sheet or drag & drop
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    Supports <strong>.xlsx, .xls, .csv</strong> files with flexible columns (IMEI, Vehicle No, Customer, Technician, etc.)
                  </p>
                  <div className="mt-4 px-3 py-1 bg-white border border-slate-200 rounded-full text-[11px] font-medium text-slate-600 flex items-center gap-1.5 shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Smart Column Auto-Detection enabled</span>
                  </div>
                </div>
              ) : (
                /* Preview Section */
                <div className="space-y-4">
                  {/* File Banner & Action Toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-emerald-50/80 border border-emerald-200 rounded-2xl">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-emerald-600 text-white rounded-xl">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                          <span>{file?.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            ({(file?.size ? (file.size / 1024).toFixed(1) : 0)} KB)
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-700 font-medium">
                          Found {previewCounts.total} total rows in uploaded sheet
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowMappingDrawer(!showMappingDrawer)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer ${
                          showMappingDrawer
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Adjust Columns</span>
                        {showMappingDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={handleReset}
                        className="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Change File</span>
                      </button>
                    </div>
                  </div>

                  {/* Optional Column Mapping Accordion */}
                  {showMappingDrawer && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-in fade-in-50">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-indigo-600" /> Column Mapping Review
                        </h4>
                        <span className="text-[11px] text-slate-500">
                          Verify or change matched columns from your Excel header
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        {/* IMEI */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            IMEI / Device ID <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={columnMapping.imei || ''}
                            onChange={(e) => setColumnMapping({ ...columnMapping, imei: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">-- Select IMEI Column --</option>
                            {previewData.headers?.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>

                        {/* Vehicle Number */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Vehicle Number <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={columnMapping.vehicle_number || ''}
                            onChange={(e) => setColumnMapping({ ...columnMapping, vehicle_number: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">-- Select Vehicle Column --</option>
                            {previewData.headers?.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>

                        {/* Customer Name */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Customer / Client Name</label>
                          <select
                            value={columnMapping.customer_name || ''}
                            onChange={(e) => setColumnMapping({ ...columnMapping, customer_name: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">-- Optional / None --</option>
                            {previewData.headers?.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>

                        {/* Customer Phone */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Phone Number</label>
                          <select
                            value={columnMapping.customer_phone || ''}
                            onChange={(e) => setColumnMapping({ ...columnMapping, customer_phone: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">-- Optional / None --</option>
                            {previewData.headers?.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>

                        {/* Technician */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Technician / Installer</label>
                          <select
                            value={columnMapping.installed_by || ''}
                            onChange={(e) => setColumnMapping({ ...columnMapping, installed_by: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">-- Optional / None --</option>
                            {previewData.headers?.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>

                        {/* Installation Date */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Date</label>
                          <select
                            value={columnMapping.installation_date || ''}
                            onChange={(e) => setColumnMapping({ ...columnMapping, installation_date: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">-- Optional (Today) --</option>
                            {previewData.headers?.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>

                        {/* Location */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Location / RTO</label>
                          <select
                            value={columnMapping.installation_location || ''}
                            onChange={(e) => setColumnMapping({ ...columnMapping, installation_location: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">-- Optional / None --</option>
                            {previewData.headers?.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>

                        {/* Price / Amount */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Sale Price / Amount</label>
                          <select
                            value={columnMapping.sale_price || ''}
                            onChange={(e) => setColumnMapping({ ...columnMapping, sale_price: e.target.value })}
                            className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">-- Optional / None --</option>
                            {previewData.headers?.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Summary Counters Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('ALL')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        previewFilter === 'ALL'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase opacity-75">Total Rows</div>
                      <div className="text-xl font-black font-mono mt-0.5">{previewCounts.total}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewFilter('VALID')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        previewFilter === 'VALID'
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                          : 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100/70'
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase opacity-75">Ready to Install</div>
                      <div className="text-xl font-black font-mono mt-0.5">{previewCounts.valid}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewFilter('WARNING')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        previewFilter === 'WARNING'
                          ? 'bg-amber-700 text-white border-amber-700 shadow-xs'
                          : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100/70'
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase opacity-75">Warnings</div>
                      <div className="text-xl font-black font-mono mt-0.5">{previewCounts.warning}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewFilter('ERROR')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        previewFilter === 'ERROR'
                          ? 'bg-red-700 text-white border-red-700 shadow-xs'
                          : 'bg-red-50 text-red-900 border-red-200 hover:bg-red-100/70'
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase opacity-75">Issues / Missing</div>
                      <div className="text-xl font-black font-mono mt-0.5">{previewCounts.error}</div>
                    </button>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 z-10">
                          <tr>
                            <th className="py-2.5 px-3 w-14 text-center">Row #</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 font-mono">IMEI Number</th>
                            <th className="py-2.5 px-3">Vehicle Number</th>
                            <th className="py-2.5 px-3">Customer</th>
                            <th className="py-2.5 px-3">Technician</th>
                            <th className="py-2.5 px-3">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredPreviewRows.length === 0 ? (
                            <tr>
                              <td colSpan="7" className="py-8 text-center text-slate-400">
                                No records matching this filter.
                              </td>
                            </tr>
                          ) : (
                            filteredPreviewRows.map((row, idx) => (
                              <tr
                                key={idx}
                                className={`hover:bg-slate-50/80 transition-colors ${
                                  row.status === 'ERROR' ? 'bg-red-50/40' : row.status === 'WARNING' ? 'bg-amber-50/30' : ''
                                }`}
                              >
                                <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                                  {row.row_number}
                                </td>
                                <td className="py-2 px-3">
                                  {row.status === 'VALID' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ready
                                    </span>
                                  )}
                                  {row.status === 'WARNING' && (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800"
                                      title={row.issues?.join(', ')}
                                    >
                                      <AlertTriangle className="w-3 h-3 text-amber-600" /> Warning
                                    </span>
                                  )}
                                  {row.status === 'ERROR' && (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800"
                                      title={row.issues?.join(', ')}
                                    >
                                      <AlertCircle className="w-3 h-3 text-red-600" /> {row.issues?.[0] || 'Error'}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-slate-800">
                                  {row.detected_imei || <span className="text-red-500 italic">Missing</span>}
                                </td>
                                <td className="py-2 px-3 font-bold text-slate-900 uppercase">
                                  {row.detected_vehicle || <span className="text-red-500 italic">Missing</span>}
                                </td>
                                <td className="py-2 px-3 text-slate-600">
                                  {row.detected_customer_name || 'Customer'}
                                </td>
                                <td className="py-2 px-3 text-slate-600">
                                  {row.detected_tech || 'Technician'}
                                </td>
                                <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                                  {row.detected_date}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PROCESSING / UPLOADING */}
          {step === 2 && (
            <div className="py-16 text-center space-y-4">
              <div className="inline-flex p-4 bg-emerald-100 text-emerald-700 rounded-full animate-spin">
                <RefreshCw className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Processing Daily Installation Report...
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Validating IMEIs, linking vehicles, creating warranty reminders, and auto-syncing to cloud & Google Sheets...
              </p>
            </div>
          )}

          {/* STEP 3: DETAILED RESULTS BREAKDOWN */}
          {step === 3 && uploadResult && (
            <div className="space-y-5 animate-in fade-in-50">
              {/* Success / Failure KPI Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Total */}
                <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-900 shadow-sm">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Processed</div>
                  <div className="text-3xl font-black font-mono mt-1">{uploadResult.total_count || 0}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Records in daily sheet</div>
                </div>

                {/* Success Count */}
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Successfully Uploaded</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-3xl font-black font-mono text-emerald-700 mt-1">
                    {uploadResult.success_count || 0}
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-0.5 font-medium">Installed & saved in inventory</div>
                </div>

                {/* Failed / Issues Count */}
                <div className={`p-4 rounded-2xl border shadow-xs ${
                  uploadResult.failed_count > 0
                    ? 'bg-red-50 border-red-200 text-red-950'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold uppercase tracking-wider ${uploadResult.failed_count > 0 ? 'text-red-800' : 'text-slate-600'}`}>
                      Issues / Failed
                    </span>
                    <AlertCircle className={`w-4 h-4 ${uploadResult.failed_count > 0 ? 'text-red-600' : 'text-slate-400'}`} />
                  </div>
                  <div className={`text-3xl font-black font-mono mt-1 ${uploadResult.failed_count > 0 ? 'text-red-700' : 'text-slate-700'}`}>
                    {uploadResult.failed_count || 0}
                  </div>
                  <div className="text-[11px] mt-0.5 opacity-80">
                    {uploadResult.failed_count > 0 ? 'Click below to inspect issues' : 'Zero errors encountered!'}
                  </div>
                </div>
              </div>

              {/* Action Toolbar & Download Failed Excel */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setResultFilter(uploadResult.failed_count > 0 ? 'FAILED' : 'SUCCESS')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      resultFilter === 'FAILED'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Failed / Issues ({uploadResult.failed_count || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setResultFilter('SUCCESS')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      resultFilter === 'SUCCESS'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Successful ({uploadResult.success_count || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setResultFilter('ALL')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      resultFilter === 'ALL'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    All Records ({uploadResult.total_count || 0})
                  </button>
                </div>

                {uploadResult.failed_count > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadFailedInstallationsExcel(uploadResult.failed)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                    title="Export only the failed records to fix and re-upload"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>📥 Download Failed Records (.xlsx)</span>
                  </button>
                )}
              </div>

              {/* Failed / Success Results Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-14 text-center">Row #</th>
                        <th className="py-2.5 px-3">Status / Result</th>
                        <th className="py-2.5 px-3 font-mono">IMEI Number</th>
                        <th className="py-2.5 px-3">Vehicle Number</th>
                        <th className="py-2.5 px-3">Customer / Phone</th>
                        <th className="py-2.5 px-3">Issue Reason / Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* Show Failed Rows */}
                      {(resultFilter === 'FAILED' || resultFilter === 'FAILED_FIRST' || resultFilter === 'ALL') &&
                        uploadResult.failed?.map((item, idx) => (
                          <tr key={`fail-${idx}`} className="bg-red-50/50 hover:bg-red-50 transition-colors">
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                              {item.row_number || idx + 2}
                            </td>
                            <td className="py-2 px-3">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                                <AlertCircle className="w-3 h-3 text-red-600" /> Failed
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-900">
                              {item.imei || <span className="text-red-500 italic">Missing</span>}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-800 uppercase">
                              {item.vehicle_number || <span className="text-red-500 italic">Missing</span>}
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {item.customer_name || '—'} {item.phone ? `(${item.phone})` : ''}
                            </td>
                            <td className="py-2 px-3">
                              <span className="text-red-700 font-semibold text-xs">
                                {item.reason || 'Validation error'}
                              </span>
                            </td>
                          </tr>
                        ))}

                      {/* Show Successful Rows */}
                      {(resultFilter === 'SUCCESS' || resultFilter === 'ALL') &&
                        uploadResult.successful?.map((item, idx) => (
                          <tr key={`success-${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                              {item.row_number || idx + 2}
                            </td>
                            <td className="py-2 px-3">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" /> Success
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-900">
                              {item.imei}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900 uppercase">
                              {item.vehicle_number}
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {item.customer_name} {item.phone ? `(${item.phone})` : ''}
                            </td>
                            <td className="py-2 px-3 text-emerald-700 font-medium">
                              Installed on {item.date} ({item.category || 'VLTD'})
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div>
            {step === 1 && previewData && (
              <span className="text-xs text-slate-500">
                <strong>{previewCounts.ready}</strong> row(s) will be installed and recorded
              </span>
            )}
            {step === 3 && (
              <span className="text-xs text-slate-500">
                Database, Google Sheets & Cloud storage updated automatically
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {step === 1 && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                {previewData && (
                  <button
                    type="button"
                    onClick={handleConfirmUpload}
                    disabled={loading || previewCounts.ready === 0}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <span>Process & Install {previewCounts.ready} Devices</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Upload Another Sheet
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Done & Close
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
