import { parse } from "bcp-47"
import { db } from "./db"
import { sql } from "drizzle-orm"
import { Locale, LocaleRef } from "./types"
import { $locale, $kv_store } from "./schema"

// Locale is a IETF language tag (e.g. en, jp, ja-latn)
// only storing language and script, nothing else

export function locale_from_bcp_47(code: string): LocaleRef | undefined {
	const k = parse(code)

	if (!k.language) {
		return
	}

	if (k.script) {
		return `${k.language}-${k.script}` as LocaleRef
	}

	return k.language as LocaleRef
}

export function locale_insert(locales: Locale | Locale[]) {
	if (locales instanceof Array && locales.length == 0) {
		return
	}

	// is this really how upsert works??
	/* db.insert($i10n)
		.values(locales as any)
		.onConflictDoUpdate({
			target: [$i10n.ident, $i10n.locale, $i10n.part],
			set: {
				text: sql`excluded.text`,
			}
		})
		.run() */
	
	if (!(locales instanceof Array)) {
		locales = [locales]
	}

	// this works now????

	/* db.run(sql`
		insert or replace into i10n (ident, locale, part, text)
		values ${sql.join(locales.map((l) => sql`(${l.ident}, ${l.locale}, ${l.part}, ${l.text})`), sql`,`)}
	`) */

	// don't bother replacing, just insert
	// don't overwrite possible user choices

	db.insert($locale)
		.values(locales as any)
		.onConflictDoNothing()
		.run()
}

// default database locale is "en"
export function locale_current(): LocaleRef {
	const locale_entry = db.select({ data: $kv_store.data })
		.from($kv_store)
		.where(sql`kind = 'locale'`)
		.get() as { data: LocaleRef } | undefined

	if (!locale_entry) {
		// insert into db
		db.insert($kv_store)
			.values({ kind: 'locale', data: 'en' })
			.run()

		return 'en' as LocaleRef
	}

	return locale_entry.data
}
