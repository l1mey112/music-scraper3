#!/bin/bash

set -e

urls=(
	"https://unpkg.com/htmx.org@1.9.11/dist/htmx.min.js"
	"https://unpkg.com/htmx.org@1.9.11/dist/ext/ws.js"
	"https://unpkg.com/htmx.org@1.9.11/dist/ext/remove-me.js"
)

out=$1

if [ -z "$out" ]; then
	echo "usage: $0 <output-dir>"
	exit 1
fi

if [ -f $out ]; then
	rm -f $out
fi

# generated by
time=$(date --utc)
echo "// generated by $0 $@ at $time" > $out

# concat
for url in "${urls[@]}"; do
	echo "fetch '$url'"
	echo -e "// $url" >> $out
	curl -s $url >> $out
	echo "" >> $out
done