import React, { useState, useEffect } from 'react';
import { 
  UserCheck, Plus, Shield, Phone, Mail, MapPin, RefreshCw, Key, 
  Check, Copy, Edit2, Trash2, X, CheckCircle2, Lock, Eye, EyeOff, 
  Sparkles, Sliders, Layers, DollarSign, Car, Building, Boxes
} from 'lucide-react';
import { fetchUsers, createUser, updateUser, deleteUser, fetchDeviceTypes } from '../services/api';
import { ROLES, DEFAULT_ROLE_COLUMNS } from '../context/AuthContext';

// Available column categories for permissions matrix
const STANDARD_COLUMN_GROUPS = [
  {
    category: 'Vehicle, Registration & Certificates',
    icon: Car,
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    columns: [
      'Vehicle Number',
      'Customer Name',
      'Customer Contact',
      'Chasis Number',
      'Engine Number',
      'Certificate Issued Date',
      'Certificate Issued To',
      'RTO Location'
    ]
  },
  {
    category: 'Commercial, Pricing & Payments',
    icon: DollarSign,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    columns: [
      'Sales Person',
      'Cost',
      'Tax',
      'Total Cost',
      'Installation Charges',
      'Payment Status',
      'Amount Received',
      'Amount Received By',
      'Sale Price'
    ]
  },
  {
    category: 'Logistics & Stock Location',
    icon: Building,
    color: 'text-purple-700 bg-purple-50 border-purple-200',
    columns: [
      'Stock Place',
      'Stock Place Date',
      'SIM Number',
      'Status',
      'Remarks'
    ]
  },
  {
    category: 'Core Hardware Identifiers (Restricted)',
    icon: Boxes,
    color: 'text-slate-700 bg-slate-100 border-slate-200',
    columns: [
      'IMEI Number',
      'Device Type',
      'Vendor Name',
      'Purchase Price'
    ]
  }
];

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedMsg, setCopiedMsg] = useState('');
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('123456');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('ADMIN_TEAM');
  const [region, setRegion] = useState('All India');
  const [selectedColumns, setSelectedColumns] = useState(DEFAULT_ROLE_COLUMNS.ADMIN_TEAM);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation
  const [deletingUser, setDeletingUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchUsers();
      if (res.success) {
        setUsers(res.data || []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingUserId(null);
    setName('');
    setPhone('');
    setEmail('');
    setPassword('123456');
    setRole('ADMIN_TEAM');
    setRegion('All India');
    setSelectedColumns(DEFAULT_ROLE_COLUMNS.ADMIN_TEAM);
    setShowModal(true);
  };

  const handleOpenEditModal = (user) => {
    setEditingUserId(user.id);
    setName(user.name || '');
    setPhone(user.phone || '');
    setEmail(user.email || '');
    setPassword(user.password || '123456');
    setRole(user.role || 'ADMIN_TEAM');
    setRegion(user.region || 'All India');
    
    // If user has specific allowed_columns set, use them; otherwise use role defaults
    const currentCols = Array.isArray(user.allowed_columns) && user.allowed_columns.length > 0
      ? user.allowed_columns
      : (DEFAULT_ROLE_COLUMNS[user.role] || []);
    setSelectedColumns(currentCols);
    setShowModal(true);
  };

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    // When switching role in modal, preset the default columns for that role
    if (newRole === 'ADMIN_TEAM') {
      setSelectedColumns(DEFAULT_ROLE_COLUMNS.ADMIN_TEAM);
    } else if (newRole === 'SALES_TEAM') {
      setSelectedColumns(DEFAULT_ROLE_COLUMNS.SALES_TEAM);
    } else if (newRole === 'DEALER') {
      setSelectedColumns(DEFAULT_ROLE_COLUMNS.DEALER || [
        'Vehicle Number',
        'Customer Name',
        'Customer Contact',
        'Certificate Issued Date',
        'Stock Place Date',
        'SIM Number',
        'Status',
        'Remarks'
      ]);
    } else if (newRole === 'SUPER_ADMIN') {
      // Super Admin gets all columns
      const allCols = STANDARD_COLUMN_GROUPS.flatMap(g => g.columns);
      setSelectedColumns(allCols);
    }
  };

  const toggleColumnSelection = (col) => {
    setSelectedColumns(prev => {
      const exists = prev.some(c => c.toLowerCase() === col.toLowerCase());
      if (exists) {
        return prev.filter(c => c.toLowerCase() !== col.toLowerCase());
      } else {
        return [...prev, col];
      }
    });
  };

  const handleSelectAllColumns = () => {
    const allCols = STANDARD_COLUMN_GROUPS.flatMap(g => g.columns);
    setSelectedColumns(allCols);
  };

  const handleClearAllColumns = () => {
    setSelectedColumns([]);
  };

  const handleResetToRoleDefault = () => {
    if (role === 'ADMIN_TEAM') {
      setSelectedColumns(DEFAULT_ROLE_COLUMNS.ADMIN_TEAM);
    } else if (role === 'SALES_TEAM') {
      setSelectedColumns(DEFAULT_ROLE_COLUMNS.SALES_TEAM);
    } else {
      handleSelectAllColumns();
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!name.trim() || !role) {
      alert('Please provide Name and Role');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim() || `USR-${Date.now().toString().slice(-6)}`,
        email: email.trim() || `${name.toLowerCase().replace(/\s+/g, '')}@fueltracks.in`,
        password: password.trim() || '123456',
        role,
        region: region.trim() || 'All India',
        allowed_columns: selectedColumns
      };

      if (editingUserId) {
        await updateUser(editingUserId, payload);
      } else {
        await createUser(payload);
      }

      setShowModal(false);
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    try {
      await deleteUser(deletingUser.id);
      setDeletingUser(null);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const copyCredentials = (user) => {
    const text = `FuelTracks IMS Login Credentials:\nRole: ${user.role}\nEmail/Username: ${user.email || user.phone}\nPassword: ${user.password || '123456'}`;
    navigator.clipboard.writeText(text);
    setCopiedMsg(`Copied credentials for ${user.name}`);
    setTimeout(() => setCopiedMsg(''), 2500);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      
      {/* Toast Notification */}
      {copiedMsg && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{copiedMsg}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-purple-600" /> User Roles & Granular Access Control
          </h2>
          <p className="text-xs text-slate-500">
            Create logins for Admin and Sales teams, set passwords, and customize exact editable column permissions.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors shadow-2xs cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Create Team Login
        </button>
      </div>

      {/* Role Access Defaults Info Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-amber-900">
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px]">
              ADMIN TEAM DEFAULTS
            </span>
            <span>Operations & Technical Entry</span>
          </div>
          <p className="text-amber-800 text-[11px] leading-relaxed">
            Can edit <strong>Vehicle Number, Chassis, Engine, Customer Name, Certificate Issued Date, and Stock Place</strong>. Commercial pricing is locked by default unless customized below.
          </p>
        </div>

        <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-emerald-900">
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px]">
              SALES TEAM DEFAULTS
            </span>
            <span>Commercials & Payment Collection</span>
          </div>
          <p className="text-emerald-800 text-[11px] leading-relaxed">
            Can edit <strong>Cost, Tax, Total Cost, Installation Charges, Sales Person, and Payment Received</strong> status. Core hardware identifiers remain locked.
          </p>
        </div>
      </div>

      {/* Users List Table */}
      <div className="glass-panel rounded-2xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-purple-600" /> Loading team accounts & permissions...
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No user accounts found. Click "Create Team Login" to add your first user.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                <tr>
                  <th className="p-3.5">Team Member</th>
                  <th className="p-3.5">Assigned Role</th>
                  <th className="p-3.5">Login Email / Username</th>
                  <th className="p-3.5">Password</th>
                  <th className="p-3.5">Editable Columns Access</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {users.map((u) => {
                  const roleMeta = ROLES[u.role] || ROLES.SUPER_ADMIN;
                  const isDealer = u.role === 'DEALER';
                  const isSales = u.role === 'SALES_TEAM' || u.role === 'SALES_MANAGER';
                  const isAdmin = u.role === 'ADMIN_TEAM' || u.role === 'WAREHOUSE_MANAGER';
                  const isOwner = u.role === 'SUPER_ADMIN';

                  const allowedCols = Array.isArray(u.allowed_columns) && u.allowed_columns.length > 0
                    ? u.allowed_columns
                    : (DEFAULT_ROLE_COLUMNS[u.role] || []);

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & Region */}
                      <td className="p-3.5 font-bold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${
                            isDealer
                              ? 'bg-blue-100 text-blue-800'
                              : isSales
                              ? 'bg-emerald-100 text-emerald-800'
                              : isAdmin
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-purple-100 text-purple-800'
                          }`}>
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-slate-900 font-semibold">{u.name}</div>
                            <div className="text-[11px] font-normal text-slate-400">
                              {isDealer ? `📍 Dealer: ${u.region || 'Branch'}` : (u.region || 'All India')}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 ${
                          isDealer
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : isSales
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : isAdmin
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : 'bg-purple-100 text-purple-800 border border-purple-200'
                        }`}>
                          {isDealer ? '🏪' : isSales ? '💼' : isAdmin ? '🛠️' : '👑'} {isDealer ? 'Dealer / Partner' : roleMeta.label}
                        </span>
                      </td>

                      {/* Email / Username */}
                      <td className="p-3.5 font-mono text-slate-600">
                        {u.email || u.phone}
                      </td>

                      {/* Password */}
                      <td className="p-3.5 font-mono text-slate-500">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-bold text-slate-700">
                          {u.password || '123456'}
                        </span>
                      </td>

                      {/* Editable Columns Pill Badges */}
                      <td className="p-3.5 max-w-xs">
                        {isOwner ? (
                          <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                            Full Master Edit Rights (All Columns)
                          </span>
                        ) : allowedCols.length === 0 ? (
                          <span className="text-slate-400 text-[11px]">Read-only access (No edit rights)</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-[10px] font-bold text-slate-500 mr-1">
                              {allowedCols.length} Columns:
                            </span>
                            {allowedCols.slice(0, 3).map((c, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium truncate max-w-[110px]">
                                {c}
                              </span>
                            ))}
                            {allowedCols.length > 3 && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold">
                                +{allowedCols.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => copyCredentials(u)}
                            title="Copy login email & password to clipboard"
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleOpenEditModal(u)}
                            title="Edit User & Column Permissions"
                            className="p-1.5 hover:bg-purple-50 text-purple-700 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {!isOwner && (
                            <button
                              onClick={() => setDeletingUser(u)}
                              title="Delete / Revoke User"
                              className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit User Modal with Column Permission Checklist */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl p-6 space-y-5 shadow-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-50 text-purple-700 rounded-xl">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingUserId ? 'Edit User & Column Edit Permissions' : 'Create Team Login & Set Edit Access'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure login credentials and select which columns this user can edit in Stock Inventory.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveUser} className="space-y-4 overflow-y-auto pr-1 flex-1">
              
              {/* Row 1: Name, Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:outline-none focus:border-slate-800 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Team Role *</label>
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:outline-none focus:border-slate-800 focus:bg-white"
                  >
                    <option value="ADMIN_TEAM">Admin Team (Vehicle & Certificate Entry)</option>
                    <option value="SALES_TEAM">Sales Team (Cost & Payment Collection)</option>
                    <option value="DEALER">Dealer / Partner (Scoped Stock Portal)</option>
                    <option value="SUPER_ADMIN">Super Admin (Master Full Access)</option>
                  </select>
                </div>
              </div>

              {/* Dealer Portal Scoping Info Banner */}
              {role === 'DEALER' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-2.5 text-xs text-blue-900">
                  <Building className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Dealer Account Isolation:</strong> When this dealer logs in, they will only see and manage stock assigned to <span className="font-semibold text-blue-800">"{name || 'their dealer name'}"</span> or location <span className="font-semibold text-blue-800">"{region || 'their region'}"</span> (e.g. Jaya Surya in Kurnool).
                  </div>
                </div>
              )}

              {/* Row 2: Email & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Login Email / Username *</label>
                  <input
                    type="text"
                    required
                    placeholder={role === 'DEALER' ? 'e.g. jayasurya@fueltracks.in' : 'e.g. ramesh@fueltracks.in'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-slate-800 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pr-8 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-slate-800 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 3: Contact & Region */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number / Contact</label>
                  <input
                    type="text"
                    placeholder="e.g. 9849012345"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-slate-800 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Dealer Region / City *</label>
                  <input
                    type="text"
                    placeholder="e.g. Kurnool, Hyderabad, Bangalore"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-slate-800 focus:bg-white"
                  />
                </div>
              </div>

              {/* Column Edit Access Control Section */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-purple-600" /> Select Editable Columns
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Unchecked columns will be locked (`🔒`) during inventory editing.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={handleResetToRoleDefault}
                      className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Role Defaults
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAllColumns}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllColumns}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Column Groups Checkboxes */}
                <div className="space-y-3 pt-1">
                  {STANDARD_COLUMN_GROUPS.map((group, gIdx) => {
                    const GroupIcon = group.icon;
                    return (
                      <div key={gIdx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                        <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                          <span className={`p-1 rounded-lg border ${group.color}`}>
                            <GroupIcon className="w-3.5 h-3.5" />
                          </span>
                          <span>{group.category}</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                          {group.columns.map((col) => {
                            const isChecked = selectedColumns.some(
                              c => c.toLowerCase() === col.toLowerCase()
                            );
                            return (
                              <label
                                key={col}
                                onClick={() => toggleColumnSelection(col)}
                                className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium cursor-pointer transition-all ${
                                  isChecked
                                    ? 'bg-white border-purple-400 text-slate-900 shadow-2xs font-semibold'
                                    : 'bg-slate-100/70 border-transparent text-slate-500 hover:bg-slate-200/60'
                                }`}
                              >
                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center text-white ${
                                  isChecked ? 'bg-purple-600 border-purple-600' : 'border-slate-300 bg-white'
                                }`}>
                                  {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <span className="truncate">{col}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="text-[11px] text-slate-500 font-medium">
                  {selectedColumns.length} columns selected for edit access
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    {submitting ? 'Saving...' : editingUserId ? 'Save Permissions' : 'Create User Login'}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Revoke User Access?</h3>
              <p className="text-xs text-slate-600">
                Are you sure you want to delete login for <strong className="text-slate-900">{deletingUser.name}</strong> ({deletingUser.email || deletingUser.phone})?
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDeletingUser(null)}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
              >
                Revoke Access
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

