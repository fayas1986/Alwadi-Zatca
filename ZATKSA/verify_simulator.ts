import 'dotenv/config';
import axios from 'axios';
import { getPrisma } from './src/lib/prisma';

const prisma = getPrisma();

async function testSimulator() {
    try {
        console.log("Checking DB for a valid API Key...");
        const config = await prisma.eRPConfig.findFirst({
            where: { isActive: true },
            include: { company: true }
        });

        if (!config) {
            console.error("No active ERP Configs found. Run the UI to add one.");
            return;
        }
        
        console.log("Company ID:", config.company.id);
        console.log("Has Private Key:", !!config.company.privateKey);
        console.log("Has CSID:", !!config.company.productionCSID);
        console.log("CSID Sample:", config.company.productionCSID?.substring(0, 30));

        const apiKey = config.apiKey;
        console.log(`Using API Key: ${apiKey}`);

        const payload = {
            "invoiceNumber": `API-INV-${Math.floor(Math.random() * 10000)}`,
            "invoiceSubtype": "Standard",
            "issueDate": new Date().toISOString(),
            "currencyCode": "SAR",
            "totalAmount": 1150.00,
            "taxExclusiveAmount": 1000.00,
            "vatAmount": 150.00,
            "items": [
                {
                    "id": "item-1",
                    "name": "Integration Service Fee",
                    "quantity": 1,
                    "unitPrice": 1000.00,
                    "subtotal": 1000.00,
                    "vatRate": 0.15,
                    "vatAmount": 150.00,
                    "total": 1150.00
                }
            ],
            "customer": {
                "name": "External Client Co",
                "vatNumber": "300011111111113",
                "address": {
                    "streetName": "Digital Way",
                    "buildingNumber": "101",
                    "cityName": "Jeddah",
                    "postalZone": "21111",
                    "countryCode": "SA"
                }
            },
            "supplier": {
                "name": "Tech Solutions Ltd",
                "vatNumber": "300000000000003",
                "address": { "streetName": "Olaya", "buildingNumber": "1234", "cityName": "Riyadh", "postalZone": "12211", "countryCode": "SA" }
            }
        };

        console.log("Sending POST request to /api/erp/invoices/submit...");
        const response = await axios.post('http://localhost:3001/api/erp/invoices/submit', payload, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        console.log("Response Status:", response.status);
        console.log("Response Data:", JSON.stringify(response.data, null, 2));

    } catch (e: any) {
        console.error("Test Failed:");
        if (e.response) {
            console.error(e.response.status, e.response.data);
        } else {
            console.error(e.message);
        }
    } finally {
        process.exit();
    }
}

testSimulator();
