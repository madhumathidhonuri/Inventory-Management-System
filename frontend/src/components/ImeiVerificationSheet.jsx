import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Barcode,
  QrCode,
  Camera,
  Trash2,
  Download,
  Copy,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Clock,
  Sparkles,
  Layers,
  ArrowRight,
  Truck,
  RotateCcw,
  Volume2,
  VolumeX,
  Plus,
  FileSpreadsheet,
  Check,
  ExternalLink,
  ShieldCheck,
  MapPin,
  Car,
  User,
  Zap,
  Info
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { verifyImeis } from '../services/api';
import { exportImeiVerificationToExcel } from '../utils/excelExport';

// Web Audio API beep generator
function playScanAudio(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'duplicate') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(330, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else {
      // Error / Not found
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    }
  } catch {
    // Audio might be blocked before first user interaction
  }
}

export default function ImeiVerificationSheet({
  onOpenDeviceDetail,
  onOpenJourneyDrawer,
  onInitiateBulkTransfer
}) {
  // Scanned verification items: [{ scan_id, imei_number, exists, status, is_duplicate_scan, scanned_at, device }]
  const [scannedItems, setScannedItems] = useState([]);
  const [inputImei, setInputImei] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Filter & Search
  const [statusTab, setStatusTab] = useState('ALL'); // 'ALL' | 'IN_STOCK' | 'DEALER' | 'INSTALLED' | 'NOT_FOUND' | 'DUPLICATES'
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk Paste State
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isProcessingPaste, setIsProcessingPaste] = useState(false);

  // Camera Scanner State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const scannerRef = useRef(null);

  // Feedback Notifications
  const [recentScanNotice, setRecentScanNotice] = useState(null);
  const [copySuccessMsg, setCopySuccessMsg] = useState('');

  const inputRef = useRef(null);

  // Auto focus input on mount & tab switch
  useEffect(() => {
    if (inputRef.current && !isCameraActive && !isPasteModalOpen) {
      inputRef.current.focus();
    }
  }, [isCameraActive, isPasteModalOpen]);

  // Handle single IMEI submit from barcode gun / manual typing
  const handleScanSubmit = async (e) => {
    if (e) e.preventDefault();
    const clean = inputImei.trim();
    if (!clean) return;

    setInputImei('');
    await processImeisBatch([clean]);

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Process a batch of IMEIs (single or multiple)
  const processImeisBatch = async (rawImeisList) => {
    const validImeis = rawImeisList
      .map(i => String(i || '').trim())
      .filter(i => i.length > 0);

    if (validImeis.length === 0) return;

    setIsVerifying(true);
    try {
      const res = await verifyImeis(validImeis);
      if (res.success && Array.isArray(res.data)) {
        const now = new Date().toISOString();
        
        // Calculate duplicates against previously scanned items
        setScannedItems(prev => {
          const existingImeisSet = new Set(prev.map(p => p.imei_number));
          const newEntries = res.data.map(item => {
            const isDup = existingImeisSet.has(item.imei_number) || item.is_duplicate_scan;
            if (!existingImeisSet.has(item.imei_number)) {
              existingImeisSet.add(item.imei_number);
            }
            return {
              ...item,
              scan_id: Math.random().toString(36).substring(2, 9) + Date.now(),
              is_duplicate_scan: isDup,
              scanned_at: now
            };
          });

          // Audio & Notice Feedback based on the last item processed
          if (newEntries.length > 0) {
            const last = newEntries[newEntries.length - 1];
            if (soundEnabled) {
              if (last.is_duplicate_scan) playScanAudio('duplicate');
              else if (last.exists) playScanAudio('success');
              else playScanAudio('error');
            }

            if (newEntries.length === 1) {
              setRecentScanNotice({
                imei: last.imei_number,
                exists: last.exists,
                status: last.status,
                is_duplicate: last.is_duplicate_scan,
                model: last.device?.device_type_name || ''
              });
            } else {
              setRecentScanNotice({
                batchCount: newEntries.length,
                foundCount: newEntries.filter(e => e.exists).length,
                missingCount: newEntries.filter(e => !e.exists).length
              });
            }
          }

          // Prepend newly scanned items to top of sheet
          return [...newEntries, ...prev];
        });
      }
    } catch (err) {
      alert('Verification Error: ' + err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle Bulk Paste Execution
  const handleExecutePaste = async () => {
    if (!pasteText.trim()) return;
    setIsProcessingPaste(true);

    // Split by newlines, commas, tabs, spaces or semicolons
    const imeis = pasteText
      .split(/[\r\n,;\t\s]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 4); // Filter empty or trivial noise

    if (imeis.length === 0) {
      alert('No valid IMEIs found in the pasted text.');
      setIsProcessingPaste(false);
      return;
    }

    await processImeisBatch(imeis);
    setIsProcessingPaste(false);
    setIsPasteModalOpen(false);
    setPasteText('');
  };

  // Camera Scanner Setup via html5-qrcode
  useEffect(() => {
    let html5QrCode = null;

    if (isCameraActive) {
      Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          const backCam = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0];
          setSelectedCameraId(backCam.id);
          startCamera(backCam.id);
        } else {
          setCameraError('No camera found on this device');
        }
      }).catch(err => {
        setCameraError('Camera permission denied or camera unavailable');
      });
    }

    function startCamera(cameraId) {
      try {
        html5QrCode = new Html5Qrcode('sheet-qr-reader', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX
          ]
        });
        scannerRef.current = html5QrCode;

        html5QrCode.start(
          cameraId,
          {
            fps: 15,
            qrbox: { width: 280, height: 180 },
            aspectRatio: 1.5
          },
          (decodedText) => {
            const clean = decodedText.trim();
            if (clean) {
              processImeisBatch([clean]);
            }
          },
          () => {}
        ).catch(err => {
          setCameraError('Failed to initialize camera stream: ' + err);
        });
      } catch (e) {
        setCameraError(e.message);
      }
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).then(() => {
          scannerRef.current = null;
        });
      }
    };
  }, [isCameraActive]);

  // Remove single item from sheet
  const handleRemoveItem = (scanId) => {
    setScannedItems(prev => prev.filter(i => i.scan_id !== scanId));
  };

  // Clear all items
  const handleClearAll = () => {
    if (scannedItems.length === 0) return;
    if (window.confirm(`Are you sure you want to clear all ${scannedItems.length} scanned items from this sheet?`)) {
      setScannedItems([]);
      setRecentScanNotice(null);
    }
  };

  // Copy all scanned IMEIs to clipboard
  const handleCopyImeis = () => {
    if (scannedItems.length === 0) return;
    const list = scannedItems.map(i => i.imei_number).join('\n');
    navigator.clipboard.writeText(list);
    setCopySuccessMsg(`Copied ${scannedItems.length} IMEIs to clipboard!`);
    setTimeout(() => setCopySuccessMsg(''), 2500);
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (scannedItems.length === 0) {
      alert('No scanned data to export. Please scan or paste IMEIs first.');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    exportImeiVerificationToExcel(`IMEI_Verification_Audit_${today}`, 'IMEI_Verification', scannedItems, summaryStats);
  };

  // Metrics Calculation
  const summaryStats = useMemo(() => {
    const total = scannedItems.length;
    let found = 0;
    let inStock = 0;
    let dealer = 0;
    let installed = 0;
    let rma = 0;
    let missing = 0;
    let duplicates = 0;

    scannedItems.forEach(item => {
      if (item.is_duplicate_scan) duplicates++;
      if (item.exists) {
        found++;
        if (item.status === 'IN_STOCK' || item.status === 'IN_WAREHOUSE' || item.status === 'AVAILABLE') inStock++;
        else if (item.status === 'WITH_DEALER' || item.status === 'DISPATCHED') dealer++;
        else if (item.status === 'INSTALLED' || Boolean(item.device?.vehicle_number)) installed++;
        else if (item.status === 'FAULTY' || item.status?.includes('RMA')) rma++;
      } else {
        missing++;
      }
    });

    return { total, found, inStock, dealer, installed, rma, missing, duplicates };
  }, [scannedItems]);

  // Filtered Items for Display
  const displayedItems = useMemo(() => {
    return scannedItems.filter(item => {
      // Tab filter
      if (statusTab === 'IN_STOCK' && (!item.exists || (item.status !== 'IN_STOCK' && item.status !== 'IN_WAREHOUSE' && item.status !== 'AVAILABLE'))) return false;
      if (statusTab === 'DEALER' && (!item.exists || (item.status !== 'WITH_DEALER' && item.status !== 'DISPATCHED'))) return false;
      if (statusTab === 'INSTALLED' && (!item.exists || (item.status !== 'INSTALLED' && !item.device?.vehicle_number))) return false;
      if (statusTab === 'NOT_FOUND' && item.exists) return false;
      if (statusTab === 'DUPLICATES' && !item.is_duplicate_scan) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const imeiMatch = item.imei_number.toLowerCase().includes(q);
        const modelMatch = item.device?.device_type_name?.toLowerCase().includes(q);
        const holderMatch = item.device?.stock_place?.toLowerCase().includes(q);
        const custMatch = item.device?.customer_name?.toLowerCase().includes(q);
        const vehMatch = item.device?.vehicle_number?.toLowerCase().includes(q);
        const simMatch = item.device?.sim_number?.toLowerCase().includes(q);
        return imeiMatch || modelMatch || holderMatch || custMatch || vehMatch || simMatch;
      }

      return true;
    });
  }, [scannedItems, statusTab, searchQuery]);

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Fast Scanning Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 rounded-2xl text-white shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-80 h-40 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded-full text-xs font-bold tracking-wide flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Live Stock Audit & Verification
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Fast Continuous Scanning
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
              <Barcode className="w-7 h-7 text-indigo-400" />
              IMEI Verification Sheet
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              Scan barcode labels or paste lists of IMEI numbers. Instantly check database status, identify unregistered devices, detect duplicates, and export verification reports.
            </p>
          </div>

          {/* Quick Actions Header */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Sound Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                soundEnabled
                  ? 'bg-slate-800/80 border-slate-600 text-emerald-400 hover:bg-slate-700'
                  : 'bg-slate-800/80 border-slate-600 text-slate-400 hover:bg-slate-700'
              }`}
              title={soundEnabled ? 'Beep Audio Feedback ON' : 'Audio Feedback OFF'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Bulk Paste Button */}
            <button
              type="button"
              onClick={() => setIsPasteModalOpen(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-900/40 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Paste Bulk IMEIs</span>
            </button>

            {/* Camera Scanner Toggle */}
            <button
              type="button"
              onClick={() => setIsCameraActive(!isCameraActive)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                isCameraActive
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>{isCameraActive ? 'Close Camera' : 'Camera Scanner'}</span>
            </button>

            {/* Export to Excel */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={scannedItems.length === 0}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/40 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Audit Sheet</span>
            </button>
          </div>
        </div>

        {/* Real-Time Gun & Input Scanner Bar */}
        <form onSubmit={handleScanSubmit} className="mt-6 pt-5 border-t border-slate-700/60 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-indigo-400">
              <Barcode className="w-5 h-5" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={inputImei}
              onChange={(e) => setInputImei(e.target.value)}
              placeholder="Scan barcode label with scanner gun or type IMEI and press Enter..."
              disabled={isVerifying}
              className="w-full pl-11 pr-4 py-3.5 bg-slate-950/80 border-2 border-indigo-500/60 focus:border-indigo-400 rounded-xl text-white placeholder-slate-400 font-mono text-sm tracking-wider shadow-inner focus:outline-hidden transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={isVerifying || !inputImei.trim()}
            className="px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            {isVerifying ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Verify & Add</span>
              </>
            )}
          </button>
        </form>

        {/* Live Feedback Toast Notification */}
        {recentScanNotice && (
          <div className="mt-4 p-3 bg-slate-950/90 rounded-xl border border-slate-700 flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-2 duration-200">
            {recentScanNotice.batchCount ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  Processed <strong>{recentScanNotice.batchCount} IMEIs</strong>: {recentScanNotice.foundCount} Verified in DB, {recentScanNotice.missingCount} Unregistered.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                {recentScanNotice.is_duplicate ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : recentScanNotice.exists ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
                <span className="font-mono font-bold text-white">{recentScanNotice.imei}</span>
                <span className="text-slate-400">→</span>
                <span className={`font-semibold ${
                  recentScanNotice.is_duplicate
                    ? 'text-amber-400'
                    : recentScanNotice.exists
                    ? 'text-emerald-300'
                    : 'text-rose-300'
                }`}>
                  {recentScanNotice.is_duplicate
                    ? '⚠️ Duplicate Scan'
                    : recentScanNotice.exists
                    ? `🟢 Verified (${recentScanNotice.status} - ${recentScanNotice.model || 'Device'})`
                    : '🔴 Unregistered (Not in Database)'}
                </span>
              </div>
            )}
            <button
              onClick={() => setRecentScanNotice(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Camera Live Stream View (If activated) */}
      {isCameraActive && (
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-700 text-white space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2 text-indigo-300">
              <Camera className="w-4 h-4" /> Camera Barcode / QR Scanner
            </h3>
            <button
              onClick={() => setIsCameraActive(false)}
              className="text-xs text-slate-400 hover:text-white px-2.5 py-1 bg-slate-800 rounded-lg cursor-pointer"
            >
              Close Camera
            </button>
          </div>

          {cameraError ? (
            <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300">
              {cameraError}
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div
                id="sheet-qr-reader"
                className="w-full max-w-md bg-black rounded-xl overflow-hidden border-2 border-indigo-500 shadow-xl"
              />
              <p className="text-xs text-slate-400 mt-2">
                Align the barcode or QR code within the scanning box. The scanner will automatically capture and verify.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Summary KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Scanned */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Scanned</span>
            <Barcode className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">{summaryStats.total}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Recorded in sheet</div>
        </div>

        {/* Verified In Stock */}
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs hover:border-emerald-300 transition-all bg-gradient-to-br from-white to-emerald-50/30">
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">In Stock</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">{summaryStats.inStock}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5 font-medium">Ready & Available</div>
        </div>

        {/* Dispatched / Dealer */}
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs hover:border-amber-300 transition-all bg-gradient-to-br from-white to-amber-50/30">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">With Dealer</span>
            <Truck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700">{summaryStats.dealer}</div>
          <div className="text-[11px] text-amber-600 mt-0.5 font-medium">Dispatched stock</div>
        </div>

        {/* Installed */}
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-xs hover:border-blue-300 transition-all bg-gradient-to-br from-white to-blue-50/30">
          <div className="flex items-center justify-between text-blue-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Installed</span>
            <Car className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-700">{summaryStats.installed}</div>
          <div className="text-[11px] text-blue-600 mt-0.5 font-medium">In vehicle / Active</div>
        </div>

        {/* Unregistered / Not Found */}
        <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs hover:border-rose-300 transition-all bg-gradient-to-br from-white to-rose-50/30">
          <div className="flex items-center justify-between text-rose-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Unregistered</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700">{summaryStats.missing}</div>
          <div className="text-[11px] text-rose-600 mt-0.5 font-medium">Not in database</div>
        </div>

        {/* Duplicate Scans */}
        <div className="bg-white p-4 rounded-xl border border-yellow-200 shadow-xs hover:border-yellow-300 transition-all bg-gradient-to-br from-white to-yellow-50/30">
          <div className="flex items-center justify-between text-yellow-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Duplicates</span>
            <AlertTriangle className="w-4 h-4 text-yellow-600" />
          </div>
          <div className="text-2xl font-black text-yellow-700">{summaryStats.duplicates}</div>
          <div className="text-[11px] text-yellow-600 mt-0.5 font-medium">Scanned twice+</div>
        </div>
      </div>

      {/* Main Sheet Grid Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* Table Controls & Filter Bar */}
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50">
          
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: 'All Items', count: summaryStats.total },
              { id: 'IN_STOCK', label: 'In Stock', count: summaryStats.inStock, badgeClass: 'bg-emerald-100 text-emerald-800' },
              { id: 'DEALER', label: 'With Dealer', count: summaryStats.dealer, badgeClass: 'bg-amber-100 text-amber-800' },
              { id: 'INSTALLED', label: 'Installed', count: summaryStats.installed, badgeClass: 'bg-blue-100 text-blue-800' },
              { id: 'NOT_FOUND', label: 'Unregistered', count: summaryStats.missing, badgeClass: 'bg-rose-100 text-rose-800' },
              { id: 'DUPLICATES', label: 'Duplicates', count: summaryStats.duplicates, badgeClass: 'bg-yellow-100 text-yellow-800' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  statusTab === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  statusTab === tab.id ? 'bg-slate-800 text-white' : tab.badgeClass || 'bg-slate-100 text-slate-700'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Actions Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search scanned IMEIs..."
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-48 sm:w-60"
              />
            </div>

            {/* Copy IMEIs button */}
            <button
              type="button"
              onClick={handleCopyImeis}
              disabled={scannedItems.length === 0}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Copy all scanned IMEIs to clipboard"
            >
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>Copy List</span>
            </button>

            {/* Clear All Sheet Data */}
            <button
              type="button"
              onClick={handleClearAll}
              disabled={scannedItems.length === 0}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Clear current verification sheet"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Sheet</span>
            </button>
          </div>
        </div>

        {/* Copy Feedback */}
        {copySuccessMsg && (
          <div className="px-4 py-2 bg-emerald-50 text-emerald-800 border-b border-emerald-100 text-xs font-semibold flex items-center gap-2">
            <Check className="w-3.5 h-3.5" />
            <span>{copySuccessMsg}</span>
          </div>
        )}

        {/* Spreadsheet Table View */}
        <div className="overflow-x-auto min-h-[360px] max-h-[640px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/80 sticky top-0 z-10 border-b border-slate-200">
              <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="p-3.5 w-12 text-center">#</th>
                <th className="p-3.5">IMEI Number</th>
                <th className="p-3.5">Verification Status</th>
                <th className="p-3.5">Device Model / Brand</th>
                <th className="p-3.5">Current Stock Location</th>
                <th className="p-3.5">Customer / Vehicle</th>
                <th className="p-3.5">SIM Number</th>
                <th className="p-3.5">Scan Timestamp</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <div className="max-w-sm mx-auto flex flex-col items-center justify-center space-y-3">
                      <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center shadow-xs">
                        <Barcode className="w-7 h-7" />
                      </div>
                      <h4 className="font-bold text-slate-800 text-sm">No items in verification sheet</h4>
                      <p className="text-xs text-slate-500">
                        {searchQuery || statusTab !== 'ALL'
                          ? 'No scanned records match the current filter or search criteria.'
                          : 'Use your barcode scanner gun, webcam scanner, or the "Paste Bulk IMEIs" button above to verify devices.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedItems.map((item, index) => {
                  const dev = item.device;
                  const isFound = item.exists;

                  // Render badge
                  let badge = (
                    <span className="px-2.5 py-1 bg-rose-100 text-rose-800 border border-rose-200 rounded-full font-bold text-[10px] inline-flex items-center gap-1 shadow-2xs">
                      <XCircle className="w-3 h-3 text-rose-600" />
                      UNREGISTERED (NOT IN DB)
                    </span>
                  );

                  if (isFound) {
                    if (item.status === 'IN_STOCK' || item.status === 'IN_WAREHOUSE' || item.status === 'AVAILABLE') {
                      badge = (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full font-bold text-[10px] inline-flex items-center gap-1 shadow-2xs">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          VERIFIED - IN STOCK
                        </span>
                      );
                    } else if (item.status === 'WITH_DEALER' || item.status === 'DISPATCHED') {
                      badge = (
                        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-full font-bold text-[10px] inline-flex items-center gap-1 shadow-2xs">
                          <Truck className="w-3 h-3 text-amber-600" />
                          WITH DEALER / DISPATCHED
                        </span>
                      );
                    } else if (item.status === 'INSTALLED' || Boolean(dev?.vehicle_number)) {
                      badge = (
                        <span className="px-2.5 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full font-bold text-[10px] inline-flex items-center gap-1 shadow-2xs">
                          <Car className="w-3 h-3 text-blue-600" />
                          INSTALLED IN VEHICLE
                        </span>
                      );
                    } else if (item.status === 'FAULTY' || item.status?.includes('RMA')) {
                      badge = (
                        <span className="px-2.5 py-1 bg-purple-100 text-purple-800 border border-purple-200 rounded-full font-bold text-[10px] inline-flex items-center gap-1 shadow-2xs">
                          <AlertTriangle className="w-3 h-3 text-purple-600" />
                          RMA / FAULTY
                        </span>
                      );
                    } else {
                      badge = (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-full font-bold text-[10px] inline-flex items-center gap-1 shadow-2xs">
                          <CheckCircle2 className="w-3 h-3 text-slate-600" />
                          {item.status}
                        </span>
                      );
                    }
                  }

                  return (
                    <tr
                      key={item.scan_id || index}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        item.is_duplicate_scan ? 'bg-yellow-50/40' : !isFound ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      {/* Index */}
                      <td className="p-3.5 text-center text-slate-400 font-mono text-[11px]">
                        {index + 1}
                      </td>

                      {/* IMEI Number */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 text-xs tracking-wider">
                            {item.imei_number}
                          </span>
                          {item.is_duplicate_scan && (
                            <span className="px-1.5 py-0.2 rounded-md bg-yellow-100 text-yellow-800 border border-yellow-300 text-[9px] font-extrabold" title="Scanned multiple times in this session">
                              DUP
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(item.imei_number);
                              setCopySuccessMsg(`Copied ${item.imei_number}!`);
                              setTimeout(() => setCopySuccessMsg(''), 1500);
                            }}
                            className="text-slate-400 hover:text-slate-700 p-0.5 rounded-sm cursor-pointer"
                            title="Copy IMEI"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* Verification Status */}
                      <td className="p-3.5">{badge}</td>

                      {/* Model / Type */}
                      <td className="p-3.5">
                        {isFound ? (
                          <div>
                            <div className="font-semibold text-slate-800">
                              {dev.device_type_name || 'Standard AIS-140'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {dev.vendor_name || 'Direct'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>

                      {/* Stock Location */}
                      <td className="p-3.5">
                        {isFound ? (
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{dev.stock_place || dev.current_holder_name || 'Central Warehouse'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>

                      {/* Customer / Vehicle */}
                      <td className="p-3.5">
                        {isFound && (dev.customer_name || dev.vehicle_number) ? (
                          <div>
                            {dev.customer_name && (
                              <div className="font-semibold text-slate-800 flex items-center gap-1">
                                <User className="w-3 h-3 text-slate-400" />
                                <span>{dev.customer_name}</span>
                              </div>
                            )}
                            {dev.vehicle_number && (
                              <div className="text-[11px] font-mono font-bold text-blue-700 flex items-center gap-1">
                                <Car className="w-3 h-3 text-blue-500" />
                                <span>{dev.vehicle_number}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>

                      {/* SIM Number */}
                      <td className="p-3.5 font-mono text-slate-600 text-[11px]">
                        {dev?.sim_number || (isFound ? '—' : '—')}
                      </td>

                      {/* Scan Timestamp */}
                      <td className="p-3.5 text-slate-500 text-[11px]">
                        {item.scanned_at ? new Date(item.scanned_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right space-x-1 whitespace-nowrap">
                        {isFound && (
                          <>
                            {onOpenDeviceDetail && (
                              <button
                                type="button"
                                onClick={() => onOpenDeviceDetail(item.imei_number)}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                title="View Device Card & Specs"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onOpenJourneyDrawer && (
                              <button
                                type="button"
                                onClick={() => onOpenJourneyDrawer(item.imei_number)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Trace Lifecycle & History"
                              >
                                <Layers className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.scan_id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Remove from sheet"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing <strong className="text-slate-800">{displayedItems.length}</strong> of{' '}
            <strong className="text-slate-800">{scannedItems.length}</strong> scanned devices.
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Verified In Stock: {summaryStats.inStock}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              Installed: {summaryStats.installed}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              Unregistered: {summaryStats.missing}
            </span>
          </div>
        </div>
      </div>

      {/* Bulk Paste Modal */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Paste Bulk IMEIs</h3>
                  <p className="text-xs text-slate-500">Paste copied columns from Excel, WhatsApp, or text lists</p>
                </div>
              </div>
              <button
                onClick={() => setIsPasteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste list of IMEIs here (separated by new line, comma, space, or tab)...&#10;Example:&#10;863456041234567&#10;863456041234568&#10;863456041234569"
                rows={8}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Estimated count:{' '}
                  <strong className="text-indigo-600 font-bold">
                    {pasteText.trim() ? pasteText.split(/[\r\n,;\t\s]+/).filter(s => s.trim().length >= 4).length : 0}
                  </strong>
                </span>
                <span className="text-[11px] text-slate-400">Duplicates will be automatically flagged</span>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPasteModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecutePaste}
                  disabled={isProcessingPaste || !pasteText.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  {isProcessingPaste ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Verify & Add to Sheet</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
