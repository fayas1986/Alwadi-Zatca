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

export default async (req: any, res: any) => {
  const url = req.url || '';

  // Infrastructure Ping
  if (url === '/api/ping') {
    return res.status(200).json({ 
        status: 'pong', 
        env: !!process.env.DATABASE_URL,
        node: process.version,
        vercel: !!process.env.VERCEL
    });
  }

  // Diagnostic endpoints for debugging Vercel environment
  if (url === '/api/health') {
    try {
        const { default: prisma } = await import('../server/src/lib/prisma.js');
        let dbErr: any = null;
        const dbConnected = await prisma.$queryRaw`SELECT 1`.then(() => true).catch((e: any) => { dbErr = e?.message || String(e); return false; });
        
        return res.status(200).json({
            status: 'ok',
            database: dbConnected ? 'CONNECTED' : 'DISCONNECTED',
            error: dbErr,
            cwd: process.cwd(),
            dir: path.resolve(process.cwd())
        });
    } catch (err: any) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
  }

  // Final App Load
  try {
    // Standardizing on .js extension for ESM resolution on Vercel
    const { default: app } = await import('../server/src/index.js');
    return app(req, res);
  } catch (error: any) {
    console.error("Vercel App Boot Failure:", error);
    return res.status(500).json({
      error: "Vercel Boot Failure",
      message: error.message,
      path: req.url,
      cwd: process.cwd()
    });
  }
};
