import fs from 'fs';
import path from 'path';

const HOSTINGER_VPS_URL = process.env.HOSTINGER_VPS_URL || 'http://200.97.172.222:3001';

export default async (req: any, res: any) => {
  try {
    let url = req.url || '';
    if (!url.startsWith('/api')) {
      url = '/api' + (url.startsWith('/') ? url : '/' + url);
    }

    const targetUrl = `${HOSTINGER_VPS_URL}${url}`;
    
    // Copy incoming headers, filtering out hop-by-hop & Vercel internal headers
    const headers: Record<string, string> = {};
    for (const [key, val] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (
        !lower.startsWith('x-vercel-') &&
        !['host', 'content-length', 'transfer-encoding', 'connection', 'accept-encoding'].includes(lower) &&
        val !== undefined
      ) {
        headers[key] = Array.isArray(val) ? val.join(', ') : (val as string);
      }
    }

    const options: any = {
      method: req.method,
      headers
    };

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (req.body !== undefined && req.body !== null) {
        if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
          options.body = req.body;
        } else {
          options.body = JSON.stringify(req.body);
        }
      }
    }

    const response = await fetch(targetUrl, options);
    const contentType = response.headers.get('content-type');
    const arrayBuffer = await response.arrayBuffer();

    res.status(response.status);
    if (contentType) {
      res.setHeader('content-type', contentType);
    }
    
    return res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error("Vercel Proxy Failure:", error);
    return res.status(502).json({ error: "Bad Gateway - VPS Proxy Failure", message: error.message });
  }
};





