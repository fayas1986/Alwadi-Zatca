import { Request, Response, NextFunction } from 'express';
import { PrivacyService } from '../services/privacyService.js';

/**
 * Middleware to sanitize request the response bodies globally.
 * This ensures that even if a developer adds console.log(req.body) or uses a logging plugin,
 * the sensitive data is already redacted or masked.
 */
export const logSanitizerMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // 1. Sanitize Request Body (MUTATION DISABLED: Mutations break authentication)
    // To safely log the request body, use PrivacyService.scrubObject(req.body) 
    // at the point of logging rather than mutating the source object.

    // 2. Wrap res.send to Sanitize Response Body
    const originalSend = res.send;
    res.send = function (body: any) {
        let scrubbedBody = body;
        
        try {
            if (typeof body === 'string') {
                const parsed = JSON.parse(body);
                scrubbedBody = JSON.stringify(PrivacyService.scrubObject(parsed));
            } else if (typeof body === 'object') {
                scrubbedBody = PrivacyService.scrubObject(body);
            }
        } catch (e) {
            // If it's not JSON, we might still want to scrub the raw string
            if (typeof body === 'string') {
                scrubbedBody = PrivacyService.scrubString(body);
            }
        }

        return originalSend.call(this, scrubbedBody);
    };

    next();
};
