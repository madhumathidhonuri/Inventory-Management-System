import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, Download, ArrowRight, Check, X, RefreshCw, FileText } from 'lucide-react';
import { fetchDeviceTypes, previewPurchaseUpload, confirmPurchaseUpload } from '../services/api';
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
      if (res.success && res.data.length > 0) {
        setDeviceTypes(res.data);
        setSelectedType(res.data[0].id.toString());
      }
    });
  }, []);

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

  const handleConfirmImport = async () => {
    if (!previewData) return;
    setLoading(true);
    setError(null);

    try {
      const validItems = previewData.previewRows
        .filter(r => r.valid)
        .map(r => {
          const extraAttrs = {};
          if (r.raw) {
            Object.keys(r.raw).forEach(colKey => {
              if (
                colKey !== previewData.autoMapping.imei &&
                colKey !== previewData.autoMapping.sim &&
                colKey !== previewData.autoMapping.price
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
        uploaded_by: 'Warehouse Admin',
        vendor_name: vendorName,
        source_file: previewData.filename,
        notes,
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

  const downloadSampleTemplate = () => {
    const templateData = [
      { 'IMEI Number': '864920050019201', 'SIM Number': '89914000982300099', 'Price': '3500', 'Vendor': 'Vamosys', 'Sensor Length': '600mm', 'Calibration Code': 'CAL-991' },
      { 'IMEI Number': '864920050019202', 'SIM Number': '89914000982300098', 'Price': '3500', 'Vendor': 'Vamosys', 'Sensor Length': '600mm', 'Calibration Code': 'CAL-992' },
      { 'IMEI Number': '864920050019203', 'SIM Number': '89914000982300097', 'Price': '3500', 'Vendor': 'Vamosys', 'Sensor Length': '750mm', 'Calibration Code': 'CAL-993' }
    ];
    const ws = xlsx.utils.json_to_sheet(templateData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Sample_Stock');
    xlsx.writeFile(wb, 'FuelTracks_Stock_Import_Template.xlsx');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Page Header */}
      <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" /> Purchase Bulk Stock Upload
          </h2>
          <p className="text-xs text-slate-500">Upload vendor Excel sheet to bulk create IMEI device records into Warehouse stock with full column preservation</p>
        </div>

        <button
          onClick={downloadSampleTemplate}
          className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-emerald-600" /> Sample Excel Template
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
          <div className="border-2 border-dashed border-slate-300 hover:border-blue-500/80 rounded-2xl p-8 text-center bg-slate-50/50 transition-colors">
            <Upload className="w-10 h-10 mx-auto text-blue-600 mb-2" />
            <p className="text-sm font-bold text-slate-800">Select Vendor Stock File (.xlsx, .xls, .csv)</p>
            <p className="text-xs text-slate-500 mt-1">Automatically preserves all sheet columns into inventory</p>

            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="mt-4 text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
            />
          </div>

          <button
            onClick={handlePreview}
            disabled={loading || !file}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Preview Stock File & Validate
          </button>
        </div>
      )}

      {/* Step 2: Validation & Preview */}
      {step === 2 && previewData && (
        <div className="glass-panel p-6 rounded-2xl space-y-5">
          
          {/* Validation Header Summary */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 block">Total Rows</span>
              <span className="text-lg font-bold text-slate-900 font-mono">{previewData.totalRows}</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-xs text-emerald-700 block font-semibold">Valid Devices</span>
              <span className="text-lg font-bold text-emerald-700 font-mono">{previewData.validRows}</span>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-200">
              <span className="text-xs text-red-700 block font-semibold">Duplicates / Invalid</span>
              <span className="text-lg font-bold text-red-700 font-mono">{previewData.invalidRows}</span>
            </div>
          </div>

          {/* Excel File & Detected Details */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <h3 className="text-xs font-bold text-slate-800">Excel File Overview</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div><span className="text-slate-500">IMEI Header:</span> <strong className="text-blue-700 font-mono">{previewData.autoMapping.imei}</strong></div>
              <div><span className="text-slate-500">SIM Header:</span> <strong className="text-slate-800 font-mono">{previewData.autoMapping.sim || 'None'}</strong></div>
              <div><span className="text-slate-500">Source File:</span> <strong className="text-slate-800 font-mono truncate">{previewData.filename}</strong></div>
            </div>
            {previewData.headers && previewData.headers.length > 0 && (
              <div className="pt-2.5 border-t border-slate-200 text-xs">
                <span className="text-slate-600 block font-semibold mb-1">Preserved Columns ({previewData.headers.length}):</span>
                <div className="flex flex-wrap gap-1.5">
                  {previewData.headers.map((h, i) => (
                    <span key={i} className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg font-mono text-[11px] shadow-2xs">
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
                  <th className="p-2.5 font-bold font-mono">IMEI Number</th>
                  <th className="p-2.5 font-bold font-mono">SIM Number</th>
                  <th className="p-2.5 font-bold">Status</th>
                  <th className="p-2.5 font-bold">Validation Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewData.previewRows.map((row) => (
                  <tr key={row.row_number} className={row.valid ? 'bg-white' : 'bg-red-50/70'}>
                    <td className="p-2.5 text-slate-400 font-mono">#{row.row_number}</td>
                    <td className="p-2.5 font-mono text-slate-900 font-bold">{row.detected_imei || 'EMPTY'}</td>
                    <td className="p-2.5 font-mono text-slate-500">{row.detected_sim || '-'}</td>
                    <td className="p-2.5">
                      {row.valid ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">Valid</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-50 text-red-700 font-semibold border border-red-200">Failed</span>
                      )}
                    </td>
                    <td className="p-2.5 text-slate-600 text-[11px]">{row.errors.join(', ') || 'Ready for import'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Back
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={loading || previewData.validRows === 0}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Confirm Import ({previewData.validRows} Devices) into Central Warehouse
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
          
          <h3 className="text-xl font-bold text-slate-900">Purchase Batch Successfully Created!</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Added <strong className="text-emerald-700 font-mono">{importResult.totalCount}</strong> device records to Central Warehouse inventory with status <code className="text-blue-700 font-semibold">IN_WAREHOUSE</code> under Batch #{importResult.batchId}.
          </p>

          <div className="pt-4 flex justify-center gap-3">
            <button
              onClick={() => { setStep(1); setFile(null); setPreviewData(null); }}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-semibold rounded-xl shadow-xs"
            >
              Upload Another Batch
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
