import * as schema from './schema'
import { db } from "./db"
import { component_invalidate, component_register, emit_log, register_route } from "./server"
import { sql } from 'drizzle-orm'

export type CredentialKind = keyof CredentialStore
type CredentialStore = {
	'spotify': [string, string][] // [client_id, client_secret]
}

function cred_db_get(): CredentialStore {
	let store: CredentialStore = {
		'spotify': [],
	}
	
	const cred = db.select({ data: schema.thirdparty_store.data })
		.from(schema.thirdparty_store)
		.where(sql`kind = 'cred'`)
		.get() as { data: CredentialStore } | undefined

	if (cred) {
		store = cred.data
	}

	return store
}

function cred_db_set(store: CredentialStore) {
	db.insert(schema.thirdparty_store)
		.values({ kind: 'cred', data: store })
		.onConflictDoUpdate({
			target: schema.thirdparty_store.kind,
			set: { data: store }
		})
		.run()
}

async function cred_add(req: Request) {
	const data = await req.formData()

	exit: try {
		const kind = data.get('kind')
		const values = Array.from(data.keys())
			.filter(k => k.startsWith('v'))
			.map(k => data.get(k))
			.filter(v => v !== null) as string[]

		// sort values by key v0, v1, v2, ...
		values.sort((a, b) => {
			const a_index = parseInt(a.slice(1))
			const b_index = parseInt(b.slice(1))
			return a_index - b_index
		})

		// cannot have empty values
		if (values.some(v => !v)) {
			emit_log('[cred_add] empty value', 'error')
			break exit
		}

		// this is a bit more robust
		const store = cred_db_get()
		switch (kind) {
			case 'spotify': {
				if (values.length !== 2) {
					throw null
				}
				
				store.spotify.push(values as [string, string])
				break
			}
			default: {
				throw null
			}
		}

		cred_db_set(store)
		emit_log(`[cred_add] add to <i>${kind}</i> success`)
	} catch (e) {
		emit_log('[cred_add] failed', 'error')
	}

	component_invalidate(cred_tostring) // rerender
}

function cred_delete(req: Request) {
	const search = new URL(req.url).searchParams

	try {
		const kind = search.get('kind')
		const value = search.get('value')

		const store = cred_db_get()
		const index = store[kind as CredentialKind].findIndex(v => v.join(',') === value)
		if (index === -1) {
			emit_log('cred_delete not found', 'error')
		} else {
			store[kind as CredentialKind].splice(index, 1)
			cred_db_set(store)
			emit_log(`[cred_delete] delete from <i>${kind}</i> success`)
		}
	} catch (e) {
		emit_log('[cred_delete] failed', 'error')
	}

	component_invalidate(cred_tostring) // rerender
}

function cred_censor(value: string) {
	if (value.length < 3) {
		return '***'
	}
	return value.slice(0, 3) + '***'
}

function cred_table(full_render: boolean, kind: CredentialKind, title: string, names: string[], values: string[][], tooltip?: string) {
	let table = (
		<table id={`cred-table-${kind}`}>
			<thead>
				<tr>
					{...names.map(name => <th>{name}</th>)}
				</tr>
			</thead>
			<tbody>
				{...values.map(value => (
					<tr>
						{value.map(v => <td>{cred_censor(v)}</td>)}
						<td>
							<button hx-swap="none" hx-post={`/ui/cred_delete?kind=${kind}&value=${value.join(',')}`} hx-trigger="click">x</button>
						</td>
					</tr>
				))}
				{...names.map((_, index) => <td><input name={`v${index}`} type="password"/></td>)}
				<td>
					<input type="submit" value="+"></input>
				</td>
			</tbody>
		</table>
	)

	if (full_render) {
		table = <details>
			<summary>{title} {tooltip && <span class="tooltip" data-tooltip title={tooltip}> [?]</span>}<hr /></summary>
			{/* for some reason, HTMX always forces multipart/form-data */}
			<form hx-swap="none" hx-post={`/ui/cred_add`} hx-trigger="submit">
			<input type="hidden" name="kind" value={kind}></input>
			{table}
			</form>
		</details>
	}

	return table
}

function cred_tostring(init: boolean) {
	const store = cred_db_get()

	// use ...array to ignore key warnings

	const tables = [
		cred_table(init,
			'spotify', 'Spotify API Credentials',
			['Client ID', 'Client Secret'], store.spotify,
			'assumes a default redirect URI of http://localhost:8080/callback'
		)
	]

	return (
		<>{...tables}</>
	);
}

// call `component_invalidate(cred_tostring)` to rerender
component_register(cred_tostring, 'left')
register_route('POST', 'cred_delete', cred_delete)
register_route('POST', 'cred_add', cred_add)

/* type Credential =
	| 'spotify'
	| 'spotify_user'
	| 'qobuz_user'
	| 'deezer_user'

type CredentialStore = {
	'spotify': [string, string][] // [client_id, client_secret]
}
 */
/* const store: CredentialStore = {
	'spotify': [],
} */

/* function db_load() {
	let store = {} as CredentialStore

	const cred = db.select()
		.from(schema.thirdparty_store)
		.where(sql`kind = 'cred'`)
		.get()

	// if (cred) {}

	for (const row of rows) {
		const [kind, data] = row.data
		if (kind === 'spotify') {
			store.spotify.push(data)
		}
	}
} */

// return cached crediential, on failure return undefined and log
// log error if crediential requires user interaction
/* export async function crediential(cred: Credential): Promise<string | undefined> {
	emit_log(`crediential <i>${cred}</i> unhandled`, 'error')
	return undefined
} */

/* const spotify = new PanelRef("credentials: spotify")

spotify.html(
	`<pre>` + `</pre>`
) */
