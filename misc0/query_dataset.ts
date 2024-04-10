import { $ } from 'bun'
import { Database } from 'bun:sqlite'

await $`cd .. && sh/hdist_compile.ts`

const sqlite: Database = new Database('db.sqlite', { create: false, readwrite: false, readonly: true })
sqlite.loadExtension("../hdist")

/* const prep = sqlite.prepare(
	`select
		fp0.hashpath as fingerprint0,
		fp1.hashpath as fingerprint1,
		max(abs(fp0.duration_s - fp1.duration_s)) as duration_diff,
		min(acoustid_compare2(fp0.chromaprint, fp1.chromaprint, 80)) as score
	from
		sources fp0
		inner join sources fp1
			on fp0.hashpath < fp1.hashpath
	group by
		fp0.hashpath, fp1.hashpath
	`
) */

/* const prep = sqlite.prepare(
	`WITH best_matches AS (
		SELECT
			fp0.hashpath AS fingerprint0,
			fp1.hashpath AS fingerprint1,
			ABS(fp0.duration_s - fp1.duration_s) AS duration_diff,
			acoustid_compare2(fp0.chromaprint, fp1.chromaprint, 80) AS score
		FROM
			sources fp0
			INNER JOIN sources fp1 ON fp0.hashpath < fp1.hashpath
		WHERE
			ABS(fp0.duration_s - fp1.duration_s) <= 7
	)
	SELECT
		fingerprint0,
		fingerprint1,
		MAX(duration_diff) AS duration_diff,
		MIN(score) AS score
	FROM
		best_matches
	WHERE
		score > 0.75
	GROUP BY
		fingerprint0, fingerprint1
	ORDER BY
		score DESC;
	LIMIT 10;`
) */

/* where
	unlikely(score > 0.75)
	and fp0.duration_s between fp1.duration_s - 7 and fp1.duration_s + 7 */

/* const prep = sqlite.prepare(
	`select
		fp0.hashpath as fingerprint0,
		fp1.hashpath as fingerprint1,
		fp0.duration_s as duration0,
		fp1.duration_s as duration1,
		acoustid_compare2(fp0.chromaprint, fp1.chromaprint, 80) as score
	from
		sources fp0
		inner join sources fp1
			on fp0.hashpath < fp1.hashpath
	order by
		score desc
	limit 10`
) */

const prep = sqlite.prepare(
	`select
		fp0.hashpath as fingerprint0,
		fp1.hashpath as fingerprint1,
		fp0.duration_s as duration0,
		fp1.duration_s as duration1,
		acoustid_compare2(fp0.chromaprint, fp1.chromaprint, 80) as score
	from
		sources fp0
		inner join sources fp1
			on fp0.hashpath < fp1.hashpath
	where
		unlikely(score > 0.75)
		and fp0.duration_s between fp1.duration_s - 7 and fp1.duration_s + 7`
)

const k = prep.all()
console.log(k)