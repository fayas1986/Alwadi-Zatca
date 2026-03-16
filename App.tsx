
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { InvoiceList } from './components/InvoiceList';
import { InvoiceDetail } from './components/InvoiceDetail';
import { CertificateManager } from './components/CertificateManager';
import { ERPConnectors } from './components/ERPConnectors';
import { AuditLog } from './components/AuditLog';
import { InvoiceGenerator } from './components/InvoiceGenerator';
import { Settings } from './components/Settings';
import { ItemMaster } from './components/ItemMaster';
import { Login } from './components/Login';
import { XMLValidator } from './components/XMLValidator';
import { CreateOrganizationModal } from './components/CreateOrganizationModal';
import { UserManagement } from './components/UserManagement';
import ApiDocs from './components/ApiDocs';
import { UserRole, Branch, Organization } from './types';
import { mockOrganizations, syncOfflineData } from './services/mockData';
import { WifiOff, RefreshCw } from 'lucide-react';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<string>('dashboard');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  
  // Auth State
  const [userRole, setUserRole] = useState<UserRole>('IT_ADMIN');
  const [userName, setUserName] = useState<string>('');

  // Multi-Tenancy State
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [isOrganizationsLoading, setIsOrganizationsLoading] = useState(false);
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);

  // Connectivity State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch Organizations
  useEffect(() => {
    if (isAuthenticated) {
        fetchOrganizations();
    }
  }, [isAuthenticated, userRole]);

  const fetchOrganizations = async () => {
    setIsOrganizationsLoading(true);
    try {
        const response = await fetch('/api/admin/companies', {
            headers: { 'x-user-role': userRole }
        });
        if (response.ok) {
            const data = await response.json();
            setOrganizations(data);
            
            // Auto switch to the first branch of the first org if none selected
            if (!currentBranch && data.length > 0 && data[0].branches.length > 0) {
                setCurrentBranch(data[0].branches[0]);
            }
        }
    } catch (error) {
        console.error('Failed to fetch organizations:', error);
    } finally {
        setIsOrganizationsLoading(false);
    }
  };

  useEffect(() => {
      const handleOnline = async () => {
          setIsOnline(true);
          setIsSyncing(true);
          await syncOfflineData();
          setIsSyncing(false);
      };
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
      };
  }, []);

  useEffect(() => {
      // If Organizations loaded but no current branch, set it
      if (!currentBranch && organizations.length > 0 && organizations[0].branches.length > 0) {
          setCurrentBranch(organizations[0].branches[0]);
      }
  }, [organizations, currentBranch]);

  const navigate = (route: string, id?: string) => {
    setCurrentRoute(route);
    if (id) setSelectedInvoiceId(id);
    window.location.hash = route;
  };

  const handleLogin = (role: UserRole, name: string) => {
      setUserRole(role);
      setUserName(name);
      setIsAuthenticated(true);
      setCurrentRoute('dashboard');
  };

  const handleLogout = () => {
      setIsAuthenticated(false);
      setUserRole('IT_ADMIN'); // Reset to default or keep last
      setUserName('');
      setCurrentRoute('dashboard');
  };

  const handleCreateOrganization = async (orgData: any) => {
      if (userRole !== 'SUPER_ADMIN') return;
      
      try {
          const response = await fetch('/api/admin/companies', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'x-user-role': userRole
              },
              body: JSON.stringify(orgData)
          });

          if (response.ok) {
              const newOrg = await response.json();
              setOrganizations(prev => [...prev, newOrg]);
              if (newOrg.branches.length > 0) {
                  setCurrentBranch(newOrg.branches[0]);
              }
              setIsCreateOrgModalOpen(false);
          } else {
              const err = await response.json();
              alert(err.error || 'Failed to create organization');
          }
      } catch (error) {
          console.error('Error creating organization:', error);
          alert('Network error creating organization');
      }
  };

  const handleDeleteOrganization = async (orgId: string) => {
      if (userRole !== 'SUPER_ADMIN') return;
      
      if (organizations.length <= 1) {
          alert("Cannot delete the only organization.");
          return;
      }

      if (!window.confirm('Are you sure you want to delete this company? All related data will be lost.')) return;

      try {
          const response = await fetch(`/api/admin/companies/${orgId}`, {
              method: 'DELETE',
              headers: { 'x-user-role': userRole }
          });

          if (response.ok) {
              const updatedOrgs = organizations.filter(o => o.id !== orgId);
              setOrganizations(updatedOrgs);

              if (currentBranch && currentBranch.organizationId === orgId) {
                  if (updatedOrgs.length > 0 && updatedOrgs[0].branches.length > 0) {
                      setCurrentBranch(updatedOrgs[0].branches[0]);
                  } else {
                      setCurrentBranch(null);
                  }
              }
          } else {
              const err = await response.json();
              alert(err.error || 'Failed to delete organization');
          }
      } catch (error) {
          console.error('Error deleting organization:', error);
          alert('Network error deleting organization');
      }
  };

  const renderContent = () => {
    // RBAC Route Protection Logic
    if ((currentRoute === 'certificates' || currentRoute === 'erp-connectors') && userRole !== 'IT_ADMIN') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-in zoom-in duration-300">
          <div className="bg-rose-50 p-6 rounded-full mb-6">
             <span className="text-4xl">🚫</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Access Denied</h2>
          <p className="text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
            You do not have permission to access {currentRoute === 'certificates' ? 'Certificate Management' : 'ERP Configuration'}. 
            This area is restricted to IT Administrators.
          </p>
          <button 
            onClick={() => navigate('dashboard')}
            className="mt-8 px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium shadow-lg shadow-slate-900/10"
          >
            Return to Dashboard
          </button>
        </div>
      );
    }

    // Super Admin Restrictions (Operational Routes)
    const operationalRoutes = ['invoices', 'create-invoice', 'invoice-detail', 'validator'];
    if (operationalRoutes.includes(currentRoute) && userRole === 'SUPER_ADMIN') {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-in zoom-in duration-300">
              <div className="bg-slate-100 p-6 rounded-full mb-6">
                 <span className="text-4xl">🏢</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Company Management Mode</h2>
              <p className="text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
                Super Admin account is restricted to Company and Entity management only. 
                Please use an operational account (Admin/Finance/Tax) to manage invoices.
              </p>
              <button 
                onClick={() => navigate('dashboard')}
                className="mt-8 px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium shadow-lg shadow-slate-900/10"
              >
                Return to Dashboard
              </button>
            </div>
          );
    }

    switch (currentRoute) {
      case 'dashboard':
        return <Dashboard onNavigate={navigate} selectedBranch={currentBranch} />;
      case 'users':
        return <UserManagement userRole={userRole} userName={userName} />;
      case 'invoices':
        return <InvoiceList userRole={userRole} onSelectInvoice={(id) => navigate('invoice-detail', id)} onNavigate={navigate} selectedBranch={currentBranch} />;
      case 'create-invoice':
        // If coming from "Issue Credit Note" context, selectedInvoiceId acts as the Reference ID
        return <InvoiceGenerator onNavigate={navigate} referenceInvoiceId={selectedInvoiceId} selectedBranch={currentBranch} organizations={organizations} />;
      case 'invoice-detail':
        return <InvoiceDetail userRole={userRole} invoiceId={selectedInvoiceId} onBack={() => navigate('invoices')} />;
      case 'items':
        return <ItemMaster selectedBranch={currentBranch} />;
      case 'certificates':
        return <CertificateManager selectedBranch={currentBranch} />;
      case 'erp-connectors':
        return <ERPConnectors selectedBranch={currentBranch} />;
      case 'audit':
        return <AuditLog />;
      case 'validator':
        return <XMLValidator />;
      case 'settings':
        return (
          <Settings 
            selectedBranch={currentBranch} 
            organizations={organizations} 
            userRole={userRole}
            onRefresh={fetchOrganizations}
          />
        );
      case 'api-docs':
        return <ApiDocs />;
      default:
        return <Dashboard onNavigate={navigate} selectedBranch={currentBranch} />;
    }
  };

  if (!isAuthenticated) {
      return <Login onLogin={handleLogin} />;
  }

  return (
    <ToastProvider>
        {!isOnline && (
            <div className="bg-slate-900 text-white text-xs font-bold py-2 text-center flex items-center justify-center sticky top-0 z-[100]">
                <WifiOff size={14} className="mr-2" /> Offline Mode - Changes will sync when connection is restored
            </div>
        )}
        {isOnline && isSyncing && (
             <div className="bg-emerald-600 text-white text-xs font-bold py-2 text-center flex items-center justify-center sticky top-0 z-[100] animate-in slide-in-from-top-0">
                <RefreshCw size={14} className="mr-2 animate-spin" /> Restoring Connection - Syncing Data...
            </div>
        )}

        <ErrorBoundary>
        <Layout 
        currentRoute={currentRoute} 
        onNavigate={navigate} 
        userRole={userRole} 
        userName={userName} 
        onLogout={handleLogout}
        organizations={organizations}
        currentBranch={currentBranch}
        onSwitchBranch={setCurrentBranch}
        onCreateOrganization={() => setIsCreateOrgModalOpen(true)}
        onDeleteOrganization={handleDeleteOrganization}
        >
        {renderContent()}
        </Layout>
        </ErrorBoundary>

        {isCreateOrgModalOpen && (
            <CreateOrganizationModal 
                onClose={() => setIsCreateOrgModalOpen(false)}
                onCreate={handleCreateOrganization}
            />
        )}
    </ToastProvider>
  );
};

export default App;
