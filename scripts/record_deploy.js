/**
 * deploy_logs へ1件記録（GitHub Actions / 手動デプロイ用）
 * Supabase JS クライアントは使わず REST API のみ（Node 20 CI 互換）
 *
 * Usage: node scripts/record_deploy.js <project> <type> <message> <actor>
 */

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.warn('Warning: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Skipping deployment logging.');
  process.exit(0);
}

const project = process.argv[2] || 'unknown';
const type = process.argv[3] || 'deploy';
const message = process.argv[4] || 'No message provided';
const actor = process.argv[5] || 'github-actions';

const logData = {
  project,
  type,
  message,
  actor,
  status: 'success',
};

async function recordDeploy() {
  const endpoint = `${String(url).replace(/\/$/, '')}/rest/v1/deploy_logs`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(logData),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.warn('Warning: Failed to record deploy log:', response.status, body);
    process.exit(1);
  }

  console.log('Successfully recorded deploy log:', logData);
}

recordDeploy().catch((err) => {
  console.warn('Warning: Failed to record deploy log:', err);
  process.exit(1);
});
