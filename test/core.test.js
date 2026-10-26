import { test } from "node:test";
import assert from "node:assert/strict";
import { nairobiTime, slotInput, bookingInput, overlaps, demoSlots, text, InputError, newSlug } from "../lib/core.js";

test("Nairobi time is UTC+3", () => {
  assert.equal(nairobiTime("2026-11-03", "14:30").toISOString(), "2026-11-03T11:30:00.000Z");
});

test("impossible dates are refused", () => {
  assert.throws(() => nairobiTime("2026-02-31", "10:00"), InputError);
  assert.throws(() => nairobiTime("2026-11-03", "25:00"), InputError);
  assert.throws(() => nairobiTime("tomorrow", "10:00"), InputError);
});

test("slots must be in the future, within 120 days and 10 to 180 minutes", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const ok = slotInput({ date: "2026-11-03", time: "10:00", minutes: 30, mentor: " Amina  W ", topic: "" }, now);
  assert.equal(ok.mentor, "Amina W");
  assert.throws(() => slotInput({ date: "2026-10-30", time: "10:00", minutes: 30, mentor: "A" }, now), /passed/);
  assert.throws(() => slotInput({ date: "2027-06-01", time: "10:00", minutes: 30, mentor: "A" }, now), /120 days/);
  assert.throws(() => slotInput({ date: "2026-11-03", time: "10:00", minutes: 5, mentor: "A" }, now), /10 to 180/);
  assert.throws(() => slotInput({ date: "2026-11-03", time: "10:00", minutes: "30.5", mentor: "A" }, now), /10 to 180/);
  assert.throws(() => slotInput({ date: "2026-11-03", time: "10:00", minutes: 30, mentor: "" }, now), /mentor/);
});

test("bookings need a name and a phone or email", () => {
  assert.deepEqual(bookingInput({ name: "Wanjiru", contact: "0712 345 678" }), { name: "Wanjiru", contact: "0712 345 678", note: "" });
  assert.equal(bookingInput({ name: "W", contact: "w@example.com", note: "Pitch" }).note, "Pitch");
  assert.throws(() => bookingInput({ name: "W", contact: "call me" }), /email address or a phone/);
  assert.throws(() => bookingInput({ name: "", contact: "w@example.com" }), /name/);
  assert.throws(() => bookingInput({ name: "W", contact: "w@example.com", note: "x".repeat(281) }), /280/);
});

test("overlap needs both slots to start before the other ends", () => {
  const a = { startsAt: new Date("2026-11-03T07:00:00Z"), minutes: 30 };
  assert.equal(overlaps(a, { startsAt: new Date("2026-11-03T07:15:00Z"), minutes: 30 }), true);
  assert.equal(overlaps(a, { startsAt: new Date("2026-11-03T07:30:00Z"), minutes: 30 }), false, "back to back is fine");
  assert.equal(overlaps(a, { startsAt: new Date("2026-11-03T06:30:00Z"), minutes: 30 }), false);
});

test("demo slots cover the next five weekdays and skip weekends", () => {
  const slots = demoSlots(new Date("2026-10-30T09:00:00Z")); // a Friday
  assert.equal(slots.length, 20);
  const days = [...new Set(slots.map((s) => new Date(s.startsAt.getTime() + 3 * 3600e3).toISOString().slice(0, 10)))];
  assert.deepEqual(days, ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  assert.equal(new Set(slots.map((s) => `${s.mentor}|${s.startsAt.toISOString()}`)).size, 20, "no duplicate mentor and time");
});

test("text trims, collapses spaces and caps length", () => {
  assert.equal(text("  a   b ", "title"), "a b");
  assert.throws(() => text("x".repeat(81), "title"), /80/);
  assert.equal(text("", "topic", { required: false }), "");
});

test("slugs are short and url safe", () => {
  for (let i = 0; i < 50; i++) assert.match(newSlug(), /^[a-z0-9]{8}$/);
});
