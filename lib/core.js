// Pure rules for boards, slots and bookings. No database here, so the tests run offline.
import { randomBytes } from "node:crypto";

export const TZ_OFFSET = "+03:00"; // Africa/Nairobi, no daylight saving
export const LIMITS = { title: 80, host: 60, mentor: 60, topic: 80, name: 60, contact: 80, note: 280 };

export class InputError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

export const newSlug = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").toLowerCase();
export const newKey = () => randomBytes(24).toString("base64url");

export function text(value, field, { required = true } = {}) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  if (required && !v) throw new InputError(`Add the ${field}.`);
  if (v.length > LIMITS[field]) throw new InputError(`Keep the ${field} under ${LIMITS[field]} characters.`);
  return v;
}

// "2026-11-03" and "14:30" in Nairobi time, to a Date. Rejects impossible dates like 31 February.
export function nairobiTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{2}:\d{2}$/.test(String(time))) throw new InputError("Pick a date and a start time.");
  const d = new Date(`${date}T${time}:00${TZ_OFFSET}`);
  if (Number.isNaN(d.getTime())) throw new InputError("That date or time does not exist.");
  const back = new Date(d.getTime() + 3 * 3600e3).toISOString();
  if (back.slice(0, 10) !== date || back.slice(11, 16) !== time) throw new InputError("That date or time does not exist.");
  return d;
}

export function slotInput(body, now = new Date()) {
  const startsAt = nairobiTime(body.date, body.time);
  const minutes = Number(body.minutes);
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 180) throw new InputError("A slot is 10 to 180 minutes.");
  if (startsAt <= now) throw new InputError("That time has already passed.");
  if (startsAt - now > 120 * 86400e3) throw new InputError("Open slots up to 120 days ahead.");
  return { mentor: text(body.mentor, "mentor"), topic: text(body.topic, "topic", { required: false }), startsAt, minutes };
}

export function bookingInput(body) {
  const contact = text(body.contact, "contact");
  const isEmail = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(contact);
  const isPhone = /^\+?[\d\s()-]{9,16}$/.test(contact);
  if (!isEmail && !isPhone) throw new InputError("Add an email address or a phone number so the mentor can reach you.");
  return { name: text(body.name, "name"), contact, note: text(body.note, "note", { required: false }) };
}

// Two slots for the same mentor overlap when each starts before the other ends.
export const overlaps = (a, b) => a.startsAt < new Date(b.startsAt.getTime() + b.minutes * 60e3) && b.startsAt < new Date(a.startsAt.getTime() + a.minutes * 60e3);

// The demo board keeps itself full: three mentors, four times a day, the next five weekdays.
export function demoSlots(now = new Date()) {
  const mentors = [
    ["Amina Wekesa", "Fundraising and pitch decks"],
    ["Brian Otieno", "Product and first customers"],
    ["Grace Njeri", "Hiring and team"],
  ];
  const out = [];
  const day = new Date(now.getTime() + 3 * 3600e3); // walk the calendar in Nairobi time
  for (let added = 0; added < 5;) {
    day.setUTCDate(day.getUTCDate() + 1);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const date = day.toISOString().slice(0, 10);
    ["10:00", "11:00", "14:00", "15:00"].forEach((time, i) => {
      const [mentor, topic] = mentors[(i + added) % mentors.length];
      out.push({ mentor, topic, startsAt: nairobiTime(date, time), minutes: 45 });
    });
    added++;
  }
  return out;
}

export function publicSlot(row, { withBooking = false } = {}) {
  const slot = { id: Number(row.id), mentor: row.mentor, topic: row.topic, startsAt: new Date(row.starts_at).toISOString(), minutes: row.minutes, taken: !!row.booked };
  if (withBooking && row.booked) slot.booking = { name: row.name, contact: row.contact, note: row.note, at: new Date(row.booked_at).toISOString() };
  return slot;
}
