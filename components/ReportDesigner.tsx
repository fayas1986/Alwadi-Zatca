
import React, { useState, useEffect } from 'react';
import { Layout, Settings, Plus, Save, Trash2, MoveUp, MoveDown, CheckCircle2, AlertCircle, Loader2, X, FileText, Database, ChevronDown } from 'lucide-react';
import { useToast } from './Toast';

interface ColumnMapping {
  label: string;
  key: string;
}

interface ReportConfig {
  sourceModel: string;
  columns: ColumnMapping[];
}

interface ReportTemplate {
  id?: number;
  name: string;
  description: string;
  category: string;
  config: ReportConfig;
}

interface ReportDesignerProps {
  userRole: string;
}

const AVAILABLE_MODELS = [
  { id: 'invoice', label: 'Invoices', icon: <FileText size={16} /> },
  { id: 'audit_log', label: 'Audit Logs', icon: <Database size={16} /> },
  { id: 'company', label: 'Organizations', icon: <Settings size={16} /> }
];

const SCHEMA_FIELDS: Record<string, { label: string; key: string }[]> = {
  invoice: [
    { label: 'Invoice Number', key: 'invoice_number' },
    { label: 'UUID', key: 'uuid' },
    { label: 'Issue Date', key: 'date' },
    { label: 'Created At', key: 'created_at' },
    { label: 'Description / Nature of Goods', key: 'description' },
    { label: 'Taxable Amount', key: 'taxable_amount' },
    { label: 'Tax Amount', key: 'tax_amount' },
    { label: 'Total Amount', key: 'total_amount' },
    { label: 'Status', key: 'status' },
    { label: 'Type', key: 'type' },
    { label: 'Document Type', key: 'document_type' },
    { label: 'VAT Rate / Category', key: 'vat_rate' },
    { label: 'Items Summary', key: 'items_summary' },
    { label: 'Total Quantity', key: 'total_quantity' },
    { label: 'Unit Price', key: 'unit_price' },
    { label: 'Hash', key: 'hash' },
    { label: 'ZATCA Hash', key: 'zatca_hash' },
    { label: 'Previous Hash', key: 'previous_invoice_hash' },
    { label: 'Submission ID', key: 'submission_id' },
    { label: 'QR Code', key: 'qr_code' },
    { label: 'Company Name', key: 'company.registered_name' },
    { label: 'Company VAT', key: 'company.vat_number' },
    { label: 'Company CR Number', key: 'company.cr_number' },
    { label: 'Company Address', key: 'company.address' },
    { label: 'Company City', key: 'company.city' },
    { label: 'Customer Name', key: 'customer.name' },
    { label: 'Customer VAT', key: 'customer.vat_number' },
    { label: 'Customer Address', key: 'customer.address' },
    { label: 'Customer City', key: 'customer.city' },
    { label: 'Error Log', key: 'error_log' },
  ],
  audit_log: [
    { label: 'Timestamp', key: 'timestamp' },
    { label: 'Action', key: 'action' },
    { label: 'Category', key: 'category' },
    { label: 'User Email', key: 'user' },
    { label: 'User Role', key: 'role' },
    { label: 'IP Address', key: 'ip_address' },
    { label: 'Status', key: 'status' },
    { label: 'Details', key: 'details' },
    { label: 'Resource ID', key: 'resource_id' },
    { label: 'Hash', key: 'hash' },
  ],
  company: [
    { label: 'Company Name', key: 'registered_name' },
    { label: 'VAT Number', key: 'vat_number' },
    { label: 'CR Number', key: 'cr_number' },
    { label: 'Branch', key: 'branch_name' },
    { label: 'City', key: 'city' },
    { label: 'Country', key: 'country' },
    { label: 'Address', key: 'address' },
    { label: 'Environment', key: 'environment' },
    { label: 'Created At', key: 'created_at' },
    { label: 'Owner Name', key: 'user.name' },
    { label: 'Owner Email', key: 'user.email' },
    { label: 'Group Name', key: 'group.name' },
  ]
};

const PRESET_COLUMNS: Record<string, ColumnMapping[]> = {
  invoice: [
    { label: 'Invoice Number', key: 'invoice_number' },
    { label: 'Issue Date', key: 'date' },
    { label: 'Description', key: 'description' },
    { label: 'Taxable Amount', key: 'taxable_amount' },
    { label: 'Tax Amount', key: 'tax_amount' },
    { label: 'Total Amount', key: 'total_amount' },
    { label: 'Status', key: 'status' },
  ],
  audit_log: SCHEMA_FIELDS.audit_log.slice(0, 6),
  company: SCHEMA_FIELDS.company.slice(0, 6)
};

export const ReportDesigner: React.FC<ReportDesignerProps> = ({ userRole }) => {
  const { addToast } = useToast();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);


  const [formData, setFormData] = useState<ReportTemplate>({
    name: '',
    description: '',
    category: 'AUDIT',
    config: {
      sourceModel: 'invoice',
      columns: [...PRESET_COLUMNS['invoice']]
    }
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      const timer = setTimeout(() => {
        fetchPreview();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [formData.config, isModalOpen]);

  const fetchPreview = async () => {
    if (!formData.config.columns.length) return;
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch('/api/admin/reports/datapreview', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': userRole 
        },
        body: JSON.stringify({ config: formData.config })
      });
      if (res.ok) {
        setPreviewData(await res.json());
      } else {
        const errorData = await res.json().catch(() => ({}));
        setPreviewError(errorData.error || `Server error: ${res.status}`);
      }
    } catch (e: any) {
      console.error('[ReportDesigner] Preview Fetch Error:', e);
      setPreviewError(`Network error: ${e.message}`);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleDuplicate = (template: ReportTemplate) => {
    const { id, ...templateData } = template;
    const duplicated = {
      ...templateData,
      name: `${template.name} (Copy)`
    };
    setFormData(duplicated);
    setIsModalOpen(true);
  };

  const fetchTemplates = async () => {
    try {
      console.log('[ReportDesigner] Fetching templates from /api/admin/reports/templates');
      const res = await fetch('/api/admin/reports/templates', {
        headers: { 'x-user-role': userRole }
      });
      console.log('[ReportDesigner] Fetch templates response:', res.status);
      if (res.ok) setTemplates(await res.json());
    } catch (e) {
      addToast('error', 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddModelColumn = (modelId: string) => {
    setFormData({
      ...formData,
      config: {
        sourceModel: modelId,
        columns: [...PRESET_COLUMNS[modelId]]
      }
    });
  };

  const addColumn = () => {
    const columns = [...formData.config.columns, { label: 'New Column', key: '' }];
    setFormData({ ...formData, config: { ...formData.config, columns } });
  };

  const removeColumn = (index: number) => {
    const columns = formData.config.columns.filter((_, i) => i !== index);
    setFormData({ ...formData, config: { ...formData.config, columns } });
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const columns = [...formData.config.columns];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= columns.length) return;
    [columns[index], columns[newIndex]] = [columns[newIndex], columns[index]];
    setFormData({ ...formData, config: { ...formData.config, columns } });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return addToast('error', 'Report name is required');
    
    setIsSaving(true);
    try {
      console.log('[ReportDesigner] Saving template to /api/admin/reports/templates', formData);
      const res = await fetch('/api/admin/reports/templates', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': userRole 
        },
        body: JSON.stringify(formData)
      });
      console.log('[ReportDesigner] Save response:', res.status);
      if (res.ok) {
        addToast('success', 'Template saved successfully');
        setIsModalOpen(false);
        fetchTemplates();
      } else {
        addToast('error', 'Failed to save template');
      }
    } catch (e: any) {
      console.error('[ReportDesigner] Save error:', e);
      addToast('error', `Network error: ${e.message || 'Unknown'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      const res = await fetch(`/api/admin/reports/templates/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-role': userRole }
      });
      if (res.ok) {
        addToast('success', 'Template deleted');
        fetchTemplates();
      }
    } catch (e) {
      addToast('error', 'Failed to delete template');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Report Designer</h1>
          <p className="text-slate-500 mt-1">Design report templates with dynamic data mapping.</p>
        </div>
        <button 
          onClick={() => {
            setFormData({ name: '', description: '', category: 'AUDIT', config: { sourceModel: 'invoice', columns: [...PRESET_COLUMNS['invoice']] } });
            setIsModalOpen(true);
          }}
          className="flex items-center px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10"
        >
          <Plus size={18} className="mr-2" /> New Template
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Template Name</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Source</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Columns</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {templates.map(t => (
              <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-900">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.description || 'No description'}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 text-xs font-bold bg-slate-100 text-slate-600 rounded uppercase">
                    {(t.config as any).sourceModel}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-slate-500">
                  {(t.config as any).columns?.length || 0} columns mapped
                </td>
                <td className="px-6 py-4 text-right space-x-2 shrink-0">
                   <button 
                    onClick={() => handleDuplicate(t)}
                    title="Duplicate Template"
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                   >
                     <Layout size={18} />
                   </button>
                   <button 
                    onClick={() => { setFormData(t); setIsModalOpen(true); }}
                    title="Edit Template"
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                   >
                     <Settings size={18} />
                   </button>
                   <button 
                    onClick={() => t.id && handleDelete(t.id)}
                    title="Delete Template"
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                   >
                     <Trash2 size={18} />
                   </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden border border-slate-200 flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
               <div>
                 <h2 className="text-xl font-bold text-slate-900">Configure Report Template</h2>
                 <p className="text-xs text-slate-500">Map database fields and preview results in real-time.</p>
               </div>
               <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full">
                 <X size={20} className="text-slate-400" />
               </button>
            </div>

            <div className="flex-1 overflow-hidden flex min-h-0">
              {/* Configuration Section */}
              <div className="w-1/2 overflow-y-auto p-8 space-y-8 border-r border-slate-100">
                 <div className="grid grid-cols-1 gap-6">
                   <div className="space-y-4">
                     <div>
                       <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Report Name</label>
                       <input 
                        type="text" 
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Monthly VAT Audit"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" 
                       />
                     </div>
                     <div>
                       <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Description</label>
                       <textarea 
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        rows={2}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none" 
                       />
                     </div>
                   </div>
                   
                   <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-3">Data Source</label>
                      <div className="grid grid-cols-3 gap-3">
                        {AVAILABLE_MODELS.map(m => (
                          <button 
                            key={m.id}
                            type="button"
                            onClick={() => handleAddModelColumn(m.id)}
                            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
                              formData.config.sourceModel === m.id ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200'
                            }`}
                          >
                            {m.icon}
                            <span className="text-[10px] font-bold mt-2 uppercase">{m.label}</span>
                          </button>
                        ))}
                      </div>
                   </div>
                 </div>

                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 flex items-center">
                        <Plus size={18} className="mr-2 text-indigo-500" /> Column Mappings
                      </h3>
                      <button 
                        type="button"
                        onClick={addColumn}
                        className="text-indigo-600 hover:text-indigo-700 text-sm font-bold flex items-center"
                      >
                        <Plus size={16} className="mr-1" /> Add Custom Field
                      </button>
                    </div>

                    <div className="space-y-3">
                      {formData.config.columns.map((col, idx) => (
                        <div key={idx} className="flex gap-4 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 group">
                          <div className="flex flex-col gap-1 shrink-0">
                            <button type="button" onClick={() => moveColumn(idx, 'up')} className="text-slate-300 hover:text-slate-900 transition-colors"><MoveUp size={14}/></button>
                            <button type="button" onClick={() => moveColumn(idx, 'down')} className="text-slate-300 hover:text-slate-900 transition-colors"><MoveDown size={14}/></button>
                          </div>
                          
                          <div className="flex-1 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Column Label (UI Name)</span>
                                <input 
                                  type="text"
                                  value={col.label}
                                  onChange={e => {
                                    const columns = [...formData.config.columns];
                                    columns[idx].label = e.target.value;
                                    setFormData({ ...formData, config: { ...formData.config, columns } });
                                  }}
                                  className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg outline-none text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Data Field Key</span>
                                <div className="relative">
                                  <select 
                                    value={col.key}
                                    onChange={e => {
                                      const columns = [...formData.config.columns];
                                      const selectedField = SCHEMA_FIELDS[formData.config.sourceModel].find(f => f.key === e.target.value);
                                      columns[idx].key = e.target.value;
                                      if (selectedField && (!columns[idx].label || columns[idx].label === 'New Column')) {
                                        columns[idx].label = selectedField.label;
                                      }
                                      setFormData({ ...formData, config: { ...formData.config, columns } });
                                    }}
                                    className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg outline-none text-xs appearance-none pr-8"
                                  >
                                    <option value="">Select Field...</option>
                                    {SCHEMA_FIELDS[formData.config.sourceModel]?.map(f => (
                                      <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                                    ))}
                                  </select>
                                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <ChevronDown size={12} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <button 
                            type="button" 
                            onClick={() => removeColumn(idx)}
                            className="p-1.5 text-slate-300 hover:text-rose-600 transition-colors group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                 </div>
              </div>

              {/* Preview Section */}
              <div className="w-1/2 bg-slate-50 overflow-hidden flex flex-col">
                <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center shrink-0">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center">
                    <CheckCircle2 size={16} className="mr-2 text-emerald-500" /> 
                    Live Data Preview
                  </h3>
                  <div className="flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Showing top 5 samples
                  </div>
                </div>
                
                <div className="flex-1 overflow-auto p-4">
                  {isPreviewLoading ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-white/50 rounded-2xl border border-dashed border-slate-200">
                      <Loader2 size={32} className="animate-spin mb-4 text-indigo-400" />
                      <p className="text-sm font-medium">Fetching sample data...</p>
                    </div>
                  ) : previewError ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-white/50 rounded-2xl border border-dashed border-slate-200">
                      <AlertCircle size={32} className="mb-4 text-rose-400" />
                      <p className="text-sm font-medium">{previewError}</p>
                      <button onClick={fetchPreview} className="mt-4 text-indigo-600 hover:underline">Try again</button>
                    </div>
                  ) : previewData.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-white/50 rounded-2xl border border-dashed border-slate-200 p-8 text-center">
                      <Database size={32} className="mb-4 text-slate-300" />
                      <p className="text-sm font-medium">No records found for this model.</p>
                      <p className="text-xs mt-1">Try changing the data source or ensuring data exists in your company.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <table className="w-full text-left text-[10px] border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500">
                          <tr>
                            {formData.config.columns.map((c, i) => (
                              <th key={i} className="px-2 py-2 border-r border-slate-200 last:border-0">{c.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {previewData.map((row, i) => (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                              {formData.config.columns.map((col, j) => (
                                <td key={j} className="px-2 py-2 border-r border-slate-100 last:border-0 truncate max-w-[120px]">
                                  {String(row[col.label] || '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                
                <div className="p-4 bg-indigo-50/50 border-t border-indigo-100 flex items-start gap-4 shrink-0">
                  <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                    <AlertCircle size={16} />
                  </div>
                  <p className="text-[11px] text-indigo-600 leading-relaxed">
                    <strong>Design Tip:</strong> Use the preview to verify that your data paths are correct before saving. If a column shows empty values, ensure the corresponding field exists in the source data.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-white relative z-10">
               <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 font-bold text-slate-600 hover:text-slate-800">
                 Cancel
               </button>
               <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-600/20 disabled:opacity-50"
               >
                 {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                 Save Template
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
