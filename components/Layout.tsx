
import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  ShieldCheck, 
  Activity, 
  Settings,
  Bell,
  Menu,
  ChevronRight,
  Plug,
  ChevronDown,
  UserCircle,
  ExternalLink,
  BookOpen,
  AlertTriangle,
  Code,
  PlusCircle,
  LogOut,
  Building2,
  MapPin,
  Plus,
  Trash2,
  Package,
  FileBarChart,
  Layout as LayoutIcon,
  TestTube,
  FlaskConical
} from 'lucide-react';
import { UserRole, Organization, Branch } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentRoute: string;
  onNavigate: (route: string) => void;
  userRole: UserRole;
  userName?: string;
  onLogout: () => void;
  organizations: Organization[];
  currentBranch: Branch | null;
  onSwitchBranch: (branch: Branch) => void;
  onCreateOrganization: () => void;
  onDeleteOrganization: (orgId: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({
    children,
    currentRoute,
    onNavigate,
    userRole,
    userName = "Demo User",
    onLogout,
    organizations,
    currentBranch,
    onSwitchBranch,
    onCreateOrganization,
    onDeleteOrganization
}) => {
  console.log('Layout rendering. Role:', userRole, 'Orgs:', organizations?.length);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = React.useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = React.useState(false);

  const orgMenuRef = useRef<HTMLDivElement>(null);

  // Handle Click Outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (orgMenuRef.current && !orgMenuRef.current.contains(event.target as Node)) {
        setOrgMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Define Navigation Items with Role Restrictions
  const standardNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['IT_ADMIN', 'FINANCE_ADMIN', 'TAX_OFFICER', 'SUPER_ADMIN'] },
    { id: 'invoices', label: 'Invoices', icon: FileText, roles: ['IT_ADMIN', 'FINANCE_ADMIN', 'TAX_OFFICER'] },
    { id: 'items', label: 'Item Master', icon: Package, roles: ['IT_ADMIN', 'FINANCE_ADMIN', 'TAX_OFFICER'] },
    { id: 'create-invoice', label: 'New Invoice', icon: PlusCircle, roles: ['IT_ADMIN', 'FINANCE_ADMIN'] },
    { id: 'validator', label: 'XML Validator', icon: Code, roles: ['IT_ADMIN', 'FINANCE_ADMIN'] },
    { id: 'certificates', label: 'CSR Settings', icon: ShieldCheck, roles: ['IT_ADMIN'] },
    { id: 'erp-connectors', label: 'ERP Connectors', icon: Plug, roles: ['IT_ADMIN'] },
    { id: 'reports', label: 'Report Center', icon: FileBarChart, roles: ['IT_ADMIN', 'FINANCE_ADMIN', 'TAX_OFFICER', 'SUPER_ADMIN'] },
    { id: 'audit', label: 'Audit Log', icon: Activity, roles: ['IT_ADMIN', 'FINANCE_ADMIN', 'TAX_OFFICER', 'SUPER_ADMIN'] },
  ];

  const adminNavItems = [
    { id: 'users', label: 'User Management', icon: UserCircle, roles: ['SUPER_ADMIN'] },
    { id: 'report-designer', label: 'Report Designer', icon: LayoutIcon, roles: ['SUPER_ADMIN'] },
    { id: 'api-docs', label: 'API Docs', icon: Code, roles: ['SUPER_ADMIN'] },
  ];

  const filteredNavItems = standardNavItems.filter(item => item.roles.includes(userRole));
  const filteredAdminItems = adminNavItems.filter(item => item.roles.includes(userRole));

  const roleLabels = {
    IT_ADMIN: 'IT Administrator',
    FINANCE_ADMIN: 'Finance Admin',
    TAX_OFFICER: 'Tax/Compliance Officer',
    SUPER_ADMIN: 'Super Administrator'
  };

  // Find Current Organization for display
  const currentOrg = organizations.find(o => o.id === currentBranch?.organizationId);

  const renderEnvironmentBadge = () => {
    if (!currentBranch) return null;
    
    const env = currentBranch.environment || (currentOrg?.environment) || 'SANDBOX';
    
    const configs = {
      SIMULATION: {
        label: 'Simulation',
        icon: TestTube,
        styles: 'bg-amber-100 text-amber-700 border-amber-200',
        pulse: 'bg-amber-500'
      },
      SANDBOX: {
        label: 'Sandbox Replica',
        icon: FlaskConical,
        styles: 'bg-blue-100 text-blue-700 border-blue-200',
        pulse: 'bg-blue-500'
      },
      PRODUCTION: {
        label: 'Live Production',
        icon: ShieldCheck,
        styles: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        pulse: 'bg-emerald-500'
      }
    };

    const config = configs[env as keyof typeof configs] || configs.SANDBOX;
    const Icon = config.icon;

    return (
      <div className={`flex items-center px-4 py-1.5 rounded-full border shadow-sm transition-all ${config.styles} font-bold text-[10px] uppercase tracking-wider`}>
         <span className={`w-2.5 h-2.5 rounded-full mr-2.5 animate-pulse ${config.pulse} shadow-sm`}></span>
         <Icon size={12} className="mr-2" />
         {config.label}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar - INCREASED Z-INDEX to 100 */}
      <aside 
        className={`${
          sidebarOpen ? 'w-72' : 'w-20'
        } bg-[#0f172a] text-white transition-all duration-300 ease-in-out flex flex-col z-[100] shadow-2xl border-r border-slate-800`}
      >
        <div className="h-16 flex items-center justify-between px-6 bg-[#0f172a] border-b border-slate-800">
          {sidebarOpen ? (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(34,197,94,0.4)]">
                <span className="font-bold text-white text-lg">Z</span>
              </div>
              <span className="text-lg font-bold tracking-tight text-white">
                ZATCA<span className="text-green-400">Connect</span>
              </span>
            </div>
          ) : (
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center mx-auto shadow-[0_0_15px_rgba(34,197,94,0.4)]">
              <span className="font-bold text-white text-lg">Z</span>
            </div>
          )}
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)} 
            className={`p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors ${!sidebarOpen && 'hidden'}`}
          >
            <Menu size={18} />
          </button>
        </div>

        {!sidebarOpen && (
           <div className="flex justify-center py-4 border-b border-slate-800">
             <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
               <Menu size={20} />
             </button>
           </div>
        )}

        {/* Organization / Branch Switcher */}
        {sidebarOpen && (
            <div className="px-3 py-4" ref={orgMenuRef}>
                <button 
                    onClick={() => setOrgMenuOpen(!orgMenuOpen)}
                    className="w-full bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-xl p-3 flex items-center justify-between transition-all group"
                >
                    <div className="flex items-center overflow-hidden">
                        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shrink-0 mr-3 shadow-inner">
                            <Building2 size={16} />
                        </div>
                        <div className="text-left overflow-hidden">
                            <p className="text-sm font-bold text-white truncate group-hover:text-indigo-200 transition-colors">{currentOrg?.name || 'Select Org'}</p>
                            <p className="text-[10px] text-slate-400 truncate flex items-center uppercase tracking-wide font-medium mt-0.5">
                                <MapPin size={10} className="mr-1" /> {currentBranch?.name}
                            </p>
                        </div>
                    </div>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${orgMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {orgMenuOpen && (
                    <div className="mt-2 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl animate-in fade-in slide-in-from-top-2">
                        <div className="max-h-60 overflow-y-auto dark-scroll">
                            {organizations.map(org => (
                                <div key={org.id}>
                                    <div className="px-4 py-2 bg-slate-900/50 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 flex justify-between items-center group">
                                        <span>{org.name}</span>
                                        {userRole === 'SUPER_ADMIN' && (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm(`Are you sure you want to delete ${org.name}? This action cannot be undone.`)) {
                                                        onDeleteOrganization(org.id);
                                                    }
                                                }}
                                                className="text-rose-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-800 rounded"
                                                title="Delete Organization"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                    {org.branches.map(branch => (
                                        <button
                                            key={branch.id}
                                            onClick={() => {
                                                onSwitchBranch(branch);
                                                setOrgMenuOpen(false);
                                            }}
                                            className={`w-full text-left px-4 py-2 text-sm flex items-center hover:bg-slate-700 transition-colors ${
                                                currentBranch?.id === branch.id ? 'text-indigo-400 bg-slate-700/50' : 'text-slate-300'
                                            }`}
                                        >
                                            <div className={`w-1.5 h-1.5 rounded-full mr-3 ${currentBranch?.id === branch.id ? 'bg-indigo-400' : 'bg-slate-600'}`}></div>
                                            {branch.name}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="p-2 border-t border-slate-700 bg-slate-900/30">
                            {userRole === 'SUPER_ADMIN' ? (
                                <button 
                                    onClick={() => {
                                        setOrgMenuOpen(false);
                                        onCreateOrganization();
                                    }}
                                    className="w-full flex items-center justify-center py-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    <Plus size={14} className="mr-1.5" /> Add New Company
                                </button>
                            ) : (
                                <div className="py-2 text-center">
                                    <span className="text-[10px] text-slate-500 italic">Organization management restricted</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}

        <div className="flex-1 py-2 px-3 space-y-1 overflow-y-auto dark-scroll">
          {sidebarOpen && <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 mt-2">Menu</p>}
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentRoute === item.id || (currentRoute === 'invoice-detail' && item.id === 'invoices');
            const isAction = item.id === 'create-invoice';
            
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${
                  isActive 
                    ? 'bg-slate-800 text-white shadow-md border-l-4 border-green-500' 
                    : isAction 
                      ? 'text-green-400 hover:bg-slate-800/80 hover:text-green-300 border border-green-900/50 bg-green-900/10 mb-2' 
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-white border-l-4 border-transparent'
                }`}
              >
                <Icon size={20} className={`min-w-[20px] ${isActive ? 'text-green-400' : isAction ? 'text-green-400' : 'text-slate-500 group-hover:text-slate-300 transition-colors'}`} />
                {sidebarOpen && (
                  <>
                    <span className="ml-3 font-medium text-sm">{item.label}</span>
                    {isActive && <ChevronRight size={14} className="ml-auto text-slate-500" />}
                  </>
                )}
                {!sidebarOpen && isActive && (
                  <div className="absolute left-full ml-4 px-2 py-1 bg-slate-900 text-white text-xs rounded shadow-lg z-50 whitespace-nowrap">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}

          {filteredAdminItems.length > 0 && (
            <div className="mt-8 pt-4 border-t border-slate-800/50">
              {sidebarOpen && <p className="px-3 text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-3">SaaS Console</p>}
              {filteredAdminItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.id;
                
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${
                      isActive 
                        ? 'bg-indigo-900/30 text-indigo-200 border-l-4 border-indigo-500 shadow-inner' 
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-indigo-300'
                    }`}
                  >
                    <Icon size={18} className={`min-w-[18px] ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-indigo-400 transition-colors'}`} />
                    {sidebarOpen && <span className="ml-3 font-medium text-sm">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-[#0f172a]">
          <button 
            onClick={() => onNavigate('settings')}
            className={`flex items-center w-full p-2 rounded-lg transition-colors ${currentRoute === 'settings' ? 'bg-slate-800 text-white shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <Settings size={20} />
            {sidebarOpen && <span className="ml-3 text-sm font-medium">Settings</span>}
          </button>
          
          {sidebarOpen && (
            <div className="mt-4 pt-4 border-t border-slate-800 relative">
              <button 
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="flex items-center w-full hover:bg-slate-800/50 p-2 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-green-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold shadow-lg ring-2 ring-slate-800">
                  {userRole.slice(0,2)}
                </div>
                <div className="ml-3 text-left flex-1">
                  <p className="text-sm font-medium text-white">{userName}</p>
                  <p className="text-[10px] text-slate-500 truncate w-28 uppercase tracking-wide">{roleLabels[userRole]}</p>
                </div>
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {/* Profile / Logout Menu */}
              {profileMenuOpen && (
                <div className="absolute bottom-full left-0 w-full mb-2 bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden animate-in slide-in-from-bottom-2 fade-in">
                  <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    My Account
                  </div>
                  {userRole === 'SUPER_ADMIN' && (
                    <button 
                        onClick={() => {
                            onNavigate('users');
                            setProfileMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 text-sm text-indigo-400 hover:bg-slate-700 hover:text-indigo-300 transition-colors flex items-center border-b border-slate-700"
                    >
                        <ShieldCheck size={14} className="mr-2" /> SaaS Master Console
                    </button>
                  )}
                  <button 
                    onClick={onLogout}
                    className="w-full text-left px-4 py-3 text-sm text-rose-400 hover:bg-slate-700 hover:text-rose-300 transition-colors flex items-center"
                  >
                    <LogOut size={14} className="mr-2" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-8 z-20 sticky top-0 shadow-sm">
          <div className="flex items-center">
            <h1 className="text-lg font-bold text-slate-800 tracking-tight flex items-center">
              {currentRoute === 'dashboard' && 'Compliance Overview'}
              {currentRoute === 'invoices' && 'Invoice Management'}
              {currentRoute === 'create-invoice' && 'Real-time Invoice Generation'}
              {currentRoute === 'invoice-detail' && 'Invoice Details'}
              {currentRoute === 'items' && 'Item Master Management'}
              {currentRoute === 'certificates' && 'Zatca CSR Settings'}
              {currentRoute === 'erp-connectors' && 'ERP Integration Hub'}
              {currentRoute === 'audit' && 'System Audit Log'}
              {currentRoute === 'reports' && 'Report Generation Center'}
              {currentRoute === 'report-designer' && 'Dynamic Report Designer'}
              {currentRoute === 'settings' && 'System Configuration'}
            </h1>
          </div>

          <div className="flex items-center space-x-6">
            
            
            <div className="h-6 w-px bg-slate-200 mx-2"></div>

            <div className="flex items-center space-x-4">
               {renderEnvironmentBadge()}
               
               <button className="relative p-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-full transition-colors">
                 <Bell size={20} />
                 <span className="absolute top-2 right-2 h-2 w-2 bg-rose-500 rounded-full ring-2 ring-white"></span>
               </button>
            </div>
          </div>
        </header>

        {/* Scrollable Area with specific background pattern */}
        <main className="flex-1 overflow-auto bg-slate-50 p-8 relative">
          <div className="absolute inset-0 z-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
          <div className="max-w-7xl mx-auto h-full space-y-6 relative z-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
