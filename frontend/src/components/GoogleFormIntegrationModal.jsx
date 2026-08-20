import React, { useState, useEffect } from 'react';
import {
  X, Copy, Check, ExternalLink, Sparkles, CheckCircle2,
  AlertCircle, RefreshCw, Send, FileSpreadsheet, ArrowRight,
  Terminal, ShieldCheck, User, Phone, Truck, Clock, QrCode
} from 'lucide-react';
import {
  fetchIntegrationLogs,
  fetchGoogleScriptCode,
  submitGoogleFormTest,
  syncGoogleSheet
} from '../services/api';

export default function GoogleFormIntegrationModal({ isOpen, onClose, onRefreshInventory }) {
  const [activeTab, setActiveTab] = useState('script'); // 'script' | 'simulator' | 'sheet' | 'logs'
  const [scriptData, setScriptData] = useState({ webhook_url: '', script_code: '' });
  const [logsData, setLogsData] = useState({ stats: { total_received: 0, success_count: 0, error_count: 0 }, logs: [] });
  const [loading, setLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Simulator State
  const [simForm, setSimForm] = useState({
    imei: '',
    vehicle_number: '',
    customer_name: '',
    customer_phone: '',
    technician_name: 'Field Technician',
    stock_place: 'GUNTUR',
    cost: '4200',
    gst: '756',
    total_cost: '4956',
    payment_status: 'RECEIVED',
    installation_date: new Date().toISOString().split('T')[0],
    sim_number: '',
    remarks: 'Installation completed on site'
  });
  const [simSubmitting, setSimSubmitting] = useState(false);
  const [simResult, setSimResult] = useState(null);

  // Sheet Sync State
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [sheetResult, setSheetResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        fetchGoogleScriptCode().catch(() => ({ webhook_url: `${window.location.origin}/api/integrations/google-form`, script_code: '' })),
        fetchIntegrationLogs().catch(() => ({ data: { stats: {}, logs: [] } }))
      ]);

      if (sRes) {
        setScriptData({
          webhook_url: sRes.webhook_url || `${window.location.origin}/api/integrations/google-form`,
          script_code: sRes.script_code || ''
        });
      }
      if (lRes?.data) {
        setLogsData(lRes.data);
      }
    } catch (err) {
      console.error('Failed loading integration data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    }
  };

  const handleSimSubmit = async (e) => {
    e.preventDefault();
    if (!simForm.imei) {
      alert('Please enter an IMEI Number to test.');
      return;
    }
    setSimSubmitting(true);
    setSimResult(null);
    try {
      const payload = {
        'Device IMEI': simForm.imei,
        'Vehicle Number': simForm.vehicle_number,
        'Customer Name': simForm.customer_name,
        'Customer Phone': simForm.customer_phone,
        'Technician Name': simForm.technician_name,
        'Stock Place': simForm.stock_place,
        'Cost': simForm.cost,
        'GST': simForm.gst,
        'Total Cost': simForm.total_cost,
        'Payment Status': simForm.payment_status,
        'Installation Date': simForm.installation_date,
        'SIM Number': simForm.sim_number,
        'Remarks': simForm.remarks
      };
      const res = await submitGoogleFormTest(payload);
      setSimResult({ success: true, data: res });
      if (onRefreshInventory) onRefreshInventory();
      // Reload logs
      fetchIntegrationLogs().then(r => r?.data && setLogsData(r.data)).catch(() => {});
    } catch (err) {
      setSimResult({ success: false, error: err.message });
    } finally {
      setSimSubmitting(false);
    }
  };

  const handleSheetSync = async (e) => {
    e.preventDefault();
    if (!sheetUrl) {
      alert('Please enter a Google Sheet URL.');
      return;
    }
    setSheetSyncing(true);
    setSheetResult(null);
    try {
      const res = await syncGoogleSheet(sheetUrl);
      setSheetResult({ success: true, data: res });
      if (onRefreshInventory) onRefreshInventory();
      // Reload logs
      fetchIntegrationLogs().then(r => r?.data && setLogsData(r.data)).catch(() => {});
    } catch (err) {
      setSheetResult({ success: false, error: err.message });
    } finally {
      setSheetSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 flex items-center justify-between border-b border-slate-800 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 text-lg shadow-inner">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-wide">Google Forms & Sheet Live Integration</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Webhook
                </span>
              </div>
              <p className="text-xs text-slate-400">Technicians & dealers fill Google Forms $\rightarrow$ Instantly updates FuelTracks Inventory</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 bg-slate-50 border-b border-slate-200 shrink-0 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('script')}
            className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'script'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>📋 1-Minute Google Form Setup</span>
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'simulator'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>🧪 Test Live Form Submission</span>
          </button>
          <button
            onClick={() => setActiveTab('sheet')}
            className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sheet'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>📑 Google Sheet 1-Click Sync</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'logs'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>📊 Field Submissions Feed ({logsData.logs?.length || 0})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 bg-slate-50/50 flex-1">

          {/* TAB 1: SCRIPT SETUP */}
          {activeTab === 'script' && (
            <div className="space-y-5">
              
              {/* Webhook URL Card */}
              <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-indigo-600" />
                    Your Server Webhook Endpoint URL
                  </span>
                  <button
                    onClick={() => handleCopy(scriptData.webhook_url, 'url')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      copiedUrl
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                    }`}
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? 'Copied URL' : 'Copy Webhook URL'}</span>
                  </button>
                </div>

                <div className="p-3 bg-slate-900 rounded-xl font-mono text-xs text-emerald-400 break-all select-all flex items-center justify-between">
                  <span>{scriptData.webhook_url}</span>
                </div>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  How to Connect Any Google Form in 3 Quick Steps:
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                      1
                    </div>
                    <p className="text-xs font-bold text-slate-900">Open Google Form Script Editor</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      In your Google Form (or linked Google Sheet), click the <strong>3 vertical dots (top right)</strong> $\rightarrow$ select <strong>Apps Script (Script editor)</strong>.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                      2
                    </div>
                    <p className="text-xs font-bold text-slate-900">Paste Script Code Below</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Delete whatever is in the editor, paste the <strong>FuelTracks Webhook Code</strong> shown below, and click <strong>💾 Save</strong> (Ctrl + S).
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                      3
                    </div>
                    <p className="text-xs font-bold text-slate-900">Add "On Form Submit" Trigger</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Click <strong>⏰ Triggers</strong> on left $\rightarrow$ <strong>+ Add Trigger</strong> $\rightarrow$ Select <code>onFormSubmit</code> $\rightarrow$ Event type: <strong>On form submit</strong> $\rightarrow$ Save!
                    </p>
                  </div>
                </div>
              </div>

              {/* Ready-to-Copy Google Apps Script Box */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-emerald-600" />
                      Google Apps Script Code (Ready to Copy)
                    </span>
                    <p className="text-[11px] text-slate-400">Pre-configured with your FuelTracks live webhook connection</p>
                  </div>

                  <button
                    onClick={() => handleCopy(scriptData.script_code, 'script')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      copiedScript
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
                    }`}
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedScript ? '✅ Script Copied!' : 'Copy Script Code'}</span>
                  </button>
                </div>

                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-72 leading-relaxed">
                  <pre>{scriptData.script_code || '// Loading code...'}</pre>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: LIVE SIMULATOR */}
          {activeTab === 'simulator' && (
            <div className="space-y-5">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🧪 Test Google Form Submission Simulator</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Simulate a technician submitting a form from the field. When you submit, the device will immediately appear in your Inventory table!
                  </p>
                </div>

                {simResult && (
                  <div className={`p-4 rounded-xl text-xs font-medium border flex items-start gap-2.5 ${
                    simResult.success
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                      : 'bg-red-50 text-red-900 border-red-200'
                  }`}>
                    {simResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                    <div className="space-y-1">
                      <p className="font-bold">{simResult.success ? simResult.data.message : 'Error submitting form'}</p>
                      {simResult.error && <p className="text-red-700">{simResult.error}</p>}
                    </div>
                  </div>
                )}

                <form onSubmit={handleSimSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  
                  {/* IMEI */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5 text-blue-600" /> Device IMEI Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 868329083193015"
                      value={simForm.imei}
                      onChange={(e) => setSimForm({ ...simForm, imei: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Vehicle Number */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-amber-600" /> Vehicle Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. AP39YU7779"
                      value={simForm.vehicle_number}
                      onChange={(e) => setSimForm({ ...simForm, vehicle_number: e.target.value.toUpperCase() })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono uppercase focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Customer Name */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-500" /> Customer Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ashok Reddy"
                      value={simForm.customer_name}
                      onChange={(e) => setSimForm({ ...simForm, customer_name: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Customer Phone */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" /> Customer Mobile (10-Digit)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 9848011223"
                      value={simForm.customer_phone}
                      onChange={(e) => setSimForm({ ...simForm, customer_phone: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Technician / Installer */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Technician / Installer Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh (Guntur)"
                      value={simForm.technician_name}
                      onChange={(e) => setSimForm({ ...simForm, technician_name: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Stock Place / Dealer */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Stock Place / Branch</label>
                    <input
                      type="text"
                      placeholder="e.g. GUNTUR or VIZAG"
                      value={simForm.stock_place}
                      onChange={(e) => setSimForm({ ...simForm, stock_place: e.target.value.toUpperCase() })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl uppercase focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Total Cost */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Total Installation Cost (₹)</label>
                    <input
                      type="number"
                      placeholder="4956"
                      value={simForm.total_cost}
                      onChange={(e) => setSimForm({ ...simForm, total_cost: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Payment Status */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Payment Status</label>
                    <select
                      value={simForm.payment_status}
                      onChange={(e) => setSimForm({ ...simForm, payment_status: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="RECEIVED">RECEIVED (Paid)</option>
                      <option value="PENDING">PENDING (Payment Due)</option>
                    </select>
                  </div>

                  {/* Installation Date */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Installation Date</label>
                    <input
                      type="date"
                      value={simForm.installation_date}
                      onChange={(e) => setSimForm({ ...simForm, installation_date: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="sm:col-span-2 lg:col-span-3 pt-2">
                    <button
                      type="submit"
                      disabled={simSubmitting}
                      className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50 transition-all"
                    >
                      {simSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Simulating Google Form Webhook Post...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>🚀 Submit Test Google Form & Reflect in Inventory</span>
                        </>
                      )}
                    </button>
                  </div>

                </form>
              </div>
            </div>
          )}

          {/* TAB 3: SHEET SYNC */}
          {activeTab === 'sheet' && (
            <div className="space-y-5">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    1-Click Google Sheet Pull / Sync
                  </h3>
                  <p className="text-xs text-slate-500">
                    If your Google Form is linked to a Google Sheet, enter the Google Sheet URL here to instantly pull and import all new records into FuelTracks!
                  </p>
                </div>

                {sheetResult && (
                  <div className={`p-4 rounded-xl text-xs font-medium border flex items-start gap-2.5 ${
                    sheetResult.success
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                      : 'bg-red-50 text-red-900 border-red-200'
                  }`}>
                    {sheetResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                    <div className="space-y-1">
                      <p className="font-bold">{sheetResult.success ? sheetResult.data.message : 'Error syncing Google Sheet'}</p>
                      {sheetResult.error && <p className="text-red-700">{sheetResult.error}</p>}
                    </div>
                  </div>
                )}

                <form onSubmit={handleSheetSync} className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Google Sheet URL / Published CSV Link</label>
                    <input
                      type="url"
                      required
                      placeholder="https://docs.google.com/spreadsheets/d/your-sheet-id/edit..."
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-[11px] text-slate-400">
                      Tip: In Google Sheets, make sure sharing is set to <strong>"Anyone with link can view"</strong> or <strong>File $\rightarrow$ Share $\rightarrow$ Publish to Web as CSV</strong>.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={sheetSyncing}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50 transition-all"
                  >
                    {sheetSyncing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Fetching & Synchronizing Google Sheet...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span>🔄 Sync Google Sheet Rows into Inventory Now</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 4: LOGS FEED */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Received</p>
                  <p className="text-xl font-bold text-slate-900 font-mono mt-1">{logsData.stats?.total_received || 0}</p>
                </div>
                <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 text-center">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Successful Syncs</p>
                  <p className="text-xl font-bold text-emerald-800 font-mono mt-1">{logsData.stats?.success_count || 0}</p>
                </div>
                <div className="bg-red-50 p-3.5 rounded-2xl border border-red-200 text-center">
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Failed Submissions</p>
                  <p className="text-xl font-bold text-red-800 font-mono mt-1">{logsData.stats?.error_count || 0}</p>
                </div>
              </div>

              {/* Logs Stream Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Recent Webhook Submissions Log</span>
                  <button
                    onClick={loadInitialData}
                    className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
                    title="Refresh Submissions Stream"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {logsData.logs?.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400 space-y-1">
                    <p>No Google Form submissions received yet.</p>
                    <p className="text-[11px]">Use the <strong>Test Live Form Submission</strong> tab to test!</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Time</th>
                          <th className="p-2.5">IMEI</th>
                          <th className="p-2.5">Vehicle</th>
                          <th className="p-2.5">Customer</th>
                          <th className="p-2.5">Technician</th>
                          <th className="p-2.5">Branch</th>
                          <th className="p-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {logsData.logs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/80">
                            <td className="p-2.5 text-slate-400">{log.created_at?.slice(0, 16).replace('T', ' ')}</td>
                            <td className="p-2.5 font-bold text-slate-900">{log.imei_number || '-'}</td>
                            <td className="p-2.5 text-amber-700 font-bold">{log.vehicle_number || '-'}</td>
                            <td className="p-2.5 font-sans font-medium text-slate-800">{log.customer_name || '-'}</td>
                            <td className="p-2.5 font-sans text-slate-600">{log.technician_name || '-'}</td>
                            <td className="p-2.5 text-slate-700">{log.stock_place || '-'}</td>
                            <td className="p-2.5 font-sans">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                log.status === 'SUCCESS'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            Automatic Deduplication & Customer CRM Linking Active
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl text-xs cursor-pointer shadow-xs"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
