import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  FileSpreadsheet,
  Layers,
  Truck,
  Wrench,
  Boxes,
  Filter,
  RefreshCw,
  Search,
  CheckCircle2,
  Calendar,
  MapPin,
  Car,
  RotateCcw,
  SlidersHorizontal,
  Eye,
  Check,
  Receipt,
  User,
  Phone,
  CreditCard,
  Table,
  Sparkles,
  Building,
  UserCheck,
  CreditCard as PanIcon,
  Shield
} from 'lucide-react';
import {
  fetchReportOptions,
  fetchReportPreview,
  fetchDailyDistributionReport,
  fetchCustomerDirectory,
  getCustomerDirectoryExportUrl,
  fetchPaymentsTelemetry,
  getPaymentsExcelDownloadUrl
} from '../services/api';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('payments_statement'); // 'payments_statement' | 'customer_directory' | 'daily_matrix' | 'custom_builder'
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [dailyMatrixLoading, setDailyMatrixLoading] = useState(false);
  const [dailyMatrix, setDailyMatrix] = useState(null);
  const [dailyMatrixDate, setDailyMatrixDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Customer Directory State
  const [customerDirectory, setCustomerDirectory] = useState([]);
  const [customerDirLoading, setCustomerDirLoading] = useState(false);
  const [customerDirSearch, setCustomerDirSearch] = useState('');

  // Payments Statement State
  const [paymentsRange, setPaymentsRange] = useState('today');
  const [paymentStartDate, setPaymentStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentEndDate, setPaymentEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentsData, setPaymentsData] = useState(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsSearch, setPaymentsSearch] = useState('');


  const [options, setOptions] = useState({
    batches: [],
    deviceTypes: [],
    stockPlaces: [],
    batchPlacesMap: {},
    stats: { totalDevices: 0, installedDevices: 0, uninstalledDevices: 0 }
  });

  // Filter States
  const [filters, setFilters] = useState({
    purchase_batch_id: '',
    stock_place: '',
    installed_filter: 'installed', // 'all' | 'installed' | 'uninstalled'
    status: '',
    device_type_id: '',
    month: '',
    payment_status: '',
    start_date: '',
    end_date: '',
    search: '',
    report_layout: 'manager' // 'manager' | 'raw'
  });

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState({ totalCount: 0, preview: [] });
  const [downloading, setDownloading] = useState(null);

  // Load options, daily matrix, customer directory & payments statement on mount
  useEffect(() => {
    loadOptions();
    loadDailyMatrix();
    loadCustomerDirectory();
    loadPaymentsStatement();
  }, []);

  const loadPaymentsStatement = async () => {
    setPaymentsLoading(true);
    try {
      const res = await fetchPaymentsTelemetry({
        range: paymentsRange,
        start_date: paymentStartDate,
        end_date: paymentEndDate
      });
      if (res.success) {
        setPaymentsData(res.data);
      }
    } catch (err) {
      console.error('Failed to load payments statement:', err);
    } finally {
      setPaymentsLoading(false);
    }
  };

  useEffect(() => {
    loadPaymentsStatement();
  }, [paymentsRange, paymentStartDate, paymentEndDate]);

  useEffect(() => {
    if (activeTab === 'customer_directory') {
      loadCustomerDirectory();
    }
  }, [activeTab]);

  const loadCustomerDirectory = async () => {

    setCustomerDirLoading(true);
    try {
      const res = await fetchCustomerDirectory();
      if (res.success) {
        setCustomerDirectory(res.data || []);
      }
    } catch (err) {
      console.error('Failed to load customer directory:', err);
    } finally {
      setCustomerDirLoading(false);
    }
  };

  const handleExportCustomerDirectory = () => {
    setDownloading('customer_directory');
    window.location.href = getCustomerDirectoryExportUrl();
    setTimeout(() => setDownloading(null), 3000);
  };

  // Update preview whenever filters change
  useEffect(() => {
    updatePreview();
  }, [filters]);

  const loadDailyMatrix = async (dateParam = dailyMatrixDate) => {
    setDailyMatrixLoading(true);
    try {
      const res = await fetchDailyDistributionReport(dateParam);
      if (res.success) {
        setDailyMatrix(res.data);
      }
    } catch (err) {
      console.error('Failed to load daily matrix:', err);
    } finally {
      setDailyMatrixLoading(false);
    }
  };

  const handleExportDailyMatrix = () => {
    setDownloading('daily_matrix');
    const query = dailyMatrixDate ? `?date=${encodeURIComponent(dailyMatrixDate)}` : '';
    window.location.href = `/api/reports/export-daily-distribution${query}`;
    setTimeout(() => setDownloading(null), 2500);
  };

  const loadOptions = async () => {
    setLoadingOptions(true);
    try {
      const res = await fetchReportOptions();
      if (res.success) {
        setOptions(res.data);
      }
    } catch (err) {
      console.error('Failed to load report options:', err);
    } finally {
      setLoadingOptions(false);
    }
  };

  const updatePreview = async () => {
    setPreviewLoading(true);
    try {
      const activeParams = {};
      Object.keys(filters).forEach(k => {
        if (filters[k]) activeParams[k] = filters[k];
      });
      const res = await fetchReportPreview(activeParams);
      if (res.success) {
        setPreviewData({
          totalCount: res.totalCount,
          preview: res.preview || []
        });
      }
    } catch (err) {
      console.error('Failed to preview report:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Filter available stock places dynamically based on selected list
  const availableStockPlaces = useMemo(() => {
    if (!filters.purchase_batch_id || !options.batchPlacesMap) {
      return options.stockPlaces || [];
    }
    const bId = filters.purchase_batch_id.toString();
    const batchPlaces = options.batchPlacesMap[bId] || {};
    return Object.keys(batchPlaces).map(name => ({
      name,
      count: batchPlaces[name]
    })).sort((a, b) => b.count - a.count);
  }, [filters.purchase_batch_id, options]);

  const handleResetFilters = () => {
    setFilters({
      purchase_batch_id: '',
      stock_place: '',
      installed_filter: 'installed',
      status: '',
      device_type_id: '',
      month: '',
      payment_status: '',
      start_date: '',
      end_date: '',
      search: '',
      report_layout: 'manager'
    });
  };

  const handleCustomExport = (format = 'xlsx') => {
    setDownloading(`custom_${format}`);
    const queryParams = new URLSearchParams();
    queryParams.set('type', 'custom');
    queryParams.set('format', format);

    Object.keys(filters).forEach(k => {
      if (filters[k]) queryParams.set(k, filters[k]);
    });

    window.location.href = `/api/reports/export?${queryParams.toString()}`;
    setTimeout(() => setDownloading(null), 2500);
  };

  const handlePresetExport = (type, format = 'xlsx') => {
    setDownloading(`${type}_${format}`);
    window.location.href = `/api/reports/export?type=${type}&format=${format}`;
    setTimeout(() => setDownloading(null), 2500);
  };

  const PRESET_REPORTS = [
    {
      id: 'manager_statement',
      title: 'Manager Statement & Billing Register',
      description: 'Vehicle Numbers, Customer Names, Phone Numbers, SIM Numbers, IMEI Numbers, Total Cost, and Amount Received Status.',
      icon: Receipt,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
      badge: 'Manager Requested Format',
      badgeColor: 'bg-indigo-100 text-indigo-800'
    },
    {
      id: 'installed',
      title: 'Installed Devices Master Register',
      description: 'Export all installed devices in exact uploaded column order with vehicle and customer details.',
      icon: Car,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      badge: `${options.stats.installedDevices} Installed Units`,
      badgeColor: 'bg-emerald-100 text-emerald-800'
    },
    {
      id: 'uninstalled',
      title: 'In-Stock Devices Master Register',
      description: 'Export all available in-stock / uninstalled units in exact uploaded device column order.',
      icon: Boxes,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      badge: `${options.stats.uninstalledDevices} In-Stock Units`,
      badgeColor: 'bg-blue-100 text-blue-800'
    },
    {
      id: 'purchases',
      title: 'Upload Lists & Batches Summary',
      description: 'Audit log of all uploaded spreadsheet files and imported device counts.',
      icon: FileSpreadsheet,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      badge: `${options.batches.length} Upload Lists`,
      badgeColor: 'bg-purple-100 text-purple-800'
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* Top Banner & Summary Pills */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-950 p-6 rounded-2xl text-white shadow-md">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2.5">
            <Receipt className="w-6 h-6 text-indigo-400" /> Executive Reports & Excel Export Hub
          </h2>
          <p className="text-xs text-indigo-200 mt-1">
            Auto-generated Daily Master Stock Distribution Matrix and customizable Manager Executive Statements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <div className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white flex items-center gap-2">
            <span className="text-slate-300">Total Master Stock:</span>
            <span className="font-mono font-bold text-white">{options.stats.totalDevices}</span>
          </div>

          <div className="bg-emerald-500/20 border border-emerald-400/30 rounded-xl px-3 py-1.5 text-xs text-emerald-200 flex items-center gap-2">
            <Car className="w-3.5 h-3.5 text-emerald-400" />
            <span>Installed:</span>
            <span className="font-mono font-bold text-emerald-300">{options.stats.installedDevices}</span>
          </div>

          <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl px-3 py-1.5 text-xs text-blue-200 flex items-center gap-2">
            <Boxes className="w-3.5 h-3.5 text-blue-400" />
            <span>In Stock:</span>
            <span className="font-mono font-bold text-blue-300">{options.stats.uninstalledDevices}</span>
          </div>
        </div>
      </div>

      {/* Main Mode Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('payments_statement')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${
            activeTab === 'payments_statement'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Daily & Custom Range Payments Statement</span>
          {paymentsData?.kpis && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-bold">
              Today: ₹{(paymentsData.kpis.today_collected_amount || 0).toLocaleString('en-IN')}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('customer_directory')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${
            activeTab === 'customer_directory'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Customer & Vehicle Directory (KYC Master)</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-bold">
            {customerDirectory.length} Records
          </span>
        </button>

        <button
          onClick={() => setActiveTab('daily_matrix')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${
            activeTab === 'daily_matrix'
              ? 'bg-blue-700 text-white border-blue-700 shadow-2xs'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Table className="w-4 h-4" />
          <span>Daily Master Stock Distribution Matrix</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-normal">
            Auto-Prepared
          </span>
        </button>

        <button
          onClick={() => setActiveTab('custom_builder')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${
            activeTab === 'custom_builder'
              ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Tailored Report & Billing Register Export</span>
        </button>
      </div>

      {/* TAB: Daily & Custom Range Payments Statement */}
      {activeTab === 'payments_statement' && (
        <div className="glass-panel p-6 rounded-2xl space-y-6 border border-slate-200 shadow-sm animate-fadeIn">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-600" /> Daily Payments & Revenue Statement
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {paymentsRange.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Filter collections received today, yesterday, this month, or select any custom date range. Generates formal spreadsheet statement.
              </p>
            </div>

            {/* Range Pills & Download Excel Button */}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={getPaymentsExcelDownloadUrl({
                  range: paymentsRange,
                  start_date: paymentStartDate,
                  end_date: paymentEndDate
                })}
                download
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Export Statement (.xlsx)</span>
              </a>

              <button
                onClick={loadPaymentsStatement}
                disabled={paymentsLoading}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer text-xs font-semibold flex items-center gap-1.5 border border-slate-200"
                title="Refresh statement"
              >
                <RefreshCw className={`w-4 h-4 ${paymentsLoading ? 'animate-spin text-emerald-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Range Controls */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Calendar className="w-4 h-4 text-slate-500" />
                <span>Select Payment Date Range:</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'this_week', label: 'Last 7 Days' },
                  { id: 'this_month', label: 'This Month' },
                  { id: 'all', label: 'All Time' },
                  { id: 'custom', label: 'Custom Range 📅' }
                ].map((tab) => {
                  const active = paymentsRange === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPaymentsRange(tab.id)}
                      className={`py-1.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {paymentsRange === 'custom' && (
              <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-200/60 animate-fadeIn">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">From Date:</span>
                  <input
                    type="date"
                    value={paymentStartDate}
                    onChange={(e) => setPaymentStartDate(e.target.value)}
                    className="text-xs font-mono p-1.5 bg-white border border-slate-200 rounded-xl focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">To Date:</span>
                  <input
                    type="date"
                    value={paymentEndDate}
                    onChange={(e) => setPaymentEndDate(e.target.value)}
                    className="text-xs font-mono p-1.5 bg-white border border-slate-200 rounded-xl focus:border-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 4 Clean Payment Metrics KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Today's Collection */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-950 shadow-2xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Today's Collections</div>
              <div className="text-2xl font-black font-mono text-emerald-800 mt-1">
                ₹{(paymentsData?.kpis?.today_collected_amount || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-emerald-600 mt-1">
                {paymentsData?.kpis?.today_collected_count || 0} units paid today
              </div>
            </div>

            {/* KPI 2: Period Total Collection */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-blue-950 shadow-2xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Period Revenue Collected</div>
              <div className="text-2xl font-black font-mono text-blue-800 mt-1">
                ₹{(paymentsData?.kpis?.period_collected_amount || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-blue-600 mt-1">
                {paymentsData?.kpis?.period_collected_count || 0} units paid in period
              </div>
            </div>

            {/* KPI 3: Average Collection per Unit */}
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-950 shadow-2xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Avg Collection / Unit</div>
              <div className="text-2xl font-black font-mono text-indigo-800 mt-1">
                ₹{(paymentsData?.kpis?.avg_amount_per_unit || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-indigo-600 mt-1">
                per paid device in period
              </div>
            </div>

            {/* KPI 4: Active Paying Dealers / Stock Centers */}
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl text-purple-950 shadow-2xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Active Stock Locations</div>
              <div className="text-2xl font-black font-mono text-purple-800 mt-1">
                {paymentsData?.kpis?.active_dealers_count || 0} Centers
              </div>
              <div className="text-[11px] text-purple-600 mt-1">
                with recorded collections
              </div>
            </div>
          </div>

          {/* Search Bar & Payments Received Ledger Table */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Table className="w-4 h-4 text-emerald-600" />
                <span>Payments Received Ledger ({paymentsData?.transactions?.length || 0} Paid Records)</span>
              </h4>

              <div className="relative max-w-sm w-full">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by IMEI, Customer, Vehicle, Dealer..."
                  value={paymentsSearch}
                  onChange={(e) => setPaymentsSearch(e.target.value)}
                  className="w-full pl-8.5 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto max-h-[460px] rounded-xl border border-slate-200">
              {(() => {
                const allTx = paymentsData?.transactions || [];
                const q = paymentsSearch.trim().toLowerCase();
                const filteredTx = q
                  ? allTx.filter(t =>
                      (t.imei_number || '').toLowerCase().includes(q) ||
                      (t.vehicle_number || '').toLowerCase().includes(q) ||
                      (t.customer_name || '').toLowerCase().includes(q) ||
                      (t.customer_phone || '').toLowerCase().includes(q) ||
                      (t.stock_place || '').toLowerCase().includes(q) ||
                      (t.payment_received_by || '').toLowerCase().includes(q)
                    )
                  : allTx;

                if (filteredTx.length === 0) {
                  return (
                    <div className="text-center py-12 text-xs text-slate-400 bg-slate-50">
                      No payments received found for {paymentsRange.replace('_', ' ')}.
                    </div>
                  );
                }

                return (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 text-white text-[11px] uppercase tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="py-3 px-3.5">#</th>
                        <th className="py-3 px-3.5">Payment Date</th>
                        <th className="py-3 px-3.5">IMEI Number</th>
                        <th className="py-3 px-3.5">Model</th>
                        <th className="py-3 px-3.5">Vehicle Number</th>
                        <th className="py-3 px-3.5">Customer Name & Phone</th>
                        <th className="py-3 px-3.5">Dealer / Stock Place</th>
                        <th className="py-3 px-3.5 text-right">Amount (₹)</th>
                        <th className="py-3 px-3.5 text-center">Status</th>
                        <th className="py-3 px-3.5">Received By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredTx.map((tx, idx) => (
                        <tr key={tx.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3.5 font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                          <td className="py-2.5 px-3.5 font-mono font-medium text-slate-700">{tx.payment_date}</td>
                          <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">{tx.imei_number}</td>
                          <td className="py-2.5 px-3.5 text-slate-600">{tx.device_type_name}</td>
                          <td className="py-2.5 px-3.5 font-mono font-bold text-indigo-700">{tx.vehicle_number}</td>
                          <td className="py-2.5 px-3.5">
                            <div className="font-semibold text-slate-800">{tx.customer_name}</div>
                            {tx.customer_phone && tx.customer_phone !== '—' && (
                              <div className="text-[10px] text-slate-500 font-mono">{tx.customer_phone}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-700">{tx.stock_place}</td>
                          <td className="py-2.5 px-3.5 text-right font-mono font-bold text-emerald-800">
                            {tx.amount_formatted}
                          </td>
                          <td className="py-2.5 px-3.5 text-center">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                              <span>✓</span>
                              <span>{tx.payment_status}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600 text-[11px]">{tx.payment_received_by}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>

        </div>
      )}

      {/* TAB 0: Customer & Vehicle KYC Directory Master */}
      {activeTab === 'customer_directory' && (

        <div className="glass-panel p-6 rounded-2xl space-y-5 border border-slate-200 shadow-sm animate-fadeIn">
          {/* Header & Excel Download Action */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-indigo-600" /> Customer Master & Vehicle Directory (KYC & RTO Details)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                  {customerDirectory.length} Total Customers
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Complete directory containing Customer Name, Phone, Aadhaar, PAN, Vehicle Number, RTO Location, Chassis, Engine, Email, IMEI, and Installation Date.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                onClick={loadCustomerDirectory}
                disabled={customerDirLoading}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer text-xs font-semibold flex items-center gap-1.5 border border-slate-200"
                title="Refresh customer records"
              >
                <RefreshCw className={`w-4 h-4 ${customerDirLoading ? 'animate-spin text-indigo-600' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                onClick={handleExportCustomerDirectory}
                disabled={downloading === 'customer_directory' || customerDirectory.length === 0}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                title="Download Customer Details with Aadhaar, PAN, Vehicle, RTO Location, Chassis, Engine in Excel Sheet (.xlsx)"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>
                  {downloading === 'customer_directory' ? 'Generating Excel...' : '📥 Download Customer Excel Sheet (.xlsx)'}
                </span>
              </button>
            </div>
          </div>

          {/* Live Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Customer Name, Phone, Vehicle, RTO Location, Aadhaar, PAN, Chassis..."
                value={customerDirSearch}
                onChange={(e) => setCustomerDirSearch(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <strong>{
                customerDirectory.filter(r => {
                  if (!customerDirSearch.trim()) return true;
                  const q = customerDirSearch.toLowerCase().trim();
                  return (
                    String(r.customer_name || '').toLowerCase().includes(q) ||
                    String(r.phone_number || '').toLowerCase().includes(q) ||
                    String(r.vehicle_number || '').toLowerCase().includes(q) ||
                    String(r.rto_location || '').toLowerCase().includes(q) ||
                    String(r.aadhar_number || '').toLowerCase().includes(q) ||
                    String(r.pan_number || '').toLowerCase().includes(q) ||
                    String(r.chasis_number || '').toLowerCase().includes(q) ||
                    String(r.engine_number || '').toLowerCase().includes(q) ||
                    String(r.email || '').toLowerCase().includes(q) ||
                    String(r.imei_number || '').toLowerCase().includes(q)
                  );
                }).length
              }</strong> of {customerDirectory.length} records
            </div>
          </div>

          {/* Table Container */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto max-h-[560px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white uppercase text-[10px] tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="p-3 border-r border-slate-800">#</th>
                    <th className="p-3 border-r border-slate-800 font-bold">Customer Name</th>
                    <th className="p-3 border-r border-slate-800">Phone Number</th>
                    <th className="p-3 border-r border-slate-800">Aadhaar Number</th>
                    <th className="p-3 border-r border-slate-800">PAN Number</th>
                    <th className="p-3 border-r border-slate-800 font-bold text-amber-300">Vehicle Number</th>
                    <th className="p-3 border-r border-slate-800 font-bold text-blue-300">RTO Location</th>
                    <th className="p-3 border-r border-slate-800">Chassis Number</th>
                    <th className="p-3 border-r border-slate-800">Engine Number</th>
                    <th className="p-3 border-r border-slate-800">Email Address</th>
                    <th className="p-3 border-r border-slate-800 font-mono">IMEI Number</th>
                    <th className="p-3 border-r border-slate-800">Device Model</th>
                    <th className="p-3">Installation Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {customerDirLoading ? (
                    <tr>
                      <td colSpan={13} className="p-8 text-center text-slate-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
                        <span>Loading customer directory records...</span>
                      </td>
                    </tr>
                  ) : customerDirectory.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="p-8 text-center text-slate-400">
                        No customer vehicle installation records found in directory yet.
                      </td>
                    </tr>
                  ) : (
                    customerDirectory
                      .filter(r => {
                        if (!customerDirSearch.trim()) return true;
                        const q = customerDirSearch.toLowerCase().trim();
                        return (
                          String(r.customer_name || '').toLowerCase().includes(q) ||
                          String(r.phone_number || '').toLowerCase().includes(q) ||
                          String(r.vehicle_number || '').toLowerCase().includes(q) ||
                          String(r.rto_location || '').toLowerCase().includes(q) ||
                          String(r.aadhar_number || '').toLowerCase().includes(q) ||
                          String(r.pan_number || '').toLowerCase().includes(q) ||
                          String(r.chasis_number || '').toLowerCase().includes(q) ||
                          String(r.engine_number || '').toLowerCase().includes(q) ||
                          String(r.email || '').toLowerCase().includes(q) ||
                          String(r.imei_number || '').toLowerCase().includes(q)
                        );
                      })
                      .map((rec, idx) => (
                        <tr key={idx} className="hover:bg-indigo-50/40 transition-colors">
                          <td className="p-3 text-slate-400 text-[11px] font-mono border-r border-slate-100">{idx + 1}</td>
                          <td className="p-3 font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap">
                            {rec.customer_name}
                          </td>
                          <td className="p-3 font-mono font-medium text-emerald-700 border-r border-slate-100 whitespace-nowrap">
                            {rec.phone_number ? `📞 ${rec.phone_number}` : '-'}
                          </td>
                          <td className="p-3 font-mono text-slate-700 border-r border-slate-100 whitespace-nowrap">
                            {rec.aadhar_number || '-'}
                          </td>
                          <td className="p-3 font-mono uppercase text-slate-700 border-r border-slate-100 whitespace-nowrap">
                            {rec.pan_number || '-'}
                          </td>
                          <td className="p-3 font-mono font-black text-amber-900 bg-amber-50/60 border-r border-slate-100 whitespace-nowrap">
                            {rec.vehicle_number || '-'}
                          </td>
                          <td className="p-3 font-medium text-blue-900 bg-blue-50/40 border-r border-slate-100 whitespace-nowrap">
                            {rec.rto_location && rec.rto_location !== '-' ? (
                              <span className="px-2 py-0.5 rounded-md bg-blue-100/80 text-blue-800 font-semibold text-[11px]">
                                {rec.rto_location}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-3 font-mono text-slate-800 border-r border-slate-100 whitespace-nowrap">
                            {rec.chasis_number || '-'}
                          </td>
                          <td className="p-3 font-mono text-slate-800 border-r border-slate-100 whitespace-nowrap">
                            {rec.engine_number || '-'}
                          </td>
                          <td className="p-3 text-slate-600 border-r border-slate-100 whitespace-nowrap">
                            {rec.email || '-'}
                          </td>
                          <td className="p-3 font-mono text-slate-600 border-r border-slate-100 whitespace-nowrap">
                            {rec.imei_number}
                          </td>
                          <td className="p-3 text-slate-600 border-r border-slate-100 whitespace-nowrap">
                            {rec.device_model}
                          </td>
                          <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                            {rec.installation_date || '-'}
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


      {/* TAB 1: Auto-Prepared Daily Master Stock Distribution Matrix */}
      {activeTab === 'daily_matrix' && (
        <div className="glass-panel p-6 rounded-2xl space-y-5 border border-slate-200 shadow-sm animate-fadeIn">
          
          {/* Header & 1-Click Super Admin Export Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Table className="w-5 h-5 text-blue-700" /> Daily Master Stock Distribution Matrix
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                  {dailyMatrix?.generatedAt || 'Today'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Auto-prepared daily distribution matrix across all stock locations and certificate issuance dates.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Date Filter Picker */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <Calendar className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
                <input
                  type="date"
                  value={dailyMatrixDate}
                  onChange={(e) => {
                    setDailyMatrixDate(e.target.value);
                    loadDailyMatrix(e.target.value);
                  }}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                  title="Filter Certificate Issued Date"
                />
              </div>

              <button
                onClick={() => loadDailyMatrix(dailyMatrixDate)}
                disabled={dailyMatrixLoading}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                title="Refresh Matrix"
              >
                <RefreshCw className={`w-4 h-4 ${dailyMatrixLoading ? 'animate-spin text-blue-600' : ''}`} />
              </button>

              <button
                onClick={handleExportDailyMatrix}
                disabled={downloading === 'daily_matrix' || !dailyMatrix}
                className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{downloading === 'daily_matrix' ? 'Generating Excel...' : 'Download Daily Report Excel (.xlsx)'}</span>
              </button>
            </div>
          </div>

          {/* Matrix Table Display with Blue Header and Orange Footer */}
          {dailyMatrixLoading || !dailyMatrix ? (
            <div className="flex items-center justify-center py-16 text-xs text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
              Computing dynamic stock distribution matrix...
            </div>
          ) : (
            <div className="space-y-4">
              
              <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-2xs">
                <table className="w-full text-center border-collapse text-xs">
                  
                  {/* Steel Blue Header Row (#366092) */}
                  <thead>
                    <tr className="bg-[#366092] text-white font-bold text-[11px] uppercase tracking-wider">
                      <th className="p-3 text-left border-r border-[#2a4d77] whitespace-nowrap sticky left-0 bg-[#366092] z-10">
                        DEVICE
                      </th>
                      {dailyMatrix.locations.map(loc => (
                        <th key={loc} className="p-3 border-r border-[#2a4d77] whitespace-nowrap min-w-[90px]">
                          {loc}
                        </th>
                      ))}
                      <th className="p-3 border-r border-[#1e543e] whitespace-nowrap min-w-[170px] bg-[#0D5C3A] text-emerald-100">
                        CERTIFICATES ISSUED TODAY
                      </th>
                      <th className="p-3 border-r border-[#2a4d77] whitespace-nowrap min-w-[100px]">
                        INSTALLED
                      </th>
                      <th className="p-3 border-r border-[#2a4d77] whitespace-nowrap min-w-[80px]">
                        TOTAL
                      </th>
                      <th className="p-3 whitespace-nowrap min-w-[90px]">
                        PURCHASED
                      </th>
                    </tr>
                  </thead>

                  {/* Device Data Rows */}
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {dailyMatrix.rows.map(r => (
                      <tr key={r.device_name} className="hover:bg-blue-50/30 transition-colors font-medium">
                        <td className="p-3 text-left font-bold text-slate-900 border-r border-slate-200 sticky left-0 bg-white z-10 whitespace-nowrap">
                          {r.device_name}
                        </td>
                        {dailyMatrix.locations.map(loc => (
                          <td key={loc} className="p-3 font-mono text-slate-800 border-r border-slate-200">
                            {r.locations[loc] ? (
                              <span className="font-bold text-slate-900">{r.locations[loc]}</span>
                            ) : (
                              <span className="text-slate-300"></span>
                            )}
                          </td>
                        ))}
                        <td className="p-3 font-mono font-bold text-emerald-900 bg-emerald-100/70 border-r border-slate-200">
                          {r.certificates_issued_today || 0}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-900 border-r border-slate-200">
                          {r.total_installed || 0}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-900 border-r border-slate-200">
                          {r.in_stock_total || 0}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-900">
                          {r.purchased_total || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Vibrant Orange Summary Footer Row (#ED7D31) */}
                  <tfoot>
                    <tr className="bg-[#ED7D31] text-white font-bold text-[11px] shadow-sm">
                      <td className="p-3 text-left border-r border-[#f4b183]/60 sticky left-0 bg-[#ED7D31] z-10 uppercase tracking-wider">
                        TOTAL
                      </td>
                      {dailyMatrix.locations.map(loc => (
                        <td key={loc} className="p-3 border-r border-[#f4b183]/60 font-mono whitespace-nowrap">
                          TOTAL = {dailyMatrix.columnTotals.locations[loc] || 0}
                        </td>
                      ))}
                      <td className="p-3 border-r border-[#f4b183]/60 font-mono whitespace-nowrap bg-[#c65911]">
                        TOTAL = {dailyMatrix.columnTotals.certificates_issued_today || 0}
                      </td>
                      <td className="p-3 border-r border-[#f4b183]/60 font-mono whitespace-nowrap">
                        TOTAL = {dailyMatrix.columnTotals.total_installed || 0}
                      </td>
                      <td className="p-3 border-r border-[#f4b183]/60 font-mono whitespace-nowrap">
                        TOTAL = {dailyMatrix.columnTotals.in_stock_total || 0}
                      </td>
                      <td className="p-3 font-mono whitespace-nowrap">
                        TOTAL = {dailyMatrix.columnTotals.purchased_total || 0}
                      </td>
                    </tr>
                  </tfoot>

                </table>
              </div>

              {/* Certificates Issued Today Itemized Details Table */}
              <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden shadow-2xs">
                <div className="p-4 bg-emerald-50/80 border-b border-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                        Itemized Certificates Issued Today
                      </h4>
                      <p className="text-[11px] text-emerald-800">
                        Vehicles and devices with Certificate Issued Date matching {dailyMatrix.targetDate || 'Today'}
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold font-mono bg-emerald-700 text-white shadow-2xs">
                    {dailyMatrix.todayIssuedCount || 0} Issued Today
                  </span>
                </div>

                {(!dailyMatrix.todayIssuedDevices || dailyMatrix.todayIssuedDevices.length === 0) ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No vehicle fitments or certificates recorded with issue date matching today ({dailyMatrix.targetDate}).
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="p-3 font-bold text-center">#</th>
                          <th className="p-3 font-bold">Issue Date</th>
                          <th className="p-3 font-bold">IMEI Number</th>
                          <th className="p-3 font-bold">Device Model</th>
                          <th className="p-3 font-bold">Vehicle Number</th>
                          <th className="p-3 font-bold">Customer Name</th>
                          <th className="p-3 font-bold">Contact Phone</th>
                          <th className="p-3 font-bold">Chassis Number</th>
                          <th className="p-3 font-bold">Engine Number</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dailyMatrix.todayIssuedDevices.map((item, idx) => (
                          <tr key={item.id || idx} className="hover:bg-emerald-50/40 transition-colors">
                            <td className="p-3 text-center font-mono text-slate-400">{idx + 1}</td>
                            <td className="p-3 font-mono font-bold text-emerald-800">{item.certificate_issued_date}</td>
                            <td className="p-3 font-mono font-bold text-blue-700">{item.imei_number}</td>
                            <td className="p-3 text-slate-800 font-semibold">{item.device_name}</td>
                            <td className="p-3 font-mono font-bold text-slate-900">{item.vehicle_number}</td>
                            <td className="p-3 text-slate-900 font-medium">{item.customer_name}</td>
                            <td className="p-3 font-mono font-medium text-emerald-800">
                              {item.customer_phone && item.customer_phone !== '-' ? item.customer_phone : '-'}
                            </td>
                            <td className="p-3 font-mono text-slate-600">{item.chasis_number}</td>
                            <td className="p-3 font-mono text-slate-600">{item.engine_number}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Dynamic Columns Info Note */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-950 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>100% Dynamic Locations:</strong> As new branches, stock places, or dealer transfers are saved, columns expand and calculate totals automatically.
                  </span>
                </div>
                <span className="text-[11px] font-bold text-blue-800 bg-white px-2.5 py-0.5 rounded-lg border border-blue-200 shadow-2xs">
                  {dailyMatrix.locations.length} Locations Detected
                </span>
              </div>

            </div>
          )}

        </div>
      )}

      {/* TAB 2: Interactive Custom Report Builder Panel */}
      {activeTab === 'custom_builder' && (
      <div className="glass-panel p-6 rounded-2xl space-y-6 border border-slate-200 shadow-sm animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-indigo-600" /> Tailored Report & Export Builder
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select output format, list name, stock place, and installation status to export matching records.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Format Layout Toggle */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setFilters({ ...filters, report_layout: 'manager' })}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  filters.report_layout === 'manager'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Manager Format
              </button>
              <button
                type="button"
                onClick={() => setFilters({ ...filters, report_layout: 'raw' })}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  filters.report_layout === 'raw'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Original List Columns
              </button>
            </div>

            <button
              onClick={handleResetFilters}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Format Explanation Banner */}
        {filters.report_layout === 'manager' && (
          <div className="bg-indigo-50/80 border border-indigo-200 p-3.5 rounded-xl text-xs text-indigo-900 flex items-start gap-2.5">
            <Receipt className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold">Manager Statement Columns Exported:</strong>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {['Device Name', 'Vehicle Number', 'Customer Name', 'Phone Number', 'SIM Numbers', 'IMEI Number', 'Total Cost', 'Amount Received Status', 'Stock Place', 'Date'].map(col => (
                  <span key={col} className="bg-white border border-indigo-200 px-2 py-0.5 rounded text-[11px] font-semibold text-indigo-800 shadow-2xs">
                    {col}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          
          {/* 1. Upload List Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" /> 1. Select List Name
            </label>
            <select
              value={filters.purchase_batch_id}
              onChange={(e) => {
                setFilters({ ...filters, purchase_batch_id: e.target.value, stock_place: '' });
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white"
            >
              <option value="">All Upload Lists</option>
              {options.batches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.notes ? `${b.notes} (${b.source_file})` : b.source_file}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Installation / Vehicle Status Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5 text-emerald-600" /> 2. Installation Status
            </label>
            <select
              value={filters.installed_filter}
              onChange={(e) => setFilters({ ...filters, installed_filter: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white"
            >
              <option value="installed">Installed Devices Only (Vehicle Number Present)</option>
              <option value="all">All Devices (Installed & In-Stock)</option>
              <option value="uninstalled">In-Stock / Uninstalled Only (No Vehicle Number)</option>
            </select>
          </div>

          {/* 3. Stock Place / Location */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-indigo-600" /> 3. Stock Place / Location
            </label>
            <select
              value={filters.stock_place}
              onChange={(e) => setFilters({ ...filters, stock_place: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white"
            >
              <option value="">All Stock Places</option>
              {availableStockPlaces.map(p => (
                <option key={p.name} value={p.name}>
                  {p.name} ({p.count})
                </option>
              ))}
            </select>
          </div>

          {/* 4. Device Type */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-amber-600" /> Device Type
            </label>
            <select
              value={filters.device_type_id}
              onChange={(e) => setFilters({ ...filters, device_type_id: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-indigo-500 focus:bg-white"
            >
              <option value="">All Device Types</option>
              {options.deviceTypes.map(dt => (
                <option key={dt.id} value={dt.id}>
                  {dt.name} ({dt.device_count})
                </option>
              ))}
            </select>
          </div>

          {/* 5. Month Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" /> Month (August, July, etc.)
            </label>
            <select
              value={filters.month}
              onChange={(e) => setFilters({ ...filters, month: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white"
            >
              <option value="">All Months</option>
              {(options.allMonths || ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']).map(m => {
                const optMonth = options.availableMonths?.find(am => am.month === m);
                return (
                  <option key={m} value={m}>
                    {m} {optMonth ? `(${optMonth.total} records • ${optMonth.received} paid)` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* 6. Payment Status Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Payment Status
            </label>
            <select
              value={filters.payment_status}
              onChange={(e) => setFilters({ ...filters, payment_status: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white"
            >
              <option value="">All Payments</option>
              <option value="RECEIVED">✅ Payments Received Only (Paid)</option>
              <option value="PENDING">⏳ Payment Pending Only</option>
            </select>
          </div>

          {/* 7. Date From */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" /> From Date
            </label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          {/* 8. Date To */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" /> To Date
            </label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

        </div>

        {/* Live Matching Summary & Action Buttons */}
        <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-slate-50 border border-indigo-200 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-xs">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {previewLoading ? 'Filtering records...' : `${previewData.totalCount} Matching Records`}
                </span>
                <span className="text-[11px] font-semibold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md">
                  {filters.report_layout === 'manager' ? 'Manager Statement' : 'Clean List Export'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {filters.report_layout === 'manager'
                  ? 'Includes Device Name, Vehicle Number, Customer Name, Phone, SIMs, IMEI, Total Cost, and Payment Status'
                  : 'Exports only the exact columns belonging to the selected list'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleCustomExport('xlsx')}
              disabled={downloading === 'custom_xlsx' || previewData.totalCount === 0}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              {downloading === 'custom_xlsx' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              Download Excel (.xlsx)
            </button>

            <button
              onClick={() => handleCustomExport('csv')}
              disabled={downloading === 'custom_csv' || previewData.totalCount === 0}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              CSV
            </button>
          </div>
        </div>

        {/* Live Preview Sample */}
        {previewData.preview.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-slate-400" /> Preview (First {previewData.preview.length} rows):
              </span>
              <span className="text-[11px] text-slate-400">
                {filters.report_layout === 'manager' ? 'Manager Statement Columns' : 'List Columns'}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 font-bold">Device Name</th>
                    <th className="p-2.5 font-bold">Vehicle Number</th>
                    <th className="p-2.5 font-bold">Customer Name</th>
                    <th className="p-2.5 font-bold">Phone Number</th>
                    <th className="p-2.5 font-bold">SIM Number(s)</th>
                    <th className="p-2.5 font-bold font-mono">IMEI Number</th>
                    <th className="p-2.5 font-bold">Total Cost</th>
                    <th className="p-2.5 font-bold">Amount Received Status</th>
                    <th className="p-2.5 font-bold">Stock Place</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {previewData.preview.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-indigo-700">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[11px]">
                          {row.device_name || row.device_type_name || 'GPS Tracker'}
                        </span>
                      </td>
                      <td className="p-2.5 font-bold text-emerald-700">
                        {row.vehicle_number && row.vehicle_number !== 'Unassigned' ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-mono">
                            {row.vehicle_number}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">Unassigned</span>
                        )}
                      </td>
                      <td className="p-2.5 font-semibold text-slate-900">{row.customer_name || '—'}</td>
                      <td className="p-2.5 text-slate-600 font-mono">{row.phone_number || '—'}</td>
                      <td className="p-2.5 text-slate-600 font-mono text-[11px]">{row.sim_numbers || '—'}</td>
                      <td className="p-2.5 font-mono font-bold text-blue-600">{row.imei_number}</td>
                      <td className="p-2.5 font-bold text-slate-800">{row.total_cost || '—'}</td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          row.amount_received_status && row.amount_received_status.toUpperCase().includes('NOT')
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : row.amount_received_status && row.amount_received_status !== '—'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {row.amount_received_status || '—'}
                        </span>
                      </td>
                      <td className="p-2.5 font-medium text-slate-700">{row.stock_place || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
      )}

      {/* Preset Quick-Export Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Download className="w-4 h-4 text-indigo-600" /> One-Click Standard Report Presets
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PRESET_REPORTS.map((rc) => {
            const Icon = rc.icon;
            return (
              <div key={rc.id} className="glass-panel p-5 rounded-2xl flex flex-col justify-between space-y-4 border border-slate-200 shadow-2xs hover:shadow-xs transition-shadow">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2.5 rounded-xl ${rc.bg} ${rc.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">{rc.title}</h4>
                    </div>
                  </div>
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md ${rc.badgeColor}`}>
                    {rc.badge}
                  </span>
                  <p className="text-xs text-slate-600 leading-relaxed">{rc.description}</p>
                </div>

                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handlePresetExport(rc.id, 'xlsx')}
                    disabled={downloading === `${rc.id}_xlsx`}
                    className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-xl border border-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    {downloading === `${rc.id}_xlsx` ? 'Downloading...' : 'Excel (.xlsx)'}
                  </button>

                  <button
                    onClick={() => handlePresetExport(rc.id, 'csv')}
                    disabled={downloading === `${rc.id}_csv`}
                    className="py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-xl border border-slate-200 transition-colors cursor-pointer"
                  >
                    CSV
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
