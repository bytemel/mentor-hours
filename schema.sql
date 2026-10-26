-- The app runs these itself on first request (lib/db.js). Kept here so you can read the shape.
create schema if not exists mentor_hours;

create table if not exists mentor_hours.boards (
  id bigserial primary key,
  slug text not null unique,
  title text not null,
  host text not null,
  key_hash text not null,          -- sha256 of the manage key; the key itself is never stored
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists mentor_hours.slots (
  id bigserial primary key,
  board_id bigint not null references mentor_hours.boards(id) on delete cascade,
  mentor text not null,
  topic text not null default '',
  starts_at timestamptz not null,
  minutes int not null check (minutes between 10 and 180),
  created_at timestamptz not null default now(),
  unique (board_id, mentor, starts_at)
);

-- One booking per slot, enforced by the primary key. This is the whole double-booking guard.
create table if not exists mentor_hours.bookings (
  slot_id bigint primary key references mentor_hours.slots(id) on delete cascade,
  name text not null,
  contact text not null,
  note text not null default '',
  cancel_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists mentor_hours.hits (
  bucket text primary key,         -- action plus a hashed caller id, for rate limits
  n int not null,
  expires_at timestamptz not null
);
