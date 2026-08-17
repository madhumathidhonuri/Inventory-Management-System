import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Phone,
  Mail,
  MapPin,
  Car,
  Key,
  Clock,
  ChevronRight,
  RefreshCw,
  Edit2,
  Trash2,
  Copy,
  Plus,
  CheckCircle2,
  DollarSign,
  ShieldCheck,
  X
} from 'lucide-react';
import { fetchCustomers, fetchCustomerById, updateCustomer, deleteCustomer } from '../services/api';

export default function CustomerCrmPage({ onOpenTraceDrawer }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomerData, setSelectedCustomerData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Edit Customer Modal State
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    phone_number: '',
    email: '',
    address: '',
    customer_type: 'Individual',
    software_user_id: '',
    software_password: '',
    notes: ''
  });
  const [savingCustomer, setSavingCustomer] = useState(false);

  useEffect(() => {
    loadData();
  }, [search]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchCustomers({ search });
      if (res.success) {
        setCustomers(res.data);
        if (res.data.length > 0 && !selectedCustomerId) {
          handleSelectCustomer(res.data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCustomer = async (id) => {
    setSelectedCustomerId(id);
    setLoadingDetail(true);
    try {
      const res = await fetchCustomerById(id);
      if (res.success) setSelectedCustomerData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleOpenEdit = (customer) => {
    setEditingCustomer(customer);
    setEditFormData({
      name: customer.name || '',
      phone_number: customer.phone_number || '',
      email: customer.email || '',
      address: customer.address || '',
      customer_type: customer.customer_type || 'Individual',
      software_user_id: customer.software_user_id || '',
      software_password: customer.software_password || '',
      notes: customer.notes || ''
    });
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setSavingCustomer(true);
    try {
      const res = await updateCustomer(editingCustomer.id, editFormData);
      if (res.success) {
        setEditingCustomer(null);
        loadData();
        handleSelectCustomer(editingCustomer.id);
      }
    } catch (err) {
      alert('Failed to update customer: ' + err.message);
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleDeleteCustomer = async (id) => {
    if (!window.confirm('Are you sure you want to delete this customer and their installation records?')) return;
    try {
      const res = await deleteCustomer(id);
      if (res.success) {
        setSelectedCustomerId(null);
        setSelectedCustomerData(null);
        loadData();
      }
    } catch (err) {
      alert('Failed to delete customer: ' + err.message);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard!`);
  };

  // Metrics
  const totalVehiclesCount = customers.reduce((acc, c) => acc + (parseInt(c.vehicle_count) || 0), 0);
  const totalRevenueBilled = customers.reduce((acc, c) => acc + (parseFloat(c.total_billed) || 0), 0);

  return (
    <div className="space-y-6">
      
      {/* Top Banner & CRM Metrics */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" /> Customer CRM & Fleet Vehicle Profiles
          </h2>
          <p className="text-xs text-slate-500">
            Unified customer profiles linked to multiple vehicles, software login credentials, and payment history.
          </p>
        </div>

        {/* Aggregate Stats Badges */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <div className="px-3.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 font-bold">
            👥 {customers.length} Customers
          </div>
          <div className="px-3.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-bold">
            🚗 {totalVehiclesCount} Installed Vehicles
          </div>
          <div className="px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-bold font-mono">
            ₹{totalRevenueBilled.toLocaleString()} Billed
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass-panel p-4 rounded-2xl">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer name, phone, address, software login..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-medium"
          />
        </div>
      </div>

      {/* Main Grid: Directory vs Detail Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Customer Directory List */}
        <div className="glass-panel rounded-2xl overflow-hidden divide-y divide-slate-100 flex flex-col h-[650px]">
          <div className="p-3.5 bg-slate-50 font-bold text-xs text-slate-700 border-b border-slate-200 flex items-center justify-between">
            <span>Customer Accounts</span>
            <span className="text-[11px] font-normal text-slate-500">{customers.length} total</span>
          </div>
          
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading directory...</div>
            ) : customers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No customers found.</div>
            ) : (
              customers.map((c) => {
                const isSelected = selectedCustomerId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCustomer(c.id)}
                    className={`p-3.5 hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between ${
                      isSelected ? 'bg-indigo-50/90 border-l-4 border-indigo-600' : ''
                    }`}
                  >
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-900">{c.name}</h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="font-mono text-indigo-700 font-bold">{c.phone_number}</span>
                        <span>• {c.customer_type || 'Individual'}</span>
                      </div>
                      {c.software_user_id && (
                        <div className="text-[10px] text-indigo-600 font-mono">
                          ID: <strong>{c.software_user_id}</strong>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {c.vehicle_count || 0} Veh
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Customer Detail & Fleet View */}
        <div className="lg:col-span-2 space-y-4">
          {loadingDetail ? (
            <div className="glass-panel p-16 rounded-2xl text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" /> Loading customer profile...
            </div>
          ) : selectedCustomerData ? (
            <div className="glass-panel p-6 rounded-2xl space-y-6">
              
              {/* Customer Info Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">{selectedCustomerData.customer.name}</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {selectedCustomerData.customer.customer_type || 'Individual'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1.5 font-medium">
                    <span className="flex items-center gap-1 text-indigo-700 font-mono font-bold">
                      <Phone className="w-3.5 h-3.5" /> {selectedCustomerData.customer.phone_number}
                    </span>
                    {selectedCustomerData.customer.email && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <Mail className="w-3.5 h-3.5" /> {selectedCustomerData.customer.email}
                      </span>
                    )}
                    {selectedCustomerData.customer.address && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <MapPin className="w-3.5 h-3.5" /> {selectedCustomerData.customer.address}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {selectedCustomerData.customer.phone_number && (
                    <a
                      href={`https://api.whatsapp.com/send?phone=${String(selectedCustomerData.customer.phone_number).replace(/[^0-9]/g, '')}&text=${encodeURIComponent(
                        `Hello ${selectedCustomerData.customer.name},\n\nGreetings from FuelTracks GPS Solutions!\n\nHere is your active account summary:\n🚗 *Registered Vehicles*: ${selectedCustomerData.installations.map(i => i.vehicle_number).join(', ') || 'N/A'}\n\n🔐 *GPS Software Login Credentials*:\n- *Username / ID*: ${selectedCustomerData.customer.software_user_id || 'Your mobile number'}\n- *Password*: ${selectedCustomerData.customer.software_password || 'Provided separately'}\n\nPlease reach out for any technical support.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                    >
                      <span>💬</span> WhatsApp Customer
                    </a>
                  )}

                  <button
                    onClick={() => handleOpenEdit(selectedCustomerData.customer)}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                    title="Edit Customer Profile"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteCustomer(selectedCustomerData.customer.id)}
                    className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors cursor-pointer"
                    title="Delete Customer Record"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* GPS Software Login Credentials Card */}
              <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-600 text-white">
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-indigo-950">GPS Tracking Software Credentials</div>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono mt-0.5">
                      <span className="text-indigo-900">
                        Login ID: <strong>{selectedCustomerData.customer.software_user_id || '- Not Set -'}</strong>
                      </span>
                      {selectedCustomerData.customer.software_password && (
                        <span className="text-indigo-900">
                          Password: <strong className="bg-indigo-100 px-1 py-0.2 rounded">{selectedCustomerData.customer.software_password}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {selectedCustomerData.customer.software_user_id && (
                    <button
                      onClick={() => copyToClipboard(
                        `User ID: ${selectedCustomerData.customer.software_user_id}\nPassword: ${selectedCustomerData.customer.software_password || ''}`,
                        'Credentials'
                      )}
                      className="px-2.5 py-1 bg-white hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Copy className="w-3 h-3" /> Copy Login
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenEdit(selectedCustomerData.customer)}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    Edit Login
                  </button>
                </div>
              </div>

              {/* Vehicle Fleet Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Installed Vehicle Fleet ({selectedCustomerData.installations.length})
                  </h4>
                  <span className="text-xs text-slate-500 font-mono">
                    Total: ₹{selectedCustomerData.installations.reduce((acc, i) => acc + (parseFloat(i.sale_price) || 0), 0)}
                  </span>
                </div>

                {selectedCustomerData.installations.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                    No vehicles registered for this customer yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedCustomerData.installations.map((inst) => {
                      const payStatus = (inst.payment_status || 'RECEIVED').toUpperCase();
                      const isPaid = payStatus.includes('REC') || payStatus.includes('PAID');

                      return (
                        <div key={inst.id} className="p-4 bg-slate-50 hover:bg-slate-100/70 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Car className="w-4 h-4 text-amber-600" />
                              <span className="font-mono font-bold text-amber-800 text-sm">{inst.vehicle_number}</span>
                              <span className="text-slate-500 font-medium">({inst.vehicle_type || 'Commercial'})</span>
                            </div>
                            <div className="text-slate-500 flex flex-wrap items-center gap-3 text-[11px]">
                              <span>
                                IMEI: <button onClick={() => onOpenTraceDrawer(inst.imei_number)} className="font-mono text-blue-600 hover:underline font-bold">{inst.imei_number}</button>
                              </span>
                              <span>Device: {inst.device_type_name}</span>
                              <span>Date: <strong className="font-mono text-slate-700">{inst.installation_date}</strong></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-auto">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {inst.payment_status || 'RECEIVED'}
                            </span>

                            <div className="text-right font-mono">
                              <div className="text-slate-900 font-bold">₹{inst.sale_price || 0}</div>
                            </div>

                            <a
                              href={`https://api.whatsapp.com/send?phone=${String(selectedCustomerData.customer.phone_number).replace(/[^0-9]/g, '')}&text=${encodeURIComponent(
                                `Dear ${selectedCustomerData.customer.name}, your GPS device (${inst.device_type_name}) is active in vehicle *${inst.vehicle_number}*.\n\nIMEI: ${inst.imei_number}\nDate: ${inst.installation_date}\nThank you!`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Share vehicle installation note on WhatsApp"
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                            >
                              <span>💬</span> Share
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reminders & Service Follow-ups */}
              {selectedCustomerData.reminders.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                  <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" /> 1-Year Warranty & Service Follow-ups
                  </h4>
                  {selectedCustomerData.reminders.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs text-slate-700 bg-white/70 p-2.5 rounded-xl">
                      <span>{r.type}: {r.remarks}</span>
                      <span className="font-mono text-amber-900 font-bold">Due: {r.due_date}</span>
                    </div>
                  ))}
                </div>
              )}

            </div>
          ) : (
            <div className="glass-panel p-16 rounded-2xl text-center text-slate-400 text-xs">
              Select a customer from the directory on the left to view their complete vehicle fleet and software credentials.
            </div>
          )}
        </div>

      </div>

      {/* Edit Customer Profile & Software Login Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-600" /> Edit Customer Profile & GPS Login
              </h3>
              <button onClick={() => setEditingCustomer(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer / Company Name *</label>
                <input
                  type="text"
                  required
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={editFormData.phone_number}
                    onChange={(e) => setEditFormData({ ...editFormData, phone_number: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Customer Type</label>
                  <select
                    value={editFormData.customer_type}
                    onChange={(e) => setEditFormData({ ...editFormData, customer_type: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Individual">Individual</option>
                    <option value="Fleet Owner">Fleet Owner</option>
                    <option value="Business">Business / Logistics</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email ID</label>
                <input
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Address / Hub</label>
                <input
                  type="text"
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* GPS Software Credentials */}
              <div className="p-3.5 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-3">
                <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-indigo-600" /> GPS Software Login Credentials
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-indigo-900 mb-1">Software User ID</label>
                    <input
                      type="text"
                      value={editFormData.software_user_id}
                      onChange={(e) => setEditFormData({ ...editFormData, software_user_id: e.target.value })}
                      className="w-full bg-white border border-indigo-200 rounded-xl p-2.5 text-xs font-mono text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-indigo-900 mb-1">Software Password</label>
                    <input
                      type="text"
                      value={editFormData.software_password}
                      onChange={(e) => setEditFormData({ ...editFormData, software_password: e.target.value })}
                      className="w-full bg-white border border-indigo-200 rounded-xl p-2.5 text-xs font-mono text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCustomer}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  {savingCustomer ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Save Changes
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
