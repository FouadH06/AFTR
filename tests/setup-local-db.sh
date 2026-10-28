#!/usr/bin/env bash
# Starts a throwaway local Postgres 16 with a minimal Supabase-like auth stub, then applies migrations.
# Usage: tests/setup-local-db.sh   (prints a DATABASE_URL)
set -euo pipefail
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DIR=${PGTEST_DIR:-/tmp/aftr-pgtest}
PORT=${PGTEST_PORT:-54329}
RUN_AS=""; [ "$(id -u)" = "0" ] && RUN_AS="su postgres -c"
run() { if [ -n "$RUN_AS" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
run "$BIN/pg_ctl -D $DIR stop -m immediate" >/dev/null 2>&1 || true
rm -rf "$DIR"; mkdir -p "$DIR"; [ -n "$RUN_AS" ] && chown postgres "$DIR"
run "$BIN/initdb -D $DIR -U postgres --auth=trust" >/dev/null
run "$BIN/pg_ctl -D $DIR -o '-p $PORT -k /tmp' -l $DIR/log start -w" >/dev/null
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "create database aftr"
$PSQL -d aftr <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select on tables to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
SQL
for f in "$(dirname "$0")"/../supabase/migrations/*.sql; do $PSQL -d aftr -f "$f"; done
echo "postgres://postgres@localhost:$PORT/aftr?host=/tmp"
