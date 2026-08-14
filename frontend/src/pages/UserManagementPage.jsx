import React, { useState, useEffect } from 'react';
import { UserCheck, Plus, Shield, Phone, Mail, MapPin, RefreshCw } from 'lucide-react';
import { fetchUsers, createUser } from '../services/api';
import { ROLES } from '../context/AuthContext';

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('INSTALLER');
  const [region, setRegion] = useState('South Zone');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchUsers();
      if (res.success) setUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!name || !phone || !role) return;

    setSubmitting(true);
    try {
      const res = await createUser({ name, phone, email, role, region });
      if (res.success) {
        setShowModal(false);
        setName('');
        setPhone('');
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
            <UserCheck className="w-5 h-5 text-purple-600" /> User Roles & Access Control Management
          </h2>
          <p className="text-xs text-slate-500">Manage internal team roles, installer permissions, dealer access, and regional assignments</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              <th className="p-3.5 font-bold">User Name</th>
              <th className="p-3.5 font-bold">Phone / Contact</th>
              <th className="p-3.5 font-bold">Email</th>
              <th className="p-3.5 font-bold">Assigned Role</th>
              <th className="p-3.5 font-bold">Region / Zone</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const roleMeta = ROLES[u.role] || ROLES.SUPER_ADMIN;
              return (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3.5 font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 text-xs font-bold">
                      {u.name.charAt(0)}
                    </span>
                    {u.name}
                  </td>
                  <td className="p-3.5 font-mono text-slate-600">{u.phone}</td>
                  <td className="p-3.5 text-slate-500">{u.email || '-'}</td>
                  <td className="p-3.5">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                      {roleMeta.label}
                    </span>
                  </td>
                  <td className="p-3.5 text-slate-500">{u.region || 'All India'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-purple-600" /> Create System User
            </h3>

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-medium"
                >
                  {Object.values(ROLES).map(r => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 text-xs rounded-xl font-medium">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl shadow-xs">
                  {submitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
