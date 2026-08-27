import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Edit3,
  Shield,
  ShieldAlert,
  CheckCircle2,
  Truck,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  AlertTriangle,
  MapPin,
  Building,
  Calendar,
  Download,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  User,
  Car,
  CreditCard,
  Layers,
  Zap,
  ChevronDown,
  QrCode
} from 'lucide-react';
import { useAuth, canUserEditField } from '../context/AuthContext';
import {
  fetchDevices,
  fetchDeviceTypes,
  updateDeviceStatus,
  updateDevice,
  deleteDevice,
  deletePurchaseBatch,
  bulkDeleteDevices,
  addDeviceColumn,
  renameDeviceColumn,
  deleteDeviceColumn,
  fetchPurchaseBatches,
  fetchDealersSummary,
  bulkAssignDealer,
  bulkTransferDevices,
  fetchAuditLogs,
  updateQuickPayment
} from '../services/api';
import DeviceDetailCardModal from '../components/DeviceDetailCardModal';
import FitmentReceiptModal from '../components/FitmentReceiptModal';
import ConsolidatedReminderModal from '../components/ConsolidatedReminderModal';
import PaymentQrModal from '../components/PaymentQrModal';
import RmaManagementModal from '../components/RmaManagementModal';
import ImeiVerificationSheet from '../components/ImeiVerificationSheet';
import { buildCustomerCredentialsWhatsAppMessage, buildPaymentDueReminderWhatsAppMessage, formatINR, formatDisplayCellValue } from '../utils/whatsapp';
import { exportDevicesToExcel } from '../utils/excelExport';

export default function InventoryPage({ onOpenTraceDrawer, initialFilter, onClearInitialFilter }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isDealer = user?.role === 'DEALER';
  const canDelete = !isDealer; // Available to Super Admin, Operations Admin, and managerial roles

  const [activeInventoryTab, setActiveInventoryTab] = useState('ALL_STOCK'); // 'ALL_STOCK' | 'VERIFICATION_SHEET'
  const [devices, setDevices] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [columnPreset, setColumnPreset] = useState('ALL'); // 'ALL' | 'COMMERCIAL' | 'TECHNICAL' | 'DEALER'
  const [agingFilter, setAgingFilter] = useState('ALL'); // 'ALL' | 'STALE' | 'AGING' | 'FRESH'
  const [rmaFilter, setRmaFilter] = useState('ALL'); // 'ALL' | 'RMA_ACTIVE'
  const [rmaDevice, setRmaDevice] = useState(null);
  const [isRmaModalOpen, setIsRmaModalOpen] = useState(false);
  const [selectedReceiptDevice, setSelectedReceiptDevice] = useState(null);
  const [selectedPaymentQrDevice, setSelectedPaymentQrDevice] = useState(null);
  const [activePaymentMenuId, setActivePaymentMenuId] = useState(null);
  const [consolidatedReminderModalData, setConsolidatedReminderModalData] = useState(null);
  const [isDealersExpanded, setIsDealersExpanded] = useState(false);

  // Device Detail Specification Card Modal State
  const [detailCardImei, setDetailCardImei] = useState(null);
  const [isDetailCardOpen, setIsDetailCardOpen] = useState(false);

  // Multi-Select & Batch Stock Movement State
  const [selectedDeviceIds, setSelectedDeviceIds] = useState(new Set());
  const [isBulkTransferModalOpen, setIsBulkTransferModalOpen] = useState(false);
  const [transferPlace, setTransferPlace] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferRemarks, setTransferRemarks] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferSuccessMsg, setTransferSuccessMsg] = useState('');

  // Advanced Filter Dropdowns State
  const [stockPlaceFilter, setStockPlaceFilter] = useState('');
  const [salesPersonFilter, setSalesPersonFilter] = useState('');
  const [rtoFilter, setRtoFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [deploymentFilter, setDeploymentFilter] = useState('');
  const [activationFilter, setActivationFilter] = useState('');
  const [copiedImeisMsg, setCopiedImeisMsg] = useState('');

  // Super Admin Team Edits & Activity Audit Log State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditTeamFilter, setAuditTeamFilter] = useState('');

  // Highlight / Notification from Scanner Batch Actions
  const [highlightImeis, setHighlightImeis] = useState(new Set());
  const [highlightNotice, setHighlightNotice] = useState('');

  // Delete Batch / List State
  const [deletingBatchRecord, setDeletingBatchRecord] = useState(null);

  // Status Change Modal State
  const [statusEditingDevice, setStatusEditingDevice] = useState(null);
  const [newStatus, setNewStatus] = useState('FAULTY');
  const [remarks, setRemarks] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Full Row Editing Modal State
  const [editingRowDevice, setEditingRowDevice] = useState(null);
  const [rowFormData, setRowFormData] = useState({
    imei_number: '',
    sim_number: '',
    purchase_price: '',
    additional_attributes: {}
  });
  const [savingRow, setSavingRow] = useState(false);

  // Deletion States
  const [deletingDeviceRecord, setDeletingDeviceRecord] = useState(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isClearListModalOpen, setIsClearListModalOpen] = useState(false);
  const [clearScope, setClearScope] = useState('ALL');
  const [selectedBatchToClear, setSelectedBatchToClear] = useState('');
  const [clearConfirmInput, setClearConfirmInput] = useState('');
  const [deletingLoading, setDeletingLoading] = useState(false);

  // Column Schema Management Modals State
  const [isAddColModalOpen, setIsAddColModalOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColTargetType, setNewColTargetType] = useState('ALL');

  const [renamingCol, setRenamingCol] = useState(null);
  const [newHeaderName, setNewHeaderName] = useState('');

  const [deletingCol, setDeletingCol] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Quick Operational Presets: 'ALL' | 'OFFICE' | 'INSTALLED' | 'READY_STOCK' | 'PENDING_PAYMENT' | 'PAID' | 'ACTIVATED'
  const [quickPreset, setQuickPreset] = useState('ALL');

  // Dealer / Stock Place Filtering & Summary State
  const [dealersSummary, setDealersSummary] = useState([]);
  const [dealerFilter, setDealerFilter] = useState('');

  // Bulk Assign to Dealer Modal State
  const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState(false);
  const [bulkAssignImeisText, setBulkAssignImeisText] = useState('');
  const [bulkAssignStockPlace, setBulkAssignStockPlace] = useState('');
  const [bulkAssignDate, setBulkAssignDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [bulkAssignRemarks, setBulkAssignRemarks] = useState('');
  const [bulkAssignSubmitting, setBulkAssignSubmitting] = useState(false);
  const [bulkAssignSuccessMsg, setBulkAssignSuccessMsg] = useState('');

  // Inline Editing Row State
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineDraftAttrs, setInlineDraftAttrs] = useState({});
  const [inlineSaving, setInlineSaving] = useState(false);

  useEffect(() => {
    loadData();
    refreshDeviceTypes();
    loadPurchaseBatches();
    loadDealersSummary();
  }, [statusFilter, typeFilter, batchFilter]);

  const refreshDeviceTypes = async () => {
    try {
      const res = await fetchDeviceTypes();
      if (res.success) {
        setDeviceTypes(res.data || []);
      }
    } catch (e) {
      console.warn('Failed to refresh device types:', e);
    }
  };

  const loadPurchaseBatches = () => {
    fetchPurchaseBatches().then(res => {
      if (res.success) setBatches(res.data);
    }).catch(err => console.error(err));
  };

  // Handle incoming initialFilter from scanner
  useEffect(() => {
    if (initialFilter) {
      setDealerFilter(''); // Keep all devices visible in table
      if (initialFilter.imeis && Array.isArray(initialFilter.imeis)) {
        setHighlightImeis(new Set(initialFilter.imeis));
        setHighlightNotice(initialFilter.successMessage || `Updated ${initialFilter.imeis.length} device(s) with Stock Place "${initialFilter.stockPlace}".`);
      }
      loadData();
      loadDealersSummary();
    }
  }, [initialFilter]);

  const loadDealersSummary = () => {
    fetchDealersSummary().then(res => {
      if (res.success && Array.isArray(res.data)) {
        setDealersSummary(res.data);
      }
    }).catch(err => console.error(err));
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (isDealer && user?.name) {
        params.dealer_name = user.name;
      }
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.device_type_id = typeFilter;
      if (batchFilter) params.purchase_batch_id = batchFilter;
      if (search) params.search = search;

      const res = await fetchDevices(params);
      if (res.success) {
        setDevices(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Check if a single specific list / brand is selected
  const isSingleListView = Boolean(typeFilter || batchFilter || (devices.length > 0 && new Set(devices.map(d => d.device_type_id)).size === 1));

  // Determine dynamic custom column headers accurately scoped to the active Device Type / Upload List
  const customColumns = useMemo(() => {
    let activeTypeId = typeFilter ? typeFilter.toString() : '';

    if (!activeTypeId && batchFilter) {
      const selectedBatch = batches.find(b => b.id.toString() === batchFilter.toString());
      if (selectedBatch && selectedBatch.device_type_id) {
        activeTypeId = selectedBatch.device_type_id.toString();
      }
    }

    if (!activeTypeId && devices.length > 0) {
      const uniqueTypeIds = new Set(devices.map(d => d.device_type_id).filter(Boolean));
      if (uniqueTypeIds.size === 1) {
        activeTypeId = Array.from(uniqueTypeIds)[0].toString();
      }
    }

    // CASE 1: A specific Device Type is active (e.g. VOLTY, TRACKNOW, or VAMOSYS)
    if (activeTypeId) {
      const targetDt = deviceTypes.find(dt => dt.id.toString() === activeTypeId || dt.name.toLowerCase() === activeTypeId.toLowerCase());
      const keysList = [];
      const seen = new Set();

      // Prioritize the exact registered Excel columns for this device type in their exact uploaded sequence
      if (targetDt && targetDt.custom_fields) {
        let fields = [];
        if (Array.isArray(targetDt.custom_fields)) {
          fields = targetDt.custom_fields;
        } else if (typeof targetDt.custom_fields === 'string') {
          try {
            const p = JSON.parse(targetDt.custom_fields);
            fields = Array.isArray(p) ? p : Object.keys(p);
          } catch {
            fields = [];
          }
        } else if (typeof targetDt.custom_fields === 'object' && targetDt.custom_fields !== null) {
          fields = Object.keys(targetDt.custom_fields);
        }
        fields.forEach(f => {
          if (f && f !== 'original_row' && !/require.*sim/i.test(f) && !seen.has(f)) {
            seen.add(f);
            keysList.push(f);
          }
        });
      }

      // Also include any other attributes actually present on devices belonging to this type
      devices.forEach(dev => {
        if (dev.device_type_id && dev.device_type_id.toString() === activeTypeId && dev.additional_attributes && typeof dev.additional_attributes === 'object') {
          Object.keys(dev.additional_attributes).forEach(k => {
            if (k && k !== 'original_row' && !/require.*sim/i.test(k) && !seen.has(k)) {
              seen.add(k);
              keysList.push(k);
            }
          });
        }
      });

      return keysList;
    }

    // CASE 2: All Types / Mixed View
    const commonPriority = [
      'STOCK PLACE',
      'DATE',
      'STOCK PLACE DATE',
      'VEHICLE NUMBER',
      'CUSTOMER NAME',
      'CUSTOMER PHONE NUMBER',
      'AADHAR NUMBER',
      'CHASIS NUMBER',
      'ENGINE NUMBER',
      'SALES MANAGER',
      'SALES PERSON NAME',
      'RTO LOCATION',
      'COST',
      'TOTAL COST',
      'AMOUNT RECEIVED',
      'CERTIFICATE ISSUED DATE'
    ];

    const keysSet = new Set();
    commonPriority.forEach(k => keysSet.add(k));

    devices.forEach(dev => {
      if (dev.additional_attributes && typeof dev.additional_attributes === 'object') {
        Object.keys(dev.additional_attributes).forEach(k => {
          if (k && k !== 'original_row' && !/require.*sim/i.test(k)) {
            const val = dev.additional_attributes[k];
            if (val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== '-') {
              keysSet.add(k);
            }
          }
        });
      }
    });

    return Array.from(keysSet);
  }, [typeFilter, batchFilter, batches, deviceTypes, devices]);

  // Dynamic Column Preset Filtering
  const displayedColumns = useMemo(() => {
    if (columnPreset === 'ALL') return customColumns;
    if (columnPreset === 'COMMERCIAL') {
      return customColumns.filter(col => 
        /cost|price|amount|paid|rec|payment|tax|gst|invoice|bill|month|customer|party|vehicle|reg/i.test(col)
      );
    }
    if (columnPreset === 'TECHNICAL') {
      return customColumns.filter(col => 
        /sim|iccid|firmware|model|hardware|cert|valid|expiry|box|batch|status/i.test(col)
      );
    }
    if (columnPreset === 'DEALER') {
      return customColumns.filter(col => 
        /stock|place|dealer|location|sales|manager|person|state|rto|branch/i.test(col)
      );
    }
    return customColumns;
  }, [customColumns, columnPreset]);

  const activeDeviceTypeId = useMemo(() => {
    if (typeFilter) return parseInt(typeFilter);
    if (deviceTypes.length > 0) return deviceTypes[0].id;
    return null;
  }, [typeFilter, deviceTypes]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadData();
  };

  const handleStatusUpdate = async () => {
    if (!statusEditingDevice) return;
    setUpdatingStatus(true);
    try {
      const res = await updateDeviceStatus(statusEditingDevice.id, {
        status: newStatus,
        remarks,
        performed_by: 'Warehouse Admin'
      });
      if (res.success) {
        setStatusEditingDevice(null);
        setRemarks('');
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openEditRowModal = (dev) => {
    setEditingRowDevice(dev);
    const draft = dev.additional_attributes ? { ...dev.additional_attributes } : {};
    Object.keys(draft).forEach(k => {
      if (/date|month|validity/i.test(k) && draft[k] !== undefined && draft[k] !== null) {
        draft[k] = formatDisplayCellValue(k, draft[k]);
      }
    });
    setRowFormData({
      imei_number: dev.imei_number || '',
      sim_number: dev.sim_number || '',
      purchase_price: dev.purchase_price !== null && dev.purchase_price !== undefined ? dev.purchase_price.toString() : '',
      additional_attributes: draft
    });
  };

  const handleRowSave = async () => {
    if (!editingRowDevice) return;
    setSavingRow(true);
    try {
      const cleanedAttrs = { ...rowFormData.additional_attributes };
      Object.keys(cleanedAttrs).forEach(k => {
        if (/date|month|validity/i.test(k) && cleanedAttrs[k]) {
          cleanedAttrs[k] = formatDisplayCellValue(k, cleanedAttrs[k]);
        }
      });

      const payload = {
        imei_number: rowFormData.imei_number,
        sim_number: rowFormData.sim_number,
        purchase_price: rowFormData.purchase_price ? parseFloat(rowFormData.purchase_price) : null,
        additional_attributes: cleanedAttrs,
        performed_by: user?.name || user?.role || 'Admin'
      };

      const res = await updateDevice(editingRowDevice.id, payload);
      if (res.success) {
        setEditingRowDevice(null);
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingRow(false);
    }
  };

  const selectedBatchObj = useMemo(() => {
    if (!batchFilter) return null;
    return batches.find(b => b.id.toString() === batchFilter.toString()) || null;
  }, [batchFilter, batches]);

  const visibleBatches = useMemo(() => {
    return batches.filter(b => {
      if (b.live_devices_count !== undefined && b.live_devices_count <= 0) return false;
      if (typeFilter && b.device_type_id && b.device_type_id.toString() !== typeFilter.toString()) return false;
      return true;
    });
  }, [batches, typeFilter]);

  const handleDeleteBatch = async () => {
    if (!deletingBatchRecord) return;
    setDeletingLoading(true);
    try {
      const res = await deletePurchaseBatch(deletingBatchRecord.id);
      if (res.success) {
        setDeletingBatchRecord(null);
        if (batchFilter === deletingBatchRecord.id.toString()) {
          setBatchFilter('');
        }
        refreshDeviceTypes();
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingLoading(false);
    }
  };

  const handleDeleteSingleRecord = async () => {
    if (!deletingDeviceRecord) return;
    setDeletingLoading(true);
    try {
      const res = await deleteDevice(deletingDeviceRecord.id);
      if (res.success) {
        setDeletingDeviceRecord(null);
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingLoading(false);
    }
  };

  const handleClearStockList = async () => {
    if (clearConfirmInput.trim().toUpperCase() !== 'DELETE') {
      alert('Please type "DELETE" to confirm');
      return;
    }
    setDeletingLoading(true);
    try {
      const payload = {};
      if (clearScope === 'BATCH' && selectedBatchToClear) {
        payload.purchase_batch_id = parseInt(selectedBatchToClear);
      } else if (clearScope === 'FILTERED' && typeFilter) {
        payload.device_type_id = parseInt(typeFilter);
      } else {
        payload.clear_all = true;
      }

      const res = await bulkDeleteDevices(payload);
      if (res.success) {
        setIsClearListModalOpen(false);
        setClearConfirmInput('');
        if (clearScope === 'BATCH' && batchFilter === selectedBatchToClear) {
          setBatchFilter('');
        }
        refreshDeviceTypes();
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingLoading(false);
    }
  };

  const handleBulkDeleteSelected = async () => {
    if (selectedDeviceIds.size === 0) return;
    setDeletingLoading(true);
    try {
      const res = await bulkDeleteDevices({ device_ids: Array.from(selectedDeviceIds) });
      if (res.success) {
        setSelectedDeviceIds(new Set());
        setIsBulkDeleteModalOpen(false);
        refreshDeviceTypes();
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Failed to delete selected devices');
    } finally {
      setDeletingLoading(false);
    }
  };

  const handleAddCustomColumnSubmit = async (e) => {
    e.preventDefault();
    if (!newColName.trim()) {
      alert('Please enter a column name');
      return;
    }
    setActionLoading(true);
    try {
      const colNameClean = newColName.trim().toUpperCase();
      const targetId = newColTargetType === 'ALL' ? 'ALL' : (newColTargetType || typeFilter || 'ALL');
      await addDeviceColumn(targetId, colNameClean);
      
      await refreshDeviceTypes();
      await loadData();
      
      setIsAddColModalOpen(false);
      setNewColName('');
      alert(`✅ Column "${colNameClean}" added successfully to stock inventory!`);
    } catch (err) {
      alert('Failed to add custom column: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Load Super Admin Audit Logs
  const loadAuditLogs = async (customParams = {}) => {
    setAuditLoading(true);
    try {
      const q = { ...customParams };
      if (auditSearch) q.search = auditSearch;
      if (auditTeamFilter) q.performed_by = auditTeamFilter;
      const res = await fetchAuditLogs(q);
      if (res.success) {
        setAuditLogs(res.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  // Export Super Admin Audit Logs to CSV
  const handleExportAuditCsv = () => {
    if (auditLogs.length === 0) {
      alert('No audit logs available to export');
      return;
    }
    const headers = [
      'Timestamp',
      'Edited By / User',
      'Event Type',
      'IMEI Number',
      'Device Type',
      'Current Status',
      'Change Details / Diff',
      'Vehicle Number',
      'Customer Name',
      'Cost',
      'Tax',
      'Amount Received',
      'Stock Place'
    ];

    const csvRows = [];
    csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

    auditLogs.forEach(log => {
      const attrs = log.additional_attributes || {};
      const vehKey = Object.keys(attrs).find(k => /vehicle/i.test(k));
      const vehNo = (vehKey && attrs[vehKey]) || '';
      const custKey = Object.keys(attrs).find(k => /customer.*name|customer/i.test(k));
      const custName = (custKey && attrs[custKey]) || '';
      const costKey = Object.keys(attrs).find(k => /^cost$/i.test(k) || /purchase_price/i.test(k));
      const cost = (costKey && attrs[costKey]) || log.purchase_price || '';
      const taxKey = Object.keys(attrs).find(k => /tax/i.test(k));
      const tax = (taxKey && attrs[taxKey]) || '';
      const payKey = Object.keys(attrs).find(k => /amount.*rec|payment/i.test(k));
      const pay = (payKey && attrs[payKey]) || '';
      const placeKey = Object.keys(attrs).find(k => /stock.*place|place/i.test(k));
      const place = (placeKey && attrs[placeKey]) || log.to_holder || '';

      const row = [
        log.event_date || '',
        log.performed_by || 'Admin',
        log.event_type || 'UPDATE',
        log.imei_number || '',
        log.device_type_name || '',
        log.current_device_status || '',
        log.remarks || '',
        vehNo,
        custName,
        cost,
        tax,
        pay,
        place
      ];

      csvRows.push(row.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Team_Edits_Audit_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddColumn = async () => {
    if (!newColName.trim()) return;
    if (!activeDeviceTypeId) {
      alert('Please select or register a Device Type first');
      return;
    }
    setActionLoading(true);
    try {
      await addDeviceColumn(activeDeviceTypeId, newColName.trim());
      setNewColName('');
      setIsAddColModalOpen(false);
      refreshDeviceTypes();
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenameColumn = async () => {
    if (!renamingCol || !newHeaderName.trim()) return;
    setActionLoading(true);
    try {
      const typeId = typeFilter ? parseInt(typeFilter) : 'all';
      await renameDeviceColumn(typeId, renamingCol, newHeaderName.trim());
      setRenamingCol(null);
      setNewHeaderName('');
      refreshDeviceTypes();
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteColumn = async () => {
    if (!deletingCol) return;
    setActionLoading(true);
    try {
      const typeId = typeFilter ? parseInt(typeFilter) : 'all';
      await deleteDeviceColumn(typeId, deletingCol);
      setDeletingCol(null);
      refreshDeviceTypes();
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const map = {
      IN_WAREHOUSE: 'badge-warehouse',
      WITH_DEALER: 'badge-dealer',
      INSTALLED: 'badge-installed',
      FAULTY: 'badge-faulty',
      RETURNED: 'badge-returned'
    };
    return map[status] || 'badge-warehouse';
  };

  // Dynamic extraction of unique filter options with live counts
  const filterOptions = useMemo(() => {
    const stockPlacesMap = {};
    const salesPersonsMap = {};
    const rtoLocationsMap = {};
    let totalInstalled = 0;
    let totalReadyStock = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let totalOfficeStock = 0;
    let totalActivated = 0;
    let totalNotActivated = 0;

    devices.forEach(dev => {
      const attrs = dev.additional_attributes || {};

      // Stock place
      const placeKey = Object.keys(attrs).find(k => /stock.*place|place|location/i.test(k));
      const place = (placeKey && attrs[placeKey] ? String(attrs[placeKey]).trim() : dev.current_holder_name || '').trim();
      if (place) {
        stockPlacesMap[place] = (stockPlacesMap[place] || 0) + 1;
        if (/office/i.test(place)) {
          totalOfficeStock++;
        }
      }

      // Sales person
      const spKey = Object.keys(attrs).find(k => /sales.*(person|manager)/i.test(k));
      const sp = (spKey && attrs[spKey] ? String(attrs[spKey]).trim() : '').trim();
      if (sp) {
        salesPersonsMap[sp] = (salesPersonsMap[sp] || 0) + 1;
      }

      // RTO location
      const rtoKey = Object.keys(attrs).find(k => /rto/i.test(k));
      const rto = (rtoKey && attrs[rtoKey] ? String(attrs[rtoKey]).trim() : '').trim();
      if (rto) {
        rtoLocationsMap[rto] = (rtoLocationsMap[rto] || 0) + 1;
      }

      // Installation / Vehicle
      const vehKey = Object.keys(attrs).find(k => /vehicle|veh_no|reg_no/i.test(k));
      const hasVeh = Boolean(vehKey && String(attrs[vehKey]).trim()) || dev.current_status === 'INSTALLED';
      if (hasVeh) {
        totalInstalled++;
      } else {
        totalReadyStock++;
      }

      // Payment status
      const payKey = Object.keys(attrs).find(k => /amount.*rec|payment|received/i.test(k));
      const payVal = payKey ? String(attrs[payKey] || '').toUpperCase().trim() : '';
      if (hasVeh) {
        const isPaid = (payVal.includes('REC') || payVal.includes('PAID')) && !payVal.includes('NOT') && !payVal.includes('UNPAID');
        if (isPaid) {
          totalPaid++;
        } else {
          totalPending++;
        }
      }

      // Activation status
      const actKey = Object.keys(attrs).find(k => /activat/i.test(k));
      const actVal = actKey ? String(attrs[actKey] || '').toUpperCase().trim() : '';
      if (actVal.includes('YES') || actVal.includes('TRUE') || actVal.includes('ACTIVE')) {
        totalActivated++;
      } else if (actVal.includes('NO') || actVal.includes('FALSE')) {
        totalNotActivated++;
      }
    });

    const stockPlacesList = Object.entries(stockPlacesMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const salesPersonsList = Object.entries(salesPersonsMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const rtoLocationsList = Object.entries(rtoLocationsMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      stockPlacesList,
      salesPersonsList,
      rtoLocationsList,
      totalInstalled,
      totalReadyStock,
      totalPaid,
      totalPending,
      totalOfficeStock,
      totalActivated,
      totalNotActivated
    };
  }, [devices]);

  // Operational Multi-Filter Filtering Engine
  const filteredDevices = useMemo(() => {
    return devices.filter(dev => {
      // 0. Primary Upload List & Device Type Filters
      if (batchFilter && String(dev.purchase_batch_id) !== String(batchFilter)) return false;
      if (typeFilter && String(dev.device_type_id) !== String(typeFilter)) return false;

      const attrs = dev.additional_attributes || {};

      // Vehicle & Installed status
      const vehKey = Object.keys(attrs).find(k => /vehicle|veh_no|reg_no/i.test(k));
      const vehNo = vehKey && attrs[vehKey] ? String(attrs[vehKey]).trim() : '';
      const isInstalled = Boolean(vehNo) || dev.current_status === 'INSTALLED';

      // Payment status
      const payKey = Object.keys(attrs).find(k => /amount.*rec|payment|received/i.test(k));
      const payVal = payKey ? String(attrs[payKey] || '').toUpperCase().trim() : '';
      const isPaid = (payVal.includes('REC') || payVal.includes('PAID')) && !payVal.includes('NOT') && !payVal.includes('UNPAID');
      const isPending = isInstalled && !isPaid;

      // Stock place
      const placeKey = Object.keys(attrs).find(k => /stock.*place|place|location/i.test(k));
      const placeVal = (placeKey && attrs[placeKey] ? String(attrs[placeKey]) : dev.current_holder_name || '').trim();

      // Sales person
      const spKey = Object.keys(attrs).find(k => /sales.*(person|manager)/i.test(k));
      const spVal = (spKey && attrs[spKey] ? String(attrs[spKey]) : '').trim();

      // RTO location
      const rtoKey = Object.keys(attrs).find(k => /rto/i.test(k));
      const rtoVal = (rtoKey && attrs[rtoKey] ? String(attrs[rtoKey]) : '').trim();

      // Activation
      const actKey = Object.keys(attrs).find(k => /activat/i.test(k));
      const actVal = actKey ? String(attrs[actKey] || '').toUpperCase().trim() : '';
      const isActivated = actVal.includes('YES') || actVal.includes('TRUE') || actVal.includes('ACTIVE');

      // 1. Dealer Allocations Bar Selection
      if (dealerFilter && placeVal !== dealerFilter) return false;

      // 2. Quick Preset Pills Filter
      if (quickPreset === 'OFFICE' && !/office/i.test(placeVal)) return false;
      if (quickPreset === 'INSTALLED' && !isInstalled) return false;
      if (quickPreset === 'READY_STOCK' && isInstalled) return false;
      if (quickPreset === 'PENDING_PAYMENT' && !isPending) return false;
      if (quickPreset === 'PAID' && !isPaid) return false;
      if (quickPreset === 'ACTIVATED' && !isActivated) return false;

      // 3. Dropdown Specific Multi-Filters
      if (stockPlaceFilter) {
        if (stockPlaceFilter === '__OFFICE__') {
          if (!/office/i.test(placeVal)) return false;
        } else if (placeVal !== stockPlaceFilter) {
          return false;
        }
      }

      if (paymentFilter === 'PAID' && !isPaid) return false;
      if (paymentFilter === 'PENDING' && !isPending) return false;

      if (deploymentFilter === 'INSTALLED' && !isInstalled) return false;
      if (deploymentFilter === 'READY_STOCK' && isInstalled) return false;

      if (salesPersonFilter && spVal !== salesPersonFilter) return false;
      if (rtoFilter && rtoVal !== rtoFilter) return false;

      if (activationFilter === 'ACTIVATED' && !isActivated) return false;
      if (activationFilter === 'NOT_ACTIVATED' && isActivated) return false;

      // 4. Aging & Dead-Stock Filter
      if (agingFilter && agingFilter !== 'ALL') {
        const pDate = dev.purchase_date || attrs['STOCK PLACE DATE'] || dev.created_at;
        const itemDate = new Date(pDate);
        const now = new Date();
        const ageDays = !isNaN(itemDate.getTime()) ? Math.max(0, Math.floor((now - itemDate) / (1000 * 86400))) : 0;

        if (agingFilter === 'STALE' && (ageDays <= 60 || isInstalled)) return false;
        if (agingFilter === 'AGING' && (ageDays < 30 || ageDays > 60 || isInstalled)) return false;
        if (agingFilter === 'FRESH' && (ageDays >= 30 || isInstalled)) return false;
      }

      // 5. RMA Warranty Repairs Filter
      if (rmaFilter === 'RMA_ACTIVE') {
        if (!dev.rma_status || dev.rma_status === 'NONE') return false;
      }

      return true;
    });
  }, [devices, batchFilter, typeFilter, quickPreset, dealerFilter, stockPlaceFilter, paymentFilter, deploymentFilter, salesPersonFilter, rtoFilter, activationFilter, agingFilter, rmaFilter]);

  // Reset all active filters
  const handleResetAllFilters = () => {
    setSearch('');
    setQuickPreset('ALL');
    setStockPlaceFilter('');
    setSalesPersonFilter('');
    setRtoFilter('');
    setPaymentFilter('');
    setDeploymentFilter('');
    setActivationFilter('');
    setStatusFilter('');
    setTypeFilter('');
    setBatchFilter('');
    setDealerFilter('');
    if (onClearInitialFilter) onClearInitialFilter();
  };

  const isAnyFilterActive = Boolean(
    search ||
    quickPreset !== 'ALL' ||
    stockPlaceFilter ||
    salesPersonFilter ||
    rtoFilter ||
    paymentFilter ||
    deploymentFilter ||
    activationFilter ||
    statusFilter ||
    typeFilter ||
    batchFilter ||
    dealerFilter
  );

  // Multi-Select Handlers
  const handleToggleSelectAll = (checked) => {
    if (checked) {
      setSelectedDeviceIds(new Set(filteredDevices.map(d => d.id)));
    } else {
      setSelectedDeviceIds(new Set());
    }
  };

  const handleToggleSelectRow = (id) => {
    setSelectedDeviceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenBulkTransferModal = () => {
    if (selectedDeviceIds.size === 0) {
      alert('Please select at least one device');
      return;
    }
    setTransferSuccessMsg('');
    setIsBulkTransferModalOpen(true);
  };

  const handleExecuteBulkTransfer = async (e) => {
    e.preventDefault();
    if (!transferPlace.trim()) {
      alert('Please select or enter target Stock Place');
      return;
    }
    setTransferSubmitting(true);
    try {
      const res = await bulkTransferDevices({
        ids: Array.from(selectedDeviceIds),
        stock_place: transferPlace.trim(),
        stock_place_date: transferDate,
        remarks: transferRemarks.trim(),
        performed_by: user?.name || user?.role || 'Operations Team'
      });
      if (res.success) {
        setTransferSuccessMsg(`Successfully transferred ${res.count} device(s) to ${transferPlace}!`);
        setTimeout(() => {
          setIsBulkTransferModalOpen(false);
          setTransferSuccessMsg('');
          setSelectedDeviceIds(new Set());
          loadData();
        }, 1500);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleCopySelectedImeis = () => {
    const selectedDevices = devices.filter(d => selectedDeviceIds.has(d.id));
    const imeis = selectedDevices.map(d => d.imei_number).filter(Boolean);
    if (imeis.length === 0) return;
    navigator.clipboard.writeText(imeis.join('\n'));
    setCopiedImeisMsg(`Copied ${imeis.length} selected IMEI(s) to clipboard!`);
    setTimeout(() => setCopiedImeisMsg(''), 2500);
  };

  // Copy Filtered IMEIs to Clipboard
  const handleCopyFilteredImeis = () => {
    const imeis = filteredDevices.map(d => d.imei_number).filter(Boolean);
    if (imeis.length === 0) {
      alert('No IMEIs in current filtered view');
      return;
    }
    navigator.clipboard.writeText(imeis.join('\n'));
    setCopiedImeisMsg(`Copied ${imeis.length} IMEI(s) to clipboard!`);
    setTimeout(() => setCopiedImeisMsg(''), 2500);
  };

  // Export Filtered Records directly to CSV (clean deduplicated columns and formatted dates)
  const handleExportFilteredCsv = () => {
    if (filteredDevices.length === 0) {
      alert('No records available to export');
      return;
    }

    // Helper to format raw Excel date integers into clean readable dates
    const formatExportValue = (headerName, rawVal) => {
      if (rawVal === undefined || rawVal === null) return '';
      const str = String(rawVal).trim();
      if (!str) return '';

      // Check if it's an Excel serial date number
      if (/date|month|validity/i.test(headerName)) {
        const num = Number(str);
        if (!isNaN(num) && num > 30000 && num < 70000) {
          try {
            const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
            const day = String(dateObj.getUTCDate()).padStart(2, '0');
            const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
            const year = dateObj.getUTCFullYear();
            return `${day}-${month}-${year}`;
          } catch {
            return str;
          }
        }
      }
      return str;
    };

    // Determine final ordered, deduplicated columns
    const isSingleListView = Boolean(typeFilter || batchFilter);
    let exportColumns = [];

    if (isSingleListView) {
      // Exactly the uploaded Excel sheet columns in their 100% original sequence
      exportColumns = [...displayedColumns];
    } else {
      exportColumns = ['Device IMEI', 'Device Type', ...displayedColumns];
    }

    // Build CSV Content
    const csvRows = [];
    csvRows.push(exportColumns.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

    filteredDevices.forEach(dev => {
      const attrs = dev.additional_attributes || {};
      const row = exportColumns.map(header => {
        let val = '';
        if (header === 'Device IMEI' || header === 'IMEI Number' || /vltdsno|^serial\s*number$|^imei|device\s*imei|^uid$/i.test(header.trim())) {
          val = dev.imei_number || (attrs[header] !== undefined && attrs[header] !== null ? String(attrs[header]) : '');
        } else if (header === 'Device Type') {
          val = dev.device_type_name || '';
        } else if (attrs[header] !== undefined && attrs[header] !== null && String(attrs[header]).trim() !== '') {
          val = formatExportValue(header, attrs[header]);
        } else if (/^sim\s*1$|^simno1$|^iccid$|^sim\s*number$/i.test(header.trim())) {
          val = dev.sim_number || '';
        } else {
          // Case-insensitive fallback
          const matchingKey = Object.keys(attrs).find(
            k => k.trim().toUpperCase() === header.trim().toUpperCase()
          );
          if (matchingKey) {
            val = formatExportValue(header, attrs[matchingKey]);
          } else {
            val = '';
          }
        }
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Inventory_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Filtered Live Stock Records directly to Styled Excel (.xlsx)
  const handleExportFilteredExcel = async () => {
    if (filteredDevices.length === 0) {
      alert('No records available to export');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const activeDt = typeFilter ? deviceTypes.find(dt => dt.id.toString() === typeFilter.toString()) : null;
    const activeTypeName = activeDt ? activeDt.name : (batchFilter ? 'Batch_Stock' : 'Inventory_Stock');
    const fileName = `${activeTypeName.replace(/\s+/g, '_')}_List_${today}.xlsx`;

    await exportDevicesToExcel(
      fileName,
      activeTypeName,
      filteredDevices,
      customColumns,
      '1E3A8A' // Royal Navy Blue Header
    );
  };

  // Handle Bulk Dealer Allocation Submit
  const handleBulkAssignSubmit = async (e) => {
    e.preventDefault();
    if (!bulkAssignStockPlace.trim()) {
      alert('Please enter or select a Dealer / Stock Place');
      return;
    }
    const imeis = bulkAssignImeisText
      .split(/[\n,;\t\s]+/)
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length >= 4);

    if (imeis.length === 0) {
      alert('Please enter at least one IMEI number');
      return;
    }

    setBulkAssignSubmitting(true);
    try {
      const res = await bulkAssignDealer({
        imeis,
        stock_place: bulkAssignStockPlace.trim(),
        stock_place_date: bulkAssignDate,
        remarks: bulkAssignRemarks,
        performed_by: user?.username || 'Admin'
      });
      if (res.success) {
        setBulkAssignSuccessMsg(`✅ ${res.message}`);
        loadData();
        loadDealersSummary();
        setTimeout(() => {
          setIsBulkAssignModalOpen(false);
          setBulkAssignSuccessMsg('');
          setBulkAssignImeisText('');
        }, 1300);
      }
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setBulkAssignSubmitting(false);
    }
  };

  // Handle WhatsApp Quick Share
  const handleShareWhatsApp = (dev) => {
    const attrs = dev.additional_attributes || {};
    const phone = attrs['CUSTOMER PHONE NUMBER'] || attrs['Primary Mobile'] || attrs['PRIMARY MOBILE'] || attrs['Phone'] || attrs['Contact'] || attrs['phone_number'] || '';
    const custName = attrs['CUSTOMER NAME'] || attrs['Customer Name'] || attrs['CERTIFICATE ISSUED TO'] || attrs['Name'] || 'Customer';
    const vehKey = Object.keys(attrs).find(k => /vehicle|veh_no|reg_no/i.test(k));
    const vehNo = vehKey && attrs[vehKey] ? String(attrs[vehKey]).trim() : '';
    const userId = attrs['Software User ID'] || attrs['USER ID'] || attrs['User ID'] || '';
    const pass = attrs['Software Password'] || attrs['PASSWORD'] || attrs['Password'] || '123456';

    const wa = buildCustomerCredentialsWhatsAppMessage({
      phone,
      customerName: custName,
      userId,
      password: pass,
      vehicleNumber: vehNo
    });

    window.open(wa.url, '_blank');
  };

  // Handle 1-Click Payment Status Flip
  const handleTogglePaymentStatus = async (dev) => {
    const attrs = { ...(dev.additional_attributes || {}) };
    const currentStatus = String(attrs['AMOUNT RECEIVED'] || attrs['Amount Received'] || '').trim().toUpperCase();
    const newStatus = (currentStatus.includes('NOT') || currentStatus.includes('UNPAID') || currentStatus.includes('PENDING'))
      ? 'RECEIVED'
      : 'NOT RECEIVED';
    
    attrs['AMOUNT RECEIVED'] = newStatus;
    try {
      const res = await updateDevice(dev.id, {
        additional_attributes: attrs,
        performed_by: user?.username || 'Admin'
      });
      if (res.success) {
        setDevices(prev => prev.map(d => d.id === dev.id ? { ...d, additional_attributes: attrs } : d));
      }
    } catch (err) {
      alert('Failed to update payment status: ' + err.message);
    }
  };

  // Robust Payment, Customer & GST Extraction across VAMOSYS, VOLTY, TRACKNOW & custom sheets
  const getDevicePaymentInfo = (dev) => {
    const attrs = dev.additional_attributes || {};
    const keys = Object.keys(attrs);

    // 1. Payment status
    let payVal = '';
    for (const k of keys) {
      if (/amount.*rec|payment.*status|^payment$|^status$/i.test(k.trim()) && attrs[k]) {
        payVal = String(attrs[k]).trim().toUpperCase();
        break;
      }
    }
    const isPaid = (payVal.includes('REC') || payVal.includes('PAID')) && !payVal.includes('NOT') && !payVal.includes('UNPAID') && !payVal.includes('PENDING');

    // 2. Vehicle number
    let vehNo = dev.vehicle_number && dev.vehicle_number !== '-' ? String(dev.vehicle_number).trim() : '';
    if (!vehNo) {
      for (const k of keys) {
        if (/vehicle|veh_no|reg_no|veh.*number/i.test(k.trim()) && attrs[k]) {
          vehNo = String(attrs[k]).trim();
          break;
        }
      }
    }
    const isInstalled = Boolean(vehNo) || dev.current_status === 'INSTALLED';
    const isPending = isInstalled && !isPaid;

    // 3. Customer Phone
    let phone = '';
    for (const k of keys) {
      if (/phone|mobile|contact/i.test(k.trim()) && attrs[k]) {
        phone = String(attrs[k]).trim();
        break;
      }
    }

    // 4. Customer Name
    let custName = dev.customer_name && dev.customer_name !== '-' && !/fuelview/i.test(dev.customer_name) ? String(dev.customer_name).trim() : '';
    if (!custName) {
      for (const k of keys) {
        if (/customer.*name|cert.*issued.*to|party.*name/i.test(k.trim()) && attrs[k] && !/fuelview/i.test(String(attrs[k]))) {
          custName = String(attrs[k]).trim();
          break;
        }
      }
    }
    if (!custName) custName = 'Customer';

    // 5. Cost, GST & Total Cost
    let baseCost = 0;
    let totalCost = 0;
    let gst = 0;

    for (const k of keys) {
      const kTrim = k.trim().toUpperCase();
      if (/^COST$/i.test(kTrim) && attrs[k]) {
        const num = parseFloat(String(attrs[k]).replace(/[^0-9.]/g, ''));
        if (!isNaN(num) && num > 0) baseCost = num;
      } else if (/^TOTAL.*COST$|^SALE.*PRICE$|^AMOUNT$/i.test(kTrim) && attrs[k]) {
        const num = parseFloat(String(attrs[k]).replace(/[^0-9.]/g, ''));
        if (!isNaN(num) && num > 0) totalCost = num;
      } else if (/^GST$|^GST.*AMOUNT$/i.test(kTrim) && attrs[k]) {
        const num = parseFloat(String(attrs[k]).replace(/[^0-9.]/g, ''));
        if (!isNaN(num) && num > 0) gst = num;
      }
    }

    if (!gst && totalCost > baseCost && baseCost > 0) {
      gst = totalCost - baseCost;
    } else if (!totalCost && baseCost > 0) {
      totalCost = baseCost + gst;
    } else if (!baseCost && totalCost > 0) {
      baseCost = totalCost;
    }

    if (!totalCost) {
      totalCost = dev.purchase_price || 4956;
      baseCost = 4200;
      gst = 756;
    }

    // 6. Stock Place
    let stockPlace = dev.current_holder_name || '';
    for (const k of keys) {
      if (/stock.*place|place|location/i.test(k.trim()) && attrs[k]) {
        stockPlace = String(attrs[k]).trim();
        break;
      }
    }

    return {
      isPaid,
      isPending,
      isInstalled,
      vehNo,
      phone,
      custName,
      baseCost,
      gst,
      totalCost,
      cost: totalCost,
      stockPlace,
      payVal: payVal || (isPaid ? 'RECEIVED' : isInstalled ? 'PENDING' : 'IN_STOCK')
    };
  };

  // 1-Click Consolidated Payment Due Reminder Trigger (Grouped strictly by Customer Phone Number)
  const handleSendReminderForDevice = (dev) => {
    const info = getDevicePaymentInfo(dev);
    const cleanDigits = String(info.phone || '').replace(/[^0-9]/g, '');
    const valid10Phone = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '';

    let vehiclesToRemind = [dev];

    // If device has customer phone number, group ALL other pending vehicles matching the EXACT SAME PHONE NUMBER
    if (valid10Phone) {
      const samePhonePending = devices.filter(d => {
        const dInfo = getDevicePaymentInfo(d);
        if (!dInfo.isPending) return false;
        const dDigits = String(dInfo.phone || '').replace(/[^0-9]/g, '');
        const d10Phone = dDigits.length >= 10 ? dDigits.slice(-10) : '';
        return d10Phone === valid10Phone;
      });

      if (samePhonePending.length > 0) {
        vehiclesToRemind = samePhonePending;
      }
    }

    setConsolidatedReminderModalData({
      customerName: info.custName !== 'Customer' ? info.custName : (valid10Phone ? `Customer (${valid10Phone})` : 'Customer'),
      phone: valid10Phone || info.phone || '',
      vehicles: vehiclesToRemind,
      mode: 'REMINDER',
      stockPlace: info.stockPlace
    });
  };

  // Start Inline Editing for a row
  const handleStartInlineEdit = (dev) => {
    setInlineEditId(dev.id);
    const draft = { ...(dev.additional_attributes || {}) };
    Object.keys(draft).forEach(k => {
      if (/date|month|validity/i.test(k) && draft[k] !== undefined && draft[k] !== null) {
        draft[k] = formatDisplayCellValue(k, draft[k]);
      }
    });
    setInlineDraftAttrs(draft);
  };

  // Save Inline Editing
  const handleSaveInlineEdit = async (devId) => {
    setInlineSaving(true);
    try {
      const cleanedAttrs = { ...inlineDraftAttrs };
      Object.keys(cleanedAttrs).forEach(k => {
        if (/date|month|validity/i.test(k) && cleanedAttrs[k]) {
          cleanedAttrs[k] = formatDisplayCellValue(k, cleanedAttrs[k]);
        }
      });

      const res = await updateDevice(devId, {
        additional_attributes: cleanedAttrs,
        performed_by: user?.username || user?.name || 'Admin'
      });
      if (res.success) {
        setDevices(prev => prev.map(d => d.id === devId ? { ...d, additional_attributes: cleanedAttrs } : d));
        setInlineEditId(null);
      }
    } catch (err) {
      alert('Failed to save inline changes: ' + err.message);
    } finally {
      setInlineSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Inventory Mode Navigation Switcher */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-200/80 rounded-2xl w-fit border border-slate-300/80 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveInventoryTab('ALL_STOCK')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeInventoryTab === 'ALL_STOCK'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Boxes className="w-4 h-4 text-blue-600" />
          <span>All Stock Inventory Grid</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
            activeInventoryTab === 'ALL_STOCK' ? 'bg-blue-100 text-blue-800' : 'bg-slate-300 text-slate-700'
          }`}>
            {filteredDevices.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveInventoryTab('VERIFICATION_SHEET')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeInventoryTab === 'VERIFICATION_SHEET'
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <QrCode className="w-4 h-4 text-indigo-400" />
          <span>IMEI Verification Sheet</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500 text-white animate-pulse">
            SCAN & VERIFY
          </span>
        </button>
      </div>

      {activeInventoryTab === 'VERIFICATION_SHEET' ? (
        <ImeiVerificationSheet
          onOpenDeviceDetail={(imei) => {
            setDetailCardImei(imei);
            setIsDetailCardOpen(true);
          }}
          onOpenJourneyDrawer={onOpenTraceDrawer}
          onInitiateBulkTransfer={() => {
            setIsBulkTransferModalOpen(true);
          }}
        />
      ) : (
        <>
          {/* Header & Main Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div>
              {isDealer ? (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      Dealer Partner Stock
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {user?.region ? `${user.region} Region` : 'Branch Stock'}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Boxes className="w-5 h-5 text-blue-600" /> Stock Inventory for {user?.name || 'Dealer'}
                  </h2>
              <p className="text-xs text-slate-500">
                Displaying only the <strong className="text-blue-700 font-semibold">{filteredDevices.length} devices</strong> currently in your stock and assigned to your dealership.
              </p>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Boxes className="w-5 h-5 text-blue-600" /> Dynamic Stock Inventory Grid
              </h2>
              <p className="text-xs text-slate-500">Live view of all IMEI stock with complete Excel column preservation & dynamic inline editing</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">

          {!isDealer && (
            <button
              onClick={() => setIsBulkAssignModalOpen(true)}
              className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-200 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Bulk dispatch scanned devices to dealer and update stock place with date"
            >
              <Truck className="w-4 h-4 text-indigo-600" /> Dispatch to Dealer
            </button>
          )}

          {isSuperAdmin && (
            <button
              onClick={() => { setIsAuditModalOpen(true); loadAuditLogs(); }}
              className="px-3.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold rounded-xl border border-purple-200 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Super Admin: View and download all records edited by Admin & Sales teams"
            >
              <Shield className="w-4 h-4 text-purple-600" /> Team Edits & Audit Log
            </button>
          )}

          {canDelete && (
            <button
              onClick={() => {
                setNewColTargetType(typeFilter ? typeFilter.toString() : 'ALL');
                setIsAddColModalOpen(true);
              }}
              className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl border border-blue-200 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-blue-600" /> Add Custom Column
            </button>
          )}
          
          {canDelete && (
            <button
              onClick={() => { setClearScope(typeFilter ? 'FILTERED' : 'ALL'); setIsClearListModalOpen(true); }}
              className="px-3.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-xl border border-red-200 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Delete Complete List / Wipe Stock"
            >
              <Trash2 className="w-4 h-4 text-red-600" /> Clear / Delete Stock List
            </button>
          )}

          <button
            onClick={() => { loadData(); loadDealersSummary(); }}
            className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-600" /> Refresh Stock
          </button>
        </div>
      </div>

      {/* Quick Operational Presets Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'ALL', label: 'All Devices', count: devices.length },
          { id: 'INSTALLED', label: '🚗 Installed in Vehicles', count: filterOptions.totalInstalled },
          { id: 'PENDING_PAYMENT', label: '⏳ Payment Pending', count: filterOptions.totalPending },
          { id: 'PAID', label: '✅ Payment Received', count: filterOptions.totalPaid }
        ].map(chip => (
          <button
            key={chip.id}
            onClick={() => setQuickPreset(quickPreset === chip.id ? 'ALL' : chip.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${
              quickPreset === chip.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-200'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <span>{chip.label}</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
              quickPreset === chip.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {chip.count}
            </span>
          </button>
        ))}

        {isAnyFilterActive && (
          <button
            onClick={handleResetAllFilters}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border border-slate-200 hover:border-red-200 ml-auto"
            title="Clear all active search & dropdown filters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* Advanced Filter & Search Toolbar */}
      <div className="glass-panel p-4 rounded-2xl space-y-3 shadow-2xs">
        
        <div className="flex flex-col lg:flex-row gap-3 items-center justify-between">
          
          {/* Universal Search Box */}
          <form onSubmit={handleSearchSubmit} className="relative w-full lg:w-96">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search IMEI, SIM, Vehicle, Customer, Sales Person..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 placeholder-slate-400 font-mono focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {/* Action Hub: Copy Filtered IMEIs & Export CSV */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
            {copiedImeisMsg && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl flex items-center gap-1.5 animate-fadeIn">
                <Check className="w-3.5 h-3.5 text-emerald-600" /> {copiedImeisMsg}
              </span>
            )}

            <button
              onClick={handleCopyFilteredImeis}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Copy all currently filtered IMEI numbers to clipboard"
            >
              <Copy className="w-3.5 h-3.5 text-slate-600" /> Copy IMEIs ({filteredDevices.length})
            </button>

            <button
              onClick={handleExportFilteredExcel}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl border border-emerald-600 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Download currently filtered stock records in formatted Excel sheet (.xlsx) with all IMEIs, VLTD SNo, SIMs & Customer intact"
            >
              <Download className="w-3.5 h-3.5 text-white" /> Export Excel (.xlsx)
            </button>

            <button
              onClick={handleExportFilteredCsv}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download currently filtered inventory table as CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" /> Export CSV
            </button>
          </div>
        </div>

        {/* Dropdowns Multi-Filter Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 pt-2 border-t border-slate-100">
          
          {/* 1. Stock Place Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Stock Place</label>
            <select
              value={stockPlaceFilter}
              onChange={(e) => setStockPlaceFilter(e.target.value)}
              className={`w-full bg-slate-50 border rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-medium transition-colors ${
                stockPlaceFilter ? 'border-blue-400 bg-blue-50/50 text-blue-900 font-bold' : 'border-slate-200 text-slate-700'
              }`}
            >
              <option value="">All Stock Places</option>
              {filterOptions.stockPlacesList.map((p, idx) => (
                <option key={idx} value={p.name}>{p.name} ({p.count})</option>
              ))}
            </select>
          </div>

          {/* 2. Payment Status Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Payment Status</label>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className={`w-full bg-slate-50 border rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-medium transition-colors ${
                paymentFilter ? 'border-emerald-400 bg-emerald-50/50 text-emerald-900 font-bold' : 'border-slate-200 text-slate-700'
              }`}
            >
              <option value="">All Payments</option>
              <option value="PAID">✅ Received / Paid ({filterOptions.totalPaid})</option>
              <option value="PENDING">⏳ Pending / Due ({filterOptions.totalPending})</option>
            </select>
          </div>

          {/* 3. Deployment / Installation Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Deployment</label>
            <select
              value={deploymentFilter}
              onChange={(e) => setDeploymentFilter(e.target.value)}
              className={`w-full bg-slate-50 border rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-medium transition-colors ${
                deploymentFilter ? 'border-indigo-400 bg-indigo-50/50 text-indigo-900 font-bold' : 'border-slate-200 text-slate-700'
              }`}
            >
              <option value="">All Deployment</option>
              <option value="INSTALLED">🚗 Installed ({filterOptions.totalInstalled})</option>
              <option value="READY_STOCK">📦 Ready Stock ({filterOptions.totalReadyStock})</option>
            </select>
          </div>

          {/* 4. Sales Person Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Sales Person</label>
            <select
              value={salesPersonFilter}
              onChange={(e) => setSalesPersonFilter(e.target.value)}
              className={`w-full bg-slate-50 border rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-medium transition-colors ${
                salesPersonFilter ? 'border-purple-400 bg-purple-50/50 text-purple-900 font-bold' : 'border-slate-200 text-slate-700'
              }`}
            >
              <option value="">All Sales Persons</option>
              {filterOptions.salesPersonsList.map((sp, idx) => (
                <option key={idx} value={sp.name}>{sp.name} ({sp.count})</option>
              ))}
            </select>
          </div>

          {/* 5. RTO Location Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">RTO Location</label>
            <select
              value={rtoFilter}
              onChange={(e) => setRtoFilter(e.target.value)}
              className={`w-full bg-slate-50 border rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-medium transition-colors ${
                rtoFilter ? 'border-amber-400 bg-amber-50/50 text-amber-900 font-bold' : 'border-slate-200 text-slate-700'
              }`}
            >
              <option value="">All RTO Locations</option>
              {filterOptions.rtoLocationsList.map((r, idx) => (
                <option key={idx} value={r.name}>{r.name} ({r.count})</option>
              ))}
            </select>
          </div>

          {/* 6. Device Type Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Device Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`w-full bg-slate-50 border rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-medium transition-colors ${
                typeFilter ? 'border-blue-400 bg-blue-50/50 text-blue-900 font-bold' : 'border-slate-200 text-slate-700'
              }`}
            >
              <option value="">All Types</option>
              {deviceTypes.map(dt => (
                <option key={dt.id} value={dt.id}>{dt.name}</option>
              ))}
            </select>
          </div>

          {/* 7. Upload Batch / List */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Upload List</label>
            <div className="flex items-center gap-1">
              <select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className={`w-full bg-slate-50 border rounded-xl px-2 py-1.5 text-xs focus:outline-none max-w-full truncate transition-colors ${
                  batchFilter
                    ? 'border-blue-400 bg-blue-50/40 text-blue-900 font-bold'
                    : 'border-slate-200 text-slate-700 font-medium'
                }`}
              >
                <option value="">All Lists</option>
                {visibleBatches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.notes ? `${b.notes} (${b.source_file})` : b.source_file}
                  </option>
                ))}
              </select>

              {selectedBatchObj && canDelete && (
                <button
                  type="button"
                  onClick={() => setDeletingBatchRecord(selectedBatchObj)}
                  className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all shadow-xs cursor-pointer shrink-0"
                  title={`Delete list "${selectedBatchObj.source_file || selectedBatchObj.notes}" and its devices`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-white" />
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Active Filter summary badge */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <div className="flex items-center gap-2">
            <span>Showing <strong className="text-slate-900 font-mono font-bold">{filteredDevices.length}</strong> of {devices.length} devices</span>
            {isAnyFilterActive && (
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                Filtered
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Highlight Notice Banner after Scanner / Dealer Update */}
      {highlightNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between gap-3 text-emerald-950 shadow-xs animate-in fade-in-50">
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <div className="p-1.5 rounded-xl bg-emerald-600 text-white shadow-xs">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-emerald-900 font-bold">{highlightNotice}</div>
              <div className="text-[11px] font-normal text-emerald-700">All devices remain in the list below with the updated record highlighted in green.</div>
            </div>
          </div>
          <button
            onClick={() => {
              setHighlightNotice('');
              setHighlightImeis(new Set());
              onClearInitialFilter?.();
            }}
            className="p-1.5 hover:bg-emerald-200/60 text-emerald-800 rounded-lg transition-colors cursor-pointer"
            title="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Smart Column Visibility Preset Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Eye className="w-4 h-4 text-purple-600" />
          <span>Column Visibility Presets:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: 'All Columns', count: customColumns.length },
            { id: 'COMMERCIAL', label: '💰 Commercial & Billing', desc: 'Costs, Payments, Customers' },
            { id: 'TECHNICAL', label: '⚙️ Technical & Hardware', desc: 'IMEI, SIM, ICCID, Models' },
            { id: 'DEALER', label: '🏬 Dealer & Stock Place', desc: 'Locations, Sales, RTO' }
          ].map(p => {
            const isSelected = columnPreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setColumnPreset(p.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-purple-600 text-white border-purple-600 shadow-2xs ring-2 ring-purple-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-purple-50 hover:border-purple-300'
                }`}
              >
                <span>{p.label}</span>
                {p.count !== undefined && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isSelected ? 'bg-purple-700 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {p.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Devices Dynamic Spreadsheet Grid Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" /> Loading stock inventory spreadsheet...
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No inventory devices found matching the selected filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                <tr>
                  {/* Multi-select Header Checkbox */}
                  <th className="p-3.5 w-10 text-center bg-slate-50 border-r border-slate-200">
                    <input
                      type="checkbox"
                      title="Select / Deselect all visible devices"
                      checked={filteredDevices.length > 0 && selectedDeviceIds.size === filteredDevices.length}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </th>

                  {!isSingleListView && (
                    <>
                      <th className="p-3.5 font-bold font-mono">Device IMEI</th>
                      <th className="p-3.5 font-bold">Device Type</th>
                    </>
                  )}

                  {/* Excel Sheet Columns in 100% Exact Original Uploaded Order */}
                  {displayedColumns.map((col) => (
                    <th key={col} className="p-3.5 font-bold border-l border-slate-200/80 bg-slate-100/50 text-slate-800 group">
                      <div className="flex items-center justify-between gap-2">
                        <span>{col}</span>
                        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setRenamingCol(col); setNewHeaderName(col); }}
                            title="Edit Column Header"
                            className="p-1 hover:bg-slate-200 text-slate-700 rounded"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setDeletingCol(col)}
                            title="Delete Column"
                            className="p-1 hover:bg-red-100 text-red-600 rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}

                  <th className="p-3.5 font-bold text-right sticky right-0 bg-slate-50 border-l border-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDevices.map((dev) => {
                  const isInlineEditing = inlineEditId === dev.id;
                  const isRecentlyUpdated = highlightImeis.has(dev.imei_number);
                  const isSelected = selectedDeviceIds.has(dev.id);
                  const info = getDevicePaymentInfo(dev);
                  const isPending = info.isPending;
                  const isPaid = info.isPaid;

                  return (
                    <tr
                      key={dev.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected
                          ? 'bg-purple-50/60'
                          : isInlineEditing
                          ? 'bg-purple-50/40'
                          : isRecentlyUpdated
                          ? 'bg-emerald-50/70 ring-1 ring-inset ring-emerald-200'
                          : ''
                      }`}
                    >
                      {/* Row Checkbox */}
                      <td className="p-3.5 w-10 text-center border-r border-slate-200/60" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(dev.id)}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>
                      
                      {!isSingleListView && (
                        <>
                          {/* Primary Device IMEI Cell */}
                          <td className="p-3.5 font-mono text-purple-700 font-bold bg-purple-50/20 border-r border-purple-100/60">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailCardImei(dev.imei_number);
                                  setIsDetailCardOpen(true);
                                }}
                                className="hover:underline font-bold text-purple-700 hover:text-purple-900 cursor-pointer flex items-center gap-1 text-left"
                                title="Click to view complete Device Specification Card & Lifecycle History"
                              >
                                <span>{dev.imei_number}</span>
                              </button>
                              {isRecentlyUpdated && (
                                <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold uppercase tracking-wider">
                                  Updated
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="p-3.5 text-slate-800 font-medium">{dev.device_type_name}</td>
                        </>
                      )}

                      {/* Dynamic Custom Attributes Cells in 100% Original Uploaded Order */}
                      {displayedColumns.map((col) => {
                        const canEditCol = canUserEditField(user, col);
                        const isImeiCol = /vltdsno|^serial\s*number$|^imei|device\s*imei|^uid$/i.test(col.trim());
                        const isSimCol = /^sim\s*1$|^simno1$|^iccid$|^sim\s*number$/i.test(col.trim());

                        let cellVal = '-';
                        if (isInlineEditing) {
                          cellVal = inlineDraftAttrs[col] !== undefined ? inlineDraftAttrs[col] : '';
                        } else if (dev.additional_attributes && dev.additional_attributes[col] !== undefined && dev.additional_attributes[col] !== null && String(dev.additional_attributes[col]).trim() !== '') {
                          cellVal = String(dev.additional_attributes[col]);
                        } else if (isImeiCol && dev.imei_number) {
                          cellVal = String(dev.imei_number);
                        } else if (isSimCol && dev.sim_number) {
                          cellVal = String(dev.sim_number);
                        }

                        const isPaymentCol = /amount.*received|payment/i.test(col);

                        return (
                          <td key={col} className="p-3.5 border-l border-slate-200/60 font-mono text-slate-700 bg-slate-50/30">
                            {isInlineEditing ? (
                              canEditCol ? (
                                <input
                                  type="text"
                                  value={inlineDraftAttrs[col] !== undefined ? inlineDraftAttrs[col] : ''}
                                  onChange={(e) => setInlineDraftAttrs({ ...inlineDraftAttrs, [col]: e.target.value })}
                                  className="w-full min-w-[100px] bg-white border border-blue-400 rounded-lg p-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                <div className="flex items-center gap-1 text-slate-400 text-xs italic bg-slate-100/80 px-2 py-1.5 rounded-lg select-none" title="Locked: Restricted for your role">
                                  <span>🔒 {cellVal || '-'}</span>
                                </div>
                              )
                            ) : isImeiCol && cellVal !== '-' ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDetailCardImei(cellVal || dev.imei_number);
                                    setIsDetailCardOpen(true);
                                  }}
                                  className="hover:underline font-bold text-purple-700 hover:text-purple-900 cursor-pointer flex items-center gap-1 text-left"
                                  title="Click to view complete Device Specification Card & Lifecycle History"
                                >
                                  <span>{cellVal}</span>
                                </button>
                                {isRecentlyUpdated && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold uppercase tracking-wider">
                                    Updated
                                  </span>
                                )}
                              </div>
                            ) : isPaymentCol && cellVal !== '-' ? (
                              canUserEditField(user, 'AMOUNT RECEIVED') ? (
                                <button
                                  onClick={() => handleTogglePaymentStatus(dev)}
                                  title="Click to flip payment status (Sales / Super Admin)"
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-transform active:scale-95 ${
                                    isPending
                                      ? 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-300'
                                      : isPaid
                                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {cellVal} 🔄
                                </button>
                              ) : (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isPending
                                    ? 'bg-red-50 text-red-700 border border-red-200'
                                    : isPaid
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {cellVal}
                                </span>
                              )
                            ) : (
                              <span>{formatDisplayCellValue(col, cellVal)}</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Action Bar */}
                      <td className="p-3.5 text-right space-x-1.5 sticky right-0 bg-white border-l border-slate-200 shadow-2xs">
                        {isInlineEditing ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => handleSaveInlineEdit(dev.id)}
                              disabled={inlineSaving}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                              title="Save Inline Edit"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </button>
                            <button
                              onClick={() => setInlineEditId(null)}
                              className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* Official Fitment & Payment Receipt */}
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptDevice({
                                ...dev,
                                customer_name: info.custName,
                                customer_phone: info.phone,
                                vehicle_number: info.vehNo,
                                cost: info.cost,
                                payment_status: info.payVal,
                                stock_place: info.stockPlace
                              })}
                              title="Generate Official AIS-140 Fitment Slip & Payment Receipt"
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <span className="text-xs">🧾</span>
                            </button>

                            {/* 1-Click WhatsApp Payment Due Reminder Button (Universal across VAMO, VOLTY, TRACKNOW) */}
                            {isPending && (
                              <button
                                type="button"
                                onClick={() => handleSendReminderForDevice(dev)}
                                title={`Send 1-Click WhatsApp Payment Due Reminder to ${info.custName || 'Customer'}`}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <span className="text-xs">🔔</span>
                              </button>
                            )}

                            {/* Device Specification Card Modal Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setDetailCardImei(dev.imei_number);
                                setIsDetailCardOpen(true);
                              }}
                              title="View Full Device Specification & Passport Card"
                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* WhatsApp Direct Share Credentials */}
                            <button
                              onClick={() => handleShareWhatsApp(dev)}
                              title="Share GPS Credentials via WhatsApp"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer inline-flex items-center"
                            >
                              <span className="text-sm">💬</span>
                            </button>

                            {/* Customer Payment QR Code Generator */}
                            <button
                              onClick={() => {
                                const attrs = dev.additional_attributes || {};
                                setSelectedPaymentQrDevice({
                                  ...dev,
                                  imei: dev.imei_number,
                                  vehicleNumber: attrs['VEHICLE NUMBER'] || attrs['Vehicle Number'] || dev.vehicle_number || 'N/A',
                                  customerName: attrs['CUSTOMER NAME'] || dev.customer_name || 'Valued Customer',
                                  customerPhone: attrs['CUSTOMER PHONE NUMBER'] || attrs['Primary Mobile'] || dev.customer_phone || '',
                                  salePrice: attrs['TOTAL COST'] || attrs['COST'] || dev.sale_price || 6500,
                                  paymentStatus: attrs['AMOUNT RECEIVED'] || dev.payment_status || 'NOT RECEIVED',
                                  stockPlace: attrs['STOCK PLACE'] || dev.current_holder_name || 'FuelTracks Central'
                                });
                              }}
                              title="Generate & Send Customer Payment QR Code (UPI / WhatsApp)"
                              className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>

                            {/* Quick Inline Edit Pencil */}
                            <button
                              onClick={() => handleStartInlineEdit(dev)}
                              title="Quick In-Table Edit"
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            {/* Full Modal Edit */}
                            <button
                              onClick={() => openEditRowModal(dev)}
                              title="Edit Full Record Details"
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            
                            {/* Status Change Modal */}
                            <button
                              onClick={() => { setStatusEditingDevice(dev); setNewStatus(dev.current_status); }}
                              title="Adjust Stock Status"
                              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <ShieldAlert className="w-4 h-4" />
                            </button>

                            {/* Journey Trace Drawer */}
                            <button
                              onClick={() => onOpenTraceDrawer(dev.imei_number)}
                              title="Trace Full Journey"
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Single Record Delete Button */}
                            {canDelete && (
                              <button
                                onClick={() => setDeletingDeviceRecord(dev)}
                                title="Delete Record"
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* Single Record Delete Modal */}
      {deletingDeviceRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" /> Delete Particular Record
              </h3>
              <button onClick={() => setDeletingDeviceRecord(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to permanently delete this device record from inventory stock?
            </p>

            <div className="p-3 bg-red-50/50 rounded-xl border border-red-100 space-y-1 text-xs font-mono">
              <div><span className="text-slate-500">IMEI:</span> <strong className="text-red-700">{deletingDeviceRecord.imei_number}</strong></div>
              <div><span className="text-slate-500">Device Type:</span> <strong className="text-slate-800">{deletingDeviceRecord.device_type_name}</strong></div>
              <div><span className="text-slate-500">Status:</span> <strong className="text-slate-800">{deletingDeviceRecord.current_status}</strong></div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setDeletingDeviceRecord(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSingleRecord}
                disabled={deletingLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                {deletingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Confirm Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Clear Complete Stock List Modal */}
      {isClearListModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" /> Wipe / Delete Stock Inventory
              </h3>
              <button onClick={() => setIsClearListModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Select Scope to Clear</label>
              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                  <input
                    type="radio"
                    name="clearScope"
                    value="ALL"
                    checked={clearScope === 'ALL'}
                    onChange={() => setClearScope('ALL')}
                  />
                  <span><strong>Complete Inventory List</strong> (Clear all devices across all types)</span>
                </label>

                {batches.length > 0 && (
                  <label className="flex flex-col gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="clearScope"
                        value="BATCH"
                        checked={clearScope === 'BATCH'}
                        onChange={() => {
                          setClearScope('BATCH');
                          if (!selectedBatchToClear && batches.length > 0) setSelectedBatchToClear(batches[0].id.toString());
                        }}
                      />
                      <span><strong>Specific Upload List</strong> (Delete selected file import)</span>
                    </div>
                    {clearScope === 'BATCH' && (
                      <select
                        value={selectedBatchToClear || batchFilter || (batches[0]?.id.toString() || '')}
                        onChange={(e) => setSelectedBatchToClear(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium text-slate-800 ml-5 max-w-[90%]"
                      >
                        {batches.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.notes ? `${b.notes} (${b.source_file})` : b.source_file}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                )}

                {typeFilter && (
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="clearScope"
                      value="FILTERED"
                      checked={clearScope === 'FILTERED'}
                      onChange={() => setClearScope('FILTERED')}
                    />
                    <span><strong>Selected Device Type Only</strong> (Clear stock for currently filtered device type)</span>
                  </label>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Type "DELETE" to Confirm</label>
              <input
                type="text"
                placeholder="Type DELETE..."
                value={clearConfirmInput}
                onChange={(e) => setClearConfirmInput(e.target.value)}
                className="w-full bg-slate-50 border border-red-300 rounded-xl p-2.5 font-mono text-xs text-red-700 font-bold focus:outline-none focus:bg-white"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => { setIsClearListModalOpen(false); setClearConfirmInput(''); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleClearStockList}
                disabled={deletingLoading || clearConfirmInput.trim().toUpperCase() !== 'DELETE'}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                {deletingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Execute Stock Wipe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Upload List Confirmation Modal */}
      {deletingBatchRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-scaleIn">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Upload List</h3>
                <p className="text-xs text-slate-500">Permanently delete this list and all its devices</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">List / File:</span>
                <span className="font-bold text-slate-900 font-mono">{deletingBatchRecord.source_file || 'Upload Batch'}</span>
              </div>
              {deletingBatchRecord.notes && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Notes / Label:</span>
                  <span className="font-semibold text-slate-800">{deletingBatchRecord.notes}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Vendor:</span>
                <span className="font-medium text-slate-700">{deletingBatchRecord.vendor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Device Type:</span>
                <span className="font-medium text-slate-700">{deletingBatchRecord.device_type_name}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500 font-medium">Import Count:</span>
                <span className="font-bold text-blue-700 font-mono">{deletingBatchRecord.total_devices_count || 0} devices</span>
              </div>
            </div>

            <p className="text-xs text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Warning: This will permanently delete all devices in this list along with their transaction history. This action cannot be undone.</span>
            </p>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setDeletingBatchRecord(null)}
                disabled={deletingLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBatch}
                disabled={deletingLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                {deletingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Yes, Delete List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Device Status Modal */}
      {statusEditingDevice && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-600" /> Adjust Device Status
              </h3>
              <button onClick={() => setStatusEditingDevice(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              IMEI: <strong className="text-blue-600 font-mono">{statusEditingDevice.imei_number}</strong>
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">New Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="IN_WAREHOUSE">IN_WAREHOUSE (Unassigned Stock)</option>
                <option value="WITH_DEALER">WITH_DEALER</option>
                <option value="FAULTY">FAULTY (Mark Damaged/Faulty)</option>
                <option value="RMA">RMA (Return to Manufacturer)</option>
                <option value="RETURNED">RETURNED</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reason / Remarks</label>
              <textarea
                rows={3}
                placeholder="Enter reason for status change..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setStatusEditingDevice(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusUpdate}
                disabled={updatingStatus}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                {updatingStatus ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Save & Log Audit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Row & Attribute Editing Modal */}
      {editingRowDevice && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" /> Edit Device Row & Custom Attributes
              </h3>
              <button onClick={() => setEditingRowDevice(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>IMEI Number</span>
                  {!canUserEditField(user, 'IMEI') && <span className="text-[10px] text-amber-600 font-normal">🔒 Locked</span>}
                </label>
                <input
                  type="text"
                  disabled={!canUserEditField(user, 'IMEI')}
                  value={rowFormData.imei_number}
                  onChange={(e) => setRowFormData({ ...rowFormData, imei_number: e.target.value })}
                  className={`w-full border rounded-xl p-2.5 font-mono text-xs font-bold focus:outline-none ${
                    canUserEditField(user, 'IMEI')
                      ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-slate-800'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>SIM Number</span>
                  {!canUserEditField(user, 'SIM') && <span className="text-[10px] text-amber-600 font-normal">🔒 Locked</span>}
                </label>
                <input
                  type="text"
                  disabled={!canUserEditField(user, 'SIM')}
                  value={rowFormData.sim_number}
                  onChange={(e) => setRowFormData({ ...rowFormData, sim_number: e.target.value })}
                  className={`w-full border rounded-xl p-2.5 font-mono text-xs focus:outline-none ${
                    canUserEditField(user, 'SIM')
                      ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-slate-800'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Purchase Price (₹)</span>
                  {!canUserEditField(user, 'PURCHASE_PRICE') && <span className="text-[10px] text-amber-600 font-normal">🔒 Locked</span>}
                </label>
                <input
                  type="number"
                  disabled={!canUserEditField(user, 'PURCHASE_PRICE')}
                  value={rowFormData.purchase_price}
                  onChange={(e) => setRowFormData({ ...rowFormData, purchase_price: e.target.value })}
                  className={`w-full border rounded-xl p-2.5 font-mono text-xs focus:outline-none ${
                    canUserEditField(user, 'PURCHASE_PRICE')
                      ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-slate-800'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                />
              </div>
            </div>

            {/* Dynamic Custom Attributes Inputs */}
            {customColumns.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800">Dynamic Excel Custom Fields</h4>
                  <span className="text-[10px] text-slate-500">Fields marked with 🔒 are restricted for your role</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {customColumns.map((col) => {
                    const canEdit = canUserEditField(user, col);
                    return (
                      <div key={col}>
                        <label className="block font-medium text-slate-600 mb-1 flex items-center justify-between">
                          <span className="truncate max-w-[140px]">{col}</span>
                          {!canEdit && <span className="text-[10px] text-amber-600">🔒 Locked</span>}
                        </label>
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={rowFormData.additional_attributes[col] || ''}
                          onChange={(e) => setRowFormData({
                            ...rowFormData,
                            additional_attributes: {
                              ...rowFormData.additional_attributes,
                              [col]: e.target.value
                            }
                          })}
                          className={`w-full border rounded-xl p-2 font-mono text-xs focus:outline-none ${
                            canEdit
                              ? 'bg-slate-50 border-slate-200 text-slate-800 focus:border-blue-500'
                              : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    const targetDev = editingRowDevice;
                    setEditingRowDevice(null);
                    setDeletingDeviceRecord(targetDev);
                  }}
                  className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-xl flex items-center gap-1.5 border border-red-200 cursor-pointer transition-colors"
                  title="Delete this device record"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Record</span>
                </button>
              ) : <div />}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingRowDevice(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRowSave}
                  disabled={savingRow}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {savingRow ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Column Modal */}
      {isAddColModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" /> Add Custom Field / Column
            </h3>
            <p className="text-xs text-slate-500">
              Enter header name to add a dynamic column to the inventory table schema.
            </p>

            <input
              type="text"
              placeholder="Column Name (e.g., Sensor Length, Calibration)..."
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-500"
            />

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsAddColModalOpen(false)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleAddColumn}
                disabled={actionLoading || !newColName.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl"
              >
                Add Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Column Modal */}
      {renamingCol && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-blue-600" /> Edit Column Name
            </h3>
            <p className="text-xs text-slate-500">
              Renaming column <strong className="text-blue-600 font-mono">{renamingCol}</strong> across all device records.
            </p>

            <input
              type="text"
              value={newHeaderName}
              onChange={(e) => setNewHeaderName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-500"
            />

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRenamingCol(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameColumn}
                disabled={actionLoading || !newHeaderName.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl"
              >
                Update Column Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Column Confirmation Modal */}
      {deletingCol && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" /> Delete Column
            </h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete column <strong className="text-slate-900 font-mono">{deletingCol}</strong>? This will remove this field from inventory display and devices.
            </p>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeletingCol(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteColumn}
                disabled={actionLoading}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl"
              >
                Delete Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Dispatch & Assign to Dealer Modal */}
      {isBulkAssignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-base">
                <Truck className="w-5 h-5 text-indigo-600" />
                <span>Bulk Dispatch to Dealer / Branch</span>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkAssignModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {bulkAssignSuccessMsg ? (
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm font-bold text-center space-y-2 animate-in zoom-in-95">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <div>{bulkAssignSuccessMsg}</div>
                <p className="text-xs font-normal text-emerald-700">Stock place & movement logs updated successfully.</p>
              </div>
            ) : (
              <form onSubmit={handleBulkAssignSubmit} className="space-y-3.5">
                <p className="text-xs text-slate-500">
                  Enter or paste device IMEIs to update their <strong>Stock Place</strong>, <strong>Stock Place Date</strong>, and <strong>Dealer Status</strong> in one click.
                </p>

                {/* IMEIs Input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Device IMEIs (one per line, comma or space separated) *</span>
                    <span className="text-[11px] font-normal text-slate-400">
                      {bulkAssignImeisText.split(/[\n,;\t\s]+/).filter(t => t.trim().length >= 4).length} IMEIs detected
                    </span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="864920050019101&#10;864920050019102&#10;864920050019103..."
                    value={bulkAssignImeisText}
                    onChange={(e) => setBulkAssignImeisText(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                {/* Dealer / Stock Place Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-indigo-600" /> Dealer / Stock Place Name *
                  </label>
                  <input
                    type="text"
                    required
                    list="inventory-known-places-list"
                    placeholder="e.g. VIJAYAWADA - RAMESH, HYDERABAD HUB..."
                    value={bulkAssignStockPlace}
                    onChange={(e) => setBulkAssignStockPlace(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                  <datalist id="inventory-known-places-list">
                    {dealersSummary.map((d, i) => (
                      <option key={i} value={d.stock_place} />
                    ))}
                  </datalist>
                </div>

                {/* Dispatch Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Dispatch / Stock Place Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={bulkAssignDate}
                    onChange={(e) => setBulkAssignDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                {/* Optional Remarks */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Handover Note / Courier Reference (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sent via DTDC Courier #1234 or Handed over directly"
                    value={bulkAssignRemarks}
                    onChange={(e) => setBulkAssignRemarks(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsBulkAssignModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bulkAssignSubmitting}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {bulkAssignSubmitting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Update Stock Place & Movement Logs
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* Super Admin Team Edits & Activity Audit Log Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-5xl p-6 space-y-4 shadow-2xl max-h-[90vh] flex flex-col animate-scaleIn">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-100 text-purple-700 rounded-2xl">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Team Edits & Activity Audit Log
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[11px] font-bold">
                      {auditLogs.length} Records Logged
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Live tracking of all record modifications made by Operations Admin and Sales Commercial teams
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Controls Bar: Search, Role Filter & Export */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                
                {/* Search */}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by IMEI, user, remark..."
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadAuditLogs()}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 font-medium"
                  />
                </div>

                {/* Team Filter */}
                <select
                  value={auditTeamFilter}
                  onChange={(e) => {
                    setAuditTeamFilter(e.target.value);
                    loadAuditLogs({ performed_by: e.target.value });
                  }}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="">All Teams & Users</option>
                  <option value="Admin">Operations Admin Team</option>
                  <option value="Sales">Sales Commercial Team</option>
                  <option value="Owner">Super Admin (Owner)</option>
                </select>

                <button
                  onClick={() => loadAuditLogs()}
                  className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 cursor-pointer transition-colors"
                  title="Refresh Audit Logs"
                >
                  <RefreshCw className={`w-4 h-4 ${auditLoading ? 'animate-spin text-purple-600' : ''}`} />
                </button>
              </div>

              {/* 1-Click CSV Download Button */}
              <button
                onClick={handleExportAuditCsv}
                disabled={auditLogs.length === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs cursor-pointer transition-all"
                title="Download complete audit log and edited records as Excel/CSV"
              >
                <Download className="w-4 h-4" />
                <span>Download Complete Audit CSV</span>
              </button>
            </div>

            {/* Audit Logs Table */}
            <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 max-h-[55vh]">
              {auditLoading ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-600" />
                  <p className="text-xs font-medium">Fetching complete team edits history...</p>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <Shield className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600">No edit logs found matching your filters</p>
                  <p className="text-xs text-slate-400">When Admin or Sales teams modify records, their exact changes will appear here.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/80 sticky top-0 z-10 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Edited By / Team</th>
                      <th className="p-3">IMEI & Device</th>
                      <th className="p-3">Vehicle & Customer</th>
                      <th className="p-3">Changed Details / Diff</th>
                      <th className="p-3 text-right">Commercials</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.map((log) => {
                      const attrs = log.additional_attributes || {};
                      const vehKey = Object.keys(attrs).find(k => /vehicle/i.test(k));
                      const vehNo = (vehKey && attrs[vehKey]) || '-';
                      const custKey = Object.keys(attrs).find(k => /customer.*name|customer/i.test(k));
                      const custName = (custKey && attrs[custKey]) || '-';
                      const costKey = Object.keys(attrs).find(k => /^cost$/i.test(k) || /purchase_price/i.test(k));
                      const cost = (costKey && attrs[costKey]) || log.purchase_price || '-';
                      const payKey = Object.keys(attrs).find(k => /amount.*rec|payment/i.test(k));
                      const pay = (payKey && attrs[payKey]) || '-';

                      const isSales = /sales/i.test(log.performed_by || '');
                      const isAdmin = /admin|operations|warehouse|tech/i.test(log.performed_by || '');

                      return (
                        <tr key={log.id} className="hover:bg-purple-50/30 transition-colors">
                          
                          {/* Timestamp */}
                          <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {log.event_date || 'Just now'}
                          </td>

                          {/* Performed By */}
                          <td className="p-3 whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                              isSales
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : isAdmin
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-purple-100 text-purple-800 border border-purple-200'
                            }`}>
                              {isSales ? '💼' : isAdmin ? '🛠️' : '👑'} {log.performed_by || 'Admin'}
                            </span>
                          </td>

                          {/* IMEI & Device */}
                          <td className="p-3 font-mono">
                            <button
                              onClick={() => { setIsAuditModalOpen(false); onOpenTraceDrawer(log.imei_number); }}
                              className="text-blue-600 font-bold hover:underline"
                            >
                              {log.imei_number}
                            </button>
                            <div className="text-[10px] text-slate-400">{log.device_type_name}</div>
                          </td>

                          {/* Vehicle & Customer */}
                          <td className="p-3">
                            <div className="font-semibold text-slate-800">{vehNo}</div>
                            <div className="text-[11px] text-slate-500">{custName}</div>
                          </td>

                          {/* Diff Details */}
                          <td className="p-3 max-w-md">
                            <div className="p-2 bg-slate-50 rounded-xl border border-slate-200/80 font-mono text-[11px] text-slate-700 space-y-0.5">
                              {log.remarks ? log.remarks.split('; ').map((part, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0"></span>
                                  <span>{part}</span>
                                </div>
                              )) : (
                                <span>Record modified</span>
                              )}
                            </div>
                          </td>

                          {/* Commercials */}
                          <td className="p-3 text-right">
                            <div className="font-bold text-slate-900">₹{cost}</div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              String(pay).toUpperCase().includes('REC')
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {pay}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-500">
                Super Admin Master Log • Showing latest updates across all inventory records
              </span>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Floating Multi-Select Action Bar with 1-Click Consolidated WhatsApp Reminder, Stock Transfer & Bulk Delete */}
      {selectedDeviceIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex flex-wrap items-center gap-3 border border-slate-700 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center font-mono text-[11px]">
              {selectedDeviceIds.size}
            </span>
            <span>Selected</span>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* 1-Click Consolidated WhatsApp Payment Due Reminder */}
          <button
            onClick={() => {
              const selectedList = devices.filter(d => selectedDeviceIds.has(d.id));
              const firstCust = selectedList[0] ? getDevicePaymentInfo(selectedList[0]) : {};
              setConsolidatedReminderModalData({
                customerName: firstCust.custName || 'Customer Fleet',
                phone: firstCust.phone || '',
                vehicles: selectedList,
                mode: 'REMINDER',
                stockPlace: firstCust.stockPlace || 'FuelTracks Central'
              });
            }}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            title="Send 1 Single Consolidated WhatsApp Payment Reminder for all selected vehicles"
          >
            <span>🔔</span>
            <span>Fleet Reminder</span>
          </button>

          {/* 1-Click Consolidated Payment Confirmation Receipt */}
          <button
            onClick={() => {
              const selectedList = devices.filter(d => selectedDeviceIds.has(d.id));
              const firstCust = selectedList[0] ? getDevicePaymentInfo(selectedList[0]) : {};
              setConsolidatedReminderModalData({
                customerName: firstCust.custName || 'Customer Fleet',
                phone: firstCust.phone || '',
                vehicles: selectedList,
                mode: 'CONFIRMATION',
                stockPlace: firstCust.stockPlace || 'FuelTracks Central'
              });
            }}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            title="Send 1 Consolidated Payment Confirmation for all selected vehicles"
          >
            <span>🧾</span>
            <span>Payment Receipt</span>
          </button>

          {/* Stock Transfer Button */}
          <button
            onClick={handleOpenBulkTransferModal}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border border-slate-600"
          >
            <Building className="w-3.5 h-3.5 text-indigo-400" /> Transfer Stock
          </button>

          {/* Copy Selected IMEIs */}
          <button
            onClick={handleCopySelectedImeis}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
            title="Copy selected IMEIs to clipboard"
          >
            <Copy className="w-3.5 h-3.5" /> Copy IMEIs
          </button>

          {/* Bulk Delete Selected Devices Button */}
          {canDelete && (
            <button
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
              title="Delete all selected devices from inventory"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedDeviceIds.size})
            </button>
          )}

          {/* Clear selection */}
          <button
            onClick={() => setSelectedDeviceIds(new Set())}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Clear Selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk Stock Transfer Modal */}
      {isBulkTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <div className="p-2 bg-purple-50 text-purple-700 rounded-xl">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3>Bulk Stock Place Transfer</h3>
                  <p className="text-xs text-slate-500 font-normal">Reassign {selectedDeviceIds.size} selected devices</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkTransferModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {transferSuccessMsg ? (
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm font-bold text-center space-y-2 animate-in zoom-in-95">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <div>{transferSuccessMsg}</div>
                <p className="text-xs font-normal text-emerald-700">Stock records & movement logs updated successfully.</p>
              </div>
            ) : (
              <form onSubmit={handleExecuteBulkTransfer} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Target Stock Place / Branch *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TESTING CHENNAI, HYDERABAD HUB, VIJAYAWADA..."
                    value={transferPlace}
                    onChange={(e) => setTransferPlace(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:outline-none focus:border-slate-800 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Stock Place Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-slate-800 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Transfer Note / Courier Reference (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Handed over to Ramesh or Sent via Courier #9921"
                    value={transferRemarks}
                    onChange={(e) => setTransferRemarks(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-slate-800 focus:bg-white"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsBulkTransferModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={transferSubmitting}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {transferSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {transferSubmitting ? 'Transferring...' : `Transfer ${selectedDeviceIds.size} Device(s)`}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* Bulk Delete Selected Devices Modal */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" /> Delete Selected Devices
              </h3>
              <button
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to permanently delete these <strong className="text-red-700 font-bold font-mono">{selectedDeviceIds.size}</strong> selected device records from inventory?
            </p>

            <div className="max-h-40 overflow-y-auto p-3 bg-red-50/50 rounded-xl border border-red-100 space-y-1 text-xs font-mono text-slate-700">
              {devices
                .filter(d => selectedDeviceIds.has(d.id))
                .slice(0, 10)
                .map(d => (
                  <div key={d.id} className="flex justify-between items-center py-0.5 border-b border-red-100/50 last:border-0">
                    <span className="font-bold text-red-800">{d.imei_number}</span>
                    <span className="text-[11px] text-slate-500">{d.device_type_name}</span>
                  </div>
                ))}
              {selectedDeviceIds.size > 10 && (
                <div className="text-center text-[11px] font-bold text-slate-500 pt-1">
                  ...and {selectedDeviceIds.size - 10} more devices
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeleteSelected}
                disabled={deletingLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                {deletingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Confirm Delete ({selectedDeviceIds.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Device Specification & Lifecycle Passport Card Modal */}
      <DeviceDetailCardModal
        isOpen={isDetailCardOpen}
        onClose={() => {
          setIsDetailCardOpen(false);
          setDetailCardImei(null);
        }}
        onDelete={(dev) => {
          setIsDetailCardOpen(false);
          setDetailCardImei(null);
          setDeletingDeviceRecord(dev);
        }}
        canDelete={canDelete}
        imei={detailCardImei}
      />

      {/* Official AIS-140 Fitment Slip & Payment Receipt Modal */}
      <FitmentReceiptModal
        isOpen={Boolean(selectedReceiptDevice)}
        onClose={() => setSelectedReceiptDevice(null)}
        deviceData={selectedReceiptDevice}
      />

      {/* Consolidated Multi-Vehicle Payment Reminder & Confirmation Modal */}
      <ConsolidatedReminderModal
        isOpen={Boolean(consolidatedReminderModalData)}
        onClose={() => setConsolidatedReminderModalData(null)}
        initialCustomerName={consolidatedReminderModalData?.customerName || ''}
        initialPhone={consolidatedReminderModalData?.phone || ''}
        initialVehicles={consolidatedReminderModalData?.vehicles || []}
        initialMode={consolidatedReminderModalData?.mode || 'REMINDER'}
        stockPlace={consolidatedReminderModalData?.stockPlace || 'FuelTracks Central'}
      />

      {/* Dynamic Customer Payment QR Code Modal */}
      <PaymentQrModal
        isOpen={Boolean(selectedPaymentQrDevice)}
        onClose={() => setSelectedPaymentQrDevice(null)}
        paymentData={selectedPaymentQrDevice}
        onPaymentUpdated={() => loadData()}
      />

      {/* RMA & Warranty Return Pipeline Modal */}
      <RmaManagementModal
        device={rmaDevice}
        isOpen={isRmaModalOpen}
        onClose={() => {
          setIsRmaModalOpen(false);
          setRmaDevice(null);
        }}
        onSuccess={loadData}
      />

      {/* Add Custom Column Modal */}
      {isAddColModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base">
                <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-slate-900 font-bold text-sm">Add Custom Column to Stock Grid</h3>
                  <p className="text-xs text-slate-500 font-normal">Add custom attributes like Installation Charges, Pan, etc.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddColModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomColumnSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Column Name / Header *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. INSTALLATION CHARGES, PAN NUMBER, DRIVER NAME"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold uppercase focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              {/* Quick Suggestion Chips */}
              <div>
                <span className="block text-[11px] font-bold text-slate-500 mb-1.5">Common Column Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  {['INSTALLATION CHARGES', 'PAN NUMBER', 'AADHAR NUMBER', 'DRIVER NAME', 'INSURANCE VALIDITY', 'FASTAG ID', 'SALE PRICE'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNewColName(preset)}
                      className="px-2 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-slate-700 rounded-lg text-[10px] font-bold border border-slate-200 transition-colors cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Apply To List / Model *
                </label>
                <select
                  value={newColTargetType}
                  onChange={(e) => setNewColTargetType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:outline-none focus:border-blue-600 focus:bg-white"
                >
                  <option value="ALL">🌐 All Lists & Models (Global Stock Grid)</option>
                  {deviceTypes.map(dt => (
                    <option key={dt.id} value={dt.id.toString()}>
                      📱 Only {dt.name} List
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddColModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !newColName.trim()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {actionLoading ? 'Adding...' : 'Add Column to Grid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
