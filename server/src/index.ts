import './lib/env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import zatcaRouter from './routes/zatca.js';
import erpRouter from './routes/erp.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import itemsRouter from './routes/items.js';
import auditRouter from './routes/audit.js';
import prisma from './lib/prisma.js';

import { swaggerSpec } from './utils/swagger.js';

const app = express();

// Serve the Swagger JSON
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
// Disable CSP to allow all resources (fonts, styles, etc.) for development
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));


app.use('/api/zatca', zatcaRouter);
app.use('/api/erp', erpRouter);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/items', itemsRouter);
app.use('/api/audit-logs', auditRouter);

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