
const { Pool } = require('pg');
require('dotenv').config();

async function testQuery() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    const res = await pool.query('SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\'');
    console.log('Tables found:', res.rows.map(r => r.table_name));

    const companies = await pool.query('SELECT id FROM "Company" LIMIT 5');
    console.log('Companies found:', companies.rows);

    const items = await pool.query('SELECT id FROM "Item" LIMIT 5');
    console.log('Items found:', items.rows);
  } catch (err) {
    console.error('Database error:', err.message);
  } finally {
    await pool.end();
  }
}

testQuery();
