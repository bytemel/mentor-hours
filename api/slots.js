// POST: open a slot. DELETE ?slug=&id=: remove a slot (and its booking). Both need the manage key.
import { db, migrate, hash } from "../lib/db.js";
import { json, readJson, route, fail } from "../lib/http.js";
import { slotInput, overlaps } from "../lib/core.js";

async function managedBoard(sql, slug, key) {
  if (!key) throw fail(401, "Open this from your manage link.");
  const [board] = await sql`select id, key_hash from mentor_hours.boards where slug = ${String(slug || "")}`;
  if (!board || hash(key) !== board.key_hash) throw fail(403, "That manage link is not valid for this board.");
  return board;
}

export const POST = route(async (request) => {
  await migrate();
  const body = await readJson(request);
  const sql = db();
  const board = await managedBoard(sql, body.slug, request.headers.get("x-manage-key"));
  const slot = slotInput(body);
  const same = await sql`select starts_at, minutes from mentor_hours.slots where board_id = ${board.id} and lower(mentor) = lower(${slot.mentor}) and starts_at > now() - interval '1 day'`;
  if (same.some((r) => overlaps(slot, { startsAt: new Date(r.starts_at), minutes: r.minutes }))) {
    throw fail(409, `${slot.mentor} already has a slot at that time.`);
  }
  const [count] = await sql`select count(*)::int as n from mentor_hours.slots where board_id = ${board.id} and starts_at > now()`;
  if (count.n >= 200) throw fail(409, "A board holds up to 200 upcoming slots.");
  const [row] = await sql`
    insert into mentor_hours.slots (board_id, mentor, topic, starts_at, minutes)
    values (${board.id}, ${slot.mentor}, ${slot.topic}, ${slot.startsAt.toISOString()}, ${slot.minutes})
    on conflict (board_id, mentor, starts_at) do nothing returning id`;
  if (!row) throw fail(409, `${slot.mentor} already has a slot at that time.`);
  return json({ ok: true, id: Number(row.id) }, 201);
});

export const DELETE = route(async (request) => {
  await migrate();
  const params = new URL(request.url).searchParams;
  const sql = db();
  const board = await managedBoard(sql, params.get("slug"), request.headers.get("x-manage-key"));
  const id = Number(params.get("id"));
  if (!Number.isSafeInteger(id)) throw fail(400, "Pick a slot.");
  const gone = await sql`delete from mentor_hours.slots where id = ${id} and board_id = ${board.id} returning id`;
  if (!gone.length) throw fail(404, "That slot is already gone.");
  return json({ ok: true });
});
