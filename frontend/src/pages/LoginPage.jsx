import React, { useState } from 'react';
import {
  Shield,
  Wrench,
  DollarSign,
  Lock,
  Mail,
  ArrowRight,
  Boxes,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  Activity,
  Car,
  TrendingUp,
  Cpu,
  Layers,
  KeyRound,
  Check
} from 'lucide-react';
import { useAuth, SAMPLE_USERS, ROLES } from '../context/AuthContext';

export default function LoginPage() {
  const { login, loginAsRole } = useAuth();

  const [selectedRole, setSelectedRole] = useState('SUPER_ADMIN');
  const [email, setEmail] = useState(SAMPLE_USERS[0].email);
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const roleConfigs = {
    SUPER_ADMIN: {
      role: 'SUPER_ADMIN',
      name: 'Super Admin (Owner)',
      tagline: 'Full Master Workspace & Data Governance',
      email: 'owner@fueltracks.in',
      password: 'admin123',
      icon: Shield,
      accent: 'purple',
      badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
      activeBorderClass: 'border-purple-600 ring-2 ring-purple-500/20 bg-purple-50/40',
      activeBtnClass: 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-200',
      tagColor: 'text-purple-600',
      permissions: [
        'Complete master deletion & wipe access',
        'Live Team Edits & Activity Audit Log',
        'Download complete audits (Excel/CSV)',
        'Custom column manager & user control'
      ]
    },
    ADMIN_TEAM: {
      role: 'ADMIN_TEAM',
      name: 'Operations Admin Team',
      tagline: 'Vehicle & Installation Certificate Entry',
      email: 'admin@fueltracks.in',
      password: 'admin123',
      icon: Wrench,
      accent: 'amber',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
      activeBorderClass: 'border-amber-600 ring-2 ring-amber-500/20 bg-amber-50/40',
      activeBtnClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200',
      tagColor: 'text-amber-700',
      permissions: [
        'Vehicle Number & Chassis/Engine input',
        'Customer Name & Phone Number editing',
        'Certificate Issued Date & Issued To',
        '🔒 Core IMEI/SIM & Deletion locked'
      ]
    },
    SALES_TEAM: {
      role: 'SALES_TEAM',
      name: 'Sales Commercial Team',
      tagline: 'Billing, Costs & Payment Collection',
      email: 'sales@fueltracks.in',
      password: 'sales123',
      icon: DollarSign,
      accent: 'emerald',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      activeBorderClass: 'border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/40',
      activeBtnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200',
      tagColor: 'text-emerald-700',
      permissions: [
        'Cost, Tax & Total Sale Price entry',
        'Installation Charges & Received By',
        '1-Click Payment Status (Paid / Pending)',
        '🔒 Vehicle & Hardware fields locked'
      ]
    }
  };

  const activeConfig = roleConfigs[selectedRole] || roleConfigs.SUPER_ADMIN;

  const handleSelectRole = (roleKey) => {
    setSelectedRole(roleKey);
    const cfg = roleConfigs[roleKey];
    if (cfg) {
      setEmail(cfg.email);
      setPassword(cfg.password);
    }
    setError('');
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      const res = login(email, password);
      if (!res.success) {
        const userMatch = SAMPLE_USERS.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
        if (userMatch) {
          loginAsRole(userMatch.role);
        } else {
          setError('Invalid credentials. Please select one of the designated role cards.');
        }
      }
      setLoading(false);
    }, 250);
  };

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden font-sans text-slate-900 flex flex-col justify-between">
      
      {/* Background Decorative Ambient Blobs (No Blue) */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-200/40 rounded-full blur-3xl pointer-events-none -translate-y-1/2" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-200/40 rounded-full blur-3xl pointer-events-none translate-y-1/3" />
      <div className="absolute top-1/2 right-10 w-72 h-72 bg-amber-100/50 rounded-full blur-3xl pointer-events-none" />

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

      {/* Top Header */}
      <header className="relative z-10 max-w-7xl w-full mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center shadow-md text-white font-extrabold text-base font-mono tracking-wider">
            FT
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-slate-900 tracking-tight">FuelTracks IMS</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 text-[10px] font-bold tracking-wide">
                v2.4 Live
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">GPS Telematics & Traceability System</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Role-Based Access Active</span>
          </div>
        </div>
      </header>

      {/* Main Split Layout */}
      <main className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 my-auto py-6 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12">
        
        {/* Left Side: System Highlights & Role Portal Picker */}
        <div className="flex-1 w-full max-w-xl space-y-6">
          
          {/* Welcome Badge & Title */}
          <div className="space-y-3 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200/80 text-slate-700 text-xs font-bold shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>Multi-Role Operations Workspace</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Enterprise Fleet & Device Management
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed max-w-lg">
              Streamline hardware dispatches, vehicle installations, and commercial payment collections with granular role-based permissions.
            </p>
          </div>

          {/* 3 Role Selection Cards */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
              Select Your Team Portal
            </div>

            <div className="grid grid-cols-1 gap-3">
              {Object.values(roleConfigs).map((cfg) => {
                const IconComponent = cfg.icon;
                const isSelected = selectedRole === cfg.role;

                return (
                  <div
                    key={cfg.role}
                    onClick={() => handleSelectRole(cfg.role)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white/90 backdrop-blur-sm relative flex items-center justify-between gap-4 group ${
                      isSelected
                        ? `${cfg.activeBorderClass} shadow-md`
                        : 'border-slate-200/90 hover:border-slate-300 hover:bg-white shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`p-2.5 rounded-xl border shrink-0 transition-transform group-hover:scale-105 ${cfg.badgeClass}`}>
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 truncate">{cfg.name}</h3>
                          {isSelected && (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${cfg.badgeClass}`}>
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{cfg.tagline}</p>
                      </div>
                    </div>

                    <div className="hidden sm:flex flex-col items-end shrink-0">
                      <span className="text-[11px] font-mono font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                        {cfg.email}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="text-center border-r border-slate-100 pr-2">
              <div className="text-lg font-bold font-mono text-slate-900">604</div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Master Stock</div>
            </div>
            <div className="text-center border-r border-slate-100 px-2">
              <div className="text-lg font-bold font-mono text-emerald-700">226</div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Installed</div>
            </div>
            <div className="text-center pl-2">
              <div className="text-lg font-bold font-mono text-purple-700">100%</div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Audit Track</div>
            </div>
          </div>

        </div>

        {/* Right Side: Authentication Box */}
        <div className="w-full max-w-md">
          
          <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xl shadow-slate-200/40 relative space-y-6">
            
            {/* Top Accent Line */}
            <div className={`h-1.5 w-24 rounded-full ${
              selectedRole === 'SUPER_ADMIN' ? 'bg-purple-600' :
              selectedRole === 'ADMIN_TEAM' ? 'bg-amber-600' : 'bg-emerald-600'
            }`} />

            {/* Portal Header */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-slate-900">Portal Login</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${activeConfig.badgeClass}`}>
                  {activeConfig.name}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Sign in with your team credentials to access your designated workspace.
              </p>
            </div>

            {/* Active Role Permissions Card */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Authorized Permissions for this Role:
              </div>
              <div className="space-y-1">
                {activeConfig.permissions.map((perm, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                    <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${activeConfig.tagColor}`} />
                    <span>{perm}</span>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleFormSubmit} className="space-y-4">
              
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" /> Work Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-800 focus:bg-white transition-all"
                  placeholder="name@fueltracks.in"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-500" /> Security Password
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Demo: admin123</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-800 focus:bg-white transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-slate-900/10 cursor-pointer transition-all active:scale-[0.99] mt-2"
              >
                <span>{loading ? 'Authenticating...' : `Sign In to ${activeConfig.name}`}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* 1-Click Fast Switch Bar */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">
                1-Click Instant Login Demo
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => loginAsRole('SUPER_ADMIN')}
                  className="p-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 text-[11px] font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Instant Login as Super Admin"
                >
                  <Shield className="w-3.5 h-3.5 text-purple-600" />
                  <span className="truncate">Owner</span>
                </button>

                <button
                  type="button"
                  onClick={() => loginAsRole('ADMIN_TEAM')}
                  className="p-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-[11px] font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Instant Login as Operations Admin Team"
                >
                  <Wrench className="w-3.5 h-3.5 text-amber-700" />
                  <span className="truncate">Admin</span>
                </button>

                <button
                  type="button"
                  onClick={() => loginAsRole('SALES_TEAM')}
                  className="p-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Instant Login as Sales Commercial Team"
                >
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="truncate">Sales</span>
                </button>
              </div>
            </div>

          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-7xl w-full mx-auto px-6 py-4 text-center text-xs text-slate-400 border-t border-slate-200/80">
        FuelTracks Telematics Fleet & Device Inventory Management Platform • Encrypted Role-Based Security
      </footer>

    </div>
  );
}
