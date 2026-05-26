import { query } from '../src/lib/db';

async function main() {
    try {
        const rows = await query('SELECT id, name FROM providers LIMIT 50');
        console.log('Valid Providers:', JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
main();
