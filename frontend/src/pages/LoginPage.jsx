import React, { useState } from 'react';
import {
  Shield,
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  RefreshCw,
  Boxes
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both your work email and password.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await login(email.trim(), password.trim());
      if (!res.success) {
        setError(res.error || 'Invalid credentials. Please verify your email and password.');
      }
    } catch (err) {
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 relative overflow-hidden font-sans text-slate-100 flex flex-col justify-between">
      
      {/* Background Ambient Glows (Zero Blue - Slate & Purple) */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none -translate-y-1/2" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none translate-y-1/3" />
      <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-30 pointer-events-none" />

      {/* Top Brand Header */}
      <header className="relative z-10 max-w-6xl w-full mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-600 flex items-center justify-center shadow-lg text-white font-extrabold text-base font-mono tracking-wider">
            FT
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-white tracking-tight">FuelTracks IMS</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-purple-300 text-[10px] font-bold border border-slate-700">
                Enterprise v2.4
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">GPS Telematics & Fleet Inventory Platform</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-800/80 border border-slate-700 px-3.5 py-1.5 rounded-full">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>Role-Based Access Protected</span>
        </div>
      </header>

      {/* Main Login Card */}
      <main className="relative z-10 max-w-md w-full mx-auto px-4 py-8">
        <div className="bg-slate-800/90 backdrop-blur-xl border border-slate-700 rounded-3xl p-8 shadow-2xl space-y-6">
          
          <div className="text-center space-y-1.5">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Portal Sign In</h2>
            <p className="text-xs text-slate-400">
              Enter your assigned work credentials to access your designated workspace.
            </p>
          </div>

          {error && (
            <div className="p-3.5 bg-red-950/50 border border-red-800/60 rounded-2xl flex items-center gap-2.5 text-red-200 text-xs animate-in shake">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-4">
            {/* Email Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Work Email or Username
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="e.g. owner@fueltracks.in or your login email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 font-medium focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Security Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter your password..."
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 font-medium focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Login Switcher */}
          <div className="pt-2 border-t border-slate-700/60 space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 text-center">
              Quick Test Accounts:
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => { setEmail('admin@fueltracks.in'); setPassword('admin'); }}
                className="p-2 rounded-xl bg-slate-900/80 hover:bg-purple-950/60 border border-slate-700 hover:border-purple-500 text-left transition-all cursor-pointer"
              >
                <div className="font-bold text-white flex items-center gap-1">👑 Super Admin</div>
                <div className="text-[10px] text-slate-400">All Stock & System</div>
              </button>
              
              <button
                type="button"
                onClick={() => { setEmail('jayasurya@fueltracks.in'); setPassword('dealer'); }}
                className="p-2 rounded-xl bg-slate-900/80 hover:bg-blue-950/60 border border-slate-700 hover:border-blue-500 text-left transition-all cursor-pointer"
              >
                <div className="font-bold text-blue-300 flex items-center gap-1">🏪 Jaya Surya</div>
                <div className="text-[10px] text-slate-400">Kurnool Dealer (75 units)</div>
              </button>

              <button
                type="button"
                onClick={() => { setEmail('operations@fueltracks.in'); setPassword('admin'); }}
                className="p-2 rounded-xl bg-slate-900/80 hover:bg-amber-950/60 border border-slate-700 hover:border-amber-500 text-left transition-all cursor-pointer"
              >
                <div className="font-bold text-amber-300 flex items-center gap-1">🛠️ Operations</div>
                <div className="text-[10px] text-slate-400">Admin Team</div>
              </button>

              <button
                type="button"
                onClick={() => { setEmail('sales@fueltracks.in'); setPassword('sales'); }}
                className="p-2 rounded-xl bg-slate-900/80 hover:bg-emerald-950/60 border border-slate-700 hover:border-emerald-500 text-left transition-all cursor-pointer"
              >
                <div className="font-bold text-emerald-300 flex items-center gap-1">💼 Sales Team</div>
                <div className="text-[10px] text-slate-400">Commercial Entry</div>
              </button>
            </div>
          </div>

        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="relative z-10 max-w-6xl w-full mx-auto px-6 py-4 text-center text-xs text-slate-500">
        FuelTracks Telematics Fleet & Device Inventory Management Platform • Encrypted Role-Based Security
      </footer>

    </div>
  );
}
