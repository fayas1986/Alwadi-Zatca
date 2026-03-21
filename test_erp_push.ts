import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function testERPPushAPI() {
    console.log("--- Testing External ERP Push API ---");

    const config = await prisma.erp_configuration.findFirst({
        where: { is_active: true }
    });

    if (!config || !config.api_key) {
        console.error("No active ERP configuration found");
        return;
    }

    const invoicePayload = {
        invoiceNumber: `ERP-PUSH-${Date.now()}`,
        invoiceSubtype: 'Simplified',
        issueDate: new Date().toISOString(),
        totalAmount: 1150.00,
        vatAmount: 150.00,
        taxExclusiveAmount: 1000.00,
        currencyCode: 'SAR',
        customer: { name: 'Automated Postman' }
    };

    try {
        const response = await axios.post('http://localhost:3001/api/erp/invoices/submit', invoicePayload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.api_key}`
            }
        });
        fs.writeFileSync('push_res.json', JSON.stringify(response.data, null, 2));
    } catch (e: any) {
        if (e.response) {
            fs.writeFileSync('push_res.json', JSON.stringify(e.response.data, null, 2));
        } else {
            console.error("Failed ERP Push:", e.message);
        }
    } finally {
        await prisma.$disconnect();
    }
}

testERPPushAPI();
