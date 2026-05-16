
import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Starting Deep Schema Audit...');
  
  // Get all models from the schema
  const models = (Prisma as any).dmmf.datamodel.models;
  
  for (const model of models) {
    const tableName = model.dbName || model.name;
    console.log(`Checking table: ${tableName}`);
    
    // Get existing columns in DB
    const dbColumns: any[] = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = '${tableName}'
    `);
    
    const existingCols = dbColumns.map(c => c.column_name);
    console.log(`  Found ${existingCols.length} columns in DB`);
    
    // Compare with fields in schema
    for (const field of model.fields) {
      if (field.kind === 'scalar') {
        const colName = field.dbName || field.name;
        
        if (!existingCols.includes(colName)) {
          console.log(`  [MISSING] Column ${colName} in ${tableName}`);
          
          // Determine SQL type
          let sqlType = 'TEXT';
          if (field.type === 'Int') sqlType = 'INTEGER';
          if (field.type === 'Boolean') sqlType = 'BOOLEAN DEFAULT FALSE';
          if (field.type === 'DateTime') sqlType = 'TIMESTAMP(6)';
          if (field.type === 'Decimal') sqlType = 'DECIMAL(12, 2)';
          if (field.type === 'Json') sqlType = 'JSONB';
          
          console.log(`  [FIXING] Adding ${colName} (${sqlType}) to ${tableName}...`);
          try {
            await prisma.$executeRawUnsafe(`
              ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${colName} ${sqlType}
            `);
            console.log(`  [SUCCESS] Added ${colName}`);
          } catch (err: any) {
            console.error(`  [ERROR] Could not add ${colName}: ${err.message}`);
          }
        }
      }
    }
  }
  
  console.log('--- AUDIT COMPLETE ---');
}

main().catch(console.error).finally(() => prisma.$disconnect());
