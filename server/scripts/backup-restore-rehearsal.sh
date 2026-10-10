#!/usr/bin/env bash
# ─── Backup → restore rehearsal (SRS release gate: "restore a backup in rehearsal") ─────────────
# Dumps SOURCE_DATABASE_URL, restores it into RESTORE_DATABASE_URL, then compares the row
# count of every table. A backup you have never restored is only a hope.
#
#   SOURCE_DATABASE_URL=postgres://...   (a DIRECT connection, not Neon's "-pooler" one)
#   RESTORE_DATABASE_URL=postgres://...  (an EMPTY scratch database whose name contains "restore")
#   ./scripts/backup-restore-rehearsal.sh
#
# Needs the PostgreSQL client tools (pg_dump, pg_restore, psql) at the server's major version.
# The dump file is kept in ./backups/ — it contains every account's data: store it like
# production (encrypted, access-controlled), and delete rehearsal copies afterwards.
set -euo pipefail

: "${SOURCE_DATABASE_URL:?set SOURCE_DATABASE_URL (direct connection to the database to back up)}"
: "${RESTORE_DATABASE_URL:?set RESTORE_DATABASE_URL (an empty scratch database)}"

# NOTE: guard against restoring over a real database — pg_restore --clean would wipe it.
restore_name="${RESTORE_DATABASE_URL##*/}"
restore_name="${restore_name%%\?*}"
if [[ "$restore_name" != *restore* ]]; then
  echo "Refusing: the restore database name ('$restore_name') must contain 'restore'." >&2
  exit 1
fi
if [[ "$SOURCE_DATABASE_URL" == "$RESTORE_DATABASE_URL" ]]; then
  echo "Refusing: source and restore databases are the same." >&2
  exit 1
fi

mkdir -p backups
dump_file="backups/afritask-$(date -u +%Y%m%dT%H%M%SZ).dump"

echo "1/3 Dumping source → $dump_file"
started=$(date +%s)
pg_dump --format=custom --no-owner --no-privileges --file="$dump_file" "$SOURCE_DATABASE_URL"
echo "    done in $(( $(date +%s) - started ))s ($(du -h "$dump_file" | cut -f1))"

echo "2/3 Restoring into $restore_name"
started=$(date +%s)
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname="$RESTORE_DATABASE_URL" "$dump_file"
echo "    done in $(( $(date +%s) - started ))s  ← compare with the 4-hour recovery objective"

echo "3/3 Comparing row counts"
count_rows() {
  psql "$1" --no-align --tuples-only --quiet --command "
    SELECT format('SELECT %L AS t, count(*) FROM %I.%I', tablename, schemaname, tablename)
    FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename" |
  while read -r query; do psql "$1" --no-align --tuples-only --quiet --field-separator=' ' --command "$query"; done
}
source_counts=$(count_rows "$SOURCE_DATABASE_URL")
restored_counts=$(count_rows "$RESTORE_DATABASE_URL")

if [[ "$source_counts" == "$restored_counts" ]]; then
  echo "$source_counts" | sed 's/^/    /'
  echo "OK — every table restored with the same row count."
else
  echo "MISMATCH between source and restore:" >&2
  diff <(echo "$source_counts") <(echo "$restored_counts") >&2 || true
  exit 1
fi
