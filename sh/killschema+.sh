#!/bin/bash

set -e

sh/killschema.sh

# update this as needed

stmts=(
	"insert into youtube_video (id) values ('0qYl0rqLcQs'), ('p-o_bMkzOW0'), ('Or5lCqWyYE8'), ('LnkUf8I8e_U'), ('qj1GooBp0ss'), ('0BYfmmGLm1Y'), ('Y08h2Hk2XD0');"
	"insert into vocadb_album (id) values (18033)"
	#"insert into spotify_track (id) values ('2HWFwY4LiEqHrZ4lYdyAHG')"

	# cosmo@bousou-p
	#"insert into spotify_track (id) values ('1rkDWkKb9J4A37J91U6eUW');"
	#"insert into youtube_video (id) values ('XwCv6Gm3Q3Q');"
)

for stmt in "${stmts[@]}"; do
	echo "$stmt" | sqlite3 db.sqlite
done