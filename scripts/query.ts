import { query } from '../src/lib/db';

async function main() {
    const q = process.argv[2];
    if (!q) {
        console.error('No query provided');
        process.exit(1);
    }
    try {
        const rows = await query(q);
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
main();
