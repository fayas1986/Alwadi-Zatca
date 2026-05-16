
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const apiKey = 'sk_live_zatcaconnect_prod_v1';
  const erp = await (prisma.erp_configuration as any).findFirst({
    where: {
      OR: [
        { api_key: apiKey },
        { api_key: apiKey.trim() }
      ]
    }
  });

  if (!erp) {
    console.log("ERROR: API Key not found in DB!");
    return;
  }

  console.log("DB Record Found:");
  console.log("ID:", erp.id);
  console.log("API Key Length:", erp.api_key.length);
  console.log("API Key Start:", erp.api_key.substring(0, 10));
  console.log("API Key End:", erp.api_key.substring(erp.api_key.length - 10));
  
  // Check for hidden characters
  const buffer = Buffer.from(erp.api_key);
  console.log("Hex Buffer:", buffer.toString('hex'));
}

check().catch(console.error);
