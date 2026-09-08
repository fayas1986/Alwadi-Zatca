import fs from 'fs';
import path from 'path';

function listFiles(dir: string, fileList: string[] = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.next') {
        listFiles(filePath, fileList);
      }
    } else {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const HOSTINGER_VPS_URL = 'http://200.97.172.222:3001';

export default async (req: any, res: any) => {
  let url = req.url || '';
  if (!url.startsWith('/api')) {
    url = '/api' + (url.startsWith('/') ? url : '/' + url);
    req.url = url;
  }

  // Determine if this request requires the Java SDK running on Hostinger VPS
  const requiresJavaSdk = url.includes('/api/zatca/onboard') || 
                           url.includes('/api/zatca/invoice/report') || 
                           url.includes('/api/zatca/invoice/clear');

  if (requiresJavaSdk) {
    // Proxy Java SDK requests to active Hostinger VPS backend
    try {
      const targetUrl = `${HOSTINGER_VPS_URL}${url}`;
      const headers: any = { ...req.headers };
      delete headers.host;

      const options: any = {
        method: req.method,
        headers
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, options);
      const contentType = response.headers.get('content-type');
      const data = await response.text();

      res.status(response.status);
      if (contentType) res.setHeader('content-type', contentType);
      return res.send(data);
    } catch (error: any) {
      console.error("Vercel Proxy Failure for Java SDK route:", error);
      return res.status(500).json({ error: "VPS Proxy Failure", message: error.message });
    }
  }

  // For all DB, Admin, and User Management routes, execute Express server app directly on Vercel Serverless (Neon DB)
  try {
    const { default: app } = await import('../server/src/index.js');
    return app(req, res);
  } catch (err: any) {
    console.error("Vercel Express Execution Failure:", err);
    return res.status(500).json({
      error: "Vercel Boot Failure",
      message: err.message,
      path: req.url
    });
  }
};



