import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Box, Save, X, AlertCircle, Loader2, FileUp, Download } from 'lucide-react';
import { Item, Branch } from '../types';
import { getItems, createItem, updateItem, deleteItem, bulkCreateItems } from '../services/itemApi';

interface ItemMasterProps {
    selectedBranch: Branch | null;
}

export const ItemMaster: React.FC<ItemMasterProps> = ({ selectedBranch }) => {
    const [items, setItems] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentItem, setCurrentItem] = useState<Partial<Item>>({
        sku: '',
        name: '',
        description: '',
        unitPrice: 0,
        unitOfMeasure: 'each',
        taxCategory: 'S',
        taxRate: 0.15
    });
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (selectedBranch) {
            fetchItems();
        }
    }, [selectedBranch]);

    const fetchItems = async () => {
        if (!selectedBranch) return;
        setIsLoading(true);
        try {
            const data = await getItems(selectedBranch.organizationId);
            setItems(data);
        } catch (error) {
            console.error('Error fetching items:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedBranch) return;

        // Explicit Validation
        if (!currentItem.name?.trim()) {
            alert('Item Name is required');
            return;
        }
        if (currentItem.unitPrice === undefined || currentItem.unitPrice < 0) {
            alert('Please enter a valid price (0 or greater)');
            return;
        }
        if (currentItem.sku?.trim() === '') {
            // Auto-generate SKU if empty
            currentItem.sku = `ITEM-${Date.now()}`;
        }

        setIsLoading(true);
        try {
            if (currentItem.id) {
                await updateItem(currentItem.id, currentItem);
            } else {
                await createItem({
                    ...currentItem as any,
                    companyId: selectedBranch.organizationId
                });
            }
            setIsEditing(false);
            fetchItems();
        } catch (error: any) {
            console.error('Error saving item:', error);
            alert(`Failed to save item: ${error.message || 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this item?')) return;
        try {
            await deleteItem(id);
            fetchItems();
        } catch (error) {
            console.error('Error deleting item:', error);
            alert('Failed to delete item');
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedBranch) return;

        setIsLoading(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            try {
                // Robust CSV parsing using regex to handle quoted fields
                // Matches values properly even if they contain commas inside quotes
                const rows = text.split(/\r?\n/).filter(row => row.trim());
                if (rows.length < 2) throw new Error('CSV file is empty or missing data rows');

                const header = rows[0].split(',').map(h => h.trim().toLowerCase());
                
                const parseCSVLine = (line: string) => {
                    const pattern = /("([^"]|"")*"|[^,]*)(,|$)/g;
                    const result = [];
                    let match;
                    while ((match = pattern.exec(line)) !== null && match[0] !== '') {
                        let value = match[1];
                        if (value.startsWith('"') && value.endsWith('"')) {
                            value = value.substring(1, value.length - 1).replace(/""/g, '"');
                        }
                        result.push(value.trim());
                        if (match[3] === '') break;
                    }
                    return result;
                };

                const data = rows.slice(1).map((row, rowIndex) => {
                    const values = parseCSVLine(row);
                    const item: any = {};
                    header.forEach((key, index) => {
                        const val = values[index];
                        if (key === 'price' || key === 'unitprice') item.unitPrice = Number(val) || 0;
                        else if (key === 'sku') item.sku = val;
                        else if (key === 'name') item.name = val;
                        else if (key === 'description') item.description = val;
                        else if (key === 'uom' || key === 'unitofmeasure') item.unitOfMeasure = val;
                        else if (key === 'taxcategory') item.taxCategory = (val || 'S').toUpperCase();
                    });

                    // Validation per row
                    if (!item.name) throw new Error(`Row ${rowIndex + 2}: Item Name is required`);
                    if (isNaN(item.unitPrice)) throw new Error(`Row ${rowIndex + 2}: Invalid price for ${item.name}`);

                    return item;
                });

                await bulkCreateItems(data, selectedBranch.organizationId);
                alert(`Successfully uploaded ${data.length} items!`);
                fetchItems();
            } catch (error: any) {
                console.error('Error parsing/uploading CSV:', error);
                alert(`Failed to process CSV: ${error.message}`);
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const downloadTemplate = () => {
        const headers = 'SKU,Name,Description,Price,UOM,TaxCategory\n';
        const sampleRow1 = 'ITEM-001,Premium Widget,High-quality widget,50.00,each,S\n';
        const sampleRow2 = 'ITEM-002,"Special Service, Standard Tier","Consulting, integration and support",150.00,hour,S\n';
        const blob = new Blob([headers + sampleRow1 + sampleRow2], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'item_master_template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Item Master</h2>
                    <p className="text-slate-500 mt-2">Manage your ZATCA-compliant products and services</p>
                </div>
                <div className="flex space-x-3">
                    <button
                        onClick={downloadTemplate}
                        className="bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center"
                    >
                        <Download size={18} className="mr-2" /> Template
                    </button>
                    <label className="bg-white text-indigo-600 border border-indigo-200 px-6 py-3 rounded-xl font-bold hover:bg-indigo-50 cursor-pointer transition-all flex items-center">
                        <FileUp size={20} className="mr-2" /> Bulk Upload
                        <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                    </label>
                    <button
                        onClick={() => {
                            setCurrentItem({
                                sku: '',
                                name: '',
                                description: '',
                                unitPrice: 0,
                                unitOfMeasure: 'each',
                                taxCategory: 'S',
                                taxRate: 0.15
                            });
                            setIsEditing(true);
                        }}
                        className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 flex items-center"
                    >
                        <Plus size={20} className="mr-2" /> Add New Item
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by name or SKU..."
                            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                <th className="px-8 py-4">SKU</th>
                                <th className="px-8 py-4">Item Name</th>
                                <th className="px-8 py-4">Price (SAR)</th>
                                <th className="px-8 py-4">VAT Class</th>
                                <th className="px-8 py-4">UoM</th>
                                <th className="px-8 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading && items.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-8 py-12 text-center text-slate-400">
                                        <Loader2 className="animate-spin mx-auto mb-2" size={32} />
                                        Loading items...
                                    </td>
                                </tr>
                            ) : filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-8 py-12 text-center text-slate-400">
                                        No items found
                                    </td>
                                </tr>
                            ) : filteredItems.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-8 py-4 font-mono text-xs font-bold text-slate-400">{item.sku || 'N/A'}</td>
                                    <td className="px-8 py-4">
                                        <div className="font-bold text-slate-900">{item.name}</div>
                                        <div className="text-xs text-slate-500 truncate max-w-xs">{item.description}</div>
                                    </td>
                                    <td className="px-8 py-4 font-mono font-bold text-slate-700">{item.unitPrice.toFixed(2)}</td>
                                    <td className="px-8 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                            item.taxCategory === 'S' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                                        }`}>
                                            {item.taxCategory === 'S' ? `Standard (${(item.taxRate * 100)}%)` : item.taxCategory}
                                        </span>
                                    </td>
                                    <td className="px-8 py-4 text-slate-500">{item.unitOfMeasure}</td>
                                    <td className="px-8 py-4 text-right">
                                        <div className="flex justify-end space-x-2">
                                            <button
                                                onClick={() => {
                                                    setCurrentItem(item);
                                                    setIsEditing(true);
                                                }}
                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Modal */}
            {isEditing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in zoom-in duration-200 border border-slate-200 relative">
                        <div className="h-1.5 w-full bg-slate-900 absolute top-0 left-0"></div>
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h3 className="font-bold text-slate-900 text-2xl flex items-center">
                                <Box size={24} className="mr-3 text-indigo-600" /> 
                                {currentItem.id ? 'Edit Item' : 'Add New Item'}
                            </h3>
                            <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X size={26} />
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="col-span-1">
                                    <label className="block text-sm font-bold text-slate-900 mb-2">SKU (Internal Code)</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                                        value={currentItem.sku}
                                        onChange={(e) => setCurrentItem({...currentItem, sku: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-sm font-bold text-slate-900 mb-2">Item Name <span className="text-rose-600">*</span></label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        value={currentItem.name}
                                        onChange={(e) => setCurrentItem({...currentItem, name: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-bold text-slate-900 mb-2">Description</label>
                                    <textarea
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        rows={3}
                                        value={currentItem.description}
                                        onChange={(e) => setCurrentItem({...currentItem, description: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-900 mb-2">Unit Price (SAR) <span className="text-rose-600">*</span></label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        value={currentItem.unitPrice}
                                        onChange={(e) => setCurrentItem({...currentItem, unitPrice: Number(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-900 mb-2">Unit of Measure</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. each, meter, box"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        value={currentItem.unitOfMeasure}
                                        onChange={(e) => setCurrentItem({...currentItem, unitOfMeasure: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-900 mb-2">VAT Category</label>
                                    <select
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        value={currentItem.taxCategory}
                                        onChange={(e) => {
                                            const cat = e.target.value;
                                            setCurrentItem({
                                                ...currentItem, 
                                                taxCategory: cat as any,
                                                taxRate: cat === 'S' ? 0.15 : 0
                                            });
                                        }}
                                    >
                                        <option value="S">Standard (15%)</option>
                                        <option value="Z">Zero Rated (0%)</option>
                                        <option value="E">Exempt (0%)</option>
                                        <option value="O">Out of Scope</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-900 mb-2">Tax Rate</label>
                                    <input
                                        type="number"
                                        readOnly
                                        disabled
                                        className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
                                        value={currentItem.taxRate}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
                            <button
                                onClick={() => setIsEditing(false)}
                                className="px-6 py-2.5 text-slate-600 font-bold bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isLoading || !currentItem.name || !currentItem.unitPrice}
                                className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 flex items-center disabled:opacity-50"
                            >
                                {isLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : <Save size={18} className="mr-2" />}
                                Save Item
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
