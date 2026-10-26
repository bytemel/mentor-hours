// POST: book a slot. The bookings table uses the slot id as its primary key, so when two people
// press Book at the same moment exactly one insert wins and the other gets a clear "just taken".
// DELETE: cancel with the private token returned at booking time.
import { randomBytes } from "node:crypto";
import { db, migrate, allow, hash } from "../lib/db.js";
import { json, readJson, route, fail } from "../lib/http.js";
import { bookingInput } from "../lib/core.js";

export const POST = route(async (request) => {
  await migrate();
  if (!(await allow(request, "book", 10, 60))) throw fail(429, "Too many bookings from here. Try again in an hour.");
  const body = await readJson(request);
  const slotId = Number(body.slotId);
  if (!Number.isSafeInteger(slotId)) throw fail(400, "Pick a slot.");
  const who = bookingInput(body);
  const sql = db();
  const [slot] = await sql`
    select s.id, s.starts_at, s.minutes, s.mentor, s.topic, bd.title
    from mentor_hours.slots s join mentor_hours.boards bd on bd.id = s.board_id
    where s.id = ${slotId} and bd.slug = ${String(body.slug || "")}`;
  if (!slot) throw fail(404, "That slot is gone. Pick another.");
  if (new Date(slot.starts_at) <= new Date()) throw fail(409, "That slot has already started. Pick another.");
  const token = randomBytes(18).toString("base64url");
  const won = await sql`
    insert into mentor_hours.bookings (slot_id, name, contact, note, cancel_hash)
    values (${slotId}, ${who.name}, ${who.contact}, ${who.note}, ${hash(token)})
    on conflict (slot_id) do nothing returning slot_id`;
  if (!won.length) throw fail(409, "Someone booked that slot a moment ago. Pick another.");
  return json({
    ok: true,
    token,
    slot: { id: slotId, mentor: slot.mentor, topic: slot.topic, startsAt: new Date(slot.starts_at).toISOString(), minutes: slot.minutes, board: slot.title },
  }, 201);
});

export const DELETE = route(async (request) => {
  await migrate();
  const body = await readJson(request);
  const slotId = Number(body.slotId);
  if (!Number.isSafeInteger(slotId) || !body.token) throw fail(400, "Use the cancel link from your booking.");
  const gone = await db()`delete from mentor_hours.bookings where slot_id = ${slotId} and cancel_hash = ${hash(body.token)} returning slot_id`;
  if (!gone.length) throw fail(404, "No booking matches that link. It may already be cancelled.");
  return json({ ok: true });
});
