
export interface KBArticle {
    id: string;
    title: string;
    snippet: string;
    url: string;
    category: 'Regulation' | 'Technical' | 'Error Code';
    tags: string[];
  }
  
  export const zatcaKnowledgeBase: KBArticle[] = [
    {
      id: 'kb-001',
      title: 'VAT Rates & Exemptions',
      snippet: 'The standard VAT rate in KSA is 15%. Zero-rated supplies include exports, international transport, and certain medicines.',
      url: 'https://zatca.gov.sa/en/RulesRegulations/Taxes/Pages/VAT.aspx',
      category: 'Regulation',
      tags: ['vat', 'rate', 'tax', '15%', 'exemptions']
    },
    {
      id: 'kb-002',
      title: 'Invoice Types (Standard vs Simplified)',
      snippet: 'Standard Tax Invoices are for B2B transactions. Simplified Tax Invoices are for B2C. Phase 2 requires specific XML structures for each.',
      url: 'https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/default.aspx',
      category: 'Technical',
      tags: ['invoice type', 'standard', 'simplified', 'b2b', 'b2c']
    },
    {
      id: 'kb-003',
      title: 'Cryptographic Stamp & Hash',
      snippet: 'Phase 2 requires a SHA-256 hash of the previous invoice and a ECDSA signature using the CSID.',
      url: 'https://zatca.gov.sa/en/E-Invoicing/Systems/Pages/Integration_Phase.aspx',
      category: 'Technical',
      tags: ['crypto', 'hash', 'security', 'signature', 'phase 2']
    },
    {
      id: 'kb-004',
      title: 'BR-KSA-31: VAT Number Validation',
      snippet: 'Error BR-KSA-31 occurs if the VAT number is not 15 digits or does not start/end with 3.',
      url: 'https://zatca.gov.sa/en/Help/Pages/FAQs.aspx',
      category: 'Error Code',
      tags: ['error', 'br-ksa-31', 'vat number', 'validation']
    },
    {
      id: 'kb-005',
      title: 'Fatoora Portal Onboarding',
      snippet: 'Steps to onboard EGSC and generate CSID via the Fatoora Portal for Simulation and Production environments.',
      url: 'https://fatoora.zatca.gov.sa/',
      category: 'Technical',
      tags: ['onboarding', 'csid', 'fatoora', 'portal']
    },
    {
      id: 'kb-006',
      title: 'Article 53: Invoice Requirements',
      snippet: 'Legal requirements for invoice content including date, sequential number, supplier/customer details, and VAT breakdown.',
      url: 'https://zatca.gov.sa/en/RulesRegulations/Taxes/Documents/VAT_Implementing_Regulations_English.pdf',
      category: 'Regulation',
      tags: ['article 53', 'requirements', 'legal', 'content']
    },
    {
      id: 'kb-007',
      title: 'XML Implementation Standards',
      snippet: 'UBL 2.1 mapping for ZATCA e-invoicing. Detailed field specifications for XML generation.',
      url: 'https://zatca.gov.sa/en/E-Invoicing/Systems/Documents/Electronic_Invoice_XML_Implementation_Standard_v1.0.pdf',
      category: 'Technical',
      tags: ['xml', 'ubl', 'standard', 'mapping']
    },
    {
      id: 'kb-008',
      title: 'BR-KSA-03: Address Completeness',
      snippet: 'Error occurs if Building Number, Street Name, City, or Postal Code is missing from the supplier address.',
      url: 'https://zatca.gov.sa/en/E-Invoicing/Systems/Pages/Troubleshooting.aspx',
      category: 'Error Code',
      tags: ['error', 'address', 'br-ksa-03', 'building number']
    },
    {
      id: 'kb-009',
      title: 'E-Invoice Issuance Process',
      snippet: 'Overview of the issuance process: Generation, Validation, Stamping with CSID, and QR Code Inclusion.',
      url: 'https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx',
      category: 'Technical',
      tags: ['issuance', 'process', 'generation', 'validation', 'csid', 'qr code']
    }
  ];
  
  export const searchKnowledgeBase = (query: string): KBArticle[] => {
    if (!query || query.length < 2) return [];
    
    const lowerQuery = query.toLowerCase();
    return zatcaKnowledgeBase.filter(article => 
      article.title.toLowerCase().includes(lowerQuery) || 
      article.snippet.toLowerCase().includes(lowerQuery) ||
      article.tags.some(tag => tag.includes(lowerQuery)) ||
      article.category.toLowerCase().includes(lowerQuery)
    );
  };
