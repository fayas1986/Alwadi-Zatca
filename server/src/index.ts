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
import QueueService from './services/queueService.js';
import SyncService from './services/syncService.js';
import reportsRouter from './routes/reports.js';
import prisma from './lib/prisma.js';
import apiV1Router from './routes/api_v1.js';

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

// Initialize Background Queue & Sync (Disabled on Vercel)
if (!process.env.VERCEL) {
    QueueService.resume().then(() => {
        console.log('[Queue] Background queue resumed successfully');
        SyncService.start(); // RE-ENABLED: Pulling pending invoices from ERP
    }).catch(err => {
        console.error('[Queue] Failed to resume background queue:', err);
    });
} else {
    console.log('[Server] Running on Vercel: Background Sync Service is inactive.');
}
// Harden security headers with Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://core.zatca.gov.sa", "https://simulation.zatca.gov.sa", "http://localhost:3001"],
            upgradeInsecureRequests: null,
        },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));


app.use('/api/zatca', zatcaRouter);
app.use('/api/v1', apiV1Router);
app.use('/api/erp', erpRouter);
app.use('/api/admin/reports', reportsRouter);
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
 
// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[GLOBAL ERROR] ${req.method} ${req.originalUrl}`, err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Export app for Vercel serverless functions
export default app;

// Only listen if not running as a serverless function
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(port as number, '0.0.0.0', () => {
        console.log(`ZATCA Backend listening at http://localhost:${port}`);
    });
}