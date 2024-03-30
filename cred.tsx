import * as schema from './schema'
import { db } from "./db"
import { emit_log, register_htmx_component as register_route } from "./server"
import { sql } from 'drizzle-orm'

type CredentialKind = keyof CredentialStore
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
	db.update(schema.thirdparty_store)
		.set({ kind: 'cred', data: store })
		.run()
}

// refresh entire crediential panel
// bit wasteful, but who cares?
function cred_refresh() {
	return (
		<div id="cred" hx-swap-oob="true" hx-get="/ui/cred" hx-trigger="load"></div>
	)
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
					emit_log('cred_add spotify invalid', 'error')
					return cred_refresh()
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
		emit_log('cred_add failed', 'error')
	}

	return cred_refresh()
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
		emit_log('cred_delete failed', 'error')
	}

	return cred_refresh()
}

function cred_censor(value: string) {
	if (value.length < 3) {
		return '***'
	}
	return value.slice(0, 3) + '***'
}

function cred_table(kind: CredentialKind, title: string, names: string[], values: string[][]) {
	if (values[0] && names.length !== values[0].length) {
		console.log(values)
		console.log(names)
		throw new Error('cred_table: names and values length mismatch')
	}

	return (
		<div>
			{/* for some reason, HTMX always forces multipart/form-data */}
			<form hx-post={`/ui/cred_add`} hx-trigger="submit">
			<input type="hidden" name="kind" value={kind}></input>
			<table>
				<thead>
					<tr>
						<th colspan={3}>{title}</th>
					</tr>
					<tr>
						{...names.map(name => <th>{name}</th>)}
					</tr>
				</thead>
				<tbody>
					{...values.map(value => (
						<tr>
							{value.map(v => <td>{cred_censor(v)}</td>)}
							<td>
								<button hx-post={`/ui/cred_delete?kind=${kind}&value=${value.join(',')}`} hx-trigger="click">x</button>
							</td>
						</tr>
					))}
						{...names.map((_, index) => <td><input name={`v${index}`} type="password"/></td>)}
						<td>
							<input type="submit" value="+"></input>
						</td>
				</tbody>
			</table>
			</form>
		</div>
	)
}

function cred_get() {
	const store = cred_db_get()

	// use ...array to ignore key warnings

	const tables = [
		cred_table('spotify', 'Spotify API Credentials', ['Client ID', 'Client Secret'], store.spotify)
	]

	return (
		<div>{...tables}</div>
	);
}

register_route('GET', 'cred', cred_get)
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
