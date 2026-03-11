
const express = require('express');
const cors = require('cors');

const app = express();
const port = 4000;

app.use(cors());

app.get('/invoices', (req, res) => {
    // Check Auth
    const auth = req.headers.authorization;
    if (auth !== 'Bearer secret-token') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Return dummy invoices
    res.json({
        invoices: [
            {
                invoiceNumber: `ERP-${Math.floor(Math.random() * 10000)}`,
                issueDate: new Date().toISOString(),
                invoiceSubtype: 'Standard',
                totalAmount: 1150.00,
                vatAmount: 150.00,
                customer: {
                    name: 'Mock Customer',
                    vatNumber: '300011111111113',
                    address: {
                        streetName: 'Digital Way',
                        buildingNumber: '101',
                        cityName: 'Jeddah',
                        postalZone: '21111',
                        countryCode: 'SA'
                    }
                },
                items: [
                    {
                        name: 'Integration Service',
                        quantity: 1,
                        unitPrice: 1000.00,
                        subtotal: 1000.00,
                        vatRate: 0.15,
                        vatAmount: 150.00,
                        total: 1150.00
                    }
                ]
            }
        ]
    });
});

app.listen(port, () => {
    console.log(`Mock ERP running at http://localhost:${port}`);
});
