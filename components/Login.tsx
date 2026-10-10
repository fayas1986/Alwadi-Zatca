
import React, { useState } from 'react';
import { ShieldCheck, Lock, User, ArrowRight, Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { UserRole } from '../types';

interface LoginProps {
  onLogin: (role: UserRole, name: string, email: string, companyId?: number) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<UserRole>('IT_ADMIN');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvancedRoles, setShowAdvancedRoles] = useState(false);

  const allRoles: {id: UserRole, label: string, desc: string}[] = [
      { id: 'IT_ADMIN', label: 'IT Administrator', desc: 'Full System Access' },
      { id: 'FINANCE_ADMIN', label: 'Finance Manager', desc: 'Invoice Operations' },
      { id: 'TAX_OFFICER', label: 'Tax Officer', desc: 'Compliance & Audit' },
      { id: 'SUPER_ADMIN', label: 'Super Admin', desc: 'SaaS Owner Only' },
  ];

  const visibleRoles = allRoles.filter(role => role.id !== 'SUPER_ADMIN' || showAdvancedRoles);

  const handleRoleSelect = (role: typeof allRoles[0]) => {
      setActiveTab(role.id);
      setEmail('');
      setPassword(''); 
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      
      try {
          const response = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password })
          });

          if (response.ok) {
              const data = await response.json();
              onLogin(data.role, data.name || 'User', data.email || email, data.companyId);
          } else {
              let errorMessage = "Login failed. Please check your credentials.";
              try {
                  const error = await response.json();
                  errorMessage = error.error || errorMessage;
              } catch (e) {}
              alert(errorMessage);
          }
      } catch (error: any) {
          alert(`Network error: ${error.message || 'Unable to connect to server'}`);
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-3 sm:p-6">
      <div className="max-w-5xl w-full bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-0 md:min-h-[600px] border border-slate-200">
        
        {/* Left Side: Brand */}
        <div className="md:w-1/2 bg-slate-900 text-white p-6 sm:p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-green-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 -mr-16 -mt-16 animate-pulse hidden sm:block"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 -ml-16 -mb-16 animate-pulse hidden sm:block"></div>

            <div className="relative z-10">
                <div 
                    className="flex items-center space-x-3 mb-4 md:mb-8 cursor-pointer select-none active:opacity-80 transition-opacity"
                    onClick={() => setShowAdvancedRoles(!showAdvancedRoles)}
                    title="Toggle Advanced Roles"
                >
                    <img src="/alwadi-logo.png" alt="Alwadi Poultry Logo" className="h-10 sm:h-12 w-auto object-contain rounded-lg shadow-md" />
                    <span className="text-xl sm:text-2xl font-bold tracking-tight">ZATCA<span className="text-emerald-400">Connect</span></span>
                </div>
                
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight mb-3 md:mb-6">
                    Phase 2 E-Invoicing Compliance Platform
                </h2>
                <p className="text-slate-400 text-sm sm:text-base md:text-lg leading-relaxed">
                    Securely manage invoices, cryptographic stamps, and ZATCA integration with our comprehensive dashboard.
                </p>
            </div>

            <div className="relative z-10 mt-6 md:mt-auto">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm font-medium text-slate-300 mb-4 md:mb-8">
                    <div className="flex items-center gap-1.5">
                        <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                        <span>Fatoora Compliant</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                        <span>UBL 2.1 Standard</span>
                    </div>
                </div>
                
                <div className="pt-4 md:pt-6 border-t border-slate-800 space-y-3 hidden sm:block">
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-800/50 p-2 rounded-lg w-fit border border-slate-800">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        ZATCA Phase 2 Simulation Environment • v2.4.0
                    </div>
                </div>
            </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="md:w-1/2 p-6 sm:p-8 md:p-12 bg-white flex flex-col justify-center">
            <div className="mb-6">
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1 sm:mb-2">Welcome Back</h3>
                <p className="text-xs sm:text-sm text-slate-500">Please select your role to sign in.</p>
            </div>

            {/* Role Switcher Pills */}
            <div className="grid grid-cols-1 gap-2.5 mb-6 max-h-[200px] overflow-y-auto pr-1">
                {visibleRoles.map(role => (
                    <button
                        key={role.id}
                        type="button"
                        onClick={() => handleRoleSelect(role)}
                        className={`text-left p-3.5 rounded-xl border transition-all flex items-center justify-between group min-h-[44px] ${
                            activeTab === role.id 
                            ? 'border-green-500 bg-green-50 ring-1 ring-green-500/20' 
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                        <div>
                            <span className={`block font-bold text-xs sm:text-sm ${activeTab === role.id ? 'text-green-800' : 'text-slate-700'}`}>{role.label}</span>
                            <span className={`text-[10px] sm:text-xs ${activeTab === role.id ? 'text-green-600' : 'text-slate-400'}`}>{role.desc}</span>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${activeTab === role.id ? 'border-green-500 bg-green-500' : 'border-slate-300'}`}>
                            {activeTab === role.id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                        </div>
                    </button>
                ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="block text-sm font-bold text-slate-900 mb-2">Email Address</label>
                    <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="email" 
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium text-slate-900 placeholder:text-slate-500"
                            placeholder="name@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-900 mb-2">Password</label>
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type={showPassword ? "text" : "password"} 
                            className="w-full pl-11 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium text-slate-900 placeholder:text-slate-500"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)} 
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-green-600 transition-colors focus:outline-none"
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                    <div className="text-right mt-2">
                        <button 
                            type="button"
                            onClick={() => setShowForgotModal(true)}
                            className="text-xs font-bold text-green-600 hover:text-green-700 hover:underline bg-transparent border-none p-0 cursor-pointer"
                        >
                            Forgot password?
                        </button>
                    </div>
                </div>

                <button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 flex items-center justify-center group"
                >
                    {isLoading ? (
                        <><Loader2 size={20} className="animate-spin mr-2" /> Authenticating...</>
                    ) : (
                        <>Sign In <ArrowRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" /></>
                    )}
                </button>
            </form>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
            <div className="p-8">
              <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-sm">
                <ShieldCheck size={32} className="text-green-600" />
              </div>
              
              <h3 className="text-2xl font-bold text-slate-900 text-center mb-4">Reset Your Password</h3>
              
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 mb-8 text-center">
                <p className="text-slate-600 leading-relaxed mb-4">
                  For security reasons, password resets must be managed by your organization's IT Administrator.
                </p>
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Contact Support</span>
                  <span className="text-lg font-bold text-slate-900">support@alwadipoultry.com</span>
                </div>
              </div>

              <button 
                onClick={() => setShowForgotModal(false)}
                className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-[0.98]"
              >
                Got it, thanks
              </button>
              
              <p className="mt-6 text-center text-xs text-slate-400 font-medium">
                Alwadi ZATCA Platform • Secure Access Control
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
