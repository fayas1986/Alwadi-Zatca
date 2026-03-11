
import { Router, Request, Response } from 'express';
import crypto from 'crypto';

const router = Router();

// ─── In-Memory Item Store (pre-seeded with realistic ZATCA items) ────────────
// NOTE: This is an in-memory store. Items persist while the server is running.
// To make items truly persistent, add an `item` model to schema.prisma and run
//   `prisma db push` then swap these arrays for Prisma queries.

interface Item {
    id: string;
    companyId: string;
    sku: string;
    name: string;
    description: string;
    unitPrice: number;
    unitOfMeasure: string;
    taxCategory: string;  // S | Z | E | O
    taxRate: number;
    createdAt: string;
    updatedAt: string;
}

const now = () => new Date().toISOString();

// Pre-seeded with 15 realistic Saudi B2B / VAT-compliant items
const itemStore: Item[] = [
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'IT-SVC-001', name: 'IT Consulting Service', description: 'Professional IT consulting and advisory services per hour', unitPrice: 500.00, unitOfMeasure: 'hour', taxCategory: 'S', taxRate: 0.15, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'IT-SVC-002', name: 'Software Development', description: 'Custom software development services — monthly retainer', unitPrice: 15000.00, unitOfMeasure: 'month', taxCategory: 'S', taxRate: 0.15, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'IT-HW-001', name: 'Dell Laptop — XPS 15', description: 'Dell XPS 15 laptop with i7, 32GB RAM, 1TB SSD', unitPrice: 4500.00, unitOfMeasure: 'each', taxCategory: 'S', taxRate: 0.15, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'IT-HW-002', name: 'Cisco Switch 24-Port', description: 'Cisco Catalyst 24-port gigabit managed network switch', unitPrice: 2800.00, unitOfMeasure: 'each', taxCategory: 'S', taxRate: 0.15, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'IT-LIC-001', name: 'Microsoft 365 Business', description: 'Microsoft 365 Business Premium — annual per user licence', unitPrice: 720.00, unitOfMeasure: 'user/year', taxCategory: 'S', taxRate: 0.15, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'IT-LIC-002', name: 'Adobe Creative Cloud', description: 'Adobe Creative Cloud — all apps, annual licence', unitPrice: 3600.00, unitOfMeasure: 'user/year', taxCategory: 'S', taxRate: 0.15, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'MED-001', name: 'Medical Consultation', description: 'General practitioner consultation fee', unitPrice: 200.00, unitOfMeasure: 'session', taxCategory: 'E', taxRate: 0.00, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'EDU-001', name: 'Training Workshop (Half Day)', description: 'Professional skills training workshop — 4 hours', unitPrice: 850.00, unitOfMeasure: 'session', taxCategory: 'E', taxRate: 0.00, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'FIN-001', name: 'Accounting Services', description: 'Monthly bookkeeping and accounting services for SME', unitPrice: 2000.00, unitOfMeasure: 'month', taxCategory: 'S', taxRate: 0.15, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'LOG-001', name: 'Freight — Riyadh–Jeddah', description: 'Standard freight transport Riyadh to Jeddah, up to 1 tonne', unitPrice: 350.00, unitOfMeasure: 'trip', taxCategory: 'S', taxRate: 0.15, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'FAC-001', name: 'Office Cleaning Service', description: 'Commercial office cleaning — daily per 100sqm', unitPrice: 180.00, unitOfMeasure: 'day', taxCategory: 'S', taxRate: 0.15, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'EXP-001', name: 'Exported Software Product', description: 'Subscription software delivered to non-KSA client — zero rated', unitPrice: 1200.00, unitOfMeasure: 'month', taxCategory: 'Z', taxRate: 0.00, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'ZATCA-SVC-001', name: 'ZATCA Compliance Consultancy', description: 'Full ZATCA Phase-2 e-invoicing integration and onboarding support', unitPrice: 8000.00, unitOfMeasure: 'project', taxCategory: 'S', taxRate: 0.15, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'HR-001', name: 'Payroll Processing', description: 'Outsourced monthly payroll processing, up to 50 employees', unitPrice: 1500.00, unitOfMeasure: 'month', taxCategory: 'S', taxRate: 0.15, createdAt: now(), updatedAt: now() },
    { id: crypto.randomUUID(), companyId: 'org-001', sku: 'CLOUD-001', name: 'Cloud Hosting — AWS', description: 'Amazon AWS managed cloud hosting — standard tier per month', unitPrice: 650.00, unitOfMeasure: 'month', taxCategory: 'S', taxRate: 0.15, createdAt: now(), updatedAt: now() },
];

// ─── GET /api/items?companyId=... ────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
    const { companyId, q } = req.query;
    let results = itemStore;

    // Filter by companyId (if provided and not empty)
    if (companyId && companyId !== '' && companyId !== 'undefined') {
        results = results.filter(item => item.companyId === companyId);
        // If no items found for this specific company, return all (for demo)
        if (results.length === 0) {
            results = itemStore;
        }
    }

    // Search filter
    if (q && typeof q === 'string' && q.trim()) {
        const term = q.toLowerCase();
        results = results.filter(item =>
            item.name.toLowerCase().includes(term) ||
            item.sku?.toLowerCase().includes(term) ||
            item.description?.toLowerCase().includes(term)
        );
    }

    res.json(results);
});

// ─── GET /api/items/:id ───────────────────────────────────────────────────────
router.get('/:id', (req: Request, res: Response) => {
    const item = itemStore.find(i => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
});

// ─── POST /api/items ───────────────────────────────────────────────────────────
router.post('/', (req: Request, res: Response) => {
    const { companyId, sku, name, description, unitPrice, unitOfMeasure, taxCategory, taxRate } = req.body;

    if (!name || unitPrice === undefined) {
        return res.status(400).json({ error: 'name and unitPrice are required' });
    }

    const newItem: Item = {
        id: crypto.randomUUID(),
        companyId: companyId || 'org-001',
        sku: sku || `ITEM-${Date.now()}`,
        name,
        description: description || '',
        unitPrice: Number(unitPrice),
        unitOfMeasure: unitOfMeasure || 'each',
        taxCategory: taxCategory || 'S',
        taxRate: taxRate !== undefined ? Number(taxRate) : 0.15,
        createdAt: now(),
        updatedAt: now(),
    };

    itemStore.push(newItem);
    res.status(201).json(newItem);
});

// ─── PUT /api/items/:id ───────────────────────────────────────────────────────
router.put('/:id', (req: Request, res: Response) => {
    const index = itemStore.findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Item not found' });

    itemStore[index] = {
        ...itemStore[index],
        ...req.body,
        id: itemStore[index].id,        // prevent id change
        companyId: itemStore[index].companyId, // prevent company change
        updatedAt: now(),
    };

    res.json(itemStore[index]);
});

// ─── DELETE /api/items/:id ────────────────────────────────────────────────────
router.delete('/:id', (req: Request, res: Response) => {
    const index = itemStore.findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Item not found' });
    itemStore.splice(index, 1);
    res.json({ success: true, message: 'Item deleted' });
});

// ─── POST /api/items/bulk ─────────────────────────────────────────────────────
router.post('/bulk', (req: Request, res: Response) => {
    const { items, companyId } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array is required' });
    }

    const created: Item[] = items.map((item: any) => ({
        id: crypto.randomUUID(),
        companyId: companyId || 'org-001',
        sku: item.sku || `ITEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: item.name || 'Unnamed Item',
        description: item.description || '',
        unitPrice: Number(item.unitPrice) || 0,
        unitOfMeasure: item.unitOfMeasure || 'each',
        taxCategory: item.taxCategory || 'S',
        taxRate: item.taxCategory === 'S' ? 0.15 : 0,
        createdAt: now(),
        updatedAt: now(),
    }));

    itemStore.push(...created);
    res.json({ count: created.length, items: created });
});

export default router;
