
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function update() {
  const targetId = 'a0358477-9184-41bd-9d37-eb71e0f1ab8b';
  const targetKey = 'sk_live_zatcaconnect_prod_v1';
  
  console.log(`Targeting ERP Config ID: ${targetId}`);
  
  const existing = await (prisma.erp_configuration as any).findUnique({
    where: { id: targetId }
  });

  if (!existing) {
    console.log("ERROR: Target ID not found in the database specified in .env");
    
    // Search by key instead
    const byKey = await (prisma.erp_configuration as any).findFirst({
        where: { api_key: { contains: 'sk_live' } }
    });
    
    if (byKey) {
        console.log(`Found a similar key: ${byKey.api_key} (ID: ${byKey.id})`);
        console.log("Updating this one instead...");
        await (prisma.erp_configuration as any).update({
            where: { id: byKey.id },
            data: { api_key: targetKey }
        });
        console.log("SUCCESS: Key updated.");
    } else {
        console.log("CRITICAL ERROR: No live config found to update.");
    }
    return;
  }

  console.log(`Current key in DB: ${existing.api_key}`);
  
  if (existing.api_key === targetKey) {
    console.log("The key ALREADY matches! No update needed.");
  } else {
    console.log("Updating key to match Postman...");
    await (prisma.erp_configuration as any).update({
      where: { id: targetId },
      data: { api_key: targetKey }
    });
    console.log("SUCCESS: Production key updated to: " + targetKey);
  }
}

update().catch(console.error).finally(() => prisma.$disconnect());
