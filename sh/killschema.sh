#!/bin/sh

set -e

# -f to avoid error if enoent
rm -rf migrations
rm -f db.sqlite db.sqlite-shm db.sqlite-wal

bun run drizzle-kit generate:sqlite
HEAD=`ls -aht migrations/*.sql | head -1`
sh/post.py schema.ts $HEAD | sqlite3 db.sqlite