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

  // 0. Level 0: File System Discovery
  if (url === '/api/test-ls') {
    try {
      const files = listFiles(process.cwd());
      return res.status(200).json({ 
          cwd: process.cwd(), 
          files: files.map(f => f.replace(process.cwd(), '')) 
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  // 1. Level 1: Infrastructure Ping
  if (url === '/api/ping') {
    return res.status(200).json({ status: 'pong', env: !!process.env.DATABASE_URL });
  }

  // 2. Level 2: Test Prisma Module Load Alone
  if (url === '/api/test-prisma') {
    try {
      // Use explicit .js extension for ESM reliability on Vercel
      const { default: prisma } = await import('../server/src/lib/prisma.js');
      const userCount = await prisma.user.count();
      return res.status(200).json({ status: 'prisma_ok', count: userCount });
    } catch (e: any) {
      return res.status(500).json({ status: 'prisma_fail', error: e.message, stack: e.stack });
    }
  }

  // 3. Level 3: Test SDK Module Load Alone
  if (url === '/api/test-sdk') {
    try {
      const sdk = await import('../server/src/services/sdkService.js');
      return res.status(200).json({ status: 'sdk_ok', functions: Object.keys(sdk) });
    } catch (e: any) {
      return res.status(500).json({ status: 'sdk_fail', error: e.message, stack: e.stack });
    }
  }

  // 4. Level 4: Full App Load
  try {
    const { default: app } = await import('../server/src/index.js');
    return app(req, res);
  } catch (error: any) {
    console.error("Vercel Full App Boot Crash:", error);
    return res.status(500).json({
      error: "Vercel Full App Boot Crash",
      message: error.message,
      stack: error.stack,
      node_version: process.version,
      cwd: process.cwd()
    });
  }
};
