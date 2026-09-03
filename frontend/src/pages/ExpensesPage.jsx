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
  Check
} from 'lucide-react';
import {
  fetchExpenses,
  fetchExpenseSummary,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseExportUrl
} from '../services/api';
import { useAuth } from '../context/AuthContext';

const CATEGORY_CONFIG = {
  TECHNICIAN_TRAVEL: {
    label: 'Technician Travel / Fuel',
    icon: Car,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200'
  },
  COURIER_FREIGHT: {
    label: 'Courier & Freight',
    icon: Truck,
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200'
  },
  TECHNICIAN_PAYOUT: {
    label: 'Technician Payout',
    icon: DollarSign,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200'
  },
  OFFICE_MISC: {
    label: 'Office & Operations',
    icon: Building2,
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200'
  },
  OTHER: {
    label: 'Other',
    icon: Wallet,
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200'
  }
};

export default function ExpensesPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPaymentMode, setSelectedPaymentMode] = useState('');
  
  // Date Presets
  const [datePreset, setDatePreset] = useState('THIS_MONTH');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [formData, setFormData] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    category: 'TECHNICIAN_TRAVEL',
    amount: '',
    payment_mode: 'UPI',
    incurred_by: user?.name || '',
    paid_to: '',
    utr_number: '',
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
        payment_mode: selectedPaymentMode,
        startDate,
        endDate
      };

      const [listRes, sumRes] = await Promise.all([
        fetchExpenses(params),
        fetchExpenseSummary({ startDate, endDate })
      ]);

      setExpenses(listRes.data || []);
      setSummary(sumRes.summary || null);
    } catch (err) {
      setError(err.message || 'Failed to load expenses data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedCategory, selectedPaymentMode, startDate, endDate]);

  const handleOpenAddModal = () => {
    setEditingExpense(null);
    setFormData({
      expense_date: new Date().toISOString().split('T')[0],
      category: 'TECHNICIAN_TRAVEL',
      amount: '',
      payment_mode: 'UPI',
      incurred_by: user?.name || '',
      paid_to: '',
      utr_number: '',
      remarks: ''
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleOpenEditModal = (item) => {
    setEditingExpense(item);
    setFormData({
      expense_date: item.expense_date,
      category: item.category,
      amount: item.amount,
      payment_mode: item.payment_mode,
      incurred_by: item.incurred_by,
      paid_to: item.paid_to || '',
      utr_number: item.utr_number || '',
      remarks: item.remarks || ''
    });
    setFormError('');
    setModalOpen(true);
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

    try {
      setFormSubmitting(true);
      if (editingExpense) {
        await updateExpense(editingExpense.id, formData);
        setSuccessMsg('Expense updated successfully');
      } else {
        await createExpense(formData);
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

  // Calculate categorized cards for summary
  const travelTotal = useMemo(() => {
    const cat = summary?.categories?.find(c => c.category === 'TECHNICIAN_TRAVEL');
    return cat ? cat.total_amount : 0;
  }, [summary]);

  const courierTotal = useMemo(() => {
    const cat = summary?.categories?.find(c => c.category === 'COURIER_FREIGHT');
    return cat ? cat.total_amount : 0;
  }, [summary]);

  const opsTotal = useMemo(() => {
    const cat = summary?.categories?.find(c => c.category === 'OFFICE_MISC' || c.category === 'OTHER');
    return cat ? cat.total_amount : 0;
  }, [summary]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-sm">
              <Wallet className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Expenses Management</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Track technician conveyance, fuel, courier shipments, and daily operational expenditures.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshing(true); loadData(); }}
            className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all shadow-2xs"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <a
            href={exportUrl}
            download
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 hover:text-blue-600 transition-all shadow-2xs"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export Excel</span>
          </a>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-all shadow-sm shadow-blue-500/20 active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>Record Expense</span>
          </button>
        </div>
      </div>

      {/* Success / Error Alerts */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-fadeIn">
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

      {/* 4 Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Expense */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Expenses</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              ₹{(summary?.total_amount || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {summary?.total_count || 0} transactions in selected period
            </div>
          </div>
        </div>

        {/* Technician Travel / Fuel */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Technician Travel & Fuel</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Car className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              ₹{travelTotal.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-amber-600 font-medium mt-0.5">
              Field site visits & conveyance
            </div>
          </div>
        </div>

        {/* Courier & Freight */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Courier & Logistics</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              ₹{courierTotal.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-blue-600 font-medium mt-0.5">
              Dealer dispatches & parcel freight
            </div>
          </div>
        </div>

        {/* Office & Operations */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Office & Operations</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              ₹{opsTotal.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-purple-600 font-medium mt-0.5">
              Rent, bills & petty cash
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by staff, paid to, UTR number, or remarks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Date Range Quick Presets */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => applyDatePreset('THIS_MONTH')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                datePreset === 'THIS_MONTH'
                  ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => applyDatePreset('LAST_MONTH')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                datePreset === 'LAST_MONTH'
                  ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Last Month
            </button>
            <button
              onClick={() => applyDatePreset('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                datePreset === 'ALL'
                  ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
          </div>

          {/* Payment Mode Selector */}
          <select
            value={selectedPaymentMode}
            onChange={(e) => setSelectedPaymentMode(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All Payment Modes</option>
            <option value="UPI">UPI</option>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="CARD">Card</option>
          </select>
        </div>

        {/* Category Pill Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[11px] font-semibold text-slate-400 uppercase mr-1">Category:</span>
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              selectedCategory === ''
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Categories
          </button>
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
            const Icon = config.icon;
            const isSelected = selectedCategory === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(isSelected ? '' : key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : `${config.bg} ${config.text} ${config.border} hover:opacity-80`
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Incurred By</th>
                <th className="py-3 px-4">Paid To</th>
                <th className="py-3 px-4">Payment Details</th>
                <th className="py-3 px-4">Remarks</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                    <span>Loading expense records...</span>
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-400">
                    <Wallet className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
                    <p className="font-medium text-slate-600">No expense records found</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try adjusting your filters or record a new expense.</p>
                  </td>
                </tr>
              ) : (
                expenses.map((item) => {
                  const cat = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.OTHER;
                  const Icon = cat.icon;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Date */}
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-900">
                        {item.expense_date}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cat.bg} ${cat.text} ${cat.border}`}>
                          <Icon className="w-3 h-3" />
                          <span>{cat.label}</span>
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-900 text-sm">
                          ₹{Number(item.amount).toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Incurred By */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-semibold text-slate-800">{item.incurred_by}</span>
                      </td>

                      {/* Paid To */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                        {item.paid_to || <span className="text-slate-300">-</span>}
                      </td>

                      {/* Payment Details / UTR */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">
                            {item.payment_mode}
                          </span>
                          {item.utr_number ? (
                            <button
                              onClick={() => handleCopyUtr(item.utr_number)}
                              title="Click to copy UTR"
                              className="group flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-[10px] font-mono transition-all"
                            >
                              <span>{item.utr_number}</span>
                              {copiedUtr === item.utr_number ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 text-blue-400 group-hover:text-blue-600" />
                              )}
                            </button>
                          ) : (
                            <span className="text-slate-300 text-[11px]">-</span>
                          )}
                        </div>
                      </td>

                      {/* Remarks */}
                      <td className="py-3 px-4 max-w-xs truncate text-slate-500" title={item.remarks}>
                        {item.remarks || <span className="text-slate-300">-</span>}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Edit Record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
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

      {/* Record / Edit Expense Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingExpense ? 'Edit Expense Record' : 'Record New Expense'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Capture operational expenditures with instant UTR verification
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-4 mt-4 text-xs">
              {/* Date & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Expense Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="TECHNICIAN_TRAVEL">Technician Travel / Fuel</option>
                    <option value="COURIER_FREIGHT">Courier & Freight</option>
                    <option value="TECHNICIAN_PAYOUT">Technician Payout</option>
                    <option value="OFFICE_MISC">Office & Operations</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              {/* Amount & Incurred By */}
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
                  <label className="block text-slate-600 font-semibold mb-1">Incurred By / Staff *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh (Technician)"
                    value={formData.incurred_by}
                    onChange={(e) => setFormData({ ...formData, incurred_by: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Paid To & Payment Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Paid To / Vendor</label>
                  <input
                    type="text"
                    placeholder="e.g. HP Petrol Pump / DTDC"
                    value={formData.paid_to}
                    onChange={(e) => setFormData({ ...formData, paid_to: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Payment Mode</label>
                  <select
                    value={formData.payment_mode}
                    onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer (IMPS/NEFT)</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>
              </div>

              {/* UTR / Transaction Reference Number */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  UPI UTR / Transaction Reference No. <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 423987123456 or Bank Ref ID"
                  value={formData.utr_number}
                  onChange={(e) => setFormData({ ...formData, utr_number: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Purpose / Remarks</label>
                <textarea
                  rows="2"
                  placeholder="e.g. Fuel for visiting 4 vehicle installation sites in Warangal..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                >
                  {formSubmitting ? 'Saving...' : editingExpense ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
