import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Truck,
  Wrench,
  ShieldAlert,
  Activity,
  Search,
  RefreshCw,
  ArrowUpRight,
  Edit3,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  User,
  DollarSign,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  Barcode,
  Plus,
  FileSpreadsheet,
  ChevronRight,
  Car,
  Phone,
  Building,
  Download,
  Layers,
  Filter,
  Check,
  X,
  Cpu,
  Tag,
  Table,
  MessageSquare,
  QrCode,
  FileText,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  LayoutGrid,
  List,
  Zap,
  Share2,
  Target,
  Award,
  TrendingDown,
  Receipt,
  Calendar,
  RotateCcw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  fetchStats,
  fetchPurchaseBatches,
  fetchDeviceTypes,
  fetchAgingAnalysis,
  fetchSimValidity,
  updateQuickPayment,
  fetchDevices,
  recordInstallation,
  updateDealerTarget,
  fetchPaymentsTelemetry,
  getPaymentsExcelDownloadUrl
} from '../services/api';

import { useAuth } from '../context/AuthContext';
import DealerDetailModal from '../components/DealerDetailModal';
import FitmentReceiptModal from '../components/FitmentReceiptModal';
import PaymentQrModal from '../components/PaymentQrModal';
import { buildPaymentDueReminderWhatsAppMessage, buildCustomerCredentialsWhatsAppMessage } from '../utils/whatsapp';

// Model-specific Excel template columns allowed during vehicle fitment
const MODEL_EXCEL_COLUMNS = {
  VOLTY: [
    'VEHICLE NUMBER',
    'CUSTOMER NAME',
    'CUSTOMER PHONE NUMBER',
    'AADHAR NUMBER',
    'CHASIS NUMBER',
    'ENGINE NUMBER',
    'RTO LOCATION',
    'COST',
    'AMOUNT RECEIVED',
    'SALES PERSON NAME',
    'DATE'
  ],
  VAMOSYS: [
    'VEHICLE NUMBER',
    'CUSTOMER NAME',
    'CUSTOMER PHONE NUMBER',
    'AADHAAR NUMBER',
    'PAN NUMBER',
    'CHASIS NUMBER',
    'ENGINE NUMBER',
    'RTO LOCATION',
    'COST',
    'AMOUNT RECEIVED',
    'SALES PERSON NAME',
    'CERTIFICATE ISSUED DATE'
  ],
  TRACKNOW: [
    'VEHICLE NUMBER',
    'CUSTOMER NAME',
    'CUSTOMER PHONE NUMBER',
    'AADHAR NUMBER',
    'CHASIS NUMBER',
    'ENGINE NUMBER',
    'RTO LOCATION',
    'COST',
    'TAX',
    'TOTAL COST',
    'AMOUNT RECEIVED',
    'SALES PERSON',
    'DATE'
  ]
};

export default function DashboardPage({ onOpenTraceDrawer, onNavigateTab }) {
  const { user } = useAuth();
  const isDealer = user?.role === 'DEALER';

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [selectedDeviceTypeId, setSelectedDeviceTypeId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedDealerModal, setSelectedDealerModal] = useState(null);
  const [selectedReceiptDevice, setSelectedReceiptDevice] = useState(null);
  const [selectedPaymentQrDevice, setSelectedPaymentQrDevice] = useState(null);
  const [updatingPaymentId, setUpdatingPaymentId] = useState(null);
  const [dealerSearch, setDealerSearch] = useState('');
  const [dealerPaymentFilter, setDealerPaymentFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'PAID'
  const [dealerViewMode, setDealerViewMode] = useState('CARDS'); // 'CARDS' | 'TABLE'
  const [isFastFitmentOpen, setIsFastFitmentOpen] = useState(false);
  const [inStockDevices, setInStockDevices] = useState([]);
  const [submittingFitment, setSubmittingFitment] = useState(false);
  const [copiedImei, setCopiedImei] = useState('');
  const [imeiSearchQuery, setImeiSearchQuery] = useState('');
  const [fitmentModelFilter, setFitmentModelFilter] = useState('ALL');
  const [fastFitmentForm, setFastFitmentForm] = useState({
    imei_number: '',
    vehicle_number: '',
    customer_name: '',
    customer_phone: '',
    sale_price: '5000',
    payment_status: 'RECEIVED',
    installation_location: '',
    software_user_id: '',
    software_password: 'User@123'
  });

  // Payments Telemetry State
  const [paymentsRange, setPaymentsRange] = useState('today'); // 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all' | 'custom'
  const [paymentStartDate, setPaymentStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentEndDate, setPaymentEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentsData, setPaymentsData] = useState(null);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [showPaymentsTransactions, setShowPaymentsTransactions] = useState(false);
  const [paymentLedgerSearch, setPaymentLedgerSearch] = useState('');


  const filteredInStockDevices = useMemo(() => {
    return inStockDevices.filter(d => {
      const a = d.additional_attributes || {};
      const model = (d.device_type_name || '').toUpperCase();
      if (fitmentModelFilter !== 'ALL' && !model.includes(fitmentModelFilter)) {
        return false;
      }
      if (!imeiSearchQuery.trim()) return true;
      const q = imeiSearchQuery.trim().toLowerCase();
      const imei = (d.imei_number || '').toLowerCase();
      const sim = (d.sim_number || a.simno1 || a['Sim 1'] || '').toString().toLowerCase();
      const iccid = (a.ICCID || a.iccid || '').toString().toLowerCase();
      const vltd = (a.vltdsno || a['Vahan ID'] || '').toString().toLowerCase();
      return imei.includes(q) || sim.includes(q) || iccid.includes(q) || vltd.includes(q);
    });
  }, [inStockDevices, fitmentModelFilter, imeiSearchQuery]);

  const monthlyTarget = stats?.monthly_target || Number(user?.monthly_target) || 50;
  const [isExportingDealerFitments, setIsExportingDealerFitments] = useState(false);

  const handleExportDealerFitments = async () => {
    setIsExportingDealerFitments(true);
    try {
      const dealerQuery = user?.name || 'Allabakshu (GUNTUR)';
      const res = await fetchDevices({ stock_place: dealerQuery, limit: 1000 });
      const allDevs = res.data || [];
      const installedDevs = allDevs.filter(d => {
        const a = d.additional_attributes || {};
        return d.current_status === 'INSTALLED' || Boolean(String(a['VEHICLE NUMBER'] || '').trim());
      });

      if (installedDevs.length === 0) {
        alert('No installed vehicle records found for this branch yet.');
        return;
      }

      const rows = installedDevs.map((d, idx) => {
        const a = d.additional_attributes || {};
        return {
          'SL NO': idx + 1,
          'INSTALLATION DATE': a['CERTIFICATE ISSUED DATE'] || a['DATE'] || d.updated_at?.split('T')[0] || '',
          'DEVICE MODEL': d.device_type_name || 'GPS',
          'IMEI NUMBER': d.imei_number,
          'SIM 1': d.sim_number || a['simno1'] || a['Sim 1'] || '',
          'SIM 2': a['simn02'] || a['Sim 2'] || '',
          'ICCID / VLTD': a['ICCID'] || a['vltdsno'] || a['Vahan ID'] || '',
          'VEHICLE NUMBER': a['VEHICLE NUMBER'] || a['VEHICLE NO'] || '',
          'CUSTOMER NAME': a['CUSTOMER NAME'] || a['CERTIFICATE ISSUED TO'] || d.current_holder_name || '',
          'CUSTOMER PHONE': a['CUSTOMER PHONE NUMBER'] || a['PHONE NUMBER'] || '',
          'AADHAAR / AADHAR': a['AADHAAR NUMBER'] || a['AADHAR NUMBER'] || '',
          'PAN NUMBER': a['PAN NUMBER'] || '',
          'CHASSIS NUMBER': a['CHASIS NUMBER'] || a['CHASSIS NUMBER'] || '',
          'ENGINE NUMBER': a['ENGINE NUMBER'] || '',
          'RTO LOCATION': a['RTO LOCATION'] || '',
          'FITMENT PRICE (₹)': Number(a['COST'] || a['TOTAL COST'] || 5000),
          'PAYMENT STATUS': (a['AMOUNT RECEIVED'] === 'RECEIVED' || a['payment_status'] === 'PAID') ? 'RECEIVED' : 'PENDING',
          'SALES PERSON': a['SALES PERSON NAME'] || a['SALES PERSON'] || user?.name || '',
          'BRANCH / STOCK PLACE': a['STOCK PLACE'] || dealerQuery
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const colWidths = [
        { wch: 8 },  // SL NO
        { wch: 18 }, // DATE
        { wch: 14 }, // MODEL
        { wch: 18 }, // IMEI
        { wch: 16 }, // SIM 1
        { wch: 16 }, // SIM 2
        { wch: 22 }, // ICCID
        { wch: 16 }, // VEHICLE
        { wch: 24 }, // CUSTOMER
        { wch: 16 }, // PHONE
        { wch: 18 }, // AADHAAR
        { wch: 14 }, // PAN
        { wch: 22 }, // CHASSIS
        { wch: 18 }, // ENGINE
        { wch: 16 }, // RTO
        { wch: 18 }, // PRICE
        { wch: 16 }, // STATUS
        { wch: 20 }, // SALES
        { wch: 22 }  // BRANCH
      ];
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dealer Fitments');
      const branchClean = (user?.name || 'Branch').replace(/[^a-zA-Z0-9]/g, '_');
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `Dealer_Fitments_${branchClean}_${today}.xlsx`);
    } catch (err) {
      alert('Failed to export fitments: ' + err.message);
    } finally {
      setIsExportingDealerFitments(false);
    }
  };

  // Aging Analysis Modal States
  const [isAgingModalOpen, setIsAgingModalOpen] = useState(false);
  const [agingData, setAgingData] = useState(null);
  const [loadingAging, setLoadingAging] = useState(false);

  // SIM Validity Modal States
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);
  const [simData, setSimData] = useState(null);
  const [loadingSim, setLoadingSim] = useState(false);

  // Monthly Payment Excel Export Modal States
  const [isMonthlyExportModalOpen, setIsMonthlyExportModalOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState('AUGUST');
  const [exportPaymentStatus, setExportPaymentStatus] = useState('RECEIVED'); // 'RECEIVED' | 'PENDING' | 'ALL'
  const [exportTypeId, setExportTypeId] = useState('');
  const [exportBatchId, setExportBatchId] = useState('');
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const MONTHS_LIST = [
    { key: 'AUGUST', label: 'August', badge: 'Current Month' },
    { key: 'JULY', label: 'July' },
    { key: 'JUNE', label: 'June' },
    { key: 'MAY', label: 'May' },
    { key: 'APRIL', label: 'April' },
    { key: 'MARCH', label: 'March' },
    { key: 'FEBRUARY', label: 'February' },
    { key: 'JANUARY', label: 'January' },
    { key: 'SEPTEMBER', label: 'September' },
    { key: 'OCTOBER', label: 'October' },
    { key: 'NOVEMBER', label: 'November' },
    { key: 'DECEMBER', label: 'December' },
    { key: 'ALL', label: 'All Months' }
  ];

  const handleOpenMonthlyExportModal = (defaultMonth = 'AUGUST') => {
    setExportMonth(defaultMonth);
    setExportTypeId(selectedDeviceTypeId || '');
    setExportBatchId(selectedBatchId || '');
    setExportPaymentStatus('RECEIVED');
    setIsMonthlyExportModalOpen(true);
  };

  const handleDownloadMonthlyExcel = () => {
    setIsExportingExcel(true);
    const params = new URLSearchParams();
    params.set('type', 'monthly_payments');
    params.set('format', 'xlsx');
    if (exportMonth && exportMonth !== 'ALL') params.set('month', exportMonth);
    if (exportPaymentStatus && exportPaymentStatus !== 'ALL') params.set('payment_status', exportPaymentStatus);
    if (exportTypeId) params.set('device_type_id', exportTypeId);
    if (exportBatchId) params.set('purchase_batch_id', exportBatchId);

    window.location.href = `/api/reports/export?${params.toString()}`;
    setTimeout(() => {
      setIsExportingExcel(false);
      setIsMonthlyExportModalOpen(false);
    }, 1500);
  };

  const handleExportRecentActivityCsv = () => {
    if (!stats?.recentActivity || stats.recentActivity.length === 0) {
      alert('No recent operations activity to export.');
      return;
    }

    const headers = [
      'Timestamp',
      'Performed By / Team',
      'Event Type',
      'IMEI Number',
      'Device Type',
      'Vehicle Number',
      'Customer Name',
      'Customer Phone',
      'Stock Place / Holder',
      'Change Details / Diff',
      'Cost',
      'Tax',
      'Payment Status'
    ];

    const csvRows = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')];

    stats.recentActivity.forEach(act => {
      const row = [
        act.event_date || '',
        act.performed_by || 'Admin',
        act.event_type || 'STATUS_CHANGED',
        act.imei_number || '',
        act.device_type_name || '',
        act.vehicle_number || '-',
        act.customer_name || '-',
        act.customer_phone || '-',
        act.stock_place || act.to_holder || '',
        act.remarks || '',
        act.cost || '-',
        act.tax || '-',
        act.payment_status || 'PENDING'
      ];
      csvRows.push(row.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Live_Operations_Activity_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Fetch batches & device types list once on mount
  useEffect(() => {
    fetchPurchaseBatches().then(res => {
      if (res.success && Array.isArray(res.data)) setBatches(res.data);
    }).catch(err => console.error(err));

    fetchDeviceTypes().then(res => {
      if (res.success && Array.isArray(res.data)) setDeviceTypes(res.data);
    }).catch(err => console.error(err));
  }, []);

  // Reload stats when filter values change
  useEffect(() => {
    loadData();
  }, [selectedDeviceTypeId, selectedBatchId, locationFilter, selectedMonth]);

  const selectedTypeObj = useMemo(() => {
    if (!selectedDeviceTypeId) return null;
    return deviceTypes.find(dt => dt.id.toString() === selectedDeviceTypeId.toString()) || null;
  }, [selectedDeviceTypeId, deviceTypes]);

  const selectedBatchObj = useMemo(() => {
    if (!selectedBatchId) return null;
    return batches.find(b => b.id.toString() === selectedBatchId.toString()) || null;
  }, [selectedBatchId, batches]);

  const visibleBatches = useMemo(() => {
    return batches.filter(b => {
      if (b.live_devices_count !== undefined && b.live_devices_count <= 0) return false;
      if (selectedDeviceTypeId && b.device_type_id && b.device_type_id.toString() !== selectedDeviceTypeId.toString()) return false;
      return true;
    });
  }, [batches, selectedDeviceTypeId]);

  const isFiltered = Boolean(selectedDeviceTypeId || selectedBatchId || locationFilter);

  const filteredDealerInstallations = useMemo(() => {
    if (!stats?.recentActivity) return [];
    return stats.recentActivity.filter(act => {
      if (dealerPaymentFilter === 'PAID' && act.payment_status !== 'PAID') return false;
      if (dealerPaymentFilter === 'PENDING' && act.payment_status === 'PAID') return false;
      if (dealerSearch.trim()) {
        const q = dealerSearch.trim().toLowerCase();
        const matchVeh = String(act.vehicle_number || '').toLowerCase().includes(q);
        const matchImei = String(act.imei_number || '').toLowerCase().includes(q);
        const matchCust = String(act.customer_name || '').toLowerCase().includes(q);
        const matchPhone = String(act.customer_phone || '').includes(q);
        const matchRto = String(act.rto_location || '').toLowerCase().includes(q);
        if (!matchVeh && !matchImei && !matchCust && !matchPhone && !matchRto) return false;
      }
      return true;
    });
  }, [stats?.recentActivity, dealerPaymentFilter, dealerSearch]);

  const handleToggleDealerPayment = async (act) => {
    const devId = act.device_id || act.id;
    if (!devId) return;
    const currentIsPaid = act.payment_status === 'PAID';
    const newStatus = currentIsPaid ? 'NOT RECEIVED' : 'RECEIVED';
    setUpdatingPaymentId(devId);
    try {
      const res = await updateQuickPayment(devId, {
        payment_status: newStatus,
        amount_received: newStatus === 'RECEIVED' ? (act.cost || 5000) : 0
      });
      if (res && res.success) {
        setStats(prev => {
          if (!prev || !prev.recentActivity) return prev;
          const updatedActs = prev.recentActivity.map(a => {
            if ((a.device_id || a.id) === devId) {
              return {
                ...a,
                payment_status: newStatus === 'RECEIVED' ? 'PAID' : 'PENDING'
              };
            }
            return a;
          });
          const newPaidCount = updatedActs.filter(a => a.payment_status === 'PAID').length;
          const newPendingCount = updatedActs.length - newPaidCount;
          return {
            ...prev,
            recentActivity: updatedActs,
            financials: {
              ...prev.financials,
              payment_received_count: newPaidCount,
              payment_pending_count: newPendingCount
            }
          };
        });
      }
    } catch (err) {
      console.error('Failed to toggle payment status:', err);
    } finally {
      setUpdatingPaymentId(null);
    }
  };

  const handleCopyImei = (imei) => {
    if (!imei) return;
    navigator.clipboard?.writeText(imei);
    setCopiedImei(imei);
    setTimeout(() => setCopiedImei(''), 2000);
  };

  const handleSelectDevice = (imei) => {
    const dev = inStockDevices.find(d => d.imei_number === imei);
    const attrs = dev?.additional_attributes || {};
    setFastFitmentForm(prev => ({
      ...prev,
      imei_number: imei,
      vehicle_number: attrs['VEHICLE NUMBER'] || attrs['VEHICLE NO'] || prev.vehicle_number || '',
      customer_name: attrs['CUSTOMER NAME'] || attrs['CERTIFICATE ISSUED TO'] || prev.customer_name || '',
      customer_phone: String(attrs['CUSTOMER PHONE NUMBER'] || attrs['MOBILE NUMBER'] || prev.customer_phone || ''),
      aadhar_number: String(attrs['AADHAAR NUMBER'] || attrs['AADHAR NUMBER'] || prev.aadhar_number || ''),
      pan_number: attrs['PAN NUMBER'] || prev.pan_number || '',
      chasis_number: attrs['CHASIS NUMBER'] || attrs['CHASSIS NUMBER'] || prev.chasis_number || '',
      engine_number: attrs['ENGINE NUMBER'] || prev.engine_number || '',
      rto_location: attrs['RTO LOCATION'] || prev.rto_location || user?.region || 'GUNTUR',
      installation_location: attrs['RTO LOCATION'] || prev.installation_location || user?.region || 'GUNTUR',
      sale_price: String(attrs['TOTAL COST'] || attrs['COST'] || prev.sale_price || '5000'),
      payment_status: attrs['AMOUNT RECEIVED'] === 'RECEIVED' ? 'RECEIVED' : (prev.payment_status || 'RECEIVED'),
      sales_person: attrs['SALES PERSON NAME'] || prev.sales_person || user?.name || 'ALLABAKSHU',
      additional_attributes: { ...attrs }
    }));
  };

  const handleOpenFastFitment = async (defaultImei = '') => {
    setIsFastFitmentOpen(true);
    try {
      const dealerQuery = isDealer ? (user?.name || 'Allabakshu') : '';
      const params = {};
      if (dealerQuery) params.dealer_name = dealerQuery;
      const res = await fetchDevices(params);
      if (res.success && res.data) {
        const available = res.data.filter(d => {
          const a = d.additional_attributes || {};
          const isInstalled = d.current_status === 'INSTALLED' || Boolean(String(a['VEHICLE NUMBER'] || '').trim()) || Boolean(String(a['CERTIFICATE ISSUED TO'] || '').trim());
          if (isInstalled) return false;
          if (isDealer) {
            const place = String(a['STOCK PLACE'] || a['STOCK LOCATION'] || d.current_holder_name || '').toUpperCase();
            const dealerKey = (user?.name || '').toUpperCase();
            return place.includes(dealerKey) || (user?.region && place.includes(user.region.toUpperCase()));
          }
          return true;
        });
        setInStockDevices(available);
        const selected = defaultImei || (available.length > 0 ? available[0].imei_number : '');
        const selectedDev = available.find(d => d.imei_number === selected) || available[0];
        const attrs = selectedDev?.additional_attributes || {};
        setFastFitmentForm(prev => ({
          ...prev,
          imei_number: selected,
          vehicle_number: attrs['VEHICLE NUMBER'] || '',
          customer_name: attrs['CUSTOMER NAME'] || attrs['CERTIFICATE ISSUED TO'] || '',
          customer_phone: String(attrs['CUSTOMER PHONE NUMBER'] || attrs['MOBILE NUMBER'] || ''),
          aadhar_number: String(attrs['AADHAAR NUMBER'] || attrs['AADHAR NUMBER'] || ''),
          pan_number: attrs['PAN NUMBER'] || '',
          chasis_number: attrs['CHASIS NUMBER'] || attrs['CHASSIS NUMBER'] || '',
          engine_number: attrs['ENGINE NUMBER'] || '',
          installation_location: attrs['RTO LOCATION'] || user?.region || user?.name || 'GUNTUR',
          rto_location: attrs['RTO LOCATION'] || user?.region || 'GUNTUR',
          sales_manager: attrs['SALES MANAGER NAME'] || user?.name || 'ALLABAKSHU',
          sales_person: attrs['SALES PERSON NAME'] || user?.name || 'ALLABAKSHU',
          sale_price: String(attrs['TOTAL COST'] || attrs['COST'] || '5000'),
          additional_attributes: { ...attrs }
        }));
      }
    } catch (err) {
      console.error('Failed to load in-stock devices:', err);
    }
  };

  const handleSaveFastFitment = async (e) => {
    e.preventDefault();
    if (!fastFitmentForm.imei_number || !fastFitmentForm.vehicle_number || !fastFitmentForm.customer_name || !fastFitmentForm.customer_phone) {
      alert('Please enter IMEI, Vehicle Number, Customer Name, and Customer Phone.');
      return;
    }
    setSubmittingFitment(true);
    try {
      const payload = {
        imei_number: fastFitmentForm.imei_number.trim(),
        vehicle_number: fastFitmentForm.vehicle_number.trim().toUpperCase(),
        vehicle_type: fastFitmentForm.vehicle_type || 'Commercial Vehicle',
        chasis_number: fastFitmentForm.chasis_number ? fastFitmentForm.chasis_number.trim().toUpperCase() : '',
        engine_number: fastFitmentForm.engine_number ? fastFitmentForm.engine_number.trim().toUpperCase() : '',
        aadhar_number: fastFitmentForm.aadhar_number ? fastFitmentForm.aadhar_number.trim() : '',
        pan_number: fastFitmentForm.pan_number ? fastFitmentForm.pan_number.trim().toUpperCase() : '',
        customer_name: fastFitmentForm.customer_name.trim(),
        customer_phone: fastFitmentForm.customer_phone.trim(),
        customer_address: fastFitmentForm.customer_address ? fastFitmentForm.customer_address.trim() : '',
        sale_price: parseFloat(fastFitmentForm.sale_price) || 5000,
        payment_status: fastFitmentForm.payment_status || 'RECEIVED',
        installed_by: user?.name || 'Authorized Dealer',
        sales_manager: fastFitmentForm.sales_manager || user?.name || 'ALLABAKSHU',
        sales_person: fastFitmentForm.sales_person || user?.name || 'ALLABAKSHU',
        installation_location: fastFitmentForm.installation_location || fastFitmentForm.rto_location || user?.region || 'GUNTUR',
        installation_date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
        software_user_id: fastFitmentForm.software_user_id || fastFitmentForm.vehicle_number.trim().toUpperCase(),
        software_password: fastFitmentForm.software_password || 'User@123',
        additional_attributes: fastFitmentForm.additional_attributes || {}
      };

      const res = await recordInstallation(payload);
      if (res.success) {
        setIsFastFitmentOpen(false);
        setFastFitmentForm({
          imei_number: '',
          vehicle_number: '',
          vehicle_type: 'Commercial Vehicle',
          chasis_number: '',
          engine_number: '',
          rto_location: '',
          customer_name: '',
          customer_phone: '',
          aadhar_number: '',
          pan_number: '',
          customer_address: '',
          sale_price: '5000',
          payment_status: 'RECEIVED',
          sales_manager: '',
          sales_person: '',
          installation_location: user?.region || 'GUNTUR',
          software_user_id: '',
          software_password: 'User@123'
        });
        await loadData();
        // Automatically open fitment receipt slip for immediate preview / print!
        setSelectedReceiptDevice({
          imei_number: payload.imei_number,
          vehicle_number: payload.vehicle_number,
          customer_name: payload.customer_name,
          customer_phone: payload.customer_phone,
          password: payload.software_password
        });
      }
    } catch (err) {
      alert('Failed to record fitment: ' + err.message);
    } finally {
      setSubmittingFitment(false);
    }
  };

  const handleResetFilters = () => {
    setSelectedDeviceTypeId('');
    setSelectedBatchId('');
    setLocationFilter('');
    setSelectedMonth('ALL');
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (isDealer && user?.name) {
        params.dealer_name = user.name;
      }
      if (selectedDeviceTypeId) params.device_type_id = selectedDeviceTypeId;
      if (selectedBatchId) params.purchase_batch_id = selectedBatchId;
      if (locationFilter) params.stock_place = locationFilter;
      if (selectedMonth && selectedMonth !== 'ALL') params.month = selectedMonth;
      const res = await fetchStats(params);
      if (res.success) {
        setStats(res.data);
      } else {
        setError(res.error || 'Failed to fetch data');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPaymentsTelemetry = async () => {
    setLoadingPayments(true);
    try {
      const params = {
        range: paymentsRange,
        start_date: paymentStartDate,
        end_date: paymentEndDate
      };
      if (selectedDeviceTypeId) params.device_type_id = selectedDeviceTypeId;
      if (isDealer && user?.name) params.dealer_name = user.name;
      if (locationFilter) params.dealer_name = locationFilter;

      const res = await fetchPaymentsTelemetry(params);
      if (res.success) {
        setPaymentsData(res.data);
      }
    } catch (err) {
      console.error('Failed to load payments telemetry:', err);
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    loadPaymentsTelemetry();
  }, [paymentsRange, paymentStartDate, paymentEndDate, selectedDeviceTypeId, locationFilter]);


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500 text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        Loading {isDealer ? 'dealer stock workspace...' : 'executive dashboard metrics...'}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-6 text-center text-red-700 bg-red-50 border border-red-200 rounded-2xl flex flex-col items-center gap-3 max-w-md mx-auto my-12 shadow-sm">
        <p className="text-sm font-semibold">Failed to load dashboard data: {error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const { statusCounts, financials, typeCounts = [], dealerAllocations = [], upcomingExpiries = [], recentActivity = [], totals } = stats;

  const totalDevices = statusCounts?.TOTAL || totals?.devices || 0;
  const inWarehouse = statusCounts?.IN_WAREHOUSE || 0;
  const withDealer = statusCounts?.WITH_DEALER || 0;
  const installed = statusCounts?.INSTALLED || 0;
  const inStockCount = isDealer ? (statusCounts?.WITH_DEALER || totalDevices - installed) : ((inWarehouse + withDealer) || (totalDevices - installed));
  const totalCustomers = totals?.customers || 0;

  const getEventBadge = (eventType) => {
    switch (eventType) {
      case 'INSTALLED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Installed</span>;
      case 'DISPATCHED':
      case 'STOCK_TRANSFERRED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">Dispatched</span>;
      case 'STATUS_CHANGED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Status Change</span>;
      case 'RETURNED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">Returned</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">Updated</span>;
    }
  };

  const handleOpenAgingModal = async () => {
    setIsAgingModalOpen(true);
    setLoadingAging(true);
    try {
      const res = await fetchAgingAnalysis();
      if (res.success) setAgingData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAging(false);
    }
  };

  const handleOpenSimModal = async () => {
    setIsSimModalOpen(true);
    setLoadingSim(true);
    try {
      const res = await fetchSimValidity();
      if (res.success) setSimData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSim(false);
    }
  };

  const handleNudgeDealerWhatsApp = (dealerName, count, imeiList = []) => {
    const msg = `*⚠️ FUELTRACKS STOCK RECONCILIATION NOTICE*\n\n` +
      `*Dear ${dealerName},*\n\n` +
      `Our centralized inventory audit shows you currently hold *${count} uninstalled GPS devices* that have been idle for *over 45 days* without vehicle fitment updates.\n\n` +
      `📋 *IMEI Serials Held (Sample):*\n` +
      imeiList.slice(0, 5).map(i => `• \`${i}\``).join('\n') +
      (imeiList.length > 5 ? `\n...and ${imeiList.length - 5} more.` : '') +
      `\n\nKindly update their fitment status in your portal or return unutilized units to the central warehouse.\n\n` +
      `*FuelTracks Central Operations*`;

    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  if (isDealer) {
    const totalInstCount = stats?.recentActivity?.length || 0;
    const paidInstCount = (stats?.recentActivity || []).filter(a => a.payment_status === 'PAID').length;
    const pendingInstCount = totalInstCount - paidInstCount;
    const targetAchievedPct = Math.min(100, Math.round((installed / (monthlyTarget || 1)) * 100));
    const totalRevenue = installed * 5000;
    const collectedRevenue = financials?.payment_received_amount || (paidInstCount * 5000);
    const pendingRevenue = Math.max(0, totalRevenue - collectedRevenue);
    const daysRemainingInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();

    return (
      <div className="space-y-6">
        
        {/* Simple Clean Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Dealer Branch
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {user?.region ? `${user.region} Region` : 'Active Hub'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              Welcome, {user?.name || 'Dealer Partner'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Overview of your allocated devices, vehicle fitments & monthly goals.
            </p>
          </div>

          {/* Action Buttons with 1-Click Excel Export (Feature 6) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenFastFitment()}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Zap className="w-4 h-4" />
              <span>Record Fitment</span>
            </button>
            <button
              onClick={handleExportDealerFitments}
              disabled={isExportingDealerFitments}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Download full fitment log Excel for accounting"
            >
              {isExportingDealerFitments ? (
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              )}
              <span>{isExportingDealerFitments ? 'Exporting...' : 'Download Fitments (Excel)'}</span>
            </button>
            <button
              onClick={() => onNavigateTab('inventory')}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
            >
              <Boxes className="w-4 h-4 text-slate-600" />
              <span>Stock List ({withDealer || inStockCount})</span>
            </button>
            <button
              onClick={() => loadData()}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
              title="Refresh Stats"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feature 2: Monthly Target & Earnings Progress Bar */}
        <div className="bg-linear-to-r from-slate-900 via-slate-850 to-indigo-950 text-white p-5 rounded-2xl border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
            {/* Left: Monthly Fitment Target Progress */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                      <span>Monthly Fitment Target</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {daysRemainingInMonth} days left
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Goal for {new Date().toLocaleString('default', { month: 'long' })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold font-mono text-emerald-400">
                    {installed} <span className="text-xs text-slate-400 font-normal">/ {monthlyTarget} Vehicles</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>Admin Assigned Target</span>
                  </span>
                </div>
              </div>

              {/* Visual Progress Bar */}
              <div className="space-y-1">
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                  <div
                    className="h-full bg-linear-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500 shadow-xs"
                    style={{ width: `${Math.min(100, targetAchievedPct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>0 Installed</span>
                  <span className="font-bold text-emerald-400">
                    {targetAchievedPct}% Achieved {targetAchievedPct >= 100 ? '🎉 Goal Completed!' : ''}
                  </span>
                  <span>{monthlyTarget} Target</span>
                </div>

                {/* Device Type Target Breakdown Pills */}
                {Object.entries(stats?.device_targets || {}).filter(([_, v]) => Number(v) > 0).length > 0 && (
                  <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-slate-800/80 mt-1.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Model Quotas:</span>
                    {Object.entries(stats?.device_targets || {}).filter(([_, v]) => Number(v) > 0).map(([model, quota]) => (
                      <div key={model} className="px-2 py-0.5 bg-slate-800/90 text-slate-200 border border-slate-700 rounded-lg text-[10px] font-mono flex items-center gap-1.5">
                        <span className="font-bold text-amber-400">{model}:</span>
                        <strong className="text-emerald-400 font-bold">{quota} units</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Revenue Breakdown Meter */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:w-96 shrink-0 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total Fitted</span>
                <div className="text-sm sm:text-base font-bold font-mono text-slate-100">
                  ₹{totalRevenue.toLocaleString()}
                </div>
                <span className="text-[10px] text-slate-400">{installed} vehicles</span>
              </div>
              <div className="space-y-0.5 border-l border-slate-700 pl-2 sm:pl-3">
                <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Collected</span>
                <div className="text-sm sm:text-base font-bold font-mono text-emerald-400">
                  ₹{collectedRevenue.toLocaleString()}
                </div>
                <span className="text-[10px] text-emerald-500 font-semibold">{paidInstCount} Paid</span>
              </div>
              <div className="space-y-0.5 border-l border-slate-700 pl-2 sm:pl-3">
                <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Due / Pending</span>
                <div className="text-sm sm:text-base font-bold font-mono text-amber-400">
                  ₹{pendingRevenue.toLocaleString()}
                </div>
                <span className="text-[10px] text-amber-500 font-semibold">{pendingInstCount} Due</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Clean Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* 1. In-Stock Ready */}
          <div
            onClick={() => onNavigateTab('inventory')}
            className="bg-white p-4.5 rounded-2xl border border-slate-200 hover:border-emerald-400 transition-all cursor-pointer shadow-2xs group"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">In-Stock (Available)</span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900">
              {withDealer || inStockCount} <span className="text-xs font-normal text-slate-500">Units</span>
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center justify-between">
              <span>Ready for fitment</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
            </div>
          </div>

          {/* 2. Installed Vehicles */}
          <div
            onClick={() => onNavigateTab('installations')}
            className="bg-white p-4.5 rounded-2xl border border-slate-200 hover:border-blue-400 transition-all cursor-pointer shadow-2xs group"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Installed Vehicles</span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Car className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900">
              {installed} <span className="text-xs font-normal text-slate-500">Vehicles</span>
            </div>
            <div className="text-[11px] text-blue-700 font-semibold mt-1 flex items-center justify-between">
              <span>Active on road</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
            </div>
          </div>

          {/* 3. Payment Received */}
          <div
            onClick={() => onNavigateTab('installations')}
            className="bg-white p-4.5 rounded-2xl border border-slate-200 hover:border-amber-400 transition-all cursor-pointer shadow-2xs group"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Payment Status</span>
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900">
              ₹{(financials?.payment_received_amount || (paidInstCount * 5000)).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>{paidInstCount} Paid • {pendingInstCount} Due</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600" />
            </div>
          </div>

          {/* 4. Total Dispatches */}
          <div
            onClick={() => onNavigateTab('dispatches')}
            className="bg-white p-4.5 rounded-2xl border border-slate-200 hover:border-purple-400 transition-all cursor-pointer shadow-2xs group"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Total Allocated</span>
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900">
              {totalDevices} <span className="text-xs font-normal text-slate-500">Units</span>
            </div>
            <div className="text-[11px] text-purple-700 font-semibold mt-1 flex items-center justify-between">
              <span>Total branch stock</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-600" />
            </div>
          </div>

        </div>

        {/* Clean Simple Stock Models Table */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Layers className="w-4 h-4 text-amber-600" />
              <span>Stock Models Summary</span>
            </div>
            <button
              onClick={() => onNavigateTab('inventory')}
              className="text-xs text-blue-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View Full Inventory</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-3 font-bold">Model Name</th>
                  <th className="p-3 font-bold">Category</th>
                  <th className="p-3 font-bold">Available in Stock</th>
                  <th className="p-3 font-bold">Installed</th>
                  <th className="p-3 font-bold">Total Assigned</th>
                  <th className="p-3 font-bold text-right">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {typeCounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-slate-400">
                      No device models assigned yet.
                    </td>
                  </tr>
                ) : (
                  typeCounts.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                        <Boxes className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t.device_type}</span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          {t.category}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {t.with_dealer_count} Units
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-mono font-bold text-slate-700">
                          {t.installed_count} Units
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900">
                        {t.total_count} Units
                      </td>
                      <td className="p-3 text-right">
                        {t.with_dealer_count > 0 ? (
                          <button
                            onClick={() => handleOpenFastFitment()}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                          >
                            + Fit Device
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-400">
                            All Fitted
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. Interactive "Fast Vehicle Fitment" Modal with Full Vehicle & KYC Fields */}
        {isFastFitmentOpen && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="p-4.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500 text-slate-950">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Record Vehicle Fitment & Customer Details</h3>
                    <p className="text-[11px] text-slate-400">Enter AIS-140 vehicle, chassis, engine & customer KYC details</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsFastFitmentOpen(false)}
                  className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Fitment Form with Scrollable Dynamic Excel Columns Content */}
              <form onSubmit={handleSaveFastFitment} className="p-5 space-y-4 text-xs overflow-y-auto">
                
                {/* 1. Smart Searchable GPS Device Selector */}
                <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="block font-bold text-slate-800 text-xs">
                      Select GPS Device ({inStockDevices.length} In-Stock with You) *
                    </label>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Showing {filteredInStockDevices.length} of {inStockDevices.length} available units
                    </span>
                  </div>

                  {/* Fast Search Input Bar (By Last 4 Digits / Full IMEI / SIM / ICCID) */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="🔍 Type last 4-6 digits of IMEI (e.g. 4084), full IMEI, SIM or ICCID..."
                      value={imeiSearchQuery}
                      onChange={(e) => {
                        const q = e.target.value;
                        setImeiSearchQuery(q);
                        // Auto-select if exact 1 match or exact 15 digit IMEI
                        if (q.trim().length >= 4) {
                          const exactMatch = inStockDevices.find(d => 
                            d.imei_number.endsWith(q.trim()) || 
                            d.imei_number === q.trim() || 
                            d.imei_number.includes(q.trim())
                          );
                          if (exactMatch && exactMatch.imei_number !== fastFitmentForm.imei_number) {
                            handleSelectDevice(exactMatch.imei_number);
                          }
                        }
                      }}
                      className="w-full pl-8.5 pr-8 py-2 bg-white border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    {imeiSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setImeiSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Model Quick Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {['ALL', 'VOLTY', 'VAMOSYS', 'TRACKNOW'].map((m) => {
                      const count = m === 'ALL' 
                        ? inStockDevices.length 
                        : inStockDevices.filter(d => (d.device_type_name || '').toUpperCase().includes(m)).length;
                      if (count === 0 && m !== 'ALL') return null;
                      const active = fitmentModelFilter === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setFitmentModelFilter(m)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {m === 'ALL' ? 'All Models' : m} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {/* Device Dropdown with Live Filtered Options */}
                  {filteredInStockDevices.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center text-amber-800 text-xs">
                      No in-stock device found matching "{imeiSearchQuery}".
                    </div>
                  ) : (
                    <select
                      value={fastFitmentForm.imei_number}
                      onChange={(e) => handleSelectDevice(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-semibold"
                      required
                    >
                      {filteredInStockDevices.map(d => {
                        const a = d.additional_attributes || {};
                        const sim = d.sim_number || a.simno1 || a['Sim 1'] || '';
                        return (
                          <option key={d.id} value={d.imei_number}>
                            {d.imei_number} — {d.device_type_name || 'GPS'} {sim ? `(SIM: ${sim})` : ''} ({a['STOCK PLACE'] || 'In Stock'})
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {/* 2. Dynamic Excel Hardware Specs Summary */}
                {(() => {
                  const selDev = inStockDevices.find(d => d.imei_number === fastFitmentForm.imei_number) || inStockDevices[0];
                  if (!selDev) return null;
                  const a = selDev.additional_attributes || {};
                  return (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Boxes className="w-3.5 h-3.5 text-blue-600" />
                          <span>{selDev.device_type_name || 'GPS'} Excel Hardware Parameters</span>
                        </span>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {a['STOCK PLACE'] || 'In Stock'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-600">
                        {(a['simno1'] || a['Sim 1'] || selDev.sim_number) && (
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                            SIM 1: {a['simno1'] || a['Sim 1'] || selDev.sim_number}
                          </span>
                        )}
                        {(a['simn02'] || a['Sim 2']) && (
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                            SIM 2: {a['simn02'] || a['Sim 2']}
                          </span>
                        )}
                        {a['ICCID'] && (
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                            ICCID: {a['ICCID']}
                          </span>
                        )}
                        {a['vltdsno'] && (
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                            VLTD: {a['vltdsno']}
                          </span>
                        )}
                        {(a['SIM VALIDITY'] || a['SIM VALIDIDTY']) && (
                          <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                            Validity: {a['SIM VALIDITY'] || a['SIM VALIDIDTY']}
                          </span>
                        )}
                        {(a['ACTIVATION STATUS'] || a['IS DEVICE ACTIVATED']) && (
                          <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200 font-semibold">
                            Activated: {a['ACTIVATION STATUS'] || a['IS DEVICE ACTIVATED']}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 3. Pure Dynamic Excel Fields Grid based on Model Columns */}
                {(() => {
                  const selDev = inStockDevices.find(d => d.imei_number === fastFitmentForm.imei_number) || inStockDevices[0];
                  const rawAttrs = selDev?.additional_attributes || {};
                  const currentAttrs = fastFitmentForm.additional_attributes || rawAttrs;
                  
                  // Exclude hardware metadata keys
                  const hardwareKeys = new Set([
                    'vltdsno', 'simno1', 'simn02', 'Sim 1', 'Sim 2', 'ICCID', 'SERIAL NUMBER', 
                    'UID', 'Vahan ID', 'SN', 'SIM VALIDITY', 'SIM VALIDIDTY', 'IS DEVICE ACTIVATED', 
                    'ACTIVATION STATUS', 'STOCK PLACE', 'STOCK PLACE DATE', 'customer', 'DEVICE NAME'
                  ]);

                  // Determine columns to display from model template + any extra Excel attributes
                  const modelKey = (selDev?.device_type_name || '').toUpperCase().trim();
                  const baseTemplate = MODEL_EXCEL_COLUMNS[modelKey] || [
                    'VEHICLE NUMBER', 'CUSTOMER NAME', 'CUSTOMER PHONE NUMBER', 
                    'AADHAAR NUMBER', 'CHASIS NUMBER', 'ENGINE NUMBER', 
                    'RTO LOCATION', 'COST', 'AMOUNT RECEIVED', 'SALES PERSON NAME', 'DATE'
                  ];
                  const extraKeys = Object.keys(rawAttrs).filter(k => !hardwareKeys.has(k) && !k.startsWith('__EMPTY') && !baseTemplate.includes(k));
                  const fitmentColumns = [...baseTemplate, ...extraKeys];

                  return (
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between pb-1 border-b border-slate-200 text-slate-900 font-bold text-[11px] uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Excel Columns for {selDev?.device_type_name || 'Device'}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal normal-case">
                          {fitmentColumns.length} fields allowed
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {fitmentColumns.map((colKey) => {
                          const val = currentAttrs[colKey] !== undefined ? currentAttrs[colKey] : '';
                          const isAmountReceived = /amount.*received/i.test(colKey);
                          const isCost = /cost|price|tax/i.test(colKey);
                          const isPhone = /phone|mobile|contact/i.test(colKey);
                          const isVehicle = /vehicle/i.test(colKey);
                          const isAadhar = /aadhar/i.test(colKey);
                          const isPan = /pan/i.test(colKey);
                          const isChasis = /chasis|chassis|engine/i.test(colKey);

                          const handleColChange = (newVal) => {
                            const updated = { ...currentAttrs, [colKey]: newVal };
                            setFastFitmentForm(prev => {
                              const next = { ...prev, additional_attributes: updated };
                              if (isVehicle) next.vehicle_number = String(newVal).toUpperCase();
                              if (/customer.*name|issued.*to/i.test(colKey)) next.customer_name = String(newVal);
                              if (isPhone) next.customer_phone = String(newVal);
                              if (isAadhar) next.aadhar_number = String(newVal);
                              if (isPan) next.pan_number = String(newVal).toUpperCase();
                              if (/chasis|chassis/i.test(colKey)) next.chasis_number = String(newVal).toUpperCase();
                              if (/engine/i.test(colKey)) next.engine_number = String(newVal).toUpperCase();
                              if (/rto|location/i.test(colKey)) next.installation_location = String(newVal);
                              if (/sales.*person/i.test(colKey)) next.sales_person = String(newVal);
                              if (isCost && !/tax/i.test(colKey)) next.sale_price = String(newVal);
                              if (isAmountReceived) next.payment_status = newVal === 'RECEIVED' ? 'RECEIVED' : 'NOT RECEIVED';
                              return next;
                            });
                          };

                          if (isAmountReceived) {
                            return (
                              <div key={colKey}>
                                <label className="block font-bold text-slate-700 mb-1">{colKey}</label>
                                <select
                                  value={val === 'RECEIVED' ? 'RECEIVED' : 'NOT RECEIVED'}
                                  onChange={(e) => handleColChange(e.target.value)}
                                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                                >
                                  <option value="RECEIVED">RECEIVED (Paid)</option>
                                  <option value="NOT RECEIVED">NOT RECEIVED (Pending)</option>
                                </select>
                              </div>
                            );
                          }

                          return (
                            <div key={colKey}>
                              <label className="block font-bold text-slate-700 mb-1">
                                {colKey} {isVehicle || /customer.*name/i.test(colKey) || isPhone ? '*' : ''}
                              </label>
                              <input
                                type={isCost || isPhone ? 'text' : 'text'}
                                placeholder={`Enter ${colKey}`}
                                value={val}
                                onChange={(e) => handleColChange(isVehicle || isPan || isChasis ? e.target.value.toUpperCase() : e.target.value)}
                                className={`w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${
                                  isVehicle || isChasis || isPan || isPhone || isAadhar ? 'font-mono' : ''
                                } ${isVehicle ? 'font-bold uppercase' : ''}`}
                                required={isVehicle || /customer.*name/i.test(colKey) || isPhone}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Submit Action Buttons */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsFastFitmentOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingFitment}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    {submittingFitment ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>Save & Generate Slip</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Official Fitment Slip Modal */}
        <FitmentReceiptModal
          isOpen={Boolean(selectedReceiptDevice)}
          onClose={() => setSelectedReceiptDevice(null)}
          deviceData={selectedReceiptDevice}
        />

        {/* Payment QR Modal */}
        <PaymentQrModal
          isOpen={Boolean(selectedPaymentQrDevice)}
          onClose={() => setSelectedPaymentQrDevice(null)}
          paymentData={selectedPaymentQrDevice}
          onPaymentUpdated={() => loadData()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Welcome Header & Quick Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-600" /> Executive Operations Dashboard
          </h2>
          <p className="text-xs text-slate-500">
            Real-time overview of inventory stock, dealer dispatches, vehicle installations, and monthly payment collection.
          </p>
        </div>

        {/* Quick Action Shortcuts */}
        <div className="flex flex-wrap items-center gap-2">
          {isDealer ? (
            <>
              <button
                onClick={() => onNavigateTab('inventory')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Boxes className="w-3.5 h-3.5" /> View My Stock ({totalDevices})
              </button>
              <button
                onClick={() => onNavigateTab('installations')}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Record Vehicle Installation
              </button>
            </>
          ) : (
            <>
              <a
                href="/api/reports/export-daily-distribution"
                download
                className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                title="Download Excel spreadsheet of the Daily Master Stock Distribution Matrix across all locations"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Daily Report (Excel)
              </a>

              <button
                onClick={() => handleOpenMonthlyExportModal('AUGUST')}
                className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                title="Download Excel statement of payments received in August, July, or any month"
              >
                <Receipt className="w-3.5 h-3.5 text-emerald-600" /> Download Monthly Payments
              </button>

              <button
                onClick={() => onNavigateTab('installations')}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> New Install
              </button>

              <button
                onClick={() => onNavigateTab('reports')}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Table className="w-3.5 h-3.5 text-slate-600" /> Reports Hub
              </button>
            </>
          )}
        </div>
      </div>

      {/* Enterprise Operations Telemetry Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 1. Stale Stock Aging Alert */}
        <button
          onClick={() => handleOpenAgingModal()}
          className="p-3.5 rounded-2xl border bg-amber-50/70 border-amber-200/80 hover:bg-amber-100/80 transition-all text-left cursor-pointer shadow-2xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Dead-Stock / Aging</span>
            <Clock className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-amber-950 font-mono">{totals?.stale_stock_count || stats?.alerts?.stale_stock || 0}</span>
            <span className="text-[10px] text-amber-800 font-medium">Idle &gt; 45d</span>
          </div>
          <p className="text-[10px] text-amber-700 mt-0.5">Click for 1-click dealer stock nudge</p>
        </button>

        {/* 2. SIM Expiry Alert */}
        <button
          onClick={() => handleOpenSimModal()}
          className="p-3.5 rounded-2xl border bg-blue-50/70 border-blue-200/80 hover:bg-blue-100/80 transition-all text-left cursor-pointer shadow-2xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-blue-800 tracking-wider">SIM Validity Alert</span>
            <Activity className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-blue-950 font-mono">{totals?.sim_expiring_count || stats?.alerts?.sim_expiring || 0}</span>
            <span className="text-[10px] text-blue-800 font-medium">Expiring in 30d</span>
          </div>
          <p className="text-[10px] text-blue-700 mt-0.5">Telecom data recharge watcher</p>
        </button>

        {/* 3. AMC & Warranty Renewal */}
        <button
          onClick={() => onNavigateTab('customers')}
          className="p-3.5 rounded-2xl border bg-emerald-50/70 border-emerald-200/80 hover:bg-emerald-100/80 transition-all text-left cursor-pointer shadow-2xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Annual Renewal Due</span>
            <Receipt className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-emerald-950 font-mono">{totals?.amc_due_count || upcomingExpiries?.length || 0}</span>
            <span className="text-[10px] text-emerald-800 font-medium">365d Subscriptions</span>
          </div>
          <p className="text-[10px] text-emerald-700 mt-0.5">Auto-send WhatsApp UPI links</p>
        </button>

        {/* 4. RMA Warranty Pipeline */}
        <button
          onClick={() => onNavigateTab('inventory')}
          className="p-3.5 rounded-2xl border bg-purple-50/70 border-purple-200/80 hover:bg-purple-100/80 transition-all text-left cursor-pointer shadow-2xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-purple-800 tracking-wider">RMA Repairs Lab</span>
            <Wrench className="w-4 h-4 text-purple-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-purple-950 font-mono">{totals?.active_rma_count || stats?.alerts?.active_rma || 0}</span>
            <span className="text-[10px] text-purple-800 font-medium">Active Warranty</span>
          </div>
          <p className="text-[10px] text-purple-700 mt-0.5">OEM replacement tracker</p>
        </button>
      </div>

      {/* List / Brand / Sheet Selector Bar */}
      <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Layers className="w-4 h-4 text-purple-600" />
            <span>Select Device List / Brand (VAMO, VOLTY, TRACKNOW)</span>
          </div>
          {isFiltered && (
            <button
              onClick={handleResetFilters}
              className="text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-1 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer w-fit shadow-2xs"
            >
              <RotateCcw className="w-3 h-3 text-purple-600" />
              <span>Reset to All Master Stock</span>
            </button>
          )}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Quick List / Model Pills (VAMO, VOLTY, TRACKNOW, etc.) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setSelectedDeviceTypeId(''); setSelectedBatchId(''); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                !selectedDeviceTypeId && !selectedBatchId
                  ? 'bg-purple-600 text-white border-purple-600 shadow-2xs ring-2 ring-purple-200'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-purple-50 hover:border-purple-300'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>All Lists / Fleet</span>
            </button>

            {deviceTypes.map(dt => {
              const isSelected = selectedDeviceTypeId === dt.id.toString() && !selectedBatchId;
              return (
                <button
                  key={dt.id}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedDeviceTypeId('');
                    } else {
                      setSelectedDeviceTypeId(dt.id.toString());
                      setSelectedBatchId('');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-purple-600 text-white border-purple-600 shadow-2xs ring-2 ring-purple-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-purple-50 hover:border-purple-300'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>{dt.name}</span>
                </button>
              );
            })}
          </div>

          {/* Upload Batch Dropdown */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-700 shadow-2xs">
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={selectedBatchId}
                onChange={(e) => {
                  setSelectedBatchId(e.target.value);
                  if (e.target.value) {
                    setSelectedDeviceTypeId('');
                  }
                }}
                className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none max-w-[200px] truncate cursor-pointer"
              >
                <option value="">All Upload Sheets...</option>
                {visibleBatches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.notes ? `${b.notes} (${b.source_file || 'Excel'})` : b.source_file}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Active Filter Notification Pill */}
        {isFiltered && (
          <div className="flex items-center justify-between bg-purple-50/80 border border-purple-200 rounded-xl px-3 py-2 text-xs text-purple-950 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
              <span>
                Viewing Dashboard for:{' '}
                <strong className="font-bold text-purple-900">
                  {selectedBatchObj
                    ? `Upload List "${selectedBatchObj.notes || selectedBatchObj.source_file}"`
                    : selectedTypeObj
                    ? `Device List "${selectedTypeObj.name}"`
                    : ''}
                </strong>
                {locationFilter ? ` at ${locationFilter}` : ''}
              </span>
            </div>
            <span className="font-mono font-bold text-purple-800 bg-purple-100/90 px-2.5 py-0.5 rounded-md text-[11px]">
              {totalDevices} Total Devices
            </span>
          </div>
        )}
      </div>

      {/* 5 Core Inventory KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* 1. Total Master Stock */}
        <div
          onClick={() => onNavigateTab('inventory')}
          className="glass-panel p-4 rounded-2xl hover:border-purple-300 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Master Stock</span>
            <div className="p-1.5 rounded-xl bg-purple-50 text-purple-700 group-hover:bg-purple-700 group-hover:text-white transition-colors">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">{totalDevices}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Entire fleet stock</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-600" />
          </div>
        </div>

        {/* 2. Total In-Stock (Available / Uninstalled) */}
        <div
          onClick={() => onNavigateTab('inventory')}
          className="glass-panel p-4 rounded-2xl hover:border-emerald-300 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total In-Stock</span>
            <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-800 group-hover:bg-emerald-800 group-hover:text-white transition-colors">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">{inStockCount}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Ready for install</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
          </div>
        </div>

        {/* 3. Installed In Vehicles */}
        <div
          onClick={() => onNavigateTab('installations')}
          className="glass-panel p-4 rounded-2xl hover:border-emerald-300 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Installed In Vehicles</span>
            <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-800 group-hover:bg-emerald-800 group-hover:text-white transition-colors">
              <Car className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-850">{installed}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{totalDevices > 0 ? Math.round((installed / totalDevices) * 100) : 0}% deployed</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
          </div>
        </div>

        {/* 4. Dispatched to Dealers */}
        <div
          onClick={() => onNavigateTab('inventory')}
          className="glass-panel p-4 rounded-2xl hover:border-amber-300 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">With Dealers</span>
            <div className="p-1.5 rounded-xl bg-amber-50 text-amber-800 group-hover:bg-amber-800 group-hover:text-white transition-colors">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-900">{withDealer}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Dealer branches</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600" />
          </div>
        </div>

        {/* 5. Unassigned Ready Stock */}
        <div
          onClick={() => onNavigateTab('inventory')}
          className="glass-panel p-4 rounded-2xl hover:border-slate-300 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Unassigned Stock</span>
            <div className="p-1.5 rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-800 group-hover:text-white transition-colors">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">{inWarehouse}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Central stock</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900" />
          </div>
        </div>

      </div>

      {/* Row 2: Financials & Dealer Allocations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Daily & Custom Range Payments & Revenue Telemetry Hub */}
        <div className="glass-panel p-5 rounded-2xl space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>Payments & Revenue Collections</span>
            </div>
            {/* Live Today's Collections Badge */}
            {paymentsData?.kpis && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 animate-pulse">
                Today: ₹{(paymentsData.kpis.today_collected_amount || 0).toLocaleString('en-IN')}
              </span>
            )}
          </div>

          {/* Date Range Selection Tabs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500" />
                <span>Select Period:</span>
              </span>
              {loadingPayments && <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />}
            </div>

            <div className="grid grid-cols-3 gap-1 text-[10px] font-bold">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'this_week', label: 'Last 7D' },
                { id: 'this_month', label: 'This Month' },
                { id: 'all', label: 'All Time' },
                { id: 'custom', label: 'Custom 📅' }
              ].map((tab) => {
                const active = paymentsRange === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPaymentsRange(tab.id)}
                    className={`py-1 px-1.5 rounded-lg border transition-all cursor-pointer text-center ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-black'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Date Pickers when 'custom' is active */}
            {paymentsRange === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-1 animate-in fade-in duration-150">
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 mb-0.5">From Date</label>
                  <input
                    type="date"
                    value={paymentStartDate}
                    onChange={(e) => setPaymentStartDate(e.target.value)}
                    className="w-full text-xs font-mono p-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 mb-0.5">To Date</label>
                  <input
                    type="date"
                    value={paymentEndDate}
                    onChange={(e) => setPaymentEndDate(e.target.value)}
                    className="w-full text-xs font-mono p-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-1">
            {/* KPI 1: Today's Collection vs Period Collection */}
            <div className="p-3 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl border border-emerald-200 text-emerald-950">
              <div className="flex items-center justify-between text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                <span>Collections in {paymentsRange.replace('_', ' ').toUpperCase()}</span>
                <span className="bg-emerald-200/80 text-emerald-900 px-1.5 py-0.5 rounded font-mono font-bold">
                  {paymentsData?.kpis?.period_collected_count || 0} Paid Units
                </span>
              </div>
              <div className="text-xl font-black font-mono text-emerald-800 mt-1">
                ₹{(paymentsData?.kpis?.period_collected_amount || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-emerald-700 font-medium mt-0.5 flex items-center justify-between">
                <span>Today's Total: ₹{(paymentsData?.kpis?.today_collected_amount || 0).toLocaleString('en-IN')}</span>
                <span>({paymentsData?.kpis?.today_collected_count || 0} today)</span>
              </div>
            </div>

            {/* KPI 2: Pending Receivables & Collection Rate */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 bg-red-50 rounded-xl border border-red-200 text-red-950 flex flex-col justify-between">
                <div className="text-[10px] font-bold text-red-700 uppercase">Pending Due</div>
                <div className="text-sm font-bold font-mono text-red-800 mt-0.5">
                  ₹{(paymentsData?.kpis?.period_pending_amount || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-[9px] text-red-600 font-medium mt-0.5">
                  {paymentsData?.kpis?.period_pending_count || 0} pending units
                </div>
              </div>

              <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-200 text-blue-950 flex flex-col justify-between">
                <div className="text-[10px] font-bold text-blue-700 uppercase">Efficiency</div>
                <div className="text-sm font-bold font-mono text-blue-800 mt-0.5">
                  {paymentsData?.kpis?.collection_rate || 0}%
                </div>
                <div className="text-[9px] text-blue-600 font-medium mt-0.5">
                  Collection Rate
                </div>
              </div>
            </div>

            {/* Collection Progress Bar */}
            <div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, paymentsData?.kpis?.collection_rate || 0)}%` }}
                />
              </div>
            </div>

            {/* Action Buttons: 1-Click Excel Download & Ledger View */}
            <div className="pt-1 space-y-1.5">
              <a
                href={getPaymentsExcelDownloadUrl({
                  range: paymentsRange,
                  start_date: paymentStartDate,
                  end_date: paymentEndDate,
                  device_type_id: selectedDeviceTypeId
                })}
                download
                className="w-full px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                title="Download Excel statement of payments for the selected date range"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export {paymentsRange.replace('_', ' ').toUpperCase()} Payments Excel</span>
              </a>

              <button
                type="button"
                onClick={() => setShowPaymentsTransactions(!showPaymentsTransactions)}
                className="w-full px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Table className="w-3.5 h-3.5 text-slate-500" />
                <span>{showPaymentsTransactions ? 'Hide Transactions Ledger' : `View Ledger (${paymentsData?.transactions?.length || 0})`}</span>
              </button>
            </div>

          </div>
        </div>


        {/* Dealer Stock Allocation Matrix */}
        <div className="lg:col-span-2 glass-panel p-5 rounded-2xl space-y-4 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Building className="w-4 h-4 text-indigo-600" />
              <span>Dealer & Branch Stock Allocation Matrix</span>
            </div>
            <button
              onClick={() => onNavigateTab('inventory')}
              className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              View Grid <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[260px] pr-1 space-y-2.5 flex-1">
            {dealerAllocations.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No dealer or branch stock allocations recorded yet.
              </div>
            ) : (
              dealerAllocations.map((d, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedDealerModal(d.dealer)}
                  className="p-3.5 bg-slate-50 hover:bg-indigo-50/80 hover:border-indigo-300 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs transition-all cursor-pointer shadow-2xs group"
                  title={`Click to view complete stock dossier, sent devices, and installation stats for ${d.dealer}`}
                >
                  <div className="space-y-1">
                    <div className="font-bold text-slate-900 group-hover:text-indigo-700 flex items-center gap-1.5 transition-colors">
                      <span className="w-2 h-2 rounded-full bg-indigo-600" />
                      <span>{d.dealer}</span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-indigo-100 text-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity">
                        View Dossier →
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-3">
                      <span>Installed: <strong className="text-emerald-700 font-mono">{d.installed}</strong></span>
                      <span>In Stock: <strong className="text-blue-700 font-mono">{d.in_stock}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="text-right">
                      <span className="font-mono font-bold text-indigo-700 text-sm">{d.total}</span>
                      <div className="text-[10px] text-slate-400">Total Units</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Itemized Payments Ledger Table Section (Collapsible / Interactive) */}
      {showPaymentsTransactions && (
        <div className="glass-panel p-5 rounded-2xl space-y-4 shadow-md border border-emerald-200 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <span>Daily & Period Itemized Payments Ledger ({paymentsRange.replace('_', ' ').toUpperCase()})</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Detailed transaction records for {paymentsData?.filter?.start_date} to {paymentsData?.filter?.end_date}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by IMEI, Vehicle, Customer, Dealer..."
                  value={paymentLedgerSearch}
                  onChange={(e) => setPaymentLedgerSearch(e.target.value)}
                  className="pl-8.5 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <a
                href={getPaymentsExcelDownloadUrl({
                  range: paymentsRange,
                  start_date: paymentStartDate,
                  end_date: paymentEndDate,
                  device_type_id: selectedDeviceTypeId
                })}
                download
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Excel</span>
              </a>

              <button
                type="button"
                onClick={() => setShowPaymentsTransactions(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                title="Close Ledger"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-[380px] rounded-xl border border-slate-200">
            {(() => {
              const allTx = paymentsData?.transactions || [];
              const q = paymentLedgerSearch.trim().toLowerCase();
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
                  <div className="text-center py-10 text-xs text-slate-400 bg-slate-50">
                    No payment records found for {paymentsRange.replace('_', ' ')} matching "{paymentLedgerSearch}".
                  </div>
                );
              }

              return (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white text-[11px] uppercase tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Payment Date</th>
                      <th className="py-2.5 px-3">IMEI / Model</th>
                      <th className="py-2.5 px-3">Vehicle Number</th>
                      <th className="py-2.5 px-3">Customer KYC</th>
                      <th className="py-2.5 px-3">Stock Place / Dealer</th>
                      <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3">Received By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredTx.map((tx, idx) => (
                      <tr key={tx.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-medium text-slate-700">{tx.payment_date}</td>
                        <td className="py-2 px-3">
                          <div className="font-mono font-bold text-slate-900">{tx.imei_number}</div>
                          <div className="text-[10px] text-slate-500">{tx.device_type_name}</div>
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-indigo-700">{tx.vehicle_number}</td>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-800">{tx.customer_name}</div>
                          {tx.customer_phone && tx.customer_phone !== '—' && (
                            <div className="text-[10px] text-slate-500 font-mono">{tx.customer_phone}</div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{tx.stock_place}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {tx.amount_formatted}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            tx.payment_status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-red-100 text-red-800 border border-red-200'
                          }`}>
                            {tx.payment_status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600 text-[11px]">{tx.payment_received_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}


      {/* Row 3: Vendor Brand Share & Upcoming Expiries Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Vendor Inventory Share (Vamosys, Volty, TrackNow) */}
        <div className="glass-panel p-5 rounded-2xl space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Boxes className="w-4 h-4 text-blue-600" />
              <span>Vendor Inventory Breakdown (Vamosys / Volty / TrackNow)</span>
            </div>
          </div>

          <div className="space-y-3">
            {typeCounts.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">No vendor device models found.</div>
            ) : (
              typeCounts.map((t) => {
                const isSelected = selectedDeviceTypeId === t.id.toString() && !selectedBatchId;
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedDeviceTypeId('');
                      } else {
                        setSelectedDeviceTypeId(t.id.toString());
                        setSelectedBatchId('');
                      }
                    }}
                    className={`p-3 rounded-xl border space-y-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-purple-50/80 border-purple-400 shadow-2xs ring-2 ring-purple-200'
                        : 'bg-slate-50 border-slate-200 hover:bg-purple-50/40 hover:border-purple-300'
                    }`}
                    title={`Click to filter dashboard for ${t.device_type}`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span className={isSelected ? 'text-purple-700 font-extrabold' : ''}>{t.device_type}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-normal bg-slate-200 text-slate-700">{t.category}</span>
                        {isSelected && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-600 text-white">Active List</span>
                        )}
                      </div>
                      <span className="font-mono font-bold text-slate-900">{t.total_count} units</span>
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden flex">
                        <div
                          className="bg-emerald-500 h-1.5"
                          style={{ width: `${t.total_count > 0 ? (t.installed_count / t.total_count) * 100 : 0}%` }}
                          title={`Installed: ${t.installed_count}`}
                        />
                        <div
                          className="bg-indigo-500 h-1.5"
                          style={{ width: `${t.total_count > 0 ? (t.with_dealer_count / t.total_count) * 100 : 0}%` }}
                          title={`With Dealer: ${t.with_dealer_count}`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="text-emerald-700">● Installed: {t.installed_count}</span>
                      <span className="text-amber-800">● With Dealer: {t.with_dealer_count}</span>
                      <span className="text-slate-600">● Unassigned: {t.in_warehouse_count}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 30-Day SIM & Warranty Expiry Alert Widget */}
        <div className="glass-panel p-5 rounded-2xl space-y-4 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Upcoming 30-Day SIM & Warranty Expiries</span>
            </div>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              {upcomingExpiries.length} Renewal Alerts
            </span>
          </div>

          <div className="overflow-y-auto max-h-[280px] space-y-2.5 flex-1 pr-1">
            {upcomingExpiries.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                ✅ No vehicles expiring in the next 30 days. All warranty and SIM validities are active.
              </div>
            ) : (
              upcomingExpiries.map((exp) => {
                const isOverdue = exp.days_remaining < 0;
                const isUrgent = exp.days_remaining <= 15 && !isOverdue;

                return (
                  <div
                    key={exp.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                      isOverdue
                        ? 'bg-red-50/70 border-red-200 text-red-900'
                        : isUrgent
                        ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold flex items-center gap-1.5">
                        <Car className={`w-3.5 h-3.5 ${isOverdue ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-slate-600'}`} />
                        <span className="font-mono">{exp.vehicle_number}</span>
                        <span className="text-slate-500 font-normal">({exp.customer_name})</span>
                        <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          isOverdue
                            ? 'bg-red-100 text-red-800'
                            : isUrgent
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {isOverdue ? `Overdue (${Math.abs(exp.days_remaining)}d)` : `${exp.days_remaining} days left`}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        IMEI: <span className="font-mono">{exp.imei_number}</span> • Valid Till: <strong className="font-mono">{exp.warranty_end_date}</strong>
                      </div>
                    </div>

                    <a
                      href={`https://api.whatsapp.com/send?phone=${String(exp.customer_contact || '').replace(/[^0-9]/g, '')}&text=${encodeURIComponent(
                        `Hello ${exp.customer_name},\n\nYour GPS device subscription & certificate for vehicle *${exp.vehicle_number}* (IMEI: ${exp.imei_number}) is due for renewal on *${exp.warranty_end_date}*.\n\nPlease contact FuelTracks support to renew your SIM & certificate validity.\n\nThank you!`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Send WhatsApp renewal reminder to customer"
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 shrink-0 shadow-2xs cursor-pointer"
                    >
                      <span>💬</span> WhatsApp
                    </a>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Row 4: Live Operations Activity Stream with Full Records & CSV Export */}
      <div className="glass-panel p-5 rounded-2xl space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Activity className="w-4 h-4 text-purple-600" />
            <span>Live Operations Activity Feed</span>
            <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
              {recentActivity.length} Recent Edits
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportRecentActivityCsv}
              disabled={recentActivity.length === 0}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              title="Download all live operations activity and team edit records as Excel/CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Activity Log (Excel/CSV)</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[380px] rounded-xl border border-slate-200">
          {recentActivity.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">
              No recent activity logged yet. Operations will appear here live as teams update records.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/90 sticky top-0 z-10 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Performed By</th>
                  <th className="p-3">IMEI & Device</th>
                  <th className="p-3">Vehicle & Customer</th>
                  <th className="p-3">Change Details / Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {recentActivity.map((act) => {
                  const isSales = /sales/i.test(act.performed_by || '');
                  const isAdmin = /admin|operations|warehouse|tech/i.test(act.performed_by || '');
                  const isOwner = /owner|super/i.test(act.performed_by || '');

                  return (
                    <tr key={act.id} className="hover:bg-slate-50 transition-colors">
                      {/* Timestamp */}
                      <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {act.event_date || 'Just now'}
                      </td>

                      {/* Performed By */}
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                          isSales
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : isAdmin
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : 'bg-purple-100 text-purple-800 border border-purple-200'
                        }`}>
                          {isSales ? '💼' : isAdmin ? '🛠️' : '👑'} {act.performed_by || 'Admin'}
                        </span>
                      </td>

                      {/* IMEI & Device */}
                      <td className="p-3 font-mono">
                        <button
                          onClick={() => onOpenTraceDrawer(act.imei_number)}
                          className="font-bold text-slate-900 hover:text-purple-700 hover:underline"
                        >
                          {act.imei_number}
                        </button>
                        <div className="text-[10px] text-slate-400">{act.device_type_name || 'GPS Tracker'}</div>
                      </td>

                      {/* Vehicle & Customer */}
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{act.vehicle_number || '-'}</div>
                        <div className="text-[11px] text-slate-500">{act.customer_name || '-'}</div>
                      </td>

                      {/* Diff Details */}
                      <td className="p-3 max-w-sm">
                        <div className="p-2 bg-slate-50 rounded-xl border border-slate-200/80 font-mono text-[11px] text-slate-700 space-y-0.5">
                          {act.remarks ? act.remarks.split('; ').map((part, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                              <span>{part}</span>
                            </div>
                          )) : (
                            <span>Record updated</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Monthly Payment Excel Export Modal */}
      {isMonthlyExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-5 overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Download Monthly Payments Excel</h3>
                  <p className="text-xs text-slate-500">
                    Export records for which you received payments in <strong>August</strong>, July, or any month.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMonthlyExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              
              {/* 1. Device List / Batch Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-600" />
                  <span>1. Select Device List / Batch (Optional)</span>
                </label>
                <select
                  value={exportBatchId}
                  onChange={(e) => setExportBatchId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200"
                >
                  <option value="">All Upload Lists & Master Batches</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.notes ? `${b.notes} (${b.source_file})` : b.source_file}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Month Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. Select Payment Month</span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {MONTHS_LIST.map((m) => {
                    const isSelected = exportMonth === m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setExportMonth(m.key)}
                        className={`p-2 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-200'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300'
                        }`}
                      >
                        <div>{m.label}</div>
                        {m.badge && (
                          <span className={`text-[9px] font-normal block ${isSelected ? 'text-emerald-100' : 'text-emerald-600'}`}>
                            {m.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Payment Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                  <span>3. Payment Status Filter</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'RECEIVED', label: '✅ Paid Only', desc: 'Amount Received' },
                    { id: 'PENDING', label: '⏳ Pending Only', desc: 'Payment Due' },
                    { id: 'ALL', label: '📋 All Records in Month', desc: 'Paid + Pending' }
                  ].map(p => {
                    const isSelected = exportPaymentStatus === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setExportPaymentStatus(p.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-purple-50 text-purple-900 border-purple-400 ring-2 ring-purple-200'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-purple-50/50'
                        }`}
                      >
                        <div className="text-xs font-bold">{p.label}</div>
                        <div className="text-[10px] text-slate-500">{p.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Format Info Note */}
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  Downloading records for <strong>{exportMonth}</strong> ({exportPaymentStatus === 'RECEIVED' ? 'Paid Received only' : exportPaymentStatus === 'PENDING' ? 'Pending only' : 'All'}). The Excel sheet includes: <em>Month, IMEI, Device Model, Vehicle No, Customer Name, Phone, Total Cost, Payment Status, Amount Received By, and Stock Place</em>.
                </p>
              </div>

            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsMonthlyExportModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isExportingExcel}
                onClick={handleDownloadMonthlyExcel}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
              >
                {isExportingExcel ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Generating Excel...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> Download Excel ({exportMonth})
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Dead-Stock & Aging Analysis Modal */}
      {isAgingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs overflow-y-auto animate-in fade-in-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden my-auto">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold">Uninstalled Stock Aging & Dead-Stock Analysis</h3>
              </div>
              <button onClick={() => setIsAgingModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {loadingAging ? (
                <div className="p-8 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin text-amber-600 mx-auto mb-2" />
                  <span>Computing aging brackets across all dealer stock...</span>
                </div>
              ) : !agingData ? (
                <div className="p-8 text-center text-slate-400">No aging records found.</div>
              ) : (
                <>
                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-bold text-red-700">🔴 Stale Stock (&gt; 60 Days)</span>
                      <p className="text-xl font-black text-red-950 font-mono mt-0.5">{agingData.summary?.staleCount || 0}</p>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-bold text-amber-700">🟡 Aging Stock (30-60 Days)</span>
                      <p className="text-xl font-black text-amber-950 font-mono mt-0.5">{agingData.summary?.agingCount || 0}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-bold text-emerald-700">🟢 Fresh Stock (&lt; 30 Days)</span>
                      <p className="text-xl font-black text-emerald-950 font-mono mt-0.5">{agingData.summary?.freshCount || 0}</p>
                    </div>
                  </div>

                  {/* Stale & Aging Devices Table */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" /> Stale Devices Requiring Action ({[...(agingData.stale || []), ...(agingData.aging || [])].length} Units)
                    </h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold sticky top-0">
                          <tr>
                            <th className="p-2.5 border-b border-r border-slate-200">IMEI Serial</th>
                            <th className="p-2.5 border-b border-r border-slate-200">Current Holder / Stock Place</th>
                            <th className="p-2.5 border-b border-r border-slate-200 text-center">Age (Days)</th>
                            <th className="p-2.5 border-b border-slate-200 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {[...(agingData.stale || []), ...(agingData.aging || [])].map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-2.5 font-mono font-bold text-slate-900 border-r border-slate-100">{item.imei_number}</td>
                              <td className="p-2.5 font-bold text-slate-700 border-r border-slate-100">{item.current_holder_name}</td>
                              <td className="p-2.5 text-center font-mono font-black border-r border-slate-100">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] ${item.age_days > 60 ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'}`}>
                                  {item.age_days} Days
                                </span>
                              </td>
                              <td className="p-2.5 text-center">
                                <button
                                  onClick={() => handleNudgeDealerWhatsApp(item.current_holder_name, 1, [item.imei_number])}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                                >
                                  Nudge (WA)
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsAgingModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIM Card Validity & Telecom Expiry Modal */}
      {isSimModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs overflow-y-auto animate-in fade-in-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden my-auto">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold">M2M / eSIM Telecom Validity & Expiry Watcher</h3>
              </div>
              <button onClick={() => setIsSimModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {loadingSim ? (
                <div className="p-8 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
                  <span>Checking SIM telecom plans and expiry timelines...</span>
                </div>
              ) : !simData ? (
                <div className="p-8 text-center text-slate-400">No SIM records found.</div>
              ) : (
                <>
                  {/* Telecom Carrier Pills */}
                  <div className="flex flex-wrap items-center gap-2">
                    {Object.entries(simData.data?.carrier_counts || {}).map(([carrier, count]) => (
                      <span key={carrier} className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-bold text-blue-900">
                        📶 {carrier}: <strong className="font-mono text-blue-950">{count}</strong>
                      </span>
                    ))}
                  </div>

                  {/* Expiring Soon Table */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" /> SIMs Expiring in Next 30 Days ({simData.summary?.expiringSoonCount || 0} Units)
                    </h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[360px] overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold sticky top-0">
                          <tr>
                            <th className="p-2.5 border-b border-r border-slate-200">Device IMEI</th>
                            <th className="p-2.5 border-b border-r border-slate-200 font-mono">SIM / ICCID</th>
                            <th className="p-2.5 border-b border-r border-slate-200">Vehicle / Customer</th>
                            <th className="p-2.5 border-b border-slate-200 text-center">Days Remaining</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {(simData.data?.expiring_soon || []).map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-2.5 font-mono font-bold text-slate-900 border-r border-slate-100">{item.imei_number}</td>
                              <td className="p-2.5 font-mono text-blue-700 border-r border-slate-100">{item.sim_number} ({item.sim_operator})</td>
                              <td className="p-2.5 text-slate-800 border-r border-slate-100">{item.vehicle_number || item.customer_name || item.current_holder_name}</td>
                              <td className="p-2.5 text-center font-mono font-black">
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-900">
                                  {item.days_remaining} Days
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsSimModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dealer Stock & Performance Detail Dossier Modal */}
      <DealerDetailModal
        isOpen={Boolean(selectedDealerModal)}
        onClose={() => setSelectedDealerModal(null)}
        dealerName={selectedDealerModal}
        onOpenDeviceCard={onOpenTraceDrawer}
      />

      {/* Official Fitment Slip & Payment Receipt Modal */}
      <FitmentReceiptModal
        isOpen={Boolean(selectedReceiptDevice)}
        onClose={() => setSelectedReceiptDevice(null)}
        deviceData={selectedReceiptDevice}
      />

      {/* Customer UPI Payment QR Code Generator Modal */}
      <PaymentQrModal
        isOpen={Boolean(selectedPaymentQrDevice)}
        onClose={() => setSelectedPaymentQrDevice(null)}
        paymentData={selectedPaymentQrDevice}
        onPaymentUpdated={() => loadData()}
      />

    </div>
  );
}
