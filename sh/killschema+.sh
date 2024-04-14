#!/bin/bash

set -e

sh/killschema.sh

# update this as needed

stmts=(
	"insert into youtube_video (id) values ('0qYl0rqLcQs'), ('p-o_bMkzOW0'), ('Or5lCqWyYE8'), ('LnkUf8I8e_U'), ('qj1GooBp0ss'), ('0BYfmmGLm1Y');"
)

for stmt in "${stmts[@]}"; do
	echo "$stmt" | sqlite3 db.sqlite
done