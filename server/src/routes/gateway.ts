import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { SecurityService } from '../services/securityService.js';
import { ResponseHandler } from '../utils/ResponseHandler.js';
import { AuditService } from '../services/auditService.js';
import axios from 'axios';

const router = Router();

/**
 * @swagger
 * /api/gateway/invoices/submit:
 *   post:
 *     summary: Simple ERP Submission (Gateway)
 *     description: Entry point for ERPs that send plain JSON. This layer handles HMAC signing and forwards to the Secure API.
 *     tags: [External Integration]
 *     parameters:
 *       - in: header
 *         name: x-api-key
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Forwarded successfully
 */
router.post('/invoices/submit', async (req: Request, res: Response) => {
    try {
        const apiKey = req.headers['x-api-key'] as string;
        if (!apiKey) {
            return ResponseHandler.unauthorized(res, 'Missing x-api-key');
        }

        // 1. Lookup the secret for this API Key
        const config = await prisma.erp_configuration.findFirst({
            where: { api_key: apiKey, is_active: true }
        });

        if (!config || !config.api_key) {
            return ResponseHandler.unauthorized(res, 'Invalid API Key');
        }

        const secret = config.api_key; // Using api_key as secret for now

        // 2. Prepare HMAC Metadata
        const timestamp = new Date().toISOString();
        const nonce = crypto.randomBytes(16).toString('hex');
        const method = 'POST';
        const targetPath = '/api/erp/invoices/submit'; // The Secure API endpoint

        // 3. Generate Signature
        const signature = SecurityService.generateSignature(
            secret,
            timestamp,
            nonce,
            method,
            targetPath,
            req.body
        );

        // 4. Forward to the Secure API (Internal Request)
        // Note: In production, you might call the service layer directly to avoid overhead,
        // but using a proxy approach as requested by the user.
        const baseUrl = process.env.BACKEND_URL || `http://127.0.0.1:${process.env.PORT || 3001}`;
        

        try {
            const response = await axios.post(`${baseUrl}${targetPath}`, req.body, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'x-signature': signature,
                    'x-timestamp': timestamp,
                    'x-nonce': nonce,
                    'Authorization': `Bearer ${apiKey}` // Compatibility for existing routes
                }
            });

            // If the target API uses ResponseHandler, the real status might be inside data
            const responseData = response.data;
            return res.status(response.status).json(responseData);
        } catch (error: any) {
            console.error('[Gateway] Forwarding Error:', error.response?.data || error.message);
            const status = error.response?.status || 500;
            const data = error.response?.data || { error: 'Forwarding failed' };
            return res.status(status).json(data);
        }

    } catch (error: any) {
        return ResponseHandler.error(res, 'Gateway processing failed');
    }
});

export default router;
