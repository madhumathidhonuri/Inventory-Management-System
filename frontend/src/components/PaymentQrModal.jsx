import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Send,
  Download,
  Printer,
  Copy,
  Check,
  CreditCard,
  QrCode,
  ShieldCheck,
  Sparkles,
  Smartphone,
  ExternalLink,
  Edit3,
  RotateCcw,
  CheckCircle2,
  Car,
  User,
  Building,
  DollarSign
} from 'lucide-react';
import { buildPaymentQrWhatsAppMessage, generateUpiUri, formatINR } from '../utils/whatsapp';
import { updateQuickPayment } from '../services/api';

export default function PaymentQrModal({
  isOpen,
  onClose,
  paymentData,
  onPaymentUpdated
}) {
  if (!isOpen || !paymentData) return null;

  const {
    id: deviceId,
    imei,
    imei_number,
    vehicle_number,
    vehicleNumber,
    customer_name,
    customerName,
    customer_phone,
    customerPhone,
    sale_price,
    salePrice,
    cost,
    gst,
    total_cost,
    totalCost,
    stock_place,
    stockPlace,
    payment_status,
    paymentStatus,
    additional_attributes = {}
  } = paymentData;

  const targetImei = imei || imei_number || additional_attributes['IMEI'] || '';
  const targetVeh = vehicle_number || vehicleNumber || additional_attributes['VEHICLE NUMBER'] || additional_attributes['Vehicle Number'] || 'N/A';
  const targetCust = customer_name || customerName || additional_attributes['CUSTOMER NAME'] || 'Valued Customer';
  const targetPhone = customer_phone || customerPhone || additional_attributes['CUSTOMER PHONE NUMBER'] || additional_attributes['Primary Mobile'] || '';
  const targetStock = stock_place || stockPlace || additional_attributes['STOCK PLACE'] || 'FuelTracks Central';

  const defaultAmt = parseFloat(sale_price || salePrice || total_cost || totalCost || cost || additional_attributes['TOTAL COST'] || additional_attributes['COST'] || 6500);

  // User-customizable UPI & Company QR State
  const [upiId, setUpiId] = useState(() => localStorage.getItem('fueltracks_merchant_upi') || 'fueltracks@icici');
  const [payeeName, setPayeeName] = useState(() => localStorage.getItem('fueltracks_payee_name') || 'FuelTracks Technologies Pvt Ltd');
  const [companyQrImage, setCompanyQrImage] = useState(() => localStorage.getItem('fueltracks_company_qr_image') || '');
  const [qrMode, setQrMode] = useState(() => localStorage.getItem('fueltracks_qr_mode') || 'COMPANY_QR'); // 'COMPANY_QR' | 'DYNAMIC_UPI'
  const [amount, setAmount] = useState(defaultAmt || 6500);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [paidSuccess, setPaidSuccess] = useState(false);

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const transactionNote = `GPS Fitment ${targetVeh !== 'N/A' ? targetVeh : ''} ${targetImei ? `(${String(targetImei).slice(-6)})` : ''}`.trim();

  // Generate UPI URI
  const upiUri = generateUpiUri({
    upiId,
    payeeName,
    amount: parseFloat(amount) || 0,
    transactionNote
  });

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        setCompanyQrImage(base64);
        localStorage.setItem('fueltracks_company_qr_image', base64);
        setQrMode('COMPANY_QR');
        localStorage.setItem('fueltracks_qr_mode', 'COMPANY_QR');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveCompanyQr = () => {
    setCompanyQrImage('');
    localStorage.removeItem('fueltracks_company_qr_image');
    setQrMode('DYNAMIC_UPI');
    localStorage.setItem('fueltracks_qr_mode', 'DYNAMIC_UPI');
  };

  // Render QR Code onto Canvas and generate data URL
  useEffect(() => {
    if (canvasRef.current && upiUri) {
      QRCode.toCanvas(
        canvasRef.current,
        upiUri,
        {
          width: 240,
          margin: 2,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          },
          errorCorrectionLevel: 'H'
        },
        (error) => {
          if (error) console.error('QR Generation Error:', error);
          else if (canvasRef.current) {
            setQrDataUrl(canvasRef.current.toDataURL('image/png'));
          }
        }
      );
    }
  }, [upiUri, isOpen, qrMode]);

  const handleSaveConfig = () => {
    localStorage.setItem('fueltracks_merchant_upi', upiId.trim());
    localStorage.setItem('fueltracks_payee_name', payeeName.trim());
    setIsEditingConfig(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(upiUri);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyUpiId = () => {
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  const handleSendWhatsApp = () => {
    const { url } = buildPaymentQrWhatsAppMessage({
      phone: targetPhone,
      customerName: targetCust,
      vehicleNumber: targetVeh,
      imei: targetImei,
      amount: parseFloat(amount) || 0,
      upiId,
      payeeName,
      stockPlace: targetStock
    });
    window.open(url, '_blank');
  };

  // Download high-resolution PNG card with brand header & QR
  const handleDownloadQr = () => {
    if (!canvasRef.current) return;

    // Create a composite branded canvas for downloading
    const cardCanvas = document.createElement('canvas');
    cardCanvas.width = 600;
    cardCanvas.height = 760;
    const ctx = cardCanvas.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cardCanvas.width, cardCanvas.height);

    // Top Header Banner
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cardCanvas.width, 100);

    // Header Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FuelTracks Technologies', cardCanvas.width / 2, 45);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('Govt. Authorized AIS-140 GPS Fitment Payment', cardCanvas.width / 2, 75);

    // Customer & Vehicle Box
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(40, 120, 520, 95, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Customer: ${targetCust}`, 60, 155);

    ctx.fillStyle = '#475569';
    ctx.font = '14px monospace';
    ctx.fillText(`Vehicle: ${targetVeh}   |   IMEI: ${targetImei}`, 60, 185);

    // QR Code Container Box
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.roundRect(140, 235, 320, 320, 16);
    ctx.fill();
    ctx.stroke();

    // Draw QR Code centered (either from uploaded image or canvas)
    const drawAndSave = (imgElement) => {
      ctx.drawImage(imgElement, 160, 255, 280, 280);

      // Amount Display
      ctx.fillStyle = '#047857';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`AMOUNT: ${formatINR(amount)}`, cardCanvas.width / 2, 595);

      // UPI ID text
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`Scan with PhonePe, GPay, Paytm, BHIM to Pay`, cardCanvas.width / 2, 630);
      ctx.fillStyle = '#64748b';
      ctx.font = '13px monospace';
      ctx.fillText(`UPI ID: ${upiId}`, cardCanvas.width / 2, 655);

      // Footer
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.fillText('Support: +91 998800234 | www.fueltracks.in', cardCanvas.width / 2, 715);

      // Trigger download
      const link = document.createElement('a');
      link.download = `FuelTracks_PayQR_${targetVeh.replace(/[^a-zA-Z0-9]/g, '_')}_${targetImei.slice(-4)}.png`;
      link.href = cardCanvas.toDataURL('image/png');
      link.click();
    };

    if (qrMode === 'COMPANY_QR' && companyQrImage) {
      const img = new Image();
      img.onload = () => drawAndSave(img);
      img.src = companyQrImage;
    } else if (canvasRef.current) {
      drawAndSave(canvasRef.current);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleQuickMarkPaid = async () => {
    if (!targetImei) return;
    setMarkingPaid(true);
    try {
      const res = await updateQuickPayment({
        imei_number: targetImei,
        payment_status: 'RECEIVED',
        amount_received: parseFloat(amount) || 0,
        payment_mode: 'UPI / QR Code',
        remarks: `Received via UPI QR (${upiId}) on ${new Date().toLocaleDateString('en-IN')}`
      });
      if (res.success) {
        setPaidSuccess(true);
        if (onPaymentUpdated) onPaymentUpdated(res.data);
      }
    } catch (err) {
      alert('Failed to update payment status: ' + err.message);
    } finally {
      setMarkingPaid(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      
      {/* Print Specific Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-qr-card, #printable-qr-card * {
            visibility: visible;
          }
          #printable-qr-card {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 24px;
            box-shadow: none;
            border: none;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between no-print border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-bold shadow-xs">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Customer Payment QR Code
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Instant UPI
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Send dynamic UPI payment request directly to customer</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsEditingConfig(!isEditingConfig)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs font-medium flex items-center gap-1"
              title="Edit Merchant UPI Settings"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden sm:inline">UPI Config</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hidden Global File Input for Company QR Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
          id="company-qr-upload-input"
        />

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 bg-slate-50/50">

          {/* Optional Config Drawer */}
          {isEditingConfig && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-3 no-print animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Merchant UPI Account Settings
                </span>
                <span className="text-[10px] text-amber-700">Auto-saved for next time</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Company UPI ID (VPA)</label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="e.g. fueltracks@icici / 9876543210@paytm"
                    className="w-full bg-white border border-amber-300 rounded-xl p-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Payee Business Name</label>
                  <input
                    type="text"
                    value={payeeName}
                    onChange={(e) => setPayeeName(e.target.value)}
                    placeholder="e.g. FuelTracks Technologies"
                    className="w-full bg-white border border-amber-300 rounded-xl p-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              {/* Upload Company QR Image Section */}
              <div className="p-3 bg-white border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5 text-amber-600" /> Upload Official Company QR Code Image
                  </span>
                  {companyQrImage && (
                    <button
                      type="button"
                      onClick={handleRemoveCompanyQr}
                      className="text-[10px] text-red-600 font-bold hover:underline cursor-pointer"
                    >
                      Remove Uploaded Image
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {companyQrImage ? (
                    <img
                      src={companyQrImage}
                      alt="Company QR Preview"
                      className="w-14 h-14 rounded-lg border border-slate-200 object-contain bg-white shadow-2xs"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs">
                      No QR
                    </div>
                  )}

                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    >
                      <span>📁</span> {companyQrImage ? 'Replace QR Image' : 'Select Company QR Image'}
                    </button>
                    <p className="text-[10px] text-slate-500">Upload your company PhonePe / GPay / BharatQR image</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Save UPI Config
                </button>
              </div>
            </div>
          )}

          {/* Main Printable Card */}
          <div id="printable-qr-card" className="bg-white border-2 border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
            
            {/* Customer & Vehicle Info Badge */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900 text-white p-4 rounded-2xl">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <User className="w-3.5 h-3.5" /> Customer Name
                </div>
                <div className="text-base font-bold text-white">{targetCust}</div>
                {targetPhone && (
                  <div className="text-xs font-mono text-emerald-400 mt-0.5">📞 {targetPhone}</div>
                )}
              </div>

              <div className="text-left sm:text-right">
                <div className="flex items-center sm:justify-end gap-1.5 text-xs text-slate-400">
                  <Car className="w-3.5 h-3.5" /> Vehicle Number
                </div>
                <div className="text-base font-black font-mono text-amber-400 bg-slate-800 px-2.5 py-0.5 rounded-lg inline-block mt-0.5">
                  {targetVeh}
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">IMEI: {targetImei}</div>
              </div>
            </div>

            {/* QR Mode Selector Tabs */}
            <div className="flex items-center justify-center gap-2 p-1 bg-slate-100 rounded-xl no-print">
              <button
                type="button"
                onClick={() => {
                  setQrMode('COMPANY_QR');
                  localStorage.setItem('fueltracks_qr_mode', 'COMPANY_QR');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  qrMode === 'COMPANY_QR'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🏢 Official Company QR</span>
                {companyQrImage && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setQrMode('DYNAMIC_UPI');
                  localStorage.setItem('fueltracks_qr_mode', 'DYNAMIC_UPI');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  qrMode === 'DYNAMIC_UPI'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>⚡ Dynamic Amount UPI</span>
              </button>
            </div>

            {/* Live Amount Input & Editor */}
            <div className="flex items-center justify-between bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-2xl">
              <div>
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                  Billable Payment Due
                </span>
                <span className="text-xs text-emerald-600">AIS-140 Fitment + 1-Yr Tracking Fee</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-lg font-black text-emerald-950">₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-28 bg-white border-2 border-emerald-500 rounded-xl p-1.5 text-base font-black font-mono text-emerald-900 text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            {/* QR Code Presentation Box */}
            <div className="flex flex-col items-center justify-center p-6 bg-radial from-slate-50 to-slate-100/60 rounded-3xl border border-slate-200 text-center space-y-3">
              
              <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-200/80 inline-block">
                {qrMode === 'COMPANY_QR' && companyQrImage ? (
                  <img
                    src={companyQrImage}
                    alt="Official Company QR Code"
                    className="w-60 h-60 rounded-xl object-contain"
                  />
                ) : qrMode === 'COMPANY_QR' && !companyQrImage ? (
                  <div className="w-60 h-60 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center p-4 space-y-2 bg-slate-50">
                    <QrCode className="w-10 h-10 text-slate-400" />
                    <p className="text-xs font-bold text-slate-700">Company QR Not Uploaded Yet</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Upload Company QR Now</span>
                    </button>
                  </div>
                ) : (
                  <canvas ref={canvasRef} className="rounded-xl" />
                )}
              </div>

              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Verified Merchant: {payeeName}</span>
                </div>
                
                <div className="flex items-center justify-center gap-2 text-xs font-mono text-slate-600 pt-1">
                  <span>UPI ID: <strong>{upiId}</strong></span>
                  <button
                    onClick={handleCopyUpiId}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-900 cursor-pointer"
                    title="Copy UPI ID"
                  >
                    {copiedUpi ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Supported UPI Apps Badges */}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold text-slate-600">
                <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">PhonePe</span>
                <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">Google Pay</span>
                <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 border border-sky-200">Paytm</span>
                <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 border border-orange-200">BHIM</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 border border-slate-300">Any UPI App</span>
              </div>
            </div>

            {/* Note & Branch Information */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
              <span className="flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-slate-400" /> {targetStock}
              </span>
              <span>Ref: {transactionNote}</span>
            </div>

          </div>

          {/* Quick Mark as Paid Banner */}
          {paidSuccess ? (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-bold text-emerald-900 flex items-center justify-between animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Payment recorded as <strong>RECEIVED</strong> in inventory master stock!</span>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-100/80 border border-slate-200 rounded-2xl flex items-center justify-between text-xs no-print">
              <span className="text-slate-600 font-medium">Customer paid right now in cash or UPI?</span>
              <button
                onClick={handleQuickMarkPaid}
                disabled={markingPaid}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                {markingPaid ? <span className="animate-spin">⏳</span> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Mark as Paid in Inventory
              </button>
            </div>
          )}

        </div>

        {/* Modal Bottom Actions Bar */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 no-print">
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Copy UPI Deep Link for Mobile Apps"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Link Copied!' : 'Copy Pay Link'}</span>
            </button>

            <button
              onClick={handleDownloadQr}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download Branded QR Code as PNG Image"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Download Image</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Print Payment Slip with QR Code"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Print Slip</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSendWhatsApp}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send QR via WhatsApp</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
