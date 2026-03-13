
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { getInvoiceById, submitInvoiceToZatca, generateInvoiceXML } from '../services/mockData';
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle, FileCode, QrCode, ShieldCheck, Info, Loader2, Check, Send, RefreshCw, CheckSquare, Lock, ScanLine, Camera, X, Printer, FileMinus, FilePlus, FileText, Server, PenTool, ChevronUp, ChevronDown, Activity, UserCircle, Scale, Clock, ArrowDown } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { QRCodeCanvas } from 'qrcode.react';
import { Invoice, UserRole, InvoiceHistoryEvent } from '../types';

interface InvoiceDetailProps {
  invoiceId: string | null;
  onBack: () => void;
  userRole: UserRole;
}

// Helper to parse ZATCA TLV Base64
const parseZatcaTLV = (base64: string) => {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    let offset = 0;
    const result: any = {};
    const textDecoder = new TextDecoder('utf-8');

    while (offset < bytes.length) {
      const tag = bytes[offset];
      const len = bytes[offset + 1];
      
      if (offset + 2 + len > bytes.length) break;

      const valBytes = bytes.slice(offset + 2, offset + 2 + len);
      const val = textDecoder.decode(valBytes);

      switch (tag) {
        case 1: result.sellerName = val; break;
        case 2: result.vatNumber = val; break;
        case 3: result.timestamp = val; break;
        case 4: result.total = val; break;
        case 5: result.vatTotal = val; break;
        case 6: result.hash = val; break;
      }
      
      offset += 2 + len;
    }
    return result;
  } catch (e) {
    console.error("Failed to parse ZATCA QR", e);
    return null;
  }
};

export const InvoiceDetail: React.FC<InvoiceDetailProps> = ({ invoiceId, onBack, userRole }) => {
  const [invoice, setInvoice] = useState<Invoice | undefined>(
    invoiceId ? getInvoiceById(invoiceId) : undefined
  );
  
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showValidationDetails, setShowValidationDetails] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const canAction = userRole === 'IT_ADMIN' || userRole === 'FINANCE_ADMIN';

  useEffect(() => {
    if (invoiceId) {
      setInvoice(getInvoiceById(invoiceId));
    }
  }, [invoiceId]);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;

    if (isScanning) {
      setTimeout(() => {
        scanner = new Html5QrcodeScanner(
          "reader",
          { fps: 10, qrbox: { width: 250, height: 250 } },
          false
        );

        scanner.render(
          (decodedText) => {
             handleScanSuccess(decodedText);
             if (scanner) scanner.clear().catch(console.error);
             setIsScanning(false);
          },
          (errorMessage) => {}
        );
      }, 100);
    }

    return () => {
      if (scanner) scanner.clear().catch(console.error);
    };
  }, [isScanning]);

  const handleScanSuccess = (decodedText: string) => {
     const tlvData = parseZatcaTLV(decodedText);
     
     if (tlvData && tlvData.sellerName) {
        if (!invoice) return;
        
        const updatedInvoice = { ...invoice };
        if (tlvData.sellerName) updatedInvoice.supplier.name = tlvData.sellerName;
        if (tlvData.vatNumber) updatedInvoice.supplier.vatNumber = tlvData.vatNumber;
        if (tlvData.timestamp) updatedInvoice.issueDate = tlvData.timestamp;
        if (tlvData.total) updatedInvoice.totalAmount = parseFloat(tlvData.total);
        if (tlvData.vatTotal) updatedInvoice.vatAmount = parseFloat(tlvData.vatTotal);
        
        updatedInvoice.history.push({
            step: 'Validated',
            timestamp: new Date().toISOString(),
            user: 'QR Scanner',
            status: 'Success',
            details: 'Invoice data updated from physical QR scan'
        });

        setInvoice(updatedInvoice);
        alert(`Successfully Scanned!\nUpdated:\nSeller: ${tlvData.sellerName}\nTotal: ${tlvData.total}`);
     } else {
         setScanError("Invalid ZATCA QR Code format. Ensure it is a Base64 TLV code.");
         setTimeout(() => setScanError(null), 3000);
     }
  };

  const displayedXML = useMemo(() => {
    if (!invoice) return '';
    return invoice.xmlContent || generateInvoiceXML(invoice);
  }, [invoice]);

  const riskAssessment = useMemo(() => {
    if (!invoice) return [];
    
    // Logic checks
    const vatRegex = /^3[0-9]{13}3$/;
    const hasVatFormat = vatRegex.test(invoice.supplier.vatNumber);
    
    const addr = invoice.supplier.address;
    const hasNationalAddress = !!(addr.streetName && addr.buildingNumber && addr.cityName && addr.postalZone && addr.citySubdivisionName);
    
    const calcedTotal = invoice.taxExclusiveAmount + invoice.vatAmount;
    const isArithmeticValid = Math.abs(calcedTotal - invoice.totalAmount) < 0.1; // Allow small float margin
    
    const hasHashChain = !!invoice.previousInvoiceHash;

    return [
        { label: "Phase 1: Generation/Storage", status: true }, // Assumed true if record exists
        { label: "VAT Reg. Format (15 digits)", status: hasVatFormat },
        { label: "Phase 2: National Address", status: hasNationalAddress },
        { label: "Tax Arithmetic Integrity", status: isArithmeticValid },
        { label: "Audit Hash Chain", status: hasHashChain }
    ];
  }, [invoice]);
  
  const handleDownloadXML = () => {
    if (!invoice) return;
    const blob = new Blob([displayedXML], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ZATCA_Invoice_${invoice.invoiceNumber}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    setIsGeneratingPdf(true);
    
    // Allow UI to update to show spinner
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const originalElement = document.getElementById('zatca-invoice-paper');
      if (!originalElement) throw new Error('Element not found');
      
      // Clone the element to ensure consistent rendering (A4 desktop view) regardless of current viewport (e.g. mobile)
      const element = originalElement.cloneNode(true) as HTMLElement;
      
      // Apply consistent styling to the clone for capture
      element.style.position = 'absolute';
      element.style.top = '-9999px';
      element.style.left = '-9999px';
      
      if (invoice.invoiceSubtype === 'Standard') {
          // Force A4-like width and padding for Standard invoices
          element.style.width = '1024px'; 
          element.style.padding = '48px'; // p-12 equivalent
      } else {
          // For simplified, we ensure it's not squashed, but it's a receipt roll format
          element.style.width = '400px';
      }
      
      document.body.appendChild(element);

      // 1. Temporarily hide the DOM QR code in the clone for Standard invoices to prevent ghosting
      const qrContainer = element.querySelector('#qr-code-container') as HTMLElement;
      if (qrContainer && invoice.invoiceSubtype === 'Standard') {
          qrContainer.style.opacity = '0';
      }

      // 2. High-quality capture
      const canvas = await html2canvas(element, { 
          scale: 2, 
          useCORS: true, 
          logging: false, 
          backgroundColor: '#ffffff'
      });
      
      // Cleanup clone
      document.body.removeChild(element);

      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = canvas.height * (pdfWidth / canvas.width);
      
      // Add the main document image
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);

      // 4. Explicitly add High-Res QR Code overlay for all Invoices with QR
      if (invoice.qrCode) {
          try {
              // Get the already-rendered QR canvas element from the DOM
              const qrCanvas = document.querySelector('#qr-canvas-export') as HTMLCanvasElement;
              if (qrCanvas) {
                  const base64QR = qrCanvas.toDataURL('image/png');
                  if (invoice.invoiceSubtype === 'Standard') {
                      // Position in top-left corner of A4 Standard invoice
                      pdf.addImage(base64QR, 'PNG', 13, 13, 34, 34);
                  }
                  // For Simplified receipts, the QR is already captured from the html2canvas pass
              }
          } catch (err) {
              console.warn('Failed to overlay crisp QR code, using captured version.', err);
          }
      }

      pdf.save(`ZATCA_Invoice_${invoice.invoiceNumber}.pdf`);
    } catch (error) {
      console.error('PDF Generation failed', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleScanClick = () => {
    setIsScanning(true);
    setScanError(null);
  };

  const handleCloseScanner = () => {
      setIsScanning(false);
      setScanError(null);
  };

  const handleSubmit = async () => {
    if (!invoice) return;
    setIsSubmitting(true);
    try {
        // Backend handles routing to Clear/Report based on invoiceSubtype inside 'reportInvoice' wrapper (which calls api/invoice/report)
        // Or we can explicitly call clearInvoice if we want to be explicit on the client side.
        // For now, let's use the single entry point `submitInvoiceToZatca` which calls `reportInvoice` in `mockData.ts` (which is mock).
        // If we were using real API, we would switch here.
        
        // Let's update `mockData.ts` to actually call our new `api.ts` functions if we want real integration.
        // But for "Mock" mode, we simulate it.
        
        const updatedInvoice = await submitInvoiceToZatca(invoice.id);
        
        // Simulate Clearance vs Reporting response
        if (invoice.invoiceSubtype === 'Standard') {
             // If this was real, we'd check if it was 'Cleared'
             // updatedInvoice.status = 'Cleared'; 
        }

        setInvoice(updatedInvoice);
        setShowValidationDetails(true);
    } catch (error) {
        console.error("Submission failed", error);
        alert("Submission failed. Check network.");
    } finally {
        setIsSubmitting(false);
    }
  };

  const getStepIcon = (step: InvoiceHistoryEvent['step']) => {
    switch (step) {
        case 'Created': return FilePlus;
        case 'Validated': return ShieldCheck;
        case 'Signed': return PenTool;
        case 'Submitted': return Send;
        case 'Cleared': return CheckCircle;
        case 'Reported': return Server;
        case 'Rejected': return XCircle;
        default: return Info;
    }
  };

  // Helper for duration calculation
  const getTimeDiff = (current: string, prev?: string) => {
      if (!prev) return 'Start';
      const diff = new Date(current).getTime() - new Date(prev).getTime();
      
      if (diff < 1000) return '< 1s';
      if (diff < 60000) return `${Math.floor(diff/1000)}s`;
      if (diff < 3600000) return `${Math.floor(diff/60000)}m`;
      return `${Math.floor(diff/3600000)}h`;
  };

  if (!invoice) return <div>Invoice not found</div>;

  const canSubmit = !['Cleared', 'Reported'].includes(invoice.status);
  const isRetry = invoice.status === 'Rejected' || invoice.status === 'Failed';
  const isStandard = invoice.invoiceSubtype === 'Standard';
  const currency = invoice.currencyCode || 'SAR';

  // Helper labels for bilingual display
  const Label = ({ en, ar }: { en: string, ar: string }) => (
      <span className="block">
          <span className="text-slate-500 font-semibold">{en}</span> <span className="text-slate-400 font-normal ml-1">{ar}</span>
      </span>
  );

  // Helper for Receipt Row
  const ReceiptRow = ({ label, value, isBold = false }: any) => (
    <div className={`flex justify-between text-xs py-1 ${isBold ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
        <span>{label}</span>
        <span>{value}</span>
    </div>
  );

  // Helper component for checklist items
  const CheckItem = ({ label, checked, type = 'square' }: { label: string, checked: boolean, type?: 'square' | 'circle' }) => (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group hover:border-indigo-100 transition-colors">
      <span className={`text-sm font-medium ${checked ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
      <div className={checked ? 'text-emerald-500' : 'text-slate-200'}>
        {type === 'square' ? <CheckSquare size={20} /> : <CheckCircle size={20} />}
      </div>
    </div>
  );

  const getDocTitle = () => {
      switch(invoice.documentType) {
          case 'Credit Note': return { en: 'Credit Note', ar: 'إشعار دائن' };
          case 'Debit Note': return { en: 'Debit Note', ar: 'إشعار مدين' };
          default: return { en: 'Tax Invoice', ar: 'فاتورة ضريبية' };
      }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 relative">
      
      {/* Scanner Modal */}
      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 transition-all duration-300">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in duration-300 border border-slate-200">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg flex items-center">
                            <div className="p-2 bg-indigo-50 rounded-lg mr-3 text-indigo-600">
                                <Camera size={20} />
                            </div>
                            Scan ZATCA QR
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 ml-11">Align QR code to auto-fill details</p>
                    </div>
                    <button onClick={handleCloseScanner} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 bg-slate-50/50 flex flex-col items-center">
                    <div className="relative w-full rounded-xl overflow-hidden shadow-inner border border-slate-200 bg-black">
                        <div id="reader" className="w-full h-64"></div>
                    </div>
                    {scanError && (
                        <div className="mt-4 p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-100 w-full flex items-start animate-in slide-in-from-bottom-2">
                            <AlertTriangle size={16} className="mr-2 shrink-0 mt-0.5" />
                            <span>{scanError}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Header Toolbar */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 sticky top-0 z-20 bg-slate-50/80 backdrop-blur-sm py-2">
        <div className="flex-1">
             <button onClick={onBack} className="group flex items-center text-slate-500 hover:text-slate-900 transition-colors bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md">
                <ArrowLeft size={18} className="mr-2 group-hover:-translate-x-1 transition-transform" />
                <span className="font-medium text-sm">Back to List</span>
            </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 justify-end">
           <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
               <button onClick={handleScanClick} disabled={isScanning || isSubmitting} className="flex items-center px-4 py-2 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 rounded-lg transition-colors text-sm font-medium disabled:opacity-50">
                 <ScanLine size={16} className="mr-2" /> Scan QR
               </button>
               <div className="w-px h-6 bg-slate-100 mx-1"></div>
               {canSubmit && canAction ? (
                   <button onClick={handleSubmit} disabled={isSubmitting || isScanning} className={`flex items-center px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-70 ${isRetry ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                     {isSubmitting ? <Loader2 size={16} className="mr-2 animate-spin" /> : (isRetry ? <RefreshCw size={16} className="mr-2" /> : <Send size={16} className="mr-2" />)}
                     {isSubmitting ? 'Processing...' : (isRetry ? 'Resend to ZATCA' : (isStandard ? 'Request Clearance' : 'Issue & Report'))}
                   </button>
               ) : (
                 <div className="flex items-center px-4 py-2 text-slate-400 text-sm cursor-not-allowed">
                     <Lock size={14} className="mr-2" /> {invoice.status === 'Cleared' || invoice.status === 'Reported' ? 'Submission Complete' : 'Read Only'}
                 </div>
               )}
           </div>

           <div className="flex items-center gap-2">
               <button onClick={handleDownloadPDF} disabled={isGeneratingPdf || isScanning} className="p-2.5 bg-white text-slate-600 border border-slate-200 rounded-xl hover:border-slate-300 hover:text-slate-900 shadow-sm transition-all active:scale-95" title="Print / Download PDF">
                 {isGeneratingPdf ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
               </button>
               <button onClick={handleDownloadXML} disabled={isScanning} className="p-2.5 bg-white text-indigo-600 border border-slate-200 rounded-xl hover:border-indigo-200 hover:bg-indigo-50 shadow-sm transition-all active:scale-95" title="Download UBL XML">
                 <FileCode size={18} />
               </button>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Invoice Document Preview */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Main Document Paper Container */}
          {invoice.invoiceSubtype === 'Simplified' ? (
              // ================= SIMPLIFIED RECEIPT LAYOUT (B2C) =================
              <div id="zatca-invoice-paper" className="bg-white mx-auto max-w-[400px] shadow-lg border border-slate-200 p-6 relative text-slate-900 font-mono text-sm leading-relaxed">
                {/* Receipt Header */}
                <div className="text-center mb-6">
                    <h1 className="text-xl font-bold uppercase mb-1">Simplified {getDocTitle().en}</h1>
                    <h2 className="text-lg font-bold font-arabic mb-4">{getDocTitle().ar} مبسطة</h2>
                    <p className="font-bold text-lg">{invoice.supplier.name}</p>
                    <p className="text-xs text-slate-500">{invoice.supplier.address.buildingNumber} {invoice.supplier.address.streetName}, {invoice.supplier.address.cityName}</p>
                    <p className="text-xs text-slate-500 mt-1">VAT: {invoice.supplier.vatNumber}</p>
                </div>

                <div className="border-b-2 border-slate-900 border-dashed my-4"></div>

                {/* Meta Data */}
                <div className="space-y-1 mb-4">
                    <ReceiptRow label="Number / رقم المستند" value={invoice.invoiceNumber} isBold />
                    <ReceiptRow label="Date / التاريخ" value={new Date(invoice.issueDate).toLocaleString()} />
                    {invoice.billingReference && (
                         <div className="mt-2 text-xs bg-slate-100 p-1 rounded text-center">
                             Reference: <span className="font-bold">{invoice.billingReference}</span>
                         </div>
                    )}
                </div>

                <div className="border-b-2 border-slate-900 border-dashed my-4"></div>

                {/* Line Items */}
                <div className="mb-4">
                    <div className="grid grid-cols-12 gap-1 text-[10px] font-bold border-b border-slate-300 pb-2 mb-2 uppercase">
                        <div className="col-span-4">Item/صنف</div>
                        <div className="col-span-2 text-center">Qty/كمية</div>
                        <div className="col-span-3 text-right">Unit/سعر</div>
                        <div className="col-span-3 text-right">Total/المجموع</div>
                    </div>
                    {invoice.items.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-1 text-[10px] py-1 border-b border-dashed border-slate-100 last:border-0">
                            <div className="col-span-4 font-bold truncate">{item.name}</div>
                            <div className="col-span-2 text-center">{item.quantity}</div>
                            <div className="col-span-3 text-right">{Number(item.unitPrice).toFixed(2)}</div>
                            <div className="col-span-3 text-right font-bold">{Number(item.total).toFixed(2)}</div>
                        </div>
                    ))}
                </div>

                <div className="border-b-2 border-slate-900 border-dashed my-4"></div>

                {/* Totals */}
                <div className="space-y-2">
                    <ReceiptRow label="Total Taxable / الخاضع للضريبة" value={invoice.taxExclusiveAmount.toFixed(2)} />
                    <ReceiptRow label="Total VAT (15%) / ضريبة القيمة المضافة" value={invoice.vatAmount.toFixed(2)} />
                    <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t border-slate-900">
                        <span>Total / المجموع</span>
                        <span>{invoice.totalAmount.toFixed(2)}</span>
                    </div>
                </div>

                <div className="border-b-2 border-slate-900 border-dashed my-6"></div>

                {/* QR Code */}
                <div className="flex flex-col items-center mb-6 gap-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scan to Verify / امسح للتحقق</p>
                    {invoice.qrCode ? (
                        <div className="bg-white p-2 border-2 border-slate-200 rounded-lg">
                            <QRCodeCanvas
                                id="qr-canvas-export"
                                value={invoice.qrCode}
                                size={128}
                                level="M"
                                includeMargin={false}
                                style={{ display: 'block' }}
                            />
                        </div>
                    ) : (
                        <div className="w-32 h-32 border-2 border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400 rounded-lg bg-slate-50">
                            <div className="text-center">
                                <QrCode size={24} className="mx-auto mb-1 opacity-30" />
                                <span>No QR</span>
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="text-center text-[10px] text-slate-400">
                     End of Receipt / نهاية الفاتورة
                </div>
            </div>
          ) : (
              // ================= STANDARD A4 LAYOUT (B2B) =================
              <div id="zatca-invoice-paper" className="bg-white rounded-none shadow-lg border border-slate-200 p-8 md:p-12 relative overflow-hidden text-slate-900 font-sans min-h-[800px]">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-100 pb-8 mb-8">
                    <div className="flex items-start gap-6">
                        {/* QR Code Placeholder with ID for Targeting during PDF export */}
                        <div id="qr-code-container" className="w-32 h-32 bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-center shrink-0">
                            {invoice.qrCode ? (
                                <QRCodeCanvas
                                    id="qr-canvas-export"
                                    value={invoice.qrCode}
                                    size={112}
                                    level="M"
                                    includeMargin={false}
                                    style={{ display: 'block', width: '100%', height: '100%' }}
                                />
                            ) : (
                                <div className="text-center text-xs text-slate-300">
                                    <QrCode size={32} className="mx-auto mb-1" />
                                    <span>No QR</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="space-y-1">
                            <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">
                                {getDocTitle().en}
                            </h1>
                            <h2 className="text-xl font-medium text-slate-500 font-arabic text-right w-full block text-left">
                                {getDocTitle().ar}
                            </h2>
                            <div className="pt-2 flex flex-col gap-1">
                                <div className="flex gap-2 text-sm">
                                    <span className="font-bold w-24">Number:</span>
                                    <span className="font-mono">{invoice.invoiceNumber}</span>
                                </div>
                                <div className="flex gap-2 text-sm">
                                    <span className="font-bold w-24">Issue Date:</span>
                                    <span>{new Date(invoice.issueDate).toLocaleString()}</span>
                                </div>
                                {invoice.supplyDate && (
                                    <div className="flex gap-2 text-sm">
                                        <span className="font-bold w-24">Supply Date:</span>
                                        <span>{invoice.supplyDate}</span>
                                    </div>
                                )}
                                {invoice.billingReference && (
                                    <div className="flex gap-2 text-sm bg-slate-50 p-1 rounded">
                                        <span className="font-bold w-24 text-slate-700">Reference:</span>
                                        <span className="font-mono">{invoice.billingReference}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="w-24 h-24 bg-slate-900 rounded-lg flex items-center justify-center text-white mb-4 ml-auto">
                            <span className="font-bold text-xl">LOGO</span>
                        </div>
                        <p className="text-sm font-bold">{invoice.supplier.name}</p>
                        <p className="text-xs text-slate-500">{invoice.supplier.address.citySubdivisionName}, {invoice.supplier.address.cityName}</p>
                        <p className="text-xs text-slate-500">{invoice.supplier.address.countryCode}</p>
                    </div>
                </div>

                {/* Parties */}
                <div className="grid grid-cols-2 gap-8 mb-8">
                    {/* Seller */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-3 flex justify-between">
                            <span>Seller</span> <span>المورد</span>
                        </h3>
                        <div className="space-y-2 text-sm">
                            <div>
                                <Label en="Name" ar="الاسم" />
                                <p className="font-medium">{invoice.supplier.name}</p>
                            </div>
                            <div>
                                <Label en="Address" ar="العنوان" />
                                <p className="text-slate-600">
                                    {invoice.supplier.address.buildingNumber} {invoice.supplier.address.streetName}<br/>
                                    {invoice.supplier.address.citySubdivisionName}, {invoice.supplier.address.cityName} {invoice.supplier.address.postalZone}
                                </p>
                            </div>
                            <div>
                                <Label en="VAT Number" ar="الرقم الضريبي" />
                                <p className="font-mono">{invoice.supplier.vatNumber}</p>
                            </div>
                            {invoice.supplier.crNumber && (
                                <div>
                                    <Label en="CR Number" ar="سجل تجاري" />
                                    <p className="font-mono">{invoice.supplier.crNumber}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Buyer */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-3 flex justify-between">
                            <span>Buyer</span> <span>العميل</span>
                        </h3>
                        <div className="space-y-2 text-sm">
                            <div>
                                <Label en="Name" ar="الاسم" />
                                <p className="font-medium">{invoice.customer.name}</p>
                            </div>
                            <div>
                                <Label en="Address" ar="العنوان" />
                                <p className="text-slate-600">
                                    {invoice.customer.address.buildingNumber} {invoice.customer.address.streetName}<br/>
                                    {invoice.customer.address.cityName} {invoice.customer.address.postalZone} {invoice.customer.address.countryCode}
                                </p>
                            </div>
                            {invoice.customer.vatNumber && (
                                <div>
                                    <Label en="VAT Number" ar="الرقم الضريبي" />
                                    <p className="font-mono">{invoice.customer.vatNumber}</p>
                                </div>
                            )}
                            {invoice.customer.crNumber && (
                                <div>
                                    <Label en="CR Number" ar="سجل تجاري" />
                                    <p className="font-mono">{invoice.customer.crNumber}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Line Items */}
                <div className="mb-8 overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-100 text-slate-700 font-bold">
                            <tr>
                                <th className="p-3 border-b border-slate-200">
                                    <div className="flex flex-col"><span className="text-xs text-slate-500 uppercase">Nature of Goods</span><span>طبيعة السلع</span></div>
                                </th>
                                <th className="p-3 border-b border-slate-200 text-center">
                                    <div className="flex flex-col"><span className="text-xs text-slate-500 uppercase">Qty</span><span>الكمية</span></div>
                                </th>
                                <th className="p-3 border-b border-slate-200 text-right">
                                    <div className="flex flex-col"><span className="text-xs text-slate-500 uppercase">Unit Price</span><span>سعر الوحدة</span></div>
                                </th>
                                {/* Added Tax Category Column */}
                                <th className="p-3 border-b border-slate-200 text-center">
                                    <div className="flex flex-col"><span className="text-xs text-slate-500 uppercase">Tax Cat</span><span>الفئة</span></div>
                                </th>
                                <th className="p-3 border-b border-slate-200 text-right">
                                    <div className="flex flex-col"><span className="text-xs text-slate-500 uppercase">Taxable Amount</span><span>المبلغ الخاضع</span></div>
                                </th>
                                <th className="p-3 border-b border-slate-200 text-right">
                                    <div className="flex flex-col"><span className="text-xs text-slate-500 uppercase">VAT Amount</span><span>الضريبة</span></div>
                                </th>
                                <th className="p-3 border-b border-slate-200 text-right">
                                    <div className="flex flex-col"><span className="text-xs text-slate-500 uppercase">Item Subtotal</span><span>المجموع</span></div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {invoice.items && invoice.items.length > 0 ? (
                                invoice.items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors text-slate-700">
                                    <td className="p-3 font-medium text-slate-900">{item.name}</td>
                                    <td className="p-3 text-center">{item.quantity}</td>
                                    <td className="p-3 text-right">{Number(item.unitPrice).toFixed(2)}</td>
                                    <td className="p-3 text-center">
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                            item.taxCategory === 'Z' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                            item.taxCategory === 'E' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                                            item.taxCategory === 'O' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                            'bg-emerald-50 text-emerald-700 border-emerald-100' // Standard
                                        }`}>
                                            {item.taxCategory || 'S'}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right">{Number(item.subtotal).toFixed(2)}</td>
                                    <td className="p-3 text-right text-slate-500">{Number(item.vatAmount).toFixed(2)}</td>
                                    <td className="p-3 text-right font-bold text-slate-900">{Number(item.total).toFixed(2)}</td>
                                </tr>
                            ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-400">
                                        No items found in this invoice.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Totals */}
                <div className="flex justify-end">
                    <div className="w-1/2 bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
                        <div className="flex justify-between items-center text-sm">
                            <div className="flex flex-col text-slate-600">
                                <span className="font-bold text-xs">Total (Excluding VAT)</span>
                                <span className="text-xs">المجموع (غير شامل الضريبة)</span>
                            </div>
                            <span className="font-mono font-bold">{currency} {invoice.taxExclusiveAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <div className="flex flex-col text-slate-600">
                                <span className="font-bold text-xs">Total VAT (15%)</span>
                                <span className="text-xs">مجموع الضريبة</span>
                            </div>
                            <span className="font-mono font-bold">{currency} {invoice.vatAmount.toFixed(2)}</span>
                        </div>
                        <div className="h-px bg-slate-200 my-2"></div>
                        <div className="flex justify-between items-center text-lg">
                            <div className="flex flex-col text-slate-900">
                                <span className="font-bold text-sm">Total Amount Due</span>
                                <span className="text-xs">المجموع المستحق</span>
                            </div>
                            <span className="font-mono font-bold text-emerald-600">{currency} {invoice.totalAmount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-12 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
                    <p>Generated by ZATCA Connect - Compliant E-Invoicing Solution</p>
                    <p className="mt-1 font-mono">{invoice.uuid}</p>
                </div>
              </div>
          )}

          {/* Validation Report */}
          {invoice.zatcaResponse && (
             <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <button 
                  onClick={() => setShowValidationDetails(!showValidationDetails)}
                  className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition-colors text-left"
                >
                   <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${invoice.zatcaResponse.status === 'PASS' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                        <ShieldCheck size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">Compliance Report</h3>
                        <p className="text-xs text-slate-500">Status: <span className="font-semibold">{invoice.zatcaResponse.status}</span></p>
                      </div>
                   </div>
                   {showValidationDetails ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                </button>
                
                {showValidationDetails && (() => {
                    const resultsObj = invoice.zatcaResponse.validationResults;
                    const resultsArray = Array.isArray(resultsObj) ? resultsObj : [
                        ...((resultsObj as any)?.errorMessages || []),
                        ...((resultsObj as any)?.warningMessages || []),
                        ...((resultsObj as any)?.infoMessages || [])
                    ];

                    return (
                    <div className="border-t border-slate-100 p-6">
                        {(!resultsArray || resultsArray.length === 0) ? (
                            <div className="flex flex-col items-center justify-center py-6 text-center">
                                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                                    <Check size={32} />
                                </div>
                                <h4 className="text-slate-900 font-bold text-lg mb-1">Fully Compliant</h4>
                                <p className="text-sm text-slate-500 max-w-xs">This invoice has passed all ZATCA Phase 2 validation checks.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {resultsArray.map((result: any, idx: number) => {
                                    let bgClass = 'bg-blue-50 border-blue-100';
                                    let iconColor = 'text-blue-500';
                                    let titleColor = 'text-blue-700';
                                    let Icon = Info;

                                    if (result.type === 'ERROR') {
                                        bgClass = 'bg-rose-50 border-rose-100';
                                        iconColor = 'text-rose-500';
                                        titleColor = 'text-rose-700';
                                        Icon = XCircle;
                                    } else if (result.type === 'WARNING') {
                                        bgClass = 'bg-amber-50 border-amber-100';
                                        iconColor = 'text-amber-500';
                                        titleColor = 'text-amber-700';
                                        Icon = AlertTriangle;
                                    }

                                    return (
                                        <div key={idx} className={`flex items-start gap-3 p-4 rounded-xl border ${bgClass}`}>
                                            <div className="mt-0.5">
                                                <Icon size={18} className={iconColor} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-current bg-white/50 ${titleColor}`}>
                                                        {result.type}
                                                    </span>
                                                    <span className={`text-xs font-mono font-bold ${titleColor}`}>{result.code}</span>
                                                </div>
                                                <p className="text-sm text-slate-700 leading-snug">{result.message}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    );
                })()}
             </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Tax & Legal Risk Assessment */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center">
                  <Scale size={18} className="mr-2 text-indigo-600" />
                  Tax & Legal Risk Assessment
              </h3>
              <div className="space-y-3">
                  {riskAssessment.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="text-sm font-medium text-slate-700">{item.label}</span>
                          <div className={item.status ? 'text-emerald-500' : 'text-rose-500'}>
                              {item.status ? <CheckSquare size={20} /> : <XCircle size={20} />} 
                          </div>
                      </div>
                  ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-start gap-2">
                  <Info size={14} className="text-slate-400 mt-0.5" />
                  <p className="text-[10px] text-slate-400 leading-snug">
                      Internal pre-validation checks based on VAT Reg. Art 53
                  </p>
              </div>
          </div>

          {/* Phase 2 Status */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
             <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center">
                <ShieldCheck size={18} className="mr-2 text-emerald-600" />
                Phase 2 Status
             </h3>
             <div className="space-y-2">
                 <div className="flex justify-between items-center text-sm">
                     <span className="text-slate-600">Clearance Status</span>
                     <span className={`px-2 py-0.5 rounded text-xs font-bold ${invoice.status === 'Cleared' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                         {invoice.status}
                     </span>
                 </div>
                 
                 <div className="mt-2 mb-2">
                    <label className="text-xs font-bold text-slate-500 block mb-1">ZATCA Hash (SHA-256)</label>
                    <div className="bg-slate-50 border border-slate-200 rounded p-2 font-mono text-[10px] text-slate-600 break-all select-all">
                        {invoice.invoiceHash || 'Pending generation...'}
                    </div>
                 </div>

                 <div className="h-px bg-slate-100 my-2"></div>
                 <CheckItem type="circle" label="XML Schema" checked={invoice.zatcaResponse?.status === 'PASS'} />
                 <CheckItem type="circle" label="Cryptographic Stamp" checked={!!invoice.signature} />
                 <CheckItem type="circle" label="Previous Hash Chain" checked={!!invoice.previousInvoiceHash} />
             </div>
          </div>

          {/* Invoice Lifecycle (Audit Trail) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-slate-800 flex items-center">
                    <Activity size={16} className="mr-2 text-indigo-600" />
                    Invoice Lifecycle
                </h3>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">
                    Total: {invoice.history && invoice.history.length > 0 ? getTimeDiff(invoice.history[invoice.history.length-1]?.timestamp, invoice.history[0]?.timestamp) : '0s'}
                </span>
             </div>
             
             <div className="relative">
                {(invoice.history || []).map((event, index) => {
                   const Icon = getStepIcon(event.step);
                   const isLast = index === (invoice.history || []).length - 1;
                   const timeDiff = index > 0 ? getTimeDiff(event.timestamp, invoice.history[index-1].timestamp) : null;
                   
                   // Determine styling based on status
                   let statusStyles = {
                       bg: 'bg-slate-50',
                       border: 'border-slate-200',
                       icon: 'text-slate-400',
                       connector: 'bg-slate-100',
                       title: 'text-slate-600'
                   };
                   
                   if (event.status === 'Success') {
                       statusStyles = { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600', connector: 'bg-emerald-100', title: 'text-emerald-900' };
                   } else if (event.status === 'Failure') {
                       statusStyles = { bg: 'bg-rose-50', border: 'border-rose-200', icon: 'text-rose-600', connector: 'bg-rose-100', title: 'text-rose-900' };
                   } else if (event.status === 'Pending') {
                       statusStyles = { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600', connector: 'bg-amber-100', title: 'text-amber-900' };
                   }

                   return (
                     <div key={index} className="relative pl-10 pb-8 last:pb-0 group">
                        {/* Connector Line */}
                        {!isLast && (
                            <div className={`absolute left-[19px] top-10 bottom-0 w-0.5 ${statusStyles.connector}`}></div>
                        )}
                        
                        {/* Duration Indicator on connector */}
                        {timeDiff && (
                            <div className="absolute left-[-10px] -top-3 text-[9px] font-mono text-slate-400 bg-white px-1 border border-slate-100 rounded-full shadow-sm z-20 hidden group-hover:block">
                                {timeDiff}
                            </div>
                        )}
                        
                        {/* Icon Marker */}
                        <div 
                            className={`absolute left-0 top-0 w-10 h-10 rounded-full border-2 flex items-center justify-center shadow-sm z-10 transition-all duration-300 group-hover:scale-105 ${statusStyles.bg} ${statusStyles.border}`}
                        >
                            <Icon size={18} className={statusStyles.icon} />
                        </div>

                        {/* Event Content */}
                        <div className="flex flex-col pt-1">
                           <div className="flex justify-between items-start mb-1">
                               <div>
                                    <span className={`text-sm font-bold block ${statusStyles.title}`}>
                                        {event.step}
                                    </span>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-slate-500 font-medium flex items-center bg-slate-100 px-1.5 py-0.5 rounded-full">
                                            <UserCircle size={10} className="mr-1" /> {event.user}
                                        </span>
                                        {event.status === 'Failure' && (
                                            <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-100">
                                                FAILED
                                            </span>
                                        )}
                                    </div>
                               </div>
                               <div className="text-right">
                                   <div className="flex flex-col items-end">
                                       <span className="text-[10px] text-slate-400 font-mono flex items-center">
                                           <Clock size={8} className="mr-1" />
                                           {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                       </span>
                                       <span className="text-[9px] text-slate-300">
                                           {new Date(event.timestamp).toLocaleDateString()}
                                       </span>
                                   </div>
                               </div>
                           </div>
                           
                           {/* Details Box */}
                           {event.details && (
                               <div className={`mt-2 text-xs p-3 rounded-lg border leading-relaxed ${event.status === 'Failure' ? 'bg-rose-50 border-rose-100 text-rose-800' : 'bg-slate-50 border-slate-100 text-slate-600'} relative`}>
                                   {event.details}
                                   {/* Little arrow for the box */}
                                   <div className={`absolute -top-1.5 left-4 w-2.5 h-2.5 transform rotate-45 border-l border-t bg-inherit ${event.status === 'Failure' ? 'border-rose-100' : 'border-slate-100'}`}></div>
                               </div>
                           )}
                        </div>
                     </div>
                   );
                })}
                
                {/* Pending Step Indicator (Simplified Logic for Demo) */}
                {invoice.status === 'Pending' && (
                    <div className="relative pl-10 pt-2 opacity-50">
                        <div className="absolute left-[19px] -top-4 h-6 w-0.5 border-l-2 border-dashed border-slate-300"></div>
                        <div className="absolute left-0 top-0 w-10 h-10 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center bg-white">
                            <Clock size={18} className="text-slate-300" />
                        </div>
                        <div className="pt-2">
                            <span className="text-sm font-bold text-slate-400">Processing...</span>
                        </div>
                    </div>
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
