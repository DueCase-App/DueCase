#!/usr/bin/env bash
# Ripristino di test DueCase: usare ESCLUSIVAMENTE su database isolato/non produzione.
# Requisiti: PostgreSQL client, age, PGSERVICE_RESTORE, AGE_IDENTITY_FILE, BACKUP_FILE.
set -euo pipefail
umask 077

: "${PGSERVICE_RESTORE:?Configura un servizio PostgreSQL dedicato al database di restore test}"
: "${AGE_IDENTITY_FILE:?Indica il file con la chiave privata age}"
: "${BACKUP_FILE:?Indica il backup .dump.age da verificare}"
: "${RESTORE_CONFIRM:?Imposta RESTORE_CONFIRM=I_UNDERSTAND_ISOLATED_DB}"

if [[ "$RESTORE_CONFIRM" != "I_UNDERSTAND_ISOLATED_DB" ]]; then
  echo "Restore annullato: conferma esplicita mancante." >&2
  exit 2
fi

command -v pg_restore >/dev/null
command -v psql >/dev/null
command -v age >/dev/null

if [[ ! -r "$BACKUP_FILE" ]]; then
  echo "Backup non leggibile: $BACKUP_FILE" >&2
  exit 2
fi
if [[ ! -r "$AGE_IDENTITY_FILE" ]]; then
  echo "Chiave age non leggibile: $AGE_IDENTITY_FILE" >&2
  exit 2
fi

workdir="$(mktemp -d)"
dump_file="$workdir/duecase-restore.dump"
trap 'rm -rf "$workdir"' EXIT

age -d -i "$AGE_IDENTITY_FILE" -o "$dump_file" "$BACKUP_FILE"
pg_restore --list "$dump_file" >/dev/null

# Controllo minimo: il target deve esistere e rispondere prima del restore.
PGSERVICE="$PGSERVICE_RESTORE" psql -v ON_ERROR_STOP=1 -Atc "SELECT current_database(), current_user;"

# Il target DEVE essere un database di test dedicato.
PGSERVICE="$PGSERVICE_RESTORE" pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --exit-on-error \
  "$dump_file"

PGSERVICE="$PGSERVICE_RESTORE" psql -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT 'users=' || count(*) FROM users;
SELECT 'families=' || count(*) FROM families;
SELECT 'children=' || count(*) FROM children;
SELECT 'messages=' || count(*) FROM messages;
SELECT 'documents=' || count(*) FROM documents;
SQL

echo "Restore di test completato. Verificare manualmente migrazioni, allegati e avvio backend prima di considerare il backup valido."
