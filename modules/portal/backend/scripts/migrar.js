const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || 'postgres',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'dev_password_123',
});

async function migrar() {
  const sqlPath = path.join(__dirname, '../../../../config/database/init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const cliente = await pool.connect();
  try {
    await cliente.query(sql);
    console.log('Migración completada');
  } finally {
    cliente.release();
    await pool.end();
  }
}

migrar().catch((err) => {
  console.error('Error en migración:', err.message);
  process.exit(1);
});
