import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDb() {
    console.log('Initializing database...');
    const connectionString = process.env.DATABASE_URL;

    if (connectionString) {
        console.log('Connecting using DATABASE_URL...');
    } else {
        console.log(`Host: ${process.env.DB_HOST}`);
        console.log(`Database: ${process.env.DB_NAME}`);
    }

    const client = connectionString
        ? new Client({
              connectionString,
              ssl: { rejectUnauthorized: false },
          })
        : new Client({
              host: process.env.DB_HOST,
              port: Number(process.env.DB_PORT || 5432),
              user: process.env.DB_USER,
              password: process.env.DB_PASSWORD,
              database: process.env.DB_NAME,
              ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
          });

    try {
        await client.connect();
        console.log('Connected to database.');

        const schemaPath = path.join(__dirname, '../schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        console.log('Executing schema.sql...');
        await client.query(schemaSql);

        console.log('Database initialized successfully!');
    } catch (err) {
        console.error('Error initializing database:', err);
    } finally {
        await client.end();
    }
}

initDb();
