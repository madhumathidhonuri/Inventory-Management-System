import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Barcode,
  Trash2,
  Plus,
  CheckCircle,
  ShieldAlert,
  Zap,
  Wrench,
  Flashlight,
  Volume2,
  Copy,
  ClipboardList,
  RefreshCw,
  Sparkles,
  Truck,
  MapPin,
  Calendar,
  Building
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { bulkAssignDealer, fetchDealersSummary, fetchDeviceTypes } from '../services/api';

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  onScannedComplete,
  defaultMode = 'BULK'
}) {
  const [scannedImeis, setScannedImeis] = useState([]);
  const [manualImei, setManualImei] = useState('');
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [lastScannedImei, setLastScannedImei] = useState('');
  const [simulatedSampleIdx, setSimulatedSampleIdx] = useState(0);

  // Device Types State
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [selectedDeviceTypeId, setSelectedDeviceTypeId] = useState('');

  // Dealer Dispatch & Stock Place Modal State
  const [showDealerModal, setShowDealerModal] = useState(false);
  const [dealerStockPlace, setDealerStockPlace] = useState('');
  const [dealerStockDate, setDealerStockDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dealerRemarks, setDealerRemarks] = useState('');
  const [dealerSubmitting, setDealerSubmitting] = useState(false);
  const [dealerSuccessMsg, setDealerSuccessMsg] = useState('');
  const [knownStockPlaces, setKnownStockPlaces] = useState([]);

  useEffect(() => {
    fetchDeviceTypes().then(res => {
      if (res.success && Array.isArray(res.data)) {
        setDeviceTypes(res.data);
        const preferred = res.data.find(d => /vamo/i.test(d.name)) || res.data.find(d => /track/i.test(d.name)) || res.data[0];
        if (preferred) setSelectedDeviceTypeId(preferred.id);
      }
    }).catch(() => {});
  }, []);

  const scannerRef = useRef(null);
  const lastScannedTimeRef = useRef(0);
  const lastScannedTextRef = useRef('');
  const barcodeBufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);

  const SIMULATED_IMEIS = [
    '864920050019101', '864920050019102', '864920050019103', 
    '864920050019104', '864920050019105', '864920050019106'
  ];

  // Sound & Vibration Feedback
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {}

    try {
      if (navigator.vibrate) {
        navigator.vibrate([40]);
      }
    } catch (e) {}
  };

  // Add Scanned IMEI
  const addImei = (imeiStr) => {
    if (!imeiStr) return;
    const clean = String(imeiStr).trim().toUpperCase();
    if (!clean || clean.length < 4) return;

    // Cooldown check for the same IMEI (1.5 seconds)
    const now = Date.now();
    if (lastScannedTextRef.current === clean && now - lastScannedTimeRef.current < 1500) {
      return;
    }

    lastScannedTextRef.current = clean;
    lastScannedTimeRef.current = now;
    setLastScannedImei(clean);
    playBeep();

    setScannedImeis((prev) => {
      if (prev.includes(clean)) return prev;
      return [clean, ...prev];
    });
  };

  // Hardware USB/Bluetooth Barcode Scanner Listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length >= 4) {
          addImei(barcodeBufferRef.current);
          barcodeBufferRef.current = '';
        }
        return;
      }

      if (timeDiff > 100) {
        barcodeBufferRef.current = '';
      }

      if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Lifecycle: open & start scanner
  useEffect(() => {
    if (isOpen) {
      setScannedImeis([]);
      setCameraError(null);
      setLastScannedImei('');
      setShowDealerModal(false);
      setDealerSuccessMsg('');
      initCameraListAndStart();
      loadKnownPlaces();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  const loadKnownPlaces = async () => {
    try {
      const res = await fetchDealersSummary();
      if (res.success && Array.isArray(res.data)) {
        setKnownStockPlaces(res.data.map(d => d.stock_place).filter(Boolean));
      }
    } catch (e) {}
  };

  const initCameraListAndStart = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        const backCamera = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];
        setSelectedCameraId(backCamera.id);
        startScannerWithCameraId(backCamera.id);
      } else {
        startScannerWithFacingMode('environment');
      }
    } catch (err) {
      console.warn('Could not enumerate cameras, falling back to facingMode:', err);
      startScannerWithFacingMode('environment');
    }
  };

  const startScannerWithCameraId = async (cameraId) => {
    setCameraError(null);
    setIsScanning(true);

    try {
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
          scannerRef.current.clear();
        } catch (e) {}
      }

      setTimeout(() => {
        const elem = document.getElementById('barcode-reader');
        if (!elem) return;

        const formatsToSupport = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.ITF
        ];

        const html5QrCode = new Html5Qrcode('barcode-reader', {
          formatsToSupport,
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
          }
        });
        scannerRef.current = html5QrCode;

        const config = {
          fps: 30,
          qrbox: (viewfinderWidth, viewfinderHeight) => ({
            width: Math.min(viewfinderWidth * 0.9, 360),
            height: Math.min(viewfinderHeight * 0.45, 140)
          }),
          aspectRatio: 1.777778,
          disableFlip: false
        };

        html5QrCode.start(
          cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' },
          config,
          (decodedText) => {
            addImei(decodedText);
          },
          () => {}
        ).then(() => {
          try {
            const capabilities = html5QrCode.getRunningTrackCapabilities?.();
            if (capabilities && capabilities.torch) {
              setHasTorch(true);
            }
          } catch (e) {}
        }).catch(err => {
          console.warn('Camera start error:', err);
          setCameraError('Camera access blocked or in use. Use manual input or simulated scan.');
        });
      }, 200);
    } catch (err) {
      setCameraError(err.message);
    }
  };

  const startScannerWithFacingMode = () => {
    startScannerWithCameraId(null);
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {}
      scannerRef.current = null;
    }
    setIsScanning(false);
    setIsFlashOn(false);
  };

  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    try {
      const nextState = !isFlashOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }]
      });
      setIsFlashOn(nextState);
    } catch (e) {
      console.warn('Torch toggle not supported on this device/browser');
    }
  };

  const removeImei = (imeiToRemove) => {
    setScannedImeis(prev => prev.filter(i => i !== imeiToRemove));
  };

  const handleSimulatedScan = () => {
    const imei = SIMULATED_IMEIS[simulatedSampleIdx % SIMULATED_IMEIS.length];
    setSimulatedSampleIdx(prev => prev + 1);
    addImei(imei);
  };

  const handleManualAdd = (e) => {
    e.preventDefault();
    if (manualImei.trim()) {
      addImei(manualImei.trim());
      setManualImei('');
    }
  };

  const handleBulkPasteSubmit = () => {
    if (!bulkPasteText.trim()) return;
    const tokens = bulkPasteText
      .split(/[\n,;\t\s]+/)
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length >= 4);

    if (tokens.length > 0) {
      tokens.forEach(tok => addImei(tok));
      setBulkPasteText('');
      setShowPasteModal(false);
    }
  };

  // Submit Bulk Dealer & Stock Place Assignment
  const handleAssignToDealerSubmit = async (e) => {
    e.preventDefault();
    if (!dealerStockPlace.trim()) {
      alert('Please enter or select a Dealer / Stock Place name');
      return;
    }

    setDealerSubmitting(true);
    try {
      const res = await bulkAssignDealer({
        imeis: scannedImeis,
        stock_place: dealerStockPlace.trim(),
        stock_place_date: dealerStockDate,
        remarks: dealerRemarks,
        device_type_id: selectedDeviceTypeId,
        performed_by: 'Admin'
      });

      if (res.success) {
        setDealerSuccessMsg(`✅ ${res.message}`);
        setTimeout(() => {
          setShowDealerModal(false);
          handleDone('INVENTORY', {
            stockPlace: dealerStockPlace.trim(),
            imeis: scannedImeis,
            successMessage: res.message
          });
        }, 1000);
      }
    } catch (err) {
      alert('Failed to update stock place: ' + err.message);
    } finally {
      setDealerSubmitting(false);
    }
  };

  const handleDone = (actionType, meta = {}) => {
    stopCamera();
    onScannedComplete(scannedImeis, actionType, meta);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-2xl bg-blue-600 text-white shadow-xs">
              <Barcode className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Ultra-Fast Bulk IMEI Scanner
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {scannedImeis.length} Scanned
                </span>
              </h2>
              <p className="text-xs text-slate-500">Scan devices sequentially or use USB scanner gun</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          
          {/* Camera Scan Window & Controls */}
          <div className="space-y-3">
            
            {/* Viewfinder Frame */}
            <div className="relative bg-slate-950 rounded-2xl overflow-hidden border-2 border-blue-500/50 min-h-[220px] flex items-center justify-center shadow-inner group">
              <div id="barcode-reader" className="w-full"></div>

              {/* Laser Scanning Line Animation */}
              {!cameraError && isScanning && (
                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse pointer-events-none z-10"></div>
              )}

              {/* Torch / Flashlight Button */}
              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`absolute top-2 right-2 p-2 rounded-xl backdrop-blur-md z-20 transition-all cursor-pointer ${
                    isFlashOn ? 'bg-amber-400 text-slate-950 shadow-md' : 'bg-slate-900/60 text-white hover:bg-slate-800'
                  }`}
                  title="Toggle Flashlight"
                >
                  <Flashlight className="w-4 h-4" />
                </button>
              )}

              {/* Camera Error Display */}
              {cameraError && (
                <div className="p-4 text-center space-y-2 z-20">
                  <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="text-xs text-amber-200">{cameraError}</p>
                </div>
              )}
            </div>

            {/* Camera Switcher Dropdown */}
            {cameras.length > 1 && (
              <select
                value={selectedCameraId || ''}
                onChange={(e) => {
                  setSelectedCameraId(e.target.value);
                  startScannerWithCameraId(e.target.value);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    📹 {c.label || `Camera ${c.id}`}
                  </option>
                ))}
              </select>
            )}

            {/* Quick Action Tools Bar */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSimulatedScan}
                className="py-2 px-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                <span>+1 Demo Scan</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPasteModal(!showPasteModal)}
                className="py-2 px-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <ClipboardList className="w-3.5 h-3.5 text-blue-600" />
                <span>Paste Multi IMEIs</span>
              </button>
            </div>

            {/* Bulk Paste Multi-Line Textarea Drawer */}
            {showPasteModal && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2 animate-in fade-in-50">
                <div className="text-[11px] font-bold text-blue-900">Paste List of IMEIs (one per line or space/comma separated):</div>
                <textarea
                  rows={3}
                  value={bulkPasteText}
                  onChange={(e) => setBulkPasteText(e.target.value)}
                  placeholder="864920050019101&#10;864920050019102&#10;864920050019103..."
                  className="w-full bg-white border border-blue-300 rounded-xl p-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPasteModal(false)}
                    className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkPasteSubmit}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs"
                  >
                    Add All IMEIs
                  </button>
                </div>
              </div>
            )}

            {/* Manual Single IMEI Input */}
            <form onSubmit={handleManualAdd} className="flex gap-2">
              <input
                type="text"
                placeholder="Manual IMEI entry..."
                value={manualImei}
                onChange={(e) => setManualImei(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500 focus:bg-white"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </form>
          </div>

          {/* Scanned Items Running Tally */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col h-[320px]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>Scanned List</span>
                <span className="px-2 py-0.2 rounded-md bg-blue-100 text-blue-800 text-[11px] font-mono font-bold">
                  {scannedImeis.length}
                </span>
              </span>

              {scannedImeis.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScannedImeis([])}
                  className="text-[11px] text-red-600 hover:text-red-700 flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              )}
            </div>

            {/* Live Instant Recognition Banner */}
            {lastScannedImei && (
              <div className="mb-2 p-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-mono animate-in fade-in-50">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">Scanned: <strong>{lastScannedImei}</strong></span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {scannedImeis.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-400 p-4 space-y-2">
                  <Barcode className="w-8 h-8 text-slate-300 stroke-1" />
                  <p>Point camera at barcode or trigger your USB Barcode Gun.</p>
                  <p className="text-[10px] text-slate-400">Scans immediately upon detection!</p>
                </div>
              ) : (
                scannedImeis.map((imei, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 shadow-2xs hover:border-blue-300 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-sans font-bold">#{scannedImeis.length - idx}</span>
                      <strong className="text-blue-700">{imei}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeImei(imei)}
                      className="text-slate-400 hover:text-red-600 p-1 rounded-md transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Left helper actions */}
          <div className="flex items-center gap-2">
            {scannedImeis.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(scannedImeis.join('\n'));
                  alert(`Copied ${scannedImeis.length} IMEIs to clipboard!`);
                }}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copy ({scannedImeis.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-slate-600 hover:text-slate-900 text-xs font-medium rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>

          {/* Right Destination Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {scannedImeis.length === 1 && (
              <button
                type="button"
                onClick={() => handleDone('TRACE')}
                className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Trace
              </button>
            )}

            {/* Assign to Dealer & Update Stock Place Button */}
            <button
              type="button"
              disabled={scannedImeis.length === 0}
              onClick={() => setShowDealerModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Handover scanned devices to dealer and record stock place with date"
            >
              <Truck className="w-4 h-4" />
              <span>Assign to Dealer ({scannedImeis.length})</span>
            </button>

            <button
              type="button"
              disabled={scannedImeis.length === 0}
              onClick={() => handleDone('INSTALL')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Wrench className="w-4 h-4" /> Install ({scannedImeis.length}) in Vehicle
            </button>
          </div>
        </div>

      </div>

      {/* Dealer & Stock Place Dispatch Modal Popup */}
      {showDealerModal && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-base">
                <Truck className="w-5 h-5 text-indigo-600" />
                <span>Handover Stock to Dealer</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDealerModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {dealerSuccessMsg ? (
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm font-bold text-center space-y-2 animate-in zoom-in-95">
                <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto" />
                <div>{dealerSuccessMsg}</div>
                <p className="text-xs font-normal text-emerald-700">Updating inventory & redirecting...</p>
              </div>
            ) : (
              <form onSubmit={handleAssignToDealerSubmit} className="space-y-3.5">
                <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl text-xs space-y-1">
                  <div className="font-bold text-indigo-900">
                    Allocating {scannedImeis.length} Scanned Device(s)
                  </div>
                  <div className="text-slate-500 truncate text-[11px]">
                    IMEIs: {scannedImeis.slice(0, 3).join(', ')}{scannedImeis.length > 3 ? ` + ${scannedImeis.length - 3} more` : ''}
                  </div>
                </div>

                {/* Dealer / Stock Place Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-indigo-600" /> Dealer / Stock Place Name *
                  </label>
                  <input
                    type="text"
                    required
                    list="known-places-list"
                    placeholder="e.g. VIJAYAWADA - RAMESH, HYDERABAD HUB..."
                    value={dealerStockPlace}
                    onChange={(e) => setDealerStockPlace(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                  <datalist id="known-places-list">
                    {knownStockPlaces.map((p, i) => (
                      <option key={i} value={p} />
                    ))}
                  </datalist>
                </div>

                {/* Stock Place Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Dispatch / Stock Place Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={dealerStockDate}
                    onChange={(e) => setDealerStockDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                {/* Device Type / Vendor (if newly scanned) */}
                {deviceTypes.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">
                      Device Type / Model (e.g. VAMO, VAMOSYS, VOLTY, TRACKNOW)
                    </label>
                    <select
                      value={selectedDeviceTypeId}
                      onChange={(e) => setSelectedDeviceTypeId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                    >
                      {deviceTypes.map(dt => (
                        <option key={dt.id} value={dt.id}>{dt.name} ({dt.category})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Optional Remarks / Courier info */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Remarks / Handover Note (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sent via DTDC Courier / Handover to Manoj"
                    value={dealerRemarks}
                    onChange={(e) => setDealerRemarks(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDealerModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={dealerSubmitting}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {dealerSubmitting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}
                    Confirm & Update All ({scannedImeis.length})
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
