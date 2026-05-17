#!/usr/bin/env bash
# Vault に service_role_key を登録（定期バックアップ cron 用）
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY が未設定です。" >&2
  exit 1
fi

SUPABASE_CLI="${SUPABASE_CLI:-npx --yes supabase@2.98.2}"

run_query() {
  # shellcheck disable=SC2086
  $SUPABASE_CLI db query "$1" --linked --output table
}

run_query_file() {
  local file="$1"
  # shellcheck disable=SC2086
  $SUPABASE_CLI db query -f "$file" --linked --output table
}

echo "Checking existing vault secret..."
EXISTING="$(
  # shellcheck disable=SC2086
  $SUPABASE_CLI db query "SELECT count(*)::int AS n FROM vault.secrets WHERE name = 'service_role_key';" --linked --output csv 2>/dev/null \
    | tail -n 1 | tr -d '\r' || echo 0
)"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if [[ "${EXISTING:-0}" != "0" ]]; then
  echo "Updating existing vault secret: service_role_key"
  cat > "$TMP" <<SQL
DELETE FROM vault.secrets WHERE name = 'service_role_key';
SELECT vault.create_secret(
  \$srk\$${SUPABASE_SERVICE_ROLE_KEY}\$srk\$,
  'service_role_key',
  'Cron: scheduled-backup'
);
SQL
else
  echo "Creating vault secret: service_role_key"
  cat > "$TMP" <<SQL
SELECT vault.create_secret(
  \$srk\$${SUPABASE_SERVICE_ROLE_KEY}\$srk\$,
  'service_role_key',
  'Cron: scheduled-backup'
);
SQL
fi

run_query_file "$TMP"

echo "Verifying vault secret..."
run_query "SELECT name, length(decrypted_secret) AS secret_len FROM vault.decrypted_secrets WHERE name = 'service_role_key';"

echo "Checking cron job..."
run_query "SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'daily-account-backup';"

echo "OK: Vault secret for daily-account-backup is configured."
