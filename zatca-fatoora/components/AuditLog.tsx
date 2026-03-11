
import React, { useState, useMemo } from 'react';
import { mockAuditLogs } from '../services/mockData';
import { AuditLogEntry } from '../types';
import { Terminal, Search, Filter, FileCheck, Download, AlertTriangle, Shield, CheckCircle, Clock, X, Hash, Server, Activity, Lock, Eye, Code, Calendar } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const AuditLog: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [ipFilter, setIpFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const filteredLogs = useMemo(() => {
    return mockAuditLogs.filter(log => {
      const matchesSearch = 
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) || 
        log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.resourceId && log.resourceId.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCategory = categoryFilter === 'All' || log.category === categoryFilter;
      const matchesStatus = statusFilter === 'All' || log.status === statusFilter;
      const matchesIp = ipFilter === '' || log.ipAddress.includes(ipFilter);

      let matchesDate = true;
      if (dateStart) {
          matchesDate = matchesDate && new Date(log.timestamp) >= new Date(dateStart);
      }
      if (dateEnd) {
          const end = new Date(dateEnd);
          end.setHours(23, 59, 59, 999);
          matchesDate = matchesDate && new Date(log.timestamp) <= end;
      }

      return matchesSearch && matchesCategory && matchesStatus && matchesIp && matchesDate;
    });
  }, [searchTerm, categoryFilter, statusFilter, ipFilter, dateStart, dateEnd]);

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
          total: filteredLogs.length,
          securityAlerts: filteredLogs.filter(l => l.category === 'Security' && l.status !== 'Success').length,
          failureRate: filteredLogs.length > 0 
            ? Math.round((filteredLogs.filter(l => l.status === 'Failure').length / filteredLogs.length) * 100) 
            : 0
      };
  }, [filteredLogs]);

  // Chart Data Preparation (Group by Hour/Day - simplified for demo)
  const chartData = useMemo(() => {
    // Reverse chronological for processing, but chart needs chronological
    const sorted = [...filteredLogs].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return sorted.map((log, index) => ({
        name: index, // Simplified X-axis
        time: new Date(log.timestamp).toLocaleTimeString(),
        status: log.status === 'Success' ? 1 : 0,
        fail: log.status !== 'Success' ? 1 : 0
    }));
  }, [filteredLogs]);


  const handleExport = () => {
    const headers = ['Timestamp', 'Category', 'User', 'Role', 'IP', 'Action', 'Details', 'Status', 'Hash'];
    const rows = filteredLogs.map(log => 
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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
               {/* KPI 1 */}
               <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Events</p>
                   <div className="flex items-end justify-between mt-2">
                       <h3 className="text-2xl font-bold text-slate-900">{stats.total}</h3>
                       <Activity size={20} className="text-indigo-500 mb-1" />
                   </div>
               </div>
               {/* KPI 2 */}
               <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Security Alerts</p>
                   <div className="flex items-end justify-between mt-2">
                       <h3 className="text-2xl font-bold text-slate-900">{stats.securityAlerts}</h3>
                       <AlertTriangle size={20} className="text-amber-500 mb-1" />
                   </div>
               </div>
                {/* KPI 3 */}
               <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Failure Rate</p>
                   <div className="flex items-end justify-between mt-2">
                       <h3 className="text-2xl font-bold text-slate-900">{stats.failureRate}%</h3>
                       <X size={20} className="text-rose-500 mb-1" />
                   </div>
               </div>
          </div>
          
          {/* Chart */}
          <div className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Activity Volume</h3>
              <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                          <defs>
                              <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                          />
                          <Area type="monotone" dataKey="status" stackId="1" stroke="#6366f1" fill="url(#colorActivity)" />
                          <Area type="monotone" dataKey="fail" stackId="1" stroke="#f43f5e" fill="#f43f5e" />
                      </AreaChart>
                  </ResponsiveContainer>
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
            <tbody className="divide-y divide-slate-100 bg-white">
                {filteredLogs.length > 0 ? (
                    filteredLogs.map((log) => (
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
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(log.status)}`}>
                                {log.status}
                            </span>
                        </td>
                        <td className="px-6 py-3 text-right">
                            <button className="text-slate-300 hover:text-indigo-600 transition-colors">
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
