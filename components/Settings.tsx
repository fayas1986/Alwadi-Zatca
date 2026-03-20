import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, Bell, CheckCircle, Globe, Mail, Phone, MapPin, Building2, Building, Lock, Upload, Trash2, ExternalLink, Save, Loader2, AlertTriangle, RefreshCw, Key, ShieldCheck, UserCheck, Smartphone, Server, Activity, Wifi, WifiOff, AlertCircle } from 'lucide-react';

import { defaultSupplier } from '../services/mockData';
import { Branch, Organization, UserRole } from '../types';
import { useToast } from './Toast';

// Reusable Toggle Component
const Toggle = ({ checked, onChange, label, description }: any) => (
  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
    <div className="pr-4">
      <h4 className="font-bold text-slate-900 text-sm">{label}</h4>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </div>
    <button 
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
);

// Reusable Input Component
const InputGroup = ({ label, value, onChange, placeholder, icon: icon, type = 'text', disabled = false }: any) => {
    const Icon: any = icon;
    return (
        <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
            <div className="relative">
                {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />}
                <input 
                    type={type}
                    value={value}
                    onChange={(e: any) => onChange(e.target.value)}
                    disabled={disabled}
                    placeholder={placeholder}
                    className={`w-full ${Icon ? 'pl-10' : 'pl-4'} pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-medium text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500`}
                />
            </div>
        </div>
    );
};

interface SettingsProps {
    selectedBranch: Branch | null;
    organizations: Organization[];
    userRole: UserRole;
    onRefresh: () => void;
}

type EnvStatus = {
  state: 'checking' | 'online' | 'offline';
  latencyMs: number | null;
  statusCode: number | null;
  checkedAt: string | null;
};

const ENV_KEYS = ['sandbox', 'simulation', 'production'] as const;

export const Settings: React.FC<SettingsProps> = ({ selectedBranch, organizations, userRole, onRefresh }) => {
  const { addToast } = useToast(); 
  const [activeTab, setActiveTab] = useState<'profile' | 'compliance' | 'security' | 'notifications'>('profile');
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ... (previous env status state and checkAllEnvironments function)
  const [envStatus, setEnvStatus] = useState<Record<string, EnvStatus>>({
    sandbox:    { state: 'checking', latencyMs: null, statusCode: null, checkedAt: null },
    simulation: { state: 'checking', latencyMs: null, statusCode: null, checkedAt: null },
    production: { state: 'checking', latencyMs: null, statusCode: null, checkedAt: null },
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkAllEnvironments = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    
    // Only set to 'checking' if it's a manual refresh or first load
    if (showRefresh) {
        setEnvStatus(prev => {
          const next = { ...prev };
          ENV_KEYS.forEach(k => { next[k] = { ...prev[k], state: 'checking' }; });
          return next;
        });
    }

    await Promise.all(ENV_KEYS.map(async (env) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      try {
        console.log(`[ZATCA-Status] Pinging ${env}...`);
        const r = await fetch(`/api/zatca/ping/${env}`, { 
            signal: controller.signal,
            headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' }
        });
        clearTimeout(timeoutId);
        
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        
        console.log(`[ZATCA-Status] ${env} result:`, data);
        setEnvStatus(prev => ({
          ...prev,
          [env]: {
            state: data.online ? 'online' : 'offline',
            latencyMs: data.latencyMs ?? null,
            statusCode: data.statusCode ?? null,
            checkedAt: data.checkedAt ?? new Date().toISOString(),
          }
        }));
      } catch (error: any) {
        clearTimeout(timeoutId);
        const errorMsg = error.name === 'AbortError' ? 'Timeout' : error.message;
        console.error(`[ZATCA-Status] ${env} failed:`, errorMsg);
        setEnvStatus(prev => ({
          ...prev,
          [env]: {
            state: 'offline',
            latencyMs: null,
            statusCode: null,
            checkedAt: new Date().toISOString(),
          }
        }));
      }
    }));
    if (showRefresh) setIsRefreshing(false);
  }, []);
  // Manual fix for re-inserting missing piece after truncate
  useEffect(() => {
    checkAllEnvironments();
    const timer = setInterval(() => checkAllEnvironments(), 30_000);
    return () => clearInterval(timer);
  }, [checkAllEnvironments]);

  // State
  const [orgDetails, setOrgDetails] = useState({
      name: '',
      vatNumber: '',
      crNumber: '',
      email: '',
      phone: '',
      website: '',
      logoUrl: '',
      streetName: '',
      buildingNumber: '',
      cityName: '',
      citySubdivisionName: '',
      postalZone: '',
      countryCode: 'SA'
  });

  // Sync state when selectedBranch changes
  useEffect(() => {
    if (selectedBranch) {
        const org = organizations.find(o => o.id === selectedBranch.organizationId);
        if (org) {
            const settings = (selectedBranch as any).settings || {};
            const profile = settings.profile || {};

            setOrgDetails(prev => ({
                ...prev,
                name: org.name,
                vatNumber: org.vatNumber,
                crNumber: org.crNumber,
                email: profile.email || '',
                phone: profile.phone || '',
                website: profile.website || '',
                ...selectedBranch.address,
                additionalNumber: selectedBranch.address.additionalNumber || '',
                logoUrl: org.logoUrl || ''
            }));

            // Sync other configs
            if (settings.compliance) setComplianceConfig(prev => ({ ...prev, ...settings.compliance, environment: (selectedBranch as any).environment || prev.environment }));
            if (settings.security) setSecurityConfig(prev => ({ ...prev, ...settings.security }));
            if (settings.notifications) setNotifConfig(prev => ({ ...prev, ...settings.notifications }));
        }
    }
  }, [selectedBranch, organizations]);

  const [complianceConfig, setComplianceConfig] = useState({
      environment: 'Simulation',
      csrCommonName: 'TS-RYD-01',
      csrOrganization: 'Tech Solutions Ltd',
      autoArchive: true,
      clearanceEnabled: true
  });

  const [securityConfig, setSecurityConfig] = useState({
      twoFactor: false,
      apiRotation: true,
      sessionTimeout: true
  });

  const [notifConfig, setNotifConfig] = useState({
      emailAlerts: true,
      whatsappAlerts: false,
      dailyDigest: true,
      rejectionAlerts: true
  });

  const handleSave = async () => {
      if (!selectedBranch) {
          addToast('error', 'No organization selected');
          return;
      }
      
      setIsLoading(true);
      try {
          const orgId = selectedBranch.organizationId;
          const response = await fetch(`/api/admin/companies/${orgId}`, {
              method: 'PUT',
              headers: { 
                  'Content-Type': 'application/json',
                  'x-user-role': userRole
              },
              body: JSON.stringify({
                    name: orgDetails.name,
                    vatNumber: orgDetails.vatNumber,
                    crNumber: orgDetails.crNumber,
                    address: orgDetails.streetName,
                    city: orgDetails.cityName,
                    country: orgDetails.countryCode,
                    branchName: selectedBranch.name,
                    environment: complianceConfig.environment,
                    settings: {
                        profile: {
                            email: orgDetails.email,
                            phone: orgDetails.phone,
                            website: orgDetails.website
                        },
                        compliance: complianceConfig,
                        security: securityConfig,
                        notifications: notifConfig
                    }
                })
           });

          if (response.ok) {
              addToast('success', 'Organization settings updated successfully');
              setSaveStatus('success');
              if (onRefresh) onRefresh();
              setTimeout(() => setSaveStatus('idle'), 3000);
          } else {
              const err = await response.json();
              addToast('error', err.error || 'Failed to update settings');
          }
      } catch (error) {
          console.error('Error saving settings:', error);
          addToast('error', 'Network error while saving settings');
      } finally {
          setIsLoading(false);
      }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              setOrgDetails(prev => ({ ...prev, logoUrl: reader.result as string }));
          };
          reader.readAsDataURL(file);
      }
  };

  const tabs = [
      { id: 'profile', label: 'Organization', icon: Building },
      { id: 'compliance', label: 'Compliance', icon: Shield },
      { id: 'security', label: 'Security', icon: Lock },
      { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">System Configuration</h2>
              <div className="flex items-center gap-2 mt-1">
                 <p className="text-slate-500 text-sm">Manage profile and settings for:</p>
                 {selectedBranch && (
                     <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 flex items-center">
                        <Building size={12} className="mr-1" />
                        {selectedBranch.name}
                     </span>
                 )}
              </div>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg shadow-slate-900/20 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
          >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {isLoading ? 'Saving Changes...' : 'Save Changes'}
          </button>
      </div>

      {saveStatus === 'success' && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center animate-in fade-in slide-in-from-top-2 shadow-sm">
              <CheckCircle size={18} className="mr-2" />
              <span className="font-medium text-sm">Settings saved successfully. Changes will be reflected immediately.</span>
          </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
          {/* Vertical Tabs Sidebar */}
          <div className="w-full lg:w-64 flex-shrink-0">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 space-y-1 sticky top-24">
                  {tabs.map((tab) => {
                      const TabIcon: any = tab.icon;
                      const isActive = activeTab === tab.id;
                      return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-xl transition-all ${
                                isActive 
                                ? 'bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-indigo-200' 
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                        >
                            <TabIcon size={18} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
                            {tab.label}
                        </button>
                      );
                  })}
              </div>
          </div>

          {/* Content Area */}
          <div className="flex-1">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
                  
                  {/* PROFILE TAB */}
                  {activeTab === 'profile' && (
                      <div className="p-8 space-y-8 animate-in fade-in duration-300">
                          <div className="flex flex-col md:flex-row gap-8 items-start border-b border-slate-100 pb-8">
                              <div className="w-full md:w-auto flex flex-col items-center">
                                  <div className="w-32 h-32 bg-slate-100 rounded-full flex items-center justify-center border-2 border-dashed border-slate-300 mb-4 text-slate-400 overflow-hidden relative shadow-inner">
                                      {orgDetails.logoUrl ? (
                                          <img src={orgDetails.logoUrl} alt="Organization Logo" className="w-full h-full object-cover" />
                                      ) : (
                                          <Building size={48} className="opacity-50" />
                                      )}
                                  </div>
                                  <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handleLogoUpload} 
                                    className="hidden" 
                                    accept="image/png, image/jpeg, image/jpg"
                                  />
                                  <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors hover:bg-indigo-100"
                                  >
                                      <Upload size={14} className="mr-1.5" /> Upload Logo
                                  </button>
                              </div>
                              <div className="flex-1 w-full space-y-4">
                                  <h3 className="text-lg font-bold text-slate-900 mb-4">Organization Identity</h3>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                      <InputGroup label="Company Name (EN)" value={orgDetails.name} onChange={(v: string) => setOrgDetails({...orgDetails, name: v})} placeholder="Official Company Name" />
                                      <InputGroup label="VAT Registration Number" value={orgDetails.vatNumber} onChange={(v: string) => setOrgDetails({...orgDetails, vatNumber: v})} placeholder="3..." />
                                      <InputGroup label="CR Number" value={orgDetails.crNumber} onChange={(v: string) => setOrgDetails({...orgDetails, crNumber: v})} placeholder="1010..." />
                                      <InputGroup label="Website" value={orgDetails.website} onChange={(v: string) => setOrgDetails({...orgDetails, website: v})} placeholder="https://" icon={Globe} />
                                      <InputGroup label="Official Email" value={orgDetails.email} onChange={(v: string) => setOrgDetails({...orgDetails, email: v})} placeholder="finance@..." icon={Mail} />
                                      <InputGroup label="Phone Number" value={orgDetails.phone} onChange={(v: string) => setOrgDetails({...orgDetails, phone: v})} placeholder="+966..." icon={Smartphone} />
                                  </div>
                              </div>
                          </div>

                          <div>
                              <div className="flex items-center justify-between mb-6">
                                  <h3 className="text-lg font-bold text-slate-900 flex items-center">
                                      <MapPin size={20} className="mr-2 text-indigo-500" /> {selectedBranch ? `${selectedBranch.name} Address` : 'HQ National Address'}
                                  </h3>
                                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">Verified</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                  <div className="md:col-span-2">
                                      <InputGroup label="Street Name" value={orgDetails.streetName} onChange={(v: string) => setOrgDetails({...orgDetails, streetName: v})} placeholder="Street" />
                                  </div>
                                  <InputGroup label="Building No." value={orgDetails.buildingNumber} onChange={(v: string) => setOrgDetails({...orgDetails, buildingNumber: v})} placeholder="0000" />
                                  <InputGroup label="District" value={orgDetails.citySubdivisionName} onChange={(v: string) => setOrgDetails({...orgDetails, citySubdivisionName: v})} placeholder="District" />
                                  <InputGroup label="City" value={orgDetails.cityName} onChange={(v: string) => setOrgDetails({...orgDetails, cityName: v})} placeholder="City" />
                                  <InputGroup label="Postal Code" value={orgDetails.postalZone} onChange={(v: string) => setOrgDetails({...orgDetails, postalZone: v})} placeholder="00000" />
                              </div>
                          </div>
                      </div>
                  )}

                  {/* COMPLIANCE TAB */}
                  {activeTab === 'compliance' && (
                      <div className="p-8 space-y-8 animate-in fade-in duration-300">
                          <div className="bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100">
                              <div className="flex items-center justify-between mb-2">
                                  <h3 className="text-lg font-bold text-slate-900 flex items-center">
                                      <Server size={20} className="mr-2 text-indigo-600" /> Environment Connection
                                  </h3>
                                  <button
                                      onClick={() => checkAllEnvironments(true)}
                                      disabled={isRefreshing}
                                      title="Refresh connection status"
                                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                                  >
                                      <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                                      {isRefreshing ? 'Checking…' : 'Refresh'}
                                  </button>
                              </div>
                              <p className="text-sm text-slate-600 mb-6 max-w-2xl">
                                  Select the ZATCA environment for invoice clearance. Use <strong>Simulation</strong> for testing and <strong>Production</strong> for live reporting.
                              </p>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {(['Sandbox', 'Simulation', 'Production'] as const).map((env) => {
                                      const key = env.toLowerCase();
                                      const st = envStatus[key];
                                      const isSelected = complianceConfig.environment === env;
                                      const host = env === 'Production' ? 'core.zatca.gov.sa'
                                                 : env === 'Simulation' ? 'gw-fatoora.zatca.gov.sa'
                                                 : 'sandbox.zatca.gov.sa';
                                      return (
                                          <button
                                              key={env}
                                              onClick={() => setComplianceConfig({...complianceConfig, environment: env})}
                                              className={`relative px-4 py-4 rounded-xl text-left border-2 transition-all ${
                                                  isSelected
                                                  ? 'border-indigo-600 bg-white shadow-md ring-4 ring-indigo-500/10'
                                                  : 'border-transparent bg-white hover:bg-slate-50'
                                              }`}
                                          >
                                              {/* Header row */}
                                              <div className="flex justify-between items-start mb-1">
                                                  <span className={`text-sm font-bold uppercase tracking-wider ${
                                                      isSelected ? 'text-indigo-600' : 'text-slate-400'
                                                  }`}>{env}</span>
                                                  {isSelected && <CheckCircle size={18} className="text-indigo-600" />}
                                              </div>

                                              {/* Host */}
                                              <p className="text-xs text-slate-400 font-mono mb-3">{host}</p>

                                              {/* Live Status Badge */}
                                              {st?.state === 'checking' && (
                                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                                      <Activity size={10} className="animate-pulse" /> Checking…
                                                  </span>
                                              )}
                                              {st?.state === 'online' && (
                                                  <div className="flex items-center justify-between">
                                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                                                          <Wifi size={10} /> Online
                                                      </span>
                                                      <span className="text-[11px] text-slate-400 font-mono">{st.latencyMs}ms</span>
                                                  </div>
                                              )}
                                              {st?.state === 'offline' && (
                                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-200">
                                                      <WifiOff size={10} /> Unreachable
                                                  </span>
                                              )}
                                          </button>
                                      );
                                  })}
                              </div>

                              {/* Last checked timestamp */}
                              {envStatus.simulation?.checkedAt && (
                                  <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1">
                                      <Activity size={10} className="text-slate-300" />
                                      Last checked: {new Date(envStatus.simulation.checkedAt).toLocaleTimeString()}
                                  </p>
                              )}
                          </div>

                          <div>
                              <h3 className="text-lg font-bold text-slate-900 mb-6">ZATCA Configuration</h3>
                              <div className="mb-6">
                                  <Toggle 
                                    label="Enable Clearance Mode" 
                                    description="If disabled, the application will return a 303 Redirect for Standard Invoices (as per Integration Sandbox Manual Table 1)." 
                                    checked={complianceConfig.clearanceEnabled}
                                    onChange={(v: boolean) => setComplianceConfig({...complianceConfig, clearanceEnabled: v})}
                                  />
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <InputGroup label="CSR Common Name (CN)" value={complianceConfig.csrCommonName} onChange={(v: string) => setComplianceConfig({...complianceConfig, csrCommonName: v})} placeholder="TS-RYD-01" />
                                  <InputGroup label="Organization Unit (OU)" value={selectedBranch ? selectedBranch.name : "Satguru Branch"} onChange={() => {}} placeholder="Satguru Branch" disabled />
                                  
                                  <div className="md:col-span-2">
                                      <Toggle 
                                        label="Auto-Archive Invoices" 
                                        description="Automatically archive cleared invoices to cold storage after 1 year (Regulation Art 63)" 
                                        checked={complianceConfig.autoArchive}
                                        onChange={(v: boolean) => setComplianceConfig({...complianceConfig, autoArchive: v})}
                                      />
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}

                  {/* SECURITY TAB */}
                  {activeTab === 'security' && (
                      <div className="p-8 space-y-6 animate-in fade-in duration-300">
                          <div>
                              <h3 className="text-lg font-bold text-slate-900 mb-6">Access Control</h3>
                              <div className="space-y-4">
                                  <Toggle 
                                    label="Two-Factor Authentication (2FA)" 
                                    description="Require OTP for all Administrator and Finance logins." 
                                    checked={securityConfig.twoFactor}
                                    onChange={(v: boolean) => setSecurityConfig({...securityConfig, twoFactor: v})}
                                  />
                                  <Toggle 
                                    label="Enforce Session Timeout" 
                                    description="Automatically log out inactive users after 15 minutes." 
                                    checked={securityConfig.sessionTimeout}
                                    onChange={(v: boolean) => setSecurityConfig({...securityConfig, sessionTimeout: v})}
                                  />
                              </div>
                          </div>

                          <div className="border-t border-slate-100 pt-6">
                              <h3 className="text-lg font-bold text-slate-900 mb-6">API Security</h3>
                              <div className="space-y-4">
                                   <Toggle 
                                    label="Auto-Rotate API Keys" 
                                    description="Automatically rotate ERP connector API keys every 90 days." 
                                    checked={securityConfig.apiRotation}
                                    onChange={(v: boolean) => setSecurityConfig({...securityConfig, apiRotation: v})}
                                  />
                              </div>
                              <div className="mt-6 p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3">
                                  <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                                  <div>
                                      <h4 className="text-sm font-bold text-amber-800">API Access Audit</h4>
                                      <p className="text-xs text-amber-700 mt-1">
                                          Last sensitive key access detected from IP 192.168.1.55 (ERP Connector) 2 hours ago.
                                      </p>
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}

                  {/* NOTIFICATIONS TAB */}
                  {activeTab === 'notifications' && (
                      <div className="p-8 space-y-6 animate-in fade-in duration-300">
                          <h3 className="text-lg font-bold text-slate-900 mb-6">Alert Preferences</h3>
                          
                          <div className="space-y-4">
                              <Toggle 
                                label="Rejection Alerts" 
                                description="Immediate notification when an invoice is rejected by ZATCA." 
                                checked={notifConfig.rejectionAlerts}
                                onChange={(v: boolean) => setNotifConfig({...notifConfig, rejectionAlerts: v})}
                              />
                              <Toggle 
                                label="Daily Compliance Digest" 
                                description="Summary of daily cleared, reported, and pending documents." 
                                checked={notifConfig.dailyDigest}
                                onChange={(v: boolean) => setNotifConfig({...notifConfig, dailyDigest: v})}
                              />
                              
                              <div className="h-px bg-slate-100 my-4"></div>

                              <Toggle 
                                label="Email Notifications" 
                                description={`Send alerts to ${orgDetails.email}`} 
                                checked={notifConfig.emailAlerts}
                                onChange={(v: boolean) => setNotifConfig({...notifConfig, emailAlerts: v})}
                              />
                              <Toggle 
                                label="WhatsApp Notifications" 
                                description={`Send urgent alerts to registered WhatsApp number`} 
                                checked={notifConfig.whatsappAlerts}
                                onChange={(v: boolean) => setNotifConfig({...notifConfig, whatsappAlerts: v})}
                              />
                          </div>
                      </div>
                  )}

              </div>
          </div>
      </div>
    </div>
  );
};
