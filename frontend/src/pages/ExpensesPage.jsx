import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  Plus,
  Search,
  Filter,
  Download,
  Calendar,
  CreditCard,
  Truck,
  Car,
  DollarSign,
  Building2,
  Trash2,
  Edit2,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowUpDown,
  RefreshCw,
  Copy,
  Check,
  Zap,
  Users,
  Layers,
  Globe,
  Coffee,
  Receipt,
  TrendingUp,
  TrendingDown,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Repeat,
  SlidersHorizontal,
  FileText,
  Tag,
  PenLine
} from 'lucide-react';
import {
  fetchExpenses,
  fetchExpenseSummary,
  fetchExpenseFinancialHealth,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseExportUrl
} from '../services/api';
import { useAuth } from '../context/AuthContext';

const PREDEFINED_CATEGORIES = {
  FUEL_TRAVEL: {
    label: 'Fuel & Travel',
    group: 'FIELD_OPS',
    icon: Car,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200'
  },
  FOOD_ALLOWANCE: {
    label: 'Food & Daily Allowance',
    group: 'FIELD_OPS',
    icon: Coffee,
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200'
  },
  TECHNICIAN_PAYOUT: {
    label: 'Technician Payout',
    group: 'FIELD_OPS',
    icon: DollarSign,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200'
  },
  ELECTRICITY_BILL: {
    label: 'Electricity & Utility',
    group: 'FIXED_OVERHEADS',
    icon: Zap,
    bg: 'bg-yellow-50',
    text: 'text-yellow-800',
    border: 'border-yellow-200'
  },
  OFFICE_RENT: {
    label: 'Office Rent & Facilities',
    group: 'FIXED_OVERHEADS',
    icon: Building2,
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200'
  },
  SALARIES: {
    label: 'Staff Salaries & Advances',
    group: 'PAYROLL',
    icon: Users,
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200'
  },
  STOCK_PURCHASE: {
    label: 'Stock & Devices (COGS)',
    group: 'INVENTORY_STOCK',
    icon: Layers,
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200'
  },
  COURIER_FREIGHT: {
    label: 'Courier & Logistics',
    group: 'LOGISTICS',
    icon: Truck,
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200'
  },
  INTERNET_CLOUD: {
    label: 'Internet & Cloud Servers',
    group: 'FIXED_OVERHEADS',
    icon: Globe,
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200'
  },
  OFFICE_MISC: {
    label: 'Office & Operations Misc',
    group: 'GENERAL_ADMIN',
    icon: Receipt,
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200'
  },
  OTHER: {
    label: 'Other Expenses',
    group: 'GENERAL_ADMIN',
    icon: Wallet,
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200'
  },
  TECHNICIAN_TRAVEL: {
    label: 'Technician Travel / Fuel',
    group: 'FIELD_OPS',
    icon: Car,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200'
  }
};

function getCategoryConfig(catKey) {
  if (!catKey) return PREDEFINED_CATEGORIES.OTHER;
  if (PREDEFINED_CATEGORIES[catKey]) return PREDEFINED_CATEGORIES[catKey];
  // Custom user-typed category
  return {
    label: catKey.replace(/_/g, ' '),
    group: 'GENERAL_ADMIN',
    icon: Tag,
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-200'
  };
}

const GROUP_TABS = [
  { id: 'ALL', label: 'All Expenses' },
  { id: 'FIELD_OPS', label: 'Field & Travel' },
  { id: 'FIXED_OVERHEADS', label: 'Rent & Electricity' },
  { id: 'PAYROLL', label: 'Salaries' },
  { id: 'INVENTORY_STOCK', label: 'Stock (COGS)' },
  { id: 'LOGISTICS', label: 'Courier' },
  { id: 'GENERAL_ADMIN', label: 'Misc' }
];

export default function ExpensesPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [financialHealth, setFinancialHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedPaymentMode, setSelectedPaymentMode] = useState('');
  
  // Date Presets
  const [datePreset, setDatePreset] = useState('THIS_MONTH');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [formData, setFormData] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    category: 'FUEL_TRAVEL',
    sub_category: '',
    amount: '',
    payment_mode: 'UPI',
    incurred_by: user?.name || '',
    paid_to: '',
    utr_number: '',
    bill_invoice_no: '',
    linked_entity_type: 'GENERAL',
    linked_entity_id: '',
    is_recurring: 0,
    remarks: ''
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Copy notification state
  const [copiedUtr, setCopiedUtr] = useState('');

  // Set default date range to this month
  useEffect(() => {
    applyDatePreset('THIS_MONTH');
  }, []);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      setStartDate(firstDay);
      setEndDate(lastDay);
    } else if (preset === 'LAST_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      setStartDate(firstDay);
      setEndDate(lastDay);
    } else if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        search,
        category: selectedCategory,
        category_group: selectedGroup,
        payment_mode: selectedPaymentMode,
        startDate,
        endDate
      };

      const [listRes, sumRes, healthRes] = await Promise.all([
        fetchExpenses(params),
        fetchExpenseSummary({ startDate, endDate }),
        fetchExpenseFinancialHealth({ startDate, endDate })
      ]);

      setExpenses(listRes.data || []);
      setSummary(sumRes.summary || null);
      setFinancialHealth(healthRes.data || null);
    } catch (err) {
      setError(err.message || 'Failed to load expenses data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedCategory, selectedGroup, selectedPaymentMode, startDate, endDate]);

  // Extract unique custom categories dynamically from expense records
  const dynamicCustomCategories = useMemo(() => {
    const customSet = new Set();
    expenses.forEach((item) => {
      if (item.category && !PREDEFINED_CATEGORIES[item.category]) {
        customSet.add(item.category);
      }
    });
    return Array.from(customSet);
  }, [expenses]);

  const handleOpenAddModal = () => {
    setEditingExpense(null);
    setIsCustomCategory(false);
    setCustomCategoryName('');
    setFormData({
      expense_date: new Date().toISOString().split('T')[0],
      category: 'FUEL_TRAVEL',
      sub_category: '',
      amount: '',
      payment_mode: 'UPI',
      incurred_by: user?.name || '',
      paid_to: '',
      utr_number: '',
      bill_invoice_no: '',
      linked_entity_type: 'GENERAL',
      linked_entity_id: '',
      is_recurring: 0,
      remarks: ''
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleOpenEditModal = (item) => {
    setEditingExpense(item);
    const isPredefined = Boolean(PREDEFINED_CATEGORIES[item.category]);
    setIsCustomCategory(!isPredefined);
    setCustomCategoryName(!isPredefined ? item.category : '');
    setFormData({
      expense_date: item.expense_date,
      category: isPredefined ? item.category : '__CUSTOM__',
      sub_category: item.sub_category || '',
      amount: item.amount,
      payment_mode: item.payment_mode,
      incurred_by: item.incurred_by,
      paid_to: item.paid_to || '',
      utr_number: item.utr_number || '',
      bill_invoice_no: item.bill_invoice_no || '',
      linked_entity_type: item.linked_entity_type || 'GENERAL',
      linked_entity_id: item.linked_entity_id || '',
      is_recurring: item.is_recurring ? 1 : 0,
      remarks: item.remarks || ''
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleCategorySelectChange = (e) => {
    const val = e.target.value;
    if (val === '__CUSTOM__') {
      setIsCustomCategory(true);
      setFormData({ ...formData, category: '__CUSTOM__' });
    } else {
      setIsCustomCategory(false);
      setFormData({ ...formData, category: val });
    }
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.amount || isNaN(Number(formData.amount)) || Number(formData.amount) <= 0) {
      setFormError('Please enter a valid amount greater than 0');
      return;
    }
    if (!formData.incurred_by.trim()) {
      setFormError('Staff / Person name is required');
      return;
    }

    let finalCategory = formData.category;
    if (isCustomCategory || formData.category === '__CUSTOM__') {
      if (!customCategoryName.trim()) {
        setFormError('Please type your custom category name');
        return;
      }
      finalCategory = customCategoryName.trim();
    }

    const payload = {
      ...formData,
      category: finalCategory
    };

    try {
      setFormSubmitting(true);
      if (editingExpense) {
        await updateExpense(editingExpense.id, payload);
        setSuccessMsg('Expense record updated successfully');
      } else {
        await createExpense(payload);
        setSuccessMsg('New expense recorded successfully');
      }
      setModalOpen(false);
      loadData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setFormError(err.message || 'Failed to save expense');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense record?')) return;
    try {
      await deleteExpense(id);
      setSuccessMsg('Expense deleted successfully');
      loadData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      alert(err.message || 'Failed to delete expense');
    }
  };

  const handleCopyUtr = (utr) => {
    if (!utr) return;
    navigator.clipboard.writeText(utr);
    setCopiedUtr(utr);
    setTimeout(() => setCopiedUtr(''), 2000);
  };

  const exportUrl = getExpenseExportUrl({
    category: selectedCategory,
    payment_mode: selectedPaymentMode,
    startDate,
    endDate,
    search
  });

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto pb-24 text-slate-800">
      {/* 🌟 Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 border-b border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span className="p-1.5 bg-blue-600 text-white rounded-lg inline-flex">
              <Wallet className="w-5 h-5" />
            </span>
            Expenses & Financial Health
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time cash flow, operational overheads, stock investments, and business savings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshing(true); loadData(); }}
            className="p-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition shadow-2xs"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <a
            href={exportUrl}
            download
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 hover:text-blue-600 transition shadow-2xs"
          >
            <Download className="w-4 h-4 text-slate-400" />
            <span>Export</span>
          </a>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition shadow-sm active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>Record Expense</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 🌟 4 Clean Executive Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Received Inflow */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-slate-300 transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Received (Inflow)</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <ArrowDownRight className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              ₹{(financialHealth?.totalInflow || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
              Customer collections & installations
            </div>
          </div>
        </div>

        {/* 2. Stock Purchases */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-slate-300 transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Stock Purchases (COGS)</span>
            <span className="p-1.5 bg-cyan-50 text-cyan-600 rounded-lg">
              <Layers className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              ₹{(financialHealth?.totalStockPurchases || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-cyan-700 font-medium mt-0.5">
              Device hardware & batches
            </div>
          </div>
        </div>

        {/* 3. Operating Expenses */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-slate-300 transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Operating Expenses (OPEX)</span>
            <span className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              ₹{(financialHealth?.totalOpex || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-rose-600 font-medium mt-0.5">
              Fuel, food, rent, salaries, EB
            </div>
          </div>
        </div>

        {/* 4. Net Business Savings */}
        <div className={`p-4 rounded-2xl border shadow-2xs flex flex-col justify-between transition ${
          (financialHealth?.netSavings || 0) >= 0 
            ? 'bg-slate-900 text-white border-slate-900' 
            : 'bg-rose-950 text-white border-rose-950'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Net Business Savings</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              (financialHealth?.netSavings || 0) >= 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}>
              {financialHealth?.savingsRate || 0}% Savings Rate
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight">
              ₹{(financialHealth?.netSavings || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5">
              {(financialHealth?.netSavings || 0) >= 0 ? 'Net Cash Surplus' : 'Net Operating Deficit'}
            </div>
          </div>
        </div>
      </div>

      {/* 🌟 Unified Clean Controls & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 space-y-3">
        {/* Top filter row: Search + Category Selector + Payment Mode + Date Presets */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search staff, payee, bill no, UTR, custom category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Specific Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All Categories</option>
            <optgroup label="Field & Travel">
              <option value="FUEL_TRAVEL">Fuel & Travel</option>
              <option value="FOOD_ALLOWANCE">Food & Daily Allowance</option>
              <option value="TECHNICIAN_PAYOUT">Technician Payout</option>
            </optgroup>
            <optgroup label="Fixed Overheads">
              <option value="OFFICE_RENT">Office Rent</option>
              <option value="ELECTRICITY_BILL">Electricity Bill</option>
              <option value="INTERNET_CLOUD">Internet & Cloud Servers</option>
            </optgroup>
            <optgroup label="Payroll & Stock">
              <option value="SALARIES">Staff Salaries</option>
              <option value="STOCK_PURCHASE">Stock Purchases (COGS)</option>
              <option value="COURIER_FREIGHT">Courier & Freight</option>
            </optgroup>
            <optgroup label="General">
              <option value="OFFICE_MISC">Office Misc & Tea</option>
              <option value="OTHER">Other Expenses</option>
            </optgroup>
            {dynamicCustomCategories.length > 0 && (
              <optgroup label="Custom Typed Categories">
                {dynamicCustomCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </optgroup>
            )}
          </select>

          {/* Payment Mode */}
          <select
            value={selectedPaymentMode}
            onChange={(e) => setSelectedPaymentMode(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All Payments</option>
            <option value="UPI">UPI</option>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="CARD">Card</option>
          </select>

          {/* Date Range Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => applyDatePreset('THIS_MONTH')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                datePreset === 'THIS_MONTH'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => applyDatePreset('LAST_MONTH')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                datePreset === 'LAST_MONTH'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Last Month
            </button>
            <button
              onClick={() => applyDatePreset('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                datePreset === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
          </div>
        </div>

        {/* Clean Group Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 scrollbar-none">
          {GROUP_TABS.map((tab) => {
            const isSelected = selectedGroup === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setSelectedGroup(tab.id);
                  setSelectedCategory('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition ${
                  isSelected
                    ? 'bg-slate-900 text-white font-semibold shadow-2xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 🌟 Clean Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Incurred By</th>
                <th className="py-3 px-4">Paid To</th>
                <th className="py-3 px-4">Payment & Ref</th>
                <th className="py-3 px-4">Remarks</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                    <span>Loading expenses...</span>
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-400">
                    <Wallet className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
                    <p className="font-semibold text-slate-700">No expense records found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Try changing filters or record a new expense.</p>
                  </td>
                </tr>
              ) : (
                expenses.map((item) => {
                  const cat = getCategoryConfig(item.category);
                  const Icon = cat.icon;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Date */}
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-900">
                        {item.expense_date}
                        {item.is_recurring ? (
                          <span className="ml-1.5 inline-flex items-center text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium" title="Recurring Bill">
                            <Repeat className="w-2.5 h-2.5 mr-0.5" /> Recur
                          </span>
                        ) : null}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${cat.bg} ${cat.text} ${cat.border}`}>
                            <Icon className="w-3 h-3" />
                            <span>{cat.label}</span>
                          </span>
                          {item.sub_category && (
                            <span className="text-[11px] text-slate-400 font-normal">
                              ({item.sub_category})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-900 text-sm">
                          ₹{Number(item.amount).toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Incurred By */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-medium text-slate-800">{item.incurred_by}</span>
                      </td>

                      {/* Paid To */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                        {item.paid_to || <span className="text-slate-300">-</span>}
                      </td>

                      {/* Payment Mode & UTR / Bill */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold">
                            {item.payment_mode}
                          </span>
                          {item.utr_number ? (
                            <button
                              onClick={() => handleCopyUtr(item.utr_number)}
                              title="Copy UTR"
                              className="group flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-[10px] font-mono transition"
                            >
                              <span>{item.utr_number}</span>
                              {copiedUtr === item.utr_number ? (
                                <Check className="w-2.5 h-2.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-2.5 h-2.5 text-slate-400 group-hover:text-slate-700" />
                              )}
                            </button>
                          ) : null}
                          {item.bill_invoice_no && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              #{item.bill_invoice_no}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Remarks */}
                      <td className="py-3 px-4 max-w-xs truncate text-slate-500" title={item.remarks}>
                        {item.linked_entity_id && (
                          <span className="inline-block mr-1 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                            {item.linked_entity_id}
                          </span>
                        )}
                        {item.remarks || <span className="text-slate-300">-</span>}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                            title="Edit Record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🌟 Record / Edit Expense Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {editingExpense ? 'Edit Expense Record' : 'Record New Expense'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Log fuel, food, rent, electricity, salaries, or custom categories
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-3.5 mt-3 text-xs">
              {/* Date & Category Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-600 font-semibold">Category *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomCategory(!isCustomCategory);
                        if (!isCustomCategory) {
                          setFormData({ ...formData, category: '__CUSTOM__' });
                        } else {
                          setFormData({ ...formData, category: 'FUEL_TRAVEL' });
                        }
                      }}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-0.5"
                    >
                      <PenLine className="w-2.5 h-2.5" />
                      {isCustomCategory ? 'Pick preset' : '+ Type new'}
                    </button>
                  </div>
                  {!isCustomCategory ? (
                    <select
                      value={formData.category}
                      onChange={handleCategorySelectChange}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <optgroup label="Field Operations">
                        <option value="FUEL_TRAVEL">Fuel & Travel</option>
                        <option value="FOOD_ALLOWANCE">Food & Allowance (DA)</option>
                        <option value="TECHNICIAN_PAYOUT">Technician Payout</option>
                      </optgroup>
                      <optgroup label="Office & Utilities">
                        <option value="OFFICE_RENT">Office Rent</option>
                        <option value="ELECTRICITY_BILL">Electricity Bill</option>
                        <option value="INTERNET_CLOUD">Internet & Cloud Servers</option>
                      </optgroup>
                      <optgroup label="Payroll & Stock">
                        <option value="SALARIES">Staff Salaries</option>
                        <option value="STOCK_PURCHASE">Stock Purchases (COGS)</option>
                        <option value="COURIER_FREIGHT">Courier & Logistics</option>
                      </optgroup>
                      <optgroup label="General">
                        <option value="OFFICE_MISC">Office Misc & Tea</option>
                        <option value="OTHER">Other Expenses</option>
                      </optgroup>
                      <optgroup label="Custom Category">
                        <option value="__CUSTOM__">✍️ + Type New / Custom Category...</option>
                      </optgroup>
                    </select>
                  ) : (
                    <input
                      type="text"
                      autoFocus
                      required
                      placeholder="Type custom category name..."
                      value={customCategoryName}
                      onChange={(e) => setCustomCategoryName(e.target.value)}
                      className="w-full px-3 py-2 bg-purple-50/50 border border-purple-300 rounded-xl font-medium text-slate-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                    />
                  )}
                </div>
              </div>

              {/* Amount & Sub-Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Amount (₹) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="0.00"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Sub-Type / Specific Item</label>
                  <input
                    type="text"
                    placeholder="e.g. Petrol, Snacks, AC Repair"
                    value={formData.sub_category}
                    onChange={(e) => setFormData({ ...formData, sub_category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Incurred By & Paid To */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Incurred By / Staff *</label>
                  <input
                    type="text"
                    required
                    placeholder="Staff name"
                    value={formData.incurred_by}
                    onChange={(e) => setFormData({ ...formData, incurred_by: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Paid To / Payee</label>
                  <input
                    type="text"
                    placeholder="e.g. Petrol Pump / Vendor"
                    value={formData.paid_to}
                    onChange={(e) => setFormData({ ...formData, paid_to: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Payment Mode & UTR / Bill No */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Payment Mode</label>
                  <select
                    value={formData.payment_mode}
                    onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="UPI">UPI</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">UTR / Bill No.</label>
                  <input
                    type="text"
                    placeholder="Transaction ref / Bill #"
                    value={formData.utr_number}
                    onChange={(e) => setFormData({ ...formData, utr_number: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Recurring & Remarks */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_recurring === 1}
                    onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked ? 1 : 0 })}
                    className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span className="text-slate-700 font-medium">Monthly Recurring Bill</span>
                </label>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Remarks</label>
                <input
                  type="text"
                  placeholder="Optional notes or details..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition shadow-sm"
                >
                  {formSubmitting ? 'Saving...' : editingExpense ? 'Update' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
