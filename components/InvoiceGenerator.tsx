
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Save, Send, RefreshCw, Calculator, FileText, User, MapPin, Tag, Box, AlertTriangle, CheckCircle, ArrowRight, Calendar, CreditCard, FileMinus, FilePlus, Search, Link as LinkIcon, Percent, QrCode, X, Users, AlertCircle, MonitorSmartphone } from 'lucide-react';
import { Invoice, InvoiceItem, InvoiceSubtype, Party, DocumentType, Item } from '../types';
import { createInternalInvoice, getInvoiceById, mockInvoices, defaultSupplier } from '../services/mockData';
import { computeSHA256, mockSign, generateZatcaQR } from '../services/crypto';
import { reportInvoice } from '../services/api';
import { getItems } from '../services/itemApi';

// Moved InputField outside to prevent focus loss on re-render
const InputField = ({ label, value, onChange, placeholder, error, required = false, className = '', type = "text", disabled = false }: any) => (
    <div className={className}>
        <label className="block text-sm font-bold text-slate-900 mb-2">
            {label} {required && <span className="text-rose-600">*</span>}
        </label>
        <input
            type={type}
            disabled={disabled}
            className={`w-full px-4 py-3 bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-base shadow-sm text-slate-900 placeholder:text-slate-400 ${error ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 hover:border-slate-300'} ${disabled ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
        />
        {error && <p className="text-sm text-rose-600 mt-2 flex items-center font-medium"><AlertCircle size={14} className="mr-1.5" /> {error}</p>}
    </div>
);

interface InvoiceGeneratorProps {
    onNavigate: (route: string, id?: string) => void;
    referenceInvoiceId?: string | null;
}

export const InvoiceGenerator: React.FC<InvoiceGeneratorProps> = ({ onNavigate, referenceInvoiceId }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [invoiceType, setInvoiceType] = useState<InvoiceSubtype>('Standard');
    const [documentType, setDocumentType] = useState<DocumentType>('Invoice');
    const [referenceId, setReferenceId] = useState('');
    const [instructionNote, setInstructionNote] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Item Master Integration
    const [availableItems, setAvailableItems] = useState<Item[]>([]);
    const [showItemSelector, setShowItemSelector] = useState<{show: boolean, itemId: string}>({ show: false, itemId: '' });
    const [itemSearch, setItemSearch] = useState('');

    // Transaction Details
    const [supplyDate, setSupplyDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMeans, setPaymentMeans] = useState<'10' | '30' | '42' | '48'>('30');
    const [paymentTerms, setPaymentTerms] = useState('');

    // POS Details (Simplified only)
    const [posDetails, setPosDetails] = useState({ terminalId: '', cashierId: '' });

    // Customer State
    const [customer, setCustomer] = useState<Party>({
        name: '',
        vatNumber: '',
        crNumber: '',
        address: {
            streetName: '',
            buildingNumber: '',
            additionalNumber: '',
            citySubdivisionName: '',
            cityName: 'Riyadh',
            postalZone: '',
            countryCode: 'SA'
        }
    });

    // Items State
    const [items, setItems] = useState<InvoiceItem[]>([
        {
            id: '1',
            name: '',
            quantity: 1,
            unitPrice: 0,
            discount: 0,
            vatRate: 0.15,
            vatAmount: 0,
            subtotal: 0,
            total: 0,
            taxCategory: 'S'
        }
    ]);

    // QR Preview State
    const [showQrModal, setShowQrModal] = useState(false);
    const [qrPreviewData, setQrPreviewData] = useState<string>('');

    // Pre-fill if reference ID provided (Simulating creating a note from an existing invoice)
    useEffect(() => {
        if (referenceInvoiceId) {
            const sourceInv = getInvoiceById(referenceInvoiceId);
            if (sourceInv) {
                setReferenceId(sourceInv.invoiceNumber); // Or UUID
                setDocumentType('Credit Note'); // Default to Credit Note when referenced
                setCustomer(sourceInv.customer);
                setInvoiceType(sourceInv.invoiceSubtype);
                setItems(sourceInv.items.map(i => ({ ...i, id: Date.now() + i.id }))); // Clone items
                setInstructionNote("Correction for Invoice " + sourceInv.invoiceNumber);
            }
        }
        
        // Fetch items for selection
        fetchAvailableItems();
    }, [referenceInvoiceId]);

    const fetchAvailableItems = async () => {
        try {
            // Using a fallback or the correct property if available on the supplier
            const companyId = (defaultSupplier as any).organizationId || 'default-org';
            const data = await getItems(companyId);
            setAvailableItems(data);
        } catch (error) {
            console.error('Error fetching items for invoice:', error);
        }
    };

    // Clear errors when switching invoice type
    useEffect(() => {
        setErrors({});
    }, [invoiceType]);

    // Calculated Totals
    const totals = useMemo(() => {
        let subtotal = 0;
        let vat = 0;
        let total = 0;

        items.forEach(item => {
            subtotal += item.subtotal;
            vat += item.vatAmount;
            total += item.total;
        });

        return { subtotal, vat, total };
    }, [items]);

    const handleItemChange = (id: string, field: keyof InvoiceItem, value: any) => {
        setItems(prev => prev.map(item => {
            if (item.id !== id) return item;

            // Ensure numeric fields are stored as numbers to prevent .toFixed errors later
            let safeValue = value;
            if (['quantity', 'unitPrice', 'discount', 'vatRate'].includes(field as string)) {
                safeValue = value === '' ? 0 : Number(value);
            }

            const updates: any = { [field]: safeValue };

            // Auto-update VAT rate based on Tax Category
            if (field === 'taxCategory') {
                if (value === 'S') updates.vatRate = 0.15;
                else updates.vatRate = 0.0;
            }

            // Recalculate line totals
            const qty = field === 'quantity' ? safeValue : item.quantity;
            const price = field === 'unitPrice' ? safeValue : item.unitPrice;
            const discount = field === 'discount' ? safeValue : item.discount;

            // Determine Rate: Use new rate if category changed, otherwise current rate
            let rate = item.vatRate;
            if (field === 'vatRate') rate = safeValue;
            if (field === 'taxCategory') rate = updates.vatRate;

            const lineSubtotal = (qty * price) - discount;
            const lineVat = lineSubtotal * rate;
            const lineTotal = lineSubtotal + lineVat;

            updates.subtotal = lineSubtotal;
            updates.vatAmount = lineVat;
            updates.total = lineTotal;

            return { ...item, ...updates };
        }));
    };

    const addItem = () => {
        const newItem: InvoiceItem = {
            id: Date.now().toString(),
            name: '',
            quantity: 1,
            unitPrice: 0,
            discount: 0,
            vatRate: 0.15,
            vatAmount: 0,
            subtotal: 0,
            total: 0,
            taxCategory: 'S'
        };
        setItems([...items, newItem]);
    };

    const removeItem = (id: string) => {
        if (items.length > 1) {
            setItems(items.filter(i => i.id !== id));
        }
    };

    const loadWalkInCustomer = () => {
        setInvoiceType('Simplified');
        setErrors({});
        setCustomer({
            name: 'Walk-in Customer',
            vatNumber: '',
            crNumber: '',
            address: {
                streetName: 'Retail Counter',
                buildingNumber: '0000',
                additionalNumber: '0000',
                citySubdivisionName: 'District',
                cityName: 'Riyadh',
                postalZone: '00000',
                countryCode: 'SA'
            }
        });
    };

    const loadPosTemplate = () => {
        loadWalkInCustomer();
        setDocumentType('Invoice');
        setPosDetails({ terminalId: 'POS-01', cashierId: 'CASHIER-01' });
        setPaymentMeans('10'); // Cash
        setPaymentTerms('Immediate');
    };

    const handlePreviewQR = async () => {
        const tempInvoice: Invoice = {
            id: 'PREVIEW',
            branchId: 'br-001', // Default to first branch for preview
            uuid: crypto.randomUUID(),
            invoiceNumber: 'PREVIEW-001',
            issueDate: new Date().toISOString(),
            invoiceSubtype: invoiceType,
            documentType: documentType,
            currencyCode: 'SAR',
            supplier: defaultSupplier,
            customer: customer,
            items: items,
            totalAmount: totals.total,
            taxExclusiveAmount: totals.subtotal,
            vatAmount: totals.vat,
            status: 'Pending',
            paymentMeansCode: paymentMeans,
            paymentTerms: paymentTerms,
            posTerminalId: posDetails.terminalId,
            cashierId: posDetails.cashierId,
            history: []
        };

        // Generate with dummy crypto data for preview (Simulating valid cryptographic stamps for visual check)
        const qr = await generateZatcaQR(
            tempInvoice,
            "PREVIEW_HASH_SHA256_BASE64",
            "PREVIEW_ECDSA_SIGNATURE_BASE64",
            "PREVIEW_PUBLIC_KEY_BASE64"
        );

        setQrPreviewData(qr);
        setShowQrModal(true);
    };

    const handleSubmit = async () => {
        const newErrors: Record<string, string> = {};

        // Basic Form Validation
        if (!customer.name) {
            newErrors.name = "Customer Name is required";
        }

        // Standard Invoice (B2B) Validation Rules
        if (invoiceType === 'Standard') {
            if (!customer.vatNumber) {
                newErrors.vatNumber = "VAT Number is required for B2B";
            }

            // ZATCA National Address Validation
            const { streetName, buildingNumber, cityName, citySubdivisionName, postalZone } = customer.address;

            if (!streetName) newErrors.streetName = "Street Name is required";
            if (!buildingNumber) newErrors.buildingNumber = "Building No. is required";
            if (!cityName) newErrors.cityName = "City is required";
            if (!citySubdivisionName) newErrors.citySubdivisionName = "District is required";
            if (!postalZone) newErrors.postalZone = "Postal Code is required";
        }

        if ((documentType === 'Credit Note' || documentType === 'Debit Note') && !referenceId) {
            newErrors.referenceId = "Reference ID is required";
        }

        setErrors(newErrors);

        if (Object.keys(newErrors).length > 0) {
            // Optional: Alert or scroll to top
            return;
        }

        setIsSubmitting(true);

        try {
            const payload: Partial<Invoice> = {
                id: crypto.randomUUID(),
                branchId: 'br-001', // Default to first branch; can be extended with branch selector
                invoiceNumber: `INV-${Date.now()}`,
                issueDate: new Date().toISOString(),
                invoiceSubtype: invoiceType,
                documentType: documentType,
                billingReference: referenceId,
                instructionNote: instructionNote,
                customer: customer,
                supplier: defaultSupplier,
                supplyDate: supplyDate,
                paymentMeansCode: paymentMeans,
                paymentTerms: paymentTerms,
                items: items,
                totalAmount: totals.total,
                taxExclusiveAmount: totals.subtotal,
                vatAmount: totals.vat,
                posTerminalId: invoiceType === 'Simplified' ? posDetails.terminalId : undefined,
                cashierId: invoiceType === 'Simplified' ? posDetails.cashierId : undefined,
                history: [{
                    step: 'Created',
                    timestamp: new Date().toISOString(),
                    user: 'System',
                    status: 'Success',
                    details: 'Invoice generated and prepared for ZATCA'
                }]
            };

            const result = await reportInvoice(payload, defaultSupplier.vatNumber);

            // Generate QR code locally
            const invoiceForQR = { ...payload } as Invoice;
            const xmlContent = JSON.stringify(invoiceForQR); // simplified content for hashing
            const hash = await computeSHA256(xmlContent);
            const signature = await mockSign(hash, 'cert-001');
            const qrCode = await generateZatcaQR(invoiceForQR, hash, signature, 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...');

            // Complete the payload and add it to frontend mock state so InvoiceDetail can load it
            const newInvoice = { 
                ...payload,
                qrCode,
                invoiceHash: hash,
                signature,
                status: (result.reportingStatus === 'REPORTED' || result.clearanceStatus === 'CLEARED') ? 'Reported' : 'Failed',
                zatcaResponse: result
            } as any;
            mockInvoices.unshift(newInvoice);

            // Notify other components (InvoiceList/Dashboard) that mockInvoices changed
            window.dispatchEvent(new CustomEvent('invoices-updated'));

            // Navigate to details to show success/QR
            onNavigate('invoice-detail', newInvoice.id);

        } catch (error: any) {
            console.error(error);
            alert("Failed to generate invoice: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-12">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-tight">New Document</h2>
                    <p className="text-base text-slate-500 mt-2">Real-time ZATCA Phase 2 Generation & Submission</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 self-start md:self-center">
                    <button
                        onClick={loadPosTemplate}
                        className="px-6 py-2.5 text-base font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-2xl transition-all shadow-sm flex items-center justify-center whitespace-nowrap"
                    >
                        <MonitorSmartphone size={18} className="mr-2" /> Create POS Invoice
                    </button>
                    <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                        <button
                            onClick={() => setInvoiceType('Standard')}
                            className={`px-6 py-2.5 text-base font-medium rounded-xl transition-all ${invoiceType === 'Standard' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                        >
                            Standard (B2B)
                        </button>
                        <button
                            onClick={() => setInvoiceType('Simplified')}
                            className={`px-6 py-2.5 text-base font-medium rounded-xl transition-all ${invoiceType === 'Simplified' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                        >
                            Simplified (B2C)
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Form */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Document Type & Reference */}
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                        <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
                            <FileText size={20} className="mr-3 text-indigo-600" /> Document Settings
                        </h3>

                        <div className="flex flex-col sm:flex-row gap-4 mb-8">
                            <button
                                onClick={() => setDocumentType('Invoice')}
                                className={`flex-1 py-4 px-6 rounded-xl border flex items-center justify-center transition-all text-base font-medium ${documentType === 'Invoice' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm ring-1 ring-indigo-200' : 'border-slate-200 hover:bg-slate-50 text-slate-600 hover:border-slate-300'
                                    }`}
                            >
                                <FileText size={20} className="mr-2.5" /> Invoice
                            </button>
                            <button
                                onClick={() => setDocumentType('Credit Note')}
                                className={`flex-1 py-4 px-6 rounded-xl border flex items-center justify-center transition-all text-base font-medium ${documentType === 'Credit Note' ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm ring-1 ring-amber-200' : 'border-slate-200 hover:bg-slate-50 text-slate-600 hover:border-slate-300'
                                    }`}
                            >
                                <FileMinus size={20} className="mr-2.5" /> Credit Note
                            </button>
                            <button
                                onClick={() => setDocumentType('Debit Note')}
                                className={`flex-1 py-4 px-6 rounded-xl border flex items-center justify-center transition-all text-base font-medium ${documentType === 'Debit Note' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm ring-1 ring-emerald-200' : 'border-slate-200 hover:bg-slate-50 text-slate-600 hover:border-slate-300'
                                    }`}
                            >
                                <FilePlus size={20} className="mr-2.5" /> Debit Note
                            </button>
                        </div>

                        {(documentType === 'Credit Note' || documentType === 'Debit Note') && (
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 animate-in slide-in-from-top-2">
                                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center">
                                    <LinkIcon size={16} className="mr-2" /> Reference to Original Invoice
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-900 mb-2">Original Invoice ID / UUID <span className="text-rose-600">*</span></label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                className={`w-full pl-11 pr-4 py-3 bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base font-mono shadow-sm text-slate-900 placeholder:text-slate-500 ${errors.referenceId ? 'border-rose-300' : 'border-slate-200'}`}
                                                placeholder="e.g. INV-2023-001"
                                                value={referenceId}
                                                onChange={(e) => setReferenceId(e.target.value)}
                                            />
                                            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                        </div>
                                        {errors.referenceId && <p className="text-sm text-rose-600 mt-2 font-medium">{errors.referenceId}</p>}
                                    </div>
                                    <InputField
                                        label="Reason for Adjustment"
                                        value={instructionNote}
                                        onChange={(e: any) => setInstructionNote(e.target.value)}
                                        placeholder="e.g. Returned Goods, Correction"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Transaction Details */}
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                        <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
                            <CreditCard size={20} className="mr-3 text-indigo-600" /> Payment & Dates
                        </h3>
                        <div className={`grid grid-cols-1 md:grid-cols-3 gap-6`}>
                            <div>
                                <label className="block text-sm font-bold text-slate-900 mb-2 flex items-center">
                                    <Calendar size={14} className="mr-1.5 text-slate-400" /> Supply Date
                                </label>
                                <input
                                    type="date"
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors text-base shadow-sm text-slate-900"
                                    value={supplyDate}
                                    onChange={(e) => setSupplyDate(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-900 mb-2 flex items-center">
                                    <CreditCard size={14} className="mr-1.5 text-slate-400" /> Payment Means
                                </label>
                                <select
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors text-base shadow-sm text-slate-900"
                                    value={paymentMeans}
                                    onChange={(e) => setPaymentMeans(e.target.value as any)}
                                >
                                    <option value="30">Credit Transfer (30)</option>
                                    <option value="10">Cash (10)</option>
                                    <option value="48">Bank Card (48)</option>
                                    <option value="42">Payment to Bank Acc (42)</option>
                                </select>
                            </div>
                            <InputField
                                label="Payment Terms"
                                value={paymentTerms}
                                onChange={(e: any) => setPaymentTerms(e.target.value)}
                                placeholder="e.g. Net 30 Days"
                            />
                            {invoiceType === 'Simplified' && (
                                <>
                                    <InputField
                                        label="POS Terminal ID"
                                        value={posDetails.terminalId}
                                        onChange={(e: any) => setPosDetails({ ...posDetails, terminalId: e.target.value })}
                                        placeholder="e.g. POS-01"
                                    />
                                    <InputField
                                        label="Cashier ID"
                                        value={posDetails.cashierId}
                                        onChange={(e: any) => setPosDetails({ ...posDetails, cashierId: e.target.value })}
                                        placeholder="e.g. USER-123"
                                    />
                                </>
                            )}
                        </div>
                    </div>

                    {/* Customer Details */}
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center">
                                <User size={20} className="mr-3 text-indigo-600" /> Customer Details
                            </h3>
                            <button
                                onClick={loadWalkInCustomer}
                                className="text-sm font-bold text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-colors border border-indigo-100 flex items-center shadow-sm"
                            >
                                <Users size={16} className="mr-2" /> Load Walk-in
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <InputField
                                className="md:col-span-2"
                                label="Name"
                                required={true}
                                value={customer.name}
                                onChange={(e: any) => setCustomer({ ...customer, name: e.target.value })}
                                placeholder="Customer Name"
                                error={errors.name}
                            />
                            <InputField
                                label="VAT Number"
                                required={invoiceType === 'Standard'}
                                value={customer.vatNumber}
                                onChange={(e: any) => setCustomer({ ...customer, vatNumber: e.target.value })}
                                placeholder="3xxxxxxxxxxxxx3"
                                error={errors.vatNumber}
                            />
                            <InputField
                                label="CR Number"
                                value={customer.crNumber || ''}
                                onChange={(e: any) => setCustomer({ ...customer, crNumber: e.target.value })}
                                placeholder="1010xxxxxx"
                            />
                        </div>

                        <div className="pt-6 border-t border-slate-100">
                            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center">
                                <MapPin size={16} className="mr-2" /> National Address {invoiceType === 'Standard' && '(Mandatory)'}
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                                <InputField
                                    label="Street Name"
                                    required={invoiceType === 'Standard'}
                                    value={customer.address.streetName}
                                    onChange={(e: any) => setCustomer({ ...customer, address: { ...customer.address, streetName: e.target.value } })}
                                    placeholder="Street Name"
                                    error={errors.streetName}
                                />
                                <InputField
                                    label="Building No."
                                    required={invoiceType === 'Standard'}
                                    value={customer.address.buildingNumber}
                                    onChange={(e: any) => setCustomer({ ...customer, address: { ...customer.address, buildingNumber: e.target.value } })}
                                    placeholder="0000"
                                    error={errors.buildingNumber}
                                />
                                <InputField
                                    label="District"
                                    required={invoiceType === 'Standard'}
                                    value={customer.address.citySubdivisionName}
                                    onChange={(e: any) => setCustomer({ ...customer, address: { ...customer.address, citySubdivisionName: e.target.value } })}
                                    placeholder="District Name"
                                    error={errors.citySubdivisionName}
                                />
                                <InputField
                                    label="City"
                                    required={invoiceType === 'Standard'}
                                    value={customer.address.cityName}
                                    onChange={(e: any) => setCustomer({ ...customer, address: { ...customer.address, cityName: e.target.value } })}
                                    placeholder="City"
                                    error={errors.cityName}
                                />
                                <InputField
                                    label="Postal Code"
                                    required={invoiceType === 'Standard'}
                                    value={customer.address.postalZone}
                                    onChange={(e: any) => setCustomer({ ...customer, address: { ...customer.address, postalZone: e.target.value } })}
                                    placeholder="00000"
                                    error={errors.postalZone}
                                />
                                <InputField
                                    label="Add. No (4 Digits)"
                                    value={customer.address.additionalNumber}
                                    onChange={(e: any) => setCustomer({ ...customer, address: { ...customer.address, additionalNumber: e.target.value } })}
                                    placeholder="0000"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Line Items */}
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center">
                                <Box size={20} className="mr-3 text-indigo-600" /> Line Items
                            </h3>
                            <button onClick={addItem} className="text-sm font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors flex items-center border border-indigo-100 shadow-sm">
                                <Plus size={16} className="mr-1.5" /> Add Item
                            </button>
                        </div>

                        {/* Header Row - Hidden on mobile, visible on md+ */}
                        <div className="hidden md:flex items-center gap-4 px-4 py-3 bg-slate-50 rounded-lg border border-slate-100 text-sm font-bold text-slate-600 uppercase tracking-wide mb-4">
                            <div className="w-12 text-center">#</div>
                            <div className="flex-1">Description</div>
                            <div className="w-20 text-right">Qty</div>
                            <div className="w-28 text-right">Price</div>
                            <div className="w-40 text-center">VAT Cat</div>
                            <div className="w-28 text-right">Total</div>
                            <div className="w-10"></div>
                        </div>

                        <div className="space-y-4">
                            {items.map((item, index) => (
                                <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm group hover:border-indigo-300 transition-all">

                                    {/* Index (Desktop) */}
                                    <div className="hidden md:block w-12 text-center text-sm font-bold font-mono text-slate-400 bg-slate-50 rounded-lg py-2">
                                        #{index + 1}
                                    </div>

                                    {/* Mobile Header (Index + Delete) */}
                                    <div className="md:hidden flex justify-between w-full">
                                        <span className="text-sm font-bold font-mono text-slate-400 w-10 flex items-center justify-center h-8 bg-slate-50 rounded-lg">#{index + 1}</span>
                                        <button onClick={() => removeItem(item.id)} className="p-2 text-rose-400 hover:text-rose-500 rounded bg-rose-50">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    {/* Description */}
                                    <div className="w-full md:flex-1 relative">
                                        <label className="md:hidden text-xs font-bold text-slate-500 mb-1 block">Description</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm transition-all text-slate-900 placeholder:text-slate-400"
                                                placeholder="Item Name"
                                                value={item.name}
                                                onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                                            />
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowItemSelector({ show: true, itemId: item.id });
                                                    setItemSearch('');
                                                }}
                                                className="p-2 text-indigo-600 hover:bg-indigo-50 border border-indigo-100 rounded-lg transition-colors shadow-sm"
                                                title="Select from Item Master"
                                            >
                                                <Search size={16} />
                                            </button>
                                        </div>

                                        {/* Item Selector Popup */}
                                        {showItemSelector.show && showItemSelector.itemId === item.id && (
                                            <div className="absolute z-20 top-full left-0 mt-2 w-full min-w-[300px] md:min-w-[400px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
                                                <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                                                    <div className="relative flex-1">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            placeholder="Search items..."
                                                            className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                            value={itemSearch}
                                                            onChange={(e) => setItemSearch(e.target.value)}
                                                        />
                                                    </div>
                                                    <button onClick={() => setShowItemSelector({show: false, itemId: ''})} className="ml-2 p-1 hover:bg-slate-200 rounded-full text-slate-400">
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                                <div className="max-h-60 overflow-y-auto">
                                                    {availableItems
                                                        .filter(ai => ai.name.toLowerCase().includes(itemSearch.toLowerCase()) || (ai.sku && ai.sku.toLowerCase().includes(itemSearch.toLowerCase())))
                                                        .map(ai => (
                                                            <button
                                                                key={ai.id}
                                                                onClick={() => {
                                                                    handleItemChange(item.id, 'name', ai.name);
                                                                    handleItemChange(item.id, 'unitPrice', ai.unitPrice);
                                                                    handleItemChange(item.id, 'taxCategory', ai.taxCategory);
                                                                    setShowItemSelector({show: false, itemId: ''});
                                                                }}
                                                                type="button"
                                                                className="w-full px-4 py-3 text-left hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors flex justify-between items-center group"
                                                            >
                                                                <div>
                                                                    <div className="font-bold text-slate-900 text-sm group-hover:text-indigo-700">{ai.name}</div>
                                                                    <div className="text-xs text-slate-500">{ai.sku || 'No SKU'} • {ai.unitOfMeasure}</div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="font-mono font-bold text-slate-700 text-sm">{ai.unitPrice.toFixed(2)} SAR</div>
                                                                    <div className="text-[10px] font-bold text-indigo-400">VAT {ai.taxCategory === 'S' ? '15%' : '0%'}</div>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    {availableItems.length === 0 && (
                                                        <div className="px-4 py-8 text-center text-slate-400 text-xs italic">
                                                            No items in Master. Go to Item Master to add some.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Inputs Container for Desktop Alignment */}

                                    {/* Qty */}
                                    <div className="w-full md:w-20">
                                        <label className="md:hidden text-xs font-bold text-slate-500 mb-1 block">Qty</label>
                                        <input
                                            type="number"
                                            className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm text-right transition-all text-slate-900"
                                            placeholder="1"
                                            value={item.quantity}
                                            min={1}
                                            onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                                        />
                                    </div>

                                    {/* Price */}
                                    <div className="w-full md:w-28">
                                        <label className="md:hidden text-xs font-bold text-slate-500 mb-1 block">Price</label>
                                        <input
                                            type="number"
                                            className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm text-right transition-all text-slate-900"
                                            placeholder="0.00"
                                            value={item.unitPrice}
                                            onChange={(e) => handleItemChange(item.id, 'unitPrice', e.target.value)}
                                        />
                                    </div>

                                    {/* VAT Category */}
                                    <div className="w-full md:w-40">
                                        <label className="md:hidden text-xs font-bold text-slate-500 mb-1 block">VAT</label>
                                        <select
                                            className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs font-medium text-slate-900 transition-all cursor-pointer"
                                            value={item.taxCategory || 'S'}
                                            onChange={(e) => handleItemChange(item.id, 'taxCategory', e.target.value)}
                                        >
                                            <option value="S">Standard (15%)</option>
                                            <option value="Z">Zero Rated (0%)</option>
                                            <option value="E">Exempt (0%)</option>
                                            <option value="O">Out of Scope</option>
                                        </select>
                                    </div>

                                    {/* Total Display */}
                                    <div className="w-full md:w-28 flex justify-between md:block items-center mt-1 md:mt-0">
                                        <label className="md:hidden text-xs font-bold text-slate-500">Line Total</label>
                                        <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-right font-mono text-slate-800 font-bold">
                                            {Number(item.total).toFixed(2)}
                                        </div>
                                    </div>

                                    {/* Desktop Delete Action */}
                                    <div className="hidden md:flex w-10 justify-end">
                                        <button onClick={() => removeItem(item.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {items.length === 0 && (
                                <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                                    <p className="text-lg">No items added.</p>
                                    <button onClick={addItem} className="mt-2 text-indigo-600 font-bold hover:underline">Click to add your first item</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Summary & Actions */}
                <div className="lg:col-span-1 space-y-8">
                    {/* Summary Card */}
                    <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden ring-1 ring-slate-900/5">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-600 rounded-full blur-[60px] opacity-20 -mr-16 -mt-16"></div>
                        <h3 className="text-lg font-bold text-slate-200 mb-8 flex items-center">
                            <Calculator size={20} className="mr-3 text-indigo-400" /> Financial Summary
                        </h3>

                        <div className="space-y-4 mb-8">
                            <div className="flex justify-between text-base">
                                <span className="text-slate-400 font-medium">Subtotal (Excl. VAT)</span>
                                <span className="font-mono tracking-wide">SAR {totals.subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-base">
                                <span className="text-slate-400 font-medium">Total VAT</span>
                                <span className="font-mono tracking-wide text-indigo-300">SAR {totals.vat.toFixed(2)}</span>
                            </div>
                            <div className="h-px bg-slate-700/50 my-4"></div>
                            <div className="flex justify-between items-end">
                                <span className="font-bold text-xl text-white">Grand Total</span>
                                <span className="font-bold text-3xl text-emerald-400 font-mono tracking-tight leading-none">
                                    SAR {totals.total.toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <button
                                onClick={handlePreviewQR}
                                className="w-full py-3.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold rounded-xl transition-all border border-slate-700 flex items-center justify-center text-base hover:shadow-lg active:scale-[0.98]"
                            >
                                <QrCode size={18} className="mr-2.5" /> Preview QR
                            </button>

                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed text-lg"
                            >
                                {isSubmitting ? (
                                    <>
                                        <RefreshCw size={22} className="mr-3 animate-spin" /> Processing...
                                    </>
                                ) : (
                                    <>
                                        {invoiceType === 'Standard' ? 'Request Clearance' : 'Issue & Report'} <Send size={20} className="ml-3" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Info Card */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center">
                            <AlertCircle size={16} className="mr-2" /> Document Type Info
                        </h3>
                        {documentType === 'Invoice' && (
                            <div className="space-y-3 text-base text-slate-600">
                                <p className="font-semibold text-slate-900">Standard Invoice (Code 388)</p>
                                <p className="text-sm leading-relaxed text-slate-500">Standard document for supply of goods or services. Requires Customer VAT/ID for B2B.</p>
                            </div>
                        )}
                        {documentType === 'Credit Note' && (
                            <div className="space-y-3 text-base text-slate-600">
                                <p className="font-semibold text-slate-900">Credit Note (Code 381)</p>
                                <p className="text-sm leading-relaxed text-slate-500">Used to reduce the amount of a previous invoice. Must reference original invoice.</p>
                            </div>
                        )}
                        {documentType === 'Debit Note' && (
                            <div className="space-y-3 text-base text-slate-600">
                                <p className="font-semibold text-slate-900">Debit Note (Code 383)</p>
                                <p className="text-sm leading-relaxed text-slate-500">Used to increase the amount of a previous invoice. Must reference original invoice.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* QR Preview Modal */}
            {showQrModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-all">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in duration-200 border border-slate-100">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="font-bold text-slate-900 text-lg flex items-center">
                                <QrCode size={20} className="mr-2.5 text-indigo-600" /> ZATCA QR Preview
                            </h3>
                            <button onClick={() => setShowQrModal(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X size={22} />
                            </button>
                        </div>
                        <div className="p-8 flex flex-col items-center">
                            <div className="bg-white p-3 border border-slate-200 rounded-2xl mb-6 shadow-sm">
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPreviewData)}`}
                                    alt="ZATCA QR"
                                    className="w-56 h-56 mix-blend-multiply"
                                />
                            </div>
                            <div className="w-full space-y-3 text-sm">
                                <div className="flex justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-slate-500 font-medium">Seller</span>
                                    <span className="font-bold text-slate-900 truncate max-w-[150px]">{defaultSupplier.name}</span>
                                </div>
                                <div className="flex justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-slate-500 font-medium">VAT Total</span>
                                    <span className="font-mono font-bold text-emerald-600">{totals.vat.toFixed(2)} SAR</span>
                                </div>
                                <div className="flex justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-slate-500 font-medium">Invoice Total</span>
                                    <span className="font-mono font-bold text-emerald-600">{totals.total.toFixed(2)} SAR</span>
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 mt-6 text-center leading-relaxed">
                                Preview generated based on current form data. <br />
                                Cryptographic stamps are simulated.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
