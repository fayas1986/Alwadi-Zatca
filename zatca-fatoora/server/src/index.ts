import dotenv from 'dotenv';
dotenv.config(); // Load env vars before other imports

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import zatcaRoutes from './routes/zatca';
import erpRoutes from './routes/erp';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import itemsRoutes from './routes/items';

const app = express();
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

app.listen(port, () => {
    console.log(`ZATCA Backend listening at http://localhost:${port}`);
});
