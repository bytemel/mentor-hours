# Mentor Hours

Office hours booking for hubs, accelerators and cohort programmes. Mentors open slots, founders book with one link, and two people can never book the same slot.

**Live demo: [mentor-hours.vercel.app/b/demo](https://mentor-hours.vercel.app/b/demo)** (three mentors, fresh slots for the next five weekdays; bookings clear after a day)

## The problem it fixes

Programme teams run mentor office hours from a WhatsApp group and a Google Sheet. Two founders claim the same 10:00 slot, the mentor shows up to a clash, and nobody has the founder's number. Calendly fixes it per mentor, but a cohort has ten mentors and one link is what people actually click.

## What it does

- **One public link per board.** Slots grouped by day, East Africa Time, open or taken.
- **No double booking.** The `bookings` table uses the slot id as its primary key. When two people press Book in the same second, Postgres accepts one insert and the other person sees "Someone booked that slot a moment ago". Tested live with three parallel requests: one won.
- **No sign-up.** Creating a board returns a private manage link (`/m/<slug>#key=...`). The key sits in the URL fragment, so it never reaches server logs or referrers, and only its SHA-256 is stored.
- **Manage view.** Open slots per mentor (overlaps for the same mentor are refused), see who booked and what they want help with, remove slots.
- **Founder side.** Book with a name and a phone or email, get an `.ics` file, a Google Calendar link and a cancel link.
- **Limits that keep a free database free.** Rate limits per hashed IP in Postgres, 200 upcoming slots per board, boards deleted after 90 days.

## Stack

- Static HTML, CSS and vanilla JS in `public/`
- Vercel Functions (Web `Request`/`Response`) in `api/`
- [Neon](https://neon.tech) serverless Postgres over HTTP (`@neondatabase/serverless`, the only dependency)

The app creates its own tables on the first request (`lib/db.js`), in a `mentor_hours` schema so it can share a database. `schema.sql` holds the same SQL for reading.

## Run your own

1. Fork, then import the repo on Vercel.
2. Add Neon from the Vercel Marketplace (Storage tab). It sets `DATABASE_URL`.
3. Deploy. Open `/`, create a board.

Locally: `npm install`, `vercel env pull`, `vercel dev`. Tests: `npm test` (pure rules, no database needed).

## Files

| Path | What |
|---|---|
| `lib/core.js` | Validation, Nairobi time, overlap rule, demo slots |
| `lib/db.js` | Neon client, idempotent migration, Postgres rate limit |
| `api/boards.js` | Create a board, read a board (manage key shows bookings) |
| `api/slots.js` | Open and remove slots (manage key) |
| `api/bookings.js` | Book and cancel |
| `public/` | The page |

MIT licence. Built by [Timothy Mwangi](https://timmwangi.com).
