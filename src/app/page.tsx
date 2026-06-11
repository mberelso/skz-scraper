import { query } from '@/lib/db';
import DashboardClient from '@/components/DashboardClient';

// Disable caching for dashboard to see real-time status
export const dynamic = 'force-dynamic';

async function getDashboardData() {
    // Complex query to get providers + their latest job status + latest energy mix data
    const providerSql = `
    SELECT DISTINCT
        p.id,
        p.name,
        p.url,
        p.skz_url,
        p.address,
        p.zip,
        p.city,
        p.file_number,
        p.priority,
        p.review_status,
        p.active,
        p.created_at,
        p.updated_at,
        (SELECT status FROM scrape_jobs WHERE provider_id = p.id ORDER BY id DESC LIMIT 1) as latest_job_status,
        (SELECT finished_at FROM scrape_jobs WHERE provider_id = p.id ORDER BY id DESC LIMIT 1) as latest_job_date,
        (SELECT log_message FROM scrape_jobs WHERE provider_id = p.id ORDER BY id DESC LIMIT 1) as latest_job_log,
        EXISTS (
            SELECT 1 FROM energy_mix em
            WHERE em.provider_id = p.id AND em.source_status = 'unbestaetigt'
        ) as has_unverified_source,
        EXISTS (
            SELECT 1 FROM documents d
            JOIN documents d2 ON d2.file_hash = d.file_hash AND d2.provider_id != d.provider_id
            WHERE d.provider_id = p.id AND d.file_type != 'manual' AND d.file_hash IS NOT NULL
        ) as has_duplicate_doc,
        (SELECT COUNT(*) FROM documents WHERE provider_id = p.id) as document_count,
        (SELECT year FROM energy_mix em
         WHERE em.provider_id = p.id
         ORDER BY em.id DESC LIMIT 1) as last_mix_year,
        (SELECT renewable_percentage FROM energy_mix em
         WHERE em.provider_id = p.id
         ORDER BY em.id DESC LIMIT 1) as last_renewable_percentage,
        (SELECT fossil_percentage FROM energy_mix em
         WHERE em.provider_id = p.id
         ORDER BY em.id DESC LIMIT 1) as last_fossil_percentage,
        (SELECT nuclear_percentage FROM energy_mix em
         WHERE em.provider_id = p.id
         ORDER BY em.id DESC LIMIT 1) as last_nuclear_percentage,
        (SELECT co2_emission_g_kwh FROM energy_mix em
         WHERE em.provider_id = p.id
         ORDER BY em.id DESC LIMIT 1) as co2_emission_g_kwh,
        (SELECT confidence FROM energy_mix em
         WHERE em.provider_id = p.id
         ORDER BY em.id DESC LIMIT 1) as last_confidence,
        (SELECT extraction_method FROM energy_mix em
         WHERE em.provider_id = p.id
         ORDER BY em.id DESC LIMIT 1) as last_extraction_method
    FROM providers p
    ORDER BY p.id DESC
  `;

    const rows = await query(providerSql);
    return serialize(rows);
}

async function getRecentJobs() {
    const sql = `
        SELECT j.*, p.name as provider_name
        FROM scrape_jobs j
        JOIN providers p ON j.provider_id = p.id
        ORDER BY j.id DESC LIMIT 20
    `;
    const rows = await query(sql);
    return serialize(rows);
}

function serialize(data: any) {
    return JSON.parse(JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? Number(value) : value)));
}

export default async function Home() {
    let providers = [];
    let recentJobs = [];
    let error = null;

    try {
        providers = await getDashboardData();
        recentJobs = await getRecentJobs();
    } catch (e: any) {
        error = e.message;
        console.error(e);
    }

    // Calculate Stats
    const totalProviders = providers.length;
    const successCount = providers.filter((p: any) => p.latest_job_status === 'success').length;
    const mixFoundCount = providers.filter((p: any) => p.last_mix_year).length;

    return (
        <DashboardClient
            providers={providers}
            recentJobs={recentJobs}
            totalProviders={totalProviders}
            successCount={successCount}
            mixFoundCount={mixFoundCount}
            error={error}
        />
    );
}
