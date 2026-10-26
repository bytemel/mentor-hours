// POST: create a board and get its private manage key. GET ?slug=: the board and its upcoming slots.
// Send the manage key in the x-manage-key header to also see who booked.
import { db, migrate, allow, hash } from "../lib/db.js";
import { json, readJson, route, fail } from "../lib/http.js";
import { newSlug, newKey, text, demoSlots, publicSlot } from "../lib/core.js";

export const POST = route(async (request) => {
  await migrate();
  if (!(await allow(request, "board", 5, 60))) throw fail(429, "That is a lot of boards. Try again in an hour.");
  const body = await readJson(request);
  const title = text(body.title, "title");
  const host = text(body.host, "host");
  const sql = db();
  // Keep the free database small: boards without activity for 90 days go away.
  await sql`delete from mentor_hours.boards where not is_demo and created_at < now() - interval '90 days'`;
  const slug = newSlug();
  const key = newKey();
  await sql`insert into mentor_hours.boards (slug, title, host, key_hash) values (${slug}, ${title}, ${host}, ${hash(key)})`;
  return json({ ok: true, slug, key }, 201);
});

export const GET = route(async (request) => {
  await migrate();
  const slug = new URL(request.url).searchParams.get("slug") || "";
  if (!/^[a-z0-9]{3,16}$/.test(slug)) throw fail(404, "No board here.");
  const sql = db();
  if (slug === "demo") await ensureDemo(sql);
  const [board] = await sql`select id, slug, title, host, key_hash, is_demo from mentor_hours.boards where slug = ${slug}`;
  if (!board) throw fail(404, "No board here. Check the link.");
  const key = request.headers.get("x-manage-key") || "";
  const manager = !!key && hash(key) === board.key_hash;
  if (key && !manager) throw fail(403, "That manage link is not valid for this board.");
  const rows = await sql`
    select s.id, s.mentor, s.topic, s.starts_at, s.minutes,
           b.slot_id is not null as booked, b.name, b.contact, b.note, b.created_at as booked_at
    from mentor_hours.slots s left join mentor_hours.bookings b on b.slot_id = s.id
    where s.board_id = ${board.id} and s.starts_at > now() - interval '1 hour'
    order by s.starts_at, s.mentor limit 300`;
  return json({
    ok: true,
    board: { slug: board.slug, title: board.title, host: board.host, demo: board.is_demo },
    manager,
    slots: rows.map((r) => publicSlot(r, { withBooking: manager })),
  });
});

// The demo board refills its next five weekdays and forgets old bookings, so it always has something to book.
async function ensureDemo(sql) {
  const [board] = await sql`
    insert into mentor_hours.boards (slug, title, host, key_hash, is_demo)
    values ('demo', 'Demo Hub office hours', 'Demo Hub programme team', ${hash(newKey())}, true)
    on conflict (slug) do update set slug = excluded.slug
    returning id`;
  const slots = demoSlots();
  await sql.transaction((q) => [
    q`delete from mentor_hours.slots where board_id = ${board.id} and starts_at < now() - interval '1 day'`,
    q`delete from mentor_hours.bookings b using mentor_hours.slots s where b.slot_id = s.id and s.board_id = ${board.id} and b.created_at < now() - interval '1 day'`,
    q`insert into mentor_hours.slots (board_id, mentor, topic, starts_at, minutes)
      select ${board.id}, x.mentor, x.topic, x.starts_at, 45
      from jsonb_to_recordset(${JSON.stringify(slots.map((s) => ({ mentor: s.mentor, topic: s.topic, starts_at: s.startsAt.toISOString() })))}::jsonb)
        as x(mentor text, topic text, starts_at timestamptz)
      on conflict (board_id, mentor, starts_at) do nothing`,
  ]);
}
