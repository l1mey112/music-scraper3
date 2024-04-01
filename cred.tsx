import * as schema from './schema'
import { db } from "./db"
import { component_invalidate, component_register, emit_log, route_register } from "./server"
import { sql } from 'drizzle-orm'

export type CredentialKind = keyof CredentialStore
type CredentialStore = {
	'spotify': [string, string][] // [client_id, client_secret]
	'deezer_arl': [string][]
}

function cred_db_get(): CredentialStore {
	let store: CredentialStore = {
		'spotify': [],
		'deezer_arl': [],
	}

	const cred = db.select({ data: schema.thirdparty_store.data })
		.from(schema.thirdparty_store)
		.where(sql`kind = 'cred'`)
		.get() as { data: CredentialStore } | undefined
	
	// fill in the blanks
	if (cred) {
		store = { ...store, ...cred.data }
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
			case 'deezer_arl': {
				if (values.length !== 1) {
					throw null
				}

				store.deezer_arl.push(values as [string])
				break
			}
			default: {
				throw null
			}
		}

		cred_db_set(store)
		emit_log(`[cred_add] add to <i>${kind}</i> success`)

		invalidate_kind(kind) // rerender
	} catch (e) {
		console.error(e)
		emit_log('[cred_add] failed', 'error')
	}

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
		invalidate_kind(kind as CredentialKind) // rerender
	} catch (e) {
		emit_log('[cred_delete] failed', 'error')
	}
}

function cred_censor(value: string) {
	if (value.length < 3) {
		return '***'
	}
	return value.slice(0, 3) + '***'
}

type TableProps = {
	kind: CredentialKind
	title: string
	names: string[]
	tooltip?: string
}

function cred_table(full_render: boolean, values: string[][], props: TableProps) {
	let table = (
		<table id={`cred-table-${props.kind}`}>
			<thead>
				<tr>
					{...props.names.map(name => <th>{name}</th>)}
				</tr>
			</thead>
			<tbody>
				{...values.map(value => <tr>
						{value.map(v => <td>{cred_censor(v)}</td>)}
						<td>
							<button hx-swap="none" hx-post={`/ui/cred_delete?kind=${props.kind}&value=${value.join(',')}`} hx-trigger="click">x</button>
						</td>
					</tr>
				)}
				{...props.names.map((_, index) => <td><input name={`v${index}`} type="password"/></td>)}
				<td>
					<input type="submit" value="+"></input>
				</td>
			</tbody>
		</table>
	)

	if (full_render) {
		table = <details>
			<summary>{props.title} {props.tooltip && <span class="tooltip" data-tooltip title={props.tooltip}> [?]</span>}<hr /></summary>
			<form hx-swap="none" hx-post={`/ui/cred_add`} hx-trigger="submit">
			<input type="hidden" name="kind" value={props.kind}></input>
			{table}
			</form>
		</details>
	}

	return table
}

const props: TableProps[] = [
	{
		kind: 'spotify',
		title: 'Spotify API Credentials',
		names: ['Client ID', 'Client Secret'],
		tooltip: 'assumes a default redirect URI of http://localhost:8080/callback',
	},
	{
		kind: 'deezer_arl',
		title: 'Deezer ARL Token',
		names: ['ARL Token'],
	},
]

const cred_map = new Map(props.map(prop => [prop.kind, (init: boolean) => cred_table(init, cred_db_get()[prop.kind], prop)]))

for (const [_, fn] of cred_map) {
	component_register(fn, 'left')
}

function invalidate_kind(kind: CredentialKind) {
	const fn = cred_map.get(kind)
	if (!fn) {
		emit_log(`[invalidate_kind] ${kind} not found`, 'error')
		return
	}
	component_invalidate(fn)
}

route_register('POST', 'cred_delete', cred_delete)
route_register('POST', 'cred_add', cred_add)

/* type Credential =
	| 'spotify'
	| 'spotify_user'
	| 'qobuz_user'
	| 'deezer_user' */
