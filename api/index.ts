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
    
    // Copy incoming headers, avoiding host & content-length mismatch
    const headers: any = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];

    const options: any = {
      method: req.method,
      headers
    };

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body) {
      options.body = typeof req.body === 'string' || Buffer.isBuffer(req.body) 
        ? req.body 
        : JSON.stringify(req.body);
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
    return res.status(500).json({ error: "VPS Proxy Failure", message: error.message });
  }
};




