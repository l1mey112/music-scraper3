#!/bin/sh

set -e

# -f to avoid error if enoent
rm -rf migrations
rm -f db.sqlite db.sqlite-shm db.sqlite-wal
rm -rf db # media folder

bun run drizzle-kit generate:sqlite
HEAD=`ls -aht migrations/*.sql | head -1`
sh/post.py schema.ts $HEAD | sqlite3 db.sqlite

# update this as needed

stmts=(
	"insert into youtube_video (id) values ('0qYl0rqLcQs'), ('p-o_bMkzOW0');"
)

for stmt in "${stmts[@]}"; do
	echo "$stmt" | sqlite3 db.sqlite
done