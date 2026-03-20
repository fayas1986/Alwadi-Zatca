
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { Decimal } from '@prisma/client/runtime/library.js';

const router = Router();

// Helper to map DB item to Frontend Item interface
const mapToFrontend = (item: any) => ({
    id: item.id,
    companyId: String(item.company_id),
    sku: item.sku,
    name: item.name,
    description: item.description,
    unitPrice: Number(item.unit_price),
    unitOfMeasure: item.unit_of_measure,
    taxCategory: item.tax_category,
    taxRate: Number(item.tax_rate),
    createdAt: item.created_at,
    updatedAt: item.updated_at
});

// ─── Middleware to check Auth (API Key for ERP or Role for Dashboard) ───
router.use((req: Request, res: Response, next) => {
    const authHeader = req.headers['authorization'] || '';
    const apiKey = authHeader.replace(/^Bearer\s+/i, '');

    // Allow if valid Bearer token OR if dashboard admin headers are present
    const userRole = req.headers['x-user-role'];
    const userEmail = req.headers['x-user-email'];

    console.log(`[DEBUG] Items Auth - API Key: ${apiKey ? 'PRESENT' : 'MISSING'}, Role: ${userRole}, Email: ${userEmail}`);

    if (!apiKey && !userRole && !userEmail) {
        return res.status(401).json({ success: false, error: 'Authorization required' });
    }
    
    // In a real scenario, we'd validate apiKey or session here.
    next();
});

// ─── GET /api/items?companyId=... ────────────────────────────────────────────
/**
 * @swagger
 * /api/items:
 *   get:
 *     summary: List items for a company
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of items
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const { companyId, q } = req.query;
        let where: any = {};

        // Filter by companyId (if provided and not empty)
        if (companyId && companyId !== '' && companyId !== 'undefined') {
            where.company_id = Number(companyId);
        }

        // Search filter
        if (q && typeof q === 'string' && q.trim()) {
            const term = q.toLowerCase();
            where.OR = [
                { name: { contains: term, mode: 'insensitive' } },
                { sku: { contains: term, mode: 'insensitive' } },
                { description: { contains: term, mode: 'insensitive' } }
            ];
        }

        const items = await prisma.item.findMany({
            where,
            orderBy: { created_at: 'desc' }
        });

        // If no items found for this specific company, often we return everything for demo or seeding purposes
        // But for persistence, we'll return what we found.
        res.json(items.map(mapToFrontend));
    } catch (error: any) {
        console.error('List Items Error:', error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// ─── GET /api/items/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const item = await prisma.item.findUnique({
            where: { id: req.params.id as string }
        });
        if (!item) return res.status(404).json({ error: 'Item not found' });
        res.json(mapToFrontend(item));
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch item' });
    }
});

// ─── POST /api/items ───────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
    try {
        const { companyId, sku, name, description, unitPrice, unitOfMeasure, taxCategory, taxRate } = req.body;

        if (!name || unitPrice === undefined) {
            return res.status(400).json({ error: 'name and unitPrice are required' });
        }

        const newItem = await prisma.item.create({
            data: {
                company_id: Number(companyId) || 1, // Defaulting to 1 if not provided
                sku: sku || `ITEM-${Date.now()}`,
                name,
                description: description || '',
                unit_price: new Decimal(unitPrice),
                unit_of_measure: unitOfMeasure || 'each',
                tax_category: taxCategory || 'S',
                tax_rate: taxRate !== undefined ? new Decimal(taxRate) : new Decimal(0.15)
            }
        });

        res.status(201).json(mapToFrontend(newItem));
    } catch (error: any) {
        console.error('Create Item Error:', error);
        res.status(500).json({ error: 'Failed to create item' });
    }
});

// ─── PUT /api/items/:id ───────────────────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { sku, name, description, unitPrice, unitOfMeasure, taxCategory, taxRate } = req.body;
        
        const updateData: any = {};
        if (sku !== undefined) updateData.sku = sku;
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (unitPrice !== undefined) updateData.unit_price = new Decimal(unitPrice);
        if (unitOfMeasure !== undefined) updateData.unit_of_measure = unitOfMeasure;
        if (taxCategory !== undefined) updateData.tax_category = taxCategory;
        if (taxRate !== undefined) updateData.tax_rate = new Decimal(taxRate);

        const updatedItem = await prisma.item.update({
            where: { id: req.params.id as string },
            data: updateData
        });

        res.json(mapToFrontend(updatedItem));
    } catch (error: any) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Item not found' });
        res.status(500).json({ error: 'Failed to update item' });
    }
});

// ─── DELETE /api/items/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        await prisma.item.delete({
            where: { id: req.params.id as string }
        });
        res.json({ success: true, message: 'Item deleted' });
    } catch (error: any) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Item not found' });
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// ─── POST /api/items/bulk ─────────────────────────────────────────────────────
/**
 * @swagger
 * /api/items/bulk:
 *   post:
 *     summary: Bulk create items
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyId: { type: integer }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     sku: { type: string }
 *                     unitPrice: { type: number }
 *                     taxCategory: { type: string }
 *     responses:
 *       200:
 *         description: Bulk upload result
 */
router.post('/bulk', async (req: Request, res: Response) => {
    try {
        const { items, companyId } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items array is required' });
        }

        const company_id = Number(companyId) || 1;

        const data = items.map((item: any) => ({
            company_id,
            sku: item.sku || `ITEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: item.name || 'Unnamed Item',
            description: item.description || '',
            unit_price: new Decimal(item.unitPrice || 0),
            unit_of_measure: item.unitOfMeasure || 'each',
            tax_category: item.taxCategory || 'S',
            tax_rate: item.taxCategory === 'S' ? new Decimal(0.15) : new Decimal(0)
        }));

        const result = await prisma.item.createMany({
            data,
            skipDuplicates: true
        });

        res.json({ count: result.count, success: true });
    } catch (error: any) {
        console.error('Bulk Import Error:', error);
        res.status(500).json({ error: 'Failed to import items' });
    }
});

export default router;
