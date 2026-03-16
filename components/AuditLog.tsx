
import React, { useState, useEffect, useMemo } from 'react';
import { getAuditLogs } from '../services/api';
import { AuditLogEntry } from '../types';
import { Terminal, Search, Filter, FileCheck, Download, AlertTriangle, Shield, CheckCircle, Clock, X, Hash, Server, Activity, Lock, Eye, Code, Calendar, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export const AuditLog: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [ipFilter, setIpFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const itemsPerPage = 10;

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const result = await getAuditLogs({
        page: currentPage,
        limit: itemsPerPage,
        category: categoryFilter,
        status: statusFilter,
        user: searchTerm,
        action: searchTerm
      });
      
      // Map backend ip_address to frontend ipAddress and other camelCase mappings
      const mappedLogs = result.data.map((l: any) => ({
        ...l,
        ipAddress: l.ip_address,
        resourceId: l.resource_id
      }));

      setLogs(mappedLogs);
      setTotalLogs(result.pagination.total);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [currentPage, categoryFilter, statusFilter, searchTerm]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, statusFilter, searchTerm]);

  const totalPages = Math.ceil(totalLogs / itemsPerPage);
  const currentItems = logs;

  const clearFilters = () => {
      setSearchTerm('');
      setCategoryFilter('All');
      setStatusFilter('All');
      setDateStart('');
      setDateEnd('');
      setIpFilter('');
  };

  // KPI Calculations
  const stats = useMemo(() => {
      return {
          total: totalLogs,
          securityAlerts: logs.filter(l => l.category === 'Security' && l.status !== 'Success').length, // This is just for current view
          failureRate: logs.length > 0 
            ? Math.round((logs.filter(l => l.status === 'Failure').length / logs.length) * 100) 
            : 0
      };
  }, [logs, totalLogs]);



  const handleExport = () => {
    const headers = ['Timestamp', 'Category', 'User', 'Role', 'IP', 'Action', 'Details', 'Status', 'Hash'];
    const rows = logs.map(log => 
      [log.timestamp, log.category, log.user, log.role, log.ipAddress, log.action, log.details, log.status, log.hash].map(f => `"${f}"`).join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_log_${new Date().toISOString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusColor = (status: string) => {
      switch(status) {
          case 'Success': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
          case 'Failure': return 'bg-rose-50 text-rose-700 border-rose-100';
          case 'Warning': return 'bg-amber-50 text-amber-700 border-amber-100';
          default: return 'bg-slate-50 text-slate-700 border-slate-100';
      }
  };

  const getCategoryIcon = (category: string) => {
      switch(category) {
          case 'Security': return <Lock size={14} className="text-rose-500"/>;
          case 'Operational': return <Activity size={14} className="text-blue-500"/>;
          case 'Compliance': return <Shield size={14} className="text-emerald-500"/>;
          case 'System': return <Server size={14} className="text-slate-500"/>;
          default: return <Terminal size={14} />;
      }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-6 animate-in fade-in duration-500">
      
      {/* Top Stats & Chart */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           {/* KPI 1 */}
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-indigo-200 transition-colors">
               <div>
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Events</p>
                   <h3 className="text-3xl font-bold text-slate-900">{stats.total}</h3>
               </div>
               <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                   <Activity size={24} />
               </div>
           </div>
           
           {/* KPI 2 */}
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-amber-200 transition-colors">
               <div>
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Security Alerts</p>
                   <h3 className="text-3xl font-bold text-slate-900">{stats.securityAlerts}</h3>
               </div>
               <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
                   <AlertTriangle size={24} />
               </div>
           </div>

           {/* KPI 3 */}
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-rose-200 transition-colors">
               <div>
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Failure Rate</p>
                   <h3 className="text-3xl font-bold text-slate-900">{stats.failureRate}%</h3>
               </div>
               <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 group-hover:scale-110 transition-transform">
                   <X size={24} />
               </div>
           </div>
      </div>

      {/* Main Log Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col flex-1 overflow-hidden">
        
        {/* Filters Toolbar */}
        <div className="p-4 border-b border-slate-100 bg-white z-20 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="relative flex-1 w-full sm:max-w-md">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search logs by ID, user, or action..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-slate-50 focus:bg-white"
                    />
                </div>
                <button 
                    onClick={handleExport}
                    className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm active:scale-95 whitespace-nowrap"
                >
                    <Download size={16} />
                    <span className="text-sm font-medium">Export CSV</span>
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <select 
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="pl-3 pr-8 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white cursor-pointer"
                >
                    <option value="All">All Categories</option>
                    <option value="Security">Security</option>
                    <option value="Operational">Operational</option>
                    <option value="Compliance">Compliance</option>
                    <option value="System">System</option>
                </select>

                <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="pl-3 pr-8 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white cursor-pointer"
                >
                    <option value="All">All Statuses</option>
                    <option value="Success">Success</option>
                    <option value="Failure">Failure</option>
                    <option value="Warning">Warning</option>
                </select>

                <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">IP</span>
                    <input 
                        type="text"
                        value={ipFilter}
                        onChange={(e) => setIpFilter(e.target.value)}
                        placeholder="192.168..."
                        className="bg-transparent text-sm outline-none w-24 text-slate-700 placeholder:text-slate-300"
                    />
                </div>

                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
                    <Calendar size={14} className="text-slate-400" />
                    <input 
                        type="date" 
                        value={dateStart}
                        onChange={(e) => setDateStart(e.target.value)}
                        className="bg-transparent text-sm outline-none text-slate-600 w-full sm:w-auto"
                        placeholder="Start Date"
                    />
                    <span className="text-slate-300">-</span>
                    <input 
                        type="date" 
                        value={dateEnd}
                        onChange={(e) => setDateEnd(e.target.value)}
                        className="bg-transparent text-sm outline-none text-slate-600 w-full sm:w-auto"
                        placeholder="End Date"
                    />
                </div>

                {(categoryFilter !== 'All' || statusFilter !== 'All' || ipFilter || dateStart || dateEnd || searchTerm) && (
                    <button 
                        onClick={clearFilters} 
                        className="ml-auto sm:ml-0 text-sm font-medium text-rose-500 hover:text-rose-600 px-2 py-1 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                        Clear Filters
                    </button>
                )}
            </div>
        </div>

        <div className="flex-1 overflow-auto p-0 bg-slate-50/30">
            <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 border-b border-slate-200">
                <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">User / IP</th>
                <th className="px-6 py-3">Action</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right"></th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white relative">
                {isLoading ? (
                    <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center justify-center text-slate-400">
                                <Loader2 size={32} className="animate-spin mb-3 text-indigo-500" />
                                <p className="text-sm font-medium">Loading audit logs...</p>
                            </div>
                        </td>
                    </tr>
                ) : currentItems.length > 0 ? (
                    currentItems.map((log) => (
                    <tr 
                        key={log.id} 
                        onClick={() => setSelectedLog(log)}
                        className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                    >
                        <td className="px-6 py-3 whitespace-nowrap text-slate-500 font-mono text-xs">
                            {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                                <div className="p-1 rounded bg-slate-100">{getCategoryIcon(log.category)}</div>
                                <span className="font-medium text-slate-700">{log.category}</span>
                            </div>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">
                            <div className="flex flex-col">
                                <span className="font-semibold text-slate-800 text-xs">{log.user}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{log.ipAddress}</span>
                            </div>
                        </td>
                        <td className="px-6 py-3">
                            <span className="font-medium text-slate-900 block">{log.action}</span>
                            <span className="text-xs text-slate-500 truncate max-w-[200px] block">{log.details}</span>
                        </td>
                        <td className="px-6 py-3">
                            <span className={`inline-flex items-center px-3 py-0.5 rounded text-xs font-bold border ${getStatusColor(log.status)}`}>
                                {log.status}
                            </span>
                        </td>
                        <td className="px-6 py-3 text-right">
                            <button className="text-slate-300 group-hover:text-indigo-600 transition-colors">
                                <Eye size={16} />
                            </button>
                        </td>
                    </tr>
                    ))
                ) : (
                    <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center">
                                <Filter size={32} className="mb-3 opacity-20" />
                                <p className="text-sm font-medium">No logs found matching your filters.</p>
                                <button onClick={clearFilters} className="mt-2 text-indigo-600 hover:underline text-xs">Reset Filters</button>
                            </div>
                        </td>
                    </tr>
                )}
            </tbody>
            </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between">
            <div className="text-sm text-slate-500">
                Showing <span className="font-semibold text-slate-900">{totalLogs > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> to <span className="font-semibold text-slate-900">{Math.min(currentPage * itemsPerPage, totalLogs)}</span> of <span className="font-semibold text-slate-900">{totalLogs}</span> entries
            </div>
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronLeft size={16} className="text-slate-600" />
                </button>
                <div className="text-sm font-medium text-slate-600">
                    Page <span className="text-slate-900">{currentPage}</span> of <span className="text-slate-900">{totalPages || 1}</span>
                </div>
                <button 
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronRight size={16} className="text-slate-600" />
                </button>
            </div>
        </div>
      </div>

      {/* Detail Drawer (Modal) */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity" onClick={() => setSelectedLog(null)} />
            <div className="relative w-full max-w-md bg-white h-full shadow-2xl p-0 flex flex-col animate-in slide-in-from-right duration-300">
                <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Log Details</h3>
                        <p className="text-xs font-mono text-slate-500 mt-1">{selectedLog.id}</p>
                    </div>
                    <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Primary Info */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-500">Status</span>
                            <span className={`px-2.5 py-1 rounded-md text-sm font-bold border ${getStatusColor(selectedLog.status)}`}>
                                {selectedLog.status}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-500">Timestamp</span>
                            <span className="text-sm font-mono text-slate-800">{new Date(selectedLog.timestamp).toISOString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-500">Actor</span>
                            <div className="text-right">
                                <span className="block text-sm font-bold text-slate-900">{selectedLog.user}</span>
                                <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{selectedLog.role}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-500">Source IP</span>
                            <span className="text-sm font-mono text-slate-800 bg-slate-50 px-2 py-1 rounded border border-slate-100">{selectedLog.ipAddress}</span>
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    {/* Metadata Dump */}
                    <div>
                        <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center">
                            <Code size={16} className="mr-2 text-indigo-500" />
                            Event Metadata
                        </h4>
                        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto shadow-inner">
                            <pre className="text-xs text-emerald-400 font-mono leading-relaxed">
                                {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                            </pre>
                        </div>
                    </div>

                     {/* Immutable Hash */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center">
                            <Hash size={12} className="mr-1.5" />
                            Integrity Check
                        </h4>
                        <div className="break-all font-mono text-xs text-slate-600 bg-white p-2 rounded border border-slate-200">
                            {selectedLog.hash}
                        </div>
                        <div className="mt-2 flex items-center text-xs text-emerald-600 font-medium">
                            <CheckCircle size={12} className="mr-1.5" />
                            Signature Verified
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
