
export type InvoiceStatus = 'Cleared' | 'Reported' | 'Rejected' | 'Pending' | 'Failed' | 'Pending Sync';

// RBAC Roles
export type UserRole = 'IT_ADMIN' | 'FINANCE_ADMIN' | 'TAX_OFFICER' | 'SUPER_ADMIN';

export type InvoiceSubtype = 'STANDARD' | 'SIMPLIFIED' | 'Standard' | 'Simplified';
export type DocumentType = 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'Invoice' | 'Credit Note' | 'Debit Note';

export interface Address {
  streetName: string;
  buildingNumber: string;
  additionalNumber?: string; // Critical for ZATCA Phase 2 (National Address)
  citySubdivisionName: string; // District
  cityName: string;
  postalZone: string;
  countryCode: string;
}

export interface Organization {
  id: string;
  name: string;
  vatNumber: string;
  crNumber: string;
  logoUrl?: string;
  branches: Branch[];
}

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  type: 'HQ' | 'Branch' | 'Store' | 'Warehouse';
  address: Address;
}

export interface Party {
  name: string;
  registrationName?: string; // cac:PartyLegalEntity/cbc:RegistrationName
  vatNumber: string; // BT-31
  crNumber?: string;  // Commercial Registration
  address: Address;
  taxScheme?: 'VAT'; // Default to VAT
}

export interface InvoiceItem {
  id: string;
  name: string;
  nameAr?: string;   // Added for Arabic Support
  description?: string; // Added for detailed description
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
  taxRate?: number; // Alias for vatRate to support external ERP mappings
  vatAmount: number;
  subtotal: number; // Excluding VAT
  total: number;    // Including VAT
  taxCategory?: 'S' | 'Z' | 'E' | 'O' | 'G' | 'H'; // ZATCA Tax Category Code
  taxCategoryCode?: string; // String alias to support incoming raw data
  allowanceAmount?: number; // Added for ZATCA line-level discounts
  chargeAmount?: number;    // Added for ZATCA line-level charges
}

export interface InvoiceHistoryEvent {
  step: 'Created' | 'Validated' | 'Signed' | 'Submitted' | 'Cleared' | 'Reported' | 'Rejected' | 'Queued' | 'Synced';
  timestamp: string;
  user: string;
  details?: string;
  status: 'Success' | 'Failure' | 'Pending' | 'Offline';
}

export interface Invoice {
  id: string;
  branchId: string; // Link to specific branch
  uuid: string;
  invoiceNumber: string;
  issueDate: string; // ISO String (Creation Date)
  supplyDate?: string; // ZATCA: Tax Point Date / Actual Delivery Date
  invoiceSubtype: InvoiceSubtype; // Critical for Phase 2 distinction
  documentType: DocumentType; // New: Invoice, Credit Note, or Debit Note
  
  // Credit/Debit Note Specifics
  billingReference?: {
    id: string;      // Original Invoice Number
    uuid?: string;   // Original Invoice UUID
    issueDate?: string;
  };
  instructionNote?: string; // Reason for Credit/Debit Note
  reasonCode?: string;      // ZATCA reason code (optional, mapped to Note)

  posTerminalId?: string;
  cashierId?: string;
  
  // ZATCA Payment Means (UN/ECE 4461)
  paymentMeansCode?: '10' | '30' | '42' | '48'; // Cash, Credit Transfer, Bank Account, Card
  paymentTerms?: string; // Textual description
  
  paymentMethod?: 'Cash' | 'Credit Card' | 'Debit Card' | 'Transfer' | 'Other'; // Legacy UI field, mapped to code above
  source?: 'ERP' | 'POS' | 'Portal';
  
  currency?: string;     // Alias for currencyCode
  currencyCode: string; // Added to support "Currency" requirement

  // Parties
  supplier: Party;
  customer: Party;

  // Totals
  lineExtensionAmount?: number; // Sum of line net amounts
  taxExclusiveAmount: number;   // Total net amount
  taxInclusiveAmount?: number;  // Total gross amount (totalAmount)
  totalAmount: number;          // TaxInclusiveAmount
  payableAmount?: number;       // Final amount to pay
  vatAmount: number;
  vatRate?: number; // Added for document-wide rate
  taxCategory?: 'S' | 'Z' | 'E' | 'O' | 'G' | 'H'; // Added for document-wide category
  allowanceTotalAmount?: number; // Global allowance
  chargeTotalAmount?: number;    // Global charge
  prepaidAmount?: number;        // Prepaid amount
  
  items: InvoiceItem[];
  metadata?: {
    items?: InvoiceItem[];
    erp_raw?: any;
  };

  status: InvoiceStatus;
  xmlContent?: string;
  qrCode?: string; // Base64 TLV
  
  // ZATCA specific
  invoiceHash?: string; // SHA-256 Base64
  previousInvoiceHash?: string;
  signature?: string; // Base64 ECDSA Signature
  signingCertificateId?: string; // Reference to the certificate used

  zatcaResponse?: {
    status: string;
    clearanceStatus?: string;
    reportingStatus?: string;
    clearanceId?: string; // Unique ID assigned by ZATCA upon clearance
    validationResults?: Array<{
      type: 'INFO' | 'WARNING' | 'ERROR';
      code: string;
      message: string;
    }>;
  };

  history: InvoiceHistoryEvent[];
}

export interface Certificate {
  id: string;
  branchId?: string; // Certificates are usually device/branch specific
  commonName: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  status: 'Active' | 'Expired' | 'Revoked';
  type: 'Production' | 'Simulation' | 'Sandbox' | 'Developer';
  publicKey?: string; // Base64 public key
  hasPrivateKey: boolean; // Tracking if we have the key for signing
}

export interface ERPSystem {
  id: string;
  name: string;
  vendor: 'SAP' | 'Oracle' | 'Microsoft' | 'Salesforce' | 'Custom' | 'POS';
  environment: 'Production' | 'Sandbox';
  apiKey: string; // Stored masked or full for demo
  status: 'Connected' | 'Disconnected' | 'Maintenance';
  lastSync: string;
  linkedCertificateId?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  category: 'Security' | 'Operational' | 'Compliance' | 'System';
  user: string;
  role: string;
  ipAddress: string;
  details: string;
  status: 'Success' | 'Failure' | 'Warning';
  resourceId?: string;
  metadata?: Record<string, any>; // For technical details
  hash: string; // SHA-256 of the log entry
}

export interface KPIMetric {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
}
