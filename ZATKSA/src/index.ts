
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import onboardRoutes from './routes/onboard';
import invoiceRoutes from './routes/invoice'; 
import authRoutes from './routes/auth';
import itemRoutes from './routes/item';
import erpRoutes from './routes/erp';
import { runSync } from './jobs/syncWorker';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); 

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/api/zatca', onboardRoutes);
app.use('/api/zatca/invoice', invoiceRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/erp', erpRoutes);

// Health Check
app.get('/', (req, res) => {
    res.json({ status: 'OK', service: 'ZATKSA Backend', version: '1.0.0' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`ZATCA SDK Path: ${process.env.ZATCA_SDK_PATH}`);
    
    // Start Background Sync (every 5 mins for demo)
    setInterval(runSync, 5 * 60 * 1000);
    runSync(); // Initial run
});
