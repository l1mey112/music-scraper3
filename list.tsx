import { sql } from "drizzle-orm"
import { db } from "./db"
import { pass_on } from "./pass"
import { $artist } from "./schema"
import { component_invalidate, component_register } from "./server"

function list() {
	const k = db.select({ name: $artist.name, profile_image: $artist.profile_image})
		.from($artist)
		.where(sql`name is not null and profile_image is not null`)
		.all() as { name: string, profile_image: string }[]

	const cards = []

	for (const i of k) {
		cards.push(
			<div class="card">
				{/* <img src={`/media?q=${i.profile_image}`} width={200} height={200} alt={i.name} /> */}
				<div class="card-body">
					<h3>{i.name}</h3>
				</div>
			</div>
		)
	}
	
	return (<>{[...cards]}</>)
}

export function ui_init_list() {
	component_register(list, 'right1')

	function invalidate() {
		component_invalidate(list)
	}
	
	pass_on('artist.meta.assign', invalidate)
}