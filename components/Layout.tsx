
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
  Search,
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
  Package
} from 'lucide-react';
import { UserRole, Organization, Branch } from '../types';
import { searchKnowledgeBase, KBArticle } from '../services/knowledgeBase';

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

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KBArticle[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const orgMenuRef = useRef<HTMLDivElement>(null);

  // Handle Search Input
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const results = searchKnowledgeBase(searchQuery);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Handle Click Outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
      if (orgMenuRef.current && !orgMenuRef.current.contains(event.target as Node)) {
        setOrgMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Define Navigation Items with Role Restrictions
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['IT_ADMIN', 'FINANCE_ADMIN', 'TAX_OFFICER', 'SUPER_ADMIN'] },
    { id: 'users', label: 'User Management', icon: UserCircle, roles: ['SUPER_ADMIN'] }, // New User Management Item
    { id: 'invoices', label: 'Invoices', icon: FileText, roles: ['IT_ADMIN', 'FINANCE_ADMIN', 'TAX_OFFICER'] },
    { id: 'items', label: 'Item Master', icon: Package, roles: ['IT_ADMIN', 'FINANCE_ADMIN', 'TAX_OFFICER'] },
    { id: 'create-invoice', label: 'New Invoice', icon: PlusCircle, roles: ['IT_ADMIN', 'FINANCE_ADMIN'] }, // New Menu Item
    { id: 'validator', label: 'XML Validator', icon: Code, roles: ['IT_ADMIN', 'FINANCE_ADMIN'] }, // New Validator Item
    { id: 'certificates', label: 'CSR Settings', icon: ShieldCheck, roles: ['IT_ADMIN'] },
    { id: 'erp-connectors', label: 'ERP Connectors', icon: Plug, roles: ['IT_ADMIN'] },
    { id: 'audit', label: 'Audit Log', icon: Activity, roles: ['IT_ADMIN', 'FINANCE_ADMIN', 'TAX_OFFICER', 'SUPER_ADMIN'] },
    { id: 'api-docs', label: 'API Docs', icon: Code, roles: ['SUPER_ADMIN'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(userRole));

  const roleLabels = {
    IT_ADMIN: 'IT Administrator',
    FINANCE_ADMIN: 'Finance Admin',
    TAX_OFFICER: 'Tax/Compliance Officer',
    SUPER_ADMIN: 'Super Administrator'
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Regulation': return <BookOpen size={14} className="text-blue-500" />;
      case 'Error Code': return <AlertTriangle size={14} className="text-amber-500" />;
      case 'Technical': return <Code size={14} className="text-emerald-500" />;
      default: return <FileText size={14} className="text-slate-400" />;
    }
  };

  // Find Current Organization for display
  const currentOrg = organizations.find(o => o.id === currentBranch?.organizationId);

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
              {currentRoute === 'settings' && 'System Configuration'}
            </h1>
          </div>

          <div className="flex items-center space-x-6">
            
            {/* Search Bar */}
            <div className="hidden md:block relative" ref={searchRef}>
               <div className="relative group">
                 <Search size={16} className={`absolute left-3 top-1/2 transform -translate-y-1/2 transition-colors ${isSearchFocused ? 'text-indigo-500' : 'text-slate-400 group-hover:text-slate-500'}`} />
                 <input 
                    type="text" 
                    placeholder="Search resources..." 
                    className={`pl-9 pr-4 py-2 text-sm bg-slate-100 border-2 border-transparent focus:bg-white rounded-full w-64 transition-all duration-300 ${
                      isSearchFocused 
                        ? 'border-indigo-500/30 shadow-md w-80 ring-2 ring-indigo-500/10' 
                        : 'hover:bg-slate-50 hover:border-slate-200'
                    }`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                 />
               </div>

               {/* Search Results Dropdown */}
               {isSearchFocused && searchQuery.length >= 2 && (
                 <div className="absolute top-full left-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-2 z-50 ring-1 ring-slate-900/5">
                    <div className="p-2 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                       <span className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2">ZATCA Resources</span>
                       <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100 font-medium">Phase 2</span>
                    </div>
                    
                    {searchResults.length > 0 ? (
                      <div className="max-h-80 overflow-y-auto">
                        {searchResults.map((result) => (
                          <a 
                            key={result.id} 
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block p-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-none group"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2 mb-1">
                                {getCategoryIcon(result.category)}
                                <span className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">{result.title}</span>
                              </div>
                              <ExternalLink size={12} className="text-slate-300 group-hover:text-indigo-400" />
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{result.snippet}</p>
                            <div className="mt-2 flex gap-1 flex-wrap">
                               {result.tags.slice(0,3).map(tag => (
                                 <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-md border border-slate-100">#{tag}</span>
                               ))}
                            </div>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-500">
                        <p className="text-sm">No official resources found.</p>
                        <p className="text-xs mt-1 text-slate-400">Try searching for "VAT", "Invoice", or "Error".</p>
                      </div>
                    )}
                    
                    <div className="p-2 bg-slate-50 text-center border-t border-slate-100">
                      <a href="https://zatca.gov.sa" target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center justify-center transition-colors">
                        Visit zatca.gov.sa <ExternalLink size={10} className="ml-1" />
                      </a>
                    </div>
                 </div>
               )}
            </div>
            
            <div className="h-6 w-px bg-slate-200 mx-2"></div>

            <div className="flex items-center space-x-4">
               <div className="flex items-center px-3 py-1.5 bg-white text-slate-600 text-xs font-semibold rounded-full border border-slate-200 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
                  Phase 2 Live
               </div>
               
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
