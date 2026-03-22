import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
  process.exit(1);
}

const supabase = createClient(url, key);

// Usage: node scripts/record_deploy.js <project> <type> <message> <actor>
const project = process.argv[2] || 'unknown';
const type = process.argv[3] || 'deploy';
const message = process.argv[4] || 'No message provided';
const actor = process.argv[5] || 'github-actions';

async function recordDeploy() {
  const logData = {
    project,
    type,
    message,
    actor,
    status: 'success'
  };

  const { error } = await supabase.from('deploy_logs').insert([logData]);

  if (error) {
    console.error('Failed to record deploy log:', error);
    process.exit(1);
  }

  console.log('Successfully recorded deploy log:', logData);
}

recordDeploy();
