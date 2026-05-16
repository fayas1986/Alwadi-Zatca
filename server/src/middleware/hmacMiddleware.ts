import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { SecurityService } from '../services/securityService.js';
import { ResponseHandler } from '../utils/ResponseHandler.js';

// Simple in-memory nonce cache to prevent replay attacks
// For production, use Redis or a Database table with TTL
const nonceCache = new Set<string>();

/**
 * Middleware to verify HMAC signatures for incoming requests.
 * Expects headers:
 * - x-api-key: Identification of the ERP/Client
 * - x-signature: The HMAC signature
 * - x-timestamp: ISO 8601 or Unix timestamp
 * - x-nonce: Unique random string for the request
 */
export const hmacMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const apiKey = req.headers['x-api-key'] as string;
        const signature = req.headers['x-signature'] as string;
        const timestamp = req.headers['x-timestamp'] as string;
        const nonce = req.headers['x-nonce'] as string;

        if (!apiKey || !signature || !timestamp || !nonce) {
            return ResponseHandler.unauthorized(res, 'Missing required security headers (x-api-key, x-signature, x-timestamp, x-nonce)');
        }

        // 1. Timestamp Validation (Prevent Replay Attacks outside of 5-minute window)
        const requestTime = new Date(timestamp).getTime();
        const now = Date.now();
        const drift = Math.abs(now - requestTime);
        
        if (isNaN(requestTime) || drift > 5 * 60 * 1000) { // 5 minutes tolerance
            return ResponseHandler.unauthorized(res, 'Request timestamp is invalid or too old');
        }

        // 2. Nonce Validation (Prevent Replay Attacks)
        const nonceKey = `${apiKey}:${nonce}`;
        if (nonceCache.has(nonceKey)) {
            return ResponseHandler.unauthorized(res, 'Duplicate request detected (nonce reuse)');
        }
        nonceCache.add(nonceKey);
        // Clear nonce from memory after 10 minutes (twice the drift window)
        setTimeout(() => nonceCache.delete(nonceKey), 10 * 60 * 1000);

        // 3. Secret Lookup
        const config = await prisma.erp_configuration.findFirst({
            where: { api_key: apiKey, is_active: true }
        });

        if (!config || !config.api_key) {
            return ResponseHandler.unauthorized(res, 'Invalid API Key');
        }

        // Use api_key as secret for now, or use a dedicated secret field if available
        // In a real SaaS, you'd have an api_secret field distinct from api_key
        const secret = config.api_key; 

        // 4. Signature Verification
        const expectedSignature = SecurityService.generateSignature(
            apiKey,
            timestamp,
            nonce,
            req.method,
            req.originalUrl.split('?')[0],
            req.body
        );

        if (signature !== expectedSignature) {
            return ResponseHandler.unauthorized(res, 'Invalid signature');
        }

        // Attach config to request for later use
        (req as any).erpConfig = config;
        
        next();
    } catch (error: any) {
        return ResponseHandler.error(res, 'Security verification failed');
    }
};
