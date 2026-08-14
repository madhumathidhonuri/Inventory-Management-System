import React, { useState, useEffect } from 'react';
import { Settings, Plus, CheckCircle, Code, Tag, RefreshCw } from 'lucide-react';
import { fetchDeviceTypes, createDeviceType } from '../services/api';

export default function DeviceTypesPage() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [name, setName] = useState('');
  const [category, setCategory] = useState('GPS Tracker');
  const [customFieldsJson, setCustomFieldsJson] = useState('{\n  "require_sim": true,\n  "voltage": "9-36V"\n}');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchDeviceTypes();
      if (res.success) setTypes(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateType = async (e) => {
    e.preventDefault();
    if (!name || !category) return;
    
    let parsedFields = {};
    try {
      parsedFields = JSON.parse(customFieldsJson);
    } catch (e) {
      alert('Invalid JSON in custom fields attributes');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createDeviceType({ name, category, custom_fields: parsedFields });
      if (res.success) {
        setShowModal(false);
        setName('');
        loadData();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" /> Device Types Master Data Catalog
          </h2>
          <p className="text-xs text-slate-500">Extensible catalog allowing new device models, sensors, and custom attribute schemas without code migrations</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" /> Add Device Type
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {types.map((t) => (
          <div key={t.id} className="glass-panel p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-600" /> {t.name}
              </h3>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                {t.category}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
                Custom JSON Attribute Schema:
              </span>
              <pre className="bg-slate-900 p-3 rounded-xl text-[11px] font-mono text-cyan-300 overflow-x-auto">
                {JSON.stringify(t.custom_fields, null, 2)}
              </pre>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" /> Add New Device Type
            </h3>

            <form onSubmit={handleCreateType} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Device Model / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Volty 4G OBD Tracker"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-medium"
                >
                  <option value="GPS Tracker">GPS Tracker</option>
                  <option value="Fuel Sensor">Fuel Sensor</option>
                  <option value="OBD Device">OBD Device</option>
                  <option value="Accessory">Accessory</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Custom Attributes (JSON Schema)</span>
                  <Code className="w-3.5 h-3.5 text-slate-400" />
                </label>
                <textarea
                  rows={4}
                  value={customFieldsJson}
                  onChange={(e) => setCustomFieldsJson(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-200 rounded-xl p-2.5 text-xs text-cyan-300 font-mono"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 text-xs rounded-xl font-medium">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs">
                  {submitting ? 'Saving...' : 'Save Device Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
