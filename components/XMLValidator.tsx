import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, ShieldCheck } from 'lucide-react';
import { validateZatcaInvoice } from '../services/validation';

export const XMLValidator: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [xmlContent, setXmlContent] = useState<string | null>(null);
    const [validationResult, setValidationResult] = useState<any | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    const processFile = (file: File) => {
        setFile(file);
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            setXmlContent(content);
            validate(content);
        };
        reader.readAsText(file);
    };

    const validate = async (xml: string) => {
        try {
            setValidationResult({ isValid: true, errors: [], warnings: [], loading: true });
            
            const errors: string[] = [];
            const warnings: string[] = [];

            // 1. Client-Side Realtime ZATCA Standardization Checks
            let parsedJson: any = null;
            try { parsedJson = JSON.parse(xml); } catch (e) {}

            if (parsedJson && typeof parsedJson === 'object') {
                const localCheck = validateZatcaInvoice(parsedJson);
                localCheck.validationResults.forEach(r => {
                    if (r.type === 'ERROR') errors.push(`[${r.code}] ${r.message}`);
                    if (r.type === 'WARNING') warnings.push(`[${r.code}] ${r.message}`);
                });
            } else {
                if (xml.includes('SAU')) {
                    errors.push('[BR-KSA-09] Country Code "SAU" is invalid. ZATCA requires 2-character ISO country code "SA".');
                }
                const badDate = xml.match(/\b\d{2}\.\d{2}\.\d{4}\b/);
                if (badDate) {
                    errors.push(`[BR-KSA-F-01] Date format "${badDate[0]}" is invalid. ZATCA requires ISO 8601 format YYYY-MM-DD (e.g. 2026-09-30).`);
                }
            }

            // 2. Server-Side ZATCA Validation SDK Check
            const response = await fetch('/api/zatca/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ xml })
            });

            const result = await response.json();
            
            const serverErrors = result.errors || [];
            const serverWarnings = result.warnings || [];
            const combinedErrors = Array.from(new Set([...errors, ...serverErrors]));
            const combinedWarnings = Array.from(new Set([...warnings, ...serverWarnings]));
            const isValid = combinedErrors.length === 0;

            setValidationResult({
                isValid,
                errors: combinedErrors,
                warnings: combinedWarnings
            });
        } catch (error: any) {
            console.error('Validation Error:', error);
            setValidationResult({
                isValid: false,
                errors: ['Network error while validating invoice payload'],
                warnings: []
            });
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-slate-900">XML Validator</h1>
                <p className="text-slate-500 mt-2">Validate your ZATCA XML invoices against Phase 2 standards</p>
            </div>

            <div 
                className={`border-3 border-dashed rounded-2xl p-12 text-center transition-all ${
                    isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 bg-white'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Upload size={32} className="text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Upload XML File</h3>
                <p className="text-slate-500 mt-2 mb-6">Drag and drop your XML file here, or click to browse</p>
                
                <input 
                    type="file" 
                    accept=".xml,.json,.txt" 
                    onChange={handleFileChange} 
                    className="hidden" 
                    id="xml-upload"
                />
                <label 
                    htmlFor="xml-upload"
                    className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer shadow-lg shadow-indigo-600/20"
                >
                    Select File
                </label>
            </div>

            {file && validationResult && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white rounded-xl border border-slate-200">
                                <FileText size={24} className="text-slate-600" />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900">{file.name}</h4>
                                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(2)} KB</p>
                            </div>
                        </div>
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
                            validationResult.isValid 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : 'bg-rose-50 text-rose-700 border-rose-100'
                        }`}>
                            {validationResult.isValid ? <CheckCircle size={20} /> : <XCircle size={20} />}
                            <span className="font-bold">{validationResult.isValid ? 'Valid XML' : 'Validation Failed'}</span>
                        </div>
                    </div>

                    <div className="p-8">
                        {validationResult.errors.length > 0 && (
                            <div className="mb-8">
                                <h5 className="text-sm font-bold text-rose-700 flex items-center justify-between mb-4">
                                    <span className="flex items-center">
                                        <XCircle size={16} className="mr-2" /> Critical Errors ({validationResult.errors.length})
                                    </span>
                                    <span className="text-xs font-normal text-rose-600 bg-rose-100/60 px-2.5 py-1 rounded-full">
                                        Realtime ZATCA Analysis
                                    </span>
                                </h5>
                                <div className="space-y-3">
                                    {validationResult.errors.map((err: string, i: number) => (
                                        <div key={i} className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-sm text-rose-800 flex items-start leading-relaxed shadow-sm">
                                            <span className="font-mono font-bold mr-3 text-rose-900/60 bg-rose-200/50 px-2 py-0.5 rounded text-xs">
                                                {String(i + 1).padStart(2, '0')}
                                            </span>
                                            <div className="flex-1 font-mono text-xs text-rose-900 break-words">
                                                {err}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {validationResult.isValid && (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <ShieldCheck size={32} className="text-emerald-600" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900">Compliance Check Passed</h3>
                                <p className="text-slate-500 max-w-md mx-auto mt-2">
                                    This XML structure meets the minimum requirements for ZATCA Phase 2.
                                </p>
                            </div>
                        )}

                        <div className="mt-8 pt-8 border-t border-slate-100">
                            <h5 className="text-sm font-bold text-slate-900 mb-4">File Content Preview</h5>
                            <pre className="bg-slate-900 text-slate-300 p-6 rounded-xl overflow-x-auto text-xs font-mono leading-relaxed">
                                {xmlContent?.substring(0, 1000)}...
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
