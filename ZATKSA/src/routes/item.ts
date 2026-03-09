import { Router } from 'express';
import { getPrisma } from '../lib/prisma';

const router = Router();
const prisma = getPrisma();

console.log('Item Router Loaded');

// Get all items for a company
router.get('/', async (req, res) => {
    console.log('GET /api/items hit');
    try {
        const { companyId } = req.query;
        if (!companyId) return res.status(400).json({ error: 'companyId is required' });

        const items = await prisma.item.findMany({
            where: { companyId: String(companyId) },
            orderBy: { createdAt: 'desc' }
        });
        res.json(items);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Bulk create items
router.post('/bulk', async (req, res) => {
    try {
        const { items, companyId } = req.body;
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'Items array is required' });
        }

        const createdItems = await prisma.item.createMany({
            data: items.map((item: any) => ({
                sku: item.sku,
                name: item.name,
                description: item.description,
                unitPrice: Number(item.unitPrice),
                unitOfMeasure: item.unitOfMeasure || 'Each',
                taxCategory: item.taxCategory || 'S',
                taxRate: Number(item.taxRate || 15),
                companyId: companyId
            })),
            skipDuplicates: true
        });

        res.json(createdItems);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create a new item
router.post('/', async (req, res) => {
    try {
        const { sku, name, description, unitPrice, unitOfMeasure, taxCategory, taxRate, companyId } = req.body;
        
        if (!companyId) return res.status(400).json({ error: 'companyId is required' });

        const item = await prisma.item.create({
            data: {
                sku,
                name,
                description,
                unitPrice: Number(unitPrice || 0),
                unitOfMeasure: unitOfMeasure || 'each',
                taxCategory: taxCategory || 'S',
                taxRate: Number(taxRate || 0.15),
                company: { connect: { id: companyId } }
            }
        });
        res.json(item);
    } catch (error: any) {
        console.error('Create Item Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update an item
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { sku, name, description, unitPrice, unitOfMeasure, taxCategory, taxRate } = req.body;

        const item = await prisma.item.update({
            where: { id },
            data: {
                sku,
                name,
                description,
                unitPrice: Number(unitPrice),
                unitOfMeasure,
                taxCategory,
                taxRate: Number(taxRate)
            }
        });
        res.json(item);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete an item
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.item.delete({ where: { id } });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
