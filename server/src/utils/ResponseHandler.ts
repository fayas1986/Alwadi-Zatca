
import { Response } from 'express';

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    code?: string;
    timestamp: string;
}

export class ResponseHandler {
    /**
     * Send a success response
     */
    static success<T>(res: Response, data?: T, message?: string, status = 200) {
        const response: ApiResponse<T> = {
            success: true,
            data,
            message,
            timestamp: new Date().toISOString()
        };
        return res.status(status).json(response);
    }

    /**
     * Send an error response
     */
    static error(res: Response, error: string, code?: string, status = 500, details?: any) {
        const response: ApiResponse = {
            success: false,
            error,
            code,
            timestamp: new Date().toISOString(),
            ...(details ? { details } : {})
        };
        return res.status(status).json(response);
    }

    /**
     * Send a bad request error
     */
    static badRequest(res: Response, message: string, code = 'BAD_REQUEST') {
        return this.error(res, message, code, 400);
    }

    /**
     * Send an unauthorized error
     */
    static unauthorized(res: Response, message = 'Unauthorized access', code = 'UNAUTHORIZED') {
        return this.error(res, message, code, 401);
    }

    /**
     * Send a forbidden error
     */
    static forbidden(res: Response, message = 'Access denied', code = 'FORBIDDEN') {
        return this.error(res, message, code, 403);
    }

    /**
     * Send a not found error
     */
    static notFound(res: Response, message = 'Resource not found', code = 'NOT_FOUND') {
        return this.error(res, message, code, 404);
    }
}
