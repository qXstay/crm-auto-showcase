#!/bin/sh
set -eu

db_url="${SQLITE_DATABASE_URL:-}"

if [ -z "$db_url" ]; then
  echo "[db:push:sqlite] SQLITE_DATABASE_URL is required." >&2
  exit 1
fi

case "$db_url" in
  file:/*)
    db_path="${db_url#file:}"
    db_diff_url="$db_url"
    ;;
  file:*)
    db_path="prisma/${db_url#file:}"
    db_diff_url="file:$(pwd)/$db_path"
    ;;
  *)
    echo "[db:push:sqlite] SQLITE_DATABASE_URL must use a file: SQLite URL." >&2
    exit 1
    ;;
esac

tmp_sql="$(mktemp)"
cleanup() {
  rm -f "$tmp_sql"
}
trap cleanup EXIT

if [ -f "$db_path" ]; then
  npx prisma migrate diff --from-url "$db_diff_url" --to-schema-datamodel prisma/schema.sqlite.prisma --script > "$tmp_sql"
else
  npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.sqlite.prisma --script > "$tmp_sql"
fi

if [ ! -s "$tmp_sql" ]; then
  echo "[db:push:sqlite] SQLite schema is already up to date."
  exit 0
fi

npx prisma db execute --file "$tmp_sql" --schema prisma/schema.sqlite.prisma
