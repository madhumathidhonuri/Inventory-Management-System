import React, { useState, useEffect } from 'react';
import { Users, Search, Phone, Mail, MapPin, Car, ShieldAlert, Clock, ChevronRight, RefreshCw } from 'lucide-react';
import { fetchCustomers, fetchCustomerById } from '../services/api';

export default function CustomerCrmPage({ onOpenTraceDrawer }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    loadData();
  }, [search]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchCustomers({ search });
      if (res.success) setCustomers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCustomer = async (id) => {
    try {
      const res = await fetchCustomerById(id);
      if (res.success) setSelectedCustomer(res.data);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" /> Customer CRM & Vehicle Fleet Management
          </h2>
          <p className="text-xs text-slate-500">Deduplicated customer profiles mapped to multiple vehicles and installation history</p>
        </div>

        <span className="text-xs text-indigo-700 font-bold px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 self-start md:self-auto">
          {customers.length} Unique Customers
        </span>
      </div>

      {/* Search Bar */}
      <div className="glass-panel p-4 rounded-2xl">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer name, phone, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-medium"
          />
        </div>
      </div>

      {/* Main Grid: Directory vs Detail Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Customer Directory List */}
        <div className="glass-panel rounded-2xl overflow-hidden divide-y divide-slate-100">
          <div className="p-3.5 bg-slate-50 font-bold text-xs text-slate-700 border-b border-slate-200">Customer Directory</div>
          
          <div className="max-h-[500px] overflow-y-auto">
            {customers.map((c) => (
              <div
                key={c.id}
                onClick={() => handleSelectCustomer(c.id)}
                className={`p-3.5 hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between ${
                  selectedCustomer?.customer?.id === c.id ? 'bg-indigo-50/80 border-l-4 border-indigo-600' : ''
                }`}
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-900">{c.name}</h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span className="font-mono text-indigo-700 font-bold">{c.phone_number}</span>
                    <span>• {c.customer_type}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {c.vehicle_count} Vehicles
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Customer Detail & Fleet View */}
        <div className="lg:col-span-2 space-y-4">
          {selectedCustomer ? (
            <div className="glass-panel p-5 rounded-2xl space-y-5">
              
              {/* Customer Info Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{selectedCustomer.customer.name}</h3>
                  <p className="text-xs text-indigo-600 flex items-center gap-2 mt-1 font-medium">
                    <Phone className="w-3.5 h-3.5" /> <span className="font-mono">{selectedCustomer.customer.phone_number}</span>
                    {selectedCustomer.customer.email && <span>• {selectedCustomer.customer.email}</span>}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {selectedCustomer.customer.customer_type}
                </span>
              </div>

              {/* Address & Source */}
              <div className="text-xs text-slate-600 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>{selectedCustomer.customer.address || 'No address provided'}</span>
              </div>

              {/* Vehicle Fleet Cards */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Installed Vehicles Fleet ({selectedCustomer.installations.length})
                </h4>

                <div className="space-y-3">
                  {selectedCustomer.installations.map((inst) => (
                    <div key={inst.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Car className="w-4 h-4 text-amber-600" />
                          <span className="font-mono font-bold text-amber-700 text-sm">{inst.vehicle_number}</span>
                          <span className="text-slate-500 font-medium">({inst.vehicle_type})</span>
                        </div>
                        <div className="text-slate-500 flex items-center gap-3 text-[11px]">
                          <span>IMEI: <button onClick={() => onOpenTraceDrawer(inst.imei_number)} className="font-mono text-blue-600 hover:underline font-bold">{inst.imei_number}</button></span>
                          <span>Device: {inst.device_type_name}</span>
                        </div>
                      </div>

                      <div className="text-right space-y-1">
                        <span className="text-emerald-700 font-mono font-bold">₹{inst.sale_price}</span>
                        <div className="text-[10px] text-slate-400">Installed: {inst.installation_date}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reminders & Service Follow-ups */}
              {selectedCustomer.reminders.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" /> Pending Follow-up Reminders
                  </h4>
                  {selectedCustomer.reminders.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs text-slate-700">
                      <span>{r.type}: {r.remarks}</span>
                      <span className="font-mono text-amber-800 font-bold">Due: {r.due_date}</span>
                    </div>
                  ))}
                </div>
              )}

            </div>
          ) : (
            <div className="glass-panel p-12 rounded-2xl text-center text-slate-400 text-xs">
              Select a customer from the directory on the left to view their complete vehicle fleet and service history.
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
