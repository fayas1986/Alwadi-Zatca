import dotenv from 'dotenv';
dotenv.config(); // Load env vars before other imports

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import zatcaRoutes from './routes/zatca.js';
import erpRoutes from './routes/erp.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import itemsRoutes from './routes/items.js';
import { PrismaClient } from '@prisma/client';

const app = express();
import prisma from './lib/prisma.js';
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
// Disable CSP to allow all resources (fonts, styles, etc.) for development
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));


app.use('/api/zatca', zatcaRoutes);
app.use('/api/erp', erpRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/items', itemsRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'ZATCA Fatoora Backend Running' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/api/db-test', async (req, res) => {
    try {
        const count = await prisma.user.count();
        res.json({ status: 'connected', userCount: count });
    } catch (err: any) {
        console.error('DB Test Error:', err);
        res.status(500).json({ 
            error: 'Database connection failed', 
            message: err.message,
            code: err.code,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Export app for Vercel serverless functions
export default app;

// Only listen if not running as a serverless function
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(port, () => {
        console.log(`ZATCA Backend listening at http://localhost:${port}`);
    });
}
