import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Barcode, Trash2, Plus, CheckCircle, ShieldAlert, Zap, Truck, Wrench } from 'lucide-react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';

export default function BarcodeScannerModal({ isOpen, onClose, onScannedComplete, defaultMode = 'BULK' }) {
  const [scannedImeis, setScannedImeis] = useState([]);
  const [manualImei, setManualImei] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [simulatedSampleIdx, setSimulatedSampleIdx] = useState(0);
  const scannerRef = useRef(null);

  const SIMULATED_IMEIS = [
    '864920050019101', '864920050019102', '864920050019103', 
    '864920050019104', '864920050019105', '864920050019106'
  ];

  useEffect(() => {
    if (isOpen) {
      setScannedImeis([]);
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    setIsScanning(true);
    try {
      setTimeout(() => {
        const scannerElement = document.getElementById('reader');
        if (!scannerElement) return;

        const html5QrCode = new Html5Qrcode('reader');
        scannerRef.current = html5QrCode;

        html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            const clean = decodedText.trim();
            addImei(clean);
          },
          (errorMessage) => {}
        ).catch(err => {
          console.warn('Camera access error:', err);
          setCameraError('Camera access unavailable or blocked. You can use Simulated Scan or Manual Input below.');
        });
      }, 300);
    } catch (err) {
      setCameraError(err.message);
    }
  };

  const stopCamera = () => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop().then(() => {
          scannerRef.current.clear();
        }).catch(err => console.error(err));
      } catch (e) {}
    }
    setIsScanning(false);
  };

  const addImei = (imeiStr) => {
    const clean = imeiStr.trim();
    if (!clean) return;
    if (scannedImeis.includes(clean)) return;

    setScannedImeis(prev => [...prev, clean]);
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 880;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
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
    if (manualImei) {
      addImei(manualImei);
      setManualImei('');
    }
  };

  const handleDone = (actionType) => {
    stopCamera();
    onScannedComplete(scannedImeis, actionType);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
              <Barcode className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Continuous Bulk IMEI Scanner
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {scannedImeis.length} Scanned
                </span>
              </h2>
              <p className="text-xs text-slate-500">Scan devices sequentially; review list before applying actions</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          
          {/* Camera Scan Window & Controls */}
          <div className="space-y-3">
            <div className="relative bg-slate-900 rounded-xl overflow-hidden border border-slate-200 min-h-[220px] flex items-center justify-center">
              <div id="reader" className="w-full"></div>

              {cameraError && (
                <div className="p-4 text-center space-y-2">
                  <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="text-xs text-amber-200">{cameraError}</p>
                </div>
              )}
            </div>

            {/* Quick Simulate Button for Testing */}
            <button
              onClick={handleSimulatedScan}
              className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4 text-amber-600" />
              Simulate Barcode Camera Scan (+1 Test IMEI)
            </button>

            {/* Manual Input Fallback */}
            <form onSubmit={handleManualAdd} className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Manual IMEI entry..."
                value={manualImei}
                onChange={(e) => setManualImei(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500 focus:bg-white"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </form>
          </div>

          {/* Running Tally List */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col h-[280px]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
              <span className="text-xs font-bold text-slate-800">Scanned List ({scannedImeis.length})</span>
              {scannedImeis.length > 0 && (
                <button
                  onClick={() => setScannedImeis([])}
                  className="text-[11px] text-red-600 hover:text-red-700 flex items-center gap-1 font-medium"
                >
                  <Trash2 className="w-3 h-3" /> Clear All
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {scannedImeis.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-xs text-slate-400">
                  Point camera at barcode or tap 'Simulate Barcode Camera Scan'
                </div>
              ) : (
                scannedImeis.map((imei, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 shadow-2xs">
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-sans">#{idx + 1}</span>
                      {imei}
                    </span>
                    <button
                      onClick={() => removeImei(imei)}
                      className="text-slate-400 hover:text-red-600 transition-colors"
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
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            disabled={scannedImeis.length === 0}
            onClick={() => handleDone('INSTALL')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Wrench className="w-4 h-4" /> Install ({scannedImeis.length}) in Vehicle
          </button>
        </div>

      </div>
    </div>
  );
}
