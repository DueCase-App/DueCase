#!/usr/bin/env bash
# Run from a trusted scheduler with PostgreSQL client and age installed.
# Credentials come from PGSERVICE/PGPASSFILE, never command-line arguments.
set -euo pipefail
umask 077
: "${PGSERVICE:?Configure a pg_service.conf entry}"
: "${AGE_RECIPIENT:?Set an age public recipient key}"
: "${BACKUP_DIRECTORY:?Set a protected persistent destination}"
command -v pg_dump >/dev/null
command -v age >/dev/null
mkdir -p "$BACKUP_DIRECTORY"
backup_target="$BACKUP_DIRECTORY/duecase-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
backup_partial="${backup_target}.partial"
trap 'rm -f "$backup_partial"' EXIT
pg_dump --format=custom --no-owner --no-acl | age -r "$AGE_RECIPIENT" -o "$backup_partial"
mv "$backup_partial" "$backup_target"
printf 'Backup cifrato completato: %s\n' "$backup_target"
