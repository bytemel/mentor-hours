// Neon Postgres over HTTP. One query per request, no pool to manage, works on Vercel functions.
// The tables live in their own schema so this app can share a database with others.
import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

let sql = null;
let ready = null;

export function db() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error("DATABASE_URL is not set"), { status: 503 });
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

// Creates the tables on the first request after a cold start. Every statement is idempotent,
// so a fresh Neon database needs no setup step. The same SQL is in schema.sql for reading.
export function migrate() {
  ready ??= db().transaction((q) => [
    q`create schema if not exists mentor_hours`,
    q`create table if not exists mentor_hours.boards (
        id bigserial primary key,
        slug text not null unique,
        title text not null,
        host text not null,
        key_hash text not null,
        is_demo boolean not null default false,
        created_at timestamptz not null default now())`,
    q`create table if not exists mentor_hours.slots (
        id bigserial primary key,
        board_id bigint not null references mentor_hours.boards(id) on delete cascade,
        mentor text not null,
        topic text not null default '',
        starts_at timestamptz not null,
        minutes int not null check (minutes between 10 and 180),
        created_at timestamptz not null default now(),
        unique (board_id, mentor, starts_at))`,
    // slot_id is the primary key: a slot can hold one booking, and the database enforces it.
    q`create table if not exists mentor_hours.bookings (
        slot_id bigint primary key references mentor_hours.slots(id) on delete cascade,
        name text not null,
        contact text not null,
        note text not null default '',
        cancel_hash text not null,
        created_at timestamptz not null default now())`,
    q`create table if not exists mentor_hours.hits (
        bucket text primary key,
        n int not null,
        expires_at timestamptz not null)`,
  ]).catch((e) => { ready = null; throw e; });
  return ready;
}

export const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

// The caller's IP, hashed so the table never stores a raw address.
export function clientId(request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
  return hash(`mentor-hours:${ip}`).slice(0, 32);
}

// Fixed-window rate limit in Postgres: at most `max` calls per `minutes` for one action and caller.
export async function allow(request, action, max, minutes) {
  const bucket = `${action}:${clientId(request)}`;
  const [row] = await db()`
    insert into mentor_hours.hits (bucket, n, expires_at)
    values (${bucket}, 1, now() + make_interval(mins => ${minutes}))
    on conflict (bucket) do update set
      n = case when hits.expires_at < now() then 1 else hits.n + 1 end,
      expires_at = case when hits.expires_at < now() then excluded.expires_at else hits.expires_at end
    returning n`;
  return row.n <= max;
}
