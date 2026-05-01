/**
 * GitHub Actions からメンテナンスモードを ON/OFF するスクリプト
 * 使い方:
 *   node scripts/set_maintenance.js on   # メンテナンス ON
 *   node scripts/set_maintenance.js off  # メンテナンス OFF
 */
import { createClient } from '@supabase/supabase-js';

const mode = process.argv[2];
if (mode !== 'on' && mode !== 'off') {
  console.error('Usage: node scripts/set_maintenance.js [on|off]');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const enabled = mode === 'on';

const { error } = await supabase
  .from('app_feature_flags')
  .upsert({ feature_key: 'maintenance_mode', enabled }, { onConflict: 'feature_key' });

if (error) {
  console.error('Failed to set maintenance mode:', error.message);
  process.exit(1);
}

console.log(`✅ maintenance_mode = ${enabled} (${mode.toUpperCase()})`);
