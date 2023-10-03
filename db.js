const { Pool } = require('pg');
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: isProduction ? process.env.DATABASE_URL : 'postgresql://postgres:kevinee@localhost:5432/fullness',
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

module.exports = pool;

