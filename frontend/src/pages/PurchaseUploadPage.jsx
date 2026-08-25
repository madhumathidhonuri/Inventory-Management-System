import React, { useState, useEffect, useMemo } from 'react';
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, Download, ArrowRight, Check, X, RefreshCw, FileText } from 'lucide-react';
import { fetchDeviceTypes, previewPurchaseUpload, confirmPurchaseUpload } from '../services/api';
import { downloadStyledTemplate } from '../utils/excelExport';
import * as xlsx from 'xlsx';

export default function PurchaseUploadPage({ onUploadSuccess }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [isNewType, setIsNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [vendorName, setVendorName] = useState('Vamosys Technologies Ltd');
  const [notes, setNotes] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    fetchDeviceTypes().then(res => {
      if (res.success && res.data) {
        setDeviceTypes(res.data);
        if (res.data.length > 0) {
          setSelectedType(res.data[0].id.toString());
        } else {
          setIsNewType(true);
        }
      }
    });
  }, []);

  const [columnMapping, setColumnMapping] = useState({ imei: '', sim: '', price: '' });

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handlePreview = async () => {
    if (!file) {
      setError('Please select an Excel or CSV file first');
      return;
    }
    if (isNewType && !newTypeName.trim()) {
      setError('Please enter a device type name');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await previewPurchaseUpload(formData);
      if (res.success) {
        setPreviewData(res);
        setColumnMapping({
          imei: res.autoMapping.imei || '',
          sim: res.autoMapping.sim || '',
          price: res.autoMapping.price || ''
        });
        setStep(2);
      } else {
        setError(res.error || 'Failed to parse file');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const [updateExisting, setUpdateExisting] = useState(true);

  // Dynamically compute preview rows based on current column mapping
  const computedPreviewRows = useMemo(() => {
    if (!previewData || !previewData.previewRows) return [];
    return previewData.previewRows.map(row => {
      const raw = row.raw || {};
      const imeiVal = columnMapping.imei ? String(raw[columnMapping.imei] || '').trim() : '';
      const simVal = columnMapping.sim ? String(raw[columnMapping.sim] || '').trim() : '';
      const priceVal = columnMapping.price ? raw[columnMapping.price] : null;

      const errors = [];
      if (!imeiVal) errors.push('Missing IMEI');

      return {
        ...row,
        detected_imei: imeiVal,
        detected_sim: simVal,
        detected_price: priceVal,
        valid: errors.length === 0,
        errors
      };
    });
  }, [previewData, columnMapping]);

  const newRowCount = useMemo(() => {
    return computedPreviewRows.filter(r => r.valid && !r.is_existing).length;
  }, [computedPreviewRows]);

  const existingRowCount = useMemo(() => {
    return computedPreviewRows.filter(r => r.valid && r.is_existing).length;
  }, [computedPreviewRows]);

  const validRowCount = useMemo(() => {
    return computedPreviewRows.filter(r => r.valid).length;
  }, [computedPreviewRows]);

  const handleConfirmImport = async () => {
    if (!previewData) return;
    setLoading(true);
    setError(null);

    try {
      const validItems = computedPreviewRows
        .filter(r => r.valid)
        .map(r => {
          const extraAttrs = {};
          if (r.raw) {
            Object.keys(r.raw).forEach(colKey => {
              if (
                colKey !== columnMapping.imei &&
                colKey !== columnMapping.sim &&
                colKey !== columnMapping.price
              ) {
                extraAttrs[colKey] = r.raw[colKey];
              }
            });
          }
          return {
            imei: r.detected_imei,
            sim: r.detected_sim,
            price: r.detected_price,
            additional_attributes: extraAttrs
          };
        });

      const payload = {
        uploaded_by: 'Operations Admin',
        vendor_name: vendorName,
        source_file: previewData.filename,
        notes,
        headers: previewData.headers, // Preserves exact columns & sequence from uploaded Excel sheet
        update_existing: updateExisting,
        items: validItems
      };

      if (isNewType) {
        payload.new_device_type_name = newTypeName.trim();
      } else {
        payload.device_type_id = parseInt(selectedType);
      }

      const res = await confirmPurchaseUpload(payload);

      if (res.success) {
        setImportResult(res.data);
        setStep(3);
        if (onUploadSuccess) onUploadSuccess();
      } else {
        setError(res.error || 'Import failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentDeviceType = useMemo(() => {
    return deviceTypes.find(d => d.id.toString() === selectedType) || null;
  }, [deviceTypes, selectedType]);

  const downloadSampleTemplate = async () => {
    const typeName = currentDeviceType ? currentDeviceType.name : (newTypeName || 'Device');
    const cols = (currentDeviceType && Array.isArray(currentDeviceType.template_columns) && currentDeviceType.template_columns.length > 0)
      ? currentDeviceType.template_columns
      : ['IMEI Number', 'SIM Number', 'Price', 'Vendor Name', 'Warranty Months', 'Invoice No'];

    await downloadStyledTemplate(
      `${typeName.replace(/\s+/g, '_')}_Stock_Template.xlsx`,
      typeName,
      cols,
      '1E3A8A' // Royal Navy Blue Header
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Page Header */}
      <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-purple-600" /> Purchase Bulk Stock Upload
          </h2>
          <p className="text-xs text-slate-500">Upload vendor Excel sheet to bulk create IMEI device records into Unassigned Stock with dynamic schema validation</p>
        </div>

        <button
          onClick={downloadSampleTemplate}
          className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
        >
          <Download className="w-4 h-4 text-emerald-600" /> Download {currentDeviceType?.name || 'Device'} Template
        </button>
      </div>

      {/* Progress Steps Bar */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
        {[
          { num: 1, title: 'Upload & Select Device' },
          { num: 2, title: 'Preview & Confirm' },
          { num: 3, title: 'Complete' }
        ].map((s) => (
          <div
            key={s.num}
            className={`p-2.5 rounded-xl border transition-all ${
              step === s.num
                ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold shadow-2xs'
                : step > s.num
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-white text-slate-400 border-slate-200'
            }`}
          >
            {s.num}. {s.title}
          </div>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: File Selection & Device Type Selection/Entry */}
      {step === 1 && (
        <div className="glass-panel p-6 rounded-2xl space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">Device Type</label>
                <button
                  type="button"
                  onClick={() => setIsNewType(!isNewType)}
                  className="text-[11px] text-blue-600 hover:underline font-semibold"
                >
                  {isNewType ? '← Pick Existing' : '+ Type New Name'}
                </button>
              </div>

              {isNewType ? (
                <input
                  type="text"
                  placeholder="Type Device Name (e.g. Vamosys, Tracknow)..."
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="w-full bg-slate-50 border border-blue-400 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:bg-white"
                />
              ) : (
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-blue-500"
                >
                  {deviceTypes.map(dt => (
                    <option key={dt.id} value={dt.id}>{dt.name} ({dt.category})</option>
                  ))}
                </select>
              )}

              {/* Show Configured Template Columns Badge */}
              {currentDeviceType && !isNewType && (
                <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
                    Configured Excel Format ({currentDeviceType.template_columns?.length || 0} Columns):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(currentDeviceType.template_columns || []).map((col, idx) => (
                      <span key={idx} className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-700 font-medium">
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">List Name / Batch Name</label>
              <input
                type="text"
                placeholder="Enter List Name (e.g. Tracknow Nov, Vamosys July)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-blue-500"
              />
            </div>

          </div>

          {/* File Drag Drop Zone */}
          <div className="border-2 border-dashed border-slate-300 hover:border-purple-500 rounded-2xl p-8 text-center bg-slate-50/50 transition-colors">
            <Upload className="w-10 h-10 mx-auto text-purple-600 mb-2" />
            <p className="text-sm font-bold text-slate-800">Select Vendor Stock File (.xlsx, .xls, .csv)</p>
            <p className="text-xs text-slate-500 mt-1">Smart Auto-Mapper will automatically detect IMEI, SIM, and columns</p>

            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="mt-4 text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer"
            />
          </div>

          <button
            onClick={handlePreview}
            disabled={loading || !file}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Preview Stock File & Validate
          </button>
        </div>
      )}

      {/* Step 2: Validation & Smart Column Mapper */}
      {step === 2 && previewData && (
        <div className="glass-panel p-6 rounded-2xl space-y-5">
          
          {/* Validation Header Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 block">Total Rows</span>
              <span className="text-lg font-bold text-slate-900 font-mono">{previewData.totalRows}</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-xs text-emerald-700 block font-semibold">New Stock</span>
              <span className="text-lg font-bold text-emerald-700 font-mono">{newRowCount}</span>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
              <span className="text-xs text-blue-700 block font-semibold">Existing to Update</span>
              <span className="text-lg font-bold text-blue-700 font-mono">{existingRowCount}</span>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-200">
              <span className="text-xs text-red-700 block font-semibold">Missing IMEI</span>
              <span className="text-lg font-bold text-red-700 font-mono">{previewData.totalRows - validRowCount}</span>
            </div>
          </div>

          {/* Upsert Option */}
          <label className="flex items-center gap-2 p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs font-semibold text-blue-900 cursor-pointer">
            <input
              type="checkbox"
              checked={updateExisting}
              onChange={(e) => setUpdateExisting(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded cursor-pointer"
            />
            <span>Update existing inventory devices with new spreadsheet values (SIM, Price, Location, Custom fields)</span>
          </label>

          {/* Interactive Smart Column Auto-Mapper Card */}
          <div className="p-4 bg-purple-50/40 rounded-2xl border border-purple-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                <span className="text-base">📑</span> Smart Excel Column Auto-Mapper
              </h3>
              <span className="text-[11px] text-purple-700 font-medium">Auto-detected & mapped for this vendor</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {/* IMEI Mapping Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  1. Device IMEI Column *
                </label>
                <select
                  value={columnMapping.imei}
                  onChange={(e) => setColumnMapping({ ...columnMapping, imei: e.target.value })}
                  className="w-full bg-white border border-purple-300 rounded-xl p-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">-- Select IMEI Column --</option>
                  {(previewData.headers || []).map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* SIM Mapping Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  2. SIM Number Column (Optional)
                </label>
                <select
                  value={columnMapping.sim}
                  onChange={(e) => setColumnMapping({ ...columnMapping, sim: e.target.value })}
                  className="w-full bg-white border border-purple-300 rounded-xl p-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">-- None / Auto --</option>
                  {(previewData.headers || []).map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Price Mapping Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  3. Purchase Price Column (Optional)
                </label>
                <select
                  value={columnMapping.price}
                  onChange={(e) => setColumnMapping({ ...columnMapping, price: e.target.value })}
                  className="w-full bg-white border border-purple-300 rounded-xl p-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">-- None / Auto --</option>
                  {(previewData.headers || []).map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>

            {previewData.headers && previewData.headers.length > 0 && (
              <div className="pt-2 border-t border-purple-100 text-xs">
                <span className="text-slate-600 block font-semibold mb-1">Preserved Sheet Columns ({previewData.headers.length}):</span>
                <div className="flex flex-wrap gap-1.5">
                  {previewData.headers.map((h, i) => (
                    <span key={i} className="px-2.5 py-0.5 bg-white border border-purple-200/80 text-slate-700 rounded-lg font-mono text-[10px] shadow-2xs">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Validation Data Table */}
          <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-700 sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="p-2.5 font-bold">Row</th>
                  <th className="p-2.5 font-bold font-mono">Mapped IMEI</th>
                  <th className="p-2.5 font-bold font-mono">Mapped SIM</th>
                  <th className="p-2.5 font-bold">Action</th>
                  <th className="p-2.5 font-bold">Status Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {computedPreviewRows.map((row) => (
                  <tr key={row.row_number} className={row.valid ? 'bg-white' : 'bg-red-50/70'}>
                    <td className="p-2.5 text-slate-400 font-mono">#{row.row_number}</td>
                    <td className="p-2.5 font-mono text-purple-700 font-bold">{row.detected_imei || 'EMPTY'}</td>
                    <td className="p-2.5 font-mono text-slate-600">{row.detected_sim || '-'}</td>
                    <td className="p-2.5">
                      {!row.valid ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-50 text-red-700 font-semibold border border-red-200">Invalid</span>
                      ) : row.is_existing ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 font-semibold border border-blue-200">Update Stock</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">New Item</span>
                      )}
                    </td>
                    <td className="p-2.5 text-slate-600 text-[11px]">
                      {row.errors.length > 0
                        ? row.errors.join(', ')
                        : row.is_existing
                        ? 'IMEI exists — will update stock & attributes'
                        : 'New device — will create record'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
            >
              Back
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={loading || validRowCount === 0 || !columnMapping.imei}
              className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Confirm Import ({validRowCount} Devices: {newRowCount} New, {existingRowCount} Updates)
            </button>
          </div>

        </div>
      )}

      {/* Step 3: Import Complete Success Screen */}
      {step === 3 && importResult && (
        <div className="glass-panel p-8 rounded-2xl border border-emerald-300 text-center space-y-4 bg-emerald-50/30">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto border border-emerald-300 shadow-xs">
            <Check className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-emerald-950">Inventory Upload Successfully Completed!</h3>
            <p className="text-xs text-emerald-700 mt-1">
              Processed {importResult.totalCount || 0} device records ({importResult.createdCount || 0} new inserted, {importResult.updatedCount || 0} existing updated).
            </p>
          </div>

          <div className="pt-3 flex justify-center gap-3">
            <button
              onClick={() => {
                setStep(1);
                setFile(null);
                setPreviewData(null);
                setImportResult(null);
              }}
              className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-colors shadow-xs"
            >
              Upload Another Stock File
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
