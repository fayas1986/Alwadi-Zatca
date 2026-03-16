import React, { useState, useEffect } from 'react';
import { mockERPs, submitInvoiceFromERP } from '../services/mockData';
import { ERPSystem, Branch, Certificate } from '../types';
import { Plus, Server, Database, Cloud, Plug, MoreVertical, Wifi, WifiOff, Copy, Check, RefreshCw, Trash2, Key, ShieldCheck, X, Terminal, Play, Code, MonitorSmartphone, LayoutTemplate } from 'lucide-react';
import { useToast } from './Toast';
import { getCertificates } from '../services/api';

interface ERPConnectorsProps {
    selectedBranch?: Branch | null;
}

export const ERPConnectors: React.FC<ERPConnectorsProps> = ({ selectedBranch }) => {
  const { addToast } = useToast();
  const [erps, setErps] = useState<ERPSystem[]>(mockERPs);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'management' | 'simulator'>('management');

  // Fetch Certificates
  useEffect(() => {
    const fetchCerts = async () => {
      if (!selectedBranch?.organizationId) return;
      try {
        const data = await getCertificates(selectedBranch.organizationId);
        setCertificates(data);
      } catch (error) {
        console.error('Error fetching certificates for ERP:', error);
      }
    };
    fetchCerts();
  }, [selectedBranch]);
  
  // Simulator State
  const [simApiKey, setSimApiKey] = useState('sap_prod_8x7d6f5e4w3q2a1s');
  const [simPayload, setSimPayload] = useState(JSON.stringify({
    "invoiceNumber": "API-INV-999",
    "invoiceSubtype": "Standard",
    "issueDate": new Date().toISOString(),
    "currencyCode": "SAR",
    "totalAmount": 1150.00,
    "taxExclusiveAmount": 1000.00,
    "vatAmount": 150.00,
    "items": [
        {
            "id": "item-1",
            "name": "Integration Service Fee",
            "quantity": 1,
            "unitPrice": 1000.00,
            "subtotal": 1000.00,
            "vatRate": 0.15,
            "vatAmount": 150.00,
            "total": 1150.00
        }
    ],
    "customer": {
        "name": "External Client Co",
        "vatNumber": "300011111111113",
        "address": {
            "streetName": "Digital Way",
            "buildingNumber": "101",
            "cityName": "Jeddah",
            "postalZone": "21111",
            "countryCode": "SA"
        }
    },
    "supplier": {
        "name": "Tech Solutions Ltd",
        "vatNumber": "300000000000003",
        "address": { 
            "streetName": "Olaya", 
            "buildingNumber": "1234", 
            "cityName": "Riyadh", 
            "postalZone": "12211", 
            "countryCode": "SA" 
        }
    }
  }, null, 4));
  const [simResponse, setSimResponse] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  
  // New ERP Form State
  const [newERP, setNewERP] = useState<{
    name: string;
    vendor: ERPSystem['vendor'];
    environment: 'Production' | 'Sandbox';
    linkedCertificateId: string;
    sourceUrl: string;
    authHeader: string;
  }>({
    name: '',
    vendor: 'SAP',
    environment: 'Production',
    linkedCertificateId: '',
    sourceUrl: '',
    authHeader: ''
  });

  const handleCopy = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to disconnect this ERP system? This will revoke API access immediately.')) {
      setErps(prev => prev.filter(e => e.id !== id));
    }
  };

  const handleSync = async (id: string) => {
    const erp = erps.find(e => e.id === id);
    if (!erp) return;

    try {
        const response = await fetch('/api/erp/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();
        if (result.success) {
            addToast('success', `Sync Triggered Successfully!`);
        } else {
            addToast('error', `Sync Failed: ${result.error}`);
        }
    } catch (error) {
        console.error(error);
        addToast('error', 'Sync Failed: Network Error');
    }
    
    setErps(prev => prev.map(e => e.id === id ? { ...e, lastSync: new Date().toISOString() } : e));
  };

  const loadTemplate = (type: 'standard' | 'pos') => {
      // ... same logic
      if (type === 'pos') {
          setSimPayload(JSON.stringify({
              "invoiceNumber": `POS-${Math.floor(Math.random()*10000)}`,
              "invoiceSubtype": "Simplified",
              // ... rest of template
              "posTerminalId": "TERM-RYD-001",
              "cashierId": "CASHIER-22",
              "paymentMethod": "Credit Card",
              "issueDate": new Date().toISOString(),
              "currencyCode": "SAR",
              "totalAmount": 57.50,
              "taxExclusiveAmount": 50.00,
              "vatAmount": 7.50,
              "items": [
                  {
                      "id": "1",
                      "name": "Coffee & Pastry",
                      "quantity": 1,
                      "unitPrice": 50.00,
                      "subtotal": 50.00,
                      "vatRate": 0.15,
                      "vatAmount": 7.50,
                      "total": 57.50
                  }
              ],
              "customer": {
                  "name": "Walk-in",
                  "address": { "countryCode": "SA" } // Minimal address for B2C
              },
              "supplier": {
                  "name": "Tech Solutions Ltd",
                  "vatNumber": "300000000000003",
                  "address": { "streetName": "Olaya", "buildingNumber": "1234", "cityName": "Riyadh", "postalZone": "12211", "countryCode": "SA" }
              }
          }, null, 4));
      } else {
          setSimPayload(JSON.stringify({
            "invoiceNumber": "API-INV-999",
            "invoiceSubtype": "Standard",
            "issueDate": new Date().toISOString(),
            "currencyCode": "SAR",
            "totalAmount": 1150.00,
            "taxExclusiveAmount": 1000.00,
            "vatAmount": 150.00,
            "items": [
                {
                    "id": "item-1",
                    "name": "Integration Service Fee",
                    "quantity": 1,
                    "unitPrice": 1000.00,
                    "subtotal": 1000.00,
                    "vatRate": 0.15,
                    "vatAmount": 150.00,
                    "total": 1150.00
                }
            ],
            "customer": {
                "name": "External Client Co",
                "vatNumber": "300011111111113",
                "address": {
                    "streetName": "Digital Way",
                    "buildingNumber": "101",
                    "cityName": "Jeddah",
                    "postalZone": "21111",
                    "countryCode": "SA"
                }
            },
            "supplier": {
                "name": "Tech Solutions Ltd",
                "vatNumber": "300000000000003",
                "address": { "streetName": "Olaya", "buildingNumber": "1234", "cityName": "Riyadh", "postalZone": "12211", "countryCode": "SA" }
            }
          }, null, 4));
      }
  };

  const handleSimulateSubmit = async () => {
      setIsSimulating(true);
      setSimResponse(null);
      try {
          const payload = JSON.parse(simPayload);
          const response = await fetch('/api/erp/invoices/submit', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${simApiKey}`
              },
              body: JSON.stringify(payload)
          });
          const result = await response.json();
          setSimResponse(JSON.stringify(result, null, 2));
      } catch (e) {
          setSimResponse(JSON.stringify({ error: "Invalid JSON Payload or Network Error" }, null, 2));
      } finally {
          setIsSimulating(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prefix = newERP.vendor === 'POS' ? 'pos' : newERP.vendor.toLowerCase().slice(0,3);
    const apiKey = `${prefix}_${newERP.environment === 'Production' ? 'prod' : 'sbx'}_${Math.random().toString(36).substring(2,18)}`;
    
    try {
        const payload = {
            companyId: 'org-001',
            type: newERP.vendor.toUpperCase(),
            baseUrl: newERP.sourceUrl || 'http://localhost:3001/mock-erp',
            apiKey: newERP.vendor === 'Custom' ? newERP.authHeader : apiKey,
            syncInterval: 30
        };

        const response = await fetch('/api/erp/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (result.success) {
            const erp: ERPSystem = {
                id: result.data.id || `erp-${Date.now()}`,
                name: newERP.name,
                vendor: newERP.vendor,
                environment: newERP.environment,
                apiKey: apiKey,
                status: 'Connected',
                lastSync: new Date().toISOString(),
                linkedCertificateId: newERP.linkedCertificateId || undefined,
                sourceUrl: newERP.vendor === 'Custom' ? newERP.sourceUrl : undefined,
                authHeader: newERP.vendor === 'Custom' ? newERP.authHeader : undefined
            };

            setErps([...erps, erp]);
            addToast('success', 'ERP Connection Configuration Saved Successfully');
            setIsModalOpen(false);
            setNewERP({ name: '', vendor: 'SAP', environment: 'Production', linkedCertificateId: '', sourceUrl: '', authHeader: '' });
        } else {
            addToast('error', `Failed to save ERP configuration: ${result.error}`);
        }
    } catch (error) {
       addToast('error', 'Network error while saving configuration');
    }
  };

  const getVendorIcon = (vendor: string) => {
    switch(vendor) {
        case 'SAP': return <Database className="text-blue-600" size={24} />;
        case 'Oracle': return <Server className="text-red-600" size={24} />;
        case 'Microsoft': return <Plug className="text-indigo-600" size={24} />;
        case 'Salesforce': return <Cloud className="text-sky-500" size={24} />;
        case 'POS': return <MonitorSmartphone className="text-emerald-500" size={24} />;
        default: return <Server className="text-slate-600" size={24} />;
    }
  };

  // Although mockERPs don't have a direct branchId in this data model iteration, 
  // we can filter based on the Linked Certificate's branch if we had a full join.
  // For now, we will simply pass through or filter if we extended the ERPSystem type.
  // Assuming strict isolation is required, we would filter here.
  // Since ERPs are often organization-wide, we might filter by Org, or just assume they are available to the branch.
  // For the sake of the demo request "data is not loaded", we will simulate isolation by checking if the user is in a context.
  
  // NOTE: In a real app, ERPSystem would have `organizationId`. We will filter by the linked certificate branch if available.
  const filteredErps = erps.filter(erp => {
      if (!selectedBranch) return true;
      const linkedCert = certificates.find(c => c.id === erp.linkedCertificateId);
      // Show if linked cert belongs to this branch OR if no cert is linked (generic connector)
      return !linkedCert || linkedCert.branchId === selectedBranch.id;
  });

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 placeholder:text-slate-400";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
           <h2 className="text-xl font-bold text-slate-900">ERP Integration Hub</h2>
           <p className="text-sm text-slate-500 mt-1">Manage external ERP connections and API keys for invoice ingestion</p>
           {selectedBranch && (
               <span className="inline-block mt-2 text-xs font-medium px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md">
                   {selectedBranch.name} Context
               </span>
           )}
        </div>
        
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
             <button 
                onClick={() => setActiveTab('management')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeTab === 'management' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-900'
                }`}
             >
                 Management
             </button>
             <button 
                onClick={() => setActiveTab('simulator')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center ${
                    activeTab === 'simulator' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-900'
                }`}
             >
                 <Terminal size={14} className="mr-2" />
                 API Simulator
             </button>
        </div>
      </div>

      {activeTab === 'management' ? (
      <>
      <div className="flex justify-end">
        <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-md hover:shadow-lg active:scale-95"
            >
            <Plus size={18} />
            <span>Onboard New System</span>
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredErps.map(erp => {
            const linkedCert = certificates.find(c => c.id === erp.linkedCertificateId);

            return (
                <div key={erp.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className={`absolute top-0 left-0 w-1.5 h-full ${erp.environment === 'Production' ? 'bg-indigo-500' : 'bg-amber-400'}`}></div>
                    
                    <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center space-x-3">
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    {getVendorIcon(erp.vendor)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">{erp.name}</h3>
                                    <div className="flex items-center mt-1 space-x-2">
                                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                                            erp.environment === 'Production' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                                        }`}>
                                            {erp.environment}
                                        </span>
                                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border flex items-center ${
                                            erp.status === 'Connected' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'
                                        }`}>
                                            {erp.status === 'Connected' ? <Wifi size={10} className="mr-1"/> : <WifiOff size={10} className="mr-1"/>}
                                            {erp.status}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="relative">
                                <button className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                                    <MoreVertical size={18} />
                                </button>
                            </div>
                        </div>

                        {/* API Key Section */}
                        <div className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-semibold text-slate-500 flex items-center">
                                    <Key size={12} className="mr-1" /> API Key
                                </span>
                            </div>
                            <div className="flex items-center justify-between font-mono text-xs text-slate-700 bg-white p-2 rounded border border-slate-200">
                                <span className="truncate mr-2">{erp.apiKey.substring(0, 12)}••••••••</span>
                                <button 
                                    onClick={() => handleCopy(erp.apiKey, erp.id)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors"
                                    title="Copy full key"
                                >
                                    {copiedKeyId === erp.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                </button>
                            </div>
                        </div>

                        {/* Linked Cert Section */}
                        <div className="mb-6">
                             <div className="flex items-center text-xs text-slate-500 mb-2">
                                <ShieldCheck size={14} className="mr-1.5 text-indigo-500" />
                                <span className="font-semibold">Signing Certificate (CSID)</span>
                             </div>
                             {linkedCert ? (
                                 <div className="text-sm font-medium text-slate-700 pl-5 border-l-2 border-slate-200">
                                    {linkedCert.commonName}
                                    <span className="block text-[10px] text-slate-400 font-mono mt-0.5">S/N: {linkedCert.serialNumber}</span>
                                 </div>
                             ) : (
                                 <div className="text-sm text-slate-400 italic pl-5 border-l-2 border-slate-200">
                                     No certificate linked
                                 </div>
                             )}
                        </div>

                        <div className="flex items-center gap-2 pt-4 border-t border-slate-50">
                            <button 
                                onClick={() => handleSync(erp.id)}
                                className="flex-1 py-2 text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center justify-center"
                            >
                                <RefreshCw size={16} className="mr-2" /> Sync
                            </button>
                            <div className="w-px h-6 bg-slate-100"></div>
                            <button 
                                onClick={() => handleDelete(erp.id)}
                                className="flex-1 py-2 text-sm font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center"
                            >
                                <Trash2 size={16} className="mr-2" /> Disconnect
                            </button>
                        </div>
                    </div>
                </div>
            );
        })}

        {filteredErps.length === 0 && (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                <Plug size={48} className="mb-4 opacity-20" />
                <p className="font-medium">No ERP systems connected for this branch</p>
                <p className="text-sm mt-1">Connect a new system to start ingesting invoices.</p>
            </div>
        )}

        {/* Add New Placeholer */}
        <button 
             onClick={() => setIsModalOpen(true)}
             className="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all min-h-[300px] group cursor-pointer"
        >
            <div className="p-4 bg-slate-50 rounded-full mb-4 group-hover:bg-white group-hover:shadow-md transition-all group-hover:scale-110">
                <Plus size={28} />
            </div>
            <span className="font-bold text-lg">Connect System</span>
            <span className="text-sm mt-2 text-slate-400 group-hover:text-indigo-500 text-center px-8">
                Generate API keys and link CSIDs for a new ERP or POS instance
            </span>
        </button>
      </div>
      </>
      ) : (
          /* API Simulator Tab */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col lg:flex-row h-[600px]">
              <div className="flex-1 p-6 border-r border-slate-100 flex flex-col overflow-hidden">
                  <div className="mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center">
                            <Terminal size={20} className="mr-2 text-indigo-500" />
                            Submit Invoice Endpoint
                        </h3>
                        <div className="flex items-center space-x-2">
                             <button 
                                onClick={() => loadTemplate('standard')}
                                className="text-xs font-medium px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors flex items-center"
                                title="Load Standard B2B Invoice"
                             >
                                 <LayoutTemplate size={12} className="mr-1" /> B2B
                             </button>
                             <button 
                                onClick={() => loadTemplate('pos')}
                                className="text-xs font-medium px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors flex items-center"
                                title="Load Simplified B2C POS Invoice"
                             >
                                 <MonitorSmartphone size={12} className="mr-1" /> POS
                             </button>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 mt-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">POST</span>
                          <code className="text-sm font-mono text-slate-700 flex-1">https://api.zatca-connect.sa/v2/invoices/submit</code>
                      </div>
                  </div>

                  <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Authorization Header (Bearer / API Key)</label>
                          <input 
                              type="text" 
                              value={simApiKey}
                              onChange={(e) => setSimApiKey(e.target.value)}
                              className={inputClass}
                          />
                      </div>
                      <div className="flex-1 flex flex-col">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                              <span>Request Body (JSON)</span>
                              <span className="text-xs font-normal text-slate-400 lowercase">application/json</span>
                          </label>
                          <textarea 
                              value={simPayload}
                              onChange={(e) => setSimPayload(e.target.value)}
                              className="flex-1 w-full font-mono text-xs bg-slate-900 text-green-400 p-4 rounded-xl focus:outline-none resize-none"
                              spellCheck={false}
                          />
                      </div>
                  </div>

                  <div className="mt-4">
                      <button 
                        onClick={handleSimulateSubmit}
                        disabled={isSimulating}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center disabled:opacity-70"
                      >
                          {isSimulating ? <RefreshCw size={18} className="animate-spin mr-2" /> : <Play size={18} className="mr-2" />}
                          {isSimulating ? 'Sending Request...' : 'Send Request'}
                      </button>
                  </div>
              </div>

              {/* Response Section */}
              <div className="w-full lg:w-1/3 bg-slate-50 p-6 flex flex-col">
                  <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center justify-between">
                      <span>Response</span>
                      {simResponse && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">200 OK</span>}
                  </h3>
                  {simResponse ? (
                      <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4 overflow-auto shadow-sm">
                          <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap">{simResponse}</pre>
                      </div>
                  ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                          <Code size={32} className="mb-2 opacity-50" />
                          <p className="text-sm">Response will appear here</p>
                      </div>
                  )}
                  <div className="mt-4 text-xs text-slate-500 text-center">
                      <p>Simulation Mode: Response latency added (800ms)</p>
                  </div>
              </div>
          </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-200 relative">
             <div className="h-1.5 w-full bg-slate-900 absolute top-0 left-0"></div>
             <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white">
                <h3 className="font-bold text-2xl text-slate-900">Onboard New System</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors">
                    <X size={20} />
                </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">System Name</label>
                  <input 
                    required
                    type="text" 
                    placeholder="e.g. Riyadh Retail POS #05"
                    className={inputClass}
                    value={newERP.name}
                    onChange={e => setNewERP({...newERP, name: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-800 mb-1.5">Vendor Type</label>
                        <select 
                            className={inputClass}
                            value={newERP.vendor}
                            onChange={e => setNewERP({...newERP, vendor: e.target.value as any})}
                        >
                            <option value="SAP">SAP</option>
                            <option value="Oracle">Oracle</option>
                            <option value="Microsoft">Microsoft Dynamics</option>
                            <option value="Salesforce">Salesforce</option>
                            <option value="POS">POS Terminal</option>
                            <option value="Custom">Custom REST</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-800 mb-1.5">Environment</label>
                        <select 
                            className={inputClass}
                            value={newERP.environment}
                            onChange={e => setNewERP({...newERP, environment: e.target.value as any})}
                        >
                            <option value="Production">Production</option>
                            <option value="Sandbox">Sandbox</option>
                        </select>
                    </div>
                </div>

                {newERP.vendor === 'Custom' && (
                    <div className="space-y-4 border-l-2 border-indigo-100 pl-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-800 mb-1.5">Source URL</label>
                            <input 
                                type="url" 
                                placeholder="http://your-erp/api/invoices"
                                className={inputClass}
                                value={newERP.sourceUrl}
                                onChange={e => setNewERP({...newERP, sourceUrl: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-800 mb-1.5">Auth Header</label>
                            <input 
                                type="text" 
                                placeholder="Bearer token123..."
                                className={inputClass}
                                value={newERP.authHeader}
                                onChange={e => setNewERP({...newERP, authHeader: e.target.value})}
                            />
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-bold text-slate-800 mb-1.5">Link ZATCA Certificate (CSID)</label>
                    <select 
                        className={inputClass}
                        value={newERP.linkedCertificateId}
                        onChange={e => setNewERP({...newERP, linkedCertificateId: e.target.value})}
                    >
                        <option value="">-- Select Active Certificate --</option>
                        {certificates.filter(c => c.status === 'Active' && (!selectedBranch || c.branchId === selectedBranch.id)).map(cert => (
                            <option key={cert.id} value={cert.id}>
                                {cert.commonName} ({cert.type})
                            </option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-2 flex items-center">
                        <ShieldCheck size={12} className="mr-1" />
                        Selected CSID will be used to digitally sign invoices from this source.
                    </p>
                </div>

                <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-50">
                    <button 
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit"
                        className="px-5 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20"
                    >
                        Generate Key & Connect
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
