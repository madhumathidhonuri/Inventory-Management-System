import React, { useState, useEffect } from 'react';
import {
  Tag,
  DollarSign,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  TrendingUp,
  Percent,
  RefreshCw,
  Layers
} from 'lucide-react';
import { fetchDevicePricing, upsertDevicePricing, deleteDevicePricing } from '../services/api';

const PROJECT_CATEGORIES = ['GENERAL', 'VLTD', 'TG MINING', 'AP MINING'];

export default function DevicePricingModal({ isOpen, onClose }) {
  const [pricingList, setPricingList] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  // Form State
  const [selectedDeviceType, setSelectedDeviceType] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('GENERAL');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [dealerPrice, setDealerPrice] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [minPrice, setMinPrice] = useState('');

  const loadPricing = async () => {
    try {
      setLoading(true);
      const res = await fetchDevicePricing();
      if (res.success) {
        setPricingList(res.data || []);
        setDeviceTypes(res.deviceTypes || []);
        if (res.deviceTypes?.length > 0 && !selectedDeviceType) {
          setSelectedDeviceType(res.deviceTypes[0].id);
        }
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to load device pricing' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPricing();
    }
  }, [isOpen]);

  const handleEditRow = (item) => {
    setSelectedDeviceType(item.device_type_id);
    setSelectedCategory(item.project_category);
    setPurchaseCost(item.purchase_cost || '');
    setDealerPrice(item.dealer_price || '');
    setRetailPrice(item.retail_price || '');
    setMinPrice(item.min_price || '');
  };

  const handleSavePricing = async (e) => {
    e.preventDefault();
    if (!selectedDeviceType) {
      setMsg({ type: 'error', text: 'Please select a device type' });
      return;
    }

    try {
      setSubmitting(true);
      setMsg({ type: '', text: '' });
      await upsertDevicePricing({
        device_type_id: Number(selectedDeviceType),
        project_category: selectedCategory,
        purchase_cost: Number(purchaseCost) || 0,
        dealer_price: Number(dealerPrice) || 0,
        retail_price: Number(retailPrice) || 0,
        min_price: Number(minPrice) || 0
      });

      setMsg({ type: 'success', text: 'Device rate card saved successfully' });
      loadPricing();
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to save rate' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePricing = async (id) => {
    if (!window.confirm('Are you sure you want to remove this pricing rule?')) return;
    try {
      await deleteDevicePricing(id);
      setMsg({ type: 'success', text: 'Pricing rule deleted' });
      loadPricing();
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to delete' });
    }
  };

  if (!isOpen) return null;

  // Real-time margin preview for form inputs
  const pCostNum = Number(purchaseCost) || 0;
  const retNum = Number(retailPrice) || 0;
  const dealNum = Number(dealerPrice) || 0;
  const retailMargin = retNum - pCostNum;
  const dealerMargin = dealNum - pCostNum;
  const retailMarginPct = retNum > 0 ? ((retailMargin / retNum) * 100).toFixed(0) : 0;
  const dealerMarginPct = dealNum > 0 ? ((dealerMargin / dealNum) * 100).toFixed(0) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-sm">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Device Pricing & Rate Master</h3>
              <p className="text-xs text-slate-500">
                Configure vendor purchase costs, dealer transfer prices, and retail installation rates.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {msg.text && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                msg.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
              }`}
            >
              {msg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{msg.text}</span>
            </div>
          )}

          {/* Rate Card Form */}
          <form onSubmit={handleSavePricing} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-blue-600" /> Set / Update Rate Card
              </span>
              <span className="text-[11px] text-slate-500">Auto-saves per device model & project tier</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {/* Device Type */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Device Model *</label>
                <select
                  required
                  value={selectedDeviceType}
                  onChange={(e) => setSelectedDeviceType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20"
                >
                  {deviceTypes.map((dt) => (
                    <option key={dt.id} value={dt.id}>
                      {dt.name} ({dt.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Project Category */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Project Tier *</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20"
                >
                  {PROJECT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Purchase Cost */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Vendor Purchase Cost (₹)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 1800"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Dealer Transfer Rate */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Dealer Transfer Rate (₹)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 2800"
                  value={dealerPrice}
                  onChange={(e) => setDealerPrice(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Retail / Customer Price */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Retail Installation Price (₹)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 4500"
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Min Selling Price */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Minimum Price Lock (MSP) (₹)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 2500"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Real-time Margin Preview Bar */}
            {pCostNum > 0 && (retNum > 0 || dealNum > 0) && (
              <div className="flex flex-wrap items-center gap-4 p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs">
                <div className="flex items-center gap-1.5 text-blue-900 font-semibold">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <span>Margin Preview:</span>
                </div>
                {dealNum > 0 && (
                  <div className="text-slate-700">
                    Dealer Gross Margin: <span className="font-bold text-emerald-700">₹{dealerMargin}</span> ({dealerMarginPct}%)
                  </div>
                )}
                {retNum > 0 && (
                  <div className="text-slate-700">
                    Retail Gross Margin: <span className="font-bold text-emerald-700">₹{retailMargin}</span> ({retailMarginPct}%)
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
              >
                {submitting ? 'Saving...' : 'Save Rate Rule'}
              </button>
            </div>
          </form>

          {/* Pricing List Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Configured Rate Matrix ({pricingList.length})
              </h4>
              <button
                onClick={loadPricing}
                className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Device Model</th>
                    <th className="py-2.5 px-4">Project Tier</th>
                    <th className="py-2.5 px-4">Purchase Cost</th>
                    <th className="py-2.5 px-4">Dealer Rate</th>
                    <th className="py-2.5 px-4">Retail Rate</th>
                    <th className="py-2.5 px-4">Gross Margin</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-400">
                        Loading rate matrix...
                      </td>
                    </tr>
                  ) : pricingList.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-400">
                        No pricing rules configured yet. Set one above!
                      </td>
                    </tr>
                  ) : (
                    pricingList.map((row) => {
                      const pCost = row.purchase_cost || 0;
                      const rPrice = row.retail_price || 0;
                      const margin = rPrice - pCost;
                      const marginPct = rPrice > 0 ? ((margin / rPrice) * 100).toFixed(0) : 0;

                      return (
                        <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-4 font-semibold text-slate-900">
                            {row.device_type_name}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-[10px] font-bold">
                              {row.project_category}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-medium text-slate-600">
                            ₹{Number(row.purchase_cost || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-slate-900">
                            ₹{Number(row.dealer_price || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-blue-700">
                            ₹{Number(row.retail_price || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-4">
                            {rPrice > 0 ? (
                              <span className="text-emerald-700 font-bold">
                                +₹{margin.toLocaleString('en-IN')} ({marginPct}%)
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleEditRow(row)}
                                className="px-2 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded text-[11px] font-medium transition-all"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeletePricing(row.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-all"
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
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs hover:bg-slate-300 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
