import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || '127.0.0.1',
      port: parseInt(process.env.PGPORT, 10) || 5432,
      database: process.env.PGDATABASE || 'betzite',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD !== undefined ? process.env.PGPASSWORD : '12345678',
    };

export const pool = new Pool({
  ...poolConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});
