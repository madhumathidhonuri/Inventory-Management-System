import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  AlertTriangle,
  Download,
  RefreshCw,
  Sliders,
  Check,
  RotateCcw,
  CreditCard,
  Building2,
  CheckCircle
} from 'lucide-react';
import { previewPaymentExcel, commitPaymentExcel } from '../services/api';
import { downloadPaymentExcelTemplate } from '../utils/excelExport';

export default function BulkPaymentUploadModal({ isOpen, onClose, onUploadSuccess }) {
  if (!isOpen) return null;

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [step, setStep] = useState(1); // 1: Select & Preview, 2: Reconciling, 3: Completed
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Date overrides & defaults
  const [defaultPaymentDate, setDefaultPaymentDate] = useState(todayStr);
  const [overrideSheetDate, setOverrideSheetDate] = useState(false);
  const [defaultReceivedBy, setDefaultReceivedBy] = useState('');
  const [defaultPaymentMode, setDefaultPaymentMode] = useState('');

  // Preview data & stats
  const [previewData, setPreviewData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [showMappingDrawer, setShowMappingDrawer] = useState(false);
  const [previewFilter, setPreviewFilter] = useState('ALL'); // ALL, MATCHED, PARTIAL, DIRECT, NOT_FOUND

  // Commit Result
  const [commitResult, setCommitResult] = useState(null);

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

  const handleParseFile = async (fileToParse) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', fileToParse);
      const res = await previewPaymentExcel(formData);
      if (res.success) {
        setPreviewData(res);
        setColumnMapping(res.detected_columns || {});
      } else {
        setError(res.error || 'Failed to read payment sheet');
      }
    } catch (err) {
      console.error('Error previewing payment excel:', err);
      setError(err.message || 'Error processing Excel file');
    } finally {
      setLoading(false);
    }
  };

  const handleRePreviewWithCustomMapping = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('custom_mapping', JSON.stringify(columnMapping));
      const res = await previewPaymentExcel(formData);
      if (res.success) {
        setPreviewData(res);
      } else {
        setError(res.error || 'Failed to update mapping');
      }
    } catch (err) {
      setError(err.message || 'Failed to update preview');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!allRows || allRows.length === 0) return;
    setLoading(true);
    setError(null);
    setStep(2);
    try {
      const payload = {
        rows: allRows,
        default_payment_date: overrideSheetDate ? defaultPaymentDate : undefined,
        default_received_by: defaultReceivedBy.trim() || undefined,
        default_payment_mode: defaultPaymentMode.trim() || undefined
      };
      const res = await commitPaymentExcel(payload);
      if (res.success) {
        setCommitResult(res);
        setStep(3);
        if (onUploadSuccess) {
          onUploadSuccess(res);
        }
      } else {
        setError(res.error || 'Failed to reconcile payments');
        setStep(1);
      }
    } catch (err) {
      console.error('Error committing payments:', err);
      setError(err.message || 'Error committing payment updates');
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setFile(null);
    setPreviewData(null);
    setError(null);
    setStep(1);
    setCommitResult(null);
    setShowMappingDrawer(false);
    setPreviewFilter('ALL');
  };

  // Safe rows extraction supporting both rows and previewRows
  const allRows = useMemo(() => {
    if (!previewData) return [];
    return Array.isArray(previewData.rows)
      ? previewData.rows
      : Array.isArray(previewData.previewRows)
      ? previewData.previewRows
      : [];
  }, [previewData]);

  // Filter preview rows
  const filteredRows = useMemo(() => {
    if (!allRows || allRows.length === 0) return [];
    if (previewFilter === 'ALL') return allRows;
    if (previewFilter === 'MATCHED') return allRows.filter(r => r && (r.status === 'MATCHED' || r.status === 'ALREADY_PAID'));
    if (previewFilter === 'PARTIAL') return allRows.filter(r => r && r.status === 'PARTIAL');
    if (previewFilter === 'DIRECT') return allRows.filter(r => r && r.status === 'DEALER_DIRECT_ENTRY');
    if (previewFilter === 'NOT_FOUND') return allRows.filter(r => r && r.status === 'NOT_FOUND');
    return allRows;
  }, [allRows, previewFilter]);

  const stats = useMemo(() => {
    if (previewData?.stats) return previewData.stats;
    return {
      total: previewData?.total_rows || allRows.length || 0,
      matched: previewData?.matched_count || 0,
      partial: previewData?.partial_count || 0,
      already_paid: previewData?.already_paid_count || 0,
      dealer_direct_entry: previewData?.dealer_direct_count || 0,
      not_found: previewData?.not_found_count || 0,
      total_received: previewData?.total_amount_received || 0,
      total_pending: previewData?.total_pending_amount || 0
    };
  }, [previewData, allRows]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 border-b border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Bulk Payment Excel Reconciliation
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30">
                  Auto Match & Sync
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Upload your payment register Excel to auto-match vehicle numbers, update paid/partial status, and sync dealer accounts.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadPaymentExcelTemplate()}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
              title="Download clean payment Excel template"
            >
              <Download className="w-3.5 h-3.5" />
              Template
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm flex items-start gap-3 animate-in shake duration-200">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Reconciliation Error</p>
                <p className="text-xs text-rose-300/90 mt-0.5">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 1: Upload & Interactive Preview */}
          {step === 1 && (
            <>
              {/* File Drop Zone (if no file or to re-upload) */}
              {!previewData ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-emerald-500/30 hover:border-emerald-500/60 bg-slate-950/40 hover:bg-emerald-950/10 rounded-2xl p-8 text-center transition-all flex flex-col items-center justify-center cursor-pointer group"
                  onClick={() => document.getElementById('payment-file-input').click()}
                >
                  <input
                    id="payment-file-input"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="p-4 bg-emerald-500/10 group-hover:bg-emerald-500/20 text-emerald-400 rounded-2xl mb-3 transition-all border border-emerald-500/20 group-hover:scale-105">
                    <FileSpreadsheet className="w-10 h-10" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1">
                    Select or Drop Payment Excel Sheet
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mb-4">
                    Matches <code className="text-emerald-300 font-mono">VEHICLE NUM</code>, detects <code className="text-emerald-300 font-mono">AMOUNT RECEIVED</code> & <code className="text-emerald-300 font-mono">PENDING AMT</code>. Automatically handles full/partial payments & direct receipts.
                  </p>
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-emerald-900/30 transition-all">
                    <Upload className="w-4 h-4" />
                    Browse Excel File
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* File & Global Defaults Bar */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white truncate max-w-xs">{file?.name}</span>
                          <span className="text-xs text-slate-400">({(file?.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <p className="text-xs text-emerald-400">
                          Found {previewData.total_rows} payment rows ({previewData.sheet_name})
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowMappingDrawer(!showMappingDrawer)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-all ${
                          showMappingDrawer
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                        }`}
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        {showMappingDrawer ? 'Hide Column Mapping' : 'Column Mapping'}
                      </button>
                      <button
                        onClick={resetAll}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Change File
                      </button>
                    </div>
                  </div>

                  {/* Column Mapping Drawer (Collapsible) */}
                  {showMappingDrawer && (
                    <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                          <Sliders className="w-4 h-4" /> Detected Excel Columns
                        </h4>
                        <button
                          onClick={handleRePreviewWithCustomMapping}
                          disabled={loading}
                          className="px-2.5 py-1 text-xs font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-500/40 rounded-lg flex items-center gap-1 transition-all"
                        >
                          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                          Re-scan Preview
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        {Object.entries(columnMapping).map(([key, colIndex]) => (
                          <div key={key} className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg">
                            <span className="text-slate-400 uppercase text-[10px] font-semibold block mb-1">
                              {key.replace(/_/g, ' ')}
                            </span>
                            <select
                              value={colIndex ?? -1}
                              onChange={(e) =>
                                setColumnMapping((prev) => ({
                                  ...prev,
                                  [key]: parseInt(e.target.value, 10)
                                }))
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:ring-1 focus:ring-emerald-500"
                            >
                              <option value={-1}>-- Not In Sheet --</option>
                              {previewData.headers?.map((h, i) => (
                                <option key={i} value={i}>
                                  Col {i + 1}: {h || `Column ${i + 1}`}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reconciliation KPI Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Total Rows
                      </span>
                      <span className="text-xl font-bold text-white mt-1 block">
                        {stats.total}
                      </span>
                      <span className="text-[10px] text-slate-500">In this upload</span>
                    </div>

                    <div className="bg-emerald-950/30 border border-emerald-500/30 p-3 rounded-xl">
                      <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
                        Fully Paid
                      </span>
                      <span className="text-xl font-bold text-emerald-300 mt-1 block">
                        {stats.matched}
                      </span>
                      <span className="text-[10px] text-emerald-400/80">Matched 100% Paid</span>
                    </div>

                    <div className="bg-amber-950/30 border border-amber-500/30 p-3 rounded-xl">
                      <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
                        Partial Payments
                      </span>
                      <span className="text-xl font-bold text-amber-300 mt-1 block">
                        {stats.partial}
                      </span>
                      <span className="text-[10px] text-amber-400/80">Has pending balance</span>
                    </div>

                    <div className="bg-blue-950/30 border border-blue-500/30 p-3 rounded-xl">
                      <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider block">
                        Direct Receipts
                      </span>
                      <span className="text-xl font-bold text-blue-300 mt-1 block">
                        {stats.dealer_direct_entry}
                      </span>
                      <span className="text-[10px] text-blue-400/80">Dealer / User entries</span>
                    </div>

                    <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                      <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
                        Total Received
                      </span>
                      <span className="text-xl font-bold text-emerald-400 mt-1 block">
                        ₹{stats.total_received?.toLocaleString('en-IN') || 0}
                      </span>
                      <span className="text-[10px] text-slate-400">Cash / Online</span>
                    </div>

                    <div className="bg-rose-950/20 border border-rose-500/30 p-3 rounded-xl">
                      <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider block">
                        Pending Due
                      </span>
                      <span className="text-xl font-bold text-rose-300 mt-1 block">
                        ₹{stats.total_pending?.toLocaleString('en-IN') || 0}
                      </span>
                      <span className="text-[10px] text-rose-400/80">From partial rows</span>
                    </div>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                      <button
                        onClick={() => setPreviewFilter('ALL')}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                          previewFilter === 'ALL'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        All ({stats.total})
                      </button>
                      <button
                        onClick={() => setPreviewFilter('MATCHED')}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                          previewFilter === 'MATCHED'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-emerald-400 hover:text-white'
                        }`}
                      >
                        Matched ({stats.matched + stats.already_paid})
                      </button>
                      <button
                        onClick={() => setPreviewFilter('PARTIAL')}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                          previewFilter === 'PARTIAL'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-amber-400 hover:text-white'
                        }`}
                      >
                        Partial ({stats.partial})
                      </button>
                      <button
                        onClick={() => setPreviewFilter('DIRECT')}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                          previewFilter === 'DIRECT'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-blue-400 hover:text-white'
                        }`}
                      >
                        Direct ({stats.dealer_direct_entry})
                      </button>
                      {stats.not_found > 0 && (
                        <button
                          onClick={() => setPreviewFilter('NOT_FOUND')}
                          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                            previewFilter === 'NOT_FOUND'
                              ? 'bg-rose-600 text-white shadow-sm'
                              : 'text-rose-400 hover:text-white'
                          }`}
                        >
                          Not Found ({stats.not_found})
                        </button>
                      )}
                    </div>

                    <div className="text-xs text-slate-400">
                      Showing <strong className="text-white">{filteredRows.length}</strong> of {allRows.length} rows
                    </div>
                  </div>

                  {/* Interactive Reconciliation Table */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/70 max-h-[360px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-900 sticky top-0 z-10 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[11px]">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Vehicle Number</th>
                          <th className="py-2.5 px-3">Customer</th>
                          <th className="py-2.5 px-3 text-right">Received (₹)</th>
                          <th className="py-2.5 px-3 text-right">Pending (₹)</th>
                          <th className="py-2.5 px-3">Mode & By</th>
                          <th className="py-2.5 px-3">Dealer/Location</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                        {filteredRows.map((row, idx) => {
                          const isMatched = row.status === 'MATCHED';
                          const isPartial = row.status === 'PARTIAL';
                          const isAlreadyPaid = row.status === 'ALREADY_PAID';
                          const isDirect = row.status === 'DEALER_DIRECT_ENTRY';
                          const isNotFound = row.status === 'NOT_FOUND';

                          return (
                            <tr
                              key={idx}
                              className={`transition-colors hover:bg-slate-800/40 ${
                                isNotFound
                                  ? 'bg-rose-950/10'
                                  : isPartial
                                  ? 'bg-amber-950/10'
                                  : isDirect
                                  ? 'bg-blue-950/10'
                                  : ''
                              }`}
                            >
                              <td className="py-2 px-3 text-slate-500 font-sans">{row.row_index}</td>
                              
                              {/* Status Badge */}
                              <td className="py-2 px-3">
                                {isMatched && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-sans font-semibold text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    <Check className="w-3 h-3" /> MATCHED
                                  </span>
                                )}
                                {isPartial && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-sans font-semibold text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    <AlertTriangle className="w-3 h-3" /> PARTIAL
                                  </span>
                                )}
                                {isAlreadyPaid && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-sans font-semibold text-[10px] bg-slate-700/40 text-slate-300 border border-slate-600">
                                    ALREADY PAID
                                  </span>
                                )}
                                {isDirect && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-sans font-semibold text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                    <Building2 className="w-3 h-3" /> DIRECT
                                  </span>
                                )}
                                {isNotFound && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-sans font-semibold text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                    <X className="w-3 h-3" /> NOT FOUND
                                  </span>
                                )}
                              </td>

                              {/* Date */}
                              <td className="py-2 px-3 text-slate-300 font-sans whitespace-nowrap">
                                {row.payment_date || '-'}
                              </td>

                              {/* Vehicle Number & Match details */}
                              <td className="py-2 px-3 font-semibold text-white">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{row.vehicle_no || row.category || '-'}</span>
                                  {row.is_split && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold font-sans bg-teal-500/20 text-teal-300 border border-teal-500/30" title={`Divided from single cell: ₹${row.original_amount} ÷ ${row.split_count}`}>
                                      ÷{row.split_count} Split (₹{row.amount_received})
                                    </span>
                                  )}
                                  {row.match_type && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-sans">
                                      {row.match_type}
                                    </span>
                                  )}
                                </div>
                                {row.matched_device_imei && (
                                  <div className="text-[10px] text-emerald-400/80 font-normal font-sans">
                                    IMEI: {row.matched_device_imei}
                                  </div>
                                )}
                              </td>

                              {/* Customer */}
                              <td className="py-2 px-3 text-slate-300 font-sans">
                                <div className="truncate max-w-[140px] font-medium text-slate-200">
                                  {row.customer_name || '-'}
                                </div>
                                {row.customer_phone && (
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {row.customer_phone}
                                  </div>
                                )}
                              </td>

                              {/* Amount Received */}
                              <td className="py-2 px-3 text-right font-bold text-emerald-400">
                                ₹{row.amount_received?.toLocaleString('en-IN') || 0}
                              </td>

                              {/* Pending Amt */}
                              <td className="py-2 px-3 text-right font-bold">
                                {row.pending_amt > 0 ? (
                                  <span className="text-amber-400">₹{row.pending_amt?.toLocaleString('en-IN')}</span>
                                ) : (
                                  <span className="text-slate-500">₹0</span>
                                )}
                              </td>

                              {/* Mode & Received By */}
                              <td className="py-2 px-3 font-sans text-slate-300">
                                <div className="truncate max-w-[120px]">{row.payment_mode || 'Cash'}</div>
                                {row.received_by && (
                                  <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                    By: {row.received_by}
                                  </div>
                                )}
                              </td>

                              {/* Dealer / Location */}
                              <td className="py-2 px-3 font-sans text-slate-300">
                                <div className="truncate max-w-[130px]">{row.dealer_location || '-'}</div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP 2: Processing Spinner */}
          {step === 2 && (
            <div className="py-16 text-center space-y-4">
              <div className="relative inline-flex items-center justify-center">
                <RefreshCw className="w-12 h-12 text-emerald-400 animate-spin" />
                <CreditCard className="w-5 h-5 text-emerald-300 absolute" />
              </div>
              <h3 className="text-lg font-bold text-white">Reconciling Payments & Updating Ledger...</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Updating installation payment status, syncing device records, recording audit logs, and updating accounts.
              </p>
            </div>
          )}

          {/* STEP 3: Completed Screen */}
          {step === 3 && commitResult && (
            <div className="py-8 space-y-6 text-center">
              <div className="inline-flex p-4 bg-emerald-500/20 text-emerald-400 rounded-3xl border border-emerald-500/30 animate-in zoom-in-50 duration-300">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-white">Reconciliation Successfully Completed!</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Payments have been marked in installations and devices. Cloud ledger and accounts have been synchronized.
                </p>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto text-left">
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                  <span className="text-slate-400 text-xs font-semibold block">Total Processed</span>
                  <span className="text-2xl font-bold text-white mt-1 block">{commitResult.summary?.total || 0}</span>
                </div>
                <div className="bg-emerald-950/40 border border-emerald-500/30 p-4 rounded-xl">
                  <span className="text-emerald-400 text-xs font-semibold block">Fully Paid</span>
                  <span className="text-2xl font-bold text-emerald-300 mt-1 block">{commitResult.summary?.updated_paid || 0}</span>
                </div>
                <div className="bg-amber-950/40 border border-amber-500/30 p-4 rounded-xl">
                  <span className="text-amber-400 text-xs font-semibold block">Partial Marked</span>
                  <span className="text-2xl font-bold text-amber-300 mt-1 block">{commitResult.summary?.updated_partial || 0}</span>
                </div>
                <div className="bg-blue-950/40 border border-blue-500/30 p-4 rounded-xl">
                  <span className="text-blue-400 text-xs font-semibold block">Direct Entries</span>
                  <span className="text-2xl font-bold text-blue-300 mt-1 block">{commitResult.summary?.dealer_entries_logged || 0}</span>
                </div>
              </div>

              {commitResult.summary?.not_found > 0 && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs max-w-lg mx-auto text-left flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <strong>{commitResult.summary.not_found} rows were not found</strong> in current installations or devices. They have been logged for review.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div>
            {step === 1 && previewData && (
              <span className="text-xs text-slate-400">
                Ready to reconcile <strong className="text-emerald-400">{allRows.length}</strong> payments.
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 1 && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition-all"
                >
                  Cancel
                </button>
                {previewData && (
                  <button
                    type="button"
                    onClick={handleCommit}
                    disabled={loading || allRows.length === 0}
                    className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl shadow-lg shadow-emerald-900/30 flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Reconcile & Update Ledger ({allRows.length} Rows)
                  </button>
                )}
              </>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg transition-all"
              >
                Done
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
