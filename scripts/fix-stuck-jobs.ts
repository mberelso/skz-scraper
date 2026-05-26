/**
 * Fix stuck jobs that are still marked as 'running'.
 * This can happen after server crashes or forceful terminations.
 */

import { query } from '../src/lib/db';

async function fixStuckJobs() {
    console.log('=== Fixing Stuck Jobs ===\n');

    try {
        // Mark ALL running jobs as failed (stuck from previous crash)
        const result: any = await query(`
            UPDATE scrape_jobs
            SET status = 'failed',
                log_message = CONCAT(COALESCE(log_message,''), ' | Abgebrochen (stuck)'),
                finished_at = NOW()
            WHERE status = 'running'
        `);

        console.log(`✅ Fixed ${result.affectedRows} stuck job(s)`);

        // Show current running jobs
        const runningJobs: any[] = await query(`
            SELECT id, provider_id, started_at, log_message
            FROM scrape_jobs
            WHERE status = 'running'
        `);

        if (runningJobs.length > 0) {
            console.log(`\n⚠️  Still ${runningJobs.length} job(s) running:`);
            runningJobs.forEach(job => {
                console.log(`  - Job ${job.id} (Provider ${job.provider_id}): ${job.log_message}`);
            });
        } else {
            console.log('\n✅ No running jobs found');
        }

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        process.exit(0);
    }
}

fixStuckJobs();
