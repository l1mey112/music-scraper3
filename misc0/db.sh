#!/bin/bash

rm -f db.sqlite

sqlite3 db.sqlite < schema.sql

cmds=(
	"pragma journal_mode = wal"
	"pragma synchronous = normal"
	"pragma temp_store = memory"
	"pragma mmap_size = 30000000000"
)

for cmd in "${cmds[@]}"; do
	echo "sqlite> $cmd"
	sqlite3 db.sqlite "$cmd"
done
