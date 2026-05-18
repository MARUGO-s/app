/**
 * 全レシピのコースを Gemini で固定13種に一括変換（サービスロールキー必須）
 *
 * 使い方:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/classify-recipe-courses.mjs
 */
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です');
  process.exit(1);
}

const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/classify-recipe-courses`;

let afterId = 0;
let totalProcessed = 0;
let totalUpdated = 0;
let totalSkipped = 0;
let totalFailed = 0;

while (true) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      limit: 12,
      onlyMissing: false,
      overwrite: true,
      forceRewrite: true,
      dryRun,
      afterId,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Error:', payload?.error || res.status);
    process.exit(1);
  }

  totalProcessed += payload.processed || 0;
  totalUpdated += payload.updated || 0;
  totalSkipped += payload.skipped || 0;
  totalFailed += payload.failed || 0;

  console.log(
    `chunk: processed=${payload.processed} updated=${payload.updated} skipped=${payload.skipped} failed=${payload.failed} next=${payload.nextAfterId}`,
  );

  if (!payload.hasMore) break;
  afterId = payload.nextAfterId || afterId;
  await new Promise((r) => setTimeout(r, 400));
}

console.log('Done.', { totalProcessed, totalUpdated, totalSkipped, totalFailed, dryRun });
