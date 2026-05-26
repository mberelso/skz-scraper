import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

// Load env vars for standalone scripts
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.DATABASE_URL;

const pool = connectionString
    ? new Pool({
          connectionString,
          ssl: { rejectUnauthorized: false },
          max: 5,
      })
    : new Pool({
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT || 5432),
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
          ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
          max: 5,
      });

/**
 * Execute a database query with automatic parameter translation (from MariaDB "?" to PostgreSQL "$1, $2, ...").
 */
export async function query(sql: string, params?: any[]): Promise<any> {
    try {
        // Convert placeholders from "?" to "$1", "$2", etc.
        let index = 1;
        let pgSql = sql.replace(/\?/g, () => `$${index++}`);

        const trimmedSql = pgSql.trim().toUpperCase();
        const isInsert = trimmedSql.startsWith('INSERT');
        const isUpdate = trimmedSql.startsWith('UPDATE');
        const isDelete = trimmedSql.startsWith('DELETE');

        // Automatically append RETURNING id for INSERT queries if not already present
        if (isInsert && !pgSql.toUpperCase().includes('RETURNING')) {
            pgSql += ' RETURNING id';
        }

        const res = await pool.query(pgSql, params);

        if (isInsert) {
            const insertId = res.rows[0]?.id || res.rows[0]?.insertid;
            return { insertId: insertId != null ? Number(insertId) : undefined };
        }

        if (isUpdate || isDelete) {
            return { affectedRows: res.rowCount ?? 0 };
        }

        return res.rows;
    } catch (err) {
        console.error('Database query error on SQL:', sql);
        console.error('Error details:', err);
        throw err;
    }
}

export default pool;
