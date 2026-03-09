
import { getPrisma } from '../lib/prisma';
import axios from 'axios';

const prisma = getPrisma();

export interface ERPInvoice {
    invoiceNumber: string;
    issueDate: string;
    totalAmount: number;
    vatAmount: number;
    customerName: string;
    customerVat: string;
    items: any[];
    [key: string]: any;
}

export abstract class ERPConnector {
    abstract fetchPendingInvoices(): Promise<ERPInvoice[]>;
    abstract pushStatus(invoiceNumber: string, status: string, zatcaResponse: any): Promise<void>;
}

export class SAPConnector extends ERPConnector {
    constructor(private config: any) {
        super();
    }

    async fetchPendingInvoices(): Promise<ERPInvoice[]> {
        console.log('Fetching from SAP...');
        // Mock implementation
        return [];
    }

    async pushStatus(invoiceNumber: string, status: string, zatcaResponse: any): Promise<void> {
        console.log(`Pushing status ${status} to SAP for ${invoiceNumber}`);
    }
}

export class OracleConnector extends ERPConnector {
    constructor(private config: any) {
        super();
    }

    async fetchPendingInvoices(): Promise<ERPInvoice[]> {
        console.log('Fetching from Oracle...');
        return [];
    }

    async pushStatus(invoiceNumber: string, status: string, zatcaResponse: any): Promise<void> {
        console.log(`Pushing status ${status} to Oracle for ${invoiceNumber}`);
    }
}

export class MicrosoftConnector extends ERPConnector {
    constructor(private config: any) {
        super();
    }

    async fetchPendingInvoices(): Promise<ERPInvoice[]> {
        console.log('Fetching from Microsoft Dynamics...');
        return [];
    }

    async pushStatus(invoiceNumber: string, status: string, zatcaResponse: any): Promise<void> {
        console.log(`Pushing status ${status} to Microsoft for ${invoiceNumber}`);
    }
}

export class CustomConnector extends ERPConnector {
    constructor(private config: any) {
        super();
    }

    async fetchPendingInvoices(): Promise<ERPInvoice[]> {
        console.log(`Fetching from Custom ERP at ${this.config.baseUrl}...`);
        try {
            const response = await axios.get(`${this.config.baseUrl}/invoices/pending`, {
                headers: { 'X-API-KEY': this.config.apiKey }
            });
            return response.data;
        } catch (e) {
            console.error('Custom ERP fetch failed', e);
            return [];
        }
    }

    async pushStatus(invoiceNumber: string, status: string, zatcaResponse: any): Promise<void> {
        console.log(`Pushing status ${status} to Custom ERP for ${invoiceNumber}`);
        try {
            await axios.post(`${this.config.baseUrl}/invoices/status`, {
                invoiceNumber,
                status,
                zatcaResponse
            }, {
                headers: { 'X-API-KEY': this.config.apiKey }
            });
        } catch (e) {
            console.error('Custom ERP push status failed', e);
        }
    }
}

export const getConnector = (config: any): ERPConnector | null => {
    switch (config.type.toUpperCase()) {
        case 'SAP': return new SAPConnector(config);
        case 'ORACLE': return new OracleConnector(config);
        case 'MICROSOFT': return new MicrosoftConnector(config);
        case 'CUSTOM': return new CustomConnector(config);
        default: return null;
    }
};
